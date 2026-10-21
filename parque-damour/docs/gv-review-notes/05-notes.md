# Gnome Village review — section 05: lines 1359–1751
## "Gnomes (entities), A* pathfinding, flora/particles/village"

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Every line 1359–1751 was read. Line numbers below are exact unless marked "~".

External constants this section leans on (defined outside the range, resolved by grep):
`S=2` fine tiles per legacy "v7" tile (567); `N=36*S=72`, `NC=N*N=5184` (568); `S2=S*S=4` (576); `SEA=2.0` (570);
`DAYLEN=210` s per game day, `SEASON_DAYS=3` (573) so a year = 12 days = 42 min real time; `TAU` (582);
tile layers `E` ground height (612), `WD` water depth (614), `FLOW` (616), `WEAR` (619), `MAT` (621), `BRIDGE` deck height (626),
`STEPS` (628), `DAM` (629), `PAVE` (630), `OCC` building footprint (631), `CLIMBN` (633), `SEAC` open-sea flag (636), `ICE` (654);
materials `MEA=0,GRS=1,SCR=2,ROK=3,SNW=4,SND=5,WAT=6` (671); `I=(x,y)=>y*N+x` (672); `wetD(i)=WD[i]` (677);
`FLOW_STREAM=0.5`, `FLOW_RIVER=1.3` (1349–1350); clock `T={abs,...}` (814, `abs` in game days); weather `W` (845, `W.snow` used);
rng helpers `rng/rnd/rint/pick/chance` (589–593, seeded, counted in `rngN` for determinism); `mulberry32` (583); `noise2` (599); `fbm2` (606);
`eLerp` (790) bilinear ground height; `slopeOf` (804); `screenOf` (6384); `STATS` (4658); `MODE`/`PLAYER` (5630).

---

## 1. Purpose of the section

Four things, in order:

1. **Gnome entity model** (1359–1406): name pool, palette arrays, age stages, the `makeGnome` factory that defines the whole per-gnome state record, movement speed by stage, and the "craft" (habit tally → job title) system.
2. **A\* pathfinding over the tile grid** (1407–1507): preallocated typed-array open/closed sets, binary heap, a rich terrain `stepCost`, corner-cutting rules, node budget, partial-path return, timing instrumentation.
3. **Errand plumbing around the path** (1508–1687): giving up on unreachable targets, remembering blocked targets, detecting gorges a rope bridge could span (feeding the village planner), snapping targets out of buildings, `goTo` (route cache + replan), `moveGnome` (the per-frame walker: waypoints, speed modifiers, climb detection, re-validation when the world changed, stuck handling), `enterTile` (side effects on crossing a tile edge: ledge jumps, splashes, river sweeps, crossing marks, climb counts, bridge use counts), `wearStep`/`decayWear` (desire-path footfall accumulator and decay; also ages the swim marks).
4. **Flora seeding** (1689–1751): the global entity arrays (trees, bushes, rocks, builds, parts, stumps, critters, birds), the procedural tree generator with three forms per species plus a winter twig crown, and `seedFlora` which populates an island from noise + material + slope rules.

Despite the header "flora, particles, village" (1689) only flora logic lives here; `builds`, `parts`, `critters`, `birds`, `stumps` are merely declared (1690) and driven elsewhere.

---

## 2. Globals / state defined or mutated here

### Defined in this range
| Name | Line | Type / shape | Notes |
|---|---|---|---|
| `NAMES` | 1360–1362 | `string[40]` | gnome first names (Pip, Tam, … Fennel). English/fantasy flavour. |
| `HAT_F` | 1366 | `string[5]` hex | pink hat colours for females |
| `HAT_M` | 1367 | `string[5]` hex | blue hat colours for males |
| `HAT_B` | 1368 | `string[3]` hex | cream baby hats; **not used in this range** (used at 5522 when a baby is born) |
| `HAIR` | 1369 | `string[7]` hex | hair colours, both sexes |
| `gid` | 1370 | `let number` | id counter, starts 1, incremented in `makeGnome` |
| `gnomes` | 1371 | `array<Gnome>` | the population; cleared by newIsland (12104) |
| `marks` | 1371 | `array<{x,y,t,sd}>` | "crossing stakes": where gnomes entered/left deep water; bridge demand signal. Cap 60 (1664), aged 1/s and dropped at `t>420` (1686). Read by the planner (3219–3297), drawing (9450, 9703), startSweep (4666). |
| `AGE_CHILD=2, AGE_ADULT=24, AGE_ELDER=48, AGE_LEAVE=84` | 1375 | game days | baby <2 d; child <24 d (2 yrs); adult <48 d (4 yrs); elder; at 84 d (7 yrs) a gnome leaves on an adventure (used at 5562). |
| `CRAFT_LABEL` | 1380 | `{chop,quarry,fish,fibre,build,bush,herd,farm}→string` | 'woodcutter','miner','fisher','reed-cutter','builder','berry-picker','shepherd','farmer'. English only. Read by the card (10825, 10985). |
| `PF_G, PF_F` | 1412 | `Float32Array(NC)` | A* g-cost and f-cost per tile |
| `PF_P` | 1412 | `Int32Array(NC)` | parent tile index |
| `PF_S` | 1413 | `Uint8Array(NC)` | state 0 unseen / 1 open / 2 closed |
| `PF_H` | 1413 | `Int32Array(NC)` | binary heap of tile indices ordered by `PF_F` |
| `pfN` | 1414 | `let number` | heap size |
| `CLIMB_AT=1.0/S (0.5), CLIMB_MAX=2.3/S (1.15), JUMP_AT=1.2, JUMP_MAX=3.2` | 1426 | levels per fine tile | slope thresholds (see §4) |
| `PF_SWIM` | 1451 | `let number` 3.6 | base cost of a deep-water step; set per call in `goTo` (1575: 9.0 when `g.wary>0`, else 3.6) and temporarily 9.0 by the critter walker (1850). Declared *after* `stepCost` which reads it — fine at run time, TDZ hazard only if called during load. |
| `PF_DX, PF_DY, PF_DD` | 1452 | `number[8]` | 8-neighbour offsets; diagonals weighted 1.4142 |
| `PFSTAT` | 1453 | `{calls,ms,nodes}` | profiling counters; exposed on `window.__GV` (12226) |
| `PF_STRICT` | 1458 | `let boolean` true | strict corner rule; toggled from the harness `setStrict` (12227) |
| `gorges` | 1525 | `array<{x,y,t,sp}>` | rim tiles where a gnome came up short with a spannable gorge in front; cap 40 (1520, 1592). Consumed by the planner (3301–3315), cleared at 12104. |
| `wearT` | 1682 | `let number` | 1-second accumulator for `decayWear` |
| `trees, bushes, rocks, builds, parts, stumps, critters, birds` | 1690 | arrays | all world entity lists. Only trees/bushes/rocks are filled here. |
| `SPECIES` | 1691 | `['round','pine','birch']` | tree species; also used by the creator "tree" tool (11145) |

### Gnome record shape — `makeGnome` (1387–1399)
Fields, by line:
- 1389: `id` (gid++), `name` (freshName), `sex` 'f'/'m', `x,y` (tile coords, fractional), `age` (days), `stage` (stageOf), `h` (sprite height px, heightOf)
- 1390: `hunger` rnd 0.10–0.30, `energy` rnd 0.65–0.95, `warm` 0.75
- 1391: `st` 'idle' (state machine), `t` 0, `decide` rnd 0–0.6 (seconds until next decision), `job` null, `tx,ty` target (= spawn), `carry` null, `cAmt` 0
- 1392: `face` 1 (±1 facing), `bend`, `bendV` 0, `ph`, `walkPh` rnd 0–TAU (anim phases), `moving` false, `arrived` true
- 1393: `hat` pick(HAT_F or HAT_M by sex), `hair` pick(HAIR)
- 1394: `swim` 0 (0–1 blend), `cool` rnd 0.6–1.6 (mating cooldown, days), `blink` rnd 2–7, `restIn` null, `work` 0, `hop` 0, `stuck` 0
- 1395: `path` null, `pi` 0 (waypoint index), `pathT` 0 (path age s), `ptx,pty` −99 (target the path was built for), `tile` −1, `inWater` false (never written in this range), `swimFrom` null, `swimN` 0, `repl` 0 (replan cooldown)
- 1396: `climb` false, `climbT` 0, `z` 0, `gz` 0, `sweptT`, `panicT`, `helpT`, `rescT` 0, `fell` 0, `wary` 0
- 1397: `inside` null (building), `dined` −1, `bedJit` rnd ±0.02, `hatHand` 0, `boat` 0
- 1398: `home`, `mate`, `parents`, `project` null, `waitT` 0, `soloT` −1 (v9.17 partner clock), `kids` 0, `did` tally object (all 8 crafts 0)

Fields **added dynamically** inside this range (not in the factory): `g.blocked` (1511), `g.partial` (1578), `g.gorgeT` (1584), `g.mx,g.my` last unit heading (1639). Read-but-defined-elsewhere: `g.ride`, `g.cart` (1624), `g.inBoat`, `g.inFlyer` (1602), `g.player` (not here).

### Mutated here, owned elsewhere
`WEAR[i]` (1680, 1685); `CLIMBN[to]` (1670, capped 250); `STATS.climbs` (1627), `STATS.gorge` (1520, 1592); `b.uses` on bridge builds (1672); `PF_SWIM` (1575); `trees/bushes/rocks` emptied and refilled by `seedFlora` (1730).

---

## 3. Functions (name, line, signature, what it does, callers)

| # | Function | Line | Signature | Does | Called from |
|---|---|---|---|---|---|
| 1 | `freshName` | 1365 | `()→string` | Picks a name not currently used by any gnome; falls back to any name if all 40 are taken. Always consumes exactly one `rng()` draw (determinism note v9.20). | `makeGnome` only |
| 2 | `stageOf` | 1376 | `(ageDays)→'baby'|'child'|'adult'|'elder'` | thresholds AGE_CHILD/ADULT/ELDER | `makeGnome`, ageing (5555) |
| 3 | `heightOf` | 1377 | `(stage)→px` | baby 8, child 13, elder 17, adult 19 | `makeGnome`, ageing (5557) |
| 4 | `tally` | 1381 | `(g,k)` | lazily creates `g.did`, increments craft counter `k` | 15 call sites in jobs (2093, 5072–5186, 5404–5462, 11828) |
| 5 | `craftOf` | 1382–1386 | `(g)→key|null` | the most-tallied craft, if `best>=6` and `best>=40%` of all tallies | card (10825, 10981), job bias (3000, 4215, 4596, 4803…), herd master (1840), census (11797), harness (12237) |
| 6 | `makeGnome` | 1387–1399 | `(x,y,sex,age)→Gnome` | builds the full record (above) | founders (12117–12118), baby (5521), strangers (4475, 4495), player avatar (5634), harness (12233) |
| 7 | `gSpeed` | 1400–1406 | `(g)→tiles/s` | base by stage × S: baby 0.9, child 1.4, elder 1.1, adult 1.7 (so 1.8/2.8/2.2/3.4 fine tiles/s); ×0.86 carrying; ×0.7 if energy<0.2; ×0.85 if `W.snow>0.4` | `moveGnome` (1623), dog heel (1897) |
| 8 | `pfPush` | 1415–1416 | `(i)` | min-heap insert keyed on `PF_F` | `findPath` |
| 9 | `pfPop` | 1417–1421 | `()→i` | min-heap pop with sift-down | `findPath` |
| 10 | `tileH` | 1422 | `(i)→level` | bridge deck height if a bridge is there, else ground `E[i]` | `stepCost`, `cornerOK`, `enterTile`, player step (5596) |
| 11 | `stepCost` | 1427–1450 | `(i,j,canSwim)→cost|Infinity` | terrain cost of moving tile i→j (see §4) | `cornerOK`, `findPath`, `moveGnome` re-validation (1635), player nudge (5596) |
| 12 | `cornerOK` | 1459–1465 | `(i,c,j,canSwim)→bool` | may a diagonal step i→j brush corner tile c? | `findPath` (1489) |
| 13 | `findPath` | 1466–1507 | `(sx,sy,tx,ty,canSwim)→[[x,y],…] (+ .partial)` | A* on the 8-connected grid, see §4 | `goTo` (1576), critter walker (1852), harness (12225) |
| 14 | `blockTarget` | 1511 | `(g,x,y)` | push `{x,y,until:T.abs+0.7}` onto `g.blocked`, keep last 8 | `giveUp` |
| 15 | `blockedFor` | 1512 | `(g,x,y)→bool` | prunes expired entries; true if a live entry lies within 1.6·S (3.2 tiles) box | target pickers: nearestTree etc. (3764–3809) |
| 16 | `giveUp` | 1516–1524 | `(g)` | block the target, maybe record a gorge at the gnome's rim tile, drop path/job/marks, go idle with decide 0.4–1.2 s | `moveGnome` (1617) |
| 17 | `gorgeSpan` | 1529–1556 | `(ri,tx,ty)→span|null` | from rim tile `ri`, look in 4 cardinal directions for a 2–7-tile gap over low ground/water to a far rim within ±1 level; returns `{sc,tiles,ax,ay,bx,by,ux,uy,deck,decks,ha,hb}` | `giveUp`, `detourCheck`, planner (3306), ropebridge placement ghost (5920), harness (12227) |
| 18 | `openNear` | 1559–1568 | `(tx,ty)→[x,y]` | if target tile is OCC, spiral rings r=1..3 for a free, non-deep tile, jitter ±0.3·S | `goTo` |
| 19 | `goTo` | 1569–1582 | `(g,tx,ty)` | set target; reuse existing route if same target (<0.6·S away) and path age <4 s; else set PF_SWIM by wariness, run `findPath` (canSwim = not baby), snap last waypoint to exact target, store `g.partial`; if route >2.2×straight+6·S and `gorgeT` elapsed → `detourCheck` | ~130 call sites across all jobs, player tap (11150, 11403…) |
| 20 | `detourCheck` | 1583–1597 | `(g,tx,ty)` | set `g.gorgeT=T.abs+0.1` (one check per ~21 s per gnome); walk the straight line to target; at the first drop of >1.0 level (or into sea-level water) try `gorgeSpan` from the rim and record a gorge | `goTo` |
| 21 | `d2g` | 1598 | `(g,x,y)→dist²` | squared distance gnome→point | ~90 call sites |
| 22 | `bridgeAt` | 1599 | `(i)→build|null` | linear scan of `builds` for a done, non-'bank' build whose `tiles` include i | `enterTile` |
| 23 | `moveGnome` | 1600–1643 | `(g,dt)` | the walker; see §4 | per-gnome tick (5700) |
| 24 | `enterTile` | 1646–1673 | `(g,from,to)` | side effects of crossing into a new tile; see §4 | `moveGnome` (1636) |
| 25 | `wearStep` | 1674–1681 | `(g,dt)` | accumulate footfall into `WEAR` under a moving gnome (not on bridge/water) | per-gnome tick (5702) |
| 26 | `decayWear` | 1683–1687 | `(dt)` | once a second: decay all `WEAR`, age `marks` and drop those older than 420 s | world tick (5799) |
| 27 | `makeTree` | 1692–1697 | `(x,y,sp,age?)→tree` | `{x,y,sp,age,sd,fall:0,marked:0,h,lean,blobs:[],branches:[]}` then `buildTreeShape` | `seedFlora`, sapling spread (5732), creator tree tool (11145) |
| 28 | `buildTreeShape` | 1702–1728 | `(t)` | deterministic (mulberry32 from `t.sd`) blob/branch/twig layout; `t.form = sd%3` | `makeTree` only |
| 29 | `seedFlora` | 1729–1751 | `()` | clear & repopulate trees/bushes/rocks from terrain | newIsland (12111), harness (12224) |

---

## 4. Concrete rules and tuning numbers

### Age / stage (1372–1377)
- Year = `SEASON_DAYS*4` = 12 game days (= 12×210 s = 42 real minutes).
- baby `<2` d (7 real min); child `<24` d (2 yrs); adult `<48` d (4 yrs); elder after; `AGE_LEAVE=84` d (7 yrs, ~4.9 real hours) → leaves (5562).
- Sprite heights px: baby 8, child 13, elder 17, adult 19.

### Craft (1380–1386)
- A craft is named only when the top tally `>=6` **and** `>= 40%` of all tallies.

### Speed (1400–1406) — fine tiles per second
- adult 3.4, child 2.8, elder 2.2, baby 1.8. Carrying ×0.86. Energy <0.2 ×0.7. Snow >0.4 ×0.85.
- In `moveGnome`: riding a deer ×1.5; cart ×1.3 on PAVE, ×0.6 off it (1624). Swimming (`g.swim>0.3`) ×0.45; wading (`wd>0.15`) ×0.7 (1625). Climbing ×0.42 (1628). Otherwise slope factor `clamp(1 − max(0,grad·S)·0.30, 0.55, 1.15)` (1629).

### stepCost (1427–1450) — cost to move one fine tile i→j
- `OCC[j]` → Infinity (walls).
- Bridge deck target: base 0.9, vertical limit up/down 2.2 (1431). Bridge→bridge exempt from height limits (1445).
- Ice: base 1.25 (1432).
- Deep water `wetD>0.55`: Infinity unless `canSwim`; else base `PF_SWIM (3.6 | 9.0 wary) + 6·clamp01((FLOW−0.5)/2)` — a torrent (FLOW≥2.5) adds the full +6 (1435).
- Wading `0.15<wetD≤0.55`: base 1.7 (1436). Rock material +0.8 (1437).
- Height limits: swimmers (non-babies) up ≤ `CLIMB_MAX` 1.15, down ≤ `JUMP_MAX` 3.2; babies up/down ≤ `JUMP_AT` 1.2 (1430, 1438).
- On/adjacent STEPS: limit 2.8/S = 1.4 both ways, slope cost `|dh|·0.35` (1440).
- Otherwise uphill `dh·2.4 + (dh>0.5 ? 1.5 : 0)`; downhill `−dh·0.5 + (dh<−1.2 ? 7.0 : 0)` (1442–1443).
- PAVE: `base *= 0.30` (1448) — paving is the dominant attractor.
- Diagonal steps multiply the whole cost by 1.4142 (1493).

### cornerOK (1459–1465)
- Corner tile must have finite stepCost; if `PF_STRICT` also |dh| ≤ 1.2 and the corner may not be deep water when the step itself is dry (bridges exempt).

### findPath (1466–1507)
- Start/target clamped to grid; `s===t` → `[[tx,ty]]` (1470).
- Heuristic `hOf = (max(dx,dy) + 0.4142·min(dx,dy)) · 0.45` (1472). **See oddity O1.**
- Node budget `LIM = 2600·S2 = 10400` expansions (1475); grid is 5184 tiles so this is effectively "whole grid" unless many re-pushes.
- Search excludes the outer ring: tiles must satisfy `1 ≤ x,y ≤ N−2` (1484).
- No decrease-key: a better g re-pushes the node; stale heap entries are skipped by `PF_S===2` (1479). Closed nodes are never reopened.
- Tracks `best` = node with lowest h seen; if target never reached, returns the path to `best` with `out.partial=true` (1498, 1504).
- Returned path is `[x,y]` pairs from first step to target (excludes start) (1502–1503).
- `PFSTAT.ms/nodes/calls` updated each call (1467, 1505).

### Blocked targets / give up (1511–1524)
- Block lasts `0.7` days of `T.abs` (≈147 s); max 8 remembered; matched within a 1.6·S = 3.2-tile box.
- `giveUp`: idle with `decide` rnd 0.4–1.2 s; gorge recorded if `gorgeSpan` succeeds.

### gorgeSpan (1529–1556)
- Rim tile invalid if OCC, bridge, `wetD>0.3`, or `E ≤ SEA+0.6`.
- Walk 4 cardinal directions up to 7 tiles; break on OCC/BRIDGE/DAM or open sea (`SEAC===1`).
- Gap tile qualifies if `rim−E ≥ 1.0` or deep water. Landing tile: first tile with drop <1.0 & dry, requires ≥2 gap tiles, |E−rim| ≤ 1.0, E > SEA+0.6.
- Score = length − 3 if the direction heads toward the target (dot > 0); lowest wins.
- Deck sag `0.10 + 0.04·L` with sine profile; every deck point must clear `E + wetD + 0.35` or the span is rejected.

### openNear (1559–1568)
- Ring search r=1..3 for `!OCC && wetD<0.55`; returns jittered `±0.3·S`.

### goTo (1569–1582)
- Target clamped to 1..N−2. Same-errand reuse if |Δ|<0.6·S (1.2 tiles) and path younger than 4 s.
- Detour test: `path.length > 2.2·straight + 6·S (12)` and `gorgeT` elapsed → `detourCheck`. `gorgeT` interval 0.1 day ≈ 21 s.
- `detourCheck` ignores targets closer than 3 tiles; triggers on a drop of >1.0 level or stepping into sea-level water.

### moveGnome (1600–1643)
- Early-out states: `float`, `swept`, `boat`, `adventure`, or inside / inBoat / inFlyer (1602).
- `g.swim` blends toward 1 at 3/s in deep water, back at 3/s otherwise; bridges/ice count as dry (1605–1606).
- Arrival radius `0.35·S` = 0.7 tile (1610, 1621). Waypoint reached at `0.22·S` = 0.44 tile (1621).
- Out of waypoints but not arrived: replan with `repl=0.6` s cooldown (1616); if the new path is empty, or still partial and ≤1 step, give up when partial or farther than 1.5·S (1617).
- Climb detected when ground gradient over 0.6·S ahead > `CLIMB_AT` 0.5 and not on steps/bridge (1626–1627); "hup" sfx every 0.75 s climbing with 60% chance (1628).
- Crossing into a new tile re-checks `stepCost` (world may have changed); if blocked: replan, `stuck++`; after >6 consecutive blocks → stop, idle, decide now (1635).
- Walk-cycle phase advances `dt·speed·3.2/S` (1640). Facing from screen-space projection of heading (1641–1642).

### enterTile (1646–1673)
- Ledge: dry→dry drop > `JUMP_AT` 1.2 → `startFloat(g,drop,false)` and return (1651).
- Entering deep water (not from water): splash sfx (not babies) + 3 droplets; sweep chance `pS = clamp01((max(FLOW)−1.3)/3.2)·0.95`, ×1.5 child, ×1.2 elder (1655–1657). Streams never, rivers sometimes, torrents (FLOW ≥ 4.5) ≈ always.
- Leaving water after a swim: two `marks` (entry & exit tiles), cap 60 (1661–1664).
- Dry→dry with |dh| > 0.9/S = 0.45 and no steps: `CLIMBN[to]++` (cap 250) (1670).
- Stepping onto a bridge from ground: `bridge.uses++` (1672).

### Wear (1674–1687)
- `WEAR[i] += dt·0.42·S·(1 + 0.6·min(1, WEAR/1.2))`, cap 4; skipped on bridges and wet ground (wetD>0.15) (1677–1680). Not drawn; it is the village's traffic census that decides where to pave (comment 1678–1679).
- Decay once per second: ×0.9975 when <0.6 (stray track fades in minutes), ×0.99945 otherwise (a real path lasts) (1685).
- Marks dropped at `t>420` s (2 game days) (1686).

### Trees (1692–1728)
- Height px: pine 40–64, birch 34–50, round 30–52; lean ±0.10; default age rnd 0.6–1; seed `sd` 0–1000.
- `form = sd % 3`. Pine: cone (4–6 blobs), spire (6–7 blobs, ×0.72 wide, top 0.98), broad fir (3–4 blobs, ×1.25). Birch: 3 branches (len 0.26h, angle ±0.55), tuft 4 blobs / tall wisp 5 / forked pair 2×3. Round: 3 branches (len 0.30h, angle ±0.75), dome 5 blobs / tall oval 6 / umbrella 6 wide-flat.
- Winter twigs for non-pines: 2–3 per branch + a 4–6 twig fan off the crown (1723–1726). Consumed by the renderer (6812–6815).

### seedFlora (1729–1751)
- `per = 1/S2 = 0.25` density correction for the finer grid; extra fudge ×1.3 / ×1.5 on top.
- Skip tiles with `WD>0.05` or `E≤SEA`.
- A land tile with ≥3 of 4 sea neighbours gets one rock r 1.1–1.4 and nothing else (1738–1739).
- Rock chances: scree/rock material 0.36·0.25·1.3 = 11.7%; high ground E≥6: 6.5%; anywhere 0.78%; r 0.7–1.3.
- No trees/bushes when E≥8, ROK/SCR/SND, or slope >1.0 (1742).
- Tree density field `d = clamp01(fbm2(seed, x/S·0.13, y/S·0.13, 4)·2.1 − 0.55)`; tree-tile chance `d·0.85·0.375`; per hit 1 tree +50% a second +20% a third, jittered ±0.32·S; species uniform from SPECIES.
- Else bush chance 0.09·0.325 ≈ 2.9%: `{b: 2–6 berries, re: 0–14 regrow timer, sc: 0.85–1.15 scale}`.

---

## 5. UI elements / controls / input handling
None in this range. Movement is driven by `goTo` calls from the AI and from the player's tap (`playerCommand` 11223 → goTo at 11150/11403). The card displays `CRAFT_LABEL[craftOf(g)]` (10825).

## 6. MODE 'creator' vs 'gnome'
Nothing mode-specific here. The player avatar is created by `makeGnome` (5634) with `g.player=true` and walks through the same `goTo`/`moveGnome`; the only mode branch is upstream at 5696 (`playerDecide` vs `decide`). So the walker/pathfinder is already shared by AI agents and the avatar — a good sign for the Parque D'Amour avatar mode.

## 7. Progression / unlock / economy
- Age stages and the 7-year departure (`AGE_LEAVE`) are the lifecycle progression.
- `craftOf` is an emergent "job title" from habit, which also biases job choice elsewhere (3000, 4215…).
- `WEAR`, `CLIMBN`, `marks`, `gorges`, `bridge.uses` are the demand signals that drive village infrastructure (paving, steps, bridges, rope bridges) — the "infrastructure follows behaviour" loop is seeded entirely in this section.
- No currency here.

## 8. Persistence
None. Everything is in-memory, regenerated from `world.seed`. The test/debug surface `window.__GV` (12222–12241) exposes `gnomes, trees, bushes, rocks, marks, findPath, PFSTAT, seedFlora, makeGnome, craftOf, setStrict`.

## 9. Mobile / touch / performance tricks
- A* scratch buffers are typed arrays allocated once (1412–1413); only `PF_S.fill(0)` (5 KB) per call (1471). Binary heap, no decrease-key (push duplicates, skip closed).
- Node budget 10400 and partial-path return keep worst case bounded.
- Route caching in `goTo` (same target within 1.2 tiles & <4 s → no search), 0.6 s replan cooldown, `blocked` memory (147 s) and per-gnome `gorgeT` throttle (21 s) limit expensive re-searches.
- `decayWear` runs once per second, not per frame.
- Caps on `marks` (60), `gorges` (40), `blocked` (8), `CLIMBN` (255 byte).
- `PFSTAT` for profiling in the harness.
- Determinism: all randomness via seeded `rng`; `freshName` deliberately takes exactly one draw.

## 10. i18n (en/es)
No i18n in this range. The only en/es in the file is the intro overlay (12200–12214). `NAMES` and `CRAFT_LABEL` are English literals that reach the UI (card/census). A port would need `CRAFT_LABEL` (and name pool) behind a language table.

## 11. Oddities, bugs, dead code, TODOs
- **O1 Heuristic not admissible (1472).** Comment says "steps on a path cost 0.3, so the estimate stays below the truth", but h uses 0.45 per tile while a paved step costs 0.30 (0.27 if a paved bridge tile exists). With closed nodes never reopened, A* can return slightly suboptimal routes across paved areas. Behaves as weighted A* (faster, mostly fine); the comment is wrong.
- **O2 Babies step up steeper than adults (1430, 1438).** Default `up=JUMP_AT=1.2` applies to babies; swimmers get `up=CLIMB_MAX=1.15`. The comment "babies neither climb nor jump" holds for jumping *down* (1.2 vs 3.2) but not for climbing up.
- **O3 Load-order hazards:** `PF_SWIM` (1451) and `gorges` (1525) are `let/const` declared after functions that reference them (`stepCost` 1435, `giveUp` 1520); `builds` (1690) after `bridgeAt` (1599). Safe only because nothing calls them during load.
- **O4 Dead guard (1522):** `typeof clearMarks==='function'` — `clearMarks` is a hoisted function declaration (4567), always true.
- **O5 Unused/orphan fields in `makeGnome`:** `inWater` never written here; `hop`, `boat`, `restIn`, `blink`, `bedJit` only meaningful elsewhere. `HAT_B` unused in range.
- **O6 `out.partial`** is an ad-hoc property on an Array (1504) — works, but easy to lose if the path is copied.
- **O7 `freshName` fallback (1365)** silently allows duplicates once population >40.
- **O8 Section header mismatch (1689):** "flora, particles, village" but particles/village logic is elsewhere.
- **O9 Density fudge factors** in `seedFlora` (`per*1.3`, `per*1.5`) are migration cruft from the v7→fine-grid change; `makeTree(..., rnd(0.6,1))` at 1746 duplicates the default.
- **O10 `enterTile` early return on ledge jump (1651)** skips swim/marks/CLIMBN bookkeeping for that step — intentional but means a jump into water does not produce a splash/sweep.
- **O11 Precedence at 1617:** `if(g.partial || !g.path.length && d2g(...)>...)` relies on `&&` binding tighter than `||`; reads as intended but is fragile.
- **O12 `bridgeAt` (1599)** is an O(builds) scan per bridge entry; fine at this scale.
- No TODO/FIXME markers in the range; version notes v9.15, v9.17, v9.20 appear in comments.

---

## 12. Reusable engine vs gnome-specific content

### Reusable as-is or with light renaming (engine/shell)
- `pfPush/pfPop/findPath/cornerOK` + typed-array scratch (1412–1507): a complete, bounded, partial-result A* with instrumentation. Only `stepCost` needs replacing.
- `goTo` route cache/replan logic (1569–1582), `openNear` (1559), `blockTarget/blockedFor` (1511–1512), `d2g` (1598).
- `moveGnome` skeleton (1600–1643): waypoint following, arrival/waypoint radii, speed-modifier chain, world-changed re-validation, stuck counter, facing from screen projection. Strip the swim/climb/ride branches.
- `enterTile` as a *hook point* for per-tile-edge events (1646).
- `wearStep/decayWear` desire-path system (1674–1687): visitors wearing tracks in the lawn that the gardener later gravels is a natural park mechanic.
- Entity factory pattern (`gid`, `makeX`, name pool with uniqueness, seeded one-draw determinism).
- Stage system (`stageOf/heightOf`) as a template for any time-based stage ladder.
- `tally/craftOf` habit→label system (1380–1386): e.g. "flâneur", "bouquiniste", "duck-feeder".
- `makeTree/buildTreeShape` (1692–1728): seeded multi-form procedural trees with winter crowns; `seedFlora`'s noise-density pattern (1729–1751).

### Gnome-specific (replace)
- `NAMES`, `HAT_F/M/B`, `HAIR` palettes; sex-coloured hats.
- Age thresholds in game days, 7-year departure.
- Everything about water: swimming cost, wariness, sweep probability by FLOW, splash marks → bridge demand, ice.
- Climbing/ledge/`startFloat` on the hat, `CLIMBN`, steps, rope-bridge `gorgeSpan`/`detourCheck`/`gorges`.
- Terrain layers in `stepCost` (BRIDGE/ICE/STEPS/PAVE/DAM/MAT=ROK) — keep only PAVE/OCC equivalents for a flat park.
- `CRAFT_LABEL` vocabulary, `SPECIES` (round/pine/birch), berry bushes, sea-rock rule, scree/rock material rules.
- Ride/cart speed multipliers.

---

## 13. Design questions for the Parque D'Amour port raised by this section
1. **Terrain model:** Is the park flat? If so the whole slope/climb/ledge/jump cost block (1440–1445) and `gorgeSpan` go; which layers remain — gravel paths (PAVE-like strong preference), lawn (walkable, wears), flowerbeds/hedges/fountain basins (OCC), pond (impassable, or rowing boats)? Benches as OCC or as sit-targets?
2. **Who walks?** The couple, background visitors, the player avatar, staff, animals (ducks, pigeons, a dog)? Each needs a speed class and a `canSwim`-style capability flag (e.g. `canCrossLawn`, `canOpenGate`).
3. **Stages:** Replace age stages with relationship stages (strangers → acquaintances → courting → couple)? What time base (real minutes, "visits", in-game days)? Does anyone "leave" like `AGE_LEAVE`?
4. **Names & looks:** French name pool, gendered or not; uniqueness rule; what palette axes replace hat/hair (coat, scarf, hat)? How are the two protagonists visually set apart from the crowd?
5. **Habit tally → label:** Which behaviours are tallied (reading, feeding ducks, buying crêpes, sitting on benches, photographing) and does the label affect decisions as `craftOf` does?
6. **Desire paths:** Should visitors wear tracks across lawns (WEAR) that the gardener later paves, and can the Creator pave/unpave to steer the couple? Decay rates for a park session length?
7. **Demand signals:** What replaces swim-`marks`/`gorges` as emergent infrastructure requests — a footbridge over the pond, a second gate, a kiosk where queues form?
8. **Avatar mode:** Tap-to-walk via `goTo` already works for a player gnome. Does the avatar need extra verbs (run, sit, carry a bouquet) and should the avatar physically block the couple (no entity–entity collision exists; OCC is tiles only)?
9. **Sabotage mechanics vs pathing:** sabotage by placing obstacles relies on `OCC` toggling + the world-changed re-check (1635) and replan; what cooldowns/visibility rules should the couple have when their route is cut (currently 0.6 s replan, give-up after 6 blocks)?
10. **Unreachable targets:** What happens when a destination is unreachable in a park (closed gate, roped-off lawn)? Keep `blockTarget` with a ~2.5-minute memory?
11. **Flora:** Formal French park planting (plane, chestnut, linden rows, topiary, rose beds, lawns) is designer-placed rather than noise-seeded — keep `seedFlora` for wild corners only? Which species get which `form` variants and winter crowns?
12. **Water:** Fountain and pond only? No swimming/sweeps? Rain shelter still matters (bandstand, café awning)?
13. **Scale & speeds:** Keep N=72 fine tiles and S=2? Visitor speeds (adult 3.4 tiles/s) and arrival radii (0.7 tile) depend on map scale.
14. **Determinism:** Keep seeded `rng` for reproducible romance scenarios and test harness (`__GV`)?
15. **i18n:** Labels (`CRAFT_LABEL`-like) and names need fr/en tables from day one.
