/**
 * Embed a GLB as a script, so the model loads from file:// like the audio samples do.
 * Usage: node tools/embed-glb.mjs assets/quaternius-human/animated-human.glb quaternius-human
 * Writes the same path with .js, which sets window.SUBLEVEL_MODELS["quaternius-human"] to the file as base64.
 */
import { readFileSync, writeFileSync } from "node:fs";
const [src, key] = process.argv.slice(2);
if (!src || !key) { console.error("usage: node tools/embed-glb.mjs <file.glb> <key>"); process.exit(1); }
const out = src.replace(/\.glb$/i, ".js");
const b64 = readFileSync(src).toString("base64");
writeFileSync(out, `window.SUBLEVEL_MODELS=window.SUBLEVEL_MODELS||{};window.SUBLEVEL_MODELS[${JSON.stringify(key)}]="${b64}";\n`);
console.log(out, b64.length, "base64 characters");
