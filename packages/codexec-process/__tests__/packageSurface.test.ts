import { describe, expect, it } from "vitest";

describe("@mcploom/codexec-process package surface", () => {
  it("exports ProcessExecutor from the dedicated process package", async () => {
    const processExecutor = await import("@mcploom/codexec-process");

    expect(processExecutor).toHaveProperty("ProcessExecutor");
  });
});
