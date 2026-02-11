import { describe, it, expect, vi, beforeEach } from "vitest";

import { McpProxy } from "../src/proxy.js";
import { filter } from "../src/middleware.js";

// Mock the transport modules to avoid actual network/process calls
vi.mock("../src/transports/http.js", () => ({
  HttpBackendClient: vi.fn().mockImplementation((name: string) => ({
    name,
    connected: false,
    connect: vi.fn(async function (this: { connected: boolean }) {
      this.connected = true;
    }),
    listTools: vi.fn(async () => {
      if (name === "algolia") {
        return [
          {
            name: "algolia_search",
            description: "Search Algolia",
            inputSchema: {
              type: "object",
              properties: { query: { type: "string" } },
            },
            backend: "algolia",
          },
          {
            name: "algolia_browse",
            description: "Browse Algolia",
            inputSchema: { type: "object" },
            backend: "algolia",
          },
        ];
      }
      if (name === "github") {
        return [
          {
            name: "github_issues",
            description: "List GitHub issues",
            inputSchema: { type: "object" },
            backend: "github",
          },
        ];
      }
      return [];
    }),
    callTool: vi.fn(async (toolName: string) => ({
      content: [{ type: "text", text: `Result from ${name}:${toolName}` }],
    })),
    invalidateToolCache: vi.fn(),
    close: vi.fn(async function (this: { connected: boolean }) {
      this.connected = false;
    }),
  })),
}));

vi.mock("../src/transports/stdio.js", () => ({
  StdioBackendClient: vi.fn(),
}));

describe("McpProxy", () => {
  let proxy: McpProxy;

  beforeEach(async () => {
    proxy = new McpProxy({
      servers: {
        algolia: { url: "https://mcp.algolia.com/mcp" },
        github: { url: "https://api.github.com/mcp" },
      },
      routing: [
        { pattern: "algolia_*", server: "algolia" },
        { pattern: "github_*", server: "github" },
        { pattern: "*", server: "algolia" },
      ],
    });
    await proxy.connect();
  });

  it("aggregates tools from all backends", () => {
    const tools = proxy.getTools();
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name).sort()).toEqual([
      "algolia_browse",
      "algolia_search",
      "github_issues",
    ]);
  });

  it("routes tool calls to correct backend", async () => {
    const result = await proxy.callTool("algolia_search", { query: "test" });
    expect(result.content[0]!.text).toContain("algolia");

    const ghResult = await proxy.callTool("github_issues", {});
    expect(ghResult.content[0]!.text).toContain("github");
  });

  it("uses default route for unmatched tools", async () => {
    const result = await proxy.callTool("unknown_tool", {});
    expect(result.content[0]!.text).toContain("algolia");
  });

  it("returns error for no matching route", async () => {
    const noDefaultProxy = new McpProxy({
      servers: { algolia: { url: "https://mcp.algolia.com/mcp" } },
      routing: [{ pattern: "algolia_*", server: "algolia" }],
    });
    await noDefaultProxy.connect();

    const result = await noDefaultProxy.callTool("github_issues", {});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("No routing rule");
  });

  it("applies middleware", async () => {
    const mwProxy = new McpProxy({
      servers: { algolia: { url: "https://mcp.algolia.com/mcp" } },
      routing: [{ pattern: "*", server: "algolia" }],
      middleware: [filter({ deny: ["algolia_browse"] })],
    });
    await mwProxy.connect();

    const blocked = await mwProxy.callTool("algolia_browse", {});
    expect(blocked.isError).toBe(true);

    const allowed = await mwProxy.callTool("algolia_search", { query: "ok" });
    expect(allowed.isError).toBeUndefined();
  });

  it("reports backend info", () => {
    const backends = proxy.getBackends();
    expect(backends).toHaveLength(2);
    expect(backends.find((b) => b.name === "algolia")!.connected).toBe(true);
  });

  it("closes all backends", async () => {
    await proxy.close();
    const backends = proxy.getBackends();
    for (const b of backends) {
      expect(b.connected).toBe(false);
    }
    expect(proxy.getTools()).toHaveLength(0);
  });
});
