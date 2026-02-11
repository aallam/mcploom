/**
 * Analytics: Custom Exporter + Sampling
 *
 * Demonstrates a custom async exporter function, 50% sampling,
 * and the reset() method.
 */
import { McpAnalytics, type ToolCallEvent } from "@gomcp/analytics";

const collected: ToolCallEvent[] = [];

const analytics = new McpAnalytics({
  exporter: async (events: ToolCallEvent[]) => {
    collected.push(...events);
    console.log(`  [exporter] received ${events.length} event(s)`);
  },
  sampleRate: 0.5,
});

async function processItem(id: number): Promise<string> {
  await new Promise((r) => setTimeout(r, Math.random() * 10));
  return `processed-${id}`;
}

const trackedProcess = analytics.track(processItem, "process_item");

async function main() {
  console.log("=== Analytics: Custom Exporter + Sampling ===\n");
  console.log("Sample rate: 0.5 (expect ~50% of calls to be recorded)\n");

  for (let i = 0; i < 20; i++) {
    await trackedProcess(i);
  }

  await analytics.flush();

  console.log(`\nTotal calls made: 20`);
  console.log(
    `Events recorded: ${collected.length} (~${((collected.length / 20) * 100).toFixed(0)}%)`,
  );

  const stats = analytics.getStats();
  console.log(`Stats total calls: ${stats.totalCalls}`);

  // Reset all stats
  analytics.reset();
  const afterReset = analytics.getStats();
  console.log(
    `\nAfter reset — total: ${afterReset.totalCalls}, tools: ${Object.keys(afterReset.tools).length}`,
  );

  await analytics.shutdown();
  console.log("Done.");
}

main();
