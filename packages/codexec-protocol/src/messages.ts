import type { ExecuteErrorCode } from "@mcploom/codexec";

import type { ProviderManifest } from "./manifest";

// ── Messages from dispatcher (host) to runner (worker/remote) ───

/**
 * Instructs the runner to execute guest code with the given provider manifests.
 */
export interface ExecuteMessage {
  type: "execute";
  id: string;
  code: string;
  providers: ProviderManifest[];
  typeDeclarations: string;
}

/**
 * Delivers a successful tool call result back to the runner.
 */
export interface ToolResultOkMessage {
  type: "tool_result";
  callId: string;
  ok: true;
  result: unknown;
}

/**
 * Delivers a failed tool call result back to the runner.
 */
export interface ToolResultErrorMessage {
  type: "tool_result";
  callId: string;
  ok: false;
  error: { code: ExecuteErrorCode; message: string };
}

/**
 * Requests the runner to cancel an in-progress execution.
 */
export interface CancelMessage {
  type: "cancel";
  id: string;
}

export type DispatcherMessage =
  | ExecuteMessage
  | ToolResultOkMessage
  | ToolResultErrorMessage
  | CancelMessage;

// ── Messages from runner (worker/remote) to dispatcher (host) ───

/**
 * The runner requests a tool call be executed on the host.
 */
export interface ToolCallMessage {
  type: "tool_call";
  callId: string;
  provider: string;
  tool: string;
  input: unknown;
}

/**
 * Captured console output from the guest sandbox.
 */
export interface ConsoleMessage {
  type: "console";
  level: string;
  args: unknown[];
}

/**
 * Successful execution completion.
 */
export interface DoneOkMessage {
  type: "done";
  id: string;
  ok: true;
  result: unknown;
  logs: string[];
  durationMs: number;
}

/**
 * Failed execution completion.
 */
export interface DoneErrorMessage {
  type: "done";
  id: string;
  ok: false;
  error: { code: string; message: string };
  logs: string[];
  durationMs: number;
}

export type RunnerMessage =
  | ToolCallMessage
  | ConsoleMessage
  | DoneOkMessage
  | DoneErrorMessage;
