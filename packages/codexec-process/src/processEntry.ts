import { randomUUID } from "node:crypto";

import type {
  DispatcherMessage,
  ExecuteMessage,
  RunnerMessage,
  ToolCallResult,
} from "@mcploom/codexec-protocol";
import type { runQuickJsSession as runQuickJsSessionType } from "@mcploom/codexec-quickjs/runner";

if (typeof process.send !== "function") {
  throw new Error("ProcessExecutor requires a child process IPC channel");
}

type QuickJsRunnerModule = {
  runQuickJsSession: typeof runQuickJsSessionType;
};

async function loadQuickJsRunner(): Promise<QuickJsRunnerModule> {
  if (import.meta.url.endsWith(".ts")) {
    return (await import(
      new URL("../../codexec-quickjs/src/runner/index.ts", import.meta.url).href
    )) as QuickJsRunnerModule;
  }

  return (await import("@mcploom/codexec-quickjs/runner")) as QuickJsRunnerModule;
}

let quickJsRunnerPromise: Promise<QuickJsRunnerModule> | undefined;

function getQuickJsRunner(): Promise<QuickJsRunnerModule> {
  quickJsRunnerPromise ??= loadQuickJsRunner();
  return quickJsRunnerPromise;
}

function sendMessage(message: RunnerMessage): void {
  process.send?.(message);
}

const pendingToolCalls = new Map<string, (result: ToolCallResult) => void>();
let activeAbortController: AbortController | undefined;
let activeExecutionId: string | undefined;

async function startExecution(message: ExecuteMessage): Promise<void> {
  if (activeExecutionId) {
    sendMessage({
      durationMs: 0,
      error: {
        code: "internal_error",
        message: "Process already has an active execution",
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
    const { runQuickJsSession } = await getQuickJsRunner();
    const result = await runQuickJsSession(
      {
        abortController,
        code: message.code,
        onStarted: () => {
          sendMessage({
            id: message.id,
            type: "started",
          });
        },
        onToolCall: (call) =>
          new Promise<ToolCallResult>((resolve) => {
            const callId = randomUUID();
            pendingToolCalls.set(callId, resolve);
            sendMessage({
              ...call,
              callId,
              type: "tool_call",
            });
          }),
        providers: message.providers,
      },
      message.options,
    );

    sendMessage({
      ...result,
      id: message.id,
      type: "done",
    });
  } catch (error) {
    sendMessage({
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

process.on("message", (message: DispatcherMessage) => {
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
