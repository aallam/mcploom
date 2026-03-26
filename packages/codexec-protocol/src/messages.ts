import type { ExecuteError, ExecuteResult } from "@mcploom/codexec";

/**
 * Transport-safe metadata for one exposed tool.
 */
export interface ProviderToolManifest {
  description?: string;
  originalName: string;
  safeName: string;
}

/**
 * Transport-safe namespace manifest shared with remote or out-of-process runners.
 */
export interface ProviderManifest {
  name: string;
  tools: Record<string, ProviderToolManifest>;
  types: string;
}

/**
 * Execution limits forwarded to runner implementations.
 */
export interface ExecutionRuntimeOptions {
  maxLogChars?: number;
  maxLogLines?: number;
  memoryLimitBytes?: number;
  timeoutMs?: number;
}

/**
 * Tool invocation request forwarded from a runner to the trusted host.
 */
export interface ToolCall {
  input: unknown;
  providerName: string;
  safeToolName: string;
}

/**
 * Trusted host response to a tool invocation request.
 */
export type ToolCallResult =
  | {
      ok: true;
      result: unknown;
    }
  | {
      error: ExecuteError;
      ok: false;
    };

/**
 * Message sent from dispatcher to runner to start one execution session.
 */
export interface ExecuteMessage {
  code: string;
  id: string;
  options: ExecutionRuntimeOptions;
  providers: ProviderManifest[];
  type: "execute";
}

/**
 * Message sent from dispatcher to request prompt cancellation.
 */
export interface CancelMessage {
  id: string;
  type: "cancel";
}

/**
 * Message sent from a runner when guest code invokes a host tool.
 */
export interface ToolCallMessage extends ToolCall {
  callId: string;
  type: "tool_call";
}

/**
 * Message carrying a trusted host tool result back to the runner.
 */
export type ToolResultMessage = ({ callId: string; type: "tool_result" } & ToolCallResult);

/**
 * Message indicating the runner has finished bootstrapping guest execution timing.
 */
export interface StartedMessage {
  id: string;
  type: "started";
}

/**
 * Final execution result returned by a runner.
 */
export type DoneMessage = ({ id: string; type: "done" } & ExecuteResult);

/**
 * Messages accepted by a runner transport endpoint.
 */
export type DispatcherMessage =
  | CancelMessage
  | ExecuteMessage
  | ToolResultMessage;

/**
 * Messages emitted by a runner transport endpoint.
 */
export type RunnerMessage = DoneMessage | StartedMessage | ToolCallMessage;
