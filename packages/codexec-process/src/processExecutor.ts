import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

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
  type ExecutorRuntimeOptions,
  type RunnerMessage,
  type ToolCallMessage,
} from "@mcploom/codexec-protocol";

import type { ProcessExecutorOptions } from "./types";

const DEFAULT_CANCEL_GRACE_MS = 25;
const DEFAULT_MAX_LOG_CHARS = 64_000;
const DEFAULT_MAX_LOG_LINES = 100;
const DEFAULT_MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;
const HOST_TIMEOUT_BACKSTOP_MS = 100;

function resolveProcessEntryPath(): string {
  const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
  return fileURLToPath(new URL(`./processEntry${extension}`, import.meta.url));
}

function createRuntimeOptions(
  options: ProcessExecutorOptions,
): Required<ExecutorRuntimeOptions> {
  return {
    maxLogChars: options.maxLogChars ?? DEFAULT_MAX_LOG_CHARS,
    maxLogLines: options.maxLogLines ?? DEFAULT_MAX_LOG_LINES,
    memoryLimitBytes: options.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT_BYTES,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

function createUnexpectedExitMessage(
  code: number | null,
  signal: NodeJS.Signals | null,
): string {
  if (code !== null) {
    return `Child process exited unexpectedly with code ${code}`;
  }

  if (signal) {
    return `Child process exited unexpectedly with signal ${signal}`;
  }

  return "Child process exited unexpectedly";
}

function createChildProcess(): ChildProcess {
  return fork(resolveProcessEntryPath(), [], {
    execArgv: import.meta.url.endsWith(".ts") ? ["--import", "tsx"] : undefined,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
}

/**
 * Child-process executor that runs guest code inside a dedicated QuickJS runtime per call.
 */
export class ProcessExecutor implements Executor {
  private readonly cancelGraceMs: number;
  private readonly options: ProcessExecutorOptions;

  /**
   * Creates a process-backed executor with hard-stop timeout behavior.
   */
  constructor(options: ProcessExecutorOptions = {}) {
    this.cancelGraceMs = options.cancelGraceMs ?? DEFAULT_CANCEL_GRACE_MS;
    this.options = options;
  }

  /**
   * Executes JavaScript inside a fresh child process running QuickJS.
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

    let child: ChildProcess;
    try {
      child = createChildProcess();
    } catch (error) {
      return {
        durationMs: Date.now() - startedAt,
        error: {
          code: "internal_error",
          message: error instanceof Error ? error.message : String(error),
        },
        logs: [],
        ok: false,
      };
    }

    return await new Promise<ExecuteResult>((resolve) => {
      let finished = false;
      let timeoutStarted = false;
      let timeoutTriggered = false;
      let forceKillTimer: NodeJS.Timeout | undefined;
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
          forceKillTimer = setTimeout(() => {
            child.kill("SIGKILL");
          }, this.cancelGraceMs);
        }, runtimeOptions.timeoutMs + HOST_TIMEOUT_BACKSTOP_MS);
      };

      const cleanup = () => {
        finished = true;
        abortController.abort();
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }
        if (forceKillTimer) {
          clearTimeout(forceKillTimer);
        }
        child.off("disconnect", onDisconnect);
        child.off("error", onError);
        child.off("exit", onExit);
        child.off("message", onMessage);
      };

      const finish = (result: ExecuteResult) => {
        if (finished) {
          return;
        }

        cleanup();
        child.kill("SIGKILL");
        resolve(result);
      };

      const postMessage = (message: DispatcherMessage) => {
        if (finished) {
          return;
        }

        if (!child.connected || typeof child.send !== "function") {
          finish({
            durationMs: Date.now() - startedAt,
            error: {
              code: timeoutTriggered ? "timeout" : "internal_error",
              message: timeoutTriggered
                ? getExecutionTimeoutMessage()
                : "Child process disconnected unexpectedly",
            },
            logs: [],
            ok: false,
          });
          return;
        }

        try {
          child.send(message, (error) => {
            if (!error || finished) {
              return;
            }

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
          });
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
                  message:
                    error instanceof Error ? error.message : String(error),
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

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        if (finished) {
          return;
        }

        finish({
          durationMs: Date.now() - startedAt,
          error: {
            code: timeoutTriggered ? "timeout" : "internal_error",
            message: timeoutTriggered
              ? getExecutionTimeoutMessage()
              : createUnexpectedExitMessage(code, signal),
          },
          logs: [],
          ok: false,
        });
      };

      const onDisconnect = () => {
        if (finished) {
          return;
        }

        finish({
          durationMs: Date.now() - startedAt,
          error: {
            code: timeoutTriggered ? "timeout" : "internal_error",
            message: timeoutTriggered
              ? getExecutionTimeoutMessage()
              : "Child process disconnected unexpectedly",
          },
          logs: [],
          ok: false,
        });
      };

      child.on("disconnect", onDisconnect);
      child.on("error", onError);
      child.on("exit", onExit);
      child.on("message", onMessage);

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
