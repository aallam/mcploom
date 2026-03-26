/**
 * Optional V8 heap limits used only as a backstop for worker thread safety.
 */
export interface WorkerResourceLimits {
  maxOldGenerationSizeMb?: number;
  maxYoungGenerationSizeMb?: number;
  stackSizeMb?: number;
}

/**
 * Options for constructing a {@link WorkerExecutor}.
 */
export interface WorkerExecutorOptions {
  /** Extra grace period after timeout before force-terminating the worker. */
  cancelGraceMs?: number;
  /** Maximum total characters preserved across captured log lines. */
  maxLogChars?: number;
  /** Maximum number of captured log lines returned in the result. */
  maxLogLines?: number;
  /** Guest memory limit in bytes enforced by QuickJS inside the worker. */
  memoryLimitBytes?: number;
  /** Wall-clock execution timeout in milliseconds. */
  timeoutMs?: number;
  /** Optional Node worker heap limits used as a backstop only. */
  workerResourceLimits?: WorkerResourceLimits;
}
