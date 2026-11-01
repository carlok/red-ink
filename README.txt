SUBLEVEL THREE - browser fighting game (Babylon.js 9.30, Apache-2.0)

Run: open index.html in Chrome/Firefox/Edge. Everything except the Google Fonts is local (works offline; the fonts fall back to system ones).
The file lib/babylon.js is a tree-shaken build. Regenerate it with: npm install && npm run build:engine
Controls: WASD move, J jab, K heavy, L block (hold), Space dodge. Gamepad: L stick move, X jab, Y heavy, LT block, A dodge.
Drop a .glb character file on the title screen to use your own avatar.
Source: index.html is a single file (HTML + CSS + one script). Fighter models are built in code (makeFighter), tuning constants are at the top (ATK, LOOKS, BOUTS).
Quality: auto-lowers resolution/shadows when fps < ~45.
