import type { ResolvedToolProvider } from "@mcploom/codexec";

/**
 * Serializable subset of a resolved tool provider.
 *
 * Contains only the metadata needed by a runner to generate provider stubs
 * in the guest sandbox. The actual `execute` closures stay on the host.
 */
export interface ProviderManifest {
  name: string;
  tools: Record<
    string,
    { safeName: string; originalName: string; description?: string }
  >;
  types: string;
}

/**
 * Extracts serializable manifests from resolved providers.
 */
export function extractManifests(
  providers: ResolvedToolProvider[],
): ProviderManifest[] {
  return providers.map((provider) => ({
    name: provider.name,
    tools: Object.fromEntries(
      Object.entries(provider.tools).map(([key, descriptor]) => [
        key,
        {
          safeName: descriptor.safeName,
          originalName: descriptor.originalName,
          description: descriptor.description,
        },
      ]),
    ),
    types: provider.types,
  }));
}
