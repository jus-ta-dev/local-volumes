import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/bootstrap/main.ts"],
  outfile: "dist/bootstrap.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"],
});
await build({
  entryPoints: ["src/renderer.ts"],
  outfile: "dist/renderer.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome120",
});
await build({
  entryPoints: ["src/setup.ts"],
  outfile: "dist/setup.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
});
