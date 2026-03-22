import type { ZodRawShape, ZodTypeAny } from "zod";

/**
 * JSON Schema-like object used by the public tool and type-generation APIs.
 */
export type JsonSchema = Record<string, unknown>;

/**
 * Supported authoring formats for tool schemas.
 */
export type ToolSchema = JsonSchema | ZodTypeAny | ZodRawShape;

/**
 * Stable error codes returned by executors and wrapped tool calls.
 */
export type ExecuteErrorCode =
  | "timeout"
  | "memory_limit"
  | "validation_error"
  | "tool_error"
  | "runtime_error"
  | "serialization_error"
  | "internal_error";

/**
 * Structured execution failure returned in {@link ExecuteResult}.
 */
export interface ExecuteError {
  /** Machine-readable error category. */
  code: ExecuteErrorCode;
  /** Human-readable failure message. */
  message: string;
}

/**
 * Structured result returned by every executor invocation.
 */
export type ExecuteResult<T = unknown> =
  | {
      durationMs: number;
      logs: string[];
      ok: true;
      result: T;
    }
  | {
      durationMs: number;
      error: ExecuteError;
      logs: string[];
      ok: false;
    };

/**
 * Context passed to every tool execution.
 */
export interface ToolExecutionContext {
  /** Abort signal cancelled when execution times out or tears down. */
  signal: AbortSignal;
  /** Provider namespace visible in guest code. */
  providerName: string;
  /** Sanitized tool identifier exposed inside the sandbox. */
  safeToolName: string;
  /** Original upstream tool name before sanitization. */
  originalToolName: string;
}

/**
 * Host-side tool definition before provider resolution.
 */
export interface ToolDescriptor {
  /** Optional human-readable description used in generated types and docs. */
  description?: string;
  /** Optional input schema validated before the tool is invoked. */
  inputSchema?: ToolSchema;
  /** Optional output schema validated after the tool resolves. */
  outputSchema?: ToolSchema;
  /** Tool implementation invoked by the host runtime. */
  execute: (
    input: unknown,
    context: ToolExecutionContext,
  ) => Promise<unknown> | unknown;
}

/**
 * Collection of tools exposed under a single guest namespace.
 */
export interface ToolProvider {
  /** Optional namespace shown in guest code. Defaults to `codemode`. */
  name?: string;
  /** Raw tools keyed by their original names. */
  tools: Record<string, ToolDescriptor>;
  /** Optional hand-authored type declarations overriding generated types. */
  types?: string;
}

/**
 * Tool descriptor after validation, sanitization, and execution wrapping.
 */
export interface ResolvedToolDescriptor {
  /** Optional human-readable description used in generated types and docs. */
  description?: string;
  /** Normalized JSON Schema validated before the tool is invoked. */
  inputSchema?: JsonSchema;
  /** Normalized JSON Schema validated after the tool resolves. */
  outputSchema?: JsonSchema;
  /** Original upstream tool name. */
  originalName: string;
  /** Sanitized tool name visible in guest code. */
  safeName: string;
  /** Wrapped tool execution function used by executors. */
  execute: (input: unknown, context: ToolExecutionContext) => Promise<unknown>;
}

/**
 * Fully resolved provider consumed by executors and MCP adapters.
 */
export interface ResolvedToolProvider {
  /** Validated namespace visible in guest code. */
  name: string;
  /** Mapping from upstream tool names to sanitized guest names. */
  originalToSafeName: Record<string, string>;
  /** Reverse mapping from sanitized guest names to upstream tool names. */
  safeToOriginalName: Record<string, string>;
  /** Wrapped tools keyed by their sanitized names. */
  tools: Record<string, ResolvedToolDescriptor>;
  /** Generated or user-supplied type declarations for the provider namespace. */
  types: string;
}

/**
 * Tool shape consumed by JSON Schema type generation.
 */
export type TypegenToolDescriptor = Pick<
  ResolvedToolDescriptor,
  "description" | "inputSchema" | "outputSchema"
> &
  Partial<Pick<ResolvedToolDescriptor, "execute">>;
