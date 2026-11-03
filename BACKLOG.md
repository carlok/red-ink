# Backlog

Ideas that were suggested or left out of a sprint and are not built. Nothing here is promised. Pick one, set numbers to measure first (see `CONTINUE.md`), then build it.

## Ranking

Every item below, best first. Score is value (1 to 5, counting risk removed) divided by effort (small 1, small-plus 1.5, medium 2, medium-large 3, large 4); ties go to the higher value, then to the lower risk to the bout table. The scores are a judgement, not a measurement. The first ten were built in Sprint 25. A third look after Sprint 25 added 19 items, a fourth look, from the play flow, added 13, and a fifth look, from two reviews (combat and feel; web robustness and tooling), added 25 more (sections at the end). Everything was ranked again each time, so numbers moved. Sprint 26 built items 11 to 20; Sprint 27 is items 21 to 30; after that, item 31 is next.

### Tier 1: Sprint 25 (all ten built; see `TUNING_LOG.md`)

| # | Item | Size | Score |
| --- | --- | --- | --- |
| 1 | CI runs the regression (`.github/workflows/test.yml`) | S | 4.0 |
| 2 | The tutor line built from the binds and the input in use | S | 4.0 |
| 3 | Offer Easy after repeated losses | S | 4.0 |
| 4 | WebGL failure message and a context-lost handler | S | 3.0 |
| 5 | A pad unplugged mid-fight pauses with a hint | S | 3.0 |
| 6 | Env-probe budgets in the regression; trace the draw-count rise | S | 3.0 |
| 7 | Toggle-to-block option | S | 3.0 |
| 8 | Finish Italian: HUD, menus, key strips, BLOK, `lang`, title, a parity test | S+ | 2.7 |
| 9 | Playtest log with export | S+ | 2.7 |
| 10 | Practice mode | M | 2.0 |

### Tier 2: Sprint 26 (all ten built; see `TUNING_LOG.md`)

| # | Item | Size | Score |
| --- | --- | --- | --- |
| 11 | `AGENTS.md`: rules for background agents | S | 4.0 |
| 12 | Save version and a `migrate()` step | S | 3.0 |
| 13 | Dependency care: Dependabot, an audit step, pinned actions | S | 3.0 |
| 14 | Share preview and tab icon (description, Open Graph, favicon, `theme-color`) | S | 3.0 |
| 15 | Restart from the pause menu starts at full health, like Retry | S | 3.0 |
| 16 | Enter does not hijack a focused card control | S | 3.0 |
| 17 | Warn when progress cannot be saved | S | 3.0 |
| 18 | Continue button on the title card for a player with wins | S+ | 2.7 |
| 19 | Movement by physical key (`e.code`), for AZERTY, Dvorak and similar layouts | S+ | 2.7 |
| 20 | A second pass with a modifier per bout after bout 6 | M | 2.0 |

### Tier 3: Sprint 27

| # | Item | Size | Score |
| --- | --- | --- | --- |
| 21 | Regression hang bounds: an `until()` helper, a per-test timeout, a job timeout, an artifact on failure | S | 3.0 |
| 22 | Held Esc and Enter ignore key repeat | S | 3.0 |
| 23 | Input state is cleared on pause and resume | S | 3.0 |
| 24 | The dodge stat counts evasions, not presses | S | 3.0 |
| 25 | Two tabs cannot erase each other's progress | S | 3.0 |
| 26 | A queued voice line is cancelled on pause, mute, hide and Quit | S | 3.0 |
| 27 | Stored values are validated on load | S+ | 2.7 |
| 28 | The regression fails on page errors | S+ | 2.7 |
| 29 | Docs match the code (README, `CONTINUE.md`, `AGENTS.md` budgets) | S+ | 2.7 |
| 30 | A crash catcher with a copyable report | S+ | 2.0 |

### Tier 4: next

| # | Item | Size | Score |
| --- | --- | --- | --- |
| 31 | Five of six foes cannot answer a jab (balance sprint: moves the bout table) | M | 2.0 |
| 32 | Training room with a dummy and live move costs | S+ | 2.0 |
| 33 | Tells you can hear, and shapes not only colour | S+ | 2.0 |
| 34 | Medals per bout from the stats already counted | S+ | 2.0 |
| 35 | Per-system CPU time budget (sim tick, AI, render prep) | S+ | 2.0 |
| 36 | Missing cues: a dodge that works, low health, the foe's stamina | S+ | 2.0 |
| 37 | Loading splash visible in the HTML, with a `noscript` line | S+ | 2.0 |
| 38 | A limiter on `master` and a longer music lookahead (measure first) | S+ | 2.0 |
| 39 | Tap targets of 44 px on touch | S+ | 2.0 |
| 40 | CI hygiene: split QA tools from the regression install, check `lib/babylon.js` against a rebuild, pin Chrome | S+ | 2.0 |
| 41 | Repo hygiene: `CHANGELOG.md` and a `probes` script | S | 2.0 |
| 42 | Mobile haptics | S | 2.0 |
| 43 | Controls reference card | S | 2.0 |
| 44 | Progress export and import | S | 2.0 |
| 45 | Voice variety (and which clip formats play everywhere) | S | 2.0 |
| 46 | Page weight budget in CI | S | 2.0 |
| 47 | Difficulty descriptions in the settings | S | 2.0 |
| 48 | Credits note on the voice | S | 2.0 |
| 49 | Pick the language on the first visit | S | 2.0 |
| 50 | Compare an exported playtest log with the bot table | S | 2.0 |
| 51 | Run the accessibility audit in CI | S | 2.0 |
| 52 | A one-page design doc and a code map | S | 2.0 |
| 53 | Pan the sound effects by fighter position | S | 2.0 |
| 54 | A small FOV punch on heavy hits and the knockout | S | 2.0 |
| 55 | Rebinding fails silently (reserved key, swapped clash) | S | 2.0 |
| 56 | Pause menu: Space and the arrows are swallowed while a card is up (guess, test first) | S | 2.0 |
| 57 | Stale state after Reset progress, Restart and Quit | S | 2.0 |
| 58 | Language switch on the splash | S | 2.0 |
| 59 | Stamina-denied feedback on touch and the pad (the keyboard has `denyCue`) | S | 2.0 |
| 60 | Skip the knockout sequence (`koTimer` is a fixed 2.4 s) | S | 2.0 |
| 61 | DevicePixelRatio after a zoom, a reduced-motion change listener, and the hit flash under reduced motion | S | 2.0 |
| 62 | Cards and the pause menu as modal dialogs | M | 1.5 |
| 63 | The quality ladder recovers | M | 1.5 |
| 64 | Photo mode | M | 1.5 |
| 65 | Time attack, best times and a per-bout stats screen | M | 1.5 |
| 66 | Regression gaps (`localStorage` throwing, rebinding, reduced motion, difficulty, blur, language) | M | 1.5 |
| 67 | Screen-reader announcements for the fight | M | 1.5 |
| 68 | Contrast and text-size options | M | 1.5 |
| 69 | Gamepad remapping | M | 1.5 |
| 70 | Gamepad dead ends: Back, Restart, Quit and a focus ring on cards and pause | M | 1.5 |
| 71 | Attract mode | M | 1.5 |
| 72 | One `localStorage` helper in place of a dozen pairs | S | 1.5 |
| 73 | An in-game low-quality switch | S | 1.5 |
| 74 | An opponent that adapts to wins and losses (dynamic difficulty) | M | 1.5 |
| 75 | Firefox and WebKit smoke test in CI | M | 1.5 |
| 76 | No clock, no draw, and kiting is free (player speed 4.4 against 2.5 to 3.7) | M | 1.5 |
| 77 | One tell timing and one marker for every foe | M | 1.5 |
| 78 | Sim edge cases to measure (jab-chain gap, block at stamina 1, same-tick trade, the Dag and Chen lure loop) | M | 1.5 |
| 79 | The fighter model ships twice (base64 script for `file://` and the `.glb`) | M | 1.5 |
| 80 | The pad `mapping` is not checked; a focused checkbox may eat Space in Firefox (guess) | S | 1.5 |
| 81 | Replay of the last knockout | M-L | 1.3 |
| 82 | Input recording and deterministic replay (bug reports, regression playback) | M-L | 1.0 |
| 83 | Branch hygiene on GitHub (auto-delete merged branches, remove old ones) | S | 1.0 |
| 84 | Avatar loader messages are English only | S | 1.0 |
| 85 | Touch controls are decided once at load (guess) | S | 1.0 |
| 86 | The foes never bait or retreat (`prefer` is 1.5 to 1.7 for all six) | M | 1.0 |
| 87 | The camera side may flip when the fighters line up on z (guess) | S | 1.0 |
| 88 | Screen wake lock for pad-only and autoplay play (guess) | S | 1.0 |

### Tier 5: later

Settings card (M), daily challenge and share line (M, needs 20), installable offline app (M), visual diff of the six places (M), third language (M), long functions in `makeFighter` and `aiIntent` (M), more voice lines, footsteps, crowd roar and gasp, a referee, hair styles, beards and caps, a second punch and right-hand clips, head look-at and breathing, an optional CRT look, a luminance measurement of the rim light, shirts against the floor and the crowd, a thin move set with combos, counters and a parry (L, needs `balance-run` tuning), and a WebGPU engine (skip until the integrated-GPU check shows a frame-rate gap that WebGL cannot close).

### Yours (needs a person's eyes or ears, so not ranked)

- Listen to the voice on a Mac, a phone and a PC, and to FIGHT against its banner.
- A listening test of the music and the mix.
- A real phone and an integrated-GPU check.
- Italian voice lines recorded by a native speaker, and a native read of the Italian text.
- Switch off the Cursor `daily-care` agent: you chose Dependabot for dependency bumps, and `AGENTS.md` says it owns them (PR #18 came from the agent).
- Play on Safari and Firefox by hand once (item 75 automates only a smoke test).
- Hold Enter and Esc on a real keyboard, and open the game in two real tabs, after Sprint 27.
- Try the movement keys on a real AZERTY or Dvorak keyboard, and play the second pass through.
- Turn on "Automatically delete head branches" in the GitHub repo settings (item 83).

## From Sprint 24

Status after Sprint 25: Practice mode is built (item 10). The rest is open.

- **Attract mode.** After 30 s idle on the splash, start a self-playing demo: autoplay plus cards that advance on their own, any key returns to the splash. Needs: a timer on the splash, an `attract` flag that makes cards press their own button, and a check that audio stays silent until Play.
- **Practice mode.** Pick any opponent already beaten from the title card and fight him without touching progress (no unlock, no save). Needs: a flag that skips `grantWin`, a list on the title card.
- **Replay of the last knockout.** The last 1.5 s at quarter speed from a second angle. Needs: a ring buffer of fighter poses (positions and animation times) in render, not in the sim, so the bout table cannot change.
- **More voice lines.** "Round", "Block!", a crowd chant. Costs nothing with your own recordings in `assets/voice/` (add a name to `voice.js`), but the game calls only five words today (`fight`, `ko`, `win`, `lose`, `perfect`).
- **A real playtest of the voice.** Headless Chrome cannot be heard, so the voice choice is tested with a stubbed speech engine. How the browser's male voice sounds on a Mac, a phone and a PC, and whether FIGHT lands with the banner (it is spoken about 0.2 s early, a guess), is for a person to check.

## Carried over from earlier sprints

- A second punch for the Auditor, and Blender clips for a right hand.
- Hair styles, beards and caps.
- A referee at the rim of the ring.
- Footsteps from the walk clip.
- A crowd roar on a knockout and a gasp on a heavy hit.
- An optional CRT or VHS look for the cards.
- Time attack and a best-time table per bout (the bout time is now counted: `G.log.time`).
- Head look-at and breathing for the fighters.
- A luminance measurement of the rim light.
- Shirts checked against the floor and the crowd.
- A real phone and an integrated-GPU check.
- A listening test of the music and the mix.
- Italian voice lines recorded by a native speaker.

## From a general look after Sprint 24

Status after Sprint 25: all the Localisation items, the toggle to block, the WebGL failure path, the pad unplug and the deploy gate are built. The rest is open.

Found by reading the code, not by playing. Items marked "(guess)" were not checked in the code. Sizes are rough: small is an hour or two, medium a sprint's step, large needs balance tuning.

### Localisation (Italian looks half done)

- **HUD and menu strings the language switch skips:** "Sound on/off", "BOUT n / 6", "Got it", the touch buttons, the bind buttons, Easy/Normal/Hard, the slider labels and the `aria-label`s (`paintLang`, `paintAudio`, `startBout`). Small.
- **Key strips are English:** `keysHtml` and `PAD_HTML` hard-code "move / jab / heavy / block (hold) / dodge". Small.
- **The tutor line ignores rebinds, pad and touch:** it says "J jabs, K heavy" for everyone. Build it from `binds` and the input in use. Small.
- **BLOK is English only** (`fxWord`, `WORDS`). Small.
- **`<html lang>` and `document.title` never change,** so a screen reader reads Italian with an English voice. Small.
- **No test for missing Italian strings:** `L()` falls back to English without a sound. A test could check that every `STR` key has an `it` value. Small.

### Accessibility

- **No `prefers-contrast` or `forced-colors` rule and no text-size option;** about 11 declarations are 11 px or smaller. Medium.
- **The fight is silent to a screen reader:** nothing announces K.O., low health or the start of a bout, and the health bars are `role=img` with no value. Medium.
- **Cards and the pause menu are not modal:** no `role=dialog`, `aria-modal`, `inert` or focus trap, so Tab reaches controls behind them. Medium.
- **Gamepad buttons cannot be remapped** (`pollPad`), and menu and dodge share A. Small to medium.
- **A toggle-to-block option** for players who cannot hold L (guess). Autoplay lets someone watch, but gives no partial help. Small.

### Gameplay and replay

- **Nothing to do after bout 6** (answered in Sprint 26 by a second pass with one change per fighter; modifiers such as one-hit or no stamina, and an endless mode, are still open): no harder pass after a win, no modifiers (one-hit, no stamina), no endless mode; `DIFF` is three multiplier sets. Medium.
- **A thin move set:** no combos, counters or parry window. Large, and it needs `balance-run` tuning.
- **A per-bout stats screen or a best-run table.** The counters exist in `G.log`; it overlaps the time-attack item above. Small.

### Performance and robustness

- **The quality ladder only goes down** (`Q.lvl`): one hitch during a card or a tab switch lowers it for the whole session. Add a step back up after some seconds above 58 fps. Small.
- **No WebGL failure path:** `new B.Engine(...)` has no try/catch and no `webglcontextlost` handler, so an unsupported browser gets a blank page. Small.
- **No in-game low-quality switch;** only `?skin=0` and the ladder, which waits about 1.8 s. Small.
- ~~A pad unplugged mid-fight~~ pauses with a hint (Sprint 25).

### Code health and tests

- **About 25 probes are named only in `CONTINUE.md`,** not in `package.json`, and `tools/s9-story-probe.mjs` is referenced nowhere. Add a `probes` script or prune. Small.
- **Regression gaps:** throwing `localStorage`, key rebinding, reduced motion, difficulty switch, pause on blur or a hidden tab, language switch. Medium.
- **CI deploys without running tests:** `.github/workflows/pages.yml` builds and publishes but never runs `npm run regression`. Small.
- **Long functions:** `makeFighter` is about 127 lines and `aiIntent` about 76. One more was reported at about 200 lines, which may be a counting artefact: check before acting. Medium.
- **About a dozen near-identical `localStorage` load/save pairs.** One `store.get/set` helper would shrink them and make private-mode behaviour testable. Small.

### Repo hygiene

- **README is stale:** line 70 was fixed in Sprint 25; check the rest of the audio text too. Small.
- **`CHANGELOG.md` is far behind `TUNING_LOG.md`** (its newest section is an early sprint). Update it or drop it. Small.
- **Loose files in the working tree:** `CLAUDE.md` (context-mode routing rules) is untracked, and `tuning/s5-tell.jpg` shows as modified. Decide whether to commit or ignore the first, and find out why the second changed. Small.

## A second look, before Sprint 25

New ideas, each with a rough size. They are ranked above. Status after Sprint 25: the Easy offer, the playtest log and the env-probe budgets are built (items 3, 9, 6); the rest is open.

- **Offer Easy after repeated losses.** After three losses in a row on one bout, the lose card offers to switch to Easy. Small.
- **Playtest log with export.** Each finished bout stores result, time, hits, blocks, dodges, punches, difficulty and whether autoplay was used, in a capped local list; an Export button writes JSON. It gives real human numbers to set against the bot table. Local only, nothing is sent. Small to medium.
- **Env-probe budgets in the regression, and the draw-count rise traced.** S24 showed 43 to 46 draws against 41 to 43 in S23 and nobody found why. Small.
- **Controls reference card.** One card from the title and pause menus with the current keys, the pad and touch layout, move costs and the opponent's tell. Small.
- **Progress export and import.** Copy and paste a save code between devices. Small.
- **Mobile haptics.** `navigator.vibrate` on a hit and on K.O., tied to the Rumble slider (Android only; iOS Safari has no such API). Small.
- **Photo mode.** Hide the HUD, orbit the paused camera, save a PNG (`canvas.toBlob`). Medium.
- **Voice variety.** Two or three phrasings per word for the browser voice, and numbered clip names (`fight2.ogg`) for your own recordings. Small.
- **Difficulty descriptions.** The settings say what Easy and Hard change (the bot's reaction time x1.45 and x0.72). Small.
- **Daily challenge and share line.** A seeded bout with a modifier per date, and a "copy my result" line on the win card; no server. Medium, needs the modifiers item.
- **Installable offline app.** A manifest, a service worker, `theme-color` and an icon. Medium.
- **Settings card.** The title settings box holds a dozen rows; split it into a Settings card with sections. Medium.
- **Third language.** Spanish or French through the `STR` table, once the English leaks are fixed and a native speaker can read it. Medium.
- **Credits note on the voice.** Say that the voice is the device's own and that any clips are their owner's. Small.
- **Page weight budget in CI.** Fail if the gzip total of `index.html`, `lib/` and `assets/` passes a limit (now about 4.4 MB raw). Small.
- **Visual diff of the six places.** Compare `env-probe` screenshots against stored ones. Medium.

## Found while building Sprint 25

- **The first-fight hint covers the touch buttons** on a phone for its 12 s (`#tutor` sits over the Heavy and Block buttons in portrait). Small.
- **The sign texts painted in the arena** ("NO COUNTING", "NO WEAPONS") and the licence lines in Credits are English in Italian mode. Small, and the signs are a canvas texture.
- ~~The `pages.yml` deploy gate has not run yet~~ It ran on master after the Sprint 25 merge (run a0cd049): test, build and deploy all passed.

## A third look, after Sprint 25

Status after Sprint 26: `AGENTS.md`, the save version, dependency care and the share preview are built (items 11 to 14), and so is the second pass (item 20; "nothing after bout 6" below is answered). The rest is open.

Found by reading the code and by holding it against the game-development guidance (core loop, flow, rewards, web limits, audio mix, camera feel). Items marked "(guess)" were not checked. All are ranked above.

### Project and process

- **Guardrails for background agents (`AGENTS.md`).** A Cursor agent on a `daily-care/…` branch opened PR #18 from this account, and the repo has no file telling an agent the rules. Write one: the game is one file (`index.html`), `lib/babylon.js` is built (`npm run build:engine`) and not edited by hand, the bout table (90.5 / 67.5 / 44.0 / 36.0 / 30.0 / 22.0 from `npm run balance`) must not move, run `npm ci`, `build:engine` and `regression` before a PR, never touch `assets/voice/` clips or licences, and give a reason for each `overrides` entry (JSON cannot hold a comment). Small.
- **Save version and a `migrate()` step.** There are about 20 `sublevel-*` keys. `sublevel-progress` has no version field; only the log export carries `version:1`. Add one `sublevel-ver` key and a function that upgrades old saves on load, with a test that loads an S25-shaped save. It has to exist before anything changes the progress shape (a harder pass, best times, medals). Small.
- **Dependency care.** `.github/` holds only the two workflows. Add `dependabot.yml` for npm and github-actions, an `npm audit --omit=dev --audit-level=high` step in `test.yml`, and decide on SHA-pinned actions (they use `@v4` now). Decide first who owns this, Dependabot or the Cursor agent, so two bots do not open the same PR. Small.
- **Share preview and tab icon.** The `<head>` has a title and a viewport but no meta description, no Open Graph tags, no favicon link and no `theme-color` (checked by grep), so a pasted link shows a blank card and the tab has no icon. Add the tags, a 1200 x 630 image cut from an existing screenshot, an inline SVG favicon and `theme-color`. It is the cheap half of the installable app item. Small.
- **Firefox and WebKit smoke test in CI.** The regression drives Chrome only, over CDP. Safari and Firefox differ exactly where this game leans: audio unlock, `speechSynthesis` voices, WebGL context loss, tab visibility and the gamepad API. A Playwright job that boots, reaches the title, starts bout 1, lands a punch and checks for console errors would catch most of it. Software WebGL on Linux WebKit may not work (guess), so check that before promising it. Non-blocking until stable. Medium.
- **A one-page design doc and a code map.** `index.html` is one IIFE of about 3,800 lines and `CONTINUE.md` is a log, not a map. Add `docs/DESIGN.md` (pitch, the 30-second loop, mechanics, progression, art, audio) and a `docs/MAP.md` generated by a small script from the top-level functions and their lines, checked in CI so it cannot go stale. Small.
- **Run the accessibility audit in CI.** `npm run qa:a11y` (Lighthouse and axe) runs only by hand. Add it as a non-blocking job that uploads the report; gate on a score drop later. Small.
- **Branch hygiene on GitHub.** Merged remote branches remain: `s23-esc-synth-voice` (check it is merged), `s24-voice-autoplay`, `s25-backlog`, `s25-top-ten` and `daily-care/2026-11-03-npm-audit-overrides`. Delete them and turn on "Automatically delete head branches". Needs your OK for the setting. Small.

### Robustness and tooling

- **A crash catcher.** No `window.onerror` or `unhandledrejection` handler exists (checked by grep). A throw inside the frame loop would leave a frozen or half-drawn page with no message (guess, not reproduced). Stop the loop, show a card ("Something broke") with Reload and Copy details (build, browser, quality level, the last five log entries, the error text). It would be the one place a bug report comes from. Local only, nothing is sent. Small to medium.
- **Per-system CPU time budget.** The regression budgets draw calls and meshes, not time. Wrap `simTick`, `aiIntent` and the render prep in `performance.now()` in `env-probe` and fail the regression if the average sim tick passes about 2 ms of the 16.7 ms frame. CPU time is steadier than frame rate under software GL. Small to medium.
- **Pick the language on the first visit.** `navigator.language` is not read anywhere, so an Italian browser opens in English until the switch is found. With no saved `sublevel-lang`, use `it` for `it*`. Do it after the native read of the Italian text (see Yours). Small.
- **Compare an exported playtest log with the bot table.** `tools/log-compare.mjs` reads the exported JSON and prints, per bout, the human win rate and mean time next to the `balance-run` numbers. Without it the log has no reader. Needs someone to play and export. Small.
- **Input recording and deterministic replay.** The sim is fixed-step and `rng` is swappable (`rng=Math.random`, `seed()` in the tests), so a seed plus the inputs per tick may replay a bout exactly (guess: check first by recording a bout, replaying it and comparing the final health). If it holds, a bug report is a small file, the regression can play back a human bout, and the knockout replay needs no pose buffer. This is the Command pattern for input. The sound uses `Math.random`, which is render only. Medium to large.

### Game feel and design

- **Medals per bout.** Players who play for goals have nothing to chase after a win. The counters exist (`G.log`: hits, blocks, dodges, thrown, landed, time). Add up to three medals per bout (for example flawless, no heavy punches, under a set time), shown on the win card and the hub, saved with the progress (needs the save version). They reward skill and touch neither the sim nor the bout table. Build it with time attack. Small to medium.
- **Training room.** The 12 s first-fight line is the only teaching. A room with a dummy that stands, blocks on demand and never attacks, and a strip showing the stamina cost of each move live (jab 10, heavy 24, dodge 16, from `key-probe`). Reuse the practice plumbing (`G.practice`) so progress cannot change. Small to medium.
- **Tells you can hear, and shapes not only colour.** The opponent's tell is a pose plus an alert marker (`f.alert`); both are visual. Check that the marker does not rely on red alone (guess, not measured). Add a short wind-up sound from `ai.tell>0`, panned to the fighter's side. It must be render only, with no change to the tell timing or `rng()`; the bout table stays identical. Small to medium.
- **Pan the sound effects by fighter position.** There is no stereo panner in the audio graph (checked by grep), so a hit on the left sounds like a hit on the right. Pan hits, whooshes and blocks by the fighter's screen x, lightly, and leave music, voice and UI centred. Small.
- **A small FOV punch on heavy hits and the knockout.** The camera has shake and kick but a fixed FOV (0.85). A 2 to 3 percent FOV change for a few frames adds impact, scaled by the motion setting and off under reduced motion. Render only. Small.
- **An opponent that adapts.** Difficulty is by choice (Easy, Normal, Hard) and by the Easy offer. A third way is dynamic: after each loss the bot's reaction slows a few percent, after each win it recovers, capped at about 15 percent, shown in the settings, off in Practice and recorded in the log. The bout table was measured with it off, so it needs its own `balance-run` pass across streaks. Medium.

### Numbers worth keeping

- First load is about 1.7 MB gzip before fonts and the audio samples: `lib/babylon.js` 704 KB, `index.html` 83 KB, and one fighter model of 957 KB raw (`assets/quaternius-human/animated-human.glb`). That is near the 2 MB startup guide for browser games, so the page weight budget has room to start tight.
- The voice README lists `.ogg`, `.mp3` and `.wav` for your own clips. Older Safari does not play Ogg (guess; check), so say which format plays everywhere.

## A fourth look, from the play flow

Status after Sprint 26: the first five (restart heals, Enter, save warning, Continue, movement by physical key) are built (items 15 to 19). The rest is open.

Found by reading `index.html` from the splash to the result card and the pause menu. Line numbers are those of master at `0e21af0`. Items marked "(guess)" were not tested in a browser. The first five are Sprint 26 items 15 to 19.

- **Restart from the pause menu heals.** `restartBout` (:2487) calls `startBout` without `G.retry`, so the start health is `min(100, P.hp+35)` (:2768): the damaged health plus 35. Retry from the lose card starts at 100. Set `G.retry=true` in `restartBout`. Small.
- **Enter hijacks a focused control.** The shortcut at :2284 clicks `#go` whenever a card is up, whatever has focus, so Enter on Back, the Easy retry or a slider starts the bout. Skip it for buttons, inputs and selects other than `#go`. Small.
- **Progress that cannot be saved is never reported.** `grantWin` returns false when `localStorage` throws (:993-999) and `winCard` ignores it (:2745), so in private mode a won bout is lost on reload without a word. Show a row on the win card. The log export's clipboard fallback also swallows its error (:2549). Small.
- **Play always starts bout 1.** `titleCard`'s go is `introCard(0)` (:2725); `hubCard` is reachable only after a win. After a reload with 3 bouts won, the quit note says so and the player must replay bouts 1 to 3. Add a Continue action to `hubCard(wins)`. Small to medium.
- **Movement is by typed letter.** `keyName` (:2240) uses `e.key` for Latin layouts, so on AZERTY the keys labelled W, A, S and D are scattered. Map movement by `e.code`, fall back to `key` when there is no code, and show the cap label from `navigator.keyboard.getLayoutMap()` where it exists. Small to medium.
- **A press dropped for lack of stamina: the keyboard says so, touch and the pad do not.** `denyCue` (:2315) blinks the stamina bar and plays a low tick, but it is called only from the keydown handler (:2353); touch buttons and pad presses start nothing and say nothing. (I first guessed there was no feedback at all; reading `denyCue` showed otherwise.) Small.
- **Rebinding fails silently.** A reserved key (WASD, arrows, Enter, Esc, Tab) ends listening with no change and no message, and a clash swaps the other action's key without saying so (:2269-2274). Add a status line. Small.
- **Pause menu keys (guess).** `pauseFight` (:2457) never moves focus, and :2285 calls `preventDefault` on Space and the arrows whenever `wrap` is hidden, which includes the pause card, so Space may not press Resume or toggle a checkbox. Test in a browser first. Small.
- **Stale state after Reset progress, Restart and Quit.** `resetProgress` (:2557) leaves `#linkPractice` visible and `G.loss` set until `titleCard` reruns; the pad-unplug hint (`pad_gone`, :2474) is cleared only in `resumeFight`, so Restart or Quit can leave it for a later pause. Practice with 0 wins then looks like a dead button (:2703). Small.
- **No language switch on the splash.** Play and Credits stay English until the title card, which has the toggle (`langRow`). Small.
- **Gamepad dead ends.** `pollPad` (:2381-2384): on a card only A and Start click `#go` and Select opens the menu; in pause only A or Start resume. A pad-only player cannot reach Restart, Quit, the Easy retry, Back, Practice, Credits or the settings. Add B as Back and a D-pad focus ring. Medium; do it with gamepad remapping.
- **Avatar loader messages are English only.** `avStatus` strings at :2898, :2899, :2916, :2919 and :2925 skipped the Italian pass. Small.
- **Touch controls are decided once at load (guess).** `isTouch` (:2148) reads `(pointer: coarse)` at start, so a hybrid device with a mouse never gets them. Small.

Loose files are settled: `CLAUDE.md` is excluded locally (`.git/info/exclude`) and `tuning/s5-tell.jpg` is restored to the committed copy. The `Yours` list also keeps: switch off the Cursor `daily-care` agent (Dependabot owns bumps, see `AGENTS.md`), try the AZERTY movement on a real keyboard, and play the second pass.

## A fifth look, from two reviews

Status after Sprint 27: items 21 to 30 are built when struck through below; the rest is open. "Confirmed" means read in the code, "guess" means not tested in a browser. Line numbers are those of master at `23c4b2e`. All are ranked above.

Two read-only reviews went through the code: one on combat and feel, one on web robustness and tooling. The first ten were built in Sprint 27.

### Confirmed defects

- **Held Esc and Enter bypass the repeat guard.** The Esc and Enter branches (:2332-2342) run before `if(e.repeat) return` (:2344). A held Esc flickers pause and resume; a held Enter can chain through consecutive cards and skip the dossier. Small (item 22).
- **Buffered presses and the touch or pad stick survive a pause.** The keydown handler buffers a press in any state (:2349-2351) and `buf` decays only in `simTick`, so a J pressed while paused fires on Resume. `dropKeys` (:2358) clears neither `buf`, `touchVec` nor the pad stick. Small (item 23).
- **The dodge stat counts presses.** `G.log.dodges++` is in `startDodge` (:2026); a dodge that works (`d.inv>0` in `strike`, :2038) records nothing. The result card and the playtest log overstate dodging. Small (item 24).
- **Two tabs overwrite each other's progress.** `grantWin` compares against the in-memory `progress.wins` and writes the whole object, with no `storage` listener. Tab A at 3 wins erases tab B at 5. Small (item 25).
- **A queued voice line ignores pause, mute, hide and Quit.** `voiceClip` (`<audio>`) and `voiceSpeak` (`speechSynthesis`) bypass the Web Audio graph and check `muted` and `document.hidden` only when called (:1493). No `speechSynthesis.cancel()` exists outside the speak call. Small (item 26).
- **Stored values are not validated.** `Number('abc')` is NaN and `clamp` passes it (:1155-1160); setting a gain to NaN should throw inside `audioInit`, before the title card (inferred from the spec, not run). `loadProgress` (:1019) takes `wins:"abc"`; `DIFF[v]` and `OUTFITS[id]` accept `"constructor"`; loaded binds can put two actions on one key; a corrupt save is overwritten on the next win with no backup. Small to medium (item 27).
- **The regression can hang for 20 minutes.** About 12 tests use `while(G.state!=='fight') await raf()` with no bound, `test()` has no timeout, the JSON summary prints only at the end and `test.yml` uploads nothing on failure. Fixed sleeps such as `sleep(4300)` (:696) are the next flake. Small (item 21).
- **The regression ignores page errors.** No `Runtime.exceptionThrown`, `consoleAPICalled`, `Log` or `Network.loadingFailed` subscription (grep gives 0), so a thrown handler or a 404 on a font passes CI. Small to medium (item 28).
- **Docs disagree with the code.** `README.md:13` says "Three bouts" (there are six) and that Google Fonts load online (they are local). `CONTINUE.md` still says "Sprint 9, do this one" and "Sprint 12". `AGENTS.md` and `CONTINUE.md` give a 400 draw calls and 250 meshes budget while the regression enforces 48 and 52 (:318). Small to medium (item 29).
- **Five of six foes cannot answer a jab.** A jab's `a1` is 0.20 s (:357). The AI answers only while `atk.t<a1` after waiting `react` (:2130-2133), and `react` at Normal is Reyes .08, Halvorsen .202, Pike .24, Voss .29, Dag .38, Chen .445. Only Reyes can block or dodge a jab, and nobody can on Easy, so the dossier's block and dodge percentages say little about jabs. It is a balance change: all six bout-table numbers move, so it needs a sprint of its own with `balance-run` before and after. Medium (item 31).
- **Missing cues.** A dodge that works plays `SFX.whoosh`, the same as a whiffed swing; there is no low-health cue (the vignette at :737 is unused for it); the foe's stamina is not shown, so the guard-break window is invisible. Small to medium (item 36).
- **The knockout cannot be skipped.** `koTimer=2.4` (:2064) is fixed, which adds up over retries. Small (item 60).
- **A blank page until about 4 MB of scripts parse.** `#splash` is `hidden` in the HTML (:313) and four synchronous scripts run at :327-330, with no spinner and no `noscript`. Small to medium (item 37).
- **Browser zoom and a monitor change leave the render blurry** (hardware scaling set once at :718), `prefers-reduced-motion` is read once (:2487) and the hit flash (:2059) ignores it. Small (item 61).
- **Tap targets are 24 to 28 px** (`.bind`, `.btn2`, `.is-touch .snd`, :79, :81, :116, :120). Small to medium (item 39).
- **CI installs everything on every run.** Lighthouse, axe, selenium and chromedriver come with the regression's install; CI never checks that the committed `lib/babylon.js` equals a rebuild; Chrome on `ubuntu-latest` is unpinned. Small to medium (item 40).
- **No clock, no draw, and kiting is free.** Only a KO ends a bout (`afterKO`, :2875) and the player's speed is 4.4 against 2.5 to 3.7 (:1045), so running away is never punished. A long clock with a decision on health would leave the table alone, but the result card then needs wording for a draw. Medium (item 76).
- **One tell timing for every foe.** The attack table is global (:357), the jab tell is a constant 0.28 s and only on the `teach` style (:2163), and the alert marker has one shape. Medium (item 77).
- **The model ships twice.** `animated-human.js` (1.2 MB, base64) duplicates the 935 KB `.glb`, which is not fetched while the script loads; the script exists because `file://` cannot fetch. Medium (item 79).

### Sim edge cases to measure first (reading, not run)

All of these touch the sim, so each needs `balance-run` (item 78): a jab's stun (0.30 s) ends when the attacker's recovery (0.40 s) ends minus 0.1 s, so a chain is escapable only in a 0.1 s gap; stamina does not regenerate in block (:2075) and block re-enters while stamina is above 1 (:2081), which can pin a player near zero; `step(P)` runs before `step(E)` (:2934-2935), so a same-tick trade goes to the player; Dag and Chen answer a whiff with a heavy after `react` (:2123-2147), which makes whiff, dodge, punish a loop the bot never plays. The foes never bait or retreat either: `prefer` is 1.5 to 1.7 for all six, inside the player's 1.7 jab range (item 86).

### Guesses

- **No limiter on `master`** (:1195) and a 0.14 s music lookahead (:1422): a stall over 140 ms makes the rhythm jump. `audio-probe` checks single-sample peaks only. Measure the summed peak first (item 38).
- **The pad `mapping` is never checked** (`pollPad`, :2420) although the README assumes a standard pad, and a focused checkbox may take Space as a click in Firefox because only keydown is cancelled (item 80).
- **The camera side may flip** at :2663 when the fighters line up on z, which would swing the camera-relative thumb controls (item 87).
- **No screen wake lock** for pad-only and autoplay play (item 88).

### Checked and fine

Frame loop (the 0.05 s clamp, the 5-tick accumulator cap, interpolation), hit stop on block, hit and KO, a 0.22 s input buffer, stuck keys on blur, tab hide and Cmd, double hits (`A.done`), acting during a KO, the ring and body resolution, and jab plus block on one frame (the jab wins). Do not check these again.
