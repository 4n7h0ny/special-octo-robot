# Boppy Breakout

A teen-friendly 2D side-scrolling platformer prototype built with Phaser 3.

## Run locally

No build is required. Open a static server from the project root (Phaser is bundled locally under `src/phaser.min.js`).

```bash
# install a simple server if needed
npm install --global http-server

# from repo root
http-server -p 3000
# then open http://localhost:3000
```

## Gameplay keys

- Move: **Arrow keys** or **W/A/S/D**
- Jump/Double-jump: **Space** (or Up/W)
- Dash: **Shift**
- Pause/Resume: **Esc** or **P**
- Skip splash / start game: **Enter** or **Space**

## Notes

- Splash music streams from the provided Google Drive URL and caches as a data URI in `localStorage` after first run.
- All art is procedurally generated; no external textures are required.
- Target: 60 FPS on mid-range hardware with debug FPS overlay visible in-game.

## Exporting

To produce a single self-contained HTML build:

1. Inline the JS files as base64 or regular text into `index.html` (e.g., using a bundler like `vite`/`rollup` with `build.singleFile` plugins, or manually embedding `src/phaser.min.js` and `src/main.js` contents). 
2. Because assets are procedural, no additional files are necessary. The splash music will still stream from the provided URL and cache on first play.

For a desktop executable, tools like Electron or Tauri can wrap `index.html` and `src` assets; include `src/phaser.min.js` and `src/main.js` in the packaged bundle.

## Next steps

- Swap procedural rectangles with pixel-art spritesheets for the player, enemies, and tiles.
- Add more levels and a stage select screen.
- Add audio SFX and separate music loops for menus/gameplay.
- Save best times and battery counts per level.
