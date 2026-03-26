import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";

import {
  type ExecutorRuntimeOptions,
  runHostTransportSession,
  getNodeTransportExecArgv,
  type HostTransport,
  type RunnerMessage,
} from "@mcploom/codexec-protocol";
import {
  type ExecuteResult,
  type Executor,
  type ResolvedToolProvider,
} from "@mcploom/codexec";

import type { WorkerExecutorOptions } from "./types";

const DEFAULT_CANCEL_GRACE_MS = 25;
const DEFAULT_MAX_LOG_CHARS = 64_000;
const DEFAULT_MAX_LOG_LINES = 100;
const DEFAULT_MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;

function resolveWorkerEntryUrl(): URL {
  const extension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
  return new URL(`./workerEntry${extension}`, import.meta.url);
}

function createRuntimeOptions(
  options: WorkerExecutorOptions,
): Required<ExecutorRuntimeOptions> {
  return {
    maxLogChars: options.maxLogChars ?? DEFAULT_MAX_LOG_CHARS,
    maxLogLines: options.maxLogLines ?? DEFAULT_MAX_LOG_LINES,
    memoryLimitBytes: options.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT_BYTES,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

function createWorkerTransport(worker: Worker): HostTransport {
  return {
    dispose: async () => {
      await worker.terminate().catch(() => {});
    },
    onClose: (handler) => {
      const wrapped = (code: number) => {
        handler({
          code,
          message: `Worker exited unexpectedly with code ${code}`,
        });
      };
      worker.on("exit", wrapped);
      return () => worker.off("exit", wrapped);
    },
    onError: (handler) => {
      worker.on("error", handler);
      return () => worker.off("error", handler);
    },
    onMessage: (handler) => {
      const wrapped = (message: unknown) => {
        handler(message as RunnerMessage);
      };
      worker.on("message", wrapped);
      return () => worker.off("message", wrapped);
    },
    send: (message) => {
      worker.postMessage(message);
    },
    terminate: async () => {
      await worker.terminate().catch(() => {});
    },
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
    const worker = new Worker(resolveWorkerEntryUrl(), {
      execArgv: getNodeTransportExecArgv(import.meta.url),
      resourceLimits: this.options.workerResourceLimits,
    });

    return await runHostTransportSession({
      cancelGraceMs: this.cancelGraceMs,
      code,
      executionId: randomUUID(),
      providers,
      runtimeOptions: createRuntimeOptions(this.options),
      transport: createWorkerTransport(worker),
    });
  }
}
