import type {
  AnalyticsSnapshot,
  ExporterFn,
  SessionStats,
  ToolCallEvent,
  ToolStats,
} from "./types.js";
import { percentile } from "./utils.js";

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
 * Per-session accumulator.
 */
interface SessionAccumulator extends ToolAccumulator {
  tools: Map<string, ToolAccumulator>;
}

interface CollectorOptions {
  toolWindowSize?: number;
  onFlushError?: (error: unknown) => void;
}

/**
 * In-memory ring buffer that collects ToolCallEvents, computes stats,
 * and periodically flushes to an exporter.
 */
export class Collector {
  private readonly buffer: ToolCallEvent[] = [];
  private readonly accumulators = new Map<string, ToolAccumulator>();
  private readonly sessionAccumulators = new Map<string, SessionAccumulator>();
  private totalCalls = 0;
  private totalErrors = 0;
  private readonly startTime = Date.now();

  private flushTimer: ReturnType<typeof setInterval> | undefined;
  /** Events accumulated since last flush, to be sent to the exporter */
  private pending: ToolCallEvent[] = [];
  private flushInFlight: Promise<void> | undefined;
  private readonly toolWindowSize: number;
  private readonly onFlushError: (error: unknown) => void;

  constructor(
    private readonly maxBufferSize: number,
    private readonly exporter: ExporterFn,
    flushIntervalMs: number,
    options: CollectorOptions = {},
  ) {
    this.toolWindowSize = Math.max(1, options.toolWindowSize ?? 2_048);
    this.onFlushError =
      options.onFlushError ??
      ((error) => {
        console.error("[McpAnalytics] Exporter flush failed:", error);
      });

    if (flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => {
        void this.flush().catch((error) => {
          this.onFlushError(error);
        });
      }, flushIntervalMs);
      // Don't hold the process open for analytics flushing
      if (
        this.flushTimer &&
        typeof this.flushTimer === "object" &&
        "unref" in this.flushTimer
      ) {
        this.flushTimer.unref();
      }
    }
  }

  /**
   * Record a new tool call event.
   */
  record(event: ToolCallEvent): void {
    // Ring buffer: drop oldest when full
    if (this.maxBufferSize > 0) {
      if (this.buffer.length >= this.maxBufferSize) {
        this.buffer.shift();
      }
      this.buffer.push(event);
    }
    this.pending.push(event);

    this.totalCalls++;
    if (!event.success) this.totalErrors++;

    // Update per-tool accumulator
    this.updateToolAccumulator(this.accumulators, event.toolName, event);

    // Update per-session accumulator
    const sessionKey = event.sessionId ?? "unknown";
    let sessionAcc = this.sessionAccumulators.get(sessionKey);
    if (!sessionAcc) {
      sessionAcc = { ...this.newAccumulator(), tools: new Map() };
      this.sessionAccumulators.set(sessionKey, sessionAcc);
    }
    this.updateAccumulator(sessionAcc, event);
    this.updateToolAccumulator(sessionAcc.tools, event.toolName, event);
  }

  /**
   * Get aggregated stats for all tools.
   */
  getStats(): AnalyticsSnapshot {
    const tools: Record<string, ToolStats> = {};
    for (const [name, acc] of this.accumulators) {
      tools[name] = this.accToStats(acc);
    }

    const sessions: Record<string, SessionStats> = {};
    for (const [sessionId, acc] of this.sessionAccumulators) {
      sessions[sessionId] = this.sessionAccToStats(acc);
    }

    return {
      totalCalls: this.totalCalls,
      totalErrors: this.totalErrors,
      errorRate: this.totalCalls > 0 ? this.totalErrors / this.totalCalls : 0,
      uptimeMs: Date.now() - this.startTime,
      tools,
      sessions,
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
   * Get stats for a single session.
   */
  getSessionStats(sessionId: string): SessionStats | undefined {
    const acc = this.sessionAccumulators.get(sessionId);
    if (!acc) return undefined;
    return this.sessionAccToStats(acc);
  }

  /**
   * Get top sessions ordered by total call count.
   */
  getTopSessions(
    limit = 10,
  ): Array<{ sessionId: string; stats: SessionStats }> {
    if (limit <= 0) return [];
    return [...this.sessionAccumulators.entries()]
      .sort((a, b) => {
        const byCount = b[1].count - a[1].count;
        if (byCount !== 0) return byCount;
        return b[1].lastCalledAt - a[1].lastCalledAt;
      })
      .slice(0, limit)
      .map(([sessionId, acc]) => ({
        sessionId,
        stats: this.sessionAccToStats(acc),
      }));
  }

  /**
   * Flush pending events to the exporter.
   */
  async flush(): Promise<void> {
    if (this.flushInFlight) {
      await this.flushInFlight;
      return;
    }

    const run = this.flushPending();
    this.flushInFlight = run;
    try {
      await run;
    } finally {
      if (this.flushInFlight === run) {
        this.flushInFlight = undefined;
      }
    }
  }

  /**
   * Reset all collected data.
   */
  reset(): void {
    this.buffer.length = 0;
    this.pending.length = 0;
    this.accumulators.clear();
    this.sessionAccumulators.clear();
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

  private async flushPending(): Promise<void> {
    while (this.pending.length > 0) {
      const batch = this.pending;
      this.pending = [];
      try {
        await this.exporter(batch);
      } catch (error) {
        // Re-queue batch to avoid data loss on transient exporter failures.
        this.pending = batch.concat(this.pending);
        throw error;
      }
    }
  }

  private newAccumulator(): ToolAccumulator {
    return {
      count: 0,
      errorCount: 0,
      totalMs: 0,
      durations: [],
      lastCalledAt: 0,
    };
  }

  private updateToolAccumulator(
    map: Map<string, ToolAccumulator>,
    toolName: string,
    event: ToolCallEvent,
  ): void {
    let acc = map.get(toolName);
    if (!acc) {
      acc = this.newAccumulator();
      map.set(toolName, acc);
    }
    this.updateAccumulator(acc, event);
  }

  private updateAccumulator(acc: ToolAccumulator, event: ToolCallEvent): void {
    acc.count++;
    if (!event.success) acc.errorCount++;
    acc.totalMs += event.durationMs;
    acc.durations.push(event.durationMs);
    if (acc.durations.length > this.toolWindowSize) {
      acc.durations.shift();
    }
    acc.lastCalledAt = event.timestamp;
  }

  private accToStats(acc: ToolAccumulator): ToolStats {
    const sortedDurations = [...acc.durations].sort((a, b) => a - b);
    return {
      count: acc.count,
      errorCount: acc.errorCount,
      errorRate: acc.count > 0 ? acc.errorCount / acc.count : 0,
      p50Ms: percentile(sortedDurations, 50),
      p95Ms: percentile(sortedDurations, 95),
      p99Ms: percentile(sortedDurations, 99),
      avgMs: acc.count > 0 ? acc.totalMs / acc.count : 0,
      lastCalledAt: acc.lastCalledAt,
    };
  }

  private sessionAccToStats(acc: SessionAccumulator): SessionStats {
    const tools: Record<string, ToolStats> = {};
    for (const [toolName, toolAcc] of acc.tools) {
      tools[toolName] = this.accToStats(toolAcc);
    }

    return {
      count: acc.count,
      errorCount: acc.errorCount,
      errorRate: acc.count > 0 ? acc.errorCount / acc.count : 0,
      avgMs: acc.count > 0 ? acc.totalMs / acc.count : 0,
      lastCalledAt: acc.lastCalledAt,
      tools,
    };
  }
}
