import { randomUUID } from "node:crypto";

import type {
  DispatcherMessage,
  ExecuteMessage,
  RunnerMessage,
  ToolCallResult,
} from "@mcploom/codexec-protocol";

import { runQuickJsSession } from "./index.ts";

export interface QuickJsProtocolPort {
  onMessage(handler: (message: DispatcherMessage) => void): void | (() => void);
  send(message: RunnerMessage): void;
}

export function attachQuickJsProtocolEndpoint(
  port: QuickJsProtocolPort,
): () => void {
  const pendingToolCalls = new Map<string, (result: ToolCallResult) => void>();
  let activeAbortController: AbortController | undefined;
  let activeExecutionId: string | undefined;

  async function startExecution(message: ExecuteMessage): Promise<void> {
    if (activeExecutionId) {
      port.send({
        durationMs: 0,
        error: {
          code: "internal_error",
          message: "QuickJS endpoint already has an active execution",
        },
        id: message.id,
        logs: [],
        ok: false,
        type: "done",
      });
      return;
    }

    const abortController = new AbortController();
    activeAbortController = abortController;
    activeExecutionId = message.id;

    try {
      const result = await runQuickJsSession(
        {
          abortController,
          code: message.code,
          onStarted: () => {
            port.send({
              id: message.id,
              type: "started",
            });
          },
          onToolCall: (call) =>
            new Promise<ToolCallResult>((resolve) => {
              const callId = randomUUID();
              pendingToolCalls.set(callId, resolve);
              port.send({
                ...call,
                callId,
                type: "tool_call",
              });
            }),
          providers: message.providers,
        },
        message.options,
      );

      port.send({
        ...result,
        id: message.id,
        type: "done",
      });
    } catch (error) {
      port.send({
        durationMs: 0,
        error: {
          code: "internal_error",
          message: error instanceof Error ? error.message : String(error),
        },
        id: message.id,
        logs: [],
        ok: false,
        type: "done",
      });
    } finally {
      pendingToolCalls.clear();
      activeAbortController = undefined;
      activeExecutionId = undefined;
    }
  }

  const maybeDetach = port.onMessage((message: DispatcherMessage) => {
    switch (message.type) {
      case "cancel":
        if (message.id === activeExecutionId) {
          activeAbortController?.abort();
        }
        break;
      case "execute":
        void startExecution(message);
        break;
      case "tool_result": {
        const resolve = pendingToolCalls.get(message.callId);
        pendingToolCalls.delete(message.callId);
        resolve?.(message);
        break;
      }
    }
  });

  return () => {
    if (typeof maybeDetach === "function") {
      maybeDetach();
    }
    pendingToolCalls.clear();
    activeAbortController?.abort();
    activeAbortController = undefined;
    activeExecutionId = undefined;
  };
}
