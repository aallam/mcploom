import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(import.meta.dirname, "..");

function readSource(relativePath: string): string {
  return readFileSync(path.join(packageRoot, relativePath), "utf8");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expectDocBlock(source: string, declaration: string): void {
  const declarationPattern = declaration
    .trim()
    .split(/\s+/)
    .map((part) => escapeRegExp(part))
    .join(String.raw`\s+`);
  const pattern = new RegExp(
    String.raw`/\*\*[\s\S]*?\*/\s*${declarationPattern}`,
  );
  expect(source).toMatch(pattern);
}

describe("@mcploom/codexec-quickjs package surface", () => {
  it("exports QuickJsExecutor from the dedicated executor package", async () => {
    const quickjs = await import("@mcploom/codexec-quickjs");

    expect(quickjs).toHaveProperty("QuickJsExecutor");
  });

  it("documents the QuickJS executor package surface", () => {
    const quickjsTypes = readSource("src/types.ts");
    const quickjsExecutor = readSource("src/quickjsExecutor.ts");

    expectDocBlock(quickjsTypes, "export interface QuickJsExecutorOptions");
    expectDocBlock(quickjsExecutor, "export class QuickJsExecutor");
    expectDocBlock(quickjsExecutor, "async execute(");
  });
});
