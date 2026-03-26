import type { ResolvedToolProvider } from "@mcploom/codexec";

import type { ProviderManifest } from "./messages";

/**
 * Converts resolved providers into transport-safe manifests that reveal only namespace metadata.
 */
export function extractProviderManifests(
  providers: ResolvedToolProvider[],
): ProviderManifest[] {
  return providers.map((provider) => ({
    name: provider.name,
    tools: Object.fromEntries(
      Object.entries(provider.tools).map(([safeToolName, descriptor]) => [
        safeToolName,
        {
          description: descriptor.description,
          originalName: descriptor.originalName,
          safeName: descriptor.safeName,
        },
      ]),
    ),
    types: provider.types,
  }));
}
