/**
 * Proxy: Stateless Server
 *
 * Demonstrates McpProxy with a stateless MCP transport.
 * In stateless mode:
 *   - sessionIdGenerator is set to `undefined`
 *   - No session tracking — each request is self-contained
 *   - Only POST is needed (no GET/SSE or DELETE handlers)
 *   - A fresh transport and proxy server per request
 */
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage } from "node:http";
import { z } from "zod";
import { McpProxy, cache } from "@gomcp/proxy";
import { startMockMcpServer, connectClient } from "./_helpers.js";

const PROXY_PORT = 4500;

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

async function main() {
  console.log("=== Proxy: Stateless Server ===\n");

  // Start a mock backend
  const backend = await startMockMcpServer(4501, (server) => {
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
              text: `Results for "${query}": [item1, item2, item3]`,
            },
          ],
        };
      },
    );
    server.tool(
      "api_echo",
      "Echo back input",
      { message: z.string() },
      async ({ message }) => ({
        content: [{ type: "text" as const, text: `Echo: ${message}` }],
      }),
    );
  });
  console.log(`Backend: ${backend.url}`);

  // Create proxy with caching middleware
  const proxy = new McpProxy({
    name: "stateless-proxy",
    servers: { api: { url: backend.url } },
    routing: [{ pattern: "api_*", server: "api" }],
    middleware: [cache({ ttl: 60, maxSize: 100 })],
  });

  await proxy.connect();

  // Start a stateless HTTP server — no session map, no GET/DELETE handlers
  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PROXY_PORT}`);

    if (url.pathname === "/mcp" && req.method === "POST") {
      const body = await readBody(req);

      // Fresh transport and proxy server per request (stateless — no session ID)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      const proxyServer = proxy.createServer();
      await proxyServer.connect(transport);

      await transport.handleRequest(req, res, body);
    } else {
      res.writeHead(405);
      res.end(JSON.stringify({ error: "Method not allowed. Use POST /mcp" }));
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(PROXY_PORT, resolve));
  console.log(`Stateless proxy on http://localhost:${PROXY_PORT}/mcp\n`);

  // Connect client and make tool calls
  const client = await connectClient(`http://localhost:${PROXY_PORT}/mcp`);

  // List all tools
  const tools = await client.listTools();
  console.log(`Available tools (${tools.tools.length}):`);
  for (const t of tools.tools) {
    console.log(`  - ${t.name}: ${t.description}`);
  }

  console.log("\n--- Tool calls ---\n");

  type TextContent = { type: string; text: string };

  const r1 = await client.callTool({
    name: "api_search",
    arguments: { query: "MCP protocol" },
  });
  console.log("api_search:", (r1.content as TextContent[])[0].text);

  const r2 = await client.callTool({
    name: "api_echo",
    arguments: { message: "Hello stateless world!" },
  });
  console.log("api_echo:", (r2.content as TextContent[])[0].text);

  // Repeat search — proxy cache still works across stateless requests
  const r3 = await client.callTool({
    name: "api_search",
    arguments: { query: "MCP protocol" },
  });
  console.log("api_search (cached):", (r3.content as TextContent[])[0].text);

  // Cleanup
  await client.close();
  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
  await proxy.close();
  await backend.close();
  console.log("\nDone.");
}

main();
