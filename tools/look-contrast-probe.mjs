/**
 * Contrast of the random looks: draws 5000 seeds from randomLook and checks every pair in LOOK_MIN (CIE Lab ΔE) is far enough apart.
 * Also draws 2000 whole sessions (the Auditor plus the six opponents, S.skinLooks(5)) and checks no two people share a skin, hair, shirt,
 * pants or shoe colour: the least ΔE per slot over all 21 pairs against LOOK_UNIQUE, and how many sessions have a clash.
 * Usage: node tools/look-contrast-probe.mjs   (prints the minimum and mean ΔE per pair, the count of violations, and that a seed repeats)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FILE = "file://" + join(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
const userData = mkdtempSync(join(tmpdir(), "look-chrome-"));
const port = 9300 + Math.floor(Math.random() * 90);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, "--remote-allow-origins=*", "--no-first-run", "--disable-background-networking", "about:blank"], { stdio: "ignore" });
try {
  let page = null;
  for (let i = 0; i < 50 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {} if (!page) await new Promise((r) => setTimeout(r, 100)); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pend = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: FILE });
  const out = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: `(async () => {
    const t0 = performance.now();
    while (!window.__sublevel) { if (performance.now() - t0 > 15000) return { boot: false }; await new Promise((r) => requestAnimationFrame(r)); }
    const S = window.__sublevel, N = 5000, keys = Object.keys(S.LOOK_MIN), mins = {}, sums = {};
    keys.forEach((k) => { mins[k] = 1e9; sums[k] = 0; });
    let bad = 0, fallback = 0, hexOk = 0, sy = [1e9, 0], sx = [1e9, 0];
    const skins = new Set(), hairs = new Set(), shirts = new Set();
    for (let i = 1; i <= N; i++) {
      const L = S.randomLook(i), d = S.lookDeltas(L);
      keys.forEach((k) => { mins[k] = Math.min(mins[k], d[k]); sums[k] += d[k]; });
      if (!S.lookOk(L)) bad++;
      if (L.shirt === "#243b6b" || L.shirt === "#f2efe6") fallback++;
      if ([L.skin, L.hair, L.shirt, L.pants, L.shoes].every((c) => /^#[0-9a-fA-F]{6}$/.test(c))) hexOk++;
      sy = [Math.min(sy[0], L.sy), Math.max(sy[1], L.sy)]; sx = [Math.min(sx[0], L.sx), Math.max(sx[1], L.sx)];
      skins.add(L.skin); hairs.add(L.hair); shirts.add(L.shirt);
    }
    const r1 = (v) => Math.round(v * 10) / 10;
    const slots = Object.keys(S.LOOK_UNIQUE), uMin = {}; slots.forEach((k) => { uMin[k] = 1e9; });
    const T = window.__sublevel, savedSeed = T.SKIN.seed; let sessClash = 0, selfBad = 0;
    for (let n = 1; n <= 2000; n++) {
      T.SKIN.seed = n * 104729;
      const crowd = [T.P.L, ...S.skinLooks(5)].map((L) => ({ L, c: S.lookSlots(L) }));
      let clash = false;
      for (let a = 0; a < crowd.length; a++) {
        if (a > 0 && !S.lookOk(crowd[a].L)) selfBad++;
        for (let b = a + 1; b < crowd.length; b++) slots.forEach((k) => {
          const d = S.colorDelta(crowd[a].c[k], crowd[b].c[k]); uMin[k] = Math.min(uMin[k], d); if (d < S.LOOK_UNIQUE[k]) clash = true;
        });
      }
      if (clash) sessClash++;
    }
    T.SKIN.seed = savedSeed;
    return { N, bad, fallback, hexOk, deterministic: JSON.stringify(S.randomLook(77)) === JSON.stringify(S.randomLook(77)),
      min: Object.fromEntries(keys.map((k) => [k, r1(mins[k])])), mean: Object.fromEntries(keys.map((k) => [k, r1(sums[k] / N)])),
      required: S.LOOK_MIN, sy, sx, distinct: { skin: skins.size, hair: hairs.size, shirt: shirts.size },
      sessions: { N: 2000, withClash: sessClash, selfContrastViolations: selfBad, leastDeltaE: Object.fromEntries(slots.map((k) => [k, r1(uMin[k])])), floors: S.LOOK_UNIQUE } };
  })()` });
  console.log(JSON.stringify(out.result.result.value));
  ws.close();
} finally {
  chrome.kill("SIGKILL"); await new Promise((r) => setTimeout(r, 500)); try { rmSync(userData, { recursive: true, force: true }); } catch {}
}
