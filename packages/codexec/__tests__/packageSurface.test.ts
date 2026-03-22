import { describe, expect, it } from "vitest";

describe("@mcploom/codexec package surface", () => {
  it("exports the core symbols without bundling QuickJS", async () => {
    const core = await import("@mcploom/codexec");

    expect(core).toHaveProperty("normalizeCode");
    expect(core).toHaveProperty("sanitizeToolName");
    expect(core).toHaveProperty("resolveProvider");
    expect(core).not.toHaveProperty("QuickJsExecutor");
  });

  it("exports the MCP adapter symbols", async () => {
    const mcp = await import("@mcploom/codexec/mcp");

    expect(mcp).toHaveProperty("createMcpToolProvider");
    expect(mcp).toHaveProperty("codeMcpServer");
  });
});
