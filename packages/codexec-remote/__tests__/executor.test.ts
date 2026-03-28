import { attachQuickJsProtocolEndpoint } from "@mcploom/codexec-quickjs/runner/protocol-endpoint";
import type {
  DispatcherMessage,
  HostTransport,
  RunnerMessage,
  TransportCloseReason,
} from "@mcploom/codexec-protocol";

import { runExecutorContractSuite } from "../../codexec/test-support/runExecutorContractSuite";
import { RemoteExecutor } from "../src/index";

type CloseHandler = (reason?: TransportCloseReason) => void;
type ErrorHandler = (error: Error) => void;
type MessageHandler = (message: RunnerMessage) => void;
type RunnerMessageHandler = (message: DispatcherMessage) => void;

function createRemoteTransport(): HostTransport {
  const closeHandlers = new Set<CloseHandler>();
  const errorHandlers = new Set<ErrorHandler>();
  const messageHandlers = new Set<MessageHandler>();
  const runnerHandlers = new Set<RunnerMessageHandler>();
  let closed = false;

  const emitClose = (reason?: TransportCloseReason) => {
    closed = true;
    for (const handler of closeHandlers) {
      handler(reason);
    }
  };

  attachQuickJsProtocolEndpoint({
    onMessage(handler) {
      runnerHandlers.add(handler);
      return () => runnerHandlers.delete(handler);
    },
    send(message) {
      queueMicrotask(() => {
        for (const handler of messageHandlers) {
          handler(message);
        }
      });
    },
  });

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

runExecutorContractSuite("RemoteExecutor", (options) => {
  return new RemoteExecutor({
    ...options,
    connectTransport: () => createRemoteTransport(),
  });
});
