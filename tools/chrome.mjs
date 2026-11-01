/**
 * Resolve a Chrome or Chromium binary for headless probes (Linux VM or macOS).
 */
import { accessSync, constants } from "node:fs";

const candidates = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/local/bin/google-chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

export function findChrome() {
  for (const p of candidates) {
    try {
      accessSync(p, constants.X_OK);
      return p;
    } catch {
      /* try next */
    }
  }
  throw new Error("Chrome/Chromium not found. Set CHROME to your binary path.");
}

export const CHROME = findChrome();
