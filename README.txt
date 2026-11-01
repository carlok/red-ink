SUBLEVEL THREE - browser fighting game (Babylon.js 9.30, Apache-2.0)

Run: open index.html in Chrome, Firefox, or Edge. No build step and no account.
The game files are local. Google Fonts load when you are online and fall back to system fonts when you are not.

Engine: lib/babylon.js is a tree-shaken build of @babylonjs/core 9.30.0 plus the glTF 2.0 loader.
License text: lib/babylon.Apache-2.0.txt. Regenerate the bundle with: npm install && npm run build:engine

Controls
  Move          W A S D or arrow keys
  Jab           J, also Z
  Heavy         K, also X
  Block (hold)  L, also C or Shift
  Dodge         Space, also V
On the title card, click Jab, Heavy, Block, or Dodge and press a new key. Movement stays on WASD. The Z, X, C, V, and Shift aliases stay.

Gamepad, standard mapping: left stick or d-pad moves, X jabs, Y is heavy, A dodges. LT and RT block once the trigger is past halfway. LB, RB, and B block as buttons.
The title card has Easy, Normal, and Hard. Normal uses the bout table as tuned. Easy and Hard scale that table: health, speed, damage, guard rate, and reaction. The same card has a rumble slider. 0 is off. Key bindings, difficulty, and rumble are saved in local storage when the browser allows it.
Reyes shows a mark before a jab. Dag answers a miss with a marked heavy. Pike repeats your last three attacks. The card after a bout lists hits, blocks, dodges, and seconds in the corner.
A hit turns the head toward that side. Knockdowns fall back, crumple, or drop sideways. Bruises and sweat build during the bout.
The overhead light is cold. The hanging bulbs are sodium orange. The crowd around the ring is built from shoulders, arms, and legs, and they sway while they stand.

Touch: move stick on the left, Jab in the bottom-right of the button cluster. The view does not scroll or zoom.

Drop a .glb on the title screen to replace the auditor. Fighters are otherwise built in code (makeFighter). Tuning constants are at the top of the script: ATK, LOOKS, BOUTS.
Quality steps down resolution, then shadow filtering, then shadows, when the frame rate stays under 44 for 1.8 seconds. The floor is half the starting resolution.
