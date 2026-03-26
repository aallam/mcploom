import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

class FakeWorker extends EventEmitter {
  readonly terminate = vi.fn(async () => 0);
}

const state = vi.hoisted(() => ({
  options: undefined as Record<string, unknown> | undefined,
  worker: undefined as FakeWorker | undefined,
}));

vi.mock("node:worker_threads", () => ({
  Worker: vi.fn((_filename: unknown, options?: Record<string, unknown>) => {
    const worker = new FakeWorker();
    state.options = options;
    state.worker = worker;
    queueMicrotask(() => {
      worker.emit("exit", 17);
    });
    return worker;
  }),
}));

describe("WorkerExecutor lifecycle", () => {
  beforeEach(() => {
    state.options = undefined;
    state.worker = undefined;
  });

  it("uses explicit source bootstrap conditions in repo source mode", async () => {
    const { WorkerExecutor } = await import("../src/index");
    const executor = new WorkerExecutor();

    await executor.execute("1 + 1", []);

    expect(state.options).toMatchObject({
      execArgv: expect.arrayContaining(["--conditions=source", "--import", "tsx"]),
    });
  });
});
