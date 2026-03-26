import { randomUUID } from "node:crypto";

import {
  RELEASE_SYNC,
  isFail,
  memoizePromiseFactory,
  newQuickJSWASMModule,
  shouldInterruptAfterDeadline,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime,
  type QuickJSWASMModule,
} from "quickjs-emscripten";

import {
  ExecuteFailure,
  type ExecutorRuntimeOptions,
  formatConsoleLine,
  getExecutionTimeoutMessage,
  isExecuteFailure,
  isKnownExecuteErrorCode,
  normalizeCode,
  normalizeThrownMessage,
  type ProviderManifest,
  type ToolCall,
  type ToolCallResult,
  truncateLogs,
  type ExecuteError,
  type ExecuteResult,
} from "../../../codexec/src/runtime.ts";

import {
  createGuestErrorHandle,
  fromGuestHandle,
  toGuestHandle,
} from "../quickjsBridge.ts";
import type { QuickJsExecutorOptions } from "../types.ts";

const DEFAULT_MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_LOG_LINES = 100;
const DEFAULT_MAX_LOG_CHARS = 64_000;

const loadDefaultModule = memoizePromiseFactory(() =>
  newQuickJSWASMModule(RELEASE_SYNC),
);

/**
 * Transport-neutral host tool call emitted from a QuickJS session.
 */
export type QuickJsSessionToolCall = ToolCall;

/**
 * Input required to run one transport-backed QuickJS execution session.
 */
export interface QuickJsSessionRequest {
  abortController?: AbortController;
  code: string;
  onToolCall: (
    call: ToolCall,
  ) => Promise<ToolCallResult> | ToolCallResult;
  onStarted?: () => void;
  providers: ProviderManifest[];
  signal?: AbortSignal;
}

/**
 * Options controlling one transport-backed QuickJS session.
 */
export type QuickJsSessionOptions = QuickJsExecutorOptions &
  ExecutorRuntimeOptions;

/**
 * Converts unexpected executor failures into stable public result errors.
 */
function toExecuteError(error: unknown, deadline: number): ExecuteError {
  if (isExecuteFailure(error)) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  const message = normalizeThrownMessage(error);

  if (Date.now() > deadline || message.includes("interrupted")) {
    return {
      code: "timeout",
      message: getExecutionTimeoutMessage(),
    };
  }

  if (message.toLowerCase().includes("out of memory")) {
    return {
      code: "memory_limit",
      message,
    };
  }

  return {
    code: "runtime_error",
    message,
  };
}

function errorFromGuestHandle(
  context: QuickJSContext,
  handle: QuickJSHandle,
  trustedHostErrorKey: string,
): ExecuteError {
  const codeHandle = context.getProp(handle, "code");
  const messageHandle = context.getProp(handle, "message");
  const trustedMarkerHandle = context.getProp(handle, trustedHostErrorKey);

  try {
    const code =
      context.typeof(codeHandle) === "string"
        ? context.getString(codeHandle)
        : undefined;
    const trustedHostError = context.typeof(trustedMarkerHandle) === "boolean";
    const message =
      context.typeof(messageHandle) === "string"
        ? context.getString(messageHandle)
        : normalizeThrownMessage(context.dump(handle));

    if (trustedHostError && isKnownExecuteErrorCode(code)) {
      return {
        code,
        message,
      };
    }

    return {
      code: "runtime_error",
      message,
    };
  } finally {
    codeHandle.dispose();
    messageHandle.dispose();
    trustedMarkerHandle.dispose();
  }
}

async function waitForPromiseSettlement(
  runtime: QuickJSRuntime,
  promise: Promise<unknown>,
  deadline: number,
  trustedHostErrorKey: string,
): Promise<void> {
  let settled = false;
  let rejection: unknown;

  promise.then(
    () => {
      settled = true;
    },
    (error) => {
      settled = true;
      rejection = error;
    },
  );

  while (!settled) {
    if (Date.now() > deadline) {
      throw new ExecuteFailure("timeout", getExecutionTimeoutMessage());
    }

    const pendingJobsResult = runtime.executePendingJobs(-1);
    if (isFail(pendingJobsResult)) {
      const pendingError = pendingJobsResult.error;

      try {
        const executeError = errorFromGuestHandle(
          pendingError.context,
          pendingError,
          trustedHostErrorKey,
        );
        throw new ExecuteFailure(executeError.code, executeError.message);
      } finally {
        pendingError.dispose();
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (rejection !== undefined) {
    throw rejection;
  }
}

function injectConsole(context: QuickJSContext, logs: string[]): void {
  const consoleHandle = context.newObject();

  try {
    for (const methodName of ["log", "info", "warn", "error"]) {
      const methodHandle = context.newFunction(methodName, (...args) => {
        logs.push(formatConsoleLine(args.map((arg) => context.dump(arg))));
        return context.undefined;
      });

      context.setProp(consoleHandle, methodName, methodHandle);
      methodHandle.dispose();
    }

    context.setProp(context.global, "console", consoleHandle);
  } finally {
    consoleHandle.dispose();
  }
}

function injectProviders(
  context: QuickJSContext,
  providers: ProviderManifest[],
  signal: AbortSignal,
  trustedHostErrorKey: string,
  onToolCall: QuickJsSessionRequest["onToolCall"],
): void {
  for (const provider of providers) {
    const providerHandle = context.newObject();

    try {
      for (const [safeToolName] of Object.entries(provider.tools)) {
        const toolHandle = createToolHandle(
          context,
          provider.name,
          safeToolName,
          signal,
          trustedHostErrorKey,
          onToolCall,
        );
        context.setProp(providerHandle, safeToolName, toolHandle);
        toolHandle.dispose();
      }

      context.setProp(context.global, provider.name, providerHandle);
    } finally {
      providerHandle.dispose();
    }
  }
}

function createToolHandle(
  context: QuickJSContext,
  providerName: string,
  safeToolName: string,
  signal: AbortSignal,
  trustedHostErrorKey: string,
  onToolCall: QuickJsSessionRequest["onToolCall"],
): QuickJSHandle {
  return context.newFunction(safeToolName, (...args) => {
    const deferred = context.newPromise();
    const input = args[0] === undefined ? undefined : context.dump(args[0]);
    const disposeDeferred = () => {
      if (context.alive && deferred.alive) {
        deferred.dispose();
      }
    };
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      disposeDeferred();
    };

    signal.addEventListener("abort", onAbort, { once: true });

    let responsePromise: Promise<ToolCallResult>;

    try {
        if (signal.aborted) {
          throw new ExecuteFailure("timeout", getExecutionTimeoutMessage());
        }

        responsePromise = Promise.resolve(
          onToolCall({
            input,
            providerName,
            safeToolName,
          }),
        );
    } catch (error) {
      responsePromise = Promise.reject(error);
    }

    void responsePromise
      .then((response) => {
        signal.removeEventListener("abort", onAbort);
        if (!context.alive || !deferred.alive) {
          disposeDeferred();
          return;
        }

        let resultHandle: QuickJSHandle | undefined;

        try {
          if (!response.ok) {
            const errorHandle = createGuestErrorHandle(
              context,
              response.error.code,
              response.error.message,
              trustedHostErrorKey,
            );
            deferred.reject(errorHandle);
            errorHandle.dispose();
            return;
          }

          resultHandle = toGuestHandle(context, response.result);
          deferred.resolve(resultHandle);
        } finally {
          resultHandle?.dispose();
          disposeDeferred();
        }
      })
      .catch((error) => {
        signal.removeEventListener("abort", onAbort);
        if (!context.alive || !deferred.alive) {
          disposeDeferred();
          return;
        }

        const errorHandle = createGuestErrorHandle(
          context,
          isExecuteFailure(error) ? error.code : "internal_error",
          normalizeThrownMessage(error),
          trustedHostErrorKey,
        );

        try {
          deferred.reject(errorHandle);
        } finally {
          errorHandle.dispose();
          disposeDeferred();
        }
      });

    return deferred.handle;
  });
}

/**
 * Runs one QuickJS-backed execution session using a transport-neutral tool callback.
 */
export async function runQuickJsSession(
  request: QuickJsSessionRequest,
  options: QuickJsSessionOptions = {},
): Promise<ExecuteResult> {
  const loadModule = async () => {
    const loaded = options.loadModule
      ? await options.loadModule()
      : await loadDefaultModule();
    return loaded as QuickJSWASMModule;
  };
  const maxLogChars = options.maxLogChars ?? DEFAULT_MAX_LOG_CHARS;
  const maxLogLines = options.maxLogLines ?? DEFAULT_MAX_LOG_LINES;
  const memoryLimitBytes =
    options.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();
  const logs: string[] = [];
  const abortController = new AbortController();
  const trustedHostErrorKey = `__mcploomHostError_${randomUUID()}`;
  const signal =
    request.abortController?.signal ?? request.signal ?? abortController.signal;
  const module = await loadModule();
  const runtime = module.newRuntime();
  let deadline = Number.POSITIVE_INFINITY;
  runtime.setMemoryLimit(memoryLimitBytes);
  const context = runtime.newContext();

  try {
    injectConsole(context, logs);
    injectProviders(
      context,
      request.providers,
      signal,
      trustedHostErrorKey,
      request.onToolCall,
    );
    const executionStartedAt = Date.now();
    deadline = executionStartedAt + timeoutMs;
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(deadline));
    request.onStarted?.();

    const executableSource = normalizeCode(request.code);
    const functionHandle = context.unwrapResult(
      context.evalCode(`(${executableSource})`, "sandbox-user-code.js"),
    );

    try {
      const promiseHandle = context.unwrapResult(
        context.callFunction(functionHandle, context.undefined),
      );

      try {
        const promiseResult = context.resolvePromise(promiseHandle);
        await waitForPromiseSettlement(
          runtime,
          promiseResult,
          deadline,
          trustedHostErrorKey,
        );
        const settledResult = await promiseResult;

        if (isFail(settledResult)) {
          const errorHandle = settledResult.error;

          try {
            return {
              durationMs: Date.now() - startedAt,
              error: errorFromGuestHandle(
                context,
                errorHandle,
                trustedHostErrorKey,
              ),
              logs: truncateLogs(logs, maxLogLines, maxLogChars),
              ok: false,
            };
          } finally {
            errorHandle.dispose();
          }
        }

        try {
          const value = fromGuestHandle(context, settledResult.value);

          return {
            durationMs: Date.now() - startedAt,
            logs: truncateLogs(logs, maxLogLines, maxLogChars),
            ok: true,
            result: value,
          };
        } catch (error) {
          return {
            durationMs: Date.now() - startedAt,
            error: toExecuteError(error, deadline),
            logs: truncateLogs(logs, maxLogLines, maxLogChars),
            ok: false,
          };
        } finally {
          settledResult.value.dispose();
        }
      } finally {
        promiseHandle.dispose();
      }
    } finally {
      functionHandle.dispose();
    }
  } catch (error) {
    abortController.abort();

    return {
      durationMs: Date.now() - startedAt,
      error: toExecuteError(error, deadline),
      logs: truncateLogs(logs, maxLogLines, maxLogChars),
      ok: false,
    };
  } finally {
    request.abortController?.abort();
    abortController.abort();
    context.dispose();
    runtime.dispose();
  }
}
