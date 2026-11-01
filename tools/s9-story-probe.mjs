/**
 * Sprint 9 story metrics, save, hub card.
 * Usage: node tools/s9-story-probe.mjs [hub.jpg]
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "/usr/local/bin/google-chrome";

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
const debugPort = 9910 + Math.floor(Math.random() * 80);
const userData = mkdtempSync(join(ROOT, ".tmp-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`,
  "--remote-allow-origins=*", "--no-first-run", "--disable-background-networking", "about:blank",
], { stdio: "ignore" });
try {
  let page = null;
  for (let i = 0; i < 50 && !page; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    } catch { /* boot */ }
    if (!page) await new Promise((r) => setTimeout(r, 100));
  }
  if (!page) throw new Error("no page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve); ws.addEventListener("error", reject); });
  const cdp = new CDP(ws);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html` });
  const boot = await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      const t = performance.now();
      while (!window.__sublevel) {
        if (performance.now() - t > 15000) throw new Error("boot");
        await new Promise((r) => requestAnimationFrame(r));
      }
      const S = window.__sublevel;
      const words = S.storyMetrics();
      const save = S.saveProbe({});
      const throwOk = S.saveProbe({ throwWrites: true });
      S.setLang("it");
      const itTitle = document.getElementById("cTitle").textContent;
      S.hubProbe();
      const hubTitle = document.getElementById("cTitle").textContent;
      S.setLang("en");
      return { bouts: S.G ? 6 : 0, words, save, throwOk, itTitle, hubTitle, lang: S.setLang("en") };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (boot.exceptionDetails) throw new Error(boot.exceptionDetails.exception.description || "boot");
  console.log(JSON.stringify(boot.result.value, null, 2));
  const shot = process.argv[2];
  if (shot) {
    await new Promise((r) => setTimeout(r, 200));
    const pic = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 75 });
    const out = shot.startsWith("/") ? shot : join(ROOT, shot);
    writeFileSync(out, Buffer.from(pic.data, "base64"));
  }
  ws.close();
} finally {
  chrome.kill("SIGKILL");
  server.close();
  rmSync(userData, { recursive: true, force: true });
}
