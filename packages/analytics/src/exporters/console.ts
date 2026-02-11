import type { ToolCallEvent } from "../types.js";

/**
 * Console exporter: pretty-prints each batch of events to stdout.
 */
export function createConsoleExporter(): (events: ToolCallEvent[]) => Promise<void> {
  return async (events) => {
    if (events.length === 0) return;

    const lines: string[] = ["[McpAnalytics] Flushing batch:"];

    for (const e of events) {
      const errorSuffix = e.errorCode ? ` (${e.errorCode})` : "";
      const status = e.success ? "OK" : `ERR${errorSuffix}`;
      const meta = e.sessionId ? ` session=${e.sessionId}` : "";
      lines.push(
        `  ${e.toolName} ${status} ${e.durationMs}ms in=${e.inputSize}B out=${e.outputSize}B${meta}`,
      );
    }

    console.log(lines.join("\n"));
  };
}
