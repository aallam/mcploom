import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";

import { resolveProvider } from "../provider/resolveProvider";
import type { ResolvedToolProvider, ToolProvider } from "../types";
import {indent, schemaToType} from "../typegen/jsonSchema";

/**
 * Source used to discover MCP tools for wrapping.
 */
export type McpToolSource =
  | { client: Client; serverInfo?: Implementation }
  | { server: McpServer; serverInfo?: Implementation };

const DEFAULT_MCP_TOOL_CLIENT_INFO = {
  name: "mcp-tool-client",
  version: "0.0.0",
} satisfies Implementation;

/**
 * Returns the upstream server identity when the source can provide one.
 */
export function getMcpToolSourceServerInfo(
  source: McpToolSource,
): Implementation | undefined {
  if (source.serverInfo) {
    return source.serverInfo;
  }

  if ("client" in source) {
    return source.client.getServerVersion();
  }

  return undefined;
}

/**
 * Options for wrapping MCP tools into a code-execution provider.
 */
export interface CreateMcpToolProviderOptions {
  /** Namespace exposed to guest code for the wrapped tools. */
  namespace?: string;
  /** Implementation metadata exposed to local `{ server }` sources as the client identity. */
  clientInfo?: Implementation;
}

function generateMcpWrappedToolTypes(provider: ResolvedToolProvider): string {
  const toolDeclarations = Object.entries(provider.tools).map(
    ([safeName, tool]) => {
      const lines: string[] = [];

      if (tool.description) {
        lines.push("/**");
        lines.push(` * ${tool.description}`);
        lines.push(" *");
        lines.push(
          " * Wrapped MCP tool. Inspect structuredContent first, then fall back to content text items.",
        );
        lines.push(" */");
      } else {
        lines.push("/**");
        lines.push(
          " * Wrapped MCP tool. Inspect structuredContent first, then fall back to content text items.",
        );
        lines.push(" */");
      }

      lines.push(
        `function ${safeName}(input: ${schemaToType(tool.inputSchema)}): Promise<McpCallToolResult>;`,
      );

      return lines.join("\n");
    },
  );

  const sharedTypes = [
    "type McpCallToolResult = {",
    "  content: Array<{",
    "    type: string;",
    "    text?: string;",
    "    data?: string;",
    "    mimeType?: string;",
    "    resource?: unknown;",
    "    uri?: string;",
    "    name?: string;",
    "    description?: string;",
    "  }>;",
    "  structuredContent?: unknown;",
    "  isError?: boolean;",
    "  _meta?: Record<string, unknown>;",
    "};",
  ].join("\n");

  if (toolDeclarations.length === 0) {
    return `declare namespace ${provider.name} {\n${indent(sharedTypes)}\n}`;
  }

  return `declare namespace ${provider.name} {\n${indent(
    `${sharedTypes}\n\n${toolDeclarations.join("\n\n")}`,
  )}\n}`;
}

async function getClient(
  source: McpToolSource,
  clientInfo: Implementation,
): Promise<Client> {
  if ("client" in source) {
    return source.client;
  }

  if (source.server.isConnected()) {
    throw new Error("{ server } sources must be unconnected local MCP servers");
  }

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client(clientInfo);

  await Promise.all([
    source.server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

/**
 * Wraps MCP tools from a client or server as a resolved execution provider.
 */
export async function createMcpToolProvider(
  source: McpToolSource,
  options: CreateMcpToolProviderOptions = {},
): Promise<ResolvedToolProvider> {
  const client = await getClient(
    source,
    options.clientInfo ?? DEFAULT_MCP_TOOL_CLIENT_INFO,
  );
  const toolsResponse = await client.listTools();
  const provider: ToolProvider = {
    name: options.namespace ?? "mcp",
    tools: {},
  };

  for (const tool of toolsResponse.tools) {
    provider.tools[tool.name] = {
      description: tool.description,
      execute: async (input, context) => {
        const argumentsObject =
          typeof input === "object" && input !== null
            ? (input as Record<string, unknown>)
            : undefined;

        return client.callTool(
          {
            arguments: argumentsObject,
            name: tool.name,
          },
          undefined,
          { signal: context.signal },
        );
      },
      inputSchema: tool.inputSchema,
    };
  }

  const resolvedProvider = resolveProvider(provider);

  return {
    ...resolvedProvider,
    types: generateMcpWrappedToolTypes(resolvedProvider),
  };
}
