import { attachQuickJsProtocolEndpoint } from "@mcploom/codexec-quickjs/runner/protocol-endpoint";
import type {
  DispatcherMessage,
  RunnerMessage,
} from "@mcploom/codexec-protocol";

import type { RemoteRunnerPort } from "./types";

/**
 * Attaches the shared QuickJS protocol endpoint to a remote runner transport
 * and tears it down automatically when the transport closes or errors.
 */
export function attachQuickJsRemoteEndpoint(port: RemoteRunnerPort): () => void {
  const detachProtocol = attachQuickJsProtocolEndpoint({
    onMessage(handler: (message: DispatcherMessage) => void): () => void {
      const maybeDetach = port.onMessage((message: unknown) => {
        handler(message as DispatcherMessage);
      });

      return () => {
        if (typeof maybeDetach === "function") {
          maybeDetach();
        }
      };
    },
    send(message: RunnerMessage): void {
      void Promise.resolve(port.send(message)).catch(() => {});
    },
  });

  const offClose = port.onClose?.(() => {
    cleanup();
  });
  const offError = port.onError?.(() => {
    cleanup();
  });

  function cleanup(): void {
    if (typeof offClose === "function") {
      offClose();
    }
    if (typeof offError === "function") {
      offError();
    }
    detachProtocol();
  }

  return cleanup;
}
