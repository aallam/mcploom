import { describe, expect, it } from "vitest";

import type {
  DispatcherMessage,
  RunnerMessage,
} from "@mcploom/codexec-protocol";

import { attachQuickJsProtocolEndpoint } from "../src/runner/protocolEndpoint";

const runtimeOptions = {
  maxLogChars: 64_000,
  maxLogLines: 100,
  memoryLimitBytes: 64 * 1024 * 1024,
  timeoutMs: 100,
};

function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) {
        resolve();
        return;
      }

      if (Date.now() > deadline) {
        reject(new Error("Condition not met before timeout"));
        return;
      }

      setTimeout(poll, 0);
    };

    poll();
  });
}

class FakePort {
  readonly sent: RunnerMessage[] = [];
  private handler: ((message: DispatcherMessage) => void) | undefined;

  onMessage(handler: (message: DispatcherMessage) => void): void {
    this.handler = handler;
  }

  send(message: RunnerMessage): void {
    this.sent.push(message);
  }

  dispatch(message: DispatcherMessage): void {
    this.handler?.(message);
  }
}

describe("attachQuickJsProtocolEndpoint", () => {
  it("emits started and done for simple executions", async () => {
    const port = new FakePort();

    attachQuickJsProtocolEndpoint(port);
    port.dispatch({
      code: "1 + 1",
      id: "exec-1",
      options: runtimeOptions,
      providers: [],
      type: "execute",
    });

    await waitForCondition(() =>
      port.sent.some((message) => message.type === "done"),
    );

    expect(port.sent.map((message) => message.type)).toEqual([
      "started",
      "done",
    ]);
    expect(port.sent[1]).toMatchObject({
      ok: true,
      result: 2,
    });
  });

  it("round-trips tool calls through tool_result messages", async () => {
    const port = new FakePort();

    attachQuickJsProtocolEndpoint(port);
    port.dispatch({
      code: "(await mcp.add({ x: 2 })).sum",
      id: "exec-2",
      options: runtimeOptions,
      providers: [
        {
          name: "mcp",
          tools: {
            add: {
              originalName: "add",
              safeName: "add",
            },
          },
          types: "",
        },
      ],
      type: "execute",
    });

    await waitForCondition(() =>
      port.sent.some((message) => message.type === "tool_call"),
    );

    const toolCall = port.sent.find(
      (message) => message.type === "tool_call",
    );
    if (!toolCall || toolCall.type !== "tool_call") {
      throw new Error("Expected tool_call message");
    }

    port.dispatch({
      callId: toolCall.callId,
      ok: true,
      result: { sum: 4 },
      type: "tool_result",
    });

    await waitForCondition(() =>
      port.sent.some(
        (message) => message.type === "done" && message.ok && message.result === 4,
      ),
    );

    expect(port.sent.at(-1)).toMatchObject({
      ok: true,
      result: 4,
      type: "done",
    });
  });
});
