import { attachQuickJsProtocolEndpoint } from "@mcploom/codexec-quickjs/runner/protocol-endpoint";
import type { DispatcherMessage, RunnerMessage } from "@mcploom/codexec-protocol";

if (typeof process.send !== "function") {
  throw new Error("ProcessExecutor requires a child process IPC channel");
}

attachQuickJsProtocolEndpoint({
  onMessage(handler: (message: DispatcherMessage) => void): () => void {
    process.on("message", handler);
    return () => process.off("message", handler);
  },
  send(message: RunnerMessage): void {
    process.send?.(message);
  },
});
