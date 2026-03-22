import { describe, expect, it } from "vitest";
import { generateTypesFromJsonSchema } from "@mcploom/codexec";

describe("generateTypesFromJsonSchema", () => {
  it("emits namespace declarations for object schemas with required and optional fields", () => {
    const declarations = generateTypesFromJsonSchema("mcp", {
      search: {
        description: "Search docs",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            limit: { type: "integer" },
          },
        },
        outputSchema: {
          type: "object",
          required: ["hits"],
          properties: {
            hits: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
        execute: async () => undefined,
      },
    });

    expect(declarations).toContain("declare namespace mcp");
    expect(declarations).toContain("Search docs");
    expect(declarations).toContain("function search(input:");
    expect(declarations).toContain("query: string;");
    expect(declarations).toContain("limit?: number;");
    expect(declarations).toContain("Promise<{");
    expect(declarations).toContain("hits: string[];");
  });

  it("supports nested objects and arrays", () => {
    const declarations = generateTypesFromJsonSchema("mcp", {
      search: {
        inputSchema: {
          type: "object",
          properties: {
            filters: {
              type: "object",
              properties: {
                regions: {
                  type: "array",
                  items: { type: "string" },
                },
              },
            },
          },
        },
        outputSchema: {
          type: "object",
          properties: {
            results: {
              type: "array",
              items: {
                type: "object",
                required: ["id"],
                properties: {
                  id: { type: "string" },
                },
              },
            },
          },
        },
        execute: async () => undefined,
      },
    });

    expect(declarations).toContain("regions?: string[];");
    expect(declarations).toContain("results?: Array<{");
    expect(declarations).toContain("id: string;");
  });

  it("degrades unsupported schema fragments to unknown", () => {
    const declarations = generateTypesFromJsonSchema("mcp", {
      search: {
        inputSchema: {
          oneOf: [{ type: "string" }, { type: "number" }],
        },
        execute: async () => undefined,
      },
    });

    expect(declarations).toContain(
      "function search(input: unknown): Promise<unknown>;",
    );
  });
});
