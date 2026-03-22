import { describe, expect, it } from "vitest";
import { sanitizeToolName } from "@mcploom/codexec";

describe("sanitizeToolName", () => {
  it("replaces punctuation and spaces with underscores", () => {
    expect(sanitizeToolName("my-tool.with spaces")).toBe("my_tool_with_spaces");
  });

  it("prefixes names that start with a digit", () => {
    expect(sanitizeToolName("3d.render")).toBe("_3d_render");
  });

  it("rewrites reserved words safely", () => {
    expect(sanitizeToolName("delete")).toBe("delete_");
  });

  it("falls back to an underscore for empty names", () => {
    expect(sanitizeToolName("")).toBe("_");
  });
});
