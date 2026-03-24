import type { ExecuteErrorCode, ToolExecutionContext } from "../types";

const EXECUTION_TIMEOUT_MESSAGE = "Execution timed out";

/**
 * Canonical error codes that may safely cross trusted executor boundaries.
 */
const KNOWN_EXECUTE_ERROR_CODES = new Set<ExecuteErrorCode>([
  "timeout",
  "memory_limit",
  "validation_error",
  "tool_error",
  "runtime_error",
  "serialization_error",
  "internal_error",
]);

/**
 * Returns whether the value is one of codexec's stable execution error codes.
 */
export function isKnownExecuteErrorCode(
  value: unknown,
): value is ExecuteErrorCode {
  return KNOWN_EXECUTE_ERROR_CODES.has(value as ExecuteErrorCode);
}

/**
 * Returns the stable timeout message used across executor implementations.
 */
export function getExecutionTimeoutMessage(): string {
  return EXECUTION_TIMEOUT_MESSAGE;
}

/**
 * Normalizes an unknown thrown value into a human-readable message.
 */
export function normalizeThrownMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return String(error);
}

/**
 * Returns the thrown error name when one is available.
 */
export function normalizeThrownName(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.name;
  }

  if (typeof error === "object" && error !== null && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string") {
      return name;
    }
  }

  return undefined;
}

/**
 * Builds the standard tool execution context passed to resolved tool wrappers.
 */
export function createExecutionContext(
  signal: AbortSignal,
  providerName: string,
  safeToolName: string,
  originalToolName: string,
): ToolExecutionContext {
  return {
    originalToolName,
    providerName,
    safeToolName,
    signal,
  };
}

/**
 * Truncates captured logs to the configured line and character limits.
 */
export function truncateLogs(
  logs: string[],
  maxLogLines: number,
  maxLogChars: number,
): string[] {
  const limitedLines = logs.slice(0, maxLogLines);
  let remainingChars = maxLogChars;
  const truncated: string[] = [];

  for (const line of limitedLines) {
    if (remainingChars <= 0) {
      break;
    }

    if (line.length <= remainingChars) {
      truncated.push(line);
      remainingChars -= line.length;
      continue;
    }

    truncated.push(line.slice(0, remainingChars));
    break;
  }

  return truncated;
}

function formatLogValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return "undefined";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Formats guest console arguments into a single host-side log line.
 */
export function formatConsoleLine(values: unknown[]): string {
  return values.map((value) => formatLogValue(value)).join(" ");
}
