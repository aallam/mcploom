import type {
  AnalyticsSnapshot,
  ExporterFn,
  ToolCallEvent,
  ToolStats,
} from "./types.js";
import { percentile, sortedInsert } from "./utils.js";

/**
 * Per-tool accumulator for computing stats without scanning the full buffer.
 */
interface ToolAccumulator {
  count: number;
  errorCount: number;
  totalMs: number;
  /** Sorted durations for percentile computation */
  durations: number[];
  lastCalledAt: number;
}

/**
 * In-memory ring buffer that collects ToolCallEvents, computes stats,
 * and periodically flushes to an exporter.
 */
export class Collector {
  private readonly buffer: ToolCallEvent[] = [];
  private readonly accumulators = new Map<string, ToolAccumulator>();
  private totalCalls = 0;
  private totalErrors = 0;
  private readonly startTime = Date.now();

  private flushTimer: ReturnType<typeof setInterval> | undefined;
  /** Events accumulated since last flush, to be sent to the exporter */
  private pending: ToolCallEvent[] = [];

  constructor(
    private readonly maxBufferSize: number,
    private readonly exporter: ExporterFn,
    flushIntervalMs: number,
  ) {
    if (flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => {
        void this.flush();
      }, flushIntervalMs);
      // Don't hold the process open for analytics flushing
      if (this.flushTimer && typeof this.flushTimer === "object" && "unref" in this.flushTimer) {
        this.flushTimer.unref();
      }
    }
  }

  /**
   * Record a new tool call event.
   */
  record(event: ToolCallEvent): void {
    // Ring buffer: drop oldest when full
    if (this.buffer.length >= this.maxBufferSize) {
      this.buffer.shift();
    }
    this.buffer.push(event);
    this.pending.push(event);

    this.totalCalls++;
    if (!event.success) this.totalErrors++;

    // Update per-tool accumulator
    let acc = this.accumulators.get(event.toolName);
    if (!acc) {
      acc = { count: 0, errorCount: 0, totalMs: 0, durations: [], lastCalledAt: 0 };
      this.accumulators.set(event.toolName, acc);
    }
    acc.count++;
    if (!event.success) acc.errorCount++;
    acc.totalMs += event.durationMs;
    sortedInsert(acc.durations, event.durationMs);
    acc.lastCalledAt = event.timestamp;
  }

  /**
   * Get aggregated stats for all tools.
   */
  getStats(): AnalyticsSnapshot {
    const tools: Record<string, ToolStats> = {};
    for (const [name, acc] of this.accumulators) {
      tools[name] = this.accToStats(acc);
    }
    return {
      totalCalls: this.totalCalls,
      totalErrors: this.totalErrors,
      errorRate: this.totalCalls > 0 ? this.totalErrors / this.totalCalls : 0,
      uptimeMs: Date.now() - this.startTime,
      tools,
    };
  }

  /**
   * Get stats for a single tool.
   */
  getToolStats(toolName: string): ToolStats | undefined {
    const acc = this.accumulators.get(toolName);
    if (!acc) return undefined;
    return this.accToStats(acc);
  }

  /**
   * Flush pending events to the exporter.
   */
  async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    await this.exporter(batch);
  }

  /**
   * Reset all collected data.
   */
  reset(): void {
    this.buffer.length = 0;
    this.pending.length = 0;
    this.accumulators.clear();
    this.totalCalls = 0;
    this.totalErrors = 0;
  }

  /**
   * Stop the flush timer and flush remaining events.
   */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    await this.flush();
  }

  private accToStats(acc: ToolAccumulator): ToolStats {
    return {
      count: acc.count,
      errorCount: acc.errorCount,
      errorRate: acc.count > 0 ? acc.errorCount / acc.count : 0,
      p50Ms: percentile(acc.durations, 50),
      p95Ms: percentile(acc.durations, 95),
      p99Ms: percentile(acc.durations, 99),
      avgMs: acc.count > 0 ? acc.totalMs / acc.count : 0,
      lastCalledAt: acc.lastCalledAt,
    };
  }
}
