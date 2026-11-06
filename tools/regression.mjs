/**
 * Headless regression against window.__sublevel (started in Sprint 12, extended every sprint since).
 * Usage: node tools/regression.mjs [--shot path.jpg] [--only <part of a test name>]
 * A test fails on a page error unless EXPECTED_ERRORS lists it; results also go to regression-result.json.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootSublevel, fileIndexUrl, ROOT, waitFight, withPage } from "./cdp-session.mjs";

const SHOT = process.argv.includes("--shot") ? process.argv[process.argv.indexOf("--shot") + 1] : "";

function minimalGlb() {
  const positions = Buffer.from(new Float32Array([0, 0, 0, 0, 1.7, 0, 0.4, 0.8, 0.2]).buffer);
  const indices = Buffer.from(new Uint16Array([0, 1, 2]).buffer);
  let bin = Buffer.concat([positions, indices]);
  if (bin.length % 4) bin = Buffer.concat([bin, Buffer.alloc(4 - (bin.length % 4), 0)]);
  const jsonObj = {
    asset: { version: "2.0", generator: "sublevel-regression" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "probe" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [0.4, 1.7, 0.2] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  };
  let json = Buffer.from(JSON.stringify(jsonObj));
  const pad = (4 - (json.length % 4)) % 4;
  if (pad) json = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const total = 12 + 8 + json.length + 8 + bin.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  let o = 12;
  out.writeUInt32LE(json.length, o);
  out.writeUInt32LE(0x4e4f534a, o + 4);
  json.copy(out, o + 8);
  o += 8 + json.length;
  out.writeUInt32LE(bin.length, o);
  out.writeUInt32LE(0x004e4942, o + 4);
  bin.copy(out, o + 8);
  return out.toString("base64");
}

const GLB_B64 = minimalGlb();
const results = [];

/* Page errors (uncaught exceptions, console.error, the browser's error log such as a 404) fail the test they happened in. A test that
   provokes an error on purpose lists it here, with the reason; anything else is a bug or a missing asset. */
const EXPECTED_ERRORS = {
  /* the game throws on purpose when the page has no WebGL, after it has shown its message */
  webgl_missing_shows_message: [/needs WebGL/],
  /* the crash catcher test throws on purpose, in a timer, a promise and the render loop */
  crash_catcher_shows_a_card_with_details: [/test crash in/],
};
let activeCdp = null;
function takeErrors(name) {
  const all = activeCdp ? activeCdp.errors.splice(0) : [];
  const ok = EXPECTED_ERRORS[name] || [];
  return all.filter((m) => !ok.some((re) => re.test(m)));
}

const RESULT_FILE = join(ROOT, "regression-result.json");
const TEST_MS = 120000;

function report() {
  const failed = results.filter((r) => !r.pass);
  const summary = { pass: results.length - failed.length, fail: failed.length, tests: results };
  writeFileSync(RESULT_FILE, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  return failed.length;
}

/* Each result is logged as it lands (stderr, so the JSON on stdout stays whole). A test that times out leaves the page in an unknown state,
   so the run stops there with what it has instead of running 20 more tests against it. */
const ONLY = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : "";   /* run the tests whose name contains this, for a quick loop */

async function test(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  const t0 = Date.now();
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`test timed out after ${TEST_MS / 1000} s`), { timeout: true })), TEST_MS);
  });
  try {
    const detail = await Promise.race([fn(), late]);
    const bad = takeErrors(name);
    if (bad.length) throw new Error(`page errors: ${bad.join(" | ")}`);
    results.push({ name, pass: true, ms: Date.now() - t0, detail });
    console.error(`  ok    ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    activeCdp?.errors.splice(0);
    results.push({ name, pass: false, ms: Date.now() - t0, error: e.message });
    console.error(`  FAIL  ${name} (${Date.now() - t0} ms): ${e.message.slice(0, 200)}`);
    if (e.timeout) {
      report();
      process.exit(1);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function runHttpSuite(cdp) {
  activeCdp = cdp;
  await bootSublevel(cdp);

  await test("title_card", async () => {
    const v = await cdp.eval(`({
      sub: !!window.__sublevel,
      wrap: !document.getElementById("wrap").hidden,
      title: document.getElementById("cTitle").textContent,
      bouts: window.__sublevel.G ? 6 : 0
    })`);
    if (!v.sub || !v.wrap || !v.title) throw new Error(JSON.stringify(v));
    if (v.bouts !== 6) throw new Error("expected 6 bouts");
    return v;
  });

  for (let i = 0; i < 6; i++) {
    const n = i + 1;
    await test(`bout_${n}_starts`, async () => {
      const v = await waitFight(cdp, i);
      if (v.state !== "fight") throw new Error(JSON.stringify(v));
      return v;
    });
  }

  await test("hub_card", async () => {
    const v = await cdp.eval(`(() => {
      const S = window.__sublevel;
      S.qaResetProgress();
      const h = S.hubProbe();
      return { state: S.G.state, title: document.getElementById("cTitle").textContent, h };
    })()`);
    if (v.state !== "card" || !/rule|regole/i.test(v.title)) throw new Error(JSON.stringify(v));
    return v;
  });

  await test("dock_flow", async () => {
    const v = await cdp.eval(
      `(async () => {
      const S = window.__sublevel;
      S.qaResetProgress();
      document.getElementById("wrap").hidden = true;
      S.startBout(1);
      const t = performance.now();
      while (S.G.state !== "fight" && performance.now() - t < 5000) await new Promise((r) => requestAnimationFrame(r));
      const w = S.qaEndBout(true);
      if (!w.ok) throw new Error("win card " + JSON.stringify(w));
      S.qaClickGo();
      const dockTitle = document.getElementById("cTitle").textContent;
      S.qaClickGo();
      const okTitle = document.getElementById("cTitle").textContent;
      S.qaClickGo();
      const hubTitle = document.getElementById("cTitle").textContent;
      return { dockTitle, okTitle, hubTitle, dock: S.progress.dock };
    })()`,
      true,
    );
    if (!v.dock) throw new Error(JSON.stringify(v));
    return v;
  });

  await test("win_card", async () => {
    const v = await waitFight(cdp, 0);
    if (v.state !== "fight") throw new Error(JSON.stringify(v));
    const w = await cdp.eval(`window.__sublevel.qaEndBout(true)`);
    if (!w.ok) throw new Error(JSON.stringify(w));
    return w;
  });

  await test("menu_credits_quit_play", async () => {
    const v = await waitFight(cdp, 0);
    if (v.state !== "fight") throw new Error(JSON.stringify(v));
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), kd = (k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })), o = {};
      for (let i = 0; i < 30; i++) await raf();
      kd("Escape"); await raf(); o.paused = G.state === "pause" && !$("pause").hidden;
      $("pauseCredits").click(); await sleep(120); o.credits = $("cTitle").textContent === "Who made this" && $("cRows").querySelectorAll("dt").length === 6;
      $("go").click(); await sleep(120); o.backToPause = G.state === "pause" && !$("pause").hidden;
      $("quitTitle").click(); await sleep(250); o.quitToSplash = G.state === "splash" && !$("splash").hidden && $("pause").hidden && $("hud").hidden;
      o.silent = S.audioGraph().ac.state === "suspended";
      kd("j"); await sleep(150); o.keysIgnored = G.state === "splash" && S.audioGraph().ac.state === "suspended";
      $("spCredits").click(); await sleep(150); o.creditsFromSplash = $("cTitle").textContent === "Who made this";
      kd("Escape"); await sleep(150); o.escBackToSplash = G.state === "splash" && !$("splash").hidden && S.audioGraph().ac.state === "suspended";
      kd("Enter"); await sleep(300); o.playWithEnter = G.state === "card" && $("splash").hidden && !$("cardLinks").hidden && S.audioGraph().ac.state === "running";
      $("linkOut").click(); await sleep(250); o.quitFromTitle = G.state === "splash" && /[0-9]+ (of|di) 6/.test($("spNote").textContent);
      $("spPlay").click(); await sleep(300); o.playWithClick = G.state === "card" && S.audioGraph().ac.state === "running";
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("splash_on_load_is_silent", async () => {
    await cdp.send("Page.reload", { ignoreCache: true });
    await bootSublevel(cdp, 15000, true);
    const r = await cdp.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, $ = (i) => document.getElementById(i), o = {};
      await sleep(600);
      o.splash = S.G.state === "splash" && !$("splash").hidden && $("wrap").hidden;
      o.noAudio = S.audioGraph().ac === null;
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true })); $("snd").click(); await sleep(150);
      o.stillNoAudio = S.audioGraph().ac === null;
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    await cdp.eval(`window.__sublevel.play()`);
    return r;
  });

  await test("voice_says_fight_once_and_obeys_mute", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), g = S.audioGraph(), o = {};
      const voices = (log) => log.filter((x) => typeof x === "string" && x.startsWith("voice:"));
      S.setAudio({ mute: false }); /* an earlier test saves a mute */
      if (g.ac.state !== "running") { await g.ac.resume(); for (let i = 0; i < 20 && g.ac.state !== "running"; i++) await sleep(50); }
      $("wrap").hidden = true; g.MUS.log = []; S.startBout(0); await __until(() => G.state === "fight", "fight"); await sleep(300);
      o.fightOnce = JSON.stringify(voices(g.MUS.log)) === JSON.stringify(["voice:fight"]);
      g.MUS.log = []; S.qaEndBout(true); await sleep(800); o.perfectWord = voices(g.MUS.log).join() === "voice:perfect" && /Perfect|Perfetto/.test($("cRows").textContent); /* no hit taken in the test */
      $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight"); G.log.hits = 2; g.MUS.log = []; S.qaEndBout(true); await sleep(800); o.winWord = voices(g.MUS.log).join() === "voice:win";
      $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight"); g.MUS.log = []; S.qaEndBout(false); await sleep(800); o.loseWord = voices(g.MUS.log).join() === "voice:lose";
      S.setAudio({ mute: true }); $("wrap").hidden = true; g.MUS.log = []; S.startBout(0); await __until(() => G.state === "fight", "fight"); await sleep(300); o.mutedSilent = voices(g.MUS.log).length === 0; S.setAudio({ mute: false });
      S.toSplash(true); g.MUS.log = []; S.voiceSay("fight"); o.splashSilent = voices(g.MUS.log).length === 0; S.play();
      g.MUS.log = null; return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("voice_sources_and_settings", async () => {
    const r = await cdp.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, g = S.audioGraph(), $ = (i) => document.getElementById(i), o = {};
      S.setAudio({ mute: false }); if (g.ac.state !== "running") { await g.ac.resume(); await sleep(100); }
      const v = (name, lang, local = true) => ({ name, lang, localService: local });
      const fake = { voices: [v("Bahh", "en-US"), v("Samantha", "en-US"), v("Fred", "en-US"), v("Rishi", "en-IN"), v("Daniel", "en-GB"), v("Luca", "it-IT"), v("Alice", "it-IT")], spoken: [], cancel() {}, speak(u) { this.spoken.push({ text: u.text, voice: u.voice && u.voice.name, pitch: u.pitch, volume: u.volume }); }, getVoices() { return this.voices; }, addEventListener() {} };
      Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true }); const U = window.SpeechSynthesisUtterance; window.SpeechSynthesisUtterance = function (t) { this.text = t; };
      const say = (w) => { g.MUS.log = []; S.voiceSay(w); const src = g.MUS.log.find((x) => String(x).startsWith("voice-src:")); g.MUS.log = null; return src; };
      o.malePreferred = say("fight") === "voice-src:browser" && fake.spoken[0].voice === "Daniel" && fake.spoken[0].text === "Fight!" && fake.spoken[0].pitch <= 0.8;
      o.picks = S.voicePick(fake.voices, "en", "").name === "Daniel" && S.voicePick([v("Bahh", "en-US"), v("Samantha", "en-US"), v("Zira", "en-US")], "en", "") === null && S.voicePick(fake.voices, "it", "").name === "Luca";
      S.setLang("it"); await sleep(50); fake.spoken.length = 0; say("fight"); o.italian = fake.spoken[0] && fake.spoken[0].text === "Combatti!" && fake.spoken[0].voice === "Luca" && $("fightBanner") === null; S.setLang("en"); await sleep(50);
      fake.spoken.length = 0; $("voiceSel").value = "Rishi"; $("voiceSel").dispatchEvent(new Event("change")); say("ko"); o.chosenVoice = fake.spoken[0] && fake.spoken[0].voice === "Rishi" && fake.spoken[0].text === "K.O.!"; $("voiceSel").value = ""; $("voiceSel").dispatchEvent(new Event("change"));
      const real = fake.voices; fake.voices = [v("Bahh", "en-US"), v("Samantha", "en-US")]; o.robotFallback = say("fight") === "voice-src:robot"; fake.voices = real;
      const n = 200, wav = new Uint8Array(44 + n * 2), dv = new DataView(wav.buffer); const w4 = (a, t) => { for (let i = 0; i < 4; i++) wav[a + i] = t.charCodeAt(i); };
      w4(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); w4(8, "WAVE"); w4(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 22050, true); dv.setUint32(28, 44100, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w4(36, "data"); dv.setUint32(40, n * 2, true);
      let bin = ""; wav.forEach((b) => { bin += String.fromCharCode(b); });
      window.SUBLEVEL_VOICE = { fight: "data:audio/wav;base64," + btoa(bin) }; S.voiceClipsInit(); await sleep(400); fake.spoken.length = 0;
      o.clipFirst = say("fight") === "voice-src:clip" && fake.spoken.length === 0; window.SUBLEVEL_VOICE = {};
      $("pVoice").checked = false; $("pVoice").dispatchEvent(new Event("change")); g.MUS.log = []; S.voiceSay("fight"); o.voiceOffSilent = g.MUS.log.length === 0 && !$("voiceOn").checked; g.MUS.log = null;
      $("pVoice").checked = true; $("pVoice").dispatchEvent(new Event("change")); o.savedOn = localStorage.getItem("sublevel-voice") === "1";
      delete window.speechSynthesis; window.SpeechSynthesisUtterance = U;
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("queued_voice_is_cancelled_by_pause_mute_hide_and_quit", async () => {
    const r = await cdp.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, g = S.audioGraph(), $ = (i) => document.getElementById(i), o = {};
      S.setAudio({ mute: false }); if (g.ac.state !== "running") { await g.ac.resume(); for (let i = 0; i < 20 && g.ac.state !== "running"; i++) await sleep(50); }
      const fake = { voices: [{ name: "Daniel", lang: "en-GB", localService: true }], spoken: [], cancelled: 0, getVoices() { return this.voices; }, cancel() { this.cancelled++; }, speak(u) { this.spoken.push(u.text); } };
      Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true }); const U = window.SpeechSynthesisUtterance; window.SpeechSynthesisUtterance = function (t) { this.text = t; };
      $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight"); await sleep(300);
      fake.spoken.length = 0; S.voiceSay("fight", 0.4); S.pauseFight(); await sleep(700);
      o.pauseDropsQueuedLine = fake.spoken.length === 0; S.resumeFight();
      let c = fake.cancelled; S.pauseFight(); o.pauseCancels = fake.cancelled > c; S.resumeFight();
      c = fake.cancelled; $("snd").click(); o.muteClickCancels = fake.cancelled > c; S.setAudio({ mute: false });
      c = fake.cancelled; S.setAudio({ mute: true }); o.muteSettingCancels = fake.cancelled > c; S.setAudio({ mute: false });
      c = fake.cancelled; Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange"));
      o.hideCancels = fake.cancelled > c; delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); if (G.state === "pause") S.resumeFight();
      c = fake.cancelled; S.toSplash(true); o.quitCancels = fake.cancelled > c; S.play();
      delete window.speechSynthesis; window.SpeechSynthesisUtterance = U;
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("tutor_line_follows_binds_and_input", async () => {
    const r = await cdp.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, o = {};
      const kd = (k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
      const rebind = async (act, key) => { document.querySelector('[data-bind="' + act + '"]').click(); kd(key); await sleep(30); };
      o.defaults = S.tutorLine("keys") === "WASD moves. J jabs, K heavy. Hold L to block. Space dodges. Esc pauses.";
      await rebind("jab", "u"); await rebind("dodge", "v");
      o.rebound = /^WASD moves\\. U jabs, K heavy\\. Hold L to block\\. V dodges/.test(S.tutorLine("keys"));
      await rebind("jab", "j"); await rebind("dodge", " ");
      o.restored = S.tutorLine("keys") === "WASD moves. J jabs, K heavy. Hold L to block. Space dodges. Esc pauses.";
      o.pad = /Left stick/.test(S.tutorLine("pad")) && /LT/.test(S.tutorLine("pad"));
      o.touch = /Tap Jab/.test(S.tutorLine("touch")) && !/ J /.test(S.tutorLine("touch"));
      S.setLang("it"); o.italian = S.tutorLine("keys") === "WASD muove. J diretto, K potente. Tieni L per parare. Spazio schiva. Esc pausa."; S.setLang("en");
      o.words = ["keys", "pad", "touch"].every((m) => S.tutorLine(m).split(/\\s+/).length <= 15);
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("easy_offered_after_three_losses", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const lose = async (bout) => { $("wrap").hidden = true; S.startBout(bout); await __until(() => G.state === "fight", "fight"); S.qaEndBout(false); await sleep(120); };
      document.querySelector('[data-diff="normal"]').click(); G.loss = null;
      await lose(0); await lose(0); o.noneAtTwo = $("cardAssist").hidden;
      await lose(1); o.resetOnOtherBout = $("cardAssist").hidden;
      await lose(0); await lose(0); await lose(0);
      o.offeredAtThree = !$("cardAssist").hidden && /Easy/.test($("cardAssist").textContent) && /Assist/.test($("cRows").textContent);
      $("cardAssist").click(); await sleep(50);
      o.switched = S.diffNow() === "easy" && localStorage.getItem("sublevel-diff") === "easy" && (G.state === "ready" || G.state === "fight") && G.bout === 0;
      G.state = "pause"; await lose(0); await lose(0); await lose(0); o.noneWhenEasy = $("cardAssist").hidden;
      document.querySelector('[data-diff="normal"]').click();
      $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight"); S.qaEndBout(true); await sleep(120); o.winClears = G.loss.n === 0 && $("cardAssist").hidden;
      S.setLang("it"); await lose(0); await lose(0); await lose(0); o.italian = /Prova Facile/.test($("cardAssist").textContent); S.setLang("en");
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("webgl_context_lost_shows_message", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const gl = window.BABYLON.Engine.LastCreatedEngine._gl, ext = gl.getExtension("WEBGL_lose_context");
      if (!ext) return { skipped: true, noExtension: true };
      $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight");
      ext.loseContext(); await sleep(300);
      o.shown = !$("noGL").hidden && /reset/i.test($("noGLTitle").textContent) && /reload/i.test($("noGLBtn").textContent);
      o.paused = G.state === "pause";
      ext.restoreContext(); await sleep(500);
      o.hidden = $("noGL").hidden;
      return o; })()`, true);
    if (r.skipped) return r;
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("webgl_missing_shows_message", async () => {
    const stub = await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; })()` });
    await cdp.send("Page.reload", { ignoreCache: true });
    let v;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 150));
      v = await cdp.eval(`(() => { const e = document.getElementById("noGL"); return { shown: !!e && !e.hidden, title: e && e.querySelector("h2").textContent, button: e && e.querySelector("button").textContent, boot: !!window.__sublevel }; })()`);
      if (v.shown) break;
    }
    await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: stub.identifier });
    await cdp.send("Page.reload", { ignoreCache: true });
    await bootSublevel(cdp);
    if (!v.shown || !/WebGL/.test(v.title) || v.boot) throw new Error(JSON.stringify(v));
    return v;
  });

  await test("pad_unplug_pauses_fight", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const unplug = () => window.dispatchEvent(new Event("gamepaddisconnected"));
      $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight");
      unplug(); await raf();
      o.paused = G.state === "pause" && !$("pause").hidden && !$("pauseHint").hidden && /Controller disconnected/.test($("pauseHint").textContent);
      $("resume").click(); await raf();
      o.resumed = G.state === "fight" && $("pauseHint").hidden;
      G.state = "card"; unplug(); await raf(); o.ignoredOnCard = G.state === "card";
      S.setLang("it"); $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight"); unplug(); await raf(); o.italian = /scollegato/.test($("pauseHint").textContent);
      $("resume").click(); S.setLang("en");
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("draw_budget_per_place", async () => {
    /* Same method as tools/env-probe.mjs. Headless Chrome on one Mac measured 39 to 46 draws for the same scene across runs (S23 and S24 trees alike);
       the budget is that top value plus a little, so it catches a real jump (a new mesh per fighter or per crowd member) and not that wobble. */
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), S = window.__sublevel, G = S.G, B = window.BABYLON, engine = B.Engine.LastCreatedEngine, scene = B.Engine.LastCreatedScene, out = [];
      for (const b of [0, 5]) {
        document.getElementById("wrap").hidden = true; document.getElementById("tutor").hidden = true; S.seed(5); S.startBout(b);
        await __until(() => G.state === "fight", "fight");
        for (let i = 0; i < 160; i++) await raf();
        S.E.ai.cd = 99; S.E.cfg.cd = 99; S.E.speed0 = 0; S.P.pos.set(-0.7, 0, 0); S.E.pos.set(0.7, 0, 0);
        for (let i = 0; i < 90; i++) await raf();
        const draws = []; let prev = engine._drawCalls.current; for (let i = 0; i < 40; i++) { await raf(); const n = engine._drawCalls.current; draws.push(n - prev); prev = n; }
        out.push({ bout: b + 1, draws: draws.sort((x, y) => x - y)[20], active: scene.getActiveMeshes().length });
      }
      return JSON.stringify(out); })()`, true);
    const rows = JSON.parse(r);
    const bad = rows.filter((x) => x.draws > 48 || x.active > 52 || x.draws < 20);
    if (bad.length) throw new Error(JSON.stringify(rows));
    return rows;
  });

  await test("block_toggle_option", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? "keydown" : "keyup", { key: k, bubbles: true }));
      const tap = async (k) => { key(k, true); key(k, false); await raf(); };
      const frames = async (n) => { for (let i = 0; i < n; i++) await raf(); };
      o.offByDefault = !$("blockTog").checked && !!$("pBlockTog");
      $("wrap").hidden = true; S.seed(5); S.startBout(0); await __until(() => G.state === "fight", "fight");
      const E = S.E; E.ai.cd = 99; E.cfg.cd = 99; E.speed0 = 0; E.cfg.heavy = 0; E.cfg.dodge = 0; E.cfg.block = 0; S.P.pos.set(-1.2, 0, 0); E.pos.set(1.2, 0, 0); S.P.hp = S.P.maxHp = 1e6; S.P.stam = 100;
      await tap("l"); await frames(20); o.holdModeTapDoesNothing = S.P.state !== "block";
      $("blockTog").checked = true; $("blockTog").dispatchEvent(new Event("change"));
      o.saved = localStorage.getItem("sublevel-blocktoggle") === "1" && $("pBlockTog").checked && /toggle/.test(document.getElementById("keys").textContent);
      await tap("l"); await frames(30); o.tapHoldsGuard = S.P.state === "block";
      await tap("l"); await frames(8); o.secondTapDrops = S.P.state !== "block";
      await tap("l"); await frames(10); const guarded = S.P.state === "block"; await tap("j"); await frames(4);
      o.jabEndsGuard = guarded && (S.P.state === "attack" || S.P.started === "jab") && !G.blockLatch;
      await frames(60);
      await tap("l"); await frames(10); S.startBout(0); o.newBoutClears = !G.blockLatch; await __until(() => G.state === "fight", "fight");
      o.tutor = /Tap L to guard/.test(S.tutorLine("keys")) && /again to drop/.test(S.tutorLine("pad")) && /Tap Block/.test(S.tutorLine("touch")) && ["keys", "pad", "touch"].every((m) => S.tutorLine(m).split(/\\s+/).length <= 16);
      $("pBlockTog").checked = false; $("pBlockTog").dispatchEvent(new Event("change"));
      o.pauseSwitchOff = !$("blockTog").checked && localStorage.getItem("sublevel-blocktoggle") === "0" && /hold/.test(document.getElementById("keys").textContent);
      key("l", true); await frames(10); o.holdStillWorks = S.P.state === "block"; key("l", false); await frames(6);
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("italian_has_no_english_leftovers", async () => {
    const r = await cdp.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, o = {};
      /* 1. every STR entry has both languages (a few words are the same in both) */
      const same = new Set(["kw_menu", "menu_btn", "act_jab", "auto_pause", "auto_lbl", "key_space"]);
      const missing = Object.keys(S.STR).filter((k) => !S.STR[k].it || !S.STR[k].en);
      o.parity = missing.length === 0 ? true : missing;
      /* 2. every key the code asks for exists */
      const src = await (await fetch("index.html")).text();
      const used = new Set(); for (const m of src.matchAll(/\\bL\\('([a-z0-9_]+)'\\)/g)) used.add(m[1]);
      for (const m of src.matchAll(/\\b(?:set|lab|first)\\('[A-Za-z0-9]+','([a-z0-9_]+)'\\)/g)) used.add(m[1]);
      const gone = [...used].filter((k) => !S.STR[k] && !/^(diff_|act_|kw_|tb_)/.test(k));
      o.keysExist = gone.length === 0 ? true : gone;
      /* 3. with Italian on, the static page holds none of these English words */
      S.setLang("it"); S.titleCard(); await sleep(250);
      const deny = /\\b(Sound on|Sound off|Got it|Jab|Heavy|Block|Dodge|Easy|Normal|Hard|Rumble|Hits|Music|Ambience|Less motion|Auto fullscreen|FIGHTER|placeholder|Load \\.glb|Drop your|Reload|Your health|Opponent health|BOUT)\\b/;
      const bad = []; document.querySelectorAll("body *").forEach((el) => {
        if (["SCRIPT", "STYLE", "OPTION"].includes(el.tagName)) return;
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ") + " " + (el.getAttribute("aria-label") || "");
        if (deny.test(own) && !el.closest("[data-lang]")) bad.push((el.id || el.className || el.tagName) + ": " + own.trim().slice(0, 40));
      });
      o.noLeftovers = bad.length === 0 ? true : bad;
      o.docLang = document.documentElement.lang === "it";
      o.roundLabel = /^MATCH 1 \\/ 6$/.test(document.getElementById("roundLbl").textContent);
      o.rowsFollowLang = /diretto/.test(document.getElementById("cRows").textContent);
      S.setLang("en"); await sleep(100);
      o.backToEnglish = document.documentElement.lang === "en" && document.getElementById("tutorGo").textContent === "Got it" && /jab/.test(document.getElementById("keys").textContent);
      return o; })()`, true);
    if (!Object.values(r).every((v) => v === true)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("playtest_log_records_and_exports", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const bout = async (win) => { $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight"); S.qaEndBout(win); await sleep(120); };
      localStorage.removeItem("sublevel-log");
      await bout(true); await bout(false);
      const a = S.logRead();
      o.two = a.length === 2 && a[0].win === true && a[1].win === false && a[0].bout === 1 && a[0].foe === "Reyes" && a[0].v === 2 && a[0].tries === 0;
      o.fields = ["secs", "hits", "blocks", "dodges", "thrown", "landed", "diff", "ctl", "toggle", "practice", "t"].every((k) => k in a[0]) && a[0].ctl === "human" && /^[0-9]{4}-/.test(a[0].t);
      const j = JSON.parse(S.logJson()); o.json = j.app === "sublevel-three" && j.version === 1 && j.entries.length === 2;
      o.button = /\\(2\\)/.test($("logExport").textContent);
      for (let i = 0; i < 210; i++) S.logFight(true);
      o.capped = S.logRead().length === 200;
      $("logClear").click(); o.armed = /again/i.test($("logClear").textContent) && S.logRead().length === 200;
      $("logClear").click(); o.cleared = S.logRead().length === 0;
      const set = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error("quota"); };
      let threw = false; try { await bout(true); } catch (e) { threw = true; }
      Storage.prototype.setItem = set;
      o.survivesFullStorage = !threw && G.state === "card";
      S.setLang("it"); await sleep(50); o.italian = /registro/i.test($("logExport").textContent) && /Svuota/.test($("logClear").textContent); S.setLang("en");
      localStorage.removeItem("sublevel-log");
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("practice_mode_leaves_progress_alone", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const key = (k) => { window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); window.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true })); };
      const fight = async (b) => { $("wrap").hidden = true; S.startBout(b); await __until(() => G.state === "fight", "fight"); };
      const prog = () => localStorage.getItem("sublevel-progress");
      S.qaResetProgress(); S.titleCard(); await sleep(60); o.hiddenAtStart = $("linkPractice").hidden;
      await fight(0); S.qaEndBout(true); await sleep(120); S.titleCard(); await sleep(60); o.shownAfterAWin = !$("linkPractice").hidden;
      const before = prog(); localStorage.removeItem("sublevel-log");
      $("linkPractice").click(); await sleep(150);
      o.card = G.state === "card" && $("cTitle").textContent === "Reyes" && /Practice/.test($("cStamp").textContent) && !$("cardBack").hidden && $("cardAssist").hidden;
      $("go").click(); await sleep(60); await __until(() => G.state === "fight", "fight");
      o.fighting = G.practice === true && G.bout === 0 && S.P.hp === 100;
      S.qaEndBout(true); await sleep(150);
      o.noGrant = prog() === before && /Practice/.test($("cStamp").textContent) && /Progress unchanged/.test($("cBody").textContent) && !$("cardBack").hidden;
      o.logged = S.logRead().length === 1 && S.logRead()[0].practice === true;
      $("cardBack").click(); await sleep(150); o.backToChooser = $("cTitle").textContent === "Reyes" && /Practice/.test($("cStamp").textContent);
      key("Escape"); await sleep(150); o.escToTitle = /Level Three|Livello/.test($("cTitle").textContent) || $("avatarBox").hidden === false; o.flagCleared = G.practice === false;
      await fight(1); S.qaEndBout(true); await sleep(120); S.titleCard(); await sleep(60);
      $("linkPractice").click(); await sleep(150);
      o.twoOpponents = $("cTitle").textContent === "Reyes" && !$("cardAssist").hidden; $("cardAssist").click(); await sleep(150);
      o.cycles = $("cTitle").textContent === "Dag";
      $("go").click(); await sleep(60); await __until(() => G.state === "fight", "fight"); S.qaEndBout(false); await sleep(150);
      o.lossKeepsPractice = G.practice === true && /Retry|Riprova/.test($("cRows").textContent);
      S.titleCard(); await sleep(60); o.normalAgain = G.practice === false;
      S.setLang("it"); $("linkPractice").click(); await sleep(150); o.italian = /Allenamento/.test($("cStamp").textContent) && /Indietro/.test($("cardBack").textContent); S.setLang("en"); S.titleCard();
      S.qaResetProgress(); localStorage.removeItem("sublevel-log");
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("autoplay_acts_and_yields", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? "keydown" : "keyup", { key: k, bubbles: true }));
      const act = () => { const P = S.P; return P.state === "attack" || P.state === "dodge" || P.state === "block" || P.started; };
      o.offByDefault = !S.autoState().on && !$("autoOn").checked;
      $("autoOn").checked = true; $("autoOn").dispatchEvent(new Event("change"));
      o.saved = localStorage.getItem("sublevel-auto") === "1" && $("pAuto").checked;
      document.getElementById("wrap").hidden = true; S.seed(5); S.startBout(0);
      await __until(() => G.state === "fight", "fight");
      let moved = false, acted = false; const p0 = S.P.pos.clone();
      for (let i = 0; i < 180; i++) { await raf(); if (S.P.pos.subtract(p0).length() > 0.3) moved = true; if (act()) acted = true; }
      o.movesWithoutInput = moved && !S.autoState().taken && !$("autoTag").hidden;
      S.P.hp = S.P.maxHp = 1e6; S.E.hp = S.E.maxHp = 1e6;
      key("j", true); key("j", false); await raf(); await raf();
      o.keyTakesOver = S.autoState().taken && $("autoTag").hidden;
      S.startBout(1); await __until(() => G.state === "fight", "fight");
      o.nextBoutResumes = !S.autoState().taken && !$("autoTag").hidden;
      key("Escape", true); key("Escape", false); await raf(); key("Escape", true); key("Escape", false); await raf();
      $("pAuto").checked = false; $("pAuto").dispatchEvent(new Event("change"));
      o.pauseSwitchOff = !S.autoState().on && localStorage.getItem("sublevel-auto") === "0" && !$("autoOn").checked;
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("block_toggle_saved_across_reload", async () => {
    await cdp.eval(`localStorage.setItem('sublevel-blocktoggle','1')`);
    await cdp.send("Page.reload", { ignoreCache: true });
    await bootSublevel(cdp);
    const v = await cdp.eval(`({ box: document.getElementById("blockTog").checked, strip: /toggle/.test(document.getElementById("keys").textContent) })`);
    await cdp.eval(`localStorage.setItem('sublevel-blocktoggle','0')`);
    if (!v.box || !v.strip) throw new Error(JSON.stringify(v));
    return v;
  });

  await test("autoplay_saved_across_reload", async () => {
    await cdp.eval(`localStorage.setItem('sublevel-auto','1')`);
    await cdp.send("Page.reload", { ignoreCache: true });
    await bootSublevel(cdp);
    const v = await cdp.eval(`({ on: window.__sublevel.autoState().on, box: document.getElementById("autoOn").checked })`);
    await cdp.eval(`localStorage.setItem('sublevel-auto','0')`);
    if (!v.on || !v.box) throw new Error(JSON.stringify(v));
    return v;
  });

  await test("win_and_lose_themes_differ", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), g = S.audioGraph(), o = {};
      const run = async (win) => { $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight"); g.MUS.log = []; if (win) S.qaEndBout(true); else S.qaEndBout(false); await sleep(5000); const n = g.MUS.log.slice(); g.MUS.log = null; return n; };
      const root = 40, win = await run(true), winMood = S.musicMood(), lose = await run(false), loseMood = S.musicMood();
      const pcs = (ns, base) => new Set(ns.map((m) => (((m - base) % 12) + 12) % 12));
      const w = pcs(win, root + 3), l = pcs(lose, root);
      o.winMood = winMood === "win"; o.loseMood = loseMood === "lose"; o.notes = win.length > 8 && lose.length > 3;
      o.winMajor = w.has(4) && !w.has(3); o.loseMinor = l.has(3) && !l.has(4);
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("result_card_punch_stats", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? "keydown" : "keyup", { key: k, bubbles: true }));
      $("wrap").hidden = true; S.seed(5); S.startBout(0);
      await __until(() => G.state === "fight", "fight");
      const E = S.E; E.ai.cd = 99; E.cfg.cd = 99; E.speed0 = 0; E.cfg.heavy = 0; E.cfg.dodge = 0; E.cfg.block = 0; S.P.pos.set(-0.5, 0, 0); E.pos.set(0.5, 0, 0);
      for (let i = 0; i < 4; i++) { key("j", true); key("j", false); for (let k = 0; k < 40; k++) await raf(); }
      const lg = G.log; lg.dodges = 1; lg.hits = 1; o.singular = /1 hit taken, [0-9]+ blocks, 1 dodge,/.test(S.fightLine()); o.counts = lg.thrown >= 3 && lg.landed >= 1 && lg.landed <= lg.thrown && lg.time > 2;
      S.qaEndBout(true); await sleep(200);
      const rows = $("cRows").textContent;
      o.enRow = /Punches/.test(rows) && /[0-9]+ of [0-9]+ landed \\([0-9]+%\\)/.test(rows);
      S.setLang("it"); $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight"); S.qaEndBout(true); await sleep(200);
      o.itRow = /Pugni/.test($("cRows").textContent) && /a segno/.test($("cRows").textContent) && /colpi subiti/.test($("cRows").textContent);
      S.setLang("en");
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("enter_does_not_hijack_a_focused_control", async () => {
    const r = await cdp.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const enter = (target) => target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      $("wrap").hidden = true; S.qaResetProgress(); S.progress.wins = 3;
      S.practiceCard(0); await sleep(150);
      o.cardUp = !$("wrap").hidden && G.state === "card" && !$("cardBack").hidden;
      $("cardBack").focus(); enter($("cardBack")); await sleep(250);
      o.backFocused = G.state === "card" && !$("wrap").hidden && !G.practice;
      $("go").focus(); enter($("go")); await sleep(300);
      o.goStillWorks = G.state !== "card";
      $("wrap").hidden = true; S.qaResetProgress(); S.titleCard(); await sleep(150);
      const was = $("cTitle").textContent;   /* the title card's Play opens the dossier, which is a card too, so compare the title text */
      document.body.focus(); enter(window); await sleep(300);
      o.bodyStillWorks = $("cTitle").textContent !== was;
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("reset_restart_and_quit_leave_no_stale_state", async () => {
    const r = await cdp.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      $("wrap").hidden = true; S.qaResetProgress(); S.progress.wins = 3; S.titleCard(); await sleep(150);
      o.offeredBefore = !$("linkPractice").hidden && !$("cardAssist").hidden;
      G.loss = { bout: 1, n: 3 };
      $("resetBtn").click(); $("resetBtn").click(); await sleep(100);
      o.winsCleared = S.progress.wins === 0;
      o.practiceGone = $("linkPractice").hidden;
      o.continueGone = $("cardAssist").hidden;
      o.lossCleared = !G.loss;
      /* the pad hint is cleared by Restart and by Quit, not only by Resume */
      $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight");
      S.pauseFight(); $("pauseHint").textContent = "hint"; $("pauseHint").hidden = false;
      S.restartBout(); o.restartClearsHint = $("pauseHint").hidden;
      await __until(() => G.state === "fight" || G.state === "ready", "bout"); S.pauseFight(); $("pauseHint").hidden = false;
      S.toSplash(true); o.quitClearsHint = $("pauseHint").hidden; S.play();
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("dodge_low_health_and_foe_stamina_cues", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, g = S.audioGraph(), $ = (i) => document.getElementById(i), o = {};
      S.setAudio({ mute: false }); if (g.ac.state !== "running") { await g.ac.resume(); for (let i = 0; i < 20 && g.ac.state !== "running"; i++) await sleep(50); }
      $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight"); S.setLessMotion(false);
      const cues = async (fn, ms = 0) => { g.MUS.log = []; fn(); if (ms) await sleep(ms); const l = g.MUS.log.filter((x) => String(x).startsWith("cue:")); g.MUS.log = null; return l; };
      /* a dodge that works: one cue per evaded punch, none for a punch that lands, none when muted */
      S.P.inv = 0.2; let l = await cues(() => S.strike(S.E, S.P, S.ATK.jab)); o.dodgeCue = l.join() === "cue:dodge";
      S.P.inv = 0; S.P.state = "idle"; l = await cues(() => S.strike(S.E, S.P, S.ATK.jab)); o.noCueOnAHit = l.length === 0;
      S.setAudio({ mute: true }); S.P.inv = 0.2; l = await cues(() => S.strike(S.E, S.P, S.ATK.jab)); o.mutedSilent = l.length === 0; S.setAudio({ mute: false }); S.P.inv = 0;
      /* the foe's stamina bar follows E.stam */
      S.E.stam = 40; await raf(); await raf(); o.foeStaminaBar = Math.abs(parseFloat($("eSt").style.width) - 40) < 1;
      S.E.stam = 100;
      /* low health: red edge and a double thump while under 25 percent; still (no animation) under less motion; none when healthy */
      S.P.hp = 80; await raf(); await raf(); o.healthyNoEdge = $("lowHp").hidden;
      g.MUS.log = []; S.P.hp = 20; await raf(); await raf(); o.edgeShown = !$("lowHp").hidden && getComputedStyle($("lowHp")).animationName !== "none";
      await sleep(1100); l = g.MUS.log.filter((x) => String(x).startsWith("cue:heart")); g.MUS.log = null; o.heartbeat = l.length >= 2 && l.length % 2 === 0;
      S.setLessMotion(true); await raf(); o.stillUnderLessMotion = getComputedStyle($("lowHp")).animationName === "none"; S.setLessMotion(false);
      S.setAudio({ mute: true }); g.MUS.log = []; await sleep(1100); o.heartMuted = g.MUS.log.filter((x) => String(x).startsWith("cue:")).length === 0; g.MUS.log = null; S.setAudio({ mute: false });
      S.P.hp = 100; await raf(); await raf(); o.edgeGoes = $("lowHp").hidden;
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("the_opponents_tell_has_a_sound", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, g = S.audioGraph(), $ = (i) => document.getElementById(i), o = {};
      S.setAudio({ mute: false }); if (g.ac.state !== "running") { await g.ac.resume(); for (let i = 0; i < 20 && g.ac.state !== "running"; i++) await sleep(50); }
      $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight");
      S.E.ai.cd = 99;   /* the foe makes no tell of his own while the test holds the mark */
      const tells = async (fn, frames = 6) => { g.MUS.log = []; fn(); for (let i = 0; i < frames; i++) await raf(); const l = g.MUS.log.filter((x) => x === "cue:tell"); g.MUS.log = null; return l.length; };
      o.onceWhenItAppears = (await tells(() => { S.E.ai.tell = 5; }, 10)) === 1;       /* held on for 10 frames: still one sound */
      S.E.ai.tell = 0; await raf(); await raf();
      o.againForTheNext = (await tells(() => { S.E.ai.tell = 5; })) === 1;
      S.E.ai.tell = 0; await raf(); await raf();
      S.setAudio({ mute: true }); o.mutedSilent = (await tells(() => { S.E.ai.tell = 5; })) === 0; S.E.ai.tell = 0; S.setAudio({ mute: false }); await raf(); await raf();
      /* the player's own heavy shows no mark and makes no sound */
      o.playerNone = (await tells(() => { S.P.state = "attack"; S.P.atk = { type: "heavy", def: S.ATK.heavy, t: 0.05, done: true }; })) === 0; S.P.state = "idle"; S.P.atk = null;
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("medals_respect_difficulty_and_autoplay", async () => {
    const r = await cdp.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const stored = () => JSON.parse(localStorage.getItem("sublevel-progress"));
      const setDiff = (d) => $("wrap").querySelector('[data-diff="' + d + '"]').click();
      const fight = async (bout, log, setup) => { $("wrap").hidden = true; S.startBout(bout); await __until(() => G.state === "fight", "fight"); Object.assign(G.log, log); if (setup) setup(); S.qaEndBout(true); await sleep(60); return $("cRows").textContent; };
      const clean = { hits: 0, thrown: 10, landed: 10, time: 10 };
      S.setLang("en"); S.qaResetProgress(); S.titleCard(); await sleep(100);
      setDiff("easy"); let rows = await fight(0, clean); o.easyNone = stored().medals[0] === 0 && rows.includes("none on Easy");
      S.titleCard(); await sleep(100); setDiff("normal"); rows = await fight(0, clean, () => { G.assisted = true; }); o.autoplayNone = stored().medals[0] === 0 && rows.includes("none when the AI plays");
      /* the real flag: Autoplay on and untouched keys, the bot plays ticks, the flag is set by the sim loop */
      $("wrap").hidden = true; S.setAutoOn(true); S.startBout(0); await __until(() => G.state === "fight", "fight"); await sleep(400); o.botTicksSetTheFlag = G.assisted === true; S.setAutoOn(false);
      rows = await fight(0, clean); o.humanNormal = stored().medals[0] === 7 && stored().medalsHard[0] === 0 && !rows.includes("(Hard)");
      S.titleCard(); await sleep(100); setDiff("hard"); rows = await fight(1, clean); o.hardRecorded = stored().medals[1] === 7 && stored().medalsHard[1] === 7 && rows.includes("Untouched (Hard)");
      S.titleCard(); await sleep(100); setDiff("normal");
      /* a medal earned on Hard stays marked when a later Normal win earns the same one */
      await fight(1, clean); o.hardMarkStays = stored().medalsHard[1] === 7;
      o.goalSaysSo = true; S.hubCard(0); await sleep(100); o.goalSaysSo = $("cRows").textContent.includes("played by you");
      /* a v3 save (medals, no medalsHard) upgrades; the Hard mask is a subset of the medals */
      localStorage.setItem("sublevel-progress", JSON.stringify({ v: 3, wins: 2, medals: [7, 1, 0, 0, 0, 0] }));
      return o; })()`, true);
    await cdp.send("Page.reload", { ignoreCache: true }); await bootSublevel(cdp);
    r.v3Upgrades = await cdp.eval(`(() => { const p = window.__sublevel.progress; return p.v === 4 && JSON.stringify(p.medals) === "[7,1,0,0,0,0]" && JSON.stringify(p.medalsHard) === "[0,0,0,0,0,0]"; })()`);
    await cdp.eval(`localStorage.setItem("sublevel-progress", JSON.stringify({ v: 4, wins: 1, medals: [1, 0, 0, 0, 0, 0], medalsHard: [7, 5, "x", 0, 0, 0] }))`);
    await cdp.send("Page.reload", { ignoreCache: true }); await bootSublevel(cdp);
    r.hardIsASubset = await cdp.eval(`JSON.stringify(window.__sublevel.progress.medalsHard) === "[1,0,0,0,0,0]"`);
    await cdp.eval(`window.__sublevel.qaResetProgress(); document.querySelector('[data-diff="normal"]').click()`);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  /* The whoosh was unfiltered white noise under a half-sine. A swish has a band, and a peak at the level the mix expects. Measured on the decoded sample itself. */
  await test("whoosh_is_a_band_not_white_noise", async () => {
    const r = await cdp.eval(`(async () => {
      const S = window.__sublevel, ac = S.audioGraph().ac, A = window.SUBLEVEL_AUDIO;
      const bin = atob(A.clips.whoosh), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buf = await ac.decodeAudioData(bytes.buffer), d = buf.getChannelData(0), N = d.length, rate = buf.sampleRate;
      let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(d[i]));
      /* Hann-windowed periodogram by direct DFT (N is about 2,500 samples) */
      const bins = Math.floor(N / 2), P = new Float64Array(bins);
      for (let k = 1; k < bins; k++) { let re = 0, im = 0; const w0 = 2 * Math.PI * k / N; for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)), x = d[i] * w; re += x * Math.cos(w0 * i); im -= x * Math.sin(w0 * i); } P[k] = re * re + im * im; }
      const hz = (k) => k * rate / N; let lo = 1, hi = bins; for (let k = 1; k < bins; k++) { if (hz(k) < 200) lo = k + 1; if (hz(k) > 7000) { hi = k; break; } }
      let logS = 0, sum = 0, n = 0, band = 0; for (let k = lo; k < hi; k++) { const p = P[k] + 1e-20; logS += Math.log(p); sum += p; n++; if (hz(k) >= 600 && hz(k) <= 3500) band += p; }
      return { peakDbfs: +(20 * Math.log10(peak)).toFixed(2), flatness: +(Math.exp(logS / n) / (sum / n)).toFixed(3), shareIn600to3500: +(band / sum).toFixed(3), ms: Math.round(N / rate * 1000) }; })()`, true);
    /* white noise: flatness about 0.56 for one periodogram and 40 percent of the energy in 600 to 3500 Hz; a swept band-pass: low flatness and most of the energy in the band */
    if (!(r.flatness < 0.2 && r.shareIn600to3500 > 0.7 && r.peakDbfs > -20 && r.ms >= 150 && r.ms <= 220)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("training_room_dummy_never_attacks_and_costs_are_shown", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const kd = (k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
      $("wrap").hidden = true; S.qaResetProgress(); S.setLang("en"); localStorage.removeItem("sublevel-log"); S.titleCard(); await sleep(150);
      o.linkAtZeroWins = !$("linkTrain").hidden;                       /* no win needed, unlike Practice */
      $("linkTrain").click(); await sleep(150);
      o.cardUp = G.state === "card" && /dummy/i.test($("cTitle").textContent) && /10/.test($("cRows").textContent) && /24/.test($("cRows").textContent) && /16/.test($("cRows").textContent);
      $("go").click(); await __until(() => G.state === "fight", "fight");
      o.mode = G.train === true && G.practice === true && $("eName").textContent === "Dummy" && $("roundLbl").textContent === "TRAINING";
      /* he stays put, never attacks, cannot be knocked out */
      const E = S.E, P = S.P; let attacked = false, moved = 0; const x0 = E.pos.x;
      let hits = 0;   /* a heavy every 0.4 s for 4 s: 10 blows, 160 damage against 70 hp, one at a time as in a fight */
      for (let i = 0; i < 240; i++) { await raf(); if (i % 24 === 0) { E.state = "idle"; S.strike(P, E, S.ATK.heavy); hits++; } if (E.state === "attack") attacked = true; moved = Math.max(moved, Math.abs(E.pos.x - x0)); }
      o.neverAttacks = !attacked; o.neverDies = E.hp === E.maxHp && E.state !== "ko" && G.state === "fight";
      /* the strip shows the costs and strikes out what you cannot afford */
      const chips = [...document.querySelectorAll("#trainStrip .chip")];
      o.stripShown = !$("trainStrip").hidden && chips.map((c) => c.textContent).join("|") === "jab 10|heavy 24|dodge 16";
      P.stam = 20; await raf(); await raf(); o.greyedHeavy = chips[1].classList.contains("no") && !chips[0].classList.contains("no") && !chips[2].classList.contains("no");
      P.stam = 100; await raf(); await raf(); o.noneGreyedWhenRested = !chips.some((c) => c.classList.contains("no"));
      /* his guard: off, a jab lands; on (button and T key), a jab is blocked */
      const before = { ...G.log };
      S.E.state = "idle"; S.strike(P, E, S.ATK.jab); o.standsTakesIt = G.log.jabHit === before.jabHit + 1;
      $("trainBlock").click(); await sleep(120); o.buttonSwitches = G.trainBlock === true && $("trainBlock").getAttribute("aria-pressed") === "true";
      await __until(() => E.state === "block", "the dummy raises his guard", 3000); const b1 = G.log.jabBlock; S.strike(P, E, S.ATK.jab); o.guardBlocks = G.log.jabBlock === b1 + 1;
      kd("t"); o.keySwitchesBack = G.trainBlock === false;
      /* nothing saved, nothing logged */
      o.logUntouched = localStorage.getItem("sublevel-log") === null && S.progress.wins === 0;
      /* leaving the room: the title card clears the mode and the strip */
      $("wrap").hidden = true; S.titleCard(); await sleep(100); o.modeCleared = !G.train; S.pauseFight && 0;
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("medals_are_earned_kept_and_never_given_for_practice", async () => {
    const r = await cdp.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const stored = () => JSON.parse(localStorage.getItem("sublevel-progress"));
      const fight = async (bout, log, flags = {}) => { $("wrap").hidden = true; S.startBout(bout); await __until(() => G.state === "fight", "fight"); Object.assign(G, flags); Object.assign(G.log, log); const w = S.qaEndBout(true); await sleep(60); return { rows: $("cRows").textContent, title: $("cTitle").textContent, w }; };
      S.setLang("en"); S.qaResetProgress();
      o.freshHasMedals = Array.isArray(S.progress.medals) && S.progress.medals.length === 6 && S.progress.medals.every((m) => m === 0) && S.progress.v === 4;
      /* an untouched, accurate, quick win: all three */
      let f = await fight(0, { hits: 0, thrown: 10, landed: 9, time: 20 });
      o.allThree = stored().medals[0] === 7 && /Untouched · Sharp · Quick/.test(f.rows) && f.rows.includes("3 / 18");
      /* a worse win later keeps what was earned and shows none for itself */
      f = await fight(0, { hits: 3, thrown: 10, landed: 4, time: 90 });
      o.keptAndNoneThisTime = stored().medals[0] === 7 && /none this time/.test(f.rows);
      /* each medal on its own, and the edges: 85 percent exactly, fewer than five punches, the time limit itself */
      f = await fight(1, { hits: 2, thrown: 20, landed: 17, time: 99 }); o.sharpAtEightyFive = stored().medals[1] === 2;
      f = await fight(2, { hits: 2, thrown: 4, landed: 4, time: 99 }); o.fewPunchesNotSharp = stored().medals[2] === 0;
      f = await fight(2, { hits: 2, thrown: 10, landed: 3, time: 40 }); o.quickAtTheLimit = stored().medals[2] === 4;
      f = await fight(3, { hits: 0, thrown: 10, landed: 3, time: 99 }); o.untouchedOnly = stored().medals[3] === 1;
      /* no medals from Practice, the training room or the second pass */
      const before = JSON.stringify(stored().medals);
      await fight(4, { hits: 0, thrown: 10, landed: 10, time: 1 }, { practice: true }); o.practiceNone = JSON.stringify(stored().medals) === before;
      await fight(4, { hits: 0, thrown: 10, landed: 10, time: 1 }, { pass2: true }); o.pass2None = JSON.stringify(stored().medals) === before;
      G.practice = false; G.pass2 = false;
      /* a medal earned in another tab stays earned when this tab saves */
      const other = stored().medals.slice(); other[5] = 4; localStorage.setItem("sublevel-progress", JSON.stringify({ ...stored(), medals: other }));
      await fight(0, { hits: 3, thrown: 10, landed: 4, time: 99 }); o.otherTabMedalKept = stored().medals[5] === 4 && stored().medals[0] === 7;
      /* the hub counts them and says what to aim for */
      S.hubCard(0); await sleep(100); o.hubTotal = $("cRows").textContent.includes("Medals") && $("cRows").textContent.includes(" / 18");
      o.hubGoals = $("cRows").textContent.includes("under 26 s") && $("cRows").textContent.includes("85%");
      /* Italian */
      S.setLang("it"); S.hubCard(0); await sleep(100); o.italian = /Medaglie/.test($("cRows").textContent) && /meno di 26 s/.test($("cRows").textContent); S.setLang("en");
      /* a save written by Sprint 28 (v2, no medals) loads with zeros and is stamped v3; garbage is put right */
      localStorage.setItem("sublevel-progress", JSON.stringify({ v: 2, wins: 2, outfit: "auditor", arena: 0, dock: 0, pass2: 0 }));
      return o; })()`, true);
    await cdp.send("Page.reload", { ignoreCache: true }); await bootSublevel(cdp);
    const v2 = await cdp.eval(`(() => { const p = window.__sublevel.progress; return { v: p.v, wins: p.wins, medals: p.medals }; })()`);
    r.v2Loads = v2.v === 4 && v2.wins === 2 && JSON.stringify(v2.medals) === "[0,0,0,0,0,0]";
    await cdp.eval(`localStorage.setItem("sublevel-progress", JSON.stringify({ v: 3, wins: 1, medals: "abc" }))`);
    await cdp.send("Page.reload", { ignoreCache: true }); await bootSublevel(cdp);
    r.badMedalsFixed = JSON.stringify(await cdp.eval(`window.__sublevel.progress.medals`)) === "[0,0,0,0,0,0]";
    await cdp.eval(`localStorage.setItem("sublevel-progress", JSON.stringify({ v: 3, wins: 1, medals: [9, -1, 1.5, 7, "x", 2] }))`);
    await cdp.send("Page.reload", { ignoreCache: true }); await bootSublevel(cdp);
    r.oddMedalsFixed = JSON.stringify(await cdp.eval(`window.__sublevel.progress.medals`)) === "[0,0,0,7,0,2]";
    await cdp.eval(`window.__sublevel.qaResetProgress()`);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  /* CPU time, not frame rate: a software-GL runner's frame rate says little, CPU cost is steadier. Measured on a Mac in headless Chrome: the sim tick
     (two steps, the AI and the body resolution) costs about 0.003 ms against a 16.7 ms frame, and the JS side of scene.render about 1.1 to 2.0 ms.
     The ceilings are 0.1 ms and 8 ms: far enough above for a slow CI runner, near enough to catch an accidental 30-fold (sim) or 4-fold (render) cost. */
  await test("cpu_time_per_sim_tick_and_render", async () => {
    const r = await cdp.eval(`(async () => {
      const S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), dt = 1 / 60, out = { sim: {}, render: {} };
      const idle = { mx: 0, mz: 0, jab: false, heavy: false, block: false, dodge: false }, scene = BABYLON.Engine.LastCreatedScene;
      for (const bout of [1, 2, 5]) {
        $("wrap").hidden = true; S.startBout(bout); await __until(() => G.state === "fight", "fight"); S.seed(3);
        const E = S.E, P = S.P, N = 3000;
        const run = () => { const t0 = performance.now();
          for (let t = 0; t < N; t++) {
            const ip = t % 45 === 0 ? { ...idle, jab: true } : (t % 150 === 100 ? { ...idle, heavy: true } : idle);
            S.step(P, E, ip, dt); S.step(E, P, S.aiIntent(E, P, dt), dt); S.resolveBodies();
            P.hp = 1e6; E.hp = 1e6; G.state = "fight";
          }
          return (performance.now() - t0) / N; };
        run(); out.sim["bout" + (bout + 1)] = +Math.min(run(), run(), run()).toFixed(4);   /* the first run warms the JIT up; the best of three drops a hiccup */
      }
      for (const bout of [0, 3, 5]) {
        $("wrap").hidden = true; S.startBout(bout); await __until(() => G.state === "fight", "fight");
        for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
        const one = () => { const t0 = performance.now(); for (let i = 0; i < 60; i++) scene.render(); return (performance.now() - t0) / 60; };
        out.render["bout" + (bout + 1)] = +Math.min(one(), one(), one()).toFixed(2);
      }
      return out; })()`, true, 300000);
    const slowSim = Object.entries(r.sim).filter(([, v]) => v > 0.1), slowRender = Object.entries(r.render).filter(([, v]) => v > 8);
    if (slowSim.length || slowRender.length) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("limiter_holds_the_peak_and_leaves_normal_levels_alone", async () => {
    const r = await cdp.eval(`(async () => {
      const S = window.__sublevel, o = {}; S.audioReady(); const g = S.audioGraph(), L = g.LIMIT;
      o.wired = !!g.limiter && !!g.limitOut && g.limiter.threshold.value === L.threshold && g.limiter.ratio.value === L.ratio && Math.abs(g.limitOut.gain.value - L.trim) < 1e-6;
      /* the same chain, offline (no sound card needed): a steady tone at several levels */
      const run = async (amp) => {
        const oc = new OfflineAudioContext(1, 48000 * 2, 48000), os = oc.createOscillator(), a = oc.createGain(), c = oc.createDynamicsCompressor(), t = oc.createGain();
        os.frequency.value = 220; a.gain.value = amp; c.threshold.value = L.threshold; c.knee.value = L.knee; c.ratio.value = L.ratio; c.attack.value = L.attack; c.release.value = L.release; t.gain.value = L.trim;
        os.connect(a); a.connect(c); c.connect(t); t.connect(oc.destination); os.start();
        const d = (await oc.startRendering()).getChannelData(0); let pk = 0; for (let i = 48000; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); return pk;
      };
      const quiet = await run(0.25), loud = await run(0.5), full = await run(1.0), over = await run(2.0);
      o.quietUnchanged = Math.abs(20 * Math.log10(quiet / 0.25)) < 0.3;      /* a sound well under the threshold keeps its level */
      o.loudUnchanged = Math.abs(20 * Math.log10(loud / 0.5)) < 0.3;
      o.fullScaleHeld = full <= 0.8;                                          /* 0 dBFS in, no more than about -2 dBFS out */
      o.beyondFullScaleHeld = over <= 0.9;
      o.numbers = { quiet: +quiet.toFixed(3), loud: +loud.toFixed(3), full: +full.toFixed(3), over: +over.toFixed(3) };
      return o; })()`, true);
    const { numbers, ...checks } = r;
    if (!Object.values(checks).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("ambience_is_a_hum_and_a_crowd_that_answers_blows", async () => {
    const r = await cdp.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), g = S.audioGraph(), ac = g.ac, o = {};
      S.setAudio({ mute: false }); if (ac.state !== "running") { await ac.resume(); for (let i = 0; i < 20 && ac.state !== "running"; i++) await sleep(50); }
      /* the bed rebuilt under a counter: no buffer source at all (it used to build four looping noise sources) */
      const made = [], orig = ac.createBufferSource.bind(ac); ac.createBufferSource = () => { const s = orig(); made.push(s); return s; };
      g.BED.ready = false; S.bedInit(); ac.createBufferSource = orig;
      o.noNoiseSources = made.length === 0; o.humIsSixOscillators = g.BED.hum.length === 6 && g.BED.hum.every((h) => h.o instanceof OscillatorNode);
      $("wrap").hidden = true; S.startBout(1); await __until(() => G.state === "fight", "fight");
      const count = (kind) => { g.MUS.log = []; S.crowdReact(kind); const n = g.MUS.log.filter((x) => x === "cue:crowd").length; g.MUS.log = null; return n; };
      const rnd = Math.random;
      Math.random = () => 0.01;                       /* every chance succeeds */
      await sleep(1000); o.heavyAnswers = count("heavy") === 1;
      o.notTwiceWithinAGap = count("heavy") === 0 && count("jab") === 0;
      o.knockoutAlways = count("ko") === 1;
      Math.random = () => 0.99;                       /* every chance fails */
      await sleep(1000); o.chanceCanFail = count("heavy") === 0 && count("block") === 0; o.knockoutIgnoresChance = count("ko") === 1;
      Math.random = () => 0.01; await sleep(1000);
      S.setAudio({ mute: true }); o.mutedSilent = count("ko") === 0; S.setAudio({ mute: false });
      S.MIX.crowdReact = 0; o.switchedOff = count("ko") === 0; S.MIX.crowdReact = 1;
      const amb = $("ambVol"); amb.value = "0"; amb.dispatchEvent(new Event("input")); o.zeroVolumeSilent = count("ko") === 0; amb.value = "100"; amb.dispatchEvent(new Event("input"));
      o.backOn = count("ko") === 1;
      Math.random = rnd;
      /* events: scheduled in a fight, not when muted or at zero */
      const events = async () => { g.MUS.log = []; g.BED.next = 0; S.audioTick(0.016); const n = g.MUS.log.filter((x) => x === "bed:event").length; g.MUS.log = null; return n; };
      o.eventsInAFight = (await events()) === 1;
      S.setAudio({ mute: true }); o.noEventsMuted = (await events()) === 0; S.setAudio({ mute: false });
      /* the bed fades with the music on a card nobody touches, and comes back */
      S.MIX.cardQuiet = 0.05; $("wrap").hidden = false; G.state = "card";
      for (let i = 0; i < 60; i++) S.audioTick(0.25);
      o.roomFadesOnAnIdleCard = g.roomGain.gain.value < 0.02 && g.crowdGain.gain.value < 0.02;
      S.MIX.cardQuiet = 40; G.state = "fight"; $("wrap").hidden = true; for (let i = 0; i < 80; i++) S.audioTick(0.1);
      o.roomComesBack = g.roomGain.gain.value > 0.5;
      S.titleCard();
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("held_esc_and_enter_do_not_repeat", async () => {
    const r = await cdp.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const key = (k, repeat) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, repeat, bubbles: true, cancelable: true }));
      $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight");
      key("Escape", false); o.paused = G.state === "pause";
      key("Escape", true); o.heldEscStaysPaused = G.state === "pause";   /* one repeat, not two: two would toggle back and pass either way */
      key("Escape", false); o.escResumes = G.state === "fight";
      $("wrap").hidden = true; S.qaResetProgress(); S.titleCard(); await sleep(150);
      const was = $("cTitle").textContent;
      key("Enter", true); await sleep(200);
      o.heldEnterIgnored = $("cTitle").textContent === was;
      key("Enter", false); await sleep(200);
      o.enterStillWorks = $("cTitle").textContent !== was;
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("input_is_cleared_on_pause_and_resume", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const key = (k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
      $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight");
      key("j"); o.buffered = S.buf.jab > 0;
      S.pauseFight(); o.clearedOnPause = S.buf.jab === 0 && G.state === "pause";
      key("j"); key("k"); o.bufferedWhilePaused = S.buf.jab > 0 && S.buf.heavy > 0;
      S.resumeFight(); o.clearedOnResume = S.buf.jab === 0 && S.buf.heavy === 0;
      await raf(); await raf();
      o.noPunchOnResume = S.P.state !== "attack";
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("dodge_stat_counts_evasions_not_presses", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight");
      S.P.hp = 100; G.log.hits = G.log.dodges = G.log.dodgeTries = 0;
      S.P.inv = 0.2; S.strike(S.E, S.P, S.ATK.jab);
      o.evadedCounts = G.log.dodges === 1 && G.log.hits === 0 && S.P.hp === 100;
      S.P.inv = 0; S.P.state = "idle"; S.strike(S.E, S.P, S.ATK.jab);
      o.hitCountsAsHit = G.log.dodges === 1 && G.log.hits === 1;
      S.P.state = "idle"; S.P.cd = 0; S.P.stam = 100; G.log.dodges = 0;
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
      await raf(); await raf(); await raf(); await raf();
      o.pressCountsAsTry = G.log.dodgeTries === 1 && G.log.dodges === 0;
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("two_tabs_cannot_erase_each_others_progress", async () => {
    const r = await cdp.eval(`(async () => {
      const S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {}, KEY = "sublevel-progress";
      const stored = () => JSON.parse(localStorage.getItem(KEY));
      S.qaResetProgress();
      /* another tab has moved the save on to 5 wins behind this tab's back */
      localStorage.setItem(KEY, JSON.stringify({ v: 2, wins: 5, outfit: "exec", arena: 3, dock: 1, pass2: 2 }));
      o.memoryStillOld = S.progress.wins === 0;
      $("wrap").hidden = true; S.startBout(1); await __until(() => G.state === "fight", "fight");
      S.qaEndBout(true);   /* this tab wins bout 2 */
      const s = stored();
      o.winsKept = s.wins === 5 && S.progress.wins === 5;
      o.unlocksKept = s.outfit === "exec" && s.arena === 3 && s.dock === 1 && s.pass2 === 2;
      /* the same save arriving as a storage event is taken as it is */
      localStorage.setItem(KEY, JSON.stringify({ v: 2, wins: 6, outfit: "exec", arena: 3, dock: 1, pass2: 3 }));
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
      o.eventLoaded = S.progress.wins === 6 && S.progress.pass2 === 3;
      /* a reset still overwrites */
      S.qaResetProgress();
      o.resetExact = stored().wins === 0 && S.progress.wins === 0;
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("foes_read_a_string_of_jabs", async () => {
    const r = await cdp.eval(`(async () => {
      const S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {}, dt = 1 / 60;
      const idle = { mx: 0, mz: 0, jab: false, heavy: false, block: false, dodge: false };
      /* one player jab against a quiet foe at jab range; returns how the foe received it */
      const jab = (E, P) => {
        const before = { ...G.log }; let thrown = false;
        for (let t = 0; t < 90; t++) {
          const ip = !thrown && P.state === "idle" && P.cd <= 0 ? { ...idle, jab: true } : idle; thrown = thrown || ip.jab;
          S.step(P, E, ip, dt); E.ai.cd = 99; S.step(E, P, S.aiIntent(E, P, dt), dt); S.resolveBodies();
          P.pos.set(-0.7, 0, 0); E.pos.set(0.7, 0, 0); E.vel.set(0, 0, 0);   /* pinned at jab range: the foe's footwork is not what is tested */
        }
        return { hit: G.log.jabHit - before.jabHit, block: G.log.jabBlock - before.jabBlock, dodge: G.log.jabDodge - before.jabDodge };
      };
      const setup = (bout) => { $("wrap").hidden = true; S.startBout(bout); S.seed(3); const E = S.E, P = S.P; G.state = "fight"; P.pos.set(-0.7, 0, 0); E.pos.set(0.7, 0, 0); return [E, P]; };
      const saved = { ...S.JAB_READ };
      const tick = async () => { await __until(() => G.state === "fight", "fight"); };
      /* Voss (bout 4, style teach so no punish loop): react .29 s, far over a jab's .20 s */
      S.JAB_READ.f = 10; S.JAB_READ.mem = 2;
      let [E, P] = setup(3); await tick(); [E, P] = setup(3);
      const first = jab(E, P), second = jab(E, P);
      o.firstJabIsFree = first.hit === 1 && first.block + first.dodge === 0;
      o.nextJabIsAnswered = second.hit === 0 && second.block + second.dodge === 1;
      /* the read fades: after more than mem seconds of nothing, the next jab is free again */
      for (let t = 0; t < 150; t++) { S.step(P, E, idle, dt); E.ai.cd = 99; S.step(E, P, S.aiIntent(E, P, dt), dt); S.resolveBodies(); P.pos.set(-0.7, 0, 0); E.pos.set(0.7, 0, 0); E.vel.set(0, 0, 0); E.stam = 100; }
      const third = jab(E, P);
      o.readFades = third.hit === 1 && third.block + third.dodge === 0;
      /* with the read turned off (f 0) the second jab lands */
      S.JAB_READ.f = 0; [E, P] = setup(3);
      const a = jab(E, P), b = jab(E, P);
      o.offMeansFree = a.hit === 1 && b.hit === 1;
      /* Reyes (bout 1) answers jabs by his own reaction time and is not touched by the read: same result with it on and off */
      S.JAB_READ.f = 10; [E, P] = setup(0); const r1 = jab(E, P); const r2 = jab(E, P);
      S.JAB_READ.f = 0; [E, P] = setup(0); const q1 = jab(E, P); const q2 = jab(E, P);
      o.reyesUnchanged = JSON.stringify([r1, r2]) === JSON.stringify([q1, q2]);
      Object.assign(S.JAB_READ, saved);
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("win_card_warns_when_progress_cannot_be_saved", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const win = async () => { $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight"); S.qaEndBout(true); return $("cRows").textContent; };
      S.qaResetProgress();
      const prior = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new DOMException("quota"); };
      try { o.blocked = await win(); } finally { Storage.prototype.setItem = prior; }
      o.warned = o.blocked.includes(S.STR.save_failed.en) && o.blocked.includes(S.STR.row_save.en);
      o.winStillShown = o.blocked.includes(S.STR.row_you.en);
      o.normal = await win();
      o.quietWhenSaved = !o.normal.includes(S.STR.save_failed.en);
      o.italian = S.STR.save_failed.it.length > 20 && S.STR.row_save.it !== S.STR.row_save.en;
      S.qaResetProgress();
      return o; })()`, true);
    if (!r.warned || !r.winStillShown || !r.quietWhenSaved || !r.italian) throw new Error(JSON.stringify(r));
    return { warned: r.warned, quietWhenSaved: r.quietWhenSaved };
  });

  await test("title_card_continue_for_a_player_with_wins", async () => {
    const r = await cdp.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, $ = (i) => document.getElementById(i), o = {};
      const title = async (wins, dock) => { $("wrap").hidden = true; S.qaResetProgress(); S.progress.wins = wins; S.progress.dock = dock; S.titleCard(); await sleep(120); return { shown: !$("cardAssist").hidden, text: $("cardAssist").textContent }; };
      o.none = (await title(0, 0)).shown === false;
      const three = await title(3, 1); o.threeShown = three.shown && three.text.includes("4") && three.text.includes(S.BOUTS[3].foe) && three.text.includes(S.STR.continue_btn.en);
      $("cardAssist").click(); await sleep(150);
      o.opensHub = $("cTitle").textContent === S.STR.hub_title.en && $("cRows").textContent.includes(S.BOUTS[3].foe);
      const two = await title(2, 0); o.dockFirst = two.shown; $("cardAssist").click(); await sleep(150);
      o.dockCard = $("cTitle").textContent === S.STR.dock_title.en;
      const six = await title(6, 1); o.cleared = six.shown && six.text.includes(S.STR.pass2_btn.en) && !six.text.includes(S.STR.continue_btn.en);   /* every bout won: the action is the second pass, not Continue */
      S.setLang("it"); await sleep(50); await title(3, 1);
      o.italian = $("cardAssist").textContent.includes(S.STR.continue_btn.it) && !$("cardAssist").hidden;
      S.setLang("en"); S.qaResetProgress(); $("wrap").hidden = true;
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("movement_follows_the_physical_key", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight");
      const ev = (type, key, code) => window.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true }));
      const moves = (key, code) => { ev("keydown", key, code); const i = S.intent(), m = Math.hypot(i.mx, i.mz) > 0.5; ev("keyup", key, code); return m; };
      o.qwerty = moves("w", "KeyW");
      o.azertyZ = moves("z", "KeyW");
      o.azertyQ = moves("q", "KeyA");
      o.dvorakComma = moves(",", "KeyW");
      o.noCode = moves("w", undefined);
      o.arrow = moves("ArrowUp", "ArrowUp");
      /* the key typed W on AZERTY sits where QWERTY has Z; on Dvorak it sits where QWERTY has comma: neither moves */
      o.azertyTypedW = !moves("w", "KeyZ");
      o.dvorakTypedW = !moves("w", "Comma");
      o.released = Math.hypot(S.intent().mx, S.intent().mz) < 0.01;
      /* the hints follow the layout map when it reports other caps */
      const before = $("keys").textContent;
      S.setMoveCaps("ZQSD"); o.capStrip = $("keys").textContent.includes("ZQSD") && !$("keys").textContent.includes("WASD");
      o.capTutor = S.tutorLine("keys").includes("ZQSD") || S.tutorLine().includes("ZQSD");
      S.setMoveCaps("WASD"); o.capBack = $("keys").textContent === before;
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("second_pass_after_bout_six", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = {};
      const toFight = async () => { const t = performance.now(); while (G.state !== "fight" && performance.now() - t < 8000) await raf(); };
      $("wrap").hidden = true; S.qaResetProgress(); S.progress.wins = 6; S.progress.outfit = "exec"; S.progress.arena = 3; S.progress.dock = 1;
      /* the first pass is not touched: the same cfg with no pass index, and the change only with one */
      o.firstPass = S.scaleCfg(S.BOUTS[0]).hp === 70 && S.scaleCfg(S.BOUTS[0], -1).hp === 70;
      o.changed = S.scaleCfg(S.BOUTS[0], 0).hp === 98 && S.scaleCfg(S.BOUTS[2], 2).dmg > S.scaleCfg(S.BOUTS[2]).dmg;
      /* the entry is on the title card once every bout is won, and it names the bout */
      S.titleCard(); await sleep(120);
      o.entry = !$("cardAssist").hidden && $("cardAssist").textContent.includes(S.STR.pass2_btn.en) && $("cardAssist").textContent.includes(S.BOUTS[0].foe);
      $("cardAssist").click(); await sleep(150);
      o.card = $("cStamp").textContent === S.STR.pass2_stamp.en && $("cRows").textContent.includes(S.STR.mod_iron.en);
      $("go").click(); await toFight();
      o.running = G.pass2 === true && S.E.cfg.hp === 98 && /II/.test($("roundLbl").textContent);
      /* a loss keeps the pass: Retry runs the same changed fighter */
      S.qaEndBout(false); await sleep(150); $("go").click(); await toFight();
      o.retryKeeps = G.pass2 === true && S.E.cfg.hp === 98;
      /* a win counts in pass2 and in nothing else */
      S.qaEndBout(true); await sleep(150);
      o.counted = S.progress.pass2 === 1 && S.progress.wins === 6 && S.progress.outfit === "exec" && S.progress.arena === 3;
      o.winCard = $("cRows").textContent.includes(S.STR.mod_iron.en) && $("goTxt").textContent === S.STR.pass2_next.en;
      o.saved = JSON.parse(localStorage.getItem("sublevel-progress")).pass2 === 1;
      $("go").click(); await sleep(150);
      o.nextCard = $("cTitle").textContent === S.BOUTS[1].foe && $("cRows").textContent.includes(S.STR.mod_quick.en);
      /* the last bout ends the pass; the title then offers it again */
      S.progress.pass2 = 5; $("wrap").hidden = true; G.pass2 = true; S.startBout(5); await toFight(); S.qaEndBout(true); await sleep(150);
      o.last = S.progress.pass2 === 6 && $("cBody").textContent === S.STR.pass2_done.en && $("goTxt").textContent === S.STR.back_btn.en;
      $("go").click(); await sleep(150);
      o.again = !$("cardAssist").hidden && $("cardAssist").textContent === S.STR.pass2_again.en && G.pass2 === false;
      /* leaving the pass by the title card clears it, and the next normal bout is the first-pass fighter again */
      $("wrap").hidden = true; S.startBout(0); await toFight();
      o.firstAgain = S.E.cfg.hp === 70 && !/II/.test($("roundLbl").textContent);
      S.qaResetProgress(); $("wrap").hidden = true;
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("esc_opens_menu_on_every_card", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), kd = (k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })), o = {};
      document.getElementById("wrap").hidden = true;
      const cards = {
        title: () => S.titleCard(), dossier: () => S.introCard(2), hub: () => S.hubCard(1), dock: () => S.dockMission(() => {}), final: () => S.showFinalCard(),
        win: async () => { S.startBout(0); await __until(() => G.state === "fight", "fight"); S.qaEndBout(true); }, lose: async () => { S.startBout(0); await __until(() => G.state === "fight", "fight"); S.qaEndBout(false); }
      };
      S.qaResetProgress();
      for (const [name, open] of Object.entries(cards)) {
        await open(); await sleep(200);
        const title = $("cTitle").textContent;
        kd("Escape"); await sleep(120);
        const opened = G.menuOpen && !$("pause").hidden && getComputedStyle($("restart")).display === "none" && $("resume").textContent === "Back";
        const cardKept = !$("wrap").hidden && G.state === "card" && $("cTitle").textContent === title;
        kd("Escape"); await sleep(120);
        const closed = !G.menuOpen && $("pause").hidden;
        o[name] = opened && cardKept && closed;
      }
      S.titleCard(); await sleep(150); $("cardMenu").click(); await sleep(100); const viaButton = G.menuOpen; $("pauseCredits").click(); await sleep(150);
      const creditsOpen = $("cTitle").textContent === "Who made this"; $("go").click(); await sleep(150);
      o.menuButtonAndCreditsBack = viaButton && creditsOpen && $("cTitle").textContent === "Sublevel Three";
      kd("Escape"); await sleep(100); $("quitTitle").click(); await sleep(250); o.quitFromCardMenu = G.state === "splash" && $("pause").hidden && !G.menuOpen;
      S.play(); await sleep(250);
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("opponent_dossier_every_bout", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), o = { bouts: [] };
      for (let i = 0; i < S.BOUTS.length; i++) {
        S.introCard(i); await sleep(250);
        const rows = [...$("cRows").querySelectorAll("dd")].map((d) => d.textContent), keys = rows.filter((t) => /^(sw_|stl_|dos_)/.test(t));
        o.bouts.push({ title: $("cTitle").textContent === S.BOUTS[i].foe, rows: rows.length === 10, noMissingStrings: keys.length === 0, showcase: G.showcase === true && $("wrap").classList.contains("dossier"), playerHidden: !S.P.root.isEnabled() });
      }
      $("go").click(); await sleep(300);
      o.afterGo = { state: G.state, showcaseCleared: G.showcase === null && !$("wrap").classList.contains("dossier"), playerBack: S.P.root.isEnabled() };
      return o; })()`, true);
    const bad = r.bouts.filter((b) => !Object.values(b).every(Boolean)).length || !Object.values(r.afterGo).every((v) => v === true || typeof v === "string");
    if (bad) throw new Error(JSON.stringify(r));
    return { bouts: r.bouts.length, afterGo: r.afterGo };
  });

  await test("reset_progress_two_clicks", async () => {
    const r = await cdp.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), S = window.__sublevel, b = document.getElementById("resetBtn"), o = {};
      S.progress.wins = 3; S.progress.outfit = "sanitation"; S.progress.arena = 2; S.progress.dock = 1;
      b.click(); o.armed = /sure|sicuro/i.test(b.textContent) && S.progress.wins === 3;
      b.click(); await sleep(50);
      o.cleared = S.progress.wins === 0 && S.progress.outfit === "auditor" && S.progress.arena === 0 && S.progress.dock === 0;
      o.saved = JSON.parse(localStorage.getItem("sublevel-progress")).wins === 0;
      b.click(); o.disarms = await __until(() => !/sure|sicuro/i.test(b.textContent), "reset button disarms", 8000).then(() => true, () => false);
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("progress_save_is_versioned", async () => {
    const load = async (raw) => {
      await cdp.eval(`localStorage.setItem('sublevel-progress', ${JSON.stringify(raw)})`);
      await cdp.send("Page.reload", { ignoreCache: true });
      await bootSublevel(cdp);
    };
    const out = {};
    /* a Sprint 25 save has no version: it loads intact, and the next save stamps v */
    await load('{"wins":3,"outfit":"sanitation","arena":2,"dock":1}');
    out.old = await cdp.eval(`(() => { const S = window.__sublevel, p = S.progress, a = { wins: p.wins, outfit: p.outfit, arena: p.arena, dock: p.dock, v: p.v, pass2: p.pass2 }; S.saveProbe({}); const r = JSON.parse(localStorage.getItem('sublevel-progress')); return { loaded: a, stamped: r.v, kept: r.wins === 3 && r.outfit === 'sanitation' && r.arena === 2 && r.dock === 1 }; })()`);
    /* broken JSON gives the defaults, at the current version */
    await load('{nope');
    out.bad = await cdp.eval(`(() => { const p = window.__sublevel.progress; return { wins: p.wins, v: p.v }; })()`);
    /* a save from a newer build is kept exactly as it is, unknown fields included, through a save */
    await load('{"v":99,"wins":2,"outfit":"auditor","arena":0,"dock":0,"future":"keep"}');
    out.future = await cdp.eval(`(() => { const S = window.__sublevel, p = S.progress, before = { v: p.v, future: p.future }; S.saveProbe({}); const r = JSON.parse(localStorage.getItem('sublevel-progress')); return { before, after: { v: r.v, future: r.future, wins: r.wins } }; })()`);
    await cdp.eval(`window.__sublevel.qaResetProgress()`);
    const ok = out.old.loaded.wins === 3 && out.old.loaded.outfit === "sanitation" && out.old.loaded.v === 4 && out.old.loaded.pass2 === 0 && out.old.stamped === 4 && out.old.kept
      && out.bad.wins === 0 && out.bad.v === 4
      && out.future.before.v === 99 && out.future.before.future === "keep" && out.future.after.v === 99 && out.future.after.future === "keep" && out.future.after.wins === 2;
    if (!ok) throw new Error(JSON.stringify(out));
    return out;
  });

  await test("share_preview_tags", async () => {
    const r = await cdp.eval(`(async () => {
      const m = (sel) => { const e = document.head.querySelector(sel); return e ? e.getAttribute("content") || e.getAttribute("href") : null; };
      const img = m('meta[property="og:image"]'), o = {
        description: (m('meta[name="description"]') || "").length > 40,
        title: m('meta[property="og:title"]') === "Sublevel Three",
        ogDescription: !!m('meta[property="og:description"]'),
        noTwitterCard: m('meta[name="twitter:card"]') === null,   /* Instagram reads Open Graph; no Twitter card is wanted */
        imageSize: m('meta[property="og:image:width"]') === "1200" && m('meta[property="og:image:height"]') === "630",
        theme: (m('meta[name="theme-color"]') || "").startsWith("#"),
        icon: (m('link[rel="icon"]') || "").startsWith("data:image/svg+xml,"),
        imageAbsolute: (img || "").startsWith("https://") && (img || "").endsWith(".jpg"),
      };
      /* the absolute og:image URL points at the live site, which this test cannot reach, so the file is fetched from this server's assets folder */
      const local = await fetch("assets/social.jpg"), blob = await local.blob();
      o.imageServed = local.ok && blob.size > 5000 && blob.size < 300000;
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("key_cap_light_and_layout", async () => {
    await waitFight(cdp, 0);
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), S = window.__sublevel, o = {};
      for (let i = 0; i < 60; i++) await raf();
      const kd = (x) => window.dispatchEvent(new KeyboardEvent("keydown", Object.assign({ bubbles: true }, x))), ku = (x) => window.dispatchEvent(new KeyboardEvent("keyup", Object.assign({ bubbles: true }, x)));
      const lit = () => [...document.querySelectorAll("#keys kbd.on")].map((k) => k.dataset.k).join(",");
      kd({ key: "l", code: "KeyL" }); await raf(); o.lit = lit() === "block"; ku({ key: "l", code: "KeyL" }); await raf(); o.off = lit() === "";
      S.E.ai.cd = 99; S.E.cfg.cd = 99; S.P.stam = 100; S.P.state = "idle";
      kd({ key: "\u043b", code: "KeyK" }); ku({ key: "\u043b", code: "KeyK" });
      /* poll for the heavy to start: on a slow runner two frames can be longer than the whole windup, which failed this test once on CI */
      o.cyrillicK = false; for (let i = 0; i < 40 && !o.cyrillicK; i++) { await raf(); o.cyrillicK = S.P.state === "attack" && !!S.P.atk && S.P.atk.type === "heavy"; }
      return o; })()`, true);
    if (!Object.values(r).every(Boolean)) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("lose_card", async () => {
    await waitFight(cdp, 0);
    const w = await cdp.eval(`window.__sublevel.qaEndBout(false)`);
    if (!w.ok || !/get up|alzati/i.test(w.title)) throw new Error(JSON.stringify(w));
    return w;
  });

  await test("restart_from_pause_starts_at_full_health", async () => {
    const r = await cdp.eval(`(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(r)), S = window.__sublevel, o = {};
      const toFight = async () => { const t = performance.now(); while (S.G.state !== "fight" && performance.now() - t < 6000) await raf(); };
      document.getElementById("wrap").hidden = true; S.startBout(2); await toFight();
      S.P.hp = 20; o.before = S.P.hp; S.restartBout(); await toFight();
      o.afterRestart = S.P.hp; o.retryFlagCleared = S.G.retry === false;
      /* a normal start of the next bout still carries health over (+35), so only the restart changed */
      S.P.hp = 20; S.startBout(3); await toFight(); o.nextBout = S.P.hp;
      return o; })()`, true);
    if (r.afterRestart !== 100 || !r.retryFlagCleared || r.nextBout !== 55) throw new Error(JSON.stringify(r));
    return r;
  });

  await test("restart_bout", async () => {
    const v = await cdp.eval(
      `(async () => {
      await (async () => {
        const S = window.__sublevel;
        document.getElementById("wrap").hidden = true;
        S.startBout(0);
        const t = performance.now();
        while (S.G.state !== "fight" && performance.now() - t < 5000) await new Promise((r) => requestAnimationFrame(r));
      })();
      const S = window.__sublevel;
      S.P.hp = 40;
      S.restartBout();
      const t = performance.now();
      while (S.G.state !== "fight" && performance.now() - t < 5000) await new Promise((r) => requestAnimationFrame(r));
      return { hp: S.P.hp, state: S.G.state };
    })()`,
      true,
    );
    if (v.hp !== 100 || v.state !== "fight") throw new Error(JSON.stringify(v));
    return v;
  });

  await test("keyboard_jab", async () => {
    await waitFight(cdp, 0);
    const v = await cdp.eval(
      `(async () => {
      const S = window.__sublevel;
      const key = (k, type) => window.dispatchEvent(new KeyboardEvent(type, { key: k, code: "KeyJ", bubbles: true }));
      key("j", "keydown");
      const t = performance.now();
      while (S.P.state !== "attack" && performance.now() - t < 500) await new Promise((r) => requestAnimationFrame(r));
      key("j", "keyup");
      return { state: S.P.state, ms: Math.round(performance.now() - t) };
    })()`,
      true,
    );
    if (v.state !== "attack" || v.ms >= 80) throw new Error(JSON.stringify(v));
    return v;
  });

  await test("gamepad_jab", async () => {
    await waitFight(cdp, 0);
    const v = await cdp.eval(
      `(async () => {
      const S = window.__sublevel;
      const buttons = () => Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
      let padButtons = buttons();
      const fake = { connected: true, id: "regression", mapping: "standard", axes: [0, 0, 0, 0],
        get buttons() { return padButtons; } };
      Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [fake] });
      padButtons[2] = { pressed: true, value: 1 };
      const t = performance.now();
      while (S.P.state !== "attack" && performance.now() - t < 500) await new Promise((r) => requestAnimationFrame(r));
      padButtons = buttons();
      return { state: S.P.state };
    })()`,
      true,
    );
    if (v.state !== "attack") throw new Error(JSON.stringify(v));
    return v;
  });

  await test("touch_portrait", async () => {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await cdp.send("Page.reload", { ignoreCache: true });
    await bootSublevel(cdp);
    await waitFight(cdp, 0);
    const v = await cdp.eval(`({
      touch: !document.getElementById("touch").hidden,
      coarse: matchMedia("(pointer: coarse)").matches,
      jab: !!document.querySelector('.tb[data-act="jab"]'),
      inner: [window.innerWidth, window.innerHeight]
    })`);
    if (!v.touch || !v.jab || v.inner[0] !== 390) throw new Error(JSON.stringify(v));
    return v;
  });

  await test("phone_landscape_844x390", async () => {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 844,
      height: 390,
      deviceScaleFactor: 2,
      mobile: true,
    });
    const go = await cdp.eval(`(() => {
      document.getElementById("wrap").hidden = false;
      const g = document.getElementById("go").getBoundingClientRect();
      return { inner: [window.innerWidth, window.innerHeight], goPast: Math.round(g.bottom - window.innerHeight) };
    })()`);
    if (go.goPast > 2) throw new Error(JSON.stringify(go));
    return go;
  });

  await test("audio_variants", async () => {
    const v = await cdp.eval(
      `(async () => {
      await window.__sublevel.audioReady();
      return window.__sublevel.audioMetrics();
    })()`,
      true,
    );
    if (!v || v.clipCount < 10 || v.hitPoolJab !== 3 || v.hitPoolHeavy !== 2) throw new Error(JSON.stringify(v));
    return v;
  });

  await test("avatar_glb", async () => {
    await cdp.eval(`document.getElementById("wrap").hidden = false`);
    const v = await cdp.eval(
      `(async () => {
      const S = window.__sublevel;
      const bin = Uint8Array.from(atob(${JSON.stringify(GLB_B64)}), (c) => c.charCodeAt(0));
      const file = new File([bin], "regression.glb", { type: "model/gltf-binary" });
      await S.useAvatar(file);
      return { avatar: !!(S.P && S.P.avatar), name: document.getElementById("avName").textContent };
    })()`,
      true,
    );
    if (!v.avatar) throw new Error(JSON.stringify(v));
    return v;
  });

  await test("draw_and_mesh_budget", async () => {
    await waitFight(cdp, 0);
    const v = await cdp.eval(
      `(async () => {
      const eng = BABYLON.Engine.LastCreatedEngine;
      const scene = BABYLON.Engine.LastCreatedScene;
      if (!eng || !scene) throw new Error("no engine");
      let prev = eng._drawCalls.current;
      let maxDraw = 0;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const now = eng._drawCalls.current;
        maxDraw = Math.max(maxDraw, now - prev);
        prev = now;
      }
      return { draw: maxDraw, active: scene.getActiveMeshes().length, meshes: scene.meshes.length };
    })()`,
      true,
    );
    if (v.draw >= 400) throw new Error(JSON.stringify(v));
    if (v.active >= 250) throw new Error(JSON.stringify(v));
    return v;
  });

  await test("touch_targets_are_44px_and_the_cards_fit", async () => {
    const out = {};
    for (const [w, h] of [[390, 844], [844, 390]]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      for (const lang of ["en", "it"]) {
        const r = await cdp.eval(`(async () => {
          const S = window.__sublevel, G = S.G, $ = (i) => document.getElementById(i), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), o = { small: {}, fit: {} };
          $("app").classList.add("is-touch"); S.setLang("${lang}"); S.qaResetProgress(); S.progress.wins = 3;
          const scan = (where) => document.querySelectorAll("button, input, select, a[href], [role=button], label").forEach((el) => {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden" || el.closest("[hidden]")) return;
            if (el.tagName === "LABEL" && !el.querySelector("input")) return;
            if (el.type === "checkbox" && el.closest("label") && el.closest("label").getBoundingClientRect().height >= 44) return;   /* the label is the target */
            if (r.height < 43.5 || r.width < 43.5) o.small[where + " " + (el.id || el.className || el.tagName)] = Math.round(r.width) + "x" + Math.round(r.height);
          });
          $("wrap").hidden = true; S.titleCard(); await sleep(150); scan("title"); o.fit.goOnScreen = $("go").getBoundingClientRect().bottom <= innerHeight + 1;
          S.titleCard(); S.introCard(0); await sleep(150); scan("dossier");
          $("wrap").hidden = true; S.startBout(0); await __until(() => G.state === "fight", "fight"); S.pauseFight(); await sleep(120); scan("pause");
          const pc = document.querySelector(".pauseCard").getBoundingClientRect(); o.fit.pauseCardFits = pc.top >= 0 && pc.bottom <= innerHeight + 1;
          S.resumeFight(); S.qaEndBout(true); await sleep(150); scan("win");
          $("app").classList.remove("is-touch"); S.setLang("en"); S.qaResetProgress();
          return o; })()`, true);
        out[`${w}x${h} ${lang}`] = r;
      }
    }
    await cdp.send("Emulation.clearDeviceMetricsOverride");
    const bad = Object.entries(out).filter(([, r]) => Object.keys(r.small).length || !Object.values(r.fit).every(Boolean));
    if (bad.length) throw new Error(JSON.stringify(bad));
    return out;
  });

  /* Scripts off: what a visitor sees before the game has parsed, or with JavaScript disabled. Reloads the page. */
  await test("page_is_not_blank_before_the_scripts_run", async () => {
    await cdp.send("Emulation.setScriptExecutionDisabled", { value: true });
    await cdp.send("Page.reload", { ignoreCache: true });
    await new Promise((r) => setTimeout(r, 800));
    const r = await cdp.send("Runtime.evaluate", { returnByValue: true, expression: `(() => { const $ = (i) => document.getElementById(i), vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none"; };
      return { splashShown: !$("splash").hidden && vis($("splash")), title: $("spTitle").textContent, loadingNote: vis($("spNote")), playHidden: !vis($("spPlay")), noscript: [...document.querySelectorAll("noscript p")].some((p) => /JavaScript/.test(p.textContent) && vis(p)) }; })()` });
    await cdp.send("Emulation.setScriptExecutionDisabled", { value: false });
    await cdp.send("Page.reload", { ignoreCache: true });
    await bootSublevel(cdp);
    const after = await cdp.eval(`(() => ({ loadingGone: !document.getElementById("splash").classList.contains("loading"), note: document.getElementById("spNote").textContent }))()`);
    const v = r.result.value;
    /* with scripts off the loading note is replaced by the noscript line (display:none from the noscript style); the Play button stays out of sight */
    if (!(v.splashShown && v.title === "Sublevel Three" && !v.loadingNote && v.playHidden && v.noscript && after.loadingGone && after.note === "")) throw new Error(JSON.stringify({ v, after }));
    return { v, after };
  });

  /* Last in the suite: it reloads the page twice. */
  await test("stored_values_are_validated_on_load", async () => {
    const reload = async () => { await cdp.send("Page.reload", { ignoreCache: true }); await bootSublevel(cdp); };
    await cdp.eval(`(() => {
      const set = (k, v) => localStorage.setItem(k, v);
      set("sublevel-sfx", "abc"); set("sublevel-music", "NaN"); set("sublevel-amb", "Infinity"); set("sublevel-rumble", "x");
      set("sublevel-diff", "constructor");
      set("sublevel-binds", JSON.stringify({ jab: "j", heavy: "j", block: "l", dodge: "space" }));
      set("sublevel-progress", JSON.stringify({ v: 2, wins: "abc", outfit: "constructor", arena: 99, dock: 7, pass2: -3 }));
    })()`);
    await reload();
    const a = await cdp.eval(`(() => { const S = window.__sublevel;
      return { title: S.G.state === "card" && !!document.getElementById("cTitle").textContent,
        progress: S.progress, diff: S.diffNow(), binds: { ...S.binds }, vol: S.audioGraph().ac ? "ctx" : "none" }; })()`);
    const okA = a.title && a.progress.wins === 0 && a.progress.outfit === "auditor" && a.progress.arena === 3 && a.progress.dock === 1 && a.progress.pass2 === 0
      && a.diff === "normal" && a.binds.jab === "j" && a.binds.heavy === "k";
    if (!okA) throw new Error("bad values: " + JSON.stringify(a));
    /* a save that is not JSON is kept under another key */
    await cdp.eval(`(() => { localStorage.removeItem("sublevel-progress-bad"); localStorage.setItem("sublevel-progress", "{nope"); })()`);
    await reload();
    const b = await cdp.eval(`(() => ({ title: window.__sublevel.G.state === "card", wins: window.__sublevel.progress.wins, bad: localStorage.getItem("sublevel-progress-bad") }))()`);
    if (!b.title || b.wins !== 0 || b.bad !== "{nope") throw new Error("corrupt save: " + JSON.stringify(b));
    await cdp.eval(`(() => { ["sublevel-sfx","sublevel-music","sublevel-amb","sublevel-rumble","sublevel-diff","sublevel-binds","sublevel-progress-bad"].forEach((k) => localStorage.removeItem(k)); window.__sublevel.qaResetProgress(); })()`);
    return { a, b };
  });

  /* Also last: a throw inside the render loop kills the loop for good, so the page is reloaded afterwards. */
  await test("crash_catcher_shows_a_card_with_details", async () => {
    const o = {};
    const card = () => cdp.eval(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), $ = (i) => document.getElementById(i);
      await __until(() => !$("noGL").hidden, "the crash card", 3000);
      await sleep(50);
      return { title: $("noGLTitle").textContent, detail: $("noGLDetail").textContent, detailShown: !$("noGLDetail").hidden, copy: !$("noGLCopy").hidden, keep: !$("noGLKeep").hidden };
    })()`, true);
    await cdp.eval(`window.__sublevel.crashProbe.timer()`);
    const t = await card();
    o.timer = t.title === "Something broke" && t.detailShown && t.copy && t.keep && /crash report/.test(t.detail) && /test crash in timer/.test(t.detail) && /state /.test(t.detail) && /babylon /.test(t.detail);
    await cdp.eval(`document.getElementById("noGLKeep").click()`);
    o.keepDismisses = await cdp.eval(`document.getElementById("noGL").hidden`);
    /* only one card per load, until the probe resets it */
    await cdp.eval(`window.__sublevel.crashProbe.timer()`); await cdp.eval(`new Promise((r) => setTimeout(r, 600))`, true);
    o.onceOnly = await cdp.eval(`document.getElementById("noGL").hidden`);
    await cdp.eval(`window.__sublevel.crashProbe.reset(); window.__sublevel.crashProbe.promise()`);
    const p = await card();
    o.promise = /test crash in promise/.test(p.detail) && p.keep;
    await cdp.eval(`window.__sublevel.crashProbe.reset(); window.__sublevel.crashProbe.frame()`);
    const f = await card();
    o.deadLoopOffersReloadOnly = /test crash in frame/.test(f.detail) && f.copy && !f.keep;
    await cdp.send("Page.reload", { ignoreCache: true }); await bootSublevel(cdp);
    if (!Object.values(o).every(Boolean)) throw new Error(JSON.stringify({ o, t, p, f }));
    return o;
  });

  if (SHOT) {
    await cdp.eval(`document.getElementById("wrap").hidden = false`);
    const pic = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
    const out = SHOT.startsWith("/") ? SHOT : join(ROOT, SHOT);
    writeFileSync(out, Buffer.from(pic.data, "base64"));
  }
}

async function runFileSuite(cdp) {
  activeCdp = cdp;
  await bootSublevel(cdp);
  await test("offline_file_boot", async () => {
    const v = await cdp.eval(`({
      sub: !!window.__sublevel,
      href: location.protocol
    })`);
    if (!v.sub || v.href !== "file:") throw new Error(JSON.stringify(v));
    return v;
  });
  await test("fullscreen_opt_out_reload", async () => {
    await cdp.eval(`localStorage.setItem('sublevel-fs','0')`);
    await cdp.send("Page.reload", { ignoreCache: true });
    await bootSublevel(cdp);
    const v = await cdp.eval(`window.__sublevel.fullscreenProbe()`);
    if (v.autoFs !== false) throw new Error(JSON.stringify(v));
    return v;
  });
  await test("offline_file_bout", async () => {
    const v = await waitFight(cdp, 0);
    if (v.state !== "fight") throw new Error(JSON.stringify(v));
    return v;
  });
}

/* the autoplay flag lets a scripted Play start the audio context, which a real click does by itself */
const AUTOPLAY = { args: ["--autoplay-policy=no-user-gesture-required"] };
await withPage(async (cdp) => runHttpSuite(cdp), AUTOPLAY);
await withPage(async (cdp) => runFileSuite(cdp), { url: fileIndexUrl(), file: true, ...AUTOPLAY });

process.exit(report() ? 1 : 0);
