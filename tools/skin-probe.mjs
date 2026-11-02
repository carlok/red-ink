/**
 * Skinned-fighter spike probe. Usage: node tools/skin-probe.mjs [out-prefix]
 * Serves the repo over http (the model loads with fetch), turns the skin on, and logs draws, active meshes and GPU time
 * with and without it, which clip each state picks, then saves idle, wind-up, impact, recover, hit and K.O. frames.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2] || join(ROOT, "tuning", "s15-skin-probe");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const types = { ".html": "text/html", ".js": "text/javascript", ".txt": "text/plain", ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".png": "image/png" };
const server = createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  const path = normalize(join(ROOT, rel === "/" ? "index.html" : rel));
  if (!path.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  let body; try { body = readFileSync(path); } catch { res.writeHead(404); res.end("missing"); return; }
  res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream", "cache-control": "no-store" }); res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const userData = mkdtempSync(join(tmpdir(), "skin-chrome-"));
const dbg = 9400 + Math.floor(Math.random() * 90);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${dbg}`, `--user-data-dir=${userData}`, "--remote-allow-origins=*", "--no-first-run", "--disable-background-networking", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const errors = [];
try {
  let page = null;
  for (let i = 0; i < 50 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()).find((t) => t.type === "page"); } catch {} if (!page) await new Promise((r) => setTimeout(r, 100)); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pend = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    else if (m.method === "Runtime.exceptionThrown") errors.push((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
    else if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) errors.push(m.params.type + " " + JSON.stringify(m.params.args.map((a) => a.value || a.description)).slice(0, 300));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => { const m = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (m.result.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 600)); return m.result.result.value; };
  const shot = async (name) => { const p = await send("Page.captureScreenshot", { format: "jpeg", quality: 86 }); writeFileSync(`${OUT}-${name}.jpg`, Buffer.from(p.result.data, "base64")); };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html` });
  const info = await ev(`(async () => {
    const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = performance.now();
    while (!window.__sublevel) { if (performance.now() - t0 > 15000) throw new Error("boot"); await raf(); }
    const S = window.__sublevel, G = S.G, B = window.BABYLON, engine = B.Engine.LastCreatedEngine, scene = B.Engine.LastCreatedScene;
    const css = document.createElement("style"); css.textContent = "#snd,#keys,#tutor,#banner{display:none!important}"; document.head.appendChild(css);
    S.seed(5); S.startBout(0); document.getElementById("wrap").hidden = true;
    while (G.state !== "fight") await raf();
    const draws = async () => { const a = []; let prev = engine._drawCalls.current; for (let i = 0; i < 40; i++) { await raf(); const n = engine._drawCalls.current; a.push(n - prev); prev = n; } return a.sort((x, y) => x - y)[20]; };
    const gpu = async () => { const ei = new B.EngineInstrumentation(engine); ei.captureGPUFrameTime = true; for (let i = 0; i < 30; i++) await raf(); const v = ei.gpuFrameTimeCounter.average / 1e6; ei.dispose(); return Math.round(v * 1000) / 1000; };
    for (let i = 0; i < 150; i++) await raf(); const base = { draws: await draws(), active: scene.getActiveMeshes().length, meshes: scene.meshes.length, gpu: await gpu() };
    const tl = performance.now(); await S.skinOn(true); const loadMs = Math.round(performance.now() - tl);
    for (let i = 0; i < 30; i++) await raf();
    const skin = { draws: await draws(), active: scene.getActiveMeshes().length, meshes: scene.meshes.length, gpu: await gpu() };
    const P = S.P, E = S.E;
    window.__t = { S, G, P, raf, sleep };
    return { base, skin, loadMs, groups: Object.keys(P.skin.groups), frames: Object.fromEntries(Object.entries(P.skin.groups).map(([k, g]) => [k, [Math.round(g.from), Math.round(g.to)]])), skeletons: P.skin.res.skeletons.length, bones: P.skin.res.skeletons[0] && P.skin.res.skeletons[0].bones.length };
  })()`);
  console.log(JSON.stringify(info));
  const stage = `(async () => { const { S, G, raf } = window.__t; if (G.state === "pause") G.state = "fight";
      const P = S.P, E = S.E; E.ai.cd = 99; E.speed0 = 0; E.cfg.cd = 99; E.cfg.heavy = 0; E.cfg.dodge = 0; E.cfg.block = 0;
      P.pos.set(-0.7, 0, 0); E.pos.set(0.7, 0, 0); [P, E].forEach((f) => { f.vel.set(0, 0, 0); f.mv.set(0, 0, 0); f.state = "idle"; f.atk = null; f.stunT = 0; f.stam = 100; f.cd = 0; });
      P.hp = 84; E.hp = 60; E.maxHp = 70; G.hitstop = 0; G.shake = 0; for (let i = 0; i < 90; i++) await raf(); return true; })()`;
  await ev(stage); await shot("1-idle");
  /* wind-up: pause when the attack clock reaches t */
  const atT = async (t, name) => {
    await ev(stage);
    await ev(`(async () => { const { S, G, raf } = window.__t; window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true })); await raf(); window.dispatchEvent(new KeyboardEvent("keyup", { key: "j", bubbles: true }));
      const t0 = performance.now(); while (!(S.P.atk && S.P.atk.t >= ${t})) { if (performance.now() - t0 > 1500) return false; await raf(); } G.state = "pause"; await raf(); await raf(); return { clip: S.P.skin.lastClip, u: S.P.skin.lastU, t: S.P.atk && S.P.atk.t, state: S.P.state }; })()`).then((r) => console.log(name, JSON.stringify(r)));
    await shot(name);
  };
  await atT(0.05, "2-windup"); await atT(0.15, "3-impact"); await atT(0.3, "4-recover");
  /* after the hit lands */
  await ev(stage);
  const hit = await ev(`(async () => { const { S, G, raf, sleep } = window.__t; const hp0 = S.E.hp; window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true })); await raf(); window.dispatchEvent(new KeyboardEvent("keyup", { key: "j", bubbles: true }));
    const t0 = performance.now(); while (S.E.hp >= hp0 - 0.01) { if (performance.now() - t0 > 1500) return false; await raf(); } const h = performance.now(); while (performance.now() - h < 160) await raf(); G.state = "pause"; await raf(); await raf(); return { eState: S.E.state, eClip: S.E.skin && S.E.skin.lastClip }; })()`);
  console.log("5-hit", JSON.stringify(hit)); await shot("5-hit");
  /* knockout */
  await ev(stage);
  const ko = await ev(`(async () => { const { S, G, raf, sleep } = window.__t; S.E.hp = 1; window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true })); await raf(); window.dispatchEvent(new KeyboardEvent("keyup", { key: "j", bubbles: true }));
    const t0 = performance.now(); while (S.E.state !== "ko") { if (performance.now() - t0 > 2000) return false; await raf(); } await sleep(1300); G.state = "pause"; await raf(); await raf(); return { eState: S.E.state, eClip: S.E.skin && S.E.skin.lastClip, u: S.E.skin && S.E.skin.lastU, koT: S.E.koT }; })()`);
  console.log("6-ko", JSON.stringify(ko)); await shot("6-ko");
  console.log("errors:", errors.length ? errors.slice(0, 8) : "none");
  ws.close();
} finally {
  chrome.kill("SIGKILL"); server.close(); await new Promise((r) => setTimeout(r, 500)); try { rmSync(userData, { recursive: true, force: true }); } catch {}
}
