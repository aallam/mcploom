import {
  createToolCallDispatcher,
  extractProviderManifests,
  type ExecuteResult,
  type Executor,
  type ResolvedToolProvider,
} from "@mcploom/codexec";

import { runQuickJsSession } from "./runner/index";
import type { QuickJsExecutorOptions } from "./types";

/**
 * QuickJS-backed executor for one-shot sandboxed JavaScript runs.
 */
export class QuickJsExecutor implements Executor {
  private readonly options: QuickJsExecutorOptions;

  /**
   * Creates a QuickJS executor with one-shot runtime limits and host bridging configuration.
   */
  constructor(options: QuickJsExecutorOptions = {}) {
    this.options = options;
  }

  /**
   * Executes JavaScript against the provided tool namespaces in a fresh QuickJS runtime.
   */
  async execute(
    code: string,
    providers: ResolvedToolProvider[],
  ): Promise<ExecuteResult> {
    const abortController = new AbortController();
    const onToolCall = createToolCallDispatcher(providers, abortController.signal);

    try {
      return await runQuickJsSession(
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
