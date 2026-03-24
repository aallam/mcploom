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
  isExecuteFailure,
  normalizeCode,
} from "@mcploom/codexec";
import type {
  ExecuteError,
  ExecuteResult,
  ResolvedToolDescriptor,
  ResolvedToolProvider,
  ToolExecutionContext,
  Executor,
} from "@mcploom/codexec";
import {
  createGuestErrorHandle,
  formatConsoleLine,
  fromGuestHandle,
  toGuestHandle,
} from "./quickjsBridge";
import type { QuickJsExecutorOptions } from "./types";

const DEFAULT_MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_LOG_LINES = 100;
const DEFAULT_MAX_LOG_CHARS = 64_000;

const loadDefaultModule = memoizePromiseFactory(() =>
  newQuickJSWASMModule(RELEASE_SYNC),
);

function isKnownErrorCode(value: unknown): value is ExecuteError["code"] {
  return (
    value === "timeout" ||
    value === "memory_limit" ||
    value === "validation_error" ||
    value === "tool_error" ||
    value === "runtime_error" ||
    value === "serialization_error" ||
    value === "internal_error"
  );
}

function normalizeThrownMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

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
      message: "Execution timed out",
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
  const nameHandle = context.getProp(handle, "name");
  const trustedMarkerHandle = context.getProp(handle, trustedHostErrorKey);

  try {
    const code =
      context.typeof(codeHandle) === "string"
        ? context.getString(codeHandle)
        : undefined;
    const name =
      context.typeof(nameHandle) === "string"
        ? context.getString(nameHandle)
        : undefined;
    const trustedHostError = context.typeof(trustedMarkerHandle) === "boolean";
    const message =
      context.typeof(messageHandle) === "string"
        ? context.getString(messageHandle)
        : normalizeThrownMessage(context.dump(handle));

    if (trustedHostError && isKnownErrorCode(code)) {
      return {
        code,
        message,
      };
    }

    if (name === "InternalError" && message.toLowerCase().includes("out of memory")) {
      return {
        code: "memory_limit",
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
    nameHandle.dispose();
    trustedMarkerHandle.dispose();
  }
}

function truncateLogs(
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

function createExecutionContext(
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
      throw new ExecuteFailure("timeout", "Execution timed out");
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
  providers: ResolvedToolProvider[],
  signal: AbortSignal,
  trustedHostErrorKey: string,
): void {
  for (const provider of providers) {
    const providerHandle = context.newObject();

    try {
      for (const [safeToolName, descriptor] of Object.entries(provider.tools)) {
        const toolHandle = createToolHandle(
          context,
          provider,
          descriptor,
          safeToolName,
          signal,
          trustedHostErrorKey,
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
  provider: ResolvedToolProvider,
  descriptor: ResolvedToolDescriptor,
  safeToolName: string,
  signal: AbortSignal,
  trustedHostErrorKey: string,
): QuickJSHandle {
  return context.newFunction(safeToolName, (...args) => {
    const deferred = context.newPromise();
    const input = args[0] === undefined ? undefined : context.dump(args[0]);
    const disposeDeferred = () => {
      if (deferred.alive) {
        deferred.dispose();
      }
    };
    const onAbort = () => {
      disposeDeferred();
    };
    const executionContext = createExecutionContext(
      signal,
      provider.name,
      safeToolName,
      descriptor.originalName,
    );

    signal.addEventListener("abort", onAbort, { once: true });

    void Promise.resolve()
      .then(async () => {
        if (signal.aborted) {
          throw new ExecuteFailure("timeout", "Execution timed out");
        }

        return descriptor.execute(input, executionContext);
      })
      .then((result) => {
        signal.removeEventListener("abort", onAbort);
        if (!context.alive || !deferred.alive) {
          disposeDeferred();
          return;
        }

        let resultHandle: QuickJSHandle | undefined;

        try {
          resultHandle = toGuestHandle(context, result);
          deferred.resolve(resultHandle);
        } catch (error) {
          const executeError = toExecuteError(error, Number.POSITIVE_INFINITY);
          const errorHandle = createGuestErrorHandle(
            context,
            executeError.code,
            executeError.message,
            trustedHostErrorKey,
          );
          deferred.reject(errorHandle);
          errorHandle.dispose();
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

        const executeError = toExecuteError(error, Number.POSITIVE_INFINITY);
        const errorHandle = createGuestErrorHandle(
          context,
          executeError.code,
          executeError.message,
          trustedHostErrorKey,
        );
        deferred.reject(errorHandle);
        errorHandle.dispose();
        disposeDeferred();
      });

    return deferred.handle;
  });
}

/**
 * QuickJS-backed executor for one-shot sandboxed JavaScript runs.
 */
export class QuickJsExecutor implements Executor {
  private readonly loadModule: () => Promise<QuickJSWASMModule>;
  private readonly maxLogChars: number;
  private readonly maxLogLines: number;
  private readonly memoryLimitBytes: number;
  private readonly timeoutMs: number;

  /**
   * Creates a QuickJS executor with one-shot runtime limits and host bridging configuration.
   */
  constructor(options: QuickJsExecutorOptions = {}) {
    this.loadModule = async () => {
      const loaded = options.loadModule
        ? await options.loadModule()
        : await loadDefaultModule();
      return loaded as QuickJSWASMModule;
    };
    this.maxLogChars = options.maxLogChars ?? DEFAULT_MAX_LOG_CHARS;
    this.maxLogLines = options.maxLogLines ?? DEFAULT_MAX_LOG_LINES;
    this.memoryLimitBytes =
      options.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT_BYTES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Executes JavaScript against the provided tool namespaces in a fresh QuickJS runtime.
   */
  async execute(
    code: string,
    providers: ResolvedToolProvider[],
  ): Promise<ExecuteResult> {
    const startedAt = Date.now();
    const deadline = startedAt + this.timeoutMs;
    const logs: string[] = [];
    const abortController = new AbortController();
    const trustedHostErrorKey = `__mcploomHostError_${randomUUID()}`;
    const module = await this.loadModule();
    const runtime = module.newRuntime();
    runtime.setMemoryLimit(this.memoryLimitBytes);
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(deadline));
    const context = runtime.newContext();

    try {
      injectConsole(context, logs);
      injectProviders(
        context,
        providers,
        abortController.signal,
        trustedHostErrorKey,
      );

      const executableSource = normalizeCode(code);
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
                logs: truncateLogs(logs, this.maxLogLines, this.maxLogChars),
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
              logs: truncateLogs(logs, this.maxLogLines, this.maxLogChars),
              ok: true,
              result: value,
            };
          } catch (error) {
            return {
              durationMs: Date.now() - startedAt,
              error: toExecuteError(error, deadline),
              logs: truncateLogs(logs, this.maxLogLines, this.maxLogChars),
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
        logs: truncateLogs(logs, this.maxLogLines, this.maxLogChars),
        ok: false,
      };
    } finally {
      abortController.abort();
      context.dispose();
      runtime.dispose();
    }
  }
}
