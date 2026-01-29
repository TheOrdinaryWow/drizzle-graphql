import { defineConfig } from "bunup";

export default defineConfig({
  entry: ["src/index.ts", "src/builders.ts"],
  format: ["esm", "cjs"],
  target: "node",
  shims: true,
  sourcemap: "linked",
  minify: false,
  splitting: false,
  dts: true,
  clean: true,
  preferredTsconfig: "./tsconfig.build.json",
  report: { gzip: false },
  outDir: "dist",
});
