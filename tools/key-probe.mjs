/**
 * Which key presses does the game drop, and why. A seeded stream of real keydown/keyup events (J jab, K heavy, Space dodge, L block held)
 * is sent during a bout while every sim tick is logged (fighter state, stamina, and the action that started on the tick). A press is
 * accepted when its action starts inside the buffer window (J, K, Space) or the block is up within 3 ticks (L); otherwise the states seen
 * in the window say why: stamina, recovery from an attack, stun, dodge, or "other".
 * Usage: node tools/key-probe.mjs [seconds per scenario, default 60] [--window 0.22]   (prints a JSON summary per scenario)
 * Scenarios: "passive" (the opponent never acts, so only the player's own state and stamina can drop a press) and "live" (Reyes plays).
 */
import { withPage, bootSublevel } from "./cdp-session.mjs";

const SECS = Number(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : 60);
const wi = process.argv.indexOf("--window");
const WINDOW = wi >= 0 ? Number(process.argv[wi + 1]) : 0.22;

await withPage(async (cdp) => {
  await bootSublevel(cdp);
  const out = {};
  for (const scenario of ["passive", "live"]) {
    const raw = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), S = window.__sublevel, G = S.G;
      document.getElementById("wrap").hidden = true; S.seed(5); S.startBout(0);
      while (G.state !== "fight") await raf();
      for (let i = 0; i < 90; i++) await raf();
      const E = S.E, P = S.P;
      if (${JSON.stringify(scenario)} === "passive") { E.ai.cd = 99; E.cfg.cd = 99; E.speed0 = 0; E.cfg.heavy = 0; E.cfg.dodge = 0; E.cfg.block = 0; }
      P.pos.set(-1.1, 0, 0); E.pos.set(0.9, 0, 0); P.hp = P.maxHp = 1e6; E.hp = E.maxHp = 1e6;
      const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? "keydown" : "keyup", { key: k, bubbles: true }));
      const log = [], presses = []; G.trace = (n) => { log.push([n, P.state, Math.round(P.stam * 10) / 10, P.started || "", E.state === "attack" ? 1 : 0]); };
      let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const t0 = performance.now(); let next = t0 + 200, lHeld = false, lUp = 0;
      while (performance.now() - t0 < ${SECS} * 1000) {
        await raf(); const now = performance.now();
        if (lHeld && now >= lUp) { key("l", false); lHeld = false; }
        if (now >= next) {
          const r = rnd(); next = now + 90 + rnd() * 520;
          const act = r < .4 ? "jab" : r < .62 ? "heavy" : r < .74 ? "dodge" : "block";
          if (act === "block") { if (!lHeld) { key("l", true); lHeld = true; lUp = now + 160 + rnd() * 380; presses.push({ act, tick: G.ticks }); } }
          else { const k = act === "jab" ? "j" : act === "heavy" ? "k" : " "; key(k, true); key(k, false); presses.push({ act, tick: G.ticks }); }
        }
      }
      if (lHeld) key("l", false);
      G.trace = null;
      return JSON.stringify({ log, presses });
    })()`, true);
    const { log, presses } = JSON.parse(raw);
    const byTick = new Map(log.map((r) => [r[0], r]));
    const W = Math.round(WINDOW * 60) + 1;
    const stats = { presses: 0, accepted: 0, dropped: {}, byAct: {} };
    const cost = { jab: 10, heavy: 24, dodge: 16, block: 1 };
    for (const p of presses) {
      const a = (stats.byAct[p.act] ||= { n: 0, ok: 0 }); a.n++; stats.presses++;
      const span = p.act === "block" ? 4 : W; let ok = false; const seen = new Set(); let minStam = 1e9;
      for (let t = p.tick; t < p.tick + span; t++) {
        const r = byTick.get(t + 1) || byTick.get(t); if (!r) continue;
        seen.add(r[1]); minStam = Math.min(minStam, r[2]);
        if (p.act === "block" ? r[1] === "block" : p.act === "dodge" ? r[1] === "dodge" : r[3] === p.act) { ok = true; break; }
      }
      if (ok) { stats.accepted++; a.ok++; continue; }
      const cause = seen.has("hit") ? "stun" : seen.has("attack") ? "recovery" : seen.has("dodge") && p.act !== "dodge" ? "dodge" : minStam < cost[p.act] ? "stamina" : "other";
      const d = (stats.dropped[p.act] ||= {}); d[cause] = (d[cause] || 0) + 1;
    }
    stats.acceptedShare = Math.round(stats.accepted / stats.presses * 1000) / 10;
    out[scenario] = stats;
  }
  console.log(JSON.stringify({ windowSeconds: WINDOW, secondsPerScenario: SECS, ...out }, null, 1));
});
