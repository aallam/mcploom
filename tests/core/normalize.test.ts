import { describe, expect, it } from "vitest";
import { normalizeCode } from "@mcploom/codexec";

describe("normalizeCode", () => {
  it("strips fenced code blocks before wrapping", () => {
    expect(normalizeCode("```js\n1 + 1\n```")).toContain("return (1 + 1)");
  });

  it("wraps bare expressions in an async executable function", () => {
    expect(normalizeCode("1 + 1")).toContain("return (1 + 1)");
  });

  it("returns existing async arrows unchanged", () => {
    expect(normalizeCode("async () => 1")).toBe("async () => 1");
  });

  it("wraps statements and returns the last expression", () => {
    const normalized = normalizeCode("const x = 1;\nx + 1");
    expect(normalized).toContain("const x = 1;");
    expect(normalized).toContain("return (x + 1)");
  });

  it("wraps named function declarations and invokes them", () => {
    const normalized = normalizeCode("function run() { return 1; }");
    expect(normalized).toContain("function run() { return 1; }");
    expect(normalized).toContain("return run();");
  });
});
