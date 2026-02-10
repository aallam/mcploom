import { describe, it, expect } from "vitest";

import { byteSize, percentile, sortedInsert } from "../src/utils";

describe("byteSize", () => {
  it("returns 0 for null/undefined", () => {
    expect(byteSize(null)).toBe(0);
    expect(byteSize(undefined)).toBe(0);
  });

  it("measures string byte length", () => {
    expect(byteSize("hello")).toBe(5);
    expect(byteSize("héllo")).toBe(6); // é is 2 bytes in UTF-8
  });

  it("serializes objects to JSON", () => {
    expect(byteSize({ a: 1 })).toBe(7); // {"a":1}
  });
});

describe("percentile", () => {
  it("returns 0 for empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("returns the value for single-element array", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 99)).toBe(42);
  });

  it("computes p50 of even-length array", () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
  });

  it("computes p95 of large array", () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(arr, 95)).toBeCloseTo(95.05, 0);
  });
});

describe("sortedInsert", () => {
  it("inserts into empty array", () => {
    const arr: number[] = [];
    sortedInsert(arr, 5);
    expect(arr).toEqual([5]);
  });

  it("maintains sort order", () => {
    const arr = [1, 3, 5, 7];
    sortedInsert(arr, 4);
    expect(arr).toEqual([1, 3, 4, 5, 7]);
  });

  it("handles duplicates", () => {
    const arr = [1, 3, 5];
    sortedInsert(arr, 3);
    expect(arr).toEqual([1, 3, 3, 5]);
  });

  it("inserts at beginning", () => {
    const arr = [2, 4, 6];
    sortedInsert(arr, 1);
    expect(arr).toEqual([1, 2, 4, 6]);
  });

  it("inserts at end", () => {
    const arr = [2, 4, 6];
    sortedInsert(arr, 8);
    expect(arr).toEqual([2, 4, 6, 8]);
  });
});
