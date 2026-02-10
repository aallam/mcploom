import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { HttpBackendConfig, ToolInfo } from "../types.js";

/**
 * Manages a connection to a remote MCP server via Streamable HTTP.
 */
export class HttpBackendClient {
  private client: Client | undefined;
  private transport: StreamableHTTPClientTransport | undefined;
  private cachedTools: ToolInfo[] | undefined;

  constructor(
    private readonly name: string,
    private readonly config: HttpBackendConfig,
  ) {}

  async connect(): Promise<void> {
    this.transport = new StreamableHTTPClientTransport(new URL(this.config.url), {
      requestInit: {
        headers: this.config.headers ?? {},
      },
    });
    this.client = new Client({ name: `proxy-${this.name}`, version: "1.0.0" });
    await this.client.connect(this.transport);
  }

  async listTools(): Promise<ToolInfo[]> {
    if (this.cachedTools) return this.cachedTools;
    if (!this.client) throw new Error(`Backend "${this.name}" is not connected`);

    const result = await this.client.listTools();
    this.cachedTools = result.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
      backend: this.name,
    }));
    return this.cachedTools;
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: string; [key: string]: unknown }>; isError?: boolean }> {
    if (!this.client) throw new Error(`Backend "${this.name}" is not connected`);
    const result = await this.client.callTool({ name: toolName, arguments: args });
    return {
      content: (result.content ?? []) as Array<{ type: string; [key: string]: unknown }>,
      isError: result.isError as boolean | undefined,
    };
  }

  invalidateToolCache(): void {
    this.cachedTools = undefined;
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
    this.transport = undefined;
    this.cachedTools = undefined;
  }

  get connected(): boolean {
    return this.client !== undefined;
  }
}
