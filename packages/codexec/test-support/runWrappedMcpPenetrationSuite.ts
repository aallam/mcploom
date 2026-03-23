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
  });
}
