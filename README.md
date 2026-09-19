# Gnome Village

Phone-first god-sandbox isle (Chrome first). React shell + one Canvas 2D world. Auth off; `localStorage` only. No Phaser / Three.js.

Product source of truth: [`docs/Gnome-Village-Product-Brief.md`](docs/Gnome-Village-Product-Brief.md).

## Quick start

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local Vite dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | Oxlint |

## Layout

```
src/
  shell/     Intro, HUD, Rail (React chrome)
  isle/      Canvas 2D loop + procedural draw
  audio/     Procedural Web Audio stub
  storage/   localStorage helpers
docs/        Product brief
```

## Notes

- Progress and mute preference are stored under `gnome-village:*` keys in `localStorage`.
- Designed for narrow phone viewports; safe-area insets respected where available.
