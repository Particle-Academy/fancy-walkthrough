import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ["react", "react-dom", "@particle-academy/react-fancy"],
  // Client component -- mark so React Server Component frameworks treat it as
  // a client boundary.
  banner: { js: '"use client";' },
});
