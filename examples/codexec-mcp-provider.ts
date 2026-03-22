import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";

import { createMcpToolProvider } from "@mcploom/codexec/mcp";
import { QuickJsExecutor } from "@mcploom/codexec-quickjs";

async function main(): Promise<void> {
  const upstreamServer = new McpServer({
    name: "upstream",
    version: "1.0.0",
  });

  upstreamServer.registerTool(
    "search-docs",
    {
      description: "Search documentation.",
      inputSchema: {
        query: z.string(),
      },
      outputSchema: {
        hits: z.array(z.string()),
      },
    },
    async (args) => ({
      content: [{ text: `found ${args.query}`, type: "text" }],
      structuredContent: {
        hits: [args.query],
      },
    }),
  );

  const provider = await createMcpToolProvider({ server: upstreamServer });
  const executor = new QuickJsExecutor();
  const execution = await executor.execute(
    '(await mcp.search_docs({ query: "quickjs" })).structuredContent',
    [provider],
  );

  console.log("mcp provider example result");
  console.log(
    JSON.stringify(
      {
        execution,
        namespace: provider.name,
        originalToSafeName: provider.originalToSafeName,
      },
      null,
      2,
    ),
  );
}

void main();
