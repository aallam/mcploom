# @mcploom/codexec

Executor-agnostic core for guest JavaScript that can call host tools directly or wrap MCP servers and clients into callable namespaces.

[![npm version](https://img.shields.io/npm/v/%40mcploom%2Fcodexec?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec)
[![License](https://img.shields.io/github/license/aallam/mcploom?style=flat-square)](https://github.com/aallam/mcploom/blob/main/LICENSE)

## What You Get

- Resolve host tools into deterministic guest namespaces with name sanitization.
- Validate tool inputs and outputs with JSON Schema, full Zod schemas, or MCP SDK-style raw Zod shapes.
- Normalize user code before execution and generate namespace typings from resolved schemas.
- Wrap MCP servers or clients into codexec providers, or expose code-execution tools from an MCP server.

## Pair It With an Executor

`@mcploom/codexec` does not execute code on its own. Pair it with one of the executor packages:

| Package                                                                                      | Best for                                                             |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`@mcploom/codexec-quickjs`](https://www.npmjs.com/package/@mcploom/codexec-quickjs)         | Easiest setup, no native addon, good default backend                 |
| [`@mcploom/codexec-process`](https://www.npmjs.com/package/@mcploom/codexec-process)         | QuickJS execution in a child process with a stronger lifecycle split |
| [`@mcploom/codexec-worker`](https://www.npmjs.com/package/@mcploom/codexec-worker)           | QuickJS execution on a worker thread with a message boundary         |
| [`@mcploom/codexec-isolated-vm`](https://www.npmjs.com/package/@mcploom/codexec-isolated-vm) | Native `isolated-vm` backend when you specifically want that runtime |

## Examples

- [Basic provider execution](https://github.com/aallam/mcploom/blob/main/examples/codexec-basic.ts)
- [Process-backed provider execution](https://github.com/aallam/mcploom/blob/main/examples/codexec-process.ts)
- [Worker-backed provider execution](https://github.com/aallam/mcploom/blob/main/examples/codexec-worker.ts)
- [Wrap MCP tools into a provider](https://github.com/aallam/mcploom/blob/main/examples/codexec-mcp-provider.ts)
- [Expose MCP code-execution tools from a server](https://github.com/aallam/mcploom/blob/main/examples/codexec-mcp-server.ts)
- [Run the same flow on `isolated-vm`](https://github.com/aallam/mcploom/blob/main/examples/codexec-isolated-vm-basic.ts)
- [Full examples index](https://github.com/aallam/mcploom/tree/main/examples)

## Install

```bash
npm install @mcploom/codexec @mcploom/codexec-quickjs
```

Swap in `@mcploom/codexec-isolated-vm` when you want the native executor instead.
Swap in `@mcploom/codexec-process` when you want the QuickJS runtime to live in a fresh child process.

## Security Posture

- Codexec gives you fresh execution state, JSON-only tool boundaries, schema validation, timeout handling, memory limits, and bounded logs.
- Codexec does not give you a hard security boundary for hostile code by itself. The actual boundary depends on which executor you pair it with.
- Providers are explicit capability grants. Every tool you expose is authority you are handing to guest code.
- In the default deployment model, provider and MCP tool definitions are controlled by the application, not by the end user.
- Third-party MCP integrations should be reviewed as dependency-trust decisions, not folded into the primary end-user attacker model.
- If the code source is hostile, prefer stronger isolation such as `@mcploom/codexec-process`, a container, or a VM.

## Architecture Docs

- [Codexec architecture overview](https://github.com/aallam/mcploom/blob/main/docs/codexec/architecture/README.md)
- [Codexec core architecture](https://github.com/aallam/mcploom/blob/main/docs/codexec/architecture/codexec-core.md)
- [Codexec executors](https://github.com/aallam/mcploom/blob/main/docs/codexec/architecture/codexec-executors.md)
- [Codexec MCP adapters and protocol](https://github.com/aallam/mcploom/blob/main/docs/codexec/architecture/codexec-mcp-and-protocol.md)

## Exports

- `@mcploom/codexec`
  - `resolveProvider`
  - `normalizeCode`
  - `sanitizeToolName`
  - `extractProviderManifests`
  - `createToolCallDispatcher`
  - JSON Schema type generation and executor/result types
- `@mcploom/codexec/mcp`
  - `createMcpToolProvider`
  - `openMcpToolProvider`
  - `getMcpToolSourceServerInfo`
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

Use `@mcploom/codexec/mcp` when you want to wrap an MCP server or client into a tool provider, or expose code-execution tools from an MCP server. Wrapped tools preserve raw MCP `CallToolResult` envelopes so guest code can inspect `structuredContent` first and fall back to `content`.
