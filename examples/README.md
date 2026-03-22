# Examples

Runnable examples for the `@mcploom/*` package family.

## Prerequisites

```sh
npm install
npm run build
```

## Useful scripts

```sh
npm run example:analytics
npm run example:proxy
npm run example:codexec
npm run example:codexec-mcp-provider
npm run example:codexec-mcp-server
npm run example:codexec-isolated-vm
```

## Examples

| File                                | Package                                             | Description                                                                         |
| ----------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `analytics-track-handlers.ts`       | `@mcploom/analytics`                                | Wrap plain functions with `track()`, console exporter, and inspect a stats snapshot |
| `analytics-custom-exporter.ts`      | `@mcploom/analytics`                                | Custom async exporter function, sampling, and `reset()`                             |
| `analytics-instrument-transport.ts` | `@mcploom/analytics`                                | Instrument an MCP transport with `instrument()`                                     |
| `proxy-basic.ts`                    | `@mcploom/proxy`                                    | Two HTTP backends, routing rules, tool listing, and routed tool calls               |
| `proxy-middleware.ts`               | `@mcploom/proxy`                                    | `filter()`, `cache()`, `transform()`, and custom middleware                         |
| `proxy-public-http.ts`              | `@mcploom/proxy`                                    | Proxy to public HTTP MCP backends                                                   |
| `proxy-local-default.ts`            | `@mcploom/proxy`                                    | Keep a local MCP as default and layer remote backends on top                        |
| `proxy-with-analytics.ts`           | `@mcploom/proxy` + `@mcploom/analytics`             | Instrument proxy transports with analytics                                          |
| `codexec-basic.ts`                  | `@mcploom/codexec` + `@mcploom/codexec-quickjs`     | Resolve a provider and execute sandboxed code with QuickJS                          |
| `codexec-mcp-provider.ts`           | `@mcploom/codexec/mcp` + `@mcploom/codexec-quickjs` | Wrap MCP tools into a provider and execute against them                             |
| `codexec-mcp-server.ts`             | `@mcploom/codexec/mcp` + `@mcploom/codexec-quickjs` | Expose `mcp_search_tools`, `mcp_execute_code`, and `mcp_code`                       |
| `codexec-isolated-vm-basic.ts`      | `@mcploom/codexec-isolated-vm`                      | Run the same provider flow on the `isolated-vm` backend                             |
