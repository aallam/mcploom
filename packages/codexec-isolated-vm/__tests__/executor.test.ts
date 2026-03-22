import { describe, expect, it } from "vitest";

import { resolveProvider } from "@mcploom/codexec";
import { IsolatedVmExecutor } from "@mcploom/codexec-isolated-vm";

describe("IsolatedVmExecutor", () => {
  it("returns simple expression results", async () => {
    const executor = new IsolatedVmExecutor();
    const result = await executor.execute("1 + 1", []);

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      logs: [],
      result: 2,
    });
  });

  it("calls resolved provider methods from sandboxed code", async () => {
    const executor = new IsolatedVmExecutor();
    const provider = resolveProvider({
      name: "mcp",
      tools: {
        add: {
          execute: async (input) => {
            const payload = input as { x: number };
            return { sum: payload.x + 2 };
          },
        },
      },
    });

    const result = await executor.execute("(await mcp.add({ x: 2 })).sum", [
      provider,
    ]);

    expect(result).toMatchObject({
      ok: true,
      result: 4,
    });
  });

  it("captures console output", async () => {
    const executor = new IsolatedVmExecutor();
    const result = await executor.execute('console.log("hello", 2)', []);

    expect(result.ok).toBe(true);
    expect(result.logs).toEqual(["hello 2"]);
  });

  it("returns validation_error when a provider wrapper rejects invalid input", async () => {
    const executor = new IsolatedVmExecutor();
    const provider = resolveProvider({
      name: "mcp",
      tools: {
        add: {
          inputSchema: {
            type: "object",
            required: ["x"],
            properties: {
              x: { type: "number" },
            },
          },
          execute: async (input) => input,
        },
      },
    });

    const result = await executor.execute("await mcp.add({})", [provider]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected validation_error result");
    }
    expect(result.error).toMatchObject({
      code: "validation_error",
    });
  });

  it("returns tool_error when a provider throws", async () => {
    const executor = new IsolatedVmExecutor();
    const provider = resolveProvider({
      name: "mcp",
      tools: {
        fail: {
          execute: async () => {
            throw new Error("boom");
          },
        },
      },
    });

    const result = await executor.execute("await mcp.fail({})", [provider]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected tool_error result");
    }
    expect(result.error).toMatchObject({
      code: "tool_error",
      message: "boom",
    });
  });

  it("returns timeout when guest code runs forever", async () => {
    const executor = new IsolatedVmExecutor({ timeoutMs: 10 });
    const result = await executor.execute("while (true) {}", []);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected timeout result");
    }
    expect(result.error).toMatchObject({
      code: "timeout",
    });
  });

  it("returns serialization_error for unsupported guest results", async () => {
    const executor = new IsolatedVmExecutor();
    const result = await executor.execute("(() => 1)", []);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected serialization_error result");
    }
    expect(result.error).toMatchObject({
      code: "serialization_error",
    });
  });
});
