import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RegisteredTool = {
  invoke: (args: Record<string, unknown>) => Promise<unknown>;
};

const mocks = vi.hoisted(() => {
  const backendInstances = new Map<string, MockHttpBackendClient>();
  const mcpServerInstances: MockMcpServer[] = [];
  const nodeHttpServerInstances: MockNodeHttpServer[] = [];
  const transportInstances: MockStreamableHTTPServerTransport[] = [];

  class MockMcpServer {
    readonly registeredTools = new Map<string, RegisteredTool>();
    readonly connectedTransports: unknown[] = [];
    connectCalls = 0;
    closeCalls = 0;

    constructor() {
      mcpServerInstances.push(this);
    }

    registerTool(
      name: string,
      config: {
        description?: string;
        inputSchema?: { parse: (value: unknown) => Record<string, unknown> };
      },
      cb: (args: Record<string, unknown>) => Promise<unknown>,
    ): Record<string, never> {
      this.registeredTools.set(name, {
        invoke: async (args) => cb(config.inputSchema?.parse(args) ?? args),
      });
      return {};
    }

    tool(
      name: string,
      _description: string,
      paramsSchema: Record<string, unknown>,
      cb: (args: Record<string, unknown>) => Promise<unknown>,
    ): Record<string, never> {
      this.registeredTools.set(name, {
        // Mimic SDK's default object parsing behavior: unknown keys are stripped.
        invoke: async (args) => {
          const parsedArgs: Record<string, unknown> = {};
          for (const key of Object.keys(paramsSchema)) {
            if (key in args) {
              parsedArgs[key] = args[key];
            }
          }
          return cb(parsedArgs);
        },
      });
      return {};
    }

    async connect(transport: unknown): Promise<void> {
      this.connectCalls += 1;
      this.connectedTransports.push(transport);
    }

    async close(): Promise<void> {
      this.closeCalls += 1;
    }
  }

  class MockStreamableHTTPServerTransport {
    sessionId: string | undefined;
    onclose: (() => void) | undefined;

    constructor(
      private readonly options: {
        sessionIdGenerator?: () => string;
        onsessioninitialized?: (id: string) => void;
      },
    ) {
      transportInstances.push(this);
    }

    async handleRequest(
      _req: unknown,
      res: {
        writeHead: (
          statusCode: number,
          headers?: Record<string, string>,
        ) => void;
        end: (body?: string) => void;
      },
    ): Promise<void> {
      if (!this.sessionId) {
        this.sessionId = this.options.sessionIdGenerator?.();
        if (this.sessionId) {
          this.options.onsessioninitialized?.(this.sessionId);
        }
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    }

    async close(): Promise<void> {
      this.onclose?.();
    }
  }

  class MockNodeHttpServer {
    constructor(
      private readonly handler: (
        req: {
          url: string;
          method: string;
          headers: Record<string, string>;
          [Symbol.asyncIterator]: () => AsyncGenerator<Buffer>;
        },
        res: {
          writeHead: (
            statusCode: number,
            headers?: Record<string, string>,
          ) => void;
          end: (body?: string) => void;
        },
      ) => Promise<void>,
    ) {
      nodeHttpServerInstances.push(this);
    }

    listen(_port: number, cb: () => void): void {
      cb();
    }

    close(cb: (err?: Error) => void): void {
      cb();
    }

    async request(opts: {
      method: string;
      path: string;
      headers?: Record<string, string>;
      body?: unknown;
      rawChunks?: Buffer[];
    }): Promise<{
      statusCode: number;
      headers: Record<string, string>;
      body: string;
    }> {
      const chunks =
        opts.rawChunks ??
        (opts.body !== undefined ? [Buffer.from(JSON.stringify(opts.body))] : []);
      const req = {
        url: opts.path,
        method: opts.method,
        headers: opts.headers ?? {},
        async *[Symbol.asyncIterator]() {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      };

      let statusCode = 200;
      let body = "";
      const headers: Record<string, string> = {};
      const res = {
        writeHead: (status: number, responseHeaders?: Record<string, string>) => {
          statusCode = status;
          if (responseHeaders) {
            Object.assign(headers, responseHeaders);
          }
        },
        end: (chunk?: string) => {
          if (chunk) {
            body += chunk;
          }
        },
      };

      await this.handler(req, res);
      return { statusCode, headers, body };
    }
  }

  class MockHttpBackendClient {
    connected = false;
    callToolCalls: Array<[string, Record<string, unknown>]> = [];
    throwOnCallTool: Error | undefined;

    constructor(
      private readonly name: string,
    ) {
      backendInstances.set(name, this);
    }

    async connect(): Promise<void> {
      this.connected = true;
    }

    async listTools(): Promise<
      Array<{
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
        backend: string;
      }>
    > {
      return [
        {
          name: "dynamic_tool",
          description: "Dynamic args tool",
          inputSchema: { type: "object" },
          backend: this.name,
        },
        {
          name: "image_tool",
          description: "Image response tool",
          inputSchema: {
            type: "object",
            properties: { prompt: { type: "string" } },
          },
          backend: this.name,
        },
      ];
    }

    async callTool(
      toolName: string,
      args: Record<string, unknown>,
    ): Promise<{
      content: Array<Record<string, unknown>>;
      isError?: boolean;
    }> {
      this.callToolCalls.push([toolName, args]);
      if (this.throwOnCallTool) {
        throw this.throwOnCallTool;
      }

      if (toolName === "image_tool") {
        return {
          content: [
            {
              type: "image",
              data: "ZmFrZQ==",
              mimeType: "image/png",
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: `Result from ${this.name}:${toolName}` }],
      };
    }

    invalidateToolCache(): void {
      // no-op mock
    }

    async close(): Promise<void> {
      this.connected = false;
    }
  }

  return {
    backendInstances,
    mcpServerInstances,
    nodeHttpServerInstances,
    transportInstances,
    MockHttpBackendClient,
    MockMcpServer,
    MockNodeHttpServer,
    MockStreamableHTTPServerTransport,
  };
});

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: mocks.MockMcpServer,
}));

vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
  StreamableHTTPServerTransport: mocks.MockStreamableHTTPServerTransport,
}));

vi.mock("../src/transports/http.js", () => ({
  HttpBackendClient: mocks.MockHttpBackendClient,
}));

vi.mock("../src/transports/stdio.js", () => ({
  StdioBackendClient: vi.fn(),
}));

vi.mock("node:http", () => ({
  createServer: (
    handler: ConstructorParameters<typeof mocks.MockNodeHttpServer>[0],
  ) => new mocks.MockNodeHttpServer(handler),
}));

import { McpProxy } from "../src/proxy.js";

describe("McpProxy runtime correctness", () => {
  let proxy: McpProxy;

  beforeEach(async () => {
    mocks.backendInstances.clear();
    mocks.mcpServerInstances.length = 0;
    mocks.nodeHttpServerInstances.length = 0;
    mocks.transportInstances.length = 0;

    proxy = new McpProxy({
      servers: {
        backend: { url: "https://example.com/mcp" },
      },
      routing: [{ pattern: "*", server: "backend" }],
    });

    await proxy.connect();
  });

  afterEach(async () => {
    await proxy.close();
  });

  it("creates a dedicated MCP server per HTTP session", async () => {
    const listener = await proxy.listen({ port: 3777 });

    try {
      const httpServer = mocks.nodeHttpServerInstances[0];
      expect(httpServer).toBeDefined();

      const firstResponse = await httpServer!.request({
        method: "POST",
        path: "/mcp",
        headers: { "content-type": "application/json" },
        body: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        },
      });

      const secondResponse = await httpServer!.request({
        method: "POST",
        path: "/mcp",
        headers: { "content-type": "application/json" },
        body: {
          jsonrpc: "2.0",
          id: 2,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        },
      });

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(200);
      expect(mocks.mcpServerInstances).toHaveLength(2);
      expect(
        mocks.mcpServerInstances.map((instance) => instance.connectCalls),
      ).toEqual([1, 1]);
      expect(
        mocks.mcpServerInstances.every((instance) =>
          instance.connectedTransports.every(
            (transport) =>
              transport instanceof mocks.MockStreamableHTTPServerTransport,
          ),
        ),
      ).toBe(true);
    } finally {
      await listener.close();
    }
  });

  it("returns 400 for malformed JSON request bodies", async () => {
    const listener = await proxy.listen({ port: 3777 });

    try {
      const httpServer = mocks.nodeHttpServerInstances[0];
      expect(httpServer).toBeDefined();

      const response = await httpServer!.request({
        method: "POST",
        path: "/mcp",
        headers: { "content-type": "application/json" },
        rawChunks: [Buffer.from("{ malformed json")],
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({ error: "Invalid JSON body" });
    } finally {
      await listener.close();
    }
  });

  it("returns 413 for oversized request bodies", async () => {
    const listener = await proxy.listen({ port: 3777 });

    try {
      const httpServer = mocks.nodeHttpServerInstances[0];
      expect(httpServer).toBeDefined();

      const response = await httpServer!.request({
        method: "POST",
        path: "/mcp",
        headers: { "content-type": "application/json" },
        rawChunks: [Buffer.alloc(4 * 1024 * 1024 + 1, "x")],
      });

      expect(response.statusCode).toBe(413);
      expect(JSON.parse(response.body)).toEqual({ error: "Request body too large" });
    } finally {
      await listener.close();
    }
  });

  it("removes a session when the transport closes", async () => {
    const listener = await proxy.listen({ port: 3777 });

    try {
      const httpServer = mocks.nodeHttpServerInstances[0];
      expect(httpServer).toBeDefined();

      await httpServer!.request({
        method: "POST",
        path: "/mcp",
        headers: { "content-type": "application/json" },
        body: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        },
      });

      const firstTransport = mocks.transportInstances[0];
      expect(firstTransport).toBeDefined();
      const sessionId = firstTransport!.sessionId;
      expect(sessionId).toBeDefined();

      await firstTransport!.close();

      const response = await httpServer!.request({
        method: "GET",
        path: "/mcp",
        headers: { "mcp-session-id": sessionId! },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({ error: "No session found" });
    } finally {
      await listener.close();
    }
  });

  it("preserves dynamic tool arguments when invoking the backend", async () => {
    proxy.createServer();

    const server = mocks.mcpServerInstances[0];
    expect(server).toBeDefined();
    const dynamicTool = server!.registeredTools.get("dynamic_tool");
    expect(dynamicTool).toBeDefined();

    const dynamicArgs = {
      indexName: "products",
      filters: { inStock: true, category: "books" },
      tags: ["featured", "new"],
    };

    await dynamicTool!.invoke(dynamicArgs);

    const backend = mocks.backendInstances.get("backend");
    expect(backend).toBeDefined();
    expect(backend!.callToolCalls).toContainEqual(["dynamic_tool", dynamicArgs]);
  });

  it("returns non-text content blocks without corrupting required fields", async () => {
    proxy.createServer();

    const server = mocks.mcpServerInstances[0];
    expect(server).toBeDefined();
    const imageTool = server!.registeredTools.get("image_tool");
    expect(imageTool).toBeDefined();

    const result = (await imageTool!.invoke({
      prompt: "sunset",
    })) as {
      content: Array<Record<string, unknown>>;
      isError?: boolean;
    };

    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([
      {
        type: "image",
        data: "ZmFrZQ==",
        mimeType: "image/png",
      },
    ]);
  });

  it("returns a structured MCP error when backend call fails", async () => {
    const backend = mocks.backendInstances.get("backend");
    expect(backend).toBeDefined();
    backend!.throwOnCallTool = new Error("boom");

    proxy.createServer();
    const server = mocks.mcpServerInstances[0];
    expect(server).toBeDefined();
    const dynamicTool = server!.registeredTools.get("dynamic_tool");
    expect(dynamicTool).toBeDefined();

    const result = (await dynamicTool!.invoke({ query: "test" })) as {
      content: Array<Record<string, unknown>>;
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toContain("Backend error: boom");
  });
});
