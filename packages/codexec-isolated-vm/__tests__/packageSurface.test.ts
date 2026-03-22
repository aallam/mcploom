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

describe("@mcploom/codexec-isolated-vm package surface", () => {
  it("exports IsolatedVmExecutor from the dedicated executor package", async () => {
    const isolatedVm = await import("@mcploom/codexec-isolated-vm");

    expect(isolatedVm).toHaveProperty("IsolatedVmExecutor");
  });

  it("documents the isolated-vm executor package surface", () => {
    const isolatedTypes = readSource("src/types.ts");
    const isolatedExecutor = readSource("src/isolatedVmExecutor.ts");

    expectDocBlock(isolatedTypes, "export interface IsolatedVmExecutorOptions");
    expectDocBlock(isolatedExecutor, "export class IsolatedVmExecutor");
    expectDocBlock(isolatedExecutor, "async execute(");
  });
});
