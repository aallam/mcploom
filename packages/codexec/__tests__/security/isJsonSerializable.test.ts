import { describe, expect, it } from "vitest";

import { isJsonSerializable } from "@mcploom/codexec";

function buildDag(depth: number): Record<string, unknown> {
  let current: Record<string, unknown> = { leaf: true };
  for (let i = 0; i < depth; i++) {
    current = { a: current, b: current };
  }
  return current;
}

function buildTree(depth: number): Record<string, unknown> {
  if (depth === 0) {
    return { leaf: true };
  }
  return { a: buildTree(depth - 1), b: buildTree(depth - 1) };
}

describe("isJsonSerializable DAG exponential blowup", () => {
  it("completes quickly for a tree with no shared nodes (depth 15)", () => {
    // A tree of depth 15 has 2^15 = 32K unique nodes, each visited once.
    const tree = buildTree(15);
    const start = performance.now();
    const result = isJsonSerializable(tree);
    const elapsed = performance.now() - start;

    expect(result).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });

  it("exhibits exponential slowdown on DAGs with shared subtrees", () => {
    // A DAG of depth 20 has only 21 unique objects, but because seen.delete(value)
    // in the finally block clears visited nodes, isJsonSerializable revisits
    // shared subtrees on every path: 2^20 = ~1M effective visits.
    //
    // Compare with a DAG of depth 10 which has 2^10 = ~1K visits.
    // If the ratio is >> 1000x, the blowup is clearly exponential.
    const smallDag = buildDag(10);
    const largeDag = buildDag(20);

    const startSmall = performance.now();
    isJsonSerializable(smallDag);
    const elapsedSmall = performance.now() - startSmall;

    const startLarge = performance.now();
    isJsonSerializable(largeDag);
    const elapsedLarge = performance.now() - startLarge;

    // Depth 10 should be near-instant (< 10ms)
    // Depth 20 should take noticeably longer (hundreds of ms or more)
    // The ratio demonstrates exponential growth: each added depth level doubles time.
    //
    // VULNERABILITY: A malicious MCP tool returning a DAG-shaped object causes
    // isJsonSerializable (called in resolveProvider.ts:148) to block the host
    // event loop for an exponentially growing duration.
    expect(elapsedSmall).toBeLessThan(50);
    expect(elapsedLarge).toBeGreaterThan(elapsedSmall * 100);
  }, 30_000);

  it("correctly detects actual circular references", () => {
    const obj: Record<string, unknown> = { value: 1 };
    obj.self = obj;

    expect(isJsonSerializable(obj)).toBe(false);
  });
});
