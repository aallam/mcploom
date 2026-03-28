import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const MANUAL_FIRST_RELEASE_PACKAGES = new Set([
  "@mcploom/codexec-protocol",
  "@mcploom/codexec-process",
  "@mcploom/codexec-worker",
  "@mcploom/codexec-remote",
]);

const rootDir = process.cwd();
const rootPackageJson = JSON.parse(
  await readFile(path.join(rootDir, "package.json"), "utf8"),
);

const workspacePackageJsons = await Promise.all(
  (rootPackageJson.workspaces ?? []).map(async (workspacePath) => {
    const packageJsonPath = path.join(rootDir, workspacePath, "package.json");
    return JSON.parse(await readFile(packageJsonPath, "utf8"));
  }),
);

const publicPackages = workspacePackageJsons.filter((pkg) => !pkg.private);

const registryStates = await Promise.all(
  publicPackages.map(async (pkg) => {
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}`,
      {
        headers: {
          accept: "application/json",
        },
      },
    );

    if (response.status === 404) {
      return {
        name: pkg.name,
        localVersion: pkg.version,
        exists: false,
        publishedVersions: [],
      };
    }

    if (!response.ok) {
      throw new Error(
        `Unable to query npm registry for ${pkg.name}: ${response.status} ${response.statusText}`,
      );
    }

    const body = await response.json();
    return {
      name: pkg.name,
      localVersion: pkg.version,
      exists: true,
      publishedVersions: Object.keys(body.versions ?? {}),
    };
  }),
);

const missingPackages = registryStates.filter((pkg) => !pkg.exists);
const missingManualFirstPackages = missingPackages.filter((pkg) =>
  MANUAL_FIRST_RELEASE_PACKAGES.has(pkg.name),
);
const unexpectedMissingPackages = missingPackages.filter(
  (pkg) => !MANUAL_FIRST_RELEASE_PACKAGES.has(pkg.name),
);
const unpublishedExistingPackages = registryStates.filter(
  (pkg) => pkg.exists && !pkg.publishedVersions.includes(pkg.localVersion),
);

if (unexpectedMissingPackages.length > 0) {
  console.error(
    "Found public workspace packages that do not exist on npm but are not marked for manual first release:",
  );
  for (const pkg of unexpectedMissingPackages) {
    console.error(`- ${pkg.name}@${pkg.localVersion}`);
  }
  process.exit(1);
}

if (missingManualFirstPackages.length > 0) {
  console.warn("Manual first-release packages are still missing from npm:");
  for (const pkg of missingManualFirstPackages) {
    console.warn(`- ${pkg.name}@${pkg.localVersion}`);
  }

  if (unpublishedExistingPackages.length > 0) {
    console.error(
      "Refusing to run `changeset publish` because normal release packages are ready, but the manual first-release packages are still missing.",
    );
    console.error(
      "Publish the manual packages first, then re-run this workflow.",
    );
    for (const pkg of unpublishedExistingPackages) {
      console.error(`- pending CI publish: ${pkg.name}@${pkg.localVersion}`);
    }
    process.exit(1);
  }

  console.log(
    "Skipping CI publish because only manual first-release packages are still unpublished on npm.",
  );
  process.exit(0);
}

await new Promise((resolve, reject) => {
  const child = spawn("npx", ["changeset", "publish"], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });

  child.on("error", reject);
  child.on("exit", (code, signal) => {
    if (signal) {
      reject(new Error(`changeset publish exited with signal ${signal}`));
      return;
    }

    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(`changeset publish exited with code ${code}`));
  });
});
