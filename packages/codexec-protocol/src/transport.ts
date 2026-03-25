import type { DispatcherMessage, RunnerMessage } from "./messages";

/**
 * Bidirectional communication channel between a dispatcher (host) and a runner.
 *
 * Implementations wrap concrete transports:
 * - `WorkerTransport`: `node:worker_threads` postMessage
 * - `HttpTransport`: HTTP/WebSocket (future)
 * - `CloudflareTransport`: Cloudflare Workers dispatch (future)
 */
export interface ExecutorTransport {
  /** Send a message to the runner. */
  send(message: DispatcherMessage): void;

  /** Register a handler for messages from the runner. */
  onMessage(handler: (message: RunnerMessage) => void): void;

  /** Forcefully terminate the runner (e.g. on timeout). */
  terminate(): Promise<void>;

  /** Clean up resources after execution completes. */
  dispose(): Promise<void>;
}
