/**
 * Proxy: Basic Aggregation + Routing
 *
 * Demonstrates McpProxy with two HTTP backends, routing rules,
 * and a client listing/calling tools through the proxy.
 */
import { McpProxy } from "@gomcp/proxy";
import { z } from "zod";
import { startMockMcpServer, connectClient } from "./_helpers.js";

async function main() {
  console.log("=== Proxy: Basic Aggregation + Routing ===\n");

  // Start mock weather backend
  const weather = await startMockMcpServer(4200, (server) => {
    server.tool(
      "weather_current",
      "Get current weather",
      { city: z.string() },
      async ({ city }) => ({
        content: [{ type: "text" as const, text: `Current weather in ${city}: 22°C, sunny` }],
      }),
    );
    server.tool(
      "weather_forecast",
      "Get weather forecast",
      { city: z.string(), days: z.number() },
      async ({ city, days }) => ({
        content: [
          {
            type: "text" as const,
            text: `${days}-day forecast for ${city}: sunny, cloudy, rain`,
          },
        ],
      }),
    );
  });
  console.log(`Weather backend: ${weather.url}`);

  // Start mock stocks backend
  const stocks = await startMockMcpServer(4201, (server) => {
    server.tool(
      "stock_price",
      "Get stock price",
      { symbol: z.string() },
      async ({ symbol }) => ({
        content: [
          { type: "text" as const, text: `${symbol}: $${(Math.random() * 500).toFixed(2)}` },
        ],
      }),
    );
    server.tool(
      "stock_history",
      "Get stock history",
      { symbol: z.string(), days: z.number() },
      async ({ symbol, days }) => ({
        content: [{ type: "text" as const, text: `${symbol} ${days}-day history: [...]` }],
      }),
    );
  });
  console.log(`Stocks backend: ${stocks.url}`);

  // Create proxy with routing
  const proxy = new McpProxy({
    name: "demo-proxy",
    servers: {
      weather: { url: weather.url },
      stocks: { url: stocks.url },
    },
    routing: [
      { pattern: "weather_*", server: "weather" },
      { pattern: "stock_*", server: "stocks" },
    ],
  });

  // Start proxy HTTP server
  const proxyHandle = await proxy.listen({ port: 4202 });
  console.log(`\nProxy listening on http://localhost:4202/mcp\n`);

  // Connect a client to the proxy
  const client = await connectClient("http://localhost:4202/mcp");

  // List all tools
  const tools = await client.listTools();
  console.log(`Available tools (${tools.tools.length}):`);
  for (const t of tools.tools) {
    console.log(`  - ${t.name}: ${t.description}`);
  }

  // Call each tool
  console.log("\n--- Tool calls ---\n");

  type TextContent = { type: string; text: string };

  const r1 = await client.callTool({
    name: "weather_current",
    arguments: { city: "London" },
  });
  console.log("weather_current:", (r1.content as TextContent[])[0].text);

  const r2 = await client.callTool({
    name: "weather_forecast",
    arguments: { city: "Tokyo", days: 5 },
  });
  console.log("weather_forecast:", (r2.content as TextContent[])[0].text);

  const r3 = await client.callTool({
    name: "stock_price",
    arguments: { symbol: "AAPL" },
  });
  console.log("stock_price:", (r3.content as TextContent[])[0].text);

  const r4 = await client.callTool({
    name: "stock_history",
    arguments: { symbol: "GOOG", days: 30 },
  });
  console.log("stock_history:", (r4.content as TextContent[])[0].text);

  // Backend info
  console.log("\n--- Backends ---\n");
  for (const b of proxy.getBackends()) {
    console.log(
      `${b.name}: connected=${b.connected}, tools=${b.tools.map((t) => t.name).join(", ")}`,
    );
  }

  // Cleanup
  await client.close();
  await proxyHandle.close();
  await weather.close();
  await stocks.close();
  console.log("\nDone.");
}

main();
