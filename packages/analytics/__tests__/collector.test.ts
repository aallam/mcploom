import { describe, it, expect, vi, beforeEach } from "vitest";

import { Collector } from "../src/collector";
import type { ToolCallEvent } from "../src";

function makeEvent(overrides: Partial<ToolCallEvent> = {}): ToolCallEvent {
  return {
    toolName: "test_tool",
    timestamp: Date.now(),
    durationMs: 100,
    success: true,
    inputSize: 50,
    outputSize: 200,
    ...overrides,
  };
}

describe("Collector", () => {
  let exporter: ReturnType<typeof vi.fn>;
  let collector: Collector;

  beforeEach(() => {
    exporter = vi.fn().mockResolvedValue(undefined);
    // flushIntervalMs=0 disables auto-flush for tests
    collector = new Collector(10_000, exporter, 0);
  });

  it("records events and computes basic stats", () => {
    collector.record(makeEvent({ durationMs: 100 }));
    collector.record(makeEvent({ durationMs: 200 }));
    collector.record(
      makeEvent({ durationMs: 300, success: false, errorMessage: "fail" }),
    );

    const stats = collector.getStats();
    expect(stats.totalCalls).toBe(3);
    expect(stats.totalErrors).toBe(1);
    expect(stats.errorRate).toBeCloseTo(1 / 3);
  });

  it("computes percentiles correctly", () => {
    // Insert 100 events with durations 1..100
    for (let i = 1; i <= 100; i++) {
      collector.record(makeEvent({ durationMs: i }));
    }

    const stats = collector.getToolStats("test_tool");
    expect(stats).toBeDefined();
    expect(stats!.p50Ms).toBeCloseTo(50.5, 0);
    expect(stats!.p95Ms).toBeCloseTo(95.05, 0);
    expect(stats!.p99Ms).toBeCloseTo(99.01, 0);
    expect(stats!.avgMs).toBeCloseTo(50.5);
    expect(stats!.count).toBe(100);
  });

  it("respects ring buffer max size", () => {
    const small = new Collector(5, exporter, 0);
    for (let i = 0; i < 10; i++) {
      small.record(makeEvent({ durationMs: i }));
    }

    // Stats should still be accurate (accumulators track everything)
    const stats = small.getStats();
    expect(stats.totalCalls).toBe(10);
  });

  it("tracks multiple tools separately", () => {
    collector.record(makeEvent({ toolName: "search", durationMs: 50 }));
    collector.record(makeEvent({ toolName: "search", durationMs: 150 }));
    collector.record(makeEvent({ toolName: "fetch", durationMs: 300 }));

    const stats = collector.getStats();
    expect(Object.keys(stats.tools)).toEqual(["search", "fetch"]);
    expect(stats.tools["search"]!.count).toBe(2);
    expect(stats.tools["search"]!.avgMs).toBe(100);
    expect(stats.tools["fetch"]!.count).toBe(1);
  });

  it("tracks per-session aggregates and top sessions", () => {
    collector.record(
      makeEvent({ toolName: "search", durationMs: 80, sessionId: "s1" }),
    );
    collector.record(
      makeEvent({
        toolName: "search",
        durationMs: 120,
        success: false,
        sessionId: "s1",
      }),
    );
    collector.record(
      makeEvent({ toolName: "fetch", durationMs: 150, sessionId: "s2" }),
    );

    const s1 = collector.getSessionStats("s1");
    expect(s1).toBeDefined();
    expect(s1!.count).toBe(2);
    expect(s1!.errorCount).toBe(1);
    expect(s1!.tools.search!.count).toBe(2);

    const snapshot = collector.getStats();
    expect(Object.keys(snapshot.sessions)).toEqual(["s1", "s2"]);

    const top = collector.getTopSessions(1);
    expect(top).toHaveLength(1);
    expect(top[0]!.sessionId).toBe("s1");
  });

  it("keeps percentile memory bounded by toolWindowSize", () => {
    const bounded = new Collector(10_000, exporter, 0, { toolWindowSize: 3 });
    bounded.record(makeEvent({ durationMs: 10 }));
    bounded.record(makeEvent({ durationMs: 20 }));
    bounded.record(makeEvent({ durationMs: 30 }));
    bounded.record(makeEvent({ durationMs: 40 }));
    bounded.record(makeEvent({ durationMs: 50 }));

    const stats = bounded.getToolStats("test_tool");
    expect(stats).toBeDefined();
    expect(stats!.count).toBe(5);
    expect(stats!.avgMs).toBe(30);
    // p50 should reflect the bounded recent window [30, 40, 50]
    expect(stats!.p50Ms).toBe(40);
  });

  it("flushes pending events to exporter", async () => {
    collector.record(makeEvent());
    collector.record(makeEvent());

    await collector.flush();
    expect(exporter).toHaveBeenCalledOnce();
    expect(exporter.mock.calls[0]![0]).toHaveLength(2);

    // Second flush should not call exporter (no new events)
    await collector.flush();
    expect(exporter).toHaveBeenCalledOnce();
  });

  it("re-queues events when exporter flush fails", async () => {
    const localExporter = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient failure"))
      .mockResolvedValue(undefined);
    const retrying = new Collector(10_000, localExporter, 0);

    retrying.record(makeEvent());
    retrying.record(makeEvent({ toolName: "other" }));

    await expect(retrying.flush()).rejects.toThrow("transient failure");
    expect(localExporter).toHaveBeenCalledTimes(1);

    await retrying.flush();
    expect(localExporter).toHaveBeenCalledTimes(2);
    expect(localExporter.mock.calls[1]![0]).toHaveLength(2);
  });

  it("does not run concurrent flush exports in parallel", async () => {
    let resolveExport: (() => void) | undefined;
    const blocker = new Promise<void>((resolve) => {
      resolveExport = resolve;
    });
    const blockingExporter = vi.fn().mockImplementation(async () => {
      await blocker;
    });
    const locked = new Collector(10_000, blockingExporter, 0);
    locked.record(makeEvent());

    const first = locked.flush();
    const second = locked.flush();
    expect(blockingExporter).toHaveBeenCalledTimes(1);

    resolveExport?.();
    await Promise.all([first, second]);
    expect(blockingExporter).toHaveBeenCalledTimes(1);
  });

  it("handles timer flush failures without dropping events", async () => {
    vi.useFakeTimers();
    const onFlushError = vi.fn();
    const timedExporter = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(undefined);
    const timed = new Collector(10_000, timedExporter, 10, {
      onFlushError,
    });

    timed.record(makeEvent());
    await vi.advanceTimersByTimeAsync(20);

    expect(onFlushError).toHaveBeenCalledOnce();
    await timed.destroy();
    expect(timedExporter).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("reset clears all data", () => {
    collector.record(makeEvent());
    collector.record(makeEvent());
    collector.reset();

    const stats = collector.getStats();
    expect(stats.totalCalls).toBe(0);
    expect(stats.totalErrors).toBe(0);
    expect(Object.keys(stats.tools)).toHaveLength(0);
  });

  it("returns undefined for unknown tool", () => {
    expect(collector.getToolStats("nonexistent")).toBeUndefined();
  });

  it("destroy stops timer and flushes", async () => {
    const timedCollector = new Collector(100, exporter, 100);
    timedCollector.record(makeEvent());
    await timedCollector.destroy();
    expect(exporter).toHaveBeenCalledOnce();
  });
});
