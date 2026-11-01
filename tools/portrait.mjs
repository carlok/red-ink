/**
 * Phone-portrait smoke check. Usage: node tools/portrait.mjs
 * Loads the game at 390x844 with touch emulation and blocked webfonts.
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
    const path = normalize(join(ROOT, decodeURIComponent(url.pathname) === "/" ? "index.html" : decodeURIComponent(url.pathname)));
    if (!path.startsWith(ROOT)) { res.writeHead(403); res.end("no"); return; }
    try {
      const body = readFileSync(path);
      res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404); res.end("missing");
    }
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
const debugPort = 9600 + Math.floor(Math.random() * 300);
const userData = mkdtempSync(join(ROOT, ".tmp-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`,
  "--remote-allow-origins=*", "--no-first-run", "--disable-background-networking",
  "--enable-precise-memory-info", "--hide-scrollbars", "--window-size=390,844", "about:blank",
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
  await cdp.send("Network.enable");
  await cdp.send("Network.setBlockedURLs", { urls: ["*://fonts.googleapis.com/*", "*://fonts.gstatic.com/*"] });
  const width = Number(process.argv[2] || 390);
  const height = Number(process.argv[3] || 844);
  const mobile = process.argv[4] !== "desktop";
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html` });
  const evaluated = await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      const t0 = performance.now();
      while (!window.__sublevel) { if (performance.now() - t0 > 15000) throw new Error("boot"); await raf(); }
      const touch = matchMedia("(pointer: coarse)").matches;
      window.__sublevel.startBout(0);
      const t = document.getElementById("touch");
      const stick = document.getElementById("stick").getBoundingClientRect();
      const btn = document.querySelector(".tb").getBoundingClientRect();
      const view = document.getElementById("view");
      const cs = getComputedStyle(view);
      const bs = getComputedStyle(document.querySelector(".tb"));
      return {
        touch, coarseClass: document.getElementById("app").classList.contains("is-touch"),
        touchHidden: t.hidden, stick: { w: Math.round(stick.width), h: Math.round(stick.height) },
        btn: { w: Math.round(btn.width), h: Math.round(btn.height) },
        canvas: { w: view.clientWidth, h: view.clientHeight },
        inner: { w: window.innerWidth, h: window.innerHeight },
        touchAction: { view: cs.touchAction, btn: bs.touchAction },
        meshes: BABYLON.Engine.LastCreatedScene.meshes.length,
        scale: BABYLON.Engine.LastCreatedEngine.getHardwareScalingLevel(),
        render: BABYLON.Engine.LastCreatedEngine.getRenderWidth() + "x" + BABYLON.Engine.LastCreatedEngine.getRenderHeight(),
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (evaluated.exceptionDetails) {
    throw new Error(evaluated.exceptionDetails.exception && evaluated.exceptionDetails.exception.description || "eval failed");
  }
  console.log(JSON.stringify(evaluated.result.value, null, 2));
  ws.close();
} finally {
  chrome.kill("SIGKILL");
  server.close();
  rmSync(userData, { recursive: true, force: true });
}
