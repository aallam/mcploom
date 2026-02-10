import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

/**
 * A single tool call event recorded by the collector.
 */
export interface ToolCallEvent {
  /** Tool name from the tools/call request */
  toolName: string;
  /** Session ID from the transport, if available */
  sessionId?: string;
  /** Unix timestamp in milliseconds when the call started */
  timestamp: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether the call completed successfully */
  success: boolean;
  /** Error message if the call failed */
  errorMessage?: string;
  /** JSON-RPC error code if applicable */
  errorCode?: number;
  /** Size of serialized input arguments in bytes */
  inputSize: number;
  /** Size of serialized output in bytes */
  outputSize: number;
  /** User-provided metadata */
  metadata?: Record<string, string>;
}

/**
 * Aggregated stats for a single tool.
 */
export interface ToolStats {
  count: number;
  errorCount: number;
  errorRate: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  avgMs: number;
  lastCalledAt: number;
}

/**
 * Snapshot of all analytics data.
 */
export interface AnalyticsSnapshot {
  totalCalls: number;
  totalErrors: number;
  errorRate: number;
  uptimeMs: number;
  tools: Record<string, ToolStats>;
}

/**
 * Custom exporter function signature.
 */
export type ExporterFn = (events: ToolCallEvent[]) => Promise<void>;

/**
 * OTLP exporter configuration.
 */
export interface OtlpConfig {
  endpoint: string;
  headers?: Record<string, string>;
  /** When true, use the global TracerProvider instead of creating an isolated one.
   *  This is useful when dd-trace or another APM registers as the global OTel provider. */
  useGlobalProvider?: boolean;
}

/**
 * JSON file exporter configuration.
 */
export interface JsonConfig {
  path: string;
}

/**
 * Configuration for McpAnalytics.
 */
export interface AnalyticsConfig {
  /** Built-in exporter name or a custom export function */
  exporter: "console" | "json" | "otlp" | ExporterFn;
  /** OTLP configuration (required when exporter is "otlp") */
  otlp?: OtlpConfig;
  /** JSON file configuration (required when exporter is "json") */
  json?: JsonConfig;
  /** Fraction of calls to sample (0.0 to 1.0). Default: 1.0 */
  sampleRate?: number;
  /** How often to flush batched events in ms. Default: 5000 */
  flushIntervalMs?: number;
  /** Maximum events to keep in the ring buffer. Default: 10000 */
  maxBufferSize?: number;
  /** User-provided metadata added to every event */
  metadata?: Record<string, string>;
  /** Enable OpenTelemetry span creation during tool execution.
   *  When true, uses the global tracer provider (compatible with dd-trace, etc.)
   *  Default: false */
  tracing?: boolean;
}

/**
 * A transport that has been instrumented with analytics.
 * Same interface as Transport — can be used anywhere a Transport is expected.
 */
export type InstrumentedTransport = Transport;
