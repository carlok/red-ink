/**
 * Mix check: sample peaks, duck, stems, crowd swell, saved volume.
 * Usage: node tools/audio-probe.mjs
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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

const EXPR = `(async () => {
  const t0 = performance.now();
  while (!window.__sublevel || !window.__sublevel.audioReady) {
    if (performance.now() - t0 > 15000) throw new Error("boot");
    await new Promise((r) => requestAnimationFrame(r));
  }
  const S = window.__sublevel;
  await S.audioReady();
  S.notePad();
  const pad = S.audioState().unlock;
  S.setUnlock("");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
  const key = S.audioState().unlock;
  const peaks = S.audioState().peaks;
  S.hit();
  const ducked = S.audioState().duck;
  S.audioTick(0.5);
  const recovered = S.audioState().duck;
  S.G.state = "fight";
  S.P.hp = 20; S.P.maxHp = 100; S.E.hp = 100; S.E.maxHp = 100; S.G.cheer = 0;
  for (let i = 0; i < 15; i++) S.audioTick(0.1);
  const tense = S.audioState().stems;
  S.G.state = "ko";
  for (let i = 0; i < 15; i++) S.audioTick(0.1);
  const finish = S.audioState().stems;
  S.G.state = "card"; S.G.cheer = 0;
  for (let i = 0; i < 15; i++) S.audioTick(0.1);
  const calm = S.audioState().stems;
  S.G.cheer = 0; S.audioTick(0);
  const crowd0 = S.audioState().crowd;
  S.G.cheer = 1; S.audioTick(0);
  const crowd1 = S.audioState().crowd;
  S.setAudio({ sfx: 0.25, music: 0.5, mute: true });
  const store = S.audioState().store;
  const painted = document.getElementById("snd").textContent;
  S.setAudio({ sfx: 1, music: 1, mute: false });
  return { peaks, ducked, recovered, pad, key, tense, finish, calm, crowd0, crowd1, store, painted };
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
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html` });
  const out = await cdp.send("Runtime.evaluate", { expression: EXPR, awaitPromise: true, returnByValue: true });
  if (out.exceptionDetails) {
    const d = out.exceptionDetails.exception && out.exceptionDetails.exception.description;
    throw new Error(d || JSON.stringify(out.exceptionDetails));
  }
  console.log(JSON.stringify(out.result.value, null, 2));
  ws.close();
} finally {
  chrome.kill("SIGKILL");
  server.close();
  rmSync(userData, { recursive: true, force: true });
}
