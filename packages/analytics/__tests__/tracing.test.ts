import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @opentelemetry/api before importing tracing module
const mockSpan = {
  setAttribute: vi.fn(),
  setStatus: vi.fn(),
  end: vi.fn(),
};

const mockTracer = {
  startSpan: vi.fn().mockReturnValue(mockSpan),
};

const mockContext = { _type: "mock-context" };

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getTracer: vi.fn().mockReturnValue(mockTracer),
  },
  context: {
    active: vi.fn().mockReturnValue(mockContext),
    with: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  },
  SpanStatusCode: { ERROR: 2 },
}));

// Import after mocking
import { startToolSpan, endToolSpan, withSpanContext } from "../src/tracing.js";

describe("tracing helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startToolSpan", () => {
    it("creates a span with the correct name and attributes", async () => {
      const result = await startToolSpan("search", {
        "mcp.tool.input_size": 42,
      });

      expect(result).toBeDefined();
      expect(mockTracer.startSpan).toHaveBeenCalledWith("mcp.tool_call", {
        attributes: {
          "mcp.tool.name": "search",
          "mcp.tool.input_size": 42,
        },
      });
    });

    it("creates a span with just the tool name when no extra attributes", async () => {
      await startToolSpan("my_tool");

      expect(mockTracer.startSpan).toHaveBeenCalledWith("mcp.tool_call", {
        attributes: {
          "mcp.tool.name": "my_tool",
        },
      });
    });

    it("returns span and context", async () => {
      const result = await startToolSpan("tool");

      expect(result).toEqual({
        span: mockSpan,
        context: mockContext,
      });
    });
  });

  describe("endToolSpan", () => {
    it("ends span on success without setting error status", async () => {
      const tracing = await startToolSpan("tool");

      endToolSpan(tracing!, true);

      expect(mockSpan.setStatus).not.toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it("sets error status and ends span on failure", async () => {
      const tracing = await startToolSpan("tool");

      endToolSpan(tracing!, false, "something broke");

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2, // SpanStatusCode.ERROR
        message: "something broke",
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  describe("withSpanContext", () => {
    it("runs fn within the span context", async () => {
      const tracing = await startToolSpan("tool");
      const fn = vi.fn().mockReturnValue("result");

      const result = await withSpanContext(tracing!, fn);

      expect(result).toBe("result");
      expect(fn).toHaveBeenCalled();
    });

    it("returns async fn result", async () => {
      const tracing = await startToolSpan("tool");
      const fn = vi.fn().mockResolvedValue("async-result");

      const result = await withSpanContext(tracing!, fn);

      expect(result).toBe("async-result");
    });
  });
});
