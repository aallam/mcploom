/**
 * Analytics: Track Handlers
 *
 * Demonstrates wrapping plain async functions with analytics.track(),
 * using the console exporter, and inspecting stats snapshots.
 * No MCP server or network — simplest possible example.
 */
import { McpAnalytics } from "@gomcp/analytics";

const analytics = new McpAnalytics({
  exporter: "console",
  metadata: { service: "example", env: "dev" },
});

async function search(query: string): Promise<string> {
  await new Promise((r) => setTimeout(r, Math.random() * 50));
  return `Results for "${query}"`;
}

async function translate(text: string, lang: string): Promise<string> {
  await new Promise((r) => setTimeout(r, Math.random() * 30));
  if (lang === "invalid") throw new Error("Unsupported language");
  return `[${lang}] ${text}`;
}

const trackedSearch = analytics.track(search, "search");
const trackedTranslate = analytics.track(translate, "translate");

async function main() {
  console.log("=== Analytics: Track Handlers ===\n");

  // 10 searches
  for (let i = 0; i < 10; i++) {
    await trackedSearch(`query-${i}`);
  }

  // 5 translates
  for (let i = 0; i < 5; i++) {
    await trackedTranslate(`hello ${i}`, "es");
  }

  // 1 deliberate error
  try {
    await trackedTranslate("hello", "invalid");
  } catch {
    // expected
  }

  await analytics.flush();

  const stats = analytics.getStats();
  console.log("\n=== Stats Snapshot ===");
  console.log(`Total calls: ${stats.totalCalls}`);
  console.log(`Total errors: ${stats.totalErrors}`);
  console.log(`Error rate: ${(stats.errorRate * 100).toFixed(1)}%`);

  for (const [tool, ts] of Object.entries(stats.tools)) {
    console.log(`\n  ${tool}:`);
    console.log(`    count=${ts.count}, errors=${ts.errorCount}`);
    console.log(
      `    p50=${ts.p50Ms.toFixed(1)}ms, p95=${ts.p95Ms.toFixed(1)}ms, p99=${ts.p99Ms.toFixed(1)}ms`,
    );
  }

  await analytics.shutdown();
  console.log("\nDone.");
}

main();
