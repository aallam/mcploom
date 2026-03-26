import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: [
    "src/index.ts",
    "src/runner/index.ts",
    "src/runner/protocolEndpoint.ts",
  ],
  fixedExtension: false,
  format: ["esm", "cjs"],
  platform: "node",
  sourcemap: true,
  target: "node20",
});
