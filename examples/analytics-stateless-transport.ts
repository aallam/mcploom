/**
 * Analytics: Stateless Transport Instrumentation
 *
 * Demonstrates analytics.instrument() with a stateless MCP server.
 * In stateless mode:
 *   - sessionIdGenerator is set to `undefined`
 *   - No session tracking — each request is self-contained
 *   - Only POST is needed (no GET/SSE or DELETE handlers)
 *   - A fresh transport and server connection per request
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createServer, type IncomingMessage } from "node:http";
import { z } from "zod";
import { McpAnalytics } from "@gomcp/analytics";

const PORT = 4100;

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

async function main() {
  console.log("=== Analytics: Stateless Transport ===\n");

  // Factory to create a fresh MCP server per request (stateless — no shared state)
  function createMcpServer(): McpServer {
    const server = new McpServer({
      name: "analytics-stateless",
      version: "1.0.0",
    });

    server.tool(
      "greet",
      "Greet someone",
      { name: z.string() },
      async ({ name }) => ({
        content: [{ type: "text" as const, text: `Hello, ${name}!` }],
      }),
    );

    server.tool(
      "add",
      "Add two numbers",
      { a: z.number(), b: z.number() },
      async ({ a, b }) => ({
        content: [{ type: "text" as const, text: `${a} + ${b} = ${a + b}` }],
      }),
    );

    return server;
  }

  // Create analytics with console exporter
  const analytics = new McpAnalytics({ exporter: "console" });

  // Start stateless HTTP server — no session map, no GET/DELETE handlers
  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    if (url.pathname === "/mcp" && req.method === "POST") {
      const body = await readBody(req);

      // Fresh transport and server per request (stateless — no session ID)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      // Instrument the transport before connecting to a fresh server
      const instrumented = analytics.instrument(transport);
      await createMcpServer().connect(instrumented);

      await transport.handleRequest(req, res, body);
    } else {
      res.writeHead(405);
      res.end(JSON.stringify({ error: "Method not allowed. Use POST /mcp" }));
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
  console.log(`Stateless server on http://localhost:${PORT}/mcp\n`);

  // Connect client and make tool calls
  const client = new Client({ name: "demo-client", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp`)),
  );

  console.log("Calling tools...\n");

  const r1 = await client.callTool({
    name: "greet",
    arguments: { name: "Alice" },
  });
  console.log("greet:", JSON.stringify(r1.content));

  const r2 = await client.callTool({ name: "add", arguments: { a: 3, b: 7 } });
  console.log("add:", JSON.stringify(r2.content));

  const r3 = await client.callTool({
    name: "greet",
    arguments: { name: "Bob" },
  });
  console.log("greet:", JSON.stringify(r3.content));

  // Flush and show stats
  await analytics.flush();

  const stats = analytics.getStats();
  console.log("\n=== Stats ===");
  console.log(`Total calls: ${stats.totalCalls}`);
  for (const [tool, ts] of Object.entries(stats.tools)) {
    console.log(`  ${tool}: count=${ts.count}, avg=${ts.avgMs.toFixed(1)}ms`);
  }

  // Cleanup
  await client.close();
  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
  await analytics.shutdown();
  console.log("\nDone.");
}

main();
