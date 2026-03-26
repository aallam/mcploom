# @mcploom/codexec-quickjs

QuickJS executor backend for `@mcploom/codexec`.

[![npm version](https://img.shields.io/npm/v/%40mcploom%2Fcodexec--quickjs?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-quickjs)
[![License](https://img.shields.io/github/license/aallam/mcploom?style=flat-square)](https://github.com/aallam/mcploom/blob/main/LICENSE)

## Choose QuickJS When

- you want the easiest codexec backend to install
- you do not want a native addon in CI or local development
- you want fresh runtimes, captured `console.*` output, and JSON-only tool boundaries

## Security Notes

- Each execution gets a fresh QuickJS runtime with no ambient Node globals injected by codexec.
- Tool calls cross a JSON-only bridge, and executor timeouts propagate abort signals to in-flight provider work.
- In the default deployment model, provider definitions are controlled by the host application, while hostile users control guest code and tool inputs.
- This package is not presented as a hard security boundary for hostile code. It is best-effort in-process isolation.
- If you need a stronger boundary, run codexec behind a separate process or container.

## Architecture Docs

- [Codexec architecture overview](https://github.com/aallam/mcploom/blob/main/docs/architecture/codexec-overview.md)
- [Codexec executors](https://github.com/aallam/mcploom/blob/main/docs/architecture/codexec-executors.md)
- [Codexec MCP adapters and protocol](https://github.com/aallam/mcploom/blob/main/docs/architecture/codexec-mcp-and-protocol.md)

## Examples

- [Basic provider execution](https://github.com/aallam/mcploom/blob/main/examples/codexec-basic.ts)
- [Worker-backed QuickJS execution](https://github.com/aallam/mcploom/blob/main/examples/codexec-worker.ts)
- [MCP provider wrapping](https://github.com/aallam/mcploom/blob/main/examples/codexec-mcp-provider.ts)
- [MCP server wrapper](https://github.com/aallam/mcploom/blob/main/examples/codexec-mcp-server.ts)
- [Full examples index](https://github.com/aallam/mcploom/tree/main/examples)

## Install

```bash
npm install @mcploom/codexec @mcploom/codexec-quickjs
```

Advanced consumers can also import the reusable QuickJS runner from `@mcploom/codexec-quickjs/runner`.

## Usage

```ts
import { resolveProvider } from "@mcploom/codexec";
import { QuickJsExecutor } from "@mcploom/codexec-quickjs";

const provider = resolveProvider({
  tools: {
    echo: {
      execute: async (input) => input,
    },
  },
});

const executor = new QuickJsExecutor();
const result = await executor.execute("await codemode.echo({ ok: true })", [
  provider,
]);
```

Each execution runs in a fresh QuickJS runtime with timeout handling, captured logs, and JSON-only result and tool boundaries.
