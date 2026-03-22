# @mcploom/codexec

Executor-agnostic MCP code execution core for sandboxed JavaScript and MCP tool wrapping.

## Install

```bash
npm install @mcploom/codexec @mcploom/codexec-quickjs
```

`@mcploom/codexec` provides the shared types, provider resolution, code normalization, schema validation, and MCP adapters. Use a companion executor package such as `@mcploom/codexec-quickjs` or `@mcploom/codexec-isolated-vm` to actually run sandboxed code.

Tool schemas can be authored as JSON Schema, full Zod schemas, or MCP SDK-style raw Zod shapes.

## Exports

- `@mcploom/codexec`
  - `resolveProvider`
  - `normalizeCode`
  - `sanitizeToolName`
  - JSON Schema type generation and executor/result types
- `@mcploom/codexec/mcp`
  - `createMcpToolProvider`
  - `codeMcpServer`

## Basic usage

```ts
import { resolveProvider } from "@mcploom/codexec";
import { QuickJsExecutor } from "@mcploom/codexec-quickjs";
import * as z from "zod";

const provider = resolveProvider({
  name: "tools",
  tools: {
    add: {
      inputSchema: z.object({
        x: z.number(),
        y: z.number(),
      }),
      execute: async (input) => {
        const { x, y } = input as { x: number; y: number };
        return { sum: x + y };
      },
    },
  },
});

const executor = new QuickJsExecutor();
const result = await executor.execute("await tools.add({ x: 2, y: 5 })", [
  provider,
]);
```

## MCP adapters

Use `@mcploom/codexec/mcp` when you want to wrap an MCP server or client into a tool provider, or expose code-execution tools from an MCP server. Wrapped tools preserve raw MCP `CallToolResult` envelopes so sandboxed code can read `structuredContent` first and fall back to `content`.
