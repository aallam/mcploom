import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";

import type { Executor } from "../executor/executor";
import type { ResolvedToolProvider } from "../types";
import {
  openMcpToolProvider,
  type CreateMcpToolProviderOptions,
  type McpToolSource,
} from "./createMcpToolProvider";

/**
 * Options for exposing wrapped MCP tool execution through an MCP server.
 */
export interface CodeMcpServerOptions extends CreateMcpToolProviderOptions {
  /** Executor used to run guest JavaScript against the wrapped provider. */
  executor: Executor;
  /** Implementation metadata exposed to downstream clients as the wrapper server identity. */
  serverInfo?: Implementation;
  /** Maximum number of text characters returned in text content blocks. */
  maxTextChars?: number;
  /** Wrapper tool layout to expose on the returned server. */
  mode?: "both" | "single" | "split";
  /** Optional custom names for the wrapper tools. */
  names?: {
    execute?: string;
    search?: string;
    single?: string;
  };
}

const DEFAULT_MAX_TEXT_CHARS = 24_000;
const DEFAULT_MCP_CODE_WRAPPER_SERVER_INFO = {
  name: "mcp-code-wrapper",
  version: "0.0.0",
} satisfies Implementation;

function truncateText(text: string, maxTextChars: number): string {
  return text.length <= maxTextChars ? text : text.slice(0, maxTextChars);
}

function renderText(value: unknown, maxTextChars: number): string {
  return truncateText(JSON.stringify(value, null, 2), maxTextChars);
}

function searchTools(
  provider: ResolvedToolProvider,
  query: string | undefined,
  limit: number,
): Record<string, unknown> {
  const normalizedQuery = query?.toLowerCase().trim();
  const matches = Object.entries(provider.tools)
    .map(([safeName, descriptor]) => ({
      description: descriptor.description,
      inputSchema: descriptor.inputSchema,
      originalName: descriptor.originalName,
      outputSchema: descriptor.outputSchema,
      safeName,
    }))
    .filter((tool) => {
      if (!normalizedQuery) {
        return true;
      }

      return [tool.originalName, tool.safeName, tool.description ?? ""].some(
        (field) => field.toLowerCase().includes(normalizedQuery),
      );
    })
    .slice(0, limit);

  return {
    namespace: provider.name,
    originalToSafeName: provider.originalToSafeName,
    safeToOriginalName: provider.safeToOriginalName,
    tools: matches,
    types: provider.types,
  };
}

function registerExecuteTool(
  server: McpServer,
  name: string,
  provider: ResolvedToolProvider,
  executor: Executor,
  maxTextChars: number,
  description: string,
): void {
  const registerTool = server.registerTool.bind(server) as (
    toolName: string,
    config: {
      description: string;
      inputSchema: Record<string, z.ZodTypeAny>;
    },
    handler: (args: { code: string }) => Promise<{
      content: Array<{ text: string; type: "text" }>;
      isError: boolean;
      structuredContent: Record<string, unknown>;
    }>,
  ) => void;

  registerTool(
    name,
    {
      description,
      inputSchema: {
        code: z.string(),
      },
    },
    async (args: { code: string }) => {
      const execution = await executor.execute(args.code, [provider]);

      return {
        content: [{ text: renderText(execution, maxTextChars), type: "text" }],
        isError: !execution.ok,
        structuredContent: execution as Record<string, unknown>,
      };
    },
  );
}

function registerSearchTool(
  server: McpServer,
  name: string,
  provider: ResolvedToolProvider,
  maxTextChars: number,
): void {
  const registerTool = server.registerTool.bind(server) as (
    toolName: string,
    config: {
      description: string;
      inputSchema: Record<string, z.ZodTypeAny>;
    },
    handler: (args: { limit?: number; query?: string }) => Promise<{
      content: Array<{ text: string; type: "text" }>;
      structuredContent: Record<string, unknown>;
    }>,
  ) => void;

  registerTool(
    name,
    {
      description: `Search wrapped MCP tools exposed under the ${provider.name} namespace.`,
      inputSchema: {
        limit: z.number().int().optional(),
        query: z.string().optional(),
      },
    },
    async (args: { limit?: number; query?: string }) => {
      const structuredContent = searchTools(provider, args.query, args.limit ?? 20);
      return {
        content: [
          { text: renderText(structuredContent, maxTextChars), type: "text" },
        ],
        structuredContent,
      };
    },
  );
}

function attachOwnedClose(
  server: McpServer,
  closeOwnedResources: () => Promise<void>,
): McpServer {
  const originalClose = server.close.bind(server);
  let closePromise: Promise<void> | undefined;

  server.close = async () => {
    closePromise ??= (async () => {
      const results = await Promise.allSettled([
        originalClose(),
        closeOwnedResources(),
      ]);
      const rejected = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );

      if (rejected) {
        throw rejected.reason;
      }
    })();

    return closePromise;
  };

  return server;
}

/**
 * Creates an MCP server that exposes code-execution tools for a wrapped MCP source.
 */
export async function codeMcpServer(
  source: McpToolSource,
  options: CodeMcpServerOptions,
): Promise<McpServer> {
  const maxTextChars = options.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS;
  const mode = options.mode ?? "both";
  const names = {
    execute: options.names?.execute ?? "mcp_execute_code",
    search: options.names?.search ?? "mcp_search_tools",
    single: options.names?.single ?? "mcp_code",
  };
  const handle = await openMcpToolProvider(source, {
    clientInfo: options.clientInfo,
    namespace: options.namespace ?? "mcp",
  });
  const provider = handle.provider;
  const server = new McpServer(
    options.serverInfo ??
      handle.serverInfo ??
      DEFAULT_MCP_CODE_WRAPPER_SERVER_INFO,
  );

  try {
    if (mode === "both" || mode === "split") {
      registerSearchTool(server, names.search, provider, maxTextChars);
      registerExecuteTool(
        server,
        names.execute,
        provider,
        options.executor,
        maxTextChars,
        `Execute JavaScript against the wrapped ${provider.name} MCP tool namespace.`,
      );
    }

    if (mode === "both" || mode === "single") {
      registerExecuteTool(
        server,
        names.single,
        provider,
        options.executor,
        maxTextChars,
        `Execute JavaScript against the wrapped ${provider.name} MCP tool namespace.\n\n${provider.types}`,
      );
    }

    return attachOwnedClose(server, handle.close);
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
}
