import {
  createTimeoutExecuteResult,
  createToolCallDispatcher,
  extractProviderManifests,
  type ExecutionOptions,
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
      return await runQuickJsSession(
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
