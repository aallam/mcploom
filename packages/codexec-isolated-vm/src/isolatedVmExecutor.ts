import {
  createToolCallDispatcher,
  extractProviderManifests,
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
  ): Promise<ExecuteResult> {
    const abortController = new AbortController();
    const onToolCall = createToolCallDispatcher(providers, abortController.signal);

    try {
      return await runIsolatedVmSession(
        {
          abortController,
          code,
          onToolCall,
          providers: extractProviderManifests(providers),
        },
        this.options,
      );
    } finally {
      abortController.abort();
    }
  }
}
