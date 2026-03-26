import { describe, expect, it } from "vitest";

describe("@mcploom/codexec-protocol package surface", () => {
  it("exports the transport-safe manifest and dispatcher helpers", async () => {
    const protocol = await import("@mcploom/codexec-protocol");

    expect(protocol).toHaveProperty("extractProviderManifests");
    expect(protocol).toHaveProperty("createToolCallDispatcher");
  });
});
