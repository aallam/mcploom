import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import * as z from "zod";

import { codeMcpServer, createMcpToolProvider } from "@mcploom/codexec/mcp";
import { QuickJsExecutor } from "@mcploom/codexec-quickjs";

const searchDocsInputSchema: Record<string, z.ZodTypeAny> = {
  query: z.string(),
};

const searchDocsOutputSchema: Record<string, z.ZodTypeAny> = {
  hits: z.array(z.string()),
};

function createUpstreamServer(): McpServer {
  const server = new McpServer({
    name: "upstream",
    version: "1.0.0",
  });
  const registerTool = server.registerTool.bind(server) as unknown as (
    name: string,
    config: {
      description?: string;
      inputSchema?: unknown;
      outputSchema?: unknown;
    },
    handler: (...args: never[]) => Promise<unknown>,
  ) => void;

  registerTool(
    "search-docs",
    {
      description: "Search documentation",
      inputSchema: searchDocsInputSchema,
      outputSchema: searchDocsOutputSchema,
    },
    async (args: { query: string }) => ({
      content: [{ text: `found ${args.query}`, type: "text" }],
      structuredContent: {
        hits: [args.query],
      },
    }),
  );

  registerTool(
    "explode",
    {
      description: "Always fails",
      inputSchema: {},
    },
    async () => ({
      content: [{ text: "boom", type: "text" }],
      isError: true,
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

describe("MCP adapters", () => {
  it("creates a resolved MCP provider from an unconnected server", async () => {
    const server = createUpstreamServer();
    const provider = await createMcpToolProvider(
      { server },
      { namespace: "mcp" },
    );

    expect(provider.name).toBe("mcp");
    expect(provider.originalToSafeName).toMatchObject({
      "search-docs": "search_docs",
      explode: "explode",
    });
    expect(provider.types).toContain("declare namespace mcp");
    expect(provider.types).toContain("Inspect structuredContent first");
    expect(provider.types).toContain("structuredContent?: unknown;");
    expect(provider.types).toContain("content: Array<{");
    expect(provider.types).toContain("function search_docs(input:");

    const result = await provider.tools.search_docs.execute(
      { query: "quickjs" },
      {
        signal: new AbortController().signal,
        providerName: "mcp",
        safeToolName: "search_docs",
        originalToolName: "search-docs",
      },
    );

    expect(result).toMatchObject({
      content: [{ text: "found quickjs", type: "text" }],
      structuredContent: {
        hits: ["quickjs"],
      },
    });
  });

  it("wraps a connected client with both MCP code tools by default", async () => {
    const upstreamServer = createUpstreamServer();
    const upstreamClient = await connectClient(upstreamServer);
    const wrappedServer = await codeMcpServer(
      { client: upstreamClient },
      { executor: new QuickJsExecutor() },
    );
    const wrappedClient = await connectClient(wrappedServer);

    const tools = await wrappedClient.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "mcp_code",
        "mcp_search_tools",
        "mcp_execute_code",
      ]),
    );
    expect(tools.tools.map((tool) => tool.name)).not.toContain("search-docs");

    const searchResult = await wrappedClient.callTool({
      name: "mcp_search_tools",
      arguments: { query: "search" },
    });

    expect(searchResult.structuredContent).toMatchObject({
      tools: [
        expect.objectContaining({
          originalName: "search-docs",
          safeName: "search_docs",
        }),
      ],
    });
    if (
      !searchResult.structuredContent ||
      typeof searchResult.structuredContent !== "object"
    ) {
      throw new Error("Expected structured MCP search payload");
    }
    expect(searchResult.structuredContent).toHaveProperty("types");
    expect(
      (searchResult.structuredContent as { types: string }).types,
    ).toContain("Inspect structuredContent first");

    const executeResult = await wrappedClient.callTool({
      name: "mcp_execute_code",
      arguments: {
        code: '(await mcp.search_docs({ query: "quickjs" })).structuredContent.hits[0]',
      },
    });

    expect(executeResult.isError).not.toBe(true);
    expect(executeResult.structuredContent).toMatchObject({
      ok: true,
      result: "quickjs",
    });
  });

  it("reports upstream server identity to downstream clients by default", async () => {
    const upstreamServer = createUpstreamServer();
    const upstreamClient = await connectClient(upstreamServer);
    const wrappedServer = await codeMcpServer(
      { client: upstreamClient },
      {
        executor: new QuickJsExecutor(),
        mode: "single",
      },
    );
    const wrappedClient = await connectClient(wrappedServer);

    expect(wrappedClient.getServerVersion()).toMatchObject({
      name: "upstream",
      version: "1.0.0",
    });
  });

  it("allows overriding the wrapper server identity", async () => {
    const upstreamServer = createUpstreamServer();
    const upstreamClient = await connectClient(upstreamServer);
    const wrappedServer = await codeMcpServer(
      { client: upstreamClient },
      {
        executor: new QuickJsExecutor(),
        mode: "single",
        serverInfo: {
          name: "custom-wrapper",
          version: "2.0.0",
        },
      },
    );
    const wrappedClient = await connectClient(wrappedServer);

    expect(wrappedClient.getServerVersion()).toMatchObject({
      name: "custom-wrapper",
      version: "2.0.0",
    });
  });

  it("allows overriding the internal client identity for local server sources", async () => {
    const upstreamServer = createUpstreamServer();

    await createMcpToolProvider(
      { server: upstreamServer },
      {
        namespace: "mcp",
        clientInfo: {
          name: "custom-provider-client",
          version: "3.1.4",
        },
      },
    );

    expect(upstreamServer.server.getClientVersion()).toMatchObject({
      name: "custom-provider-client",
      version: "3.1.4",
    });
  });

  it("uses a neutral wrapper identity when upstream server info is unavailable", async () => {
    const upstreamServer = createUpstreamServer();
    const wrappedServer = await codeMcpServer(
      { server: upstreamServer },
      {
        executor: new QuickJsExecutor(),
        mode: "single",
      },
    );
    const wrappedClient = await connectClient(wrappedServer);

    expect(wrappedClient.getServerVersion()).toMatchObject({
      name: "mcp-code-wrapper",
      version: "0.0.0",
    });
  });

  it("uses a neutral internal client identity when not configured", async () => {
    const upstreamServer = createUpstreamServer();

    await createMcpToolProvider({ server: upstreamServer }, { namespace: "mcp" });

    expect(upstreamServer.server.getClientVersion()).toMatchObject({
      name: "mcp-tool-client",
      version: "0.0.0",
    });
  });

  it("supports single-tool mode and marks execution failures as MCP tool errors", async () => {
    const upstreamServer = createUpstreamServer();
    const upstreamClient = await connectClient(upstreamServer);
    const wrappedServer = await codeMcpServer(
      { client: upstreamClient },
      {
        executor: new QuickJsExecutor(),
        maxTextChars: 80,
        mode: "single",
      },
    );
    const wrappedClient = await connectClient(wrappedServer);

    const tools = await wrappedClient.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(["mcp_code"]);

    const executeResult = await wrappedClient.callTool({
      name: "mcp_code",
      arguments: {
        code: "await mcp.search_docs({})",
      },
    });

    expect(executeResult.isError).toBe(true);
    expect(executeResult.structuredContent).toMatchObject({
      error: {
        code: "validation_error",
      },
      ok: false,
    });
    if (!("content" in executeResult)) {
      throw new Error("Expected MCP tool result content");
    }
    const content = executeResult.content as Array<{
      text?: string;
      type: string;
    }>;
    expect(content[0]).toMatchObject({
      type: "text",
    });
    if (content[0]?.type === "text" && typeof content[0].text === "string") {
      expect(content[0].text.length).toBeLessThanOrEqual(80);
    }
  });
});
