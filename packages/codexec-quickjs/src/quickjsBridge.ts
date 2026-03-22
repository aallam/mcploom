import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten";

import { ExecuteFailure, type ExecuteErrorCode } from "@mcploom/codexec";

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

export function formatConsoleLine(values: unknown[]): string {
  return values.map((value) => formatLogValue(value)).join(" ");
}

export function createGuestErrorHandle(
  context: QuickJSContext,
  code: ExecuteErrorCode,
  message: string,
): QuickJSHandle {
  const errorHandle = context.newError({ message, name: "Error" });
  const codeHandle = context.newString(code);
  context.setProp(errorHandle, "code", codeHandle);
  codeHandle.dispose();
  return errorHandle;
}

export function fromGuestHandle(
  context: QuickJSContext,
  handle: QuickJSHandle,
): unknown {
  const guestType = context.typeof(handle);

  if (guestType === "undefined") {
    return undefined;
  }

  if (
    guestType === "function" ||
    guestType === "symbol" ||
    guestType === "bigint"
  ) {
    throw new ExecuteFailure(
      "serialization_error",
      "Guest code returned a non-serializable value",
    );
  }

  const jsonHandle = context.getProp(context.global, "JSON");
  const stringifyHandle = context.getProp(jsonHandle, "stringify");

  try {
    const stringified = context.unwrapResult(
      context.callFunction(stringifyHandle, jsonHandle, handle),
    );
    const stringifiedType = context.typeof(stringified);

    if (stringifiedType === "undefined") {
      throw new ExecuteFailure(
        "serialization_error",
        "Guest code returned a non-serializable value",
      );
    }

    const jsonValue = context.getString(stringified);
    return JSON.parse(jsonValue);
  } catch (error) {
    if (error instanceof ExecuteFailure) {
      throw error;
    }

    throw new ExecuteFailure(
      "serialization_error",
      "Guest code returned a non-serializable value",
    );
  } finally {
    stringifyHandle.dispose();
    jsonHandle.dispose();
  }
}

export function toGuestHandle(
  context: QuickJSContext,
  value: unknown,
): QuickJSHandle {
  if (value === undefined) {
    return context.undefined;
  }

  const jsonValue = JSON.stringify(value);

  if (jsonValue === undefined) {
    throw new ExecuteFailure(
      "serialization_error",
      "Host value is not JSON-serializable",
    );
  }

  return context.unwrapResult(
    context.evalCode(`(${jsonValue})`, "host-value.json"),
  );
}
