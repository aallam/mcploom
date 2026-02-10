import type { OtlpConfig, ToolCallEvent } from "../types.js";

/**
 * OTLP exporter: sends tool call events as OpenTelemetry spans.
 *
 * Uses dynamic imports so that @opentelemetry/* packages are only loaded
 * when this exporter is actually used.
 */
export function createOtlpExporter(
  config: OtlpConfig,
): (events: ToolCallEvent[]) => Promise<void> {
  // Lazy-initialized tracer
  let tracerPromise: Promise<OtlpTracer> | undefined;

  return async (events) => {
    if (events.length === 0) return;

    if (!tracerPromise) {
      tracerPromise = initTracer(config);
    }
    const tracer = await tracerPromise;
    for (const event of events) {
      tracer.exportEvent(event);
    }
    await tracer.flush();
  };
}

interface OtlpTracer {
  exportEvent(event: ToolCallEvent): void;
  flush(): Promise<void>;
}

async function initTracer(config: OtlpConfig): Promise<OtlpTracer> {
  // Dynamic imports — these only resolve if the user has @opentelemetry installed
  const { trace, SpanStatusCode } = await import("@opentelemetry/api");

  let tracer;
  let otlpExporter: { forceFlush?(): Promise<void> } | undefined;

  if (config.useGlobalProvider) {
    // Use the global tracer provider (e.g. dd-trace registers itself here)
    tracer = trace.getTracer("@gomcp/analytics");
  } else {
    // Create an isolated provider with OTLP HTTP exporter
    const { BasicTracerProvider, SimpleSpanProcessor } = await import(
      "@opentelemetry/sdk-trace-base"
    );
    const { OTLPTraceExporter } = await import(
      "@opentelemetry/exporter-trace-otlp-http"
    );

    otlpExporter = new OTLPTraceExporter({
      url: config.endpoint,
      headers: config.headers,
    });

    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(otlpExporter as any)],
    });
    tracer = provider.getTracer("@gomcp/analytics");
  }

  return {
    exportEvent(event: ToolCallEvent) {
      const span = tracer.startSpan("mcp.tool_call", {
        startTime: new Date(event.timestamp),
        attributes: {
          "mcp.tool.name": event.toolName,
          "mcp.tool.duration_ms": event.durationMs,
          "mcp.tool.success": event.success,
          "mcp.tool.input_size": event.inputSize,
          "mcp.tool.output_size": event.outputSize,
          ...(event.sessionId && { "mcp.session.id": event.sessionId }),
          ...(event.errorMessage && { "mcp.tool.error_message": event.errorMessage }),
          ...(event.errorCode !== undefined && { "mcp.tool.error_code": event.errorCode }),
          ...Object.fromEntries(
            Object.entries(event.metadata ?? {}).map(([k, v]) => [`mcp.meta.${k}`, v]),
          ),
        },
      });

      if (!event.success) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: event.errorMessage });
      }

      span.end(new Date(event.timestamp + event.durationMs));
    },

    async flush() {
      await otlpExporter?.forceFlush?.();
    },
  };
}
