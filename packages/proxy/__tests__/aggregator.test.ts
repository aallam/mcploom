import { describe, it, expect } from "vitest";

import { aggregateTools } from "../src/aggregator.js";
import type { ToolInfo } from "../src/types.js";

function makeTool(name: string, backend: string): ToolInfo {
  return {
    name,
    description: `${name} from ${backend}`,
    inputSchema: { type: "object" },
    backend,
  };
}

describe("aggregateTools", () => {
  it("merges tools from multiple backends", () => {
    const map = new Map<string, ToolInfo[]>();
    map.set("algolia", [makeTool("search", "algolia"), makeTool("browse", "algolia")]);
    map.set("github", [makeTool("issues", "github")]);

    const result = aggregateTools(map);
    expect(result).toHaveLength(3);
    expect(result.map((t) => t.name)).toEqual(["search", "browse", "issues"]);
  });

  it("deduplicates by name (first wins)", () => {
    const map = new Map<string, ToolInfo[]>();
    map.set("a", [makeTool("search", "a")]);
    map.set("b", [makeTool("search", "b"), makeTool("other", "b")]);

    const result = aggregateTools(map);
    expect(result).toHaveLength(2);
    expect(result.find((t) => t.name === "search")!.backend).toBe("a");
  });

  it("returns empty for no backends", () => {
    expect(aggregateTools(new Map())).toEqual([]);
  });
});
