/**
 * Foot slide on the walk clip: the player walks across the ring with the opponent parked far off, and each frame the world position of
 * both foot bones is read. A planted foot is still in the world while the body moves over it; a sliding one moves with the body. A foot
 * is judged from its motion relative to the body: half the range A and the cycle rate f give the speed a planted foot would need, 4 A f.
 * Usage: node tools/foot-probe.mjs [key d|a|w|s] [seconds] [clip name for the walk, e.g. Run] [walk cycle rate in rad/s at full speed, 9 is the procedural legs; SKIN.walkK is this over 9]     (prints root speed, A, f, the speed the feet match, and its ratio to the root speed)
 */
import { withPage, bootSublevel, waitFight } from "./cdp-session.mjs";

const KEY = process.argv[2] || "d", SECS = Number(process.argv[3] || 1.6), CLIP = process.argv[4] || "", RATE = Number(process.argv[5] || 14);
await withPage(async (cdp) => {
  await bootSublevel(cdp); await waitFight(cdp, 0);
  const out = await cdp.eval(`(async () => {
    const raf = () => new Promise((r) => requestAnimationFrame(r)), S = window.__sublevel, G = S.G, key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? "keydown" : "keyup", { key: k, bubbles: true }));
    while (!S.P.skin) await raf();
    for (let i = 0; i < 60; i++) await raf();
    S.E.ai.cd = 99; S.E.cfg.cd = 99; S.E.speed0 = 0; S.E.pos.set(5.5, 0, 5); S.P.pos.set(-2, 0, 0);
    const sk = S.P.skin.res.skeletons[0], bone = (n) => sk.bones.find((b) => b.name === n).getTransformNode();
    const feet = [bone("LeftFoot"), bone("RightFoot")];
    if (${JSON.stringify(CLIP)}) S.P.skin.M.clips.walk = ${JSON.stringify(CLIP)};
    S.SKIN.walkK = ${RATE} / 9;
    key(${JSON.stringify(KEY)}, true);
    for (let i = 0; i < 40; i++) await raf();
    const rows = [], t0 = performance.now(); let tPrev = t0;
    while (performance.now() - t0 < ${SECS} * 1000) {
      await raf(); const now = performance.now(), dt = (now - tPrev) / 1000; tPrev = now;
      const r = S.P.slot.getAbsolutePosition(), f = feet.map((n) => n.getAbsolutePosition());
      rows.push({ dt, r: [r.x, r.z], f: f.map((v) => [v.x, v.y, v.z]) });
    }
    key(${JSON.stringify(KEY)}, false);
    /* foot position along the walking direction, relative to the body. A planted foot moves back at the body's speed, so the stride
       (half the range, A) and the cycle rate (f) give the speed the feet can match: about 4 A f. A ratio under 1 means the feet slide. */
    let rootV = 0, n = 0; const dir = [rows[rows.length - 1].r[0] - rows[0].r[0], rows[rows.length - 1].r[1] - rows[0].r[1]], dl = Math.hypot(dir[0], dir[1]) || 1; dir[0] /= dl; dir[1] /= dl;
    for (let i = 1; i < rows.length; i++) { rootV += Math.hypot(rows[i].r[0] - rows[i - 1].r[0], rows[i].r[1] - rows[i - 1].r[1]) / (rows[i].dt || 1 / 60); n++; }
    rootV /= n; const dur = rows.reduce((a, q) => a + q.dt, 0), res = [];
    for (let k = 0; k < 2; k++) {
      const rel = rows.map((q) => (q.f[k][0] - q.r[0]) * dir[0] + (q.f[k][2] - q.r[1]) * dir[1]), mean = rel.reduce((a, v) => a + v, 0) / rel.length;
      let cross = 0; for (let i = 1; i < rel.length; i++) if ((rel[i - 1] - mean) * (rel[i] - mean) < 0) cross++;
      res.push({ A: (Math.max(...rel) - Math.min(...rel)) / 2, f: cross / 2 / dur });
    }
    const A = (res[0].A + res[1].A) / 2, f = (res[0].f + res[1].f) / 2, need = 4 * A * f;
    return JSON.stringify({ frames: rows.length, rootSpeed: Math.round(rootV * 100) / 100, strideHalfRange: Math.round(A * 100) / 100, cycleHz: Math.round(f * 100) / 100, plantedSpeed: Math.round(need * 100) / 100, matchRatio: Math.round(need / rootV * 100) / 100, clip: S.P.skin.lastClip });
  })()`, true);
  console.log(out);
});
