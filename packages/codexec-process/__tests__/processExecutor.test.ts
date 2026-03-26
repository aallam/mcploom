import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

class FakeChildProcess extends EventEmitter {
  connected = true;

  kill = vi.fn(() => true);
  send = vi.fn();

  disconnect(): void {
    this.connected = false;
    this.emit("disconnect");
  }
}

const state = vi.hoisted(() => ({
  child: undefined as FakeChildProcess | undefined,
}));

vi.mock("node:child_process", () => ({
  fork: vi.fn(() => {
    const child = new FakeChildProcess();
    state.child = child;
    queueMicrotask(() => {
      child.emit("exit", 17, null);
    });
    return child;
  }),
}));

describe("ProcessExecutor", () => {
  beforeEach(() => {
    state.child = undefined;
  });

  it("returns internal_error when the child exits before sending a result", async () => {
    const { ProcessExecutor } = await import("../src/index");
    const executor = new ProcessExecutor();

    const result = await executor.execute("1 + 1", []);

    expect(result).toMatchObject({
      error: {
        code: "internal_error",
        message: "Child process exited unexpectedly with code 17",
      },
      ok: false,
    });
  });
});
