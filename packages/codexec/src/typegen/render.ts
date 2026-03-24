/**
 * Indents each line of the given string by a specified number of levels.
 */
export function indent(value: string, level = 1): string {
  return value
    .split("\n")
    .map((line) => `${"  ".repeat(level)}${line}`)
    .join("\n");
}

/**
 * Renders a short TSDoc-style block when documentation is available.
 */
export function renderDocComment(lines: string[]): string {
  if (lines.length === 0) {
    return "";
  }

  return [
    "/**",
    ...lines.map((line) => ` * ${line}`),
    " */",
  ].join("\n");
}

/**
 * Renders a namespace declaration with optional members.
 */
export function renderNamespaceDeclaration(
  name: string,
  members: string[],
): string {
  if (members.length === 0) {
    return `declare namespace ${name} {}`;
  }

  return `declare namespace ${name} {\n${indent(members.join("\n\n"))}\n}`;
}
