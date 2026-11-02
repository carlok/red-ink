/**
 * Sprint 3 combat probe. Usage: node tools/combat-probe.mjs [screenshot.jpg]
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

const PROBE = String.raw`
(async () => {
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const tBoot = performance.now();
  while (!window.__sublevel) {
    if (performance.now() - tBoot > 15000) throw new Error("boot");
    await raf();
  }
  const S = window.__sublevel;
  const scene = BABYLON.Engine.LastCreatedScene;
  const cam = scene.activeCamera;
  const word = (n) => scene.getMeshByName(n);
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const key = (k, down) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: k, bubbles: true }));
  const tap = async (k) => { key(k, true); await raf(); key(k, false); };
  document.getElementById("wrap").hidden = true;
  S.startBout(0);
  const tFight = performance.now();
  while (S.G.state !== "fight") {
    if (performance.now() - tFight > 4000) throw new Error("fight");
    await raf();
  }
  const quiet = () => {
    S.E.speed0 = 0; S.E.ai.cd = 99; S.E.ai.atk = null; S.E.ai.dodgeNow = false; S.E.ai.blockT = 0;
    S.E.cfg.cd = 99; S.E.cfg.heavy = 0; S.E.cfg.dodge = 0; S.E.cfg.block = 0;
  };
  quiet();
  const idle = async () => {
    const t = performance.now();
    while (S.P.state !== "idle" && S.P.state !== "win" && S.G.state === "fight") {
      if (performance.now() - t > 3000) break;
      await raf();
    }
    if (S.G.state !== "fight") { S.startBout(0); while (S.G.state !== "fight") await raf(); }
    quiet();
    S.P.stam = 100; S.P.stamDelay = 0; S.P.cd = 0; S.P.stunT = 0; S.P.vel.set(0, 0, 0);
    S.E.vel.set(0, 0, 0); S.E.stunT = 0; S.E.stam = 100; S.E.hp = 70; S.E.state = "idle"; S.E.atk = null;
    S.G.hitstop = 0; S.G.shake = 0;
    await raf();
  };
  const place = (gap) => {
    S.P.pos.set(-gap / 2, 0, 0); S.E.pos.set(gap / 2, 0, 0);
    S.P.yaw = Math.PI / 2; S.P.root.rotation.y = S.P.yaw;
    S.E.yaw = -Math.PI / 2; S.E.root.rotation.y = S.E.yaw;
  };
  const camDist = () => BABYLON.Vector3.Distance(cam.position, S.P.pos.add(S.E.pos).scale(0.5));
  async function swing(k, gap, opt) {
    opt = opt || {};
    await idle();
    place(gap);
    if (opt.ehp !== undefined) S.E.hp = opt.ehp;
    if (opt.estam !== undefined) S.E.stam = opt.estam;
    if (opt.block) S.E.ai.blockT = 30;
    const hp0 = S.E.hp, stam0 = S.P.stam, estam0 = S.E.stam, lean0 = S.E.body.rotation.x;
    const meshName = opt.ko ? "wordKO" : (k === "k" ? "wordWHAM" : (opt.block ? "wordBLOK" : "wordPOW"));
    const w = word(meshName);
    const dist0 = camDist();
    await tap(k);
    let hit = null;
    const rows = [];
    const tCap = performance.now();
    while (performance.now() - tCap < 1600) {
      await raf();
      const struck = opt.block ? (S.E.hp < hp0 - 0.01 || S.E.stam < estam0 - 0.01) : (S.E.hp < hp0 - 0.01 || S.E.state === "ko" || S.G.state === "ko");
      if (!hit && struck) {
        hit = performance.now();
        rows.push(snap(0));
      }
      if (hit) {
        const ms = performance.now() - hit;
        rows.push(snap(ms));
        if (!window.__shotReady && ms >= 90 && ms < 140 && !opt.noShot) window.__shotReady = true;
        if (ms > 500) break;
      }
    }
    /* share of the screen width the word covers, from the plane's billboard width (2.24 m at scale 1) */
    function wordShare() {
      if (!w || !w.isEnabled()) return 0;
      const m = scene.getTransformMatrix().m, r = cam.getDirection(new BABYLON.Vector3(1, 0, 0)), h = 1.12 * w.scaling.x;
      const px = (v) => (v.x * m[0] + v.y * m[4] + v.z * m[8] + m[12]) / (v.x * m[3] + v.y * m[7] + v.z * m[11] + m[15]) * 0.5 + 0.5;
      return Math.abs(px(w.position.add(r.scale(h))) - px(w.position.add(r.scale(-h))));
    }
    function snap(ms) {
      return {
        ms: Math.round(ms),
        scale: w ? r3(w.scaling.x / ((w.metadata && w.metadata.k) || 1)) : null,
        share: r3(wordShare()),
        on: w ? w.isEnabled() : false,
        lean: r3(S.E.body.rotation.x - lean0),
        shake: r3(S.G.shake),
        stop: r3(S.G.hitstop),
        fov: r3(cam.fov),
        dist: r3(camDist() - dist0),
        est: S.E.state,
        pst: S.P.state,
        koT: r3(S.E.koT || 0),
      };
    }
    const at = (pred) => { const s = rows.find(pred); return s ? s.ms : null; };
    const within = (ms) => rows.filter((s) => s.ms <= ms);
    const w100 = within(100);
    return {
      dmg: r3(hp0 - S.E.hp),
      stam: r3(stam0 - S.P.stam),
      estam: r3(estam0 - S.E.stam),
      stun: r3(S.E.stunMax || 0),
      state: S.E.state,
      bout: S.G.state,
      stopAtHit: rows.length ? rows[0].stop : null,
      shakeAtHit: rows.length ? rows[0].shake : null,
      wordMs: at((s) => s.on && s.scale >= 0.45),
      flinchMs: at((s) => Math.abs(s.lean) >= 0.08),
      wordAt100: w100.length ? r3(Math.max(...w100.map((s) => s.scale || 0))) : null,
      wordShareMax: rows.length ? r3(Math.max(...rows.map((s) => s.share || 0))) : null,
      flinchAt100: w100.length ? r3(Math.max(...w100.map((s) => Math.abs(s.lean)))) : null,
      minDist100: w100.length ? r3(Math.min(...w100.map((s) => s.dist))) : null,
      fovAt100: w100.length ? w100[w100.length - 1].fov : null,
      koTAt100: w100.length ? w100[w100.length - 1].koT : null,
      hitstopLeftAt100: w100.length ? w100[w100.length - 1].stop : null,
    };
  }
  const whiff = async (k) => {
    await idle();
    place(5);
    const stam0 = S.P.stam;
    const t0 = performance.now();
    key(k, true);
    let started = null, ended = null, activeAt = null;
    while (performance.now() - t0 < 2000) {
      await raf();
      if (!started && S.P.state === "attack") { started = performance.now(); }
      if (started && S.P.atk && activeAt === null && S.P.atk.t >= S.P.atk.def.a0) activeAt = r3(S.P.atk.t);
      if (started && S.P.state === "idle") { ended = performance.now(); break; }
    }
    key(k, false);
    return { stam: r3(stam0 - S.P.stam), durMs: started && ended ? Math.round(ended - started) : null, activeAt };
  };

  const jabWhiff = await whiff("j");
  const heavyWhiff = await whiff("k");
  const jab = await swing("j", 1.1);
  const heavy = await swing("k", 1.1, { noShot: true });
  const block = await swing("j", 1.1, { block: true, noShot: true });
  const guard = await swing("j", 1.1, { block: true, estam: 4, noShot: true });
  const ko = await swing("j", 1.1, { ehp: 5, ko: true, noShot: true });

  await idle();
  place(1.1);
  let counterDmg = null;
  const mark = () => {
    if (S.P.atk && S.P.atk.type === "jab" && S.P.atk.t < 0.12 && S.E.state !== "hit") {
      S.E.state = "attack";
      S.E.atk = { type: "jab", def: { dur: 5, a0: 4, a1: 4.5, dmg: 7 }, t: 0.2, done: true };
    }
  };
  const obs = scene.onAfterRenderObservable.add(mark);
  const hp0 = S.E.hp;
  key("j", true);
  const tC = performance.now();
  while (S.E.hp >= hp0 - 0.01 && performance.now() - tC < 1000) await raf();
  counterDmg = r3(hp0 - S.E.hp);
  key("j", false);
  scene.onAfterRenderObservable.remove(obs);

  await idle();
  place(1.1);
  key("j", true);
  let hitAt = null, nextAt = null, stopAtNext = null;
  const hp1 = S.E.hp;
  const tN = performance.now();
  while (performance.now() - tN < 1500) {
    await raf();
    if (!hitAt && S.E.hp < hp1 - 0.01) { hitAt = performance.now(); key("j", true); }
    if (hitAt && S.P.atk && S.P.atk.t < 0.05 && S.P.state === "attack" && performance.now() - hitAt > 40) {
      nextAt = Math.round(performance.now() - hitAt);
      stopAtNext = r3(S.G.hitstop);
      break;
    }
  }
  key("j", false);

  const slim = (x) => x;
  return { jabWhiff, heavyWhiff, jab: slim(jab), heavy, block, guard, ko, counterDmg, next: { nextAt, stopAtNext } };
})()
`;

async function main() {
  const server = await serve();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/index.html`;
  const debugPort = 9800 + Math.floor(Math.random() * 150);
  const userData = mkdtempSync(join(ROOT, ".tmp-chrome-"));
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`,
    "--remote-allow-origins=*", "--no-first-run", "--disable-background-networking",
    "--hide-scrollbars", "--window-size=1280,720", "about:blank",
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
    await cdp.send("Page.navigate", { url });
    const evalPromise = cdp.send("Runtime.evaluate", { expression: PROBE, awaitPromise: true, returnByValue: true });
    if (SHOT) {
      for (let i = 0; i < 160; i++) {
        const ready = await cdp.send("Runtime.evaluate", { expression: "!!window.__shotReady", returnByValue: true });
        if (ready.result && ready.result.value) {
          const pic = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
          writeFileSync(SHOT, Buffer.from(pic.data, "base64"));
          break;
        }
        await new Promise((r) => setTimeout(r, 40));
      }
    }
    const out = await evalPromise;
    if (out.exceptionDetails) {
      const d = out.exceptionDetails.exception && out.exceptionDetails.exception.description;
      throw new Error(d || JSON.stringify(out.exceptionDetails));
    }
    console.log(JSON.stringify(out.result.value, null, 2));
    ws.close();
  } finally {
    chrome.kill("SIGKILL");
    server.close();
    rmSync(userData, { recursive: true, force: true });
  }
}

main();
