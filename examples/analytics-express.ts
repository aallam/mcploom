/**
 * Analytics: Express Integration
 *
 * Demonstrates analytics.instrument() with a stateless MCP server on Express.
 * In stateless mode:
 *   - sessionIdGenerator is set to `undefined`
 *   - No session tracking — each request is self-contained
 *   - Only POST is needed (no GET/SSE or DELETE handlers)
 *   - A fresh transport and server connection per request
 *
 * Also exposes GET /mcp/stats to show analytics data — a realistic use case
 * for an Express app.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { McpAnalytics } from "@gomcp/analytics";

const PORT = 4100;

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "analytics-express",
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

async function main() {
  console.log("=== Analytics: Express Integration ===\n");

  const analytics = new McpAnalytics({ exporter: "console" });

  const app = express();

  // Use raw body parsing — express.json() would consume the body before
  // handleRequest can read it.
  app.post(
    "/mcp",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const body = JSON.parse((req.body as Buffer).toString("utf-8"));

      // Fresh transport and server per request (stateless — no session ID)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      const instrumented = analytics.instrument(transport);
      await createMcpServer().connect(instrumented);

      await transport.handleRequest(req, res, body);
    },
  );

  // Expose analytics stats as JSON — a realistic Express endpoint
  app.get("/mcp/stats", (_req, res) => {
    res.json(analytics.getStats());
  });

  const httpServer = await new Promise<ReturnType<typeof app.listen>>(
    (resolve) => {
      const s = app.listen(PORT, () => resolve(s));
    },
  );
  console.log(`Express server on http://localhost:${PORT}/mcp\n`);

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

  // Flush before reading stats (short-lived script)
  await analytics.flush();

  // Fetch stats from the Express endpoint
  const statsRes = await fetch(`http://localhost:${PORT}/mcp/stats`);
  const stats = (await statsRes.json()) as {
    totalCalls: number;
    tools: Record<string, { count: number; avgMs: number }>;
  };
  console.log("\n=== Stats (from GET /mcp/stats) ===");
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
