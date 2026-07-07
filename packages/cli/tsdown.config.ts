import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  dts: false,
  fixedExtension: false,
  // Workspace packages are devDependencies → bundled; runtime deps stay external.
});
