import { describe, expect, it } from "vitest";

describe("@mcploom/codexec-quickjs runner surface", () => {
  it("exports runQuickJsSession for transport-backed runtimes", async () => {
    const runner = await import("../src/runner/index.ts");

    expect(runner).toHaveProperty("runQuickJsSession");
  });
});
