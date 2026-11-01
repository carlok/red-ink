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





