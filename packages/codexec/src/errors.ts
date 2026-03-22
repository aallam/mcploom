import type { ExecuteErrorCode } from "./types";

/**
 * Structured failure used internally to propagate executor and tool errors.
 */
export class ExecuteFailure extends Error {
  code: ExecuteErrorCode;

  constructor(code: ExecuteErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ExecuteFailure";
  }
}

/**
 * Returns whether a thrown value is an {@link ExecuteFailure}.
 */
export function isExecuteFailure(value: unknown): value is ExecuteFailure {
  return value instanceof ExecuteFailure;
}

/**
 * Returns whether a value can be serialized through the JSON-only host/guest boundary.
 */
export function isJsonSerializable(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}
