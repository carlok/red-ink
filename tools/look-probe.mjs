/**
 * Picture budget: draws, GPU time, lights, crowd, HUD at 360 px.
 * Usage: node tools/look-probe.mjs [shot.jpg]
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

const EXPR = `(async () => {
  const t0 = performance.now();
  while (!window.__sublevel || !window.__sublevel.startBout) {
    if (performance.now() - t0 > 15000) throw new Error("boot");
    await new Promise((r) => requestAnimationFrame(r));
  }
  const S = window.__sublevel;
  const B = window.BABYLON;
  const engine = B.Engine.LastCreatedEngine;
  const scene = B.Engine.LastCreatedScene || engine.scenes[0];
  const round = (v) => Math.round(v * 1000) / 1000;
  const rgb = (c) => c ? [round(c.r), round(c.g), round(c.b)] : null;
  S.startBout(0);
  document.getElementById("wrap").hidden = true;
  const fightT = performance.now();
  while (S.G.state !== "fight") {
    if (performance.now() - fightT > 4000) break;
    await new Promise((r) => requestAnimationFrame(r));
  }
  await new Promise((r) => setTimeout(r, 300));
  const draws = [];
  let prev = engine._drawCalls.current;
  const yaws = [];
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    const now = engine._drawCalls.current;
    draws.push(now - prev);
    prev = now;
    const c = S.G && scene.meshes;
  }
  const crowd = scene.meshes.filter((m) => m.sourceMesh && /^b\\d+$/.test(m.name));
  const heads = scene.meshes.filter((m) => m.sourceMesh && /^h\\d+$/.test(m.name));
  const body = crowd[0];
  let yawSpan = 0;
  if (crowd.length) {
    const watch = crowd.slice(0, 8);
    watch.forEach((m) => { m.__ymin = m.__ymax = m.rotation.y; });
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      for (const m of watch) {
        m.__ymin = Math.min(m.__ymin, m.rotation.y);
        m.__ymax = Math.max(m.__ymax, m.rotation.y);
        yawSpan = Math.max(yawSpan, m.__ymax - m.__ymin);
      }
    }
  }
  const lights = scene.lights.map((L) => ({ name: L.name, intensity: round(L.intensity), diffuse: rgb(L.diffuse) }));
  const ipc = scene.imageProcessingConfiguration;
  const sg = scene.lights.map((L) => L.getShadowGenerator && L.getShadowGenerator()).find(Boolean);
  let gpu = null;
  try {
    const ei = new B.EngineInstrumentation(engine);
    ei.captureGPUFrameTime = true;
    for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
    gpu = round(ei.gpuFrameTimeCounter.average / 1e6);
    ei.dispose();
  } catch (e) { gpu = String(e.message || e); }
  let gpuHard = null;
  if (sg && sg.useBlurExponentialShadowMap) {
    sg.useBlurExponentialShadowMap = false;
    try {
      const ei = new B.EngineInstrumentation(engine);
      ei.captureGPUFrameTime = true;
      for (let i = 0; i < 16; i++) await new Promise((r) => requestAnimationFrame(r));
      gpuHard = round(ei.gpuFrameTimeCounter.average / 1e6);
      ei.dispose();
    } catch (e) { gpuHard = String(e.message || e); }
    sg.useBlurExponentialShadowMap = true;
  }
  const src = body && body.sourceMesh;
  const bb = src ? src.getBoundingInfo().boundingBox.extendSize : null;
  const med = draws.slice().sort((a, b) => a - b)[Math.floor(draws.length / 2)];
  const active = scene.getActiveMeshes ? scene.getActiveMeshes().length : null;
  function hud() {
    const names = [...document.querySelectorAll(".name")].map((el) => ({
      text: el.textContent,
      font: parseFloat(getComputedStyle(el).fontSize),
      track: getComputedStyle(el).letterSpacing,
      overflow: el.scrollWidth > el.clientWidth + 1,
      w: el.clientWidth
    }));
    const bar = document.querySelector(".bar");
    return { inner: window.innerWidth, names, bar: bar ? parseFloat(getComputedStyle(bar).height) : 0 };
  }
  const wide = hud();
  return {
    draw: med, active, meshes: scene.meshes.length,
    gpu, gpuHard, colorCurves: typeof B.ColorCurves,
    exposure: ipc.exposure, contrast: ipc.contrast, vignette: ipc.vignetteWeight,
    poisson: sg ? sg.usePoissonSampling : null,
    blur: sg ? sg.useBlurExponentialShadowMap : null,
    lights,
    crowd: {
      bodies: crowd.length, heads: heads.length,
      kind: body && body.metadata && body.metadata.kind || (src && src.metadata && src.metadata.kind) || "capsule",
      srcVerts: src && src.getTotalVertices ? src.getTotalVertices() : 0,
      ext: bb ? [round(bb.x * 2), round(bb.y * 2), round(bb.z * 2)] : null,
      yaw: round(yawSpan)
    },
    hud: wide
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
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html` });
  const out = await cdp.send("Runtime.evaluate", { expression: EXPR, awaitPromise: true, returnByValue: true });
  if (out.exceptionDetails) {
    const d = out.exceptionDetails.exception && out.exceptionDetails.exception.description;
    throw new Error(d || JSON.stringify(out.exceptionDetails));
  }
  if (SHOT) {
    const pic = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
    writeFileSync(join(ROOT, SHOT), Buffer.from(pic.data, "base64"));
  }
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 640, deviceScaleFactor: 2, mobile: true });
  await new Promise((r) => setTimeout(r, 200));
  const narrow = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const names = [...document.querySelectorAll(".name")].map((el) => ({
        text: el.textContent,
        font: parseFloat(getComputedStyle(el).fontSize),
        overflow: el.scrollWidth > el.clientWidth + 1,
        w: el.clientWidth
      }));
      const bar = document.querySelector(".bar");
      return { inner: window.innerWidth, names, bar: bar ? parseFloat(getComputedStyle(bar).height) : 0 };
    })()`,
    returnByValue: true,
  });
  const shot360 = SHOT ? SHOT.replace(/\.jpg$/, "-360.jpg") : "";
  if (shot360) {
    const pic = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
    writeFileSync(join(ROOT, shot360), Buffer.from(pic.data, "base64"));
  }
  console.log(JSON.stringify({ ...out.result.value, narrow: narrow.result && narrow.result.value }, null, 2));
  ws.close();
} finally {
  chrome.kill("SIGKILL");
  server.close();
  rmSync(userData, { recursive: true, force: true });
}
