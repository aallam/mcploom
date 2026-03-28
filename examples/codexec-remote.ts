import { resolveProvider } from "@mcploom/codexec";
import { RemoteExecutor, attachQuickJsRemoteEndpoint } from "@mcploom/codexec-remote";
import type {
  DispatcherMessage,
  HostTransport,
  RunnerMessage,
  TransportCloseReason,
} from "@mcploom/codexec-protocol";

type CloseHandler = (reason?: TransportCloseReason) => void;
type ErrorHandler = (error: Error) => void;
type MessageHandler = (message: RunnerMessage) => void;
type RunnerMessageHandler = (message: DispatcherMessage) => void;

function createInMemoryRemoteTransport(): HostTransport {
  const closeHandlers = new Set<CloseHandler>();
  const errorHandlers = new Set<ErrorHandler>();
  const messageHandlers = new Set<MessageHandler>();
  const runnerHandlers = new Set<RunnerMessageHandler>();
  let closed = false;

  attachQuickJsRemoteEndpoint({
    onClose(handler) {
      closeHandlers.add(handler);
      return () => closeHandlers.delete(handler);
    },
    onMessage(handler) {
      runnerHandlers.add(handler as RunnerMessageHandler);
      return () => runnerHandlers.delete(handler as RunnerMessageHandler);
    },
    send(message) {
      queueMicrotask(() => {
        for (const handler of messageHandlers) {
          handler(message as RunnerMessage);
        }
      });
    },
  });

  const emitClose = (reason?: TransportCloseReason) => {
    closed = true;
    for (const handler of closeHandlers) {
      handler(reason);
    }
  };

  return {
    dispose() {
      closed = true;
    },
    onClose(handler) {
      closeHandlers.add(handler);
      return () => closeHandlers.delete(handler);
    },
    onError(handler) {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    },
    onMessage(handler) {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },
    send(message) {
      if (closed) {
        for (const handler of errorHandlers) {
          handler(new Error("Remote transport closed"));
        }
        return;
      }

      queueMicrotask(() => {
        for (const handler of runnerHandlers) {
          handler(message);
        }
      });
    },
    terminate() {
      emitClose({ message: "Remote transport terminated" });
    },
  };
}

async function main(): Promise<void> {
  const provider = resolveProvider({
    name: "tools",
    tools: {
      echo: {
        execute: async (input) => input,
      },
    },
  });

  const executor = new RemoteExecutor({
    connectTransport: () => createInMemoryRemoteTransport(),
    timeoutMs: 1_000,
  });

  const result = await executor.execute(
    "await tools.echo({ ok: true, via: 'remote' })",
    [provider],
    { timeoutMs: 250 },
  );

  console.log("codexec remote example result");
  console.log(JSON.stringify(result, null, 2));
}

void main();
