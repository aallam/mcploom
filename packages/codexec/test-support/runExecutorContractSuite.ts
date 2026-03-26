import { describe, expect, it } from "vitest";

import { resolveProvider, type Executor } from "@mcploom/codexec";

export interface ExecutorContractOptions {
  maxLogChars?: number;
  maxLogLines?: number;
  memoryLimitBytes?: number;
  timeoutMs?: number;
}

export type ExecutorFactory = (
  options?: ExecutorContractOptions,
) => Executor;

export function runExecutorContractSuite(
  label: string,
  createExecutor: ExecutorFactory,
): void {
  describe(label, () => {
    it("returns simple expression results", async () => {
      const executor = createExecutor();
      const result = await executor.execute("1 + 1", []);

      expect(result.ok).toBe(true);
      expect(result).toMatchObject({
        logs: [],
        result: 2,
      });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("captures console output", async () => {
      const executor = createExecutor();
      const result = await executor.execute('console.log("hello", 2)', []);

      expect(result.ok).toBe(true);
      expect(result.logs).toEqual(["hello 2"]);
    });

    it("does not expose host Node globals to guest code", async () => {
      const executor = createExecutor();
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
      const executor = createExecutor();
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
      const executor = createExecutor();
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
      const executor = createExecutor();
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
      const executor = createExecutor({ timeoutMs: 10 });
      const result = await executor.execute("while (true) {}", []);

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error("Expected timeout result");
      }
      expect(result.error).toMatchObject({
        code: "timeout",
      });
    });

    it("does not trust guest-thrown timeout or memory-limit-looking messages", async () => {
      const executor = createExecutor();
      const timeoutResult = await executor.execute(
        'throw new Error("The upstream service timed out, please retry later")',
        [],
      );
      const memoryResult = await executor.execute(
        'throw new Error("Warning: approaching memory limit threshold")',
        [],
      );

      expect(timeoutResult).toMatchObject({
        error: {
          code: "runtime_error",
          message: "The upstream service timed out, please retry later",
        },
        ok: false,
      });
      expect(memoryResult).toMatchObject({
        error: {
          code: "runtime_error",
          message: "Warning: approaching memory limit threshold",
        },
        ok: false,
      });
    });

    it("does not trust guest-thrown error names when classifying runtime failures", async () => {
      const executor = createExecutor();
      const internalErrorResult = await executor.execute(
        'throw Object.assign(new Error("out of memory"), { name: "InternalError" })',
        [],
      );
      const rangeErrorResult = await executor.execute(
        'throw Object.assign(new Error("Invalid string length"), { name: "RangeError" })',
        [],
      );

      expect(internalErrorResult).toMatchObject({
        error: {
          code: "runtime_error",
          message: "out of memory",
        },
        ok: false,
      });
      expect(rangeErrorResult).toMatchObject({
        error: {
          code: "runtime_error",
          message: "Invalid string length",
        },
        ok: false,
      });
    });

    it("truncates captured logs to configured limits", async () => {
      const executor = createExecutor({
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
      const executor = createExecutor({ timeoutMs: 500 });
      let aborted = false;
      let started = false;
      let resolveStarted: (() => void) | undefined;
      const startedPromise = new Promise<void>((resolve) => {
        resolveStarted = resolve;
      });
      const provider = resolveProvider({
        name: "mcp",
        tools: {
          hang: {
            execute: async (_input, context) =>
              await new Promise((_resolve, reject) => {
                started = true;
                resolveStarted?.();

                if (context.signal.aborted) {
                  aborted = true;
                  reject(new Error("aborted"));
                  return;
                }

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

      const executionPromise = executor.execute("await mcp.hang({})", [provider]);
      await startedPromise;
      const result = await executionPromise;
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
      const executor = createExecutor();
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
      const executor = createExecutor();
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
}
