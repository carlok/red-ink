/**
 * Lighthouse (local Chrome) + axe-core injected via CDP (no ChromeDriver).
 * Usage: npm run qa:a11y   (installs tools/qa first), or node tools/qa/lighthouse-a11y.mjs after npm ci --prefix tools/qa
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { findChrome } from "../chrome.mjs";
import { bootSublevel, createStaticServer, ROOT, withPage } from "../cdp-session.mjs";

const TOOL_ROOT = dirname(fileURLToPath(import.meta.url));   /* tools/qa: Lighthouse and axe live in its own package, so the regression's install stays small */
const LH = join(TOOL_ROOT, "node_modules", ".bin", "lighthouse");

const server = await createStaticServer();
const port = server.address().port;
const url = `http://127.0.0.1:${port}/index.html`;
const outDir = mkdtempSync(join(ROOT, ".tmp-lh-"));
const chromeBin = findChrome();

let lighthouse = {};
try {
  const lhPath = join(outDir, "lh.json");
  execSync(
    `${LH} ${JSON.stringify(url)} --output=json --output-path=${JSON.stringify(lhPath)} --chrome-flags=${JSON.stringify("--headless=new --no-sandbox")} --quiet --only-categories=accessibility --only-categories=best-practices`,
    {
      stdio: "pipe",
      timeout: 180000,
      env: { ...process.env, CHROME_PATH: chromeBin, CHROME: chromeBin },
    },
  );
  const raw = JSON.parse(readFileSync(lhPath, "utf8"));
  lighthouse = {
    accessibility: Math.round((raw.categories.accessibility?.score || 0) * 100),
    bestPractices: Math.round((raw.categories["best-practices"]?.score || 0) * 100),
  };
} catch (e) {
  lighthouse = { error: String(e.message || e).slice(0, 240) };
}

let axe = {};
try {
  await withPage(async (cdp) => {
    await bootSublevel(cdp);
    axe = await cdp.eval(
      `(async () => {
      if (!window.axe) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js";
          s.onload = resolve;
          s.onerror = () => reject(new Error("axe load"));
          document.head.appendChild(s);
        });
      }
      const res = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "best-practice"] },
      });
      return {
        violations: res.violations.length,
        ids: res.violations.map((v) => v.id),
        incomplete: res.incomplete.length,
      };
    })()`,
      true,
    );
  });
} catch (e) {
  axe = { error: String(e.message || e).slice(0, 240) };
}

server.close();
rmSync(outDir, { recursive: true, force: true });

console.log(JSON.stringify({ url, lighthouse, axe }, null, 2));
