/**
 * Frame-rate independence of the live fight loop.
 * Usage: node tools/step-probe.mjs [ticks]
 * For each frame length the page overrides engine.getDeltaTime, seeds the rng, starts bout 1 with a player who
 * stands still, and records the fight state at the end of every sim tick. A fixed step means the rows match
 * at every frame length. "Still frames" counts drawn frames where the walking enemy did not move: interpolation
 * keeps that near zero even when the screen runs faster than the 60 Hz tick.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TICKS = Number(process.argv[2] || 900);
const FRAMES_MS = [50, 1000 / 30, 1000 / 60, 1000 / 120, 1000 / 144];

function serve() {
  const types = { ".html": "text/html", ".js": "text/javascript", ".txt": "text/plain" };
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const rel = decodeURIComponent(url.pathname);
    const path = normalize(join(ROOT, rel === "/" ? "index.html" : rel));
    if (!path.startsWith(ROOT)) { res.writeHead(403); res.end("no"); return; }
    try {
      const body = readFileSync(path);
      res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch { res.writeHead(404); res.end("missing"); }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

/* Natural frames, no override: how many ticks each drawn frame ran. A 0 is a frame that showed the same pose twice, a 2 is a frame that skipped one. */
const NATURAL = `(async () => {
  const t0 = performance.now();
  while (!window.__sublevel || !window.__sublevel.startBout) {
    if (performance.now() - t0 > 15000) throw new Error("boot");
    await new Promise((r) => requestAnimationFrame(r));
  }
  const S = window.__sublevel;
  S.startBout(0);
  document.getElementById("wrap").hidden = true;
  await new Promise((r) => setTimeout(r, 500));
  const hist = {}; let last = S.G.ticks, frames = 0;
  while (frames < 600) {
    await new Promise((r) => requestAnimationFrame(r));
    const k = S.G.ticks - last; last = S.G.ticks; frames++;
    hist[k] = (hist[k] || 0) + 1;
  }
  return hist;
})()`;

const expr = (dtMs) => `(async () => {
  const t0 = performance.now();
  while (!window.__sublevel || !window.__sublevel.startBout) {
    if (performance.now() - t0 > 15000) throw new Error("boot");
    await new Promise((r) => requestAnimationFrame(r));
  }
  const S = window.__sublevel, engine = window.BABYLON.Engine.LastCreatedEngine;
  const rows = [], f = (n) => n.toFixed(6);
  S.seed(11);
  S.startBout(0);
  document.getElementById("wrap").hidden = true;
  S.G.ticks = 0;
  S.G.trace = (k) => rows.push([k, f(S.P.hp), f(S.E.hp), f(S.P.pos.x), f(S.P.pos.z), f(S.E.pos.x), f(S.E.pos.z), S.P.state, S.E.state].join("|"));
  engine.getDeltaTime = () => ${dtMs};
  let frames = 0, still = 0, moving = 0, px = null, pz = null;
  while (rows.length < ${TICKS} && performance.now() - t0 < 120000) {
    await new Promise((r) => requestAnimationFrame(r));
    frames++;
    const x = S.E.pos.x, z = S.E.pos.z;
    if (px !== null && S.E.moveAmt > 0.5) { moving++; if (Math.abs(x - px) + Math.abs(z - pz) < 1e-7) still++; }
    px = x; pz = z;
  }
  S.G.trace = null;
  delete engine.getDeltaTime;
  return { dtMs: ${dtMs}, frames, moving, still, rows };
})()`;

const server = await serve();
const port = server.address().port;
const debugPort = 9900 + Math.floor(Math.random() * 80);
const userData = mkdtempSync(join(ROOT, ".tmp-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`,
  "--remote-allow-origins=*", "--no-first-run", "--disable-background-networking",
  "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });
const runs = [];
let natural = null;
try {
  let page = null;
  for (let i = 0; i < 50 && !page; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    } catch { /* booting */ }
    if (!page) await new Promise((r) => setTimeout(r, 100));
  }
  if (!page) throw new Error("no page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve); ws.addEventListener("error", reject); });
  const cdp = new CDP(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  for (const ms of FRAMES_MS) {
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html` });
    await new Promise((r) => setTimeout(r, 400));
    const out = await cdp.send("Runtime.evaluate", { expression: expr(ms), awaitPromise: true, returnByValue: true });
    if (out.exceptionDetails) {
      const d = out.exceptionDetails.exception && out.exceptionDetails.exception.description;
      throw new Error(d || JSON.stringify(out.exceptionDetails));
    }
    runs.push(out.result.value);
  }
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html` });
  await new Promise((r) => setTimeout(r, 400));
  const nat = await cdp.send("Runtime.evaluate", { expression: NATURAL, awaitPromise: true, returnByValue: true });
  natural = nat.result.value;
  ws.close();
} finally {
  chrome.kill("SIGKILL");
  server.close();
  try { rmSync(userData, { recursive: true, force: true }); } catch { /* chrome still closing */ }
}

const ref = runs.find((r) => Math.abs(r.dtMs - 1000 / 60) < 0.01);
for (const r of runs) {
  const n = Math.min(r.rows.length, ref.rows.length);
  let first = -1;
  for (let i = 0; i < n; i++) if (r.rows[i] !== ref.rows[i]) { first = i; break; }
  const last = r.rows[r.rows.length - 1].split("|");
  console.log(
    `${(1000 / r.dtMs).toFixed(0).padStart(4)} fps  frames ${String(r.frames).padStart(5)}  ticks ${r.rows.length}  ` +
    `${first < 0 ? "identical to 60 fps over " + n + " ticks" : "FIRST DIFFERENCE at tick " + (first + 1) + ": " + r.rows[first] + " vs " + ref.rows[first]}  ` +
    `end P ${last[1]} E ${last[2]} ${last[7]}/${last[8]}  still frames ${r.still}/${r.moving}`
  );
}
console.log(`natural frames, ticks run per drawn frame over 600 frames: ${JSON.stringify(natural)}`);
