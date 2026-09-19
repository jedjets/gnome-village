# Gnome Village — Product Brief (Source of Truth)

Locked brief for the greenfield app. Prefer this document over chat history when product intent is ambiguous.

## Vision

**Gnome Village** is a phone-first god-sandbox: a calm, playful isle where the player tends a small village of gnomes. Chrome-first (desktop Chrome and mobile Chrome). Auth is off; progress lives in `localStorage` only.

## Platform & stack (locked)

| Constraint | Decision |
|---|---|
| Form factor | Phone-first UI; touch-friendly chrome |
| Browser | Chrome first |
| Shell | Modular TypeScript — React (intro / HUD / rail) |
| World | **One** Canvas 2D isle (no multiple canvases / scenes as separate engines) |
| Engines | **NO Phaser**, **NO Three.js** |
| Auth | Off — no accounts, no backend session |
| Persistence | `localStorage` only |
| Audio | Procedural Web Audio (minimal stub acceptable in greenfield) |

## Architecture

```
src/
  shell/     React chrome: Intro, HUD, Rail
  isle/      Canvas 2D game loop + draw
  audio/     Procedural Web Audio stub
  storage/   localStorage helpers
```

- **React shell** owns screens and overlays (intro gate, HUD meters, side/bottom rail).
- **Isle** owns the single `<canvas>`, resize, requestAnimationFrame loop, and procedural draw (sky, ground, simple gnome/village placeholders).
- **Audio** is optional UX polish via Web Audio API oscillators / noise — no asset packs required.
- **Storage** wraps get/set/clear for village state keys; never assumes a server.

## Greenfield scope (this repo)

1. Vite + React + TypeScript scaffold
2. Modular folders as above
3. Minimal working UI: intro or main chrome with HUD/rail placeholders + canvas isle with a simple procedural draw
4. Mobile-friendly viewport / CSS baseline
5. Docs, README, solid `.gitignore`
6. Local `main` commit ready to push (push is handled separately)

## Non-goals (for this greenfield)

- No Phaser / Three.js / external game engines
- No auth, accounts, or cloud sync
- Do not copy prototype HTML from elsewhere on the machine
- No multiplayer, marketplace, or IAP in this pass

## UX sketch

1. **Intro** — title + “Enter village” (optional mute / continue from local save)
2. **Main** — full-bleed isle canvas; HUD (top) and rail (side or bottom on phone)
3. **Isle** — procedural sky gradient, ground band, a few placeholder “buildings” / one gnome silhouette

## Success criteria

- `npm install` / `npm run dev` documented and working
- `npm run build` succeeds
- App runs on a phone-width viewport without horizontal overflow
- Product brief remains the locked source of truth for future agents
