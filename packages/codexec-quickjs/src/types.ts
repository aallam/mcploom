import type { ExecutorRuntimeOptions } from "@mcploom/codexec";

/**
 * Options for constructing a {@link QuickJsExecutor}.
 */
export interface QuickJsExecutorOptions extends ExecutorRuntimeOptions {
  /** Optional QuickJS module loader override for tests or custom builds. */
  loadModule?: () => Promise<unknown> | unknown;
}
