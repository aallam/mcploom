# Examples

Runnable examples for the `@mcploom/*` package family.

[![Examples](https://img.shields.io/badge/examples-runnable-0ea5e9?style=flat-square)](https://github.com/aallam/mcploom/tree/main/examples)
[![CI](https://img.shields.io/github/actions/workflow/status/aallam/mcploom/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/aallam/mcploom/actions/workflows/ci.yml)

## Run Them

```bash
npm install
npm run build
npm run examples
```

The `isolated-vm` example stays on its own lane because it depends on the native addon and `--no-node-snapshot`:

```bash
npm run example:codexec-isolated-vm
npm run verify:isolated-vm
```

## Analytics

| File                                                                       | What it shows                                                   |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`analytics-track-handlers.ts`](./analytics-track-handlers.ts)             | Wrap plain handlers with `track()` and inspect a stats snapshot |
| [`analytics-custom-exporter.ts`](./analytics-custom-exporter.ts)           | Custom async exporter, sampling, and reset flows                |
| [`analytics-instrument-transport.ts`](./analytics-instrument-transport.ts) | Transport-level instrumentation around MCP calls                |
| [`analytics-stateless-transport.ts`](./analytics-stateless-transport.ts)   | Stateless transport instrumentation without SDK server wrappers |
| [`analytics-express.ts`](./analytics-express.ts)                           | Express integration around MCP-style handlers                   |

## Proxy

| File                                                   | What it shows                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| [`proxy-basic.ts`](./proxy-basic.ts)                   | Two HTTP backends, routing rules, tool listing, and routed calls |
| [`proxy-middleware.ts`](./proxy-middleware.ts)         | `filter()`, `cache()`, `transform()`, and custom middleware      |
| [`proxy-public-http.ts`](./proxy-public-http.ts)       | Proxying to public HTTP MCP backends                             |
| [`proxy-local-default.ts`](./proxy-local-default.ts)   | Local default backend layered with remote backends               |
| [`proxy-stateless.ts`](./proxy-stateless.ts)           | Stateless transport implementations                              |
| [`proxy-express.ts`](./proxy-express.ts)               | Mount the proxy inside an Express application                    |
| [`proxy-with-analytics.ts`](./proxy-with-analytics.ts) | Combine proxying with analytics instrumentation                  |

## Codexec

| File                                                             | What it shows                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| [`codexec-basic.ts`](./codexec-basic.ts)                         | Resolve a provider and execute guest code with QuickJS        |
| [`codexec-worker.ts`](./codexec-worker.ts)                       | Run the same provider flow inside a worker-thread executor    |
| [`codexec-mcp-provider.ts`](./codexec-mcp-provider.ts)           | Wrap MCP tools into a provider and execute against them       |
| [`codexec-mcp-server.ts`](./codexec-mcp-server.ts)               | Expose `mcp_search_tools`, `mcp_execute_code`, and `mcp_code` |
| [`codexec-isolated-vm-basic.ts`](./codexec-isolated-vm-basic.ts) | Run the same provider flow on the `isolated-vm` backend       |
