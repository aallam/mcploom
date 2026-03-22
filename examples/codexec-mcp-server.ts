import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";

import { codeMcpServer } from "@mcploom/codexec/mcp";
import { QuickJsExecutor } from "@mcploom/codexec-quickjs";

function createUpstreamServer(): McpServer {
  const server = new McpServer({
    name: "upstream",
    version: "1.0.0",
  });

  server.registerTool(
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

  return server;
}

async function connectClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({
    name: "example-client",
    version: "1.0.0",
  });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return client;
}

async function main(): Promise<void> {
  const upstreamClient = await connectClient(createUpstreamServer());
  const wrappedServer = await codeMcpServer(
    { client: upstreamClient },
    { executor: new QuickJsExecutor() },
  );
  const wrappedClient = await connectClient(wrappedServer);
  const tools = await wrappedClient.listTools();
  const searchResult = await wrappedClient.callTool({
    name: "mcp_search_tools",
    arguments: { query: "search" },
  });
  const executeResult = await wrappedClient.callTool({
    name: "mcp_execute_code",
    arguments: {
      code: '(await mcp.search_docs({ query: "quickjs" })).structuredContent.hits[0]',
    },
  });

  console.log("mcp server example result");
  console.log(
    JSON.stringify(
      {
        executeResult: executeResult.structuredContent,
        searchResult: searchResult.structuredContent,
        toolNames: tools.tools.map((tool) => tool.name),
      },
      null,
      2,
    ),
  );
}

void main();
