import type { ExecutorRuntimeOptions } from "@mcploom/codexec";

/**
 * Options for constructing an {@link IsolatedVmExecutor}.
 */
export interface IsolatedVmExecutorOptions extends ExecutorRuntimeOptions {
  /** Optional isolated-vm module loader override for tests or custom builds. */
  loadModule?: () => Promise<unknown> | unknown;
}
