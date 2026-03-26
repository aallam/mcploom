import {
  createExecutionContext,
  getExecutionTimeoutMessage,
  normalizeThrownMessage,
} from "./executor/shared.ts";
import { ExecuteFailure, isExecuteFailure, isJsonSerializable } from "./errors.ts";
import type {
  ExecuteError,
  ResolvedToolProvider,
} from "./types.ts";

/**
 * Transport-safe metadata for one exposed tool.
 */
export interface ProviderToolManifest {
  description?: string;
  originalName: string;
  safeName: string;
}

/**
 * Namespace manifest shared with runner implementations.
 */
export interface ProviderManifest {
  name: string;
  tools: Record<string, ProviderToolManifest>;
  types: string;
}

/**
 * Execution limits forwarded to runner implementations.
 */
export interface ExecutorRuntimeOptions {
  maxLogChars?: number;
  maxLogLines?: number;
  memoryLimitBytes?: number;
  timeoutMs?: number;
}

/**
 * Tool invocation request emitted from a runner.
 */
export interface ToolCall {
  input: unknown;
  providerName: string;
  safeToolName: string;
}

/**
 * Trusted host response to a tool invocation request.
 */
export type ToolCallResult =
  | {
      ok: true;
      result: unknown;
    }
  | {
      error: ExecuteError;
      ok: false;
    };

function toTrustedExecuteError(error: unknown): ExecuteError {
  if (isExecuteFailure(error)) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  return {
    code: "tool_error",
    message: normalizeThrownMessage(error),
  };
}

/**
 * Converts resolved providers into manifest metadata that reveals only namespace details.
 */
export function extractProviderManifests(
  providers: ResolvedToolProvider[],
): ProviderManifest[] {
  return providers.map((provider) => ({
    name: provider.name,
    tools: Object.fromEntries(
      Object.entries(provider.tools).map(([safeToolName, descriptor]) => [
        safeToolName,
        {
          description: descriptor.description,
          originalName: descriptor.originalName,
          safeName: descriptor.safeName,
        },
      ]),
    ),
    types: provider.types,
  }));
}

/**
 * Creates a host-side dispatcher for runner-emitted tool calls.
 */
export function createToolCallDispatcher(
  providers: ResolvedToolProvider[],
  signal: AbortSignal,
): (call: ToolCall) => Promise<ToolCallResult> {
  const providerMap = new Map(
    providers.map((provider) => [provider.name, provider] as const),
  );

  return async (call) => {
    const provider = providerMap.get(call.providerName);
    const descriptor = provider?.tools[call.safeToolName];

    if (!provider || !descriptor) {
      return {
        error: {
          code: "internal_error",
          message: `Unknown tool ${call.providerName}.${call.safeToolName}`,
        },
        ok: false,
      };
    }

    try {
      if (signal.aborted) {
        return {
          error: {
            code: "timeout",
            message: getExecutionTimeoutMessage(),
          },
          ok: false,
        };
      }

      const result = await descriptor.execute(
        call.input,
        createExecutionContext(
          signal,
          provider.name,
          descriptor.safeName,
          descriptor.originalName,
        ),
      );

      if (result !== undefined && !isJsonSerializable(result)) {
        throw new ExecuteFailure(
          "serialization_error",
          "Host value is not JSON-serializable",
        );
      }

      return {
        ok: true,
        result,
      };
    } catch (error) {
      return {
        error: toTrustedExecuteError(error),
        ok: false,
      };
    }
  };
}
