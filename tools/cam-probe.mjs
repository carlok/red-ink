/**
 * Camera framing: how big the fighters are, whether both stay in frame, outline thickness,
 * and how close the camera gets to the crowd and the pillars.
 * Usage: node tools/cam-probe.mjs [tag] [--close] [--norim] [--only 1920,844,390] [--bout 0-5] [--cam key=value,...]
 *   tag      shot name part, default "after": tuning/s14-<tag>-<width>.jpg
 *   --close  also save a gap 1.2 shot per size
 *   --norim  skip the 24 rim placements
 *   --only   run some of the three sizes
 *   --bout   which opponent to stage, 0 for Reyes up to 5 for Halvorsen (default 0)
 *   --cam    override CAM keys for this run, e.g. --cam padPortrait=1.8,follow=5 (shots are skipped)
 * Fighters are held in the ready state and placed by hand. Camera settle is 90 frames.
 * "Clipped" means a fighter's body (0.6 m either side of its centre) leaves the central 84% of the width,
 * a head rises above 10% of the height, or a foot falls below 99%. Arms are not counted: they point along the
 * fight axis, which the camera sees side on, so the outer edge of the pair is the body.
 * The chase and circle runs move both fighters at 4.4 m/s, the player's top speed, for the worst camera lag.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARGS = process.argv.slice(2);
const TAG = ARGS.find((a) => !a.startsWith("--")) || "after";
const CLOSE = ARGS.includes("--close");
const NORIM = ARGS.includes("--norim");
const flag = (name) => { const i = ARGS.indexOf(name); return i >= 0 ? ARGS[i + 1] : ""; };
const ONLY = flag("--only");
const BOUT = Number(flag("--bout") || 0);
const CAMSET = {};
for (const kv of flag("--cam").split(",").filter(Boolean)) { const [k, v] = kv.split("="); CAMSET[k] = Number(v); }
const SIZES = [
  { name: "1920", w: 1920, h: 1080, dsf: 1, mobile: false, rim: true },
  { name: "844", w: 844, h: 390, dsf: 2, mobile: true, rim: false },
  { name: "390", w: 390, h: 844, dsf: 2, mobile: true, rim: true },
].filter((s) => !ONLY || ONLY.split(",").includes(s.name));

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

/* Runs in the page. Installs window.__cam. */
const LIB = `(async () => {
  const t0 = performance.now();
  while (!window.__sublevel || !window.__sublevel.startBout) {
    if (performance.now() - t0 > 15000) throw new Error("boot");
    await new Promise((r) => requestAnimationFrame(r));
  }
  const B = window.BABYLON, V = B.Vector3, S = window.__sublevel;
  S.startBout(${BOUT});
  Object.assign(S.CAM, ${JSON.stringify(CAMSET)});
  document.getElementById("wrap").hidden = true;
  const tut = document.getElementById("tutor"); if (tut) tut.hidden = true;
  const engine = B.Engine.LastCreatedEngine, scene = B.Engine.LastCreatedScene, cam = scene.activeCamera;
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const r3 = (n) => Math.round(n * 1000) / 1000;
  S.CAM.reveal = 0; // the ready-phase reveal would otherwise change the framing being measured
  const hold = () => { S.G.readyT = 0; if (S.G.state !== "ready") S.G.state = "ready"; };
  async function frames(n) { for (let i = 0; i < n; i++) { hold(); await raf(); } }
  const dims = () => ({ W: engine.getRenderWidth(), H: engine.getRenderHeight() });
  function proj(x, y, z) {
    const m = scene.getTransformMatrix().m;
    const w = x * m[3] + y * m[7] + z * m[11] + m[15];
    return { x: (x * m[0] + y * m[4] + z * m[8] + m[12]) / w * 0.5 + 0.5, y: 0.5 - (x * m[1] + y * m[5] + z * m[9] + m[13]) / w * 0.5 };
  }
  function stage(x, z, gap, phi) {
    const ux = Math.sin(phi), uz = Math.cos(phi);
    S.P.pos.set(x - ux * gap / 2, 0, z - uz * gap / 2); S.E.pos.set(x + ux * gap / 2, 0, z + uz * gap / 2);
    S.P.yaw = Math.atan2(ux, uz); S.E.yaw = Math.atan2(-ux, -uz);
    S.P.root.rotation.y = S.P.yaw; S.E.root.rotation.y = S.E.yaw;
    [S.P, S.E].forEach((f) => { f.vel.set(0, 0, 0); f.mv.set(0, 0, 0); f.state = "idle"; f.atk = null; });
  }
  function measure() {
    const cr = S.G.camR;
    let left = 1, right = 0, top = 1, bottom = 0, share = 0;
    for (const f of [S.P, S.E]) {
      const bb = f.root.getHierarchyBoundingVectors(true);
      const foot = proj(f.pos.x, bb.min.y, f.pos.z), head = proj(f.pos.x, bb.max.y, f.pos.z);
      share += (foot.y - head.y) / 2;
      top = Math.min(top, head.y); bottom = Math.max(bottom, foot.y);
      for (const s of [-1, 1]) {
        const q = proj(f.pos.x + cr.x * 0.6 * s, 1.0, f.pos.z + cr.z * 0.6 * s);
        left = Math.min(left, q.x); right = Math.max(right, q.x);
      }
    }
    const m = S.P.pos.add(S.E.pos).scale(0.5), t = new V(m.x, 1.1, m.z);
    return { D: r3(V.Distance(cam.position, t)), share: r3(share), left: r3(left), right: r3(right), top: r3(top), bottom: r3(bottom),
             cam: [r3(cam.position.x), r3(cam.position.y), r3(cam.position.z)] };
  }
  const clipped = (m) => m.left < 0.08 || m.right > 0.92 || m.top < 0.10 || m.bottom > 0.99;
  async function sweep(gaps) {
    const rows = [];
    for (const g of gaps) { stage(0, 0, g, Math.PI / 2); await frames(90); rows.push({ gap: g, ...measure() }); }
    return rows;
  }
  const off = (m) => m.left < 0.02 || m.right > 0.98 || m.top < 0.02 || m.bottom > 1;
  function tally() { return { n: 0, clipped: 0, off: 0, left: 1, right: 0, top: 1, bottom: 0 }; }
  function add(T, m) { T.n++; if (clipped(m)) T.clipped++; if (off(m)) T.off++; T.left = Math.min(T.left, m.left); T.right = Math.max(T.right, m.right); T.top = Math.min(T.top, m.top); T.bottom = Math.max(T.bottom, m.bottom); }
  function done(T) { return { n: T.n, clipped: T.clipped, off: T.off, left: r3(T.left), right: r3(T.right), top: r3(T.top), bottom: r3(T.bottom) }; }
  async function run(label, setup, drive, secs) {
    setup(); await frames(90);
    const T = tally(), t0 = performance.now();
    for (;;) {
      const t = (performance.now() - t0) / 1000; if (t > secs) break;
      drive(t); hold(); await raf(); add(T, measure());
    }
    return { label, ...done(T) };
  }
  async function dynamic() {
    const out = [];
    out.push(await run("chase-x", () => stage(-6, 0, 2, Math.PI / 2), (t) => {
      const x = -6 + 4.4 * t; S.P.pos.set(x - 1, 0, 0); S.E.pos.set(x + 1, 0, 0); S.P.mv.set(4.4, 0, 0); S.E.mv.set(4.4, 0, 0);
    }, 2.2));
    out.push(await run("circle-r5", () => stage(0, 5, 2, Math.PI / 2), (t) => {
      const a = 0.88 * t, mx = Math.sin(a) * 5, mz = Math.cos(a) * 5, ux = Math.cos(a), uz = -Math.sin(a);
      S.P.pos.set(mx - ux, 0, mz - uz); S.E.pos.set(mx + ux, 0, mz + uz);
      S.P.mv.set(ux * 4.4, 0, uz * 4.4); S.E.mv.set(ux * 4.4, 0, uz * 4.4);
    }, 3.2));
    let k = 0;
    out.push(await run("knock-E", () => { stage(0, 0, 2, Math.PI / 2); k = 0; }, () => { if (!k++) S.E.vel.set(18, 0, 0); }, 1.2));
    k = 0;
    out.push(await run("knock-P", () => { stage(0, 0, 2, Math.PI / 2); k = 0; }, () => { if (!k++) S.P.vel.set(-18, 0, 0); }, 1.2));
    return out;
  }
  function clearance() {
    const cp = cam.position, m = S.P.pos.add(S.E.pos).scale(0.5), bx = m.x, bz = m.z;
    const A = { x: cp.x, y: cp.y, z: cp.z }, Bp = { x: bx, y: 1.1, z: bz };
    const dx = Bp.x - A.x, dz = Bp.z - A.z, L2 = dx * dx + dz * dz || 1e-6;
    const things = scene.meshes.filter((q) => q.sourceMesh && /^b\\d+$/.test(q.name)).map((q) => ({ x: q.position.x, z: q.position.z, top: 1.75 * q.scaling.x, rad: 0.4, k: "crowd" }));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.39; things.push({ x: Math.sin(a) * 13.6, z: Math.cos(a) * 13.6, top: 9, rad: 0.5, k: "pillar" }); }
    let nearest = 99, near = "", blocked = false;
    for (const q of things) {
      const h = Math.hypot(q.x - A.x, q.z - A.z), dy = A.y > q.top ? A.y - q.top : 0;
      const d = Math.hypot(h, dy) - (q.k === "pillar" ? 0.45 : 0);
      if (d < nearest) { nearest = d; near = q.k; }
      const t = Math.min(1, Math.max(0, ((q.x - A.x) * dx + (q.z - A.z) * dz) / L2));
      const px = A.x + dx * t, pz = A.z + dz * t, y = A.y + (Bp.y - A.y) * t;
      if (t > 0.02 && t < 0.98 && Math.hypot(q.x - px, q.z - pz) < q.rad && y < q.top) blocked = true;
    }
    return { camR: r3(Math.hypot(cp.x, cp.z)), nearest: r3(nearest), near, blocked, wall: r3(16.95 - Math.max(Math.abs(cp.x), Math.abs(cp.z))) };
  }
  async function rim(n, r, axis) {
    const rows = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, x = Math.sin(a) * r, z = Math.cos(a) * r;
      stage(x, z, 2, axis === "tan" ? a + Math.PI / 2 : a); await frames(90);
      rows.push({ a: r3(a), axis, ...clearance() });
    }
    return rows;
  }
  function outline() {
    const ms = S.P.root.getChildMeshes().filter((q) => q.renderOutline);
    const ws = ms.map((q) => q.outlineWidth).sort((a, b) => a - b);
    const ow = ws.length ? ws[Math.floor(ws.length / 2)] : 0;
    const { H } = dims(), f = cam.getProjectionMatrix().m[5] * H / 2;
    const D = V.Distance(cam.position, S.P.pos.add(new V(0, 1.2, 0)));
    return { meshes: ms.length, ow: r3(ow), px: r3(ow * f / D), px1080: r3(ow * f / D * 1080 / H) };
  }
  async function pose(gap) { stage(0, 0, gap, Math.PI / 2); await frames(90); return true; }
  window.__cam = { sweep, dynamic, rim, outline, pose, measure, dims: () => ({ ...dims(), asp: r3(engine.getAspectRatio(cam)), fov: r3(cam.fov), mode: cam.fovMode }) };
  return true;
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
const report = {};
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
  const ev = async (expression) => {
    const out = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (out.exceptionDetails) {
      const d = out.exceptionDetails.exception && out.exceptionDetails.exception.description;
      throw new Error(d || JSON.stringify(out.exceptionDetails));
    }
    return out.result.value;
  };
  const shot = async (name) => {
    const pic = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
    writeFileSync(join(ROOT, "tuning", name), Buffer.from(pic.data, "base64"));
  };
  for (const s of SIZES) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: s.w, height: s.h, deviceScaleFactor: s.dsf, mobile: s.mobile });
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html` });
    await new Promise((r) => setTimeout(r, 400));
    await ev(LIB);
    const r = { dims: await ev("__cam.dims()") };
    r.sweep = await ev("__cam.sweep([1, 1.5, 2, 3, 4, 5, 6])");
    r.dynamic = await ev("__cam.dynamic()");
    await ev("__cam.pose(2)");
    r.outline = await ev("__cam.outline()");
    if (!Object.keys(CAMSET).length) {
      await shot(`s14-${TAG}-${s.name}.jpg`);
      if (CLOSE) { await ev("__cam.pose(1.2)"); await shot(`s14-${TAG}-${s.name}-close.jpg`); }
    }
    if (s.rim && !NORIM) {
      r.rimTan = await ev("__cam.rim(16, 6.5, 'tan')");
      r.rimRad = await ev("__cam.rim(8, 6.0, 'rad')");
    }
    report[s.name] = r;
  }
  ws.close();
} finally {
  chrome.kill("SIGKILL");
  server.close();
  rmSync(userData, { recursive: true, force: true });
}

/* Summary, then the raw JSON. */
const pct = (n) => (Math.round(n * 1000) / 10) + "%";
for (const [name, r] of Object.entries(report)) {
  const g2 = r.sweep.find((x) => x.gap === 2);
  console.log(`== ${name}  aspect ${r.dims.asp}  fov ${r.dims.fov}  render ${r.dims.W}x${r.dims.H}`);
  console.log(`   gap 2: height share ${pct(g2.share)}  camera ${g2.D} m from the midpoint  top ${pct(g2.top)}  bottom ${pct(g2.bottom)}`);
  console.log(`   sweep clipped: ${r.sweep.filter((x) => x.left < 0.08 || x.right > 0.92 || x.top < 0.10 || x.bottom > 0.99).map((x) => x.gap).join(", ") || "none"}  D by gap: ${r.sweep.map((x) => x.gap + "→" + x.D).join("  ")}`);
  console.log(`   dynamic (clipped, off screen, of frames): ${r.dynamic.map((x) => `${x.label} ${x.clipped}, ${x.off} of ${x.n} (L ${pct(x.left)} R ${pct(x.right)})`).join(" | ")}`);
  console.log(`   outline: ${r.outline.ow} wide, ${r.outline.px1080} px at 1080p`);
  for (const k of ["rimTan", "rimRad"]) {
    if (!r[k]) continue;
    const near = Math.min(...r[k].map((x) => x.nearest)), wall = Math.min(...r[k].map((x) => x.wall));
    console.log(`   ${k}: nearest crowd/pillar ${near} m, blocked ${r[k].filter((x) => x.blocked).length}/${r[k].length}, closest wall ${wall} m, camera radius ${Math.min(...r[k].map((x) => x.camR))}–${Math.max(...r[k].map((x) => x.camR))}`);
  }
}
console.log(JSON.stringify(report));
