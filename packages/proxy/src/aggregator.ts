import type { ToolInfo } from "./types.js";

/**
 * Merges tool lists from multiple backends.
 * If tool names conflict across backends, the first one wins
 * (based on the order backends are provided).
 */
export function aggregateTools(
  toolsByBackend: Map<string, ToolInfo[]>,
): ToolInfo[] {
  const seen = new Set<string>();
  const result: ToolInfo[] = [];

  for (const [, tools] of toolsByBackend) {
    for (const tool of tools) {
      if (!seen.has(tool.name)) {
        seen.add(tool.name);
        result.push(tool);
      }
    }
  }

  return result;
}
