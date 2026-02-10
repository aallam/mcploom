# mcp-tools

Production infrastructure for the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP). Two packages that fill critical gaps in the MCP ecosystem: **observability** and **aggregation**.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [`@gomcp/analytics`](./packages/analytics/) | Lightweight analytics and observability for MCP servers | [![npm](https://img.shields.io/npm/v/@gomcp/analytics)](https://www.npmjs.com/package/@gomcp/analytics) |
| [`@gomcp/proxy`](./packages/proxy/) | MCP proxy that aggregates multiple servers behind a single endpoint | [![npm](https://img.shields.io/npm/v/@gomcp/proxy)](https://www.npmjs.com/package/@gomcp/proxy) |

## Why

MCP frameworks exist for **building** servers. Nothing exists for **operating** them:

1. **Zero observability** — no way to track which tools are called, how fast they run, what fails
2. **No aggregation** — teams with multiple MCP servers have no proxy/gateway

These packages solve both problems with minimal dependencies.

## Quick Start

### Analytics

```typescript
import { McpAnalytics } from "@gomcp/analytics";

const analytics = new McpAnalytics({ exporter: "console" });

// Instrument a transport (works with ANY MCP server)
const tracked = analytics.instrument(transport);
await server.connect(tracked);

// Or wrap individual handlers
server.tool("search", schema, analytics.track(handler, "search"));

// Get stats
analytics.getStats();
// { totalCalls: 150, tools: { search: { p50Ms: 120, p95Ms: 450, errorRate: 0.02 } } }
```

### Proxy

```typescript
import { McpProxy, filter, cache } from "@gomcp/proxy";

const proxy = new McpProxy({
  servers: {
    algolia: { url: "https://mcp.algolia.com/mcp" },
    github: { url: "https://api.github.com/mcp" },
  },
  routing: [
    { pattern: "algolia_*", server: "algolia" },
    { pattern: "github_*", server: "github" },
  ],
  middleware: [
    filter({ deny: ["dangerous_tool"] }),
    cache({ ttl: 300 }),
  ],
});

await proxy.listen({ port: 3000 });
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build all packages
npm run build

# Type-check
npx tsc -p packages/analytics/tsconfig.json --noEmit
npx tsc -p packages/proxy/tsconfig.json --noEmit
```

## License

MIT
