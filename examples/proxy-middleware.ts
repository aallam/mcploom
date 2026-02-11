/**
 * Proxy: Middleware Chain
 *
 * Demonstrates filter(), cache(), transform(), and a custom logging
 * middleware. Uses proxy.callTool() directly (no HTTP server).
 */
import { McpProxy, filter, cache, transform } from "@gomcp/proxy";
import type { ProxyMiddleware } from "@gomcp/proxy";
import { z } from "zod";
import { startMockMcpServer } from "./_helpers.js";

async function main() {
  console.log("=== Proxy: Middleware Chain ===\n");

  // Start mock database backend
  const db = await startMockMcpServer(4300, (server) => {
    server.tool(
      "db_query",
      "Run a database query",
      { sql: z.string(), limit: z.number().optional() },
      async ({ sql, limit }) => {
        await new Promise((r) => setTimeout(r, 100)); // simulate slow query
        return {
          content: [
            {
              type: "text" as const,
              text: `Query: ${sql} (limit=${limit ?? "none"}) → 42 rows`,
            },
          ],
        };
      },
    );
    server.tool("db_list", "List database tables", {}, async () => ({
      content: [{ type: "text" as const, text: "Tables: users, orders, products" }],
    }));
    server.tool(
      "db_delete",
      "Delete database records",
      { table: z.string() },
      async ({ table }) => ({
        content: [{ type: "text" as const, text: `Deleted all from ${table}` }],
      }),
    );
  });
  console.log(`DB backend: ${db.url}`);

  // Custom logger middleware
  const logger: ProxyMiddleware = async (ctx, next) => {
    const start = Date.now();
    console.log(`  [log] → ${ctx.toolName}(${JSON.stringify(ctx.arguments)})`);
    const result = await next();
    console.log(
      `  [log] ← ${ctx.toolName} (${Date.now() - start}ms) error=${result.isError ?? false}`,
    );
    return result;
  };

  // Create proxy with middleware chain
  const proxy = new McpProxy({
    name: "middleware-demo",
    servers: {
      db: { url: db.url },
    },
    routing: [{ pattern: "db_*", server: "db" }],
    middleware: [
      logger,
      filter({ deny: ["db_delete"] }),
      cache({ ttl: 60, maxSize: 100 }),
      transform({
        before: (ctx) => {
          // Inject default limit for db_query
          if (ctx.toolName === "db_query" && ctx.arguments.limit === undefined) {
            return { ...ctx, arguments: { ...ctx.arguments, limit: 100 } };
          }
          return ctx;
        },
      }),
    ],
  });

  await proxy.connect();
  console.log("\n--- Calling tools ---\n");

  // 1. Blocked tool
  console.log("1. Attempting db_delete (should be blocked):");
  const r1 = await proxy.callTool("db_delete", { table: "users" });
  console.log(`   Result: ${r1.content[0]?.text} (isError=${r1.isError})\n`);

  // 2. db_query — first call (slow, goes to backend)
  console.log("2. db_query — first call (not cached):");
  const t2 = Date.now();
  const r2 = await proxy.callTool("db_query", { sql: "SELECT * FROM users" });
  console.log(`   Result: ${r2.content[0]?.text}`);
  console.log(`   Time: ${Date.now() - t2}ms\n`);

  // 3. db_query — same call (should be cached, fast)
  console.log("3. db_query — same call (cached):");
  const t3 = Date.now();
  const r3 = await proxy.callTool("db_query", { sql: "SELECT * FROM users" });
  console.log(`   Result: ${r3.content[0]?.text}`);
  console.log(`   Time: ${Date.now() - t3}ms (should be fast)\n`);

  // 4. db_list
  console.log("4. db_list:");
  const r4 = await proxy.callTool("db_list", {});
  console.log(`   Result: ${r4.content[0]?.text}\n`);

  // Cleanup
  await proxy.close();
  await db.close();
  console.log("Done.");
}

main();
