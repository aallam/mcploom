/**
 * Worker thread entry point.
 *
 * This file runs inside a `node:worker_threads` Worker. It receives an
 * "execute" message from the host, runs guest code in a `vm.Context`
 * sandbox via the shared runner, and bridges tool calls back to the host
 * through `parentPort` message passing.
 */
import { parentPort } from "node:worker_threads";

import { runInSandbox } from "@mcploom/codexec-protocol";
import type { DispatcherMessage, RunnerMessage } from "@mcploom/codexec-protocol";

if (!parentPort) {
  throw new Error("workerEntry must be run inside a worker_threads Worker");
}

const port = parentPort;

// Buffer dispatcher messages until we have a handler
const earlyMessages: DispatcherMessage[] = [];
let messageHandler: ((message: DispatcherMessage) => void) | undefined;

port.on("message", (message: DispatcherMessage) => {
  if (message.type === "execute") {
    // Start execution
    const { id, code, providers, typeDeclarations } = message;

    const send: (msg: RunnerMessage) => void = (msg) => {
      port.postMessage(msg);
    };

    const onMessage: (handler: (msg: DispatcherMessage) => void) => void = (
      handler,
    ) => {
      messageHandler = handler;
      // Deliver any buffered messages
      for (const buffered of earlyMessages) {
        handler(buffered);
      }
      earlyMessages.length = 0;
    };

    void runInSandbox(id, code, providers, typeDeclarations, send, onMessage);
  } else {
    // Tool result or cancel — forward to the runner's handler
    if (messageHandler) {
      messageHandler(message);
    } else {
      earlyMessages.push(message);
    }
  }
});
