import { describe, it, expect, vi } from "vitest";

import {
  filter,
  cache,
  transform,
  executeMiddlewareChain,
} from "../src/middleware.js";
import { MemoryCacheStore } from "../src/cache-store.js";
import type {
  CacheStore,
  MiddlewareContext,
  MiddlewareResult,
} from "../src/types.js";

function makeCtx(toolName: string): MiddlewareContext {
  return {
    toolName,
    arguments: { query: "test" },
    server: "backend",
  };
}

const okResult: MiddlewareResult = {
  content: [{ type: "text", text: "ok" }],
};

describe("filter middleware", () => {
  it("denies blocked tools", async () => {
    const mw = filter({ deny: ["dangerous"] });
    const result = await mw(makeCtx("dangerous"), async () => okResult);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("denied");
  });

  it("allows non-blocked tools", async () => {
    const mw = filter({ deny: ["dangerous"] });
    const result = await mw(makeCtx("safe"), async () => okResult);
    expect(result).toEqual(okResult);
  });

  it("blocks tools not in allow list", async () => {
    const mw = filter({ allow: ["search", "browse"] });
    const result = await mw(makeCtx("delete"), async () => okResult);
    expect(result.isError).toBe(true);
  });

  it("allows tools in allow list", async () => {
    const mw = filter({ allow: ["search"] });
    const result = await mw(makeCtx("search"), async () => okResult);
    expect(result).toEqual(okResult);
  });
});

describe("cache middleware", () => {
  it("caches successful responses", async () => {
    const mw = cache({ ttl: 60 });
    const handler = vi.fn().mockResolvedValue(okResult);

    const ctx = makeCtx("search");
    await mw(ctx, handler);
    await mw(ctx, handler);

    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not cache error responses", async () => {
    const mw = cache({ ttl: 60 });
    const errorResult: MiddlewareResult = {
      content: [{ type: "text", text: "error" }],
      isError: true,
    };
    const handler = vi.fn().mockResolvedValue(errorResult);

    const ctx = makeCtx("fail");
    await mw(ctx, handler);
    await mw(ctx, handler);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("respects maxSize eviction", async () => {
    const mw = cache({ ttl: 60, maxSize: 1 });
    const handler = vi.fn().mockResolvedValue(okResult);

    // Fill cache with tool_a
    await mw(makeCtx("tool_a"), handler);
    // Fill cache with tool_b (evicts tool_a)
    await mw(makeCtx("tool_b"), handler);
    // tool_a should miss
    await mw(makeCtx("tool_a"), handler);

    expect(handler).toHaveBeenCalledTimes(3);
  });
});

describe("transform middleware", () => {
  it("transforms context before and result after", async () => {
    const mw = transform({
      before: (ctx) => ({ ...ctx, toolName: "transformed_" + ctx.toolName }),
      after: (result) => ({
        ...result,
        content: [{ type: "text", text: "modified" }],
      }),
    });

    const ctx = makeCtx("original");
    const handler = vi.fn().mockResolvedValue(okResult);
    const result = await mw(ctx, handler);

    expect(ctx.toolName).toBe("transformed_original");
    expect(result.content[0]!.text).toBe("modified");
  });
});

describe("executeMiddlewareChain", () => {
  it("executes middleware in order", async () => {
    const order: number[] = [];

    const mw1 = async (
      _ctx: MiddlewareContext,
      next: () => Promise<MiddlewareResult>,
    ) => {
      order.push(1);
      const result = await next();
      order.push(4);
      return result;
    };

    const mw2 = async (
      _ctx: MiddlewareContext,
      next: () => Promise<MiddlewareResult>,
    ) => {
      order.push(2);
      const result = await next();
      order.push(3);
      return result;
    };

    const handler = async () => {
      order.push(99);
      return okResult;
    };

    await executeMiddlewareChain([mw1, mw2], makeCtx("test"), handler);
    expect(order).toEqual([1, 2, 99, 3, 4]);
  });

  it("allows middleware to short-circuit", async () => {
    const blocker = async () => ({
      content: [{ type: "text", text: "blocked" }],
      isError: true as const,
    });

    const handler = vi.fn().mockResolvedValue(okResult);
    const result = await executeMiddlewareChain(
      [blocker],
      makeCtx("test"),
      handler,
    );

    expect(result.isError).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls handler directly with no middleware", async () => {
    const handler = vi.fn().mockResolvedValue(okResult);
    const result = await executeMiddlewareChain([], makeCtx("test"), handler);
    expect(result).toEqual(okResult);
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe("cache with custom store", () => {
  it("delegates get/set to the custom store", async () => {
    const store: CacheStore = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const mw = cache({ ttl: 30, store });
    const handler = vi.fn().mockResolvedValue(okResult);

    await mw(makeCtx("search"), handler);

    expect(store.get).toHaveBeenCalledOnce();
    expect(store.set).toHaveBeenCalledOnce();
    expect((store.set as ReturnType<typeof vi.fn>).mock.calls[0]![2]).toBe(30);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("returns cached value from custom store without calling next", async () => {
    const store: CacheStore = {
      get: vi.fn().mockResolvedValue(okResult),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const mw = cache({ ttl: 30, store });
    const handler = vi.fn().mockResolvedValue(okResult);

    const result = await mw(makeCtx("search"), handler);

    expect(result).toEqual(okResult);
    expect(handler).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });

  it("does not cache errors with custom store", async () => {
    const store: CacheStore = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const errorResult: MiddlewareResult = {
      content: [{ type: "text", text: "fail" }],
      isError: true,
    };
    const mw = cache({ ttl: 30, store });
    const handler = vi.fn().mockResolvedValue(errorResult);

    await mw(makeCtx("fail"), handler);

    expect(store.set).not.toHaveBeenCalled();
  });

  it("ignores maxSize when custom store is provided", async () => {
    const store: CacheStore = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    // maxSize should have no effect — the custom store manages its own capacity
    const mw = cache({ ttl: 30, maxSize: 1, store });
    const handler = vi.fn().mockResolvedValue(okResult);

    await mw(makeCtx("a"), handler);
    await mw(makeCtx("b"), handler);

    expect(store.set).toHaveBeenCalledTimes(2);
  });
});

describe("MemoryCacheStore", () => {
  it("returns undefined for a missing key", async () => {
    const store = new MemoryCacheStore();
    expect(await store.get("nope")).toBeUndefined();
  });

  it("returns undefined for an expired entry", async () => {
    const store = new MemoryCacheStore();
    await store.set("k", okResult, 0); // ttl=0 → expires immediately
    // Small delay to ensure Date.now() moves past expiresAt
    await new Promise((r) => setTimeout(r, 5));
    expect(await store.get("k")).toBeUndefined();
  });

  it("evicts oldest entry when maxSize is reached", async () => {
    const store = new MemoryCacheStore({ maxSize: 2 });
    const a: MiddlewareResult = {
      content: [{ type: "text", text: "a" }],
    };
    const b: MiddlewareResult = {
      content: [{ type: "text", text: "b" }],
    };
    const c: MiddlewareResult = {
      content: [{ type: "text", text: "c" }],
    };

    await store.set("a", a, 60);
    await store.set("b", b, 60);
    await store.set("c", c, 60); // should evict "a"

    expect(await store.get("a")).toBeUndefined();
    expect(await store.get("b")).toEqual(b);
    expect(await store.get("c")).toEqual(c);
  });

  it("delete removes an entry", async () => {
    const store = new MemoryCacheStore();
    await store.set("k", okResult, 60);
    expect(await store.get("k")).toEqual(okResult);
    await store.delete("k");
    expect(await store.get("k")).toBeUndefined();
  });
});
