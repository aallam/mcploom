import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/mcp/index.ts"],
  fixedExtension: false,
  format: ["esm", "cjs"],
  platform: "node",
  sourcemap: true,
  target: "node20",
});
