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
export function isJsonSerializable(
  value: unknown,
  seen = new Set<unknown>(),
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
      if (seen.has(value)) {
        return false;
      }

      seen.add(value);

      try {
        if (Array.isArray(value)) {
          return value.every((item) => isJsonSerializable(item, seen));
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
          return false;
        }

        return Object.values(value).every((item) =>
          isJsonSerializable(item, seen),
        );
      } finally {
        seen.delete(value);
      }
    }
  }

  return false;
}
