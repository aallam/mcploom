# mcploom

Production building blocks for [Model Context Protocol](https://modelcontextprotocol.io/) apps.
Observe MCP traffic, proxy multiple backends behind one endpoint, and execute guest code against tool catalogs.

[![License](https://img.shields.io/github/license/aallam/mcploom?style=flat-square)](https://github.com/aallam/mcploom/blob/main/LICENSE)
[![Packages](https://img.shields.io/badge/packages-7-111827?style=flat-square)](#package-map)

## Package Map

| Package                                                           | npm                                                                                                                                                   | What it is for                                               | Examples                                                                                                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@mcploom/analytics`](./packages/analytics/)                     | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fanalytics?style=flat-square)](https://www.npmjs.com/package/@mcploom/analytics)                     | Transport- and handler-level analytics for MCP servers       | [`analytics-track-handlers.ts`](./examples/analytics-track-handlers.ts)<br>[`analytics-instrument-transport.ts`](./examples/analytics-instrument-transport.ts) |
| [`@mcploom/proxy`](./packages/proxy/)                             | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fproxy?style=flat-square)](https://www.npmjs.com/package/@mcploom/proxy)                             | Aggregate backends, route tools, and apply middleware        | [`proxy-basic.ts`](./examples/proxy-basic.ts)<br>[`proxy-middleware.ts`](./examples/proxy-middleware.ts)                                                       |
| [`@mcploom/codexec`](./packages/codexec/)                         | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fcodexec?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec)                         | Executor-agnostic core for guest JavaScript and MCP wrapping | [`codexec-basic.ts`](./examples/codexec-basic.ts)<br>[`codexec-mcp-server.ts`](./examples/codexec-mcp-server.ts)                                               |
| [`@mcploom/codexec-protocol`](./packages/codexec-protocol/)       | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fcodexec--protocol?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-protocol)      | Transport-safe messages and transport-facing execution glue  | —                                                                                                                                                              |
| [`@mcploom/codexec-quickjs`](./packages/codexec-quickjs/)         | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fcodexec-quickjs?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-quickjs)         | QuickJS backend for codexec                                  | [`codexec-basic.ts`](./examples/codexec-basic.ts)                                                                                                              |
| [`@mcploom/codexec-worker`](./packages/codexec-worker/)           | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fcodexec--worker?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-worker)          | Worker-thread QuickJS executor for codexec                   | [`codexec-worker.ts`](./examples/codexec-worker.ts)                                                                                                            |
| [`@mcploom/codexec-isolated-vm`](./packages/codexec-isolated-vm/) | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fcodexec-isolated-vm?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-isolated-vm) | `isolated-vm` backend for codexec                            | [`codexec-isolated-vm-basic.ts`](./examples/codexec-isolated-vm-basic.ts)                                                                                      |

## Examples

Runnable examples live in [`examples/`](./examples/) and are indexed in [`examples/README.md`](./examples/README.md).

- Standard examples: `npm run examples`
- Native `isolated-vm` lane: `npm run verify:isolated-vm`

Good starting points:

- [`examples/analytics-track-handlers.ts`](./examples/analytics-track-handlers.ts)
- [`examples/proxy-basic.ts`](./examples/proxy-basic.ts)
- [`examples/codexec-basic.ts`](./examples/codexec-basic.ts)
- [`examples/codexec-worker.ts`](./examples/codexec-worker.ts)
- [`examples/codexec-mcp-server.ts`](./examples/codexec-mcp-server.ts)

## Docs

- [Codexec Architecture Overview](./docs/codexec/architecture/codexec-overview.md)

## Development

```bash
npm install
npm test
npm run lint
npm run build
npm run typecheck
npm run examples
```

Use `npm run verify:isolated-vm` when working on the native executor package.
