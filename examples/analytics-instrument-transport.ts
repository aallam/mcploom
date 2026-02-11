/**
 * Analytics: Instrument Transport
 *
 * Demonstrates analytics.instrument() at the transport level with a real
 * MCP server and client communicating over HTTP.
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
  console.log("=== Analytics: Instrument Transport ===\n");

  // Create MCP server with tools
  const server = new McpServer({ name: "analytics-demo", version: "1.0.0" });

  server.tool("greet", "Greet someone", { name: z.string() }, async ({ name }) => ({
    content: [{ type: "text" as const, text: `Hello, ${name}!` }],
  }));

  server.tool(
    "add",
    "Add two numbers",
    { a: z.number(), b: z.number() },
    async ({ a, b }) => ({
      content: [{ type: "text" as const, text: `${a} + ${b} = ${a + b}` }],
    }),
  );

  // Create analytics with console exporter
  const analytics = new McpAnalytics({ exporter: "console" });

  // Start HTTP server — instrument each session transport
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

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

        // Instrument the transport before connecting to the server
        const instrumented = analytics.instrument(transport);
        await server.connect(instrumented);
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

  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
  console.log(`Server listening on http://localhost:${PORT}/mcp\n`);

  // Connect client and make tool calls
  const client = new Client({ name: "demo-client", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp`)),
  );

  console.log("Calling tools...\n");

  const r1 = await client.callTool({ name: "greet", arguments: { name: "Alice" } });
  console.log("greet:", JSON.stringify(r1.content));

  const r2 = await client.callTool({ name: "add", arguments: { a: 3, b: 7 } });
  console.log("add:", JSON.stringify(r2.content));

  const r3 = await client.callTool({ name: "greet", arguments: { name: "Bob" } });
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
  for (const t of sessions.values()) await t.close();
  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
  await analytics.shutdown();
  console.log("\nDone.");
}

main();
