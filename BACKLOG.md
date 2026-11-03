# Backlog

Ideas that were suggested or left out of a sprint and are not built. Nothing here is promised. Pick one, set numbers to measure first (see `CONTINUE.md`), then build it.

## Ranking

Every item below, best first. Score is value (1 to 5, counting risk removed) divided by effort (small 1, small-plus 1.5, medium 2, medium-large 3, large 4); ties go to the higher value, then to the lower risk to the bout table. The scores are a judgement, not a measurement. The first ten were built in Sprint 25. Next up is item 11.

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

### Tier 2: next

| # | Item | Size | Score |
| --- | --- | --- | --- |
| 11 | A harder pass and modifiers after bout 6 | M | 2.0 |
| 12 | Repo hygiene: README line 70, `CHANGELOG.md`, a `probes` script, loose files | S | 2.0 |
| 13 | Mobile haptics | S | 2.0 |
| 14 | Controls reference card | S | 2.0 |
| 15 | Progress export and import | S | 2.0 |
| 16 | Voice variety | S | 2.0 |
| 17 | Page weight budget in CI | S | 2.0 |
| 18 | Difficulty descriptions in the settings | S | 2.0 |
| 19 | Credits note on the voice | S | 2.0 |
| 20 | Cards and the pause menu as modal dialogs | M | 1.5 |
| 21 | The quality ladder recovers | M | 1.5 |
| 22 | Photo mode | M | 1.5 |
| 23 | Time attack, best times and a per-bout stats screen | M | 1.5 |
| 24 | Regression gaps (`localStorage` throwing, rebinding, reduced motion, difficulty, blur, language) | M | 1.5 |
| 25 | Screen-reader announcements for the fight | M | 1.5 |
| 26 | Contrast and text-size options | M | 1.5 |
| 27 | Gamepad remapping | M | 1.5 |
| 28 | Attract mode | M | 1.5 |
| 29 | One `localStorage` helper in place of a dozen pairs | S | 1.5 |
| 30 | An in-game low-quality switch | S | 1.5 |
| 31 | Replay of the last knockout | M-L | 1.3 |

### Tier 3: later

Settings card (M), daily challenge and share line (M, needs 11), installable offline app (M), visual diff of the six places (M), third language (M), long functions in `makeFighter` and `aiIntent` (M), more voice lines, footsteps, crowd roar and gasp, a referee, hair styles, beards and caps, a second punch and right-hand clips, head look-at and breathing, an optional CRT look, a luminance measurement of the rim light, shirts against the floor and the crowd, and a thin move set with combos, counters and a parry (L, needs `balance-run` tuning).

### Yours (needs a person's eyes or ears, so not ranked)

- Listen to the voice on a Mac, a phone and a PC, and to FIGHT against its banner.
- A listening test of the music and the mix.
- A real phone and an integrated-GPU check.
- Italian voice lines recorded by a native speaker, and a native read of the Italian text.

## From Sprint 24

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

- **Nothing to do after bout 6:** no harder pass after a win, no modifiers (one-hit, no stamina), no endless mode; `DIFF` is three multiplier sets. Medium.
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

- **README is stale:** line 70 still says a formant synthesiser says FIGHT "in a robot voice" (true before Sprint 24); check the rest of the audio text too. Small.
- **`CHANGELOG.md` is far behind `TUNING_LOG.md`** (its newest section is an early sprint). Update it or drop it. Small.
- **Loose files in the working tree:** `CLAUDE.md` (context-mode routing rules) is untracked, and `tuning/s5-tell.jpg` shows as modified. Decide whether to commit or ignore the first, and find out why the second changed. Small.

## A second look, before Sprint 25

New ideas, each with a rough size. They are ranked above.

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
- **The `pages.yml` deploy gate has not run yet:** check the first master run after the Sprint 25 merge. Small.

