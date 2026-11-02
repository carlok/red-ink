/**
 * The retro voice, measured: each word is spoken (ambience muted, music at zero) and the master output is recorded for 1.4 s. Reports the
 * length (the span above -40 dB of the peak), the peak in dBFS, the spectral estimate of F1 and F2 every 40 ms (the strongest peak in
 * 250-1000 Hz and the next one in 1000-3000 Hz) for the loud windows, and the share of the energy above 3.5 kHz in the first and the last
 * 80 ms (the F and T bursts). It cannot say whether the word is understandable; that is for a listener.
 * Usage: node tools/voice-probe.mjs [words, default fight,ko,win,lose]
 */
import { withPage, bootSublevel } from "./cdp-session.mjs";

const WORDS = (process.argv[2] || "fight,ko,win,lose").split(",");
await withPage(async (cdp) => {
  await bootSublevel(cdp);
  const out = await cdp.eval(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, g = S.audioGraph(), sr = g.ac.sampleRate, res = {};
    g.ambGain.gain.value = 0; g.musicGain.gain.value = 0; g.MUS.hold = true;
    const fft = (re, im) => { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
      for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = i + k + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } } };
    for (const word of ${JSON.stringify(WORDS)}) {
      const sp = g.ac.createScriptProcessor(1024, 1, 1), chunks = []; g.master.connect(sp); sp.connect(g.ac.destination);
      sp.onaudioprocess = (e) => { chunks.push([g.ac.currentTime, Float32Array.from(e.inputBuffer.getChannelData(0))]); };
      await sleep(250); chunks.length = 0; const t0 = g.ac.currentTime + 0.1; S.voiceSay(word, 0.07); await sleep(1500); g.master.disconnect(sp); sp.disconnect();
      const all = []; chunks.forEach(([t, d]) => d.forEach((v, i) => all.push([t - d.length / sr + i / sr, v])));
      const x = all.filter(([t]) => t >= t0 - 0.02 && t < t0 + 1.2).map((a) => a[1]), tstart = t0 - 0.02;
      const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0), win = Math.round(sr * 0.01), rms = [];
      for (let i = 0; i + win <= x.length; i += win) { let a = 0; for (let k = 0; k < win; k++) a += x[i + k] * x[i + k]; rms.push(Math.sqrt(a / win)); }
      const thr = peak * 0.01, first = rms.findIndex((v) => v > thr), last = rms.length - 1 - [...rms].reverse().findIndex((v) => v > thr);
      const N = 1024, tracks = [];
      for (let i = first * win; i + N <= (last + 1) * win; i += Math.round(sr * 0.04)) {
        const re = new Float64Array(N), im = new Float64Array(N); let e = 0; for (let k = 0; k < N; k++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * k / N); re[k] = x[i + k] * w; e += re[k] * re[k]; }
        fft(re, im); const mag = new Float64Array(N / 2); for (let k = 0; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
        const hz = sr / N, band = (a, b, skipLo, skipHi) => { let bi = -1, bv = 0; for (let k = Math.ceil(a / hz); k < Math.floor(b / hz); k++) { const f = k * hz; if (f > skipLo && f < skipHi) continue; if (mag[k] > bv) { bv = mag[k]; bi = k; } } return bi * hz; };
        let hf = 0, tot = 0; for (let k = 1; k < N / 2; k++) { tot += mag[k] * mag[k]; if (k * hz > 3500) hf += mag[k] * mag[k]; }
        const f1 = band(250, 1000, 0, 0); tracks.push({ t: Math.round((tstart + i / sr - t0) * 1000) / 1000, f1: Math.round(f1), f2: Math.round(band(1000, 3000, f1 - 200, f1 + 200)), hf: Math.round(hf / (tot || 1) * 100) / 100 });
      }
      const db = (v) => Math.round(20 * Math.log10(v + 1e-9) * 10) / 10;
      res[word] = { startMs: Math.round((first * 0.01 - 0.02) * 1000), lengthMs: Math.round((last - first + 1) * 10), peakDb: db(peak), firstHf: tracks.slice(0, 2).map((q) => q.hf), lastHf: tracks.slice(-2).map((q) => q.hf), tracks: tracks.filter((q, i) => i % 2 === 0).map((q) => q.t + ":" + q.f1 + "/" + q.f2 + (q.hf > 0.4 ? "*" : "")) };
    }
    return JSON.stringify(res); })()`, true);
  const o = JSON.parse(out);
  for (const [w, r] of Object.entries(o)) console.log(w, JSON.stringify({ ...r, tracks: undefined }), "\n  F1/F2 by time (* = mostly high frequency):", r.tracks.join(" "));
}, { args: ["--autoplay-policy=no-user-gesture-required"] });
