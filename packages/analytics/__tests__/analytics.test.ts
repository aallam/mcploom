import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { describe, it, expect, vi } from "vitest";

import { McpAnalytics } from "../src";

describe("McpAnalytics", () => {
  it("creates with console exporter", () => {
    const analytics = new McpAnalytics({ exporter: "console" });
    expect(analytics).toBeDefined();
    expect(analytics.getStats().totalCalls).toBe(0);
  });

  it("creates with custom exporter function", () => {
    const analytics = new McpAnalytics({
      exporter: async () => {},
    });
    expect(analytics).toBeDefined();
  });

  it("throws for json exporter without config", () => {
    expect(() => new McpAnalytics({ exporter: "json" })).toThrow("json");
  });

  it("throws for otlp exporter without config", () => {
    expect(() => new McpAnalytics({ exporter: "otlp" })).toThrow("otlp");
  });

  it("track() wraps a handler and records metrics", async () => {
    const analytics = new McpAnalytics({
      exporter: async () => {},
      flushIntervalMs: 0,
    });

    const handler = vi.fn().mockResolvedValue({ content: [] });
    const tracked = analytics.track(handler, "my_tool");

    await tracked({ query: "test" });

    const stats = analytics.getToolStats("my_tool");
    expect(stats).toBeDefined();
    expect(stats!.count).toBe(1);

    const unknownSession = analytics.getSessionStats("unknown");
    expect(unknownSession).toBeDefined();
    expect(unknownSession!.count).toBe(1);
  });

  it("track() uses function name as fallback", async () => {
    const analytics = new McpAnalytics({
      exporter: async () => {},
      flushIntervalMs: 0,
    });

    async function myNamedHandler() {
      return { content: [] };
    }

    const tracked = analytics.track(myNamedHandler);
    await tracked();

    const stats = analytics.getToolStats("myNamedHandler");
    expect(stats).toBeDefined();
  });

  it("reset clears all stats", async () => {
    const analytics = new McpAnalytics({
      exporter: async () => {},
      flushIntervalMs: 0,
    });

    const tracked = analytics.track(async () => ({ content: [] }), "tool");
    await tracked();
    expect(analytics.getStats().totalCalls).toBe(1);

    analytics.reset();
    expect(analytics.getStats().totalCalls).toBe(0);
  });

  it("shutdown flushes and cleans up", async () => {
    const events: unknown[] = [];
    const analytics = new McpAnalytics({
      exporter: async (batch) => {
        events.push(...batch);
      },
      flushIntervalMs: 0,
    });

    const tracked = analytics.track(async () => ({ content: [] }), "tool");
    await tracked();
    await analytics.shutdown();

    expect(events).toHaveLength(1);
  });

  it("instrument wraps a transport", () => {
    const analytics = new McpAnalytics({
      exporter: "console",
      flushIntervalMs: 0,
    });

    const transport = {
      start: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      onmessage: undefined,
      onclose: undefined,
      onerror: undefined,
    };

    const instrumented = analytics.instrument(
      transport as unknown as Transport,
    );
    expect(instrumented).toBeDefined();
    // The proxy should still expose transport methods
    expect(typeof instrumented.start).toBe("function");
    expect(typeof instrumented.send).toBe("function");
  });

  it("returns top sessions by call volume", async () => {
    const analytics = new McpAnalytics({
      exporter: async () => {},
      flushIntervalMs: 0,
    });

    const trackA = analytics.track(async () => ({ content: [] }), "a");
    const trackB = analytics.track(async () => ({ content: [] }), "b");

    await trackA({});
    await trackB({});

    const top = analytics.getTopSessions(1);
    expect(top).toHaveLength(1);
    expect(top[0]!.sessionId).toBe("unknown");
    expect(top[0]!.stats.count).toBe(2);
  });
});
