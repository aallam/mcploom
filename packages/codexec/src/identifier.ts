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
 * Returns whether the value is a valid JavaScript identifier.
 */
export function isValidIdentifier(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

/**
 * Returns whether the identifier is reserved in JavaScript source.
 */
export function isReservedWord(value: string): boolean {
  return RESERVED_WORDS.has(value);
}

/**
 * Throws when the value cannot be used as a bare JavaScript identifier.
 */
export function assertValidIdentifier(
  value: string,
  label = "identifier",
): void {
  if (!isValidIdentifier(value) || isReservedWord(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

/**
 * Converts a raw identifier-like value into a safe JavaScript identifier.
 */
export function sanitizeIdentifier(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9_$]+/g, "_")
    .replace(/^_+|_+$/g, "");

  let safeName = sanitized.length > 0 ? sanitized : "_";

  if (/^[0-9]/.test(safeName)) {
    safeName = `_${safeName}`;
  }

  if (isReservedWord(safeName)) {
    safeName = `${safeName}_`;
  }

  return safeName;
}

/**
 * Renders the name as a bare identifier when possible, otherwise as a string literal.
 */
export function serializePropertyName(name: string): string {
  return isValidIdentifier(name) ? name : JSON.stringify(name);
}
