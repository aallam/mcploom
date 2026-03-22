import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function readJson(relativePath: string): unknown {
  const filePath = path.resolve(import.meta.dirname, "../../..", relativePath);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

describe("mcploom workspace contract", () => {
  test("publishes the renamed mcploom package family", () => {
    const rootPackageJson = readJson("package.json") as {
      name?: string;
    };
    const analyticsPackageJson = readJson(
      "packages/analytics/package.json",
    ) as {
      name?: string;
    };
    const proxyPackageJson = readJson("packages/proxy/package.json") as {
      devDependencies?: Record<string, string>;
      name?: string;
    };
    const codexecPackageJson = readJson("packages/codexec/package.json") as {
      name?: string;
    };
    const codexecQuickJsPackageJson = readJson(
      "packages/codexec-quickjs/package.json",
    ) as { name?: string };
    const codexecIsolatedVmPackageJson = readJson(
      "packages/codexec-isolated-vm/package.json",
    ) as { name?: string };

    expect(rootPackageJson.name).toBe("mcploom-workspace");
    expect(analyticsPackageJson.name).toBe("@mcploom/analytics");
    expect(proxyPackageJson.name).toBe("@mcploom/proxy");
    expect(proxyPackageJson.devDependencies).toHaveProperty(
      "@mcploom/analytics",
    );
    expect(codexecPackageJson.name).toBe("@mcploom/codexec");
    expect(codexecQuickJsPackageJson.name).toBe("@mcploom/codexec-quickjs");
    expect(codexecIsolatedVmPackageJson.name).toBe(
      "@mcploom/codexec-isolated-vm",
    );
  });

  test("contains the codexec package directories in the monorepo", () => {
    const rootDir = path.resolve(import.meta.dirname, "../../..");

    expect(existsSync(path.join(rootDir, "packages/codexec"))).toBe(true);
    expect(existsSync(path.join(rootDir, "packages/codexec-quickjs"))).toBe(
      true,
    );
    expect(existsSync(path.join(rootDir, "packages/codexec-isolated-vm"))).toBe(
      true,
    );
  });
});
