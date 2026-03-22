import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageJsonPath = path.join(repoRoot, "package.json");

function readPackageJson(): { scripts?: Record<string, string> } {
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
}

describe("isolated-vm examples", () => {
  it("runs the isolated-vm example script", () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts).toHaveProperty("example:codexec-isolated-vm");

    const result = spawnSync("npm", ["run", "example:codexec-isolated-vm"], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("isolated-vm example result");
  });
});
