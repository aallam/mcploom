import { describe, expect, it } from "vitest";

describe("@mcploom/codexec-isolated-vm package surface", () => {
  it("exports IsolatedVmExecutor from the dedicated executor package", async () => {
    const isolatedVm = await import("@mcploom/codexec-isolated-vm");

    expect(isolatedVm).toHaveProperty("IsolatedVmExecutor");
  });

  it("exports the reusable runner from the dedicated subpath", async () => {
    const runner = await import("@mcploom/codexec-isolated-vm/runner");

    expect(runner).toHaveProperty("runIsolatedVmSession");
  });
});
