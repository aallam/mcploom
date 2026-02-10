import { describe, it, expect } from "vitest";

import { Router } from "../src/router.js";

describe("Router", () => {
  it("matches exact tool names", () => {
    const router = new Router([{ pattern: "search", server: "algolia" }]);
    expect(router.resolve("search")).toBe("algolia");
    expect(router.resolve("other")).toBeUndefined();
  });

  it("matches wildcard prefix patterns", () => {
    const router = new Router([
      { pattern: "algolia_*", server: "algolia" },
      { pattern: "github_*", server: "github" },
    ]);
    expect(router.resolve("algolia_search")).toBe("algolia");
    expect(router.resolve("algolia_browse")).toBe("algolia");
    expect(router.resolve("github_issues")).toBe("github");
    expect(router.resolve("unknown_tool")).toBeUndefined();
  });

  it("matches wildcard suffix patterns", () => {
    const router = new Router([{ pattern: "*_search", server: "search" }]);
    expect(router.resolve("algolia_search")).toBe("search");
    expect(router.resolve("google_search")).toBe("search");
    expect(router.resolve("search")).toBeUndefined();
  });

  it("matches catch-all pattern", () => {
    const router = new Router([
      { pattern: "algolia_*", server: "algolia" },
      { pattern: "*", server: "default" },
    ]);
    expect(router.resolve("algolia_search")).toBe("algolia");
    expect(router.resolve("anything")).toBe("default");
  });

  it("first match wins", () => {
    const router = new Router([
      { pattern: "*", server: "first" },
      { pattern: "specific", server: "second" },
    ]);
    expect(router.resolve("specific")).toBe("first");
  });

  it("returns undefined for no rules", () => {
    const router = new Router([]);
    expect(router.resolve("anything")).toBeUndefined();
  });

  it("matches single-char wildcard", () => {
    const router = new Router([{ pattern: "tool_?", server: "backend" }]);
    expect(router.resolve("tool_a")).toBe("backend");
    expect(router.resolve("tool_1")).toBe("backend");
    expect(router.resolve("tool_ab")).toBeUndefined();
  });
});
