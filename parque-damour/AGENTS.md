# Parque D'Amour: standing instructions for any model working in this repository

Version 1 · 2026-10-10 · Owner: Jeduthun Oosthuis. `CLAUDE.md` is a verbatim copy of this file; when one changes, copy it over the other in the same commit.

## 1. What this project is

Parque D'Amour is a phone-first Canvas 2D game in strict TypeScript: a quaint Paris park of 48 x 48 tiles where visitors fall in love and the player, as **Cupid** or **Mischief**, assists or spoils the romances.
Two modes: **Creator** (god view, free park tools, abilities on sim-second cooldowns) and **Avatar** (possess a pigeon, a pomeranian, a mime, a flower seller, a busker or the girl with the baguette, controlled by taps).
It is built on the architecture and layout of the owner's single-file game Gnome Village (GV, 12,246 lines): soft-isometric rotatable camera, deterministic twin-RNG fixed-step loop, paper HUD, procedural Web Audio, zero image or audio assets.

## 2. Read order and precedence

| Order | Document | Role |
|---|---|---|
| 1 | `docs/01-Decision-Register.md` | The spine: every number, name, id and status. Wins every conflict. |
| 2 | `docs/00-Product-Brief.md` | Intent, scope, non-goals, success criteria, governance (section 10). |
| 3 | `docs/07-Build-Plan.md` section 0, then your slice section `Sx` | How to brief, the common gate, the hand-back format, your task. |
| 4 | The documents your slice lists under `Sx.3 Read first` | 02 rules of play, 03 code contract, 04 art, 05 audio, 06 numbers and string keys, 08 tests, 09 porting map. |
| 5 | The rest of `docs/`, then `10-Gnome-Village-HTML-Architecture-Review.md` and `gv-review-notes/` | Reference about GV, not rules for Parque. |

Precedence: register > brief > the numbered documents 02 to 09 > code comments and READMEs. A conflict is a bug in the lower document: stop, write it under "Open questions" in your hand-back, and do not choose. Never change the register or the brief without the owner; propose a change as four lines, What / Why / Where / Risk (brief 10.2). Gate picks go into register section 4 on the owner's word only. `docs/README.md` indexes the pack.

## 3. Hard rules

| # | Rule | Defined in |
|---|---|---|
| 1 | Deterministic simulation: fixed step `SIM_DT = 1/60`; the same seed and command log give the same `stateHash` and `rngN` on any device at any speed. Sim decisions call `rng()`; anything visual or audible calls `vrng()`. No `Math.random`, `Date.now` or `performance.now` outside `src/core/loop.ts` (audio cue gaps are the only other real-time timers). | 03 P1, P3, P10; 07 0.7 item 6 |
| 2 | Commands only: `ui/`, `render/`, `audio/` and `debug/` never write simulation state. Every player action is a `Command {tick, side, kind, payload}` enqueued by the shell and applied by the loop at the start of a step. | register 2.9; 03 P2, section 5 |
| 3 | Imports flow downward only: nothing under `core/`, `world/`, `entities/`, `play/` or `save/` imports from `render/`, `audio/`, `ui/` or `debug/`, or reads `cam`, the DOM or the wall clock. The one `MODE` read is the decide-cadence branch (03 4.4). | 03 2.1, P3, P4 |
| 4 | Ids, not references: every cross-entity link in a record or saved field is a numeric id; 0 means none. No record holds another record. | register 3.3; 03 P5 |
| 5 | Typed arrays for tiles: each per-tile layer is a typed array of length `NC = 2304` indexed by `I(x, y) = y * N + x`. No per-tile objects. | register 3.1; 03 P6 |
| 6 | Every user-facing string (toast, feed, card, rail, aria-label, cascade status, refusal reason) is a key resolved by `t(key, params)`. Add the key to `src/ui/strings/en.ts` and `src/ui/strings/es.ts` in the same change. No inline sentence building; use `plural()` and `gender()`. | register 3.12; 03 P7, section 12 |
| 7 | Zero image and audio assets: no `<img>`, sprite sheet, SVG file, audio file or runtime fetch. Everything is drawn or synthesised in code; the only files are the bundled Fraunces and Figtree woff2. Scene colours live only in `src/render/ambient.ts`, HUD colours only in `src/styles/tokens.css`. | register 1, 25; 03 P9; 04 4.5; 07 0.7 items 5, 7 |
| 8 | No new dependencies without asking; runtime dependencies stay at none. No React, no UI framework, no game engine, no state library, no CSS framework. | register 0, 3; 03 P8, section 14 |
| 9 | Keep every source file under about 600 lines. When a file grows past that, split it along the module map in 03 section 2; never invent a new directory or move a responsibility to another layer. | this file |
| 10 | When porting GV code, read only the line range with `sed -n 'A,Bp'` (never the whole file) and start the file with the header comment of 09 1.3: `// Ported from GV <first>-<last> (<functions>).`, the verdict PORT or ADAPT, the rules changed, the lines dropped. Never port terrain, water flow, erosion, construction or households (07 0.7 item 1). | 09 1.2, 1.3; brief 10.3 |
| 11 | Every sim rule you touch gets or updates a Vitest test in `tests/` that fixes a number from the design; each `describe` names the register row or document section it locks. Never skip, weaken or delete a test, never mock `rng()`, never change a screenshot baseline to make a test pass. | 08 1.3, 1.4; 09 1.3 |
| 12 | Never touch the gates' decisions. No final prop, figure, ground, sky, cue or music until the owner's pick is recorded in register section 4; until then only the boards of S1. For any art or music work, render two or three variants on a scratch page, screenshot them at 390 x 844 and present them to the owner before building the final one. | register rows 1, 25, 26; 07 0.4 |
| 13 | Tone: nothing hurts anyone. Allowed: poop on head, slight trip, item snatched and later dropped, soaked, wasp flap, mime, rival flirt, fog, hats flying. Not allowed: injuries, cruelty, targeting children, mocking appearance. At most 3 embarrassments per person per day; the 15 % backfire stays. | register 3.14; 02 section 13 |
| 14 | Use ids, names and numbers exactly as register sections 3 and 5 spell them; never rename, round or "improve" one. A value no document defines: define it, list it under "Assumptions" in your hand-back, carry on. | brief 10.2, 10.3; 07 0.7 item 8 |

## 4. Workflow

1. Work from the app root `/home/user/gnome-village/parque-damour` (later the repository `parque-damour`). Touch only the files your slice names under `Sx.5`. Create nothing outside `src/`, `tests/`, `tools/`, `docs/`, `scratch/`, `shots/`, `.github/` and the app root (S12 adds `resources/`).
2. The npm scripts (03 section 14):

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server at `http://localhost:5173/` |
| `npm run build` | single-file production build; `ls dist` must show only `index.html` (plus `style-board.html` and `music-board.html` from S1 on) |
| `npm run preview` | serves the production build |
| `npm run lint` | oxlint over `src tests tools`; 0 errors |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm test` | Vitest; every file green, including `tests/determinism.test.ts` once it exists (S2) |
| `npm run shot -- <slice>` | puppeteer-core with `/opt/pw-browsers/chromium`, 390 x 844, dpr 3, writes `shots/<slice>-<name>.png`, fails on any console error |
| `npm run check` | typecheck, lint, test and build in one go |

3. Before reporting, run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` from the app root. Every one must exit 0. Do not mark anything done that you did not run. A slice that touches `src/core`, `src/world`, `src/entities`, `src/play` or `src/save` must also show the determinism test passing in the same run.
4. Any visual change: `npm run shot -- <slice>` at 390 x 844, then open each PNG and look at it: the four chips, the three-row rail, the card, nothing under a safe area, no horizontal scroll, no overlap. Report what you saw, not that the file exists.
5. Commits: never on `main`; today the work lives on branch `claude/parque-damour-game-design-oqc8zm` of `gnome-village`. First line `Parque D'Amour Sx: <what changed>` in the imperative, under 72 characters; the body lists files, tests added and any deviation; attribution trailers as your harness instructs. Never commit `node_modules`, `dist`, `shots` or `scratch`. Commit or push only when asked.
6. Report back in the hand-back format of 07 section 0.6 (under 60 lines): files created or changed; commands run with results; the done-when checklist with evidence; the determinism fixture (`seed, steps, rngN, stateHash`) if you touched the sim; GV lines ported; deviations; assumptions; open questions for the owner; options shown with screenshot paths and the owner's pick or "pending"; TODOs left, with `file:line`.

## 5. Ask before

1. Changing any number, name, id or status in the register, or any text of the brief.
2. Adding a dependency (runtime or dev), a font family, an image, an SVG file or an audio file.
3. Doing any art, prop, figure, effect, cue or music work before its gate is passed, or without presenting options first.
4. Changing a token value in `src/styles/tokens.css`, the iso constants (`TW 26, TH 13, EH 26, VANCH 0.46`), the time constants, the caps, or a DOM id of 03 section 10.1.
5. Touching a file outside your slice's list, another slice's document, or the module map itself.
6. Skipping, deleting, loosening or `it.skip`-ing a test, or changing a screenshot baseline.
7. Adding a `statue` tool, or a new ability, avatar, archetype, stage, embarrassment kind or weather kind.
8. Changing the save schema version or touching a `localStorage` key that does not start with `parque:`.
9. Pushing, merging, force-pushing, or creating the `parque-damour` repository (register section 7).

## 6. Where things are

| What | Path |
|---|---|
| App root (`package.json`, `vite.config.ts`, `tsconfig.json`, `.oxlintrc.json`, `index.html`) | `/home/user/gnome-village/parque-damour/` |
| Source, by the fixed module map (03 section 2) | `src/main.ts`, `src/core/`, `src/world/`, `src/entities/`, `src/play/`, `src/render/`, `src/audio/`, `src/ui/`, `src/save/`, `src/debug/`, `src/styles/` |
| String tables | `src/ui/strings/en.ts`, `src/ui/strings/es.ts` |
| Scene palette and HUD tokens (the only colour literals) | `src/render/ambient.ts`, `src/styles/tokens.css` |
| Fonts (bundled woff2) | `src/fonts/` |
| Tests, fixtures, screenshot baselines (committed) | `tests/`, `tests/fixtures/`, `tests/baseline/` |
| Tooling scripts | `tools/shot.mjs`, `tools/det.mjs`, `tools/perf.mjs` |
| Screenshots and scratch option pages (never committed) | `shots/`, `scratch/` |
| Design pack and its index | `docs/`, `docs/README.md` |
| The register, the brief, the build plan | `docs/01-Decision-Register.md`, `docs/00-Product-Brief.md`, `docs/07-Build-Plan.md` |
| GV review and the 21 per-section notes | `docs/10-Gnome-Village-HTML-Architecture-Review.md`, `docs/gv-review-notes/NN-notes.md` |
| GV source (owner's upload on this machine; read with `sed -n`, never whole) | `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html` |
| Reference art | `docs/reference-art/ref1-paris-park-map-flat-vector.jpg`, `ref2-girl-baguette-watercolour.jpg`, `ref3-arc-de-triomphe-line-and-wash.jpg` |
| Chromium for screenshots | `/opt/pw-browsers/chromium` |
| Save keys | `localStorage` `parque:profile-v1`, `parque:park-v1` |
| Debug harness and perf overlay (dev build only) | `window.__PD` from `src/debug/harness.ts`; `#perf` from `src/debug/perf.ts` |
| Pages workflow (inactive until the repository move) | `.github/workflows/pages.yml` |
