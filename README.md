# gomcp

Production infrastructure for the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) — observability, aggregation, and more.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [`@gomcp/analytics`](./packages/analytics/) | Lightweight analytics and observability for MCP servers | [![npm](https://img.shields.io/npm/v/@gomcp/analytics)](https://www.npmjs.com/package/@gomcp/analytics) |
| [`@gomcp/proxy`](./packages/proxy/) | MCP proxy for production apps — aggregate servers, add middleware, bridge stdio to HTTP | [![npm](https://img.shields.io/npm/v/@gomcp/proxy)](https://www.npmjs.com/package/@gomcp/proxy) |

## Why

MCP frameworks help you **build** servers — gomcp helps you **run** them in production. It provides the operational layer that MCP itself doesn't: observability, routing, middleware, and centralized policies across multiple servers.

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
    deepwiki: { url: "https://mcp.deepwiki.com/mcp" },
    github: {
      url: "https://api.githubcopilot.com/mcp/",
      headers: { Authorization: "Bearer <GITHUB_TOKEN>" },
    },
  },
  routing: [
    { pattern: "deepwiki_*", server: "deepwiki" },
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
