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

### Change 1 — median bot waits 1.55 s between jabs, then the bout table moves

Hypothesis: a longer pause between the bot's jabs stretches Reyes past 16 s, and per-bout levers can pull the three win rates onto 85 / 65 / 45 without emptying stamina or opening a 40 s gap.

Kept constants, old -> new:

| Constant | Old | New |
| --- | --- | --- |
| Bot pause between jabs | 0.95 s | 1.55 s |
| Reyes react | 0.50 s | 0.08 s |
| Reyes block | 0.08 | 0.28 |
| Reyes damage | 0.80 | 0.85 |
| Dag cooldown | 1.30 s | 1.40 s |
| Pike block | 0.35 | 0.18 |
| Pike damage | 1.00 | 0.49 |

Hp stays 70 / 115 / 120. Stamina regen stays 26 per second. Dodge cost stays 16 and the invulnerable window stays 0.22 s. 200 fights, seed 1.

| Bout | Win % | Median | Empty | Stalemates | Longest gap |
| --- | --- | --- | --- | --- | --- |
| Reyes | 84.5 | 33.1 s | 0% | 0 | 4.8 s |
| Dag | 66.5 | 37.1 s | 0% | 0 | 5.1 s |
| Pike | 44.5 | 46.2 s | 0% | 0 | 3.2 s |

Verdict: **keep**. A jab still costs 10 stamina and deals 7. Block chip on that jab is still 0.7, and a counter is still 8.75.

Tried and dropped: a bot that only attacked after a whiff (win rates fell to 45 / 30 / 0). Pike cooldown 0.95 -> 1.35 (win rate 0.5%). Pike damage 0.46 (72% wins) and 0.50 (39.5%). Dag damage 1.09 (74%) versus 1.10 and above (61%). The kept Pike and Dag values are the ones on the near side of those cliffs.

### Change 2 — easy / normal / hard are multipliers

Hypothesis: one table of multipliers, with normal at 1, leaves the 200-fight result above unchanged and moves easy above it and hard below it. The same multiplier scales the bot's reaction for the easy and hard bots. The jab pause does not scale, so a harder bot does not walk into Pike faster.

Normal difficulty, 200 fights, seed 1: identical to the table above.

Median bot, enemy multipliers:

| | Reyes | Dag | Pike |
| --- | --- | --- | --- |
| Easy | 100% | 98.5% | 100% |
| Normal | 84.5% | 66.5% | 44.5% |
| Hard | 29.5% | 29.5% | 1% |

Bot skill, normal difficulty:

| | Reyes | Dag | Pike |
| --- | --- | --- | --- |
| Easy bot | 81% | 63% | 44.5% |
| Normal bot | 84.5% | 66.5% | 44.5% |
| Hard bot | 86.5% | 65% | 44.5% |

Verdict: **keep**. Easy and hard difficulty move every bout the right way. Bot skill moves Reyes the right way. On Pike the three bots land in the same place, because none of them react inside a jab's 0.10 s startup.

## Sprint 5 — Opponent AI

Goal: Reyes teaches, Dag punishes, Pike repeats the last three attacks. A tell stays readable for 0.2–0.5 s. Nobody acts on an attack faster than their own react time. Log hits, blocks, dodges, and corner time.

Probe: `node tools/ai-probe.mjs`. Corner means inside 85% of the 7 m ring. A defense is early when it lands more than half a frame before that fighter's react time.

### Baseline

The decision tick could fire at 0.7× react, and a tick that was already due answered on the same frame it saw the swing.

| | React | Fastest answer |
| --- | --- | --- |
| Reyes | 0.08 s | 0.067 s |
| Dag | 0.38 s | 0.300 s |
| Pike | 0.24 s | 0.217 s |

All three fastest answers were under that fighter's react. Jab mark time was 0 s. Heavy mark time was 0.333 s. Pike replayed a finished sequence, then kept his place in the old list when the sequence changed (`heavy, jab, heavy` instead of `heavy, heavy, jab`). A whiff drew a Dag heavy inside 1.2 s on 15 of 30 trials, median delay 0.10 s, none of them after his 0.38 s react. From the rim, escape within 3 s was 3 / 5 / 10 out of 12, median about 1.7 s.

### Change 1 — habits, tells, and a fair react

Hypothesis: one intent path can telegraph Reyes, punish with Dag, and replay Pike, if a defense or a punish waits out `react` and a jab mark is held for 0.28 s before the swing.

Kept constants, old -> new:

| Constant | Old | New |
| --- | --- | --- |
| Reyes jab mark | none | 0.28 s, then the jab |
| Reyes feint | none | 20% of those marks, no swing |
| Dag punish | none | heavy, `react` after a miss |
| Pike memory | cycling index into a shifting list | the last three attacks, reset when they change |
| Pike cooldown | 0.95 s | 1.05 s |
| Corner | back up into the rim | step toward center past 82% of the ring |

| | Before | After |
| --- | --- | --- |
| Reyes fastest answer | 0.067 s | 0.083 s |
| Pike fastest answer | 0.217 s | 0.250 s |
| Answers before react | yes | 0 |
| Reyes jab mark | 0 s | 0.283 s |
| Heavy mark | 0.333 s | 0.333 s |
| Feints that became a swing | — | 0 of 11 |
| Feint rolls | — | 11 / 50 (22%) |
| Pike sequence match | drifted | 3 / 3, and the switch matched |
| Dag punish on time | 0 / 30 | 30 / 30, median 0.383 s |
| Rim escapes | 3, 5, 10 of 12 | 12, 12, 12 of 12 |
| Escape median | ~1.7 s | 0.37 / 0.38 / 0.28 s |

Dag does not answer the reaction heavy. It becomes active at 0.34 s and his react is 0.38 s, so a legal answer would be late. He does not swing early.

Echoed jabs were landing, and at the old 0.95 s cooldown the median bot's win rate against Pike fell to 8% (200 fights). At 1.50 s it rose to 94%. 1.05 s puts it back.

200 fights, seed 1, normal bot, normal difficulty:

| Bout | Win % | Median | Empty | Stalemates | Corner |
| --- | --- | --- | --- | --- | --- |
| Before, Reyes | 84.5 | 33.1 s | 0% | 0 | — |
| After, Reyes | 90.5 | 32.3 s | 0% | 0 | 1.7 s |
| Before, Dag | 66.5 | 37.1 s | 0% | 0 | — |
| After, Dag | 67.5 | 34.0 s | 0% | 0 | 5.1 s |
| Before, Pike | 44.5 | 46.2 s | 0% | 0 | — |
| After, Pike | 44.0 | 43.9 s | 0% | 0 | 0.0 s |

Verdict: **keep**. A jab is still 7 damage, a block chip is still 0.7, a counter is still 8.75. The median bot's blocks stay at 0 because a jab is active at 0.10 s and the bot reacts at 0.18 s. Dag still holds that bot in the corner for about 5 s of a 34 s fight. The opponents themselves leave the rim in under half a second.

`tuning/s5-tell.jpg` is Reyes with the mark up, arm cocked, before the jab.

## Sprint 6 — Animation and characters

Goal: the damp-24 rig should breathe, shift weight, swing the arms in a walk, turn a hit toward the side it came from, and fall in three different ways. Tie, hair, and the shirt hem lag the body. Bruises build.

Probe: `node tools/pose-probe.mjs`. Joint numbers are radians.

### Baseline

| | Value |
| --- | --- |
| Smoothing step at 1/60 s | 0.33 of the way to the pose (damp 24) |
| Idle bob | 12 mm, period 1.50 s |
| Blink | eyes stay at 1 |
| Idle hip shift | 0 |
| Walk, left arm vs left hip | correlation 0 |
| Jab cock at 0.05 s | 0.279 |
| Jab still extended 0.10 s after the active frame | 0.75 |
| Hit side, 8 from the right and 8 from the left | not stable |
| Three knockdown poses | identical, lean −1.409 |
| Tie lag | no separate tie |
| Marks after 4 jabs | 0 |
| Knuckles | 0 |
| Meshes | 175 |

The jab already cocks and follows through. Those curves stayed.

### Change 1 — breath, weight, walk, hits, knockdowns, lag, marks

Hypothesis: slowing the idle bob to a breath, opposing the arms to the hips, and choosing the hit side from the punch direction makes the rig readable without touching attack timing or the fight seed.

| | Before | After |
| --- | --- | --- |
| Breath period | 1.50 s | 2.85 s, still 12 mm |
| Lowest open eye over 4 s | 1 | 0.12 |
| Idle hip shift | 0 | 0.44 |
| Walk correlation | 0 | −1 |
| Jab cock / follow-through | 0.279 / 0.75 | 0.279 / 0.75 |
| Hits from the right | mixed | 8/8 side +1 |
| Hits from the left | mixed | 8/8 side −1 |
| Knockdown lean | −1.409, −1.409, −1.409 | −1.409, −0.486, −0.632 |
| Knockdown roll | 0, 0, 0 | 0, 0, 1.118 |
| Crumple knee | 0.10 | 1.218 on the heavy fall |
| Tie after one frame, then half a second | — | −0.029, then −0.255, while the spine is at 0.375 |
| Marks after 4 jabs | 0 | 0.56 |
| Knuckles | 0 | 6, merged into the hand |
| Meshes | 175 | 182 |

A jab from the left still falls backward. A jab from the right drops sideways. A heavy crumples. The random draw that used to pick the hit side is still consumed, so the seeded bouts do not move: 200 fights, seed 1, stay at 90.5% / 32.3 s, 67.5% / 34.0 s, 44.0% / 43.9 s.

Verdict: **keep**. Damp stays 24. `tuning/s6-ko-before.jpg` is the old flat fall. `tuning/s6-ko-after.jpg` is the side drop.

## Sprint 7 — Visual quality inside the budget

Goal: a cold overhead, sodium bulbs, and a crowd with shoulders and legs, without leaving the draw and mesh budgets. Anything that costs more than 1 ms of GPU time has to sit on the quality ladder.

Probe: `node tools/look-probe.mjs`. Draws are the per-frame delta of `engine._drawCalls`. GPU time is `EngineInstrumentation`, in milliseconds. This machine's frame is still capped at 16.7 ms, so the GPU timer is the cost.

### Baseline

| | Value |
| --- | --- |
| Fight draws | 148 |
| Active meshes | 120 |
| Meshes | 182 |
| GPU frame | 1.107 ms |
| Key light | 1.00, 0.90, 0.72 |
| Fill | 0.62, 0.70, 0.95 |
| Bulb | 1.00, 0.68, 0.34 |
| Exposure / contrast | 1.50 / 1.10 |
| Crowd | capsule, 154 verts, bounds 0.57 × 1.50 × 0.60 |
| Crowd yaw over ~1.5 s | 0 |
| HUD at 360 px | Auditor and Reyes fit, 12 px type, 18 px bars |

`ColorCurves` is not in the tree-shaken engine, so the grade stays on the lights and the exposure.

### Change 1 — fluorescent key, sodium bulbs, block crowd, soft shadow

Hypothesis: a cold key against the orange bulbs will read as two kinds of light, and a merged box figure will read as a person, if the instance count stays 34 bodies and 34 heads.

| | Before | After |
| --- | --- | --- |
| Key | 1.00, 0.90, 0.72 | 0.62, 0.78, 1.00 |
| Fill | 0.62, 0.70, 0.95 | 0.55, 0.68, 1.00 |
| Bulb | 1.00, 0.68, 0.34 | 1.00, 0.62, 0.28 |
| Exposure / contrast | 1.50 / 1.10 | 1.35 / 1.22 |
| Hair specular | 0.28, power 14 | 0.55, power 28 |
| Eye emissive scale | 0.45 | 0.70 |
| Crowd bounds | 0.57 × 1.50 × 0.60 | 0.76 × 1.43 × 0.22 |
| Crowd verts | 154 | 144 |
| Crowd yaw span | 0 | 0.37 rad |
| Fight draws | 148 | 149 |
| Active meshes | 120 | 124 |
| GPU, blur on | 1.107 ms (poisson, no blur) | 1.355 ms |
| GPU, blur off | — | 1.179 ms |

The blur pass costs about 0.18 ms here. Quality step 2 turns it off together with the poisson filter. The enemy bar and the K.O. word stay the red accent. At 360 px the names still fit and the bars stay 18 px.

Verdict: **keep**. `tuning/s7-after.jpg` is the desktop frame. `tuning/s7-before-360.jpg` and `tuning/s7-after-360.jpg` are the phone check.

## Sprint 8 — Audio

Goal: layered samples instead of oscillators, a room tone, a crowd swell, and calm / tense / finish music. Hits peak at −6 dBFS, music at −18 dBFS, and the music ducks under a hit. Volume and mute survive a reload. A key or a pad press starts the audio context.

### Baseline

Jab was a sine at gain 0.5 plus noise at 0.35, so the sum could pass −6 dBFS. Heavy was 0.8 plus 0.5. There was no music bus, no room tone, and no ducking. Mute lived in a variable and was not saved. `audioInit` ran from the card button and the sound button. A keydown and a pad press did not call it.

### Change 1 — sample bus

Hypothesis: pre-rendered layers, normalised again after the browser resamples them, can hold the two peak targets while a separate music gain ducks to 0.35 for 0.4 s.

The files are generated by `tools/make-audio.mjs` and shipped in `audio/samples.js` (443 KB). They are CC0. Playback gain is trimmed after decode so the resampled peak, not the file peak, is the one that counts.

| | Target | Measured |
| --- | --- | --- |
| Jab, heavy, block, K.O. | −6 dBFS | −6 |
| Calm, tense, finish | −18 dBFS | −18 |
| Music gain on a jab | 0.35 | 0.35 |
| Music gain 0.5 s later | 1 | 1 |
| Crowd gain at cheer 0 / 1 | swell of at least 2× | 0.40 / 1.19 |
| Low health, 1.5 s | tense stem | calm 0, tense 1 |
| After the K.O. | finish stem | finish 1 |
| Title card | calm stem | calm 1 |
| First pad press | unlock | pad |
| First key press | unlock | key |
| Saved mute / hits / music | round trip | 1 / 0.25 / 0.5, button reads Sound off |

Verdict: **keep**.

## Sprint 10 — UI, UX and accessibility

Goal: the HUD stays readable from a phone to a desktop, the enemy bar is not color alone, and a bout can pause. The first-run strip stays up for 12 seconds. Less motion kills the camera shake.

Probe: `node tools/ui-probe.mjs`. Contrast is against `#0a0a0b`. `goPast` is how far the start button sits below the window.

### Baseline

| Size | Start button | Names overflow |
| --- | --- | --- |
| 1280×720 | 40 px inside | no |
| 768×1024 | 192 px inside | no |
| 390×844 | 51 px inside | no |
| 844×390 | 282 px past the bottom, card scrolls | no |

Name contrast was already 14.16. The key line had a transparent background. The enemy bar was a flat red. There was no pause, no tutorial, and shake was always on.

### Change 1 — pause, pattern, short lesson, short screens

Hypothesis: a sticky start button on short screens, a striped enemy bar, and a pause state that skips the sim will cover the sprint without moving the fight rules.

| | Before | After |
| --- | --- | --- |
| Key line contrast | 7.63 on a transparent box | 14.16 on `#0a0a0b` |
| Enemy bar | flat red | yellow stripes on red |
| Player bar | flat yellow | flat yellow |
| 844×390 start button | 282 px past | 6 px inside |
| Pause for 350 ms | no pause | `G.t` frozen, panel open |
| Restart after hp 40 | — | hp back to 100 |
| Less motion | shake scale 1 | 0, then 1 when switched off |
| First-run strip | none | 15 words, 12 s |

Verdict: **keep**. `tuning/s10-pause.jpg` is the pause card over the bout. Esc and the pad Start button both pause. The strip does not come back after Got it, or after the 12 seconds.

## Sprint 9 — Story and structure

Goal: tighten the campaign into six named bouts with a between-fight hub (rule board), a loading-dock sabotage beat, bilingual copy from one string table (≤55 words per card), and outfit/arena unlocks that persist through throwing `localStorage`.

Backlog: (1) baseline card word counts and balance for bouts 1–3, (2) `STR` table + EN/IT toggle, (3) rename and tighten bouts 1–3 plus add 4–6 through `scaleCfg`, (4) hub + dock mission flow, (5) progression save + safe storage reads/writes, (6) re-measure words, save round-trip, draw calls, and balance.

Probe: headless Chrome `/usr/local/bin/google-chrome`, `node tools/balance-run.mjs` (via `tools/.tmp-br.mjs` with Linux Chrome path), card words via `window.__sublevel.storyMetrics()`, save via `window.__sublevel.saveProbe()`.

### Baseline (master, before edits)

| Metric | Value |
| --- | --- |
| Balance seed 1, normal, n=200 — Reyes win / median s | 90.5% / 32.3 |
| Dag win / median s | 67.5% / 34.0 |
| Pike win / median s | 44.0% / 43.9 |
| Bout count | 3 |
| Longest card body (EN, inline strings) | 41 words (title) |
| EN/IT shared keys | no (inline English only) |
| Progress save round-trip | none |
| Hub between fights | none |
| Fight draw calls (S1 merge baseline, headless) | ~145–157 |
| Active meshes (fight) | ~119–131 |

### Change 1 — bilingual `STR` table

Hypothesis: one keyed table for EN and IT keeps card copy aligned and under 55 words.

| Metric | Before | After |
| --- | --- | --- |
| Card strings | inline English | 92 keys × 2 langs |
| Max card words EN | 41 | 31 |
| Max card words IT | — | 27 |
| Over 55 words | — | 0 |
| Lang toggle | none | `sublevel-lang`, title card refresh |

Verdict: **keep**. `window.__sublevel.storyMetrics()` and `setLang('it')` render `Livello Tre` from the same keys as English.

### Change 2 — six-bout campaign (combat rows 1–3 unchanged)

Hypothesis: add Voss, Chen, and Halvorsen with their own `BOUTS` rows through `scaleCfg` without touching Reyes/Dag/Pike numbers.

| Metric | Before | After |
| --- | --- | --- |
| Bout count | 3 | 6 |
| Reyes win / median (200, seed 1, normal) | 90.5% / 32.3 s | 90.5% / 32.3 s |
| Dag win / median | 67.5% / 34.0 s | 67.5% / 34.0 s |
| Pike win / median | 44.0% / 43.9 s | 44.0% / 43.9 s |
| Renamed places | Cellar / Loading Dock / Floor Plan | Sump / Dock Four / Blind Map |

Verdict: **keep**. New foes reuse teach / punish / echo styles only.

### Change 3 — hub rule board between wins

Hypothesis: a break-room card with yard rules reduces rushing straight into the next intro.

| Metric | Before | After |
| --- | --- | --- |
| After win flow | next intro or final | win card → hub → intro |
| Rule text on hub | — | three yard rules (EN/IT) |
| Reach bout 4 from hub | — | `hubProbe()` → `Bacheca regole` |

Verdict: **keep**. Demo: `tuning/s9-hub.jpg`.

### Change 4 — loading-dock sabotage beat

Hypothesis: a short post–Dock Four card sells the sabotage thread without a new game mode.

| Metric | Before | After |
| --- | --- | --- |
| After bout 2 win | straight to next bout | dock mission → hub |
| `progress.dock` flag | — | persisted in save |
| Card words | — | ≤31 EN |

Verdict: **keep**. Skips on replay when `dock` already set.

### Change 5 — outfit / arena unlocks + safe save

Hypothesis: `sublevel-progress` JSON round-trips unlocks; try/catch on read/write survives throwing storage.

| Metric | Before | After |
| --- | --- | --- |
| Save key | none | `sublevel-progress` |
| Round-trip unlock | — | `saveProbe()` pass |
| Throw on `setItem` | — | `saveProbe({throwWrites:true})` survived |
| Outfit apply | auditor only | cap / stripe / tie via `OUTFITS` |
| Arena apply | fixed lighting | sodium / cold key / exposure steps |

Verdict: **keep**. Audio, binds, rumble, motion, tut, diff, lang already wrapped.

### Checked after sprint

| Metric | Value |
| --- | --- |
| Fight draw calls (headless, 1920×1080) | 149 |
| Active meshes (fight) | 127 |
| Portrait 390×844 | touch on, 487×1055 render |
| Budget | draw <400, meshes <250 |

Retro: **moved** — shared `STR` keys made EN/IT verification one probe; hub+dock reused `showCard` without new UI chrome. **Did not move** — balance on bouts 1–3 (no combat edits); draw calls rose ~4 vs prior headless sample from three new procedural foes, still under budget. **Next sprint (S11, not started)** — photo/GLB avatar paths per CONTINUE.md.

Questions: (1) Should dock mission grant a gameplay perk beyond narrative, or stay story-only? (2) Should IT use formal *lei* or informal *tu* on cards (currently *tu*)? (3) After campaign clear, should hub allow picking any bout, or stay linear replay from bout 1?

## Sprint 12 — Release and QA

Goal: ship an automated regression suite, documented device matrix, Lighthouse and axe accessibility scores, an offline zip script, and a CHANGELOG, without retuning combat.

Backlog: (1) baseline QA gaps and bout 4–6 balance, (2) shared Chrome probe path, (3) headless regression (`file://` + hub/dock), (4) Lighthouse + axe with cheap fixes, (5) offline zip script + CHANGELOG, (6) re-run full regression and record pass/fail.

Probe: `node tools/regression.mjs`, `node tools/lighthouse-a11y.mjs`, `node tools/offline-zip.mjs`, `node tools/balance-run.mjs 200 normal 1 0-5`.

### Baseline (master after S9, before S12 edits)

| Metric | Value |
| --- | --- |
| Automated regression script | none |
| `CHANGELOG.md` | none |
| Offline zip script | none |
| Lighthouse / axe recorded | none |
| Device matrix doc | none |
| Balance bouts 1–3 (200, seed 1, normal) | Reyes 90.5% / 32.3 s, Dag 67.5% / 34.0 s, Pike 44.0% / 43.9 s |
| Balance bouts 4–6 | not logged |
| `npm run` QA scripts | `build:engine`, `measure` only |

### Change 1 — `tools/chrome.mjs` + bout list in balance-run

Hypothesis: probes run on Linux CI without editing Mac-only Chrome paths.

| Metric | Before | After |
| --- | --- | --- |
| Chrome path | hard-coded macOS | `CHROME` env + Linux fallbacks |
| Balance bout selection | `[0,1,2]` only | argv `0-5` / `all` |

Verdict: **keep**.

### Change 2 — measure balance bouts 4–6 (no retune)

| Voss / Chen / Halvorsen win (200, seed 1, normal) | not logged | 95.0% / 75.0% / 2.0% |
| Reyes / Dag / Pike | 90.5 / 67.5 / 44.0% | unchanged |

Verdict: **keep** (document only).

### Change 3 — `qaEndBout` / `qaClickGo` hooks

Hypothesis: headless tests can drive win/lose and card flow without synthetic KO physics.

Verdict: **keep**.

### Change 4–5 — regression + CDP session

Hypothesis: one `node tools/regression.mjs` guards title, six bouts, hub, dock, input modes, GLB, budgets, and `file://`.

| Metric | Before | After |
| --- | --- | --- |
| Automated regression | none | 20/20 pass |
| Offline `file://` bout | untested | pass |

Verdict: **keep**. Demo: `tuning/s12-regression.jpg`.

### Change 6–7 — WCAG fixes on title card

| axe violations (title card) | 3 | 0 |
| Fixes | — | `lang="en"`, `role="main"`, stamp contrast |

Verdict: **keep**.

### Change 8–11 — release artifacts

| Artifact | After |
| --- | --- |
| `docs/DEVICE-MATRIX.md` | documented viewports |
| `tools/offline-zip.mjs` | `dist/sublevel-three-offline.zip` (gitignored) |
| `CHANGELOG.md` | S1–S10, S9, S12; S11 skipped |
| `npm run regression` / `balance` / `offline-zip` / `qa:a11y` | added |

Lighthouse: full run hit `ETIMEDOUT` on this VM (>180 s); axe (WCAG2 AA tags) reports **0 violations** after Changes 6–7. Re-run Lighthouse on a host machine for performance scores.

Retro: **moved** — regression caught touch UI needing CDP touch emulation + reload; axe via CDN avoided ChromeDriver skew. **Did not move** — Lighthouse performance on headless VM (timeout); Halvorsen 2% win is logged, not retuned. **Next (out of scope)** — S11 avatar pipeline skipped.

Questions: (1) Should Halvorsen be tuned before a public “1.0” tag? (2) Should `npm run regression` gate GitHub Actions on every push? (3) Ship the offline zip on GitHub Releases?

## Sprint 13 — Curve, fullscreen, audio

Goal: continue a monotonic normal-difficulty win curve through bouts 4–6, request mobile fullscreen on the first bout-start gesture, and make fight audio less repetitive without touching combat RNG or bouts 1–3.

Backlog: (1) baseline balance 4–6 and audio proxy, (2) tune Voss, (3) tune Chen, (4) tune Halvorsen and verify 1–3 unchanged, (5) auto fullscreen + persisted opt-out, (6) CC0 audio variants + regression 22/22.

Probe: `node tools/balance-run.mjs 200 normal 1 normal 0-5`, `window.__sublevel.audioMetrics()`, `node tools/regression.mjs`.

**Branch note:** PR targets `master`; built from `cursor/s12-release-qa-bd45` until S12 PR #2 merges.

### Baseline (S12 branch, before S13 edits)

| Metric | Value |
| --- | --- |
| Balance bouts 1–3 (200, seed 1, normal) | Reyes 90.5% / Dag 67.5% / Pike 44.0% |
| Balance bouts 4–6 | Voss 95.0% / Chen 75.0% / Halvorsen 2.0% |
| `audio/samples.js` bytes | 453,278 |
| Distinct clips (`SUBLEVEL_AUDIO.clips`) | 11 |
| Hit sample pool | 1 jab / 1 heavy / 1 block (no rotation) |
| Regression | 20/20 (S12) |

**Proposed bout 4–6 targets (monotonic after Pike 44%):** Voss ~38%, Chen ~30%, Halvorsen ~22–24%. Example 55/38/25 was rejected (55% > Pike). Halvorsen echo style is steep; aim just below Chen.

### Change 1 — Voss `BOUTS[3]` row

Hypothesis: higher teach-style guard, react, and HP pull 95% player win toward ~38% without `scaleCfg` or combat-path `rng()` changes.

| Metric | Before | After |
| --- | --- | --- |
| Voss win (200, seed 1, normal) | 95.0% | 36.0% |
| Reyes / Dag / Pike | 90.5 / 67.5 / 44.0% | unchanged |

Verdict: **keep**.

### Change 2 — Chen `BOUTS[4]` row

Hypothesis: punish weights between Dag and finale bring 75% down near 30% while staying above Halvorsen.

| Chen win | 75.0% | 30.0% |
| Reyes / Dag / Pike / Voss | — | 90.5 / 67.5 / 44.0 / 36.0% (Voss from Change 1) |

Verdict: **keep**.

### Change 3 — Halvorsen `BOUTS[5]` row

Hypothesis: echo stats near Pike but tuned for ~22% complete a decreasing curve (90.5 → 67.5 → 44 → 36 → 30 → 22).

| Halvorsen win | 2.0% | 22.0% |
| Full curve | not monotonic | monotonic ✓ |

Verdict: **keep**. Log: `tuning/s13-balance-full.json`.

### Change 4 — Mobile auto fullscreen

Hypothesis: on coarse pointer / narrow viewport, first intro-card “start bout” calls `requestFullscreen` (with webkit fallback) and best-effort `screen.orientation.lock('landscape')`; opt-out via `sublevel-fs=0`; iOS no-op without throw; PWA-capable meta only.

| Metric | Before | After |
| --- | --- | --- |
| Fullscreen on first bout start | none | `maybeAutoFullscreen()` on intro → `startBout` |
| Opt-out | — | title card checkbox, persisted |
| Desktop / `file://` / Esc pause | pass | pass (regression) |

Verdict: **keep**.

### Change 5 — Audio variation (CC0)

Hypothesis: extra generated stems and hit pools (playback-rate rotation, no combat `rng()`) raise distinct clip count and shorten effective jab repeat interval while keeping S8 peaks and ducking.

| Metric | Before | After |
| --- | --- | --- |
| `samples.js` bytes | 453,278 | 832,806 (+379,528) |
| Clip count | 11 | 19 |
| Jab pool / min repeat proxy | 1 / every hit | 3 / ~every 3rd jab |
| Music | calm/tense/finish only | +calm2/tense2, hub/dock card beds, bout playbackRate, cheer→crowd rate |

Verdict: **keep**. Regenerate: `node tools/make-audio.mjs`.

### Change 6 — Regression + QA cleanup

| Metric | Before | After |
| --- | --- | --- |
| Automated regression | 20/20 | 22/22 (+`audio_variants`, +`fullscreen_opt_out_reload`) |
| Chrome tmp teardown | occasional `ENOTEMPTY` | `rmSync` retries |

Verdict: **keep**. Demo: `tuning/s13-regression.jpg`.

Retro: **moved** — Halvorsen echo win% is very sensitive to HP; small steps + full 0–5 runs avoided breaking monotonicity. **Did not move** — real-device fullscreen/listening tests (hand-check). **Next (out of scope)** — S11 skipped.

Questions: (1) Lock landscape only after fullscreen succeeds on Android? (2) Add a hub-only music mute separate from fight stems? (3) Tighten Halvorsen toward 18% if finale should feel harsher than 22%?

## Sprint 14 — Camera and frame rate

Goal: fighters at about a third of the screen height at close range (they were 24% on a desktop and 9% on a phone in portrait), both always in frame through a chase and a knockback, and the same bout on a 30, 60 or 144 Hz screen.

Probes: `node tools/cam-probe.mjs [tag] [--close] [--norim] [--only sizes] [--cam key=value]`, `node tools/step-probe.mjs`, `node tools/combat-probe.mjs`, `node tools/balance-run.mjs 200 normal 1 normal 0,1,2 [hz]`. Share is the fighter's bounding-box height over the viewport height at gap 2.0 m, after 90 frames for the camera to settle. Clipped means a body (0.6 m either side of its centre) outside the central 84% of the width, a head above 10% of the height, or a foot below 99%. Off screen means outside 2% to 98% of the width. The chase and circle runs move both fighters at 4.4 m/s, the player's top speed. Knockback sets 18 m/s on one fighter, the heavy-hit value. The first probe run counted 1.2 m of arm either side as body; arms point along the fight axis, which the camera sees side on, so the definition went to 0.6 m and the baseline was run again on the old camera with it.

### Baseline

| | 1920×1080 | 844×390 | 390×844 |
| --- | --- | --- | --- |
| Fighter height at gap 2.0 m | 24.0% | 24.4% | 9.3% |
| Camera to the midpoint at gap 2, 1, 6 | 8.56, 8.05, 10.74 m | same | same |
| Gaps 1–6 m, chase, circle, knockback clipped | none | none | none |
| Nearest crowd or pillar, 16 tangent / 8 radial rim placements | 0.97 / 0.36 m | not run | 0.97 / 0.36 m |

| | |
| --- | --- |
| Draws / active meshes / GPU | 149 / 119 / 1.217 ms |
| Comic word width, jab / heavy / block / K.O., share of screen width | 15.8 / 17.6 / 17.3 / 33.0% |
| Word readable, jab / heavy / block / guard break | 51 / 32 / 51 / 33 ms |
| Bout table, 200 fights, seed 1, 60 Hz step | 90.5% 32.3 s / 67.5% 34.0 s / 44.0% 43.9 s |

The same 200 seeded fights at other step rates, the way a 30 fps phone or a 120 or 144 Hz screen steps the game:

| Step | Reyes | Dag | Pike |
| --- | --- | --- | --- |
| 30 Hz | 100% 16.3 s | 88% 31.0 s | 100% 29.2 s |
| 60 Hz | 90.5% 32.3 s | 67.5% 34.0 s | 44.0% 43.9 s |
| 120 Hz | 91% 32.3 s | 55.5% 34.1 s | 43% 43.6 s |
| 144 Hz | 92.5% 30.6 s | 62.5% 34.0 s | 35.5% 44.2 s |

Reyes answers in 0.08 s, and a jab goes live at 0.10 s. Whether the answer lands in time is a one-frame call at 60 Hz. The table everything else was tuned against only held on a 60 Hz screen, and the quality ladder starts at 44 fps, so a phone under load played a much easier game.

### Change 1 — camera sized from the frame

Hypothesis: a camera distance worked out from the field of view, so a fighter fills a set share of the height and both fit with room beside them, gets the fighters to a third of the screen without clipping, in every aspect.

| | Old | New |
| --- | --- | --- |
| Distance | horizontal 6.6 + 0.5·gap, height min(7.2, 4.6 + 0.22·gap) | max(size term, fit term) at pitch 0.47 rad, `CAM` table at the top of the script |
| Size term | — | fighter height 1.9 m ÷ (2 · tan(half fov) · 0.34), portrait 0.20 |
| Fit term | — | (gap + 2 · pad) ÷ (2 · tan(half horizontal fov)), pad 1.7 m, portrait 1.5 m |
| Aim | midpoint | midpoint plus 0.25 s of walking speed |
| Follow, per second | 3.2 | 3.2, portrait 8 |

| | 1920×1080 | 844×390 | 390×844 |
| --- | --- | --- | --- |
| Fighter height at gap 2.0 m | 24.0% → 34.1% | 24.4% → 34.3% | 9.3% → 17.7% |
| Camera to the midpoint at gap 2 | 8.56 → 6.17 m | 8.56 → 6.17 m | 8.56 → 4.58 m |
| Gaps 1–6 m clipped | none | none | none |
| Chase, circle clipped / off screen | 0 / 0 | 0 / 0 | 0 / 0 |
| Knockback clipped / off screen | 0 / 0 | 0 / 0 | 13–14 of 72 frames / 0 |
| Nearest crowd or pillar, tangent / radial | 0.97 / 0.36 → 1.64 / 2.28 m | not run | 0.97 / 0.36 → 1.31–1.67 / 1.73–2.04 m (four runs) |
| Something between camera and fighters | 0 | not run | 0 of 24 |

On a desktop the size term rules until the fighters are 6.5 m apart, so the camera holds at 6.17 m and does not breathe with the gap. In portrait the width rules: the visible width at 4.58 m is 5.0 m, which is the gap plus the padding, so a phone cannot go closer than about 18% without losing a fighter. The target in the plan was 20%.

Without the lead, the 4.4 m/s circle clipped 21 of 192 frames on a desktop: the pair runs toward the camera faster than the follow catches up, and the feet leave the bottom of the frame by 10%. A quarter second of lead brought that to 0.

Portrait settings tried (share, chase and circle clipped, knockback clipped / off screen):

| Follow / padding | Share | Chase, circle | Knockback |
| --- | --- | --- | --- |
| 3.2 / 1.35 | 18.7% | 86, 134 | 42 / 22 |
| 6 / 1.35 | 18.7% | 0, 0 | 25 / 9 |
| 8 / 1.5 (kept) | 17.7% | 0, 0 | 14 / 0 |
| 8 / 1.8 | 15.5% | 0, 0 | 0 / 0 |
| 6 / 2.2 | 13.7% | 0, 0 | 0 / 0 |

Verdict: **keep**. `tuning/s14-before-1920.jpg`, `tuning/s14-after-1920.jpg` (and the `-close` pair at gap 1.2), `-844` and `-390` are the frames. At gap 1.2 no rig seam shows. The dust motes near the lens were bigger from the old camera (36 px against about 12 px).

### Change 2 — comic words and shake follow the camera distance

Hypothesis: a word is a world-sized plane, so at 0.7 of the distance it would cover 1.4 times as much of the screen; scaling it by distance holds the screen share. Shake moves the camera by up to 0.12 m around a fixed aim, so its angle grows as the camera comes in; scaling the amplitude by distance holds the angle.

| | Before | After |
| --- | --- | --- |
| Word width, jab / heavy / block / K.O. | 15.8 / 17.6 / 17.3 / 33.0% | 15.9 / 15.9 / 16.0 / 29.6% |
| Word readable | 51 / 32 / 51 / 33 ms | 33–50 ms, varies by run |
| Damage, stamina, stun, hitstop, counter | 7 / 16, 10 / 24, 0.30 / 0.55 s, 0.05 / 0.09 / 0.14 s, 8.75 | same |
| Shake angle at full | ±0.80° | ±0.80°, by construction |

Verdict: **keep**. The readable time is sampled once a frame (16.7 ms), so 32 and 50 are one frame apart. The word scale is `clamp(distance to the word ÷ 7.56, 0.35, 1)`. `combat-probe` divides it back out so "readable" still means a scale of 0.45.

### Change 3 — a fixed 1/60 s step, drawn interpolated, frame times snapped

Hypothesis: running the fight in 1/60 s ticks, the loop `simMeet` already uses, makes every refresh rate play the table that was measured. The two fighters are drawn between their last two tick positions so a 120 or 144 Hz screen does not judder. Frame times within 8% of a multiple of 1/60 s are snapped to it so a 60 Hz screen runs one tick per frame.

Seeded rng, bout 1, a player who stands still, 900 ticks (15 s) recorded per tick at five frame lengths. `engine.getDeltaTime` is overridden; `G.trace` and `G.seed` are probe hooks.

| Frame rate | Frames for 900 ticks | State vs 60 fps | Drawn frames where the walking enemy did not move |
| --- | --- | --- | --- |
| 20 fps | 300 | identical, 900 ticks | 0 of 190 |
| 30 fps | 450 | identical | 0 of 278 |
| 60 fps | 900 | — | 0 of 577 |
| 120 fps | 1800 | identical | 0 of 1153 |
| 144 fps | 2158 | identical | 0 of 1381 |

The player took hits in that run (hp 100 → 72.8), so the comparison covers the AI rng, strikes and stun, not an empty room. The camera shake used the gameplay `rng` three times per drawn frame; with a seed that made the AI depend on the frame count. It now uses `Math.random`, and `frame()` no longer touches `rng`.

| | Before | After |
| --- | --- | --- |
| Bout table, 200 fights, seed 1, 60 Hz | 90.5 / 67.5 / 44.0% | 90.5 / 67.5 / 44.0% |
| Medians | 32.3 / 34.0 / 43.9 s | 32.3 / 34.0 / 43.9 s |
| Fight draws / active meshes / GPU | 149 / 119 / 1.217 ms | 147–149 / 115–118 / 1.25–1.34 ms (three runs) |
| S6 pose numbers (`pose-probe`), S5 AI answers (`ai-probe`) | — | unchanged |
| Touch jab to attack / to pose | 17 / 17 ms | 16–17 / 33–34 ms |
| Pad jab to attack / to pose | 17–18 / 18–34 ms | 16–17 / 33–34 ms |
| Keyboard heavy to attack | 17 ms | 17 ms |

Frame times in headless Chrome at a 60 Hz present: mean 16.67 ms, standard deviation 0.38 ms, range 15.1–18.2 ms. A plain accumulator on those gave 67 frames with no tick and 66 with two out of 600 (an earlier run happened to give 600 single ticks, so I first wrote that it did not matter). With the snap, 598–600 of 600 frames fall inside the window and three runs gave 600 of 600 single ticks. 144 Hz frames (6.94 ms) fall outside the window and keep their own length. This is headless timing; a real display's was not measured.

`input-probe` reads the pose of a touch or pad jab at 33–34 ms where it read 16–18 ms, a frame later than the state. A trace from a settled guard shows the right shoulder 0.054 rad along on the first frame after the press, and the keyboard heavy reads 16–17 ms for state and pose. The probe takes its starting arm angle right after the state returns to idle, while the arm is still settling from the last swing, so the 0.02 rad threshold crosses a frame earlier or later with the tick phase. That is the likely cause, not a proven one. Both readings are inside the 80 ms budget.

Verdict: **keep**.

### Checked, no code change

Outline. `part()` is the only function that sets `renderOutline`, and nothing calls it; the fighters are built with `pp()` and have no outline. The thickening I expected from a closer camera does not exist. Left the dead function alone.

Rim. In portrait the nearest pillar at one heading is 1.31–1.67 m from the camera over four runs, around the 1.5 m I set; the old camera was 0.36 m from one. Nothing sat between the camera and the fighters in 24 placements. No pull toward the centre was added.

First key press. `input-probe` measured 117–134 ms for the first keyboard press on the old build and 118–208 ms on the new one. It is the first `keydown` calling `audioInit`, which decodes the audio pack in the handler. In play that press is Start or Enter on the title card. Later key presses are 17 ms. No change.

Hand check still open: 55 fps at 1080p on an iGPU, a real pad and phone, and how the closer view feels on a real monitor. The headless runs measure draws, GPU time and pixels, not feel.





