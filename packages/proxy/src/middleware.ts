import { MemoryCacheStore } from "./cache-store.js";
import { globToRegex } from "./router.js";
import type {
  CacheStore,
  MiddlewareContext,
  MiddlewareResult,
  ProxyMiddleware,
} from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function normalizeForCacheKey(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForCacheKey);
  }
  if (isPlainObject(value)) {
    const normalized: Record<string, unknown> = {};
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    for (const [key, entryValue] of entries) {
      normalized[key] = normalizeForCacheKey(entryValue);
    }
    return normalized;
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForCacheKey(value));
}

/**
 * Creates a filter middleware that blocks/allows specific tools.
 */
export function filter(opts: {
  allow?: string[];
  deny?: string[];
}): ProxyMiddleware {
  const denyPatterns = (opts.deny ?? []).map(globToRegex);
  const allowPatterns = opts.allow?.map(globToRegex);

  return async (ctx, next) => {
    if (denyPatterns.some((pattern) => pattern.test(ctx.toolName))) {
      return {
        content: [
          {
            type: "text",
            text: `Tool "${ctx.toolName}" is denied by filter policy`,
          },
        ],
        isError: true,
      };
    }
    if (allowPatterns && !allowPatterns.some((pattern) => pattern.test(ctx.toolName))) {
      return {
        content: [
          { type: "text", text: `Tool "${ctx.toolName}" is not in allow list` },
        ],
        isError: true,
      };
    }
    return next();
  };
}

/**
 * Creates a caching middleware for tool call responses.
 */
export function cache(opts: {
  ttl: number;
  maxSize?: number;
  store?: CacheStore;
}): ProxyMiddleware {
  const store = opts.store ?? new MemoryCacheStore({ maxSize: opts.maxSize });

  return async (ctx, next) => {
    const key = stableStringify({ tool: ctx.toolName, args: ctx.arguments });
    const cached = await store.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const result = await next();

    // Only cache successful results
    if (!result.isError) {
      await store.set(key, result, opts.ttl);
    }

    return result;
  };
}

/**
 * Creates a transform middleware that modifies requests and/or responses.
 */
export function transform(opts: {
  before?: (ctx: MiddlewareContext) => MiddlewareContext;
  after?: (result: MiddlewareResult) => MiddlewareResult;
}): ProxyMiddleware {
  return async (ctx, next) => {
    const transformed = opts.before ? opts.before(ctx) : ctx;
    // Mutate context in place so downstream sees the changes
    Object.assign(ctx, transformed);
    const result = await next();
    return opts.after ? opts.after(result) : result;
  };
}

/**
 * Execute a middleware chain, calling the final handler at the end.
 */
export function executeMiddlewareChain(
  middleware: ProxyMiddleware[],
  ctx: MiddlewareContext,
  handler: () => Promise<MiddlewareResult>,
): Promise<MiddlewareResult> {
  let index = 0;

  const next = (): Promise<MiddlewareResult> => {
    if (index >= middleware.length) {
      return handler();
    }
    const mw = middleware[index];
    index++;
    return mw(ctx, next);
  };

  return next();
}
