/**
 * Camera angle sweep: for each pitch / frac / side combination, stages a jab exchange at gap 1.4 and reports the fighter height share,
 * the screen distance between the two heads over a fighter's height (separation: higher means the faces are less on top of each other),
 * the share of the frame the floor takes below the fighters' feet, and the share the crowd band takes. Optionally saves a shot per combo.
 * Usage: node tools/cam-sweep.mjs [out-prefix] [--bout 0-5] [--shots] [--size 1920x1080] [--grid pitch=.47,.38;frac=.34,.4;yaw=0,.2] [--list pitch,frac,yaw;...]
 */
import { writeFileSync } from "node:fs";
import { withPage, bootSublevel } from "./cdp-session.mjs";

const ARGS = process.argv.slice(2);
const OUT = ARGS.find((a) => !a.startsWith("--")) || "tuning/s18-sweep";
const flag = (n, d) => { const i = ARGS.indexOf(n); return i >= 0 ? ARGS[i + 1] : d; };
const BOUT = Number(flag("--bout", 0)), SHOTS = ARGS.includes("--shots");
const [W, H] = flag("--size", "1920x1080").split("x").map(Number);
const grid = { pitch: [.47, .38, .30], frac: [.34, .40, .46], yaw: [0, .2, .4] };
for (const part of flag("--grid", "").split(";").filter(Boolean)) { const [k, v] = part.split("="); grid[k] = v.split(",").map(Number); }
const combos = [];
const LIST = flag("--list", "");
if (LIST) LIST.split(";").forEach((t) => { const [pitch, frac, yaw] = t.split(",").map(Number); combos.push({ pitch, frac, yaw }); });
else for (const pitch of grid.pitch) for (const frac of grid.frac) for (const yaw of grid.yaw) combos.push({ pitch, frac, yaw });

await withPage(async (cdp) => {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await bootSublevel(cdp);
  await cdp.eval(`(async () => {
    const raf = () => new Promise((r) => requestAnimationFrame(r)), S = window.__sublevel, G = S.G;
    const css = document.createElement("style"); css.textContent = "#snd,#keys,#tutor,#banner{display:none!important}"; document.head.appendChild(css);
    S.seed(5); S.startBout(${BOUT}); document.getElementById("wrap").hidden = true;
    while (G.state !== "fight") await raf();
    for (let i = 0; i < 120; i++) await raf();
    S.E.ai.cd = 99; S.E.cfg.cd = 99; S.E.speed0 = 0; S.E.cfg.heavy = 0; S.E.cfg.dodge = 0; S.E.cfg.block = 0;
    window.__raf = raf; return true; })()`, true);
  const rows = [];
  for (const c of combos) {
    const r = await cdp.eval(`(async () => {
      const raf = window.__raf, S = window.__sublevel, G = S.G, B = window.BABYLON, scene = B.Engine.LastCreatedScene, cam = scene.activeCamera;
      Object.assign(S.CAM, ${JSON.stringify(c)});
      if (G.state === "pause") G.state = "fight";
      S.P.pos.set(-0.7, 0, 0); S.E.pos.set(0.7, 0, 0); S.P.vel.set(0, 0, 0); S.E.vel.set(0, 0, 0);
      [S.P, S.E].forEach((f) => { f.state = "idle"; f.atk = null; f.stunT = 0; f.stam = 100; f.cd = 0; f.mv.set(0, 0, 0); });
      S.P.hp = 84; S.E.hp = 60; G.hitstop = 0; G.shake = 0;
      for (let i = 0; i < 150; i++) await raf();
      const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? "keydown" : "keyup", { key: k, bubbles: true }));
      const hp0 = S.E.hp; key("j", true); await raf(); key("j", false);
      const t = performance.now(); while (S.E.hp >= hp0 - 0.01 && performance.now() - t < 1500) await raf();
      const h = performance.now(); while (performance.now() - h < 120) await raf();
      G.state = "pause"; await raf(); await raf();
      const rw = scene.getEngine().getRenderWidth(), rh = scene.getEngine().getRenderHeight();
      const tm = scene.getTransformMatrix();
      const proj = (x, y, z) => { const q = B.Vector3.TransformCoordinates(new B.Vector3(x, y, z), tm); return { x: (q.x * .5 + .5) * rw, y: (-q.y * .5 + .5) * rh }; };
      const P = S.P.pos, E = S.E.pos;
      const a = proj(P.x, 1.8, P.z), af = proj(P.x, 0, P.z), b = proj(E.x, 1.8, E.z), bf = proj(E.x, 0, E.z);
      const hgt = ((af.y - a.y) + (bf.y - b.y)) / 2;
      return { share: Math.round(hgt / rh * 1000) / 1000, sep: Math.round(Math.abs(a.x - b.x) / hgt * 100) / 100, headTop: Math.round(Math.min(a.y, b.y) / rh * 100) / 100,
               feet: Math.round(Math.max(af.y, bf.y) / rh * 100) / 100, camY: Math.round(cam.position.y * 100) / 100 };
    })()`, true);
    rows.push({ ...c, ...r });
    if (SHOTS) {
      const pic = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 84 });
      writeFileSync(`${OUT}-b${BOUT + 1}-p${c.pitch}-f${c.frac}-y${c.yaw}.jpg`, Buffer.from(pic.data, "base64"));
    }
  }
  console.log("pitch frac yaw | share sep headTop feet camY");
  rows.forEach((r) => console.log(`${r.pitch} ${r.frac} ${r.yaw} | ${r.share} ${r.sep} ${r.headTop} ${r.feet} ${r.camY}`));
}, { file: false });
