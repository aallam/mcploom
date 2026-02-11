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
