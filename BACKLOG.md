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
