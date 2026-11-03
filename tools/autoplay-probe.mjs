/**
 * Autoplay (the AI plays the player's side): boots with ?auto=1 and runs fights in real time with no input.
 * Part 1: three fights (Reyes, Dag, Pike) with no input; reports time to the first action, how the fight ended and its length.
 * Part 2: presses J mid-fight and checks that autoplay stops within one frame (the badge goes, the human jab starts) and that the next bout resumes it.
 * Usage: node tools/autoplay-probe.mjs [bouts, default 0,1,2] [seconds cap per fight, default 120]
 */
import { withPage, bootSublevel } from "./cdp-session.mjs";
import { createStaticServer } from "./cdp-session.mjs";

const BOUTS = (process.argv[2] || "0,1,2").split(",").map(Number), CAP = Number(process.argv[3] || 120);
let url = null;
const server = await createStaticServer();
url = `http://127.0.0.1:${server.address().port}/index.html?auto=1`;
await withPage(async (cdp) => {
  await bootSublevel(cdp);
  const rows = [];
  for (const b of BOUTS) {
    rows.push(JSON.parse(await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), S = window.__sublevel, G = S.G;
      document.getElementById("wrap").hidden = true; document.getElementById("tutor").hidden = true; S.seed(5); S.startBout(${b});
      while (G.state !== "fight") await raf();
      const t0 = performance.now(); let first = null, lastPos = S.P.pos.clone(), taken = false;
      while (G.state === "fight" && performance.now() - t0 < ${CAP} * 1000) {
        await raf();
        const P = S.P; if (first === null && (P.state === "attack" || P.state === "dodge" || P.state === "block" || P.pos.subtract(lastPos).length() > 0.05)) first = Math.round(performance.now() - t0);
        if (S.autoState().taken) taken = true;
      }
      const ended = G.state, secs = Math.round((performance.now() - t0) / 100) / 10;
      return JSON.stringify({ bout: ${b} + 1, foe: S.BOUTS[${b}].foe, firstActionMs: first, ended, winner: G.winner === S.P ? "player" : G.winner ? "foe" : null, secs, takenByAccident: taken, badgeShown: !document.getElementById("autoTag").hidden });
    })()`, true)));
  }
  const take = JSON.parse(await cdp.eval(`(async () => {
    const raf = () => new Promise((r) => requestAnimationFrame(r)), S = window.__sublevel, G = S.G, tag = document.getElementById("autoTag");
    const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? "keydown" : "keyup", { key: k, bubbles: true }));
    document.getElementById("wrap").hidden = true; S.seed(5); S.startBout(0);
    while (G.state !== "fight") await raf();
    for (let i = 0; i < 90; i++) await raf();
    S.P.hp = S.P.maxHp = 1e6; S.E.hp = S.E.maxHp = 1e6;
    const before = { auto: S.autoState(), badge: !tag.hidden };
    const t = G.ticks; key("j", true); key("j", false);
    await raf(); await raf();
    const after = { auto: S.autoState(), badge: !tag.hidden, ticks: G.ticks - t };
    S.startBout(1); while (G.state !== "fight") await raf();
    return JSON.stringify({ before, after, nextBout: { auto: S.autoState(), badge: !tag.hidden } });
  })()`, true));
  console.log(JSON.stringify({ fights: rows, takeover: take }, null, 1));
}, { url, args: ["--autoplay-policy=no-user-gesture-required"] });
server.close();
