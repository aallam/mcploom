import { describe, expect, it } from "vitest";
import type {
  DispatcherMessage,
  ExecuteMessage,
  RunnerMessage,
  TransportCloseReason,
} from "@mcploom/codexec-protocol";

import { attachQuickJsRemoteEndpoint } from "../src/index";

type MessageHandler = (message: DispatcherMessage) => void;
type CloseHandler = (reason?: TransportCloseReason) => void;

async function waitFor(predicate: () => boolean, timeoutMs = 250): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Timed out waiting for runner endpoint state");
}

function createPort() {
  const sent: RunnerMessage[] = [];
  const messageHandlers = new Set<MessageHandler>();
  const closeHandlers = new Set<CloseHandler>();

  return {
    port: {
      onClose(handler: CloseHandler) {
        closeHandlers.add(handler);
        return () => closeHandlers.delete(handler);
      },
      onMessage(handler: MessageHandler) {
        messageHandlers.add(handler);
        return () => messageHandlers.delete(handler);
      },
      send(message: RunnerMessage) {
        sent.push(message);
      },
    },
    emitClose(reason?: TransportCloseReason) {
      for (const handler of closeHandlers) {
        handler(reason);
      }
    },
    emitMessage(message: ExecuteMessage) {
      for (const handler of messageHandlers) {
        handler(message);
      }
    },
    sent,
  };
}

describe("attachQuickJsRemoteEndpoint", () => {
  it("detaches itself when the transport closes", async () => {
    const { emitClose, emitMessage, port, sent } = createPort();
    attachQuickJsRemoteEndpoint(port);

    emitMessage({
      code: "await tools.hang({})",
      id: "first",
      options: {
        maxLogChars: 64_000,
        maxLogLines: 100,
        memoryLimitBytes: 64 * 1024 * 1024,
        timeoutMs: 1_000,
      },
      providers: [
        {
          name: "tools",
          tools: {
            hang: {
              originalName: "hang",
              safeName: "hang",
            },
          },
          types: "declare namespace tools {}",
        },
      ],
      type: "execute",
    });
    await waitFor(() => sent.length >= 2);

    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "first", type: "started" }),
        expect.objectContaining({
          providerName: "tools",
          safeToolName: "hang",
          type: "tool_call",
        }),
      ]),
    );

    sent.length = 0;
    emitClose({ message: "socket closed" });
    emitMessage({
      code: "1 + 1",
      id: "second",
      options: {
        maxLogChars: 64_000,
        maxLogLines: 100,
        memoryLimitBytes: 64 * 1024 * 1024,
        timeoutMs: 1_000,
      },
      providers: [],
      type: "execute",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sent).toEqual([]);
  });
});
