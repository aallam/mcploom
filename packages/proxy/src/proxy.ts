import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import { aggregateTools } from "./aggregator.js";
import { executeMiddlewareChain } from "./middleware.js";
import { Router } from "./router.js";
import { HttpBackendClient } from "./transports/http.js";
import { StdioBackendClient } from "./transports/stdio.js";
import type {
  BackendInfo,
  MiddlewareContext,
  MiddlewareResult,
  ProxyConfig,
  ProxyMiddleware,
  ToolInfo,
} from "./types.js";
import { isHttpConfig, isStdioConfig } from "./types.js";

type BackendClient = HttpBackendClient | StdioBackendClient;

/**
 * MCP Proxy — aggregates multiple MCP backends behind a single endpoint.
 */
export class McpProxy {
  private readonly config: ProxyConfig;
  private readonly router: Router;
  private readonly backends = new Map<string, BackendClient>();
  private readonly middleware: ProxyMiddleware[];
  private toolIndex = new Map<string, ToolInfo>();

  constructor(config: ProxyConfig) {
    this.config = config;
    this.router = new Router(config.routing);
    this.middleware = config.middleware ?? [];

    // Create backend clients
    for (const [name, backendConfig] of Object.entries(config.servers)) {
      if (isHttpConfig(backendConfig)) {
        this.backends.set(name, new HttpBackendClient(name, backendConfig));
      } else if (isStdioConfig(backendConfig)) {
        this.backends.set(name, new StdioBackendClient(name, backendConfig));
      }
    }
  }

  /**
   * Connect to all backend servers and build the aggregated tool index.
   */
  async connect(): Promise<void> {
    const connectPromises = [...this.backends.values()].map((b) => b.connect());
    await Promise.all(connectPromises);
    await this.refreshToolIndex();
  }

  /**
   * Refresh the tool index from all connected backends.
   */
  async refreshToolIndex(): Promise<void> {
    const toolsByBackend = new Map<string, ToolInfo[]>();
    const listPromises = [...this.backends.entries()].map(async ([name, client]) => {
      const tools = await client.listTools();
      toolsByBackend.set(name, tools);
    });
    await Promise.all(listPromises);

    const aggregated = aggregateTools(toolsByBackend);
    this.toolIndex.clear();
    for (const tool of aggregated) {
      this.toolIndex.set(tool.name, tool);
    }
  }

  /**
   * Get the list of all available tools across all backends.
   */
  getTools(): ToolInfo[] {
    return [...this.toolIndex.values()];
  }

  /**
   * Call a tool, routing to the appropriate backend.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MiddlewareResult> {
    const serverName = this.router.resolve(toolName);
    if (!serverName) {
      return {
        content: [{ type: "text", text: `No routing rule matches tool "${toolName}"` }],
        isError: true,
      };
    }

    const backend = this.backends.get(serverName);
    if (!backend) {
      return {
        content: [{ type: "text", text: `Backend "${serverName}" not found` }],
        isError: true,
      };
    }

    const ctx: MiddlewareContext = {
      toolName,
      arguments: args,
      server: serverName,
    };

    return executeMiddlewareChain(this.middleware, ctx, async () => {
      const result = await backend.callTool(ctx.toolName, ctx.arguments);
      return result as MiddlewareResult;
    });
  }

  /**
   * Create an McpServer that fronts this proxy, suitable for connecting to a transport.
   */
  createServer(): McpServer {
    const server = new McpServer({
      name: this.config.name ?? "mcp-proxy",
      version: this.config.version ?? "1.0.0",
    });

    // Register all aggregated tools on the proxy server.
    // Build a permissive Zod schema so the SDK routes arguments to the handler
    // without rejecting anything — the backend does the real validation.
    for (const tool of this.toolIndex.values()) {
      const shape: Record<string, z.ZodTypeAny> = {};
      if (tool.inputSchema.properties) {
        for (const key of Object.keys(tool.inputSchema.properties as Record<string, unknown>)) {
          shape[key] = z.any().optional();
        }
      }

      // eslint-disable-next-line sonarjs/deprecation -- server.tool() is the current SDK API
      server.tool(
        tool.name,
        tool.description ?? "",
        shape,
        async (args: Record<string, unknown>) => {
          const result = await this.callTool(tool.name, args);
          return {
            content: result.content.map((c) => ({
              type: c.type as "text",
              text: c.text ?? JSON.stringify(c),
            })),
            isError: result.isError,
          };
        },
      );
    }

    return server;
  }

  /**
   * Start the proxy as a Streamable HTTP server on the given port.
   */
  async listen(opts: { port: number }): Promise<{ close: () => Promise<void> }> {
    await this.connect();

    const server = this.createServer();

    // Use node:http directly to avoid Express dependency
    const { createServer } = await import("node:http");

    const sessions = new Map<string, StreamableHTTPServerTransport>();

    // eslint-disable-next-line sonarjs/cognitive-complexity -- HTTP handler requires inherent branching
    const httpServer = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${opts.port}`);

      if (url.pathname === "/mcp" && req.method === "POST") {
        // Read and parse request body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
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

        // Create a minimal ServerResponse-like interface for the transport
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
      } else if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(opts.port, resolve);
    });

    return {
      close: async () => {
        for (const transport of sessions.values()) {
          await transport.close();
        }
        sessions.clear();
        await this.close();
        await new Promise<void>((resolve, reject) => {
          httpServer.close((err) => (err ? reject(err) : resolve()));
        });
      },
    };
  }

  /**
   * Get information about all configured backends.
   */
  getBackends(): BackendInfo[] {
    return [...this.backends.entries()].map(([name, client]) => ({
      name,
      config: this.config.servers[name]!,
      tools: [...this.toolIndex.values()].filter((t) => t.backend === name),
      connected: client.connected,
    }));
  }

  /**
   * Disconnect from all backends.
   */
  async close(): Promise<void> {
    const closePromises = [...this.backends.values()].map((b) => b.close());
    await Promise.all(closePromises);
    this.toolIndex.clear();
  }
}
