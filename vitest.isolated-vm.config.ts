import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@mcploom/codexec-isolated-vm",
        replacement: path.join(
          repoRoot,
          "packages/codexec-isolated-vm/src/index.ts",
        ),
      },
      {
        find: "@mcploom/codexec/mcp",
        replacement: path.join(repoRoot, "packages/codexec/src/mcp/index.ts"),
      },
      {
        find: "@mcploom/codexec",
        replacement: path.join(repoRoot, "packages/codexec/src/index.ts"),
      },
    ],
  },
  test: {
    environment: "node",
    globals: true,
    include: ["isolated-vm-tests/**/*.test.ts"],
  },
});
