You are continuing Sublevel Three, a single-file browser fighting game. Do one sprint, then stop. Do not start the sprint after it.

Repo: https://github.com/carlok/red-ink
Play: https://carlok.github.io/red-ink/
Local: open `index.html`. No build step to play. `npm install && npm run build:engine` regenerates `lib/babylon.js` only.

The game code is Apache-2.0 (`LICENSE`, `NOTICE`). Babylon.js 9.30 is Apache-2.0 (`lib/babylon.Apache-2.0.txt`). Sounds in `audio/samples.js` are CC0 (`audio/CC0.txt`). Do not relicense. Do not replace `carlok.github.io`. Pages deploys from `.github/workflows/pages.yml` on `master` to the project URL above.

## How a sprint works

1. Goal: one sentence, and 3 to 6 backlog items, each with a number.
2. Baseline: measure and write it down before editing.
3. Build: smallest change first. Measure again after each change.
4. Demo: a screenshot or short GIF, plus the numbers.
5. Retro: what moved the metric, what did not, the next sprint's proposed goal. At most 3 questions, and only if the answer changes the next sprint. Then stop.

Every change needs a hypothesis, a metric, a baseline, and a result. Append it to `TUNING_LOG.md`. One change per commit. Put the log line in the commit message. Do not commit unless the work is the sprint itself.

Never regress: keyboard, standard-mapping gamepad, touch, phone portrait, GLB drop, offline play (open `index.html` with no server). Free software only. No telemetry, no accounts.

Test in headless Chrome against `window.__sublevel`. On this Mac the binary is `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Use `--headless=new` and a fresh user-data dir. Do not pass width and height to `Target.createTarget`. Attach to the existing page, then `Emulation.setDeviceMetricsOverride`. Fixed seeds for any balance run. `node tools/balance-run.mjs [n] [skill] [seed] [diff] [bouts] [hz]` calls `simMeet` (bouts default to 0,1,2; 60 Hz unless told otherwise). Headless frames are vsync-capped at 16.7 ms, so judge speed by draw calls, mesh count, and GPU time, and ask for a confirm on a real iGPU. Draw calls are the per-frame delta of `engine._drawCalls`, not `.current`.

Budgets that still hold: under 400 draw calls, under 250 active meshes, input to the attack state under 80 ms. The 55 fps budget at 1080p on an iGPU was never proven on hardware. Last measured fight (S14) was about 147 draws and 115 active meshes. GPU time on this machine was about 1.2 to 1.4 ms.

`window.__sublevel` exposes `G`, `CAM`, `SKIN`, `skinOn`, `skinFighter`, `randomLook`, `seed`, `startBout`, `P`, `E`, `useAvatar`, `simMeet`, `probeAI`, `poseProbe`, `poseStill`, `audioReady`, `audioState`, `audioTick`, `setAudio`, `notePad`, `setUnlock`, `hit`, `shakeMul`, `setLessMotion`, `pauseFight`, `resumeFight`, `restartBout`, `tutorInfo`.

Probes already in `tools/`: `balance-run.mjs`, `combat-probe.mjs`, `input-probe.mjs`, `portrait.mjs`, `ai-probe.mjs`, `pose-probe.mjs`, `look-probe.mjs`, `audio-probe.mjs`, `ui-probe.mjs`, `cam-probe.mjs`, `step-probe.mjs`, `skin-probe.mjs`, `skin-gallery.mjs`, `skin-random.mjs`, `look-contrast-probe.mjs`. `G.ticks` counts sim ticks and `G.trace(k)` is called after each one when set. Chrome user-data dirs match `.tmp-chrome-*` and are gitignored.

## Already done

Do not redo these. Read `TUNING_LOG.md` before changing a number.

- S1. Tree-shaken Babylon, gzip about 710 KB. Static meshes merged. Viewport `width=device-width`. Quality ladder: 44 fps, 1.8 s window, steps are scale 1.35, poisson off, scale 1.8, shadows and vignette off, scale 2 and tone map off. Shadow blur (kernel 16) costs about 0.18 ms here and is turned off at step 2 with poisson.
- S2. Buffer 0.22 s. Dodge cooldown 0.55 s, i-frames 0.22 s, cost 16. Stick dead zone 0.2 radial. Triggers block at 0.5. Turn damp 5 while attacking, 14 otherwise. Remappable fight keys (`sublevel-binds`). Rumble slider (`sublevel-rumble`). Jab is the bottom-right touch button.
- S3. Jab 0.40 s / 7 dmg / 10 stam. Heavy 0.82 s / 16 dmg / 24 stam. Hitstop 0.05 / 0.09 / 0.14 s. Comic words use real time, not hitstop time. Block chip 10%, stam drain 0.95 times damage, guard-break stun 0.7 s. Counter 1.25 times damage.
- S4. Seeded median bot. 200 fights, seed 1, normal difficulty, after S5 and S6 still landed at Reyes 90.5% / 32.3 s, Dag 67.5% / 34.0 s, Pike 44.0% / 43.9 s. Empty stamina 0. Stalemates 0. Easy and Hard are multipliers on that table (`DIFF` in `index.html`), not new code paths. Normal is all 1s. Do not burn an extra `rng()` call on the combat path or those seeds move.
- S5. Reyes teaches (jab mark 0.28 s, 20% feint). Dag punishes a whiff with a heavy after his react time (0.38 s). Pike replays the last three attacks and resets the queue when the sequence changes. Nobody acts faster than `cfg.react`. Pike cooldown is 1.05 s.
- S6. Breath period 2.85 s. Idle hip shift 0.44 rad. Walk arms oppose the hips. Hit side comes from the punch direction. Three knockdowns: back, crumple, side. Tie, hair or cap, and shirt hem lag the body. Bruise 0.56 after four jabs. Damp stays 24.
- S7. Key light is cold fluorescent `(0.62, 0.78, 1)`. Bulbs are sodium. Crowd figures are merged boxes (shoulders, arms, legs) plus a head, 34 of each, and they yaw. Exposure 1.35, contrast 1.22. `ColorCurves` is not in the bundle. Do not add `DefaultRenderingPipeline` without rebuilding the engine and measuring GPU time. An effect over 1 ms needs a quality-ladder switch.
- S8. Hits peak at -6 dBFS, music stems at -18 dBFS, music gain ducks to 0.35 for 0.4 s. Room tone and crowd swell follow `G.cheer`. Samples are generated by `tools/make-audio.mjs` into `audio/samples.js`. A key or a pad press calls `audioInit`. Hits, Music, and mute persist (`sublevel-sfx`, `sublevel-music`, `sublevel-mute`).
- S10. Esc or pad Start pauses. `G.state === 'pause'` skips the sim. Restart bout restores hp. Enemy bar is yellow stripes on red. Less motion (`sublevel-motion`) sets shake to 0. First-run strip is 15 words and 12 s (`sublevel-tut`). At 844 by 390 the start button is on screen. Name and key contrast against `#0a0a0b` is 14.16.
- S14. Camera is sized from the frame (`CAM` at the top of the script): a fighter is 34% of the height at close range on a desktop, 18% on a phone in portrait, and both stay on screen in a chase and a knockback. Comic words and shake scale with the camera distance. The fight steps at a fixed 1/60 s (`simTick`) and fighters are drawn interpolated (frame times within 8% of a multiple of 1/60 s are snapped), so every refresh rate plays the 60 Hz table; `tools/step-probe.mjs` shows identical state over 900 ticks at 20 to 144 fps. `frame()` must not touch the gameplay `rng`: the shake uses `Math.random`. `part()` is dead code (no outlines on fighters).
- S15. Fighters are skinned CC0 people by default (`SKIN` in `index.html`; `?skin=0` opts out, `?skinseed=N` pins the looks). The model is embedded as `assets/quaternius-human/animated-human.js` (`node tools/embed-glb.mjs`) so `file://` works; if it cannot load, the procedural fighters stay. Clips are scrubbed by sim time and crossfaded; Guard, HitA, HitB, HitHeavy and TellJab come from `tools/blender/author-clips.py`. Opponents get `randomLook(seed, base)` with a CIE Lab contrast floor between skin, hair, shirt, pants and shoes. The look's scale is visual only: `f.sx` must stay the foe's own or `resolveBodies` moves the balance table. The tag `before-skinned-fighters` is the last procedural-only commit.
- S16. `skinShade` bakes per-vertex colours (gradient by up-facing normal and height inside each palette region, warmer skin where it falls off; `SKIN.shade=false` turns it off). `skinLooks(i)` draws the opponents of bouts 0..i, each clear of the Auditor and of the ones before it per slot (`LOOK_UNIQUE`); `tools/look-contrast-probe.mjs` checks 2000 sessions.
- S17. Each bout has its own place: `ENV` (table above `paintFloor`) sets floor pattern and colour, fixture colours, light, fog, dust, the two side signs and a prop set, and `applyEnv(i)` applies it from `startBout`. The floor is repainted into one texture (about 30-45 ms, own `mulberry32` stream, never the gameplay rng). The unlocked arena grades (`applyArena`) now multiply the place's own light instead of replacing it. `tools/env-probe.mjs` screenshots every bout and reports draws and GPU.
- S20. Input: `keyName` (keycap label, else the physical key), `INPUT.buf` (0.22 s, measured: longer did not help), `capLight` lights the key hint, `denyCue` for a press without the stamina, focus loss and a hidden tab pause the fight. Sound: `MIX` table, `audioTick` (bed low and drifting, music at moments, silence on pause, `ambGain` bus), hidden tab suspends the context. Menus: `quitToTitle`, `creditsCard`, `clockOut`, `cardEsc`, touch `#menuBtn`; pause labels follow the language. Probes: `tools/key-probe.mjs` (`--buf`, `--pace`), `tools/audio-bed-probe.mjs`.
- S18. Camera: `CAM.pitch/frac/yaw/follow` (portrait keeps `pitchPortrait`, `yawPortrait` 0), `camKick` springs and roll, KO slow-motion (`G.koSlow`) and push-in, ready `reveal`; `tools/cam-sweep.mjs` sweeps the angles. Skin: `skinMarks` (face flush and bruise from `f.marks`), creases from bone weights, hit flash (`f.flash`), Fresnel rim (`skinRim`, needs `FresnelParameters` in `tools/engine-entry.js`), outline, hand wraps, `SKIN.walkK`; `skinLite()` drops outline and rim at quality step 2. `tools/foot-probe.mjs` measures foot skating. skinShade reads palette rows as `floor(v*32)`.

S9 and S12 are logged in TUNING_LOG.md. S11 was not done: the avatar path is now the skinned fighter, see S15.

## Sprint 9, do this one

Story and structure.

- Tighten the story cards. Rename the three bouts. Add bouts 4, 5, and 6. Between fights, a hub with a rule board. A stealth or sabotage mission on the loading dock.
- Italian and English strings from one table. Every card under 55 words.
- Progression: an outfit or an arena unlocks after each win. The save must survive `localStorage` throwing. Wrap every read and write in try/catch, the way the binds and the audio sliders already do.

Numeric targets to set before you edit, then measure: word count of every card (max 55), both languages rendered from the same keys, a save key that round-trips an unlock, and the new bouts still reachable from the hub without breaking bout 1 to 3. Keep the combat table. New opponents need their own `BOUTS` row and should go through `scaleCfg`. Re-run `node tools/balance-run.mjs 200 normal 1` if you touch damage, health, react, or `rng()` on the hit path, and put the win rates in the log. The old targets were 85 / 65 / 45 for Reyes / Dag / Pike. Later sprints moved the played table to about 90.5 / 67.5 / 44. Do not silently retune that while writing story.

## After sprint 9

Sprint 11, avatar from a photo. Do not start it in the same turn.

- Load three different free-service GLBs (an RPM-style export, a VRoid export, a Mixamo character). Fix scale, facing, materials, and bounds. Draco GLBs still need an external decoder. The current bundle does not include it.
- Write down the best free path from a selfie to a GLB. Fallback: the procedural head, with the photo as a face texture.

Sprint 12, release and QA. `LICENSE`, `NOTICE`, and `README.md` already exist. Do not rewrite the license.

- Automated regression: title, three bouts, win, lose, restart, pad, touch, avatar. Device matrix. Lighthouse and an accessibility check.
- An offline zip. A changelog.

## Hand check the human still has to do

55 fps at 1080p on their machine was never measured. A real pad and a real phone were not retested after every sprint. The hit samples are generated, not recorded punches.
