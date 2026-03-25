import { randomUUID } from "node:crypto";
import vm from "node:vm";

import {
  formatConsoleLine,
  isJsonSerializable,
  normalizeCode,
  normalizeThrownMessage,
} from "@mcploom/codexec";

import type { ProviderManifest } from "./manifest";
import type {
  DispatcherMessage,
  RunnerMessage,
  ToolResultErrorMessage,
  ToolResultOkMessage,
} from "./messages";

/**
 * Sends a message from the runner back to the dispatcher.
 */
type SendFn = (message: RunnerMessage) => void;

/**
 * Registers a handler for messages from the dispatcher to this runner.
 */
type OnMessageFn = (handler: (message: DispatcherMessage) => void) => void;

interface PendingToolCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * Runs guest code in a `vm.Context` sandbox, bridging tool calls
 * via message passing to the dispatcher (host).
 *
 * This function is transport-agnostic — it only needs `send` and `onMessage`
 * callbacks. It can be used from a worker_thread, child_process, or HTTP handler.
 */
export async function runInSandbox(
  executionId: string,
  code: string,
  providers: ProviderManifest[],
  typeDeclarations: string,
  send: SendFn,
  onMessage: OnMessageFn,
): Promise<void> {
  const startedAt = Date.now();
  const logs: string[] = [];
  const pendingCalls = new Map<string, PendingToolCall>();

  // Handle incoming tool results from the dispatcher
  onMessage((message) => {
    if (message.type === "tool_result") {
      const pending = pendingCalls.get(message.callId);
      if (!pending) return;
      pendingCalls.delete(message.callId);

      if (message.ok) {
        pending.resolve((message as ToolResultOkMessage).result);
      } else {
        const err = (message as ToolResultErrorMessage).error;
        const error = new Error(err.message);
        (error as { code?: string }).code = err.code;
        pending.reject(error);
      }
    }

    if (message.type === "cancel") {
      // Reject all pending tool calls
      for (const [, pending] of pendingCalls) {
        pending.reject(new Error("Execution cancelled"));
      }
      pendingCalls.clear();
    }
  });

  try {
    // Build the sandbox context — explicitly strip Node globals
    const sandbox: Record<string, unknown> = {
      Buffer: undefined,
      clearImmediate: undefined,
      clearInterval: undefined,
      clearTimeout: undefined,
      fetch: undefined,
      process: undefined,
      require: undefined,
      setImmediate: undefined,
      setInterval: undefined,
      setTimeout: undefined,
      URL: undefined,
      URLSearchParams: undefined,
      TextEncoder: undefined,
      TextDecoder: undefined,
    };

    // Inject console capture
    const consoleMethods: Record<string, (...args: unknown[]) => void> = {};
    for (const level of ["log", "info", "warn", "error"]) {
      consoleMethods[level] = (...args: unknown[]) => {
        logs.push(formatConsoleLine(args));
        send({ type: "console", level, args });
      };
    }
    sandbox.console = consoleMethods;

    // Inject provider stubs that RPC tool calls back to the dispatcher
    for (const provider of providers) {
      const providerObj: Record<
        string,
        (input?: unknown) => Promise<unknown>
      > = {};

      for (const [safeToolName, toolMeta] of Object.entries(provider.tools)) {
        providerObj[safeToolName] = (input?: unknown) => {
          const callId = randomUUID();

          return new Promise<unknown>((resolve, reject) => {
            pendingCalls.set(callId, { resolve, reject });
            send({
              type: "tool_call",
              callId,
              provider: provider.name,
              tool: safeToolName,
              input,
            });
          });
        };
      }

      sandbox[provider.name] = providerObj;
    }

    // Create an isolated vm context (no Node globals leak)
    const context = vm.createContext(sandbox, {
      codeGeneration: { strings: false, wasm: false },
    });

    // Normalize and execute
    const executableSource = normalizeCode(code);
    const wrappedSource = `(${executableSource})()`;

    const script = new vm.Script(wrappedSource, {
      filename: "sandbox-user-code.js",
    });

    const resultPromise = script.runInContext(context);
    const rawResult = await resultPromise;

    // Objects from vm.Context have a different prototype chain than the host,
    // which breaks isJsonSerializable. JSON-roundtrip normalizes them and
    // simultaneously validates serializability.
    if (rawResult === undefined) {
      send({
        type: "done",
        id: executionId,
        ok: true,
        result: null,
        logs,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    let serialized: string;
    try {
      serialized = JSON.stringify(rawResult);
    } catch {
      send({
        type: "done",
        id: executionId,
        ok: false,
        error: {
          code: "serialization_error",
          message: `Result is not JSON-serializable: ${typeof rawResult}`,
        },
        logs,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    if (serialized === undefined) {
      // JSON.stringify returns undefined for functions, symbols, etc.
      send({
        type: "done",
        id: executionId,
        ok: false,
        error: {
          code: "serialization_error",
          message: `Result is not JSON-serializable: ${typeof rawResult}`,
        },
        logs,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    send({
      type: "done",
      id: executionId,
      ok: true,
      result: JSON.parse(serialized),
      logs,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = normalizeThrownMessage(error);
    // Only trust error codes that were explicitly set by the host (tool_result)
    const errorCode =
      error instanceof Error
        ? ((error as { code?: string }).code ?? "runtime_error")
        : "runtime_error";

    send({
      type: "done",
      id: executionId,
      ok: false,
      error: {
        code: errorCode,
        message,
      },
      logs,
      durationMs: Date.now() - startedAt,
    });
  }
}
