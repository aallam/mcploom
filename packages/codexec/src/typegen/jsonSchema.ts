import type { JsonSchema, TypegenToolDescriptor } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}


/**
 * Indents each line of the given string by a specified number of levels (default is 1).
 */
export function indent(value: string, level = 1): string {
  return value
    .split("\n")
    .map((line) => `${"  ".repeat(level)}${line}`)
    .join("\n");
}

function serializePropertyName(name: string): string {
  return isIdentifier(name) ? name : JSON.stringify(name);
}

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

      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(itemType)) {
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

  if (tool.description) {
    lines.push("/**");
    lines.push(` * ${tool.description}`);
    lines.push(" */");
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
  const declarations = Object.entries(tools).map(([name, tool]) =>
    formatToolDeclaration(name, tool),
  );

  if (declarations.length === 0) {
    return `declare namespace ${providerName} {}`;
  }

  return `declare namespace ${providerName} {\n${indent(declarations.join("\n\n"))}\n}`;
}
