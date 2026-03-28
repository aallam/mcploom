import { randomUUID } from "node:crypto";

import {
  runHostTransportSession,
  type HostTransport,
  type ExecutorRuntimeOptions,
} from "@mcploom/codexec-protocol";
import {
  createTimeoutExecuteResult,
  type ExecutionOptions,
  type ExecuteResult,
  type Executor,
  type ResolvedToolProvider,
} from "@mcploom/codexec";

import type { RemoteExecutorOptions } from "./types";

const DEFAULT_CANCEL_GRACE_MS = 25;
const DEFAULT_MAX_LOG_CHARS = 64_000;
const DEFAULT_MAX_LOG_LINES = 100;
const DEFAULT_MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;

function createRuntimeOptions(
  options: RemoteExecutorOptions,
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

/**
 * Transport-backed executor that runs guest code outside the host process.
 */
export class RemoteExecutor implements Executor {
  private readonly cancelGraceMs: number;
  private readonly options: RemoteExecutorOptions;

  /**
   * Creates a transport-backed executor with caller-supplied remote connectivity.
   */
  constructor(options: RemoteExecutorOptions) {
    this.cancelGraceMs = options.cancelGraceMs ?? DEFAULT_CANCEL_GRACE_MS;
    this.options = options;
  }

  /**
   * Executes JavaScript against the provided tool namespaces over a remote transport.
   */
  async execute(
    code: string,
    providers: ResolvedToolProvider[],
    options: ExecutionOptions = {},
  ): Promise<ExecuteResult> {
    if (options.signal?.aborted) {
      return createTimeoutExecuteResult();
    }

    let transport: HostTransport;

    try {
      transport = await this.options.connectTransport();
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
      transport,
    });
  }
}
