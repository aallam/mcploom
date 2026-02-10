/**
 * OpenTelemetry span helpers for MCP tool call tracing.
 *
 * Uses dynamic import so @opentelemetry/api is only loaded when tracing is enabled.
 * When dd-trace (or any OTel-based APM) is configured as the global tracer provider,
 * spans created here automatically appear as children in the existing trace context.
 */

type Attribute = string | number | boolean;

// Minimal interface matching the subset of @opentelemetry/api we use.
// This avoids a hard dependency on the package at the type level.
interface OtelSpan {
  setAttribute(key: string, value: Attribute): void;
  setStatus(status: { code: number; message?: string }): void;
  end(): void;
}

interface OtelContext {
  // opaque context value
}

interface OtelApi {
  trace: {
    getTracer(name: string): {
      startSpan(
        name: string,
        options?: { attributes?: Record<string, Attribute> },
      ): OtelSpan;
    };
  };
  context: {
    active(): OtelContext;
    with<T>(ctx: OtelContext, fn: () => T): T;
  };
  SpanStatusCode: { ERROR: number };
}

let otelApi: OtelApi | undefined;
let otelLoadFailed = false;

/**
 * Lazily load @opentelemetry/api. Returns undefined if the package is not installed.
 */
async function getOtelApi(): Promise<OtelApi | undefined> {
  if (otelApi) return otelApi;
  if (otelLoadFailed) return undefined;

  try {
    const api = await import("@opentelemetry/api");
    otelApi = api as unknown as OtelApi;
    return otelApi;
  } catch {
    otelLoadFailed = true;
    return undefined;
  }
}

export interface TracingSpan {
  span: OtelSpan;
  context: OtelContext;
}

/**
 * Start an OpenTelemetry span for a tool call using the global tracer provider.
 * Returns undefined if @opentelemetry/api is not available.
 */
export async function startToolSpan(
  toolName: string,
  attributes?: Record<string, Attribute>,
): Promise<TracingSpan | undefined> {
  const api = await getOtelApi();
  if (!api) return undefined;

  const tracer = api.trace.getTracer("@gomcp/analytics");
  const span = tracer.startSpan("mcp.tool_call", {
    attributes: {
      "mcp.tool.name": toolName,
      ...attributes,
    },
  });

  return { span, context: api.context.active() };
}

/**
 * End a tool span, setting error status if the call failed.
 */
export function endToolSpan(
  tracing: TracingSpan,
  success: boolean,
  errorMessage?: string,
): void {
  if (!success && otelApi) {
    tracing.span.setStatus({
      code: otelApi.SpanStatusCode.ERROR,
      message: errorMessage,
    });
  }
  tracing.span.end();
}

/**
 * Run a function within the context of a span, so downstream OTel-instrumented
 * calls become children of this span.
 */
export async function withSpanContext<T>(
  tracing: TracingSpan,
  fn: () => T | Promise<T>,
): Promise<T> {
  const api = otelApi;
  if (!api) return fn();
  return api.context.with(tracing.context, fn);
}
