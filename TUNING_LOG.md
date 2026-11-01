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

### Change 2 — merge static world meshes

Hypothesis: walls, tape, pipes, pillars, hazard bands, crates, cords and bulbs are static and share a material per group. Merging each group, and using one bulb material instead of five, drops draw calls and mesh count without changing the vertex count.

| Metric | Before | After |
| --- | --- | --- |
| Fight draw calls | 157 | 145 |
| Active meshes | 133 | 119 |
| Meshes | 211 | 175 |
| Materials | 90 | 86 |
| Geometries | 143 | 107 |
| Vertices | 57,178 | 57,178 |
| Shadow casters | 45 | 45 |
| Keyboard jab | pass | idle → attack |
| Gamepad / GLB clear | pass | pass |
| Geometries over 40 restarts | flat | 107 → 107 |

Verdict: **keep**. Most of the merged meshes were already outside the view, so draw calls fell by 12 rather than by the full mesh drop of 36. The picture still shows the walls, pipes, striped pillars, crates, cords and bulbs.

### Change 3 — phone viewport

Hypothesis: with no viewport meta, a phone lays the page out at the old 980 px default and then scales it down, so the canvas renders far more pixels than the screen.

Measured with touch emulation, device pixel ratio 2, fonts blocked.

| Metric | Before | After |
| --- | --- | --- |
| Layout size | 980×2121 | 390×844 |
| Render size | 1225×2651 | 487×1055 |
| Render pixels | 3,247,475 | 513,785 |
| Desktop 1920×1080 render | 1920×1080 | 1920×1080 |
| Touch controls | shown, `touch-action: none` | shown, buttons 70×70, stick 136×136 |
| Meshes | 175 | 175 |

Verdict: **keep**. Desktop resolution did not move. The game still boots with the font hosts blocked.

### Checked, no code change

Crowd. Already `createInstance` for 68 body and head meshes. Fight draw calls (157) sit below the active mesh count (131), which is the instancing saving the extra draws. Sources sit below the floor and are not in the active set. Verdict: **keep** as it is.

Dispose. Across 40 `startBout` calls, mesh count and geometry count stayed flat (211/143 before the merge, 175/107 after). Twenty GLB swaps returned to the same mesh count after clear. Heap used-size grew about 0.1–0.4 MB on the second 20 restarts; that is allocator slack, not a mesh leak. Verdict: **keep**, no dispose change.

Freeze world matrices. Active-mesh evaluation is 0.40–0.58 ms and the run-to-run spread is larger than the time freezing could save. Verdict: **revisit** on a machine where that cost shows up. Not shipped.

Quality ladder. Threshold is already 44 fps and the window is already 1,800 ms. The floor is already hardware scaling 2 (half of the 1080p view, 960×540). Isolated GPU times were taken in one pass and drifted down even after settings were restored, so they are not clean enough to reorder the steps. Poisson off, measured next to the full-quality sample, saved about 0.11 ms. Verdict: **keep** the current order and floor.

Input check, not a tune: a jab key reached `attack` inside two frames at 16.7 ms, which is inside the 80 ms budget.

## Sprint 2 — Input feel

Goal: keep input-to-pose under 80 ms, and put the buffer, dodge cooldown, dead zone, triggers, d-pad and turn rate on the backlog numbers. Add remappable action keys and a rumble slider. Put Jab under the right thumb on a 6-inch phone without scroll or zoom.

Probe: headless Chrome. Latency is wall time from the event to `P.state === "attack"` and to the right shoulder rotating by more than 0.02 rad. Phone layout is 390×844, device pixel ratio 2.

### Baseline

| Metric | Value |
| --- | --- |
| Keyboard state / pose | 17 ms / 34 ms |
| Touch button state / pose | 17 ms / 34 ms |
| Pad X state / pose | 17 ms / 34 ms |
| Buffer | heavy pressed at jab t=0.291 chained; constant is 0.22 s |
| Dodge cooldown at start | 0.55 s |
| Dodge again before cooldown | blocked |
| Dodge after cooldown | starts |
| Stick 0.19 radial | 0 movement |
| Stick 0.45 radial | 0.101 m |
| D-pad right | 0.39 m |
| Turn damp, idle / attacking | 14.1 / 5.1 |
| Trigger value 0.2, pressed | state block |
| Trigger value 0.8 | state block |
| Rumble on a jab hit | strong 0.3, weak 0.6 |
| Jab distance to the bottom-right corner | 163 px (Dodge is 49 px, the nearest) |
| Button size | 70×70, 72 px clear of the stick |
| Scroll after a drag, pinch scale | 0, 1 |

Buffer, cooldown, dead zone, d-pad and turn rate are already the backlog numbers. Verdict on those: **keep**, no code change. Latency is inside 80 ms.

### Change 1 — trigger threshold 0.5

Hypothesis: a trigger value of 0.2 with `pressed` true is a resting finger. Blocking only at value ≥ 0.5 removes that without dropping a full pull.

| Metric | Before | After |
| --- | --- | --- |
| Value 0.2, pressed true | block | idle |
| Value 0.8 | block | block |
| Keyboard pose | 34 ms | 33 ms |
| D-pad move | 0.39 m | 0.39 m |

Verdict: **keep**. LB, RB and B still use the digital pressed flag.
