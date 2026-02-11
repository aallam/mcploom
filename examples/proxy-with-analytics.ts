/**
 * Proxy + Analytics
 *
 * End-to-end example: proxy aggregating a backend with caching middleware,
 * plus analytics observing all proxied tool calls via transport instrumentation.
 */
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage } from "node:http";
import { z } from "zod";
import { McpProxy, cache } from "@gomcp/proxy";
import { McpAnalytics } from "@gomcp/analytics";
import { startMockMcpServer, connectClient } from "./_helpers.js";

const PROXY_PORT = 4400;

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

async function main() {
  console.log("=== Proxy + Analytics ===\n");

  // Start mock API backend
  const api = await startMockMcpServer(4401, (server) => {
    server.tool(
      "api_search",
      "Search the API",
      { query: z.string() },
      async ({ query }) => {
        await new Promise((r) => setTimeout(r, 50));
        return {
          content: [
            {
              type: "text" as const,
              text: `Search results for "${query}": [item1, item2, item3]`,
            },
          ],
        };
      },
    );
    server.tool(
      "api_summarize",
      "Summarize content",
      { text: z.string() },
      async ({ text }) => {
        await new Promise((r) => setTimeout(r, 30));
        return {
          content: [
            {
              type: "text" as const,
              text: `Summary of "${text.slice(0, 20)}...": This is a summary.`,
            },
          ],
        };
      },
    );
  });
  console.log(`API backend: ${api.url}`);

  // Create proxy with caching
  const proxy = new McpProxy({
    name: "instrumented-proxy",
    servers: { api: { url: api.url } },
    routing: [{ pattern: "api_*", server: "api" }],
    middleware: [cache({ ttl: 60, maxSize: 100 })],
  });

  await proxy.connect();
  const proxyServer = proxy.createServer();

  // Create analytics with console exporter
  const analytics = new McpAnalytics({ exporter: "console" });

  // Start HTTP server with analytics-instrumented transports
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PROXY_PORT}`);

    if (url.pathname === "/mcp" && req.method === "POST") {
      const body = await readBody(req);
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      let transport = sessionId ? sessions.get(sessionId) : undefined;

      if (!transport) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, transport!);
          },
        });

        // Instrument the transport with analytics before connecting
        const instrumented = analytics.instrument(transport);
        await proxyServer.connect(instrumented);
      }

      await transport.handleRequest(req, res, body);
    } else if (url.pathname === "/mcp" && req.method === "GET") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      const transport = sessionId ? sessions.get(sessionId) : undefined;
      if (transport) {
        await transport.handleRequest(req, res);
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "No session" }));
      }
    } else if (url.pathname === "/mcp" && req.method === "DELETE") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      const transport = sessionId ? sessions.get(sessionId) : undefined;
      if (transport) {
        await transport.handleRequest(req, res);
        sessions.delete(sessionId!);
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "No session" }));
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(PROXY_PORT, resolve));
  console.log(`Proxy+Analytics on http://localhost:${PROXY_PORT}/mcp\n`);

  // Connect client
  const client = await connectClient(`http://localhost:${PROXY_PORT}/mcp`);

  console.log("--- Making calls ---\n");

  type TextContent = { type: string; text: string };

  const r1 = await client.callTool({
    name: "api_search",
    arguments: { query: "MCP protocol" },
  });
  console.log("api_search:", (r1.content as TextContent[])[0].text);

  const r2 = await client.callTool({
    name: "api_summarize",
    arguments: { text: "The Model Context Protocol is an open standard..." },
  });
  console.log("api_summarize:", (r2.content as TextContent[])[0].text);

  // Repeat search to show cache hit (proxy caches, analytics still records)
  const r3 = await client.callTool({
    name: "api_search",
    arguments: { query: "MCP protocol" },
  });
  console.log("api_search (cached):", (r3.content as TextContent[])[0].text);

  const r4 = await client.callTool({
    name: "api_search",
    arguments: { query: "something else" },
  });
  console.log("api_search:", (r4.content as TextContent[])[0].text);

  // Flush and print analytics
  await analytics.flush();

  const stats = analytics.getStats();
  console.log("\n=== Analytics Stats ===");
  console.log(`Total calls observed: ${stats.totalCalls}`);
  console.log(`Total errors: ${stats.totalErrors}`);
  for (const [tool, ts] of Object.entries(stats.tools)) {
    console.log(
      `  ${tool}: count=${ts.count}, avg=${ts.avgMs.toFixed(1)}ms, p95=${ts.p95Ms.toFixed(1)}ms`,
    );
  }

  // Cleanup
  await client.close();
  for (const t of sessions.values()) await t.close();
  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
  await proxy.close();
  await analytics.shutdown();
  await api.close();
  console.log("\nDone.");
}

main();
