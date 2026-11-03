Voice lines for the game (optional)

The game says FIGHT at the start of a bout, K.O. on a knockout, and WIN, LOSE or PERFECT on the result card.
By default it uses a male voice that the player's device already has (the browser's speech synthesis), in English or Italian,
and falls back to a built-in robot voice if the device has none.

To use your own recordings instead:
1. Record short lines (under a second): fight, ko, win, lose, perfect. Mono, 22 to 44 kHz, .ogg, .mp3 or .wav.
2. Put the files in this folder.
3. List them in voice.js, for example:
     window.SUBLEVEL_VOICE={fight:'assets/voice/fight.ogg', ko:'assets/voice/ko.ogg'};
   Any word you leave out is spoken by the browser voice.
4. Only add recordings you made or have the right to redistribute. The repository's audio is CC0 (audio/CC0.txt); recordings you add are
   yours to license.

Recordings are played with a plain audio element, so they work from file:// too, and the Hits volume and Sound off apply.
Synthetic voices from Apple's say command are limited to personal, non-commercial use by Apple's licence, so none are bundled.
