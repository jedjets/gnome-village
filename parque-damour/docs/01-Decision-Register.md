# Parque D'Amour — Decision Register

Version 1.3 · 2026-10-13 · Owner: Jeduthun Oosthuis · Author: Claude (design session)

This file is the **spine** of the design pack. Every other document in `docs/` must agree with the numbers, names and ids here. If a document and this register disagree, the register wins and the document is wrong. Change a decision here first, then propagate.

Status legend: **LOCKED** = the owner decided · **ADVISED** = Claude's recommendation, accepted by the owner's "advise" answer and binding unless the owner objects · **GATE** = waits on an owner pick at a named gate.

---

## 1. The owner's answers and the resolved decisions

| # | Topic | Owner's answer | Decision | Status |
|---|---|---|---|---|
| 0 | Set-up | "Set the game up according to your best practices." | Vite + TypeScript, strict, ES modules, no UI framework, one canvas, DOM overlays, Vitest, oxlint, single-file build for Chrome testing. Scaffold created in `parque-damour/`. | LOCKED |
| 1 | Look | "The gnome village view and close to its aesthetic, with inspiration taken from my images." | Soft-isometric rotatable camera exactly as Gnome Village (GV). Painterly code-drawn look (zero image assets). French park restyle. Style Gate passed 2026-10-12: the owner picked **A Storybook** (GV palette and brushwork with French props). | LOCKED |
| 2 | Terrain, water | "You advise, but I think simply placing ponds and waterways is sufficient." | Flat ground. Static placed water (pond brush, canal run) with constant depth. No raise/lower, no erosion, no flow sim. A river runs along the park's north edge **outside** the railings as scenery. | ADVISED |
| 3 | Code shape | "You tell me." | Multi-file TypeScript modules under `src/`, bundled by Vite; `npm run build` also emits one self-contained `dist/index.html` (vite-plugin-singlefile) so the game can be opened or shared as one file like the GV HTML. No React. | ADVISED |
| 4 | Repository | "You advise." | Keep building in `gnome-village`: the app and docs live in `parque-damour/` on branch `claude/parque-damour-game-design-oqc8zm` (owner, 2026-10-11). A separate repository is optional and not planned; section 7 keeps the recipe. | LOCKED |
| 5 | Grid, surroundings | "Default. Surrounding area can be french buildings or whatever. (River on one side, buildings on either.)" | 48×48 tiles, single scale. North edge: river and quay. East, south, west: railings, gates, pavement, Haussmann facades. Distant skyline with the Eiffel Tower silhouette. | LOCKED |
| 6 | Romances | "Advise. But I think multiple through day and night cycle? Season cycle." | Many visitors; several romances run at once; one **featured romance** in the HUD (highest stage, or pinned). Day/night cycle and four seasons. | LOCKED |
| 7 | Stages, endings | "Advise." | Seven stages: Notice, Chat, Bench, Stroll, Picnic, Kiss, Proposal. Endings: **Happily** (proposal accepted) or **Parted** (they leave by different gates). Numbers in section 3.5. | ADVISED |
| 8 | Points | "Ok" | Cupid Points and Mischief Points; unlock ladders at fixed thresholds (no spending); persist across parks. | LOCKED |
| 9 | Tone | "Only embarrassments/slight trip and falls or bird poop on head." | Slapstick only: poop on head, slight trip (up at once), item snatched by a dog, soaked, wasp flap, mime, rival flirt, fog. No injuries, no cruelty, nothing dies, children are never targets. | LOCKED |
| 10 | Two groups | "Ok. (Later we will have modes where they can play online together or offline together, one as mischief and the other as cupid)" | Rail has three groups: Park, Cupid, Mischief. Architecture is command-based and deterministic so a later two-player mode (one side each, online or hot-seat) is a transport layer, not a rewrite. | LOCKED (co-op is a design hook, not v1 scope) |
| 11 | Costs | "Advise." | No currency. Park tools are free. Abilities have a cooldown in sim seconds and some have a daily charge limit. | ADVISED |
| 12 | Avatars | "Okay" | Possessable actors unlocked by the ladders. Mischief: pigeon, pomeranian, mime. Cupid: flower seller, busker, the matchmaker (the girl with the baguette). | LOCKED |
| 13 | Control | "Taps" | Tap-to-move, tap-on-thing for a contextual action, exactly the GV `playerTap` cascade pattern. No joystick. | LOCKED |
| 14 | Leaving avatar mode | "Yes" | The possessed actor returns to its own AI. | LOCKED |
| 15 | Boundary | "Advise." | Railings with five gates; facades and river drawn as world-space props outside the bounds so they rotate with the camera; landmarks only as a distant skyline band, not in-park props. One in-park "folly" set (bandstand, fountain) is placeable. | ADVISED |
| 16 | Tool lists | "Advise." | Section 3.7 (16 park tools) and 3.8 (19 abilities: 9 Cupid, 10 Mischief; 6 avatars). | ADVISED |
| 17 | Park self-building | "Advise." | Light touch: visitors wear desire paths in lawn; a gardener NPC paves worn runs with gravel; pigeons gather where crumbs fall. No autonomous construction, no construction economy. | ADVISED |
| 18 | Time | "Ok" | 360 s day, 3-day seasons, 12-day year, weather simulated and castable. | LOCKED |
| 19 | Visitors | "Advise." | Section 3.4: singles, couples, families with children, elders, tourists, joggers, artists, buskers, dog walkers, staff; pigeons; dogs. Cap 30 people. | ADVISED |
| 20 | Speed | "Yes" | Speed dial 1–8× plus pause. | LOCKED |
| 21 | Save | "Yes" | Autosave park + profile to localStorage; Continue on the intro; New asks to confirm. | LOCKED |
| 22 | Languages | "Yes" | EN + ES from day one through a string table; French flavour words appear in both. | LOCKED |
| 23 | Stores | "We will do that after html is fine." | Capacitor wrapper is a later slice. Design for it now: offline, self-hosted fonts, safe areas, 60 fps on a mid phone. | LOCKED |
| 24 | Monetisation | "None for now." | None. No ads, no IAP, no accounts. | LOCKED |
| 25 | Audio | "Procedural" | Procedural Web Audio, zero assets, GV's tone engine ported. Music Gate passed 2026-10-12: the owner liked **B Music-box lullaby** and **C Café swing** and keeps both; motif A (musette waltz) is retired. Use: C by day, B from dusk to dawn (section 4). | LOCKED |
| 26 | Process | "Aesthetics are very important to me. Make sure the AI gives me style options before doing too much design. Music and sound are important too." | **Style Gate** and **Music Gate** in Slice 1 block all art and music work after the engine skeleton. Any model doing visual or audio work must present options before building. | LOCKED |

---

## 2. The advised decisions, with reasons

### 2.1 Flat ground, placed water (Q2)
GV spends roughly 40 % of its engine on terrain: heightfield, erosion, bridges that span gorges, dams, floods, foundations that collapse when dug (review doc §2.2, §6.2). A park does not need any of it. Water placed by hand still gives the pleasures the owner asked for (ponds, canals, bridges, a rowboat) at a fraction of the cost. The ground height array is kept (constant 0) so gentle mounds can be added later without touching the renderer.

### 2.2 Vite + TypeScript modules, single-file build (Q3)
The GV HTML is 12,246 lines in one file; a less advanced model cannot hold it, and every edit risks the whole. Modules with narrow contracts let a weaker model work on one file with a clear brief. The single-file build keeps the owner's workflow: one HTML to open in Chrome or send to a phone. No React: GV's shell is plain DOM and the game loop owns the canvas; React adds nothing here and costs bundle size and a second rendering model.

### 2.3 Repository (Q4)
Claude advised a separate repository: a different game with its own Pages URL, app id and store listing would not share `gnome-village`'s history, workflow or `base` path. The owner chose otherwise (row 4, 2026-10-11): the game keeps building in `gnome-village`, the single-file build with `base: './'` needs no repository of its own, and Pages deployment is deferred. Section 7 keeps the recipe in case a separate repository is ever wanted.

### 2.4 The park's edges (Q5, Q15)
Facades and the river are drawn as props in world space just outside the 48×48 interior, so the GV rotatable camera keeps working and the park reads as a real square in a city. Landmarks inside a 48-metre park would be out of scale; the Eiffel Tower lives on the skyline band, which turns with the camera like GV's far shore.

### 2.5 Multiple romances, one featured (Q6, Q7)
A single couple makes a short game. Many visitors with several romances at different stages give the player something to assist or spoil at every moment, and the day/night and season cycles give the stages their settings (a kiss at golden hour, a proposal under lamps, a picnic in summer, a shared umbrella in autumn rain). The featured romance keeps the HUD readable.

### 2.6 Cooldowns, no currency (Q11)
A currency would need an economy, shops and balance work that GV never had either. Cooldowns in sim seconds keep abilities paced, stay deterministic (needed for replay and the future two-player mode) and are easy to tune in one table.

### 2.7 Light-touch self-building (Q17)
GV's village builds itself from habits (review §6.5); that is the gnome fantasy, not the park fantasy. The park is the player's. Desire paths and the gardener keep a little life in the ground without taking agency away.

### 2.8 Visitors (Q19)
Children and families are included: they give the park warmth and give mischief creatures something to react to (a child chasing the pomeranian) while never being targets themselves.

### 2.9 Two-player later (Q10)
Everything the player does is a **Command** `{tick, side, kind, payload}` applied by the simulation, never a direct mutation from the UI. The simulation is deterministic (fixed step, seeded RNG split sim/visual as in GV). A later two-player mode exchanges commands; a hot-seat mode alternates sides. Nothing else needs to change. This costs nothing now and is cheap insurance.

---

## 3. The design spine (every document must match this)

### 3.1 World
- Grid `N = 48` tiles on one scale (`S = 1`); nominal 1 m per tile; `NC = 2304`; `I(x, y) = y * N + x`.
- Projection as GV fine tiles: `TW = 26`, `TH = 13` px per tile at zoom 1, `EH = 26` px per height unit, `VANCH = 0.46`. Zoom range 0.30–3.0. Fit computed from the park bounds plus apron.
- Ground is flat: `E[i] = 0` for all tiles. The array exists; no v1 tool writes it.
- Per-tile layers (typed arrays): `KIND` (lawn, gravel, flagstone, bed, mulch, pond, canal), `WEAR` 0–4 (desire paths), `OCC` (prop id or 0), `WATER` depth (0 or 0.6), `ICE` 0/1, `WET` 0–1 (puddles after rain), `PETALS` 0–1 (fading decoration).
- Apron: 8 tiles beyond each edge is drawn, not walkable. North: quay wall at y = −1, river y = −2 … −8, far bank with facades. East, south, west, a Paris boulevard (owner, 2026-10-13: "some trees as a border, then a road, then buildings"): railings on the boundary, a pavement lined with a row of trees, street lamps on its kerb (section 4), the road, a far pavement, then Haussmann facades (varied pastel washes with cream stone trim, owner pick 6B; zinc roofs, wrought-iron balconies, café awnings). On the near sides, which face the camera, the street-tree crowns over the park draw see-through and the buildings are drawn as their low ground floor, so the park stays visible (boulevard variant 1, picked 2026-10-13, section 4). Skyline band beyond: rooftops, the Eiffel Tower silhouette, drawn relative to camera angle.
- Gates: south ×2 (boulevard), west ×1, east ×1, north ×1 (quay steps). Visitors enter and leave through gates.
- Starter park (seeded): a central fountain, two gravel loops, a pond with one bridge, six benches, two beds, a kiosk by the south gate, two lamps per path loop, twelve trees of three species.

### 3.2 Time, light, weather
- `DAYLEN = 360` sim seconds at 1×. `SEASON_DAYS = 3`. Year = 12 days. Seasons: spring, summer, autumn, winter.
- Day fraction `f`: night [0, 0.20) · dawn [0.20, 0.28) · morning [0.28, 0.45) · midday [0.45, 0.58) · afternoon [0.58, 0.72) · golden hour [0.72, 0.80) · dusk [0.80, 0.87) · evening [0.87, 1.0). New park starts at `f = 0.30`, spring day 1. Lamps lit from dusk to dawn.
- Speed dial 1–8×, pause. All timers, cooldowns and durations are in **sim seconds** (they scale with the dial); audio gaps are in real time as in GV.
- Weather kinds: clear, fair, cloudy, breeze, rain, shower, mist, snow (winter only). Per-season weight tables live in `06-Content-Tables.md`. Abilities can override locally: sunbeam, rain cloud, fog (3.8).

### 3.3 Entities
- One `Visitor` record type for every person (as GV uses one gnome record); an `archetype` field drives routines. One `Creature` type for pigeons and dogs. One `Prop` type for placed things. One `Pair` type for a romance. All referenced by numeric ids (never object references in saved fields).
- Caps: 30 people, 12 pigeons, 4 dogs, 220 particles.

### 3.4 Visitors
| Archetype | Arrives as | Routine | Notes |
|---|---|---|---|
| single | alone | stroll, bench, café, feed pigeons, read | romance candidate; has `seeks` f/m/any (weights 45/45/10) |
| couple | pair, already together | stroll, bench, picnic | arrives already paired: a `Pair` at stage 3 (Bench) with affinity rnd(0.55, 0.70); continues the ladder from Stroll and can reach Happily or be Parted like any pair; counts for the HUD, the featured pair and points (owner: as many romances as possible, 2026-10-11) |
| family | parent + child | play on lawn, kiosk, pond edge | child never a mischief target; child chases pigeons and the pomeranian |
| elder | alone | bench, feed pigeons, chess at a table | slow; crumbs attract pigeons |
| tourist | alone or pair | photos of fountain, skyline, bandstand | |
| jogger | alone | loops gravel paths | fast; startles pigeons |
| artist | alone | easel at a viewpoint for a long stay | |
| busker | alone or summoned | plays at a spot: charm aura | the Cupid ability `c_musician` summons one |
| dog walker | + dog | loops paths; dog on lead | dog scatters pigeons |
| gardener | staff, always 1 | paves worn lawn, tidies beds | neutral; paves `WEAR ≥ 2.6` runs, like GV paving (review §6.5) |
| vendor | staff, 1 per kiosk | static at kiosk | serves hunger |

- Needs 0–1: `hunger` (+0.5/day), `energy` (−0.6/day awake, +0.4/day on a bench), `comfort` (eases toward a target set by weather, wetness, lamp light and time, hit by embarrassments), `social` (singles only, +0.3/day when alone, satisfied by chat).
- Visit length 0.25–0.5 day, then leave by a gate. Eight named **regulars** return on later days with memory (affinity persists); others are passers-by with generated names.
- Brain: decide every 0.5–1.3 s (GV cadence). Priority: busy → embarrassment reaction → shelter if rain > 0.6 and comfort < 0.3 → leave if visit over or comfort < 0.1 → eat if hunger > 0.6 → rest if energy < 0.25 and a bench is free → romance step if paired and prerequisites hold → archetype routine → wander.
- Movement: adult 3.0 tiles/s, child 2.6, elder 2.0, jogger 5.0; pair strolling 2.4 as one unit. A* over tiles: lawn 1.0, gravel 0.75, flagstone 0.7, bed blocked, water blocked (bridge 0.8), occupied blocked, railings blocked except gates.

### 3.5 Romance
- A `Pair` forms when two singles are within 4 tiles with line of sight, both idle or strolling, mutually compatible by `seeks`, and a 50 % roll passes on their first encounter. Starting affinity `rnd(0.2, 0.4)`. A couple archetype arrives already paired (3.4). Alumni (a Happily pair that returns, 3.5 Happily) return as the couple archetype at stage 3 with affinity 0.70 and may reach Happily again; the feed says they renewed their vows.
- Stages, prerequisites, durations (sim seconds) and the affinity gate to attempt them:

| Stage | Name | Needs | Duration | Gate |
|---|---|---|---|---|
| 1 | Notice | encounter | 4 | — |
| 2 | Chat | both within 2 tiles, idle | 20–30 | ≥ 0.30 |
| 3 | Bench | a free bench within 8 tiles | 40–60 sitting | ≥ 0.45 |
| 4 | Stroll | a loop of ≥ 12 path tiles; the pair moves as one | 60 | ≥ 0.55 |
| 5 | Picnic | picnic spot or café table within 10 tiles; not raining; both hunger < 0.6 | 50–80 | ≥ 0.65 |
| 6 | Kiss | golden hour or evening, or beside a fountain or under a lit lamp | 10 | ≥ 0.80 |
| 7 | Proposal | at a romantic spot (bandstand, bridge, fountain, lamp-lit bench); same day only if affinity ≥ 0.95, else on a later visit (regulars) | 15 | ≥ 0.90 |

- Affinity: +0.08 per completed stage. **Charm** at the pair's location converts at +0.004 per charm point per 10 s while together. Charm sources (cap 6): flowerbed +1 within 3, fountain +2 within 5, lit lamp +1 within 3, busker +3 within 8, petals +2 on tile, sunbeam +1, river view +1 within 6 tiles of the quay, bandstand +2 within 4. Affinity decays −0.1/day while apart.
- Embarrassment: an event on one of the pair costs affinity −0.06 to −0.15 by kind and stage (table in `06-Content-Tables.md`), comfort −0.3, and plays a 3–6 s reaction. **Backfire 15 %**: the pair laughs together instead, affinity +0.04, no Mischief Point. At most 3 embarrassments per person per day.
- **Parted**: affinity < 0.20 at stage ≥ 2, or three embarrassments in one day at stage ≥ 3. The pair dissolves; they leave by different gates. **Happily**: stage 7 succeeds; fireworks particles; they leave together and return later as a couple.
- Featured romance: the pair with the highest stage, or the pair the player pinned in the Romances sheet.

### 3.6 Points and tiers
- Cupid Points (CP): +1 per stage advanced where the player contributed (player-placed or cast charm ≥ 2 at the location, or a Cupid action on that pair within the last 60 s); +5 per Happily.
- Mischief Points (MP): +1 per embarrassment landed (not backfired); +5 per Parted.
- Tiers, both ladders: T0 = 0, T1 = 8, T2 = 20, T3 = 40, T4 = 70 cumulative points.
- Points and tiers persist in the profile across parks. A per-park tally is shown in the day's feed.

### 3.7 Park tools (always free, Park group of the rail)
`hand` (select, pan) · `path` (gravel brush 1–3) · `lawn` (brush, restores grass) · `bed` (flowerbed stamp 1×1, repeat tap cycles flower colour) · `hedge` (run) · `tree` (stamp; tap an existing tree to remove it; three species cycle) · `pond` (brush 1–3) · `canal` (run, 1 wide) · `bridge` (stamp on canal or pond, span 1–4) · `bench` (stamp, repeat tap rotates) · `picnic` (2×2 blanket stamp) · `lamp` (stamp) · `fountain` (2×2 stamp) · `kiosk` (2×2 stamp, spawns a vendor) · `bandstand` (3×3 stamp) · `remove` (stamp: removes a prop or hedge).
Undo covers park tools only, 10 deep, command based.

### 3.8 Abilities (Cupid and Mischief groups) and avatars
Cooldowns in sim seconds. "Charges" = uses per day when limited.

| Id | Side | Tier | Cooldown | Charges | Effect |
|---|---|---|---|---|---|
| c_petals | Cupid | T0 | 30 | — | Petal shower on a 3×3 area for 20 s: charm +2, PETALS decor |
| c_bouquet | Cupid | T0 | 60 | — | A flower seller cameo hands one of the pair a bouquet: affinity +0.05 |
| c_musician | Cupid | T1 | 120 | — | A busker plays at a tile for 90 s: charm +3 within 8 |
| c_sunbeam | Cupid | T1 | 90 | — | Clears the sky over a 7×7 area for 60 s; comfort recovers |
| c_umbrella | Cupid | T2 | 90 | — | In rain, the pair shares one umbrella: rain counts as charm +2 for them |
| c_lamplight | Cupid | T2 | 60 | — | Lamps within 6 tiles light early and brighter for 60 s |
| c_picnic | Cupid | T3 | 180 | — | A picnic basket appears: enables stage 5 here; hunger fixed |
| c_rowboat | Cupid | T3 | 240 | — | A rowboat on a pond of ≥ 12 tiles: a boat ride, charm +4 |
| c_fireworks | Cupid | T4 | 360 | 1 | Evening fireworks: every pair charm +4 for 30 s |
| m_pigeon | Mischief | T0 | 25 | — | A pigeon flies to the target and poops on their head (or pecks the picnic): "poop" |
| m_sprinkler | Mischief | T0 | 45 | — | A sprinkler pops up on a lawn tile: 3×3 soak for 10 s: "soaked" |
| m_peel | Mischief | T1 | 40 | — | A banana peel on a path tile: the next walker slips: "trip" |
| m_pomeranian | Mischief | T1 | 60 | — | The pomeranian dashes in, snatches an item (purse, hat, baguette, ice cream), runs to a gate; the victim chases 8 s: "snatched" |
| m_wasp | Mischief | T2 | 60 | — | A wasp at a picnic or café table: the pair flaps and flees; stage 5 cancelled: "wasp" |
| m_raincloud | Mischief | T2 | 90 | — | A small cloud rains on 5×5 for 30 s: "drenched" unless they share an umbrella |
| m_rival | Mischief | T3 | 150 | — | A charming stranger flirts with one of the pair for 30 s: affinity −0.10 unless the other steps in (50 %): "rival" |
| m_mime | Mischief | T3 | 120 | — | A mime blocks the path or mimics the pair: "mime"; they reroute |
| m_fog | Mischief | T4 | 240 | — | Fog for 60 s: strolling pairs lose each other; pigeons perch |
| m_flock | Mischief | T4 | 180 | 1 | A pigeon storm over 7×7: everyone startled, hats fly: "flock" |

Avatars (possessable, unlocked by tier): `a_pigeon` (Mischief T0), `a_pomeranian` (Mischief T1), `a_mime` (Mischief T3), `a_florist` (Cupid T1), `a_busker` (Cupid T2), `a_matchmaker` (Cupid T3, the girl with the baguette). Each avatar has a tap cascade defined in `02-Game-Design.md` §Avatar mode. An avatar's actions score points for its side as the equivalent ability would.

### 3.9 Modes and the rail
- `MODE` is `creator` or `avatar`; `PLAYER` is the possessed actor id or null. One branch in the simulation swaps the actor's brain (GV line 5696 pattern). Leaving avatar mode returns the actor to AI.
- Rail, creator mode: row 1 a segmented switch **Park | Cupid | Mischief** then the scrolling strip of that group (locked abilities shown dimmed with their tier); row 2 contextual: brush size and Undo (Park) or the active ability's cooldown chip; row 3: pause + speed, rotate left/right, Fit, Sound, **Be someone**, Photo, New.
- Rail, avatar mode: row 1 shows the avatar's action hints; row 3 as above with the mode button reading **Creator**.
- "Be someone" opens the avatar picker sheet listing unlocked avatars with their side and tier.

### 3.10 HUD, card, sheets
- Clock chip (left): weather dot · time-of-day word · Day N · Season. Tap opens Events; double tap toggles the perf overlay (dev).
- Right column: **Visitors** chip (count + "+" calls a visitor through a gate) opens Census; **Romance** chip (featured pair names · stage) opens Romances; **Points** chip (Cupid n · Mischief n) opens Progress (both ladders, next unlock).
- Card: name, archetype and age word, relationship line, bars Mood (comfort), Rested (energy), Full (1 − hunger), plus Heart (affinity) for a paired single, doing line. A pair card variant shows both names, the shared affinity bar and the stage.
- Sheets: Census, Romances, Progress, Events (last 40), Avatar picker, Options (language, sound, speed). Sound check and perf are dev-only behind a flag.
- Feed line, toast, photo mode and intro (Begin, Continue, EN/ES) as GV.

### 3.11 Persistence
- `parque:profile-v1`: points, tiers, unlocks, settings (lang, muted, speed), style pick, music pick.
- `parque:park-v1`: versioned snapshot: seed, clock, weather, tile layers, props, visitors, pairs, creatures, feed, MODE and PLAYER, undo-irrelevant.
- Autosave on `visibilitychange` hidden, `pagehide`, and every 30 sim seconds. Continue restores silently. New asks to confirm.
- All cross-references are ids; a migration function per schema version.

### 3.12 Localisation
- Every user-facing string goes through `t(key, params)` with EN and ES tables, plural and gender helpers. No inline sentence building. `<html lang>` follows the choice; the choice persists in the profile.

### 3.13 Audio
- GV's engine ported: master chain, synthetic reverb, `tone`, panning, audibility, per-kind rate limiter (with the audibility-before-gate fix from the review §8). Birdsong voices kept. New cue vocabulary and ambience (fountain, café, distant bells and traffic, rain). Music: two procedural motifs picked at the Music Gate (section 4): **C Café swing** from dawn to the end of golden hour (`f` in [0.20, 0.80)) and **B Music-box lullaby** from dusk to dawn; each plays its rising or parted variant by the romance state; the change between B and C waits for a phrase boundary and crossfades over 2 s.

### 3.14 Tone rules
- Nothing hurts anyone. Allowed: poop on head, slight trip, item snatched and later dropped, soaked, wasp flap, mime, rival flirt, fog, hats flying. Not allowed: injuries, cruelty, targeting children, mocking appearance. Max 3 embarrassments per person per day. Backfires exist so mischief stays charming.

### 3.15 Non-goals for v1
No multiplayer transport, no monetisation, no store build, no terrain heights, no water simulation, no construction economy, no React, no accounts, no analytics.

---

## 4. Gates

| Gate | What the owner sees | Blocks |
|---|---|---|
| **Style Gate** (Slice 1) | `style-board.html`: three directions rendered with the real primitives, side by side: A "Storybook" (GV palette and brushwork with French props), B "Pastel Postcard" (flat vector like ref1), C "Line and Wash" (ink line and watercolour like ref2/ref3). Each shows palette, ground + path + bed, a tree in three seasons, bench, lamp, fountain, two lovers, a pigeon, the pomeranian, a facade, HUD chips. **Picked: A Storybook on 2026-10-12** (owner, in words). | Passed. All art from Slice 2 on draws direction A only; the B and C branches in existing primitives are frozen for the board and must not be extended |
| **Music Gate** (Slice 1) | `music-board.html`: three playable motifs: A musette waltz, B music-box lullaby (GV kin), C café swing; each with a romance-rising and a parted variant. **Picked: B Music-box lullaby and C Café swing on 2026-10-12** (owner: "I liked B and C"); knobs at the board defaults (05 6.3) with the gate mix `MUSIC_MAKEUP 4.5`, B `TINE_MAKEUP 2`. Default use (ADVISED, owner may change): C by day, B from dusk to dawn (3.13). Motif A is retired. | Passed. Slice 8 moves B and C from `src/debug/motifs.ts` into `src/audio/music.ts` |
| **Park element options** (Slice 2, register row 26) | `scratch/s2-options.html` (built from `src/render/*`): two or three Style A variants of six elements the Style Gate board did not show. **Picked on 2026-10-13** (owner, "1A 2A 3B 4A 5C 6B"): 1 skyline **A** tower and rooftops (as built); 2 kiosk **A** café kiosk with striped awning (as built); 3 bandstand **B** Belle Époque (tall panelled stone base with three steps, iron balustrade and lacework arches, lambrequin, concave zinc roof with a glazed lantern); 4 railings and gates **A** black iron with gilt spear tips on a stone plinth (as built); 5 footbridge **C** iron lattice (light iron bridge with a gentle camber, girder on a slim arch with a diagonal lattice web, lattice railings); 6 facade row **B** varied pastels (rose, sky, butter, sage and lavender washes with cream stone trim). | Passed. Slice 2 builds 3B, 5C and 6B into `src/render/props-park.ts` and `src/render/apron.ts`; the other variants stay only on the scratch page |
| **Boulevard variant** (Slice 2, register row 26) | The owner's boulevard concept (3.1) rendered in two or three variants of tree style, road surface and near-side building treatment on a scratch page. **Picked: variant 1 on 2026-10-13** (owner: "1"): plane-tree avenue whose crowns go see-through over the park, cobbled road, near-side blocks as their opaque low ground floor with shop fronts and the café (03 A7). | Passed. As built in Slice 2; the scratch page's variants 2 and 3 are not kept |
| **Street lamps** (Slice 3, register row 26) | The boulevard had no lamps and was dark at night. The owner on 2026-10-13: "Yes Just generate an option and use it" (one design, no options page). **Built 2026-10-13**: the park's three-globe lamp (04 6.2) on the tree pavement's kerb, midway between every second pair of street trees (one per 4 tiles, 32 lamps), one of them on each southern corner's kerb diagonal (it clears the corner tree by 0.99 tiles), none within 2 tiles of a gate; lit by the lamps rule with its halo and ground pool; apron only: never saved, no charm. | Done |
| **Tool icons** (Slice 3, register row 26) | scratch/s3-options.html: three sets of the 16 Park tool icons. **Picked: 3 on 2026-10-13** (owner: "1. 3"): two-tone lines with small fills in the Storybook accents. | Done |
| **New-park confirm** (Slice 3, register row 26) | two dialogs on the same page. **Picked: 1 on 2026-10-13** (owner: "2. 1"): the centred paper card. | Done |
| **Slice 3 owner answers** (2026-10-13) | the ten hand-back questions: 3 Y lit globes glow untinted; 4 Y far-side lamp heads in leaf accepted; 5 Y New applies at once while paused; 6 Y a drag fills its gaps; 7 Y no profile write after a failed read; 8 Y docs synced; 9 Y replay rule reworded; 10 N reserved-id drift after Continue kept (03 open points). | Done |
| **Figure rig** (Slice 4, register row 26) | scratch/s4-options.html: three Style A rig variants (1 Storybook stick, 2 Tailored, 3 Gouache) in a lineup of every archetype, the 14 body-language states, the zoom tiers and a night crop; pigeon states; two walker's dogs. **Picked on 2026-10-13** (owner: "Tailored, both dogs, yes, colourful crowd"): **2 Tailored** (filled garments after ref2, natural motion); **both dogs**, the white terrier (A) and the black poodle (B), one per dog walker by seed; the family child **may carry** a balloon or an ice cream (04 7.2 wins over 04 7.1 rule 10); the crowd is **colourful** instead of the muted coat palette (04 7.1 rule 8, 7.3 rule 1 change; the palette itself is a new options step). | Rig build after Slice 4 part C; crowd palette pending its options page |
| Repository | Closed: the owner keeps building in gnome-village (2026-10-11) | Nothing. Pages deployment for this app is deferred and `.github/workflows/pages.yml` stays inert; section 7 keeps the optional recipe |

---

## 5. Names and words (fixed)
- Game: **Parque D'Amour** (title as the owner wrote it). HUD title shows the same.
- Modes: **Creator** and **Avatar**; the toggle reads "Be someone" / "Creator".
- Sides: **Cupid** and **Mischief**.
- Points: Cupid Points (CP), Mischief Points (MP).
- Endings: **Happily**, **Parted**.
- Embarrassment kinds: poop, soaked, trip, snatched, wasp, drenched, rival, mime, fog, flock.
- Stage names: Notice, Chat, Bench, Stroll, Picnic, Kiss, Proposal.

---

## 6. Things verified against the GV file that the design relies on
- Mode switch is one variable plus one simulation branch and a body class (GV 5630, 5696, 11252–11269). Reused as is.
- Tap-to-order cascade returns a status string the shell toasts (GV 5653–5688, 11270–11279). Reused as the avatar control pattern.
- Pick, ghost, Place with ranked failure reasons (GV 5840–5989, 6037). Reused for stamps and runs.
- Data-driven rail (GV 11038–11061) and measured overlay stacking (GV 10689). Reused.
- Deterministic twin-RNG loop with speed and lite bits (GV 583–598, 12024–12096). Reused; required by the command model.
- GV has no save, no unlocks, no string table and ships a dev harness (review §10–§12). All four are new work and are in the build plan.

## 7. Moving to a separate repository (optional, not planned)
Not planned: row 4 keeps the app in `gnome-village` (2026-10-11). If the owner ever wants a separate repository:
1. Create `parque-damour` on GitHub (empty, no README).
2. In this branch: `git subtree split --prefix=parque-damour -b parque-damour-split`, then push that branch to the new repo's `main`; or simply copy the folder and commit.
3. Set `base: '/parque-damour/'` in `vite.config.ts` (today `'./'`, so `dist/index.html` opens from disk and from any sub-path); the Pages workflow written in `07-Build-Plan.md` Slice 0 (`.github/workflows/pages.yml`, inert inside `gnome-village`) is then at that repository's root and runs on its `main`.

---

## 8. Document index (the design pack)

| File | Purpose | Read by |
|---|---|---|
| `00-Product-Brief.md` | Locked intent, scope, success criteria, governance | every model, first |
| `01-Decision-Register.md` | This file: decisions and the design spine | every model, second |
| `02-Game-Design.md` | Complete rules of play | design and feature slices |
| `03-Technical-Architecture.md` | Modules, data model, loop, commands, render, save, i18n | all code slices |
| `04-Art-and-UI-Style-Guide.md` | GV look, the three style directions, the Style Gate board, props, characters, effects | art slices |
| `05-Audio-and-Music-Design.md` | Engine port, cue vocabulary, ambience, the game music (motifs B and C), the retired waltz, the Music Gate board | audio slices |
| `06-Content-Tables.md` | Every tunable number and every string key | data entry and balancing |
| `07-Build-Plan.md` | Slices S0 to S12 as self-contained task briefs with model tiers | whoever runs the project |
| `08-Test-Plan.md` | Unit, determinism, screenshot, performance, manual QA | every slice's done-when |
| `09-Porting-Map-from-Gnome-Village.md` | GV line ranges to port, adapt or drop, per module | porting slices |
| `10-Gnome-Village-HTML-Architecture-Review.md` | Line-referenced review of the GV single-file build | reference |
| `gv-review-notes/` | 21 per-section notes behind the review | reference |
| `reference-art/` | The owner's three aesthetic references | art slices |
