# Gnome Village review — section 03: lines 611–881
**"The island grid, the surface (shared vertex heights), time & weather"**

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Every line 611–881 was read. Symbols outside the range were resolved with grep only.

---

## 1. Purpose of the section

This block is the **world-state layer** of the engine. It does four things:

1. **Lines 611–697 — the island grid.** Declares every per-tile array of the simulation (height, water, soil, flow, wear, construction flags, counters) as flat typed arrays of length `NC` (=5184, a 72×72 grid), plus the sea flood-fill (`markSea`) and the small family of "is this tile water / is it drawn as water / is this bank dry" predicates that the simulation, the planner and the renderer all share.
2. **Lines 699–789 — the drawn surface.** Builds a second grid of **vertex** heights (`V`, 73×73) from the tile heights, plus a water-surface grid (`VW`) with the special-case rules that stop ponds growing spikes and cascades looking like stacked blocks; then an edge-preserving smoothing pass (`smoothSurface`).
3. **Lines 790–812 — samplers.** `eLerp` (bilinear ground height for anything standing on the map), `topAt` (what a foot actually rests on: bridge deck, ice, water surface or ground) and `slopeOf` (steepest step to a neighbour, in "v7 tile" units).
4. **Lines 814–881 — time & weather.** The clock `T` (day fraction, day number, season, light level, cold, thaw) and the weather state `W` (kind, cloud, rain, mist, snow, wind with gusts, cloud drift, storm front, spate, wet look, lightning flags), with `updateTime` and `updateWeather` called once per sim step from `simulate()` (line 12027).

Grid/world constants it depends on (defined at 567–573, outside the range):
`S=2` (fine tiles per old "v7" tile), `N=36*S=72`, `NC=N*N=5184`, `NV=N+1=73`, `SEA=2.0` (sea level in "levels"), `SEAS=SEA+0.5=2.5` (sea *surface*), `EMAX=9`, `DAYLEN=210` (real seconds per day at 1×), `SEASON_DAYS=3`, `TAU=2π`. `FLOW_STREAM=0.5` is at line 1349. `SIM_DT=1/60` at 12054. `DBG` (with `slackHide:true`) at 12041. `isSheet` at 9280.

Heights are in abstract **levels** (one level = `EH=26` px at zoom 1, line 569). Water depths, flows and sediment are also in levels (flows in levels per second).

---

## 2. Global / state variables defined in this range

### 2a. Per-tile arrays, length `NC` (lines 612–673)

| Line | Name | Type | Meaning |
|---|---|---|---|
| 612 | `E` | Float32Array | ground height (continuous, levels). The single source of truth for sim, slopes and pathfinding. |
| 613 | `E0` | Float32Array | ground as given/painted; "only ground the water has touched ever slumps" (used by slump code 1325–1331, build code 2672–2735, undo 11128–11131). |
| 614 | `WD` | Float32Array | standing water depth, levels. |
| 615 | `SOIL` | Float32Array | soil left before bedrock (erosion budget). |
| 616 | `FLOW` | Float32Array | smoothed throughput, levels/s. |
| 617–618 | `FDX`,`FDY` | Float32Array | smoothed flow direction (unit-ish). |
| 619 | `WEAR` | Float32Array | footfall counter, never drawn; tells the village which stretch to pave. |
| 621 | `MAT` | Uint8Array | material enum per tile (see 674). |
| 622 | `PREP` | Float32Array | v9.20: ground prepared for a building (0..1), drawn as raked earth, grasses over. |
| 623 | `PREPF` | Float32Array | floor PREP fades to: 1 while building goes up, a trodden yard after. |
| 624 | `TROD` | Float32Array | v9.22: trodden ground 0..1 where footfall is broad (yard, green), blended into ground colour. |
| 625 | `PATHST` | Uint8Array | v9.22: what a tile's footfall shows as: 0 nothing, 1 a way (ribbon), 2 trodden (blend); hysteresis to avoid flicker. |
| 626 | `BRIDGE` | Float32Array | deck height where a bridge crosses, else 0. |
| 627 | `PIER` | Uint8Array | a stone pier stands under this bridge tile. |
| 628 | `STEPS` | Uint8Array | stone steps cut into a slope. |
| 629 | `DAM` | Uint8Array | a dam holds the tile's height against erosion. |
| 630 | `PAVE` | Uint8Array | flagstones laid on a well-worn path. |
| 631 | `OCC` | Uint8Array | a building stands here: no walking through. |
| 632 | `FISHN` | Uint8Array | times a bank has been fished. |
| 633 | `CLIMBN` | Uint8Array | times a steep tile has been climbed. |
| 634 | `QUARRYN` | Uint8Array | times a rock face has been quarried. |
| 635 | `MADE` | Uint8Array | bit flags of the player's hand: 1 raised, 2 lowered, 4 rock set down. |
| 636 | `SEAC` | Uint8Array | 1 where the tile *is* the sea (≤ SEA and joined to the open sea round the isle). |
| 642 | `SEAQ` | Int32Array | preallocated BFS queue for `markSea` (no per-call allocation). |
| 655 | `RIVER` | Uint8Array | the isle's own rivers as generated. |
| 656 | `ICE` | Uint8Array | frozen water: walkable, still, silent. |
| 663 | `FX` | Float32Array | signed edge discharge i → i+1 (levels/s). |
| 664 | `FY` | Float32Array | edge discharge i → i+N. |
| 665 | `FP` | Float32Array | edge discharge i → i+N+1 (diagonal). |
| 666 | `FQ` | Float32Array | edge discharge i → i+N-1 (other diagonal). |
| 667 | `SED` | Float32Array | sediment carried in the tile's water, levels. |
| 668 | `SAND` | Float32Array | freshly settled sediment (bar/delta), sandy until grass takes it. |
| 669 | `KSOFT` | Float32Array | how easily ground erodes (soft/hard patches make a stream wander). |
| 670–671 | `MX`,`MY` | Float32Array | smoothed inflow direction ("where the water came from"); outside of a bend = where this and the flow disagree. |
| 672–673 | `VX`,`VY` | Float32Array | discharge through the tile as a vector, levels/s. |

The comment block at 657–662 explains the edge-momentum design: discharge lives on the four edges a tile owns; water already moving keeps moving, so a deep channel passes far more than a film of the same head — "that is what lets a torrent dig itself a bed instead of spreading as a sheet".

### 2b. Small constants & helpers (674–676, 693)
- 674 `MEA=0,GRS=1,SCR=2,ROK=3,SNW=4,SND=5,WAT=6` — material enum for `MAT` (meadow, grass, scree, rock, snow, sand, water). All seven are used elsewhere (3–16 uses each).
- 675 `I=(x,y)=>y*N+x` — tile index.
- 676 `inB=(x,y)=>...` — bounds test.
- 693 `WET_AT=0.09, WET_FLOW=0.045` — v9.14: the one rule for "drawn as water": a film of 0.045 on a flowing tile, 0.09 on still ground.

### 2c. Vertex-surface arrays, length `NV*NV` = 5329 (701–715, 780)
| Line | Name | Type | Meaning |
|---|---|---|---|
| 701 | `V` | Float32Array | ground height at vertices (drawn ground; what feet are drawn standing on). |
| 702 | `VW` | Float32Array | water surface at vertices (only meaningful where `VWn`). |
| 703 | `VWn` | Uint8Array | 1 if the vertex has drawn water. |
| 704 | `VI=(x,y)=>y*NV+x` | fn | vertex index. |
| 713 | `VWS` | Array(4) | scratch: the up-to-4 wet surfaces meeting at a corner. |
| 714 | `VWX` | Float32Array | highest water really at the corner; the lift pass never goes above it. |
| 715 | `VSEA` | Uint8Array | v9.13: corner touched by the sea's sheet. |
| 780 | `VSM` | Float32Array | scratch for `smoothSurface`. |
| 780 | `SM_K=0.5`, `SM_EDGE=0.42` | numbers | smoothing strength and the edge threshold (levels) above which a step is left alone. |

Geometry convention (700): tile (x,y) is centred on integer (x,y); vertex (vx,vy) sits at (vx−0.5, vy−0.5). So tile (x,y) has corners at vertices (x,y),(x+1,y),(x,y+1),(x+1,y+1).

### 2d. Time state `T` (line 814)
```
T={abs:0.34, f:0.34, day:1, season:0, light:1, speed:(/halt/.test(location.hash)?0:1), cold:0, thaw:0, ds:0}
```
- `abs` days elapsed (continuous), starts at 0.34 (mid-morning: `todName` at 10740 says 0.28–0.44 is "Morning").
- `f` fraction of day, `day` 1-based integer, `season` 0..3 (Spring, Summer, Autumn, Winter per `SEASONS` at 574).
- `light` 0..1 daylight.
- `speed` sim multiplier; 0 = paused. v9.22: `#s=101&halt` starts paused so a harness run is reproducible (comment on 814).
- `cold` 0..1, `thaw` 0/1, `ds` = day-within-season + fraction (0..3).
Readers elsewhere: `T.day` 85 refs, `T.season` 60, `T.cold` 56, `T.abs` 50, `T.f` 50, `T.light` 48, `T.speed` 15, `T.ds` 12, `T.thaw` 4.

### 2e. Weather table `WK` (829–838)
| kind | cloud | rain | mist | snow | wind | label |
|---|---|---|---|---|---|---|
| clear | 0.10 | 0 | 0.00 | 0 | 0.18 | Clear |
| fair | 0.34 | 0 | 0.04 | 0 | 0.30 | Fair |
| cloudy | 0.74 | 0 | 0.10 | 0 | 0.42 | Cloudy |
| rain | 0.92 | 0.80 | 0.22 | 0 | 0.50 | Rain |
| mist | 0.50 | 0 | 0.78 | 0 | 0.10 | Mist |
| snow | 0.86 | 0 | 0.30 | 0.80 | 0.36 | Snow |
| breeze | 0.28 | 0 | 0.02 | 0 | 0.86 | Breezy |
| storm | 0.98 | 1.0 | 0.18 | 0 | 1.0 | Storm (spring & autumn; rivers rise for a day after) |

`label` is read by the HUD at 10849 (`$('tWx').textContent=WK[W.kind].label`); the HUD dot colour `WCOLD` is at 10774.

### 2f. Weather state `W` (line 845) and `STORM_LEAD=28` (844)
```
W={kind:'fair', next:40, cloud:0.3, rain:0, mist:0, snow:0, wind:0.3, windP:0, drift:0, spate:0,
   tookBridge:false, front:-1, stormT:0, wet:0, flash:0, rumble:0}
```
- `kind` current weather key; `next` seconds until the next roll (first change at 40 s).
- `cloud/rain/mist/snow/wind` eased current values; `windP` phase for gusts; `drift` accumulated cloud-scroll offset (wind × 22 px/s).
- `spate` 0..1 river swell (read by water inflow 1104/1157/1161, bank-cutting 2113, bridge sweep 3319–3327, flooded cabins 4348/4393).
- `tookBridge` latch: a spate sweeps at most one bridge per storm (set 3324, reset 3327 when spate < 0.2).
- `front` −1 none; 0 bank at windward edge; 1 over the isle; 2 gone out the far side.
- `stormT` **never read or written anywhere else — dead field.**
- `wet` v9.15 wet look (roofs/paths darken); `flash`/`rumble` lightning, visual only (set at 8839 by the visual rng).

---

## 3. Functions (all in range)

| Line | Signature | What it does | Callers |
|---|---|---|---|
| 643 | `markSea()` | Clears `SEAC`, seeds a BFS from every map-edge tile with `E<=SEA` (both rows 0/N−1 then columns 0/N−1), floods 4-neighbours with `E<=SEA`. Uses `SEAQ` as the queue. Defines "the sea" as *open water connected to the map edge*; an inland pit as deep as the sea is not sea (comment 637–641). | `initWater` 1093; after a creator terrain stroke 11158. **Not** called after erosion changes `E`. |
| 677 | `eAt(x,y)` | Ground height with off-map = `SEA-0.8` (=1.2, i.e. seabed beyond the edge). | 1026, 1048, 5729, 5755, 8784 |
| 680 | `wetD(i)` | Returns `WD[i]`. The comment above (678–679) says drawn depth = standing + share of flow, but the body is just `WD[i]` — stale comment. | 127 call sites (the sim's standard depth accessor). |
| 682 | `wetDV(i)` | "Depth for drawing": returns `WD[i]` unless `DBG.slackHide` and the water is a thin (0 < d < 0.14), slack (`FLOW < 0.3`), non-sea sheet on a steep tile (`slopeOf > 0.35`) — then 0 (v9.19: a storm's film on a hillside is a wet hillside, not water). | rebuildSurface 722, renderer 9042–10035 (16 sites). |
| 683 | `wetShow(i)` | `wetDV(i) > wetLo(i)` — is the tile drawn as water. | 9040, 9042, 9849 |
| 684 | `isWater(x,y)` | In bounds, not `ICE`, and `wetD > 0.12`. The sim/AI notion of "water you would swim in". | 1030, 3793, 5285, 5680, 5729, 5755, 5772 |
| 685 | `seaOver(i)` | For drawing: if a non-sea tile lies between SEA and SEAS−0.03 and has ≥2 of 4 neighbours in the sea, returns `SEAS−E[i]` (sea depth over it), else 0. **Zero callers — dead code** (superseded by `isSheet`/`SEA_TOUCH` at 9280). | none |
| 694 | `wetLo(i)` | Threshold below which water is not drawn: `WET_FLOW` (0.045) if `FLOW[i] > FLOW_STREAM*0.5` (0.25), else `WET_AT` (0.09). | 683, 693(def), 1127, 1128, 9522, 9731 |
| 695 | `wetDrawn(i)` | `WD[i] > wetLo(i)`. | 2130, 2152, 2156, 2805, 2816, 3608, 9301, 9943, 10236 |
| 696 | `bankDry(i)` | `WD[i] <= wetLo(i) && !SEAC[i]` — ground the picture shows dry, where a dam end or bridge landing may stand (v9.14 fix: previously dam ended at 0.12 and bridge at 0.3 while water painted from 0.045, so ends stood a tile out in the drawn river). | 2890, 3624, 4760 |
| 697 | `surf(x,y)` | Water-surface height `E+WD`, off-map = `SEAS`. | 10452, 10454, 10482 |
| 716 | `rebuildSurface()` | Builds `V`, `VW`, `VWn`, `VWX`, `VSEA` from tiles; smooths; lifts; clamps to the sea. Full algorithm in §4. | 1037, 2680, 2737, 3125, 9581, 11112, **12030 (every sim step unless `lite&1`)**, 12085, 12124, 12225 |
| 781 | `smoothSurface(A)` | One Jacobi pass pulling each vertex toward the mean of its 4 neighbours, scaled down to zero as the difference approaches `SM_EDGE`; writes into `VSM` then `A.set(VSM)`. Edge-preserving: ripples go, cliffs stay. | 744 (×3: V twice, VW once) |
| 791 | `eLerp(fx,fy)` | Bilinear interpolation of `V` at continuous tile coords (shifted by +0.5, clamped to [0, N−0.001]). The drawn ground height under any walker/prop. | 82 call sites |
| 796 | `topAt(fx,fy)` | Height a foot stands on at the rounded tile: `BRIDGE` deck if > 0; on `ICE` → `max(eLerp, E+WD)`; if `WD > 0.12` → `max(eLerp, E+WD)` (swimming at the surface); else `eLerp`. | 13 sites (8546, 8571, 9546, 9606, 9663, 10767, 11234–11319, 12227) |
| 805 | `slopeOf(x,y)` | Max absolute height difference to the 4 neighbours × `S` (=2), i.e. levels per **v7 tile**, so old thresholds keep meaning on the finer grid. | 25 sites incl. 682 |
| 815 | `updateTime(dt)` | Advances the clock; see §5. | `simulate` 12027 |
| 846 | `updateWeather(dt)` | Rolls weather, runs the storm front, eases values; see §6. | `simulate` 12027 |

---

## 4. `rebuildSurface()` in detail (716–770)

For every vertex (vx,vy):
1. Visit the up-to-4 tiles (vx−1..vx, vy−1..vy). **Off-map tile** contributes ground `SEA−0.8` and a wet surface `SEAS`, and marks `seaAt`.
2. In-map tile: `isSheet(i)` → `seaAt`. Ground sum `s+=E[i]`. Depth `d=wetDV(i)`; if `d >` (0.045 if `FLOW>0.25` else 0.09) — **the same rule as `wetLo` but re-hard-coded** — it is a wet surface `h=E+d`, pushed into `VWS`, tracking `lo` (lowest) and `hiw` (highest). Otherwise it is a dry tile: `sd+=E[i]`.
3. `V[k] = mean ground`.
4. If any wet surfaces: `VW[k]` = mean of those within **`lo+0.35`** (a surface more than a third of a level above the lowest is "another body of water" — the rain film on a pit wall, a step in a cascade — and does not pull the corner up; comment 705–712). Then:
   - **Beach lap** (724–729): if any dry tile at the corner, `g = mean dry ground + 0.02`; `VW = min(VW, g)` so the water comes down to the sand instead of standing as a wall.
   - `VSEA[k]=seaAt`, `VWX[k]=hiw`.
   Else `VW=V`, `VWn=0`, `VWX=V`, `VSEA=0`.
5. `smoothSurface(V)` twice, `smoothSurface(VW)` once (744).
6. **Lift pass** (753–761, v9.9.1): for wet corners where `VW < V`, raise `VW` to `min(VWX, V)` — closes the step on a cascade (where the drawn sheet fell below the twice-smoothed ground and the bed showed as a band along every edge) while never lifting above the water that is really there (which would throw a pit pond up its walls in spikes — "the v9.7.1 fault, back again for a day in v9.9.1").
7. **Sea clamp** (762–769, v9.13): `VSEA` corners get `VW = min(VW, SEAS)` so a river's last corners meet the flat sea sheet instead of ending a few hundredths above it (which showed as a dark line along the whole shore edge).

`smoothSurface` (781–789): `dd = mean(4 nbrs) − v`; if `|dd| < 0.42` then `v += dd × 0.5 × (1 − |dd|/0.42)`, else unchanged. Border vertices use themselves for missing neighbours. `E` is never touched (comment 771–779): sim, slopes and pathfinding see the true ground; only the drawing and where feet are drawn use `V`, and both read the same surface so nothing floats.

Cost: 5329 vertices × 4 tiles per step; `wetDV` may call `slopeOf` (4 reads) per visit. It runs every sim step at speeds ≤ 6× (`lite&1` is 0 — line 12083: `lite = T.speed>6 ? 3 : 1`... note `lite=1` means bit 0 set, so at ≤6× speed `!(lite&1)` is **false**; re-read: `const lite=T.speed>6?3:1` then `if(!(lite&1)) rebuildSurface()` — bit 0 is set in both cases, so the per-step call at 12030 is **never** taken; the surface is instead rebuilt at 12085 once per frame after the step loop. The comment at 12031 ("the surface the gnomes stand on follows the ground every step") describes the intent, not the code path. Worth confirming with the owner of section 12.)

---

## 5. `updateTime(dt)` rules (815–828)

- `T.abs += dt/DAYLEN` — a day is **210 real seconds** at 1×; `T.f = abs % 1`; `T.day = floor(abs)+1`.
- Season `sn = floor((day−1)/SEASON_DAYS) % 4` — **3 days per season, 12-day year (42 min at 1×)**. On change (and `day>1`) logs one of: "Spring has come to the isle" / "Summer on the isle" / "Autumn — the leaves are turning" / "Winter — snow on the high ground" (818). The `typeof logEv==='function'` guard is unnecessary (function declaration at 10717, hoisted) but harmless.
- `T.light = clamp01(−cos(2π f)·0.86 + 0.42)`: fully dark for f < ~0.169 and f > ~0.831 (about a third of the day is night), fully bright for f ≈ 0.386–0.614, smooth cosine ramps between. (`todName` at 10740: Night <0.18, Dawn <0.28, Morning <0.44, Midday <0.56, Afternoon <0.68, Dusk <0.82, Night.)
- `T.ds = ((day−1) % 3) + f` — continuous position in the season, 0..3.
- Cold: autumn (`sn=2`) ramps 0→1 across the **last autumn day** (`clamp01((ds−2)/1.0)`); winter = 1; spring ramps 1→0 over the **first 0.8 day** (`clamp01(1−ds/0.8)`); `thaw = 1` for the first **2 days** of spring, else 0. `T.cold = max(cold, W.snow·0.6)` — snowfall out of season still chills.
- Consumers: cold raises gnome hunger ×(1+0.55·cold) at 5566; thaw multiplies spring inflow ×1.6 at 1103 and triggers "The thaw — meltwater is running…" at 5802.

---

## 6. `updateWeather(dt)` rules (846–881)

**Rolling the next kind (847–856):** `W.next -= dt`; at ≤0 pick uniformly from a per-season list (so duplicates are weights):
- Spring: clear, fair, fair, rain, mist, breeze, cloudy, storm (storm 1/8, fair 1/4)
- Summer: clear, clear, fair, breeze, cloudy, rain (no storm, no mist, no snow)
- Autumn: fair, cloudy, rain, mist, breeze, clear, storm (storm 1/7)
- Winter: snow, snow, cloudy, mist, clear, fair, breeze (no rain, no storm; snow 2/7)
Duration: storm `rnd(70,120)+28` s; anything else `rnd(45,140)` s. Entering a storm from a non-storm: `front=0` and log "A storm is coming in off the sea — the clouds are rolling in". Uses the **sim rng** (`pick`,`rnd`) so weather is seed-deterministic.

**Storm front (839–843 comment, 858–863):** if kind is storm and `front<0` it is set to 0 (a harness that sets `W.kind='storm'` directly still gets its bank). While storm: `front → 1` at `dt/28`. After the storm ends: `front` keeps rising 1→2 at the same rate then resets to −1. `cover = front` (≤1) or `clamp01(2−front)`.

**Spate (865):** exponential approach to `target = cover` (storm) or 0, with **half-life 18 s rising, 80 s falling** ("most of a day to fall back").

**Targets (866–871):** `rs = 1−0.5^(dt/2.6)` (half-life 2.6 s) for cloud/rain/mist/snow; `rw = 1−0.06^dt` (~94%/s) for wind.
- Storm: cloud `0.55+0.45·cover`; rain `clamp01((front−0.33)/0.34)` → rain starts when the bank is a third across, full at two thirds; wind `0.6+0.4·min(1, 2·front)`.
- Bank rolling out after a storm (`front ≥ 0`, kind ≠ storm): cloud ≥ `0.55+0.45·cover`; rain ≥ `clamp01((1.62−front)/0.3)` → rain stays full until front 1.32, gone by 1.62.
- `cloud`, `rain`, `mist`, `snow` ease toward targets (872–873).

**Wind & gusts (874–877):** `windP += 0.21·dt`; `gust = 0.55 + 0.45·sin(0.7·windP)·sin(0.23·windP+1.3)` (two incommensurate sines, range ~0.1..1.0); `wind += (tw·gust − wind)·rw·0.6`; `drift += wind·dt·22` (cloud scroll).

**Wet look (879–880, v9.15):** `wet` chases `rain` with half-life **4 s up, 150 s down**.

---

## 7. UI elements / controls / input handling in this range

None directly. Indirect hooks:
- `T.speed` is the speed dial / pause button state (12136–12138) and is initialised from the URL hash: any hash containing `halt` starts paused (814). The seed convention `#s=NNN` is parsed at 12098.
- `WK[kind].label` and `W.kind` feed the HUD weather text and dot (10849–10850); `T.day`, `T.season`, `T.f` feed "Day N · Season" and time-of-day (10847–10848).
- `W.kind` can be assigned from outside (harness) and the code tolerates it (858).

## 8. MODE 'creator' vs 'gnome'

Nothing in 611–881 references `MODE` (declared at 5630). The whole block is mode-agnostic world state. `MADE` (635) records the creator's terrain edits; `markSea`/`rebuildSurface` are re-run after a creator stroke (11112, 11158). `topAt` is what the avatar (gnome mode) stands on.

## 9. Progression / unlock / economy

None here. The layer exposes counters that progression elsewhere reads: `WEAR` → paving (comment 619–620), `FISHN/CLIMBN/QUARRYN` activity counts, `W.spate` → bridge sweeping (3319) and flooded-cabin bank-building (4348/4393), `T.cold` → hunger, `T.thaw` → meltwater.

## 10. Persistence

**None.** The file has no `localStorage`/`sessionStorage`/`JSON.stringify` anywhere. The world is reproducible from the seed in the hash (`#s=seed`, 12098/12115) plus deterministic sim rng; `T` and `W` are not saved.

## 11. Mobile / touch / performance tricks

- Everything is flat typed arrays (`Float32Array`, `Uint8Array`, `Int32Array`) indexed `y*N+x`; no objects per tile.
- Preallocated scratch: `SEAQ` BFS queue (642), `VWS` 4-slot array (713), `VSM` (780) — zero allocation in the hot paths.
- `markSea` is only re-run on terrain edits, not per step.
- `rebuildSurface` is gated by the `lite` bitmask (12030) intended to skip it at high sim speed; see the note in §4 about the actual bit logic.
- `wetDV`'s slack-hide branch is short-circuited by `DBG.slackHide` and cheap depth tests before calling `slopeOf`.
- Two rng streams (sim vs visual) keep the sim frame-rate independent; `updateWeather` uses the sim stream, lightning (8839) the visual one.

## 12. i18n (en/es)

The only language switch in the file is the **intro screen** (`langs` table and `paintIntro` at 12200–12214, buttons at 309–312). Nothing in this range is translated: the season messages (818), the storm message (855) and the `WK.label` strings (830–837) are English literals and are shown in the HUD/log regardless of the ES toggle. A port needs these to be table-driven keys.

## 13. Oddities, bugs, dead code, TODOs

1. **Dead function** `seaOver(i)` (685): no callers; replaced by `isSheet`/`SEA_TOUCH` (9280).
2. **Dead field** `W.stormT` (845): never read or written.
3. **Stale comment** 678–679 says drawn depth includes "a share of what is flowing through"; `wetD` returns plain `WD[i]`.
4. **Duplicated magic numbers**: rebuildSurface line 722 re-hard-codes `0.045/0.09/FLOW_STREAM*0.5` instead of calling `wetLo(i)` (694). If `WET_AT`/`WET_FLOW` change, the vertex surface and the tile rule diverge.
5. **`lite` gating** at 12030/12083 (verified): the UI loop passes `lite` = 1 (speed <= 6x) or 3 (> 6x), both with bit 0 set, so `if(!(lite&1)) rebuildSurface()` never fires from the UI; the surface is rebuilt once per frame at 12085 (`if(ns>0) rebuildSurface(); // once a frame`). Only a harness calling `simulate(dt)` with `lite` undefined gets the per-step rebuild. Harmless visually, but the comment at 12031 ("follows the ground every step") describes the harness path, not the UI path (outside the range; flagged for section 12).
6. `markSea` is not re-run when erosion lowers a tile below `SEA` or deposition raises one above it; sea membership only updates on creator strokes (11158) and init. Probably intended (comment 637–641 keeps "sea" a map-edge notion) but worth knowing.
7. `/halt/.test(location.hash)` matches any hash containing "halt" (e.g. `#shalt`).
8. `typeof logEv==='function'` (818) is a redundant guard.
9. `isWater` ignores `wetDV`'s slack-hide, so a tile can be drawn dry yet count as water for the AI (depth 0.12–0.14 on a steep slack slope). Edge case only.
10. `SNW` material (674) is used only 3 times elsewhere — nearly vestigial.
11. `T.abs` starts at 0.34 but `T.light` is initialised to 1 and `T.day` to 1 before the first `updateTime`; fine since `updateTime` runs on the first sim step.
12. Many "v9.xx" change-log comments in the code (v9.7.1, 9.9, 9.9.1, 9.13, 9.14, 9.15, 9.19, 9.20, 9.22): valuable rationale, but they are history, not spec — a port should capture the *rule* and drop the archaeology.

## 14. Reusable engine vs gnome-specific

**Reusable shell / engine (take as-is or with renames):**
- The flat-typed-array tile-state pattern with `I`, `inB`, `eAt`, bounds conventions (612–676).
- Vertex-surface construction + edge-preserving `smoothSurface` + `eLerp`/`topAt`/`slopeOf` (699–812): this is the whole "things stand on a smooth drawn ground while the sim sees the true ground" trick, useful for any isometric terrain with props and walkers.
- The clock: `T` with day fraction, light cosine, day/season counters, pause-via-hash (814–828).
- The weather machine: table of kinds, per-season weighted lists, eased transitions, gust synthesis, wet look, a scripted "front" choreography with lead time, external override tolerance (829–881).
- Harness/determinism conventions: sim-rng weather, `#s=seed&halt`.

**Gnome/island-specific (replace or delete):**
- The *sea* as the world boundary: `SEAC`, `SEAQ`, `markSea`, `SEAS`, `VSEA`, off-map = seabed, beach-lap and sea-clamp passes in `rebuildSurface`, `seaOver`.
- The hydraulic erosion state: `E0`, `SOIL`, `FLOW`, `FDX/FDY`, `FX/FY/FP/FQ`, `SED`, `SAND`, `KSOFT`, `MX/MY`, `VX/VY`, `RIVER`, `DAM`, and the spate/bridge-sweep logic hanging off `W.spate`.
- Gnome construction & activity layers: `BRIDGE`, `PIER`, `STEPS`, `PAVE`, `OCC`, `PREP/PREPF`, `FISHN/CLIMBN/QUARRYN`, `MADE` bits. (`OCC`, `WEAR/PATHST/TROD` and a deck-height layer like `BRIDGE` generalise well to a park: benches, kiosks, bandstands, worn gravel paths.)
- Winter/ice: `ICE`, `SNW`, cold/thaw, snow weather.
- All prose strings (season and storm log lines, weather labels).

---

## 15. Design questions for the Parque D'Amour port raised by this section

1. **World boundary:** the engine assumes an island in a sea (off-map = seabed, flood-fill defines the sea, surface passes clamp to the sea sheet). A park is bounded by railings/streets. What is off-map in the park — a wall, a street, a hedge? Does any of the sea machinery survive (e.g. a lake with a "sheet")?
2. **Grid size and fineness:** keep `S=2`, `N=72` (5184 tiles)? A quaint park might be smaller or need finer tiles for flowerbeds and benches. `TW/TH` and every old threshold are scaled by `S`.
3. **Water:** does the park have a pond, fountain or stream? Static (hand-placed `WD`, no flow, no erosion) or simulated? If static, the erosion arrays, `FLOW`-dependent draw thresholds and `spate` can go; `WD`, `VW`, `wetLo`, `bankDry` (for a jetty/footbridge) stay.
4. **Does terrain change at all in Creator mode?** If the creator only places objects on fixed ground, `rebuildSurface` runs once at load and `markSea` disappears; if the creator sculpts hills/ponds, keep the per-stroke rebuild and the `MADE` audit bits.
5. **Day length and calendar:** 210 s days and a 12-day year suit a village sim. A romance arc may want longer days (a date lasts an afternoon), fewer seasons (Paris in spring/summer only?), or a date-based calendar (14 February, 14 juillet) instead of 4×3 days. Does cold/thaw/snow exist at all?
6. **Light curve and start time:** `T.abs=0.34` starts mid-morning and night is ~a third of the day. Romance wants golden hour and lamplit evenings — should `todName`/light be reshaped (longer dusk) and the day start in the afternoon?
7. **Weather as a gameplay lever:** which kinds matter for assisting/sabotaging (rain → shared umbrella or ruined picnic, mist → romantic/hiding, breeze → hat blows off, storm → sabotage opportunity)? Should the player be able to *set* weather (the code already tolerates external `W.kind` writes and gives a storm its front), and at what cost?
8. **Determinism:** weather currently uses the sim rng (seed-reproducible). If outcomes of assist/sabotage depend on weather, keep it on the sim stream; if weather is mood only, move it to the visual stream so it does not perturb replays.
9. **Which tile layers map to park content?** `OCC` (benches, kiosks, statues), `WEAR/PATHST/TROD/PAVE` (visitors wear the lawn, gardeners lay gravel — a nice emergent-path mechanic to keep), a deck layer like `BRIDGE` (bandstand, footbridge over the pond), new layers for hedges (line of sight for eavesdropping/hiding?), flowerbeds, lamp posts.
10. **Material enum:** replace `MEA/GRS/SCR/ROK/SNW/SND/WAT` with lawn, gravel, cobble, flowerbed, water, hedge, sand (boules court)?
11. **i18n:** this section shows the pattern of English literals in logic. Should Parque D'Amour be FR/EN (or FR/EN/ES) from the start with every label/event a key in a table?
12. **Harness conventions:** keep `#s=seed&halt` and the `simulate(dt, lite)` entry so automated runs stay reproducible?
13. **Avatar mode:** `topAt` is what the avatar stands on (bridge deck, ice, water surface, ground). Which elevated or special surfaces does the park need (bandstand steps, boat on the pond, bench seats)?
14. **Wet look / puddles:** keep `W.wet` (4 s up / 150 s dry) for rain-slick paths and the romantic "after the rain" moment?
