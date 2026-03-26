import { describe, expect, it } from "vitest";

describe("@mcploom/codexec-worker package surface", () => {
  it("exports WorkerExecutor from the dedicated worker package", async () => {
    const worker = await import("@mcploom/codexec-worker");

    expect(worker).toHaveProperty("WorkerExecutor");
  });
});
