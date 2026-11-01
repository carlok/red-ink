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
    if (!v || v.clipCount < 18 || v.hitPoolJab !== 3 || v.hitPoolHeavy !== 2) throw new Error(JSON.stringify(v));
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

await withPage(async (cdp) => runHttpSuite(cdp));
await withPage(async (cdp) => runFileSuite(cdp), { url: fileIndexUrl(), file: true });

const failed = results.filter((r) => !r.pass);
const summary = {
  pass: results.filter((r) => r.pass).length,
  fail: failed.length,
  tests: results,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(failed.length ? 1 : 0);
