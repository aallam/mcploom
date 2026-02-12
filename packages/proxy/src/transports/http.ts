import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { HttpBackendConfig } from "../types.js";
import { BaseBackendClient } from "./base.js";

/**
 * Manages a connection to a remote MCP server via Streamable HTTP.
 */
export class HttpBackendClient extends BaseBackendClient<StreamableHTTPClientTransport> {
  constructor(
    name: string,
    private readonly config: HttpBackendConfig,
  ) {
    super(name);
  }

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
