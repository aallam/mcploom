# mcploom

Production building blocks for [Model Context Protocol](https://modelcontextprotocol.io/) apps.
Observe MCP traffic, proxy multiple backends behind one endpoint, and execute guest code against tool catalogs.

[![CI](https://img.shields.io/github/actions/workflow/status/aallam/mcploom/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/aallam/mcploom/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/aallam/mcploom?style=flat-square)](https://github.com/aallam/mcploom/blob/main/LICENSE)
[![Packages](https://img.shields.io/badge/packages-5-111827?style=flat-square)](#package-map)
[![Examples](https://img.shields.io/badge/examples-runnable-0ea5e9?style=flat-square)](./examples/README.md)

## Package Map

| Package                                                           | npm                                                                                                                                                   | What it is for                                               | Examples                                                                                                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@mcploom/analytics`](./packages/analytics/)                     | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fanalytics?style=flat-square)](https://www.npmjs.com/package/@mcploom/analytics)                     | Transport- and handler-level analytics for MCP servers       | [`analytics-track-handlers.ts`](./examples/analytics-track-handlers.ts)<br>[`analytics-instrument-transport.ts`](./examples/analytics-instrument-transport.ts) |
| [`@mcploom/proxy`](./packages/proxy/)                             | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fproxy?style=flat-square)](https://www.npmjs.com/package/@mcploom/proxy)                             | Aggregate backends, route tools, and apply middleware        | [`proxy-basic.ts`](./examples/proxy-basic.ts)<br>[`proxy-middleware.ts`](./examples/proxy-middleware.ts)                                                       |
| [`@mcploom/codexec`](./packages/codexec/)                         | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fcodexec?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec)                         | Executor-agnostic core for guest JavaScript and MCP wrapping | [`codexec-basic.ts`](./examples/codexec-basic.ts)<br>[`codexec-mcp-server.ts`](./examples/codexec-mcp-server.ts)                                               |
| [`@mcploom/codexec-quickjs`](./packages/codexec-quickjs/)         | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fcodexec-quickjs?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-quickjs)         | QuickJS backend for codexec                                  | [`codexec-basic.ts`](./examples/codexec-basic.ts)                                                                                                              |
| [`@mcploom/codexec-isolated-vm`](./packages/codexec-isolated-vm/) | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fcodexec-isolated-vm?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-isolated-vm) | `isolated-vm` backend for codexec                            | [`codexec-isolated-vm-basic.ts`](./examples/codexec-isolated-vm-basic.ts)                                                                                      |

## What Lives Here

- `analytics` adds visibility to MCP traffic with transport instrumentation, handler wrapping, exporters, and in-memory stats.
- `proxy` gives you a programmable control layer for MCP backends: routing, middleware, caching, and HTTP exposure.
- `codexec` turns tool catalogs into callable namespaces for guest JavaScript, with pluggable executor packages.

## Security Notes

- Codexec executors run guest JavaScript in-process with fresh runtime state, JSON-only tool boundaries, timeouts, and memory limits.
- That is useful isolation, but it is not a hard security boundary for hostile code.
- Providers are capability grants. Any tool you expose to guest code should be treated as privileged.
- In the default model, provider and MCP tool definitions are application-controlled configuration; the hostile actor controls code and tool inputs.
- If you wrap third-party MCP servers, treat that as a separate dependency-trust problem.
- Use process or container isolation when the code source is hostile or multi-tenant.

## Examples

Runnable examples live in [`examples/`](./examples/) and are indexed in [`examples/README.md`](./examples/README.md).

- Standard examples: `npm run examples`
- Native `isolated-vm` lane: `npm run verify:isolated-vm`

Good starting points:

- [`examples/analytics-track-handlers.ts`](./examples/analytics-track-handlers.ts)
- [`examples/proxy-basic.ts`](./examples/proxy-basic.ts)
- [`examples/codexec-basic.ts`](./examples/codexec-basic.ts)
- [`examples/codexec-mcp-server.ts`](./examples/codexec-mcp-server.ts)

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
