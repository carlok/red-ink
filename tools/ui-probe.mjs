/**
 * HUD, pause, and layout at four sizes.
 * Usage: node tools/ui-probe.mjs
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SIZES = [[1280, 720], [768, 1024], [390, 844], [844, 390]];

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

const LAYOUT = `(() => {
  const go = document.getElementById("go").getBoundingClientRect();
  const wrap = document.getElementById("wrap");
  document.getElementById("app").classList.add("is-touch");
  document.getElementById("touch").hidden = false;
  const jab = document.querySelector('.tb[data-act="jab"]').getBoundingClientRect();
  const names = [...document.querySelectorAll(".name")].map((el) => el.scrollWidth > el.clientWidth + 1);
  const rgb = (s) => (s.match(/\\d+/g) || []).slice(0, 3).map(Number);
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const x = L(a), y = L(b); const hi = Math.max(x, y), lo = Math.min(x, y); return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100; };
  const keys = document.getElementById("keys");
  const ks = getComputedStyle(keys);
  const name = document.querySelector(".name");
  const ns = getComputedStyle(name);
  const eHp = getComputedStyle(document.getElementById("eHp"));
  const pHp = getComputedStyle(document.getElementById("pHp"));
  return {
    inner: [window.innerWidth, window.innerHeight],
    goPast: Math.round(go.bottom - window.innerHeight),
    wrapScrolls: wrap.scrollHeight > wrap.clientHeight + 2,
    jabPast: Math.round(jab.bottom - window.innerHeight),
    nameOverflow: names.some(Boolean),
    nameContrast: ratio(rgb(ns.color), [10, 10, 11]),
    keyContrast: ratio(rgb(ks.color), rgb(ks.backgroundColor).length ? rgb(ks.backgroundColor) : [20, 21, 22]),
    keyBg: ks.backgroundColor,
    enemyPattern: eHp.backgroundImage !== "none",
    playerPattern: pHp.backgroundImage !== "none"
  };
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
  const boot = await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      const t = performance.now();
      while (!window.__sublevel) {
        if (performance.now() - t > 15000) throw new Error("boot");
        await new Promise((r) => requestAnimationFrame(r));
      }
      const S = window.__sublevel;
      return {
        pause: !!document.getElementById("pause"),
        tutor: !!document.getElementById("tutor"),
        shake: typeof S.shakeMul === "function" ? S.shakeMul() : 1
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (boot.exceptionDetails) throw new Error(boot.exceptionDetails.exception.description || "boot");
  const layouts = [];
  for (const [w, h] of SIZES) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
    await new Promise((r) => setTimeout(r, 80));
    const row = await cdp.send("Runtime.evaluate", { expression: LAYOUT, returnByValue: true });
    if (row.exceptionDetails) throw new Error(row.exceptionDetails.exception.description || "layout");
    layouts.push(row.result.value);
  }
  console.log(JSON.stringify({ ...boot.result.value, layouts }, null, 2));
  const behavior = await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      const S = window.__sublevel;
      S.startBout(0);
      const t = performance.now();
      while (S.G.state !== "fight") {
        if (performance.now() - t > 4000) break;
        await new Promise((r) => requestAnimationFrame(r));
      }
      await new Promise((r) => setTimeout(r, 200));
      const t0 = S.G.t;
      S.pauseFight();
      await new Promise((r) => setTimeout(r, 350));
      const frozen = S.G.state === "pause" && Math.abs(S.G.t - t0) < 0.05;
      const pauseOpen = !document.getElementById("pause").hidden;
      S.P.hp = 40;
      S.restartBout();
      const hp = S.P.hp;
      S.setLessMotion(true);
      const off = S.shakeMul();
      S.setLessMotion(false);
      const on = S.shakeMul();
      return { frozen, hp, off, on, tutor: S.tutorInfo(), pauseOpen };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (behavior.exceptionDetails) throw new Error(behavior.exceptionDetails.exception.description || "behavior");
  console.log(JSON.stringify(behavior.result.value, null, 2));
  if (process.argv[2]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Runtime.evaluate", {
      expression: `document.getElementById("wrap").hidden=true; document.getElementById("tutor").hidden=true; window.__sublevel.pauseFight()`,
      returnByValue: true,
    });
    await new Promise((r) => setTimeout(r, 200));
    const pic = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(ROOT, process.argv[2]), Buffer.from(pic.data, "base64"));
  }
  ws.close();
} finally {
  chrome.kill("SIGKILL");
  server.close();
  rmSync(userData, { recursive: true, force: true });
}
