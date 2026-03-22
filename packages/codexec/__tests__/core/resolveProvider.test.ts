import { describe, expect, it } from "vitest";
import * as z from "zod";
import { resolveProvider } from "@mcploom/codexec";

function createContext(
  providerName: string,
  safeToolName: string,
  originalToolName: string,
) {
  return {
    signal: new AbortController().signal,
    providerName,
    safeToolName,
    originalToolName,
  };
}

describe("resolveProvider", () => {
  it("defaults the provider namespace to codemode", () => {
    const provider = resolveProvider({
      tools: {
        search: {
          execute: async () => ({ ok: true }),
        },
      },
    });

    expect(provider.name).toBe("codemode");
    expect(provider.types).toContain("declare namespace codemode");
  });

  it("rejects invalid namespaces", () => {
    expect(() =>
      resolveProvider({
        name: "bad-name",
        tools: {},
      }),
    ).toThrow(/Invalid provider namespace/);
  });

  it("sanitizes tool names and resolves collisions deterministically", () => {
    const provider = resolveProvider({
      name: "mcp",
      tools: {
        "my-tool": {
          execute: async () => ({ ok: true }),
        },
        "my.tool": {
          execute: async () => ({ ok: true }),
        },
      },
    });

    expect(Object.keys(provider.tools)).toEqual(["my_tool", "my_tool__2"]);
    expect(provider.originalToSafeName).toEqual({
      "my-tool": "my_tool",
      "my.tool": "my_tool__2",
    });
    expect(provider.safeToOriginalName).toEqual({
      my_tool: "my-tool",
      my_tool__2: "my.tool",
    });
  });

  it("validates input before calling the original execute function", async () => {
    let called = false;

    const provider = resolveProvider({
      name: "mcp",
      tools: {
        "my-tool": {
          inputSchema: {
            type: "object",
            required: ["x"],
            properties: {
              x: { type: "number" },
            },
          },
          execute: async () => {
            called = true;
            return { ok: true };
          },
        },
      },
    });

    await expect(
      provider.tools.my_tool.execute(
        {},
        createContext("mcp", "my_tool", "my-tool"),
      ),
    ).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(called).toBe(false);
  });

  it("validates output after the original execute function resolves", async () => {
    const provider = resolveProvider({
      name: "mcp",
      tools: {
        "my-tool": {
          outputSchema: {
            type: "object",
            required: ["ok"],
            properties: {
              ok: { type: "boolean" },
            },
          },
          execute: async () => ({ ok: "nope" }),
        },
      },
    });

    await expect(
      provider.tools.my_tool.execute(
        {},
        createContext("mcp", "my_tool", "my-tool"),
      ),
    ).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("accepts a full Zod schema for input validation", async () => {
    const provider = resolveProvider({
      name: "mcp",
      tools: {
        search: {
          inputSchema: z.object({
            query: z.string(),
            limit: z.number().int().optional(),
          }),
          execute: async (input) => input,
        },
      },
    });

    await expect(
      provider.tools.search.execute(
        { query: "docs", limit: 2 },
        createContext("mcp", "search", "search"),
      ),
    ).resolves.toEqual({
      limit: 2,
      query: "docs",
    });

    await expect(
      provider.tools.search.execute(
        { limit: "bad" },
        createContext("mcp", "search", "search"),
      ),
    ).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("accepts an MCP-style raw Zod shape for input validation and generated types", async () => {
    const provider = resolveProvider({
      name: "mcp",
      tools: {
        search: {
          inputSchema: {
            limit: z.number().int().optional(),
            query: z.string(),
          },
          execute: async (input) => input,
        },
      },
    });

    expect(provider.types).toContain("function search(input:");
    expect(provider.types).toContain("query: string;");
    expect(provider.types).toContain("limit?: number;");

    await expect(
      provider.tools.search.execute(
        { query: "docs" },
        createContext("mcp", "search", "search"),
      ),
    ).resolves.toEqual({
      query: "docs",
    });
  });

  it("accepts Zod output schemas for output validation", async () => {
    const provider = resolveProvider({
      name: "mcp",
      tools: {
        search: {
          outputSchema: z.object({
            hits: z.array(z.string()),
          }),
          execute: async () => ({ hits: [1, 2, 3] }),
        },
      },
    });

    await expect(
      provider.tools.search.execute(
        {},
        createContext("mcp", "search", "search"),
      ),
    ).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("rejects unsupported schema inputs with a clear configuration error", () => {
    expect(() =>
      resolveProvider({
        name: "mcp",
        tools: {
          search: {
            inputSchema: 42 as never,
            execute: async () => ({ ok: true }),
          },
        },
      }),
    ).toThrow(/search/i);
  });
});
