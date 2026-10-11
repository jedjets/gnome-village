# Parque D'Amour: Test Plan

Version 1 · 2026-10-10 · Owner: Jeduthun Oosthuis · Author: Claude (design session)

**How to use this document.** This file says how we know a slice works. Read `01-Decision-Register.md` (the register) and `00-Product-Brief.md` (the brief) first, then this file, then the slice brief in `07-Build-Plan.md`. Section 1 says which kind of test covers which rule. Section 2 lists every unit test by file, name and assertion; copy the name into `it('...')` and write the assertion as stated. Sections 3 to 5 are the determinism harness, the screenshot regression and the performance budgets, with scripts under `tools/`. Sections 6 and 7 are checklists a person runs on a phone and over the content. Section 8 is the release checklist. Every number, id and key here matches the register, `02-Game-Design.md` (the design), `03-Technical-Architecture.md` (03) and `06-Content-Tables.md` (06); where this document needed a value none of them defines, the value is defined here and listed in section 9. "GV 1234" is an absolute line in the owner's Gnome Village HTML as indexed by `10-Gnome-Village-HTML-Architecture-Review.md` (the review). Ranges use a hyphen (GV 583-598). A test that fails is a bug in the code or in a lower document, never a reason to edit the register.

---

## 1. Strategy

### 1.1 Four layers

| Layer | Tool | Runs where | Covers | Gate |
|---|---|---|---|---|
| Unit | Vitest (`npm test`), `environment: 'node'`; `jsdom` only for files under `tests/ui/` | CI and every hand-back (07 §0.5 row 3) | every rule with a number: sim modules, commands, save, i18n, content spellings, colour-literal and string-literal greps | blocks every slice |
| Harness | the same sim modules driven through `simulate`, `enqueue`, `stateHash` (Vitest), and `window.__PD` in a dev build driven by `tools/det.mjs` (puppeteer-core) | CI (Vitest part); dev machine (browser part) | determinism, replay, speed invariance, save round trip in the real page, scripted scenes | blocks every slice that touches `src/core`, `src/world`, `src/entities`, `src/play`, `src/save` (07 §0.5) |
| Screenshot | `tools/shot.mjs` (puppeteer-core, Chromium at `/opt/pw-browsers/chromium`) | CI (smoke) and every hand-back (scenes) | layout at phone and desktop size, safe areas, the five regression scenes, pixel diff against baselines | blocks every slice with a `shots/` row in its "Done when" |
| Manual | a person with a phone and desktop Chrome | before each gate and before release | gestures, audio unlock, background and resume, feel, tone, both languages | blocks release |
| Performance | the perf overlay, `__PD.FT`, `__PD.SP`, `tools/perf.mjs` | dev machine, then a phone | the budgets of section 5 | desktop budget blocks release; phone is a report (brief §9 row 4) |

### 1.2 What is tested where

| Area | Unit | Harness | Screenshot | Manual |
|---|---|---|---|---|
| RNG, clock, weather, loop, commands, events | 2.1 | 3.2, 3.3 | | |
| World: grid, park, gen, water, wear, charm | 2.2 | 3.2 | 4.2 scene A | |
| Visitors: needs, brain, act, move, astar, names, staff, creatures | 2.3 | 3.2 | 4.2 scene B | 6.11 |
| Romance, embarrassments, endings, points, tiers | 2.4, 2.5 | 3.2 (Happily and Parted seeds) | 4.2 scenes D, E | 7.1 |
| Tools, ghosts, undo, abilities, avatars, mode | 2.5, 2.6 | 3.2 (fixture commands) | 4.2 scene C | 6.5, 6.10 |
| Save, migrate, profile | 2.7 | 3.4 | | 6.7 |
| i18n, strings, content spellings, colour literals | 2.8 | | | 6.8, 7.2 |
| Audio engine, limiter, cues, music | 2.9 | 05 §8.3 dry run | | 05 §8.1, 6.6 |
| Render: project, order, pick | 2.10 | | 4.2 all scenes | 6.1 |
| UI shell: overlays, rail, sheets, intro, photo | 2.11 (jsdom) | | 4.2, 4.3 smoke | 6.2 to 6.9 |
| Performance | | 5.2 | | 5.3 |

### 1.3 How the tests run

1. `tests/` holds every Vitest file named in section 2; `tests/fixtures/` holds JSON fixtures and `tests/baseline/` holds screenshot baselines (both committed). `shots/` and `scratch/` are never committed (07 §0.7 item 10).
2. `npm run check` runs `typecheck && lint && test && build` (03 §14). `npm run shot -- <slice>` captures the slice's scenes. `npm run det` runs the browser determinism script. `npm run perf` runs the budget script. The last three take `--url <dev server url>`; the default is `http://localhost:5173/`.
3. Every test that steps the simulation uses `seedSim(seed)` and `seedVisual(seed)` from `src/core/rng.ts` and the fixed step `SIM_DT = 1/60` (GV `SIM_DT` 12054). A test never calls `Math.random`, `Date.now`, `setTimeout` or `performance.now` (03 §1 Do-not item 5).
4. A sim test asserts on ids, keys, numbers and `stateHash()`. It never asserts on an English sentence; it asserts on the key (`reason.not_children`), because the string tables may change.
5. Each `describe` block starts with a comment naming the rule it locks: the register row, the design section or the 03 section.
6. The common gate of 07 §0.5 is the minimum for every slice. This document adds nothing to the gate; it says what the tests inside the gate must contain.

### 1.4 Do not

1. Do not mock `rng()`; seed it. A mocked RNG hides draw-order bugs that the determinism test exists to find.
2. Do not test the renderer by reading pixels in a unit test; use the screenshot layer.
3. Do not put a `sleep` or a real-time wait in a sim test; call `simulate(n)`.
4. Do not change a baseline screenshot to make a test pass; section 4.4 says when a baseline may change.
5. Do not skip a failing determinism test with `it.skip`; the slice is not done.
6. Do not write a test that passes on an empty string table (assert `Object.keys(en).length > 0` first).

---

## 2. Unit tests with Vitest

Columns: the test name (the `it` string) and the assertion in one line. File names are fixed; 07 names the slice that creates each file.

### 2.1 `src/core/` (files `rng.test.ts`, `clock.test.ts`, `weather.test.ts`, `commands.test.ts`, `events.test.ts`, `loop.test.ts`)

| File | Test | Assertion |
|---|---|---|
| `rng.test.ts` | same seed gives the same first 1000 draws | `seedSim(101)`; collect 1000 `rng()`; reseed; the arrays are equal (GV `mulberry32` 583) |
| `rng.test.ts` | rngN counts sim draws only | after 10 `rng()` and 10 `vrng()`, `rngN() === 10` (GV 588) |
| `rng.test.ts` | simState and setSimState restore the stream | `const s = simState()`; 5 draws; `setSimState(s, n)`; the next 5 draws equal the recorded 5 |
| `rng.test.ts` | rnd, rint, pick, chance stay in range | 10,000 draws: `rnd(2, 5)` in [2, 5); `rint(1, 3)` in {1, 2, 3}; `pick([a, b])` in the array; `chance(0)` never, `chance(1)` always |
| `clock.test.ts` | a new park starts at f 0.30 spring day 1 | `stepClock(0)`: `T.abs === 0.30`, `T.f` ≈ 0.30, `T.day === 1`, `T.season === 0`, `T.phase === 'morning'` |
| `clock.test.ts` | tick 21600 is one day later | `stepClock(21600)`: `T.day === 2`, `T.f` ≈ 0.30 (360 s × 60 steps) |
| `clock.test.ts` | the eight bands start at the register's edges | for f in 0.00, 0.20, 0.28, 0.45, 0.58, 0.72, 0.80, 0.87: `phaseOf(f)` is night, dawn, morning, midday, afternoon, golden, dusk, evening; `phaseOf(0.199999)` is night, `phaseOf(0.799999)` is golden |
| `clock.test.ts` | lamps follow f >= 0.80 or f < 0.28 | `T.lamps` is true at f 0.80, 0.95, 0.10, 0.279; false at 0.28, 0.50, 0.799 |
| `clock.test.ts` | light is linear inside a phase | at f 0.76 `T.light` ≈ 0.75 (midpoint of 0.88 → 0.62, design §3.2); at f 0.50 it is 1.00; at f 0.10 it is 0.06 |
| `clock.test.ts` | seasons turn every 3 days and wrap | day 1-3 season 0, day 4 season 1, day 10 season 3, day 13 season 0 |
| `clock.test.ts` | newday and season events fire once | stepping ticks 21599 → 21600 emits exactly one `newday`; ticks across day 3 → 4 emit exactly one `season` |
| `weather.test.ts` | the eight kinds exist with exact ids | the kind list equals `['clear','fair','cloudy','breeze','rain','shower','mist','snow']` |
| `weather.test.ts` | every season's weights sum to 100 | for each of the four season rows of design §3.3 the sum is 100; snow is 0 outside winter |
| `weather.test.ts` | a new park starts fair with next 40 | after `genPark`: `W.kind === 'fair'`, `W.next === 40` (GV 845) |
| `weather.test.ts` | the pick uses the sim stream | `rngN()` increases by exactly one at the change; `vrng` state is unchanged |
| `weather.test.ts` | targets ease with a 2.6 s half-life | from rain 0 to kind rain (target 0.80): after 2.6 s `W.rain` ≈ 0.40 ± 0.01 (GV 868) |
| `weather.test.ts` | weatherAt returns the override inside and the global outside | `addOverride` r 2 at (10, 10) rain 0.9: `weatherAt(12, 12).rain === 0.9`, `weatherAt(13, 10).rain` equals `W.rain` |
| `weather.test.ts` | overrides cap at 16 and expire at until | the 17th `addOverride` returns 0; an override with `until = tick + 60` is gone at tick + 61 |
| `weather.test.ts` | WET rises 0.2 per s in rain and falls 0.01 per s dry | 5 s at rain 0.8: `WET[i] === 1` (clamped); then 10 s dry: `WET[i]` ≈ 0.9 |
| `weather.test.ts` | ice needs 60 s of snow and 120 s to thaw | pond `ICE` is 0 at 59 s of snow > 0.3, 1 at 60 s; back to 0 at 120 s without snow, not at 119 |
| `commands.test.ts` | enqueue stamps tick + 1 and a rising seq | two `enqueue` at `tick()` 10: both have `tick === 11`, `seq` increases by 1 |
| `commands.test.ts` | applyPending orders by tick, side, seq | mischief, cupid, park commands enqueued in that order at one tick apply as park, cupid, mischief (03 §5.2) |
| `commands.test.ts` | a command for a future tick waits | `tick === 11` command is not applied at `applyPending(10)` and is applied at 11 |
| `commands.test.ts` | the log keeps the last 600 | 650 applied commands: `log().length === 600` and the first logged is the 51st |
| `commands.test.ts` | a rejected command is not logged and emits rejected | `tool` on a gate tile: `Result.ok === false`, `reason === 'reason.gateway'`, `log()` unchanged, one `rejected` event |
| `commands.test.ts` | side rules of 03 §5.3 | `tool` with side cupid and `ability c_petals` with side mischief are each rejected with `reason.wrong_side` (03 §5.3, §5.4) and not logged; `avatar.tap` in creator mode is rejected and not logged (03 §5.3 allows it only in avatar mode and defines no dedicated key, so the test asserts `Result.ok === false` only); `speed` with side park is allowed in avatar mode |
| `commands.test.ts` | tool and ability in avatar mode are rejected | after `avatar.enter a_pigeon`: `tool` → `reason.not_in_avatar`, `ability` → `reason.not_in_avatar` |
| `commands.test.ts` | replay reproduces the log | snapshot, 1000 ticks with 6 commands, `stateHash()` A; `restore`, `replay(log, 1000)`; `stateHash()` equals A (design §14.5) |
| `events.test.ts` | on delivers at once and watch after drain | an `on` listener runs inside `emit`; a `watch` listener runs only at `drain` |
| `events.test.ts` | lite bits drop only fx and cue events | with `lite = 3`, 20 steps emitting one `fx` each: the frame listener receives 8; a `stage` event is never dropped (03 §4.5) |
| `loop.test.ts` | nsMax and budget follow GV 12082-12083 | `nsMax(8) === 22`, `nsMax(1) === 8`; `lite(8) === 3`, `lite(6) === 1`; budgets 26, 13, 9 ms for speed 8, 4, 1 |

### 2.2 `src/world/` (files `gen.test.ts`, `park.test.ts`, `water.test.ts`, `wear.test.ts`, `charm.test.ts`)

| File | Test | Assertion |
|---|---|---|
| `gen.test.ts` | the fixed skeleton is seed independent | seeds 1 and 2: fountain `OCC` at (23,23)-(24,24), gravel at Chebyshev 5-6 and 13-14 from (23.5, 23.5), kiosk at (14,44)-(15,45), 6 benches, 4 lamps, 2 beds of 2×2 (design §2.5) |
| `gen.test.ts` | the seed varies only pond outline, trees and bed colours | seeds 1 and 2 differ in `KIND` only on pond tiles inside (30,8)-(37,13), in tree positions and in `BEDC`; nothing else |
| `gen.test.ts` | twelve trees of three species on lawn | 12 tree props, 4 per species, each on lawn before placement, ≥ 3 tiles from paths and props, ≥ 4 tiles apart |
| `gen.test.ts` | the bridge spans the pond neck | a passable bridge prop covers (34,11) and (34,12) with `span === 2` |
| `park.test.ts` | the five gates have the design's tiles | `GATES` ids and tiles equal design §2.4 exactly; `isGateTile(12, 47) === 'g_south_w'`; `isGateTile(12, 46) === null` |
| `park.test.ts` | apron and boundary predicates | `inB(-1, 0)` false, `inB(47, 47)` true; `isBoundary(0, 5)` true, `isBoundary(1, 5)` false |
| `park.test.ts` | nearestGate honours exclude | from (23, 46) the nearest is `g_south_e` or `g_south_w`; with that one excluded the result differs |
| `water.test.ts` | findCrossing returns 1 to 4 water tiles | a 1, 2, 3 and 4 wide canal each return a crossing of that length with land at both ends |
| `water.test.ts` | findCrossing refuses 5 wide and no-land cases | a 5 wide pond returns null; a tile on the park edge with water to the boundary returns null |
| `water.test.ts` | waterBodies counts connected tiles | the starter pond body has ≥ 12 tiles; a lone pond tile is a body of 1 |
| `wear.test.ts` | wear grows on lawn while moving | 10 s of a moving visitor on one lawn tile: `WEAR[i]` ≈ 10 × 0.42 × ... > 4 is clamped to 4; after 1 s it is ≈ 0.42 (GV 1674-1681) |
| `wear.test.ts` | wear does not grow on gravel or wet lawn | the same on gravel: 0; on lawn with `WET > 0.5`: 0 |
| `wear.test.ts` | decay rates by threshold | `WEAR 0.5` → 0.49875 after `decayWear()`; `WEAR 3` → 2.99835 (GV 1683-1687) |
| `wear.test.ts` | findPavingRun needs 2.6 and returns ≥ 3 | a line of 5 tiles at WEAR 3 returns a run of 5; a line of 2 returns null; a tile within 2 of a fountain is never the seed (design §11.1) |
| `charm.test.ts` | one player bed and one gen fountain read 3 and 1 | `charmAt` on a tile within both radii: `{ total: 3, player: 1 }` (03 §6.7 done-when) |
| `charm.test.ts` | each static source counts once per tile | two beds within 3: `total === 1`; a fountain within 5 and a bandstand within 4: `total === 4` |
| `charm.test.ts` | the cap is 6 for both numbers | bed + fountain + bandstand + lit lamp + busker (+9 raw): `total === 6` |
| `charm.test.ts` | lamps count only when lit | the same lamp: `total` differs by 1 between f 0.50 and f 0.85; with `c_lamplight` active it counts at f 0.50 |
| `charm.test.ts` | river view is never player charm | a tile at y 5: `total >= 1`, `player === 0`; y 6: river contributes 0 |
| `charm.test.ts` | pair bonuses need the pairId | `setPairCharm(p, 'boat', until)`: `charmAt(x, y, p).total` is 4 more than `charmAt(x, y)` |

### 2.3 `src/entities/` (files `needs.test.ts`, `brain.test.ts`, `act.test.ts`, `astar.test.ts`, `move.test.ts`, `arrivals.test.ts`, `archetypes.test.ts`, `names.test.ts`, `caps.test.ts`, `creatures.test.ts`)

| File | Test | Assertion |
|---|---|---|
| `needs.test.ts` | hunger rises 0.5 per day | one visitor idle for 21,600 steps: `hunger` rose by 0.5 ± 0.001 |
| `needs.test.ts` | energy falls 0.6 per day awake and rises 0.4 on a bench | awake one day: −0.6; sitting one day: +0.4 (clamped to 1) |
| `needs.test.ts` | social rises 0.3 per day for an unpaired single and stays 0 while paired | single: +0.3; with `pairId` set: unchanged at 0 |
| `needs.test.ts` | comfort eases at 0.2 per s toward the target | comfort 0.2, target 0.7: after 1 s ≈ 0.29 (0.7 − 0.5 × 0.9967^60; GV 5579 idiom) |
| `needs.test.ts` | comfortTarget follows design §4.4 | clear day, no lamp: 0.7; rain 0.8: 0.42; night without a lit lamp within 3: 0.55; inside a sunbeam: +0.10 |
| `brain.test.ts` | rung 0 busy returns without deciding | `st = 'eat'`: `decide` leaves `st` and `job` unchanged |
| `brain.test.ts` | rung 1 reaction beats shelter | `pendingEmb = 'poop'` and rain 0.9, comfort 0.1: `st === 'wipe'`, `pendingEmb === null` |
| `brain.test.ts` | rung 2 shelter beats leave | rain 0.9, comfort 0.2, `leaveAt` passed: `st === 'shelter'` (a kiosk within 20) |
| `brain.test.ts` | rung 3 leave fires at leaveAt or comfort < 0.1 | `T.abs >= leaveAt`: `st === 'goLeave'`; comfort 0.05 with time left: `goLeave` |
| `brain.test.ts` | rung 4 eat beats rest | hunger 0.7, energy 0.1, a kiosk and a bench near: `st === 'goEat'` |
| `brain.test.ts` | rung 5 rest needs energy < 0.25 and a free bench within 15 | energy 0.2, bench at 10 tiles: `goSit`; bench at 16: not `goSit` |
| `brain.test.ts` | rung 6 romance beats the routine | a pair whose next stage is ready, both comfort ≥ 0.35: the lower id's decide sets both members' `st` to the stage state in the same tick |
| `brain.test.ts` | rung 6 waits for comfort 0.35 and retryT | comfort 0.3 on one member or `retryT > 0`: the routine runs instead |
| `brain.test.ts` | rung 8 wander when the routine returns nothing | an archetype with every activity blocked: `st === 'wander'` with a target within 6 |
| `brain.test.ts` | decide cadence is 0.5 to 1.3 s | 1000 cadences: all `decideT` in [0.5, 1.3] (GV 5696) |
| `act.test.ts` | every state has a case | for each `st` in `DOING`, `act` on a visitor in that state does not hit `default` (no `warn` event) |
| `act.test.ts` | default sets idle and warns once | `st = 'nonsense'`: `st === 'idle'` and exactly one `warn` event over 10 calls |
| `act.test.ts` | reaction lengths match design §6.4 | `wipe` 4, `shake` 3, `stumble` 3, `flap` 6, `huddle` 5, `baffled` 4, `duck` 5, `distracted` 30, `lost` ≤ 60, `chase` 8 then `huff` 3 |
| `astar.test.ts` | costs by kind | a straight 10-tile run on lawn, gravel, flagstone costs 10, 7.5, 7; the bridge tile 0.8 |
| `astar.test.ts` | blocked kinds are never crossed | 200 random pairs on the starter park: no path tile is bed, pond, canal (without a bridge) or non-passable `OCC` |
| `astar.test.ts` | no corner cutting | a diagonal step is refused when either orthogonal neighbour is blocked |
| `astar.test.ts` | the node budget returns a partial path | a target walled by hedges: a non-empty path ending at the closest reachable node, ≤ 2600 nodes expanded |
| `astar.test.ts` | apron and gates | a path to another visitor's `outside` tile fails; a path to the walker's own `gateOut` outside tile succeeds |
| `move.test.ts` | speeds by archetype | over 10 s on open lawn: adult 30 ± 0.5 tiles, child 26, elder 20, jogger 50, a strolling pair 24 |
| `move.test.ts` | arrival and waypoint radii, replan cooldown | the walker stops within 0.7 of the target; a blocked step replans no sooner than 0.6 s; gives up after 6 blocked steps and remembers the target 60 s (max 8) |
| `move.test.ts` | spaceOut reads no camera | `spaceOut` moves two overlapping idle visitors apart using `TW/2` and `TH/2` only; `NO_SPACE` states are untouched |
| `arrivals.test.ts` | targets by phase at seed 101 | at 8× from f 0.30: people 16 ± 3 at f 0.45 and 24 ± 3 at f 0.70; never above 30 (07 S4.7) |
| `arrivals.test.ts` | the gap is 6 to 14 s | consecutive arrival ticks differ by 360 to 840 steps while below target |
| `arrivals.test.ts` | per-archetype caps | over 3 days never more than 1 artist, 1 AI busker, 2 dog walkers at once; an over-cap roll becomes `single` |
| `arrivals.test.ts` | staff | the gardener exists at 10 s at `g_west` and never leaves; one vendor per kiosk; removing the kiosk removes the vendor |
| `arrivals.test.ts` | callVisitor refuses at 30 | 30 people: `callVisitor()` returns `reason.park_full` (GV 4489) |
| `archetypes.test.ts` | each routine state is reached | one seeded day: every archetype's states of design §4.3 appear at least once in `v.st` sampled each second |
| `archetypes.test.ts` | the jogger never sits and the child stays near | over a day: no jogger in `sit`; every child within 8 tiles of its parent at every sample |
| `names.test.ts` | the eight regulars are exact | names and `seeks` equal design §4.5 item 2 in order (Amélie f m, Juliette f m, Colette f any, Margot f m, Théo m f, Lucien m f, Baptiste m any, Rémi m f) |
| `names.test.ts` | 40 names per sex, no duplicate active name | `takeName('f')` 40 times gives 40 distinct names; the 41st reuses only after a `releaseName` |
| `names.test.ts` | a regular returns in 1 to 2 days at f 0.30-0.65 | after leaving on day 1, `nextVisitDay` is 2 or 3; the arrival `f` is in [0.30, 0.65]; at most 3 regulars arrive per day |
| `caps.test.ts` | 30 people, 12 pigeons, 4 dogs, 220 particles | force-spawn past each cap: the count never exceeds it; cameos do not count toward 30 |
| `creatures.test.ts` | pigeons start at 6 and top up every 90 s | 6 at a new park; 7 at 90 s; 12 at 540 s; still 12 at 630 s |
| `creatures.test.ts` | scatter triggers | a jogger within 2, a dog within 3, the pomeranian within 3, a child's chase within 1: pigeons enter `scatter` for 3 s and move 3 tiles |
| `creatures.test.ts` | crumbs attract at most 5 and vanish at stock 0 or 60 s | 8 pigeons within 10: 5 at the crumbs; stock 1 pecked once: the prop is gone; untouched crumbs are gone at 60 s |
| `creatures.test.ts` | fog perches every pigeon | during `m_fog` all pigeons are in `perch` |

### 2.4 Romance and tone (files `romance.test.ts`, `tone.test.ts`)

| File | Test | Assertion |
|---|---|---|
| `romance.test.ts` | a pair forms only under the six conditions | two singles 4 tiles apart with LOS, both idle, compatible: `tryForm` returns a pair on a passing roll; at 5 tiles, or without LOS, or one at `sit`, or `seeks` mismatched, or one a child: null |
| `romance.test.ts` | the 50 % roll is once per pair per day | a failed roll: a second `tryForm` the same day returns null without a draw (`rngN` unchanged); next day it rolls again |
| `romance.test.ts` | starting affinity is rnd(0.2, 0.4) and stage 1 | 200 formed pairs: all affinities in [0.2, 0.4); `stage === 1`; `a < b` |
| `romance.test.ts` | mist shrinks formation range to 2 | mist 0.78: 3 tiles apart → null; 2 tiles → pair |
| `romance.test.ts` | regulars with memory and the matchmaker skip the roll | both paths form a pair with `rngN` unchanged by the roll |
| `romance.test.ts` | a couple arrives as a Pair at stage 3 with affinity in [0.55, 0.70] | 200 arriving couples: both members share one `pairId`, `pair.stage === 3`, affinity in [0.55, 0.70], no `PAIR_ROLL` draw and no `feed.pair.formed`; a returning alumni couple has affinity 0.70 exactly (register 3.4, 3.5) |
| `romance.test.ts` | stage gates are exact | with every prerequisite present, `nextStageReady` is false at affinity 0.299 and true at 0.30 for Chat; likewise 0.45, 0.55, 0.65, 0.80, 0.90 for Bench, Stroll, Picnic, Kiss, Proposal |
| `romance.test.ts` | a prerequisite missing means linger, not skip | affinity 0.50 and a free bench within 8: Bench starts, never Stroll; affinity 0.80 with no fountain, lamp or golden/evening phase: the pair stays at stage 5 and repeats Picnic |
| `romance.test.ts` | stage durations | Notice 4 s; Chat in [20, 30]; Bench in [40, 60]; Stroll 60; Picnic in [50, 80]; Kiss 10; Proposal 15 (sim seconds at 1× and the same tick counts at 8×) |
| `romance.test.ts` | a completed stage gives 0.08 | affinity before + 0.08 = after, clamped at 1 |
| `romance.test.ts` | charm converts every 10 s together | `charmAt(mid).total === 3` for 100 s together: affinity + 0.12 ± 0.004; apart (5 tiles): + 0 |
| `romance.test.ts` | decay is 0.1 per day apart | a pair apart across a `newday`: affinity − 0.1; a regular's memory decays the same between visits |
| `romance.test.ts` | an interrupted stage gives nothing and sets retryT | an embarrassment during Bench: no +0.08, `retryT === 30`; during Kiss or Proposal: 60 |
| `romance.test.ts` | the initiator is the lower id | `pair.a < pair.b`; the stage state is set on both in the tick `a` decides |
| `romance.test.ts` | Kiss needs the setting or a fountain or a lit lamp | at f 0.50 with nothing near: not ready; within 3 of a fountain: ready; within 3 of a lamp at f 0.85: ready; in rain 0.5 without `c_umbrella`: not ready |
| `romance.test.ts` | Proposal same day needs 0.95 | formation day, affinity 0.92 at a romantic spot: not ready; 0.95: ready; a regular pair on a later visit at 0.92: ready |
| `romance.test.ts` | Happily on stage 7 | completing Proposal: `dissolve(p, 'happily')`, one `happily` event, both leave together by one gate, an `alumni` entry, regulars keep `partnerId` |
| `romance.test.ts` | Parted by affinity | affinity 0.19 at stage 2: `parted` event, `huff` 6 s on both, two different `gateOut`; at stage 1 with 0.19: no ending |
| `romance.test.ts` | Parted by three embarrassments | `pair.embToday === 3` at stage 3: Parted; at stage 2: not Parted |
| `romance.test.ts` | one visitor is in at most one pair | a paired single is skipped by `tryForm` for a third single |
| `romance.test.ts` | featured is highest stage then earliest formedDay then lowest id | three pairs at stages 3, 5, 5: the stage-5 pair with the earlier `formedDay`; a pin overrides until the pinned pair dissolves |
| `romance.test.ts` | seed S_HAPPILY reaches Happily and S_PARTED reaches Parted | the two seeds recorded in the file (found by scanning seeds 1 to 200) produce the named ending within 3 days (07 S5.7 item 2) |
| `romance.test.ts` | pillar P3 | on seeds 101 to 110 at 1× on the unmodified starter park a pair exists within 2 sim minutes |
| `tone.test.ts` | the ten kinds in order | `EMB_KINDS` equals `['poop','soaked','trip','snatched','wasp','drenched','rival','mime','fog','flock']` |
| `tone.test.ts` | a child is never a target | `land(kind, childId, side)` returns `reason.not_children` for every kind; `canTarget(child)` false; a child inside `m_sprinkler`, `m_raincloud`, `m_flock` keeps `embToday === 0` |
| `tone.test.ts` | the cost table | base × factor: `poop` at stage 2 costs 0.08, stage 4 costs 0.10, stage 6 costs 0.12; `rival` at stage 7 costs 0.15 (cap) |
| `tone.test.ts` | comfort drops 0.3 and embToday counts | after a landing: victim comfort − 0.3 (clamped), `victim.embToday + 1`, `pair.embToday + 1` |
| `tone.test.ts` | the 4th landing fails before anything | three landings then `land`: `reason.enough_today`; comfort, affinity, cooldown and charges unchanged |
| `tone.test.ts` | embToday resets at f 0 | `embToday === 3` on day 1: 0 after the `newday` step |
| `tone.test.ts` | backfire is 15 % with the partner within 4 | 400 seeded landings with the partner at 2 tiles: backfires between 40 and 80; with the partner at 6 tiles: 0 |
| `tone.test.ts` | a backfire gives +0.04, no comfort loss, no MP, no embToday | after a forced backfire (seed chosen so the roll passes): affinity + 0.04, comfort unchanged, `embToday` unchanged, no `embarrassed` event with `landed: true` |
| `tone.test.ts` | staff score 0; a couple member scores like any pair | `land('poop', gardenerId)` plays the reaction and emits no points; `land('poop', coupleMemberId)` costs the couple's affinity and emits MP +1 |
| `tone.test.ts` | rival lands only on a pair member | `land('rival', unpairedId)` has no effect and returns ok false with `reason.not_courting` |
| `tone.test.ts` | no reaction longer than 8 s except distracted and lost | every reaction length in `act.ts` ≤ 8 except `distracted` 30 and `lost` 60 (design §13 Do-not) |
| `tone.test.ts` | no forbidden word in any string | no value in `en` or `es` contains hurt, injured, hospital, blood, dead, died (case insensitive); ES list in section 9 |

### 2.5 `src/play/` (files `progression.test.ts`, `abilities.test.ts`, `tools.test.ts`, `undo.test.ts`, `avatar.test.ts`, `mode.test.ts`)

| File | Test | Assertion |
|---|---|---|
| `progression.test.ts` | CP needs a contribution | a stage completed with `charmAt(mid).player >= 2`: +1 CP; with `player === 1` and no Cupid action in 60 s: +0; with a `c_bouquet` cast 59 s before: +1; 61 s before: +0 |
| `progression.test.ts` | Happily is +5 CP without attribution | +5 even with `player === 0` |
| `progression.test.ts` | MP needs a paired victim and a landing | landed on a pair member +1; on an unpaired single 0; backfire 0; Parted +5 |
| `progression.test.ts` | tiers at 0, 8, 20, 40, 70 | `tier('cupid')` is 0 at 7, 1 at 8, 2 at 20, 3 at 40, 4 at 70; the ladders are independent |
| `progression.test.ts` | the unlock table | crossing 8 CP unlocks exactly `c_musician`, `c_sunbeam`, `a_florist`; 8 MP exactly `m_peel`, `m_pomeranian`, `a_pomeranian` (design §7.4 rows) |
| `progression.test.ts` | each unlock toasts once | reaching 8 twice (reload the profile) emits one `unlock` per id in total |
| `progression.test.ts` | points persist across parks | `park.new` keeps `profile().cp/mp`; `dayTally()` resets to 0 at `newday` after the `feed.tally` event |
| `abilities.test.ts` | the registry has 19 ids with the register's tiers, cooldowns and charges | ids and columns equal register §3.8 exactly; 9 `c_*`, 10 `m_*`; charges 1 only on `c_fireworks` and `m_flock` |
| `abilities.test.ts` | cast succeeds once then returns cooldown | `c_petals` on lawn: ok; at once again: `reason.cooldown`; ok again after 30 sim s (1800 ticks) at 1× and at 8× |
| `abilities.test.ts` | charges reset at f 0 | `c_fireworks` twice in an evening: second is `reason.no_charges`; after `newday` it is ok again |
| `abilities.test.ts` | a locked id spends nothing | tier 0 profile: `c_musician` → `reason.locked`; cooldowns and charges unchanged |
| `abilities.test.ts` | failure keys per ability | one case per `fails when` cell of design §9.2-9.3 returns its 03 §5.4 key: `c_bouquet` unpaired → `reason.not_courting`; `c_umbrella` dry → `reason.not_raining`; `c_lamplight` no lamp → `reason.no_lamp`; `c_fireworks` at f 0.50 → `reason.not_evening`; `c_rowboat` on 11 tiles → `reason.pond_small`, on ice → `reason.iced`; `m_pigeon` child → `reason.not_children`; `m_peel` on lawn → `reason.not_here`, on snow → `reason.slippery`; `m_pomeranian` no item → `reason.no_item`; `m_wasp` not at Picnic → `reason.not_at_picnic`, rain → `reason.no_wasps_rain`; `m_raincloud` in a sunbeam → `reason.in_sunbeam`; `m_fog` at mist 0.7 → `reason.already_misty`; `m_flock` empty → `reason.nobody_inside` |
| `abilities.test.ts` | validation happens again inside apply | a target that became invalid between `enqueue` and `applyPending` (the visitor left) is rejected and spends nothing |
| `abilities.test.ts` | effects cap at 64 and clean up at until | the 65th cast returns `reason.too_many_effects`; a `c_petals` effect removes its charm source at t 20 and `PETALS` fades at 1/40 per s |
| `abilities.test.ts` | cupid casts stamp lastCupidAt within 6 tiles | a pair 5 tiles from a `c_petals` centre has `lastCupidAt === T.abs`; at 7 tiles unchanged |
| `tools.test.ts` | the 16 ids exist and each places | `TOOLS` ids equal register §3.7 in order; for each id except `hand` one valid command changes `stateHash()` |
| `tools.test.ts` | ranked reasons in order | one case per key of 03 §5.4's tools block: outside, gateway, on_water, taken, on_flowers, near_railings, lawn_only or not_here, has_bandstand, enough_kiosks; a tile failing two checks reports the earlier one (GV 5972-5975 idiom) |
| `tools.test.ts` | bridge reasons | land tile → `reason.not_on_water`; a visitor on the span → `reason.someone_on_it`; 5 wide → `reason.too_wide`; 1 to 4 wide places with `span` equal to the width |
| `tools.test.ts` | runs | a hedge tap off the row or column → `reason.straight_line`; a 15th tile → `reason.run_too_long`; 14 tiles place |
| `tools.test.ts` | brushes skip invalid tiles silently | a size-3 path stroke half on the pond changes only the lawn tiles and returns ok; a stroke that changed nothing reports the centre tile's reason |
| `tools.test.ts` | repeat taps | `bed` on a bed cycles rose → lavender → marigold → white → rose; `bench` on a bench rotates 0 → 1 → 2 → 3 → 0; `tree` on a tree removes it; `tree` species cycle plane → chestnut → lime |
| `tools.test.ts` | caps and margins | a 2nd bandstand → `reason.has_bandstand`; a 4th kiosk → `reason.enough_kiosks`; a fountain touching the boundary → `reason.near_railings`; the 601st prop → `reason.park_full_props` |
| `tools.test.ts` | kiosk and remove side effects | placing a kiosk spawns one vendor and two tables; `remove` on it removes the vendor and the tables; `remove` on a bench stands its sitters up |
| `tools.test.ts` | ghost is pure | `ghost()` twice on the same input returns equal results and changes no layer, no prop and `rngN` |
| `undo.test.ts` | every tool undoes to the same hash | for each tool: `h0 = stateHash()`, command, `undo` → `stateHash() === h0` (visitors frozen with speed 0) |
| `undo.test.ts` | ten deep | 11 strokes then 11 undos: the 11th returns `reason.nothing_to_undo`; the first stroke stays |
| `undo.test.ts` | a stroke is one entry | 7 brush commands with one `stroke` id undo in one `undo` |
| `undo.test.ts` | undo restores ids and vendors | a removed kiosk comes back with its old `PropId`, its vendor and its tables; `OCC` matches |
| `undo.test.ts` | undo is logged and cleared | `log()` contains the `undo` command; `park.new` and `avatar.enter` give `canUndo() === false` |
| `undo.test.ts` | undo never touches the rest | a Parted pair, a cooldown and the clock are unchanged by `undo` |
| `avatar.test.ts` | enter sets mode and player, spawns only when absent | each of the six avatars: `getMode() === 'avatar'`, `getPlayer()` is a live actor id; a second enter with the actor present spawns nothing |
| `avatar.test.ts` | locked avatars are refused | tier 0: `a_florist` → `reason.locked` |
| `avatar.test.ts` | leave returns the actor to AI | after `avatar.leave`: `getMode() === 'creator'`, `getPlayer() === 0`, the actor's next cadence runs `decide`; a florist's `leaveAt` becomes finite |
| `avatar.test.ts` | the cascade order per avatar | one test per row of design §10.4-10.9: the tap returns the row's status key and sets the row's state; `PLAYER_HOLD` states return `reason.busy` first; a stale `hit.id` falls through to walking |
| `avatar.test.ts` | avatar refusals | pigeon on a child → `reason.not_children`; on `embToday 3` → `reason.enough_today`; with a dog within 2 → `reason.startled`; pomeranian with a walker's dog within 3 → `reason.big_dog`; florist with basket 0 → `reason.basket_empty`; florist on an unpaired single → `reason.not_courting`; matchmaker with no compatible single within 12 → `reason.nobody_for_them` |
| `avatar.test.ts` | avatar actions score as the ability | pigeon swoop on a paired adult: `poop` lands and +1 MP; florist bouquet: affinity +0.05 and `lastCupidAt` set; matchmaker introduce forms a pair without a roll |
| `avatar.test.ts` | the avatar is never a pair member | a possessed matchmaker is skipped by `tryForm` |
| `mode.test.ts` | one variable, one branch | `getMode`/`getPlayer` are the only mode reads in `entities/` (grep `MODE` and `PLAYER` under `src/entities/` returns only the cadence branch of 03 §4.4); `romance.ts`, `needs.ts`, `weather.ts` import nothing from `play/mode.ts` |
| `mode.test.ts` | park.new forces creator | in avatar mode `park.new` → creator, `PLAYER 0`, a player-spawned actor discarded (GV 12107) |

### 2.6 Save (files `save.test.ts`, `migrate.test.ts`)

| File | Test | Assertion |
|---|---|---|
| `save.test.ts` | the round trip keeps the hash | `h = stateHash()`; `restore(JSON.parse(JSON.stringify(snapshot())))`; `stateHash() === h` after 1000 more ticks on both paths |
| `save.test.ts` | no object reference in a saved field | a recursive walk of `snapshot()` finds only numbers, strings, booleans, null, arrays and plain objects; every `*Id` field is a number |
| `save.test.ts` | typed arrays survive as base64 | `KIND`, `WEAR`, `OCC`, `WATER`, `ICE`, `WET`, `PETALS`, `BEDC`, `PAVEDAY` are byte-equal after the round trip |
| `save.test.ts` | the excluded things are excluded | the snapshot has no undo stack, camera, selection, armed tool, toast, particles or `T.speed` (03 §3.10) |
| `save.test.ts` | size under 1 MB | the starter park with 100 extra props and 30 visitors serialises under 1,048,576 bytes; the 600-entry log included |
| `save.test.ts` | keys and autosave triggers | `savePark()` writes `parque:park-v1` and `parque:profile-v1`; `stepAutosave` writes at 30 sim s and not at 29; a thrown `localStorage` error is caught and emits one `warn` |
| `save.test.ts` | mode and player are restored | save in avatar mode: `restore` gives `getMode() === 'avatar'` and the same `PLAYER` |
| `migrate.test.ts` | a v0 fixture migrates | `migratePark(fixtures/park-v0.json)` returns `v === 1` and `restore` succeeds; `migrateProfile` likewise |
| `migrate.test.ts` | garbage is refused, not thrown | `migratePark('{bad')`, `migratePark({ v: 99 })`, `migratePark(null)` return null without throwing |
| `migrate.test.ts` | the profile falls back to defaults | a missing profile gives `cp 0, mp 0, tierC 0, tierM 0, settings.lang 'en', speed 1, muted false, stylePick null, musicPick null` |

### 2.7 i18n and content (files `strings.test.ts`, `content.test.ts`, `colour-literals.test.ts`, `palette.test.ts`)

| File | Test | Assertion |
|---|---|---|
| `strings.test.ts` | key parity | `Object.keys(en)` equals `Object.keys(es)` as sets and both are non-empty |
| `strings.test.ts` | suffix pairs | every `.one` has `.other`; every `.f` has `.m`, in both tables |
| `strings.test.ts` | every t() literal exists | grep `src/` for `t('...')`, `plural('...')`, `gender('...')`, `data-t="..."`, `data-t-aria="..."` and every `reason.*`, `feed.*`, `doing.*`, `avatar.status.*` id used in code: each key is in `en` |
| `strings.test.ts` | no user-facing literal outside strings | no `textContent =`, `innerText =`, `toast(`, `pushFeed(` call in `src/` outside `src/ui/strings/` receives a quoted string with a space in it |
| `strings.test.ts` | doing covers every act state | for each state in `act.ts: DOING`, `en['doing.' + st]` exists |
| `strings.test.ts` | ability, avatar, tool, stage, weather, archetype keys | for each id: `ability.<id>.name` and `.hint`; `avatar.<id>.name`, `.hint1`, `.hint2`, `.hint3`; `tool.<id>.label`, `.hint`; `stage.<id>`; `weather.<id>`; `archetype.<id>` |
| `strings.test.ts` | nested keys resolve after a language switch | a stored `{ key, params }` entry `{ key: 'hud.romance.pair', params: { a: 'Amélie', b: 'Théo', stage: '@stage.bench' } }` renders the ES stage word after `setLang('es')` |
| `strings.test.ts` | plural and gender helpers | `plural('sheet.census.room', 1)` uses `.one`; `2` uses `.other`; `gender('card.rel.single', 'f')` uses `.f` |
| `strings.test.ts` | a missing key returns the key and warns once | `t('no.such.key')` returns `'no.such.key'`; two calls emit one `warn` |
| `strings.test.ts` | no TODO in ES at release | no value in `es` equals `'TODO'` (skipped until the translation task; enabled in section 8) |
| `content.test.ts` | the register's spellings | 16 tool ids, 19 ability ids, 6 avatar ids, 7 stage names (`Notice, Chat, Bench, Stroll, Picnic, Kiss, Proposal` via `t('stage.*')` in EN), 10 embarrassment kinds, 8 weather kinds, 11 displayed archetype names in EN, exactly the register §3 and §5 spellings (brief §9 row 11) |
| `content.test.ts` | tiers and caps | `TIERS` equals `[0, 8, 20, 40, 70]`; the cap constants of 06 §1.4 equal their values |
| `colour-literals.test.ts` | no colour literal outside two files | grep `src/` for `#[0-9a-fA-F]{3,8}\b`, `rgb(`, `rgba(`, `hsl(`: hits only in `src/render/ambient.ts` and `src/styles/tokens.css` (04 §4.5 item 3) |
| `colour-literals.test.ts` | no Math.random or Date.now | grep `src/` for `Math.random`, `Date.now`, `performance.now`: hits only in `src/core/loop.ts` |
| `palette.test.ts` | every Palette key in all three palettes | every key of `Palette` exists in `PALETTES.A`, `.B` and `.C`; a string value matches `#[0-9A-Fa-f]{6}`; an array value holds only such strings (04 §4.5 item 1; 07 S1.8) |

### 2.8 Audio (files `limiter.test.ts`, `cues.test.ts`, `melody.test.ts`, `musicState.test.ts`, `scheduler.test.ts`, `mute.test.ts`; 05 §8.2 owns the details)

| File | Test | Assertion |
|---|---|---|
| `limiter.test.ts` | the gap scales by speed | `gate('x', 100, false)` at speed 8 refuses until 800 ms; `gate('x', 100, true)` until 415 ms (GV 6131-6137) |
| `limiter.test.ts` | audibility before the gate | a cue with gain ≤ 0.02 leaves the kind's gap unchanged (review §8 fix) |
| `cues.test.ts` | the 38 ids in order, gains ≤ 0.060 | `Object.keys(CUES)` equals 06 §17 in order; no gain above 0.060 |
| `cues.test.ts` | every trigger fires in a 3-day run | each event kind named in 06 §17 is emitted at least once by the determinism fixture |
| `melody.test.ts`, `musicState.test.ts`, `scheduler.test.ts` | as 05 §8.2 items 3 to 5 | reproducible phrases on a seeded `vrng`; the state priority table; `rngN` unchanged by the audio scheduler |
| `mute.test.ts` | muted survives a reload and silences tone | `settings.muted` saved as true is true again after the profile is reloaded; while `isMuted()` is true, `tone()` schedules nothing (07 S8.8; 05 §7.3) |

### 2.9 Render, UI and build (files `project.test.ts`, `order.test.ts`, `pick.test.ts`, `seasons.test.ts`, `perf.test.ts`, `bundle.test.ts`, `tests/ui/overlays.test.ts`, `tests/ui/rail.test.ts`, `tests/ui/intro.test.ts`, `tests/ui/a11y.test.ts`; the four under `tests/ui/` run under jsdom)

| File | Test | Assertion |
|---|---|---|
| `project.test.ts` | screenToTile inverts screenOf | at angles 0, π/2, π, 3π/2 and zooms 0.30, 1.3, 2.4: `screenToTile(screenOf(x, y))` returns (x, y) for 50 random tiles |
| `project.test.ts` | the constants | `TW 26`, `TH 13`, `EH 26`, `VANCH 0.46`; `fitCam` zoom within [0.30, 3.0] and centred on (23.5, 23.5) |
| `order.test.ts` | stable ties | two drawables with equal depth sort by lower id first, on every call |
| `pick.test.ts` | priority people > creatures > props > tile | a figure over a bench: the visitor; the bench alone: the prop; lawn: the tile; off canvas: none; the fountain at all four angles returns its id |
| `overlays.test.ts` | layoutOverlays stacks from the rail height | with `#rail` 120 px high, `#card` and every sheet get `bottom: 128px`; `#hint` sits above an open card (GV 10689) |
| `rail.test.ts` | the rail is data driven | `buildRail` renders 16 Park, 9 Cupid, 10 Mischief pills from `RAIL`; locked pills have `.locked` and the tier word; `#size` max is 3 |
| `rail.test.ts` | avatar body class hides the park strip | `body.avatar`: `#tools`, `#sizewrap`, `#bUndo` hidden; the hint strip shown (GV 169) |
| `intro.test.ts` | Continue only with a save; language persists | `showIntro(false)` hides `#bContinue`; `showIntro(true)` shows it; tapping ES sets `<html lang="es">` and `profile().settings.lang === 'es'` |
| `seasons.test.ts` | crown phase by day and the season tint blend | spring at 0.5 d elapsed: `crownPhase` is `bud`; 1.5 d: `blossom`; 2.5 d: `leafing`; autumn 2.5 d: `thin`; winter: `bare` (04 §6.3 item 1); the lawn tint is the old season's triple at the season change, the midpoint 0.25 day later and the new triple at 0.5 day (03 §7.3 item 6) |
| `perf.test.ts` | quality steps down after 180 frames over 22 ms and never up | `ftNote` with draw EMA 23 ms for 179 frames: `qualityLevel() === 0`; the 180th: 1; 180 more: 2; then 1000 frames at 8 ms: still 2 (03 §13) |
| `a11y.test.ts` | every button has a name and no text under 11 px | every `button` in `index.html` has non-empty text or an `aria-label`; no `font-size` in the built CSS is below 11 px (brief §3.1 item 5; 07 S11.8) |
| `bundle.test.ts` | the production bundle is self-contained | `dist/index.html` contains no `__PD` and no `http` URL (07 S11.8; section 8 item 3) |

---

## 3. Determinism harness

### 3.1 What the harness exposes

`window.__PD` is installed only in a dev build (03 §13; GV `window.__GV` 12223-12241). The tests in this section use: `simulate(n)`, `tick()`, `rngN()`, `hash()`, `setSpeed(v)`, `enqueue(cmd)`, `log()`, `replay(cmds)`, `snapshot()`, `restore(s)`, `newPark(seed)`, `setWeather(kind)`, `callVisitor()`, `draw()`, `pix(x, y, w, h)`, `FT`, `SP`, `audio.dryRun(on)`. The screenshot members `seedVisual(seed)` and `fxStep(dt, n)` of 03 §13 (Screenshots group) touch the visual stream and particles only.

`hash()` is `store.stateHash()`: FNV-1a over `tick`, the sim RNG state and draw count, the weather block, the nine saved layers and the canonical JSON of props, visitors, pairs, creatures, effects, sides, regulars, alumni, tally, mode and the profile's `cp`/`mp`, arrays sorted by id. Excluded: feed, log, pinned pair, visual RNG, speed (03 §11). A test that needs the excluded parts asserts on them by name.

### 3.2 `tests/determinism.test.ts` (Vitest, no browser)

1. Fixture `tests/fixtures/det-s<N>.json`: `seed 101`, `steps 64800` (3 days: 60 steps × 360 s × 3, brief §9 row 5), a command list. S2 ships 12 commands (`speed` changes and `debug setWeather`, 07 S2.6 item 15); each later slice appends its own (S3 four tool commands, S6 eight ability commands, S7 `avatar.enter a_pigeon`, six `avatar.tap`, `avatar.leave`) and records the new `rngN` and `hash` in the hand-back.
2. Run 1: `newPark(101)`, enqueue the fixture commands at their ticks, `simulate(64800)`; record `hash()`, `rngN()`, `tick()`.
3. Run 2: the same from scratch; assert `hash`, `rngN` and `tick` equal run 1.
4. Run 3: the same plus one extra `setWeather('rain')` at step 30,000; assert `hash` differs from run 1 (the test proves it is not vacuous).
5. Run 4 (speed invariance, 03 §4.5): run 1 again but driving `simulate(SIM_DT, 3)` instead of `lite 1`, in batches of 22 steps (`nsMax` at 8×); assert `hash` equals run 1.
6. Run 5 (replay): `snapshot()` at step 20,000 of run 1, continue to 21,000, `h1 = hash()`; `restore`, `replay(log(), 21000)`; assert `hash() === h1` and visitor positions and pair affinities equal to the last bit (design §14.5).
7. Run 6 (save round trip inside the run): at step 40,000 `restore(JSON.parse(JSON.stringify(snapshot())))`, continue to 64,800; assert `hash` equals run 1.
8. Run time budget: the whole file under 90 s on the CI machine; if it is slower, profile the sim, do not shorten the run.
9. Done when: all six runs pass on the fixture of the current slice and the values are listed in the hand-back (07 §0.6 item 4).

### 3.3 Where two runs part

1. On a failure, bisect by `rngN`: run both paths and record `hash()` every 600 steps; the first differing window is at most 600 steps wide; then step by step inside it with `rngN()` after each step (GV 588 comment: "rngN counts draws so a harness can tell where two runs part").
2. Usual causes (03 §16 risk 1): `Math.random`, `Date.now`, `performance.now` inside the sim; iteration over a `Set` or object keys; a camera or DOM read; a real-time timer; the visual stream used for a sim decision.
3. The fix is never a wider tolerance; the hash must be equal.

### 3.4 `tools/det.mjs` (browser, dev build)

1. Launch Chromium (`/opt/pw-browsers/chromium`, headless) with `--autoplay-policy=no-user-gesture-required`; open `<url>#s=101&halt&dev`; click `#begin`; wait for `window.__PD`.
2. `__PD.audio.dryRun(true)`; enqueue the fixture; `__PD.simulate(64800)` in chunks of 2000 inside `page.evaluate` so the page stays responsive; read `hash()` and `rngN()`.
3. Repeat in a fresh page; assert equal. Then a third page at `setSpeed(8)` run by the real loop for 3 sim days (poll `tick() >= 64800`, then `setSpeed(0)` and `simulate(64800 - tick())` for the remainder); assert the same `hash` at the same `tick`.
4. Also assert: zero console errors; `__PD.audio.log.length === 200` (05 §8.3); `rngN` equals the Vitest value for the same fixture.
5. Exit non-zero on any mismatch and print both hashes and the first differing 600-step window.

---

## 4. Screenshot regression

### 4.1 Tooling

1. `tools/shot.mjs` with puppeteer-core and the Chromium at `/opt/pw-browsers/chromium`. Flags: `--no-sandbox`, `--font-render-hinting=none`, `--disable-lcd-text`, `--autoplay-policy=no-user-gesture-required`, `--use-gl=swiftshader`. The build plan's `npm run shot -- <slice>` is this script (03 §14).
2. Two viewports: **phone** 390 × 844 at `deviceScaleFactor 3`, **desktop** 1280 × 800 at `deviceScaleFactor 2` (04 §12 item 8).
3. Two modes. **Smoke** opens `dist/index.html` from `file://`, clicks `#begin`, sets `#spdR` to 8, waits 3 sim days by polling `data-day` on `body`, captures `shots/<slice>-smoke-<viewport>.png`, fails on any console error (brief §9 row 2). **Scenes** open the dev server URL with `#s=<seed>&halt&dev` and use `__PD` to build each scene of 4.2.
4. Every scene run: `setSpeed(0)` before capture; `__PD.seedVisual(seed)` then `__PD.fxStep(1/60, 120)` to put particles in a reproducible state; `#hint` and `#perf` hidden by the script; `__PD.draw()`; capture.
5. Fonts are bundled, so text renders the same on every machine; a screenshot taken with a system fallback font is invalid (check `document.fonts.check('12px Figtree')` before capture).

### 4.2 Scenes

| Id | Name | Setup (after `newPark(101)`) | Viewports | Must show |
|---|---|---|---|---|
| A | empty park morning | tick 0, f 0.30, spring day 1, `fair`, zoom 1.3, angle 0, no visitors (the gardener arrives at 10 s, so none yet) | phone, desktop | fountain, two loops, five spokes, pond and bridge, six benches, two beds, kiosk and tables, four unlit lamps, twelve trees, railings, quay and river, facades (near side cut away), skyline with the Eiffel Tower, the four chips, the three-row rail, nothing under a safe area |
| B | starter park golden hour | `simulate` to f 0.76 of day 1 with the S4 fixture commands (visitors near the cap), zoom 1.3, angle 0 | phone, desktop | warm tint peaking, long shadows absent (none in v1), lamps off, at least 10 figures with signifiers, pigeons, the clock chip "Golden hour · Day 1 · Spring" |
| C | winter snow | `simulate` to day 10 f 0.50 (winter day 1), `setWeather('snow')`, `simulate(5400)` (90 s: snow eased to 0.8, `ICE 1` after 60 s), zoom 1.3, angle 0 | phone, desktop | bare trees, snow cover on lawn, the frozen pond, snow overlay, the snow weather dot, fewer visitors |
| D | a bench date | seed `S_HAPPILY` of `romance.test.ts`; `simulate` until `pairs[0].stage === 3` and both in `sit`; `setSpeed(0)`; select pair member `a` (pair card) | phone at angles 0, 1, 2, 3; desktop at angle 0 | the pair side by side on one bench at every quarter turn with neither figure drawn behind the bench (03 §16 risk 8), hearts, the pair card with the Heart bar and Pin, the Romance chip naming them |
| E | fireworks | profile `cp 70`; `simulate` to day 1 f 0.90; `enqueue` `c_fireworks` on `park`; `simulate(180)` (3 s); `fxStep` as 4.1 item 4 | phone, desktop | lamps lit with halos, fireworks particles over the fountain, every pair's hearts, the Points chip, the feed line `feed.cast.c_fireworks` |

Baselines: `tests/baseline/<id>-<viewport>[-a<angle>].png`, 13 files. Each slice that changes the look regenerates only the baselines its "Done when" names and says so in the hand-back.

### 4.3 Pixel diff

1. The diff runs inside Chromium: the script loads the new PNG (base64 from `page.screenshot`) and the baseline PNG into two `<img>` in a blank page, draws both to canvases and compares `getImageData` arrays. No PNG library is needed; `pixelmatch` plus `pngjs` as dev dependencies is an allowed alternative (section 9 item 6).
2. A pixel differs when any channel differs by more than 24 of 255.
3. A scene fails when more than 0.5 % of pixels differ; scenes C and E (weather overlay, particles) fail above 2.0 %.
4. A size mismatch is a failure (the viewport or `deviceScaleFactor` changed).
5. The script writes `shots/<id>-<viewport>.diff.png` (differing pixels in magenta) for every failure.

### 4.4 When a baseline may change

1. After the Style Gate pick is recorded in the register §4: regenerate all 13 once, in the S2 hand-back.
2. When a slice's "Done when" names a new or changed look for a scene (a new prop, the rig, the lamp halo): regenerate those scenes only, attach before and after to the hand-back.
3. Never because a test is red for an unknown reason. Find the cause first (section 3.3 for sim causes; a changed `vrng` draw order for visual causes).
4. `npm run shot -- --update <id>` overwrites a baseline; the command is listed in the hand-back item 2.

### 4.5 What makes screenshots deterministic (requirements on the code)

1. The weather overlay's time term is sim time (`T.abs × DAYLEN`), never `performance.now()` (GV `drawWeather` 10072 uses `now`; Parque does not; section 9 item 4).
2. `ambientFx` runs only when `T.speed > 0`, so a paused scene spawns nothing (GV 8820 runs every frame).
3. The sky cache key includes `T.abs` rounded to 1/60 day, not wall time.
4. Particles step on `fxStep` from the script, never on a wall-clock `dtr` while paused (03 §4.1 item 7 multiplies by `T.speed`, which is 0 when paused).
5. No toast is visible: the script hides `#hint`; no perf overlay: `body.dev` without the double tap.

---

## 5. Performance budgets

### 5.1 Budgets (03 §15.1 and §7.9; 390 × 844, dpr 2, zoom 1, the caps scene)

| Measure | Budget | Read from |
|---|---|---|
| One sim step | ≤ 2.5 ms: visitors 1.2, creatures 0.3, romance and abilities 0.3, weather and wear 0.3, commands 0.1 | `__PD.SP` laps divided by steps (GV `SP` 12014) |
| Draw | ≤ 8.6 ms: ambient 0.1, sky 0.3, apron 0.3, ground 2.5, water 0.4, drawables 4.0, ghost 0.2, overlay 0.8 | `__PD.FT.draw` EMA; per-phase laps in `DBG.lap` |
| HUD DOM | ≤ 0.4 ms per 0.35 s refresh | `FT.frame − FT.sim − FT.draw` averaged |
| Frame at 1× on desktop Chromium | sim + draw ≤ 12 ms; frame EMA ≤ 16.7 ms over 60 s (brief §9 row 3) | `#perf` or `FT` |
| Frame at 8× | ≤ 20 ms sim for 8 steps; the loop stays under the 26 ms budget and runs behind the dial rather than dropping frames (GV 12076-12086) | `FT`, `tick()` versus wall time |
| Phone (mid range) | 60 fps target, 50 fps floor; a report, not a gate, until the Capacitor slice (brief §9 row 4) | `#perf` on the device |
| Quality step-down | `qualityLevel()` stays 0 on desktop through the 60 s run; on the phone it may reach 1 (halos and ribbons off) but not 2 | `__PD.FT.stepped` |
| Memory | layers 64 KB (nine saved layers 53 KB plus `E` and `BLOCK`); tree sprite cache ≤ 1400 canvases; `GC` memo ≤ 900 keys; no growth over 12 sim days at 8× | DevTools Memory, `__PD.DBG` counters |
| Save size | `parque:park-v1` < 1 MB (150 KB expected) | `localStorage.getItem(key).length` |
| Build size | `dist/index.html` ≤ 1.2 MB with fonts ≤ 400 KB (brief §11 item 1; section 9 item 7) | `ls -l dist` |

### 5.2 The caps scene and `tools/perf.mjs`

1. Dev build, `#s=101&halt&dev`, Begin, `audio.dryRun(true)`.
2. `simulate` to day 1 f 0.90 (evening: lamps lit, halos on). `callVisitor()` until 30 people. Pigeons reach 12 by top-up on the way. Cast `m_pomeranian` once and keep two dog walkers in the park (3 dogs; 4 is the cap, 3 is the most the arrival rules produce, section 9 item 8). `setWeather('rain')` for the overlay. Profile `cp 70`; cast `c_fireworks` for 30 s of particles at the 220 cap.
3. `setSpeed(1)`, zoom 1, angle 0, Fit off; run 60 s of wall time by the real loop; read `FT.frame`, `FT.sim`, `FT.draw`, the one-second peaks and `FT.stepped` (GV `ftNote` 12057-12069).
4. Repeat at zoom 0.30 (every tile visible; 03 §16 risk 7) and at `setSpeed(8)` for 60 s.
5. Print a table; exit non-zero when a desktop budget is exceeded. The script runs on the dev machine and in CI if the CI machine is at least as fast as a 2020 laptop (section 9 item 9).

### 5.3 Phone measurement

1. Serve the dev build on the LAN; open it on the phone in Chrome; connect by USB; `chrome://inspect` on the desktop to read the console and run `__PD` calls (the perf overlay is also readable on screen: double tap the clock chip under `body.dev`, GV 12181).
2. Build the caps scene as 5.2 and read `FT` after 60 s at 1×, zoom 1 and 0.30.
3. Record the device model, OS version, Chrome version and the readings in the hand-back. Two devices: a mid-range Android of about 2021 and an iPhone of about 2020 (section 9 item 9).

---

## 6. Manual QA checklist for the phone

Each item: do, then expect. Run on a phone in portrait with the dev build, then once more on `dist/index.html` served over the LAN.

1. **Tap.** Tap a visitor with `hand`. Expect: the card opens, the camera follows at zoom ≥ 1.8, the figure has a selection ring. Tap empty lawn: the card closes.
2. **Drag pan.** Drag one finger. Expect: the scene pans, follow drops, no page scroll, no rubber band (GV CSS 26 posture).
3. **Pinch and twist.** Two fingers. Expect: zoom between 0.30 and 3.0; a twist beyond the dead zone rotates with the midpoint pinned; a quarter-turn button snaps to the next quarter keeping the screen centre (GV 12142-12150).
4. **Tap thresholds.** A 10 px drag then release is not a tap; a 400 ms press without movement is a tap; a 500 ms press is not (GV 11223).
5. **Rail.** Row 1 strip scrolls sideways with snap and shows the edge fade when more pills exist (GV 11059); switching Park | Cupid | Mischief swaps the strip; a locked pill is dimmed with its tier and toasts `rail.locked_at`; row 2 shows size for a brush, Place/Cancel for a ghost, Undo for Park, the cooldown ring for an armed ability; row 3 has every button of register §3.9.
6. **Safe areas.** On a notched phone nothing sits under the top inset or the home indicator: chips, rail, feed, toast, every sheet, photo close button (GV 32, 77, 157-165).
7. **Sheets.** Open Census; open Events: Census closes (GV 10748). The card hides while a sheet is open (`body.sheet`). Rotate the phone and back: overlays re-stack within 220 ms (GV 12132). Every sheet's bottom equals the rail height + 8 (`layoutOverlays`, GV 10689).
8. **Audio unlock.** Fresh load, muted off: no sound before Begin; after Begin the waltz starts within 4 s and birds within 5 s (05 §8.1). Tap Sound: silence within 50 ms; tap again: music on the next bar.
9. **Background and resume.** Press the home button for 10 s and return. Expect: the sim continued from where it was (no catch-up burst: the backlog is dropped, GV 12086); audio resumes without doubled notes; an autosave happened (reload and Continue shows the same state); `pagehide` on tab close also saves.
10. **Save and continue.** Paint a path, place a bench, wait 30 sim s, kill the tab, reopen: Continue is shown; tapping it restores silently with the path, the bench, the clock, the weather, the pairs, the mode and the avatar. New asks the confirm; Yes gives a new park and a new `#s=`; No changes nothing.
11. **Language.** Options → ES. Expect: every chip, pill, card, sheet, feed line (including old ones, through `@` keys), toast and aria-label in Spanish; `<html lang="es">`; the choice survives a reload; the intro toggle matches.
12. **Photo mode.** Tap Photo. Expect: HUD, rail, card, feed, toast and sheets hidden, only the close button; gestures still work; close restores everything (GV 164-168, 63).
13. **Avatar mode.** Be someone → pigeon. Expect: zoom to 1.5 if below 1.3, follow, the strip card with " · you", three hint chips, Park strip and Undo hidden, a 6 s hint toast. Tap lawn: it flies there (silent). Tap a visitor: the status toast. Tap Creator: the pigeon goes on by itself within 2 s (GV 11252-11269 pattern).
14. **Speed and pause.** Pause: the clock stops, music keeps playing, the feed does not advance. 8×: the clock runs eight times faster; cue gaps widen; the frame rate holds (GV `aOK` 6131).
15. **Private window.** Open in a private window. Expect: the game runs; one notice that saving is off; no crash on autosave.
16. **Zero console errors** through all of the above, and after a full 12-day year at 8×.

---

## 7. Content QA

### 7.1 Tone rules (design §13; register §3.14)

| Rule | Checked by |
|---|---|
| T1 nothing hurts anyone | `tone.test.ts` forbidden words; `act.test.ts` reaction lengths; manual: watch ten embarrassments, every one ends standing and dry-eyed |
| T2 only the ten kinds | `tone.test.ts` kinds in order |
| T3 children never targets | `tone.test.ts`, `abilities.test.ts`, `avatar.test.ts` child cases; manual: aim every Mischief ability and the pigeon at a child, every one toasts `reason.not_children` |
| T4 snatched items come back | `tone.test.ts`: every `snatched` ends with the item restored within 10 s |
| T5 max 3 per person per day | `tone.test.ts` 4th attempt; reset at `newday` |
| T6 backfires exist | `tone.test.ts` 40 to 80 of 400 |
| T7 no mocking appearance | `strings.test.ts`: no string key under `feed.*`, `toast.*`, `card.*` contains a `lookSeed`, hair, coat or hat parameter; manual read of both tables |
| T8 mischief is reversible | `romance.test.ts`: a Parted regular pair re-forms on a later visit at stage 1 with `rnd(0.2, 0.4)` |
| T9 staff stay neutral | `tone.test.ts` staff score 0; `act.test.ts` staff reactions ≤ 4 s |
| T10 nothing dies, nothing lost for good | `caps.test.ts` and `romance.test.ts`: every removal of a visitor goes through a gate; no prop is removed by the sim except by the player's tools (grep `freePropId` callers: `tools.ts`, `undo.ts`, effect cleanup of props the effect made) |

### 7.2 String tables

1. `strings.test.ts` of 2.7 is green: parity, suffix pairs, every used key present, no literal outside `strings/`, doing coverage, id key sets.
2. The key count of the data file equals the count of rows in 06 §16 (06 §16.16 gives a hand count; the test compares the two data files to each other and to the rows, not to that number).
3. Before release: no `TODO` value in `es`; a Spanish reader checks the six words of brief §11 item 9 (Be someone, Creator, Cupid, Mischief, Happily, Parted) and the gendered pairs.
4. Both languages rendered in every screenshot scene of 4.2 at the phone viewport (scene A and D in ES as extra, non-baselined shots for the hand-back): no overflow, no clipped pill, no wrapped chip.

### 7.3 Every ability reachable

1. A test profile `tests/fixtures/profile-t4.json` with `cp 70`, `mp 70` enables all 19 pills; `abilities.test.ts` casts each id once through a command in a scene where its target is valid, and asserts `ok` and its cooldown value from register §3.8.
2. Valid-target scenes per id: `c_petals`, `c_musician`, `c_lamplight`, `c_picnic`, `m_sprinkler`, `m_peel`, `m_mime` a lawn, path or lamp tile as the id needs; `c_bouquet`, `c_umbrella` (rain), `m_rival`, `m_wasp` (at Picnic) a pair; `m_pigeon`, `m_pomeranian` (victim with a hat) a visitor; `c_sunbeam`, `m_raincloud`, `m_flock` an area with people; `c_rowboat` the starter pond; `c_fireworks` at f 0.90; `m_fog` at mist 0.
3. Manual: with the T4 profile every pill arms, every cast is seen on screen and its feed line `feed.cast.<id>` appears.

### 7.4 Every avatar's cascade covered

| Avatar | Rows of design §10 | Tests in `avatar.test.ts` (one per row plus refusals) |
|---|---|---|
| `a_pigeon` | 10.4: swoop, peck, perch, drink, fly; refusals child, dog, enough | 8 |
| `a_pomeranian` | 10.5: snatch, chase, play, paddle, dig, run; refusal big dog | 7 |
| `a_mime` | 10.6: mimic, statue, wall, walk; the 120 s rest | 5 |
| `a_florist` | 10.7: hand, pick, sit, scatter, walk; refusals empty basket, not courting | 7 |
| `a_busker` | 10.8: serenade, bandstand, play here, blocked tile via openNear | 4 |
| `a_matchmaker` | 10.9: lead, encourage, buy, share bread, sit, walk; refusals nobody, had to go | 8 |

Manual: possess each avatar and perform every row once; the toast reads the status word of 06 §16.7; the card's doing line matches.

### 7.5 Spellings

`content.test.ts` of 2.7 compares every id and displayed name with the register §3 and §5. A hand check of the rail, picker, Progress sheet and Romances sheet in both languages confirms the displayed names are the tested ones.

---

## 8. Release checklist for the single-file build

1. `npm run check` exits 0 on the release commit: typecheck, lint (0 errors), test (all files of section 2 green, `strings.test.ts` with the ES TODO check enabled), build.
2. `ls dist` shows exactly `index.html` plus `style-board.html` and `music-board.html` (07 §0.5 row 4); no `dist/assets/`.
3. `dist/index.html` ≤ 1.2 MB; `grep -c '__PD' dist/index.html` is 0; `grep -c 'Math.random' dist/index.html` is 0; `grep -c 'fonts.googleapis' dist/index.html` is 0; `grep -o '<html lang="[a-z]*"' dist/index.html` shows `en`; `<title>` is `Parque D'Amour`; `theme-color` and `viewport-fit=cover` present.
4. Open `dist/index.html` from `file://` in Chromium with DevTools: Network shows 0 requests after load; Begin, 3 days at 8×: 0 console errors (the smoke run of 4.1).
5. `npm run shot` scenes A to E match baselines at both viewports; the smoke shots at both viewports attached.
6. `npm run det` passes against the dev build of the same commit; `tests/determinism.test.ts` values recorded in the release note.
7. `npm run perf` desktop budgets met; the phone report of 5.3 attached with device names.
8. Section 6 run on one Android and one iPhone with every item passed; section 7 run with both languages.
9. The register §4 rows for the Style Gate and the Music Gate hold the owner's letter and date; the profile `stylePick` and `musicPick` defaults equal those letters.
10. `SCHEMA_VERSION` unchanged since the last release, or `migrate.ts` has the new step and `migrate.test.ts` has its fixture.
11. Save round trip by hand: play, close, reopen, Continue, identical scene; `localStorage` keys are exactly `parque:profile-v1` and `parque:park-v1`.
12. Both boards (`style-board.html`, `music-board.html`) still open without error (they are shipped beside the game).
13. Tag the commit `v1.0.<n>` and write the release note: hashes of 6, numbers of 7, the baselines regenerated, open points.

---

## 9. Assumptions and open points

Values this document defines that the register, the design, 03 and 06 do not (the owner may object; on change edit this file first):

1. Test file names beyond those in 03 §14 and 07: `rng, clock, weather, events, loop, gen, park, water, wear, charm, needs, brain, act, astar, move, arrivals, archetypes, names, caps, creatures, romance, tone, progression, abilities, tools, undo, avatar, mode, save, migrate, strings, content, colour-literals, limiter, cues, melody, musicState, scheduler, mute, project, order, pick, palette, seasons, perf, bundle`, and `tests/ui/overlays, rail, intro, a11y` under jsdom.
2. The contents of `tools/det.mjs` and `tools/perf.mjs` (03 §14 names the scripts; this document specifies them in 3.4 and 5.2).
3. The determinism file's run time budget of 90 s and the 600-step bisect window (3.2 item 8, 3.3).
4. Screenshot determinism requirements of 4.5: the weather overlay and sky cache use sim time, `ambientFx` is skipped while paused. 03 §7.8 says "index + time" without naming the source; GV 10072 used wall time. Proposal: 03 §7.8 names `T.abs`.
5. The five scenes, their seeds and capture ticks (4.2), 13 baseline files under `tests/baseline/` (committed, unlike `shots/`), the four quarter turns for scene D only.
6. The pixel-diff rule: channel delta > 24, 0.5 % of pixels, 2.0 % for scenes C and E; the in-browser diff so that 03 §14's dev-dependency list stays unchanged; `pixelmatch` and `pngjs` allowed as an alternative.
7. Build size cap 1.2 MB for `dist/index.html` (the brief gives 400 KB for fonts only).
8. The caps scene of 5.2 uses 3 dogs: two walkers' dogs plus the pomeranian is the most the arrival rules allow at once (design §4.2 item 4 caps dog walkers at 2), although the creature cap is 4. Open: whether the brief's "4 dogs" needs a third dog walker allowed, or the cap text should read 3.
9. Device classes for the phone report: a mid-range Android of about 2021 and an iPhone of about 2020; the CI machine for `npm run perf` is at least a 2020 laptop. The register fixes only "60 fps on a mid phone".
10. The ES forbidden-word list for `tone.test.ts`: herido, herida, hospital, sangre, muerto, muerta, murió.
11. Scenes A and D rendered in ES as extra non-baselined shots (7.2 item 4).
12. Test naming and the `describe` comment rule (1.3 items 4 and 5).
13. The refusal key `reason.too_many_effects` (EN "too much going on already") returned by the 65th cast while 64 effects are active (2.5 `abilities.test.ts`): 03 §3.11 caps active effects at 64, but 03 §5.4 and 06 §16.13 name no key for it. Proposal: add the row to both.

Open points for the owner:

1. Whether the production build should keep a minimal `__PD` (hash and tick only) so the release smoke run could assert determinism on `dist/index.html` itself. This document says no: 03 §13 is dev-only, and `tools/det.mjs` runs on the dev build of the same commit.
2. Whether the 2.0 % tolerance for scenes C and E is acceptable to the owner's eye, or whether those two scenes should be reviewed by hand instead of pixel-diffed.
3. Whether `npm run perf` should be a CI gate from S9 on (effects and light) or stay a hand-back report until release. This document makes it a release gate only (brief §9 row 3 is a success criterion, not a slice gate).
