# Parque D'Amour

A phone-first Canvas 2D game in strict TypeScript: a quaint Paris park of 48 x 48 tiles where visitors fall in love and the player, as **Cupid** or **Mischief**, assists or spoils the romances. Two modes: **Creator** (god view, park tools, abilities) and **Avatar** (possess a pigeon, a pomeranian, a flower seller and others). Built on the architecture and layout of the owner's single-file game Gnome Village (GV): soft-isometric rotatable camera, deterministic twin-RNG fixed-step loop, paper HUD, procedural Web Audio, zero image or audio assets.

This is the **Slice 0 scaffold**: the app boots to the intro, Begin shows the flat isometric starter park with the apron and the HUD shell, and every npm script runs. No game rules yet.

## 1. Quick start

```
npm install
npm run dev        # Vite dev server at http://localhost:5173/
npm run build      # single-file production build: dist/index.html
npm run preview    # serve the production build
npm run test       # Vitest
npm run shot       # screenshots of the built app into shots/ (needs npm run build first)
```

| Script | Does |
|---|---|
| `dev` | Vite dev server; `window.__PD` harness installed (also in production under `#debug`) |
| `build` | `tsc -b` then `vite build`; leaves exactly `dist/index.html` |
| `preview` | serves `dist/` |
| `lint` | oxlint over `src tests scripts vite.config.ts`; 0 errors |
| `typecheck` | `tsc -b`, strict, `noUncheckedIndexedAccess` |
| `test` / `test:watch` | Vitest (`tests/*.test.ts`, node environment) |
| `shot` | `node scripts/screenshot.mjs [name]`: serves `dist/`, drives `/opt/pw-browsers/chromium` through puppeteer-core, clicks Begin, writes `shots/<name>-390x844.png` (dpr 2) and `shots/<name>-1280x800.png`; exits 1 on any console error |
| `check` | typecheck, lint, test and build in one go |

Hash options: `#s=<seed>` fixes the park seed, `&halt` starts paused, `&debug` installs the harness in a production build.

## 2. The single-file build

`vite.config.ts` uses `vite-plugin-singlefile` with `base: './'`, `build.target: 'es2022'`, `assetsInlineLimit: 1_000_000` and `cssCodeSplit: false`. Every script, stylesheet and woff2 font is inlined into `dist/index.html`, which also opens from `file://`. The fonts (Fraunces, Figtree; Latin and Latin Extended subsets, 160 KB) are self-hosted under `src/fonts/` and declared in `src/styles/tokens.css`; nothing is fetched at runtime.

## 3. Layout

```
index.html              the DOM shell (ids fixed by docs/03 section 10.1), inline SVG mark and favicon
src/main.ts             boot: language, intro, then on Begin: park, renderer, rail, HUD, loop
src/core/               rng (twin mulberry32 streams), math, clock (T), weather, loop (fixed step 1/60 s), ids, events, commands
src/world/              grid (typed-array tile layers), park (gates, apron), gen (seeded starter park), water, wear, charm
src/entities/           visitors, needs, brain, act, move, astar, romance, creatures, staff, embarrass, names   (stubs in S0)
src/play/               mode, avatar, abilities, tools, undo, progression                                      (stubs in S0)
src/render/             camera, project, order, ambient (the scene palette), backdrop, ground, draw, ...
src/audio/              engine, limiter, cues, ambience, birds, music                                          (stubs in S0)
src/ui/                 dom, i18n, strings/en, strings/es, intro, rail, hud, sheets, card, feed
src/save/               schema, store, migrate                                                                (stubs in S0)
src/debug/              harness (window.__PD), perf
src/styles/             tokens.css (the paper tokens, fonts), shell.css (HUD, rail, card, sheets, intro)
src/fonts/              the four woff2 subsets
tests/                  Vitest: rng, clock, grid and gen, camera and projection, order, strings, source rules
scripts/screenshot.mjs  the screenshot script
docs/                   the design pack (see below)
```

Every file under `src/` starts with a header comment: its path, its responsibility, the GV lines it ports where any, and the `TODO(S<n>)` naming the build-plan slice that fills it.

## 4. Where the documents are

`docs/` holds the design pack. Read `docs/01-Decision-Register.md` first (the spine; every number, name and id), then `docs/00-Product-Brief.md`, then `docs/07-Build-Plan.md` section 0 and the slice you are on. `docs/03-Technical-Architecture.md` is the code contract (module map, data model, loop, commands, render, save, i18n). `docs/10-Gnome-Village-HTML-Architecture-Review.md` and `docs/gv-review-notes/` describe GV, the source being ported. `docs/README.md` indexes the pack.

## 5. Gates status

| Gate | Status | Effect |
|---|---|---|
| Style Gate (register section 4) | not passed | every scene colour in `src/render/ambient.ts` and the `--rose/--lawn/--gravel/--water/--awning` tokens are placeholders marked "TBD Style Gate"; no final prop, figure, ground or sky is drawn before the owner's pick |
| Music Gate (register section 4) | not passed | no cue or music work; `src/audio/` is stubs |

The theme colour and body background use the paper token `#F1EDF5` until the Style Gate (the product brief names GV's `#DCE6EC` for the interim; either is a one-line change in `index.html` and `tokens.css`).
