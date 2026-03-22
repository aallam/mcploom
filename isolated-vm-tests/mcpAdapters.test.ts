import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import * as z from "zod";

import { codeMcpServer } from "@mcploom/codexec/mcp";
import { IsolatedVmExecutor } from "@mcploom/codexec-isolated-vm";

function createUpstreamServer(): McpServer {
  const server = new McpServer({
    name: "upstream",
    version: "1.0.0",
  });

  server.registerTool(
    "search-docs",
    {
      description: "Search documentation",
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
    name: "test-client",
    version: "1.0.0",
  });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

describe("IsolatedVmExecutor MCP adapters", () => {
  it("wraps a connected client with both MCP code tools by default", async () => {
    const upstreamServer = createUpstreamServer();
    const upstreamClient = await connectClient(upstreamServer);
    const wrappedServer = await codeMcpServer(
      { client: upstreamClient },
      { executor: new IsolatedVmExecutor() },
    );
    const wrappedClient = await connectClient(wrappedServer);

    const executeResult = await wrappedClient.callTool({
      name: "mcp_execute_code",
      arguments: {
        code: '(await mcp.search_docs({ query: "isolated" })).structuredContent.hits[0]',
      },
    });

    expect(executeResult.isError).not.toBe(true);
    expect(executeResult.structuredContent).toMatchObject({
      ok: true,
      result: "isolated",
    });
  });
});
