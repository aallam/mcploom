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

describe("@mcploom/codexec package surface", () => {
  it("exports the core symbols without bundling QuickJS", async () => {
    const core = await import("@mcploom/codexec");

    expect(core).toHaveProperty("normalizeCode");
    expect(core).toHaveProperty("sanitizeToolName");
    expect(core).toHaveProperty("resolveProvider");
    expect(core).not.toHaveProperty("QuickJsExecutor");
  });

  it("exports the MCP adapter symbols", async () => {
    const mcp = await import("@mcploom/codexec/mcp");

    expect(mcp).toHaveProperty("createMcpToolProvider");
    expect(mcp).toHaveProperty("codeMcpServer");
  });

  it("documents the codexec package surface", () => {
    const errors = readSource("src/errors.ts");
    const normalize = readSource("src/normalize.ts");
    const sanitize = readSource("src/sanitize.ts");
    const executor = readSource("src/executor/executor.ts");
    const provider = readSource("src/provider/resolveProvider.ts");
    const typegen = readSource("src/typegen/jsonSchema.ts");
    const types = readSource("src/types.ts");
    const mcpCreate = readSource("src/mcp/createMcpToolProvider.ts");
    const mcpCode = readSource("src/mcp/codeMcpServer.ts");

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
});
