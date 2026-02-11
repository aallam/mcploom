import type { ExporterFn, ToolCallEvent } from "../types.js";

/**
 * Wraps a user-provided export function, catching errors to prevent
 * exporter failures from disrupting the MCP server.
 */
export function createCustomExporter(
  fn: ExporterFn,
): (events: ToolCallEvent[]) => Promise<void> {
  return async (events) => {
    try {
      await fn(events);
    } catch (err) {
      console.error("[McpAnalytics] Custom exporter error:", err);
    }
  };
}
