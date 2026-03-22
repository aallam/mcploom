import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const packageJsonPath = path.join(repoRoot, "package.json");

function readPackageJson(): { scripts?: Record<string, string> } {
  return JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
}

describe("examples", () => {
  it("runs the analytics example script", () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts).toHaveProperty("example:analytics");
    expect(packageJson.scripts?.["example:analytics"]).toContain(
      "node --import tsx",
    );

    const result = spawnSync("npm", ["run", "example:analytics"], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Stats Snapshot");
  });

  it("runs the proxy example script", () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts).toHaveProperty("example:proxy");
    expect(packageJson.scripts?.["example:proxy"]).toContain(
      "node --import tsx",
    );

    const result = spawnSync("npm", ["run", "example:proxy"], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Available tools");
  });

  it("runs the codexec MCP server example script", () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts).toHaveProperty("example:codexec-mcp-server");
    expect(packageJson.scripts?.["example:codexec-mcp-server"]).toContain(
      "node --import tsx",
    );

    const result = spawnSync("npm", ["run", "example:codexec-mcp-server"], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("mcp server example result");
  });

  it("runs the aggregate examples script", () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts).toHaveProperty("examples");

    const result = spawnSync("npm", ["run", "examples"], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Stats Snapshot");
    expect(result.stdout).toContain("Available tools");
    expect(result.stdout).toContain("mcp server example result");
  }, 15_000);

  it("documents the examples entrypoint", () => {
    const examplesReadmePath = path.join(repoRoot, "examples", "README.md");
    const rootReadmePath = path.join(repoRoot, "README.md");

    expect(existsSync(examplesReadmePath)).toBe(true);
    expect(readFileSync(examplesReadmePath, "utf8")).toContain(
      "npm run example:codexec",
    );
    expect(readFileSync(rootReadmePath, "utf8")).toContain("examples/");
  });

  it("includes examples in TypeScript checking", () => {
    const tsconfigPath = path.join(repoRoot, "tsconfig.json");
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
      include?: string[];
    };

    expect(tsconfig.include).toContain("examples/**/*.ts");
  });
});
