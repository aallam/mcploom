import { describe, expect, it } from "vitest";

describe("@mcploom/codexec-remote package surface", () => {
  it("exports RemoteExecutor and attachQuickJsRemoteEndpoint", async () => {
    const remote = await import("@mcploom/codexec-remote");

    expect(remote).toHaveProperty("RemoteExecutor");
    expect(remote).toHaveProperty("attachQuickJsRemoteEndpoint");
  });
});
