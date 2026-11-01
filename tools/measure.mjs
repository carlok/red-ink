/**
 * Headless Chrome probe for Sublevel Three.
 * Samples draw calls, mesh counts, boot time, heap across restarts, and a GLB swap.
 * Usage: node tools/measure.mjs [screenshot.jpg]
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOT = process.argv[2] || join(ROOT, "tuning", "s1-baseline.jpg");

const TYPES = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

function serve(root) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const rel = decodeURIComponent(url.pathname);
    const path = normalize(join(root, rel === "/" ? "index.html" : rel));
    if (!path.startsWith(root)) {
      res.writeHead(403);
      res.end("no");
      return;
    }
    let body;
    try {
      body = readFileSync(path);
    } catch {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[extname(path)] || "application/octet-stream",
      "cache-control": "no-store",
      "content-length": body.length,
    });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function minimalGlb() {
  const positions = Buffer.from(new Float32Array([0, 0, 0, 0, 1.7, 0, 0.4, 0.8, 0.2]).buffer);
  const indices = Buffer.from(new Uint16Array([0, 1, 2]).buffer);
  let bin = Buffer.concat([positions, indices]);
  if (bin.length % 4) bin = Buffer.concat([bin, Buffer.alloc(4 - (bin.length % 4), 0)]);
  const jsonObj = {
    asset: { version: "2.0", generator: "sublevel-probe" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "probe" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [0.4, 1.7, 0.2] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  };
  let json = Buffer.from(JSON.stringify(jsonObj));
  const pad = (4 - (json.length % 4)) % 4;
  if (pad) json = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const total = 12 + 8 + json.length + 8 + bin.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  let o = 12;
  out.writeUInt32LE(json.length, o);
  out.writeUInt32LE(0x4e4f534a, o + 4);
  json.copy(out, o + 8);
  o += 8 + json.length;
  out.writeUInt32LE(bin.length, o);
  out.writeUInt32LE(0x004e4942, o + 4);
  bin.copy(out, o + 8);
  return out;
}

function fileSizes() {
  const names = ["index.html", "lib/babylon.js", "lib/babylonjs.loaders.min.js"].filter((n) => {
    try {
      statSync(join(ROOT, n));
      return true;
    } catch {
      return false;
    }
  });
  return names.map((n) => {
    const buf = readFileSync(join(ROOT, n));
    return { file: n, bytes: buf.length, gzip: gzipSync(buf).length };
  });
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }
}

async function waitFor(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      /* chrome still booting */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("chrome devtools not ready: " + url);
}

const PROBE = String.raw`
(async (glbB64) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const t0 = performance.now();
  while (!window.__sublevel) {
    if (performance.now() - t0 > 20000) throw new Error("boot timeout");
    await raf();
  }
  const bootMs = performance.now();
  const B = BABYLON;
  const engine = B.Engine.LastCreatedEngine;
  const scene = B.Engine.LastCreatedScene;
  const key = scene.getLightByName("key");
  const sg = key.getShadowGenerator();
  const ipc = scene.imageProcessingConfiguration;
  const qlog = [];
  let last = "";
  const markQ = () => {
    const sig = [
      engine.getHardwareScalingLevel().toFixed(3),
      !!sg.usePoissonSampling,
      !!key.shadowEnabled,
      !!ipc.toneMappingEnabled,
      !!ipc.vignetteEnabled,
      engine.getRenderWidth() + "x" + engine.getRenderHeight(),
    ].join("|");
    if (sig !== last) {
      last = sig;
      qlog.push({ t: Math.round(performance.now()), sig, fps: Math.round(engine.getFps()) });
    }
  };
  scene.onAfterRenderObservable.add(markQ);

  const sample = async (n) => {
    const rows = [];
    let prev = engine._drawCalls.current;
    const obs = scene.onAfterRenderObservable.add(() => {
      const now = engine._drawCalls.current;
      const active = scene.getActiveMeshes();
      rows.push({
        draw: now - prev,
        active: active.length,
        meshes: scene.meshes.length,
        dt: engine.getDeltaTime(),
        verts: scene.getTotalVertices(),
      });
      prev = now;
    });
    for (let i = 0; i < n + 1; i++) await raf();
    scene.onAfterRenderObservable.remove(obs);
    return rows.slice(1, n + 1);
  };
  const med = (xs) => {
    const a = xs.filter((x) => Number.isFinite(x)).slice().sort((p, q) => p - q);
    if (!a.length) return null;
    return a[Math.floor(a.length / 2)];
  };
  const summarize = (rows) => ({
    frames: rows.length,
    draw: med(rows.map((r) => r.draw)),
    drawMax: Math.max(...rows.map((r) => r.draw)),
    active: med(rows.map((r) => r.active)),
    meshes: rows.length ? rows[rows.length - 1].meshes : null,
    dt: med(rows.map((r) => r.dt)),
    verts: rows.length ? rows[rows.length - 1].verts : null,
  });

  document.getElementById("wrap").hidden = true;
  const bootSample = summarize(await sample(30));
  window.__sublevel.startBout(0);
  const fightT = performance.now();
  while (window.__sublevel.G.state !== "fight") {
    if (performance.now() - fightT > 4000) break;
    await raf();
  }
  await sleep(400);
  const fightSample = summarize(await sample(20));
  window.__shotReady = true;
  await new Promise((r) => { window.__resumeProbe = r; });

  const baseScale = engine.getHardwareScalingLevel();
  const qualityCost = [];
  const cost = async (name, apply, restore) => {
    apply();
    await sample(6);
    const ei = new B.EngineInstrumentation(engine);
    ei.captureGPUFrameTime = true;
    const si = new B.SceneInstrumentation(scene);
    si.captureActiveMeshesEvaluationTime = true;
    const rows = await sample(24);
    const out = {
      name,
      gpuMs: Math.round(ei.gpuFrameTimeCounter.average / 1e6 * 1000) / 1000,
      evalMs: Math.round(si.activeMeshesEvaluationTimeCounter.average * 1000) / 1000,
      draw: med(rows.map((r) => r.draw)),
      res: engine.getRenderWidth() + "x" + engine.getRenderHeight(),
    };
    ei.dispose();
    si.dispose();
    restore();
    return out;
  };
  try {
    qualityCost.push(await cost("full", () => {}, () => {}));
    qualityCost.push(await cost("poissonOff", () => { sg.usePoissonSampling = false; }, () => { sg.usePoissonSampling = true; }));
    qualityCost.push(await cost("scale135", () => engine.setHardwareScalingLevel(baseScale * 1.35), () => engine.setHardwareScalingLevel(baseScale)));
    qualityCost.push(await cost("scale180", () => engine.setHardwareScalingLevel(baseScale * 1.8), () => engine.setHardwareScalingLevel(baseScale)));
    qualityCost.push(await cost("shadowsOff", () => { key.shadowEnabled = false; }, () => { key.shadowEnabled = true; }));
    qualityCost.push(await cost("vignetteOff", () => { ipc.vignetteEnabled = false; }, () => { ipc.vignetteEnabled = true; }));
    qualityCost.push(await cost("tonemapOff", () => { ipc.toneMappingEnabled = false; }, () => { ipc.toneMappingEnabled = true; }));
    engine.setHardwareScalingLevel(baseScale);
    sg.usePoissonSampling = true;
    key.shadowEnabled = true;
    ipc.vignetteEnabled = true;
    ipc.toneMappingEnabled = true;
  } catch (err) {
    qualityCost.push({ error: String(err && err.stack || err) });
  }
  const activeData = (scene.getActiveMeshes().data || []).filter(Boolean);
  const crowd = {
    sources: scene.meshes.filter((m) => /^c[bh]\\d+$/.test(m.name)).length,
    instances: scene.meshes.filter((m) => m.getClassName() === "InstancedMesh").length,
    activeSources: activeData.filter((m) => /^c[bh]\\d+$/.test(m.name)).length,
    activeInstances: activeData.filter((m) => m.getClassName() === "InstancedMesh").length,
  };

  const counts = {};
  for (const m of scene.meshes) counts[m.getClassName()] = (counts[m.getClassName()] || 0) + 1;
  const frozen = scene.meshes.filter((m) => m.isWorldMatrixFrozen).length;

  document.getElementById("view").focus();
  window.__sublevel.startBout(0);
  const jabWait = performance.now();
  while (window.__sublevel.G.state !== "fight" && performance.now() - jabWait < 4000) await raf();
  const beforeJab = window.__sublevel.P.state;
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
  await raf();
  await raf();
  const keyboard = { before: beforeJab, state: window.__sublevel.P.state, atk: window.__sublevel.P.atk && window.__sublevel.P.atk.type };
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "j", bubbles: true }));

  let gamepad = { ok: false, note: "getGamepads not writable" };
  try {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    const fake = { connected: true, mapping: "standard", axes: [0.85, 0.1, 0, 0], buttons, id: "probe" };
    const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, "getGamepads");
    const orig = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : null;
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [fake] });
    const x0 = window.__sublevel.P.pos.x;
    await raf();
    await raf();
    await raf();
    const moved = Math.abs(window.__sublevel.P.pos.x - x0) > 0.01 || Math.abs(window.__sublevel.P.pos.z) > 0.01;
    buttons[2] = { pressed: true, value: 1 };
    await raf();
    await raf();
    gamepad = { ok: true, moved, state: window.__sublevel.P.state, atk: window.__sublevel.P.atk && window.__sublevel.P.atk.type, keys: document.getElementById("keys").textContent };
    if (desc) Object.defineProperty(navigator, "getGamepads", desc);
    else if (orig) navigator.getGamepads = orig;
  } catch (err) {
    gamepad = { ok: false, note: String(err && err.message || err) };
  }

  const heap = () => (performance.memory ? performance.memory.usedJSHeapSize : null);
  const gcHeap = async () => {
    if (window.gc) window.gc();
    await sleep(30);
    if (window.gc) window.gc();
    return heap();
  };
  const meshNow = () => scene.meshes.length;
  const texNow = () => scene.textures.length;
  const h0 = await gcHeap();
  const m0 = meshNow();
  const tex0 = texNow();
  const geos0 = scene.geometries.length;
  for (let i = 0; i < 20; i++) {
    window.__sublevel.startBout(i % 3);
    await raf();
  }
  const h1 = await gcHeap();
  for (let i = 0; i < 20; i++) {
    window.__sublevel.startBout(i % 3);
    await raf();
  }
  const h2 = await gcHeap();
  const restarts = {
    heap0: h0, heap1: h1, heap2: h2, dHeap: h1 - h0, dHeap2: h2 - h1,
    meshes0: m0, meshes1: meshNow(), tex0, tex1: texNow(),
    geos0, geos1: scene.geometries.length,
  };

  const bin = Uint8Array.from(atob(glbB64), (c) => c.charCodeAt(0));
  const file = new File([bin], "probe.glb", { type: "model/gltf-binary" });
  const beforeAv = meshNow();
  let avatar = { ok: false };
  try {
    await window.__sublevel.useAvatar(file);
    const afterFirst = meshNow();
    for (let i = 0; i < 19; i++) await window.__sublevel.useAvatar(file);
    const hAv = await gcHeap();
    avatar = {
      ok: !!window.__sublevel.P.avatar,
      hint: document.getElementById("avHint").textContent,
      meshesBefore: beforeAv,
      meshesFirst: afterFirst,
      meshesAfter20: meshNow(),
      heapAfter: hAv,
      dHeapFromRestart: hAv - h1,
    };
    const reset = document.getElementById("avReset");
    reset.click();
    await raf();
    avatar.meshesAfterClear = meshNow();
    avatar.cleared = !window.__sublevel.P.avatar;
  } catch (err) {
    avatar = { ok: false, error: String(err && err.stack || err) };
  }

  let gpu = null;
  try {
    const ei = new B.EngineInstrumentation(engine);
    ei.captureGPUFrameTime = true;
    await sample(20);
    gpu = {
      avg: ei.gpuFrameTimeCounter.average,
      current: ei.gpuFrameTimeCounter.current,
      lastSec: ei.gpuFrameTimeCounter.lastSecAverage,
    };
    ei.dispose();
  } catch (err) {
    gpu = { error: String(err && err.message || err) };
  }
  const realDt = engine.getDeltaTime.bind(engine);
  engine.getDeltaTime = () => 50;
  const qWait = performance.now();
  while (qlog.length < 6 && performance.now() - qWait < 12000) await sleep(100);
  engine.getDeltaTime = realDt;
  markQ();

  const resources = performance.getEntriesByType("resource").map((e) => ({
    name: e.name.split("/").slice(-1)[0],
    dur: Math.round(e.duration),
    encoded: e.encodedBodySize,
    decoded: e.decodedBodySize,
    transfer: e.transferSize,
  }));
  const nav = performance.getEntriesByType("navigation")[0];
  return {
    bootMs: Math.round(bootMs),
    dpr: window.devicePixelRatio,
    render: engine.getRenderWidth() + "x" + engine.getRenderHeight(),
    scale: engine.getHardwareScalingLevel(),
    css: { w: document.getElementById("view").clientWidth, h: document.getElementById("view").clientHeight },
    bootSample,
    fightSample,
    counts,
    crowd,
    frozen,
    materials: scene.materials.length,
    textures: scene.textures.length,
    shadowCasters: sg.getShadowMap().renderList.length,
    keyboard,
    gamepad,
    restarts,
    avatar,
    qlog,
    qualityCost,
    gpu,
    resources,
    nav: nav ? { responseEnd: Math.round(nav.responseEnd), domComplete: Math.round(nav.domComplete), transfer: nav.transferSize, decoded: nav.decodedBodySize } : null,
    gc: typeof window.gc === "function",
  };
})
`;

async function run() {
  const server = await serve(ROOT);
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/index.html`;
  const debugPort = 9400 + Math.floor(Math.random() * 500);
  const userData = mkdtempSync(join(ROOT, ".tmp-chrome-"));
  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userData}`,
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-extensions",
    "--disable-sync",
    "--enable-precise-memory-info",
    "--js-flags=--expose-gc",
    "--force-device-scale-factor=1",
    "--window-size=1920,1080",
    "--hide-scrollbars",
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let chromeLog = "";
  chrome.stderr.on("data", (d) => { chromeLog += d.toString(); });
  try {
    let page = null;
    for (let i = 0; i < 50 && !page; i++) {
      const list = await waitFor(`http://127.0.0.1:${debugPort}/json/list`);
      page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (!page) await new Promise((r) => setTimeout(r, 100));
    }
    if (!page) throw new Error("no page target");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", reject);
    });
    const cdp = new CDP(ws);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.send("Page.navigate", { url });
    const glb = minimalGlb().toString("base64");
    const expr = `(${PROBE})(${JSON.stringify(glb)})`;
    const evalPromise = cdp.send("Runtime.evaluate", {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    let shotOk = false;
    for (let i = 0; i < 200; i++) {
      const ready = await cdp.send("Runtime.evaluate", {
        expression: "!!window.__shotReady",
        returnByValue: true,
      });
      if (ready.result && ready.result.value) { shotOk = true; break; }
      if (ready.exceptionDetails) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (shotOk) {
      const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
      writeFileSync(SHOT, Buffer.from(shot.data, "base64"));
      await cdp.send("Runtime.evaluate", { expression: "window.__resumeProbe&&window.__resumeProbe()" });
    }
    const evaluated = await evalPromise;
    if (evaluated.exceptionDetails) {
      const desc = evaluated.exceptionDetails.exception && evaluated.exceptionDetails.exception.description;
      throw new Error(desc || JSON.stringify(evaluated.exceptionDetails));
    }
    const exceptions = cdp.events
      .filter((e) => e.method === "Runtime.exceptionThrown" || e.method === "Runtime.consoleAPICalled")
      .slice(0, 12)
      .map((e) => e.method + " " + JSON.stringify(e.params).slice(0, 300));
    const report = {
      sizes: fileSizes(),
      shot: SHOT,
      result: evaluated.result.value,
      exceptions,
    };
    const gzipTotal = report.sizes.reduce((s, f) => s + f.gzip, 0);
    const rawTotal = report.sizes.reduce((s, f) => s + f.bytes, 0);
    report.network = {
      gzipBytes: gzipTotal,
      rawBytes: rawTotal,
      gzipMsAt20Mbps: Math.round(gzipTotal * 8 / 20e6 * 1000),
      rawMsAt20Mbps: Math.round(rawTotal * 8 / 20e6 * 1000),
    };
    console.log(JSON.stringify(report, null, 2));
    ws.close();
  } catch (err) {
    console.error(String(err && err.stack || err));
    console.error(chromeLog.slice(-2000));
    process.exitCode = 1;
  } finally {
    chrome.kill("SIGKILL");
    server.close();
    rmSync(userData, { recursive: true, force: true });
  }
}

run();
