import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveProvider } from "@mcploom/codexec";

import type { DispatcherMessage, RunnerMessage } from "../src/messages";
import {
  runHostTransportSession,
  type HostTransport,
  type TransportCloseReason,
} from "../src/index";

const runtimeOptions = {
  maxLogChars: 64_000,
  maxLogLines: 100,
  memoryLimitBytes: 64 * 1024 * 1024,
  timeoutMs: 10,
};

class FakeTransport extends EventEmitter implements HostTransport {
  readonly dispose = vi.fn(async () => {});
  readonly send = vi.fn(async (message: DispatcherMessage) => {
    this.sent.push(message);
  });
  readonly terminate = vi.fn(async () => {});

  readonly sent: DispatcherMessage[] = [];

  onClose(
    handler: (reason?: TransportCloseReason) => void,
  ): () => void {
    this.on("close", handler);
    return () => this.off("close", handler);
  }

  onError(handler: (error: Error) => void): () => void {
    this.on("error", handler);
    return () => this.off("error", handler);
  }

  onMessage(handler: (message: RunnerMessage) => void): () => void {
    this.on("message", handler);
    return () => this.off("message", handler);
  }

  emitClose(reason?: TransportCloseReason): void {
    this.emit("close", reason);
  }

  emitMessage(message: RunnerMessage): void {
    this.emit("message", message);
  }
}

describe("runHostTransportSession", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("routes tool calls to host providers and returns the runner result", async () => {
    const transport = new FakeTransport();
    const provider = resolveProvider({
      name: "mcp",
      tools: {
        add: {
          execute: async (input) => {
            const payload = input as { x: number };
            return { sum: payload.x + 2 };
          },
        },
      },
    });

    transport.send.mockImplementation(async (message: DispatcherMessage) => {
      transport.sent.push(message);

      if (message.type === "execute") {
        queueMicrotask(() => {
          transport.emitMessage({
            id: message.id,
            type: "started",
          });
          transport.emitMessage({
            callId: "call-1",
            input: { x: 2 },
            providerName: "mcp",
            safeToolName: "add",
            type: "tool_call",
          });
        });
      }

      if (message.type === "tool_result") {
        queueMicrotask(() => {
          transport.emitMessage({
            durationMs: 12,
            id: "exec-1",
            logs: [],
            ok: true,
            result: (message.ok ? message.result : null) as { sum: number },
            type: "done",
          });
        });
      }
    });

    const result = await runHostTransportSession({
      cancelGraceMs: 0,
      code: "(await mcp.add({ x: 2 })).sum",
      executionId: "exec-1",
      providers: [provider],
      runtimeOptions,
      transport,
    });

    expect(result).toMatchObject({
      ok: true,
      result: {
        sum: 4,
      },
    });
    expect(transport.sent.map((message) => message.type)).toEqual([
      "execute",
      "tool_result",
    ]);
  });

  it("times out even when the transport never reaches started", async () => {
    vi.useFakeTimers();
    const transport = new FakeTransport();

    const resultPromise = runHostTransportSession({
      cancelGraceMs: 0,
      code: "1 + 1",
      executionId: "exec-timeout",
      providers: [],
      runtimeOptions,
      transport,
    });

    await vi.advanceTimersByTimeAsync(200);

    await expect(resultPromise).resolves.toMatchObject({
      error: {
        code: "timeout",
      },
      ok: false,
    });
    expect(transport.sent.map((message) => message.type)).toEqual([
      "execute",
      "cancel",
    ]);
    expect(transport.terminate).toHaveBeenCalledTimes(1);
  });

  it("keeps timeout as the final result when the transport closes afterwards", async () => {
    vi.useFakeTimers();
    const transport = new FakeTransport();

    transport.terminate.mockImplementation(async () => {
      transport.emitClose({
        code: 23,
        message: "Transport closed after timeout",
      });
    });

    const resultPromise = runHostTransportSession({
      cancelGraceMs: 0,
      code: "1 + 1",
      executionId: "exec-close-timeout",
      providers: [],
      runtimeOptions,
      transport,
    });

    await vi.advanceTimersByTimeAsync(200);

    await expect(resultPromise).resolves.toMatchObject({
      error: {
        code: "timeout",
      },
      ok: false,
    });
  });
});
