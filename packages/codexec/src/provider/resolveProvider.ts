import Ajv, { type AnySchemaObject, type ValidateFunction } from "ajv";

import {
  ExecuteFailure,
  isExecuteFailure,
  isJsonSerializable,
} from "../errors";
import { sanitizeToolName } from "../sanitize";
import { normalizeToolSchema } from "../schema/normalizeSchema";
import { generateTypesFromJsonSchema } from "../typegen/jsonSchema";
import type {
  JsonSchema,
  ResolvedToolDescriptor,
  ResolvedToolProvider,
  ToolExecutionContext,
  ToolProvider,
  TypegenToolDescriptor,
} from "../types";

const DEFAULT_PROVIDER_NAME = "codemode";
const RESERVED_NAMESPACE_WORDS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

function assertValidNamespace(name: string): void {
  if (
    !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ||
    RESERVED_NAMESPACE_WORDS.has(name)
  ) {
    throw new Error(`Invalid provider namespace: ${name}`);
  }
}

function compileValidator(
  ajv: Ajv,
  schema: JsonSchema | undefined,
): ValidateFunction | undefined {
  return schema ? ajv.compile(schema as AnySchemaObject) : undefined;
}

function formatValidationMessage(
  ajv: Ajv,
  phase: "input" | "output",
  toolName: string,
  validator: ValidateFunction,
): string {
  return `Invalid ${phase} for tool ${toolName}: ${ajv.errorsText(validator.errors)}`;
}

/**
 * Resolves a tool provider into the validated, sanitized shape consumed by executors.
 */
export function resolveProvider(provider: ToolProvider): ResolvedToolProvider {
  const name = provider.name ?? DEFAULT_PROVIDER_NAME;
  assertValidNamespace(name);

  const ajv = new Ajv({
    allErrors: true,
    strict: false,
  });

  const originalToSafeName: Record<string, string> = {};
  const safeToOriginalName: Record<string, string> = {};
  const usedSafeNames = new Set<string>();
  const resolvedTools: Record<string, ResolvedToolDescriptor> = {};
  const typegenTools: Record<string, TypegenToolDescriptor> = {};

  for (const [originalName, descriptor] of Object.entries(provider.tools)) {
    const baseSafeName = sanitizeToolName(originalName);
    let safeName = baseSafeName;
    let suffix = 2;

    while (usedSafeNames.has(safeName)) {
      safeName = `${baseSafeName}__${suffix}`;
      suffix += 1;
    }

    usedSafeNames.add(safeName);
    originalToSafeName[originalName] = safeName;
    safeToOriginalName[safeName] = originalName;

    const inputSchema = normalizeToolSchema(
      descriptor.inputSchema,
      "input",
      originalName,
    );
    const outputSchema = normalizeToolSchema(
      descriptor.outputSchema,
      "output",
      originalName,
    );
    const inputValidator = compileValidator(ajv, inputSchema);
    const outputValidator = compileValidator(ajv, outputSchema);

    resolvedTools[safeName] = {
      description: descriptor.description,
      execute: async (
        input: unknown,
        context: ToolExecutionContext,
      ): Promise<unknown> => {
        if (inputValidator && !inputValidator(input)) {
          throw new ExecuteFailure(
            "validation_error",
            formatValidationMessage(ajv, "input", originalName, inputValidator),
          );
        }

        try {
          const result = await descriptor.execute(input, context);

          if (!isJsonSerializable(result)) {
            throw new ExecuteFailure(
              "serialization_error",
              `Tool ${originalName} returned a non-serializable value`,
            );
          }

          if (outputValidator && !outputValidator(result)) {
            throw new ExecuteFailure(
              "validation_error",
              formatValidationMessage(
                ajv,
                "output",
                originalName,
                outputValidator,
              ),
            );
          }

          return result;
        } catch (error) {
          if (isExecuteFailure(error)) {
            throw error;
          }

          throw new ExecuteFailure(
            "tool_error",
            error instanceof Error
              ? error.message
              : `Tool ${originalName} failed`,
          );
        }
      },
      inputSchema,
      originalName,
      outputSchema,
      safeName,
    };

    typegenTools[safeName] = {
      description: descriptor.description,
      inputSchema,
      outputSchema,
    };
  }

  return {
    name,
    originalToSafeName,
    safeToOriginalName,
    tools: resolvedTools,
    types: provider.types ?? generateTypesFromJsonSchema(name, typegenTools),
  };
}
