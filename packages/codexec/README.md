# @mcploom/codexec

Executor-agnostic core for sandboxed JavaScript that can call host tools directly or wrap MCP servers and clients into callable namespaces.

[![npm version](https://img.shields.io/npm/v/%40mcploom%2Fcodexec?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec)
[![License](https://img.shields.io/github/license/aallam/mcploom?style=flat-square)](https://github.com/aallam/mcploom/blob/main/LICENSE)
[![Examples](https://img.shields.io/badge/examples-codexec-0ea5e9?style=flat-square)](https://github.com/aallam/mcploom/tree/main/examples)
[![CI](https://img.shields.io/github/actions/workflow/status/aallam/mcploom/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/aallam/mcploom/actions/workflows/ci.yml)

## What You Get

- Resolve host tools into safe sandbox namespaces with deterministic name sanitization.
- Validate tool inputs and outputs with JSON Schema, full Zod schemas, or MCP SDK-style raw Zod shapes.
- Normalize user code before execution and generate namespace typings from resolved schemas.
- Wrap MCP servers or clients into codexec providers, or expose code-execution tools from an MCP server.

## Pair It With an Executor

`@mcploom/codexec` does not execute code on its own. Pair it with one of the executor packages:

| Package                                                                                      | Best for                                                             |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`@mcploom/codexec-quickjs`](https://www.npmjs.com/package/@mcploom/codexec-quickjs)         | Easiest setup, no native addon, good default backend                 |
| [`@mcploom/codexec-isolated-vm`](https://www.npmjs.com/package/@mcploom/codexec-isolated-vm) | Native `isolated-vm` backend when you specifically want that runtime |

## Examples

- [Basic provider execution](https://github.com/aallam/mcploom/blob/main/examples/codexec-basic.ts)
- [Wrap MCP tools into a provider](https://github.com/aallam/mcploom/blob/main/examples/codexec-mcp-provider.ts)
- [Expose MCP code-execution tools from a server](https://github.com/aallam/mcploom/blob/main/examples/codexec-mcp-server.ts)
- [Run the same flow on `isolated-vm`](https://github.com/aallam/mcploom/blob/main/examples/codexec-isolated-vm-basic.ts)
- [Full examples index](https://github.com/aallam/mcploom/tree/main/examples)

## Install

```bash
npm install @mcploom/codexec @mcploom/codexec-quickjs
```

Swap in `@mcploom/codexec-isolated-vm` when you want the native executor instead.

## Exports

- `@mcploom/codexec`
  - `resolveProvider`
  - `normalizeCode`
  - `sanitizeToolName`
  - JSON Schema type generation and executor/result types
- `@mcploom/codexec/mcp`
  - `createMcpToolProvider`
  - `codeMcpServer`

## Basic Usage

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

## MCP Adapters

Use `@mcploom/codexec/mcp` when you want to wrap an MCP server or client into a tool provider, or expose code-execution tools from an MCP server. Wrapped tools preserve raw MCP `CallToolResult` envelopes so sandboxed code can inspect `structuredContent` first and fall back to `content`.
