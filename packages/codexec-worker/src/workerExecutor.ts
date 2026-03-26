import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";

import {
  getExecutionTimeoutMessage,
  type ExecuteResult,
  type Executor,
  type ResolvedToolProvider,
} from "@mcploom/codexec";
import {
  createToolCallDispatcher,
  extractProviderManifests,
  type DispatcherMessage,
  type ExecutionRuntimeOptions,
  type RunnerMessage,
  type ToolCallMessage,
} from "@mcploom/codexec-protocol";

import type { WorkerExecutorOptions } from "./types";

const DEFAULT_CANCEL_GRACE_MS = 25;
const DEFAULT_MAX_LOG_CHARS = 64_000;
const DEFAULT_MAX_LOG_LINES = 100;
const DEFAULT_MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;
const HOST_TIMEOUT_BACKSTOP_MS = 100;

function resolveWorkerEntryUrl(): URL {
  const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
  return new URL(`./workerEntry${extension}`, import.meta.url);
}

function createRuntimeOptions(
  options: WorkerExecutorOptions,
): Required<ExecutionRuntimeOptions> {
  return {
    maxLogChars: options.maxLogChars ?? DEFAULT_MAX_LOG_CHARS,
    maxLogLines: options.maxLogLines ?? DEFAULT_MAX_LOG_LINES,
    memoryLimitBytes: options.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT_BYTES,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Worker-thread executor that runs guest code inside a dedicated QuickJS runtime per call.
 */
export class WorkerExecutor implements Executor {
  private readonly cancelGraceMs: number;
  private readonly options: WorkerExecutorOptions;

  /**
   * Creates a worker-backed executor with hard-stop timeout behavior.
   */
  constructor(options: WorkerExecutorOptions = {}) {
    this.cancelGraceMs = options.cancelGraceMs ?? DEFAULT_CANCEL_GRACE_MS;
    this.options = options;
  }

  /**
   * Executes JavaScript inside a fresh worker thread running QuickJS.
   */
  async execute(
    code: string,
    providers: ResolvedToolProvider[],
  ): Promise<ExecuteResult> {
    const executionId = randomUUID();
    const runtimeOptions = createRuntimeOptions(this.options);
    const startedAt = Date.now();
    const abortController = new AbortController();
    const dispatchToolCall = createToolCallDispatcher(
      providers,
      abortController.signal,
    );
    const worker = new Worker(resolveWorkerEntryUrl(), {
      execArgv: import.meta.url.endsWith(".ts") ? ["--import", "tsx"] : undefined,
      resourceLimits: this.options.workerResourceLimits,
    });

    return await new Promise<ExecuteResult>((resolve) => {
      let finished = false;
      let timeoutStarted = false;
      let timeoutTriggered = false;
      let forceTerminateTimer: NodeJS.Timeout | undefined;
      let timeoutTimer: NodeJS.Timeout | undefined;

      const startTimeout = () => {
        if (timeoutStarted) {
          return;
        }

        timeoutStarted = true;
        timeoutTimer = setTimeout(() => {
          if (finished) {
            return;
          }

          timeoutTriggered = true;
          abortController.abort();
          postMessage({
            id: executionId,
            type: "cancel",
          });
          forceTerminateTimer = setTimeout(() => {
            void worker.terminate().catch(() => {});
          }, this.cancelGraceMs);
        }, runtimeOptions.timeoutMs + HOST_TIMEOUT_BACKSTOP_MS);
      };

      const cleanup = () => {
        finished = true;
        abortController.abort();
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }
        if (forceTerminateTimer) {
          clearTimeout(forceTerminateTimer);
        }
        worker.off("error", onError);
        worker.off("exit", onExit);
        worker.off("message", onMessage);
      };

      const finish = (result: ExecuteResult) => {
        if (finished) {
          return;
        }

        cleanup();
        void worker.terminate().catch(() => {});
        resolve(result);
      };

      const postMessage = (message: DispatcherMessage) => {
        if (finished) {
          return;
        }

        try {
          worker.postMessage(message);
        } catch (error) {
          finish({
            durationMs: Date.now() - startedAt,
            error: {
              code: timeoutTriggered ? "timeout" : "internal_error",
              message: timeoutTriggered
                ? getExecutionTimeoutMessage()
                : error instanceof Error
                  ? error.message
                  : String(error),
            },
            logs: [],
            ok: false,
          });
        }
      };

      const onMessage = (message: RunnerMessage) => {
        if (message.type === "started") {
          startTimeout();
          return;
        }

        if (message.type === "tool_call") {
          void dispatchToolCall(message as ToolCallMessage)
            .then((result) => {
              postMessage({
                ...result,
                callId: message.callId,
                type: "tool_result",
              });
            })
            .catch((error) => {
              postMessage({
                callId: message.callId,
                error: {
                  code: "internal_error",
                  message: error instanceof Error ? error.message : String(error),
                },
                ok: false,
                type: "tool_result",
              });
            });
          return;
        }

        const { id: _id, type: _type, ...result } = message;
        finish(result);
      };

      const onError = (error: Error) => {
        finish({
          durationMs: Date.now() - startedAt,
          error: {
            code: timeoutTriggered ? "timeout" : "internal_error",
            message: timeoutTriggered
              ? getExecutionTimeoutMessage()
              : error.message,
          },
          logs: [],
          ok: false,
        });
      };

      const onExit = (code: number) => {
        if (finished) {
          return;
        }

        finish({
          durationMs: Date.now() - startedAt,
          error: {
            code: timeoutTriggered ? "timeout" : "internal_error",
            message: timeoutTriggered
              ? getExecutionTimeoutMessage()
              : `Worker exited unexpectedly with code ${code}`,
          },
          logs: [],
          ok: false,
        });
      };

      worker.on("error", onError);
      worker.on("exit", onExit);
      worker.on("message", onMessage);

      postMessage({
        code,
        id: executionId,
        options: runtimeOptions,
        providers: extractProviderManifests(providers),
        type: "execute",
      });
    });
  }
}
