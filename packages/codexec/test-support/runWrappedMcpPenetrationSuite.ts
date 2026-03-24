import { describe, expect, it } from "vitest";

import {
  createHostileMcpHarness,
  type PenetrationExecutorFactory,
} from "./hostileMcpHarness";

export function runWrappedMcpPenetrationSuite(
  label: string,
  createExecutor: PenetrationExecutorFactory,
): void {
  describe(label, () => {
    it("returns timeout for hostile CPU loops", async () => {
      const { wrappedClient } = await createHostileMcpHarness(createExecutor, {
        timeoutMs: 10,
      });
      const executeResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: "while (true) {}",
        },
      });

      expect(executeResult.isError).toBe(true);
      expect(executeResult.structuredContent).toMatchObject({
        error: {
          code: "timeout",
        },
        ok: false,
      });
    });

    it("propagates abort to wrapped MCP tools when guest execution times out", async () => {
      const { state, wrappedClient } = await createHostileMcpHarness(
        createExecutor,
        {
          timeoutMs: 10,
        },
      );
      const executeResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: "await mcp.wait_until_abort({})",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(executeResult.isError).toBe(true);
      expect(executeResult.structuredContent).toMatchObject({
        error: {
          code: "timeout",
        },
        ok: false,
      });
      expect(state.waitUntilAbortAborted).toBe(true);
    });

    it("does not expose ambient Node globals through wrapped execution", async () => {
      const { wrappedClient } = await createHostileMcpHarness(createExecutor);
      const executeResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: `({
            buffer: typeof Buffer,
            fetch: typeof fetch,
            process: typeof process,
            require: typeof require
          })`,
        },
      });

      expect(executeResult.isError).not.toBe(true);
      expect(executeResult.structuredContent).toMatchObject({
        ok: true,
        result: {
          buffer: "undefined",
          fetch: "undefined",
          process: "undefined",
          require: "undefined",
        },
      });
    });

    it("does not leak guest state between wrapper calls", async () => {
      const { wrappedClient } = await createHostileMcpHarness(createExecutor);
      const firstResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: "globalThis.__attack = 123; 'stored'",
        },
      });
      const secondResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: "typeof globalThis.__attack",
        },
      });

      expect(firstResult.structuredContent).toMatchObject({
        ok: true,
        result: "stored",
      });
      expect(secondResult.structuredContent).toMatchObject({
        ok: true,
        result: "undefined",
      });
    });

    it("sanitizes adversarial MCP tool names without corrupting the wrapped namespace", async () => {
      const { wrappedClient } = await createHostileMcpHarness(createExecutor);
      const tools = await wrappedClient.listTools();
      const searchResult = await wrappedClient.callTool({
        name: "mcp_search_tools",
        arguments: {},
      });
      const executeResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: `({
            after: Object.getPrototypeOf(mcp) === Object.prototype,
            before: Object.getPrototypeOf(mcp) === Object.prototype,
            collisionValue: (await mcp.search_docs__2({ value: 3 })).structuredContent.value,
            dashValue: (await mcp.search_docs({ value: 2 })).structuredContent.value,
            hasOwnSearchDocs: Object.prototype.hasOwnProperty.call(mcp, "search_docs"),
            hasOwnSearchDocs2: Object.prototype.hasOwnProperty.call(mcp, "search_docs__2"),
            numericValue: (await mcp._1tool({ value: 5 })).structuredContent.value,
            reservedValue: (await mcp.default_({ value: 4 })).structuredContent.value
          })`,
        },
      });

      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          "mcp_code",
          "mcp_execute_code",
          "mcp_search_tools",
        ]),
      );
      expect(tools.tools.map((tool) => tool.name)).not.toEqual(
        expect.arrayContaining([
          "1tool",
          "default",
          "math-add",
          "search-docs",
          "search_docs",
        ]),
      );
      expect(searchResult.structuredContent).toMatchObject({
        originalToSafeName: {
          "1tool": "_1tool",
          default: "default_",
          "search-docs": "search_docs",
          search_docs: "search_docs__2",
        },
      });
      expect(executeResult.structuredContent).toMatchObject({
        ok: true,
        result: {
          after: true,
          before: true,
          collisionValue: 3,
          dashValue: 2,
          hasOwnSearchDocs: true,
          hasOwnSearchDocs2: true,
          numericValue: 5,
          reservedValue: 4,
        },
      });
    });

    it("surfaces wrapped-tool validation errors back to the caller", async () => {
      const { wrappedClient } = await createHostileMcpHarness(createExecutor);
      const executeResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: 'await mcp.math_add({ left: "bad", right: 2 })',
        },
      });

      expect(executeResult.isError).toBe(true);
      expect(executeResult.structuredContent).toMatchObject({
        error: {
          code: "validation_error",
        },
        ok: false,
      });
    });

    it("truncates logs under hostile log flooding", async () => {
      const { wrappedClient } = await createHostileMcpHarness(createExecutor, {
        maxLogChars: 10,
        maxLogLines: 2,
      });
      const executeResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: 'console.log("12345"); console.log("67890"); console.log("ignored")',
        },
      });

      expect(executeResult.isError).not.toBe(true);
      expect(executeResult.structuredContent).toMatchObject({
        logs: ["12345", "67890"],
        ok: true,
      });
    });

    it("handles moderate structured payload amplification without crashing", async () => {
      const { wrappedClient } = await createHostileMcpHarness(createExecutor);
      const executeResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: "(await mcp.large_payload({ count: 256 })).structuredContent.items.length",
        },
      });

      expect(executeResult.isError).not.toBe(true);
      expect(executeResult.structuredContent).toMatchObject({
        ok: true,
        result: 256,
      });
    });

    it("does not trust guest-assigned executor error codes", async () => {
      const { wrappedClient } = await createHostileMcpHarness(createExecutor);

      for (const code of ["timeout", "memory_limit", "internal_error"]) {
        const executeResult = await wrappedClient.callTool({
          name: "mcp_execute_code",
          arguments: {
            code: `
              const error = new Error("spoofed ${code}");
              error.code = ${JSON.stringify(code)};
              throw error;
            `,
          },
        });

        expect(executeResult.isError).toBe(true);
        expect(executeResult.structuredContent).toMatchObject({
          error: {
            code: "runtime_error",
            message: `spoofed ${code}`,
          },
          ok: false,
        });
      }
    });

    it("does not upgrade guest error messages into timeout or memory_limit", async () => {
      const { wrappedClient } = await createHostileMcpHarness(createExecutor);

      const timedOutResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: 'throw new Error("The upstream service timed out, please retry later")',
        },
      });
      const memoryLimitResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: 'throw new Error("Warning: approaching memory limit threshold")',
        },
      });

      expect(timedOutResult.structuredContent).toMatchObject({
        error: {
          code: "runtime_error",
          message: "The upstream service timed out, please retry later",
        },
        ok: false,
      });
      expect(memoryLimitResult.structuredContent).toMatchObject({
        error: {
          code: "runtime_error",
          message: "Warning: approaching memory limit threshold",
        },
        ok: false,
      });
    });

    it("does not trust guest error names when classifying runtime failures", async () => {
      const { wrappedClient } = await createHostileMcpHarness(createExecutor);

      const internalErrorResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: 'throw Object.assign(new Error("out of memory"), { name: "InternalError" })',
        },
      });
      const rangeErrorResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: 'throw Object.assign(new Error("Invalid string length"), { name: "RangeError" })',
        },
      });

      expect(internalErrorResult.structuredContent).toMatchObject({
        error: {
          code: "runtime_error",
          message: "out of memory",
        },
        ok: false,
      });
      expect(rangeErrorResult.structuredContent).toMatchObject({
        error: {
          code: "runtime_error",
          message: "Invalid string length",
        },
        ok: false,
      });
    });

    it("does not allow prototype pollution through tool results or guest payloads", async () => {
      const { wrappedClient } = await createHostileMcpHarness(createExecutor);
      const executeResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: `(() => {
            const guestPayload = JSON.parse('{"__proto__": {"hostPolluted": true}, "value": 42}');
            return mcp.proto_inject({}).then((result) => ({
              guestPolluted: ({}).hostPolluted,
              guestSafe: result.structuredContent.safe,
              toolPolluted: ({}).polluted,
              value: guestPayload.value
            }));
          })()`,
        },
      });

      expect(executeResult.isError).not.toBe(true);
      const structured = executeResult.structuredContent as
        | { ok: boolean; result?: unknown }
        | undefined;
      expect(structured).toBeDefined();
      expect(structured?.ok).toBe(true);
      if (!structured || structured.ok !== true) {
        throw new Error("Expected successful structured content");
      }

      const result = structured.result as Record<string, unknown>;
      expect(result.guestPolluted).toBeUndefined();
      expect(result.guestSafe).toBe("value");
      expect(result.toolPolluted).toBeUndefined();
      expect(result.value).toBe(42);
      expect(({} as Record<string, unknown>).hostPolluted).toBeUndefined();
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("round-trips unicode edge strings without executing injected code", async () => {
      const { wrappedClient } = await createHostileMcpHarness(createExecutor);
      const executeResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: `(() => mcp.unicode_edge({}).then((result) => {
            const sc = result.structuredContent;
            return {
              backtick: sc.backtick,
              emoji: sc.emoji,
              injection: sc.injection,
              lineSeparator: sc.lineSeparator,
              nullByte: sc.nullByte,
              notPwned: typeof globalThis.__pwned === "undefined",
              paragraphSeparator: sc.paragraphSeparator
            };
          }))()`,
        },
      });

      expect(executeResult.structuredContent).toMatchObject({
        ok: true,
        result: {
          backtick: "`${globalThis.__pwned = true}`",
          emoji: "\uD83D\uDE00",
          injection: '"); globalThis.__pwned = true; ("',
          lineSeparator: "\u2028",
          nullByte: "\u0000",
          notPwned: true,
          paragraphSeparator: "\u2029",
        },
      });
    });

    it("fails safely on wrapper breakout attempts", async () => {
      const { wrappedClient } = await createHostileMcpHarness(createExecutor);
      const executeResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: "}); process.exit(1); (async () => {",
        },
      });

      expect(executeResult.isError).toBe(true);
      expect(executeResult.structuredContent).toMatchObject({
        ok: false,
      });
    });

    it("blocks dynamic imports from reaching host modules", async () => {
      const { wrappedClient } = await createHostileMcpHarness(createExecutor);
      const executeResult = await wrappedClient.callTool({
        name: "mcp_execute_code",
        arguments: {
          code: `
            try {
              const fs = await import("fs");
              return "ESCAPED: " + typeof fs.readFileSync;
            } catch (error) {
              return "BLOCKED: " + error.message;
            }
          `,
        },
      });

      if (executeResult.isError) {
        expect(executeResult.structuredContent).toMatchObject({
          ok: false,
        });
        return;
      }

      const structured = executeResult.structuredContent as
        | { ok: boolean; result?: unknown }
        | undefined;
      expect(structured).toBeDefined();
      expect(structured).toMatchObject({
        ok: true,
      });
      if (!structured || structured.ok !== true) {
        throw new Error("Expected successful structured content");
      }

      const result = structured.result;
      expect(typeof result).toBe("string");
      expect(String(result)).toMatch(/^BLOCKED:/);
    });
  });
}
