/**
 * Opponent habits: reaction, tells, echo, punish, corner, fight log.
 * Usage: node tools/ai-probe.mjs
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const server = await serve();
const port = server.address().port;
const debugPort = 9900 + Math.floor(Math.random() * 80);
const userData = mkdtempSync(join(ROOT, ".tmp-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`,
  "--remote-allow-origins=*", "--no-first-run", "--disable-background-networking",
  "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });
const t0 = Date.now();
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
  const expr = `(async () => {
    const t = performance.now();
    while (!window.__sublevel || !window.__sublevel.probeAI) {
      if (performance.now() - t > 15000) throw new Error("boot");
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { ms: Math.round(performance.now() - t), probe: window.__sublevel.probeAI() };
  })()`;
  const out = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (out.exceptionDetails) {
    const d = out.exceptionDetails.exception && out.exceptionDetails.exception.description;
    throw new Error(d || JSON.stringify(out.exceptionDetails));
  }
  console.log(JSON.stringify({ wallMs: Date.now() - t0, ...out.result.value }, null, 2));
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  const shot = await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      const S = window.__sublevel;
      S.startBout(0);
      document.getElementById('wrap').hidden = true;
      document.getElementById('hud').hidden = false;
      const t0 = performance.now();
      while (S.G.state !== 'fight') {
        if (performance.now() - t0 > 5000) return { saw: false };
        await new Promise((r) => requestAnimationFrame(r));
      }
      for (let i = 0; i < 240; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const E = S.E;
        if (E && E.ai && E.ai.tell > 0.12 && E.alert && E.alert.isEnabled()) return { saw: true, tell: Math.round(E.ai.tell * 1000) / 1000 };
      }
      return { saw: false };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const seen = shot.result && shot.result.value;
  if (seen && seen.saw) {
    const pic = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
    writeFileSync(join(ROOT, "tuning/s5-tell.jpg"), Buffer.from(pic.data, "base64"));
  }
  console.error(JSON.stringify({ shot: seen }));
  ws.close();
} finally {
  chrome.kill("SIGKILL");
  server.close();
  rmSync(userData, { recursive: true, force: true });
}
