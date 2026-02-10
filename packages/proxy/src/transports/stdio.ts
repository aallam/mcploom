import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { StdioBackendConfig, ToolInfo } from "../types.js";

/**
 * Manages a connection to a local MCP server via stdio subprocess.
 */
export class StdioBackendClient {
  private client: Client | undefined;
  private transport: StdioClientTransport | undefined;
  private cachedTools: ToolInfo[] | undefined;

  constructor(
    private readonly name: string,
    private readonly config: StdioBackendConfig,
  ) {}

  async connect(): Promise<void> {
    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env: this.config.env as Record<string, string> | undefined,
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
