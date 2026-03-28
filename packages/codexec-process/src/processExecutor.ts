import { randomUUID } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  getNodeTransportExecArgv,
  runHostTransportSession,
  type HostTransport,
  type ExecutorRuntimeOptions,
  type RunnerMessage,
} from "@mcploom/codexec-protocol";
import {
  createTimeoutExecuteResult,
  type ExecutionOptions,
  type ExecuteResult,
  type Executor,
  type ResolvedToolProvider,
} from "@mcploom/codexec";

import type { ProcessExecutorOptions } from "./types";

const DEFAULT_CANCEL_GRACE_MS = 25;
const DEFAULT_MAX_LOG_CHARS = 64_000;
const DEFAULT_MAX_LOG_LINES = 100;
const DEFAULT_MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;

function resolveProcessEntryPath(): string {
  const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
  return fileURLToPath(new URL(`./processEntry${extension}`, import.meta.url));
}

function createRuntimeOptions(
  options: ProcessExecutorOptions,
  overrides: ExecutionOptions = {},
): Required<ExecutorRuntimeOptions> {
  return {
    maxLogChars:
      overrides.maxLogChars ?? options.maxLogChars ?? DEFAULT_MAX_LOG_CHARS,
    maxLogLines:
      overrides.maxLogLines ?? options.maxLogLines ?? DEFAULT_MAX_LOG_LINES,
    memoryLimitBytes:
      overrides.memoryLimitBytes ??
      options.memoryLimitBytes ??
      DEFAULT_MEMORY_LIMIT_BYTES,
    timeoutMs: overrides.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
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
    execArgv: getNodeTransportExecArgv(import.meta.url),
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
}

function createProcessTransport(child: ChildProcess): HostTransport {
  return {
    dispose: () => {
      child.kill("SIGKILL");
    },
    onClose: (handler) => {
      const onDisconnect = () => {
        handler({
          message: "Child process disconnected unexpectedly",
        });
      };
      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        handler({
          code,
          message: createUnexpectedExitMessage(code, signal),
          signal,
        });
      };

      child.on("disconnect", onDisconnect);
      child.on("exit", onExit);
      return () => {
        child.off("disconnect", onDisconnect);
        child.off("exit", onExit);
      };
    },
    onError: (handler) => {
      child.on("error", handler);
      return () => child.off("error", handler);
    },
    onMessage: (handler) => {
      const wrapped = (message: unknown) => {
        handler(message as RunnerMessage);
      };
      child.on("message", wrapped);
      return () => child.off("message", wrapped);
    },
    send: (message) =>
      new Promise<void>((resolve, reject) => {
        if (!child.connected || typeof child.send !== "function") {
          reject(new Error("Child process disconnected unexpectedly"));
          return;
        }

        child.send(message, (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
    terminate: () => {
      child.kill("SIGKILL");
    },
  };
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
    options: ExecutionOptions = {},
  ): Promise<ExecuteResult> {
    if (options.signal?.aborted) {
      return createTimeoutExecuteResult();
    }

    let child: ChildProcess;

    try {
      child = createChildProcess();
    } catch (error) {
      return {
        durationMs: 0,
        error: {
          code: "internal_error",
          message: error instanceof Error ? error.message : String(error),
        },
        logs: [],
        ok: false,
      };
    }

    return await runHostTransportSession({
      cancelGraceMs: this.cancelGraceMs,
      code,
      executionId: randomUUID(),
      providers,
      runtimeOptions: createRuntimeOptions(this.options, options),
      signal: options.signal,
      transport: createProcessTransport(child),
    });
  }
}
