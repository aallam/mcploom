import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { HttpBackendConfig } from "../types.js";
import { BaseBackendClient } from "./base.js";

/**
 * Manages a connection to a remote MCP server via Streamable HTTP.
 */
export class HttpBackendClient extends BaseBackendClient<StreamableHTTPClientTransport> {
  /**
   * Creates an HTTP backend client for a named MCP server.
   */
  constructor(
    name: string,
    private readonly config: HttpBackendConfig,
  ) {
    super(name);
  }

  /**
   * Connects the client using the configured Streamable HTTP endpoint and headers.
   */
  async connect(): Promise<void> {
    const transport = new StreamableHTTPClientTransport(
      new URL(this.config.url),
      {
        requestInit: {
          headers: this.config.headers ?? {},
        },
      },
    );
    await this.connectWith(transport);
  }
}
