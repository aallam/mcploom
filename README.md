# mcploom

Production infrastructure and execution tooling for the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP).

## Packages

| Package                                                           | Description                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`@mcploom/analytics`](./packages/analytics/)                     | Lightweight analytics and observability for MCP servers                        |
| [`@mcploom/proxy`](./packages/proxy/)                             | MCP proxy for production apps, routing, middleware, and stdio-to-HTTP bridging |
| [`@mcploom/codexec`](./packages/codexec/)                         | Executor-agnostic MCP code execution core and MCP adapters                     |
| [`@mcploom/codexec-quickjs`](./packages/codexec-quickjs/)         | QuickJS executor backend for codexec                                           |
| [`@mcploom/codexec-isolated-vm`](./packages/codexec-isolated-vm/) | `isolated-vm` executor backend for codexec                                     |

## Quick Start

```ts
import { McpAnalytics } from "@mcploom/analytics";
import { McpProxy } from "@mcploom/proxy";
import { resolveProvider } from "@mcploom/codexec";
import { QuickJsExecutor } from "@mcploom/codexec-quickjs";
```

The analytics and proxy packages cover production MCP infrastructure. The codexec family provides sandboxed code execution with pluggable executors and MCP tool-wrapping adapters.

## Install

```bash
npm install @mcploom/analytics @mcploom/proxy
npm install @mcploom/codexec @mcploom/codexec-quickjs
```

Add `@mcploom/codexec-isolated-vm` only when you want the native `isolated-vm` backend.

## Development

```bash
npm install
npm test
npm run lint
npm run build
npm run typecheck
npm run examples
```

`@mcploom/codexec-isolated-vm` is verified separately because it depends on the native `isolated-vm` addon and requires `--no-node-snapshot` on Node 20+:

```bash
npm run verify:isolated-vm
```

See [examples/](./examples/) for runnable package examples, including MCP wrapping flows for codexec.
