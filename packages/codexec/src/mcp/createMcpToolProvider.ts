import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { resolveProvider } from "../provider/resolveProvider";
import type { ResolvedToolProvider, ToolProvider } from "../types";
import { schemaToType } from "../typegen/jsonSchema";

/**
 * Source used to discover MCP tools for wrapping.
 */
export type McpToolSource = { client: Client } | { server: McpServer };

/**
 * Options for wrapping MCP tools into a code-execution provider.
 */
export interface CreateMcpToolProviderOptions {
  /** Namespace exposed to guest code for the wrapped tools. */
  namespace?: string;
}

function indent(value: string, level = 1): string {
  return value
    .split("\n")
    .map((line) => `${"  ".repeat(level)}${line}`)
    .join("\n");
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

async function getClient(source: McpToolSource): Promise<Client> {
  if ("client" in source) {
    return source.client;
  }

  if (source.server.isConnected()) {
    throw new Error("{ server } sources must be unconnected local MCP servers");
  }

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({
    name: "@mcploom/codexec",
    version: "0.1.0",
  });

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
  const client = await getClient(source);
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
