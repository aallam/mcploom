import {
  ExecuteFailure,
  createExecutionContext,
  isExecuteFailure,
  isJsonSerializable,
  normalizeThrownMessage,
  type ExecuteError,
  type ResolvedToolProvider,
} from "../../codexec/src/runtime.ts";

import type { ToolCall, ToolCallResult } from "./messages";

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
 * Creates a host-side tool dispatcher for transport-backed executors.
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
