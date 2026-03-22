import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readSource(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
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

describe("public API docs", () => {
  it("documents the codexec package surface", () => {
    const errors = readSource("packages/codexec/src/errors.ts");
    const normalize = readSource("packages/codexec/src/normalize.ts");
    const sanitize = readSource("packages/codexec/src/sanitize.ts");
    const executor = readSource("packages/codexec/src/executor/executor.ts");
    const provider = readSource(
      "packages/codexec/src/provider/resolveProvider.ts",
    );
    const typegen = readSource("packages/codexec/src/typegen/jsonSchema.ts");
    const types = readSource("packages/codexec/src/types.ts");
    const mcpCreate = readSource(
      "packages/codexec/src/mcp/createMcpToolProvider.ts",
    );
    const mcpCode = readSource("packages/codexec/src/mcp/codeMcpServer.ts");

    expectDocBlock(errors, "export class ExecuteFailure");
    expectDocBlock(errors, "export function isExecuteFailure");
    expectDocBlock(errors, "export function isJsonSerializable");
    expectDocBlock(normalize, "export function normalizeCode");
    expectDocBlock(sanitize, "export function sanitizeToolName");
    expectDocBlock(executor, "export interface Executor");
    expectDocBlock(provider, "export function resolveProvider");
    expectDocBlock(typegen, "export function generateTypesFromJsonSchema");
    expectDocBlock(types, "export type JsonSchema");
    expectDocBlock(types, "export type ExecuteErrorCode");
    expectDocBlock(types, "export interface ExecuteError");
    expectDocBlock(types, "export type ExecuteResult");
    expectDocBlock(types, "export interface ToolExecutionContext");
    expectDocBlock(types, "export interface ToolDescriptor");
    expectDocBlock(types, "export interface ToolProvider");
    expectDocBlock(types, "export interface ResolvedToolDescriptor");
    expectDocBlock(types, "export interface ResolvedToolProvider");
    expectDocBlock(types, "export type TypegenToolDescriptor");
    expectDocBlock(mcpCreate, "export type McpToolSource");
    expectDocBlock(mcpCreate, "export interface CreateMcpToolProviderOptions");
    expectDocBlock(mcpCreate, "export async function createMcpToolProvider");
    expectDocBlock(mcpCode, "export interface CodeMcpServerOptions");
    expectDocBlock(mcpCode, "export async function codeMcpServer");
  });

  it("documents the executor package surface", () => {
    const quickjsTypes = readSource("packages/codexec-quickjs/src/types.ts");
    const quickjsExecutor = readSource(
      "packages/codexec-quickjs/src/quickjsExecutor.ts",
    );
    const isolatedTypes = readSource(
      "packages/codexec-isolated-vm/src/types.ts",
    );
    const isolatedExecutor = readSource(
      "packages/codexec-isolated-vm/src/isolatedVmExecutor.ts",
    );

    expectDocBlock(quickjsTypes, "export interface QuickJsExecutorOptions");
    expectDocBlock(quickjsExecutor, "export class QuickJsExecutor");
    expectDocBlock(quickjsExecutor, "async execute(");
    expectDocBlock(isolatedTypes, "export interface IsolatedVmExecutorOptions");
    expectDocBlock(isolatedExecutor, "export class IsolatedVmExecutor");
    expectDocBlock(isolatedExecutor, "async execute(");
  });
});
