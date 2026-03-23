import { describe, expect, it } from "vitest";

import { resolveProvider } from "@mcploom/codexec";
import { QuickJsExecutor } from "@mcploom/codexec-quickjs";

describe("QuickJsExecutor", () => {
  it("returns simple expression results", async () => {
    const executor = new QuickJsExecutor();
    const result = await executor.execute("1 + 1", []);

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      logs: [],
      result: 2,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("captures console output", async () => {
    const executor = new QuickJsExecutor();
    const result = await executor.execute('console.log("hello", 2)', []);

    expect(result.ok).toBe(true);
    expect(result.logs).toEqual(["hello 2"]);
  });

  it("does not expose host Node globals to guest code", async () => {
    const executor = new QuickJsExecutor();
    const result = await executor.execute(
      `({
        buffer: typeof Buffer,
        fetch: typeof fetch,
        process: typeof process,
        require: typeof require
      })`,
      [],
    );

    expect(result).toMatchObject({
      ok: true,
      result: {
        buffer: "undefined",
        fetch: "undefined",
        process: "undefined",
        require: "undefined",
      },
    });
  });

  it("calls resolved provider methods from sandboxed code", async () => {
    const executor = new QuickJsExecutor();
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

  it("returns validation_error when a provider wrapper rejects invalid input", async () => {
    const executor = new QuickJsExecutor();
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
    const executor = new QuickJsExecutor();
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
    const executor = new QuickJsExecutor({ timeoutMs: 10 });
    const result = await executor.execute("while (true) {}", []);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected timeout result");
    }
    expect(result.error).toMatchObject({
      code: "timeout",
    });
  });

  it("truncates captured logs to configured limits", async () => {
    const executor = new QuickJsExecutor({
      maxLogChars: 10,
      maxLogLines: 2,
    });
    const result = await executor.execute(
      'console.log("12345"); console.log("67890"); console.log("ignored")',
      [],
    );

    expect(result.ok).toBe(true);
    expect(result.logs).toEqual(["12345", "67890"]);
  });

  it("aborts in-flight provider work when execution times out", async () => {
    const executor = new QuickJsExecutor({ timeoutMs: 50 });
    let aborted = false;
    let started = false;
    const provider = resolveProvider({
      name: "mcp",
      tools: {
        hang: {
          execute: async (_input, context) =>
            await new Promise((_resolve, reject) => {
              started = true;
              context.signal.addEventListener(
                "abort",
                () => {
                  aborted = true;
                  reject(new Error("aborted"));
                },
                { once: true },
              );
            }),
        },
      },
    });

    const result = await executor.execute("await mcp.hang({})", [provider]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected timeout result");
    }
    expect(result.error).toMatchObject({
      code: "timeout",
    });
    expect(started).toBe(true);
    expect(aborted).toBe(true);
  });

  it("returns serialization_error for unsupported guest results", async () => {
    const executor = new QuickJsExecutor();
    const result = await executor.execute("(() => 1)", []);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected serialization_error result");
    }
    expect(result.error).toMatchObject({
      code: "serialization_error",
    });
  });

  it("does not leak guest global state across executions", async () => {
    const executor = new QuickJsExecutor();
    const firstResult = await executor.execute(
      "globalThis.__codexecLeak = 123; 'stored'",
      [],
    );
    const secondResult = await executor.execute(
      "typeof globalThis.__codexecLeak",
      [],
    );

    expect(firstResult).toMatchObject({
      ok: true,
      result: "stored",
    });
    expect(secondResult).toMatchObject({
      ok: true,
      result: "undefined",
    });
  });
});
