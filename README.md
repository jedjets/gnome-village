# Gnome Village

Phone-first god-sandbox isle (Chrome first). React shell + one Canvas 2D world. Auth off; `localStorage` only. No Phaser / Three.js.

Product source of truth: [`docs/Gnome-Village-Product-Brief.md`](docs/Gnome-Village-Product-Brief.md).

## Quick start

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`). On a phone, use the LAN URL Vite shows, or Chrome DevTools device mode (~390×844).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local Vite dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | Oxlint |

## Slice 1

- Seeded soft-isometric heightfield isle
- Camera: drag pan, pinch zoom, twist rotate, Fit
- Tools: Look · Raise · Lower (bottom rail, one scrolling row)
- Silent save on tab hide (`gnome-village:slice1-v1`)
- Begin unlocks audio stub; mute remembered

## Layout

```
src/
  shell/     Intro, HUD, Rail
  isle/      Canvas loop + soft-iso render
  world/     Heightfield + Fit
  sim/       Tools + terrain brush
  input/     Pointer bridge + camera gestures
  audio/     Procedural Web Audio stub
  storage/   Slice 1 localStorage
docs/        Product brief
```

## Notes

- Slice 1 uses `gnome-village:slice1-v1`. Legacy `gnome-village:save` is ignored (mute may soft-migrate).
- Designed for narrow phone viewports; `touch-action: none` on the canvas; safe-area insets respected.
