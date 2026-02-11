import type { CacheStore, MiddlewareResult } from "./types.js";

interface CacheEntry {
  result: MiddlewareResult;
  expiresAt: number;
}

/**
 * In-memory cache store backed by a `Map`.
 *
 * Expired entries are cleaned up lazily on `get`. When the store reaches
 * `maxSize` it evicts the oldest entry (FIFO) before inserting a new one.
 */
export class MemoryCacheStore implements CacheStore {
  private readonly store = new Map<string, CacheEntry>();
  private readonly maxSize: number;

  constructor(opts?: { maxSize?: number }) {
    this.maxSize = opts?.maxSize ?? 1000;
  }

  async get(key: string): Promise<MiddlewareResult | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.result;
  }

  async set(key: string, value: MiddlewareResult, ttl: number): Promise<void> {
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, {
      result: value,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
