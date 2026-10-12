# Parque D'Amour: Product Brief

Version 1.1 · 2026-10-12 · Owner: Jeduthun Oosthuis · Author: Claude (design session) · Status: LOCKED (changes only through section 10)

**How to use this document.** Read this file first, before any other file in `docs/`. It says what the game is, what v1 contains, what v1 must not contain, and how we know v1 is done. It does not own numbers: every number, name and id lives in `01-Decision-Register.md` (the register) and is repeated here only so this file reads on its own. If a value here disagrees with the register, the register is right and this file has a bug; report it, do not resolve it yourself. "GV" is the owner's existing game Gnome Village, one HTML file of 12,246 lines; "GV 1234" means line 1234 of that file, as indexed in `10-Gnome-Village-HTML-Architecture-Review.md` (the review). Module paths such as `src/play/tools.ts` are the fixed module map of the scaffold.

## 1. Vision

Tagline: **the park that matchmakes**.

**The fantasy.** You hold a small square of Paris in your hands: a railed park of 48 by 48 metres with a fountain at its heart, a pond with one bridge, two gravel loops, benches under twelve trees, a kiosk by the south gate, Haussmann facades on three sides, the river along the fourth, and the Eiffel Tower on the skyline. Visitors come in through five gates all day: singles, couples, families, elders, tourists, joggers, artists, buskers, dog walkers, a gardener and a vendor, and the pigeons that belong to no one. Two strangers notice each other by the fountain. Whether they end the evening with a proposal under a lit lamp, or leave by different gates with a baguette stolen by a pomeranian and pigeon droppings on a beret, is up to you. You play **Cupid** or **Mischief**: as the Creator, the god's hand that shapes the park and casts small miracles and small mishaps; or as an Avatar, by becoming someone in it: a pigeon, a pomeranian, a mime, a flower seller, a busker, or the girl with the baguette.

**The feel.** A painted postcard that moves. The view is GV's soft isometric camera, turned with a twist of two fingers, drawn entirely in code with no image assets. The pace is gentle: a day lasts six real minutes at 1x, a season eighteen, a year seventy-two, and the speed dial goes to 8x when you want to watch a romance bloom. The humour is slapstick and kind: nothing hurts anyone, nothing dies, children are never targets, and a mischief that backfires makes the pair laugh together. The sound is procedural: a café swing by day and a music-box lullaby from dusk to dawn, birds in the trees, the fountain, café chatter, distant bells and traffic, and rain on gravel. Aesthetics come first: the owner chose the art style and the music at two gates before any final art or music was made. Both gates passed on 2026-10-12: art direction **A Storybook**, music **B Music-box lullaby** and **C Café swing** (register §4). Every new prop, figure, effect, cue or piece of music still starts with two or three options shown to the owner (register row 26).

## 2. Platform and stack (locked)

| Item | Decision | Source |
|---|---|---|
| Target | Phone first, portrait, reference viewport 390x844 CSS px, safe areas via `env(safe-area-inset-*)`; desktop Chrome must also run | register 0, 23; GV 5, 32 |
| Rendering | One `<canvas>`, Canvas 2D, `dpr` capped at 2 (GV ~6336), `imageSmoothingEnabled = false` (GV 12044); no WebGL | register 0 |
| UI | Plain DOM overlays over the canvas (HUD, rail, card, sheets, feed, toast, intro); no UI framework, no React | register 0, 3 |
| Language | TypeScript with `strict: true`, ES modules under `src/` following the fixed module map | register 0, 3 |
| Build | Vite; `npm run build` emits `dist/index.html` as one self-contained file (vite-plugin-singlefile) | register 3 |
| Tests | Vitest via `npm test` | register 0 |
| Lint | oxlint, zero errors | register 0 |
| Screenshots | puppeteer-core with the Chromium at `/opt/pw-browsers/chromium`, viewport 390x844 | fixed tooling |
| Hosting | None planned: the app stays in `gnome-village` and ships as the single file `dist/index.html` with `base: './'`; Pages deployment is deferred (the `pages.yml` workflow stays inert) and a separate repository is optional (register section 7) | register 4, 7 |
| Stores | Capacitor wrapper later; v1 is designed for it now: offline, self-hosted fonts, safe areas, 60 fps on a mid phone | register 23 |
| Persistence | `localStorage` keys `parque:profile-v1` and `parque:park-v1`, versioned, migrated | register 3.11 |
| Audio | Web Audio API, procedural, zero assets | register 25 |
| Fonts | Fraunces (display) and Figtree (UI), self-hosted and bundled; GV fetched them from Google Fonts (GV 10-12), Parque does not | register 23; GV 10-12 |
| Assets | None: no images, no sprites, no audio files, no fetches at runtime | register 1, 25 |
| Loop | Fixed step 1/60 s, speed dial 1x to 8x plus pause, wall budget and lite bits as GV | register 20; GV 12024-12096 |
| Randomness | Two seeded mulberry32 streams (sim, visual) with a draw counter; `Math.random` is never called | register 2.9; GV 583-598 |
| Input | Pointer Events: tap, drag pan, pinch zoom, twist rotate, wheel (GV 11168-11230); taps only, no joystick | register 13 |
| Languages | EN and ES string tables from day one; French flavour words in both | register 22 |
| Debug | `window.__PD` harness and perf overlay, dev flag only | register 3.10; GV 12223-12241 |
| Monetisation | None: no ads, no IAP, no accounts | register 24 |

## 3. Visual identity

### 3.1 Locked now
1. View: soft isometric 2:1 projection with the GV constants `TW = 26`, `TH = 13`, `EH = 26` px per height unit at zoom 1, `VANCH = 0.46`; zoom 0.30 to 3.0; quarter-turn buttons and pinch twist that hold the screen-centre world point (GV 6331-6443, 12142-12150). Fit frames the park bounds plus the 8-tile apron, not an island (register 3.1).
2. Zero image assets. Every tile, prop, figure and sky is Canvas 2D paths and gradients, using GV's sprite-cache pattern where it pays (GV 6780-6835).
3. The paper HUD identity is GV's, kept as is: glass chips, pills and tool buttons (GV CSS 35-122), card with bars (125-138), sheet recipe (48-72, 196-225), toast (158), feed (162), intro with language toggle (140-156, 294-313), photo mode (164-168), overlay stacking from the measured rail height (`layoutOverlays`, GV 10689), safe-area padding and `prefers-reduced-motion` (GV 229). The tokens in 3.2 go into `src/styles/tokens.css` exactly.
4. Fonts: Fraunces for the title and display text, Figtree for UI text (GV 10-12). Review §15 item 48 asked whether to change the serif; the answer is no.
5. Minimum UI text size 11 px (GV used 8.5 to 11.5 px, review §13; review §15 item 64 asks for a higher floor).
6. The scene has three bands that turn together: the 48x48 park; the 8-tile apron with quay, river, railings, pavement and facades drawn as world-space props; and a skyline band with rooftops and the Eiffel Tower silhouette drawn relative to camera angle, as GV draws its far shore (register 3.1, 2.4).
7. Light: GV's per-frame ambient pipeline (`computeAmbient`, `lit`, GV 6452-6478) with the register's eight day bands and golden hour at f 0.72 to 0.80; lamps lit from dusk to dawn (register 3.2).

### 3.2 HUD tokens (exact, GV CSS 16-23)

| Token | Value | Used for |
|---|---|---|
| `--paper` | `#F1EDF5` | sheet and intro paper |
| `--paper-2` | `#E6E0EF` | secondary paper, pressed states |
| `--ink` | `#4A4458` | text |
| `--ink-soft` | `#6E6680` | secondary text |
| `--moss` | `#8CBE85` | positive accent, Park group |
| `--sky` | `#A6CDE6` | info accent |
| `--berry` | `#EDA9C4` | Cupid accent, hearts |
| `--ember` | `#F2B67E` | Mischief accent, warnings |
| `--stone` | `#B9B7C6` | disabled, locked tiers |
| `--glass` | `rgba(250,248,253,.82)` | chip and rail background with `backdrop-filter: blur(9px)` |
| `--glass-line` | `rgba(74,68,88,.13)` | chip borders and separators |
| `--shadow` | `0 2px 10px rgba(74,68,88,.13)` | chip shadow |
| `--ui` | `"Figtree",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif` | UI font stack |
| `--display` | `"Fraunces",Georgia,serif` | display font stack |

The "Used for" column assigns the accents to sides; the values are GV's, and the Style Gate kept them. Theme colour and body background are GV's `#DCE6EC` (GV 6, 8, 26), which is direction A's value, so the pick of 2026-10-12 keeps them.

### 3.3 Reference art (owner supplied, `docs/reference-art/`)

| File | What it shows | What Parque takes from it |
|---|---|---|
| `ref1-paris-park-map-flat-vector.jpg` | Flat pastel vector map of Paris: a winding river with a sailboat, café terraces with striped awnings and bistro chairs, a fountain, hedges, the Eiffel Tower, Notre-Dame, the Arc de Triomphe, a balloon | Colour mood (cream, sage, rose, sky blue, awning red); the river as scenery; café chairs and awnings; the whole of direction B |
| `ref2-girl-baguette-watercolour.jpg` | Watercolour of a girl walking in profile: black beret, red hair ribbon, blue and white striped top, white trousers, flat shoes, wicker basket with two baguettes, on grainy paper | The `a_matchmaker` avatar exactly; the figure rig's long-limbed proportions and small face; paper grain and soft edges for direction C |
| `ref3-arc-de-triomphe-line-and-wash.jpg` | Ink line with watercolour wash of the Arc de Triomphe: loose black line, warm ochre wash, teal and orange autumn leaves, three-globe street lamps, bare trees | Line-and-wash treatment for facades and lamps; the autumn palette; the three-globe lamp silhouette; direction C |

### 3.4 Style Gate: passed 2026-10-12, direction A Storybook (register row 1, §4)
1. Slice 1 built `style-board.html`: directions **A Storybook** (GV palette and brushwork with French props), **B Pastel Postcard** (flat vector like ref1), **C Line and Wash** (ink line and watercolour like ref2 and ref3), side by side, each rendered with the real primitives and showing: palette, ground + path + bed, a tree in three seasons, bench, lamp, fountain, two lovers, a pigeon, the pomeranian, a facade, HUD chips. On 2026-10-12 the owner picked **A Storybook**.
2. The pick fixes, as direction A (`04-Art-and-UI-Style-Guide.md` 3.1 and 3.2, column A): the scene palette (ground, water, sky, flora, facades, props), the stroke treatment, the figure style (proportions, faces, whether faces read at zoom 1), seasonal tints, the particle look (petals, leaves, snow, rain), the intro art, and the theme colour and body background `#DCE6EC`. The owner saw the figure height `FH` 22 px at zoom 1.3 (board tile 7) and picked A without objection, so `FH` 22 stands.
3. Rule: all art from Slice 2 on draws direction A only, and new primitives implement direction A only. The B and C branches already in the `src/render/*` primitives are frozen: they stay only so `style-board.html` still renders as the record of the gate, and nobody extends them (04 3.4). A new prop, figure, effect or screen still starts with two or three options inside direction A shown to the owner (register row 26).
4. The palette is written once as named constants in `src/render/ambient.ts` (`PALETTES` keeps all three for the board; `style()` returns A); no other file holds a scene colour literal (GV scattered ~180 hex literals, review §7.2).
5. The pick is stored in the profile as the `style pick` field (register 3.11) so a second style can be offered later without a migration.

## 4. Audio identity

### 4.1 Locked now
1. Procedural Web Audio, zero assets (register 25). All audio randomness is on the visual RNG; audio reads sim state and writes none (GV 585-598; review §2.5).
2. GV's engine ported into `src/audio/engine.ts` and `limiter.ts`: master chain (gain 0.84, lowpass 2100 Hz, high shelf -6 dB above 1100 Hz, compressor; GV 6056-6072), synthetic 2.2 s reverb (`makeIR`, GV 6073), `tone` with envelope, glide and LFO (GV 6090-6113), pan by screen x (GV 6081), audibility by screen distance (GV 6085), per-kind real-time limiter `aOK` (GV 6131-6137) with the fix from review §8: audibility is tested before the gate, so an off-screen cue never silences an on-screen one of the same kind.
3. Birdsong kept: the six voices and phrase scheduler (robin, warbler, thrush, chiffchaff, blackbird, wren; GV 6212-6269) in `birds.ts`, singing from trees near the view in dawn and dusk windows as GV.
4. New ambience in `ambience.ts`: the fountain as a point source, café chatter and clink at the kiosk, distant bells and traffic beyond the railings, rain on gravel, pigeon wings. Never a hiss.
5. New cue vocabulary in `cues.ts` for romance and mischief beats (proposal list, final table in the audio design document): footsteps on gravel, bench creak, sigh, laugh, gasp, kiss, bouquet, pigeon flutter, splat, slip, bark, wasp, fog horn, fireworks, a Happily chord, a Parted phrase. Gains stay small (0.003 to 0.060 peak; GV used 0.014 to 0.060).
6. Cue gaps are real time and widen with the speed dial as GV; the context is created on the Begin tap and suspended on hidden tabs (GV 12199, 12216-12217).
7. The Sound button on rail row 3 toggles mute. The sound check and perf overlay are dev-only behind a flag (register 3.10).

### 4.2 Music Gate: passed 2026-10-12, B Music-box lullaby and C Café swing (register row 25, §3.13, §4)
1. Slice 1 built `music-board.html` with three playable motifs: **A musette waltz**, **B music-box lullaby** (GV kin; GV's `tune` is a 12-note pentatonic box, review §8), **C café swing**; each with a romance-rising and a parted variant. On 2026-10-12 the owner liked **B** and **C** and keeps both; **motif A, the musette waltz, is retired** and never plays in the game.
2. Use (ADVISED, the owner may change it; register 3.13): **C** from dawn to the end of golden hour (`f` in [0.20, 0.80)), **B** from dusk to dawn; each plays its rising or parted variant by the romance state; a switch between B and C waits for a phrase boundary and crossfades over 2 s.
3. The pick fixes the two motifs, their voices and tempos, with the knobs at the board defaults of `05-Audio-and-Music-Design.md` §6.3 (columns B and C), and the gate mix: `MUSIC_MAKEUP` 4.5 on every music voice and B `TINE_MAKEUP` 2. Measured at the gate: B rising peaks at -19.9 dBFS and C rising at -19.5 dBFS at `master`; the compressor output peaks at -17.8 dBFS with the cue bed playing. Whether avatar mode uses a closer mix was not answered at the gate and stays open (section 11 item 8).
4. Slice 8 moves B and C from `src/debug/motifs.ts` into `src/audio/music.ts`, and moves the waltz code out of `music.ts` into `src/debug/motifs.ts`, so the board still plays all three as the record of the gate. The pick is carried in the code by `MUSIC_PICK = { day: 'C', night: 'B' }` and `DEFAULT_MOTIF = MUSIC_PICK.day` in `src/audio/music.ts`. The profile's `music pick` field holds one letter, so it cannot hold the two-motif pick and the game does not read it (05 §6.5).
5. Rule: music and cue work from Slice 8 on uses motifs B and C only; a new cue or piece of music still starts with two or three options shown to the owner (register row 26).

## 5. The two modes

### 5.1 Creator mode
`MODE = 'creator'`, `PLAYER = null` (`src/play/mode.ts`) (`PLAYER` is the register's null; in code it is 0, 03 P5). The player is the god's hand over the park. Rail row 1 is a segmented switch **Park | Cupid | Mischief** and the scrolling strip of that group, locked abilities dimmed with their tier; row 2 is brush size and Undo for Park, or the active ability's cooldown chip; row 3 is pause and speed, rotate left and right, Fit, Sound, **Be someone**, Photo, New (register 3.9). Park tools are free and undoable 10 deep. Abilities cost nothing but have a cooldown in sim seconds and some have a daily charge (register 3.8). Tapping a visitor shows the card; a paired single shows the pair card; the Romances sheet pins the featured pair. Everything the player does becomes a `Command {tick, side, kind, payload}` applied by the simulation (`src/core/commands.ts`), never a direct mutation from the UI (register 2.9). The camera is free; Fit frames the park.

### 5.2 Avatar mode
`MODE = 'avatar'`, `PLAYER = <actor id>`. **Be someone** opens the avatar picker listing the unlocked avatars with side and tier: `a_pigeon` (Mischief T0), `a_pomeranian` (Mischief T1), `a_mime` (Mischief T3), `a_florist` (Cupid T1), `a_busker` (Cupid T2), `a_matchmaker` (Cupid T3, the girl with the baguette). The camera follows the actor and zooms in on entry as GV does (GV 11257). Control is taps only: tap the ground to go there, tap a thing for the contextual action, exactly GV's `playerTap` cascade that returns a status string the shell toasts (GV 5653-5688, 11270-11279), defined per avatar in `02-Game-Design.md` §Avatar mode and coded in `src/play/avatar.ts`. Rail row 1 shows the avatar's action hints; row 3's mode button reads **Creator**. One branch in the simulation swaps the actor's brain (GV 5696 pattern). An avatar's actions score points for its side as the equivalent ability would (register 3.8). Tapping Creator returns the actor to its own AI (register 14); New forces creator mode (GV 12107 pattern).

## 6. The core loop: one day as the player lives it
1. **Morning.** A new park opens at f = 0.30, spring day 1, seed shown in the Options sheet. The clock chip reads weather dot · Morning · Day 1 · Spring. Visitors walk in through the five gates up to the cap of 30, each with needs (hunger, energy, comfort, social) and an archetype routine; pigeons (6 at first, up to 12) and up to 4 dogs are about.
2. **Shape.** With the free Park tools (`hand`, `path`, `lawn`, `bed`, `hedge`, `tree`, `pond`, `canal`, `bridge`, `bench`, `picnic`, `lamp`, `fountain`, `kiosk`, `bandstand`, `remove`) you lay a loop, set benches and lamps, dig a pond. A ghost shows green or red with a ranked reason before you place (GV 5840-5989 pattern). Undo takes back the last 10 park commands. Visitors wear desire paths in the lawn; the gardener paves worn runs.
3. **Notice.** Two singles pass within 4 tiles with line of sight, both idle or strolling, compatible by `seeks`, and a 50 % roll passes: a Pair forms at stage 1 Notice with affinity 0.2 to 0.4. The Romance chip shows the featured pair (highest stage, or the one you pinned).
4. **Choose a side.** Cupid: `c_petals` (charm +2 on a 3x3 for 20 s) or `c_bouquet` (affinity +0.05). Mischief: `m_pigeon` (poop) or `m_sprinkler` (soaked): comfort -0.3, affinity -0.06 to -0.15, +1 MP, unless the 15 % backfire makes them laugh together (affinity +0.04, no point). The ability starts its cooldown in sim seconds; the cooldown chip counts down.
5. **Stages.** Through midday and afternoon the pair climbs Chat, Bench, Stroll, Picnic when the affinity gate holds and the prerequisite exists: a free bench within 8 tiles, a path loop of 12 or more tiles, a picnic spot or café table within 10 tiles and no rain. You supply what is missing with a tool, or deny it with `m_wasp` or `m_mime`. Charm at their spot (flowerbed, fountain, lit lamp, busker, petals, sunbeam, river view, bandstand; cap 6) converts to affinity at +0.004 per charm point per 10 s. Each stage you helped earns +1 CP.
6. **Weather.** A shower sends comfort down and visitors to shelter. `c_umbrella` makes rain count as charm +2 for the pair; `c_sunbeam` clears a 7x7 patch for 60 s; `m_raincloud` drenches a 5x5. In winter the pond freezes and snow falls.
7. **Be someone.** You possess `a_pigeon`: tap the ground to fly there, tap a visitor for the pigeon's action, scoring as `m_pigeon` would. The pair card still shows their affinity. Tapping Creator hands the pigeon back to its own AI.
8. **Golden hour.** From f 0.72 the light warms; at dusk the lamps light. Kiss needs golden hour or evening, or a fountain or lit lamp beside them, and affinity 0.80. Proposal needs a romantic spot (bandstand, bridge, fountain, lamp-lit bench) and affinity 0.90; the same day only at 0.95 or more, else on a later visit for regulars.
9. **An ending.** Happily: the proposal is accepted, fireworks particles, +5 CP, they leave together and return later as a couple. Parted: affinity under 0.20 at stage 2 or later, or three embarrassments in one day at stage 3 or later, +5 MP, they leave by different gates. The Points chip updates; crossing a tier (8, 20, 40, 70 cumulative) unlocks abilities and avatars; the feed line names the moment and the Events sheet keeps the last 40.
10. **Night.** Visits end after 0.25 to 0.5 day and visitors leave by a gate; the eight named regulars keep their affinity for their next visit. The park autosaves every 30 sim seconds and when the tab hides. Day 2 begins; every 3 days the season turns; after 12 days a year has passed. Speed 1x to 8x and pause are yours throughout; closing the game and tapping Continue resumes silently.

## 7. Scope of v1 (maps 1:1 to the register §3)

| Reg § | Feature | Modules | Done when |
|---|---|---|---|
| 3.1 | 48x48 flat park; layers `KIND`, `WEAR`, `OCC`, `WATER`, `ICE`, `WET`, `PETALS`; 8-tile apron; river north; railings, pavement, facades; skyline band; five gates; seeded starter park | `src/world/grid.ts`, `park.ts`, `gen.ts`, `water.ts`, `wear.ts`; `src/render/backdrop.ts`, `ground.ts`, `water.ts` | The starter park renders from a seed at 390x844 with fountain, two gravel loops, pond and bridge, six benches, two beds, kiosk, lamps, twelve trees of three species |
| 3.2 | 360 s day, 3-day seasons, eight day bands, lamps dusk to dawn, speed 1x to 8x and pause, eight weather kinds, local overrides | `src/core/clock.ts`, `weather.ts`, `loop.ts`; `src/render/ambient.ts`, `effects.ts` | A 12-day year at 8x runs with no console error and every band and season shows on the clock chip |
| 3.3 | `Visitor`, `Creature`, `Prop`, `Pair` records by numeric id; caps 30 people, 12 pigeons, 4 dogs, 220 particles | `src/entities/visitor.ts`, `creatures.ts`; `src/core/ids.ts` | Caps hold; no object reference in any saved field |
| 3.4 | Eleven archetypes, needs, decide ladder, A* costs, speeds, eight regulars | `src/entities/needs.ts`, `brain.ts`, `act.ts`, `move.ts`, `astar.ts`, `staff.ts`, `names.ts` | Each archetype performs its routine; the gardener paves `WEAR ≥ 2.6` runs |
| 3.5 | Pair formation, seven stages, charm field, affinity, embarrassment and backfire, Happily and Parted, featured pair | `src/entities/romance.ts`, `embarrass.ts`; `src/world/charm.ts` | One seeded run reaches Happily and another Parted inside the determinism test |
| 3.6 | CP and MP, tiers 0/8/20/40/70, persistence across parks | `src/play/progression.ts` | The Progress sheet shows both ladders and the next unlock |
| 3.7 | Sixteen park tools, ghost with ranked reasons, undo 10 deep | `src/play/tools.ts`, `undo.ts`; `src/render/ghost.ts` | Every tool id places and undoes; every ghost reason toasts through `t()` |
| 3.8 | Every ability id in the register §3.8 table (19 rows: 9 `c_*`, 10 `m_*`) with cooldowns and charges; six avatars with tap cascades | `src/play/abilities.ts`, `avatar.ts` | Every ability id fires once per cooldown; every avatar can be possessed and released |
| 3.9 | `MODE`, `PLAYER`, three-row rail, Be someone / Creator | `src/play/mode.ts`; `src/ui/rail.ts` | The mode switch is one variable, one simulation branch, one body class |
| 3.10 | Clock, Visitors, Romance and Points chips; card and pair card; six sheets; feed, toast, photo, intro | `src/ui/hud.ts`, `card.ts`, `sheets.ts`, `feed.ts`, `intro.ts`, `dom.ts` | All overlays stack from the measured rail height and nothing sits under a safe area |
| 3.11 | Autosave profile and park, Continue, New with confirm, migration per schema version | `src/save/schema.ts`, `store.ts`, `migrate.ts` | Autosave, reload, Continue gives an identical state hash |
| 3.12 | `t(key, params)` with EN and ES, plural and gender helpers, `<html lang>` | `src/ui/i18n.ts`, `strings/en.ts`, `strings/es.ts` | Key sets are equal; no user-facing literal outside `strings/` |
| 3.13 | Engine, limiter, cues, ambience, birds, music: motif C (café swing) by day and motif B (music-box lullaby) from dusk to dawn | `src/audio/engine.ts`, `limiter.ts`, `cues.ts`, `ambience.ts`, `birds.ts`, `music.ts` | The dev sound check plays every cue; music changes with the featured pair's state; C plays while `f` is in [0.20, 0.80) and B otherwise |
| 3.14 | Tone rules: slapstick only, at most 3 embarrassments per person per day, children never targets | `src/entities/embarrass.ts`; `src/play/abilities.ts` | Targeting refuses a child; the per-day counter caps at 3 |
| 2.9 | Command model, deterministic twin-RNG loop, `window.__PD` harness | `src/core/commands.ts`, `rng.ts`, `events.ts`; `src/debug/harness.ts`, `perf.ts` | The determinism test is green |

## 8. Non-goals

### 8.1 From the register §3.15
No multiplayer transport, no monetisation, no store build, no terrain heights, no water simulation, no construction economy, no React, no accounts, no analytics.

### 8.2 Also not in v1 (tempting, do not build)
1. Image, sprite, SVG-file or audio-file assets. Everything is code.
2. Terrain tools (raise, lower, spring), erosion, flow, sea, floods, gorges, moving ice (GV 882-1358). Pond ice is a per-tile flag.
3. GV's gnome content: hats, logs and stone, carrying, the construction pipeline, households, babies, flyer, boats, mines, chief (review §14 right-hand column).
4. A joystick, D-pad or keyboard movement for the avatar. Taps only.
5. Currency, shops, prices, an economy. Tools are free; abilities use cooldowns and charges.
6. Landmarks as in-park props (Eiffel Tower, Arc de Triomphe, Notre-Dame). They live on the skyline band only. The one placeable folly set is bandstand and fountain (register row 15, §3.7).
7. Visitors building anything. Only desire paths, gardener paving and pigeons gathering at crumbs (register 17).
8. Text written straight into UI, feed or toast code. Every string goes through `t()`.
9. French as a third UI language. EN and ES only; French flavour words appear in both.
10. Object references in saved fields; `Math.random` anywhere; sim state changed from UI code (commands only); the sim RNG used by the renderer or audio.
11. A separate desktop or landscape layout. One layout that works at 390x844 and does not break wider.
12. A PWA service worker or manifest, a Capacitor project, app icons, store listings. Later slices.
13. A second style, or a motif beyond the two the Music Gate kept. v1 draws direction A only and plays motifs B and C only; motif A is retired; the profile fields exist so more can come later.
14. Quests, objectives, a win screen, achievements beyond the two tier ladders.
15. Authored dialogue, speech bubbles, jokes about appearance. Expressions are drawn, not written.

## 9. Success criteria (v1 is done when every row passes)

| # | Criterion | Measure | Checked by |
|---|---|---|---|
| 1 | Builds | `npm run build` exits 0 with zero TypeScript errors and zero oxlint errors; `dist/index.html` is one file and makes no network request after load | CI; DevTools network tab shows 0 requests |
| 2 | Runs on a phone viewport | puppeteer-core, `/opt/pw-browsers/chromium`, 390x844 at dpr 3: intro, Begin, 3 sim days at 8x with zero console errors; the screenshot shows the chips, the three-row rail and the card with no overlap, nothing under a safe area, no horizontal scroll | screenshot script, once per slice |
| 3 | 60 fps desktop | Desktop Chromium, 1x, zoom 1, with 30 visitors, 12 pigeons, 4 dogs and 220 particles for 60 s: frame EMA ≤ 16.7 ms and sim + draw ≤ 12 ms on the perf overlay (GV `ftNote` pattern, 12057) | `src/debug/perf.ts` readout |
| 4 | Mid phone | The same scene on a mid-range phone: 60 fps target, 50 fps floor; a report, not a gate, until the Capacitor slice | manual |
| 5 | Determinism | Two runs with the same seed and the same command log for 3 days (64,800 steps) give identical state hashes and identical `rngN` and `simSteps`; a third run with one extra command differs | Vitest `determinism.test.ts` |
| 6 | Save round trip | Autosave, reload, Continue: identical state hash; `parque:park-v1` under 1 MB; a v1 snapshot loads through `migrate.ts` | Vitest and manual |
| 7 | Style Gate passed | The owner's pick (A, B or C) is recorded in the register §4 and in the profile `style pick`; the board shows every item listed in 3.4. **Met 2026-10-12**: A Storybook (register row 1, §4) | owner |
| 8 | Music Gate passed | The owner's pick is recorded in the register §4 and carried by `MUSIC_PICK` in `src/audio/music.ts` (4.2 item 4); each motif plays its rising and parted variants. **Met 2026-10-12**: B Music-box lullaby and C Café swing, motif A retired (register row 25, §3.13, §4) | owner |
| 9 | Both languages complete | `Object.keys(en)` equals `Object.keys(es)`; a test finds no user-facing string literal in `src/` outside `strings/`; intro, rail, chips, cards, sheets, feed and toasts render in EN and ES; `<html lang>` follows the choice | Vitest `strings.test.ts` |
| 10 | Tone | No ability or avatar action can target a child (the child member of a `family` archetype); embarrassments per person per day never exceed 3 | Vitest |
| 11 | Content complete | All 16 tool ids, all 19 ability ids of the register §3.8 table, 6 avatar ids, 7 stage names, 10 embarrassment kinds, 8 weather kinds and 11 archetypes exist with the exact spellings of the register §3 and §5 | Vitest table test |
| 12 | Tests green | `npm test` and `npm run lint` pass on the final commit | CI |

## 10. Governance

### 10.1 Precedence (highest first)
1. `01-Decision-Register.md`: every number, name, id and status.
2. `00-Product-Brief.md` (this file): intent, scope, non-goals, success criteria.
3. The numbered design documents from `02-` onwards (rules, content tables, build plan). `10-Gnome-Village-HTML-Architecture-Review.md` and `gv-review-notes/` are reference material about GV, not rules for Parque.
4. Code comments and READMEs.
A lower document never overrides a higher one. A conflict is a bug in the lower document.

### 10.2 How to propose a change
1. Do not edit the register, this brief, or another model's document to settle a disagreement.
2. Write the proposal in your own document's "Assumptions and open points" section, or in the pull request description, as four lines: **What** (the exact text to change, quoting the row or section), **Why** (one sentence), **Where** (which register row or section, and which documents repeat the value), **Risk** (what breaks if it is changed later instead of now).
3. The owner says yes or no. On yes: edit the register first (bump its version and date), then every document that repeats the value, then the code.
4. Gate outcomes (Style, Music, Repository) are recorded by adding the pick and the date to the register §4 row.
5. A value you need that the register does not define: define it in your own document, list it under "Assumptions and open points", and carry on. Do not invent silently and do not block.

### 10.3 Rules for every model working on Parque
1. Read the register, then this brief, then your own task document, before writing anything.
2. Use ids, names and numbers exactly as the register §3 and §5 spell them. Never rename, never round.
3. Cite GV by line number when porting (the review §1 physical layout table gives the ranges).
4. Touch only the files your task names. Write documents, not code, unless your task says code.
5. Both gates are recorded as passed (2026-10-12, register §4): draw direction A only; use music motifs B and C only, as register 3.13. Still show the owner two or three options before any new prop, figure, effect, cue or music (register row 26), and never change a recorded pick.
6. When this document and the register disagree, stop and report; do not choose.

## 11. Assumptions and open points
1. Fonts are self-hosted (register 23) although GV loads them from Google Fonts (GV 10-12). Assumed: woff2 subsets (Latin plus the accented characters EN, ES and the French flavour words need) bundled into `dist/index.html`; size budget 400 KB for both families, confirmed in `07-Build-Plan.md` S0.6 row 19 and §16 item 5.
2. The 11 px minimum UI text size (3.1 item 5) is this brief's call, not the register's.
3. Resolved 2026-10-12: theme colour and body background are GV's `#DCE6EC` (3.2), which is direction A's value; the Style Gate picked A, so they stay.
4. The side assignment of the accent tokens (`--moss` Park, `--berry` Cupid, `--ember` Mischief, 3.2) is this brief's call. Resolved 2026-10-12: the Style Gate did not retint the five accent tokens; they keep GV's values.
5. The performance and size thresholds in section 9 (16.7 ms frame EMA, 12 ms sim + draw, 50 fps phone floor, 1 MB save, 64,800-step determinism run, dpr 3 for screenshots) are this brief's numbers; the register fixes only "60 fps on a mid phone" and "390x844".
6. The cue list in 4.1 item 5 is a proposal; the final cue table is `05-Audio-and-Music-Design.md` §3.2.
7. Non-goals 8.2 items 11, 12 and 13 (one layout, no PWA files, nothing beyond the gate picks) are this brief's judgement.
8. Open: whether music plays at a different mix in avatar mode (4.2 item 3). The Music Gate passed on 2026-10-12 without an answer on this, so it stays open; `05-Audio-and-Music-Design.md` §9 open point 3 holds the proposal.
9. Open: the ES wording of "Be someone", "Creator", "Cupid", "Mischief", "Happily" and "Parted" belongs to `strings/es.ts` and is not decided here.
10. The seed shown in the Options sheet (6 step 1) is assumed; the register lists Options as language, sound, speed only.
