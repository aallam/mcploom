const RESERVED_WORDS = new Set([
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

/**
 * Converts a raw tool name into a safe JavaScript identifier.
 */
export function sanitizeToolName(name: string): string {
  const sanitized = name
    .trim()
    .replace(/[^A-Za-z0-9_$]+/g, "_")
    .replace(/^_+|_+$/g, "");

  let safeName = sanitized.length > 0 ? sanitized : "_";

  if (/^[0-9]/.test(safeName)) {
    safeName = `_${safeName}`;
  }

  if (RESERVED_WORDS.has(safeName)) {
    safeName = `${safeName}_`;
  }

  return safeName;
}
