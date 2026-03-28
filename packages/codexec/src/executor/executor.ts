import type { ExecutionOptions } from "../runner";
import type { ExecuteResult, ResolvedToolProvider } from "../types";

/**
 * Executes JavaScript against one or more resolved tool providers.
 */
export interface Executor {
  execute(
    code: string,
    providers: ResolvedToolProvider[],
    options?: ExecutionOptions,
  ): Promise<ExecuteResult>;
}
