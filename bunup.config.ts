import { defineConfig } from "bunup";

export default defineConfig({
  entry: ["src/index.ts", "src/builders.ts"],
  format: ["esm", "cjs"],
  target: "node",
  shims: true,
  sourcemap: "linked",
  minify: false,
  splitting: false,
  // resolve path alias for dts generation
  dts: {
    inferTypes: true,
    resolve: [/^@\//],
  },
  clean: true,
  preferredTsconfig: "./tsconfig.build.json",
  report: { gzip: false },
  exports: { includePackageJson: false },
  outDir: "dist",
});
