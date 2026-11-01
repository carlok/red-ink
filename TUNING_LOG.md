# Tuning log

## Sprint 1 — Performance and loading

Goal: ship the engine under 2 MB gzip, and keep a fight under 400 draw calls and 250 active meshes, with a first playable frame under 4 s on a 20 Mbps link.

Probe: headless Chrome, 1920×1080, device pixel ratio 1, against `window.__sublevel`. Draw calls are the per-frame delta of `engine._drawCalls`. This machine presents at 16.7 ms, so frame time is not an fps reading. GPU time is from `EngineInstrumentation` (about 2.2 ms at full quality). Ask for a confirm on real integrated-GPU hardware.

### Baseline

Full `lib/babylon.js` UMD 9.30.0 plus `lib/babylonjs.loaders.min.js`.

| Metric | Value |
| --- | --- |
| babylon.js | 8,619,713 bytes, gzip 1,868,255 |
| loaders | 849,596 bytes, gzip 210,344 |
| Engine gzip | 2,078,599 |
| Page gzip (html + both scripts) | 2,102,489 |
| 20 Mbps, gzip | 841 ms |
| 20 Mbps, uncompressed | 3,814 ms |
| Script ready, first launch | 1,965 ms |
| Script ready, warm launch | 373–395 ms |
| Fight draw calls (median) | 157 |
| Active meshes | 131 |
| Meshes | 211 |
| Vertices | 57,178 |
| Materials | 90 |
| Shadow casters | 45 |
| GPU frame, full quality | 2.18 ms |
| Active-mesh evaluation | 0.40 ms |
| Geometries over 40 `startBout` calls | 143 → 143 |
| Meshes over 40 restarts | 211 → 211 |
| GLB import ×20, then clear | meshes back to 211 |
| Keyboard jab | idle → attack |
| Gamepad (standard map) | stick moves, X jabs |

The quality ladder was already a 44 fps threshold and a 1,800 ms window. Forcing `getDeltaTime` to return 50 walked all five steps and stopped at hardware scaling 2, which is 960×540 from a 1920×1080 view.

### Change 1 — tree-shaken engine

Hypothesis: an esbuild bundle of only the Babylon 9.30 modules this game imports gets gzip under 2 MB without moving the fight scene.

| Metric | Before | After |
| --- | --- | --- |
| Engine bytes | 9,469,309 | 3,053,523 |
| Engine gzip | 2,078,599 | 709,952 |
| Page gzip | 2,102,489 | 733,831 |
| 20 Mbps, gzip | 841 ms | 294 ms |
| 20 Mbps, uncompressed | 3,814 ms | 1,248 ms |
| Warm script ready | 395 ms | 343 ms |
| Fight draw calls | 157 | 157 |
| Meshes / vertices | 211 / 57,178 | 211 / 57,178 |
| Keyboard, pad, GLB | pass | pass |

Verdict: **keep**.

The first bundle left `Camera` off the global, so `updateCamera` threw on `FOVMODE_HORIZONTAL_FIXED` and the view stayed black. Exporting `Camera` fixed it. The numbers above are from that build. `lib/babylonjs.loaders.min.js` is gone; glTF 2.0 and the material extensions the avatar path needs are inside `lib/babylon.js`. Draco still expects a decoder fetch, which the old UMD build did not embed either.
