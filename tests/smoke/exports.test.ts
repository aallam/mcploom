import { describe, expect, it } from "vitest";

describe("package entrypoints", () => {
  it("exports the core symbols without bundling QuickJS", async () => {
    const core = await import("@mcploom/codexec");

    expect(core).toHaveProperty("normalizeCode");
    expect(core).toHaveProperty("sanitizeToolName");
    expect(core).toHaveProperty("resolveProvider");
    expect(core).not.toHaveProperty("QuickJsExecutor");
  });

  it("exports the MCP adapter symbols", () => {
    return import("@mcploom/codexec/mcp").then((mcp) => {
      expect(mcp).toHaveProperty("createMcpToolProvider");
      expect(mcp).toHaveProperty("codeMcpServer");
    });
  });

  it("exports QuickJsExecutor from the dedicated executor package", async () => {
    const quickjs = await import("@mcploom/codexec-quickjs");

    expect(quickjs).toHaveProperty("QuickJsExecutor");
  });
});
