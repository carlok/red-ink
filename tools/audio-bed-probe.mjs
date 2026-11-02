/**
 * How loud the always-on sound is. An AnalyserNode on the master bus is read (RMS over 1 s, in dBFS) at the title card, in a fight with
 * nothing happening, in a rally (a punch every 0.6 s), while paused, and at the knockout; also the state of the audio context, the loops
 * that are running. Each reading is { rms, peak } in dBFS.
 * Usage: node tools/audio-bed-probe.mjs   (prints one JSON object)
 */
import { withPage, bootSublevel } from "./cdp-session.mjs";

await withPage(async (cdp) => {
  await bootSublevel(cdp);
  const out = await cdp.eval(`(async () => {
    const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G;
    const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? "keydown" : "keyup", { key: k, bubbles: true }));
    key("x", true); key("x", false);               // the first key press starts the audio
    await S.audioReady(); await sleep(400);
    const g = S.audioGraph(), an = g.ac.createAnalyser(); an.fftSize = 2048; g.master.connect(an);
    const buf = new Float32Array(an.fftSize);
    const rms = async (ms) => { let acc = 0, n = 0, pk = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { an.getFloatTimeDomainData(buf); for (let i = 0; i < buf.length; i++) { acc += buf[i] * buf[i]; if (Math.abs(buf[i]) > pk) pk = Math.abs(buf[i]); } n += buf.length; await sleep(20); }
      const db = (v) => Math.round(20 * Math.log10(v + 1e-9) * 10) / 10; return { rms: db(Math.sqrt(acc / n)), peak: db(pk) }; };
    const res = { ctx: g.ac.state, loops: Object.keys(g.loopSrc).length };
    res.title = await rms(1500);
    document.getElementById("wrap").hidden = true; S.seed(5); S.startBout(0);
    while (G.state !== "fight") await raf();
    S.E.ai.cd = 99; S.E.cfg.cd = 99; S.E.speed0 = 0; S.E.cfg.block = 0; S.E.cfg.dodge = 0; S.P.pos.set(-0.7, 0, 0); S.E.pos.set(0.7, 0, 0); S.P.hp = S.P.maxHp = 1e6; S.E.hp = S.E.maxHp = 1e6;
    await sleep(2500); res.fightIdle = await rms(2000);
    let go = true; const spam = (async () => { while (go) { key("j", true); key("j", false); await sleep(600); } })();
    await sleep(1500); res.rally = await rms(3000); go = false; await spam;
    S.pauseFight(); await sleep(800); res.paused = await rms(1500); S.resumeFight();
    S.E.hp = 1; E = S.E; key("j", true); key("j", false); await sleep(700); res.ko = await rms(1200);
    const st = S.audioState(); res.state = { crowd: st.crowd, duck: st.duck };
    return JSON.stringify(res); })()`, true);
  console.log(out);
}, { args: ["--autoplay-policy=no-user-gesture-required"] });
