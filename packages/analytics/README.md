# @mcptools/analytics

Lightweight analytics and observability for [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) servers. Zero required dependencies, framework-agnostic, works at the JSON-RPC transport level.

## Features

- **Transport-level interception** — works with any MCP server (official SDK, FastMCP, custom)
- **Handler wrapping** — instrument individual tool handlers for granular control
- **Multiple exporters** — console, JSON file, OpenTelemetry OTLP, or custom functions
- **In-memory stats** — p50/p95/p99 latencies, error rates, call counts per tool
- **Sampling** — configurable sample rate to control overhead
- **Zero required deps** — only `@modelcontextprotocol/sdk` as a peer dependency

## Installation

```bash
npm install @mcptools/analytics
```

## Quick Start

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpAnalytics } from "@mcptools/analytics";

// 1. Create analytics instance
const analytics = new McpAnalytics({
  exporter: "console",
});

// 2. Create your server and transport
const server = new McpServer({ name: "my-server", version: "1.0.0" });
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });

// 3. Instrument the transport (intercepts all tool calls automatically)
const trackedTransport = analytics.instrument(transport);
await server.connect(trackedTransport);

// 4. Access stats at any time
console.log(analytics.getStats());
// { totalCalls: 42, errorRate: 0.02, tools: { search: { count: 30, p50Ms: 120, ... } } }

// 5. Clean shutdown
await analytics.shutdown();
```

## API

### `new McpAnalytics(config)`

Create an analytics instance.

| Option            | Type                                                     | Default | Description                                               |
|-------------------|----------------------------------------------------------|---------|-----------------------------------------------------------|
| `exporter`        | `"console" \| "json" \| "otlp" \| Function`              | —       | Where to send metrics (required)                          |
| `json`            | `{ path: string }`                                       | —       | JSON file config (required when `exporter: "json"`)       |
| `otlp`            | `{ endpoint: string, headers?: Record<string, string> }` | —       | OTLP config (required when `exporter: "otlp"`)            |
| `sampleRate`      | `number`                                                 | `1.0`   | Fraction of calls to sample (0.0 to 1.0)                  |
| `flushIntervalMs` | `number`                                                 | `5000`  | How often to flush events to the exporter                 |
| `maxBufferSize`   | `number`                                                 | `10000` | Max events in the ring buffer                             |
| `metadata`        | `Record<string, string>`                                 | —       | Metadata added to every event                             |
| `tracing`         | `boolean`                                                | `false` | Create OpenTelemetry spans via the global tracer provider |

### `analytics.instrument(transport)`

Wrap an MCP transport to automatically intercept all `tools/call` requests and responses. Returns a proxy transport that can be used in place of the original.

```typescript
const trackedTransport = analytics.instrument(transport);
await server.connect(trackedTransport);
```

### `analytics.track(handler, toolName?)`

Wrap a tool handler function to record metrics. Use this when you want per-handler control instead of transport-level interception.

```typescript
server.tool("search", schema, analytics.track(async (params) => {
  return await doSearch(params);
}, "search"));
```

### `analytics.getStats()`

Returns an `AnalyticsSnapshot` with aggregated metrics:

```typescript
interface AnalyticsSnapshot {
  totalCalls: number;
  totalErrors: number;
  errorRate: number;
  uptimeMs: number;
  tools: Record<string, ToolStats>;
}

interface ToolStats {
  count: number;
  errorCount: number;
  errorRate: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  avgMs: number;
  lastCalledAt: number;  // Unix timestamp ms
}
```

### `analytics.getToolStats(toolName)`

Get stats for a specific tool. Returns `undefined` if the tool hasn't been called.

### `analytics.flush()`

Force-flush all pending events to the exporter.

### `analytics.reset()`

Clear all collected data.

### `analytics.shutdown()`

Stop the flush timer and flush remaining events. Call this on process exit.

## Exporters

### Console

Pretty-prints batches to stdout:

```typescript
new McpAnalytics({ exporter: "console" });
```

### JSON File

Appends events as JSONL (one JSON object per line):

```typescript
new McpAnalytics({
  exporter: "json",
  json: { path: "./analytics.jsonl" },
});
```

### OpenTelemetry OTLP

Sends events as OpenTelemetry spans. Requires `@opentelemetry/api`, `@opentelemetry/sdk-trace-base`, and `@opentelemetry/exporter-trace-otlp-http` as peer dependencies (dynamically imported only when used):

```bash
npm install @opentelemetry/api @opentelemetry/sdk-trace-base @opentelemetry/exporter-trace-otlp-http
```

```typescript
new McpAnalytics({
  exporter: "otlp",
  otlp: {
    endpoint: "http://localhost:4318/v1/traces",
    headers: { "Authorization": "Bearer ..." },
  },
});
```

### Custom Function

Provide your own export function:

```typescript
new McpAnalytics({
  exporter: async (events) => {
    await fetch("https://my-analytics.example.com/ingest", {
      method: "POST",
      body: JSON.stringify(events),
    });
  },
});
```

## Tracing (dd-trace / OpenTelemetry)

When you use an APM like [dd-trace](https://github.com/DataDog/dd-trace-js) that registers itself as the global OpenTelemetry provider, you can make MCP tool calls appear as spans in your existing traces with zero extra configuration:

```typescript
import "dd-trace/init"; // sets up dd-trace as global OTel provider

import { McpAnalytics } from "@mcptools/analytics";

const analytics = new McpAnalytics({
  exporter: "console",
  tracing: true, // creates spans via the global tracer provider
});

const tracked = analytics.instrument(transport);
await server.connect(tracked);
// Tool calls now appear as "mcp.tool_call" spans in Datadog
```

This works with any OTel-compatible provider (Datadog, New Relic, Honeycomb, etc.). The `tracing` flag dynamically imports `@opentelemetry/api` and uses the global tracer — no OTLP exporter setup needed.

When using `analytics.track()` (handler wrapping), the handler executes inside the span context, so any downstream OTel-instrumented calls (HTTP, DB, etc.) become children of the MCP tool span.

### OTLP exporter with global provider

If you're already using the OTLP exporter and want it to send spans through your global provider instead of creating an isolated one:

```typescript
new McpAnalytics({
  exporter: "otlp",
  otlp: {
    endpoint: "unused-when-global", // ignored when useGlobalProvider is true
    useGlobalProvider: true,
  },
});
```

### Span attributes

Each `mcp.tool_call` span includes these attributes:

| Attribute                | Description                                     |
|--------------------------|-------------------------------------------------|
| `mcp.tool.name`          | Tool name                                       |
| `mcp.tool.input_size`    | Input size in bytes                             |
| `mcp.tool.duration_ms`   | Duration (OTLP exporter only)                   |
| `mcp.tool.success`       | Whether the call succeeded (OTLP exporter only) |
| `mcp.tool.output_size`   | Output size in bytes (OTLP exporter only)       |
| `mcp.tool.error_message` | Error message if failed (OTLP exporter only)    |

## License

MIT
