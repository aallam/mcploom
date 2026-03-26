import type {
  ExecuteResult,
  ExecutorRuntimeOptions,
  ProviderManifest,
  ToolCall,
  ToolCallResult,
} from "@mcploom/codexec";

/**
 * Message sent from dispatcher to runner to start one execution session.
 */
export interface ExecuteMessage {
  code: string;
  id: string;
  options: ExecutorRuntimeOptions;
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
