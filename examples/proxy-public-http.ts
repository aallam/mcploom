/**
 * Proxy: Public HTTP Backends (DeepWiki + Context7)
 *
 * Demonstrates routing a single proxy to two real public MCP backends:
 *   - DeepWiki: https://mcp.deepwiki.com/mcp
 *   - Context7: https://mcp.context7.com/mcp
 *
 * This example requires internet access.
 */
import { McpProxy } from "@gomcp/proxy";
import { connectClient } from "./_helpers.js";

const PORT = 4210;

const DEEPWIKI_REPO = "modelcontextprotocol/typescript-sdk";
const DEEPWIKI_QUESTION = "What are the main client transport options in this repository?";

const CONTEXT7_LIBRARY = "react";
const CONTEXT7_QUERY = "Find the best official React library docs with examples";

type ContentBlock = { type: string; text?: string };

async function main() {
  console.log("=== Proxy: Public HTTP Backends (DeepWiki + Context7) ===\n");

  const proxy = new McpProxy({
    name: "public-http-proxy",
    servers: {
      deepwiki: { url: "https://mcp.deepwiki.com/mcp" },
      context7: { url: "https://mcp.context7.com/mcp" },
    },
    routing: [
      { pattern: "ask_question", server: "deepwiki" },
      { pattern: "read_wiki_*", server: "deepwiki" },
      { pattern: "resolve-library-id", server: "context7" },
      { pattern: "query-docs", server: "context7" },
      { pattern: "*", server: "deepwiki" },
    ],
  });

  let listener: { close: () => Promise<void> } | undefined;
  let client: Awaited<ReturnType<typeof connectClient>> | undefined;

  try {
    listener = await proxy.listen({ port: PORT });
    client = await connectClient(`http://localhost:${PORT}/mcp`);

    console.log(`Proxy: http://localhost:${PORT}/mcp`);

    const { tools } = await client.listTools();
    console.log(`Tools: ${tools.map((t) => t.name).join(", ")}`);

    const toolNames = new Set(tools.map((t) => t.name));

    if (toolNames.has("ask_question")) {
      const result = await client.callTool({
        name: "ask_question",
        arguments: {
          repoName: DEEPWIKI_REPO,
          question: DEEPWIKI_QUESTION,
        },
      });
      console.log("\nDeepWiki (ask_question):");
      console.log(preview(readText(result.content)));
    }

    if (toolNames.has("resolve-library-id")) {
      const result = await client.callTool({
        name: "resolve-library-id",
        arguments: {
          libraryName: CONTEXT7_LIBRARY,
          query: CONTEXT7_QUERY,
        },
      });
      console.log("\nContext7 (resolve-library-id):");
      console.log(preview(readText(result.content)));
    }

    console.log("\nDone.");
  } catch (error) {
    console.error(
      "Public MCP example failed. Check network access and backend availability.",
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (client) await client.close().catch(() => undefined);
    if (listener) await listener.close().catch(() => undefined);
    await proxy.close().catch(() => undefined);
  }
}

function readText(content: unknown): string {
  if (!Array.isArray(content) || content.length === 0) return "<no content>";

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

main();
