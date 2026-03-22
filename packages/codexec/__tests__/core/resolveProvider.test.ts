import { describe, expect, it } from "vitest";
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
});
