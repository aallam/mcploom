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

  it("handles shared-subtree DAGs without pathological slowdown", () => {
    const largeDag = buildDag(20);

    const startLarge = performance.now();
    const result = isJsonSerializable(largeDag);
    const elapsedLarge = performance.now() - startLarge;

    expect(result).toBe(true);
    expect(elapsedLarge).toBeLessThan(200);
  });

  it("correctly detects actual circular references", () => {
    const obj: Record<string, unknown> = { value: 1 };
    obj.self = obj;

    expect(isJsonSerializable(obj)).toBe(false);
  });
});
