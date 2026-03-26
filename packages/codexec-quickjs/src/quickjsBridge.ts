import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten";

import {
  ExecuteFailure,
  type ExecuteErrorCode,
} from "../../codexec/src/runtime.ts";

/**
 * Creates a guest-visible error object that carries a trusted host error code marker.
 */
export function createGuestErrorHandle(
  context: QuickJSContext,
  code: ExecuteErrorCode,
  message: string,
  trustedHostErrorKey: string,
): QuickJSHandle {
  const errorHandle = context.newError({ message, name: "Error" });
  const codeHandle = context.newString(code);
  const trustedHostMarkerHandle = context.true;

  try {
    context.setProp(errorHandle, "code", codeHandle);
    context.setProp(errorHandle, trustedHostErrorKey, trustedHostMarkerHandle);
    return errorHandle;
  } finally {
    codeHandle.dispose();
    trustedHostMarkerHandle.dispose();
  }
}

/**
 * Converts a guest QuickJS handle into a JSON-compatible host value.
 */
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

/**
 * Converts a host JSON-compatible value into a guest QuickJS handle.
 */
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
