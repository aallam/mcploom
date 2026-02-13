# Examples

Working examples for `@gomcp/analytics` and `@gomcp/proxy`.

## Prerequisites

```sh
npm install && npm run build   # from repo root
```

## Running

```sh
npx tsx examples/<example>.ts
```

## Examples

| File                                | Package            | Description                                                           |
|-------------------------------------|--------------------|-----------------------------------------------------------------------|
| `analytics-track-handlers.ts`       | `@gomcp/analytics` | Wrap plain functions with `track()`, console exporter, stats snapshot |
| `analytics-custom-exporter.ts`      | `@gomcp/analytics` | Custom async exporter function, 50% sampling, `reset()`               |
| `analytics-instrument-transport.ts` | `@gomcp/analytics` | Instrument an MCP server transport with `instrument()`                |
| `proxy-basic.ts`                    | `@gomcp/proxy`     | Two backends, routing rules, list and call tools through proxy        |
| `proxy-middleware.ts`               | `@gomcp/proxy`     | `filter()`, `cache()`, `transform()`, custom logging middleware       |
| `proxy-public-http.ts`              | `@gomcp/proxy`     | Proxy to public HTTP MCP backends (DeepWiki + Context7)               |
| `proxy-local-default.ts`            | `@gomcp/proxy`     | Keep local MCP as default and add selected tools from external MCPs   |
| `proxy-with-analytics.ts`           | both               | Instrument a proxy's transports with analytics                        |
| `proxy-express.ts`                  | `@gomcp/proxy`     | Use `McpProxy` in an Express app with stateless MCP transport         |
| `proxy-stateless.ts`                | `@gomcp/proxy`     | Stateless transport mode (`POST` only, no session tracking)           |
