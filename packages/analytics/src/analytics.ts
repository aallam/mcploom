import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { Collector } from "./collector.js";
import { createConsoleExporter } from "./exporters/console.js";
import { createCustomExporter } from "./exporters/custom.js";
import { createJsonExporter } from "./exporters/json.js";
import { createOtlpExporter } from "./exporters/otlp.js";
import { instrumentTransport, wrapToolHandler } from "./middleware.js";
import type {
  AnalyticsConfig,
  AnalyticsSnapshot,
  ExporterFn,
  InstrumentedTransport,
  SessionStats,
  SamplingStrategy,
  ToolStats,
} from "./types.js";

/**
 * MCP Analytics — lightweight observability for MCP servers.
 *
 * @example
 * ```ts
 * const analytics = new McpAnalytics({ exporter: "console" });
 *
 * // Instrument a transport
 * const tracked = analytics.instrument(transport);
 * await server.connect(tracked);
 *
 * // Or wrap individual handlers
 * server.tool("search", schema, analytics.track(handler));
 *
 * // Get stats
 * console.log(analytics.getStats());
 *
 * // Shutdown
 * await analytics.flush();
 * ```
 */
export class McpAnalytics {
  private readonly collector: Collector;
  private readonly sampleRate: number;
  private readonly metadata?: Record<string, string>;
  private readonly tracing: boolean;
  private readonly samplingStrategy: SamplingStrategy;

  constructor(config: AnalyticsConfig) {
    this.sampleRate = config.sampleRate ?? 1;
    this.metadata = config.metadata;
    this.tracing = config.tracing ?? false;
    this.samplingStrategy = config.samplingStrategy ?? "per_call";

    const exporter = this.resolveExporter(config);
    this.collector = new Collector(
      config.maxBufferSize ?? 10_000,
      exporter,
      config.flushIntervalMs ?? 5_000,
      {
        toolWindowSize: config.toolWindowSize,
      },
    );
  }

  /**
   * Instrument an MCP transport to automatically track all tool calls.
   * Returns proxy transport that can be used in place of the original.
   */
  instrument(transport: Transport): InstrumentedTransport {
    return instrumentTransport(
      transport,
      this.collector,
      this.sampleRate,
      this.metadata,
      this.tracing,
      this.samplingStrategy,
    );
  }

  /**
   * Wrap a tool handler function to track its execution.
   *
   * @example
   * ```ts
   * server.tool("search", schema, analytics.track(async (params) => {
   *   return await doSearch(params);
   * }, "search"));
   * ```
   */
  track<TArgs extends unknown[], TResult>(
    handler: (...args: TArgs) => TResult | Promise<TResult>,
    toolName?: string,
  ): (...args: TArgs) => Promise<TResult> {
    const name = toolName ?? (handler.name || "anonymous");
    return wrapToolHandler(
      name,
      handler,
      this.collector,
      this.sampleRate,
      this.metadata,
      this.tracing,
    );
  }

  /**
   * Get a snapshot of all analytics data.
   */
  getStats(): AnalyticsSnapshot {
    return this.collector.getStats();
  }

  /**
   * Get stats for a specific tool.
   */
  getToolStats(toolName: string): ToolStats | undefined {
    return this.collector.getToolStats(toolName);
  }

  /**
   * Get stats for a specific session.
   */
  getSessionStats(sessionId: string): SessionStats | undefined {
    return this.collector.getSessionStats(sessionId);
  }

  /**
   * Get top sessions ranked by total call count.
   */
  getTopSessions(
    limit = 10,
  ): Array<{ sessionId: string; stats: SessionStats }> {
    return this.collector.getTopSessions(limit);
  }

  /**
   * Flush all pending events to the exporter.
   */
  async flush(): Promise<void> {
    await this.collector.flush();
  }

  /**
   * Reset all collected data.
   */
  reset(): void {
    this.collector.reset();
  }

  /**
   * Stop the analytics instance (clears flush timer and flushes remaining events).
   */
  async shutdown(): Promise<void> {
    await this.collector.destroy();
  }

  private resolveExporter(config: AnalyticsConfig): ExporterFn {
    if (typeof config.exporter === "function") {
      return createCustomExporter(config.exporter);
    }

    switch (config.exporter) {
      case "console":
        return createConsoleExporter();
      case "json": {
        if (!config.json) {
          throw new Error(
            'McpAnalytics: "json" exporter requires a "json" config with "path"',
          );
        }
        return createJsonExporter(config.json);
      }
      case "otlp": {
        if (!config.otlp) {
          throw new Error(
            'McpAnalytics: "otlp" exporter requires an "otlp" config with "endpoint"',
          );
        }
        return createOtlpExporter(config.otlp);
      }
    }
  }
}
