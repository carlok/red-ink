# Sublevel Three

![A jab lands inside the yellow tape. The auditor, in a white shirt and black hand wraps, snaps Reyes back, red-haired in a green shirt, with a POW burst and orange sparks between them and the crowd dark behind.](tuning/s18-hero.jpg)

Browser fighting game. One HTML file, no account, no build step to play.

**Play:** https://carlok.github.io/red-ink/

## About

You audit pallet counts on the night shift at Halvorsen Freight. The totals always reconcile. Tonight Pike hands you a keycard and points at a door that is not on the floor plan.

Six bouts, each in its own place under the warehouse. Reyes teaches, Dag punishes a miss, Pike repeats your last three punches, and three more wait after them. Keyboard, standard gamepad, and touch. Drop a `.glb` on the title card to fight as an imported avatar. The engine is a tree-shaken Babylon.js build. The game runs from the files on disk and calls no other host: the fonts are local too.

## Topics

`fighting-game` `babylonjs` `webgl` `browser-game` `html5` `gamepad` `touch` `apache-2.0`

## Run locally

Open `index.html` in Chrome, Firefox, or Edge.

License: Apache-2.0 (`LICENSE`, `NOTICE`). The sounds are CC0 (`audio/CC0.txt`).

## Quality assurance

- `npm run regression` — headless Chrome checks (bouts 1–6, hub/dock, input, offline `file://`).
- `npm run balance` — seeded bot win rates for all six foes.
- `npm run offline-zip` — writes `dist/sublevel-three-offline.zip` for offline play.
- `npm run qa:a11y` — axe on the title card (+ Lighthouse when the host finishes in time).
- Viewports: `docs/DEVICE-MATRIX.md`.

Engine: `lib/babylon.js` is a tree-shaken build of `@babylonjs/core` 9.30.0 plus the glTF 2.0 loader. License text: `lib/babylon.Apache-2.0.txt`. Regenerate the bundle with `npm install && npm run build:engine`.

## Controls

| | |
| --- | --- |
| Move | W A S D or arrow keys |
| Jab | J, also Z |
| Heavy | K, also X |
| Block (hold) | L, also C or Shift |
| Dodge | Space, also V |
| Pause | Esc, or Start on a pad |

On the title card, click Jab, Heavy, Block, or Dodge and press a new key. Movement stays on WASD. The Z, X, C, V, and Shift aliases stay.

Gamepad, standard mapping: left stick or d-pad moves, X jabs, Y is heavy, A dodges. LT and RT block once the trigger is past halfway. LB, RB, and B block as buttons.

The title card has Easy, Normal, and Hard. Normal uses the bout table as tuned. Easy and Hard scale that table: health, speed, damage, guard rate, and reaction. The same card has a rumble slider. 0 is off. Key bindings, difficulty, rumble, the Hits and Music sliders, mute, and Less motion are saved in local storage when the browser allows it.

Reyes shows a mark before a jab. Dag answers a miss with a marked heavy. Pike repeats your last three attacks. Every foe takes your first jab of a string, but one who has seen you attack in the last two seconds is ready for the next jab and may block or dodge it, so spamming jabs stops being free. The card after a bout lists hits, blocks, dodges, and seconds in the corner.

A hit turns the head toward that side. Knockdowns fall back, crumple, or drop sideways. Bruises and sweat build during the bout.

The overhead light is cold. The hanging bulbs are sodium orange. The crowd around the ring is built from shoulders, arms, and legs, and they sway while they stand.

Hits, blocks, and the K.O. are samples. A low room hum, a few quiet beeps and knocks, and the music sit under them, and the music ducks when a hit lands. The crowd is a reaction, not a bed: a few voices answer a blow (always the knockout) and nothing plays between blows. The Ambience slider and the pause switch set the hum, the events and the crowd together.

Esc pauses a bout. The first fight shows a 12-second control strip.

Touch: move stick on the left, Jab in the bottom-right of the button cluster. The view does not scroll or zoom.

Drop a `.glb` on the title screen to replace the auditor. Fighters are otherwise built in code (`makeFighter`). Tuning constants are at the top of the script: `ATK`, `LOOKS`, `BOUTS`, `CAM`.

Fighters are skinned low-poly people (CC0, see Credits) animated by the fight state: each clip is scrubbed by sim time, so hitstop, pause, and the fixed step stay exact. Every opponent gets a random look each session: skin, hair, shirt, pants, and shoes are drawn so that neighbouring colours always differ clearly, and no two people in a session share a skin, hair, shirt, pants or shoe colour. The height and build stay near the opponent's own, and a soft gradient on skin, hair, clothes and shoes keeps arms and faces from reading flat. Fighters have a dark outline, a rim of the place's key light on their edges, hand wraps, creases at the joints, and a face that flushes and bruises as they take hits. Add `?skin=0` to the address to play with the original procedural fighters, or `?skinseed=7` to repeat a set of looks. If the model cannot be loaded the game falls back to the procedural fighters by itself.

Each bout is in its own part of the sublevel. It is the same room, but the floor, the colour of the fixtures, the light, the fog, the dust, the two side signs and a few props change: a wet concrete sump, a steel dock deck with containers, a survey-sheet floor, a frosted cold store with icicles, a gatehouse with pavers and red-and-white bollards, and a black-glass floor with a lit grid for the last bout. The yellow edge of the ring stays the same everywhere.

The page opens on a silent splash with a Play button: nothing makes a sound until you press it, and Quit (from the pause menu or the title card) returns to it with the sound stopped. Before each bout a dossier card shows the next opponent standing in the place he will fight in, the camera walking all the way round him, with his name, his six metrics, his style, a strength, a weakness and a tip. The music is 80s synth, played live by a small sequencer (no audio files): each place has its own tempo and minor key, with a gated-reverb snare, toms, an octave-pulsing bass, a chorused pad, a detuned-saw lead and arpeggios that come in only at moments (a card, a fighter under 40% health, a roar from the crowd, a knockout). A win, a loss and each opponent's card have their own themes, and a voice says FIGHT, K.O., WIN, LOSE and PERFECT (see Autoplay and voice below). Esc opens a menu on every card as well as in a fight. Fourteen of the spectators are the fighters' model with a random look, styled by the place (hi-vis at the dock, parkas in the cold store).

The camera is sized from the frame: a fighter fills about a third of the screen height at close range, and both stay in view during a chase or a knockback. On a phone held upright the width limits it: only about 5 m of floor fits across, so the fighters fill about 18% of the height. `CAM` holds the numbers.

The fight steps at a fixed 60 Hz and the view interpolates, so reaction times and hit windows run on the same clock on a 30, 60, or 144 Hz screen.

Quality steps down resolution, then shadow filtering, then shadows, when the frame rate stays under 44 for 1.8 seconds. The floor is half the starting resolution.

## Autoplay and voice

- **Autoplay** (title settings or the pause menu, or `?auto=1`): the AI plays your side in a fight. Pressing a move or attack key, touching the stick or buttons, or using the pad takes over at once; the next bout starts with autoplay again. Cards still wait for you. It is also an accessibility aid for anyone who cannot play the fights but wants to see the story.
- **Voice** (title settings or the pause menu): the game says FIGHT, K.O., WIN and LOSE. It plays a clip from `assets/voice/` if you have added one, else your browser's own male voice for the game's language (pick another in the list, Hear plays it), else a small synthesised voice. Nothing is bundled: recordings you add are yours, and the repo's own audio stays CC0.
- **Adding your own voice clips:** record `fight`, `ko`, `win`, `lose` and `perfect` (any of them), save as `.ogg`, `.mp3` or `.wav` in `assets/voice/`, and list them in `assets/voice/voice.js` (see `assets/voice/README.txt`). They are listed, not probed, so the game also works from `file://`.

- **Block as a toggle** (title settings or the pause menu): one press of the block key, button or pad trigger starts the guard and the next ends it; a jab, heavy or dodge press, a hit, and a new bout end it too. For players who cannot hold a key.
- **Easy offer:** after three losses in a row on one bout the lose card offers Try Easy. It changes the saved difficulty, which Settings changes back.
- **Practice** (title card, once you have won a bout): fight any opponent you have beaten. Progress, unlocks and the save are left alone.
- **Continue** (title card, once you have won a bout): goes on from the rule board at the next bout. Play still starts a new run at bout 1.
- **Second pass** (title card, once all six bouts are won): the six fighters again at your own difficulty, each with one change (Reyes and Halvorsen take more punishment, Dag reads you sooner, Pike and Voss hit harder, Chen attacks more often). A win counts only in the second pass: wins, outfits and arenas stay as they were. The HUD reads `BOUT n / 6 · II`.
- **Movement by position:** the keys where W, A, S and D sit on a QWERTY board move the fighter on any layout (ZQSD on AZERTY), and the hints say so where the browser reports the layout (Chromium). Jab, heavy, block and dodge stay by the letter on the key.
- **Saves:** the progress save carries a version and is upgraded when the game loads it; a save from a newer build is left as it is. If the browser blocks storage, the win card says that the win will not be kept.
- **Pad unplugged** in a fight: the fight pauses and says why.
- **Crash card:** an uncaught error shows one card with Reload, Copy details (the browser, the state, the last five logged bouts and the error) and, while the game is still drawing, Keep playing. Nothing is sent anywhere.
- **Training** (title card, always there): a dummy that never hits back and cannot be knocked out. A strip shows what each move costs in stamina (jab 10, heavy 24, dodge 16) and strikes out one you cannot afford; the Dummy switch (a button, or T) holds his guard so you can see a block. Nothing is saved.
- **Medals** (first-pass wins only): Untouched (no hit taken), Sharp (85 percent of punches landed) and Quick (a win inside a time per bout). The win card lists them, the rule board counts them and says what to aim for. Practice, Training and the second pass give none.
- **Cues:** a dodge that works says DODGE and rings; under a quarter of your health the edge of the picture goes red (still under Less motion) and a double thump sounds; the foe has a stamina bar under his health; his alert mark has a dark rim and a short rising sound when it appears.
- **Held keys:** holding Esc or Enter does not repeat; a press made while paused does not fire on Resume; a voice line already queued is dropped on pause, mute, a hidden tab and Quit; a second tab cannot overwrite a save that has more wins.
- **Playtest log:** each finished bout adds one line (result, time, hits taken, blocks, dodges, punches thrown and landed, difficulty, who controlled it) to a list of the newest 200 in this browser's local storage. Nothing is sent anywhere. *Export playtest log* in the title settings saves it as JSON; *Clear log* empties it. It exists so real players' numbers can be set against the bot table.
- **No WebGL:** the page says what is needed instead of staying blank. Tests run on every pull request (`.github/workflows/test.yml`) and before each deploy.

Ideas not built yet are in `BACKLOG.md`.

## Credits

The same list is in the game: Credits on the title card and in the pause menu.

- Game by Carlo Perassi, Apache-2.0.
- [Babylon.js](https://www.babylonjs.com) 9.30 (`lib/babylon.js` is a tree-shaken build), Apache-2.0.
- [Animated Human](https://opengameart.org/content/animated-human-low-poly) by [Quaternius](https://quaternius.com), CC0 1.0. Nothing requires attribution, but it deserves it. `assets/quaternius-human/` says how the files were converted and which clips (Guard, HitA, HitB, HitHeavy, TellJab) were added in Blender with `tools/blender/author-clips.py`.
- Big Shoulders Stencil Display (the Big Shoulders Project Authors), IBM Plex Mono and IBM Plex Sans Condensed (IBM), SIL Open Font License 1.1. They are served from `assets/fonts/` (Latin subset, licences and notes there), so the page makes no request to any other host and `file://` works offline.
- Sound generated for the game by `tools/make-audio.mjs`, CC0 (`audio/CC0.txt`).
