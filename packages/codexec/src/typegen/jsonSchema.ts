import { isValidIdentifier, serializePropertyName } from "../identifier";
import type { JsonSchema, TypegenToolDescriptor } from "../types";
import {
  indent,
  renderDocComment,
  renderNamespaceDeclaration,
} from "./render";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export { indent } from "./render";

/**
 * Converts a supported JSON Schema fragment into a TypeScript type expression.
 */
export function schemaToType(
  schema: JsonSchema | undefined,
  level = 0,
): string {
  if (!schema) {
    return "unknown";
  }

  if (
    "allOf" in schema ||
    "anyOf" in schema ||
    "oneOf" in schema ||
    "$ref" in schema ||
    Array.isArray(schema.type)
  ) {
    return "unknown";
  }

  switch (schema.type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array": {
      const itemType = schemaToType(
        isRecord(schema.items) ? (schema.items as JsonSchema) : undefined,
        level + 1,
      );

      if (isValidIdentifier(itemType)) {
        return `${itemType}[]`;
      }

      return `Array<${itemType}>`;
    }
    case "object": {
      const properties = isRecord(schema.properties) ? schema.properties : {};
      const required = new Set(
        Array.isArray(schema.required)
          ? schema.required.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
      );
      const entries = Object.entries(properties);

      if (entries.length === 0) {
        return "Record<string, unknown>";
      }

      const lines = entries.map(([name, propertySchema]) => {
        const propertyType = schemaToType(
          isRecord(propertySchema) ? (propertySchema as JsonSchema) : undefined,
          level + 1,
        );
        const optionalToken = required.has(name) ? "" : "?";
        return `${serializePropertyName(name)}${optionalToken}: ${propertyType};`;
      });

      return `{\n${indent(lines.join("\n"), level + 1)}\n${"  ".repeat(level)}}`;
    }
    default:
      return "unknown";
  }
}

function formatToolDeclaration(
  name: string,
  tool: TypegenToolDescriptor,
): string {
  const lines: string[] = [];
  const comment = tool.description ? renderDocComment([tool.description]) : "";
  if (comment) {
    lines.push(comment);
  }

  const inputType = schemaToType(tool.inputSchema);
  const outputType = schemaToType(tool.outputSchema);
  lines.push(`function ${name}(input: ${inputType}): Promise<${outputType}>;`);

  return lines.join("\n");
}

/**
 * Generates a namespace declaration for a provider's tool schemas.
 */
export function generateTypesFromJsonSchema(
  providerName: string,
  tools: Record<string, TypegenToolDescriptor>,
): string {
  return renderNamespaceDeclaration(
    providerName,
    Object.entries(tools).map(([name, tool]) =>
    formatToolDeclaration(name, tool),
    ),
  );
}
