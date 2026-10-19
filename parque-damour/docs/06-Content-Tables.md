# Parque D'Amour: Content Tables

Version 1 · 2026-10-10 · Owner: Jeduthun Oosthuis · Author: Claude (design session)

**How to use this document.** This is the single place for every tunable number, list and string key. Code reads these tables; a model that balances the game edits a row here and the matching data file, never a rule. Every id in an `id` column is used verbatim in `src/` (TypeScript string literals, i18n keys, save fields). Every number comes from `01-Decision-Register.md` (the register) first, then from `02-Game-Design.md` (design); where neither defines a value this document defines it and lists it in section 18. If a row here disagrees with the register, the register wins and this row is a bug: report it, do not resolve it yourself. "GV 1234" is an absolute line of the owner's Gnome Village HTML as indexed by `10-Gnome-Village-HTML-Architecture-Review.md`. Section 16 is the complete EN string table; the ES column is "TODO" for the translation task. Do not add a string, an id or a number to code that is not in a table here; add the row first.

---

## 1. Constants

### 1.1 World (`src/world/grid.ts`, `src/world/park.ts`, `src/render/project.ts`)
| id | Value | Unit | Meaning | Source |
|---|---|---|---|---|
| `N` | 48 | tiles | tiles per side | register 3.1 |
| `S` | 1 | - | one scale; 1 tile = 1 m nominal | register 3.1 |
| `NC` | 2304 | tiles | `N * N` | register 3.1 |
| `APRON` | 8 | tiles | drawn beyond each edge, never walkable | register 3.1 |
| `TW` | 26 | px | tile width at zoom 1 (GV 569) | register 3.1 |
| `TH` | 13 | px | tile height at zoom 1 (GV 569) | register 3.1 |
| `EH` | 26 | px | per height unit; ground is flat, props use it | register 3.1 |
| `VANCH` | 0.46 | - | vertical anchor of the view (GV 6332) | register 3.1 |
| `ZOOM_MIN` | 0.30 | - | pinch and wheel floor (GV 11195) | register 3.1 |
| `ZOOM_MAX` | 3.0 | - | pinch and wheel ceiling | register 3.1 |
| `ZOOM_START` | 1.3 | - | a new park opens here, centred on (23.5, 23.5) | 04 §5.1 |
| `ZOOM_SELECT` | 1.8 | - | tap-select zooms to at least this (GV `selectGnome` 10867) | design §12.3 |
| `ZOOM_AVATAR` | 1.5 | - | avatar entry zooms to this if below 1.3 (GV 11257) | design §10.1 |
| `WATER_DEPTH` | 0.6 | - | `WATER` value on pond and canal tiles | register 3.1 |
| `RIVER_VIEW_Y` | 5 | tiles | river-view charm applies to tiles with `y <= 5` | design §2.4 |
| `QUAY_Y` | -1 | tile row | quay wall row; river rows -2 to -8 | register 3.1 |

### 1.2 Time (`src/core/clock.ts`, `src/core/loop.ts`)
| id | Value | Unit | Meaning | Source |
|---|---|---|---|---|
| `DAYLEN` | 360 | sim s | one day at 1x | register 3.2 |
| `SEASON_DAYS` | 3 | days | per season | register 3.2 |
| `YEAR_DAYS` | 12 | days | four seasons | register 3.2 |
| `START_ABS` | 0.30 | days | a new park starts here (spring, day 1, morning) | register 3.2 |
| `SIM_DT` | 1/60 | s | fixed step (GV `SIM_DT` 12054) | design §14.2 |
| `STEPS_PER_DAY` | 21600 | steps | `60 * DAYLEN` | 03 §6.1 |
| `SPEED_MIN`, `SPEED_MAX` | 1, 8 | x | speed dial; 0 is pause | register 3.2 |
| `NS_MAX` | `clamp(ceil(speed * 2.2) + 4, 8, 48)` | steps | steps per frame cap (GV 12082) | 03 §4.1 |
| `WALL_BUDGET` | 9 / 13 / 26 | ms | speed <= 3 / <= 6 / > 6 (GV 12082) | 03 §4.1 |
| `LITE` | 1 / 3 | bits | speed <= 6 / > 6 (GV 12083) | 03 §4.5 |
| `PLAN_T` | 1.2 | sim s | planning tick (GV 12038) | 03 §4.3 |
| `HUD_T` | 0.35 | real s | chip, card and overlay refresh (GV 10845) | design §12.1 |
| `CENSUS_T` | 1.2 | real s | census refresh while open | design §12.1 |
| `FEED_FADE` | 14 | real s | feed line fade (GV 10732) | design §12.5 |
| `TOAST_T` | 3.4 | real s | toast (GV 10685) | design §12.5 |
| `TOAST_T_LONG` | 6 | real s | avatar hint toast (GV 11259) | design §10.1 |
| `AUTOSAVE_T` | 30 | sim s | autosave interval | register 3.11 |
| `FOCUS_PIN_T` | 5.2 | real s | focus pin after an Events row tap (GV 10751) | design §12.4 |
| `TAP_MAX_PX`, `TAP_MAX_MS` | 9, 420 | px, ms | a pointer that moved less and lasted less is a tap (GV 11223) | design §10.1 |
| `DOUBLE_TAP_MS` | 380 | ms | clock chip double tap (GV 12181) | design §12.2 |
| `SINGLE_TAP_DELAY_MS` | 400 | ms | clock chip single-tap timer | design §12.2 |

### 1.3 Day phases (`src/core/clock.ts`; phase ids are the `hud.phase.*` key suffixes)
| id | `f` from | `f` to | `light` start | `light` end | Lamps | Population target |
|---|---|---|---|---|---|---|
| `night` | 0.00 | 0.20 | 0.06 | 0.06 | lit | 3 |
| `dawn` | 0.20 | 0.28 | 0.06 | 0.75 | lit | 6 |
| `morning` | 0.28 | 0.45 | 0.75 | 1.00 | off | 16 |
| `midday` | 0.45 | 0.58 | 1.00 | 1.00 | off | 20 |
| `afternoon` | 0.58 | 0.72 | 1.00 | 0.88 | off | 24 |
| `golden` | 0.72 | 0.80 | 0.88 | 0.62 | off | 20 |
| `dusk` | 0.80 | 0.87 | 0.62 | 0.22 | lit | 14 |
| `evening` | 0.87 | 1.00 | 0.22 | 0.06 | lit | 9 |

Lamps lit when `f >= 0.80 || f < 0.28`. Warm tint peaks at `f = 0.76`. `light` is linear inside a phase (design §3.2).

### 1.4 Caps (`src/core/ids.ts` and the owning module)
| id | Value | Enforced in | Source |
|---|---|---|---|
| `CAP_PEOPLE` | 30 | `visitor.ts` (cameos excluded) | register 3.3 |
| `CAP_PIGEONS` | 12 | `creatures.ts` | register 3.3 |
| `CAP_DOGS` | 4 | `creatures.ts` (includes the pomeranian) | register 3.3 |
| `CAP_PARTICLES` | 220 | `render/effects.ts` (GV `P` 2386) | register 3.3 |
| `CAP_EFFECTS` | 64 | `abilities.ts` | 03 §3.11 |
| `CAP_OVERRIDES` | 16 | `weather.ts` | 03 §3.11 |
| `CAP_PROPS_SOFT` | 600 | `tools.ts` toasts `reason.park_full_props` | 03 §3.11 |
| `CAP_FEED` | 40 | `feed.ts` (GV 10723) | design §12.4 |
| `CAP_LOG` | 600 | `commands.ts` | design §14.5 |
| `UNDO_DEPTH` | 10 | `undo.ts` (GV 11091) | register 3.7 |
| `CAP_KIOSKS` | 3 | `tools.ts` | design §8.3 |
| `CAP_BANDSTANDS` | 1 | `tools.ts` | design §8.3 |
| `CAP_RUN_TILES` | 14 | `tools.ts` (GV `pbTap` 5991) | design §8.2 |
| `CAP_EMB_DAY` | 3 | `embarrass.ts` per person and per pair per day | register 3.5 |
| `CAP_ARTISTS`, `CAP_AI_BUSKERS`, `CAP_DOGWALKERS` | 1, 1, 2 | `visitor.ts` arrivals | design §4.2 |
| `CAP_REGULARS_DAY` | 3 | `names.ts` returns per day | design §4.5 |
| `CAP_PAVING_RUNS_DAY` | 3 | `staff.ts` | design §11.1 |
| `CAP_PIGEONS_PER_CRUMBS` | 5 | `creatures.ts` | design §11.2 |
| `CAP_BLOCKED_MEMORY` | 8 | `move.ts` per visitor | design §5.5 |
| `ASTAR_NODES` | 2600 | `astar.ts` per call (GV 1475, `2600*S2`) | design §5.5 |
| `CAP_FLOCK_VISUAL` | 20 | `effects.ts` extra pigeons for `m_flock` | design §9.3 |

### 1.5 Speeds (`src/entities/move.ts`; tiles per sim second)
| id | Value | Who | Source |
|---|---|---|---|
| `SPD_ADULT` | 3.0 | single, couple, parent, tourist, artist, busker, dogwalker, gardener, vendor, cameo | register 3.4 |
| `SPD_CHILD` | 2.6 | child | register 3.4 |
| `SPD_ELDER` | 2.0 | elder | register 3.4 |
| `SPD_JOGGER` | 5.0 | jogger | register 3.4 |
| `SPD_PAIR` | 2.4 | a pair strolling as one unit, couples included | register 3.4 |
| `SPD_CHASE` | 4.0 | victim chasing the pomeranian; fleeing a wasp | design §5.4 |
| `SPD_POM` | 4.5 | pomeranian | design §5.4 |
| `SPD_PIGEON_FLY` | 6.0 | pigeon flying, straight line | design §5.4 |
| `SPD_PIGEON_WALK` | 1.2 | pigeon walking | design §5.4 |
| `SPD_DOG` | 3.0 | dog on a lead (follows 1 tile behind) | design §5.4 |
| `SPD_LOST` | 1.5 | the `lost` reaction walk | 04 §9.3 |

### 1.6 Radii and distances (tiles unless stated)
| id | Value | Meaning | Source |
|---|---|---|---|
| `R_ARRIVE` | 0.7 | arrival radius (GV 1610) | design §5.4 |
| `R_WAYPOINT` | 0.44 | waypoint radius | design §5.4 |
| `REPLAN_T` | 0.6 s | replan cooldown | design §5.4 |
| `GIVE_UP_STEPS` | 6 | blocked steps before giving up (GV 1635) | design §5.4 |
| `BLOCKED_MEMORY_T` | 60 s | blocked target remembered | design §5.5 |
| `R_OPEN_NEAR` | 3 | `openNear` search (GV 1559) | design §5.4 |
| `SEP_RX`, `SEP_RY` | 10 px, 8 px | crowd separation at zoom 1 (GV 5592); world 0.77 x 1.23 tiles | 03 §6.3 |
| `R_PAIR_FORM` | 4 | pair formation distance with line of sight | register 3.5 |
| `R_PAIR_FORM_MIST` | 2 | the same in mist or fog | design §3.3 |
| `R_TOGETHER` | 4 | a pair counts as together | design §6.3 |
| `R_CHAT` | 2 | Chat prerequisite | register 3.5 |
| `R_BENCH` | 8 | Bench prerequisite | register 3.5 |
| `R_LOOP` | 10 | Stroll loop search | design §6.2 |
| `LOOP_MIN_TILES` | 12 | Stroll loop size | register 3.5 |
| `R_PICNIC` | 10 | Picnic spot search | register 3.5 |
| `R_ROMANTIC` | 10 | Proposal spot search on a regular's return | design §6.7 |
| `R_SHELTER` | 20 | shelter search | design §5.2 |
| `R_KIOSK` | 30 | kiosk search for the eat rung | design §5.2 |
| `R_REST_BENCH` | 15 | bench search for the rest rung | design §5.2 |
| `R_CUPID_CONTRIB` | 6 | Cupid cast within this of a pair midpoint counts as contributed | design §7.1 |
| `T_CUPID_CONTRIB` | 60 s | window for contributed | register 3.6 |
| `R_TAP_PERSON_PX` | 34 px | hit test for people (GV `tapSelect` 11231); head offset 8 px x zoom | design §9.1 |
| `R_TAP_PERSON_SIM` | 1.2 | sim re-validation radius for a tapped person | 03 §5.2 |
| `R_TAP_PROP` | 0.75 | box for props (GV 5658) | design §10.3 |
| `R_CHILD_CHASE_DOG` | 6 | child chases the pomeranian within this with line of sight, <= 12 s | design §11.4 |
| `R_CHILD_CHASE_PIGEON` | 5 | child chases pigeons within this, 22 % per decision (GV 4742) | design §4.3 |
| `R_SCATTER_JOGGER`, `R_SCATTER_DOG`, `R_SCATTER_POM`, `R_SCATTER_CHILD` | 2, 3, 3, 1 | pigeon scatter triggers | design §11.2 |
| `R_CRUMBS_ATTRACT` | 10 | pigeons go to crumbs within this | design §11.2 |
| `R_BARK` | 3 | a walker's dog barks the pomeranian off within this | design §11.3 |
| `R_FAMILY_LAWN` | 4 | family picks a lawn tile at least this from any path | design §4.3 |
| `R_TREE_SPACING_PATH`, `R_TREE_SPACING_TREE` | 3, 4 | starter park tree placement | design §2.5 |

### 1.7 Romance and points numbers
| id | Value | Meaning | Source |
|---|---|---|---|
| `PAIR_ROLL` | 0.50 | chance a first encounter forms a pair | register 3.5 |
| `AFF_START_MIN`, `AFF_START_MAX` | 0.2, 0.4 | starting affinity `rnd` | register 3.5 |
| `AFF_PER_STAGE` | 0.08 | per completed stage | register 3.5 |
| `CHARM_CAP` | 6 | cap of `charmAt().total` and `.player` | register 3.5 |
| `CHARM_RATE` | 0.004 | affinity per charm point per `CHARM_PERIOD` while together | register 3.5 |
| `CHARM_PERIOD` | 10 s | charm conversion period | register 3.5 |
| `AFF_DECAY_DAY` | 0.1 | per day apart | register 3.5 |
| `EMB_COMFORT` | 0.3 | comfort removed at once by an embarrassment | register 3.5 |
| `EMB_COST_CAP` | 0.15 | affinity cost cap per event | design §6.4 |
| `EMB_STAGE_FACTOR` | 1.0 / 1.25 / 1.5 | stage 1-2 / 3-4 / 5-7 | design §6.4 |
| `BACKFIRE` | 0.15 | backfire chance when the partner is within 4 tiles | register 3.5 |
| `BACKFIRE_AFF` | 0.04 | affinity gained on a backfire | register 3.5 |
| `RETRY_T`, `RETRY_T_LATE` | 30 s, 60 s | retry after an interrupted stage; Kiss and Proposal | design §6.2 |
| `PARTED_AFF` | 0.20 | Parted when affinity falls below this at stage >= 2 | register 3.5 |
| `PARTED_EMB` | 3 | Parted at this many embarrassments in a day at stage >= 3 | register 3.5 |
| `PROPOSAL_SAME_DAY` | 0.95 | affinity needed to propose on the formation day | register 3.5 |
| `STAGE_MIN_COMFORT` | 0.35 | both members need this to start a stage | design §5.2 |
| `HUFF_T` | 6 s | Parted huff | design §6.5 |
| `FIREWORKS_HAPPILY_T` | 10 s | fireworks after Happily | design §6.5 |
| `ALUMNI_RETURN` | 0.20 | per-day chance an alumni pair returns as the couple archetype | design §6.5 |
| `COUPLE_STAGE` | 3 | a couple archetype arrives as a `Pair` at this stage (Bench counted as completed; the next attempt is `stroll`) | register 3.4 |
| `COUPLE_AFF_MIN`, `COUPLE_AFF_MAX` | 0.55, 0.70 | starting affinity `rnd` of an arriving couple | register 3.4 |
| `ALUMNI_AFF` | 0.70 | starting affinity of a returning alumni couple (fixed, not rolled) | register 3.5 |
| `CP_STAGE`, `CP_HAPPILY` | 1, 5 | Cupid Points | register 3.6 |
| `MP_EMB`, `MP_PARTED` | 1, 5 | Mischief Points | register 3.6 |
| `CONTRIB_CHARM` | 2 | `charmAt(midpoint).player >= 2` counts as contributed | register 3.6 |
| `TIERS` | 0, 8, 20, 40, 70 | T0 to T4 cumulative points, both ladders | register 3.6 |

### 1.8 Arrivals, visits, wear, creatures
| id | Value | Meaning | Source |
|---|---|---|---|
| `ARRIVAL_GAP_MIN`, `ARRIVAL_GAP_MAX` | 6 s, 14 s | gap between arrivals while below target | design §4.2 |
| `VISIT_MIN`, `VISIT_MAX` | 0.25, 0.5 days | visit length | register 3.4 |
| `VISIT_PER_STAGE`, `VISIT_CAP` | 0.1, 1.2 days | extension per completed stage, cap from arrival | design §4.2 |
| `VISIT_TOURIST` | 0.25 days | tourists always | design §4.3 |
| `ARTIST_PAINT_T` | 0.4 days | artist stay at the easel | design §4.3 |
| `GARDENER_ENTER_T` | 10 s | after a new park, at `g_west` | design §4.2 |
| `REGULAR_RETURN_DAYS` | 1 to 2 | `rint` days until a regular returns | design §4.5 |
| `REGULAR_ARRIVE_F` | 0.30 to 0.65 | arrival `f` of a returning regular | design §4.5 |
| `CALL_SINGLE_PCT` | 60 | "+" chip spawns a single this often, else by archetype weight | design §12.2 |
| `WEAR_RATE` | `dt * 0.42 * (1 + 0.6 * min(1, WEAR / 1.2))` | on lawn while moving (GV 1674-1681) | design §11.1 |
| `WEAR_MAX` | 4 | cap | design §11.1 |
| `WEAR_DECAY` | `0.9975` below 0.6 else `0.99945` | once per sim second (GV 1683-1687) | design §11.1 |
| `WEAR_RIBBON`, `WEAR_BARE`, `WEAR_BARE_OFF` | 1.6, 2.6, 2.1 | trodden look, bare earth, hysteresis (GV `WORN_T` 8637) | design §11.1 |
| `PAVE_T` | 60 s | paving search interval (GV 3366-3395) | design §11.1 |
| `PAVE_MIN_RUN`, `PAVE_FOLLOW` | 3, 5 | min run length; steps each way | design §11.1 |
| `PAVE_FOLLOW_WEAR` | 1.6 | follow neighbours above this | design §11.1 |
| `LAY_T` | 1.3 s | per gravel tile (GV `LAY_T` 4554) | design §4.3 |
| `TIDY_T`, `TIDY_EVERY` | 6 s, 120 s | gardener tidies a bed | design §4.3 |
| `PIGEONS_START`, `PIGEON_TOPUP_T` | 6, 90 s | new park count; +1 per interval to the cap | design §11.2 |
| `CRUMBS_STOCK`, `CRUMBS_LIFE`, `PECK_T` | 1 to 3, 60 s, 4 s | crumbs prop | design §11.2 |
| `CRUMBS_EVERY`, `FEED_T` | 10 s, 40 s | feed-pigeons routine drops crumbs | design §4.3 |
| `GATHERING_N` | 3 | pigeons at crumbs for the "gathering" feed line | design §11.2 |
| `SCATTER_T`, `SCATTER_D` | 3 s, 3 | pigeon scatter | design §11.2 |
| `POM_WAIT_T` | 60 s | pomeranian waits outside after a snatch | design §9.3 |
| `WET_RISE`, `WET_FALL`, `WET_RAIN_MIN` | 0.2/s, 0.01/s, 0.3 | `WET` tile layer | design §2.2 |
| `PETALS_FADE` | 1/40 per s | `PETALS` tile layer | design §2.2 |
| `ICE_ON_T`, `ICE_OFF_T` | 60 s, 120 s | snow before ice; no snow before thaw | design §3.3 |
| `SNOWCOVER_RISE`, `SNOWCOVER_FALL` | 0.2/s, 0.05/s | visual snow cover (04 §10.3) | 04 §10.3 |
| `DECIDE_MIN`, `DECIDE_MAX` | 0.5 s, 1.3 s | decide cadence (GV 5696) | register 3.4 |
| `IDLE_MIN`, `IDLE_MAX` | 2 s, 5 s | idle between routine activities | design §4.3 |

---

## 2. Tile kinds (`src/world/grid.ts` `KIND`; colour tokens are 04 §3.1 names)

| id | `KIND` value | Walk cost | Charm | Wear | Colour token | Placed by tool | Notes |
|---|---|---|---|---|---|---|---|
| `lawn` | 0 | 1.0 | 0 | yes | `lawn` + season tint | `lawn` (brush) | desire paths form here; picnics here only |
| `gravel` | 1 | 0.75 | 0 | no | `gravel` | `path` (brush); gardener paving | the park's path material |
| `flagstone` | 2 | 0.7 | 0 | no | `flagstone` | none (starter park only) | around the fountain and kiosk |
| `bed` | 3 | blocked | +1 within 3 | no | `bedEarth` rim, flower dots by `BEDC` | `bed` (stamp) | colour cycle rose, lavender, marigold, white |
| `mulch` | 4 | 1.0 | 0 | no | `bedEarth` x 0.95 | `tree` (stamp, under the tree) | |
| `pond` | 5 | blocked; bridge 0.8 | 0 | no | `water` | `pond` (brush) | `WATER = 0.6`; rowboat needs >= 12 connected tiles |
| `canal` | 6 | blocked; bridge 0.8 | 0 | no | `water` | `canal` (run) | `WATER = 0.6`; 1 tile wide |

Bed colours (`BEDC`): 0 `rose` (token `rose`), 1 `lavender` (`#B9A6E0`), 2 `marigold` (`#F2C14E`), 3 `white` (token `paper`) (04 §6.1). Other costs: diagonal step x 1.41 and refused when either orthogonal neighbour is blocked; `OCC` non-passable blocked; apron blocked; a gate's `outside` tile allowed only for its own visitor (design §5.5).

---

## 3. Park tools (`src/play/tools.ts`; all free; Park group of the rail; label and hint keys are `tool.<id>.label` and `tool.<id>.hint`)

### 3.1 The sixteen tools
| id | Class | Size | Footprint | Rotations | Writes | Valid tiles | Extra rule | Undoable |
|---|---|---|---|---|---|---|---|---|
| `hand` | none | - | - | - | nothing | - | tap selects, drag pans | no (not a command) |
| `path` | brush | 1 to 3 | disc radius `size - 1` | - | `KIND = gravel`, `WEAR = 0` | lawn, mulch, flagstone | - | yes, one entry per stroke |
| `lawn` | brush | 1 to 3 | disc | - | `KIND = lawn`, `WEAR = 0` | gravel, flagstone, mulch, bed | removes a bed | yes, per stroke |
| `bed` | stamp | 1 | 1 x 1 | - | `KIND = bed`, `BEDC` | lawn, mulch | tap an existing bed: cycle `BEDC` 0 to 3 | yes, per tap |
| `hedge` | run | - | 1 x n, n <= 14 | auto-join | prop `hedge` per tile, `OCC` | lawn, gravel, flagstone, mulch | blocks walking | yes, one entry per run |
| `tree` | stamp | 1 | 1 x 1 | 3 species cycle | prop `tree`, `OCC`, `KIND = mulch` under it | lawn, mulch | tap an existing tree: remove it, no confirm | yes, per tap |
| `pond` | brush | 1 to 3 | disc | - | `KIND = pond`, `WATER = 0.6` | lawn, gravel, flagstone, mulch with `1 <= x, y <= 46` | never on bed, `OCC`, a gate or a boundary tile | yes, per stroke |
| `canal` | run | - | 1 x n, n <= 14 | - | `KIND = canal`, `WATER = 0.6` | as `pond` | - | yes, per run |
| `bridge` | stamp big | - | 1 x span, span 1 to 4 | 2 (N-S, E-W; found by the tool) | prop `bridge`, passable, cost 0.8 | a water tile | shortest straight crossing through the tapped tile with land at both ends | yes, per placement |
| `bench` | stamp | 1 | 1 x 1 | 4 (repeat tap rotates) | prop `bench`, `OCC` | lawn, gravel, flagstone, mulch | 2 seats | yes, per tap |
| `picnic` | stamp big | - | 2 x 2 | 1 | prop `picnic`, passable | lawn only, all 4 tiles | - | yes, per placement |
| `lamp` | stamp | 1 | 1 x 1 | 1 | prop `lamp`, `OCC` | lawn, gravel, flagstone, mulch | lit by section 1.3 | yes, per tap |
| `fountain` | stamp big | - | 2 x 2 | 1 | prop `fountain`, `OCC` | lawn, gravel, flagstone; all 4 tiles >= 1 from the boundary | - | yes, per placement |
| `kiosk` | stamp big | - | 2 x 2 | 4 (serving side) | prop `kiosk`, `OCC`; serving tile south of the south-west tile; 2 `table` props east when free | lawn, gravel, flagstone; >= 1 from the boundary | max 3; spawns a vendor | yes, per placement |
| `bandstand` | stamp big | - | 3 x 3 | 1 | prop `bandstand`, `OCC` | lawn, gravel, flagstone; >= 1 from the boundary | max 1 | yes, per placement |
| `remove` | stamp | 1 | 1 x 1 | - | removes the prop or hedge and its `OCC`; a kiosk's vendor leaves; sitters stand | a tile with a prop | a bridge is refused while someone stands on it | yes, per tap |

Class behaviour (design §8.2): brushes commit at once per tile with the GV kernel (`paintTile` 11118-11126) and group one pointer stroke into one undo entry (GV `beginStroke` 11091); 1 x 1 stamps commit on the tap; big stamps and runs show a ghost (GV `pbGhost` 5840-5989, `drawGhost` 6037) and commit on Place or a second tap on the same tile (GV `pbPlace` 6005); runs add straight segments per tap (GV `pbTap` 5991). The whole Park strip, the size row and Undo are hidden in avatar mode.

### 3.2 Placement checks, in order, with reason keys (first failing check wins; GV 5972-5975 style)
Land stamps and runs, over every footprint tile:
| # | Check | Reason key | Tools |
|---|---|---|---|
| 1 | tile not `inB` | `reason.outside` | all |
| 2 | a gate tile | `reason.gateway` | all |
| 3 | `WATER > 0` | `reason.on_water` | all land tools |
| 4 | `OCC != 0` | `reason.taken` | all land tools |
| 5 | `KIND == bed` | `reason.on_flowers` | all except `lawn`, `bed` |
| 6 | margin rule (any footprint tile on the boundary row or column) | `reason.near_railings` | `fountain`, `kiosk`, `bandstand` |
| 7 | kind rule (the Valid tiles column) | `reason.lawn_only` for `picnic`; `reason.not_here` otherwise | all |
| 8 | cap rule | `reason.has_bandstand`; `reason.enough_kiosks` | `bandstand`; `kiosk` |
| 9 | run tap not sharing a row or column with the last tile | `reason.straight_line` | `hedge`, `canal` |
| 10 | run longer than 14 | `reason.run_too_long` | `hedge`, `canal` |
| 11 | props at the soft cap | `reason.park_full_props` | every prop-adding tool |

Water stamp (`bridge`): 1 outside `reason.outside`; 2 not a water tile `reason.not_on_water`; 3 someone on the crossing `reason.someone_on_it`; 4 no crossing of <= 4 water tiles `reason.too_wide`. `remove` on a tile with no prop: `reason.not_here`; on a bridge with someone on it: `reason.someone_on_it`. Brushes skip invalid tiles silently and toast the centre tile's reason only when the stroke changed nothing. Undo with an empty stack: `reason.nothing_to_undo`.

---

## 4. Props (`Prop.kind`; footprint in tiles; height in EH from 04 §6.1; "blocks" = non-passable, writes `OCC`)

| id | Footprint | Height | Seats | Charm | Blocks | Placed by | Seasonal and other variants | Notes |
|---|---|---|---|---|---|---|---|---|
| `bench` | 1 x 1 | 0.45 | 2 | 0 (romantic spot when within 3 of a lit lamp) | yes | `bench`, gen | wet slats x 0.86; snow cap | 4 facings |
| `lamp` | 1 x 1 | 1.4 + 0.25 | 0 | +1 within 3 while lit | yes | `lamp`, gen | lit dusk to dawn; `c_lamplight` halo x 1.4 | three globes |
| `fountain` | 2 x 2 | 0.9 + 0.6 | 0 | +2 within 5 | yes | `fountain`, gen | winter `ICE`: no spray | romantic spot within 3; viewpoint within 6 |
| `kiosk` | 2 x 2 | 1.6 | 0 | 0 | yes | `kiosk`, gen | night counter window lit; winter steam | serving tile; shelter tiles (awning); spawns a vendor |
| `table` | 1 x 1 | 0.5 | 2 | 0 | yes | with a kiosk (2 per kiosk) | none | picnic spot; chess spot for two elders |
| `bandstand` | 3 x 3 | 0.25 + 1.6 | 0 | +2 within 4 | yes | `bandstand` | string lights at night while a busker plays | romantic spot within 4; shelter tiles; viewpoint within 6 |
| `picnic` | 2 x 2 | 0.05 | 2 | 0 | no | `picnic`; `c_picnic` (300 s life) | none | picnic spot |
| `bridge` | 1 x span (1 to 4) | 0.3 | 0 | 0 | no (walk cost 0.8) | `bridge`, gen | wet x 0.86; snow on deck | romantic spot; over ice in winter still a romantic spot |
| `hedge` | 1 x 1 | 0.5 | 0 | 0 | yes | `hedge` | autumn tint; winter dusting | auto-joins 4-neighbours |
| `tree` | 1 x 1 (crown overhangs 1.5) | 2.0 to 2.5 | 0 | 0 | yes | `tree`, gen | species 0 plane, 1 chestnut, 2 lime; four seasons (section 15) | adjacent tiles are shelter; pigeons perch |
| `easel` | 1 x 1 | 0.9 | 0 | 0 | yes | artist (sim) | none | leaves with the artist |
| `crumbs` | 1 x 1 | 0 | 0 | 0 | no | feed-pigeons routine (sim) | `stock` 1 to 3 | 60 s life or stock 0 |
| `peel` | 1 x 1 | 0.02 | 0 | 0 | no | `m_peel` (120 s life) | none | first adult non-staff walker trips |
| `sprinkler` | 1 x 1 | 0.15 | 0 | 0 | yes | `m_sprinkler` (10 s life) | none | soaks 3 x 3 |
| `basket` | 2 x 2 (as `picnic`) | 0.05 | 2 | 0 | no | `c_picnic` | none | this is the `picnic` prop with `placedBy = 'sim'` and `untilTick`; no separate drawing |
| `rowboat` | on a pond tile | 0.25 | 2 | +4 for the riding pair | no (on water) | `c_rowboat` (about 65 s life) | none | pond >= 12 tiles, no ice |
| `umbrella` | over a pair | 0.9 | 0 | +2 for the pair in rain | no | `c_umbrella` (<= 120 s) | backfire newspaper variant | drawn, never in `OCC` |
| `railing`, `gate`, `facade`, `quay` | apron | - | 0 | 0 (river view is a tile rule) | apron is blocked by `inB` | `park.ts` backdrop | never saved | gate pillars carry a single-globe lamp |

Spots derived from props (design §2.6): **bench** = `bench` with a free seat; **picnic spot** = `picnic` or a free `table`; **romantic spot** = within 4 of a `bandstand`, on a `bridge` tile, within 3 of a `fountain`, or a `bench` within 3 of a lit `lamp`; **viewpoint** = within 6 of a `fountain`, `bandstand` or pond edge, or `y <= 3`; **shelter tile** = kiosk awning tiles, bandstand tiles, tiles adjacent to a `tree`.

---

## 5. Visitor archetypes (`src/entities/visitor.ts`, `brain.ts`; display names are `archetype.<id>`)

### 5.1 Arrival weights and caps
Archetype weights per arrival roll (design §4.2.4). They do not vary by season or day phase; the population **target** varies by phase (section 1.3) and the arrival **rate factor** by weather (section 14) and season (section 15). A roll that hits a full archetype becomes `single`.
| id | Arrives as | Weight | Cap in park | `ageWord` | `sex` | Counts toward 30 |
|---|---|---|---|---|---|---|
| `single` | alone | 30 | - | young 50 % / grown 50 % | 50/50 | yes |
| `couple` | two, linked by `coupleOf`, already a `Pair` at stage 3 with affinity rnd(0.55, 0.70) (register 3.4; section 8) | 12 | - | grown | one f, one m | yes (2) |
| `family` | parent + `child` | 12 | - | grown; child young | parent 50/50; child 50/50 | yes (2) |
| `elder` | alone | 10 | - | elder | 50/50 | yes |
| `tourist` | alone (60 %) or pair (40 %) | 12 | - | young 50 % / grown 50 % | 50/50 | yes |
| `jogger` | alone | 8 | - | young 50 % / grown 50 % | 50/50 | yes |
| `artist` | alone | 4 | 1 | young 50 % / grown 50 % | 50/50 | yes |
| `dogwalker` | + 1 dog creature | 8 | 2 | young 50 % / grown 50 % | 50/50 | yes (dog counts toward `CAP_DOGS`) |
| `busker` | alone, or summoned by `c_musician` | 4 | 1 AI | young 50 % / grown 50 % | 50/50 | yes |
| `gardener` | staff, 1, never leaves | - | 1 | grown | m | yes |
| `vendor` | staff, 1 per kiosk | - | 3 | grown | 50/50 | yes |
| `child` | with a `family` parent | - | - | young | 50/50 | yes |
| `cameo` | by an ability: flower seller, rival stranger, mime | - | - | grown | flower seller f; stranger the sex the targeted member `seeks`, or opposite the partner's when `any`; mime m | no |

`ARRIVAL_MOD[phase][archetype]`: all 1.0 in v1 (a tuning hook; see section 18).

### 5.2 Routines, speed, needs, visit length, signifier
Needs rates are the same for every person (section 7); staff and cameos have no needs that matter (`leaveAt = +infinity` for staff). Signifiers are 04 §7.2.
| id | Speed | Routine activities (weight; duration in sim s) | Visit length | Signifier |
|---|---|---|---|---|
| `single` | 3.0 | stroll a loop (35; 70 when `social > 0.6`): one full round · bench (20): 20-60 · kiosk (15): eat 12, hunger to 0.1 · feed pigeons (15): 40, crumbs every 10 · read (15): 40 | 0.25-0.5 day, +0.1 per stage, cap 1.2 | scarf in the signature colour |
| `couple` | 2.4 together | stroll together (50): lower id leads, the other 0.5 tile behind · bench (30): 30-60, two seats · picnic (20; x 1.5 in summer): 40-60 at a free picnic spot · leave together by one gate; runs between romance stages, the pair continuing the ladder from `stroll` (section 8) | 0.25-0.5 day, +0.1 per stage, cap 1.2 | matching scarves, one hue |
| `family` | parent 3.0, child 2.6 | parent to a lawn tile >= 4 from any path; child runs a circle r 2 for 30-60 · child chases the pomeranian (<= 12 s) or pigeons (22 % per decision) · kiosk together (child gets `iceCream`) · pond edge 20 | 0.25-0.5 day | parent tote bag; child at 0.65 scale with ice cream or balloon |
| `elder` | 2.0 | bench 60-120 (50) · feed pigeons from the bench, crumbs every 10 (30) · chess (20): two elders at one `table` 90; else bench | 0.25-0.5 day | cane, flat cap, grey hair |
| `tourist` | 3.0 | viewpoints in order fountain, bandstand if any, north edge: photo 6 each (flash particle) | 0.25 day | camera and sunhat |
| `jogger` | 5.0 | 2-4 laps of the outer loop on gravel; scatters pigeons within 2; never sits; leaves | until the laps end | headband, bright band, shorts |
| `artist` | 3.0 | walk to a viewpoint, place `easel`, paint 0.4 day; leaves with the easel | 0.4 day + travel | floppy hat and palette |
| `busker` | 3.0 | to the bandstand if free, else a loop tile where two gravel runs meet; play 120 (AI) or 90 (summoned): charm +3 within 8; leave | one performance | accordion (a visual only: what he plays is the current motif's melody panned toward him, 05 §5.6 rule 5); notes particles |
| `dogwalker` | 3.0 | loop a path twice; the dog (1 tile behind) scatters pigeons within 3; leave with the dog | two loops | lead drawn as a 1 px line |
| `gardener` | 3.0 | patrol the outer loop · pave a qualifying run at 1.3 s per tile · tidy 6 s at a bed every 120 s · shelter at the kiosk in rain > 0.6 | never leaves | green apron, rake |
| `vendor` | static | stands on the serving tile; serves one eater at a time; a second waits 5 s on an adjacent tile; a third goes elsewhere | while the kiosk exists | white apron and cap |
| `child` | 2.6 | follows the parent on rungs 0-3, then the family list | with the parent | 0.65 scale |
| `cameo` | 3.0 (stranger), 3.0 (flower seller), 3.0 (mime) | scripted by the ability's timeline (section 11) | the ability's duration | stranger: long coat and bouquet; flower seller: straw hat, basket; mime: white face, beret, stripes |

Starting needs at arrival: hunger `rnd(0.2, 0.5)`, energy `rnd(0.5, 0.9)`, comfort 0.7, social `rnd(0.2, 0.6)` (design §4.2.5). `seeks` for singles: f 45, m 45, any 10, with the one re-roll when no compatible single would exist (GV `addVillager` 4488-4504 complementary rule).

---

## 6. Names (`src/entities/names.ts`)

### 6.1 Generated first names (40 per sex; a name in use is not reused while its holder is in the park; children and staff draw from the same lists)
| Sex | Names |
|---|---|
| f | Adèle, Agathe, Alice, Anaïs, Apolline, Aurélie, Béatrice, Camille, Capucine, Céline, Chloé, Clémence, Constance, Delphine, Élise, Élodie, Émilie, Eugénie, Fleur, Gabrielle, Héloïse, Inès, Isabelle, Jeanne, Joséphine, Léa, Louise, Madeleine, Manon, Mathilde, Noémie, Océane, Pauline, Rosalie, Salomé, Sophie, Suzanne, Valentine, Victoire, Zoé |
| m | Adrien, Alexandre, Antoine, Arnaud, Arthur, Augustin, Benoît, Bertrand, Clément, Côme, Damien, Édouard, Émile, Étienne, Fabien, Félix, Florian, Gaspard, Gaston, Grégoire, Guillaume, Hugo, Jean, Jules, Julien, Laurent, Léo, Louis, Marcel, Mathieu, Maxime, Nicolas, Olivier, Pascal, Paul, Pierre, Raphaël, Sébastien, Thibault, Victor |

Rules: names are never translated (the same in EN and ES); the eight regulars' names and the fixed actor names of 6.3 are not in these lists, so a regular can never clash with a passer-by; when both lists for a sex are exhausted (more than 40 of one sex present, impossible under the 30 cap) reuse from the start.

### 6.2 The eight regulars (all `single`, with memory; design §4.5.2)
Personality lines are flavour for writers and for the art portraits; they have no gameplay effect in v1.
| `regularId` | Name | `sex` | `seeks` | `ageWord` | Personality (one line) |
|---|---|---|---|---|---|
| 1 | Amélie | f | m | young | arrives with a book she never opens; feeds the pigeons by the fountain |
| 2 | Juliette | f | m | young | a dancer who strolls the loops on her toes; hates rain |
| 3 | Colette | f | any | grown | reads the paper on the same bench every day; laughs loudest at backfires |
| 4 | Margot | f | m | young | sketches the skyline; forgets the time and misses the kiss window |
| 5 | Théo | m | f | young | a poet with a baguette under his arm; the pomeranian's favourite victim |
| 6 | Lucien | m | f | grown | a waiter on his break; tidy, punctual, flustered by pigeons |
| 7 | Baptiste | m | any | young | a student with an umbrella in every season |
| 8 | Rémi | m | f | grown | a cyclist who sits by the pond and talks to the ducks that are not there |

The lovers' example pair used in every string and test example: **Amélie & Théo** (03 §12 uses them; the Romance chip reads "Amélie & Théo · Chat").

### 6.3 Fixed actor names (shown on the card; never in the generated lists)
| Actor | Name | Notes |
|---|---|---|
| gardener | Gustave | staff, m |
| `a_matchmaker` | Marguerite | the girl with the baguette (ref2) |
| `a_florist` and the `c_bouquet` cameo | Violette | f |
| `a_mime` and the `m_mime` cameo | Pierrot | m |
| `a_pomeranian` | Pompon | creature |
| `a_pigeon` | (the key `avatar.a_pigeon.name`, "Pigeon") | creature; pigeons have no personal names |
| `a_busker` | the AI busker's generated name, or a generated name when spawned | |
| `m_rival` stranger | no name; feed and card use `name.stranger` ("a charming stranger") | |
| vendor | generated | |

---

## 7. Needs (`src/entities/needs.ts`; all 0 to 1; rates per sim day unless stated; GV 5552-5590 idiom)

| id | Rate | Threshold (decide rung) | Target or satisfier | Card bar |
|---|---|---|---|---|
| `hunger` | +0.5/day | eat rung at `> 0.6`; Picnic needs both `< 0.6` | kiosk eat 12 s to 0.1; picnic to 0.1; bench snack -0.4 when no kiosk exists; `c_picnic` and matchmaker bread to 0.1 | **Full** = `1 - hunger`; `--ember` below 0.3 |
| `energy` | -0.6/day awake; +0.4/day sitting on a bench | rest rung at `< 0.25` with a free bench within 15; sit until `>= 0.45` or 90 s | bench | **Rested**; `--ember` below 0.25 |
| `comfort` | eases toward `target` at 0.2/s (GV 5579); -0.3 at once on an embarrassment | shelter rung at rain `> 0.6` and comfort `< 0.3`; leave rung at `< 0.1`; stage start needs `>= 0.35` on both | the target formula below | **Mood**; `--ember` below 0.3 |
| `social` | +0.3/day while a single is not in a `Pair` | stroll weight 70 instead of 35 at `> 0.6` | Chat sets 0; stays 0 while paired; 0.5 when a partner leaves alone | not shown |

Comfort target: `0.7 + 0.15 (lit lamp within 3 at night) - 0.35 * rain - 0.30 * snow - 0.10 * mist - 0.15 (night and no lit lamp within 3) + 0.10 (inside a c_sunbeam) + season term (section 15) + weather term (section 14)`, clamped to [0, 1], using `weatherAt(v)`; `SHELTERED` states ignore rain (design §4.4, §5.3).

---

## 8. Romance stages (`src/entities/romance.ts`; stage name keys `stage.<id>`; feed keys `feed.stage.<id>`)

| Stage | id | Prerequisite ("Needs") | Duration (sim s) | Affinity gate | On screen (04 §9.2) | Interrupted by | Hearts |
|---|---|---|---|---|---|---|---|
| 1 | `notice` | the encounter (section 1.7 `PAIR_ROLL`) | 4 | - | both stop, turn to face over 0.4 s, lean 0.1 rad | nothing | 2 |
| 2 | `chat` | both within 2 tiles, both `CAN_INTERRUPT` | rnd(20, 30) | >= 0.30 | walk to the midpoint +-0.4 tile (GV `court` 4338, 5483-5491); stand 0.8 tile apart; bubbles alternate every 3 s | embarrassment on either; rungs 2-5 on either | 0 |
| 3 | `bench` | a free bench within 8 | rnd(40, 60) sitting | >= 0.45 | walk to the bench; sit side by side; lean 0.08 rad | embarrassment; bench removed; rungs 2-5 | 1 every 10 s |
| 4 | `stroll` | a loop of >= 12 connected gravel or flagstone tiles within 10 | 60 | >= 0.55 | walk the loop as one unit at 2.4, lower id leading, 0.5 tile apart; hands line at `h >= 12` | embarrassment; `m_mime` wall; `m_fog`; `m_rival`; rungs 2-5 | 0 |
| 5 | `picnic` | picnic spot within 10; `weatherAt` rain < 0.3; both hunger < 0.6 | rnd(50, 80) | >= 0.65 | sit on the blanket or at the table; eat (hunger to 0.1) | `m_wasp`; rain rising above 0.3; embarrassment; rungs 2-3 | 1 every 8 s |
| 6 | `kiss` | phase `golden` or `evening`, OR within 3 of a fountain, OR within 3 of a lit lamp; rain < 0.3 unless `c_umbrella` | 10 | >= 0.80 | face; lean in 0.25 rad over 1 s; hold 1 s; lean back | embarrassment on either (missed; retry 60) | 6 |
| 7 | `proposal` | at a romantic spot (section 4); same day as formation only if affinity >= 0.95, else a later visit (regulars) | 15 | >= 0.90 | initiator kneels at 0 s; ring sparkle at 8 s; the other claps hands to face at 12 s; embrace at 15 s | embarrassment on either: abandoned, back to stage 6, retry 60 | 12 at Happily, then fireworks |

Rules (design §6.2): stages in order; +0.08 affinity per completed stage; a held gate with a missing prerequisite, or an unmet gate, makes the pair **linger** (repeat the current activity; charm keeps converting); an interrupted stage gives nothing and sets `retryT` 30 (60 for `kiss`, `proposal`); the lower id initiates. Endings: **Parted** (`huff` 6 s, different gates, heartbreak particle, MP +5) and **Happily** (fireworks 10 s, leave together, `alumni`, CP +5). Featured = highest stage, tie earliest `formedDay` then lowest id, or the pinned pair. Stage 1 has no `feed.stage.notice`: its feed line is `feed.pair.formed` at formation; stages 2 to 7 log `feed.stage.<id>` on completion. A couple archetype arrives as a `Pair` at stage 3 with Bench counted as completed and affinity rnd(0.55, 0.70), so its first attempt is `stroll` and it logs no `feed.pair.formed` (register 3.4, design §6.1); an alumni couple returns at stage 3 with affinity 0.70, and a second Happily logs `feed.romance.renewed` in place of `feed.happily` (design §6.5).

---

## 9. Charm sources (`src/world/charm.ts`; `charmAt(x, y, pairId?)` returns `{ total, player }`, both capped at 6; each source counts once per tile)

| id | Charm | Where | Kind | Counts as `player` when | Source |
|---|---|---|---|---|---|
| `bed` | +1 | within Chebyshev 3 of a bed tile | static (mask bit 1) | the bed was painted by the player | register 3.5 |
| `fountain` | +2 | within 5 | static (bit 2) | `placedBy == 'player'` | register 3.5 |
| `lamp` | +1 | within 3, lamps lit | static, rebuilt when lamps flip | `placedBy == 'player'` or `c_lamplight` active on it | register 3.5 |
| `busker` | +3 | within 8 of a busker in `st == 'play'` | dynamic | summoned by `c_musician` or is `a_busker` | register 3.5 |
| `petals` | +2 | `PETALS > 0.2` on the tile | dynamic | always | register 3.5 |
| `sunbeam` | +1 | inside a `c_sunbeam` override | dynamic | always | register 3.5 |
| `river` | +1 | `y <= 5` | static (bit 8) | never | register 3.5 |
| `bandstand` | +2 | within 4 | static (bit 4) | `placedBy == 'player'` | register 3.5 |
| `umbrella` | +2 | the pair under `c_umbrella` while rain > 0.3 | pair bonus | always | register 3.8 |
| `boat` | +4 | the pair in the rowboat | pair bonus | always | register 3.8 |
| `fireworks` | +4 | every pair for 30 s | pair bonus | always | register 3.8 |

Static sources rebuild on a prop epoch (`markCharmDirty`); dynamic and pair sources are read at query time (03 §6.7). Done when: one player bed plus one gen fountain within both radii reads `{ total: 3, player: 1 }`.

---

## 10. Embarrassments (`src/entities/embarrass.ts` exports exactly these ten kinds; reaction state ids are `act.ts` states and `doing.<state>` keys)

| id | Trigger ability | Trigger avatar | Base cost | Cost at stage 1-2 / 3-4 / 5-7 | Comfort | Reaction state, length | Cue id | Feed key | Backfire key | Backfire scene (15 %) |
|---|---|---|---|---|---|---|---|---|---|---|
| `poop` | `m_pigeon` | `a_pigeon` swoop | 0.08 | 0.08 / 0.10 / 0.12 | -0.3 | `wipe` 4 s | `splat` | `feed.emb.poop` | `feed.emb.backfire.poop` | partner wipes it off, both `laugh` 4 s |
| `soaked` | `m_sprinkler` | - | 0.07 | 0.07 / 0.0875 / 0.105 | -0.3 | `shake` 3 s | `sprinkler` | `feed.emb.soaked` | `feed.emb.backfire.soaked` | they dance in the spray 4 s |
| `trip` | `m_peel` | - | 0.06 | 0.06 / 0.075 / 0.09 | -0.3 | `stumble` 3 s | `slip` | `feed.emb.trip` | `feed.emb.backfire.trip` | partner catches them 4 s |
| `snatched` | `m_pomeranian` | `a_pomeranian` snatch | 0.08 | 0.08 / 0.10 / 0.12 | -0.3 | `chase` 8 s at 4.0, then `huff` 3 s | `snatch` (and `yap` from the dog) | `feed.emb.snatched` | `feed.emb.backfire.snatched` | both chase laughing 8 s; item returned |
| `wasp` | `m_wasp` | - | 0.09 | 0.09 / 0.1125 / 0.135 | -0.3 | `flap` 6 s (flee 3 tiles) | `wasp` | `feed.emb.wasp` | `feed.emb.backfire.wasp` | they shoo it off 4 s; picnic continues |
| `drenched` | `m_raincloud` | - | 0.07 | 0.07 / 0.0875 / 0.105 | -0.3 | `huddle` 5 s | `plip` x 6 | `feed.emb.drenched` | `feed.emb.backfire.drenched` | share a newspaper 5 s; counts as umbrella charm for 30 s |
| `rival` | `m_rival` | - | 0.10 | 0.10 / 0.125 / 0.15 | -0.3 | `distracted` 30 s | `rival_hmm` | `feed.emb.rival` | `feed.emb.backfire.rival` | the stranger is laughed off at once |
| `mime` | `m_mime` | `a_mime` wall or mimic | 0.06 | 0.06 / 0.075 / 0.09 | -0.3 | `baffled` 4 s, then reroute | `mime` | `feed.emb.mime` | `feed.emb.backfire.mime` | they applaud the mime 4 s |
| `fog` | `m_fog` | - | 0.06 | 0.06 / 0.075 / 0.09 | -0.3 | `lost` up to 60 s | `foghorn` | `feed.emb.fog` | `feed.emb.backfire.fog` | they bump into each other, `laugh` 4 s |
| `flock` | `m_flock` | - | 0.09 | 0.09 / 0.1125 / 0.135 | -0.3 | `duck` 5 s; hat flies 2 tiles | `flutter` x 4 | `feed.emb.flock` | `feed.emb.backfire.flock` | they duck together laughing 5 s |

Rules (design §6.4): cost = base x stage factor, capped at 0.15; applied once per event to the pair's one affinity number; backfire is rolled on the sim RNG only when the victim is in a `Pair` and the partner is within 4 tiles, and then plays the `laugh` scene instead, affinity +0.04, no comfort loss, no MP, no `embToday`; the 4th attempt on a person in a day fails with `reason.enough_today` before anything is spent; children fail with `reason.not_children`; staff can be targets but score 0 (a couple is a `Pair` and scores like any pair); `rival` lands only on a `Pair` member; reaction states are `BUSY` and `NO_SPACE`; MP +1 only when the victim is in a `Pair`; every landing also emits `gasp` on the victim; a backfire emits `laugh` on both and no `gasp` (05 §3.3 items 4 and 5). Do not add an eleventh kind.

---

## 11. Abilities (`src/play/abilities.ts`; name and hint keys `ability.<id>.name`, `ability.<id>.hint`; feed key on cast `feed.cast.<id>`; cooldown and charges are per side; cooldowns in sim seconds; charges reset at `f = 0`)

### 11.1 Registry
The Cue column: every id emits `place` at its target on a cast that passes validation (05 §3.2 row 37), plus the effect's own cue where 05 names one (05 §3.3 item 7); no model adds a cue for an ability.
| id | Side | Tier | Cooldown | Charges | Target type | Area | Duration | Cue |
|---|---|---|---|---|---|---|---|---|
| `c_petals` | cupid | T0 | 30 | - | `area` | 3 x 3 | 20 s charm, then `PETALS` fades | `place`; `petals` |
| `c_bouquet` | cupid | T0 | 60 | - | `pair` | the pair | about 7 s cameo | `place`; `bouquet` |
| `c_musician` | cupid | T1 | 120 | - | `tile` | radius 8 | 90 s playing | `place`; the music itself (busker rule, 05 §5.6) |
| `c_sunbeam` | cupid | T1 | 90 | - | `area` | 7 x 7 (override r 3) | 60 s | `place`; `sunbeam` |
| `c_umbrella` | cupid | T2 | 90 | - | `pair` | the pair | while rain > 0.3, max 120 s | `place` only |
| `c_lamplight` | cupid | T2 | 60 | - | `tile` | lamps within 6 | 60 s | `place`; `lamp_hum` |
| `c_picnic` | cupid | T3 | 180 | - | `tile` (north-west of 2 x 2) | 2 x 2 lawn | basket 300 s | `place` only |
| `c_rowboat` | cupid | T3 | 240 | - | `tile` (pond) | pond of >= 12 tiles | 60 s ride (+ about 5 s boarding) | `place`; `fountain` x 0.5 at the boat |
| `c_fireworks` | cupid | T4 | 360 | 1 | `park` | every pair | 30 s | `place`; `fireworks` |
| `m_pigeon` | mischief | T0 | 25 | - | `visitor` | one person | flight at 6.0, then `wipe` 4 s | `place`; `flutter`, `splat` |
| `m_sprinkler` | mischief | T0 | 45 | - | `tile` (lawn) | 3 x 3 | 10 s | `place`; `sprinkler` |
| `m_peel` | mischief | T1 | 40 | - | `tile` (gravel or flagstone) | one tile | peel lives 120 s | `place`; `slip` |
| `m_pomeranian` | mischief | T1 | 60 | - | `visitor` | one person | run, 8 s chase, 60 s wait outside | `place`; `yap`, `snatch` |
| `m_wasp` | mischief | T2 | 60 | - | `pair` at Picnic, or `tile` with a table in use | the table | `wasp` lands at t+2 | `place`; `wasp` |
| `m_raincloud` | mischief | T2 | 90 | - | `area` | 5 x 5 (override r 2) | 30 s | `place`; `plip` |
| `m_rival` | mischief | T3 | 150 | - | `pair` | one member | 30 s | `place`; `rival_hmm` |
| `m_mime` | mischief | T3 | 120 | - | `tile` (gravel or flagstone) or `pair` | one tile, or the pair | wall 20 s; mimic 30 s | `place`; `mime` |
| `m_fog` | mischief | T4 | 240 | - | `park` | whole park (override r 99) | 60 s | `place`; `foghorn` |
| `m_flock` | mischief | T4 | 180 | 1 | `area` | 7 x 7 | 8 s storm; `duck` 5 s | `place`; `flutter`, `gasp` |

### 11.2 Effect numbers and failure keys
| id | Effect numbers | Fails when (reason key) |
|---|---|---|
| `c_petals` | `PETALS = 1` on 9 tiles; charm +2 per tile for 20 s; 24 petal particles; under snow still counts | centre tile is water: `reason.on_water` |
| `c_bouquet` | Violette appears 3 tiles from the pair, walks at 3.0 to the member nearer the tap, hands a bouquet at t 2-4: affinity +0.05, 2 hearts; leaves 3 tiles and vanishes at t+3 | no pair: `reason.not_courting`; a member in a reaction state: `reason.busy`; pair apart > 4: `reason.apart` |
| `c_musician` | busker spawns at the nearest gate (6 tiles from the tile if the gate is > 20 away), walks, plays 90 s: charm +3 within 8; rain > 0.6 moves it under the nearest shelter within 6 | tile blocked or water: `reason.not_here`; an AI busker playing within 8: `reason.busker_near` |
| `c_sunbeam` | override r 3, 60 s: rain 0, cloud 0.1, light +0.15; comfort target +0.10; charm +1; cancels `m_raincloud` inside; `WET` dries x 2 under snow | never fails |
| `c_umbrella` | umbrella drawn over the pair while rain > 0.3, max 120 s; rain counts as charm +2; Kiss and Proposal allowed in rain; `m_raincloud` cannot land `drenched` | no pair: `reason.not_courting`; rain <= 0.3 at the pair: `reason.not_raining` |
| `c_lamplight` | every lamp within 6 lit 60 s whatever the hour, halo x 1.4; counts as lit for charm and the Kiss prerequisite | no lamp within 6: `reason.no_lamp` |
| `c_picnic` | `picnic` prop 2 x 2, passable, `untilTick` = +300 s; both members of the nearest pair within 10 get hunger 0.1; stage 5 may start here | not 4 lawn tiles: `reason.lawn_only`; rain > 0.3: `reason.raining` |
| `c_rowboat` | boat on the tile; nearest pair within 10 at stage >= 3 walks to the edge, boards at about t 5, rows 60 s: charm +4, counts as together; embarrassments on them fail `reason.on_the_water`; lands; boat vanishes | pond < 12 connected tiles: `reason.pond_small`; `ICE = 1`: `reason.iced`; no eligible pair within 10: `reason.not_courting` |
| `c_fireworks` | 30 s of fireworks over the fountain (or park centre): 1 shell per 0.8 s; every pair charm +4 for 30 s; all visitors `watch` 10 s; rain > 0.6 halves particles | phase not `dusk` or `evening`: `reason.not_evening`; no charge: `reason.no_charges` |
| `m_pigeon` | nearest pigeon (or a new one from the north edge) flies at 6.0; on arrival `poop` lands, or pecks the picnic (same kind, stage 5 interrupted); fog adds 2 s | child: `reason.not_children`; on the rowboat: `reason.on_the_water`; `embToday >= 3`: `reason.enough_today` |
| `m_sprinkler` | `sprinkler` prop pops up; t 0-10 soaks the 3 x 3: `soaked` once per person entering or standing; `WET = 1` on 9 tiles; sinks at t 10 | tile not lawn: `reason.lawn_only` |
| `m_peel` | `peel` prop, passable, 120 s; the first adult non-staff walker entering the tile gets `trip`; the peel vanishes | tile not gravel or flagstone: `reason.not_here`; a peel already there: `reason.peel_here`; snow or ice: `reason.slippery` |
| `m_pomeranian` | Pompon enters by the nearest gate (or from where it is), runs at 4.5; `snatched` takes the first item in order hat, purse, baguette, iceCream; runs to the nearest gate; victim chases 8 s at 4.0; item dropped at the gate, picked up, `huff` 3 s; Pompon waits outside 60 s | no item: `reason.no_item`; child: `reason.not_children`; a walker's dog within 3: `reason.dog_saw_it` |
| `m_wasp` | wasp particle circles the table; at t 2 `wasp` on both members (one cost); stage 5 cancelled; they flee 3 tiles | pair not at stage 5 or nobody at the table: `reason.not_at_picnic`; rain > 0.3: `reason.no_wasps_rain` |
| `m_raincloud` | cloud drawn; override r 2, 30 s, rain 0.9; everyone inside not under `c_umbrella` or on a shelter tile gets `drenched` once; `WET` rises; global weather unchanged | inside a `c_sunbeam` square: `reason.in_sunbeam` |
| `m_rival` | stranger enters by the nearest gate, walks to the member nearer the tap; `distracted` 30 s; at t+15 a 50 % roll: the partner steps in, the stranger leaves, no cost; else at t+30 affinity -0.10 (table cost) and the stranger leaves; interrupts Stroll | no pair: `reason.not_courting`; pair apart: `reason.apart` |
| `m_mime` | Pierrot enters by the nearest gate, walks to the tile; wall 20 s: the tile is blocked, pairs within 2 get `mime` and reroute; on a pair: follows 30 s mimicking, `mime` once at t 0 | tile blocked already: `reason.taken` |
| `m_fog` | override whole park 60 s, mist 0.9; every pair at Stroll gets `fog` (each wanders until within 2 tiles again or 60 s); pigeons perch; line of sight 2 tiles | mist already >= 0.6: `reason.already_misty` |
| `m_flock` | 20 visual pigeons for 8 s; every adult inside (not staff, not children) gets `flock`; hats fly 2 tiles; all pairs inside interrupted | nobody inside: `reason.nobody_inside`; no charge: `reason.no_charges` |

Common rules (design §9.1): arm by tapping the chip, the next world tap targets, tap again to disarm; `park` targets fire on arming; every use is a `Command { side, kind: 'ability', payload: { id, target } }`; a failed validation spends nothing and toasts `t(reason)`; a child under the tap always fails `reason.not_children`; Cupid casts set `pair.lastCupidAt` for pairs within 6 tiles of the target or targeted directly; locked: `reason.locked`; cooling: `reason.cooldown`.

---

## 12. Avatars (`src/play/avatar.ts`; name key `avatar.<id>.name`, hint keys `avatar.<id>.hint1` to `.hint3`; status keys `avatar.status.<status>`)

| id | Side | Tier | Actor | Speed | Can fly | Spawn when absent | `PLAYER_HOLD` states | Tap cascade (summary; full tables in design §10.4-10.9) | Cooldown | Earns |
|---|---|---|---|---|---|---|---|---|---|---|
| `a_pigeon` | mischief | T0 | an existing pigeon | fly 6.0, walk 1.2 | yes | a pigeon from the north edge | `swoop, poop, startled` | person 34 px: `swoop` (`poop` on arrival; peck the picnic at stage 5) · crumbs: `peck` 4 s · lamp, bench, fountain, bandstand, tree: `perch` · water tile: `drink` 3 s · tile: fly | 25 s `ruffled` between swoops | MP as `m_pigeon` |
| `a_pomeranian` | mischief | T1 | Pompon | 4.5 | no | enters by the nearest gate | `snatch, carry, shakeOff` | person with an item: `snatch` as `m_pomeranian` · pigeons or crumbs: `chase` (scatter within 3) · child: `play` 8 s · water tile: `paddle` 4 s then `shakeOff` · lawn tile: `dig` 3 s · tile: run | 60 s `panting` | MP as `m_pomeranian` |
| `a_mime` | mischief | T3 | Pierrot | 3.0 | no | enters by the nearest gate | `wall, mimicStart` | paired person or couple: `mimic` 30 s (`mime` once) · bench: `statue` until the next tap · gravel or flagstone tile: `wall` 20 s · tile: walk | 120 s `resting` between landed `mime` | MP as `m_mime` |
| `a_florist` | cupid | T1 | Violette, basket of 3 | 3.0 | no | enters by `g_south_w` | `hand, pick, scatter` | paired person: `hand` a bouquet (basket -1, affinity +0.05) · bed tile: `pick` 4 s (basket = 3) · bench: sit · lawn tile: `scatter` 2 s (petals 3 x 3 as `c_petals`) · tile: walk | bouquet 60 s; petals 30 s | Cupid action as `c_bouquet`, `c_petals` |
| `a_busker` | cupid | T2 | the AI busker if present, else new | 3.0 | no | enters by the nearest gate | `setUp, pack` | paired person: `serenade` 30 s following (charm +3 within 8) · bandstand: `setUp` 3 s then `play` · any walkable tile: `setUp` 3 s then `play` until the next tap | none; `pack` 2 s + `setUp` 3 s to move | Cupid action as `c_musician` |
| `a_matchmaker` | cupid | T3 | Marguerite | 3.0 | no | enters by `g_north` | `lead, encourage, buy` | unpaired single: `lead` to the nearest compatible single within 12 (<= 20 s); pair forms without the roll · paired person: `encourage` 3 s (`retryT = 0`) · kiosk: `buy` 4 s (shares = 3) · pair at Picnic: share bread (hunger 0.1, shares -1) · bench: sit · tile: walk | introduce 45 s; encourage 30 s | Cupid action on the pair |

Refusal keys used by cascades: `reason.not_children`, `reason.enough_today`, `reason.startled` (pigeon with a dog within 2, 2 s), `reason.big_dog` (pomeranian with a walker's dog within 3), `reason.basket_empty`, `reason.not_courting`, `reason.nobody_for_them`, `reason.had_to_go`, `reason.busy`. Entering: `setMode('avatar', id)` zooms to 1.5 if below 1.3, toasts `avatar.<id>.hint1` for 6 s (GV 11257-11259); leaving returns the actor to AI and toasts `avatar.goes_on`. An avatar is never a `Pair` member and can be a victim (design §10.10).

---

## 13. Tiers and unlocks (`src/play/progression.ts`; both ladders share the thresholds)

| Tier | Points | Cupid abilities | Cupid avatar | Mischief abilities | Mischief avatar |
|---|---|---|---|---|---|
| T0 | 0 | `c_petals`, `c_bouquet` | - | `m_pigeon`, `m_sprinkler` | `a_pigeon` |
| T1 | 8 | `c_musician`, `c_sunbeam` | `a_florist` | `m_peel`, `m_pomeranian` | `a_pomeranian` |
| T2 | 20 | `c_umbrella`, `c_lamplight` | `a_busker` | `m_wasp`, `m_raincloud` | - |
| T3 | 40 | `c_picnic`, `c_rowboat` | `a_matchmaker` | `m_rival`, `m_mime` | `a_mime` |
| T4 | 70 | `c_fireworks` | - | `m_fog`, `m_flock` | - |

Rules: a tier is reached when the ladder's cumulative points >= threshold; points and tiers persist in `parque:profile-v1` across parks; each unlocked id toasts `toast.unlocked` once (the profile's `unlocked` list) and logs `feed.unlock`; locked pills show the tier badge and toast `rail.locked_at` on tap; the per-park tally shows at each new day as `feed.tally`.

---

## 14. Weather (`src/core/weather.ts`; kind ids are the `weather.<id>` keys; targets eased with a 2.6 s half-life as GV 846-881; picked on the sim RNG as GV 852-853: two draws, the kind then the duration; `debug.weather` sets a kind for its mean duration with no draw, 03 §5.1)

### 14.1 Kinds and targets
| id | cloud | rain | mist | wind | snow | Duration (sim s) | Arrivals x | Comfort term | Effect on charm and stages | Dot colour |
|---|---|---|---|---|---|---|---|---|---|---|
| `clear` | 0.10 | 0 | 0 | 0.18 | 0 | 60-160 | 1.0 | +0.05 | none | `#F3D9A8` |
| `fair` | 0.34 | 0 | 0.04 | 0.30 | 0 | 60-160 | 1.0 | 0 | none | `#DCE9F2` |
| `cloudy` | 0.74 | 0 | 0.10 | 0.42 | 0 | 60-160 | 0.9 | -0.05 | none | `#C8CCDA` |
| `breeze` | 0.28 | 0 | 0.02 | 0.86 | 0 | 60-160 | 0.9 | 0 | petals drift 1 tile downwind (visual); hats wobble | `#CDE3D8` |
| `rain` | 0.92 | 0.80 | 0.22 | 0.50 | 0 | 60-160 | 0.5 | via the formula (-0.35 x rain) | Picnic blocked; Kiss and Proposal blocked unless `c_umbrella`; shelter rung active; `WET` rises; umbrella charm +2 | `#9FBCD4` |
| `shower` | 0.70 | 0.50 | 0.10 | 0.40 | 0 | 30-60 | 0.7 | via the formula | Picnic blocked while rain > 0.3 | `#B7CCDE` |
| `mist` | 0.50 | 0 | 0.78 | 0.10 | 0 | 60-160 | 0.8 | via the formula (-0.10 x mist) | pair-formation line of sight 2 tiles; strolling pairs keep within 1 tile | `#DDE2E8` |
| `snow` | 0.86 | 0 | 0.30 | 0.36 | 0.80 | 60-160 | 0.6 | -0.30 (plus the formula's snow term) | Picnic blocked; pond `ICE = 1` after 60 s of snow, 0 after 120 s without; a bridge over ice is a romantic spot; rowboat refused | `#EFF4FA` |

The comfort term column is the "weather term" of the formula in section 7 (design §3.3); the formula's own `rain`, `snow` and `mist` multipliers apply in addition. New park: `fair`, first change at 40 s (GV 845); the same kind may repeat; `snow` is winter only.

### 14.2 Per-season weights (percent; copied exactly from design §3.3)
| Season | `clear` | `fair` | `cloudy` | `breeze` | `rain` | `shower` | `mist` | `snow` |
|---|---|---|---|---|---|---|---|---|
| `spring` | 15 | 25 | 15 | 15 | 10 | 15 | 5 | 0 |
| `summer` | 35 | 30 | 10 | 10 | 3 | 10 | 2 | 0 |
| `autumn` | 10 | 20 | 25 | 20 | 12 | 8 | 5 | 0 |
| `winter` | 15 | 15 | 25 | 10 | 5 | 0 | 10 | 20 |

### 14.3 Castable overrides (`weatherAt(x, y)`; `{ kind, x, y, r, until, targets }`; cap 16)
| id | From | Half-width `r` | Duration | Targets | Notes |
|---|---|---|---|---|---|
| `sunbeam` | `c_sunbeam` | 3 (7 x 7) | 60 s | rain 0, cloud 0.1, light +0.15 | comfort target +0.10 inside; cancels a `raincloud` inside |
| `raincloud` | `m_raincloud` | 2 (5 x 5) | 30 s | rain 0.9 | refused inside a `sunbeam` |
| `fog` | `m_fog` | 99 (whole park) | 60 s | mist 0.9 | refused when global mist >= 0.6 |

Arrivals use the global weather only; the HUD dot shows the global kind. Easing constants (GV 868-880): `rs = 1 - 0.5^(dt / 2.6)` for cloud, rain, mist, snow; wind `rw = 1 - 0.06^dt`, `windP += dt * 0.21`, gust `0.55 + 0.45 * sin(windP * 0.7) * sin(windP * 0.23 + 1.3)`; `drift += wind * dt * 22`; `wet` chases rain with half-lives 4 s up and 150 s down.

---

## 15. Seasons (`src/core/clock.ts`, `src/render/ambient.ts`, `src/render/flora.ts`; ids are the `hud.season.<id>` keys)

| id | Days | Lawn tint (04 §10.3) | Tree state (04 §6.3) | Beds | Arrivals x | Comfort term | Other |
|---|---|---|---|---|---|---|---|
| `spring` | 1-3 | `mix(lawn, foliageSpring, 0.20)` | bud f 0 to 0.9 of day 1, blossom from 0.9 to 2.0 days elapsed (days 1 to 2), leafing day 3; chestnut candles in blossom | full | 1.0 | 0 | petal particles under blossoming trees (visual only, no charm) |
| `summer` | 4-6 | `lawn x [0.94, 1.0, 0.90]` | full `foliageSummer` | full | 1.1 | -0.05 at `midday` | couple picnic weight x 1.5; midday haze `FOGA + 0.03` |
| `autumn` | 7-9 | `mix(lawn, #C9CB8E, 0.28)` | crowns to `foliageAutumn` by species from day 7 (0 %) to day 8 (100 %), thinning to day 9; leaf particles 0.3/s per tree, x 3 in breeze, 30 % teal `#86BBB3` | 50 % dots | 1.0 | 0 | `c_umbrella` scenes most likely (rain 12 %) |
| `winter` | 10-12 | `mix(lawn, #C6CCC4, 0.35)` then snow cover to `#EEF2F6` | bare; twigs; plane seed balls | earth only | 0.7 | -0.15 | snow possible; pond `ICE`; rowboat refused on ice; kiosk steam; hedges dusted |

Season changes log `feed.season.<id>` from day 2 on (GV 818 pattern). Special days: none in v1 (design §3.4 defines no festival or holiday; see section 18). Gravel and flagstone take snow cover at x 0.7.

---

## 16. Strings (`src/ui/strings/en.ts`, `es.ts`; identical key sets; `t(key, params)`; `{name}` placeholders; a param starting with `@` is itself a key; `plural` picks `.one` / `.other`; `gender` picks `.f` / `.m`)

Conventions (03 §12): keys are lowercase, dot-separated, `area.item[.detail]`. Names of people, French flavour words and the game title are the same in both languages. Nothing in `src/` outside `strings/` may contain a sentence a player can see. Every key below exists in both tables; the ES column is TODO for the translation task (brief §11 item 9 leaves the ES wording of Be someone, Creator, Cupid, Mischief, Happily and Parted to that task). Any `{stage}` or `{phase}` param is passed as a key (`stage: "@stage.bench"`, `phase: "@hud.phase.golden"`) so a stored line re-renders after a language switch (03 §12 item 6); this applies to `hud.romance.pair`, `card.rel.courting`, `card.pair.stage`, `stage.of` and `sheet.events.when`.

### 16.1 Intro
| Key | EN | ES |
|---|---|---|
| `intro.title` | Parque D'Amour | TODO |
| `intro.p1` | A small square of Paris: a fountain, a pond, benches under the trees, and the river beyond the railings. | TODO |
| `intro.p2` | Visitors wander in through the gates. Some of them notice each other. | TODO |
| `intro.p3` | Play Cupid and help a romance along, or play Mischief with a pigeon, a banana peel and a very small dog. | TODO |
| `intro.p4` | Tap the ground to shape the park. Tap "Be someone" to become a pigeon, a pomeranian, a mime, a flower seller, a busker or the girl with the baguette. | TODO |
| `intro.begin` | Begin | TODO |
| `intro.continue` | Continue | TODO |
| `intro.lang_en` | EN | EN |
| `intro.lang_es` | ES | ES |

### 16.2 Rail (row 1 switch, row 2 contextual, row 3)
| Key | EN | ES |
|---|---|---|
| `rail.park` | Park | TODO |
| `rail.cupid` | Cupid | TODO |
| `rail.mischief` | Mischief | TODO |
| `rail.size` | Size | TODO |
| `rail.undo` | Undo | TODO |
| `rail.place` | Place | TODO |
| `rail.cancel` | Cancel | TODO |
| `rail.pause` | Pause | TODO |
| `rail.play` | Play | TODO |
| `rail.speed` | {n}x | {n}x |
| `rail.rotate_left` | Turn | TODO |
| `rail.rotate_right` | Turn | TODO |
| `rail.fit` | Fit | TODO |
| `rail.sound_on` | Sound | TODO |
| `rail.sound_off` | Muted | TODO |
| `rail.be_someone` | Be someone | TODO |
| `rail.creator` | Creator | TODO |
| `rail.photo` | Photo | TODO |
| `rail.new` | New | TODO |
| `rail.options` | Options | TODO |
| `rail.locked_at` | Unlocks at {side} T{tier} | Se abre en {side} T{tier} |
| `rail.tier` | T{tier} | T{tier} |
| `rail.cooldown` | {s} s | {s} s |
| `rail.charges` | {left}/{max} | {left}/{max} |
| `rail.ready` | Ready | Listo |
| `rail.soon` | Coming soon | Muy pronto |
| `rail.pick` | Pick an ability | Elige una habilidad |

### 16.3 HUD chips
| Key | EN | ES |
|---|---|---|
| `hud.phase.night` | Night | TODO |
| `hud.phase.dawn` | Dawn | TODO |
| `hud.phase.morning` | Morning | TODO |
| `hud.phase.midday` | Midday | TODO |
| `hud.phase.afternoon` | Afternoon | TODO |
| `hud.phase.golden` | Golden hour | TODO |
| `hud.phase.dusk` | Dusk | TODO |
| `hud.phase.evening` | Evening | TODO |
| `hud.day` | Day {n} · {season} | Día {n} · {season} |
| `hud.season.spring` | Spring | TODO |
| `hud.season.summer` | Summer | TODO |
| `hud.season.autumn` | Autumn | TODO |
| `hud.season.winter` | Winter | TODO |
| `hud.visitors` | {n} visitors | {n} visitantes |
| `hud.visitors.one` | {n} visitor | {n} visitante |
| `hud.visitors.other` | {n} visitors | {n} visitantes |
| `hud.romance.pair` | {a} & {b} · {stage} | {a} & {b} · {stage} |
| `hud.romance.none` | No one courting yet | TODO |
| `hud.cupid` | Cupid | TODO |
| `hud.mischief` | Mischief | TODO |
| `hud.title` | Parque D'Amour | Parque D'Amour |

The Points chip is `t('hud.cupid')` `#tCP` · `t('hud.mischief')` `#tMP`; the numbers are written to the two `<b>` elements of 03 §10.1, never through a string.

The clock chip's day is `t('hud.day', { n, season: '@hud.season.<season>' })`: the season param is itself a key, so the chip reads "Day 3 · Autumn". The Visitors chip's count is `plural('hud.visitors', n)` of the people in the park (cameos excluded, 03 §3.11), which picks `hud.visitors.one` for 1 and `hud.visitors.other` otherwise ("1 visitor", "12 visitors"); the bare `hud.visitors` is the Visitors chip of the style board's HUD sample (`style-board.html`, 04 §4.2 tile 13).

### 16.4 Sides, stages, archetypes, ages, weather, endings
| Key | EN | ES |
|---|---|---|
| `side.park` | Park | TODO |
| `side.cupid` | Cupid | TODO |
| `side.mischief` | Mischief | TODO |
| `stage.notice` | Notice | TODO |
| `stage.chat` | Chat | TODO |
| `stage.bench` | Bench | TODO |
| `stage.stroll` | Stroll | TODO |
| `stage.picnic` | Picnic | TODO |
| `stage.kiss` | Kiss | TODO |
| `stage.proposal` | Proposal | TODO |
| `stage.of` | {stage} · {n} of 7 | TODO |
| `ending.happily` | Happily | TODO |
| `ending.parted` | Parted | TODO |
| `archetype.single` | single | TODO |
| `archetype.couple` | couple | TODO |
| `archetype.family` | family | TODO |
| `archetype.child` | child | TODO |
| `archetype.elder` | elder | TODO |
| `archetype.tourist` | tourist | TODO |
| `archetype.jogger` | jogger | TODO |
| `archetype.artist` | artist | TODO |
| `archetype.busker` | busker | TODO |
| `archetype.dogwalker` | dog walker | TODO |
| `archetype.gardener` | gardener | TODO |
| `archetype.vendor` | vendor | TODO |
| `archetype.cameo` | visitor | TODO |
| `age.young` | young | TODO |
| `age.grown` | grown | TODO |
| `age.elder` | elder | TODO |
| `weather.clear` | Clear | TODO |
| `weather.fair` | Fair | TODO |
| `weather.cloudy` | Cloudy | TODO |
| `weather.breeze` | Breezy | TODO |
| `weather.rain` | Rain | TODO |
| `weather.shower` | Shower | TODO |
| `weather.mist` | Mist | TODO |
| `weather.snow` | Snow | TODO |

### 16.5 Park tools (label on the pill, hint in the ghost bar or toast on select)
| Key | EN | ES |
|---|---|---|
| `tool.hand.label` | Hand | TODO |
| `tool.hand.hint` | Tap a visitor to follow them. Drag to pan. | TODO |
| `tool.path.label` | Path | TODO |
| `tool.path.hint` | Paint gravel paths. Visitors prefer them. | TODO |
| `tool.lawn.label` | Lawn | TODO |
| `tool.lawn.hint` | Paint grass back. Picnics happen here. | TODO |
| `tool.bed.label` | Flowers | TODO |
| `tool.bed.hint` | A flowerbed. Tap again to change the colour. | TODO |
| `tool.hedge.label` | Hedge | TODO |
| `tool.hedge.hint` | Tap along a line. Up to 14 pieces. | TODO |
| `tool.tree.label` | Tree | TODO |
| `tool.tree.hint` | Plane, chestnut, lime. Tap a tree to remove it. | TODO |
| `tool.pond.label` | Pond | TODO |
| `tool.pond.hint` | Paint water. A big pond takes a rowboat. | TODO |
| `tool.canal.label` | Canal | TODO |
| `tool.canal.hint` | Tap along a line of water. | TODO |
| `tool.bridge.label` | Bridge | TODO |
| `tool.bridge.hint` | Tap the water. Spans up to 4 tiles. | TODO |
| `tool.bench.label` | Bench | TODO |
| `tool.bench.hint` | Two seats. Tap again to turn it. | TODO |
| `tool.picnic.label` | Picnic | TODO |
| `tool.picnic.hint` | A blanket on the lawn, 2 by 2. | TODO |
| `tool.lamp.label` | Lamp | TODO |
| `tool.lamp.hint` | Lit from dusk to dawn. Lovers like the light. | TODO |
| `tool.fountain.label` | Fountain | TODO |
| `tool.fountain.hint` | 2 by 2. A romantic spot. | TODO |
| `tool.kiosk.label` | Kiosk | TODO |
| `tool.kiosk.hint` | 2 by 2. Sells baguettes and ice cream. Three at most. | TODO |
| `tool.bandstand.label` | Bandstand | TODO |
| `tool.bandstand.hint` | 3 by 3. One per park. Buskers love it. | TODO |
| `tool.remove.label` | Remove | TODO |
| `tool.remove.hint` | Tap a bench, lamp, tree or hedge to take it away. | TODO |

### 16.6 Abilities (name on the pill and cooldown chip; hint toasted on arming)
| Key | EN | ES |
|---|---|---|
| `ability.c_petals.name` | Petals | Pétalos |
| `ability.c_petals.hint` | Tap the ground: a petal shower for 20 seconds. | Pulsa el suelo: una lluvia de pétalos durante 20 segundos. |
| `ability.c_bouquet.name` | Bouquet | Ramo |
| `ability.c_bouquet.hint` | Tap a courting visitor: a flower seller brings a bouquet. | Pulsa a alguien que corteja: una florista le trae un ramo. |
| `ability.c_musician.name` | Musician | Músico |
| `ability.c_musician.hint` | Tap a spot: a busker plays there for 90 seconds. | Pulsa un sitio: un músico toca allí durante 90 segundos. |
| `ability.c_sunbeam.name` | Sunbeam | Rayo de sol |
| `ability.c_sunbeam.hint` | Tap the ground: clear sky over a 7 by 7 patch for a minute. | Pulsa el suelo: cielo despejado sobre un parche de 7 por 7 durante un minuto. |
| `ability.c_umbrella.name` | Umbrella | Paraguas |
| `ability.c_umbrella.hint` | Tap a courting visitor in the rain: they share one umbrella. | Pulsa a alguien que corteja bajo la lluvia: comparten un paraguas. |
| `ability.c_lamplight.name` | Lamplight | Luz de farolas |
| `ability.c_lamplight.hint` | Tap near lamps: they light early and brighter for a minute. | Pulsa cerca de las farolas: se encienden antes y más fuertes durante un minuto. |
| `ability.c_picnic.name` | Picnic basket | Cesta de pícnic |
| `ability.c_picnic.hint` | Tap the lawn: a basket appears and the nearest couple is fed. | Pulsa el césped: aparece una cesta y se alimenta a la pareja más cercana. |
| `ability.c_rowboat.name` | Rowboat | Barca |
| `ability.c_rowboat.hint` | Tap a big pond: the nearest couple takes a boat ride. | Pulsa un estanque grande: la pareja más cercana da un paseo en barca. |
| `ability.c_fireworks.name` | Fireworks | Fuegos artificiales |
| `ability.c_fireworks.hint` | Evening only. Fireworks for everyone. Once a day. | Solo al anochecer. Fuegos artificiales para todos. Una vez al día. |
| `ability.m_pigeon.name` | Pigeon | Paloma |
| `ability.m_pigeon.hint` | Tap a visitor: a pigeon pays them a visit. | Pulsa a un visitante: una paloma le hace una visita. |
| `ability.m_sprinkler.name` | Sprinkler | Aspersor |
| `ability.m_sprinkler.hint` | Tap the lawn: a sprinkler pops up for 10 seconds. | Pulsa el césped: sale un aspersor durante 10 segundos. |
| `ability.m_peel.name` | Banana peel | Cáscara de plátano |
| `ability.m_peel.hint` | Tap a path: the next walker slips. | Pulsa un sendero: el próximo que pase resbala. |
| `ability.m_pomeranian.name` | Pomeranian | Pomerania |
| `ability.m_pomeranian.hint` | Tap a visitor with a hat or a bag: Pompon snatches it. | Pulsa a un visitante con sombrero o bolso: Pompon se lo quita. |
| `ability.m_wasp.name` | Wasp | Avispa |
| `ability.m_wasp.hint` | Tap a picnic: a wasp spoils it. | Pulsa un pícnic: una avispa lo estropea. |
| `ability.m_raincloud.name` | Rain cloud | Nube de lluvia |
| `ability.m_raincloud.hint` | Tap the ground: a small cloud rains on a 5 by 5 patch. | Pulsa el suelo: una nubecita llueve sobre un parche de 5 por 5. |
| `ability.m_rival.name` | Rival | Rival |
| `ability.m_rival.hint` | Tap a courting visitor: a charming stranger flirts with them. | Pulsa a alguien que corteja: un desconocido encantador coquetea con esa persona. |
| `ability.m_mime.name` | Mime | Mimo |
| `ability.m_mime.hint` | Tap a path or a couple: Pierrot blocks the way or mimics them. | Pulsa un sendero o una pareja: Pierrot corta el paso o los imita. |
| `ability.m_fog.name` | Fog | Niebla |
| `ability.m_fog.hint` | Fog over the whole park for a minute. Strolling couples lose each other. | Niebla sobre todo el parque durante un minuto. Las parejas que pasean se pierden. |
| `ability.m_flock.name` | Pigeon storm | Tormenta de palomas |
| `ability.m_flock.hint` | Tap the ground: a storm of pigeons over a 7 by 7 patch. Once a day. | Pulsa el suelo: una tormenta de palomas sobre un parche de 7 por 7. Una vez al día. |

### 16.7 Avatars (picker name, three hints on row 1, cascade status words, mode toasts)
| Key | EN | ES |
|---|---|---|
| `avatar.a_pigeon.name` | Pigeon | Paloma |
| `avatar.a_pigeon.hint1` | Tap someone: swoop | TODO |
| `avatar.a_pigeon.hint2` | Tap crumbs: peck | TODO |
| `avatar.a_pigeon.hint3` | Tap a lamp or bench: perch | TODO |
| `avatar.a_pomeranian.name` | Pomeranian | Pomerania |
| `avatar.a_pomeranian.hint1` | Tap someone with a hat or bag: snatch | TODO |
| `avatar.a_pomeranian.hint2` | Tap pigeons: chase | TODO |
| `avatar.a_pomeranian.hint3` | Tap the lawn: dig | TODO |
| `avatar.a_mime.name` | Mime | Mimo |
| `avatar.a_mime.hint1` | Tap a path: invisible wall | TODO |
| `avatar.a_mime.hint2` | Tap a couple: mimic | TODO |
| `avatar.a_mime.hint3` | Tap a bench: statue | TODO |
| `avatar.a_florist.name` | Flower seller | Florista |
| `avatar.a_florist.hint1` | Tap a courting visitor: bouquet | TODO |
| `avatar.a_florist.hint2` | Tap the lawn: petals | TODO |
| `avatar.a_florist.hint3` | Tap a flowerbed: refill | TODO |
| `avatar.a_busker.name` | Busker | Músico callejero |
| `avatar.a_busker.hint1` | Tap a spot: play there | TODO |
| `avatar.a_busker.hint2` | Tap a couple: serenade | TODO |
| `avatar.a_busker.hint3` | Tap the bandstand: play there | TODO |
| `avatar.a_matchmaker.name` | Matchmaker | Casamentera |
| `avatar.a_matchmaker.hint1` | Tap a single: introduce | TODO |
| `avatar.a_matchmaker.hint2` | Tap a couple: encourage | TODO |
| `avatar.a_matchmaker.hint3` | Tap the kiosk: baguette | TODO |
| `avatar.side_tier` | {side} · T{tier} | {side} · T{tier} |
| `avatar.says` | {name}: {what} | {name}: {what} |
| `avatar.busy` | {name}: busy | TODO |
| `avatar.goes_on` | {name} goes on alone | TODO |
| `avatar.you` | {name} · you | TODO |
| `avatar.waiting` | waiting for your tap | TODO |
| `avatar.status.swooping` | swooping | TODO |
| `avatar.status.ruffled` | ruffled, give it a moment | TODO |
| `avatar.status.pecking` | pecking | TODO |
| `avatar.status.perching` | perching | TODO |
| `avatar.status.drinking` | drinking | TODO |
| `avatar.status.snatching` | snatching | TODO |
| `avatar.status.panting` | panting, give it a moment | TODO |
| `avatar.status.chasing` | chasing | TODO |
| `avatar.status.playing` | playing | TODO |
| `avatar.status.paddling` | paddling | TODO |
| `avatar.status.digging` | digging | TODO |
| `avatar.status.mimicking` | mimicking | TODO |
| `avatar.status.statue` | a statue | TODO |
| `avatar.status.wall` | an invisible wall | TODO |
| `avatar.status.resting` | resting | TODO |
| `avatar.status.bouquet` | a bouquet | TODO |
| `avatar.status.picking` | picking flowers | TODO |
| `avatar.status.petals` | petals | TODO |
| `avatar.status.serenade` | a serenade | TODO |
| `avatar.status.bandstand` | playing on the bandstand | TODO |
| `avatar.status.playing_here` | playing here | TODO |
| `avatar.status.introduction` | an introduction | TODO |
| `avatar.status.encouragement` | a word of encouragement | TODO |
| `avatar.status.baguette` | a fresh baguette | TODO |
| `avatar.status.sharing` | sharing bread | TODO |

`walking` and `flying` statuses are silent (design §10.1); `busy` toasts `avatar.busy`; every other status toasts `avatar.says` with `what = t('avatar.status.<status>')`.

### 16.8 Card and pair card
| Key | EN | ES |
|---|---|---|
| `card.sub` | {archetype} · {age} | {archetype} · {age} |
| `card.rel.single.f` | single, looking | TODO |
| `card.rel.single.m` | single, looking | TODO |
| `card.rel.courting` | courting {b} · {stage} | TODO |
| `card.rel.with` | with {b} | TODO |
| `card.rel.family` | with the children | TODO |
| `card.rel.child` | with {parent} | TODO |
| `card.rel.staff` | works here | TODO |
| `card.rel.visiting` | just visiting | TODO |
| `card.rel.alumni` | married here | TODO |
| `card.bar.mood` | Mood | TODO |
| `card.bar.rested` | Rested | TODO |
| `card.bar.full` | Full | TODO |
| `card.bar.heart` | Heart | TODO |
| `card.pair.title` | {a} & {b} | {a} & {b} |
| `card.pair.stage` | {stage} · {n} of 7 | TODO |
| `card.pair.emb` | {n} today | TODO |
| `card.pin` | Pin | TODO |
| `card.unpin` | Pinned | TODO |

### 16.9 Doing lines (`doing.<st>` for every `act.ts` state; the card's doing line)
| Key | EN | ES |
|---|---|---|
| `doing.idle` | taking the air | TODO |
| `doing.wander` | wandering | TODO |
| `doing.arrive` | coming in | TODO |
| `doing.strollLoop` | strolling the loop | TODO |
| `doing.goBench` | looking for a bench | TODO |
| `doing.goKiosk` | heading to the kiosk | TODO |
| `doing.goSit` | off to sit down | TODO |
| `doing.goEat` | hungry | TODO |
| `doing.goLeave` | leaving | TODO |
| `doing.watch` | watching | TODO |
| `doing.eat` | eating | TODO |
| `doing.sit` | sitting | TODO |
| `doing.read` | reading | TODO |
| `doing.feed` | feeding the pigeons | TODO |
| `doing.chess` | playing chess | TODO |
| `doing.photo` | taking a photo | TODO |
| `doing.paint` | painting | TODO |
| `doing.play` | playing | TODO |
| `doing.chaseDog` | chasing the little dog | TODO |
| `doing.pave` | laying gravel | TODO |
| `doing.tidy` | tidying the flowers | TODO |
| `doing.serve` | serving | TODO |
| `doing.shelter` | sheltering from the rain | TODO |
| `doing.notice` | noticing someone | TODO |
| `doing.chat` | chatting | TODO |
| `doing.bench` | sitting together | TODO |
| `doing.stroll` | strolling together | TODO |
| `doing.picnic` | picnicking | TODO |
| `doing.kiss` | a kiss | TODO |
| `doing.proposal` | a proposal | TODO |
| `doing.boat` | on the water | TODO |
| `doing.laugh` | laughing | TODO |
| `doing.huff` | in a huff | TODO |
| `doing.wipe` | wiping that off | TODO |
| `doing.shake` | shaking the water off | TODO |
| `doing.stumble` | oops | TODO |
| `doing.chase` | chasing the dog | TODO |
| `doing.flap` | flapping at a wasp | TODO |
| `doing.huddle` | caught in the rain | TODO |
| `doing.distracted` | distracted | TODO |
| `doing.baffled` | baffled by a mime | TODO |
| `doing.lost` | lost in the fog | TODO |
| `doing.duck` | ducking | TODO |
| `doing.lead` | being introduced | TODO |
| `doing.perch` | perched | TODO |
| `doing.peck` | pecking | TODO |
| `doing.scatter` | scattering | TODO |
| `doing.goPicnic` | off to a picnic | TODO |
| `doing.swoop` | swooping | TODO |
| `doing.poop` | a direct hit | TODO |
| `doing.startled` | startled | TODO |
| `doing.drink` | drinking | TODO |
| `doing.snatch` | snatching | TODO |
| `doing.carry` | running off with it | TODO |
| `doing.shakeOff` | shaking it off | TODO |
| `doing.paddle` | paddling | TODO |
| `doing.dig` | digging | TODO |
| `doing.hand` | handing over a bouquet | TODO |
| `doing.pick` | picking flowers | TODO |
| `doing.wall` | an invisible wall | TODO |
| `doing.mimicStart` | mimicking | TODO |
| `doing.statue` | a statue | TODO |
| `doing.serenade` | a serenade | TODO |
| `doing.setUp` | setting up | TODO |
| `doing.pack` | packing up | TODO |
| `doing.encourage` | a word of encouragement | TODO |
| `doing.buy` | buying a baguette | TODO |

### 16.10 Sheets
| Key | EN | ES |
|---|---|---|
| `sheet.close` | Close | TODO |
| `sheet.census.title` | Census | Censo |
| `sheet.census.summary` | {n} in the park · {k} courting | TODO |
| `sheet.census.room.one` | room for {n} more | TODO |
| `sheet.census.room.other` | room for {n} more | TODO |
| `sheet.census.row` | {archetype} · {doing} | {archetype} · {doing} |
| `sheet.census.partner` | with {b} | TODO |
| `sheet.romances.title` | Romances | TODO |
| `sheet.romances.empty` | No one is courting yet. Give them a bench. | TODO |
| `sheet.romances.today` | Today: Happily {h} · Parted {p} | TODO |
| `sheet.progress.title` | Progress | TODO |
| `sheet.progress.cupid` | Cupid Points | Puntos de Cupido |
| `sheet.progress.mischief` | Mischief Points | Puntos de Travesura |
| `sheet.progress.points` | {n} points · T{tier} | {n} puntos · T{tier} |
| `sheet.progress.points.one` | {n} point · T{tier} | {n} punto · T{tier} |
| `sheet.progress.points.other` | {n} points · T{tier} | {n} puntos · T{tier} |
| `sheet.progress.unlocks` | Unlocks | Desbloqueos |
| `sheet.progress.avatar` | Avatar: {name} | Avatar: {name} |
| `sheet.progress.next` | Next: {item} at {n} | Siguiente: {item} a los {n} |
| `sheet.progress.done` | Everything unlocked | Todo desbloqueado |
| `sheet.events.title` | Events | TODO |
| `sheet.events.empty` | Nothing has happened yet. | TODO |
| `sheet.events.when` | Day {n} · {phase} | Day {n} · {phase} |
| `sheet.picker.title` | Be someone | TODO |
| `sheet.picker.locked` | Locked · {side} T{tier} | TODO |
| `sheet.options.title` | Options | TODO |
| `sheet.options.language` | Language | TODO |
| `sheet.options.lang_en` | EN | EN |
| `sheet.options.lang_es` | ES | ES |
| `sheet.options.sound` | Sound | TODO |
| `sheet.options.speed` | Speed | TODO |
| `sheet.options.speed_hint` | Set it with the dial in the bottom row | TODO |
| `sheet.options.pace` | Park pace | Ritmo del parque |
| `sheet.options.pace.calm` | Calm | Tranquilo |
| `sheet.options.pace.calm_hint` | A visitor every 6 to 14 s | Un visitante cada 6 a 14 s |
| `sheet.options.pace.lively` | Lively | Animado |
| `sheet.options.pace.lively_hint` | A visitor every 3 to 6 s | Un visitante cada 3 a 6 s |
| `sheet.options.seed` | Park seed {seed} | TODO |
| `sheet.options.sound_check` | Sound check | TODO |
| `sheet.options.perf` | Performance overlay | TODO |
| `sheet.options.on` | On | TODO |
| `sheet.options.off` | Off | TODO |
| `sheet.sound.title` | Sound check | TODO |
| `sheet.sound.muted` | Sound is muted | TODO |

The Visitors chip opens the sheet titled Census (register 3.10: "Visitors chip … opens Census"; 02 §12.2, §12.4); "visitors" is the chip's own word (`hud.visitors`, 16.3).

The five `sheet.options.pace*` rows are the Options sheet's **Park pace** setting (register section 4, Park pace and Options, owner 2026-10-14; design §4.2 item 2, §12.4): Calm keeps the 6 to 14 s gap between arrivals, Lively uses 3 to 6 s (`entities/visitor.ts` `LIVELY_GAP_MIN`, `LIVELY_GAP_MAX`); Lively is the default for a new player. The Options stage adds them to `en.ts` and `es.ts`.

### 16.11 Feed lines (stored as `{ key, params }` and rendered at display time)
| Key | EN | ES |
|---|---|---|
| `feed.pair.formed` | {a} and {b} noticed each other | TODO |
| `feed.stage.chat` | {a} and {b} are chatting | TODO |
| `feed.stage.bench` | {a} and {b} share a bench | TODO |
| `feed.stage.stroll` | {a} and {b} stroll together | TODO |
| `feed.stage.picnic` | {a} and {b} are having a picnic | TODO |
| `feed.stage.kiss` | {a} and {b} kissed | TODO |
| `feed.stage.proposal` | {a} proposed to {b} | TODO |
| `feed.happily` | {a} and {b} said yes. Happily! | TODO |
| `feed.parted` | {a} and {b} have parted | TODO |
| `feed.left_together` | {a} and {b} strolled off together | TODO |
| `feed.left_alone` | {a} left without {b} | TODO |
| `feed.emb.poop` | A pigeon landed one on {name} | TODO |
| `feed.emb.soaked` | {name} got soaked by a sprinkler | TODO |
| `feed.emb.trip` | {name} slipped on a banana peel | TODO |
| `feed.emb.snatched` | Pompon ran off with {name}'s {item} | TODO |
| `feed.emb.wasp` | A wasp spoiled {a} and {b}'s picnic | TODO |
| `feed.emb.drenched` | A little cloud drenched {name} | TODO |
| `feed.emb.rival` | A charming stranger turned {name}'s head | TODO |
| `feed.emb.mime` | A mime baffled {name} | TODO |
| `feed.emb.fog` | {a} and {b} lost each other in the fog | TODO |
| `feed.emb.flock` | Pigeons! {name}'s hat went flying | TODO |
| `feed.emb.backfire.poop` | {b} wiped it off and {a} laughed | TODO |
| `feed.emb.backfire.soaked` | {a} and {b} danced in the spray | TODO |
| `feed.emb.backfire.trip` | {b} caught {a} just in time | TODO |
| `feed.emb.backfire.snatched` | {a} and {b} chased Pompon, laughing | TODO |
| `feed.emb.backfire.wasp` | {a} and {b} shooed the wasp off together | TODO |
| `feed.emb.backfire.drenched` | {a} and {b} shared a newspaper | TODO |
| `feed.emb.backfire.rival` | {a} and {b} laughed the stranger off | TODO |
| `feed.emb.backfire.mime` | {a} and {b} applauded the mime | TODO |
| `feed.emb.backfire.fog` | {a} and {b} bumped into each other in the fog | TODO |
| `feed.emb.backfire.flock` | {a} and {b} ducked together, laughing | TODO |
| `feed.cast.c_petals` | Petals fell by the {spot} | Cayeron pétalos por {spot} |
| `feed.cast.c_bouquet` | Violette brought {name} a bouquet | Violette le trajo un ramo a {name} |
| `feed.cast.c_musician` | A busker started to play | Un músico empezó a tocar |
| `feed.cast.c_sunbeam` | The sun came out over a corner of the park | Salió el sol en un rincón del parque |
| `feed.cast.c_umbrella` | {a} and {b} share an umbrella | {a} y {b} comparten un paraguas |
| `feed.cast.c_lamplight` | The lamps came on early | Las farolas se encendieron pronto |
| `feed.cast.c_picnic` | A picnic basket appeared | Apareció una cesta de pícnic |
| `feed.cast.c_rowboat` | {a} and {b} took a boat out | {a} y {b} salieron en barca |
| `feed.cast.c_fireworks` | Fireworks over the park | Fuegos artificiales sobre el parque |
| `feed.cast.m_pigeon` | A pigeon took an interest in {name} | Una paloma se interesó por {name} |
| `feed.cast.m_sprinkler` | A sprinkler popped up on the lawn | Un aspersor salió en el césped |
| `feed.cast.m_peel` | Someone dropped a banana peel | Alguien dejó una cáscara de plátano |
| `feed.cast.m_pomeranian` | Pompon is loose | Pompon anda suelto |
| `feed.cast.m_wasp` | A wasp found the picnic | Una avispa encontró el pícnic |
| `feed.cast.m_raincloud` | A small cloud drifted in | Una nubecita pasó por aquí |
| `feed.cast.m_rival` | A charming stranger came through the gate | Un desconocido encantador entró por la puerta |
| `feed.cast.m_mime` | Pierrot the mime is about | Pierrot el mimo anda por ahí |
| `feed.cast.m_fog` | Fog rolled in from the river | La niebla llegó desde el río |
| `feed.cast.m_flock` | A storm of pigeons | Una tormenta de palomas |
| `feed.unlock` | Unlocked: {item} ({side} T{tier}) | Desbloqueado: {item} ({side} T{tier}) |
| `feed.gardener` | The gardener is gravelling a worn track | TODO |
| `feed.pigeons` | A gathering of pigeons | TODO |
| `feed.regular_return` | {name} is back | TODO |
| `feed.alumni_return` | {a} and {b} came back, together | TODO |
| `feed.romance.renewed` | {a} and {b} renewed their vows | {a} y {b} renovaron sus votos |
| `feed.tally` | Today: Cupid {cp} · Mischief {mp} | TODO |
| `feed.season.spring` | Spring in the park | TODO |
| `feed.season.summer` | Summer in the park | TODO |
| `feed.season.autumn` | Autumn in the park | TODO |
| `feed.season.winter` | Winter in the park | TODO |
| `feed.ice` | The pond has frozen over | TODO |
| `feed.thaw` | The ice has gone | TODO |
| `item.hat` | hat | TODO |
| `item.purse` | bag | TODO |
| `item.baguette` | baguette | TODO |
| `item.iceCream` | ice cream | TODO |
| `spot.fountain` | fountain | la fuente |
| `spot.pond` | pond | el estanque |
| `spot.bandstand` | bandstand | el templete |
| `spot.bridge` | bridge | el puente |
| `spot.lawn` | lawn | el césped |
| `spot.path` | path | el sendero |

### 16.12 Toasts and confirm
| Key | EN | ES |
|---|---|---|
| `toast.undone` | Undone | TODO |
| `toast.fit` | Whole park | TODO |
| `toast.sound_on` | Sound on | TODO |
| `toast.sound_off` | Sound off | TODO |
| `toast.unlocked` | Unlocked: {item} ({side} T{tier}) | Desbloqueado: {item} ({side} T{tier}) |
| `toast.photo` | Tap to leave photo mode | TODO |
| `toast.new_park` | A new park | TODO |
| `toast.saved` | Saved | TODO |
| `toast.load_failed` | The saved park could not be read. Starting fresh. | TODO |
| `toast.speed` | Speed {n}x | TODO |
| `toast.paused` | Paused | TODO |
| `toast.sound_check_later` | The sound check comes with the sound | TODO |
| `confirm.new_park` | Start a new park? The current one is lost. | TODO |
| `confirm.yes` | Yes | TODO |
| `confirm.no` | No | TODO |

### 16.13 Reasons (every `reason.*` key of 03 §5.4 plus the avatar refusals; toasted as `t(reason)`)
| Key | EN | ES |
|---|---|---|
| `reason.outside` | outside the railings | TODO |
| `reason.gateway` | not in the gateway | TODO |
| `reason.on_water` | not on the water | TODO |
| `reason.taken` | the ground is taken | TODO |
| `reason.on_flowers` | not on the flowers | TODO |
| `reason.near_railings` | too near the railings | TODO |
| `reason.lawn_only` | only on the lawn | TODO |
| `reason.not_here` | not here | TODO |
| `reason.has_bandstand` | the park has its bandstand | TODO |
| `reason.enough_kiosks` | three kiosks is enough | TODO |
| `reason.not_on_water` | tap the water | TODO |
| `reason.someone_on_it` | someone is on it | TODO |
| `reason.too_wide` | the water is too wide here (4 at most) | TODO |
| `reason.straight_line` | in a straight line from the last piece | TODO |
| `reason.run_too_long` | 14 pieces at most | TODO |
| `reason.nothing_to_undo` | nothing to undo | TODO |
| `reason.park_full` | The park is full | TODO |
| `reason.park_full_props` | the park cannot hold any more | TODO |
| `reason.locked` | Unlocks at {side} T{tier} | Se abre en {side} T{tier} |
| `reason.cooldown` | not yet ({s} s) | aún no ({s} s) |
| `reason.no_charges` | once a day | una vez al día |
| `reason.not_children` | not the children | TODO |
| `reason.enough_today` | {name} has had enough for one day | TODO |
| `reason.not_courting` | they are not courting | TODO |
| `reason.apart` | they are not together just now | no están juntos ahora |
| `reason.on_the_water` | they are on the water | están en el agua |
| `reason.no_lamp` | no lamp near here | no hay farolas cerca |
| `reason.not_raining` | it is not raining on them | no llueve sobre ellos |
| `reason.raining` | wait for the rain to stop | espera a que pare la lluvia |
| `reason.not_evening` | wait for the evening | espera al anochecer |
| `reason.pond_small` | the pond is too small for a boat | el estanque es pequeño para una barca |
| `reason.iced` | the pond is frozen | el estanque está helado |
| `reason.slippery` | the ground is slippery enough | el suelo ya resbala bastante |
| `reason.busker_near` | a busker is already playing here | ya toca un músico por aquí |
| `reason.dog_saw_it` | the dog saw it off | el perro lo espantó |
| `reason.no_wasps_rain` | wasps hate the rain | las avispas odian la lluvia |
| `reason.in_sunbeam` | not in the sunshine | no bajo el sol |
| `reason.already_misty` | it is misty enough | ya hay bastante niebla |
| `reason.nobody_inside` | nobody there | no hay nadie |
| `reason.not_at_picnic` | nobody is eating there | nadie está comiendo ahí |
| `reason.no_item` | nothing to snatch | no hay nada que quitar |
| `reason.peel_here` | there is a peel here already | ya hay una cáscara aquí |
| `reason.too_many_effects` | too much is going on at once | hay demasiado en marcha a la vez |
| `reason.not_in_avatar` | not while being someone | TODO |
| `reason.busy` | busy | ocupado |
| `reason.wrong_side` | not for this side | TODO |
| `reason.wrong_mode` | not in this mode | TODO |
| `reason.startled` | startled by a dog | TODO |
| `reason.big_dog` | the big dog is watching | TODO |
| `reason.basket_empty` | the basket is empty: pick some flowers | TODO |
| `reason.nobody_for_them` | nobody for them just now | TODO |
| `reason.had_to_go` | they had to go | TODO |

### 16.14 Aria labels (`data-t-aria` on static controls)
| Key | EN | ES |
|---|---|---|
| `aria.clock` | Time and weather. Opens events. | TODO |
| `aria.visitors` | Visitors. Opens the census. | TODO |
| `aria.add_visitor` | Call a visitor | TODO |
| `aria.romance` | Featured romance. Opens romances. | TODO |
| `aria.points` | Points. Opens progress. | TODO |
| `aria.group_park` | Park tools | TODO |
| `aria.group_cupid` | Cupid abilities | TODO |
| `aria.group_mischief` | Mischief abilities | TODO |
| `aria.size` | Brush size | TODO |
| `aria.undo` | Undo the last park change | TODO |
| `aria.place` | Place it here | TODO |
| `aria.cancel` | Cancel placement | TODO |
| `aria.pause` | Pause or resume | TODO |
| `aria.speed` | Game speed | TODO |
| `aria.rotate_left` | Turn the park left | TODO |
| `aria.rotate_right` | Turn the park right | TODO |
| `aria.fit` | Show the whole park | TODO |
| `aria.sound` | Sound on or off | TODO |
| `aria.mode` | Be someone, or return to Creator | TODO |
| `aria.photo` | Photo mode | TODO |
| `aria.new` | New park | TODO |
| `aria.options` | Options: park pace, language, sound and speed | TODO |
| `aria.close` | Close | TODO |
| `aria.pin` | Pin this romance | TODO |
| `aria.lang` | Language | TODO |
| `aria.photo_close` | Leave photo mode | TODO |
| `aria.feed` | Latest event | TODO |
| `aria.sheet_census` | Census | TODO |
| `aria.sheet_romances` | Romances | TODO |
| `aria.sheet_progress` | Progress | TODO |
| `aria.sheet_events` | Events | TODO |
| `aria.sheet_picker` | Be someone | TODO |
| `aria.sheet_options` | Options | TODO |
| `aria.sheet_sound` | Sound check | TODO |
| `aria.confirm` | Confirm | TODO |

### 16.15 Fixed names and words
| Key | EN | ES |
|---|---|---|
| `name.gardener` | Gustave | Gustave |
| `name.matchmaker` | Marguerite | Marguerite |
| `name.florist` | Violette | Violette |
| `name.mime` | Pierrot | Pierrot |
| `name.pomeranian` | Pompon | Pompon |
| `name.stranger` | a charming stranger | TODO |
| `name.pigeon` | a pigeon | TODO |
| `word.bonjour` | Bonjour! | Bonjour! |
| `word.ooh_la_la` | Ooh là là | Ooh là là |

### 16.16 Boards (`style-board.html` and `music-board.html`; 04 §4.4, 05 §6.1, §6.4, §6.5; 07 S1.5, S1.6 item 5)
| Key | EN | ES |
|---|---|---|
| `gate.style.title` | Style Gate | TODO |
| `gate.music.title` | Music Gate | TODO |
| `gate.dir.A` | A Storybook | TODO |
| `gate.dir.B` | B Pastel Postcard | TODO |
| `gate.dir.C` | C Line and Wash | TODO |
| `gate.motif.A` | A Musette waltz | TODO |
| `gate.motif.B` | B Music-box lullaby | TODO |
| `gate.motif.C` | C Café swing | TODO |
| `gate.choose` | Choose {letter} | TODO |
| `gate.picked.style` | Picked: {name} | TODO |
| `gate.picked.music` | Picked: {name} | TODO |
| `gate.enable_sound` | Tap to enable sound | TODO |
| `gate.play_rising` | Play rising | TODO |
| `gate.play_parted` | Play parted | TODO |
| `gate.stop` | Stop | TODO |
| `gate.stop_all` | Stop all | TODO |
| `gate.cue_bed` | Cue bed | TODO |

Both gates passed on 2026-10-12 (register §4): style **A Storybook**; music **B Music-box lullaby** and **C Café swing**, with **A Musette waltz** retired (05 §5.9). The boards stay as the record of the gates and still show all three directions and play all three motifs, so every key above stays, including `gate.dir.B`, `gate.dir.C` and `gate.motif.A`. No game screen uses a `gate.*` key.

Rules for this table: `Object.keys(en)` equals `Object.keys(es)` (test); no key may be added in code without a row here; a `.one` key always has a `.other`; a `.f` key always has a `.m`; numbers are formatted by `t()` with the locale's decimal rules; never build a sentence by concatenation. Count: 16.1 to 16.16 define 9 + 24 + 19 + 37 + 32 + 38 + 55 + 19 + 67 + 37 + 73 + 14 + 50 + 34 + 9 + 17 = 534 keys; the test asserts the count against the data file, not against this number.

---

## 17. Cues (`src/audio/cues.ts`; the 38 ids of `05-Audio-and-Music-Design.md` §3.2 in its order, copied here as 05 §9 item 1 requires; 05 owns the recipes, gains, gaps and soft flags, and a cue not in 05 §3.2 does not exist: change 05 first, then this table; ids are code identifiers with no `cue.` prefix (05 §9 item 12); every cue goes through `cues.cue()`, which tests audibility before `limiter.gate()` as 03 §9.1 item 4)

| # | id | Trigger: event (emitting module) | Positioned | Soft | Scope | Base gap (ms) |
|---|---|---|---|---|---|---|
| 1 | `step_gravel` | `step` every 0.55 tile of travel on gravel or flagstone (`move.ts`) | yes, the walker | no | actor | 70 |
| 2 | `step_lawn` | `step` on lawn, mulch or bridge (`move.ts`) | yes, the walker | no | actor | 70 |
| 3 | `bench_creak` | `sit`, `stand` (`act.ts`) | yes, the bench | no | kind | 450 |
| 4 | `murmur` | `chat` every 3 s at stage 2, speaker alternates (`romance.ts`) | yes, the speaker | yes | actor | 700 |
| 5 | `laugh` | `laugh`: backfire scene, Picnic hearts 30 %, family play, `a_pomeranian` play (`embarrass.ts`, `romance.ts`, `brain.ts`) | yes, the laugher | yes | actor | 450 |
| 6 | `sigh` | `stage` Notice complete; `linger` every 20 s (`romance.ts`) | yes, the sigher | yes | actor | 600 |
| 7 | `gasp` | `embarrassed` landed, on the victim; `watch` start at fireworks (`embarrass.ts`, `abilities.ts`) | yes, the victim | yes | actor | 500 |
| 8 | `kiss` | `stage` Kiss complete (`romance.ts`) | yes, pair midpoint | yes | kind | 2000 |
| 9 | `ring` | `proposal` sparkle at t+8 s (`romance.ts`) | yes, the kneeler | yes | kind | 3000 |
| 10 | `happily` | `happily` (`romance.ts`) | yes, pair midpoint | yes | kind | 4000 |
| 11 | `parted` | `parted` (`romance.ts`) | yes, pair midpoint | yes | kind | 4000 |
| 12 | `bouquet` | `bouquet` handed: `c_bouquet` cameo, `a_florist` hand (`abilities.ts`, `avatar.ts`) | yes, the receiver | yes | kind | 900 |
| 13 | `coo` | ambience 05 §4.4; `peck` start (`creatures.ts`) | yes, the pigeon | no | kind | 900 |
| 14 | `flutter` | `scatter`, `fly`, `swoop` start (`creatures.ts`) | yes, the pigeon | no | kind | 180 |
| 15 | `splat` | `embarrassed` poop landed (`embarrass.ts`) | yes, the victim | no | kind | 300 |
| 16 | `yap` | `bark` dog sees the pomeranian; pomeranian `snatch` start at x 1.25 pitch (`creatures.ts`) | yes, the dog | no | actor | 900 |
| 17 | `snatch` | `embarrassed` snatched landed (`embarrass.ts`) | yes, the victim | no | kind | 600 |
| 18 | `wasp` | `m_wasp` t0 to t2, one event per 0.5 s (`abilities.ts`) | yes, the table | no | kind | 400 |
| 19 | `sprinkler` | `m_sprinkler` t0 and every 1 s while up (`abilities.ts`) | yes, the sprinkler | no | kind | 900 |
| 20 | `slip` | `embarrassed` trip landed (`embarrass.ts`) | yes, the victim | no | kind | 450 |
| 21 | `mime` | `embarrassed` mime landed; `wall` start (`embarrass.ts`, `avatar.ts`) | yes, the mime | yes | kind | 1200 |
| 22 | `rival_hmm` | `m_rival` arrival; every 10 s of `distracted` (`abilities.ts`) | yes, the stranger | yes | kind | 1500 |
| 23 | `foghorn` | ambience 05 §4.11 | yes, fixed `panOf(24, -4)`, `a` floor 0.6 | no | kind | 20000 unscaled |
| 24 | `fireworks` | `c_fireworks` launches paced by 05 §4.9; Happily burst x 3 (`ambience.ts`) | yes, fountain or park centre, pan +-0.5 random | no | kind | 350 |
| 25 | `clink` | ambience 05 §4.6; `eat` start at a café table (`act.ts`) | yes, the table | no | kind | 700 |
| 26 | `bell_bike` | ambience 05 §4.7 | yes, beyond the south railings, pan -0.7 to 0.7 sweep | no | kind | 6000 |
| 27 | `gate_hinge` | `arrive`, `leave` through a gate (`visitor.ts`) | yes, the gate tile | no | kind | 1200 |
| 28 | `fountain` | ambience point source 05 §4.5 | yes, each fountain | no | kind | none (rate 05 §4.5) |
| 29 | `plip` | ambience rain 05 §4.8 | yes, random pan +-0.8 | no | kind | none (rate 05 §4.8) |
| 30 | `hush` | ambience state 05 §4.10, snow > 0.5 (no tone: a master lowpass and reverb move) | n/a | n/a | n/a | n/a |
| 31 | `lamp_hum` | `lampsLit` when `f` crosses 0.80; `c_lamplight` t0; per lamp in view, stagger 0.3 to 1.5 s, max 6 (`ambience.ts` watching `clock.ts`) | yes, each lamp | no | kind | 3000 |
| 32 | `petals` | `c_petals` t0; `a_florist` scatter (`abilities.ts`, `avatar.ts`) | yes, area centre | yes | kind | 1500 |
| 33 | `sunbeam` | `c_sunbeam` t0 (`abilities.ts`) | yes, area centre | yes | kind | 3000 |
| 34 | `ready` | a cooldown reaches 0; charges reset at `f = 0` (`abilities.ts`) | no | no | kind | 500 |
| 35 | `unlock` | a tier is reached (`progression.ts`) | no | yes | kind | 4000 |
| 36 | `ui_tap` | any rail or sheet button press (`dom.ts`) | no | no | kind | 60 |
| 37 | `place` | tool commit: stamp, run Place, brush stroke end (`tools.ts`); any ability cast that passes validation, at its target (`abilities.ts`) | yes, the tile | no | kind | 120 |
| 38 | `refuse` | tool or ability validation fails with a toast (`tools.ts`, `abilities.ts`) | no | no | kind | 400 |

Ambience layers (not cues; `ambience.ts`, 05 §4): songbirds, owl, pigeons, fountains, café, boulevard, rain, fireworks pacing, crickets and hush, mist and foghorn, bells.

---

## 18. Assumptions and open points

Values this document defines that neither the register nor `02-Game-Design.md` defines (the owner may object to any; on change, edit this file first and then the data file):
1. The constant ids in section 1 (`N`, `CAP_PEOPLE`, `R_PAIR_FORM`, and so on). The values are the register's or the design's; only the identifiers are new. `SPD_LOST` 1.5 is 04 §9.3's walk speed for the `lost` reaction.
2. Tourists arrive alone 60 % and as a pair 40 % (5.1); the design says "alone or pair" without a split. The rival stranger's sex rule (5.1).
3. `ARRIVAL_MOD[phase][archetype]` exists as a tuning hook with every entry 1.0 (5.1); the brief for this document asked for weights by season and phase, the design fixes one weight set, so the hook is neutral.
4. The 40 generated first names per sex (6.1), the eight regulars' `ageWord` and personality lines (6.2), the lovers' example pair Amélie & Théo (6.2), and the fixed actor names Gustave, Marguerite, Violette, Pierrot, Pompon (6.3). The register and the design give only the regulars' names and `seeks`.
5. `basket` is the `picnic` prop with `placedBy = 'sim'` and a life, not a separate kind (section 4); `rowboat` life is about 65 s (boarding plus the 60 s ride).
6. The English wording of the per-ability and avatar refusal keys of 03 §5.4 (`reason.raining`, `reason.startled`, `reason.big_dog`, `reason.basket_empty`, `reason.nobody_for_them`, `reason.had_to_go` and the rest of 16.13); 03 owns the key names.
7. The `feed.cast.<id>` feed line per ability, `feed.left_alone`, `feed.alumni_return`, `feed.ice`, `feed.thaw`, `item.*`, `spot.*`, `word.*`, and every English wording in section 16 (`feed.romance.renewed` is the owner's wording in both languages, 2026-10-11, not an assumption); the design fixes the wording of the New confirm, "The park is full", "has had enough for one day", and the ranked reasons, which are copied.
8. `ending.happily` and `ending.parted` keys for the two endings as words (register §5).
9. Section 17 copies the 38 cue ids, soft flags, scopes and gaps of `05-Audio-and-Music-Design.md` §3.2 (05 §9 item 1); 05 owns them, and a change starts there.
10. The key count 534 (16.16) is a hand count for the reader; the test compares the two data files, not this number.

Open points for the owner:
1. Whether `c_rowboat` should be refused during `m_fog` (design §15 open point 4): this document allows it (no `reason` row).
2. Whether the park should have special days (a festival on summer day 2, a market on autumn day 2 as GV's midsummer and harvest, review §6.7): section 15 has none because the design defines none.
3. Whether the Options sheet shows the seed (`sheet.options.seed`): brief §11 item 10 assumed yes; the register (3.10) lists language, sound, speed and park pace only. The Options stage shows it as the sheet's summary line.
