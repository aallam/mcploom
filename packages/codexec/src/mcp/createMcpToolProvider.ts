import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";

import { resolveProvider } from "../provider/resolveProvider";
import type { ResolvedToolProvider, ToolProvider } from "../types";
import { generateMcpWrappedToolTypes } from "./mcpWrappedToolTypes";

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

/**
 * Explicit handle for a wrapped MCP provider and any owned source connections.
 */
export interface McpToolProviderHandle {
  /** Resolved provider exposed to the executor or wrapper server. */
  provider: ResolvedToolProvider;
  /** Best-effort upstream server identity when available. */
  serverInfo?: Implementation;
  /** Releases any internal MCP client/server connection opened for the provider. */
  close: () => Promise<void>;
}

interface OpenMcpToolClientResult {
  client: Client;
  close: () => Promise<void>;
}

async function closeAll(closers: Array<() => Promise<void>>): Promise<void> {
  const results = await Promise.allSettled(closers.map((close) => close()));
  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  if (rejected) {
    throw rejected.reason;
  }
}

async function openMcpToolClient(
  source: McpToolSource,
  clientInfo: Implementation,
): Promise<OpenMcpToolClientResult> {
  if ("client" in source) {
    return {
      client: source.client,
      close: async () => {},
    };
  }

  if (source.server.isConnected()) {
    throw new Error("{ server } sources must be unconnected local MCP servers");
  }

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client(clientInfo);
  let closePromise: Promise<void> | undefined;

  await Promise.all([
    source.server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return {
    client,
    close: async () => {
      closePromise ??= closeAll([
        () => client.close(),
        () => source.server.close(),
      ]);
      return closePromise;
    },
  };
}

/**
 * Opens an MCP tool source as a resolved execution provider with explicit cleanup.
 */
export async function openMcpToolProvider(
  source: McpToolSource,
  options: CreateMcpToolProviderOptions = {},
): Promise<McpToolProviderHandle> {
  const connection = await openMcpToolClient(
    source,
    options.clientInfo ?? DEFAULT_MCP_TOOL_CLIENT_INFO,
  );

  try {
    const toolsResponse = await connection.client.listTools();
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

          return connection.client.callTool(
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
      close: connection.close,
      provider: {
        ...resolvedProvider,
        types: generateMcpWrappedToolTypes(resolvedProvider),
      },
      serverInfo: getMcpToolSourceServerInfo(source),
    };
  } catch (error) {
    await connection.close().catch(() => {});
    throw error;
  }
}

/**
 * Wraps MCP tools from a client or server as a resolved execution provider.
 */
export async function createMcpToolProvider(
  source: McpToolSource,
  options: CreateMcpToolProviderOptions = {},
): Promise<ResolvedToolProvider> {
  const handle = await openMcpToolProvider(source, options);
  return handle.provider;
}
