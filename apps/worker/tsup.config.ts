import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Bundle workspace packages (they ship raw TS source, not a prebuilt
  // dist) while leaving real npm dependencies external — pino in
  // particular relies on dynamic `require()` internally and breaks if
  // esbuild inlines it.
  noExternal: [/^@aif\//],
  external: ["pino", "pino-pretty", "ioredis", "bullmq", "zod"],
});
