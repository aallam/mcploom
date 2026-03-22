import {
  ExecuteFailure,
  isExecuteFailure,
  normalizeCode,
} from "@mcploom/codexec";
import type {
  ExecuteError,
  ExecuteResult,
  Executor,
  ResolvedToolProvider,
  ToolExecutionContext,
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
      };
      ok: false;
    };

const DEFAULT_MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_LOG_LINES = 100;
const DEFAULT_MAX_LOG_CHARS = 64_000;
const HOST_ERROR_PREFIX = "__MCP_CODE_EXEC_HOST_ERROR__";

let cachedModulePromise: Promise<IsolatedVmModule> | undefined;

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

function hasRequiredNodeFlag(): boolean {
  const execArgv = process.execArgv.join(" ");
  const nodeOptions = process.env.NODE_OPTIONS ?? "";
  return (
    execArgv.includes("--no-node-snapshot") ||
    nodeOptions.includes("--no-node-snapshot")
  );
}

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

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return String(error);
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

function formatConsoleLine(values: unknown[]): string {
  return values.map((value) => formatLogValue(value)).join(" ");
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
    isKnownErrorCode((error as { code?: unknown }).code) &&
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
      message: "Execution timed out",
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
    throw new ExecuteFailure("timeout", "Execution timed out");
  }

  const timeoutMs = remainingTime(deadline);
  if (timeoutMs <= 0) {
    throw new ExecuteFailure("timeout", "Execution timed out");
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new ExecuteFailure("timeout", "Execution timed out"));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      reject(new ExecuteFailure("timeout", "Execution timed out"));
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
  timeoutMs: number,
): string {
  const lines = [
    `const __MCP_HOST_ERROR_PREFIX = ${JSON.stringify(HOST_ERROR_PREFIX)};`,
    "const __mcpNormalizeError = (error) => {",
    "  if (error && typeof error === 'object' && typeof error.code === 'string' && typeof error.message === 'string') {",
    "    return { code: error.code, message: error.message };",
    "  }",
    "  if (error && typeof error.message === 'string' && error.message.startsWith(__MCP_HOST_ERROR_PREFIX)) {",
    "    try {",
    "      const payload = JSON.parse(error.message.slice(__MCP_HOST_ERROR_PREFIX.length));",
    "      if (payload && typeof payload.code === 'string' && typeof payload.message === 'string') {",
    "        return payload;",
    "      }",
    "    } catch {}",
    "  }",
    "  if (error && typeof error.message === 'string') {",
    "    return { code: 'runtime_error', message: error.message };",
    "  }",
    "  return { code: 'runtime_error', message: String(error) };",
    "};",
    "const __mcpRaiseNormalizedError = (error) => {",
    "  const normalized = __mcpNormalizeError(error);",
    "  const wrapped = new Error(normalized.message);",
    "  wrapped.code = normalized.code;",
    "  throw wrapped;",
    "};",
    "const __mcpToJsonValue = (value) => {",
    "  if (typeof value === 'undefined') {",
    "    return undefined;",
    "  }",
    "  const json = JSON.stringify(value);",
    "  if (typeof json === 'undefined') {",
    "    const error = new Error('Guest code returned a non-serializable value');",
    "    error.code = 'serialization_error';",
    "    throw error;",
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
    "    return { ok: false, error: __mcpNormalizeError(error) };",
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
            const result = await runWithDeadline(
              Promise.resolve(
                descriptor.execute(normalizedInput, executionContext),
              ),
              deadline,
              signal,
            );

            return toTransferableValue(ivm, result);
          } catch (error) {
            const executeError = toExecuteError(error, deadline);
            throw new Error(
              `${HOST_ERROR_PREFIX}${JSON.stringify(executeError)}`,
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
            "isolated-vm requires Node to run with --no-node-snapshot on Node 20+",
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
      );
      await context.eval(createBootstrapSource(providers, this.timeoutMs), {
        timeout: this.timeoutMs,
      });

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
