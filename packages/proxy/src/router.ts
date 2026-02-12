import type { RoutingRule } from "./types.js";

/**
 * Converts a simple glob pattern to a regex.
 * Supports * (any chars) and ? (single char).
 */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, String.raw`\$&`)
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^${escaped}$`);
}

/**
 * Router matches tool names against routing rules (first match wins).
 */
export class Router {
  private readonly compiled: Array<{ regex: RegExp; server: string }>;

  constructor(rules: RoutingRule[]) {
    this.compiled = rules.map((rule) => ({
      regex: globToRegex(rule.pattern),
      server: rule.server,
    }));
  }

  /**
   * Resolve which backend server should handle a given tool name.
   * Returns the server name, or undefined if no rule matches.
   */
  resolve(toolName: string): string | undefined {
    for (const rule of this.compiled) {
      if (rule.regex.test(toolName)) {
        return rule.server;
      }
    }
    return undefined;
  }
}
