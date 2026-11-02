/**
 * Do the fighters stand out from the spectators: for each bout, the mean luminance of the pixels inside each fighter's projected body box
 * against the same for each skinned spectator's, from one screenshot (1600x900, the standard framing). Also how many spectators were built,
 * and how long the crowd took (draws are in tools/env-probe.mjs). Usage: node tools/crowd-probe.mjs [bouts, default 0,2,3,5]
 */
import { withPage, bootSublevel } from "./cdp-session.mjs";

const BOUTS = (process.argv[2] || "0,2,3,5").split(",").map(Number);
await withPage(async (cdp) => {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await bootSublevel(cdp);
  const rows = [];
  for (const b of BOUTS) {
    const prep = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), S = window.__sublevel, G = S.G, B = window.BABYLON, scene = B.Engine.LastCreatedScene, engine = B.Engine.LastCreatedEngine, C = S.CROWD;
      document.getElementById("wrap").hidden = true; S.seed(5);
      const t0 = performance.now(); S.startBout(${b}); while (G.state !== "fight") await raf();
      const w0 = performance.now(); while (!C.on && performance.now() - w0 < 9000) await raf();
      const buildMs = Math.round(performance.now() - t0);
      S.E.ai.cd = 99; S.E.cfg.cd = 99; S.E.speed0 = 0; S.P.pos.set(-0.7, 0, 0); S.E.pos.set(0.7, 0, 0); G.cheer = 0;
      for (let i = 0; i < 120; i++) await raf();
      G.state = "pause"; await raf(); await raf();
      const rw = engine.getRenderWidth(), rh = engine.getRenderHeight(), tm = scene.getTransformMatrix();
      const proj = (x, y, z) => { const q = B.Vector3.TransformCoordinates(new B.Vector3(x, y, z), tm); return [(q.x * .5 + .5) * rw, (-q.y * .5 + .5) * rh]; };
      const box = (x, z, w) => { const pts = [[x - w, 0, z], [x + w, 0, z], [x - w, 1.8, z], [x + w, 1.8, z]].map((p) => proj(p[0], p[1], p[2])); return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]; };
      const fighters = [box(S.P.pos.x, S.P.pos.z, .35), box(S.E.pos.x, S.E.pos.z, .35)];
      const crowd = C.members.map((m) => { const p = m.anchor.position; return box(p.x, p.z, .3); });
      
      return { buildMs, spectators: C.members.length, fighters, crowd, rw, rh };
    })()`, true);
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    const lum = await cdp.eval(`(async () => {
      const img = new Image(); img.src = "data:image/png;base64,${shot.data}"; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const P = ${JSON.stringify(prep)};
      const mean = (b) => { const x0 = Math.max(0, Math.floor(b[0])), y0 = Math.max(0, Math.floor(b[1])), x1 = Math.min(c.width, Math.ceil(b[2])), y1 = Math.min(c.height * .93, Math.ceil(b[3])); if (x1 <= x0 || y1 <= y0) return null; const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data; let s = 0, n = 0; for (let i = 0; i < d.length; i += 4) { s += .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]; n++; } return s / n; };
      const f = P.fighters.map(mean).filter((v) => v !== null), cr = P.crowd.map(mean).filter((v) => v !== null);
      const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
      return { fighters: Math.round(avg(f) * 10) / 10, crowd: Math.round(avg(cr) * 10) / 10, ratio: Math.round(avg(cr) / avg(f) * 100) / 100, measured: cr.length };
    })()`, true);
    rows.push({ bout: b + 1, buildMs: prep.buildMs, spectators: prep.spectators, ...lum });
  }
  console.log(JSON.stringify(rows));
}, { args: ["--autoplay-policy=no-user-gesture-required"] });
