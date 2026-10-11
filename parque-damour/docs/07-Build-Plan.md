# Parque D'Amour: Build Plan

Version 1 · 2026-10-10 · Owner: Jeduthun Oosthuis · Author: Claude (design session)

**How to use this document.** This file turns the design pack into work. It is a list of slices, S0 to S12, in the order they are built. Each slice is a self-contained task brief: a model given only section 0 and its own slice section, plus the documents the slice names under "Read first", can do the work without reading the rest of the pack. Section 0 tells the person running the project how to brief a model and what to demand back. Sections 13 to 15 give the dependency graph, the effort estimates and the definition of done for v1. Every number, name and id here matches `01-Decision-Register.md` (the register); where this document needed a value the register does not define, the value is defined here and listed in section 16. "GV" is the owner's Gnome Village HTML; "GV 1234" is an absolute line in that file as indexed by `10-Gnome-Village-HTML-Architecture-Review.md` (the review). Module paths such as `src/play/tools.ts` are the fixed module map of the scaffold. Ranges are written with a hyphen (GV 6331-6358).

---

## 0. How to brief a model

### 0.1 Model tiers

| Tier | Use for | Must not be given |
|---|---|---|
| A | The strongest model available. Architecture-critical and aesthetics-critical work: the two gates (S1), the renderer (S2 part B), the romance core (S5), audio and music (S8), the figure rig, effects and light (S4 sub-brief, S9) | mechanical data entry (waste) |
| B | A mid model. Well-specified feature slices where every rule is written down: S0, S3, S4 (sim), S6, S7, S10, S11, S12 | any task whose brief says "present options" (that is Tier A) |
| C | A small model. Mechanical work from a table: string tables, tests written from a spec table, content data entry, names lists, the content test | anything that touches `src/entities`, `src/render`, `src/audio`, `src/core` or a design decision |

Rules: a Tier C task names the exact file to write and the exact table to copy from. A Tier B task never changes a number; it reports when a number is missing. A Tier A task may propose a number, listed under its hand-back "Assumptions". Any model may refuse a task whose brief contradicts the register; it must report the contradiction, not resolve it.

### 0.2 The prompt template (paste this, fill the angle brackets)

```
You are implementing slice <Sx> of Parque D'Amour, a phone-first Canvas 2D game in TypeScript.
App root: /home/user/gnome-village/parque-damour (later the repository parque-damour).
Read, in this order, before writing anything:
  1. docs/01-Decision-Register.md (the spine; every number, name and id)
  2. docs/00-Product-Brief.md sections 2, 8, 9, 10
  3. docs/07-Build-Plan.md section 0 and section <Sx> (your task)
  4. The documents and sections listed under "<Sx>.3 Read first"
Precedence: the register wins over the brief; the brief wins over every numbered document; a
numbered document wins over code comments. If your task and a higher document disagree, STOP,
write the disagreement in your hand-back report, and do not choose.
Options rule: if the task produces anything a player sees or hears (a prop, a figure, an effect,
a screen, a cue, a motif), render two or three small variants on a scratch page, screenshot
them, and show them before building the final one. Never start art or music work before the
matching gate is recorded as passed in the register section 4.
Touch only the files named under "<Sx>.5 Files". Create no file outside src/, tests/, tools/,
docs/, scratch/, shots/, .github/ and the app root (S12 adds resources/). Do not edit docs/01-Decision-Register.md unless the task says you are
recording a gate pick. Do not edit another slice's documents.
Hard rules: no Math.random, no Date.now in src/ outside core/loop.ts; no object references in
saved fields; no user-facing string outside src/ui/strings/; no colour literal outside
src/render/ambient.ts and src/styles/tokens.css; no image or audio asset files; no React; no
terrain heights; no water simulation; cite GV line numbers in comments for anything ported.
When done, run the common gate (build plan 0.5) and return the hand-back report (0.6).
Do not mark anything done that you did not run.
```

### 0.3 The precedence rule (verbatim, for every brief)

1. `01-Decision-Register.md`: every number, name, id and status.
2. `00-Product-Brief.md`: intent, scope, non-goals, success criteria.
3. The numbered design documents from `02-` on, including this file. `10-Gnome-Village-HTML-Architecture-Review.md` and `gv-review-notes/` are reference about GV, not rules for Parque.
4. Code comments and READMEs.
A conflict is a bug in the lower document. A model reports it and stops; it never resolves it by choice.

### 0.4 Present options before art or music (register row 26)

1. The Style Gate and the Music Gate (S1) block all art work from S2 on and all music and cue work from S8 on. "Passed" means the register section 4 row holds the owner's letter and a date.
2. Inside any later slice, a model that draws or sounds something new first renders two or three variants as tiles on a scratch page (`scratch/<slice>-<thing>.html`, not committed), screenshots them at 390x844, and shows them to the owner in the hand-back or mid-task. It builds the final one only after the owner's word.
3. A model that cannot reach the owner mid-task builds the variant that matches the picked style board tile most closely, says so under "Assumptions", and keeps the scratch page so the owner can pick later.

### 0.5 The common gate (part of every slice's "Done when")

Run from the app root. Every command must exit 0.

| # | Command | Must show |
|---|---|---|
| 1 | `npm run typecheck` | no errors (`tsc --noEmit`, strict) |
| 2 | `npm run lint` | 0 errors from oxlint over `src tests tools` |
| 3 | `npm test` | all Vitest files green, including `tests/determinism.test.ts` once it exists (S2) |
| 4 | `npm run build && ls dist` | exactly one entry: `index.html` (plus `style-board.html` and `music-board.html` from S1 on) |
| 5 | `npm run shot -- <slice>` | files `shots/<slice>-<name>.png` at 390x844, dpr 3; the script fails on any console error |
| 6 | `git status --short` | only files the slice names |

A slice that changes any file under `src/core`, `src/world`, `src/entities`, `src/play` or `src/save` must also show that `tests/determinism.test.ts` passed in the same run (row 3), and must list the `rngN` and `stateHash` values of its determinism fixture in the hand-back.

### 0.6 Hand-back report format (paste at the end of the task, under 60 lines)

```
HAND-BACK <Sx> <date>
1. Files created / changed: <paths>
2. Commands run and results: typecheck <ok|fail>, lint <n errors>, test <n passed/n failed>,
   build <ok|fail; ls dist output>, shot <paths of shots/*.png>
3. Done-when checklist: one line per item of <Sx>.8, PASS or FAIL with evidence (a number, a
   path, a test name)
4. Determinism fixture (if the slice touches the sim): seed, steps, rngN, stateHash, same on
   run 2 <yes|no>, differs with one extra command <yes|no>
5. GV lines ported: <module: GV a-b, ...>
6. Deviations from the brief: <none | list, each with why>
7. Assumptions I made (values not in the register or the docs): <list, each with the file>
8. Open questions for the owner: <list>
9. Options shown (if any): <scratch page path, screenshot paths, the owner's pick or "pending">
10. Known gaps or TODOs left in code: <none | list with file:line>
```

### 0.7 Rules for every slice (do not list)

1. Do not port GV terrain, erosion, flow, sea, floods, gorges, dams, bridges that span heights, boats, the flyer, the construction economy, households or babies (GV 699-812, 882-1358, 1985-2125, 2478-4221, 11323-12012; brief section 8.2).
2. Do not read `MODE`, `PLAYER`, the camera or the DOM inside `src/entities`, `src/world` or `src/core` except the one branch at the decide cadence (03 section 4.4).
3. Do not mutate simulation state from `src/ui`, `src/render`, `src/audio` or `src/debug`; enqueue a `Command` (03 section 5).
4. Do not write a user-facing string, a feed line, a toast or an aria-label as a literal; add the key to `src/ui/strings/en.ts` and `es.ts` and call `t()`.
5. Do not add a scene colour literal outside `src/render/ambient.ts` or a HUD colour outside `src/styles/tokens.css` (04 section 4.5).
6. Do not call `Math.random`, `Date.now` or `performance.now` outside `src/core/loop.ts` and `src/core/rng.ts` tests; the sim uses `rng()`, everything visual or audible uses `vrng()`.
7. Do not add an image, SVG file, font beyond Fraunces and Figtree, or audio file. Inline SVG markup in `index.html` is allowed (04 section 12 item 12).
8. Do not round, rename or "improve" a number or an id. The register section 3 and section 5 spellings are exact.
9. Do not leave a `TODO` without listing it in the hand-back item 10.
10. Do not commit `node_modules`, `dist`, `shots` or `scratch`.

---

## S0. Scaffold: verify, then finish

### S0.1 Goal
Confirm that the scaffold a parallel agent created matches `03-Technical-Architecture.md` sections 10 and 14, and fill every gap. At the end the app boots to an intro, Begin shows a flat isometric lawn with the HUD shell, and every npm script runs.

### S0.2 Model tier
Tier B. The verify half may be Tier C if the finish half is handed to Tier B afterwards.

### S0.3 Read first
03 section 2.1 (dependency direction), 2.2 (`main.ts` boot order), 10.1 (DOM ids), 10.2 (body classes), 14 (build and tooling); 04 section 1.10 (glass recipe), 5.2 (tokens, type scale), 5.3 (z-index map); brief section 2 (stack) and 3.2 (tokens). 08 section 2.1 `rng.test.ts`; 09 section 2.2 `rng.ts`, `math.ts`, `loop.ts`.

### S0.4 Inputs that already exist
Whatever the parallel agent produced under `/home/user/gnome-village/parque-damour`. At the time of writing only `docs/` existed; treat every row of S0.6 as unverified.

### S0.5 Files to create or change
`package.json`, `vite.config.ts`, `tsconfig.json`, `.oxlintrc.json`, `index.html`, `src/main.ts`, `src/styles/tokens.css`, `src/styles/shell.css`, `src/core/rng.ts`, `src/core/loop.ts`, `src/core/math.ts`, `src/render/draw.ts`, `src/render/camera.ts`, `src/render/project.ts`, `src/ui/dom.ts`, `src/ui/i18n.ts`, `src/ui/strings/en.ts`, `src/ui/strings/es.ts`, `tools/shot.mjs`, `tests/rng.test.ts`, `.gitignore`, `README.md`, `.github/workflows/pages.yml`, and one stub per remaining module-map path (a file whose only content is a header comment naming its slice).

### S0.6 Steps: the verify task
Run every check from the app root. Record PASS or MISSING per row in the hand-back.

| # | Must exist | How to check |
|---|---|---|
| 1 | `package.json` scripts `dev, build, preview, test, test:watch, lint, typecheck, shot, check, det, perf` (03 section 14) | `node -e "console.log(Object.keys(require('./package.json').scripts).join(' '))"` |
| 2 | devDependencies `vite, typescript, vitest, oxlint, vite-plugin-singlefile, puppeteer-core, jsdom`; no `dependencies` | `node -e "const p=require('./package.json');console.log(p.dependencies||'none',Object.keys(p.devDependencies).join(' '))"` |
| 3 | `vite.config.ts`: `viteSingleFile()`, `base: '/'`, `build.target: 'es2020'`, `assetsInlineLimit: 1_000_000`, `cssCodeSplit: false` | `grep -n -e viteSingleFile -e base -e es2020 -e assetsInlineLimit -e cssCodeSplit vite.config.ts` |
| 4 | `tsconfig.json`: `strict`, `ES2020`, `ESNext`, `bundler`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `isolatedModules`, `types: ["vite/client"]` | `grep -c -e strict -e noUnusedLocals -e noUnusedParameters -e noFallthroughCasesInSwitch -e noImplicitOverride -e isolatedModules -e vite/client tsconfig.json` prints 7 |
| 5 | `.oxlintrc.json` with `no-restricted-globals` for `Math.random` and `no-restricted-imports` for the layer rule (03 section 14) | `cat .oxlintrc.json` |
| 6 | `index.html` holds every DOM id of 03 section 10.1 | `for id in stage cv hudClock wdot tPhase tDay hudVisitorsWrap hudVisitors tPop bAdd hudRomance tRom hudPoints tCP tMP card cName cSub cRel cBars cDo cPin rail groups tools row2 sizewrap size depth bPlace bCancel bUndo cdChip row3 bHalt spdR spdLbl bRotL bRotR bFit bMute bMode bPhoto bNew census romances progress evlog picker options snd perf hint feed intro iTitle iP begin bContinue lang photoX confirm confirmText confirmYes confirmNo; do if ! grep -q "id=\"$id\"" index.html; then echo "MISSING $id"; fi; done` prints nothing |
| 7 | `index.html` head: `viewport-fit=cover, maximum-scale=1`, `theme-color #DCE6EC`, inline SVG favicon, no `<link>` to any network host | `grep -n -e viewport -e theme-color -e googleapis -e "<link" index.html` |
| 8 | `src/styles/tokens.css` holds the 14 tokens of brief section 3.2 with the exact values | `grep -c -e "--paper:" -e "--paper-2:" -e "--ink:" -e "--ink-soft:" -e "--moss:" -e "--sky:" -e "--berry:" -e "--ember:" -e "--stone:" -e "--glass:" -e "--glass-line:" -e "--shadow:" -e "--ui:" -e "--display:" src/styles/tokens.css` prints 14 (one token per line) |
| 9 | `src/styles/shell.css` uses only `var(--...)` colours; minimum font size 11 px | `grep -n -e "#[0-9A-Fa-f]\{3,6\}" -e "rgba\?(" src/styles/shell.css` prints nothing; `grep -n "font-size" src/styles/shell.css` shows no value under 11px |
| 10 | Every module-map path exists | `for f in main.ts core/rng.ts core/math.ts core/ids.ts core/clock.ts core/weather.ts core/loop.ts core/commands.ts core/events.ts world/grid.ts world/park.ts world/gen.ts world/water.ts world/wear.ts world/charm.ts entities/visitor.ts entities/needs.ts entities/brain.ts entities/act.ts entities/move.ts entities/astar.ts entities/romance.ts entities/creatures.ts entities/staff.ts entities/embarrass.ts entities/names.ts play/mode.ts play/avatar.ts play/abilities.ts play/tools.ts play/undo.ts play/progression.ts render/camera.ts render/project.ts render/order.ts render/ambient.ts render/backdrop.ts render/ground.ts render/water.ts render/props.ts render/flora.ts render/figures.ts render/creatures.ts render/effects.ts render/ghost.ts render/draw.ts audio/engine.ts audio/limiter.ts audio/cues.ts audio/ambience.ts audio/birds.ts audio/music.ts ui/dom.ts ui/hud.ts ui/rail.ts ui/card.ts ui/sheets.ts ui/feed.ts ui/intro.ts ui/i18n.ts ui/strings/en.ts ui/strings/es.ts save/schema.ts save/store.ts save/migrate.ts debug/harness.ts debug/perf.ts styles/tokens.css styles/shell.css; do if ! test -f src/$f; then echo "MISSING $f"; fi; done` prints nothing |
| 11 | `src/core/rng.ts`: two mulberry32 streams with a draw counter (GV 583-598), API of 03 section 2.3 | `tests/rng.test.ts` passes: same seed gives the same 1000 draws; `rngN()` counts |
| 12 | `src/core/loop.ts`: fixed step `SIM_DT = 1/60`, `nsMax`, wall budget, lite bits, backlog drop (GV 12070-12096) | read the file against 03 section 4.1 items 1 to 5 |
| 13 | `src/main.ts` boot order of 03 section 2.2: intro, Begin, loop | open `dist/index.html`; Begin hides the intro and the canvas animates |
| 14 | A flat 48x48 iso lawn with an 8-tile apron is drawn at `fitCam()` zoom with `TW 26, TH 13, VANCH 0.46` (03 section 7.1) | `shots/s0-phone.png` and `shots/s0-desktop.png` |
| 15 | `tools/shot.mjs` per 03 section 14: `/opt/pw-browsers/chromium`, 390x844, dpr 3, clicks `#begin`, writes `shots/<slice>-<name>.png`, fails on console errors | `npm run shot -- s0` |
| 16 | `npm run build` leaves exactly `dist/index.html` | `ls dist` |
| 17 | `tests/` with Vitest configured in `vite.config.ts` (`test: { environment: 'node' }`, jsdom per file where needed) | `npm test` |
| 18 | `.gitignore`: `node_modules`, `dist`, `shots`, `scratch` | `cat .gitignore` |
| 19 | Fonts: `src/fonts/fraunces-*.woff2`, `src/fonts/figtree-*.woff2`, Latin plus Latin Extended subsets, both families under 400 KB together, `@font-face` in `shell.css` | `du -ch src/fonts/*.woff2` (read the total line) |
| 20 | `.github/workflows/pages.yml` present (not active until the repository move, register section 7) | `cat .github/workflows/pages.yml` |
| 21 | `README.md` listing the scripts and the docs index | `cat README.md` |
| 22 | `src/ui/i18n.ts` with `t()` and the two tables holding at least the intro keys; `<html lang>` follows `setLang` | `npm test` includes a parity test stub |

### S0.7 Steps: the finish task (for every MISSING row)
1. Create the missing file exactly as the row and its cited section describe. Do not invent a different layout.
2. For row 14: `render/draw.ts` paints the 2304 tiles as diamonds in `--moss` tinted paper, the apron as a paler band, with a bbox cull; no props, no entities. `camera.ts` holds `cam`, `resize` (dpr capped at 2), `fitCam` and `clampCam` (03 section 7.1 items 4 and 5). Gestures may be deferred to S2.
3. For row 15: the script waits for the `data-day` attribute on `body` to change when a day count is requested; S0 only needs the intro click and one capture.
4. For row 19: download the woff2 subsets once with the proxy, commit them under `src/fonts/`; if the network refuses, keep the font stacks' system fallbacks, leave the `@font-face` rules in place with the file names, and list the gap in the hand-back. S11 closes it.
5. For row 20 write this workflow and leave it inactive (it only triggers on the new repository's `main`):

```yaml
name: pages
on: { push: { branches: [main] } }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run check
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages }
    steps:
      - id: d
        uses: actions/deploy-pages@v4
```
6. Run the common gate.

### S0.8 Done when
1. Every row of S0.6 is PASS.
2. The common gate (0.5) passes; `npm run check` exits 0.
3. `shots/s0-phone.png` (390x844) shows: a green diamond filling about 60 % of the height with a paler apron around it; the four HUD chips at the top left and right with placeholder text from `t()`; a three-row rail at the bottom with the Park | Cupid | Mischief switch, an empty strip, and row 3 buttons; nothing under the top or bottom safe areas; no horizontal scroll bar.
4. The intro at 390x844 shows the mark, the title "Parque D'Amour", Begin, and the EN / ES toggle (04 section 5.7); Continue is hidden (no save yet).

### S0.9 Tests to add
`tests/rng.test.ts` (same seed, same sequence; `rngN` increments; the visual stream does not move `rngN`); `tests/strings.test.ts` stub (key parity of `en` and `es`).

### S0.10 Out of scope
Any game rule, any prop, any sound, the style and music boards, gestures beyond pan (S2), the save store (S3).

### S0.11 Ask the owner before
Changing any token value of brief section 3.2; adding a dependency to `dependencies`; choosing a different font family when the woff2 download fails.

### S0.12 Hand-back
Format 0.6. Item 3 is the 22-row table with PASS or FIXED per row.

---

## S1. Style Gate and Music Gate

### S1.1 Goal
Build `style-board.html` (three art directions drawn with the real render primitives) and `music-board.html` (three motifs played by the real audio engine), show them to the owner, and record the two picks. Nothing visual or audible beyond the boards is built in this slice.

### S1.2 Model tier
Tier A. The slice is two independent sub-briefs, S1a (style) and S1b (music), which two Tier A models may run in parallel.

### S1.3 Read first
S1a: 04 sections 2 (the three references, with the images in `docs/reference-art/`), 3 (the three directions, all 16 palette tokens and the treatment table), 4 (the board specification, tile by tile), 5.1, 5.2, 6.2, 6.3, 7.1, 7.4, 12 (checklist); register section 4 Style Gate row; brief section 3.
S1b: 05 sections 1, 2 (engine port, line by line), 2.3, 2.4, 5 (the waltz), 6 (the board specification), 7.1, 7.5; register section 4 Music Gate row; brief section 4. 08 section 2.8; 09 section 2.7.

### S1.4 Inputs that already exist
S0: the shell, `tokens.css`, `render/camera.ts` and `project.ts` (projection), `core/rng.ts` (`vrng`), `ui/i18n.ts`, `save/store.ts` stub.

### S1.5 Files to create or change
S1a: `style-board.html` (app root), `src/debug/style-board.ts`, `src/render/ambient.ts` (`PALETTES`, `STYLES`, `style()`, `computeAmbient`, `lit`, `GC`), `src/render/ground.ts` (tile sampler only), `src/render/flora.ts` (tree shapes, crown phase), `src/render/props.ts` (bench, lamp, fountain, facade bay), `src/render/figures.ts` (rig), `src/render/creatures.ts` (pigeon, pomeranian), `src/render/backdrop.ts` (sky ramp), `src/render/effects.ts` (hearts, spray and ripple particles only), `src/save/store.ts` (`profile.stylePick`), `src/ui/strings/en.ts` and `es.ts` (board keys), `vite.config.ts` (second entry).
S1b: `music-board.html`, `src/debug/music-board.ts`, `src/debug/motifs.ts` (motifs B and C), `src/audio/engine.ts`, `src/audio/limiter.ts`, `src/audio/music.ts` (motif A), `src/audio/cues.ts` (only the five cue-bed cues `laugh, kiss, gasp, fireworks, splat`), `src/save/store.ts` (`profile.musicPick`), strings, `vite.config.ts` (third entry).
On the pick: `docs/01-Decision-Register.md` section 4 (two rows), `src/styles/tokens.css`, `index.html` (theme colour), `src/render/ambient.ts` (default letter), `src/audio/music.ts` (default motif).

### S1.6 Steps
S1a, the style board:
1. Add the `Palette` and `StyleSpec` types of 04 section 4.5 to `ambient.ts`; fill `PALETTES.A/B/C` from 04 section 3.1 and `STYLES` from 04 section 3.2 (line, shading, grain, theme colour). Export `style()` returning `STYLES[profile.stylePick ?? 'A']`.
2. Write one function `renderTile(n: 1..13, spec: StyleSpec, canvas)` that draws tile `n` of 04 section 4.2 using the primitives in `ground.ts`, `flora.ts`, `props.ts`, `figures.ts`, `creatures.ts`, `backdrop.ts`, `effects.ts`. Every primitive takes `spec` (or reads `style()`) and draws nothing from a literal colour.
3. Implement the three treatments inside the primitives, not in the board: direction A soft contour and gradients, B flat two-tone with no outlines, C jittered ink from `nzAt` plus wash and the paper-grain multiply pass (04 section 3.2, 3.3).
4. Lay out the page as 04 section 4.3 (phone: switch A | B | C and a 2-column grid; desktop: three 400 px columns, aligned rows).
5. Add the Choose buttons of 04 section 4.4; they write `profile.stylePick` through `store.ts` and toast `t('gate.picked.style', { name })`.
6. Register `style-board.html` as a second Vite entry so `dist/style-board.html` is one file.
7. Screenshot each direction at 390x844 (dpr 3) and 1280x800 (dpr 2): `shots/s1-style-A.png` to `s1-style-C.png` and the desktop `s1-style-all.png`.
8. Hand the owner the four screenshots and the page. Wait for the letter.
S1b, the music board:
9. Port the engine per 05 section 2.1 (table rows for `engine.ts`, `limiter.ts`), with the three buses of 05 section 7.1, `makeIR` on the private stream (05 section 1 item 6), `grain()` per 05 section 2.3 item 5.
10. Write `music.ts` as motif A exactly per 05 section 5.1 to 5.8 (16-bar G major loop, oom-pah-pah bass, melody generator on `vrng`, accordion voice, state table, ducking, look-ahead scheduler). The state input is a stub object `{ featuredStage, affinityDelta, light, parted, happily, fireworks, buskerPan }` the board sets by buttons; S8 wires it to the simulation.
11. Write motifs B and C in `src/debug/motifs.ts` per 05 section 6.2, each implementing the `Motif` interface with the nine knobs of 05 section 6.3 and both variants.
12. Build the page per 05 section 6.4: the sound-enable banner, A | B | C, the panel (caption, Play rising, Play parted, Stop, nine sliders, `<pre id="readout-X">` JSON, Choose), Stop all, the cue bed.
13. Register `music-board.html` as a Vite entry. Verify on desktop Chromium and at 390x844 by hand (puppeteer cannot hear; it only checks console errors).
14. Hand the owner the page. Wait for the letter and the readout JSON.
Recording the picks (one model, after both letters):
15. In `docs/01-Decision-Register.md` section 4, append to the Style Gate row "Picked: <letter> <name> on <date>" and to the Music Gate row "Picked: <letter> <name> on <date>; knobs: <JSON>". Bump the register version line to "Version 1.1 · <date>". Change nothing else in the register.
16. In `src/styles/tokens.css` add `--theme-color` and `--body-bg` set to the picked direction's two values from 04 section 3.2 (last row); set `<meta name="theme-color">` in `index.html` to the same; set `DEFAULT_STYLE` in `ambient.ts` to the letter so `style()` returns it when the profile holds `null`.
17. Set `DEFAULT_MOTIF` in `music.ts` to the letter; if B or C was picked, note in the hand-back that S8 moves that motif from `debug/motifs.ts` into `music.ts` (05 section 6.5 item 3). Apply the knob JSON as the defaults of the picked motif.

### S1.7 Done when
1. 04 section 4.2 "Done when": all 13 tiles render in all three columns with zero console errors, each tile from the same function with a different `StyleSpec`.
2. 05 section 6.5 item 4: all six Play buttons sound, Stop silences within 0.3 s, every knob changes its motif audibly, Choose writes the profile, the readout parses.
3. `grep -rn "#[0-9A-Fa-f]\{3,6\}\|rgba\?(\|hsl(" src --include=*.ts | grep -v "render/ambient.ts"` prints nothing.
4. The register section 4 holds both picks with dates; `tokens.css` holds `--theme-color` and `--body-bg`; `ambient.ts` and `music.ts` hold the default letters.
5. The common gate; `ls dist` shows `index.html style-board.html music-board.html`.

### S1.8 Tests to add
`tests/palette.test.ts` (every key of `Palette` exists in all three palettes; a string value is a 7-character hex, an array value holds only such strings; 04 section 4.5 item 1); `tests/limiter.test.ts` (05 section 8.2 item 1); `tests/melody.test.ts` (05 section 8.2 item 3); `tests/colour-literals.test.ts` (the grep of S1.7 item 3 as a test).

### S1.9 Out of scope
The park, the pipeline, any prop beyond the 13 tiles, cues beyond the five of the cue bed, ambience, birds, the Sound check sheet, the Options sheet.

### S1.10 Ask the owner before
Changing any hex in 04 section 3.1 (offer a variant tile instead); adding a fourth direction or motif; changing `FH` (04 section 13 item 1 is the owner's open point, show tile 7 and ask); changing the base tempo 164 or the key G; recording a pick the owner has not stated in words.

### S1.11 Hand-back
Format 0.6, with item 9 holding all screenshot paths and the readout JSON, and a line "Register section 4 updated: yes/no".

---

## S2. World and renderer core

### S2.1 Goal
Build the deterministic engine (rng, clock, weather, events, commands, loop, grid, park, starter park, static water, wear) and the renderer core (camera, gestures, projection, painter order, ambient light, backdrop, ground, water, props, flora, pipeline) so the seeded starter park draws at 390x844 in the picked style with no visitors yet.

### S2.2 Model tier
Part A (steps 1 to 15, engine): Tier B; it needs no gate and may start while S1 runs. Part B (steps 16 to 27, renderer): Tier A; it starts after the Style Gate is recorded.

### S2.3 Read first
Register sections 3.1, 3.2, 6. 02 sections 2 (the park, gates, starter park, props), 3 (time, light, weather), 11.1 (wear), 14 (two-player hook). 03 sections 2.3, 2.4, 2.7, 3.1, 3.2, 3.6, 3.11, 4 (the loop), 5 (commands), 6.1, 6.2, 7 (rendering), 8 (input), 11 (state hash row), 13 (harness), 15 (performance). 04 sections 5.1, 6 (prop vocabulary), 10.1, 12. Review sections 2.1, 2.4, 7.1 to 7.4, 9, 13, 14 (rows "Core & loop", "World state", "Renderer"). Notes `02-notes.md`, `03-notes.md`, `13-notes.md`, `16-notes.md`, `17-notes.md` for line-level detail. 08 sections 2.1, 2.2, 2.9, 3; 09 sections 2.2, 2.3, 2.6, 3.

### S2.4 Inputs that already exist
S0 shell and loop skeleton; S1 primitives in `render/*` drawn with `style()`; `ambient.ts` palettes; the register's pick.

### S2.5 Files to create or change
Part A: `src/core/rng.ts`, `math.ts`, `ids.ts`, `clock.ts`, `weather.ts`, `events.ts`, `commands.ts`, `loop.ts`; `src/world/grid.ts`, `park.ts`, `gen.ts`, `water.ts`, `wear.ts`, `charm.ts` (empty field API only); `src/save/schema.ts`, `src/save/store.ts` (`snapshot`, `restore`, `stateHash`, no localStorage yet); `src/debug/harness.ts`, `src/debug/perf.ts`; `tools/det.mjs` (08 section 3.4); `tests/determinism.test.ts`, `tests/clock.test.ts`, `tests/weather.test.ts`, `tests/events.test.ts`, `tests/loop.test.ts`, `tests/gen.test.ts`, `tests/park.test.ts`, `tests/water.test.ts`, `tests/commands.test.ts`.
Part B: `src/render/camera.ts`, `project.ts`, `order.ts`, `ambient.ts`, `backdrop.ts`, `ground.ts`, `water.ts`, `props.ts`, `flora.ts`, `effects.ts` (particle system), `ghost.ts` (stub), `draw.ts`; `src/main.ts` (wiring); `src/ui/hud.ts` (clock chip only); `tools/shot.mjs` (day wait); `tests/project.test.ts`, `tests/order.test.ts`, `tests/pick.test.ts`.

### S2.6 Steps
Part A, engine (Tier B):
1. `rng.ts`: finish the API of 03 section 2.3 including `simState/setSimState`.
2. `math.ts`: `clamp, clamp01, lerp, smooth, TAU, noise2, fbm2, hx (3-digit hex fixed), mixc, css, cheb, fnv1a` (GV 578-582, 599-609).
3. `ids.ts`: allocators per 03 section 2.3; `PropId` free list; `idsState/setIdsState`.
4. `clock.ts`: `DAYLEN 360`, `SEASON_DAYS 3`, `START_ABS 0.30`; `T.abs = START_ABS + tick / (60 * DAYLEN)`; `phaseOf(f)` by the eight bands of register 3.2; `light` by the piecewise-linear table of 02 section 3.2; `lamps = f >= 0.80 || f < 0.28`; emit `newday`.
5. `weather.ts`: the eight kinds with the targets, durations and per-season weights of 02 section 3.3, eased with a 2.6 s half-life (GV 846-881); first change at 40 s; start `fair`; the override list and `weatherAt` of 02 section 3.5 (data only; S9 draws them); `WET` rise 0.2/s at rain > 0.3 and fall 0.01/s (02 section 2.2).
6. `events.ts`: `on, watch, emit, drain(lite)` per 03 section 2.3; the lite bits of 03 section 4.5.
7. `commands.ts`: the union of 03 section 5.1, `enqueue` (stamp `tick + 1`, `seq`), `applyPending` ordered by `(tick, side park < cupid < mischief, seq)`, `applyCommand` with the `Result` type, the log of 600, `replay`. In S2 only `speed`, `park.new` and `debug` apply; the others return `reason.not_here` until their slice.
8. `loop.ts`: `frame` and `simulate` exactly as 03 sections 4.1 and 4.2, phases 1 to 4, 11 and 13 active, the rest as no-op calls kept in order; `SP` laps.
9. `grid.ts`: `N 48, S 1, NC 2304, I, inB`, the nine saved layers plus `E` and `BLOCK` (03 section 3.2), `Kind` enum, `layersState/setLayersState`.
10. `park.ts`: `APRON 8`, the five gates with the tiles, `outside` tiles and weights of 02 section 2.4, `nearestGate`, `isBoundary`, `isGateTile`, and `BACKDROP` (quay y = -1, river y = -2 to -8, pavement 1 tile, facade blocks 2x3 at 2 to 8 tiles on E, S, W, skyline band; 03 section 7.4).
11. `gen.ts`: the starter park of 02 section 2.5 exactly (fountain 2x2 at (23,23), flagstone ring, inner loop at Chebyshev 5 and 6, outer at 13 and 14, five spokes, pond in (30,8)-(37,13) with the neck at (34,11)-(34,12) and a span-2 bridge, six benches at the six angles, two 2x2 beds, kiosk at (14,44) with two tables east, four lamps, twelve trees 4/4/4 with the spacing rules). Reseed both streams from the seed first (GV 887).
12. `water.ts`: `waterBodies` by flood fill over `KIND` 5 and 6, `bodyAt`, `findCrossing` (02 section 8.3 bridge rule: shortest straight N-S or E-W crossing through the tile, land both ends, at most 4 water tiles), `stepIce` (02 section 3.3 snow row: `ICE = 1` after 60 s of snow, 0 after 120 s without).
13. `wear.ts`: `wearAt` and `decayWear` as GV 1674-1687 with the formula of 02 section 11.1 items 1 and 2; `findPavingRun` per item 4; `markPaved` writes `PAVEDAY`.
14. `store.ts` (in-memory only): `snapshot()` and `restore()` over `ParkSaveV1` (03 section 3.10), `stateHash()` exactly as 03 section 11; `harness.ts` installs `window.__PD` per 03 section 13 under `import.meta.env.DEV`; add `worldHash()` (hash of the nine layers and `props` only) for tool tests.
15. `tests/determinism.test.ts`: seed 101, run 64,800 steps (3 days) with a scripted log of 12 commands (`speed` changes and `debug setWeather`), record `stateHash` and `rngN`; run again, assert equal; run a third time with one extra `setWeather` at step 30,000, assert different. Also 03 section 4.5 "Done when": 1x and 8x paths give the same hash (drive `simulate` with `lite` 1 and 3). `tools/det.mjs`: write the script per 08 section 3.4 (the same fixture through `__PD` in Chromium) and run it once in the hand-back.
Part B, renderer (Tier A, after the Style Gate):
16. `camera.ts`: port GV 6331-6358 (`cam`, `resize` with dpr cap 2, `setAngle`, `rotXY`, `rotVec`, `turnStep`), 6400-6416 (`fitCam` over the 64x64 box, `clampCam` with the register's floor 0.30), 11168-11230 (`setupInput`: pan, pinch, twist with the 0.06 rad dead zone, tap under 9 px and 420 ms, wheel x1.12 / x0.89, drag-paint throttle), 11280-11322 (`followStep`, `focusY`, `keepCentre`, `centreOn`), 12142-12154 (quarter turns, Fit).
17. `project.ts`: `screenOf` (GV 6382-6384 without the `SEAS` term), the closed-form `screenToTile` of 03 section 7.1 item 6 (GV 6423-6443 is not ported), `pickAt` priority of 03 section 8.2 (people, creatures, props, tile).
18. `order.ts`: counting sort into 1/64-tile buckets over drawables (GV 6367-6373), ties by lower id.
19. `ambient.ts`: `computeAmbient`, `lit`, `GC` (GV 6452-6478) with the golden-hour windows of 03 section 7.3 item 2 and the season tint hook.
20. `backdrop.ts`: sky ramp, stars, sun on the corrected arc, moon, clouds into an offscreen canvas at 260 ms (GV 6480-6618, 6525-6534); the skyline band offset by `cam.ang` (GV 6511-6516 far-shore idea); apron ground polygons; apron drawables (railings per boundary tile, five gates, facade blocks as iso boxes GV 6953-7035, quay wall, awnings) with the near-side cutaway rule (03 section 7.4 item 4).
21. `ground.ts`: epoch cache `TILE_COL/TILE_EP` (GV 9449-9465, cadence 9586-9587), `groundCol` reduced per 03 section 7.5 item 3 (GV 6665-6741 rule stack without slope, AO or gradients), the tile pass grouped by colour, worn-lawn ribbons (GV 8654-8776) at `z >= 0.45`, bed flowers by `BEDC` at `z > 0.8`.
22. `water.ts`: pond and canal outlines as cached paths on a water epoch (GV 9034-9177 field and `waterPath`, 9260 `strokeBanks`), fill, rim, ice state, ripples at `z > 0.7` (GV 9981 ripples only).
23. `props.ts`: `drawProp` for bench (4 facings), lamp (three-globe, lit state), fountain 2x2, kiosk 2x2 with awning, table, bandstand 3x3, picnic 2x2, bridge 1 to 4, hedge (auto-join), tree via the sprite cache (GV 6782-6835, key per 03 section 7.7 item 2); culls per 03 section 15.2 item 6.
24. `flora.ts`: `treeShape` for plane, chestnut, lime (GV 1692-1728 shape builder), `crownPhase` by 02 section 3.4, `drawBedTile`, `drawHedge`.
25. `effects.ts`: the particle system `P` with cap 220 and `updateParts` on the visual stream (GV 2386-2408, 8609), stepped on the frame (03 section 4.1 item 7); fountain spray from `ambientFx`, never from `drawProp`.
26. `draw.ts`: the eight-phase pipeline of 03 section 7.9 (GV 12042-12053, 9578-9600); `perf.ts` `ftNote` and the `#perf` overlay (GV 12057-12069).
27. `main.ts`: wire Begin to `newPark(seed)`, the hash `#s=<seed>&halt` (GV 12097, 814, 12115), rotate, Fit, speed, pause; `hud.ts` writes the clock chip (weather dot, phase word, Day N, season) every 0.35 s.

Port list for part B (cite in comments):
| Module | PORT (as is) | ADAPT (reshape) | Do not port |
|---|---|---|---|
| `camera.ts` | 6331-6358, 6400-6416, 11168-11230, 11280-11322, 12142-12154 | zoom floor 0.30; box 64x64 | `fitZ * 0.85` floor (6410) |
| `project.ts` | 6382-6384, 11231-11250 | closed-form inverse | 6417-6443 (`projectVerts`, quad walk) |
| `order.ts` | 6367-6373 | over drawables each frame | 6364 `lodCS`, coarse lattice |
| `ambient.ts` | 6452-6478 | golden windows 0.72-0.80 | storm cover 6458 |
| `backdrop.ts` | 6480-6618, 6953-7035 | sun arc, skyline band, apron | 9282-9337 sea sheet, 6511 horizon sea |
| `ground.ts` | 9449-9465, 9586-9587, 8654-8776, 6631 | `groundCol` reduced | 8923-8961, 9471-9527, 6665 slope and sand terms |
| `water.ts` | 9034-9177, 9260 | static epoch | 1151-1298 solver, 9338-9470 flow colour, 9981 tumble lips |
| `props.ts`, `flora.ts` | 6782-6835, 6837-6944, 1692-1728, 6749-6781 | French props | 6952-8044 house kit beyond the box primitives |
| `effects.ts` | 2386-2408, 8609 | frame-stepped | 8820-8847 fireflies (S9 reshapes) |
| `draw.ts` | 12042-12053, 9578-9600, 9634 | eight phases | 9604-9977 bucket rules for heights |

### S2.7 Done when
1. The common gate; `tests/determinism.test.ts` green with the values in the hand-back.
2. `shots/s2-park-0.png` to `s2-park-3.png` (four quarter turns at the default zoom 1.3 centred on the fountain, f = 0.30, seed 101) each show: the fountain at the centre; two 2-wide gravel loops; five spokes to five gates; the pond with its bridge; six benches; two beds; the kiosk with two tables near the south-west gate; four lamps; twelve trees of three visibly different species; railings on three sides; the quay and river on the north side; facades beyond the railings with the near-side ones cut away; the skyline with the Eiffel Tower silhouette turning with the camera.
3. `shots/s2-fit.png` at `fitCam()` shows the whole park and apron with no part of the park off screen.
4. `shots/s2-zoom-03.png` (zoom 0.30) and `s2-zoom-24.png` (zoom 2.4) draw with no console error; at 0.30 every tile is visible and the perf overlay shows draw EMA under 8.6 ms on desktop Chromium (03 section 7.9).
5. The clock chip reads "Morning · Day 1 · Spring" with a fair-weather dot; at 8x the chip walks through all eight phase words and four seasons over 12 days with no console error.
6. `pickAt` unit test: a tap on the fountain's screen point returns `{ kind: 'prop' }` with the fountain id at all four angles.

### S2.8 Tests to add
`determinism.test.ts`, `clock.test.ts` (band edges, lamps rule, `newday`), `weather.test.ts` (weights sum to 100 per season; `weatherAt` inside and outside an override), `gen.test.ts` (fixed skeleton tiles; seed-varied items; `inB` gates), `water.test.ts` (`findCrossing` cases: 1 to 4 tiles, too wide, no land), `commands.test.ts` (ordering, `tick + 1` stamping, log cap 600, rejection reasons), `project.test.ts` (`screenToTile(screenOf(x, y))` round trip at four angles and three zooms), `order.test.ts` (stable ties), `loop.test.ts` (`nsMax`, lite bits and budgets of GV 12082-12083), `park.test.ts` (gate tiles, `inB`, `isBoundary`, `nearestGate`), `pick.test.ts` (`pickAt` priority; the fountain at all four angles), `events.test.ts` (`on` at once, `watch` after `drain`; lite bits drop only `fx` and `cue`).

### S2.9 Out of scope
Visitors and creatures (S4), tools and ghosts (S3), localStorage (S3), weather visuals, lamp halos and season tints (S9), gestures for painting (S3 wires them), any sound.

### S2.10 Ask the owner before
Changing `TW, TH, EH, VANCH`, the zoom floor, the apron size or any starter park coordinate; replacing the counting sort with a different order; showing a facade variant (present options first, 0.4).

### S2.11 Hand-back
Format 0.6 with item 5 as the port table above marked done per row, and the perf overlay numbers at zoom 0.30, 1.3 and 2.4.

---

## S3. Park tools, ghosts, undo, save and continue

### S3.1 Goal
The sixteen park tools place, validate with ranked reasons and undo through commands; the park and profile autosave to localStorage; the intro offers Continue; New asks to confirm.

### S3.2 Model tier
Tier B.

### S3.3 Read first
Register 3.7, 3.11. 02 sections 2.2, 2.3, 2.6, 8 (creator mode: rail rows, tool classes, the sixteen tools, ranked reasons, undo), 12.5 item 4. 03 sections 2.6 (`tools.ts`, `undo.ts`), 2.9 (`dom.ts`, `rail.ts`, `intro.ts`), 2.10 (`save/*`), 5.1 (`ToolPayload`), 5.4 (reason keys), 5.6 (undo), 7.8 item 3, 8.1 item 4, 8.2 item 3, 10.4, 11. 04 sections 5.4 (rail), 5.7 (intro with Continue). Review section 4 (tools, undo), 3.4 (pick, ghost, Place). Notes `11-notes.md` (5840-6049), `20-notes.md` (11086-11167). 08 section 2.5 tools and undo, 2.6; 09 section 2.5 `tools.ts`, `undo.ts`, 2.9.

### S3.4 Inputs that already exist
S2 engine and renderer; `ghost.ts` stub; `commands.ts` with `tool` and `undo` kinds reserved; `store.ts` snapshot and hash.

### S3.5 Files to create or change
`src/play/tools.ts`, `src/play/undo.ts`, `src/render/ghost.ts`, `src/ui/rail.ts` (Park group, row 2 with Undo, row 3 New), `src/ui/dom.ts` (`toast`, `layoutOverlays`, confirm dialog), `src/ui/intro.ts` (Continue), `src/save/store.ts` (keys, autosave, load), `src/save/migrate.ts`, `src/core/commands.ts` (`tool`, `undo`, `park.new` finish), `src/world/grid.ts` (`rebuildBlock`), `src/main.ts`, strings (tool labels, reasons, Undone, confirm), `tests/tools.test.ts`, `tests/undo.test.ts`, `tests/save.test.ts`, `tests/migrate.test.ts`, `tests/ui/overlays.test.ts`, `tests/ui/intro.test.ts`.

### S3.6 Steps
1. `TOOLS`: sixteen entries with the ids of register 3.7 in that order, class per 02 section 8.2 (`brush`, `stamp1`, `stampBig`, `run`, or none for `hand`), footprint, label key, icon (inline 17x17 SVG as GV 11029-11037), swatch colour from `tokens.css` `--moss`.
2. `ghost(tool, at, opts)`: pure; returns `{ ok, tiles, reason? }` with the ranked reasons of 02 section 8.4 mapped to the keys of 03 section 5.4; bridge uses `water.findCrossing`; runs validate the straight-line and 14-tile rules; caps 3 kiosks and 1 bandstand; margins for fountain, kiosk, bandstand.
3. `applyTool(payload)`: validate again with `ghost`, mutate `KIND/WEAR/WATER/OCC/BEDC` and `props`, build the `Inverse` of 03 section 5.6 item 2, call `undo.record`, `markBlockDirty`, `markCharmDirty`, `markWaterDirty`; the kiosk's vendor spawn and the bench sitter eviction are left as calls into `entities/staff.ts` and `entities/visitor.ts` that S4 implements (no-ops now, listed in the hand-back).
4. Brush kernel: disc of radius `size - 1` around the centre (GV 11118-11126 guards: border and `OCC` skipped), one command per painted centre with a shared `stroke` id per pointer stroke (GV `beginStroke` 11091); drag-paint throttle from `camera.ts`.
5. `undo.ts`: stack of 10 entries grouped by `strokeId`; the `undo` command pops and applies inverses in reverse order; `openNear` for a visitor on a now-blocked tile (no visitors yet: the hook exists); `clearUndo` on `park.new`.
6. `ghost.ts`: green and red tile panes (GV 6037-6049) for armed big stamps and runs; S2's selection ring and focus pin remain stubs.
7. `rail.ts`: the Park group strip from `TOOLS` (GV 11048-11061 with the `.more/.before` masks), `setTool` clears selection and follow for non-hand tools (GV 11070), row 2 contexts (size 1 to 3, Place / Cancel with the reason line, Undo disabled when `depth() == 0`, GV 11116), row 3 New.
8. `main.ts` tap routing of 03 section 8.2 items 3 and 4 for creator mode; stamps 1x1 enqueue at once, big stamps and runs on Place or a second tap on the same tile.
9. `store.ts`: `parque:profile-v1` and `parque:park-v1`; JSON with base64 layers; `try/catch` on every access; autosave on `visibilitychange` hidden, `pagehide` and every 30 sim seconds (`stepAutosave`); the extra write on `park.new` (03 section 17 A24); `loadPark`, `restore`, silent Continue, `fitCam` after restore.
10. `migrate.ts`: `profileV0toV1`, `parkV0toV1` placeholders with a fixture test.
11. `intro.ts`: show Continue when `loadPark()` returns a park; Begin with a park present asks the confirm of 02 section 12.5 item 4; New on row 3 asks the same.
12. Strings: every tool label and hint, every reason key, `toast.undone`, `confirm.new_park`, `intro.continue`, in both tables.

### S3.7 Done when
1. The common gate; determinism green (tools are commands, so the fixture gains four tool commands and still matches on run 2).
2. `tests/tools.test.ts`: for each of the 16 ids, a scripted command places on the starter park and `worldHash()` changes; a second scripted command on an invalid tile returns the expected reason key from the ranked list (one case per reason key of 03 section 5.4 tools block).
3. `tests/undo.test.ts`: for each tool, `worldHash()` before the command equals `worldHash()` after `undo`; 11 strokes keep only 10; `undo` on an empty stack returns `reason.nothing_to_undo`.
4. `tests/save.test.ts`: `restore(JSON.parse(JSON.stringify(snapshot())))` gives the same `stateHash()`; the serialised park for the starter park with 100 extra props is under 1 MB; the v0 fixture migrates.
5. `shots/s3-ghost-ok.png` shows a green 3x3 bandstand ghost on lawn with Place enabled; `shots/s3-ghost-bad.png` shows a red ghost over the pond with the reason "not on the water" in row 2; `shots/s3-undo.png` shows row 2 with Undo enabled after a path stroke.
6. By hand in Chromium: paint a path, reload, tap Continue: the path is there and the toast count is zero; tap New: the confirm appears; Yes gives a fresh park and the hash `#s=` changes.

### S3.8 Tests to add
`tools.test.ts`, `undo.test.ts`, `save.test.ts` (with `tests/fixtures/park-v0.json`), `migrate.test.ts`, `tests/ui/overlays.test.ts`, `tests/ui/intro.test.ts`, `strings.test.ts` extended with the reason keys.

### S3.9 Out of scope
Visitors reacting to tools (S4), the gardener (S4), abilities (S6), the Cupid and Mischief strips (S6), the Options sheet (S11).

### S3.10 Ask the owner before
Adding a `statue` tool (none in register 3.7; AGENTS section 5 item 7); changing the undo depth; confirming on tree removal (02 section 15 open point 3 says no).

### S3.11 Hand-back
Format 0.6 plus the list of hooks left for S4 (vendor spawn, sitter eviction, `openNear` on undo).

---

## S4. Visitors: records, pathing, needs, brain, archetypes, figure rig, card, census

### S4.1 Goal
Visitors arrive through the gates, follow the eleven archetype routines with needs and the decide ladder, path over the park with A*, wear desire paths the gardener paves, and are drawn by the figure rig; tapping one shows the card and the Census sheet lists them.

### S4.2 Model tier
Tier B for the simulation (steps 1 to 11, 14 to 17). Tier A for the figure rig and creature drawing (steps 12 and 13), handed over as a sub-brief with the options rule. Tier C for `names.ts` data (step 2) and the archetype strings.

### S4.3 Read first
Register 3.3, 3.4, 3.10. 02 sections 4 (visitors: record, arrivals, every routine, needs, regulars, names), 5 (cadence, ladder, interrupt sets, movement, pathing), 11 (desire paths, pigeons, dogs), 12.2 (Visitors chip), 12.3 (card), 12.4 (Census). 03 sections 2.5, 3.3, 3.5, 4.3, 4.4, 6.3, 6.6, 7.6, 7.7 item 5, 8.2 (`pickAt`), 10.1 (card ids). 04 sections 7.1 to 7.3, 7.5, 9.1. Review sections 6.3, 6.4 (newcomer rule), 7.6, 5 (card, census). Notes `05-notes.md` (1359-1751), `09-notes.md`, `10-notes.md`, `15-notes.md`, `19-notes.md`. 08 section 2.3; 09 section 2.4.

### S4.4 Inputs that already exist
S2 engine, S3 tools and save; `pickAt` with the people branch stubbed; S1 figure and creature tiles in `figures.ts` and `creatures.ts`.

### S4.5 Files to create or change
`src/entities/visitor.ts`, `needs.ts`, `brain.ts`, `act.ts`, `move.ts`, `astar.ts`, `staff.ts`, `names.ts`, `creatures.ts` (pigeons and dogs on leads only), `src/world/wear.ts` (paving runs wired), `src/render/figures.ts`, `src/render/creatures.ts`, `src/render/ghost.ts` (selection ring), `src/ui/card.ts`, `src/ui/hud.ts` (Visitors chip, "+"), `src/ui/sheets.ts` (Census), `src/ui/feed.ts`, `src/core/loop.ts` (phases 7, 8, 9, 12), `src/core/commands.ts` (`visitor.call`), `src/save/store.ts` (visitors, creatures, regulars in the snapshot), strings, tests.

### S4.6 Steps
1. `visitor.ts`: the record of 03 section 3.3; `spawnVisitor` with the starting needs, `leaveAt`, `seeks`, `ageWord`, `lookSeed` from the sim stream; the arrivals scheduler of 02 section 4.2 (targets by phase, weather and season factors, interval 6 to 14 s, gate weights, archetype weights and caps, the complementary-sex re-roll of GV 4488-4504); `callVisitor` for the "+" chip (60 % single, `reason.park_full` at 30); removal at the `outside` tile; the cap 30 excluding cameos; `setAvatarDecide` injection point and the one `MODE` branch of 03 section 4.4.
2. `names.ts` (Tier C): 40 French first names per sex, the eight regulars with `seeks` exactly as 02 section 4.5 item 2, name reservation, regular memory and return scheduling (items 3 and 4).
3. `astar.ts`: port GV 1412-1416, 1427-1465 (reduced to the costs of 02 section 5.5), 1466-1510; no corner cutting; node budget 2600; partial paths; the `outside` tile allowed only for the walker's own gates.
4. `move.ts`: port `goTo` and route reuse (GV 1569-1598), `openNear` (1559), the `moveGnome` skeleton (1600-1673) with the speeds of 02 section 5.4, arrival 0.7, waypoint 0.44, replan 0.6 s, give up after 6 blocked steps, blocked memory 60 s max 8; `spaceOut` and `nudge` (5593-5621) in world units equivalent to 10x8 px at zoom 1 (03 section 17 A5); call `wear.wearAt` on lawn while moving.
5. `needs.ts`: the four needs and rates of 02 section 4.4; the comfort target formula with `weatherAt`.
6. `brain.ts`: the ladder of 02 section 5.2 rungs 0 to 5, 7, 8 (rung 6 is a call into `romance.ts` that S5 fills); the sets `BUSY`, `CAN_INTERRUPT`, `NO_SPACE`, `SHELTERED` of 02 section 5.3; the routines of 02 section 4.3 for every archetype including `child`, `gardener`, `vendor`; children follow the parent on rungs 2 and 3.
7. `act.ts`: the `goX -> X (timer) -> idle` idiom (GV 4968-5516 shape) for every state the routines use; `DOING` list; a `default` case that logs once and sets `idle`; reaction states are added by S5.
8. `staff.ts`: `ensureGardener` at `g_west` 10 s after a new park; the paving job (walk, lay 1.3 s per tile, feed line, 3 runs per day, `PAVEDAY`); `spawnVendor` and `vendorFor` wired to the kiosk tool and `remove`; the sitter eviction hook from S3.
9. `creatures.ts`: pigeons (6 at start, +1 per 90 s to 12; states `walk, peck, perch, fly, scatter`; crumbs props with stock), dogs on leads following at 1 tile and scattering pigeons within 3; the pomeranian record exists but stays `outside` (S6 moves it).
10. `loop.ts`: activate phases 7, 8, 9 and the 1.2 s planning tick (facility index, staff planning, vendor check, pigeon top-up); phase 12 order as 03 section 4.3.
11. `wear.ts`: wire `findPavingRun` into the planning tick every 60 s.
12. `figures.ts` (Tier A): the rig of 03 section 7.6 and 04 section 7.1 with `FH 22`, LOD by `h`, anchors as GV 8169-8442, `itemFor` (GV `toolFor` 8050), the body-language table for `walk, idle, sit, read, feed, eat, photo, paint, play, pave, tidy, serve, shelter, chase`, archetype signifiers of 04 section 7.2, colours from `lookSeed` through `style().palette`; the `a_matchmaker` fixed look is S10's. Present two rig variants on a scratch page first (0.4).
13. `creatures.ts` (render, Tier A): pigeon walking, pecking, perched, flying (GV 8569-8598 shape), dog on a lead (GV 8506), from the S1 tiles.
14. `card.ts`: `select(hit)` with follow and zoom to at least 1.8 (GV 10867), `clearSel`; the single card of 02 section 12.3 item 2 with bars Mood, Rested, Full (04 section 5.5), doing line from `t('doing.' + st)`; hidden under `body.sheet`.
15. `hud.ts`: Visitors chip count and "+" with `stopPropagation` (GV 12171); `sheets.ts` Census per 02 section 12.4 (rows, summary with `plural`, row tap selects, 1.2 s refresh while open); Census and Events exclusive.
16. `feed.ts`: port GV 10700-10742 (one line, 14 s fade, 40 entries as `{ key, params, abs, x, y, ids }`); feed lines for arrivals of regulars, gardener gravelling, a gathering of pigeons.
17. `store.ts`: visitors, creatures, regulars and `paving` in the snapshot and the hash; `ids` state.

### S4.7 Done when
1. The common gate; determinism green with 30 visitors over 3 days (the fixture now reaches the cap by midday).
2. `tests/arrivals.test.ts`: at 8x from f = 0.30, the count reaches 16 ± 3 by f = 0.45 and 24 ± 3 by f = 0.70 on seed 101; never above 30; the gardener exists from 10 s; one vendor per kiosk.
3. `tests/archetypes.test.ts`: over one seeded day every archetype id of 02 section 4.3 is observed at least once in each of its routine states (read `v.st` through the harness each second); the jogger never sits; the artist's easel is in `OCC` and leaves with the artist; the child never leaves the parent by more than 8 tiles.
4. `tests/astar.test.ts`: a path never crosses a bed, pond, canal or non-passable `OCC` tile, never cuts a corner, uses the bridge over the neck, and the budget returns a partial path for a walled target.
5. `tests/wear.test.ts`: 20 singles scripted along one lawn line for 200 s produce `WEAR >= 2.6` tiles; `findPavingRun` returns a run of at least 3; the gardener paves it within 60 sim seconds; `PAVEDAY` is set.
6. `shots/s4-crowd.png` at f = 0.55 shows at least 10 figures with visible archetype signifiers, two on benches, one jogger on the outer loop, pigeons near a bench; `shots/s4-card.png` shows a selected single's card with three bars and a doing line, not overlapping the rail; `shots/s4-census.png` shows the Census sheet with the summary line and the card hidden.
7. `pickAt` on a figure's head point returns its id at zoom 1.3 and 2.4.

### S4.8 Tests to add
`arrivals.test.ts`, `archetypes.test.ts`, `astar.test.ts`, `wear.test.ts`, `names.test.ts` (regulars' names and `seeks` exact; no duplicate active names), `caps.test.ts` (30 people, 12 pigeons, 4 dogs), `needs.test.ts`, `brain.test.ts`, `act.test.ts`, `move.test.ts`, `creatures.test.ts` (08 section 2.3).

### S4.9 Out of scope
Pairs and anything romantic (S5), embarrassments (S5, S6), the pomeranian in the park (S6), the cameo archetype in action (S6), weather effects on the scene (S9), sound.

### S4.10 Ask the owner before
Changing any speed, rate, weight or cap; adding an archetype; changing `FH` or the rig proportions (04 section 13 item 1); letting scenery couples pair (02 section 15 open point 1).

### S4.11 Hand-back
Format 0.6 plus the scratch page of the rig variants and the owner's pick.

---

## S5. Romance core: pairs, stages, affinity, charm field, featured pair HUD, Romances sheet, feed lines

### S5.1 Goal
Singles notice each other and climb the seven stages to Happily or Parted, driven by affinity, charm at their spot and embarrassments; the HUD shows the featured pair, the pair card and the Romances sheet, and the feed names every beat.

### S5.2 Model tier
Tier A.

### S5.3 Read first
Register 3.5, 3.6 (events only), 3.14, 5. 02 sections 6 (all of romance), 7.1 to 7.2 (which events carry points), 11.2 item 4, 12.2 (Romance chip), 12.3 item 3 (pair card), 12.4 (Romances, Events), 12.5 (feed events), 13 (tone rules). 03 sections 2.4 (`charm.ts`), 2.5 (`romance.ts`, `embarrass.ts`), 3.4, 4.2 phase 10, 6.4, 6.7, 12 item 6 (nested keys). 04 sections 7.5, 7.6, 9.2, 9.3. Review 6.4 (`court` rendezvous), 5 (events sheet). Notes `09-notes.md` (4327-4386), `10-notes.md` (5483-5491). 08 section 2.4; 09 section 2.4 `romance.ts`, `embarrass.ts`.

### S5.4 Inputs that already exist
S4 visitors, brain rung 6 hook, `act.ts`, feed pipe, card, sheets; `charm.ts` API stub from S2.

### S5.5 Files to create or change
`src/entities/romance.ts`, `src/entities/embarrass.ts`, `src/world/charm.ts`, `src/entities/brain.ts` (rung 6, pair formation inside `decide`), `src/entities/act.ts` (stage states, reaction states, backfire scenes), `src/render/effects.ts` (hearts, heartbreak, fireworks), `src/render/figures.ts` (facing, lean, kneel, embrace, the reaction poses of 04 section 9.3), `src/ui/hud.ts` (Romance chip), `src/ui/card.ts` (pair card, Pin), `src/ui/sheets.ts` (Romances, Events with `goToEvent`), `src/ui/feed.ts`, `src/render/ghost.ts` (focus pin), `src/core/loop.ts` (phase 10, day reset for `embarrass.resetDay`), `src/save/store.ts` (pairs, alumni, pinnedPair), strings, tests.

### S5.6 Steps
1. `charm.ts`: the base field rebuilt on `markCharmDirty` from beds, fountains, lit lamps, bandstands with the radii of 02 section 6.3 and the `player` flag by `placedBy`; dynamic sources (busker, petals, sunbeam, umbrella, boat, fireworks) added by S6 and S10 through `addSource` and `setPairCharm`; `charmAt` returns `{ total, player }` capped at 6, each source once.
2. `romance.ts`: `Pair` of 03 section 3.4; `tryForm` with the six conditions of 02 section 6.1 (line of sight by Bresenham, mist radius 2, the once-per-day failed roll, `skipRoll` for regulars and the matchmaker); the seven stages with prerequisites, durations, gates, interruptions and on-screen events of 02 section 6.2; lingering; `retryT` 30 or 60; the initiator rule; `completeStage` adds 0.08 and emits `stage`; charm conversion every 10 s while together; decay 0.1 per day apart (regulars between visits); endings of 02 section 6.5 with gates and the `alumni` list; the returning-couple roll; featured with the tie-break of 02 section 6.6 and `setPin`; the regular-return proposal rule of 02 section 6.7.
3. `brain.ts`: pair formation checks inside rung 7 strolling and idle for singles; rung 6 as 02 section 5.2.
4. `act.ts`: states `notice, chat, goBench, bench, stroll, goPicnic, picnic, kiss, proposal, huff, laugh` with the durations of 02 section 6.2; `stroll` moves the pair as one unit at 2.4 (GV `court` rendezvous shape 4338, 5483-5491 for the midpoint walk); the pair leaves together or apart per 02 section 6.5.
5. `embarrass.ts`: `EMB_KINDS` exactly the ten kinds of register section 5; `land(kind, victim, source)` with the cost table of 02 section 6.4, the stage factor and 0.15 cap, comfort -0.3, `embToday` on victim and pair, the 15 % backfire with the partner within 4 tiles, the cap of 3 with `reason.enough_today`, children refused with `reason.not_children`, staff and couples score 0, `rival` only on paired members; the reaction states and backfire scenes as states in `act.ts`; events `embarrassed` and `backfired`. No ability triggers it yet; the harness exposes `land`.
6. `effects.ts`: hearts per stage (04 section 7.6), the heartbreak particle, fireworks for Happily (04 section 8); `figures.ts` poses of 04 sections 9.2 and 9.3 for every stage and reaction, present two variants of the kiss and the proposal pose on a scratch page first.
7. `hud.ts`: Romance chip "A & B · Stage" or `t('hud.romance.none')`, pulse on a stage change; `card.ts`: the pair card of 02 section 12.3 item 3 and 04 section 5.5 item 2 with the gate tick and Pin; the Heart bar on the single card.
8. `sheets.ts`: Romances (pairs by stage, affinity bar, "n today", Pin, footer Happily and Parted counts), Events (last 40, "Day N · phase", `goToEvent` with the 5.2 s focus pin GV 10751, 10764).
9. `feed.ts`: lines for pair formed, each stage, each embarrassment landed or backfired, Parted, Happily, a regular's return, the day tally stub, all with nested `@` keys (03 section 12 item 6).
10. `store.ts`: pairs, alumni, `pinnedPair` (excluded from the hash); `loop.ts` phase 10 and the day reset.

### S5.7 Done when
1. The common gate; determinism green over 3 days with pairs forming.
2. `tests/romance.test.ts`: on seed `S_HAPPILY` (found by scanning seeds 1 to 200 with the harness, recorded in the test) a pair reaches Happily within 3 days; on seed `S_PARTED`, three harness `land` calls at stage 3 produce Parted and the two leave by different gates; a pair with affinity 0.50 and a free bench within 8 starts Bench and not Stroll; a pair at 0.80 with no fountain, lamp or evening lingers at stage 5; `charmAt` on a tile 2 from a player bed and 4 from a gen fountain returns `{ total: 3, player: 1 }`.
3. `tests/tone.test.ts`: `EMB_KINDS` equals the ten kinds in order; `land` on a child returns `reason.not_children`; the 4th landing in a day returns `reason.enough_today` and spends nothing; over 400 seeded landings with a partner within 4 tiles the backfire count is between 40 and 80; no reaction state exceeds 8 s except `distracted` 30 and `lost` 60.
4. P3 of 02 section 1.2: on the unmodified starter park at 1x, at least one pair exists within 2 sim minutes on seeds 101 to 110.
5. `shots/s5-pair-card.png` shows a pair card at stage Bench with both names, the Heart bar with a gate tick, the stage chip and Pin; `shots/s5-chip.png` shows the Romance chip naming the featured pair; `shots/s5-romances.png` shows the Romances sheet with two pairs; `shots/s5-kiss.png` at f = 0.76 shows a pair at Kiss with six hearts.

### S5.8 Tests to add
`romance.test.ts`, `tone.test.ts`, `charm.test.ts`, `feed.test.ts` (feed cap 40, nested key resolution after a language switch).

### S5.9 Out of scope
Abilities and avatars (S6, S7, S10), points and tiers (S6; S5 only emits the events), weather overrides (S9), sound.

### S5.10 Ask the owner before
Changing any gate, duration, cost or the 50 % and 15 % rolls; adding an embarrassment kind (02 section 13 forbids it); showing authored dialogue (brief section 8.2 item 15 forbids it).

### S5.11 Hand-back
Format 0.6 plus the two seeds and the scratch page of the pose variants.

---

## S6. Abilities T0 and T1, and progression

### S6.1 Goal
The eight tier 0 and tier 1 abilities fire as commands with cooldowns and targeting from the Cupid and Mischief strips; Cupid Points and Mischief Points accrue, tiers unlock, the Progress sheet and the Points chip show them, and the profile persists them across parks.

### S6.2 Model tier
Tier B. Tier C for the ability strings and the content test.

### S6.3 Read first
Register 3.6, 3.8 (rows `c_petals, c_bouquet, c_musician, c_sunbeam, m_pigeon, m_sprinkler, m_peel, m_pomeranian`), 3.9. 02 sections 7 (points, tiers, unlock table), 9.1 (common rules), 9.2 and 9.3 (the eight rows), 11.2 and 11.3 (pigeons, the pomeranian), 12.2 (Points chip), 12.4 (Progress), 3.5 (overrides). 03 sections 2.6 (`abilities.ts`, `progression.ts`), 3.8 (`Effect`), 3.9 (profile), 4.2 phases 5 and 6, 5.3, 5.4 (reason keys), 6.5, 8.2 item 2, 10.4. 04 section 5.4 items 2 to 4 (locked pills, cooldown chip), 5.6 (Progress). Review 3.4 (pick and ghost shape for validation). 08 section 2.5 progression and abilities; 09 section 2.5.

### S6.4 Inputs that already exist
S5 romance, `embarrass.land`, `charm.addSource`, `weather.addOverride`, creatures with the pomeranian record, the cameo archetype slot, the rail with the Park group.

### S6.5 Files to create or change
`src/play/abilities.ts`, `src/play/progression.ts`, `src/entities/creatures.ts` (pomeranian, pigeon `swoop`), `src/entities/visitor.ts` (cameo spawn, summoned busker), `src/entities/act.ts` (cameo states), `src/ui/rail.ts` (Cupid and Mischief groups, arming, cooldown chip, locked pills), `src/ui/hud.ts` (Points chip, unlock toast), `src/ui/sheets.ts` (Progress), `src/render/ghost.ts` (ability target square), `src/render/effects.ts` (petals, sprinkler spray, splat, slip dust), `src/render/props.ts` (sprinkler, peel, basket, crumbs), `src/core/commands.ts` (`ability`), `src/save/store.ts` (effects, sides, tally; profile points), strings, `tests/abilities.test.ts`, `tests/progression.test.ts`, `tests/content.test.ts`, `tests/ui/rail.test.ts`.

### S6.6 Steps
1. `ABILITIES`: all 19 ids of register 3.8 with side, tier, cooldown, charges, target type; only the eight of this slice have an `apply`; the other eleven return `reason.not_here` until S10 (the registry is complete so the content test and the rail can show them dimmed).
2. `canCast` and `cast`: 02 section 9.1 (arming is UI; the command carries the target; validate inside the sim; the child refusal; cooldown per side in sim seconds; charges reset at f = 0); the effect list with `until` ticks and `stepAbilities` timelines.
3. The eight timelines exactly as 02 sections 9.2 and 9.3: `c_petals` (PETALS, charm +2 for 20 s), `c_bouquet` (flower seller cameo, affinity +0.05), `c_musician` (busker visitor, 90 s, charm +3 within 8), `c_sunbeam` (override r 3, 60 s, charm +1, comfort +0.10), `m_pigeon` (nearest pigeon `swoop` at 6.0, `poop` via `embarrass.land`), `m_sprinkler` (prop, 3x3 soak 10 s, `soaked`), `m_peel` (prop 120 s, `trip` on the first adult non-staff walker), `m_pomeranian` (the creature enters, 4.5, `snatched`, item order hat, purse, baguette, iceCream, carry to the gate, 8 s chase, drop, 60 s wait outside).
4. Scoring: Cupid casts set `pair.lastCupidAt` for pairs within 6 tiles or targeted (02 section 9.1 item 7); Mischief scores through `land`.
5. `progression.ts`: CP and MP rules of 02 sections 7.1 and 7.2 (the contributed test with `charmAt().player >= 2` or a Cupid action within 60 s); `TIERS [0, 8, 20, 40, 70]`; `isUnlocked` for all 19 abilities and 6 avatars by the table of 02 section 7.4; `unlocked[]` in the profile so the toast fires once; the day tally feed line "Today: Cupid n · Mischief m".
6. `rail.ts`: the Cupid and Mischief strips from `ABILITIES` with `--berry` and `--ember` swatches, locked pills at opacity 0.45 with the tier badge and the toast `t('rail.locked_at', { side, tier })`; arming (chip highlighted, stays armed across camera moves, second tap disarms); row 2 cooldown chip with the SVG ring, seconds left and charges (04 section 5.4 item 4).
7. `main.ts`: tap routing item 2 of 03 section 8.2 (resolve the target by type, enqueue, keep armed); `ghost.ts` draws the area square for armed `area` abilities.
8. `hud.ts`: Points chip "Cupid n · Mischief m" with the flash; unlock toast "Unlocked: Musician (Cupid T1)" through `t()` and a feed line.
9. `sheets.ts`: Progress with the two ladders, tier ticks, next unlock, the unlock table (04 section 5.6).
10. `store.ts`: effects, `sides` and `tally` in the snapshot and hash; profile `cp, mp, tierC, tierM, unlocked` written through `progression.ts` and saved with the park.
11. Strings (Tier C): `ability.<id>.name` and `.hint` for all 19, every reason key of this slice, Progress and unlock keys, in both tables.

### S6.7 Done when
1. The common gate; determinism green with the fixture extended by eight ability commands (one per id) at scripted ticks.
2. `tests/abilities.test.ts`: each of the eight ids applied through a command succeeds once, then returns `reason.cooldown` until its cooldown has elapsed in sim seconds at 1x and at 8x (same tick count); `m_pigeon` on a child returns `reason.not_children` and spends nothing; `m_peel` on lawn returns `reason.not_here`; `c_bouquet` on an unpaired visitor returns `reason.not_courting`; a locked id returns `reason.locked`; the eleven S10 ids return `reason.not_here`.
3. `tests/progression.test.ts`: a stage completed with `charmAt().player >= 2` gives +1 CP, without gives 0; a landed embarrassment on a paired victim gives +1 MP, a backfire gives 0; Happily +5 CP; Parted +5 MP; crossing 8 points unlocks exactly the T1 rows of 02 section 7.4 and toasts once; points survive `park.new` and a profile reload.
4. `tests/content.test.ts` (Tier C): 16 tool ids, 19 ability ids, 6 avatar ids, 7 stage names, 10 embarrassment kinds, 8 weather kinds, 11 displayed archetype names, with the exact spellings of register sections 3 and 5.
5. `shots/s6-cupid-strip.png` shows the Cupid group with `c_petals` and `c_bouquet` active and the T1 to T4 pills dimmed with tier badges; `shots/s6-cooldown.png` shows the armed `m_pigeon` chip with its ring; `shots/s6-progress.png` shows the Progress sheet with both ladders; `shots/s6-petals.png` shows petals on a 3x3 and the `PETALS` tint.

### S6.8 Tests to add
`abilities.test.ts`, `progression.test.ts`, `content.test.ts`, `tests/ui/rail.test.ts` (08 section 2.9), `tone.test.ts` extended (no ability can target a child; `m_sprinkler` skips children inside).

### S6.9 Out of scope
Tier 2 to 4 abilities (S10), avatars (S7), the weather overlay drawing of `c_sunbeam` (S9 draws the light pool; S6 applies the data), sound.

### S6.10 Ask the owner before
Changing a cooldown, charge, tier or threshold; adding currency or a cost; moving an ability between tiers.

### S6.11 Hand-back
Format 0.6 plus the profile JSON after the progression test.

---

## S7. Avatar mode: mode switch, picker, pigeon, pomeranian, florist

### S7.1 Goal
"Be someone" opens the picker, the player possesses `a_pigeon`, `a_pomeranian` or `a_florist`, controls it by taps through the cascade, scores as the equivalent ability, and "Creator" hands the actor back to its AI.

### S7.2 Model tier
Tier B.

### S7.3 Read first
Register rows 12, 13, 14, sections 3.8 (avatars), 3.9, 6. 02 section 10 (all of avatar mode: entering and leaving, the six-avatar table, shared cascade rules, 10.4 pigeon, 10.5 pomeranian, 10.7 florist, 10.10), 12.3 item 4 (avatar strip), 12.4 (picker), 14 items 6 and 7. 03 sections 2.6 (`mode.ts`, `avatar.ts`), 4.4, 5.1 (`avatar.*` commands), 5.2 item 4 (hit re-validation), 5.3, 8.2 item 1, 10.2 (`body.avatar`). 04 sections 5.4 item 6, 5.5 item 3, 5.6 (picker), 7.4. Review section 3 (the whole MODE system), 17.1 claims 1 to 9. Notes `11-notes.md` (5622-5716), `20-notes.md` (11252-11322). 08 section 2.5 avatar and mode; 09 section 2.5 `mode.ts`, `avatar.ts`.

### S7.4 Inputs that already exist
S6 abilities and scoring, creatures with `swoop` and `snatch`, `charm.addSource`, `PETALS`, the florist cameo drawing from S6's `c_bouquet`, `setAvatarDecide` hook, `camera.follow`.

### S7.5 Files to create or change
`src/play/mode.ts`, `src/play/avatar.ts`, `src/entities/visitor.ts` (`spawnedForPlayer`, `leaveAt = +Infinity` while possessed), `src/entities/creatures.ts` (possessed pigeon and pomeranian states), `src/entities/act.ts` (`swoop, poop, startled, peck, perch, drink, snatch, carry, shakeOff, chase, play, paddle, dig, hand, pick, scatter`), `src/ui/rail.ts` (avatar row 1 hints, mode button text), `src/ui/sheets.ts` (Avatar picker), `src/ui/card.ts` (avatar strip), `src/ui/hud.ts` (`body.avatar` from the `mode` event, status toasts), `src/render/figures.ts` (florist with basket), `src/render/ghost.ts` (player ring GV 9529), `src/core/commands.ts` (`avatar.enter`, `avatar.leave`, `avatar.tap`), `src/save/store.ts` (`mode` block), `src/main.ts` (tap routing item 1), strings, `tests/avatar.test.ts`, `tests/mode.test.ts`.

### S7.6 Steps
1. `mode.ts`: a leaf with `MODE`, `PLAYER` (0 is none), `getAvatar`, `setMode` called only from `applyCommand`, `PLAYER_HOLD` per avatar from 02 section 10.2 (GV 5630, 5631, 11252-11269 pattern).
2. `avatar.ts`: `AVATARS` with the six ids, side, tier, actor rule, spawn gate, speed and the three hint keys of 02 section 10.2; `enterAvatar` (find or spawn the actor, `PLAYER`, select, follow, zoom to 1.5 if below 1.3 (GV 11257), the 6 s hint toast (GV 11259), `clearUndo`); `leaveAvatar` (actor back to AI at once, toast `t('avatar.goes_on', { name })` (06 section 16.7)); `avatarDecide` injected at boot (GV 5642-5651 shape: orders are never pre-empted, 02 section 10.3 item 6).
3. The cascade per 02 section 10.3 (GV 5653-5688 order): hold check, clear intent, nearest interactable by the avatar's candidate list and radius, tile fallback, default walk or fly; returns a status key; `a_busker`, `a_mime`, `a_matchmaker` return `reason.not_here` until S10.
4. `a_pigeon` steps 3a to 5 of 02 section 10.4 with the refusals; `a_pomeranian` 02 section 10.5; `a_florist` 02 section 10.7 (basket of 3, `hand` as `c_bouquet`, `pick` 4 s, `scatter` as `c_petals`, cooldowns 60 s and 30 s, the two refusals).
5. `commands.ts`: `avatar.enter` (rejected when already in avatar mode or locked), `avatar.leave`, `avatar.tap` with the hit re-validation of 03 section 5.2 item 4; side rules of 03 section 5.3 (tools, undo and abilities rejected with `reason.not_in_avatar`).
6. `main.ts`: tap routing item 1 of 03 section 8.2; `'busy'` toasts `t('avatar.busy', { name })`, `'walking'` and `'flying'` silent, others `t('avatar.says', { name, what })` (GV 11276-11277).
7. UI: `body.avatar` hides the Park strip, size row, Undo and the ability strips, shows three hint chips in row 1, the mode button reads `t('rail.creator')` (GV 169, 183, 11267); the picker sheet with six cards, side stripe, tier, lock (04 section 5.6); the avatar strip card with " · you" and "waiting for your tap" (GV 173-178, 10830); the player ring instead of the selection ring (GV 9550).
8. `park.new` forces creator mode and discards a `spawnedForPlayer` actor (GV 12107); the `mode` block is saved and restored.
9. Points: `a_pigeon` swoop scores as `m_pigeon`, `a_pomeranian` snatch as `m_pomeranian`, florist actions as Cupid actions (02 section 10.10).

### S7.7 Done when
1. The common gate; determinism green with the fixture extended by `avatar.enter a_pigeon`, six `avatar.tap` commands and `avatar.leave`.
2. `tests/avatar.test.ts`: entering each of the three avatars sets `MODE 'avatar'` and `PLAYER` to a live actor and spawns one only when absent; a tool command in avatar mode returns `reason.not_in_avatar`; the pigeon's tap on an adult returns `avatar.status.swooping` and a `poop` lands with +1 MP when the victim is paired; the tap on a child returns `reason.not_children`; the pomeranian's tap on a hatless, bagless adult returns `reason.no_item`; the florist with an empty basket returns the basket refusal; leaving returns the actor to `decide` on its next cadence and the florist's `leaveAt` becomes finite; a stale hit id in `avatar.tap` falls through to walking.
3. `shots/s7-picker.png` shows six cards with `a_pigeon` unlocked and the rest locked or unlocked per the test profile; `shots/s7-pigeon.png` shows the possessed pigeon followed at zoom 1.5 with the avatar strip reading "· you" and three hint chips in row 1, the Park strip hidden; `shots/s7-florist.png` shows the florist with her basket.
4. By hand: tap the lawn, the pigeon flies there; tap a visitor, the toast reads the status; tap Creator, the pigeon walks off on its own within 2 s.

### S7.8 Tests to add
`avatar.test.ts`, `mode.test.ts` (08 section 2.5), `commands.test.ts` extended with the side rules.

### S7.9 Out of scope
`a_busker`, `a_mime`, `a_matchmaker` (S10); the avatar music mix (S8); the matchmaker's fixed look (S10).

### S7.10 Ask the owner before
Adding a joystick or keyboard movement (register row 13 forbids it); letting the avatar be a `Pair` member; changing a cooldown or radius.

### S7.11 Hand-back
Format 0.6 plus a list of the cascade status keys added to the string tables.

---

## S8. Audio: engine, cues, ambience, the chosen music

### S8.1 Goal
Every romance and mischief beat has a cue, the park has its ambience (fountain, café, bells, boulevard, rain, pigeons, birds), the picked motif plays and follows the featured pair, and the dev Sound check plays every cue.

### S8.2 Model tier
Tier A.

### S8.3 Read first
Register 3.13, 3.2 (real-time gaps), section 4 Music Gate row (the pick and knobs). 05 sections 1 to 5, 6.5 item 3, 7, 8, 9. 03 sections 2.8, 4.1 item 8, 9, 13 (audio harness). 02 section 12.4 (Options, dev flag). Review section 8. Note `12-notes.md`. 08 section 2.8; 09 section 2.7, section 4 rows 1 and 14.

### S8.4 Inputs that already exist
S1 `engine.ts`, `limiter.ts`, `music.ts` (motif A) and `debug/motifs.ts`; the event bus with `stage, embarrassed, backfired, happily, parted, cast, unlock, fx, newday` events from S4 to S7; the register's music pick.

### S8.5 Files to create or change
`src/audio/engine.ts`, `limiter.ts`, `cues.ts`, `ambience.ts`, `birds.ts`, `music.ts`, `src/debug/motifs.ts` (remove the picked motif if it moves), `src/ui/sheets.ts` (Sound check under the dev flag), `src/ui/rail.ts` (Sound button through `t()`, `aria-pressed`), `src/ui/hud.ts`, `src/main.ts` (Begin and Continue unlock, `visibilitychange`, `resume()` on pointerdown while suspended), `src/save/store.ts` (`settings.muted`), `src/debug/harness.ts` (`__PD.audio`), strings, tests.

### S8.6 Steps
1. Finish the engine port per the table of 05 section 2.1 (every row, with the verdicts) and the limiter order of 05 section 2.4 item 3: audibility before the gate.
2. `cues.ts`: the registry of exactly the 38 cue ids of 05 section 3.2 with recipe, gap, soft flag, scope, threshold; `bindCues` subscribes every trigger; `voice` pitch factors 1.19 and 0.84; `step_*` by stride.
3. `ambience.ts`: the scheduler of 05 section 4 (songbird windows, owl, pigeons, fountains as point sources, café at kiosks, boulevard beyond the south railings, rain on gravel, fireworks pacing, crickets and the snow hush, mist and the foghorn, bells at the six phase boundaries), real time, `grain()` at most 6 per second, never a continuous noise.
4. `birds.ts`: GV 6212-6269 verbatim with trees from `props`.
5. `music.ts`: if the pick is A, wire the state object to the simulation per 05 section 5.6 (featured pair, light, parted, happily, fireworks, busker pan, avatar mode); if B or C, move that motif from `debug/motifs.ts` into `music.ts`, apply the recorded knobs, keep 05 sections 5.7 and 5.8; the ducking table of 05 section 5.7.
6. Mute per 05 section 7.3 (hard cut, profile setting, Options and the Sound button are one setting); iOS rules of 05 section 7.5 item 4.
7. The Sound check sheet of 05 section 2.6 listed in Options under the dev flag; `__PD.audio` of 05 section 8.3 with `dryRun`.
8. Run the manual list of 05 section 8.1 in desktop Chromium and record each line's result in the hand-back; present two alternative recipes for `kiss` and `splat` on the sound check before settling (0.4).

### S8.7 Done when
1. The common gate; determinism green: a 3-day run with sound on and `dryRun(true)` ends with `rngN` equal to the silent run (05 section 8.3 "Done when", `log.length === 200`).
2. `tests/limiter.test.ts`, `cues.test.ts`, `melody.test.ts`, `musicState.test.ts`, `scheduler.test.ts` of 05 section 8.2 items 1 to 5 green; `peak.test.ts` (item 6) run once and its peak recorded.
3. The manual list 05 section 8.1 items 1 to 10 each PASS, written in the hand-back with what was heard.
4. `grep -rn "Math.random\|performance.now\|Date.now" src/audio` prints nothing.
5. `shots/s8-soundcheck.png` shows the Sound check sheet with all 38 cue buttons, the ambience bursts, the six bird voices and the three music buttons.

### S8.8 Tests to add
The five of 05 section 8.2 plus `mute.test.ts` (muted in the profile survives reload; `tone()` schedules nothing while muted).

### S8.9 Out of scope
Any visual; weather drawing; a second motif in the game; the Capacitor audio session.

### S8.10 Ask the owner before
Changing the master chain numbers (05 section 2.2 are locked), the motif, the base tempo or key, a gain above 0.060, adding a noise bed, silencing music on pause (05 section 9 open point 2).

### S8.11 Hand-back
Format 0.6 plus the 05 section 8.1 results table and the peak value.

---

## S9. Seasons, weather, night and lamps, effects

### S9.1 Goal
The scene shows the four seasons on trees and lawn, the eight weather kinds and the three castable overrides, the eight day bands with golden hour and lit lamps, winter ice and snow, puddles, petals and leaves, with the weather overlay and particles within budget.

### S9.2 Model tier
Tier A for the renderer and effects (steps 2 to 9); Tier B for the simulation ties and tooling (steps 1, 10 and 11).

### S9.3 Read first
Register 3.2. 02 sections 3 (time, light, weather, seasons, overrides), 2.2 (`WET`, `PETALS`, `ICE`), 4.4 (comfort terms), 5.2 rung 2 (shelter). 03 sections 6.2, 7.3, 7.5, 7.7 items 2 and 3, 7.8 items 1 and 2, 15.1. 04 sections 6.3, 6.5, 8 (effects and particles), 10 (light and seasons), 11 (accessibility: flash limit, reduced motion). Review 7.2, 7.3, 7.7 (`drawWeather`, `ambientFx`), 6.1. Notes `13-notes.md` (6450-6620), `18-notes.md` (10057-10105), `15-notes.md` (8820-8847). 08 sections 4.5, 5; 09 section 2.6 `effects.ts`.

### S9.4 Inputs that already exist
S2 `weather.ts` with overrides and `WET`, `water.stepIce`, `ambient.ts`, `effects.ts` particles, `flora.crownPhase`; S6 `c_sunbeam` data; S4 shelter rung reading `weatherAt`.

### S9.5 Files to create or change
`src/render/ambient.ts` (season tints, lamp warmth), `src/render/backdrop.ts` (night sky, lit windows, snow on roofs), `src/render/ground.ts` (season lawn, puddles, ice, snow cover, petals), `src/render/flora.ts` (four-season crowns, blossom, bare), `src/render/props.ts` (lamp glow, umbrella), `src/render/effects.ts` (rain, snow, fog wash, leaves, petals, blossom, lamp halos, sunbeam pool, rain cloud, fireworks kinds), `src/render/draw.ts` (phase 8), `src/core/weather.ts` (snow only in winter check, `ICE` timing), `src/entities/needs.ts` (season comfort term), `src/debug/perf.ts` (`qualityLevel` step-down), `tools/perf.mjs` (08 section 5.2), strings (weather words), tests.

### S9.6 Steps
1. Verify the data side: per-season weights of 02 section 3.3 on the sim RNG; the season effects of 02 section 3.4 on arrivals and comfort; `ICE` timing; `WET` rates; overrides expire; `weatherAt` drives comfort and shelter.
2. `ambient.ts`: the day curve of 04 section 10.1 over the eight bands; the season tint formulas of 04 section 10.3 with the 0.5-day blend; lamp warmth on figures within 3 tiles (03 section 7.3 item 5).
3. `backdrop.ts`: night sky with stars below `light 0.42`, the moon, lit facade windows at night (40 % per bay by `h01`, 04 section 6.4 and 10.2 item 3), snow caps in winter, the skyline tint by band.
4. `ground.ts`: season lawn and mulch, `WET` sheen 14 % darkening, `ICE` whitening of pond and canal tiles, snow cover by `snowCover` of 04 section 10.3, `PETALS` dots; `flora.ts`: crown phases of 02 section 3.4 (spring blossom days 1 to 2, leafing day 3, summer full, autumn thinning, winter bare) for the three species (04 section 6.3).
5. `props.ts`: the lamp pool of 04 section 6.2 and 10.2 (radius 1.6 tiles, the 24-pool cap), lit by `T.lamps` or `litUntil`; the shared umbrella drawn over a pair with `umbrellaUntil` (S10 sets it; draw it now from a harness flag).
6. `effects.ts`: screen-space rain (95 drops per unit rain normalised to 390x800, two layers, none above the horizon) and snow (120 flakes) from GV 10062-10105 batched into one path per layer; the fog wash at `FOGA * 0.55`; leaf particles in autumn with 30 % teal (04 section 10.4); blossom petals under blossoming trees in spring (visual only); `ambientFx` reshaped (GV 8820-8847: no fireflies, no lightning) for fountain spray, café steam, breeze petal drift; the sunbeam light pool and the rain-cloud sprite for the two overrides; the particle budget of 04 section 8.
7. `draw.ts`: phase 8 overlay and fog after the entity pass; the 2 Hz flash limit and halved particles under `prefers-reduced-motion` (04 section 11).
8. `perf.ts`: `qualityLevel()` 0 to 2 per 03 section 13 (level 1 drops halos and ribbons, level 2 drops sway and petals), stepping when draw EMA > 22 ms for 180 frames, never up, disabled under WebDriver.
9. Present options first (0.4): two variants of the rain look and two of the golden-hour tint on a scratch page; build the picked ones.
10. Strings: the eight `weather.<id>` words in both tables; the eight dot colours, including `shower` `#B7CCDE`, go into the constant table in `ambient.ts` (04 section 10.5).
11. `tools/perf.mjs`: write the script per 08 section 5.2 (the caps scene through `__PD`, 60 s at 1x and 8x, zoom 1 and 0.30) and run it once in the hand-back.

### S9.7 Done when
1. The common gate; determinism green at 1x and 8x across all four seasons (12 days, seed 101): identical `stateHash` whatever the quality level or the reduced-motion flag.
2. `tests/weather.test.ts` extended: over 2,000 picks per season the kind frequencies are within 3 points of 02 section 3.3; snow never outside winter; `ICE` reaches 1 after 60 s of snow and 0 after 120 s without.
3. The screenshot matrix of 04 section 12 item 8: f = 0.30, 0.76 and 0.90 at zoom 0.30, 1.3 and 2.4 at 390x844 and 1280x800 (`shots/s9-f30-z13-phone.png`, `s9-f30-z13-desktop.png` and so on, eighteen files) plus `shots/s9-rain.png`, `s9-snow.png` (winter with ice on the pond and bare trees), `s9-autumn.png` (thinning crowns and leaves), `s9-fog.png` (`m_fog` wash via the harness override), `s9-sunbeam.png`. At f = 0.90 every lamp is lit with a pool and the facades show lit windows; at f = 0.76 the warm tint is visible on figures and stone.
4. Perf overlay on desktop Chromium at zoom 1 with 30 visitors, 12 pigeons, 4 dogs and 220 particles in rain: frame EMA at or under 16.7 ms and sim + draw at or under 12 ms (brief section 9 row 3); the numbers are in the hand-back.
5. The accessibility checks of 04 section 11: contrast over the darkest screenshot, no flash above 2 Hz, particles halved under reduced motion.

### S9.8 Tests to add
`weather.test.ts` extended, `seasons.test.ts` (crown phase by day, season tint blend), `perf.test.ts` (quality step-down state machine, pure).

### S9.9 Out of scope
Tier 2 to 4 abilities (S10 adds `m_raincloud`, `m_fog`, `c_lamplight`, `c_fireworks` using the kinds S9 draws), any sound, storms or lightning (not in Parque).

### S9.10 Ask the owner before
Changing a weather weight, duration or target; adding a weather kind; adding shadows (04 section 12 do-not list); changing the lamp rule `f >= 0.80 || f < 0.28`.

### S9.11 Hand-back
Format 0.6 plus the perf numbers at the three zooms and the two scratch pages with the picks.

---

## S10. Abilities T2 to T4 and the remaining avatars

### S10.1 Goal
The eleven tier 2 to 4 abilities and the avatars `a_busker`, `a_mime` and `a_matchmaker` work as specified, with their cameos, props, overrides, charm sources and particles.

### S10.2 Model tier
Tier B. Tier A sub-brief for the `a_matchmaker` look (ref2) and the rowboat, mime and fireworks drawings, with the options rule.

### S10.3 Read first
Register 3.8 (rows `c_umbrella, c_lamplight, c_picnic, c_rowboat, c_fireworks, m_wasp, m_raincloud, m_rival, m_mime, m_fog, m_flock` and the avatar line). 02 sections 9.2 and 9.3 (those eleven rows), 10.6, 10.8, 10.9, 10.10, 6.3 (umbrella, boat, fireworks charm), 6.4 (`wasp, drenched, rival, mime, fog, flock`), 3.5 (overrides), 11.2 item 5 (fog perching). 03 sections 2.6, 3.8, 6.5, 6.7. 04 sections 7.4 (avatars), 6.1 (rowboat, basket, umbrella), 8 (fireworks, wasp). 08 sections 7.3, 7.4; 09 section 2.5.

### S10.4 Inputs that already exist
S6 registry with the eleven ids returning `reason.not_here`; S7 cascade with three avatars returning `reason.not_here`; S9 draws overrides, fog, umbrella, fireworks kinds; `water.waterBodies` for the pond size; `charm.setPairCharm`.

### S10.5 Files to create or change
`src/play/abilities.ts`, `src/play/avatar.ts`, `src/entities/creatures.ts` (`perchAll`, flock pigeons), `src/entities/visitor.ts` (rival and mime cameos, summoned busker reuse), `src/entities/act.ts` (`flap, huddle, distracted, baffled, lost, duck, boat, watch, wall, mimicStart, statue, serenade, setUp, play, pack, lead, encourage, buy`), `src/entities/romance.ts` (`umbrellaUntil`, `boatUntil`, encourage sets `retryT = 0`, lead forms with `skipRoll`), `src/render/props.ts` (rowboat, umbrella, basket), `src/render/figures.ts` (matchmaker look, mime, busker with accordion), `src/render/effects.ts` (wasp, fireworks, flock), `src/core/weather.ts` (`m_fog` park-wide override), strings, tests.

### S10.6 Steps
1. Implement each ability timeline exactly as its row in 02 sections 9.2 and 9.3, in this order: `c_lamplight`, `c_umbrella`, `m_raincloud`, `m_wasp`, `c_picnic`, `m_rival`, `m_mime`, `c_rowboat`, `m_fog`, `m_flock`, `c_fireworks`. Each adds its reason keys from 03 section 5.4 and its charm source or pair charm.
2. `c_fireworks` and `m_flock` have 1 charge per day (register 3.8); `c_fireworks` fails outside dusk and evening with `reason.not_evening`; `c_rowboat` needs 12 connected pond tiles and `ICE = 0`.
3. `a_busker` per 02 section 10.8 (no cooldown, `pack` 2 s, `setUp` 3 s, charm +3 within 8 while `play`); `a_mime` per 10.6 (120 s between landed `mime`); `a_matchmaker` per 10.9 (`lead` 45 s cooldown forming without the roll, `encourage` 30 s, `buy`, share bread), spawning at `g_north` with the fixed ref2 look (beret, red ribbon, striped top, white trousers, flat shoes, basket with two baguettes; 03 section 7.6 item 5).
4. The avatar can be a victim (02 section 10.10 item 2): the pomeranian may snatch the florist's basket; the avatar never joins a `Pair`.
5. Music hooks: `cast` events for `c_fireworks` (flourish) and the busker `play` state for the busker pan rule (05 section 5.6) are emitted; S8's `music.ts` already listens.

### S10.7 Done when
1. The common gate; determinism green with the fixture extended by the eleven ids and the three avatars' taps.
2. `tests/abilities.test.ts` extended: every one of the 19 ids succeeds once and then returns `reason.cooldown`; `c_fireworks` and `m_flock` return `reason.no_charges` on the second cast in a day and succeed after `newday`; `m_raincloud` inside a sunbeam returns `reason.in_sunbeam`; `m_wasp` in rain returns `reason.no_wasps_rain`; `m_peel` on ice returns `reason.slippery`; `c_rowboat` on the starter pond (26 tiles) succeeds and on a 6-tile pond returns `reason.pond_small`; an umbrella pair in `m_raincloud` lands nothing; `m_fog` interrupts every Stroll pair and perches every pigeon; `m_flock` lands on no child and no staff.
3. `tests/avatar.test.ts` extended: the matchmaker's `lead` forms a pair without the roll within 20 s; `encourage` sets `retryT 0`; the busker's charm applies only in `play`; the mime's wall blocks the tile for 20 s.
4. `tests/tone.test.ts`: `snatched` items return within 10 s (T4); no reaction exceeds 8 s except `distracted` and `lost`.
5. Screenshots: `shots/s10-fireworks.png` (f = 0.90), `s10-rowboat.png`, `s10-umbrella.png` (rain, a pair under one umbrella), `s10-matchmaker.png` (the avatar strip, the girl with the basket at zoom 2.4), `s10-mime.png`.

### S10.8 Tests to add
Extensions of `abilities.test.ts`, `avatar.test.ts`, `tone.test.ts`; `charm.test.ts` extended with umbrella, boat and fireworks sources.

### S10.9 Out of scope
New abilities, a seventh avatar, balancing beyond the register's numbers, sound beyond the emitted events.

### S10.10 Ask the owner before
Changing any cooldown, charge, radius or the 50 % rival roll; refusing `c_rowboat` in fog (02 section 15 open point 5); ignoring `seeks` in the matchmaker's introduce (open point 4).

### S10.11 Hand-back
Format 0.6 plus the scratch pages for the matchmaker, rowboat and fireworks variants with the picks.

---

## S11. Polish: ES complete, intro, photo mode, accessibility, performance pass, debug gating

### S11.1 Goal
The game is complete in EN and ES, the intro and Options are final, photo mode works, accessibility rules hold, the performance budgets are met at the caps, and no debug surface ships in the production build.

### S11.2 Model tier
Tier B. Tier C sub-briefs: the ES table (step 1), the aria-label keys (step 5), the README.

### S11.3 Read first
Register 3.10, 3.12, rows 21, 22, 23. Brief sections 8.2, 9 (all twelve rows), 11 item 1 (fonts). 02 sections 12.4 (Options), 12.5. 03 sections 10.5, 12, 13, 14 (Capacitor readiness checklist), 15. 04 sections 5.7 (intro), 5.8, 11, 12 items 8 to 13. 05 section 7.3. 08 sections 2.7, 6, 7, 8; 09 section 1.5.

### S11.4 Inputs that already exist
Everything from S0 to S10; `strings/es.ts` partially filled by earlier slices.

### S11.5 Files to create or change
`src/ui/strings/es.ts`, `src/ui/strings/en.ts` (audit), `src/ui/i18n.ts` (`applyDom`, `<html lang>`), `src/ui/intro.ts` (four paragraphs, Continue, EN / ES), `src/ui/sheets.ts` (Options: language, sound, speed, seed, dev entries), `src/ui/hud.ts` (photo mode, `aria-live`), `src/styles/shell.css` (11 px floor audit, reduced motion, safe areas, row 3 wrap), `index.html` (`data-t` keys, `aria-label` keys, favicon, theme colour), `src/main.ts` (`body.dev` from `#dev` or DEV; harness only in DEV), `src/debug/harness.ts`, `src/debug/perf.ts`, `src/fonts/*` if S0 left the gap, `tools/shot.mjs` (the 3-day run of brief section 9 row 2), `README.md`, tests.

### S11.6 Steps
1. (Tier C) Complete `es.ts`: every key of `en.ts` with a Spanish string, French flavour words kept, `.one/.other` and `.f/.m` pairs present; the words for "Be someone", "Creator", "Cupid", "Mischief", "Happily", "Parted" proposed in the hand-back for the owner (brief section 11 item 10).
2. `strings.test.ts` final form of 03 section 12 item 8: key parity; every `t('...')` literal exists; no `textContent =`, `toast(` or `logEv`-style call with a non-key literal anywhere in `src/` outside `strings/`.
3. Intro: the mark, title, four paragraphs, Begin, Continue, EN / ES per 04 section 5.7; language persists in the profile; `<html lang>` follows; switching language re-renders every open overlay and the feed (nested keys).
4. Options sheet: language, sound, speed, the seed; the Sound check and perf entries only under `body.dev`.
5. (Tier C) Accessibility per 04 section 11: `aria-label` keys on every control through `data-t-aria`, `aria-live="polite"` on toast and feed, every button at least 36x36 px, every text at least 11 px, contrast check over the darkest screenshot, `prefers-reduced-motion` honoured.
6. Photo mode: `body.photo` hides layers 5 to 8 and shows `#photoX` (GV 164-168, 63, 12182-12183, 12198).
7. Performance pass: profile with the perf overlay at the caps (30 visitors, 12 pigeons, 4 dogs, 220 particles, rain, zoom 0.30, 1.3, 2.4); apply the 03 section 15.2 tricks that are missing; confirm the phase budgets of 03 section 7.9 and 15.1; the phone report of brief section 9 row 4 by hand on a mid phone over USB.
8. Debug gating: `window.__PD` and the sound check and perf entries absent from `dist/index.html` (grep the bundle for `__PD`); `#dev` in the hash reveals the dev entries only in a DEV build.
9. Fonts: close the S0 gap if open; confirm `dist/index.html` makes zero network requests after load (DevTools network tab, brief section 9 row 1).
10. `tools/shot.mjs`: the full run of brief section 9 row 2 (intro, Begin, 3 days at 8x, zero console errors, final screenshot) as `npm run shot -- final`.
11. README: scripts, docs index, how to brief a model (point to this file's section 0).

### S11.7 Done when
1. The common gate; every row of brief section 9 that can be checked without the owner passes (rows 1, 2, 3, 5, 6, 9, 10, 11, 12) with the evidence in the hand-back; rows 4, 7, 8 are reported.
2. `grep -c "__PD" dist/index.html` prints 0; `ls dist` shows the three HTML files; `dist/index.html` opened from `file://` runs.
3. `shots/s11-intro-es.png` shows the Spanish intro with Continue; `s11-options.png`; `s11-photo.png` shows only the canvas and the close button; `s11-final.png` after 3 days at 8x with the chips, the three-row rail and a card, no overlap, nothing under a safe area.
4. The ES wording proposals for the six words are in the hand-back for the owner's yes or no.

### S11.8 Tests to add
`strings.test.ts` final, `a11y.test.ts` (jsdom: every `button` has an accessible name; no `font-size` under 11 px in the built CSS), `bundle.test.ts` (no `__PD`, no `http` URL in `dist/index.html`).

### S11.9 Out of scope
New features, Capacitor, a PWA manifest or service worker (brief section 8.2 item 12), a landscape layout.

### S11.10 Ask the owner before
Accepting the six ES words; any change to a token or the type scale; dropping a feature to meet the frame budget (report the measurement first).

### S11.11 Hand-back
Format 0.6 plus the brief section 9 table with PASS per row and the phone measurement.

---

## S12. Capacitor wrapper (later, after the owner signs off the HTML)

### S12.1 Goal
Wrap the signed-off `dist/index.html` as an Android and iOS app with Capacitor, offline, with safe areas, the audio session and storage working as in the browser. No gameplay change.

### S12.2 Model tier
Tier B.

### S12.3 Read first
Register rows 23, 24, section 7. Brief section 2 (Stores row), 8.2 item 12. 03 section 14 (Capacitor readiness checklist, all ten items). 05 section 7.5 item 4.

### S12.4 Inputs that already exist
The v1 build with brief section 9 all green and the owner's written sign-off; the new repository `parque-damour`.

### S12.5 Files to create or change
`capacitor.config.ts`, `package.json` (scripts `cap:sync`, `cap:android`, `cap:ios`; devDependencies `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`), `android/` and `ios/` generated folders, app icons and splash (the first allowed image assets, outside `src/`), `README.md`.

### S12.6 Steps
1. Verify every item of the 03 section 14 readiness checklist against the current build and fix any failure in the web app first (that fix is a normal slice hand-back).
2. `npx cap init "Parque D'Amour" <app id the owner supplies> --web-dir dist`; `npm run build`; `npx cap add android`; `npx cap add ios`; `npx cap sync`.
3. Set `webDir: 'dist'`, `server.androidScheme: 'https'`, no live-reload server in the committed config.
4. Audio: set the iOS playback session category so the ringer switch does not silence the game (05 section 7.5 item 4); keep `resume()` on pointerdown.
5. Storage: keep `localStorage` through `store.ts`; test that a saved park survives an app restart on both platforms.
6. Safe areas: confirm `env(safe-area-inset-*)` on a notched device in portrait; landscape is out of scope.
7. Icons and splash from the intro mark (04 section 5.7) rendered to PNG by a script, committed under `resources/`.
8. Run the brief section 9 row 4 measurement on the owner's mid phone through the app, not the browser.

### S12.7 Done when
1. `npx cap sync` exits 0 for both platforms; the Android debug APK and the iOS simulator build run offline with the network disabled; Begin, 3 days at 8x, Continue after a restart, zero console errors in the WebView.
2. 60 fps target with a 50 fps floor at the caps on the mid phone (brief section 9 row 4), measured with the perf overlay in a DEV build of the app.
3. The web build is byte-identical to the signed-off one except `base` if the owner asks for a store path.

### S12.8 Tests to add
None in Vitest; a manual checklist in the hand-back.

### S12.9 Out of scope
Store listings, screenshots for the stores, signing keys, monetisation, accounts, analytics, push notifications, a PWA manifest.

### S12.10 Ask the owner before
The app id, the display name spelling, the icon, any platform minimum version, anything that costs money.

### S12.11 Hand-back
Format 0.6 plus the device list, OS versions and the fps numbers.

---

## 13. Dependency graph

| Slice | Needs | May run in parallel with |
|---|---|---|
| S0 | nothing | nothing (everything waits) |
| S1a style board | S0 | S1b, S2 part A |
| S1b music board | S0 | S1a, S2 part A |
| S2 part A engine | S0 | S1a, S1b |
| S2 part B renderer | S2 part A, Style Gate recorded | S3 steps 1 to 5 and 9 to 12 (they draw nothing) |
| S3 | S2 part A (all), S2 part B (ghost and rail visuals) | S4 steps 1 to 11 (sim only) |
| S4 | S3 (save of visitors, tool hooks) | S3's UI steps; S4 step 12 waits for the gate, which is long passed |
| S5 | S4 | S6 steps 5 and 11 (progression rules, strings) |
| S6 | S5 | S7 steps 1, 2, 5 (mode, commands) |
| S7 | S6 | S8 (audio needs only the event names, fixed in S4 to S7) |
| S8 | S1b, Music Gate recorded, S5 events | S7, S9 |
| S9 | S2 part B, S6 (`c_sunbeam` data) | S8, S10 steps 1 to 2 that need no override visuals |
| S10 | S7, S9 | S8 |
| S11 | S0 to S10 | nothing (it audits everything) |
| S12 | S11 and the owner's sign-off | nothing |

```
S0 -> S1a ---------\
   -> S1b ----------\-------------------------------> S8 -\
   -> S2A -> S2B -> S3 -> S4 -> S5 -> S6 -> S7 -> S10 -> S11 -> S12
                       \                 \-> S9 ---/
```

Critical path: S0, S2A, S2B (after the Style Gate), S3, S4, S5, S6, S7, S10, S11. The two gates sit beside the path: the Style Gate must be recorded before S2B starts, the Music Gate before S8 starts. The owner's two picks are the only external waits; schedule S1 first so they are never on the critical path.

Lanes with three models: lane 1 (Tier A) S1a, S2B, S5, S8, S9; lane 2 (Tier B) S2A, S3, S4, S6, S7, S10, S11; lane 3 (Tier C) names, strings, content test, ES table, aria keys, as the lane 2 slices release them.

---

## 14. Estimates in effort units

One effort unit (EU) is one briefed working session that ends in a hand-back report: about two to three hours of a Tier A model, or one working day of a Tier B model on a well-specified brief. Review by the project runner adds 0.25 EU per hand-back and is not counted below.

| Slice | Tier | EU | Of which waiting on the owner | Notes |
|---|---|---|---|---|
| S0 | B | 1 | 0 | 0.5 verify, 0.5 finish |
| S1 | A | 4 | 2 gate waits | S1a 2, S1b 2; the waits are calendar time, not work |
| S2 | B + A | 6 | 0 | part A 2.5, part B 3.5 |
| S3 | B | 3 | 0 | |
| S4 | B + A | 5 | 0 | sim 3.5, rig 1, names and strings 0.5 (Tier C) |
| S5 | A | 4 | 0 | |
| S6 | B + C | 3 | 0 | strings and content test 0.5 (Tier C) |
| S7 | B | 2.5 | 0 | |
| S8 | A | 4 | 0 | includes the manual listening pass |
| S9 | A + B | 3.5 | 0 | includes the perf measurement |
| S10 | B + A | 3.5 | 0 | |
| S11 | B + C | 3 | 1 (ES words, phone report) | |
| S12 | B | 2 | 1 (sign-off, app id) | after v1 |
| Total | | 44.5 | 4 | critical path about 31 EU with three lanes |

---

## 15. Definition of done for v1

v1 is done when every row of brief section 9 passes and the project runner has the evidence in one final hand-back (S11). The rows, with the command or action that proves each:

| # | Criterion | Proof |
|---|---|---|
| 1 | Builds | `npm run check` exits 0; `ls dist` shows `index.html`, `style-board.html`, `music-board.html`; DevTools network tab shows 0 requests after load |
| 2 | Runs on a phone viewport | `npm run shot -- final`: 390x844 dpr 3, intro, Begin, 3 days at 8x, zero console errors; `shots/final-*.png` show chips, three-row rail, card, no overlap, nothing under a safe area |
| 3 | 60 fps desktop | perf overlay at zoom 1 with 30 visitors, 12 pigeons, 4 dogs, 220 particles for 60 s: frame EMA at or under 16.7 ms, sim + draw at or under 12 ms |
| 4 | Mid phone | the S11 or S12 report: 60 fps target, 50 fps floor |
| 5 | Determinism | `tests/determinism.test.ts`: 64,800 steps twice equal in `stateHash`, `rngN`, `simSteps`; one extra command differs |
| 6 | Save round trip | `tests/save.test.ts`; `parque:park-v1` under 1 MB; the v0 fixture migrates; Continue by hand |
| 7 | Style Gate passed | register section 4 row holds the letter and date; `profile.stylePick` set by the board |
| 8 | Music Gate passed | register section 4 row holds the letter, date and knobs; `profile.musicPick` set by the board |
| 9 | Both languages complete | `tests/strings.test.ts`; by hand: intro, rail, chips, cards, sheets, feed, toasts in EN and ES; `<html lang>` follows |
| 10 | Tone | `tests/tone.test.ts`: no child target, cap 3, ten kinds, items return, reaction lengths |
| 11 | Content complete | `tests/content.test.ts`: 16 tools, 19 abilities, 6 avatars, 7 stages, 10 kinds, 8 weather kinds, 11 archetypes, exact spellings |
| 12 | Tests green | `npm test` and `npm run lint` on the final commit |

Also required: the four hard-rule greps print nothing (`Math.random`, colour literals outside the two files, `__PD` in the bundle, string literals outside `strings/`); every slice's hand-back is filed under `docs/handbacks/<Sx>.md`; the register has no unanswered conflict reports.

---

## 16. Assumptions and open points

Values this document defines that the register does not (the owner may object to any; on change, update `08-Test-Plan.md` and the slice briefs):
1. The tier assignment per slice (0.1, each `.2`), the three lanes (13) and the effort unit definition and numbers (14).
2. The prompt template, the hand-back format and the common gate commands (0.2, 0.5, 0.6); hand-backs filed under `docs/handbacks/`.
3. The scratch-page rule for options (`scratch/`, not committed) and the fallback when the owner cannot be reached (0.4 item 3).
4. S0's verify table, including the Pages workflow text (register section 7 step 3 points here), `.gitignore` contents and the `data-day` wait in `tools/shot.mjs` (03 section 17 A21).
5. Fonts: woff2 Latin and Latin Extended subsets under `src/fonts/`, both families at most 400 KB together (brief section 11 item 1 asked this document to confirm: confirmed), with a system-font fallback until S11 if the download fails.
6. The board paths `style-board.html`, `music-board.html`, `src/debug/style-board.ts`, `src/debug/music-board.ts`, `src/debug/motifs.ts` as second and third Vite entries (04 section 13 item 4 and 05 section 9 item 8 asked this document to confirm: confirmed); `ls dist` therefore shows three files from S1 on.
7. Recording a gate: the two `tokens.css` tokens `--theme-color` and `--body-bg`, the `DEFAULT_STYLE` and `DEFAULT_MOTIF` constants, and the register version bump to 1.1 by the S1 model (S1.6 steps 15 to 17).
8. The split of S2 into part A (engine, no gate) and part B (renderer, after the gate), and of S4 into sim and a Tier A rig sub-brief.
9. `worldHash()` (layers and props only) on the harness for the tool and undo tests (S2 step 14, S3.7).
10. The determinism fixture: seed 101, 64,800 steps, 12 scripted commands, extended by each later slice; the `S_HAPPILY` and `S_PARTED` seeds found by scanning 1 to 200 (S5.7).
11. Abilities and avatars outside a slice return `reason.not_here` so the registries are complete from S6 and S7 (content test and dimmed pills).
12. The cross-slice hooks named in hand-backs (vendor spawn, sitter eviction, `openNear` on undo, the music state object, the umbrella harness flag) are listed per slice rather than owned by a shared document.
13. The screenshot names `shots/<slice>-<name>.png` and the eighteen-file matrix of S9 (04 section 12 item 8, two viewports).
14. S12's config choices (`webDir dist`, `androidScheme https`, icons under `resources/`).

Open points for the owner:
1. Whether the owner wants the two gate picks on the same day (S1a and S1b in parallel, 4 EU, two Tier A models) or one after the other.
2. Whether a Tier C model may own `tests/content.test.ts` and `strings.test.ts` (this plan says yes) or whether every test stays with the slice's tier.
3. The three-lane schedule assumes three models can run at once; with one model the total is the 44.5 EU in order S0, S1, S2, S3, S4, S5, S6, S7, S9, S8, S10, S11.
