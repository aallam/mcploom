import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { StdioBackendConfig } from "../types.js";
import { BaseBackendClient } from "./base.js";

/**
 * Manages a connection to a local MCP server via stdio subprocess.
 */
export class StdioBackendClient extends BaseBackendClient<StdioClientTransport> {
  constructor(
    name: string,
    private readonly config: StdioBackendConfig,
  ) {
    super(name);
  }

  async connect(): Promise<void> {
    const transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env: this.config.env,
    });
    await this.connectWith(transport);
  }
}
