/**
 * What the ambience is made of and what it sounds like on paper. Usage: node tools/ambience-probe.mjs
 *
 * With the music, the hits and the voice at zero, only the ambience bed is left. The probe taps the output and reports, over 100 Hz to 8 kHz:
 *  - spectral flatness (geometric over arithmetic mean of the power spectrum, averaged over about 4 s): near 1 for white noise, near 0 for a hum
 *  - the share of the energy above 1 kHz (hiss lives there)
 *  - the level, and how far the level moves from second to second
 *  - how many looping buffer sources the bed builds (it is rebuilt once under a counter)
 * in three scenes: the bed on its own with its occasional events held off (cheer 0 on the old bed), the bed as played with an event allowed to fire, and just after
 * a blow (cheer 1 on the old bed, which swelled; on the new bed a crowd reaction to a knockout, which is the loudest thing it makes).
 * It cannot tell you whether the bed sounds good. Headless Chrome with no audio device may feed the analyser nothing: that is reported as "no signal".
 */
import { bootSublevel, withPage } from "./cdp-session.mjs";
await withPage(async (cdp) => {
  await bootSublevel(cdp);
  const r = await cdp.eval(`(async () => {
    const S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), g = S.audioGraph(), ac = g.ac, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    S.setAudio({ mute: false, sfx: 0, music: 0 });
    if (ac.state !== "running") { await ac.resume(); await sleep(200); }
    /* the bed rebuilt under a counter: how many looping buffer sources does it make? */
    const made = [], orig = ac.createBufferSource.bind(ac); ac.createBufferSource = () => { const s = orig(); made.push(s); return s; };
    g.BED.ready = false; S.bedInit(); ac.createBufferSource = orig;
    const loops = made.filter((s) => s.loop).length, sources = made.length;
    $("wrap").hidden = true; S.startBout(2); await __until(() => G.state === "fight", "fight");
    const an = ac.createAnalyser(); an.fftSize = 4096; an.smoothingTimeConstant = 0; (g.limitOut || g.master).connect(an);
    const bins = an.frequencyBinCount, hz = (i) => i * ac.sampleRate / an.fftSize, spec = new Float32Array(bins), td = new Float32Array(an.fftSize);
    const measure = async (label, cheer, before) => {
      if (before) before();
      const power = new Float64Array(bins); let frames = 0, peak = 0; const levels = [];
      const t0 = performance.now(), end = t0 + 4000; let sec = 0, secSum = 0, secN = 0, nextSec = t0 + 1000;
      while (performance.now() < end) {
        G.cheer = cheer; an.getFloatFrequencyData(spec); an.getFloatTimeDomainData(td);
        for (let i = 0; i < bins; i++) power[i] += Math.pow(10, spec[i] / 10);
        let ss = 0; for (let i = 0; i < td.length; i++) { ss += td[i] * td[i]; if (Math.abs(td[i]) > peak) peak = Math.abs(td[i]); } secSum += ss / td.length; secN++; frames++;
        if (performance.now() > nextSec) { levels.push(10 * Math.log10(secSum / secN || 1e-12)); secSum = 0; secN = 0; nextSec += 1000; }
        await new Promise((r) => requestAnimationFrame(r));
      }
      let lo = 0, hi = bins; for (let i = 0; i < bins; i++) { if (hz(i) < 100) lo = i + 1; if (hz(i) > 8000) { hi = i; break; } }
      let logSum = 0, sum = 0, n = 0, above = 0; for (let i = lo; i < hi; i++) { const p = power[i] / frames + 1e-20; logSum += Math.log(p); sum += p; n++; if (hz(i) >= 1000) above += p; }
      const flat = Math.exp(logSum / n) / (sum / n), rms = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : -120;
      return { label, flatness: +flat.toFixed(4), shareAbove1k: +(above / sum).toFixed(3), levelDbfs: +rms.toFixed(1), peakDbfs: +(20 * Math.log10(peak || 1e-6)).toFixed(1), levelSwingDb: levels.length ? +(Math.max(...levels) - Math.min(...levels)).toFixed(1) : 0 };
    };
    const out = { loopingBufferSources: loops, bufferSources: sources, scenes: [] };
    g.BED.next = 1e12;   /* events held off */
    out.scenes.push(await measure("bed alone, events held off (cheer 0)", 0));
    g.BED.next = 0;      /* an event may fire */
    out.scenes.push(await measure("bed as played, events allowed (cheer 0)", 0));
    g.BED.next = 1e12;
    if (S.crowdReact) {
      const rnd = Math.random;
      for (const kind of ["jab", "heavy", "ko"]) { Math.random = () => 0.2; out.scenes.push(await measure("crowd reaction to a " + kind + " (forced)", 1, () => { S.crowdReact(kind); })); Math.random = rnd; await sleep(1200); }
    } else out.scenes.push(await measure("just after a hit (cheer 1)", 1));
    return out; })()`, true, 120000);
  console.log(JSON.stringify(r, null, 1));
  const quiet = r.scenes[0];
  if (quiet.levelDbfs < -100) { console.log("no signal at the output: nothing to judge"); process.exitCode = 2; }
}, { args: ["--autoplay-policy=no-user-gesture-required"] });
