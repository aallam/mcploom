import { describe, expect, it } from "vitest";

describe("@mcploom/codexec-quickjs package surface", () => {
  it("exports QuickJsExecutor from the dedicated executor package", async () => {
    const quickjs = await import("@mcploom/codexec-quickjs");

    expect(quickjs).toHaveProperty("QuickJsExecutor");
  });
});
