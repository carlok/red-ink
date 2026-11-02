/**
 * Bout environments: boots the game, starts each bout in turn and reports how long the room change takes, draws, active meshes, GPU time
 * and console errors, and saves a screenshot per bout.
 * Usage: node tools/env-probe.mjs [out-prefix] [bouts, e.g. 0,1,2,3,4,5] [width] [height]   (saves <prefix>-b1.jpg ...)
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), "..", "tuning", "s17-env");
const BOUTS = (process.argv[3] || "0,1,2,3,4,5").split(",").map(Number);
const W = Number(process.argv[4] || 1600), H = Number(process.argv[5] || 900);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FILE = "file://" + join(dirname(fileURLToPath(import.meta.url)), "..", "index.html") + (process.env.Q || "");
const userData = mkdtempSync(join(tmpdir(), "env-chrome-"));
const port = 9600 + Math.floor(Math.random() * 90);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, "--remote-allow-origins=*", "--no-first-run", "--disable-background-networking", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const guard = setTimeout(() => { console.error("timeout"); chrome.kill("SIGKILL"); process.exit(2); }, 170000);
const errors = [];
try {
  let page = null;
  for (let i = 0; i < 50 && !page; i++) { try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {} if (!page) await new Promise((r) => setTimeout(r, 100)); }
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
  const ev = async (expression) => { const m = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (m.result.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 500)); return m.result.result.value; };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: FILE });
  await ev(`(async () => {
    const raf = () => new Promise((r) => requestAnimationFrame(r)), t0 = performance.now();
    while (!window.__sublevel) { if (performance.now() - t0 > 15000) throw new Error("boot"); await raf(); }
    const css = document.createElement("style"); css.textContent = "#snd,#keys,#tutor,#banner{display:none!important}"; document.head.appendChild(css);
    window.__raf = raf; return true;
  })()`);
  for (const b of BOUTS) {
    const info = await ev(`(async () => {
      const raf = window.__raf, S = window.__sublevel, G = S.G, B = window.BABYLON, engine = B.Engine.LastCreatedEngine, scene = B.Engine.LastCreatedScene;
      S.seed(5);
      const t = performance.now(); S.applyEnv(${b}); const envMs = Math.round(performance.now() - t);
      S.startBout(${b}); document.getElementById("wrap").hidden = true;
      Object.assign(S.CAM, { frac: .45, pitch: .38 });
      while (G.state !== "fight") await raf();
      for (let i = 0; i < 160; i++) await raf();
      S.E.ai.cd = 99; S.E.cfg.cd = 99; S.E.speed0 = 0;
      S.P.pos.set(-0.7, 0, 0); S.E.pos.set(0.7, 0, 0);
      for (let i = 0; i < 120; i++) await raf();
      const draws = []; let prev = engine._drawCalls.current; for (let i = 0; i < 40; i++) { await raf(); const n = engine._drawCalls.current; draws.push(n - prev); prev = n; }
      const ei = new B.EngineInstrumentation(engine); ei.captureGPUFrameTime = true; for (let i = 0; i < 30; i++) await raf(); const gpu = Math.round(ei.gpuFrameTimeCounter.average / 1e6 * 1000) / 1000; ei.dispose();
      G.state = "pause"; await raf(); await raf();
      return { bout: ${b} + 1, env: S.ENV[${b}].key, envMs, draws: draws.sort((x, y) => x - y)[20], active: scene.getActiveMeshes().length, gpu };
    })()`);
    console.log(JSON.stringify(info));
    const pic = await send("Page.captureScreenshot", { format: "jpeg", quality: 86 });
    writeFileSync(`${OUT}-b${b + 1}.jpg`, Buffer.from(pic.result.data, "base64"));
  }
  console.log("errors:", JSON.stringify(errors.slice(0, 5)));
  ws.close();
} finally {
  clearTimeout(guard); chrome.kill("SIGKILL"); await new Promise((r) => setTimeout(r, 500)); try { rmSync(userData, { recursive: true, force: true }); } catch {}
}
