import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type { Collector } from "./collector.js";
import {
  startToolSpan,
  endToolSpan,
  withSpanContext,
  type TracingSpan,
} from "./tracing.js";
import type { ToolCallEvent, InstrumentedTransport } from "./types.js";
import { byteSize } from "./utils.js";

/**
 * Checks if a JSON-RPC message is a request (has `id` and `method`).
 */
function isRequest(msg: JSONRPCMessage): msg is JSONRPCMessage & {
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
} {
  return "id" in msg && "method" in msg;
}

/**
 * Checks if a JSON-RPC message is a response with a result.
 */
function isResultResponse(
  msg: JSONRPCMessage,
): msg is JSONRPCMessage & { id: string | number; result: unknown } {
  return "id" in msg && "result" in msg;
}

/**
 * Checks if a JSON-RPC message is an error response.
 */
function isErrorResponse(msg: JSONRPCMessage): msg is JSONRPCMessage & {
  id: string | number;
  error: { code: number; message: string };
} {
  return "id" in msg && "error" in msg;
}

interface PendingCall {
  toolName: string;
  startTime: number;
  inputSize: number;
  tracing?: TracingSpan;
}

/**
 * Wraps a Transport to intercept tools/call requests and their responses,
 * recording metrics to the Collector.
 */
export function instrumentTransport(
  transport: Transport,
  collector: Collector,
  sampleRate: number,
  globalMetadata?: Record<string, string>,
  tracing?: boolean,
): InstrumentedTransport {
  const pending = new Map<string | number, PendingCall>();

  // Intercept incoming messages (requests from client)
  const origOnMessage = transport.onmessage;

  // We need to intercept onmessage being set (since the server sets it after we wrap)
  // The pattern: wrap the transport so that when server sets onmessage, we inject our interceptor
  const proxy = new Proxy(transport, {
    // eslint-disable-next-line sonarjs/no-invariant-returns -- Proxy set traps must always return true
    set(target, prop, value) {
      if (prop === "onmessage" && typeof value === "function") {
        const userHandler = value;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (target as any).onmessage = (
          message: JSONRPCMessage,
          extra?: unknown,
        ) => {
          // Intercept incoming tools/call requests
          if (isRequest(message) && message.method === "tools/call") {
            // eslint-disable-next-line sonarjs/pseudo-random -- intentional for perf sampling, not security
            if (Math.random() < sampleRate) {
              const params = message.params as
                | { name?: string; arguments?: unknown }
                | undefined;
              const toolName = params?.name ?? "unknown";
              const inputSize = byteSize(params?.arguments);
              const pendingCall: PendingCall = {
                toolName,
                startTime: Date.now(),
                inputSize,
              };
              pending.set(message.id, pendingCall);

              // Start a tracing span (async, fire-and-forget into the pending map)
              if (tracing) {
                startToolSpan(toolName, {
                  "mcp.tool.input_size": inputSize,
                }).then((span) => {
                  const entry = pending.get(message.id);
                  if (entry && span) {
                    entry.tracing = span;
                  }
                });
              }
            }
          }
          userHandler(message, extra);
        };
        return true;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (target as any)[prop] = value;
      return true;
    },
    get(target, prop, receiver) {
      if (prop === "send") {
        // Intercept outgoing messages (responses from server)
        return async (message: JSONRPCMessage, options?: unknown) => {
          if ("id" in message) {
            const id = (message as { id: string | number }).id;
            const call = pending.get(id);
            if (call) {
              pending.delete(id);
              const success = isResultResponse(message);
              const errorMessage = isErrorResponse(message)
                ? (message as { error: { message: string } }).error.message
                : undefined;

              let outputPayload: unknown;
              if (isResultResponse(message)) {
                outputPayload = (message as { result: unknown }).result;
              } else if (isErrorResponse(message)) {
                outputPayload = (message as { error: unknown }).error;
              }

              const event: ToolCallEvent = {
                toolName: call.toolName,
                sessionId: target.sessionId,
                timestamp: call.startTime,
                durationMs: Date.now() - call.startTime,
                success,
                inputSize: call.inputSize,
                outputSize: byteSize(outputPayload),
                ...(isErrorResponse(message) && {
                  errorMessage,
                  errorCode: (message as { error: { code: number } }).error
                    .code,
                }),
                ...(globalMetadata && { metadata: globalMetadata }),
              };
              collector.record(event);

              // End the tracing span
              if (call.tracing) {
                endToolSpan(call.tracing, success, errorMessage);
              }
            }
          }
          return (target.send as (...args: unknown[]) => unknown).call(
            target,
            message,
            options,
          );
        };
      }
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
  });

  // If onmessage was already set before we wrapped, re-apply through our proxy
  if (origOnMessage) {
    proxy.onmessage = origOnMessage;
  }

  return proxy;
}

/**
 * Wraps a tool handler function to record metrics.
 * Works with McpServer.tool() callback pattern.
 */
export function wrapToolHandler<TArgs extends unknown[], TResult>(
  toolName: string,
  handler: (...args: TArgs) => TResult | Promise<TResult>,
  collector: Collector,
  sampleRate: number,
  globalMetadata?: Record<string, string>,
  tracing?: boolean,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    const shouldSample = Math.random() < sampleRate; // eslint-disable-line sonarjs/pseudo-random -- intentional for perf sampling, not security
    if (!shouldSample) {
      return handler(...args);
    }

    const startTime = Date.now();
    const inputSize = byteSize(args[0]);

    // Start a tracing span if enabled
    const tracingSpan = tracing
      ? await startToolSpan(toolName, { "mcp.tool.input_size": inputSize })
      : undefined;

    try {
      // Run handler within span context so downstream calls become children
      const result = tracingSpan
        ? await withSpanContext(tracingSpan, () => handler(...args))
        : await handler(...args);
      const event: ToolCallEvent = {
        toolName,
        timestamp: startTime,
        durationMs: Date.now() - startTime,
        success: true,
        inputSize,
        outputSize: byteSize(result),
        ...(globalMetadata && { metadata: globalMetadata }),
      };
      collector.record(event);
      if (tracingSpan) endToolSpan(tracingSpan, true);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const event: ToolCallEvent = {
        toolName,
        timestamp: startTime,
        durationMs: Date.now() - startTime,
        success: false,
        errorMessage,
        inputSize,
        outputSize: 0,
        ...(globalMetadata && { metadata: globalMetadata }),
      };
      collector.record(event);
      if (tracingSpan) endToolSpan(tracingSpan, false, errorMessage);
      throw err;
    }
  };
}
