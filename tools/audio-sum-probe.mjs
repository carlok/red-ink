/**
 * Summed output level and main-thread stalls. Usage: node tools/audio-sum-probe.mjs
 *
 * audio-probe.mjs checks single sounds. This one taps the output (after the limiter, before it on a build without one) with an AnalyserNode and reports the highest sample seen while a lot plays at once (music and
 * room tone, a crowd swell at full, a hit every 110 ms, the robot voice), and lists the long tasks (50 ms or more) the page runs while it starts all six bouts.
 * Ceiling: no clipping, so exit 1 above -1 dBFS. Sprint 29: before the limiter the loudest scene read -5.1 to -0.4 dBFS over seven runs (hence the limiter); stalls were 50 to 59 ms against a 140 ms music lookahead (so the lookahead was left alone).
 * Headless Chrome on a machine with no audio device may feed the analyser nothing: a peak under 0.05 is reported as "no signal" and exits 2.
 */
import { bootSublevel, withPage } from "./cdp-session.mjs";
await withPage(async (cdp) => {
  await bootSublevel(cdp);
  const r = await cdp.eval(`(async () => {
    const S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), g = S.audioGraph(), ac = g.ac, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    S.setAudio({ mute: false, sfx: 1, music: 1 });
    if (ac.state !== "running") { await ac.resume(); await sleep(200); }
    const an = ac.createAnalyser(); an.fftSize = 2048; (g.limitOut || g.master).connect(an);   /* what reaches the speakers: after the limiter */
    const buf = new Float32Array(an.fftSize), peaks = [];
    const peakNow = () => { an.getFloatTimeDomainData(buf); let m = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > m) m = a; } return m; };
    const measure = async (label, ms, fn) => { let max = 0, n = 0; const t0 = performance.now(); let last = 0;
      while (performance.now() - t0 < ms) { if (fn && performance.now() - last > 110) { last = performance.now(); fn(); } max = Math.max(max, peakNow()); n++; await new Promise((r) => requestAnimationFrame(r)); }
      return { label, peak: +max.toFixed(3), dBFS: +(20 * Math.log10(max || 1e-6)).toFixed(1), frames: n }; };
    const out = [];
    $("wrap").hidden = true; S.startBout(4); await __until(() => G.state === "fight", "fight"); await sleep(500);
    out.push(await measure("fight, music and room only", 2500, null));
    G.cheer = 1;
    out.push(await measure("crowd swell (cheer 1)", 2000, () => { G.cheer = 1; }));
    let k = 0; const SFXS = ["jab", "heavy", "block", "whoosh"];
    out.push(await measure("hits every 110 ms with swell", 3000, () => { G.cheer = 1; S.hit(); }));
    out.push(await measure("hits + robot voice KO + FIGHT", 3000, () => { G.cheer = 1; S.hit(); if ((k++ % 5) === 0) S.voiceSay(k % 2 ? "ko" : "fight"); }));
    return out; })()`, true, 120000);
  for (const x of r) console.log(JSON.stringify(x));
  const loudest = Math.max(...r.map((x) => x.peak));
  if (loudest < 0.05) { console.log("no signal on master: nothing to judge"); process.exitCode = 2; }
  else if (loudest > 0.891) { console.log("CLIPPING RISK: " + (20 * Math.log10(loudest)).toFixed(1) + " dBFS is above -1"); process.exitCode = 1; }
  const lt = await cdp.eval(`(async () => {
    const S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const tasks = []; const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => tasks.push(Math.round(e.duration)))); po.observe({ entryTypes: ["longtask"] });
    for (let b = 0; b < 6; b++) { $("wrap").hidden = true; S.startBout(b); await __until(() => G.state === "fight", "fight"); await sleep(1500); }
    await sleep(300); po.disconnect(); return tasks; })()`, true, 120000);
  console.log("long tasks (ms) while starting all six bouts and fighting 1.5 s each:", JSON.stringify(lt), "max", Math.max(0, ...lt));
}, { args: ["--autoplay-policy=no-user-gesture-required"] });
