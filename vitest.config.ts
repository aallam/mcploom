import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@mcploom/analytics",
        replacement: path.join(repoRoot, "packages/analytics/src/index.ts"),
      },
      {
        find: "@mcploom/proxy",
        replacement: path.join(repoRoot, "packages/proxy/src/index.ts"),
      },
      {
        find: "@mcploom/codexec/mcp",
        replacement: path.join(repoRoot, "packages/codexec/src/mcp/index.ts"),
      },
      {
        find: "@mcploom/codexec-quickjs",
        replacement: path.join(
          repoRoot,
          "packages/codexec-quickjs/src/index.ts",
        ),
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
    include: ["packages/*/__tests__/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["isolated-vm-tests/**/*.test.ts"],
  },
});
