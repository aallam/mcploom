import { Client } from "@modelcontextprotocol/sdk/client/index.js";

import type { ToolInfo } from "../types.js";

type BackendCallResult = {
  content: Array<{ type: string; [key: string]: unknown }>;
  isError?: boolean;
};

type ClientTransport = Parameters<Client["connect"]>[0];

/**
 * Shared client logic for backend transports.
 * Concrete transports only provide transport construction and call connectWith().
 */
export abstract class BaseBackendClient<TTransport> {
  protected client: Client | undefined;
  protected transport: TTransport | undefined;
  private cachedTools: ToolInfo[] | undefined;

  /**
   * Creates a backend client base bound to a logical backend name.
   */
  constructor(protected readonly name: string) {}

  /**
   * Attaches and connects an MCP client using the concrete transport instance.
   */
  protected async connectWith(transport: ClientTransport): Promise<void> {
    this.transport = transport as TTransport;
    this.client = new Client({ name: `proxy-${this.name}`, version: "1.0.0" });
    await this.client.connect(transport);
  }

  /**
   * Lists and caches tools exposed by the connected backend.
   */
  async listTools(): Promise<ToolInfo[]> {
    if (this.cachedTools) return this.cachedTools;
    if (!this.client)
      throw new Error(`Backend "${this.name}" is not connected`);

    const result = await this.client.listTools();
    this.cachedTools = result.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
      backend: this.name,
    }));
    return this.cachedTools;
  }

  /**
   * Calls a backend tool through the connected MCP client.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<BackendCallResult> {
    if (!this.client)
      throw new Error(`Backend "${this.name}" is not connected`);
    const result = await this.client.callTool({
      name: toolName,
      arguments: args,
    });
    return {
      content: (result.content ?? []) as Array<{
        type: string;
        [key: string]: unknown;
      }>,
      isError: result.isError as boolean | undefined,
    };
  }

  /**
   * Clears any cached tool metadata so the next list refresh re-queries the backend.
   */
  invalidateToolCache(): void {
    this.cachedTools = undefined;
  }

  /**
   * Closes the backend client connection and drops cached state.
   */
  async close(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
    this.transport = undefined;
    this.cachedTools = undefined;
  }

  /**
   * Returns whether the backend client currently has an active MCP connection.
   */
  get connected(): boolean {
    return this.client !== undefined;
  }
}
