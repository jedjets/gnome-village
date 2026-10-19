# Parque D'Amour — Game Design (the rules of play)

Version 1 · 2026-10-10 · Owner: Jeduthun Oosthuis · Author: Claude (design session)

**How to use this document.** This is the complete rulebook of the game. Every number, name and id here matches `01-Decision-Register.md` (the register); where this document needed a value the register does not define, the value is defined here and listed in section 15 so the owner can see it. Each section names the `src/` module that owns the rule. GV means the owner's Gnome Village HTML; a number after GV is an absolute line in that file (see `10-Gnome-Village-HTML-Architecture-Review.md`). When you implement a rule, implement exactly the number written here; do not round, do not "improve". When a rule says "done when", that is the acceptance test. Lists marked "Do not" are hard limits.

---

## 1. Overview and pillars

### 1.1 What the game is
1. A phone-first Canvas 2D simulation of a small Paris park, 48 × 48 tiles, drawn in the soft-isometric rotatable view of GV.
2. Visitors arrive through gates, follow routines, and some singles pair up. A pair climbs seven romance stages and ends **Happily** (proposal accepted) or **Parted**.
3. The player helps as **Cupid** or spoils as **Mischief**, in two modes: **Creator** (god view, park tools and abilities) and **Avatar** (possess one actor and tap to act).
4. Points on two ladders (Cupid Points, Mischief Points) unlock abilities and avatars at fixed tiers. Nothing is bought.

### 1.2 Pillars (test every feature against these)
| # | Pillar | Test |
|---|---|---|
| P1 | Warm slapstick | Nothing hurts anyone; every mischief ends in a laugh or a huff, never a loss (section 13). |
| P2 | The park is the player's | The simulation never builds or removes props on its own except the gardener's gravel (section 11). |
| P3 | Always something to assist or spoil | At least one pair exists during morning to evening on an unmodified starter park at 1× speed within 2 minutes of play. |
| P4 | Readable at phone size | Every rule has a visible sign: a bar, a chip, a particle, a feed line or a toast. |
| P5 | Deterministic | Same seed plus same command log gives the same park (section 14). |

### 1.3 Owning modules
`src/core/*` (loop, clock, commands), `src/world/*` (grid, park, gen, water, wear, charm), `src/entities/*` (visitors, brain, romance, creatures, staff, embarrassments), `src/play/*` (mode, avatar, abilities, tools, undo, progression), `src/ui/*`, `src/audio/*`, `src/save/*`.

---

## 2. The park

### 2.1 World constants (`src/world/grid.ts`, `src/world/park.ts`)
| Name | Value | Meaning |
|---|---|---|
| `N` | 48 | tiles per side |
| `S` | 1 | one scale; 1 tile = 1 m nominal |
| `NC` | 2304 | `N * N` |
| `I(x, y)` | `y * N + x` | tile index |
| `inB(x, y)` | `0 <= x < N && 0 <= y < N` | inside the park |
| `TW`, `TH` | 26, 13 px | tile width and height at zoom 1 (GV 569) |
| `EH` | 26 | px per height unit (unused in v1: ground is flat) |
| `VANCH` | 0.46 | vertical anchor of the view (GV 6332) |
| Zoom | 0.30 to 3.0 | pinch and wheel, as GV 11195 |
| Apron | 8 tiles | drawn beyond each edge, never walkable |

### 2.2 Tile layers (typed arrays of length `NC`)
| Layer | Type | Values | Written by |
|---|---|---|---|
| `KIND` | Uint8 | 0 lawn, 1 gravel, 2 flagstone, 3 bed, 4 mulch, 5 pond, 6 canal | gen, park tools, gardener |
| `WEAR` | Float32 | 0 to 4 | visitors walking on lawn (section 11.1) |
| `OCC` | Uint16 | 0 or prop id | props (section 2.6) |
| `WATER` | Float32 | 0 or 0.6 | pond and canal tiles only |
| `ICE` | Uint8 | 0 or 1 | winter snow (section 3.3, snow row) |
| `WET` | Float32 | 0 to 1 | rain puddles: rises 0.2 per sim second of rain > 0.3, falls 0.01 per second otherwise |
| `PETALS` | Float32 | 0 to 1 | `c_petals` and `a_florist`; fades 1/40 per second |

### 2.3 What each tile kind does
| Kind | Walk cost (A*) | Charm | Wear | Notes |
|---|---|---|---|---|
| lawn | 1.0 | 0 | yes | desire paths form here; picnics here only |
| gravel | 0.75 | 0 | no | the park's path material; gardener lays this |
| flagstone | 0.7 | 0 | no | around the fountain and kiosk; starter park only, no tool writes it in v1 |
| bed | blocked | +1 within 3 tiles | no | flower colour per tile (section 8.3) |
| mulch | 1.0 | 0 | no | under trees; set by the tree stamp on its tile |
| pond | blocked (bridge 0.8) | 0 | no | `WATER = 0.6`; rowboat needs ≥ 12 connected pond tiles |
| canal | blocked (bridge 0.8) | 0 | no | `WATER = 0.6`; 1 tile wide runs |

Railings: the boundary is the outer edge of row 0, row 47, column 0 and column 47. A visitor may walk on boundary tiles but never off them, except through a gate (section 2.4). The apron is blocked for everyone.

### 2.4 Edges and gates
1. North (y < 0): quay wall at y = −1, river from y = −2 to −8, far bank with facades beyond. The quay is scenery and gives **river view** charm: +1 to any tile with y ≤ 5 (within 6 tiles of the quay).
2. East, south, west: a Paris boulevard (register 3.1): railings on the boundary; a tree pavement with a row of plane trees 1 to 2 tiles out; the road 3 to 4 tiles out; the far pavement at 5; Haussmann facades at 6 to 7; a back pavement at 8 (04 §6.4, 03 §7.4). Skyline band beyond with the Eiffel Tower silhouette, drawn by camera angle (`src/render/backdrop.ts`, `apron.ts`, `boulevard.ts`).
3. Gates are fixed. Each gate has two boundary tiles and one `outside` apron tile where visitors appear and vanish.

| Gate id | Side | Tiles | `outside` | Arrival weight |
|---|---|---|---|---|
| `g_south_w` | south | (12,47) (13,47) | (12,48) | 30 |
| `g_south_e` | south | (34,47) (35,47) | (34,48) | 30 |
| `g_west` | west | (0,23) (0,24) | (−1,23) | 15 |
| `g_east` | east | (47,23) (47,24) | (48,23) | 15 |
| `g_north` | north | (23,0) (24,0) | (23,−1) quay steps | 10 |

Done when: a visitor spawned at any `outside` tile reaches its gate tile in one step and the A* never returns a path through any other apron tile.

### 2.5 Starter park (`src/world/gen.ts`, seeded)
Fixed skeleton (never varies with the seed):
| Item | Where | Notes |
|---|---|---|
| Fountain | 2×2 at (23,23)–(24,24) | flagstone ring 1 tile around it |
| Inner gravel loop | every tile with floor(max(\|x − 23.5\|, \|y − 23.5\|)) in {5, 6}: the square ring x, y in 17..30 minus 19..28 | 2 tiles wide |
| Outer gravel loop | the same with {13, 14}: the square ring x, y in 9..38 minus 11..36 | 2 tiles wide |
| Spokes | gravel 1 wide from each gate to the nearest loop tile, straight | 5 spokes |
| Pond | inside x 30–36, y 11–13 (the part of the old box (30,8)–(37,13) inside the outer loop), 14 to 20 tiles, one 4-connected body; (34,11), (34,12) and their east and west neighbours (33,11), (33,12), (35,11), (35,12) are always water, (34,13) is always lawn | the seed removes other edge tiles, corners most often |
| Bridge | spans the neck (34,11)–(34,12) north to south, span 2, landing on (34,10) (outer loop) and (34,13) | |
| Benches | 6, on lawn tiles adjacent to the inner loop at angles 0°, 60°, 120°, 180°, 240°, 300° from the fountain | each faces the fountain |
| Beds | 2 clusters of 2×2 bed tiles at (19,19)–(20,20) and (27,27)–(28,28) | colours rose and lavender |
| Kiosk | 2×2 at (14,44)–(15,45) | spawns one vendor; two café tables on its east side |
| Picnic blankets | 2×2 at (14,21)–(15,22) and (34,24)–(35,25) | S6, owner 2026-10-19: lawn, one tile clear of every path, prop and bed; picnic spots for stage 5 (a pair has a spot within 10 tiles of 82 % of the inner loop and 47 % of the outer one, the kiosk's tables alone 0 % and 14 %); passable, `placedBy` `gen` |
| Lamps | 4: two per loop, at the north and south points of each loop, on the lawn side | |
| Trees | 12: 4 plane, 4 chestnut, 4 lime | positions seeded, on lawn, ≥ 3 tiles from any path or prop (the picnic blankets included), ≥ 4 tiles from each other |

Seed also varies: bed colour order, pond outline, tree positions. Nothing else.

### 2.6 Props (`src/entities` `Prop` type)
A prop has `id, kind, x, y, w, h, rot, placedBy ('gen' | 'player' | 'sim'), passable`. Non-passable props write their id into `OCC` on every footprint tile. Kinds: bench, lamp, fountain, kiosk, table, bandstand, picnic, bridge, hedge, tree, easel, crumbs, peel, sprinkler, rowboat. `passable` is true for picnic, crumbs, peel, bridge; false for the rest.

Spots the romance system looks for (`src/entities/romance.ts`): **bench** (prop bench, 2 seats), **picnic spot** (prop picnic or table), **romantic spot** (bandstand within 4, bridge tile, within 3 of a fountain, bench within 3 of a lit lamp), **viewpoint** (within 6 of fountain, bandstand, pond edge, or y ≤ 3).

---

## 3. Time, light, weather

### 3.1 Clock (`src/core/clock.ts`)
1. `DAYLEN = 360` sim seconds. `SEASON_DAYS = 3`. Year = 12 days. Seasons in order: spring, summer, autumn, winter.
2. `T = { abs, f, day, season, light, speed }`. `f = abs mod 1` (day fraction), `day = floor(abs) + 1`, `season = floor((day − 1) / 3) mod 4`.
3. New park: `abs = 0.30` (spring, day 1, morning).
4. All timers, cooldowns and durations in this document are **sim seconds** unless marked "real".

### 3.2 Day phases and light
| Phase | `f` range | `light` at start → end | Lamps | Notes |
|---|---|---|---|---|
| night | [0.00, 0.20) | 0.06 → 0.06 | lit | arrivals target 3 |
| dawn | [0.20, 0.28) | 0.06 → 0.75 | lit | birdsong window |
| morning | [0.28, 0.45) | 0.75 → 1.00 | off | |
| midday | [0.45, 0.58) | 1.00 → 1.00 | off | |
| afternoon | [0.58, 0.72) | 1.00 → 0.88 | off | |
| golden hour | [0.72, 0.80) | 0.88 → 0.62 | off | warm tint peaks at f = 0.76; kiss window |
| dusk | [0.80, 0.87) | 0.62 → 0.22 | lit | lamps light at f = 0.80 exactly |
| evening | [0.87, 1.00) | 0.22 → 0.06 | lit | proposal and fireworks window |

`light` is linear between the values above (`src/render/ambient.ts` owns the tint; `clock.ts` owns the number). Lamps are lit when `f >= 0.80 || f < 0.28`. The phase word in the HUD is this table's phase name (GV `todName` 10740 pattern).

### 3.3 Weather (`src/core/weather.ts`)
Kinds and targets (eased with a 2.6 s half-life as GV 846–881):
| Kind | cloud | rain | mist | wind | snow | Duration (s) | Effect on visitors | Effect on romance |
|---|---|---|---|---|---|---|---|---|
| clear | 0.10 | 0 | 0 | 0.18 | 0 | 60–160 | arrivals ×1.0; comfort target +0.05 | none |
| fair | 0.34 | 0 | 0.04 | 0.30 | 0 | 60–160 | arrivals ×1.0 | none |
| cloudy | 0.74 | 0 | 0.10 | 0.42 | 0 | 60–160 | arrivals ×0.9; comfort target −0.05 | none |
| breeze | 0.28 | 0 | 0.02 | 0.86 | 0 | 60–160 | arrivals ×0.9; hats wobble (visual) | petals drift 1 tile downwind (visual) |
| rain | 0.92 | 0.80 | 0.22 | 0.50 | 0 | 60–160 | arrivals ×0.5; shelter rung active; `WET` rises | Picnic blocked; Kiss and Proposal blocked unless `c_umbrella` is active on the pair |
| shower | 0.70 | 0.50 | 0.10 | 0.40 | 0 | 30–60 | arrivals ×0.7 | Picnic blocked while rain > 0.3 |
| mist | 0.50 | 0 | 0.78 | 0.10 | 0 | 60–160 | arrivals ×0.8; pair-formation line of sight shrinks from 4 to 2 tiles | strolling pairs keep within 1 tile |
| snow | 0.86 | 0 | 0.30 | 0.36 | 0.80 | 60–160 | arrivals ×0.6; comfort target −0.30; pond `ICE = 1` after 60 s of snow, back to 0 after 120 s without snow | Picnic blocked; a bridge over ice is a romantic spot |

Per-season weights (percent; the weather tables in `06-Content-Tables.md` must copy these exactly):
| Season | clear | fair | cloudy | breeze | rain | shower | mist | snow |
|---|---|---|---|---|---|---|---|---|
| spring | 15 | 25 | 15 | 15 | 10 | 15 | 5 | 0 |
| summer | 35 | 30 | 10 | 10 | 3 | 10 | 2 | 0 |
| autumn | 10 | 20 | 25 | 20 | 12 | 8 | 5 | 0 |
| winter | 15 | 15 | 25 | 10 | 5 | 0 | 10 | 20 |

Rules: first change at 40 s after a new park; pick by weight on the **sim** RNG (GV 852: weather is seed-reproducible); the same kind may repeat. A new park starts `fair`.

### 3.4 Seasons
| Season | Trees | Arrivals | Comfort target | Other |
|---|---|---|---|---|
| spring | blossom days 1–2, leafing day 3 | ×1.0 | 0 | petal particles under blossoming trees (visual only, no charm) |
| summer | full | ×1.1 | −0.05 at midday | picnic routine weight ×1.5 |
| autumn | thinning, leaf particles | ×1.0 | 0 | `c_umbrella` scenes most likely (rain 12 %) |
| winter | bare | ×0.7 | −0.15 | snow possible; ice on ponds; rowboat refused on ice |

### 3.5 Castable overrides (`weatherAt(x, y)`)
An override is `{ kind, x, y, r, until }` kept in a list. `weatherAt` returns the override's targets inside the square of half-width `r` around `(x, y)`, else the global weather. Overrides come only from abilities: `c_sunbeam` (r 3, 60 s, rain 0, cloud 0.1, light +0.15), `m_raincloud` (r 2, 30 s, rain 0.9), `m_fog` (whole park, 60 s, mist 0.9). Arrivals use the global weather only. The HUD weather dot shows the global kind.

---

## 4. Visitors

### 4.1 The record (`src/entities/visitor.ts`)
One `Visitor` type for every person. Fields used by the rules: `id, name, sex ('f' | 'm'), archetype, ageWord ('young' | 'grown' | 'elder'), seeks ('f' | 'm': always the opposite of `sex`, owner 2026-10-20; an old save's `any` or same-sex value is read as the opposite), x, y, st, t, path, hunger, energy, comfort, social, arrivedAt, leaveAt, gateIn, gateOut, pairId (0 if none), coupleOf (id, couple archetype only: the partner they arrived with; their romance is an ordinary `Pair`, 6.1), parentOf / childOf (families), items { hat, purse, baguette, iceCream }, embToday, embDay, regularId (0 if passer-by), decideT`.

### 4.2 Arrivals (`src/entities/visitor.ts`, factory)
1. Target population by phase: night 3, dawn 6, morning 16, midday 20, afternoon 24, golden hour 20, dusk 14, evening 9. Multiply by the weather and season arrival factors (sections 3.3, 3.4) and round.
2. While `people < target` and `people < 30`, the next arrival comes after a gap set by the park's **pace** (register section 4, Park pace and Options; owner 2026-10-14): `rnd(6, 14)` s after the last in a **Calm** park, `rnd(3, 6)` s in a **Lively** one (`LIVELY_GAP_MIN`, `LIVELY_GAP_MAX`, tuned so that seed 101 at 8× from f 0.30 has 16 ± 3 people by f 0.45 and 24 ± 3 by f 0.70, 07 S4.7 item 2; it gave 16 and 25, where Calm gave 9 and 17. Since the owner's rule of 2026-10-20 (register section 4 "Who can pair") a single draws no `seeks`, the weather of every seed moved and seed 101 is in rain at f 0.70; the test day is seed 102, which gives 16 and 24 on Lively and 9 and 18 on Calm). One draw either way; the targets, factors, weights, caps and the re-roll of items 1, 3, 4 and 7 are the same for both. Otherwise nobody arrives (the "+" chip is the exception, section 12.2). The pace is park state, saved with the park (a park saved before it existed is Calm); a new park takes the player's preferred pace from the profile (Lively for a new player) through the logged `park.pace` command (03 §5.1), and a change in Options applies to the park in play the same way from its next step.
3. Gate by the weights in section 2.4. The visitor appears on `outside`, steps to the gate tile, then runs its routine.
4. Archetype weights per arrival: single 30, couple 12, family 12, elder 10, tourist 12, jogger 8, artist 4, dog walker 8, busker 4. At most 1 artist, 1 AI busker and 2 dog walkers in the park at once; a roll that hits a full archetype becomes `single`.
5. Starting needs: hunger `rnd(0.2, 0.5)`, energy `rnd(0.5, 0.9)`, comfort 0.7, social `rnd(0.2, 0.6)`.
6. `leaveAt = arrivedAt + rnd(0.25, 0.5)` days. Each romance stage the visitor completes adds 0.1 day to `leaveAt`, capped at `arrivedAt + 1.2`.
7. `sex` 50/50; `seeks` is always the opposite sex (owner 2026-10-20, register section 4 "Who can pair": only a woman and a man can pair; the weights f 45, m 45, any 10 are gone, and `seeks` costs no draw). The complementary rule keeps its meaning: a single whose arrival would leave the park with unpaired singles but none of the other sex re-rolls its `sex` once (the GV complementary-sex rule, `addVillager` 4488–4504).
8. Staff: 1 gardener enters at `g_west` 10 s after a new park and never leaves. 1 vendor per kiosk appears on the kiosk's serving tile when the kiosk is placed and vanishes when it is removed.

### 4.3 Archetypes and routines (`src/entities/brain.ts` rung 7)
Each routine is a loop: pick an activity by weight, do it, idle `rnd(2, 5)` s, pick again. Durations are sim seconds.

**single** (romance candidate)
1. Stroll a loop (weight 35; 70 when `social > 0.6`): walk the inner or outer loop one full round at 3.0 tiles/s.
2. Bench (20): sit on a free bench 20–60 s.
3. Kiosk (15): buy and eat 12 s at the serving tile; hunger → 0.1.
4. Feed pigeons (15): sit on a bench, drop crumbs on the tile in front every 10 s for 40 s (section 11.2).
5. Read (15): sit on a bench 40 s with a book.
6. Pair formation checks run during 1 and during idle (section 6.1). Chat sets `social = 0`.

**couple** (two visitors linked by `coupleOf` who arrive together already paired: a `Pair` at stage 3 (Bench) with affinity `rnd(0.55, 0.70)`, register 3.4; they continue the ladder from Stroll (6.1) and can reach Happily or be Parted like any pair; this routine runs between stages, since rung 6 comes before rung 7)
1. Stroll together (50): the lower id leads, the other follows at 0.5 tile, speed 2.4.
2. Bench (30): both sit on one bench 30–60 s; takes two seats.
3. Picnic (20; ×1.5 in summer): a free picnic spot 40–60 s.
4. Leave together by the same gate (a Parted couple has already left by different gates, 6.5).

**family** (parent + child, child linked by `childOf`)
1. Parent walks to a lawn tile ≥ 4 tiles from any path; child plays (runs a circle of radius 2 at 2.6) 30–60 s.
2. Child chases the pomeranian if within 6 tiles with line of sight, for ≤ 12 s (section 11.4); chases pigeons within 5 tiles with 22 % chance per decision (GV `childPlay` 4742).
3. Kiosk together (ice cream item for the child).
4. Pond edge: stand 20 s at a pond-adjacent tile.
5. Child always follows the parent on rungs 2–3 (shelter, leave).

**elder** (speed 2.0)
1. Bench 60–120 s (50).
2. Feed pigeons from the bench, crumbs every 10 s (30).
3. Chess (20): two elders at one café table 90 s; if no table or no second elder, bench instead.

**tourist** (alone or pair)
1. Walk to a viewpoint; take a photo 6 s (flash particle).
2. Repeat for 3 viewpoints in order fountain, bandstand (if any), north edge.
3. `leaveAt = arrivedAt + 0.25`.

**jogger** (speed 5.0)
1. Run 2–4 laps of the outer loop on gravel.
2. Pigeons within 2 tiles scatter (section 11.2). Never sits. Leaves.

**artist**
1. Walk to a viewpoint; place an easel prop (non-passable) on the tile; paint for 0.4 day.
2. Leaves with the easel.

**busker** (AI, or summoned by `c_musician`)
1. Walk to the bandstand if free, else a loop tile where two gravel runs meet.
2. Play 120 s (AI) or 90 s (summoned): charm +3 within 8 tiles while playing.
3. Leave.

**dog walker** (+ 1 dog creature on a lead, follows at 1 tile)
1. Loop a path twice at 3.0. The dog scatters pigeons within 3 tiles.
2. Leave. The dog leaves with the walker.

**gardener** (staff, neutral, 1)
1. Patrol: walk the outer loop.
2. Pave: when a run qualifies (section 11.1) walk to it and lay gravel 1.3 s per tile (GV `LAY_T` 4554).
3. Tidy: stand 6 s at a bed tile every 120 s.
4. Shelter at the kiosk in rain > 0.6.

**vendor** (staff, 1 per kiosk)
1. Stands on the serving tile. Serves one eater at a time; a second waits 5 s on an adjacent tile; a third goes elsewhere.

### 4.4 Needs (`src/entities/needs.ts`), rates per sim day
| Need | Range | Rate | Satisfied by |
|---|---|---|---|
| hunger | 0–1 | +0.5/day | kiosk (→ 0.1), picnic (→ 0.1), bench snack (−0.4 when no kiosk exists) |
| energy | 0–1 | −0.6/day awake; +0.4/day while sitting on a bench | rest rung |
| comfort | 0–1 | eases toward `target`: each step `comfort += clamp(target − comfort, −1, 1) × 0.2 × dt` (GV 5579 idiom); −0.3 at once on an embarrassment | weather, lamps, time |
| social | 0–1 | +0.3/day while a single is not in a `Pair` | Chat stage sets 0; stays 0 while paired |

Comfort target = 0.7 + 0.15 (lit lamp within 3 tiles at night) − 0.35 × rain − 0.30 × snow − 0.10 × mist − 0.15 (night and no lit lamp within 3) + 0.10 (inside a `c_sunbeam`) + season term (section 3.4) + weather term (section 3.3), clamped to [0, 1], using `weatherAt(v)`.

### 4.5 Visit length, regulars, names (`src/entities/names.ts`)
1. A passer-by leaves at `leaveAt` (section 4.2.6) by `gateOut`, which is the nearest gate at the moment the leave rung fires, unless section 6.5 assigns one.
2. Eight **regulars** exist from the start, all archetype `single`, with memory. Names and `seeks`: Amélie (f, m), Juliette (f, m), Colette (f, m), Margot (f, m), Théo (m, f), Lucien (m, f), Baptiste (m, f), Rémi (m, f). Each seeks the opposite sex; Colette and Baptiste were `any` until the owner's rule of 2026-10-20.
3. A regular who leaves sets `nextVisitDay = day + rint(1, 2)` and arrives on that day at a random `f` in [0.30, 0.65], replacing the next generated single. At most 3 regulars arrive per day.
4. Memory: `regular.memory = { partnerId, affinity, stage, lastDay }`. Affinity decays −0.1 per day while apart (section 6.3). When both members of a remembered pair are in the park, the `Pair` is recreated at the remembered stage and affinity the moment they are within 4 tiles with line of sight (no roll).
5. Passers-by get generated names from a list of 40 French first names per sex in `names.ts`. A name in use is not reused while its holder is in the park.
6. `ageWord`: single, tourist, jogger, artist, busker, dog walker: `young` 50 % / `grown` 50 %; couple and family parents: `grown`; elder: `elder`; child: `young`.

---

## 5. Needs and the brain

### 5.1 Cadence (`src/entities/brain.ts`)
Each visitor decides when `decideT <= 0`, then `decideT = rnd(0.5, 1.3)` (GV 5696). A visitor in a `BUSY` state is not re-decided. In avatar mode the possessed actor runs `avatarDecide` instead (one branch, GV 5696 pattern); everyone else runs `decide`.

### 5.2 The decide ladder (exactly register §3.4; first rung that fires wins)
| Rung | Condition | Action |
|---|---|---|
| 0 busy | `BUSY[v.st]` | return; no decision |
| 1 embarrassment reaction | `v.pendingEmb` is set (by `embarrass.ts` this tick) | start the reaction state from the table in 6.4; clear `pendingEmb`; return |
| 2 shelter | `weatherAt(v).rain > 0.6 && v.comfort < 0.3` | go to the nearest shelter tile within 20 tiles (kiosk awning tiles, bandstand tiles, tiles adjacent to a tree); `st = 'shelter'` until rain < 0.3 or 90 s. No shelter within 20 → `goLeave` |
| 3 leave | `T.abs >= v.leaveAt \|\| v.comfort < 0.1` | `goLeave` to `gateOut`; at `outside` the visitor is removed (section 6.5 for pairs) |
| 4 eat | `v.hunger > 0.6` | nearest kiosk serving tile within 30 tiles → `goEat`; none → bench snack on the nearest free bench |
| 5 rest | `v.energy < 0.25` and a free bench within 15 tiles | `goSit`; sit until energy ≥ 0.45 or 90 s |
| 6 romance step | `v.pairId` and the pair's next stage prerequisites hold (6.2) and the affinity gate holds and `pair.retryT <= 0` and both members are in `CAN_INTERRUPT` states and both `comfort >= 0.35` | `romance.ts startStage(pair)`; the lower id initiates; the other member is set the same tick |
| 7 archetype routine | always | section 4.3 |
| 8 wander | routine returned nothing | walk to a random walkable tile within 6; idle `rnd(2, 5)` |

Children run rungs 0–3 by following the parent, then their own list in 4.3.

### 5.3 Interrupt sets (analogues of GV 4558–4566 and 5631)
| Set | Members | Used by |
|---|---|---|
| `BUSY` | every reaction state (6.4), `eat, sit, read, feed, chat, bench, stroll, picnic, kiss, proposal, boat, photo, paint, play, pave, tidy, serve, shelter, chase, goLeave, laugh` | rung 0; abilities that need a free target |
| `CAN_INTERRUPT` (GV `CAN_HELP` 4564) | `idle, wander, strollLoop, goBench, goKiosk, goSit, goEat, watch` | romance stage start; `a_matchmaker` introduce |
| `NO_SPACE` (GV 5586) | `sit, chat, picnic, kiss, proposal, boat, shelter, chess` and every reaction state | `spaceOut` skips these |
| `PLAYER_HOLD` (GV 5631) | per avatar, section 10 | the tap cascade returns `'busy'` |
| `SHELTERED` | `shelter, eat` at a kiosk | rain does not lower comfort in these states |

### 5.4 Movement (`src/entities/move.ts`)
| Who | Tiles per second |
|---|---|
| adult (single, couple, parent, tourist, artist, busker, dog walker, gardener, vendor) | 3.0 |
| child | 2.6 |
| elder | 2.0 |
| jogger | 5.0 |
| pair strolling as one unit | 2.4 |
| victim chasing the pomeranian; fleeing a wasp | 4.0 |
| pomeranian | 4.5 |
| pigeon flying | 6.0 straight line (ignores the grid); walking 1.2 |
| dog on a lead | follows the walker, 3.0 |

Arrival radius 0.7 tile, waypoint radius 0.44, replan cooldown 0.6 s, give up after 6 blocked steps (GV `moveGnome` 1610–1635). `openNear` snaps an occupied target to the nearest free tile within 3 (GV 1559). `spaceOut` keeps people 10 × 8 px apart at zoom 1 on screen (GV 5592–5621) except `NO_SPACE` states.

### 5.5 Pathing (`src/entities/astar.ts`)
8-connected A*, octile heuristic, node budget 2600, partial path to the closest node (GV `findPath` 1466). Step costs: lawn 1.0, gravel 0.75, flagstone 0.7, mulch 1.0, bed blocked, pond and canal blocked, bridge 0.8, `OCC` non-passable blocked, apron blocked, gate `outside` tile allowed only for the visitor's own `gateIn` / `gateOut`. Diagonal steps cost ×1.41 and are refused when either orthogonal neighbour is blocked (no corner cutting). Blocked targets are remembered 60 s, max 8 per visitor.

---

## 6. Romance (`src/entities/romance.ts`)

### 6.1 Pair formation
A `Pair { id, a, b, stage, affinity, retryT, togetherT, embToday, embDay, formedDay, ... }` (full type in 03 §3.4; featured is computed, 6.6) forms when all of these hold at a decision of either single:
1. Both are `single` archetype, neither has a `pairId`, neither is a child.
2. Within 4 tiles (2 in mist) with line of sight (no `OCC` non-passable prop and no water on the Bresenham line between tile centres).
3. Both in `CAN_INTERRUPT` states ("idle or strolling").
4. Compatible: the two sexes differ (one woman and one man, owner 2026-10-20) and `a.seeks` is `b.sex` and `b.seeks` is `a.sex`. The sex test is the rule; the `seeks` test is the belt to its braces, so a `seeks` forced to match never lets two women or two men form a `Pair`.
5. First encounter this visit (the pair of ids has not rolled today) and a 50 % roll on the sim RNG passes. A failed roll is not repeated for that pair of ids that day.
6. Starting affinity `rnd(0.2, 0.4)`. Stage 1 begins at once. Feed line "A and B noticed each other".
Regulars with memory skip the roll (section 4.5.4). `a_matchmaker` introduce skips the roll (section 10.9) but not item 4: it introduces a woman and a man only.

A couple archetype arrives already paired (register 3.4) as one woman and one man (the factory makes one `f` and one `m`): the arrival factory creates the `Pair` with the two as `a` and `b`, `stage = 3` (Bench counts as completed, so the next attempt is 4 Stroll, whose gate 0.55 the affinity already meets), affinity `rnd(0.55, 0.70)` on the sim RNG, `formedDay` = the arrival day, no 50 % roll and no `feed.pair.formed` line; both keep `archetype = 'couple'` and `coupleOf`. From there the pair follows 6.2 to 6.6 like any other and counts for the HUD, the featured pair and points. Alumni (6.5) return as the couple archetype, again one woman and one man (an old save's alumni couple of two women or two men is forgotten), at stage 3 with affinity 0.70 and may reach Happily again; the feed then says they renewed their vows (`feed.romance.renewed`).

### 6.2 The seven stages
| Stage | Name | Prerequisites ("Needs") | Duration (s) | Affinity gate | On screen | Interrupted by |
|---|---|---|---|---|---|---|
| 1 | Notice | the encounter | 4 | — | both stop, turn to face, a small heart puff (GV `heartFx` 2389 pattern, 2 hearts) | nothing |
| 2 | Chat | both within 2 tiles, both `CAN_INTERRUPT` | rnd(20, 30) | ≥ 0.30 | walk to the midpoint ±0.4 tile like GV `court` 4338 and 5483–5491; stand facing, talk bubbles alternate every 3 s | embarrassment on either; rung 2–5 firing on either |
| 3 | Bench | a free bench within 8 tiles | rnd(40, 60) sitting | ≥ 0.45 | both walk to the bench, sit side by side, hearts every 10 s | embarrassment; bench removed; rung 2–5 |
| 4 | Stroll | a loop of ≥ 12 connected path tiles (gravel or flagstone) within 10 tiles | 60 | ≥ 0.55 | the pair walks the loop as one unit at 2.4, the lower id leading, the other at 0.5 tile | embarrassment; `m_mime` wall; `m_fog` (they lose each other, 6.4); rung 2–5 |
| 5 | Picnic | a picnic spot (picnic prop or free café table) within 10 tiles; `weatherAt` rain < 0.3; both hunger < 0.6 | rnd(50, 80) | ≥ 0.65 | sit on the blanket or at the table, eat (hunger → 0.1), hearts every 8 s | `m_wasp` cancels; rain rising above 0.3 cancels; embarrassment; rung 2–3 |
| 6 | Kiss | phase golden hour or evening, OR within 3 of a fountain, OR within 3 of a lit lamp; rain < 0.3 unless `c_umbrella` | 10 | ≥ 0.80 | face each other, lean in, a burst of 6 hearts, 1 s hold | embarrassment on either (the kiss is missed, retry 60 s) |
| 7 | Proposal | at a romantic spot (2.6); same day as formation only if affinity ≥ 0.95, else only on a later visit (regulars only; passers-by at 0.90–0.95 on their formation day wait and try again when affinity reaches 0.95) | 15 | ≥ 0.90 | one kneels (the initiator), ring sparkle particle at 8 s, the other claps hands to face at 12 s, both embrace at 15 s | an embarrassment landing on either during the 15 s: the proposal is abandoned, pair returns to stage 6, retry after 60 s |

Rules:
1. Stages run in order; a completed stage sets `pair.stage` and adds +0.08 affinity.
2. If the gate holds but a prerequisite does not, the pair **lingers**: they repeat the current stage's activity (chat again, sit again, stroll again) and the charm conversion in 6.3 keeps running while together.
3. If the affinity gate does not hold, the pair lingers in the same way. There is no time limit on lingering; the leave rung ends it.
4. An interrupted stage gives no affinity; `pair.retryT = 30` (60 for Kiss and Proposal).
5. Both members use the same `pair.retryT`.
6. The initiator is the member with the lower id. The initiator's decide tick starts the stage for both.

### 6.3 Affinity
1. `+0.08` per completed stage.
2. **Charm conversion**: while the pair is **together** (both within 4 tiles of each other and neither in a reaction state), every 10 s add `0.004 × charmAt(midpoint)`. `charmAt` is the capped sum (cap 6) of:

| Source | Charm | Where | Counts as player charm when |
|---|---|---|---|
| flowerbed tile | +1 | within 3 tiles | `placedBy == 'player'` |
| fountain | +2 | within 5 tiles | `placedBy == 'player'` |
| lit lamp | +1 | within 3 tiles, lamps lit | `placedBy == 'player'` or `c_lamplight` active on it |
| busker playing | +3 | within 8 tiles | summoned by `c_musician` or is `a_busker` |
| `PETALS` on the tile | +2 | `PETALS > 0.2` on the midpoint tile | always (only abilities write petals) |
| sunbeam | +1 | inside a `c_sunbeam` | always |
| river view | +1 | midpoint `y <= 5` | never |
| bandstand | +2 | within 4 tiles | `placedBy == 'player'` |
| umbrella (rain counted as charm) | +2 | `c_umbrella` active on this pair and rain > 0.3 | always |
| rowboat ride | +4 | the pair is in the boat | always |
| fireworks | +4 | every pair, 30 s | always |

`charmAt(x, y)` returns `{ total, player }`, both capped at 6. Each source counts once (two flowerbeds within 3 still give +1).
3. Decay: `−0.1` per day while **apart** (not together). For regulars this runs between visits using `lastDay`.
4. Affinity is clamped to [0, 1].

### 6.4 Embarrassments (`src/entities/embarrass.ts`)
An embarrassment `landed` on a visitor: comfort −0.3 at once; `embToday += 1` on the victim and on the pair; a reaction state plays; if the victim is in a `Pair`, affinity drops by the table; feed line; MP as section 7. Cost = base × stage factor, capped at 0.15. Stage factor: stage 1–2 ×1.0, stage 3–4 ×1.25, stage 5–7 ×1.5.

| Kind | Base cost | Cost at stage 1–2 / 3–4 / 5–7 | Reaction state and length | Backfire scene (15 %, sim RNG) |
|---|---|---|---|---|
| poop | 0.08 | 0.08 / 0.10 / 0.12 | `wipe` 4 s: hand to head, hat off and on | partner wipes it off, both laugh 4 s |
| soaked | 0.07 | 0.07 / 0.0875 / 0.105 | `shake` 3 s: shakes arms, `WET` on tile 1 | they dance in the spray 4 s |
| trip | 0.06 | 0.06 / 0.075 / 0.09 | `stumble` 3 s: down and up at once, dust puff | partner catches them, 4 s |
| snatched | 0.08 | 0.08 / 0.10 / 0.12 | `chase` 8 s at 4.0 after the pomeranian, then `huff` 3 s | both chase, laughing, 8 s; item returned |
| wasp | 0.09 | 0.09 / 0.1125 / 0.135 | `flap` 6 s: both flap and flee 3 tiles | they shoo it off together 4 s; picnic continues |
| drenched | 0.07 | 0.07 / 0.0875 / 0.105 | `huddle` 5 s: hands over head | they share a newspaper, 5 s (counts as umbrella charm for 30 s) |
| rival | 0.10 | 0.10 / 0.125 / 0.15 | `distracted` 30 s: turns to the stranger | the stranger is laughed off at once |
| mime | 0.06 | 0.06 / 0.075 / 0.09 | `baffled` 4 s, then reroute | they applaud the mime 4 s |
| fog | 0.06 | 0.06 / 0.075 / 0.09 | `lost` up to 60 s: each wanders; the stage is interrupted | they bump into each other at once, laugh 4 s |
| flock | 0.09 | 0.09 / 0.1125 / 0.135 | `duck` 5 s: hat flies 2 tiles, picked up after | they duck together laughing 5 s |

Rules:
1. **Backfire 15 %**: rolled on the sim RNG at the moment of landing, only when the victim is in a `Pair` and the partner is within 4 tiles. On backfire: the backfire scene plays instead of the reaction, affinity +0.04, comfort is not reduced, no MP, `embToday` is not incremented.
2. **At most 3 landed embarrassments per person per day.** A 4th attempt fails before anything plays: toast "X has had enough for one day", no cooldown spent, no charge spent.
3. Children are never targets (section 13). Staff can be targets but score 0. A couple is a `Pair`, so an embarrassment on either member costs affinity and scores like any pair's.
4. `rival` lands only on a member of a `Pair`; on anyone else the stranger just chats (no effect).
5. The partner never gets a cost from the other's embarrassment; the pair's affinity is one number, so one cost per event.
6. Reaction states are `BUSY` and `NO_SPACE`.

### 6.5 Endings
| Ending | Condition | What happens | Points |
|---|---|---|---|
| **Parted** | `affinity < 0.20` at stage ≥ 2, OR `pair.embToday >= 3` at stage ≥ 3 | 6 s `huff` on both facing away; the pair dissolves; each is assigned a different gate (the two nearest distinct gates) and leaves now; feed line; "heartbreak" particle (a heart splitting) | MP +5 |
| **Happily** | stage 7 completes | fireworks particles 10 s over the spot; they leave together now by the nearest gate as one unit; the two are written to the park's `alumni` list (names, looks); regulars keep each other as `partnerId` with stage 7; an alumni couple (Returning couples, below) that reaches stage 7 again logs `feed.romance.renewed` in place of `feed.happily` and stays once in `alumni` | CP +5 |

Other dissolutions (not endings, no points): both members leave at `leaveAt` (a pair at stage ≥ 2 leaves by the same gate together, feed "strolled off together"); one member leaves alone (passer-by): the pair dissolves, the other keeps `social = 0.5`. Regulars keep memory in every case. A couple shares one `leaveAt` (they arrived together), so a couple still paired at `leaveAt` leaves together by one gate with the same "strolled off together" line; a Parted couple has already left by different gates.

Returning couples: on each new day there is a 20 % chance (sim RNG) that one `alumni` pair arrives as the `couple` archetype with their names and looks (always one woman and one man, each seeking the other, owner 2026-10-20; a Happily pair is always such a pair, and an alumni entry of two women or two men in an old save is forgotten on restore): a `Pair` at stage 3 with affinity 0.70 (fixed, not rolled), feed `feed.alumni_return`. They may reach Happily again; the feed then says they renewed their vows (`feed.romance.renewed`) in place of `feed.happily`, with the same CP +5.

### 6.6 Featured pair, multiple pairs
1. Several pairs run at once; there is no cap beyond the people cap.
2. **Featured** = the pair with the highest stage; tie → the earliest `formedDay` then lowest id. If the player pinned a pair in the Romances sheet, that pair is featured until it dissolves or is unpinned.
3. Benches, picnic spots and romantic spots are taken first come first served; a pair whose spot is taken lingers (6.2 rule 2).
4. One visitor is in at most one `Pair`.

### 6.7 Regular-return proposal rule
A regular pair at stage 6 with affinity in [0.90, 0.95) on the day it reached stage 6 does not propose that day. On the next visit where both are present, the pair is recreated (4.5.4) and stage 7 may start at once if a romantic spot is within 10 tiles and the gate still holds after decay.

---

## 7. Points, tiers, unlocks (`src/play/progression.ts`)

### 7.1 Cupid Points (CP)
1. +1 each time a pair completes a stage **where the player contributed**.
2. **Contributed** = at the tick the stage completes, either `charmAt(pair midpoint).player >= 2`, or a Cupid ability or Cupid avatar action was applied to this pair, to either member, or to a tile within 6 tiles of the midpoint, within the last 60 s. The pair keeps `lastCupidAt` for this.
3. +5 per Happily (always, no attribution test).

### 7.2 Mischief Points (MP)
1. +1 per embarrassment landed on a member of a `Pair` (not backfired, not refused). Landed on anyone else: 0.
2. +5 per Parted.

### 7.3 Tiers
Both ladders use the same thresholds on cumulative points: T0 = 0, T1 = 8, T2 = 20, T3 = 40, T4 = 70. A tier is reached when the ladder's points ≥ threshold. Points and tiers persist in `parque:profile-v1`. The feed shows the day's per-park tally at each new day: "Today: Cupid n · Mischief m".

### 7.4 Unlock table
| Tier | Cupid abilities | Cupid avatar | Mischief abilities | Mischief avatar |
|---|---|---|---|---|
| T0 (0) | `c_petals`, `c_bouquet` | — | `m_pigeon`, `m_sprinkler` | `a_pigeon` |
| T1 (8) | `c_musician`, `c_sunbeam` | `a_florist` | `m_peel`, `m_pomeranian` | `a_pomeranian` |
| T2 (20) | `c_umbrella`, `c_lamplight` | `a_busker` | `m_wasp`, `m_raincloud` | — |
| T3 (40) | `c_picnic`, `c_rowboat` | `a_matchmaker` | `m_rival`, `m_mime` | `a_mime` |
| T4 (70) | `c_fireworks` | — | `m_fog`, `m_flock` | — |

Locked items show dimmed with their tier in the rail and the picker. Unlocking toasts "Unlocked: Musician (Cupid T1)" and logs a feed line.

---

## 8. Creator mode (`src/play/tools.ts`, `src/ui/rail.ts`)

### 8.1 Rail layout
1. Row 1: segmented switch **Park | Cupid | Mischief**, then the scrolling strip of that group (GV data-driven rail `TOOLS` 11038–11046, `buildTools` 11048).
2. Row 2 (contextual): Park group: brush size 1–3 for brushes, **Place / Cancel** for ghosts, **Undo**. Cupid or Mischief: the active ability's cooldown chip and charges.
3. Row 3: pause + speed (1–8×), rotate left, rotate right, Fit, Sound, **Be someone**, Photo, New, Options (register 3.9; Options opens the Options sheet, section 12.4).
4. Selecting any tool other than `hand` clears the selection and camera follow (GV `setTool` 11070).

### 8.2 Tool classes
| Class | Input | Commit | Undo entry | Failure |
|---|---|---|---|---|
| brush (`path`, `lawn`, `pond`) | tap or drag paints a disc of radius `size − 1` with the GV kernel (`paintTile` 11118–11126); a drag fills the tiles between samples along a straight line (owner, 2026-10-13) | at once, per tile | one entry per stroke (GV `beginStroke` 11091) | invalid tiles are skipped silently; a stroke that changed 0 tiles toasts the top-ranked reason of its centre tile |
| stamp 1×1 (`bed`, `tree`, `bench`, `lamp`, `remove`) | one tap | at once if valid | one entry per tap | toast the ranked reason |
| stamp big (`picnic` 2×2, `fountain` 2×2, `kiosk` 2×2, `bandstand` 3×3, `bridge` 1×span) | tap shows a ghost (GV `pbGhost` 5840–5989 → `drawGhost` 6037 green/red panes); tap **Place** or tap the same tile again | on Place | one entry | the ghost is red and row 2 shows the ranked reason; Place is disabled (GV `updateGbar` 11018) |
| run (`hedge`, `canal`) | first tap starts; each next tap must share a row or column with the run's last tile and adds the straight segment; max 14 tiles (GV `pbTap` 5991) | on Place | one entry | a tap not in line toasts "in a straight line from the last piece"; invalid tiles turn the ghost red |

Hidden in avatar mode: the whole Park strip, size row and Undo (GV CSS 169 pattern).

### 8.3 The sixteen tools
| Tool | Class | Writes | Valid tiles | Extra rules |
|---|---|---|---|---|
| `hand` | — | nothing | — | tap selects (section 12), drag pans |
| `path` | brush 1–3 | `KIND = gravel`, `WEAR = 0` | lawn, mulch, flagstone | |
| `lawn` | brush 1–3 | `KIND = lawn`, `WEAR = 0` | gravel, flagstone, mulch, bed | removing a bed this way is allowed |
| `bed` | stamp 1×1 | `KIND = bed`, colour | lawn, mulch | tap an existing bed: cycle colour rose → lavender → marigold → white |
| `hedge` | run | prop hedge per tile, `OCC` | lawn, gravel, flagstone, mulch | blocks walking; max 14 per run |
| `tree` | stamp 1×1 | prop tree, `OCC`, `KIND = mulch` under it | lawn, mulch | species cycle plane → chestnut → lime on each placement; tap an existing tree: remove it (no confirm) |
| `pond` | brush 1–3 | `KIND = pond`, `WATER = 0.6` | lawn, gravel, flagstone, mulch, with `1 <= x, y <= 46` | never on bed, never on `OCC`, never on a gate or boundary tile |
| `canal` | run 1 wide | `KIND = canal`, `WATER = 0.6` | as pond | |
| `bridge` | stamp big | prop bridge on 1–4 water tiles, passable, cost 0.8 | a water tile | the tool finds the shortest straight crossing (N–S or E–W) through the tapped tile with land at both ends and ≤ 4 water tiles; none → "the water is too wide here (4 at most)" |
| `bench` | stamp 1×1 | prop bench, `OCC` | lawn, gravel, flagstone, mulch | tap an existing bench: rotate 90° (4 facings) |
| `picnic` | stamp big 2×2 | prop picnic, passable | lawn only, all 4 tiles | |
| `lamp` | stamp 1×1 | prop lamp, `OCC` | lawn, gravel, flagstone, mulch | lit by section 3.2 |
| `fountain` | stamp big 2×2 | prop fountain, `OCC` | lawn, gravel, flagstone; all 4 tiles ≥ 1 tile from the boundary | |
| `kiosk` | stamp big 2×2 | prop kiosk, `OCC`; serving tile = the tile south of its south-west tile; 2 tables on its east side when free | lawn, gravel, flagstone; ≥ 1 from the boundary | max 3 kiosks; spawns a vendor |
| `bandstand` | stamp big 3×3 | prop bandstand, `OCC` | lawn, gravel, flagstone; ≥ 1 from the boundary | max 1 |
| `remove` | stamp 1×1 | removes the prop or hedge on the tile (and its `OCC`); a kiosk's vendor leaves; sitters stand up | a tile with a prop | a bridge is refused while someone stands on it: "someone is on it" |

Trees and props on a tile also make it invalid for every other stamp; water tiles are invalid for every land stamp.

### 8.4 Ranked failure reasons (GV 5972–5975 style, first match wins)
Land stamps and runs, checked over every footprint tile:
1. outside the park → "outside the railings"
2. a gate tile → "not in the gateway"
3. `WATER > 0` → "not on the water"
4. `OCC != 0` → "the ground is taken"
5. `KIND == bed` → "not on the flowers"
6. the tool's margin rule (fountain, kiosk, bandstand) → "too near the railings"
7. the tool's kind rule (e.g. picnic on lawn) → "only on the lawn" / "not here"
8. the tool's cap rule → "the park has its bandstand" / "three kiosks is enough"
Water stamps (`bridge`): 1 outside → 2 "tap the water" (`reason.not_on_water`, a land tile was tapped) → 3 "someone is on it" → 4 "the water is too wide here (4 at most)".
Brushes report the centre tile's reason only when the whole stroke changed nothing.

### 8.5 Undo (`src/play/undo.ts`)
1. Covers park tools only, 10 deep, command based: each commit is a `Command { tick, side: 'park', kind: 'tool', payload }`; applying it records an inverse (the previous `KIND/WEAR/WATER/OCC` of every touched tile and the props added or removed, including a removed kiosk's vendor id).
2. Undo applies the inverse as a new command (it is logged too). Redo does not exist.
3. Undo never touches abilities, visitors, pairs, points or the clock. A visitor standing on an undone pond tile is nudged to the nearest free tile (GV `openNear` 1559).
4. Undo is hidden in avatar mode and cleared by New.

---

## 9. Abilities (`src/play/abilities.ts`)

### 9.1 Common rules
1. Tapping an ability chip **arms** it (chip highlighted). The next world tap chooses the target; tapping the chip again disarms. An armed ability stays armed across camera moves.
2. Target types: `tile` (the tapped tile), `area` (centre tile; the effect covers a square), `visitor` (GV `tapSelect` 11231 hit test: nearest person within 34 px of the tap, head offset 8 px × zoom), `pair` (a tapped person's `Pair`; a tap on an unpaired person fails "they are not courting"), `park` (no target; fires on arming).
3. Every use is a `Command { side: 'cupid' | 'mischief', kind: ability id, payload: target }`. `apply` validates again inside the simulation; a failed validation toasts the reason and spends nothing.
4. Cooldown starts on success, in sim seconds, shown on the chip as a shrinking ring and the seconds left. Charges reset at `f = 0` each day.
5. A child under the tap: fail "not the children" (section 13), nothing spent.
6. Weather for the effect is `weatherAt(target)`.
7. Scoring: Cupid abilities set `pair.lastCupidAt = T.abs` for every pair within 6 tiles of the target or targeted directly (section 7.1). Mischief abilities score through section 6.4 and 7.2.

### 9.2 Cupid abilities
| Id | Tier | CD | Charges | Target | Timeline | Fails when | Weather and stage interactions |
|---|---|---|---|---|---|---|---|
| `c_petals` | T0 | 30 | — | area 3×3 | t0: petal burst particles; `PETALS = 1` on the 9 tiles; charm +2 on each for 20 s; t20: `PETALS` begins fading | centre tile is water | breeze drifts the particles only; petals under snow still count |
| `c_bouquet` | T0 | 60 | — | pair | t0: a flower seller cameo appears on the nearest walkable tile 3 tiles from the pair, walks to the member nearer the tap (3.0), t≈2–4: hands a bouquet (item), affinity +0.05, 2 hearts; t+3: cameo walks off 3 tiles and vanishes | no pair; either member in a reaction state; pair apart (> 4 tiles) | none |
| `c_musician` | T1 | 120 | — | tile | t0: a busker visitor spawns at the nearest gate and walks to the tile (if > 20 tiles, spawns 6 tiles from the tile instead); on arrival: plays 90 s, charm +3 within 8; t+90: leaves by the nearest gate | tile blocked or water; an AI busker already playing within 8 | rain > 0.6: the busker moves under the nearest shelter within 6 and plays from there |
| `c_sunbeam` | T1 | 90 | — | area 7×7 | t0: override r 3 for 60 s: rain 0, cloud 0.1, light +0.15; a warm light pool drawn; comfort target +0.10 inside; charm +1 | none (works anywhere) | cancels `m_raincloud` inside its square; under snow the tiles' `WET` dries 2× faster |
| `c_umbrella` | T2 | 90 | — | pair | t0: a shared umbrella prop drawn over the pair for as long as `weatherAt` rain > 0.3 (max 120 s); rain counts as charm +2 for this pair; Kiss and Proposal are allowed in rain for this pair | no pair; rain ≤ 0.3 at the pair ("it is not raining on them") | `m_raincloud` on an umbrella pair does not land `drenched` |
| `c_lamplight` | T2 | 60 | — | tile | t0: every lamp within 6 tiles is lit for 60 s whatever the hour and drawn brighter; each counts as lit for charm and for the Kiss prerequisite | no lamp within 6 | none |
| `c_picnic` | T3 | 180 | — | tile | t0: a picnic basket prop (2×2 picnic, passable, 300 s life) appears with the tapped tile as its north-west; both members of the nearest pair within 10 get hunger → 0.1 at once; stage 5 may start here | not 4 lawn tiles; rain > 0.3 | rain starting after placement cancels the stage as usual; the basket stays |
| `c_rowboat` | T3 | 240 | — | tile (pond) | t0: a boat appears on the pond tile; the nearest pair within 10 (stage ≥ 3) walks to the pond edge, boards at t≈5, rows a loop for 60 s with charm +4, lands, boat vanishes | tapped pond has < 12 connected tiles; `ICE = 1`; no eligible pair within 10 | boat ride counts as **together**; an embarrassment cannot land on the boat (abilities targeting them fail "they are on the water") |
| `c_fireworks` | T4 | 360 | 1 | park | t0: fireworks particles for 30 s over the fountain (or park centre); every pair gets charm +4 for 30 s; all visitors `watch` 10 s | phase is not dusk or evening ("wait for the evening") | rain > 0.6 halves the particle count, charm unchanged |

### 9.3 Mischief abilities
| Id | Tier | CD | Charges | Target | Timeline | Fails when | Weather and stage interactions |
|---|---|---|---|---|---|---|---|
| `m_pigeon` | T0 | 25 | — | visitor | t0: the nearest pigeon (or a new one from the north edge) flies at 6.0 to the target; on arrival: `poop` lands (or, if the target is at a Picnic, it pecks the picnic: `poop` kind, and the picnic stage is interrupted) | child; target on the rowboat; target `embToday >= 3` | fog: the pigeon takes 2 s longer (perched) |
| `m_sprinkler` | T0 | 45 | — | tile (lawn) | t0: sprinkler prop pops up; t0–10: soaks the 3×3; everyone entering or standing there gets `soaked` once; `WET = 1` on the 9 tiles; t10: it sinks | tile not lawn | rain > 0.6: still lands (they are already wet, but the surprise counts) |
| `m_peel` | T1 | 40 | — | tile (path) | t0: a peel prop (passable) on the tile, 120 s life; the first adult non-staff walker to enter the tile gets `trip`; the peel vanishes | tile not gravel/flagstone; a peel already there | snow or ice: a peel cannot be placed ("the ground is slippery enough") |
| `m_pomeranian` | T1 | 60 | — | visitor | t0: the pomeranian enters by the nearest gate (or from where it is) and runs at 4.5 to the target; on arrival: `snatched` (takes the first item in order hat, purse, baguette, iceCream); runs to the nearest gate; the victim chases 8 s at 4.0; the item is dropped at the gate and the victim picks it up (`huff` 3 s); the pomeranian waits outside 60 s then is free for the next cast | target has no item; child | a dog walker's dog within 3 tiles: the pomeranian is barked off (fails "the dog saw it off") |
| `m_wasp` | T2 | 60 | — | pair (at Picnic) or a tile with a café table in use | t0: a wasp particle circles the table; t2: `wasp` on both members of the pair (one cost); stage 5 is cancelled; they flee 3 tiles | the pair is not at stage 5 / nobody at the table | rain > 0.3: no wasps ("wasps hate the rain") |
| `m_raincloud` | T2 | 90 | — | area 5×5 | t0: a small cloud drawn; override r 2 for 30 s with rain 0.9; everyone inside who is not under `c_umbrella` or a shelter tile gets `drenched` once | inside a `c_sunbeam` square | the global weather is unchanged; `WET` rises inside |
| `m_rival` | T3 | 150 | — | pair | t0: a charming stranger enters by the nearest gate and walks to the member nearer the tap; on arrival: `rival` reaction 30 s on that member; at t+15 a 50 % roll: the other member steps in and the stranger leaves (`distracted` ends, no further cost); otherwise at t+30 affinity −0.10 (the table cost) and the stranger leaves | no pair; pair apart | works in any weather; during Stroll it also interrupts the stage |
| `m_mime` | T3 | 120 | — | tile (path) or pair | t0: a mime enters by the nearest gate and walks to the tile; on arrival it mimes an invisible wall for 20 s: the tile is blocked for walking; any pair within 2 tiles gets `mime` and reroutes; targeted on a pair: the mime follows them mimicking for 30 s, `mime` once at t0 | tile blocked already | none |
| `m_fog` | T4 | 240 | — | park | t0: override whole park 60 s mist 0.9; every pair at Stroll gets `fog` (they lose each other: each wanders alone until within 2 tiles again or 60 s); pigeons perch; line of sight for new pairs 2 tiles | mist already ≥ 0.6 | none |
| `m_flock` | T4 | 180 | 1 | area 7×7 | t0: a pigeon storm of 20 extra visual pigeons for 8 s; every adult inside (not staff, not children) gets `flock`; hats fly 2 tiles; all pairs inside are interrupted | nobody inside | fog: still works |

---

## 10. Avatar mode (`src/play/mode.ts`, `src/play/avatar.ts`)

### 10.1 Entering and leaving
1. **Be someone** (row 3) opens the avatar picker sheet: the six avatars with side, tier and lock state. Tapping an unlocked one calls `setMode('avatar', avatarId)`.
2. `setMode` (GV 11252–11269 pattern): find or spawn the actor (table 10.2), set `PLAYER = actor id`, `MODE = 'avatar'`, select and follow the actor, zoom to 1.5 if below 1.3 (GV 11257), show the card, toast the avatar's hint for 6 s (GV 11259), `body.avatar` class, button text **Creator**.
3. Row 1 shows the avatar's three action hints (table 10.2). Park strip, size row and Undo are hidden. Abilities are hidden too (the avatar is the ability).
4. **Creator** (row 3) calls `setMode('creator')`: `PLAYER = null`, follow and selection dropped, the actor returns to its own AI at once (register Q14), toast `avatar.goes_on` (06 §16.7).
5. New forces creator mode and discards the possessed actor if it was spawned for the player (GV 12107).
6. One tap in the world while in avatar mode runs the cascade (GV `playerCommand` 11270–11279): the cascade returns a status string; `'busy'` toasts "X: busy"; `'walking'` and `'flying'` are silent; any other string is toasted as "X: string". Tap detection as GV 11223: moved < 9 px and < 420 ms.

### 10.2 The six avatars
| Id | Side | Tier | Actor | Spawn when absent | Speed | Hints | `PLAYER_HOLD` states |
|---|---|---|---|---|---|---|---|
| `a_pigeon` | Mischief | T0 | an existing pigeon | a pigeon from the north edge | fly 6.0, walk 1.2 | Tap someone: swoop · Tap crumbs: peck · Tap a lamp or bench: perch | `swoop, poop, startled` |
| `a_pomeranian` | Mischief | T1 | the pomeranian creature | enters by the nearest gate | 4.5 | Tap someone with a hat or bag: snatch · Tap pigeons: chase · Tap the lawn: dig | `snatch, carry, shakeOff` |
| `a_mime` | Mischief | T3 | a mime visitor | enters by the nearest gate | 3.0 | Tap a path: invisible wall · Tap a couple: mimic · Tap a bench: statue | `wall, mimicStart` |
| `a_florist` | Cupid | T1 | a flower seller visitor with a basket (3 bouquets) | enters by `g_south_w` | 3.0 | Tap a courting visitor: bouquet · Tap the lawn: petals · Tap a flowerbed: refill | `hand, pick, scatter` |
| `a_busker` | Cupid | T2 | the AI busker if present, else a new one | enters by the nearest gate | 3.0 | Tap a spot: play there · Tap a couple: serenade · Tap the bandstand: play there | `setUp, pack` |
| `a_matchmaker` | Cupid | T3 | the girl with the baguette | enters by `g_north` | 3.0 | Tap a single: introduce · Tap a couple: encourage · Tap the kiosk: baguette | `lead, encourage, buy` |

Camera: follows the actor (GV `followStep` 11292 pattern); the pigeon's follow height is its flight height; pinch and rotate still work; a drag pans and drops follow until the next tap re-follows (GV 11278).

### 10.3 Cascade rules shared by all avatars (GV `playerTap` 5653–5688 order)
1. If `PLAYER_HOLD[st]` → return `'busy'`.
2. Clear the previous intent: `job = null`, `path = null`, leave a bench or perch.
3. Nearest interactable: among candidates of the avatar's types, pick the one with the smallest distance to the tap within the radius given; people use the 34 px screen test, props a 0.75-tile box (GV 5658), tiles exact.
4. Tile fallback: a tile-based action if the tapped tile qualifies.
5. Default: walk (or fly) to the tile; return `'walking'` (`'flying'`).
6. Needs never pre-empt orders for any avatar (none of the six has needs that matter: staff and creatures have no needs; the florist, mime and matchmaker have `leaveAt = +∞` while possessed).

### 10.4 `a_pigeon`
| Step | Candidate | Radius | Action | Returns | Scores |
|---|---|---|---|---|---|
| 3a | adult non-staff person | 34 px | `swoop`: fly to them, `poop` lands on arrival (section 6.4), then `startled` 1 s; a person at a Picnic: peck the picnic instead (same kind); 25 s `ruffled` cooldown shown in the card before the next swoop | 'swooping' / 'ruffled' | MP as `m_pigeon` |
| 3b | crumbs prop | 0.75 | walk/fly to it, `peck` 4 s | 'pecking' | — |
| 3c | lamp, bench, fountain, bandstand, tree | 0.75 | `perch` on it (interruptible) | 'perching' | — |
| 4 | water tile | tile | fly to the edge, `drink` 3 s | 'drinking' | — |
| 5 | any tile | | fly there, land | 'flying' | — |
Refusals: child → "not the children"; a dog within 2 tiles sets `startled` 2 s (orders refused); the person `embToday >= 3` → "has had enough for one day".

### 10.5 `a_pomeranian`
| Step | Candidate | Radius | Action | Returns | Scores |
|---|---|---|---|---|---|
| 3a | adult non-staff person with an item | 34 px | `snatch` as `m_pomeranian` (run, take, carry to the nearest gate 8 s, drop, `shakeOff` 1 s); 60 s cooldown shown as `panting` | 'snatching' | MP as `m_pomeranian` |
| 3b | pigeon or crumbs with pigeons | 0.75 | `chase`: pigeons within 3 scatter | 'chasing' | — |
| 3c | child | 34 px | `play`: run circles round the child 8 s; the child chases | 'playing' | — (never a target) |
| 4 | water tile | tile | `paddle` at the edge 4 s, then `shakeOff` | 'paddling' | — |
| 4 | lawn tile | tile | run there, `dig` 3 s (dust) | 'digging' | — |
| 5 | any tile | | run there | 'walking' | — |
Refusal: a dog walker's dog within 3 tiles → "the big dog is watching" (no snatch).

### 10.6 `a_mime`
| Step | Candidate | Radius | Action | Returns | Scores |
|---|---|---|---|---|---|
| 3a | paired person (a couple is a `Pair`) | 34 px | `mimic`: follow them 30 s mimicking; `mime` lands once on a paired member at t0 (`m_mime` rules) | 'mimicking' | MP as `m_mime` |
| 3b | bench | 0.75 | `statue`: sit frozen until the next tap | 'a statue' | — |
| 4 | gravel or flagstone tile | tile | walk there, `wall` 20 s: the tile is blocked, pairs within 2 get `mime` and reroute | 'an invisible wall' | MP as `m_mime` |
| 5 | any tile | | walk | 'walking' | — |
Cooldown: 120 s between landed `mime` events (shown as `resting` in the card); a tap during it still walks or statues but lands nothing.

### 10.7 `a_florist`
| Step | Candidate | Radius | Action | Returns | Scores |
|---|---|---|---|---|---|
| 3a | paired person | 34 px | `hand`: walk to them, give a bouquet (basket −1), affinity +0.05, hearts; 60 s cooldown as `c_bouquet` | 'a bouquet' | Cupid action (section 7.1) |
| 3b | bed tile | 0.75 | `pick` 4 s: basket = 3 | 'picking flowers' | — |
| 3c | bench | 0.75 | sit (interruptible) | 'resting' | — |
| 4 | lawn tile | tile | walk there, `scatter` 2 s: petals 3×3 as `c_petals` (charm +2, 20 s); 30 s cooldown | 'petals' | Cupid action |
| 5 | any tile | | walk | 'walking' | — |
Refusals: empty basket → `reason.basket_empty` ("the basket is empty: pick some flowers"); unpaired person → "they are not courting".

### 10.8 `a_busker`
| Step | Candidate | Radius | Action | Returns | Scores |
|---|---|---|---|---|---|
| 3a | paired person | 34 px | `serenade`: walk to the pair and follow them 30 s playing, charm +3 within 8 of the busker | 'a serenade' | Cupid action |
| 3b | bandstand | 0.75 | walk onto it, `setUp` 3 s, `play` until the next tap | 'playing on the bandstand' | Cupid action for pairs within 8 |
| 4 | any walkable tile | tile | walk there, `setUp` 3 s, `play` until the next tap (charm +3 within 8 while playing) | 'playing here' | Cupid action for pairs within 8 |
| 5 | — | | (step 4 covers every tile; a tap on a blocked tile walks to `openNear` and plays) | | |
No cooldown; moving costs `pack` 2 s and `setUp` 3 s. Charm applies only while `st == 'play'`.

### 10.9 `a_matchmaker`
| Step | Candidate | Radius | Action | Returns | Scores |
|---|---|---|---|---|---|
| 3a | unpaired single | 34 px | `lead`: walk to them, then lead them (they follow at 1 tile) to the nearest compatible single within 12 tiles, which is the nearest single of the other sex who seeks them back (6.1 item 4: a woman is led to a man and a man to a woman, never to their own sex); on arrival within 2 tiles the pair forms without the 50 % roll (6.1); no such single → "nobody for them just now"; 45 s cooldown | 'an introduction' | Cupid action on the new pair |
| 3b | paired person | 34 px | `encourage` 3 s: sets `pair.retryT = 0` and the stage starts on the next decide if the gate and prerequisites hold; 30 s cooldown | 'a word of encouragement' | Cupid action |
| 3c | kiosk | 0.75 | `buy` 4 s: baguette shares = 3 | 'a fresh baguette' | — |
| 3d | pair at Picnic (within 2 tiles of the spot) | 34 px | share bread: both hunger → 0.1 (shares −1) | 'sharing bread' | Cupid action |
| 4 | bench | 0.75 | sit (interruptible) | 'resting' | — |
| 5 | any tile | | walk | 'walking' | — |
Leading takes at most 20 s; if the led single is interrupted by rungs 2–5 the lead ends ("they had to go").

### 10.10 What the avatar earns and loses
1. Points as the equivalent ability (register §3.8).
2. The avatar can be a victim: a pigeon can poop on the matchmaker, the pomeranian can snatch the florist's basket (basket = 0). The avatar is never a `Pair` member and never scores against itself.
3. Leaving avatar mode mid-action: the current action finishes under AI (GV 5626–5629 comment).

---

## 11. Emergent life

### 11.1 Desire paths and gardener paving (`src/world/wear.ts`, `src/entities/staff.ts`)
1. Wear (GV `wearStep` 1674–1681): while a visitor is moving on a **lawn** tile: `WEAR[i] = min(4, WEAR[i] + dt × 0.42 × (1 + 0.6 × min(1, WEAR[i] / 1.2)))`. Not on gravel, flagstone, bed, mulch, water, bridge, or while `WET[i] > 0.5`.
2. Decay (GV `decayWear` 1683–1687): once per second, `WEAR *= WEAR < 0.6 ? 0.9975 : 0.99945`.
3. Look (`src/render/ground.ts`): `WEAR >= 1.6` draws a trodden ribbon; `WEAR >= 2.6` draws bare earth (hysteresis off at 2.1 as GV `WORN_T` 8637).
4. Paving search, every 60 s (GV `planEmergent` habit block 3336–3395, the paving search at 3366–3395): find the lawn tile with the highest `WEAR >= 2.6` that is unoccupied, not paved today and not within 2 tiles of a fountain or a lamp (the first in row order on a tie); follow the worn ground both ways up to 5 steps each way, stepping to the 8-neighbour with the highest `WEAR > 1.6` not yet in the run that is lawn, unoccupied and not paved today (the fountain and lamp exclusion applies to the seed tile only, so a run may pass a lamp); a run of ≥ 3 tiles becomes the gardener's job.
5. The gardener walks to the run's first tile and lays gravel (`KIND = gravel, WEAR = 0`) 1.3 s per tile in order. Feed "The gardener is gravelling a worn track". At most 3 runs per day.
6. The player can `lawn` over gardener gravel; the gardener does not redo a tile within the same day.

### 11.2 Pigeons and crumbs (`src/entities/creatures.ts`)
1. Pigeons: cap 12; 6 at a new park, +1 every 90 s from the north edge up to the cap, −1 when one leaves after a flock.
2. States: `walk` (1.2, random within 3 tiles), `peck`, `perch` (lamp, bench, fountain rim, tree), `fly` (6.0), `scatter` (fly 3 tiles away, 3 s), `swoop` (ability).
3. Crumbs: a prop with `stock` 1–3 dropped by the feed-pigeons routine; stock −1 per pigeon peck (4 s); the prop vanishes at stock 0 or after 60 s.
4. Pigeons within 10 tiles of crumbs go to them (at most 5 per crumbs prop). 3 or more pigeons at crumbs = "a gathering" (feed line once per crumbs).
5. Scatter triggers: a jogger within 2 tiles, any dog within 3, the pomeranian within 3, `m_flock`, a child's chase within 1 tile. Fog: all pigeons perch for its duration.

### 11.3 Dogs
1. Dog walkers' dogs (cap 4 with the pomeranian): on a lead, 1 tile behind the walker; scatter pigeons within 3; bark once (cue) when the pomeranian is within 3 tiles, which sends the pomeranian off (section 9.3 `m_pomeranian`).
2. The pomeranian: a creature present only during `m_pomeranian` (60 s) or while possessed; otherwise it waits outside the nearest gate and is not drawn.

### 11.4 Children and the pomeranian
A child within 6 tiles of the pomeranian with line of sight switches to `chaseDog` for up to 12 s at 2.6 (never catches it: the pomeranian is faster); then returns to the parent. A child never gets an item snatched and never trips (section 13).

---

## 12. HUD, card, sheets, feed, toasts (`src/ui/*`)

### 12.1 Refresh
Chips, card and overlay layout refresh every 0.35 s (GV `updateHUD` 10845); the feed line on each event; the census every 1.2 s while open. `layoutOverlays` measures the rail height and stacks card and sheets above it (GV 10689).

### 12.2 HUD chips
| Chip | Shows | Tap | Other |
|---|---|---|---|
| Clock (left) | weather dot (global kind colour) · phase word · "Day N" · season | opens Events (after a 400 ms single-tap timer) | double tap < 380 ms toggles the perf overlay (dev flag) (GV 12181) |
| Visitors | people count, a "+" button | the chip opens Census; "+" calls one visitor through a random gate now (archetype single 60 %, else by 4.2.4); refused at 30 with toast "The park is full" (GV `addVillager` 4488) | "+" uses `stopPropagation` (GV 12171) |
| Romance | featured pair "A & B · Stage" or "No one courting yet" | opens Romances | pulses once when the featured pair changes stage |
| Points | "Cupid n · Mischief m" | opens Progress | flashes on each gain |

### 12.3 Card (`src/ui/card.ts`)
1. Tap a person with `hand` (34 px, people before props: GV `tapSelect` 11231) to select and follow (zoom ≥ 1.8, GV `selectGnome` 10867); tap empty ground clears.
2. Single card: name · archetype and `ageWord` · relationship line ("single, looking", "courting B · Chat", "with B" for couples, "with the children") · bars **Mood** (comfort), **Rested** (energy), **Full** (1 − hunger), plus **Heart** (affinity) when paired · doing line from a `DOING[st]` table through `t()`.
3. Pair card variant (shown when the selected person is in a `Pair`): both names, the shared affinity bar with the next gate marked, the stage name, both doing lines, a **Pin** toggle (featured). Tapping a name on the pair card switches to that person's single card; tapping the pair line on a single card switches back.
4. Avatar mode: the card is the compact strip (GV CSS 173–178) with " · you" after the name and the doing line "waiting for your tap" / the last cascade string (GV 10830).
5. The card hides while a sheet is open (`body.sheet`).

### 12.4 Sheets (`src/ui/sheets.ts`)
| Sheet | Content | Row tap |
|---|---|---|
| Census | rows: name · archetype · doing · partner; summary "N in the park · k courting · room for (30 − N) more" | select and follow |
| Romances | pairs by stage descending: names, stage, affinity bar, embarrassments today, **Pin**; below: today's Happily and Parted | select the pair (pair card) |
| Progress | two ladders with the tier marks, points, and the next unlock on each; the unlock table 7.4 | — |
| Events | last 40 lines (GV `feedEv` cap 40, 10723), "Day N · phase" per line | go to the subject with a 5.2 s focus pin (GV `goToEvent` 10751, `drawFocusMark` 10764) |
| Avatar picker | six cards with side, tier, lock | enter avatar mode |
| Options | language EN/ES, sound on/off, speed, **Park pace** Calm / Lively (`sheet.options.pace`; remembered in the profile and given to every new park, Lively for a new player; a change also applies to the park in play as a logged `park.pace` command, section 4.2 item 2; register section 4, Park pace and Options), the park seed (`sheet.options.seed`); dev flag reveals sound check and perf; opened by **Options** at the end of rail row 3 (register 3.9) | — |

Census and Events are mutually exclusive (GV 10748).

### 12.5 Feed line and toasts
1. The feed line shows the newest event and fades over 14 s (GV `ageFeed` 10732); tap opens Events.
2. Feed events (all through `t()`): pair formed, each stage completed, each embarrassment landed or backfired, Parted, Happily, unlock, gardener gravelling, a gathering of pigeons, a regular's return, the day tally.
3. Toast: 3.4 s (GV `toast` 10685); 6 s for the avatar tutorial. Toast sources: tool failures, ability failures, cascade strings, mode changes, Fit, Sound, Undo ("Undone"), New confirm.
4. New (row 3) asks "Start a new park? The current one is lost." with Yes / No (register Q21).

---

## 13. Tone rules (register §3.14 as testable rules)
| # | Rule | Test |
|---|---|---|
| T1 | Nothing hurts anyone | No state, cue or feed string contains hurt, injured, hospital, blood, dead, died. A `trip` reaction lasts ≤ 3 s and ends standing. |
| T2 | Only the ten embarrassment kinds exist | `embarrass.ts` exports exactly `poop, soaked, trip, snatched, wasp, drenched, rival, mime, fog, flock`; a unit test fails on any other kind. |
| T3 | Children are never targets | Every ability and avatar step returns "not the children" for a child target; `m_sprinkler`, `m_raincloud` and `m_flock` skip children inside their area; a child's `embToday` is always 0. |
| T4 | Snatched items come back | Every `snatched` event ends with the item dropped within 10 s and the victim's `items` restored on pickup. |
| T5 | Max 3 per person per day | The 4th attempt fails before any effect; `embToday` never exceeds 3; the counter resets at `f = 0`. |
| T6 | Backfires exist | 15 % of landings with a partner within 4 tiles play the laugh scene; over 400 seeded landings the count is between 40 and 80. |
| T7 | No mocking appearance | Visitor looks (hair, coat colour, hat) never appear in feed, toast or card strings. |
| T8 | Mischief is reversible | Parted pairs of regulars may re-pair on a later visit at stage 1 with affinity `rnd(0.2, 0.4)`; no visitor is barred from the park. |
| T9 | Staff stay neutral | The gardener and vendors never score for either side and never react longer than 4 s. |
| T10 | Nothing dies, nothing is lost for good | No `remove` of a visitor except through a gate; no prop is destroyed by the simulation (only by the player's tools). |

Do not: add a "jealousy" or "insult" kind; add damage states to props; let the pomeranian bite; let any reaction exceed 8 s except `distracted` (30) and `lost` (60).

---

## 14. Future two-player hook (`src/core/commands.ts`)
The v1 design must preserve these so a later co-op or versus mode (one side each, online or hot-seat) is a transport layer only:
1. **Every player action is a Command** `{ tick, side: 'park' | 'cupid' | 'mischief', kind, payload }`. The UI never writes simulation state; it enqueues commands, and the loop applies them at the start of the named tick in order of `(tick, side, seq)`.
2. **Determinism**: fixed step 1/60 s (GV `SIM_DT` 12054); all simulation randomness on the sim stream (`mulberry32` GV 583–598); visual, audio and UI randomness on the visual stream; no `Date.now()` or `Math.random()` in `src/entities`, `src/world`, `src/play` or `src/core` except `loop.ts` wall-clock budgeting, which never changes a simulation value.
3. **Symmetric information**: both sides see the same chips, card, sheets and feed. The pinned pair is UI state per client, not a command. Nothing is hidden from one side.
4. **Side-scoped state**: cooldowns, charges, tiers and the possessed avatar are keyed by side (`abilities.ts` keeps `cooldown[side][id]`); the park tools belong to side `'park'`, which a two-player mode assigns to one player or to both by turns.
5. **Command log** in the park snapshot: the last 600 commands with ticks, so a replay from `seed + log` reproduces the park (test: run 1,000 ticks twice from the same snapshot and compare `rngN`, visitor positions and affinities).
6. **One avatar per side**: `PLAYER` becomes `PLAYER[side]`; the cascade already takes an actor id.
7. **Do not**: read `MODE` or `PLAYER` inside `romance.ts`, `needs.ts` or `weather.ts`; apply an ability from the UI thread; keep any timer in real seconds inside the simulation (audio gaps are the only real-time timers, as GV `aOK` 6131).

---

## 15. Assumptions and open points

Values this document defines that the register does not (the owner can object to any; if changed, change `06-Content-Tables.md` to match):
1. Gate tile coordinates and arrival weights (2.4).
2. Starter park coordinates: fountain at (23,23), loop radii 5–6 and 13–14 (floor of the Chebyshev distance from (23.5,23.5)), pond in x 30–36, y 11–13 with 14 to 20 tiles (the old box (30,8)–(37,13) overlapped the outer loop, so its "about 26 tiles" could not be met), bridge over the 2-tile neck, bench angles, bed clusters, kiosk at (14,44), lamp positions, tree spacing (2.5).
3. Flagstone exists only in the starter park; no v1 tool writes it (2.3).
4. `WET` and `PETALS` rates (2.2); river-view charm defined as `y <= 5` (2.4).
5. The `light` curve values per phase and the lamp rule `f >= 0.80 || f < 0.28` (3.2).
6. Weather targets, durations, per-season weights, and the effect columns (3.3); the register says the weight tables live in `06-Content-Tables.md`, which must copy section 3.3.
7. Season effects table (3.4); override sizes and durations (3.5).
8. Arrival targets by phase, arrival interval 6–14 s, archetype weights, per-archetype caps, starting needs, the +0.1 day visit extension per stage (cap 1.2 days) (4.2).
9. Every routine's weights and durations (4.3); kiosk café tables (2 per kiosk) and the chess rule (4.3); the comfort target formula (4.4).
10. The eight regulars' names and `seeks`, return schedule, memory recreation rule, 40 generated names per sex, `ageWord` rule (4.5).
11. Shelter tiles, the `CAN_INTERRUPT`, `NO_SPACE` and `SHELTERED` sets, the comfort ≥ 0.35 requirement for a stage attempt, blocked-target memory 60 s, no corner cutting (5.2–5.5).
12. Line-of-sight definition and the once-per-day failed roll (6.1); a couple's `Pair` created at arrival with Bench counted as completed and no `feed.pair.formed` line (6.1); lingering, the initiator rule, retry timers 30/60 s (6.2); together = within 4 tiles (6.3); the proposal's only failure is an interrupting embarrassment (6.2 stage 7).
13. The embarrassment base costs and the stage factors 1.0/1.25/1.5 capped at 0.15, which realise the register's "−0.06 to −0.15 by kind and stage" (6.4); backfire requires the partner within 4 tiles; `rival` lands only on paired members.
14. Non-ending dissolutions, the `alumni` list and the 20 % returning-couple rule (6.5); the featured tie-break (6.6).
15. MP scores only on paired victims (7.2); the unlock table placing two avatars at T1 and T3 and one at T0 and T2 (7.4) follows the register's avatar tiers exactly.
16. Tool classes (brush paints at once with per-stroke undo; big stamps and runs use ghost and Place; 1×1 stamps place on tap), the bed colour set, bench facings, kiosk serving tile and tables, caps (3 kiosks, 1 bandstand), the bridge crossing search, and the reason order (8.2–8.4).
17. Ability targeting rules, timelines, failure cases and interactions (9); the pomeranian's 60 s wait outside; `m_rival` 50 % at t+15.
18. Avatar spawn gates, speeds, hold states, cascades, cooldowns (the florist's basket of 3, the busker's no-cooldown play, the matchmaker's 45 s / 30 s) (10).
19. Paving every 60 s with a 3-runs-per-day cap, the trodden look thresholds 1.6 / 2.6 (11.1); pigeon counts and scatter triggers (11.2); the pomeranian's presence rule (11.3).
20. "+" chip archetype split 60 % single (12.2); card and sheet details (12.3–12.4); the seed in Options (12.4); New confirmation wording (12.5).
21. The command log length 600 (14.5).

Open points for the owner:
1. Should the park close at night (no arrivals in [0.00, 0.20))? This document keeps a target of 3.
2. Does `remove` on a tree need a confirm toast? This document says no (one tap removes).
3. Should the matchmaker's introduce ignore `seeks` (a "surprising match")? Settled: no, and by the owner's rule of 2026-10-20 (register section 4 "Who can pair") it also never introduces two women or two men.
4. Whether `c_rowboat` should be refused during `m_fog` (visibility) is left to the content tables; this document allows it.
5. The charming stranger (`m_rival`, S10) and the members it flirts with are not changed by the rule "Who can pair" (register section 4, 2026-10-20), which concerns only who forms a `Pair`: the stranger never forms one. Should the stranger always be of the sex the targeted member seeks (the opposite one, as 06 6.4 says), or may it ever be of the member's own sex? Left as written until the owner says.
