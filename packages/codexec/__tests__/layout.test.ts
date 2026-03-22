import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("codexec test layout", () => {
  it("keeps package-owned tests inside codexec packages", () => {
    expect(existsSync(path.join(repoRoot, "packages/codexec/__tests__"))).toBe(
      true,
    );
    expect(
      existsSync(path.join(repoRoot, "packages/codexec-quickjs/__tests__")),
    ).toBe(true);
    expect(
      existsSync(path.join(repoRoot, "packages/codexec-isolated-vm/__tests__")),
    ).toBe(true);
    expect(existsSync(path.join(repoRoot, "tests"))).toBe(false);
    expect(existsSync(path.join(repoRoot, "isolated-vm-tests"))).toBe(false);
  });
});
