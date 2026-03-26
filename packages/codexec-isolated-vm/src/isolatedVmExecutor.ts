import { randomUUID } from "node:crypto";

import {
  ExecuteFailure,
  createExecutionContext,
  formatConsoleLine,
  getExecutionTimeoutMessage,
  isExecuteFailure,
  isKnownExecuteErrorCode,
  normalizeCode,
  normalizeThrownMessage,
  truncateLogs,
} from "@mcploom/codexec";
import type {
  ExecuteError,
  ExecuteResult,
  Executor,
  ResolvedToolProvider,
} from "@mcploom/codexec";

import type { IsolatedVmExecutorOptions } from "./types";

type IsolatedVmExternalCopyInstance = {
  copyInto: (options?: { release?: boolean; transferIn?: boolean }) => unknown;
  release?: () => void;
};

type IsolatedVmReferenceInstance = {
  setSync: (
    property: string,
    value: unknown,
    options?: Record<string, unknown>,
  ) => void;
};

type IsolatedVmContext = {
  eval: (code: string, options?: Record<string, unknown>) => Promise<unknown>;
  evalClosure: (
    code: string,
    args?: unknown[],
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  global: IsolatedVmReferenceInstance;
  release?: () => void;
};

type IsolatedVmIsolate = {
  createContext: () => Promise<IsolatedVmContext>;
  dispose: () => void;
};

type IsolatedVmModule = {
  ExternalCopy: new (
    value: unknown,
    options?: Record<string, unknown>,
  ) => IsolatedVmExternalCopyInstance;
  Isolate: new (options?: {
    inspector?: boolean;
    memoryLimit?: number;
    onCatastrophicError?: (message: string) => void;
  }) => IsolatedVmIsolate;
};

type GuestExecutionEnvelope =
  | {
      ok: true;
      value: unknown;
    }
  | {
      error: {
        code?: string;
        message?: string;
        name?: string;
      };
      ok: false;
    };

const DEFAULT_MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_LOG_LINES = 100;
const DEFAULT_MAX_LOG_CHARS = 64_000;
let cachedModulePromise: Promise<IsolatedVmModule> | undefined;

function hasRequiredNodeFlag(): boolean {
  const execArgv = process.execArgv.join(" ");
  const nodeOptions = process.env.NODE_OPTIONS ?? "";
  return (
    execArgv.includes("--no-node-snapshot") ||
    nodeOptions.includes("--no-node-snapshot")
  );
}


function toJsonValue(value: unknown, message: string): unknown {
  if (value === undefined) {
    return undefined;
  }

  const jsonValue = JSON.stringify(value);

  if (jsonValue === undefined) {
    throw new ExecuteFailure("serialization_error", message);
  }

  try {
    return JSON.parse(jsonValue) as unknown;
  } catch {
    throw new ExecuteFailure("serialization_error", message);
  }
}

function toTransferableValue(ivm: IsolatedVmModule, value: unknown): unknown {
  const normalizedValue = toJsonValue(
    value,
    "Host value is not JSON-serializable",
  );

  if (
    normalizedValue === null ||
    normalizedValue === undefined ||
    typeof normalizedValue === "string" ||
    typeof normalizedValue === "number" ||
    typeof normalizedValue === "boolean"
  ) {
    return normalizedValue;
  }

  const copy = new ivm.ExternalCopy(normalizedValue);
  return copy.copyInto({ release: true });
}

function toExecuteError(error: unknown, deadline: number): ExecuteError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    isKnownExecuteErrorCode((error as { code?: unknown }).code) &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return {
      code: (error as { code: ExecuteError["code"] }).code,
      message: (error as { message: string }).message,
    };
  }

  if (isExecuteFailure(error)) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  const message = normalizeThrownMessage(error);
  const normalizedMessage = message.toLowerCase();

  if (
    Date.now() > deadline ||
    normalizedMessage.includes("timed out") ||
    normalizedMessage.includes("time limit")
  ) {
    return {
      code: "timeout",
      message: getExecutionTimeoutMessage(),
    };
  }

  if (
    normalizedMessage.includes("memory limit") ||
    normalizedMessage.includes("out of memory")
  ) {
    return {
      code: "memory_limit",
      message,
    };
  }

  if (
    normalizedMessage.includes("could not be cloned") ||
    normalizedMessage.includes("non-transferable") ||
    normalizedMessage.includes("not json-serializable")
  ) {
    return {
      code: "serialization_error",
      message,
    };
  }

  return {
    code: "runtime_error",
    message,
  };
}

function toMemoryLimitMb(memoryLimitBytes: number): number {
  return Math.max(8, Math.ceil(memoryLimitBytes / (1024 * 1024)));
}

function remainingTime(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

async function runWithDeadline<T>(
  operation: Promise<T>,
  deadline: number,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted || Date.now() > deadline) {
    throw new ExecuteFailure("timeout", getExecutionTimeoutMessage());
  }

  const timeoutMs = remainingTime(deadline);
  if (timeoutMs <= 0) {
    throw new ExecuteFailure("timeout", getExecutionTimeoutMessage());
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new ExecuteFailure("timeout", getExecutionTimeoutMessage()));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      reject(new ExecuteFailure("timeout", getExecutionTimeoutMessage()));
    }, timeoutMs);

    void operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(error);
      },
    );
  });
}

async function loadDefaultModule(): Promise<IsolatedVmModule> {
  cachedModulePromise ??= import("isolated-vm").then((loaded) => {
    const candidate = (
      "default" in loaded ? loaded.default : loaded
    ) as unknown;
    return candidate as IsolatedVmModule;
  });

  return cachedModulePromise;
}

function createBootstrapSource(
  providers: ResolvedToolProvider[],
  hostErrorPrefix: string,
  timeoutMs: number,
): string {
  const lines = [
    `const __MCP_HOST_ERROR_PREFIX = ${JSON.stringify(hostErrorPrefix)};`,
    `const __MCP_HOST_ERROR_KEY = ${JSON.stringify(`${hostErrorPrefix}key`)};`,
    "const __mcpCreateTrustedError = (code, message) => ({",
    "  [__MCP_HOST_ERROR_KEY]: true,",
    "  code,",
    "  message,",
    "});",
    "const __mcpNormalizeTrustedError = (error) => {",
    "  if (error && typeof error === 'object' && error[__MCP_HOST_ERROR_KEY] === true && typeof error.code === 'string' && typeof error.message === 'string') {",
    "    return __mcpCreateTrustedError(error.code, error.message);",
    "  }",
    "  if (error && typeof error.message === 'string' && error.message.startsWith(__MCP_HOST_ERROR_PREFIX)) {",
    "    try {",
    "      const payload = JSON.parse(error.message.slice(__MCP_HOST_ERROR_PREFIX.length));",
    "      if (payload && typeof payload.code === 'string' && typeof payload.message === 'string') {",
    "        return __mcpCreateTrustedError(payload.code, payload.message);",
    "      }",
    "    } catch {}",
    "  }",
    "  return null;",
    "};",
    "const __mcpNormalizeGuestError = (error) => {",
    "  const trusted = __mcpNormalizeTrustedError(error);",
    "  if (trusted) {",
    "    return trusted;",
    "  }",
    "  if (error && typeof error.message === 'string') {",
    "    return {",
    "      code: 'runtime_error',",
    "      message: error.message,",
    "      ...(typeof error.name === 'string' ? { name: error.name } : {}),",
    "    };",
    "  }",
    "  return { code: 'runtime_error', message: String(error) };",
    "};",
    "const __mcpNormalizeHostError = (error) => {",
    "  const trusted = __mcpNormalizeTrustedError(error);",
    "  if (trusted) {",
    "    return trusted;",
    "  }",
    "  if (error && typeof error === 'object' && typeof error.code === 'string' && typeof error.message === 'string') {",
    "    return __mcpCreateTrustedError(error.code, error.message);",
    "  }",
    "  return __mcpNormalizeGuestError(error);",
    "};",
    "const __mcpRaiseNormalizedError = (error) => {",
    "  throw __mcpNormalizeHostError(error);",
    "};",
    "const __mcpToJsonValue = (value) => {",
    "  if (typeof value === 'undefined') {",
    "    return undefined;",
    "  }",
    "  const json = JSON.stringify(value);",
    "  if (typeof json === 'undefined') {",
    "    throw __mcpCreateTrustedError(",
    "      'serialization_error',",
    "      'Guest code returned a non-serializable value'",
    "    );",
    "  }",
    "  return JSON.parse(json);",
    "};",
    "globalThis.console = {",
    "  log: (...args) => __mcp_console_log(...args),",
    "  info: (...args) => __mcp_console_info(...args),",
    "  warn: (...args) => __mcp_console_warn(...args),",
    "  error: (...args) => __mcp_console_error(...args),",
    "};",
  ];

  for (const provider of providers) {
    lines.push(`globalThis.${provider.name} = {};`);

    for (const safeToolName of Object.keys(provider.tools)) {
      const hostReferenceName = `__mcp_tool_${provider.name}_${safeToolName}`;
      lines.push(
        `globalThis.${provider.name}.${safeToolName} = async (input) => {`,
        "  try {",
        `    return await ${hostReferenceName}.applySyncPromise(undefined, [input], { arguments: { copy: true }, timeout: ${timeoutMs} });`,
        "  } catch (error) {",
        "    __mcpRaiseNormalizedError(error);",
        "  }",
        "};",
      );
    }
  }

  return lines.join("\n");
}

function createExecutionSource(code: string): string {
  const executableSource = normalizeCode(code);

  return [
    `const __mcpUserFunction = (${executableSource});`,
    "return (async () => {",
    "  try {",
    "    const value = await __mcpUserFunction();",
    "    return { ok: true, value: __mcpToJsonValue(value) };",
    "  } catch (error) {",
    "    return { ok: false, error: __mcpNormalizeGuestError(error) };",
    "  }",
    "})();",
  ].join("\n");
}

function setConsoleBindings(context: IsolatedVmContext, logs: string[]): void {
  const jail = context.global;
  jail.setSync("__mcp_console_log", (...args: unknown[]) => {
    logs.push(formatConsoleLine(args));
  });
  jail.setSync("__mcp_console_info", (...args: unknown[]) => {
    logs.push(formatConsoleLine(args));
  });
  jail.setSync("__mcp_console_warn", (...args: unknown[]) => {
    logs.push(formatConsoleLine(args));
  });
  jail.setSync("__mcp_console_error", (...args: unknown[]) => {
    logs.push(formatConsoleLine(args));
  });
}

function setProviderBindings(
  ivm: IsolatedVmModule,
  context: IsolatedVmContext,
  providers: ResolvedToolProvider[],
  signal: AbortSignal,
  deadline: number,
  hostErrorPrefix: string,
): void {
  const jail = context.global;

  for (const provider of providers) {
    for (const [safeToolName, descriptor] of Object.entries(provider.tools)) {
      const hostReferenceName = `__mcp_tool_${provider.name}_${safeToolName}`;

      jail.setSync(
        hostReferenceName,
        async (input: unknown) => {
          const executionContext = createExecutionContext(
            signal,
            provider.name,
            safeToolName,
            descriptor.originalName,
          );

          try {
            const normalizedInput =
              input === undefined
                ? undefined
                : toJsonValue(
                    input,
                    "Guest code passed a non-serializable tool input",
                  );
            const pendingExecution = Promise.resolve(
              descriptor.execute(normalizedInput, executionContext),
            );

            pendingExecution.catch(() => {
              // The deadline path may settle first; keep late provider rejections from
              // surfacing as unhandled promise rejections after timeout/abort.
            });
            const result = await runWithDeadline(
              pendingExecution,
              deadline,
              signal,
            );

            return toTransferableValue(ivm, result);
          } catch (error) {
            const executeError = toExecuteError(error, deadline);
            throw new Error(
              `${hostErrorPrefix}${JSON.stringify(executeError)}`,
              {
                cause: error,
              },
            );
          }
        },
        { reference: true },
      );
    }
  }
}

/**
 * isolated-vm-backed executor for one-shot sandboxed JavaScript runs.
 */
export class IsolatedVmExecutor implements Executor {
  private readonly loadModule: () => Promise<IsolatedVmModule>;
  private readonly maxLogChars: number;
  private readonly maxLogLines: number;
  private readonly memoryLimitBytes: number;
  private readonly timeoutMs: number;

  /**
   * Creates an isolated-vm executor with one-shot runtime limits and host bridging configuration.
   */
  constructor(options: IsolatedVmExecutorOptions = {}) {
    this.loadModule = async () => {
      const loaded = options.loadModule
        ? await options.loadModule()
        : await loadDefaultModule();
      return loaded as IsolatedVmModule;
    };
    this.maxLogChars = options.maxLogChars ?? DEFAULT_MAX_LOG_CHARS;
    this.maxLogLines = options.maxLogLines ?? DEFAULT_MAX_LOG_LINES;
    this.memoryLimitBytes =
      options.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT_BYTES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Executes JavaScript against the provided tool namespaces in a fresh isolated-vm context.
   */
  async execute(
    code: string,
    providers: ResolvedToolProvider[],
  ): Promise<ExecuteResult> {
    const startedAt = Date.now();
    const deadline = startedAt + this.timeoutMs;
    const logs: string[] = [];
    const abortController = new AbortController();
    const hostErrorPrefix = `__MCP_CODE_EXEC_HOST_ERROR__${randomUUID()}:`;
    const nodeMajorVersion = Number.parseInt(
      process.versions.node.split(".")[0] ?? "0",
      10,
    );

    if (nodeMajorVersion >= 20 && !hasRequiredNodeFlag()) {
      return {
        durationMs: Date.now() - startedAt,
        error: {
          code: "internal_error",
          message:
            "isolated-vm requires Node to run with --no-node-snapshot on Node 22+",
        },
        logs,
        ok: false,
      };
    }

    let catastrophicErrorMessage: string | undefined;
    let isolate: IsolatedVmIsolate | undefined;
    let context: IsolatedVmContext | undefined;

    try {
      const ivm = await this.loadModule();
      isolate = new ivm.Isolate({
        memoryLimit: toMemoryLimitMb(this.memoryLimitBytes),
        onCatastrophicError: (message) => {
          catastrophicErrorMessage = message;
          abortController.abort();
        },
      });
      context = await isolate.createContext();

      setConsoleBindings(context, logs);
      setProviderBindings(
        ivm,
        context,
        providers,
        abortController.signal,
        deadline,
        hostErrorPrefix,
      );
      await context.eval(
        createBootstrapSource(providers, hostErrorPrefix, this.timeoutMs),
        {
          timeout: this.timeoutMs,
        },
      );

      const execution = (await context.evalClosure(
        createExecutionSource(code),
        [],
        {
          timeout: this.timeoutMs,
          result: { copy: true, promise: true },
        },
      )) as GuestExecutionEnvelope;

      if (catastrophicErrorMessage) {
        return {
          durationMs: Date.now() - startedAt,
          error: {
            code: "internal_error",
            message: `isolated-vm catastrophic error: ${catastrophicErrorMessage}`,
          },
          logs: truncateLogs(logs, this.maxLogLines, this.maxLogChars),
          ok: false,
        };
      }

      if (!execution.ok) {
        return {
          durationMs: Date.now() - startedAt,
          error: toExecuteError(execution.error, deadline),
          logs: truncateLogs(logs, this.maxLogLines, this.maxLogChars),
          ok: false,
        };
      }

      return {
        durationMs: Date.now() - startedAt,
        logs: truncateLogs(logs, this.maxLogLines, this.maxLogChars),
        ok: true,
        result: execution.value,
      };
    } catch (error) {
      const executeError =
        catastrophicErrorMessage !== undefined
          ? {
              code: "internal_error" as const,
              message: `isolated-vm catastrophic error: ${catastrophicErrorMessage}`,
            }
          : toExecuteError(error, deadline);

      return {
        durationMs: Date.now() - startedAt,
        error: executeError,
        logs: truncateLogs(logs, this.maxLogLines, this.maxLogChars),
        ok: false,
      };
    } finally {
      abortController.abort();
      context?.release?.();
      isolate?.dispose();
    }
  }
}
