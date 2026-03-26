import {
  createToolCallDispatcher,
  extractProviderManifests,
  getExecutionTimeoutMessage,
  type ExecuteResult,
  type ExecutorRuntimeOptions,
  type ResolvedToolProvider,
} from "@mcploom/codexec";

import type { DispatcherMessage, RunnerMessage, ToolCallMessage } from "./messages";

const DEFAULT_CANCEL_GRACE_MS = 25;
const HOST_TIMEOUT_BACKSTOP_MS = 100;

export interface TransportCloseReason {
  code?: number | null;
  message: string;
  signal?: NodeJS.Signals | null;
}

export interface HostTransport {
  dispose(): Promise<void> | void;
  onClose(handler: (reason?: TransportCloseReason) => void): () => void;
  onError(handler: (error: Error) => void): () => void;
  onMessage(handler: (message: RunnerMessage) => void): () => void;
  send(message: DispatcherMessage): Promise<void> | void;
  terminate(): Promise<void> | void;
}

export interface HostTransportSessionOptions {
  cancelGraceMs?: number;
  code: string;
  executionId: string;
  providers: ResolvedToolProvider[];
  runtimeOptions: Required<ExecutorRuntimeOptions>;
  transport: HostTransport;
}

function toFailureResult(
  startedAt: number,
  timeoutTriggered: boolean,
  message: string,
): ExecuteResult {
  return {
    durationMs: Date.now() - startedAt,
    error: {
      code: timeoutTriggered ? "timeout" : "internal_error",
      message: timeoutTriggered ? getExecutionTimeoutMessage() : message,
    },
    logs: [],
    ok: false,
  };
}

export async function runHostTransportSession(
  options: HostTransportSessionOptions,
): Promise<ExecuteResult> {
  const startedAt = Date.now();
  const abortController = new AbortController();
  const dispatchToolCall = createToolCallDispatcher(
    options.providers,
    abortController.signal,
  );

  return await new Promise<ExecuteResult>((resolve) => {
    let finished = false;
    let timeoutTriggered = false;
    let forceTerminateTimer: NodeJS.Timeout | undefined;
    let timeoutTimer: NodeJS.Timeout | undefined;

    const cancelGraceMs = options.cancelGraceMs ?? DEFAULT_CANCEL_GRACE_MS;

    const cleanup = () => {
      finished = true;
      abortController.abort();
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      if (forceTerminateTimer) {
        clearTimeout(forceTerminateTimer);
      }
      offClose();
      offError();
      offMessage();
    };

    const finish = (result: ExecuteResult) => {
      if (finished) {
        return;
      }

      cleanup();
      void Promise.resolve(options.transport.dispose()).catch(() => {});
      resolve(result);
    };

    const fail = (message: string) => {
      finish(toFailureResult(startedAt, timeoutTriggered, message));
    };

    const send = (message: DispatcherMessage) => {
      if (finished) {
        return;
      }

      try {
        const pendingSend = options.transport.send(message);
        void Promise.resolve(pendingSend).catch((error) => {
          if (finished) {
            return;
          }

          fail(error instanceof Error ? error.message : String(error));
        });
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    };

    const onMessage = (message: RunnerMessage) => {
      if (finished) {
        return;
      }

      if ("id" in message && message.id !== options.executionId) {
        return;
      }

      if (message.type === "started") {
        return;
      }

      if (message.type === "tool_call") {
        void dispatchToolCall(message as ToolCallMessage)
          .then((result) => {
            send({
              ...result,
              callId: message.callId,
              type: "tool_result",
            });
          })
          .catch((error) => {
            send({
              callId: message.callId,
              error: {
                code: "internal_error",
                message: error instanceof Error ? error.message : String(error),
              },
              ok: false,
              type: "tool_result",
            });
          });
        return;
      }

      const { id: _id, type: _type, ...result } = message;
      finish(result);
    };

    const onError = (error: Error) => {
      fail(error.message);
    };

    const onClose = (reason?: TransportCloseReason) => {
      fail(reason?.message ?? "Transport closed unexpectedly");
    };

    const offMessage = options.transport.onMessage(onMessage);
    const offError = options.transport.onError(onError);
    const offClose = options.transport.onClose(onClose);

    timeoutTimer = setTimeout(() => {
      if (finished) {
        return;
      }

      timeoutTriggered = true;
      abortController.abort();
      send({
        id: options.executionId,
        type: "cancel",
      });
      forceTerminateTimer = setTimeout(() => {
        if (finished) {
          return;
        }

        void Promise.resolve(options.transport.terminate())
          .catch(() => {})
          .finally(() => {
            if (finished) {
              return;
            }

            finish(
              toFailureResult(
                startedAt,
                true,
                getExecutionTimeoutMessage(),
              ),
            );
          });
      }, cancelGraceMs);
    }, options.runtimeOptions.timeoutMs + HOST_TIMEOUT_BACKSTOP_MS);

    send({
      code: options.code,
      id: options.executionId,
      options: options.runtimeOptions,
      providers: extractProviderManifests(options.providers),
      type: "execute",
    });
  });
}
