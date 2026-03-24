import type { ResolvedToolProvider } from "../types";
import { schemaToType } from "../typegen/jsonSchema";
import {
  renderDocComment,
  renderNamespaceDeclaration,
} from "../typegen/render";

const MCP_CALL_TOOL_RESULT_TYPE = [
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

/**
 * Generates the wrapped MCP tool namespace declarations exposed to guest code.
 */
export function generateMcpWrappedToolTypes(
  provider: ResolvedToolProvider,
): string {
  const declarations = [MCP_CALL_TOOL_RESULT_TYPE];

  for (const [safeName, tool] of Object.entries(provider.tools)) {
    const comment = renderDocComment([
      ...(tool.description ? [tool.description, ""] : []),
      "Wrapped MCP tool. Inspect structuredContent first, then fall back to content text items.",
    ]);

    declarations.push(
      [comment, `function ${safeName}(input: ${schemaToType(tool.inputSchema)}): Promise<McpCallToolResult>;`]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return renderNamespaceDeclaration(provider.name, declarations);
}
