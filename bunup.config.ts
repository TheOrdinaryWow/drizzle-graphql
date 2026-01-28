import { defineConfig } from "bunup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  target: "node",
  shims: true,
  sourcemap: "linked",
  minify: false,
  dts: true,
  clean: true,
  preferredTsconfig: "./tsconfig.build.json",
  report: { gzip: false },
  outDir: "dist",
});
