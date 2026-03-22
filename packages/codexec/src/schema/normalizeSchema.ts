import * as zod from "zod";
import type { ZodRawShape, ZodTypeAny } from "zod";

import type { JsonSchema, ToolSchema } from "../types";

const z = "z" in zod && typeof zod.z === "object" ? zod.z : zod;
const toJsonSchema =
  ("toJSONSchema" in zod ? zod.toJSONSchema : undefined) ??
  ("toJSONSchema" in z ? z.toJSONSchema : undefined);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isZodSchema(value: unknown): value is ZodTypeAny {
  return isRecord(value) && typeof value.safeParse === "function";
}

function isZodRawShape(value: unknown): value is ZodRawShape {
  return (
    isRecord(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every(isZodSchema)
  );
}

function normalizeZodSchema(schema: ZodTypeAny): JsonSchema {
  if (typeof toJsonSchema !== "function") {
    throw new Error("Installed zod package does not expose toJSONSchema");
  }

  const jsonSchema = toJsonSchema(schema) as JsonSchema & {
    $schema?: string;
  };

  if ("$schema" in jsonSchema) {
    const { $schema: _ignored, ...rest } = jsonSchema;
    return rest;
  }

  return jsonSchema;
}

/**
 * Normalizes supported tool schema inputs to the JSON Schema form used internally.
 */
export function normalizeToolSchema(
  schema: ToolSchema | undefined,
  phase: "input" | "output",
  toolName: string,
): JsonSchema | undefined {
  if (schema === undefined) {
    return undefined;
  }

  if (isZodSchema(schema)) {
    return normalizeZodSchema(schema);
  }

  if (isZodRawShape(schema)) {
    return normalizeZodSchema(z.object(schema));
  }

  if (isRecord(schema)) {
    return schema;
  }

  throw new Error(
    `Unsupported ${phase} schema for tool ${toolName}. Expected JSON Schema, a Zod schema, or an MCP-style Zod shape.`,
  );
}
