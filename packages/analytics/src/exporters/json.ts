import { appendFile } from "node:fs/promises";

import type { JsonConfig, ToolCallEvent } from "../types.js";

/**
 * JSON exporter: appends events as JSONL (one JSON object per line) to a file.
 */
export function createJsonExporter(
  config: JsonConfig,
): (events: ToolCallEvent[]) => Promise<void> {
  return async (events) => {
    if (events.length === 0) return;
    const lines = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await appendFile(config.path, lines, "utf-8");
  };
}
