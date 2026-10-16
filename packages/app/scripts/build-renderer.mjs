// Bundles the renderer (three.js, GSAP and our code) into renderer/bundle so the strict CSP
// (script-src 'self') is met without any CDN or inline script.
import { build } from "esbuild";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "renderer");
rmSync(join(root, "bundle"), { recursive: true, force: true });
await build({
  entryPoints: [join(root, "app.js")],
  outdir: join(root, "bundle"),
  bundle: true,
  splitting: true,
  format: "esm",
  target: "chrome120",
  minify: true,
  sourcemap: false,
  logLevel: "info",
});
