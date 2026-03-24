import { sanitizeIdentifier } from "./identifier";

/**
 * Converts a raw tool name into a safe JavaScript identifier.
 */
export function sanitizeToolName(name: string): string {
  return sanitizeIdentifier(name);
}
