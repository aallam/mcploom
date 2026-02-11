import type {
  MiddlewareContext,
  MiddlewareResult,
  ProxyMiddleware,
} from "./types.js";

/**
 * Creates a filter middleware that blocks/allows specific tools.
 */
export function filter(opts: {
  allow?: string[];
  deny?: string[];
}): ProxyMiddleware {
  return async (ctx, next) => {
    if (opts.deny?.includes(ctx.toolName)) {
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
    if (opts.allow && !opts.allow.includes(ctx.toolName)) {
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
}): ProxyMiddleware {
  const store = new Map<
    string,
    { result: MiddlewareResult; expiresAt: number }
  >();
  const maxSize = opts.maxSize ?? 1000;

  return async (ctx, next) => {
    const key = JSON.stringify({ tool: ctx.toolName, args: ctx.arguments });
    const cached = store.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const result = await next();

    // Only cache successful results
    if (!result.isError) {
      // Evict oldest if at capacity
      if (store.size >= maxSize) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.set(key, { result, expiresAt: Date.now() + opts.ttl * 1000 });
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
    const mw = middleware[index]!;
    index++;
    return mw(ctx, next);
  };

  return next();
}
