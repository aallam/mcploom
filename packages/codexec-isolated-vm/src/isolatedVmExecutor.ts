import {
  createTimeoutExecuteResult,
  createToolCallDispatcher,
  extractProviderManifests,
  type ExecutionOptions,
  type ExecuteResult,
  type Executor,
  type ResolvedToolProvider,
} from "@mcploom/codexec";

import { runIsolatedVmSession } from "./runner/index";
import type { IsolatedVmExecutorOptions } from "./types";

/**
 * isolated-vm-backed executor for one-shot sandboxed JavaScript runs.
 */
export class IsolatedVmExecutor implements Executor {
  private readonly options: IsolatedVmExecutorOptions;

  /**
   * Creates an isolated-vm executor with one-shot runtime limits and host bridging configuration.
   */
  constructor(options: IsolatedVmExecutorOptions = {}) {
    this.options = options;
  }

  /**
   * Executes JavaScript against the provided tool namespaces in a fresh isolated-vm context.
   */
  async execute(
    code: string,
    providers: ResolvedToolProvider[],
    options: ExecutionOptions = {},
  ): Promise<ExecuteResult> {
    if (options.signal?.aborted) {
      return createTimeoutExecuteResult();
    }

    const abortController = new AbortController();
    const onToolCall = createToolCallDispatcher(providers, abortController.signal);
    const onAbort = () => {
      abortController.abort();
    };

    options.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      return await runIsolatedVmSession(
        {
          abortController,
          code,
          onToolCall,
          providers: extractProviderManifests(providers),
        },
        {
          ...this.options,
          ...options,
        },
      );
    } finally {
      options.signal?.removeEventListener("abort", onAbort);
      abortController.abort();
    }
  }
}
