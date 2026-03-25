import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import {
  createExecutionContext,
  getExecutionTimeoutMessage,
  isKnownExecuteErrorCode,
  truncateLogs,
} from "@mcploom/codexec";
import type {
  ExecuteResult,
  Executor,
  ResolvedToolProvider,
} from "@mcploom/codexec";
import { extractManifests } from "@mcploom/codexec-protocol";
import type {
  DispatcherMessage,
  RunnerMessage,
  ToolCallMessage,
} from "@mcploom/codexec-protocol";

import type { WorkerExecutorOptions } from "./types";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_OLD_GENERATION_SIZE_MB = 64;
const DEFAULT_MAX_YOUNG_GENERATION_SIZE_MB = 16;
const DEFAULT_MAX_LOG_LINES = 100;
const DEFAULT_MAX_LOG_CHARS = 64_000;

/**
 * Resolves the worker entry script path relative to this file.
 *
 * After build, both `workerExecutor.js` and `workerEntry.js` live in `dist/`.
 * During tests (via vitest/tsx), the `.ts` source is loaded directly.
 */
function resolveWorkerEntryPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const ext = thisFile.endsWith(".ts") ? ".ts" : ".js";
  return thisFile.replace(/workerExecutor\.[^.]+$/, `workerEntry${ext}`);
}

/**
 * Worker thread executor.
 *
 * Runs guest JavaScript in a `node:worker_threads` Worker with `vm.Context`
 * sandboxing. Tool calls are bridged back to the host via message passing.
 *
 * Each `execute()` call spawns a fresh worker, ensuring complete isolation
 * between executions. Workers are terminated on timeout or after completion.
 */
export class WorkerExecutor implements Executor {
  private readonly timeoutMs: number;
  private readonly maxOldGenerationSizeMb: number;
  private readonly maxYoungGenerationSizeMb: number;
  private readonly maxLogLines: number;
  private readonly maxLogChars: number;

  constructor(options: WorkerExecutorOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxOldGenerationSizeMb =
      options.maxOldGenerationSizeMb ?? DEFAULT_MAX_OLD_GENERATION_SIZE_MB;
    this.maxYoungGenerationSizeMb =
      options.maxYoungGenerationSizeMb ?? DEFAULT_MAX_YOUNG_GENERATION_SIZE_MB;
    this.maxLogLines = options.maxLogLines ?? DEFAULT_MAX_LOG_LINES;
    this.maxLogChars = options.maxLogChars ?? DEFAULT_MAX_LOG_CHARS;
  }

  async execute(
    code: string,
    providers: ResolvedToolProvider[],
  ): Promise<ExecuteResult> {
    const startedAt = Date.now();
    const executionId = randomUUID();
    const abortController = new AbortController();
    const manifests = extractManifests(providers);

    // Build a quick lookup: provider.name → { safeToolName → descriptor }
    const providerMap = new Map<string, ResolvedToolProvider>();
    for (const provider of providers) {
      providerMap.set(provider.name, provider);
    }

    const workerPath = resolveWorkerEntryPath();

    const worker = new Worker(workerPath, {
      resourceLimits: {
        maxOldGenerationSizeMb: this.maxOldGenerationSizeMb,
        maxYoungGenerationSizeMb: this.maxYoungGenerationSizeMb,
      },
    });

    return new Promise<ExecuteResult>((resolve) => {
      let settled = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      const settle = (result: ExecuteResult) => {
        if (settled) return;
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        abortController.abort();
        // Terminate worker in background (don't await)
        void worker.terminate();
        resolve(result);
      };

      // Timeout enforcement — hard kill
      timeoutHandle = setTimeout(() => {
        settle({
          ok: false,
          error: { code: "timeout", message: getExecutionTimeoutMessage() },
          logs: [],
          durationMs: Date.now() - startedAt,
        });
      }, this.timeoutMs);

      // Handle worker crash (e.g. memory limit)
      worker.on("error", (error) => {
        const message = error.message ?? String(error);
        const isMemory =
          message.includes("out of memory") ||
          message.includes("Array buffer allocation failed");

        settle({
          ok: false,
          error: {
            code: isMemory ? "memory_limit" : "internal_error",
            message,
          },
          logs: [],
          durationMs: Date.now() - startedAt,
        });
      });

      worker.on("exit", (exitCode) => {
        if (exitCode !== 0 && !settled) {
          settle({
            ok: false,
            error: {
              code: "internal_error",
              message: `Worker exited with code ${exitCode}`,
            },
            logs: [],
            durationMs: Date.now() - startedAt,
          });
        }
      });

      // Handle messages from the runner
      worker.on("message", (message: RunnerMessage) => {
        if (message.type === "tool_call") {
          void this.handleToolCall(
            worker,
            message,
            providerMap,
            abortController.signal,
          );
          return;
        }

        if (message.type === "done") {
          const logs = truncateLogs(
            message.logs,
            this.maxLogLines,
            this.maxLogChars,
          );

          if (message.ok) {
            settle({
              ok: true,
              result: message.result,
              logs,
              durationMs: Date.now() - startedAt,
            });
          } else {
            // Validate the error code — don't trust the runner for
            // guest-thrown errors that look like trusted codes
            const code = isKnownExecuteErrorCode(message.error.code)
              ? message.error.code
              : "runtime_error";

            settle({
              ok: false,
              error: { code, message: message.error.message },
              logs,
              durationMs: Date.now() - startedAt,
            });
          }
        }
      });

      // Send the execute command
      const executeMessage: DispatcherMessage = {
        type: "execute",
        id: executionId,
        code,
        providers: manifests,
        typeDeclarations: "",
      };
      worker.postMessage(executeMessage);
    });
  }

  private async handleToolCall(
    worker: Worker,
    message: ToolCallMessage,
    providerMap: Map<string, ResolvedToolProvider>,
    signal: AbortSignal,
  ): Promise<void> {
    const provider = providerMap.get(message.provider);
    if (!provider) {
      const response: DispatcherMessage = {
        type: "tool_result",
        callId: message.callId,
        ok: false,
        error: {
          code: "tool_error",
          message: `Unknown provider: ${message.provider}`,
        },
      };
      worker.postMessage(response);
      return;
    }

    const descriptor = provider.tools[message.tool];
    if (!descriptor) {
      const response: DispatcherMessage = {
        type: "tool_result",
        callId: message.callId,
        ok: false,
        error: {
          code: "tool_error",
          message: `Unknown tool: ${message.tool}`,
        },
      };
      worker.postMessage(response);
      return;
    }

    try {
      const context = createExecutionContext(
        signal,
        provider.name,
        descriptor.safeName,
        descriptor.originalName,
      );
      const result = await descriptor.execute(message.input, context);

      const response: DispatcherMessage = {
        type: "tool_result",
        callId: message.callId,
        ok: true,
        result,
      };
      worker.postMessage(response);
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      const code =
        (errorObj as { code?: string }).code ?? "tool_error";

      const response: DispatcherMessage = {
        type: "tool_result",
        callId: message.callId,
        ok: false,
        error: {
          code: isKnownExecuteErrorCode(code) ? code : "tool_error",
          message: errorObj.message,
        },
      };
      worker.postMessage(response);
    }
  }
}
