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
| Deploy | GitHub Pages at `/gnome-village/` (`vite` `base`) |

## Visual identity (non-negotiable)

These are SoT so a greenfield or later slice **cannot** “pass” while shipping dark game UI or system-ui brand chrome.

| Token / rule | Value / decision |
|---|---|
| HUD surface | **Paper** pastel — `--paper` `#F1EDF5`, `--paper-2` `#E6E0EF`, `--page` `#FAF8FD` |
| Glass chips | `--glass` `rgba(250,248,253,.88)` — frosted paper, not dark translucent panels |
| Ink (text) | `--ink` `#4A4458`, soft `--ink-soft` `#6E6680` — **not** near-white on dark |
| Accents | `--moss`, `--sky`, `--berry`, `--ember`, `--stone` (pastel); primary CTAs use **ink on paper**, not neon green on dark |
| No dark UI | Do **not** use dark game chrome (`#0f1a14` / `#1a2e22` / near-white text) as the brand shell |
| Type | **Fraunces** (display / titles) + **Figtree** (UI) only — not `system-ui` as the brand stack |
| Character hats | **Wren** pink `#EDA9C4`, **Bram** blue `#A6C7E8` — shown on the intro card |
| Theme color | `#F1EDF5` (paper), not dark greens |
| Favicon / marks | Paper / ink / moss or hat motif — no Vite purple |

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
- **Audio** is optional UX polish via Web Audio API oscillators / noise — no asset packs required. Unlock on user gesture; **Begin** may blip; **Continue** restores silently.
- **Storage** wraps get/set/clear for village state keys; never assumes a server.

## Greenfield scope (this repo)

1. Vite + React + TypeScript scaffold
2. Modular folders as above
3. Minimal working UI: intro or main chrome with HUD/rail placeholders + canvas isle with a simple procedural draw
4. Mobile-friendly viewport / CSS baseline **with paper HUD identity**
5. Docs, README, solid `.gitignore`
6. Local `main` commit ready to push (push is handled separately)
7. GitHub Pages workflow + `base: '/gnome-village/'`

## Non-goals (for this greenfield)

- No Phaser / Three.js / external game engines
- No auth, accounts, or cloud sync
- Do not copy prototype HTML from elsewhere on the machine
- No multiplayer, marketplace, or IAP in this pass
- No dark “game UI” shell that violates visual identity above

## UX sketch

1. **Intro** — Wren + Bram felt hats, title + Begin / Continue / Mute
2. **Main** — full-bleed isle canvas; paper glass HUD (top) and rail (bottom on phone)
3. **Isle** — soft-iso heightfield; Look / Raise / Lower tools; Fit; silent save

## Success criteria

- `npm install` / `npm run dev` documented and working
- `npm run build` succeeds (assets resolve under `/gnome-village/`)
- App runs on a phone-width viewport without horizontal overflow
- Visual identity non-negotiables satisfied (paper HUD, Fraunces+Figtree, ink, hats)
- Product brief remains the locked source of truth for future agents
