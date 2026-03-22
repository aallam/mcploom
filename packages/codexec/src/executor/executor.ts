import type { ExecuteResult, ResolvedToolProvider } from "../types";

/**
 * Executes JavaScript against one or more resolved tool providers.
 */
export interface Executor {
  execute(
    code: string,
    providers: ResolvedToolProvider[],
  ): Promise<ExecuteResult>;
}
