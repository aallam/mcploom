import { describe, it, expect, vi, beforeEach } from "vitest";

import { Collector } from "../src/collector";
import { instrumentTransport, wrapToolHandler } from "../src/middleware";
import type { ToolCallEvent } from "../src";
import * as tracing from "../src/tracing";

function makeTransport() {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    onmessage: undefined as ((message: unknown, extra?: unknown) => void) | undefined,
    sessionId: "test-session",
  };
}

describe("instrumentTransport", () => {
  let exporter: ReturnType<typeof vi.fn>;
  let collector: Collector;

  beforeEach(() => {
    exporter = vi.fn().mockResolvedValue(undefined);
    collector = new Collector(10_000, exporter, 0);
  });

  it("intercepts tools/call requests and their responses", async () => {
    const transport = makeTransport();
    const proxy = instrumentTransport(transport, collector, 1.0);

    // Simulate server setting onmessage handler
    const serverHandler = vi.fn();
    proxy.onmessage = serverHandler;

    // Simulate incoming tools/call request
    const request = {
      jsonrpc: "2.0" as const,
      id: 1,
      method: "tools/call",
      params: { name: "search", arguments: { query: "hello" } },
    };
    proxy.onmessage!(request);
    expect(serverHandler).toHaveBeenCalledWith(request, undefined);

    // Simulate outgoing response
    const response = {
      jsonrpc: "2.0" as const,
      id: 1,
      result: { content: [{ type: "text", text: "result" }] },
    };
    await proxy.send(response);

    const stats = collector.getStats();
    expect(stats.totalCalls).toBe(1);
    expect(stats.tools["search"]).toBeDefined();
    expect(stats.tools["search"]!.count).toBe(1);
    expect(stats.tools["search"]!.errorCount).toBe(0);
  });

  it("tracks error responses", async () => {
    const transport = makeTransport();
    const proxy = instrumentTransport(transport, collector, 1.0);

    proxy.onmessage = vi.fn();

    proxy.onmessage!({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "fail_tool", arguments: {} },
    });

    await proxy.send({
      jsonrpc: "2.0",
      id: 2,
      error: { code: -32603, message: "Internal error" },
    });

    const stats = collector.getStats();
    expect(stats.totalErrors).toBe(1);
    expect(stats.tools["fail_tool"]!.errorCount).toBe(1);
  });

  it("passes through non-tool messages without tracking", async () => {
    const transport = makeTransport();
    const proxy = instrumentTransport(transport, collector, 1.0);

    proxy.onmessage = vi.fn();

    // Send a non-tool request
    proxy.onmessage!({
      jsonrpc: "2.0",
      id: 3,
      method: "resources/list",
    });

    await proxy.send({
      jsonrpc: "2.0",
      id: 3,
      result: { resources: [] },
    });

    expect(collector.getStats().totalCalls).toBe(0);
  });

  it("respects sample rate", async () => {
    const transport = makeTransport();
    // Sample rate = 0 means nothing should be recorded
    const proxy = instrumentTransport(transport, collector, 0);

    proxy.onmessage = vi.fn();

    proxy.onmessage!({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "search", arguments: {} },
    });

    await proxy.send({
      jsonrpc: "2.0",
      id: 1,
      result: { content: [] },
    });

    expect(collector.getStats().totalCalls).toBe(0);
  });

  it("delegates other transport methods", async () => {
    const transport = makeTransport();
    const proxy = instrumentTransport(transport, collector, 1.0);

    await proxy.start();
    expect(transport.start).toHaveBeenCalled();

    await proxy.close();
    expect(transport.close).toHaveBeenCalled();
  });
});

describe("wrapToolHandler", () => {
  let exporter: ReturnType<typeof vi.fn>;
  let collector: Collector;

  beforeEach(() => {
    exporter = vi.fn().mockResolvedValue(undefined);
    collector = new Collector(10_000, exporter, 0);
  });

  it("tracks successful handler execution", async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const wrapped = wrapToolHandler("my_tool", handler, collector, 1.0);

    const result = await wrapped({ query: "test" });
    expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });
    expect(handler).toHaveBeenCalledWith({ query: "test" });

    const stats = collector.getToolStats("my_tool");
    expect(stats).toBeDefined();
    expect(stats!.count).toBe(1);
    expect(stats!.errorCount).toBe(0);
  });

  it("tracks failed handler execution and re-throws", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("boom"));
    const wrapped = wrapToolHandler("fail_tool", handler, collector, 1.0);

    await expect(wrapped({})).rejects.toThrow("boom");

    const stats = collector.getToolStats("fail_tool");
    expect(stats).toBeDefined();
    expect(stats!.count).toBe(1);
    expect(stats!.errorCount).toBe(1);
  });

  it("adds global metadata to events", async () => {
    const events: ToolCallEvent[] = [];
    const captureExporter = async (batch: ToolCallEvent[]) => {
      events.push(...batch);
    };
    const metaCollector = new Collector(100, captureExporter, 0);

    const handler = vi.fn().mockResolvedValue({ content: [] });
    const wrapped = wrapToolHandler("meta_tool", handler, metaCollector, 1.0, {
      env: "test",
    });

    await wrapped({});
    await metaCollector.flush();

    expect(events).toHaveLength(1);
    expect(events[0]!.metadata).toEqual({ env: "test" });
  });

  it("skips tracking when sample rate is 0", async () => {
    const handler = vi.fn().mockResolvedValue({ content: [] });
    const wrapped = wrapToolHandler("skip_tool", handler, collector, 0);

    await wrapped({});
    expect(handler).toHaveBeenCalled();
    expect(collector.getStats().totalCalls).toBe(0);
  });

  describe("with tracing enabled", () => {
    const mockSpan = { setAttribute: vi.fn(), setStatus: vi.fn(), end: vi.fn() };
    const mockTracingSpan = { span: mockSpan, context: {} };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("creates and ends a span on success", async () => {
      vi.spyOn(tracing, "startToolSpan").mockResolvedValue(mockTracingSpan);
      vi.spyOn(tracing, "endToolSpan").mockImplementation(() => {});
      vi.spyOn(tracing, "withSpanContext").mockImplementation((_t, fn) =>
        Promise.resolve(fn()),
      );

      const handler = vi.fn().mockResolvedValue({ content: [] });
      const wrapped = wrapToolHandler(
        "traced_tool",
        handler,
        collector,
        1.0,
        undefined,
        true,
      );

      await wrapped({ query: "test" });

      expect(tracing.startToolSpan).toHaveBeenCalledWith("traced_tool", {
        "mcp.tool.input_size": expect.any(Number),
      });
      expect(tracing.withSpanContext).toHaveBeenCalled();
      expect(tracing.endToolSpan).toHaveBeenCalledWith(
        mockTracingSpan,
        true,
      );
      expect(handler).toHaveBeenCalled();
    });

    it("sets error status on span when handler fails", async () => {
      vi.spyOn(tracing, "startToolSpan").mockResolvedValue(mockTracingSpan);
      vi.spyOn(tracing, "endToolSpan").mockImplementation(() => {});
      vi.spyOn(tracing, "withSpanContext").mockImplementation((_t, fn) =>
        Promise.resolve(fn()),
      );

      const handler = vi.fn().mockRejectedValue(new Error("boom"));
      const wrapped = wrapToolHandler(
        "traced_fail",
        handler,
        collector,
        1.0,
        undefined,
        true,
      );

      await expect(wrapped({})).rejects.toThrow("boom");

      expect(tracing.endToolSpan).toHaveBeenCalledWith(
        mockTracingSpan,
        false,
        "boom",
      );
    });

    it("does not create spans when tracing is false", async () => {
      const spy = vi.spyOn(tracing, "startToolSpan");

      const handler = vi.fn().mockResolvedValue({ content: [] });
      const wrapped = wrapToolHandler(
        "no_trace",
        handler,
        collector,
        1.0,
        undefined,
        false,
      );

      await wrapped({});

      expect(spy).not.toHaveBeenCalled();
    });

    it("does not create spans when tracing is undefined", async () => {
      const spy = vi.spyOn(tracing, "startToolSpan");

      const handler = vi.fn().mockResolvedValue({ content: [] });
      const wrapped = wrapToolHandler("no_trace", handler, collector, 1.0);

      await wrapped({});

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
