/**
 * Pose rig: breath, weight, walk, jab shape, hit side, KO variants, secondary motion.
 * Usage: node tools/pose-probe.mjs [screenshot.jpg]
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOT = process.argv[2] || "";

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
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html` });
  const expr = `(async () => {
    const t = performance.now();
    while (!window.__sublevel || !window.__sublevel.poseProbe) {
      if (performance.now() - t > 15000) throw new Error("boot");
      await new Promise((r) => requestAnimationFrame(r));
    }
    return window.__sublevel.poseProbe();
  })()`;
  const out = await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (out.exceptionDetails) {
    const d = out.exceptionDetails.exception && out.exceptionDetails.exception.description;
    throw new Error(d || JSON.stringify(out.exceptionDetails));
  }
  console.log(JSON.stringify(out.result.value, null, 2));
  if (SHOT) {
    await cdp.send("Runtime.evaluate", {
      expression: `window.__sublevel.poseStill('ko')`,
      returnByValue: true,
    });
    for (let i = 0; i < 25; i++) {
      await cdp.send("Runtime.evaluate", { expression: `new Promise(r=>requestAnimationFrame(r))`, awaitPromise: true });
    }
    const pic = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
    writeFileSync(join(ROOT, SHOT), Buffer.from(pic.data, "base64"));
  }
  ws.close();
} finally {
  chrome.kill("SIGKILL");
  server.close();
  rmSync(userData, { recursive: true, force: true });
}
