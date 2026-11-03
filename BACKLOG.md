# Backlog

Ideas that were suggested or left out of a sprint and are not built. Nothing here is promised. Pick one, set numbers to measure first (see `CONTINUE.md`), then build it.

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
- **A pad unplugged mid-fight** just drops input; pause and show a hint. Small.

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
