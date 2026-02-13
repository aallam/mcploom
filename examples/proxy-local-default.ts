/**
 * Proxy: Local MCP Default + External MCP Add-ons
 *
 * Pattern:
 * - Keep your own local MCP as the default backend (`*` route).
 * - Route only selected tools to external MCP servers.
 *
 * This lets you "supercharge" your own MCP without replacing it.
 */
import { McpProxy } from "@gomcp/proxy";
import { z } from "zod";
import { connectClient, startMockMcpServer } from "./_helpers.js";

const LOCAL_BACKEND_PORT = 4220;
const PROXY_PORT = 4221;

const DEEPWIKI_REPO = "modelcontextprotocol/typescript-sdk";
const DEEPWIKI_QUESTION = "What is this repository used for?";

const CONTEXT7_LIBRARY = "react";
const CONTEXT7_QUERY = "Find the official React docs with strong code examples";

type ContentBlock = { type: string; text?: string };

function readText(content: unknown): string {
  if (!Array.isArray(content)) return "<no content>";
  return content
    .map((block) => {
      const typed = block as ContentBlock;
      return typed.type === "text" && typed.text
        ? typed.text
        : JSON.stringify(typed);
    })
    .join("\n");
}

function preview(text: string, max = 500): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...`;
}

async function main() {
  console.log("=== Proxy: Local Default + External Add-ons ===\n");

  // Simulates your "own declared MCP". Replace with your real local MCP URL.
  const local = await startMockMcpServer(LOCAL_BACKEND_PORT, (server) => {
    server.tool(
      "app_echo",
      "Echo a local message",
      { message: z.string() },
      async ({ message }) => ({
        content: [{ type: "text" as const, text: `Local echo: ${message}` }],
      }),
    );

    server.tool(
      "app_sum",
      "Sum two numbers locally",
      { a: z.number(), b: z.number() },
      async ({ a, b }) => ({
        content: [{ type: "text" as const, text: `Local sum: ${a + b}` }],
      }),
    );
  });

  const proxy = new McpProxy({
    name: "supercharged-local-proxy",
    servers: {
      // Keep local first: if tool names collide, local wins during aggregation.
      local: { url: local.url },
      deepwiki: { url: "https://mcp.deepwiki.com/mcp" },
      context7: { url: "https://mcp.context7.com/mcp" },
    },
    routing: [
      { pattern: "ask_question", server: "deepwiki" },
      { pattern: "read_wiki_*", server: "deepwiki" },
      { pattern: "resolve-library-id", server: "context7" },
      { pattern: "query-docs", server: "context7" },
      // Everything else goes to your local MCP.
      { pattern: "*", server: "local" },
    ],
  });

  let listener: { close: () => Promise<void> } | undefined;
  let client: Awaited<ReturnType<typeof connectClient>> | undefined;

  try {
    listener = await proxy.listen({ port: PROXY_PORT });
    client = await connectClient(`http://localhost:${PROXY_PORT}/mcp`);

    console.log(`Local backend: ${local.url}`);
    console.log(`Proxy: http://localhost:${PROXY_PORT}/mcp`);
    console.log("Default backend: local (* route)\n");

    const { tools } = await client.listTools();
    console.log(`Tools exposed by proxy (${tools.length}):`);
    for (const tool of tools) {
      console.log(`  - ${tool.name}`);
    }
    const toolNames = new Set(tools.map((t) => t.name));

    console.log("\n--- Local tools (default backend) ---\n");
    const echo = await client.callTool({
      name: "app_echo",
      arguments: { message: "hello from app" },
    });
    console.log(readText(echo.content));

    const sum = await client.callTool({
      name: "app_sum",
      arguments: { a: 7, b: 5 },
    });
    console.log(readText(sum.content));

    if (toolNames.has("ask_question")) {
      console.log("\n--- External add-on: DeepWiki ---\n");
      const wiki = await client.callTool({
        name: "ask_question",
        arguments: {
          repoName: DEEPWIKI_REPO,
          question: DEEPWIKI_QUESTION,
        },
      });
      console.log(preview(readText(wiki.content)));
    }

    if (toolNames.has("resolve-library-id")) {
      console.log("\n--- External add-on: Context7 ---\n");
      const docs = await client.callTool({
        name: "resolve-library-id",
        arguments: {
          libraryName: CONTEXT7_LIBRARY,
          query: CONTEXT7_QUERY,
        },
      });
      console.log(preview(readText(docs.content)));
    }

    console.log("\nDone.");
  } catch (error) {
    console.error(
      "Example failed. Check network access for external MCP backends.",
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (client) await client.close().catch(() => undefined);
    if (listener) await listener.close().catch(() => undefined);
    await proxy.close().catch(() => undefined);
    await local.close().catch(() => undefined);
  }
}

main();
