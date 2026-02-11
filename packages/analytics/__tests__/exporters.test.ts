import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createConsoleExporter } from "../src/exporters/console";
import { createJsonExporter } from "../src/exporters/json";
import { createCustomExporter } from "../src/exporters/custom";
import type { ToolCallEvent } from "../src";

function makeEvent(overrides: Partial<ToolCallEvent> = {}): ToolCallEvent {
  return {
    toolName: "test_tool",
    timestamp: 1700000000000,
    durationMs: 100,
    success: true,
    inputSize: 50,
    outputSize: 200,
    ...overrides,
  };
}

describe("consoleExporter", () => {
  it("logs events to console", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exporter = createConsoleExporter();

    await exporter([
      makeEvent(),
      makeEvent({ toolName: "other", success: false, errorCode: -32603 }),
    ]);

    expect(spy).toHaveBeenCalledOnce();
    const output = spy.mock.calls[0]![0] as string;
    expect(output).toContain("test_tool");
    expect(output).toContain("OK");
    expect(output).toContain("ERR (-32603)");
    spy.mockRestore();
  });

  it("does nothing for empty batch", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exporter = createConsoleExporter();
    await exporter([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("jsonExporter", () => {
  const tmpFile = join(tmpdir(), `mcp-analytics-test-${Date.now()}.jsonl`);

  afterEach(async () => {
    try {
      await unlink(tmpFile);
    } catch {
      // ignore if file doesn't exist
    }
  });

  it("writes events as JSONL", async () => {
    const exporter = createJsonExporter({ path: tmpFile });
    const events = [makeEvent(), makeEvent({ toolName: "other" })];

    await exporter(events);

    const content = await readFile(tmpFile, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);

    const parsed0 = JSON.parse(lines[0]!);
    expect(parsed0.toolName).toBe("test_tool");

    const parsed1 = JSON.parse(lines[1]!);
    expect(parsed1.toolName).toBe("other");
  });

  it("appends to existing file", async () => {
    const exporter = createJsonExporter({ path: tmpFile });

    await exporter([makeEvent()]);
    await exporter([makeEvent({ toolName: "second" })]);

    const content = await readFile(tmpFile, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
  });
});

describe("customExporter", () => {
  it("calls user function with events", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const exporter = createCustomExporter(fn);

    const events = [makeEvent()];
    await exporter(events);

    expect(fn).toHaveBeenCalledWith(events);
  });

  it("catches errors from user function", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fn = vi.fn().mockRejectedValue(new Error("user error"));
    const exporter = createCustomExporter(fn);

    // Should not throw
    await exporter([makeEvent()]);

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
