import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createServer } from "node:http";

async function readBody(
  req: import("node:http").IncomingMessage,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

/**
 * Start a mock MCP server on the given port.
 * Call `setup` to register tools on the server before it starts listening.
 */
export async function startMockMcpServer(
  port: number,
  setup: (server: McpServer) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = new McpServer({ name: "mock", version: "1.0.0" });
  setup(server);

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

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
        await server.connect(transport);
      }

      await transport.handleRequest(req, res, body);
    } else if (url.pathname === "/mcp" && req.method === "GET") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      const transport = sessionId ? sessions.get(sessionId) : undefined;

      if (transport) {
        await transport.handleRequest(req, res);
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No session found" }));
      }
    } else if (url.pathname === "/mcp" && req.method === "DELETE") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      const transport = sessionId ? sessions.get(sessionId) : undefined;

      if (transport) {
        await transport.handleRequest(req, res);
        sessions.delete(sessionId!);
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No session found" }));
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));

  return {
    url: `http://localhost:${port}/mcp`,
    close: async () => {
      for (const t of sessions.values()) await t.close();
      sessions.clear();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

/**
 * Connect an MCP client to the given URL.
 */
export async function connectClient(url: string): Promise<Client> {
  const client = new Client({ name: "example-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);
  return client;
}
