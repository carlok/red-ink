/**
 * Bundle the tree-shaken Babylon entry to lib/babylon.js.
 * Run from the repo root: node tools/build-engine.mjs
 */
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { copyFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "lib/babylon.js");

await build({
  entryPoints: [join(root, "tools/engine-entry.js")],
  bundle: true,
  format: "iife",
  globalName: "BABYLON",
  outfile,
  minify: true,
  legalComments: "none",
  target: "es2020",
  banner: {
    js: "/*! @babylonjs/core 9.30.0 and @babylonjs/loaders 9.30.0, Apache-2.0. Tree-shaken for Sublevel Three. License: lib/babylon.Apache-2.0.txt — https://github.com/BabylonJS/Babylon.js */",
  },
});

copyFileSync(join(root, "node_modules/@babylonjs/core/license.md"), join(root, "lib/babylon.Apache-2.0.txt"));

const bytes = readFileSync(outfile);
const gzip = gzipSync(bytes).length;
console.log(`lib/babylon.js ${bytes.length} bytes, gzip ${gzip}`);
if (gzip >= 2_000_000) {
  console.error("gzip is not under 2 MB");
  process.exit(1);
}
