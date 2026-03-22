import { parse } from "acorn";
import type { Node } from "acorn";

type PositionedNode = Node & {
  end: number;
  start: number;
  body?: PositionedNode[];
  expression?: PositionedNode;
  async?: boolean;
  id?: {
    name: string;
  };
};

function stripCodeFences(source: string): string {
  const match = source.match(/^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/);
  return match ? match[1] : source;
}

function wrapAsync(body: string): string {
  if (body.trim().length === 0) {
    return "async () => {}";
  }

  return `async () => {\n${body}\n}`;
}

/**
 * Normalizes model-produced JavaScript into an executable async function body.
 */
export function normalizeCode(source: string): string {
  const normalizedSource = stripCodeFences(source).trim();

  if (normalizedSource.length === 0) {
    return "async () => {}";
  }

  try {
    const program = parse(normalizedSource, {
      ecmaVersion: "latest",
      sourceType: "module",
    }) as PositionedNode;

    if (program.body?.length === 1) {
      const [statement] = program.body;

      if (statement.type === "FunctionDeclaration" && statement.id?.name) {
        return wrapAsync(`${normalizedSource}\nreturn ${statement.id.name}();`);
      }

      if (statement.type === "ExpressionStatement" && statement.expression) {
        if (
          statement.expression.type === "ArrowFunctionExpression" &&
          statement.expression.async
        ) {
          return normalizedSource;
        }

        return wrapAsync(`return (${normalizedSource});`);
      }
    }

    const body = program.body ?? [];
    const lastStatement = body.at(-1);

    if (
      lastStatement?.type === "ExpressionStatement" &&
      lastStatement.expression
    ) {
      const bodyPrefix = normalizedSource
        .slice(0, lastStatement.start)
        .trimEnd();
      const expressionSource = normalizedSource.slice(
        lastStatement.expression.start,
        lastStatement.expression.end,
      );

      const lines = [];

      if (bodyPrefix.length > 0) {
        lines.push(bodyPrefix);
      }

      lines.push(`return (${expressionSource});`);

      return wrapAsync(lines.join("\n"));
    }

    return wrapAsync(normalizedSource);
  } catch {
    return wrapAsync(normalizedSource);
  }
}
