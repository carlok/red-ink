# Changelog

All notable releases of **Sublevel Three** (red-ink). Combat tuning details live in `TUNING_LOG.md`. **Sprint 11 (photo avatar) was skipped** by project decision.

## Sprint 13 — Curve, fullscreen, audio (2026-11-01)

- Monotonic bout 4–6 tuning (200 fights, seed 1, normal): Voss 36%, Chen 30%, Halvorsen 22%; bouts 1–3 unchanged.
- Mobile auto fullscreen on first bout-start gesture; `sublevel-fs` opt-out; standalone-capable meta tags.
- Audio: 19 CC0 clips (hit pools, dual fight stems, hub/dock beds); `audioMetrics()`; `samples.js` +380 KB.
- Regression 22/22 including audio variants and fullscreen pref reload (`file://`).

## Sprint 12 — Release and QA (2026-11-01)

- Headless regression suite: `node tools/regression.mjs` (20 checks: title, bouts 1–6, hub, dock flow, win/lose, restart, keyboard, gamepad, touch, GLB avatar, draw/mesh budget, offline `file://`).
- Device matrix: `docs/DEVICE-MATRIX.md`.
- Lighthouse + axe probe: `node tools/lighthouse-a11y.mjs` (axe via CDN injection; Lighthouse accessibility/best-practices when Chrome completes on host).
- Offline zip builder: `node tools/offline-zip.mjs` → `dist/sublevel-three-offline.zip` (not committed).
- Document structure: `lang="en"`, `charset`, `role="main"`, card stamp contrast for WCAG.
- Balance logged for bouts 4–6 (measure only): Voss 95%, Chen 75%, Halvorsen 2% (200 fights, seed 1, normal).

## Sprint 10 — Pause, restart, accessibility polish

- Esc / gamepad Start pause; restart bout restores HP.
- Less-motion toggle (`sublevel-motion`); first-run control strip (`sublevel-tut`).
- Enemy HP bar pattern; 844×390 start button visible; name/key contrast 14.16.

## Sprint 9 — Story and structure

- Six-bout campaign with renamed floors; hub rule board; loading-dock sabotage beat after Dock Four.
- English / Italian strings from one `STR` table (≤55 words per card).
- Outfit and arena unlocks via `sublevel-progress` with safe `localStorage` reads/writes.

## Sprint 8 — Audio

- Generated hits and music stems; ducking; mute and volume sliders persisted (`sublevel-sfx`, `sublevel-music`, `sublevel-mute`).

## Sprint 7 — Lighting and crowd

- Cold key / sodium bulbs; merged crowd boxes; exposure and contrast tuning.

## Sprint 6 — Animation

- Breath, walk, hit direction, knockdown variants, bruise buildup.

## Sprint 5 — AI personalities

- Reyes teaches, Dag punishes whiffs, Pike echoes last three attacks.

## Sprint 4 — Seeded balance

- Median bot benchmarks (Reyes ~90.5%, Dag ~67.5%, Pike ~44% on seed 1, normal).

## Sprint 3 — Combat numbers

- Jab / heavy timings, hitstop, block chip, counter damage.

## Sprint 2 — Input

- Buffer, dodge cooldown, dead zone, remappable keys (`sublevel-binds`), rumble slider, touch layout.

## Sprint 1 — Performance

- Tree-shaken Babylon.js bundle, merged static meshes, viewport meta, quality ladder.
