import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

describe("build tooling", () => {
  it("uses a private workspace root with analytics, proxy, and codexec packages", () => {
    const rootPackageJson = readJson<{
      name?: string;
      private?: boolean;
      scripts?: Record<string, string>;
      workspaces?: string[];
    }>(path.join(repoRoot, "package.json"));
    const analyticsPackageJson = readJson<{
      name: string;
      scripts?: Record<string, string>;
    }>(path.join(repoRoot, "packages/analytics/package.json"));
    const proxyPackageJson = readJson<{
      devDependencies?: Record<string, string>;
      name: string;
      scripts?: Record<string, string>;
    }>(path.join(repoRoot, "packages/proxy/package.json"));
    const codexecPackageJson = readJson<{
      dependencies?: Record<string, string>;
      name: string;
      scripts?: Record<string, string>;
    }>(path.join(repoRoot, "packages/codexec/package.json"));
    const quickjsPackageJson = readJson<{
      dependencies?: Record<string, string>;
      name: string;
      scripts?: Record<string, string>;
    }>(path.join(repoRoot, "packages/codexec-quickjs/package.json"));
    const isolatedVmPackageJson = readJson<{
      dependencies?: Record<string, string>;
      name: string;
      optionalDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    }>(path.join(repoRoot, "packages/codexec-isolated-vm/package.json"));

    expect(rootPackageJson.private).toBe(true);
    expect(rootPackageJson.name).toBe("mcploom-workspace");
    expect(rootPackageJson.workspaces).toEqual([
      "packages/analytics",
      "packages/proxy",
      "packages/codexec",
      "packages/codexec-quickjs",
      "packages/codexec-isolated-vm",
    ]);
    expect(rootPackageJson.scripts).toHaveProperty("build");
    expect(rootPackageJson.scripts).toHaveProperty("build:isolated-vm");
    expect(rootPackageJson.scripts).toHaveProperty("lint");
    expect(rootPackageJson.scripts).toHaveProperty("lint:fix");
    expect(rootPackageJson.scripts).toHaveProperty("format");
    expect(rootPackageJson.scripts).toHaveProperty("format:check");
    expect(rootPackageJson.scripts).toHaveProperty("test:isolated-vm");
    expect(rootPackageJson.scripts).toHaveProperty("typecheck:isolated-vm");
    expect(rootPackageJson.scripts).toHaveProperty("examples:isolated-vm");
    expect(rootPackageJson.scripts).toHaveProperty("verify:isolated-vm");
    expect(rootPackageJson.scripts?.build).not.toContain("codexec-isolated-vm");
    expect(rootPackageJson.scripts?.test).not.toContain("codexec-isolated-vm");
    expect(rootPackageJson.scripts?.examples).not.toContain(
      "codexec-isolated-vm",
    );

    expect(analyticsPackageJson.name).toBe("@mcploom/analytics");
    expect(analyticsPackageJson.scripts).toHaveProperty("build");
    expect(proxyPackageJson.name).toBe("@mcploom/proxy");
    expect(proxyPackageJson.devDependencies).toHaveProperty(
      "@mcploom/analytics",
    );
    expect(proxyPackageJson.scripts).toHaveProperty("build");

    expect(codexecPackageJson.name).toBe("@mcploom/codexec");
    expect(codexecPackageJson.dependencies).not.toHaveProperty(
      "quickjs-emscripten",
    );
    expect(codexecPackageJson.dependencies).not.toHaveProperty("isolated-vm");
    expect(codexecPackageJson.scripts).toHaveProperty("build");

    expect(quickjsPackageJson.name).toBe("@mcploom/codexec-quickjs");
    expect(quickjsPackageJson.dependencies).toHaveProperty("@mcploom/codexec");
    expect(quickjsPackageJson.dependencies).toHaveProperty(
      "quickjs-emscripten",
    );
    expect(quickjsPackageJson.scripts).toHaveProperty("build");

    expect(isolatedVmPackageJson.name).toBe("@mcploom/codexec-isolated-vm");
    expect(isolatedVmPackageJson.dependencies).toHaveProperty(
      "@mcploom/codexec",
    );
    expect(isolatedVmPackageJson.optionalDependencies).toHaveProperty(
      "isolated-vm",
    );
    expect(isolatedVmPackageJson.scripts).toHaveProperty("build");
  });

  it("uses package-local tsdown configs and split isolated-vm verification", () => {
    const tsconfig = readJson<{ include?: string[] }>(
      path.join(repoRoot, "tsconfig.json"),
    );

    expect(existsSync(path.join(repoRoot, "eslint.config.mjs"))).toBe(true);
    expect(existsSync(path.join(repoRoot, ".prettierrc.json"))).toBe(true);
    expect(existsSync(path.join(repoRoot, ".prettierignore"))).toBe(true);
    expect(
      existsSync(path.join(repoRoot, "packages/analytics/tsdown.config.ts")),
    ).toBe(true);
    expect(
      existsSync(path.join(repoRoot, "packages/proxy/tsdown.config.ts")),
    ).toBe(true);
    expect(
      existsSync(path.join(repoRoot, "packages/codexec/tsdown.config.ts")),
    ).toBe(true);
    expect(
      existsSync(
        path.join(repoRoot, "packages/codexec-quickjs/tsdown.config.ts"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(repoRoot, "packages/codexec-isolated-vm/tsdown.config.ts"),
      ),
    ).toBe(true);
    expect(
      existsSync(path.join(repoRoot, "vitest.isolated-vm.config.ts")),
    ).toBe(true);
    expect(existsSync(path.join(repoRoot, "tsconfig.isolated-vm.json"))).toBe(
      true,
    );
    expect(existsSync(path.join(repoRoot, "tsdown.config.ts"))).toBe(false);
    expect(tsconfig.include).toContain("packages/analytics/**/*.ts");
    expect(tsconfig.include).toContain("packages/proxy/**/*.ts");
    expect(tsconfig.include).toContain("packages/codexec/**/*.ts");
    expect(tsconfig.include).toContain("packages/codexec-quickjs/**/*.ts");
    expect(tsconfig.include).not.toContain(
      "packages/codexec-isolated-vm/**/*.ts",
    );
  });
});
