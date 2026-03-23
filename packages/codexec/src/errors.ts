import type { ExecuteErrorCode } from "./types";

/**
 * Structured failure used internally to propagate executor and tool errors.
 */
export class ExecuteFailure extends Error {
  code: ExecuteErrorCode;

  /**
   * Creates a structured failure with a trusted executor or tool error code.
   */
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
export function isJsonSerializable(
  value: unknown,
  active = new Set<object>(),
  memo = new WeakSet<object>(),
): boolean {
  if (value === null) {
    return true;
  }

  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    case "bigint":
    case "function":
    case "symbol":
    case "undefined":
      return false;
    case "object": {
      const objectValue = value as object;

      if (memo.has(objectValue)) {
        return true;
      }

      if (active.has(objectValue)) {
        return false;
      }

      active.add(objectValue);
      let isSerializable = false;

      try {
        if (Array.isArray(value)) {
          isSerializable = value.every((item) =>
            isJsonSerializable(item, active, memo),
          );
          return isSerializable;
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
          return false;
        }

        isSerializable = Object.values(value).every((item) =>
          isJsonSerializable(item, active, memo),
        );
        return isSerializable;
      } finally {
        active.delete(objectValue);
        if (isSerializable) {
          memo.add(objectValue);
        }
      }
    }
  }

  return false;
}
