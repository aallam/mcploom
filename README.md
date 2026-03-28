<div align="center">

# mcploom

Production building blocks for [Model Context Protocol](https://modelcontextprotocol.io/) apps.
Observe MCP traffic, proxy multiple backends behind one endpoint, and execute guest code against tool catalogs.

[![License](https://img.shields.io/github/license/aallam/mcploom?style=flat-square)](https://github.com/aallam/mcploom/blob/main/LICENSE)
[![Packages](https://img.shields.io/badge/packages-9-111827?style=flat-square)](#package-map)

</div>

## Package Map

| Package                                                           | npm                                                                                                                                                   | What it is for                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [`@mcploom/analytics`](./packages/analytics/)                     | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fanalytics?style=flat-square)](https://www.npmjs.com/package/@mcploom/analytics)                     | Transport- and handler-level analytics for MCP servers       |
| [`@mcploom/proxy`](./packages/proxy/)                             | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fproxy?style=flat-square)](https://www.npmjs.com/package/@mcploom/proxy)                             | Aggregate backends, route tools, and apply middleware        |
| [`@mcploom/codexec`](./packages/codexec/)                         | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fcodexec?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec)                         | Executor-agnostic core for guest JavaScript and MCP wrapping |
| [`@mcploom/codexec-protocol`](./packages/codexec-protocol/)       | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fcodexec-protocol?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-protocol)       | Transport-safe messages and shared host-session helpers      |
| [`@mcploom/codexec-quickjs`](./packages/codexec-quickjs/)         | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fcodexec-quickjs?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-quickjs)         | QuickJS backend for codexec                                  |
| [`@mcploom/codexec-remote`](./packages/codexec-remote/)           | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fcodexec-remote?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-remote)           | Transport-backed remote executor for codexec                 |
| [`@mcploom/codexec-process`](./packages/codexec-process/)         | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fcodexec-process?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-process)         | Child-process QuickJS executor for codexec                   |
| [`@mcploom/codexec-worker`](./packages/codexec-worker/)           | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fcodexec-worker?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-worker)           | Worker-thread QuickJS executor for codexec                   |
| [`@mcploom/codexec-isolated-vm`](./packages/codexec-isolated-vm/) | [![npm](https://img.shields.io/npm/v/%40mcploom%2Fcodexec-isolated-vm?style=flat-square)](https://www.npmjs.com/package/@mcploom/codexec-isolated-vm) | `isolated-vm` backend for codexec                            |

## Examples

Runnable examples live in [`examples/`](./examples/) and are indexed in [`examples/README.md`](./examples/README.md).

## Docs

- [Codexec Architecture Overview](./docs/codexec/architecture/README.md)

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
