# @gomcp/proxy

Lightweight MCP proxy that aggregates multiple [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) servers behind a single endpoint. Route tool calls by name pattern, merge tool lists, and apply middleware.

## Features

- **Multi-backend aggregation** — merge tools from HTTP and stdio MCP servers
- **Pattern-based routing** — glob patterns route tool calls to the right backend
- **Middleware chain** — filter, cache, transform, or add custom processing
- **Streamable HTTP server** — expose the proxy as an MCP endpoint
- **McpServer integration** — create an SDK-compatible server for custom transports

## Installation

```bash
npm install @gomcp/proxy
```

## Quick Start

```typescript
import { McpProxy, filter, cache } from "@gomcp/proxy";

const proxy = new McpProxy({
  // Backend MCP servers
  servers: {
    algolia: { url: "https://mcp.algolia.com/mcp" },
    github: { url: "https://api.github.com/mcp" },
    postgres: { command: "npx", args: ["@mcp/postgres-server"] },
  },

  // Route tool calls (first match wins)
  routing: [
    { pattern: "algolia_*", server: "algolia" },
    { pattern: "github_*", server: "github" },
    { pattern: "*", server: "postgres" },
  ],

  // Optional middleware
  middleware: [
    filter({ deny: ["dangerous_tool"] }),
    cache({ ttl: 300, maxSize: 1000 }),
  ],
});

// Start as HTTP server
const server = await proxy.listen({ port: 3000 });

// Or create an McpServer for custom transports
await proxy.connect();
const mcpServer = proxy.createServer();
await mcpServer.connect(someTransport);
```

## API

### `new McpProxy(config)`

Create a proxy instance.

```typescript
interface ProxyConfig {
  servers: Record<string, BackendConfig>;
  routing: RoutingRule[];
  middleware?: ProxyMiddleware[];
  name?: string;       // Server name (default: "mcp-proxy")
  version?: string;    // Server version (default: "1.0.0")
}
```

#### Backend Configuration

**HTTP backends** (remote MCP servers):

```typescript
{ url: "https://mcp.example.com/mcp", headers?: { "Authorization": "Bearer ..." } }
```

**Stdio backends** (local MCP server processes):

```typescript
{ command: "npx", args: ["@mcp/my-server"], env?: { "DB_URL": "..." } }
```

#### Routing Rules

Rules are evaluated in order (first match wins). Patterns support `*` (any characters) and `?` (single character):

```typescript
routing: [
  { pattern: "algolia_*", server: "algolia" },    // algolia_search, algolia_browse
  { pattern: "*_search", server: "search" },       // google_search, bing_search
  { pattern: "tool_?", server: "backend" },        // tool_a, tool_1
  { pattern: "*", server: "default" },             // catch-all
]
```

### `proxy.connect()`

Connect to all backend servers and build the aggregated tool index.

### `proxy.getTools()`

Returns the merged list of tools from all backends.

### `proxy.callTool(toolName, args)`

Route a tool call to the appropriate backend, applying middleware.

### `proxy.createServer()`

Create an `McpServer` instance with all aggregated tools registered. Useful for connecting to custom transports.

### `proxy.listen({ port })`

Start a Streamable HTTP server. Returns `{ close: () => Promise<void> }`.

### `proxy.getBackends()`

Get information about all configured backends (name, config, tools, connection status).

### `proxy.close()`

Disconnect from all backends.

## Middleware

Middleware follows a `(ctx, next) => result` pattern. They execute in order, wrapping the final handler call.

### `filter({ allow?, deny? })`

Block or allow specific tools:

```typescript
filter({ deny: ["dangerous_tool", "admin_delete"] })
filter({ allow: ["search", "browse", "list"] })
```

### `cache({ ttl, maxSize? })`

Cache successful tool responses:

```typescript
cache({ ttl: 300, maxSize: 1000 })  // 5 minute TTL, 1000 entries max
```

### `transform({ before?, after? })`

Modify requests and/or responses:

```typescript
transform({
  before: (ctx) => ({ ...ctx, arguments: { ...ctx.arguments, limit: 10 } }),
  after: (result) => ({ ...result, content: result.content.slice(0, 5) }),
})
```

### Custom Middleware

```typescript
const logger: ProxyMiddleware = async (ctx, next) => {
  console.log(`Calling ${ctx.toolName} on ${ctx.server}`);
  const start = Date.now();
  const result = await next();
  console.log(`${ctx.toolName} took ${Date.now() - start}ms`);
  return result;
};
```

## License

MIT
