/**
 * Sprint 12 headless regression against window.__sublevel.
 * Usage: node tools/regression.mjs [--shot path.jpg]
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

async function test(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, pass: true, detail });
  } catch (e) {
    results.push({ name, pass: false, error: e.message });
  }
}

async function runHttpSuite(cdp) {
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
      $("wrap").hidden = true; g.MUS.log = []; S.startBout(0); while (G.state !== "fight") await raf(); await sleep(300);
      o.fightOnce = JSON.stringify(voices(g.MUS.log)) === JSON.stringify(["voice:fight"]);
      g.MUS.log = []; S.qaEndBout(true); await sleep(800); o.perfectWord = voices(g.MUS.log).join() === "voice:perfect" && /Perfect|Perfetto/.test($("cRows").textContent); /* no hit taken in the test */
      $("wrap").hidden = true; S.startBout(0); while (G.state !== "fight") await raf(); G.log.hits = 2; g.MUS.log = []; S.qaEndBout(true); await sleep(800); o.winWord = voices(g.MUS.log).join() === "voice:win";
      $("wrap").hidden = true; S.startBout(0); while (G.state !== "fight") await raf(); g.MUS.log = []; S.qaEndBout(false); await sleep(800); o.loseWord = voices(g.MUS.log).join() === "voice:lose";
      S.setAudio({ mute: true }); $("wrap").hidden = true; g.MUS.log = []; S.startBout(0); while (G.state !== "fight") await raf(); await sleep(300); o.mutedSilent = voices(g.MUS.log).length === 0; S.setAudio({ mute: false });
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
      const lose = async (bout) => { $("wrap").hidden = true; S.startBout(bout); while (G.state !== "fight") await raf(); S.qaEndBout(false); await sleep(120); };
      document.querySelector('[data-diff="normal"]').click(); G.loss = null;
      await lose(0); await lose(0); o.noneAtTwo = $("cardAssist").hidden;
      await lose(1); o.resetOnOtherBout = $("cardAssist").hidden;
      await lose(0); await lose(0); await lose(0);
      o.offeredAtThree = !$("cardAssist").hidden && /Easy/.test($("cardAssist").textContent) && /Assist/.test($("cRows").textContent);
      $("cardAssist").click(); await sleep(50);
      o.switched = S.diffNow() === "easy" && localStorage.getItem("sublevel-diff") === "easy" && (G.state === "ready" || G.state === "fight") && G.bout === 0;
      G.state = "pause"; await lose(0); await lose(0); await lose(0); o.noneWhenEasy = $("cardAssist").hidden;
      document.querySelector('[data-diff="normal"]').click();
      $("wrap").hidden = true; S.startBout(0); while (G.state !== "fight") await raf(); S.qaEndBout(true); await sleep(120); o.winClears = G.loss.n === 0 && $("cardAssist").hidden;
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
      $("wrap").hidden = true; S.startBout(0); while (G.state !== "fight") await raf();
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
      $("wrap").hidden = true; S.startBout(0); while (G.state !== "fight") await raf();
      unplug(); await raf();
      o.paused = G.state === "pause" && !$("pause").hidden && !$("pauseHint").hidden && /Controller disconnected/.test($("pauseHint").textContent);
      $("resume").click(); await raf();
      o.resumed = G.state === "fight" && $("pauseHint").hidden;
      G.state = "card"; unplug(); await raf(); o.ignoredOnCard = G.state === "card";
      S.setLang("it"); $("wrap").hidden = true; S.startBout(0); while (G.state !== "fight") await raf(); unplug(); await raf(); o.italian = /scollegato/.test($("pauseHint").textContent);
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
        while (G.state !== "fight") await raf();
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
      $("wrap").hidden = true; S.seed(5); S.startBout(0); while (G.state !== "fight") await raf();
      const E = S.E; E.ai.cd = 99; E.cfg.cd = 99; E.speed0 = 0; E.cfg.heavy = 0; E.cfg.dodge = 0; E.cfg.block = 0; S.P.pos.set(-1.2, 0, 0); E.pos.set(1.2, 0, 0); S.P.hp = S.P.maxHp = 1e6; S.P.stam = 100;
      await tap("l"); await frames(20); o.holdModeTapDoesNothing = S.P.state !== "block";
      $("blockTog").checked = true; $("blockTog").dispatchEvent(new Event("change"));
      o.saved = localStorage.getItem("sublevel-blocktoggle") === "1" && $("pBlockTog").checked && /toggle/.test(document.getElementById("keys").textContent);
      await tap("l"); await frames(30); o.tapHoldsGuard = S.P.state === "block";
      await tap("l"); await frames(8); o.secondTapDrops = S.P.state !== "block";
      await tap("l"); await frames(10); const guarded = S.P.state === "block"; await tap("j"); await frames(4);
      o.jabEndsGuard = guarded && (S.P.state === "attack" || S.P.started === "jab") && !G.blockLatch;
      await frames(60);
      await tap("l"); await frames(10); S.startBout(0); o.newBoutClears = !G.blockLatch; while (G.state !== "fight") await raf();
      o.tutor = /Tap L to guard/.test(S.tutorLine("keys")) && /again to drop/.test(S.tutorLine("pad")) && /Tap Block/.test(S.tutorLine("touch")) && ["keys", "pad", "touch"].every((m) => S.tutorLine(m).split(/\\s+/).length <= 16);
      $("pBlockTog").checked = false; $("pBlockTog").dispatchEvent(new Event("change"));
      o.pauseSwitchOff = !$("blockTog").checked && localStorage.getItem("sublevel-blocktoggle") === "0" && /hold/.test(document.getElementById("keys").textContent);
      key("l", true); await frames(10); o.holdStillWorks = S.P.state === "block"; key("l", false); await frames(6);
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
      while (G.state !== "fight") await raf();
      let moved = false, acted = false; const p0 = S.P.pos.clone();
      for (let i = 0; i < 180; i++) { await raf(); if (S.P.pos.subtract(p0).length() > 0.3) moved = true; if (act()) acted = true; }
      o.movesWithoutInput = moved && !S.autoState().taken && !$("autoTag").hidden;
      S.P.hp = S.P.maxHp = 1e6; S.E.hp = S.E.maxHp = 1e6;
      key("j", true); key("j", false); await raf(); await raf();
      o.keyTakesOver = S.autoState().taken && $("autoTag").hidden;
      S.startBout(1); while (G.state !== "fight") await raf();
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
      const run = async (win) => { $("wrap").hidden = true; S.startBout(0); while (G.state !== "fight") await raf(); g.MUS.log = []; if (win) S.qaEndBout(true); else S.qaEndBout(false); await sleep(5000); const n = g.MUS.log.slice(); g.MUS.log = null; return n; };
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
      while (G.state !== "fight") await raf();
      const E = S.E; E.ai.cd = 99; E.cfg.cd = 99; E.speed0 = 0; E.cfg.heavy = 0; E.cfg.dodge = 0; E.cfg.block = 0; S.P.pos.set(-0.5, 0, 0); E.pos.set(0.5, 0, 0);
      for (let i = 0; i < 4; i++) { key("j", true); key("j", false); for (let k = 0; k < 40; k++) await raf(); }
      const lg = G.log; lg.dodges = 1; lg.hits = 1; o.singular = /1 hit taken, [0-9]+ blocks, 1 dodge,/.test(S.fightLine()); o.counts = lg.thrown >= 3 && lg.landed >= 1 && lg.landed <= lg.thrown && lg.time > 2;
      S.qaEndBout(true); await sleep(200);
      const rows = $("cRows").textContent;
      o.enRow = /Punches/.test(rows) && /[0-9]+ of [0-9]+ landed \\([0-9]+%\\)/.test(rows);
      S.setLang("it"); $("wrap").hidden = true; S.startBout(0); while (G.state !== "fight") await raf(); S.qaEndBout(true); await sleep(200);
      o.itRow = /Pugni/.test($("cRows").textContent) && /a segno/.test($("cRows").textContent) && /colpi subiti/.test($("cRows").textContent);
      S.setLang("en");
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
        win: async () => { S.startBout(0); while (G.state !== "fight") await raf(); S.qaEndBout(true); }, lose: async () => { S.startBout(0); while (G.state !== "fight") await raf(); S.qaEndBout(false); }
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
      b.click(); await sleep(4300); o.disarms = !/sure|sicuro/i.test(b.textContent);
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
      kd({ key: "\u043b", code: "KeyK" }); ku({ key: "\u043b", code: "KeyK" }); await raf(); await raf(); o.cyrillicK = S.P.state === "attack" && S.P.atk.type === "heavy";
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

  if (SHOT) {
    await cdp.eval(`document.getElementById("wrap").hidden = false`);
    const pic = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
    const out = SHOT.startsWith("/") ? SHOT : join(ROOT, SHOT);
    writeFileSync(out, Buffer.from(pic.data, "base64"));
  }
}

async function runFileSuite(cdp) {
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

const failed = results.filter((r) => !r.pass);
const summary = {
  pass: results.filter((r) => r.pass).length,
  fail: failed.length,
  tests: results,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(failed.length ? 1 : 0);
