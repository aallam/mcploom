/**
 * Options for constructing a {@link ProcessExecutor}.
 */
export interface ProcessExecutorOptions {
  /** Extra grace period after timeout before force-killing the child process. */
  cancelGraceMs?: number;
  /** Maximum total characters preserved across captured log lines. */
  maxLogChars?: number;
  /** Maximum number of captured log lines returned in the result. */
  maxLogLines?: number;
  /** Guest memory limit in bytes enforced by QuickJS inside the child process. */
  memoryLimitBytes?: number;
  /** Wall-clock execution timeout in milliseconds. */
  timeoutMs?: number;
}
