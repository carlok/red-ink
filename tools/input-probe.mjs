/**
 * Sprint 2 input probe. Usage: node tools/input-probe.mjs [phone-screenshot.jpg]
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

const DESK = String.raw`
(async () => {
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tBoot = performance.now();
  while (!window.__sublevel) {
    if (performance.now() - tBoot > 15000) throw new Error("boot");
    await raf();
  }
  const S = window.__sublevel;
  const key = (k, down) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: k === "space" ? " " : k, bubbles: true }));
  const tap = async (k) => { key(k, true); key(k, false); };
  const quiet = () => {
    const E = S.E;
    E.speed0 = 0; E.stam = 0; E.ai.cd = 99; E.ai.atk = null; E.ai.dodgeNow = false;
    E.cfg.cd = 99; E.cfg.heavy = 0; E.cfg.dodge = 0; E.cfg.block = 0;
  };
  document.getElementById("wrap").hidden = true;
  S.startBout(0);
  const tFight = performance.now();
  while (S.G.state !== "fight") {
    if (performance.now() - tFight > 4000) throw new Error("fight");
    await raf();
  }
  quiet();
  const waitIdle = async () => {
    const t = performance.now();
    while (S.P.state !== "idle") {
      if (performance.now() - t > 2500) break;
      await raf();
    }
    S.P.stam = 100; S.P.stamDelay = 0; S.P.cd = 0; S.P.stunT = 0;
    quiet();
    await raf();
  };
  const arm = () => S.P.j.armR.sh.rotation.x;
  const latency = async (fire) => {
    await waitIdle();
    const arm0 = arm();
    const t0 = performance.now();
    fire();
    let stateMs = null, poseMs = null;
    for (let i = 0; i < 12; i++) {
      await raf();
      const now = performance.now() - t0;
      if (stateMs === null && S.P.state === "attack") stateMs = Math.round(now);
      if (poseMs === null && Math.abs(arm() - arm0) > 0.02) poseMs = Math.round(now);
      if (stateMs !== null && poseMs !== null) break;
    }
    key("j", false); key("k", false); key("u", false); key("z", false); key("space", false);
    return { stateMs, poseMs, state: S.P.state, atk: S.P.atk && S.P.atk.type };
  };

  const keyboard = await latency(() => { key("j", true); });
  const touchBtn = document.querySelector('.tb[data-act="jab"]');
  const touch = await latency(() => {
    touchBtn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, pointerType: "touch", clientX: 10, clientY: 10, button: 0 }));
    touchBtn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, pointerType: "touch", clientX: 10, clientY: 10 }));
  });

  const buttons = () => Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  let padButtons = buttons();
  let padAxes = [0, 0, 0, 0];
  const calls = [];
  const fake = {
    connected: true, mapping: "standard", id: "probe",
    get axes() { return padAxes; },
    get buttons() { return padButtons; },
    vibrationActuator: { playEffect(type, params) { calls.push({ type, strong: params.strongMagnitude, weak: params.weakMagnitude, ms: params.duration }); return Promise.resolve(); } },
  };
  const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, "getGamepads");
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [fake] });
  const pad = await latency(() => { padButtons[2] = { pressed: true, value: 1 }; });
  padButtons = buttons();
  await raf(); await raf();

  await waitIdle();
  const pos = () => ({ x: S.P.pos.x, z: S.P.pos.z });
  const moved = async (frames) => {
    const a = pos();
    for (let i = 0; i < frames; i++) await raf();
    const b = pos();
    return Math.hypot(b.x - a.x, b.z - a.z);
  };
  padAxes = [0.19, 0, 0, 0];
  const deadIn = await moved(8);
  padAxes = [0.45, 0, 0, 0];
  const deadOut = await moved(8);
  padAxes = [0, 0, 0, 0];
  padButtons[15] = { pressed: true, value: 1 };
  const dpad = await moved(8);
  padButtons = buttons();
  padAxes = [0, 0, 0, 0];
  await raf();

  await waitIdle();
  padButtons[6] = { pressed: true, value: 0.2 };
  await raf(); await raf();
  const lightTrig = S.P.state;
  padButtons[6] = { pressed: true, value: 0.8 };
  await raf(); await raf();
  const hardTrig = S.P.state;
  padButtons = buttons();
  await raf(); await raf();

  await waitIdle();
  const heavyIdle = await latency(() => { key("k", true); });

  await waitIdle();
  await tap("j");
  let earlyAt = null;
  for (let i = 0; i < 40 && S.P.atk && S.P.atk.type === "jab"; i++) {
    if (S.P.atk.t >= 0.05) { earlyAt = Math.round(S.P.atk.t * 1000) / 1000; await tap("k"); break; }
    await raf();
  }
  while (S.P.state === "attack" && S.P.atk && S.P.atk.type === "jab") await raf();
  const bufferEarly = { pressedAt: earlyAt, state: S.P.state, atk: S.P.atk && S.P.atk.type };

  await waitIdle();
  await tap("j");
  let lateAt = null;
  for (let i = 0; i < 40 && S.P.atk && S.P.atk.type === "jab"; i++) {
    if (S.P.atk.t >= 0.28) { lateAt = Math.round(S.P.atk.t * 1000) / 1000; await tap("k"); break; }
    await raf();
  }
  while (S.P.state === "attack" && S.P.atk && S.P.atk.type === "jab") await raf();
  await raf();
  const bufferLate = { pressedAt: lateAt, state: S.P.state, atk: S.P.atk && S.P.atk.type };

  await waitIdle();
  await tap("space");
  let cd0 = null;
  for (let i = 0; i < 20; i++) {
    await raf();
    if (S.P.state === "dodge") { cd0 = Math.round(S.P.cd * 1000) / 1000; break; }
  }
  while (S.P.state === "dodge") await raf();
  const cdMid = Math.round(S.P.cd * 1000) / 1000;
  await tap("space");
  await raf(); await raf();
  const dodgeBlocked = S.P.state !== "dodge";
  while (S.P.cd > 0.02) await raf();
  await tap("space");
  let dodgeAgain = false;
  for (let i = 0; i < 8; i++) { await raf(); if (S.P.state === "dodge") { dodgeAgain = true; break; } }

  const rate = async (duringAttack) => {
    await waitIdle();
    S.P.pos.set(0, 0, 0); S.E.pos.set(0, 0, 3); S.P.yaw = Math.PI / 2; S.P.root.rotation.y = S.P.yaw;
    if (duringAttack) { await tap("j"); await raf(); await raf(); }
    const ys = [];
    let prev = performance.now();
    for (let i = 0; i < 6; i++) {
      const y0 = S.P.yaw;
      await raf();
      const dt = (performance.now() - prev) / 1000;
      prev = performance.now();
      const target = Math.atan2(S.E.pos.x - S.P.pos.x, S.E.pos.z - S.P.pos.z);
      const err0 = Math.atan2(Math.sin(target - y0), Math.cos(target - y0));
      const err1 = Math.atan2(Math.sin(target - S.P.yaw), Math.cos(target - S.P.yaw));
      if (Math.abs(err0) > 0.05 && dt > 0) ys.push(-Math.log(Math.abs(err1 / err0)) / dt);
    }
    ys.sort((a, b) => a - b);
    return { k: Math.round(ys[Math.floor(ys.length / 2)] * 10) / 10, state: S.P.state };
  };
  const turnIdle = await rate(false);
  const turnAtk = await rate(true);

  calls.length = 0;
  await waitIdle();
  const hp0 = S.E.hp;
  S.P.pos.set(-0.45, 0, 0); S.E.pos.set(0.45, 0, 0); S.P.yaw = Math.PI / 2; S.P.root.rotation.y = S.P.yaw;
  await tap("j");
  await sleep(300);
  const rumble = { calls: calls.slice(), hp: S.E.hp, dhp: Math.round((hp0 - S.E.hp) * 10) / 10 };

  if (desc) Object.defineProperty(navigator, "getGamepads", desc);
  let remap = null;
  const jabBind = document.querySelector('[data-bind="jab"]');
  if (jabBind) {
    jabBind.click();
    key("u", true); key("u", false);
    await waitIdle();
    const uHit = await latency(() => key("u", true));
    await waitIdle();
    const jMiss = await latency(() => key("j", true));
    await waitIdle();
    const zHit = await latency(() => key("z", true));
    remap = { label: jabBind.querySelector("kbd").textContent, u: uHit.stateMs, j: jMiss.stateMs, z: zHit.stateMs };
  }
  return {
    keyboard, touch, pad,
    deadIn: Math.round(deadIn * 1000) / 1000,
    deadOut: Math.round(deadOut * 1000) / 1000,
    dpad: Math.round(dpad * 1000) / 1000,
    lightTrig, hardTrig,
    heavyIdle, bufferEarly, bufferLate,
    dodge: { cd0, cdMid, dodgeBlocked, dodgeAgain },
    turnIdle, turnAtk,
    rumble,
    hasBinds: !!document.querySelector("[data-bind]"),
    hasRumble: !!document.getElementById("rumble"),
    remap,
  };
})()
`;

const PHONE = String.raw`
(async () => {
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const t0 = performance.now();
  while (!window.__sublevel) {
    if (performance.now() - t0 > 15000) throw new Error("boot");
    await raf();
  }
  document.getElementById("wrap").hidden = true;
  window.__sublevel.startBout(0);
  await raf();
  const corner = { x: window.innerWidth - 16, y: window.innerHeight - 22 };
  const btns = [...document.querySelectorAll(".tb")].map((b) => {
    const r = b.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return {
      act: b.dataset.act, w: Math.round(r.width), h: Math.round(r.height),
      dist: Math.round(Math.hypot(corner.x - cx, corner.y - cy)),
    };
  });
  const stick = document.getElementById("stick").getBoundingClientRect();
  const cluster = document.querySelector(".btns").getBoundingClientRect();
  const overlap = !(stick.right < cluster.left || stick.left > cluster.right || stick.bottom < cluster.top || stick.top > cluster.bottom);
  const ta = (el) => getComputedStyle(el).touchAction;
  const scroll0 = window.scrollY;
  const view = document.getElementById("view");
  view.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 3, clientX: 200, clientY: 400, pointerType: "touch" }));
  view.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 3, clientX: 200, clientY: 200, pointerType: "touch" }));
  view.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 3, clientX: 200, clientY: 200, pointerType: "touch" }));
  window.__shotReady = true;
  return {
    inner: { w: window.innerWidth, h: window.innerHeight },
    btns, overlap, gap: Math.round(cluster.left - stick.right),
    touchAction: { html: ta(document.documentElement), body: ta(document.body), app: ta(document.getElementById("app")), view: ta(view), btn: ta(document.querySelector(".tb")) },
    scrollDelta: window.scrollY - scroll0,
    scale: window.visualViewport ? window.visualViewport.scale : null,
    nearest: btns.slice().sort((a, b) => a.dist - b.dist)[0].act,
    saved: {
      binds: (() => { try { return localStorage.getItem("sublevel-binds"); } catch (e) { return null; } })(),
      rumble: (() => { try { return localStorage.getItem("sublevel-rumble"); } catch (e) { return null; } })(),
      label: (document.querySelector('[data-bind="jab"] kbd') || {}).textContent || null,
    },
  };
})()
`;

async function connect(debugPort) {
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
  return new CDP(ws);
}

async function evalOk(cdp, expression) {
  const out = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (out.exceptionDetails) {
    const d = out.exceptionDetails.exception && out.exceptionDetails.exception.description;
    throw new Error(d || JSON.stringify(out.exceptionDetails));
  }
  return out.result.value;
}

const server = await serve();
const port = server.address().port;
const url = `http://127.0.0.1:${port}/index.html`;
const debugPort = 9700 + Math.floor(Math.random() * 200);
const userData = mkdtempSync(join(ROOT, ".tmp-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`,
  "--remote-allow-origins=*", "--no-first-run", "--disable-background-networking",
  "--hide-scrollbars", "--window-size=1920,1080", "about:blank",
], { stdio: "ignore" });

try {
  const cdp = await connect(debugPort);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Page.navigate", { url });
  const desk = await evalOk(cdp, DESK);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await cdp.send("Page.navigate", { url });
  const phonePromise = evalOk(cdp, PHONE);
  let shot = false;
  for (let i = 0; i < 80; i++) {
    const ready = await cdp.send("Runtime.evaluate", { expression: "!!window.__shotReady", returnByValue: true });
    if (ready.result && ready.result.value) { shot = true; break; }
    await new Promise((r) => setTimeout(r, 50));
  }
  if (shot && SHOT) {
    const pic = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
    writeFileSync(SHOT, Buffer.from(pic.data, "base64"));
  }
  const phone = await phonePromise;
  let pinch = null;
  try {
    const pts = (spread) => [{ x: 180, y: 500, id: 1 }, { x: 180 + spread, y: 500, id: 2 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(40) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(140) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const scale = await cdp.send("Runtime.evaluate", { expression: "window.visualViewport?window.visualViewport.scale:null", returnByValue: true });
    pinch = { scale: scale.result.value };
  } catch (err) {
    pinch = { error: String(err.message || err) };
  }
  console.log(JSON.stringify({ desk, phone, pinch, shot: SHOT || null }, null, 2));
} finally {
  chrome.kill("SIGKILL");
  server.close();
  rmSync(userData, { recursive: true, force: true });
}
