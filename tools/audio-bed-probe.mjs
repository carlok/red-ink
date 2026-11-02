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
    /* is it music or a drone: the 50 ms rms is read every 20 ms; onsets are rises of more than 6 dB over the quietest of the last 200 ms
       (at least 150 ms apart), modulation is the std over the mean of the rms. A held tone has none of either. */
    const shape = async (ms) => {
      const r = [], t0 = performance.now();
      while (performance.now() - t0 < ms) { an.getFloatTimeDomainData(buf); let a = 0; for (let i = 0; i < buf.length; i++) a += buf[i] * buf[i]; r.push(Math.sqrt(a / buf.length)); await sleep(20); }
      const mean = r.reduce((x, y) => x + y, 0) / r.length, sd = Math.sqrt(r.reduce((x, y) => x + (y - mean) ** 2, 0) / r.length);
      let on = 0, last = -99; for (let i = 10; i < r.length; i++) { const lo = Math.min(...r.slice(i - 10, i)); if (r[i] > Math.max(lo, 1e-5) * 2 && i - last > 7) { on++; last = i; } }
      return { onsetsPer10s: Math.round(on / (ms / 10000) * 10) / 10, modulation: Math.round(sd / (mean || 1) * 100) / 100 };
    };
    /* the dominant frequency (80 Hz to 2 kHz) every 100 ms; a drone has two or three of them, a tune has many. pitchChanges counts moves of
       more than a semitone, distinctPitches the number of different pitches (rounded to the semitone) that held for 100 ms or more. */
    const fq = new Float32Array(an.frequencyBinCount); an.smoothingTimeConstant = 0;
    const pitches = async (ms) => {
      const hz = g.ac.sampleRate / an.fftSize, lo = Math.ceil(80 / hz), hi = Math.floor(2000 / hz), seq = [], t0 = performance.now();
      while (performance.now() - t0 < ms) { an.getFloatFrequencyData(fq); let b = lo; for (let i = lo; i < hi; i++) if (fq[i] > fq[b]) b = i; seq.push(fq[b] > -90 ? Math.round(12 * Math.log2(b * hz / 55)) : null); await sleep(100); }
      let ch = 0; for (let i = 1; i < seq.length; i++) if (seq[i] !== null && seq[i - 1] !== null && Math.abs(seq[i] - seq[i - 1]) > 1) ch++;
      return { pitchChangesPer10s: Math.round(ch / (ms / 10000) * 10) / 10, distinctPitches: new Set(seq.filter((x) => x !== null)).size };
    };
    const res = { ctx: g.ac.state, sampleLoops: 0, liveBed: !!g.BED.ready };
    res.titleShape = await shape(8000); res.titlePitches = await pitches(8000);
    res.title = await rms(1500);
    document.getElementById("wrap").hidden = true; S.seed(5); S.startBout(0);
    while (G.state !== "fight") await raf();
    S.E.ai.cd = 99; S.E.cfg.cd = 99; S.E.speed0 = 0; S.E.cfg.block = 0; S.E.cfg.dodge = 0; S.P.pos.set(-0.7, 0, 0); S.E.pos.set(0.7, 0, 0); S.P.hp = S.P.maxHp = 1e6; S.E.hp = S.E.maxHp = 1e6;
    await sleep(2500); res.fightIdle = await rms(2000);
    const hp = [S.P.hp, S.E.hp, S.E.maxHp]; S.E.maxHp = 100; S.E.hp = 30; await sleep(2500); res.tenseShape = await shape(8000); res.tensePitches = await pitches(8000); res.tense = await rms(4000); S.E.maxHp = hp[2]; S.E.hp = hp[1];
    let go = true; const spam = (async () => { while (go) { key("j", true); key("j", false); await sleep(600); } })();
    await sleep(1500); res.rally = await rms(3000); go = false; await spam;
    S.pauseFight(); await sleep(800); res.paused = await rms(1500); S.resumeFight();
    S.E.hp = 1; E = S.E; key("j", true); key("j", false); await sleep(700); res.ko = await rms(1200);
    const st = S.audioState(); res.state = { crowd: st.crowd, duck: st.duck };
    /* a suspended context keeps its last buffer in the analyser, so silence is read as the clock standing still */
    S.toSplash(true); await sleep(600); const c0 = g.ac.currentTime; await sleep(2000); res.splash = { ctx: g.ac.state, state: G.state, clockAdvancedSeconds: Math.round((g.ac.currentTime - c0) * 100) / 100 };
    return JSON.stringify(res); })()`, true);
  console.log(out);
}, { args: ["--autoplay-policy=no-user-gesture-required"] });
