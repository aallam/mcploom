/**
 * Options for constructing a {@link QuickJsExecutor}.
 */
export interface QuickJsExecutorOptions {
  /** Optional QuickJS module loader override for tests or custom builds. */
  loadModule?: () => Promise<unknown> | unknown;
  /** Maximum total characters preserved across captured log lines. */
  maxLogChars?: number;
  /** Maximum number of captured log lines returned in the result. */
  maxLogLines?: number;
  /** Guest memory limit in bytes. */
  memoryLimitBytes?: number;
  /** Wall-clock execution timeout in milliseconds. */
  timeoutMs?: number;
}
