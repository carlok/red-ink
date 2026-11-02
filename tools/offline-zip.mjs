/**
 * Build an offline-play zip (file:// friendly). Usage: node tools/offline-zip.mjs [out.zip]
 */
import { createWriteStream } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(ROOT, "dist");
mkdirSync(distDir, { recursive: true });
const out = process.argv[2] ? join(ROOT, process.argv[2]) : join(distDir, "sublevel-three-offline.zip");

const files = [
  "index.html",
  ".nojekyll",
  "LICENSE",
  "NOTICE",
  "lib/babylon.js",
  "lib/babylon.Apache-2.0.txt",
  "audio/samples.js",
  "audio/CC0.txt",
  "assets/quaternius-human/animated-human.js",
  "assets/quaternius-human/License.txt",
  "assets/fonts",
];

for (const f of files) {
  execSync(`test -e ${JSON.stringify(join(ROOT, f))}`);
}

const list = files.map((f) => JSON.stringify(f)).join(" ");
execSync(`cd ${JSON.stringify(ROOT)} && zip -q -r ${JSON.stringify(out)} ${list}`, { stdio: "inherit" });

console.log(JSON.stringify({ ok: true, path: out, files: files.length }, null, 2));
