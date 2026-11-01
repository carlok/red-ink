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

### Change 2 — Jab under the right thumb

Hypothesis: on a 390×844 screen the primary attack should be the button closest to the bottom-right corner. Moving Jab there cuts the reach without shrinking the buttons or covering the stick.

| Metric | Before | After |
| --- | --- | --- |
| Jab distance to the corner | 163 px | 49 px |
| Nearest button | Dodge | Jab |
| Button size | 70×70 | 70×70 |
| Gap from stick to buttons | 72 px | 72 px |
| Touch jab pose | 34 ms | 16 ms |
| Drag scroll / pinch scale | 0 / 1 | 0 / 1 |

Verdict: **keep**. The view and the buttons already had `touch-action: none`, and a pinch left the visual scale at 1, so nothing was added for scroll or zoom.

### Change 3 — remappable action keys

Hypothesis: the four fight keys can be rewritten from the title card, the new key still hits inside 80 ms, the old key stops, the Z / X / V / C aliases stay, and the choice survives a reload. Storage is wrapped in try/catch.

| Metric | Before | After |
| --- | --- | --- |
| Jab key, time to attack | J, 16 ms | U, 16 ms |
| J after the rebind | attacks | no attack |
| Z alias | attacks | 15 ms |
| After a new page load | no stored bind | label U, `sublevel-binds` jab `u` |

Verdict: **keep**. Gamepad X still jabs in 17 ms.

### Change 4 — rumble slider

Hypothesis: a 0–100 slider on the title card scales both rumble magnitudes, 0 sends nothing, and the value is still there after a reload. Storage is wrapped in try/catch.

| Metric | Before | After |
| --- | --- | --- |
| Jab hit, slider 100 | strong 0.3, weak 0.6 | strong 0.3, weak 0.6 |
| Slider 50 | full strength | strong 0.15, weak 0.3 |
| Slider 0 | a call at full strength | 0 calls |
| After a new page load | no stored value | `sublevel-rumble` `0` |

Verdict: **keep**. The hit still lands. Only the actuator call changes.

## Sprint 3 — Combat feel

Goal: keep the attack table, the block math, and the counter on the backlog numbers, and make a hit readable inside 100 ms without covering the next swing.

Probe: headless Chrome. Fighters are placed in range. "Word" time is wall time from the hp drop until the comic plane's scale reaches 0.45. Flinch time is the same clock until the victim's lean has moved by 0.08 rad.

### Baseline

| Metric | Value |
| --- | --- |
| Jab duration / stamina / damage / first active t | 383 ms / 10 / 7 / 0.116 s |
| Heavy duration / stamina / damage / first active t | 817 ms / 24 / 16 / 0.349 s |
| Jab stun / heavy stun | 0.30 s / 0.55 s |
| Hitstop at the hit, jab / heavy / KO | 0.05 / 0.09 / 0.14 s |
| Block chip on a jab | 0.7 (10 percent) |
| Block stamina drain | 6.65 (0.95 × 7) |
| Guard-break stun | 0.7 s |
| Counter jab damage | 8.75 (1.25 × 7) |
| Jab word readable | 100 ms |
| Heavy word readable | 133 ms |
| Word scale at 100 ms, jab / heavy | 0.492 / 0.321 |
| Flinch | same frame as the hit |
| FOV through the hit | 0.85, no punch |
| KO pose clock at 100 ms | 0.029 s, hitstop still 0.039 s |

The table, the block math, the counter, and the three hitstop values already match the backlog. Verdict on those: **keep**. A heavy's word was the miss. Hitstop scales the whole frame, including the comic word, so the burst sat under the readable size until the freeze ended.

### Change 1 — comic words use real time

Hypothesis: advancing the word on unscaled time, while the fighters stay on the slowed clock, gets a heavy's burst to scale 0.45 inside 100 ms. Hitstop length stays put, so the next swing is not pulled forward into the freeze.

| Metric | Before | After |
| --- | --- | --- |
| Jab word readable | 100 ms | 50 ms |
| Heavy word readable | 133 ms | 34 ms |
| Word scale at 100 ms, jab / heavy | 0.492 / 0.321 | 0.753 / 0.757 |
| Jab / heavy damage | 7 / 16 | 7 / 16 |
| Hitstop jab / heavy / KO | 0.05 / 0.09 / 0.14 | 0.05 / 0.09 / 0.14 |
| Block chip / drain / guard stun | 0.7 / 6.65 / 0.7 | 0.7 / 6.65 / 0.7 |
| Counter damage | 8.75 | 8.75 |
| Heavy hitstop left at 100 ms | gone | 0.006 s |

Verdict: **keep**. The burst is up while the fighters are still in the freeze, and the freeze is over before a jab has recovered (0.40 s) enough to swing again.

Camera punch-in was not added. FOV stays 0.85; the distance change is the follow camera. Spark counts stay 14 on a jab and 26 on a heavy. KO slow motion stays the 0.14 s hitstop: the K.O. word is readable at 16 ms, and the fall is still the 0.9 s pose. Those three did not miss the read once the word was on real time.

## Sprint 4 — Balance

Goal: a median scripted bot, 200 fights per bout from seed 1, wins about 85 / 65 / 45 percent against Reyes / Dag / Pike. Median length 25 to 60 s. No fight goes 40 s without a hit, and none reaches 60 s without a KO. The bot's stamina is empty less than 20 percent of the time.

The sim steps at a fixed 1/60 s with the same `step` and `aiIntent` the game uses. `mulberry32(seed + bout*10007 + i*97)` replaces the combat random calls for the run. An 8-fight repeat of seed 1 matched the first 8-fight run.

### Baseline — median bot, raw bout table

The bot walks into jab range, jabs on a 0.95 s pause, blocks or dodges a swing only after 0.18 s, and backs off below 28 stamina.

| Bout | Win % | Median length | Empty stamina | Stalemates | Longest gap |
| --- | --- | --- | --- | --- | --- |
| Reyes | 100 | 16.2 s | 0% | 0 | 4.1 s |
| Dag | 91 | 35.2 s | 0% | 0 | 5.8 s |
| Pike | 0 | 20.6 s | 0% | 0 | 2.3 s |
| Target | 85 / 65 / 45 | 25–60 s | under 20% | 0 | ≤ 40 s |

Stamina and stalemates are inside the target. Reyes ends too fast and too clean. Pike wins none. Dag is long enough and too easy.
