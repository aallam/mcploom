import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Configuration for a remote MCP backend (Streamable HTTP).
 */
export interface HttpBackendConfig {
  url: string;
  headers?: Record<string, string>;
}

/**
 * Configuration for a local MCP backend (stdio subprocess).
 */
export interface StdioBackendConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * A backend server configuration — either HTTP or stdio.
 */
export type BackendConfig = HttpBackendConfig | StdioBackendConfig;

/**
 * A routing rule that maps tool name patterns to backend servers.
 */
export interface RoutingRule {
  /** Glob pattern for tool names (e.g., "algolia_*", "*_search", "*") */
  pattern: string;
  /** Name of the backend server to route to */
  server: string;
}

/**
 * Middleware function for the proxy pipeline.
 */
export type ProxyMiddleware = (
  ctx: MiddlewareContext,
  next: () => Promise<MiddlewareResult>,
) => Promise<MiddlewareResult>;

/**
 * Context passed to proxy middleware.
 */
export interface MiddlewareContext {
  toolName: string;
  arguments: Record<string, unknown>;
  server: string;
}

/**
 * Result from a middleware/tool execution.
 */
export interface MiddlewareResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

/**
 * Configuration for McpProxy.
 */
export interface ProxyConfig {
  /** Named backend servers */
  servers: Record<string, BackendConfig>;
  /** Routing rules (first match wins) */
  routing: RoutingRule[];
  /** Optional middleware chain */
  middleware?: ProxyMiddleware[];
  /** Server name exposed to MCP clients */
  name?: string;
  /** Server version exposed to MCP clients */
  version?: string;
}

/**
 * Runtime information about a connected backend.
 */
export interface BackendInfo {
  name: string;
  config: BackendConfig;
  tools: ToolInfo[];
  connected: boolean;
}

/**
 * Information about a tool from a backend.
 */
export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  backend: string;
}

export function isHttpConfig(config: BackendConfig): config is HttpBackendConfig {
  return "url" in config;
}

export function isStdioConfig(config: BackendConfig): config is StdioBackendConfig {
  return "command" in config;
}
