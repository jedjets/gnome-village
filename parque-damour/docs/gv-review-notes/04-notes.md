# Gnome Village review — section 04: "Generation, water & erosion" (lines 882–1358)

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Range read in full: 882–1358 (477 lines). Symbols outside the range were resolved with grep only; line numbers below are all absolute file lines.

---

## 1. Purpose of the section

This block is the **terrain + hydrology core** of the sim:

1. **`genIsland(seed)` (885–1037)** — a deterministic, seed-driven island generator: picks one of four island silhouettes, builds a height field with fBm noise, blurs it, carves 1–2 rivers with graded valleys and springs, lays a soil blanket with soft/hard patches, classifies materials, scatters meadow flowers and ground-cover props, and chooses where the founders camp.
2. **`setMaterials()` (1051–1064)** — a rule-based classifier that turns height / slope / soil / water depth into one of seven surface materials per tile.
3. **Water & erosion sim (1066–1298)** — an *active-set* shallow-water solver on a staggered edge grid (Chezy-style friction on each of four edge directions per tile), with sediment transport (dig / deposit), bend/bank wear, springs, rain, soak-away, sea level hold, shoal building, and freezing/thawing (`iceStep`).
4. **Bank slumping & fresh-earthwork settling (1299–1346)** — `slumpStep` walks a queue of disturbed tiles and relaxes over-steep banks; `relaxMark` lets the Creator's raise/lower tools round their strokes into basins/hills over 60 s. Also soil regrowth and sand greening.
5. **Flow thresholds + throttled material/ice refresh (1347–1358)** — the named flow numbers the rest of the game reads (`FLOW_STREAM`, `FLOW_RIVER`, `FLOW_ICE`) and `updateMaterials(dt)`.

Nothing in this range touches the DOM, input, `MODE`, persistence, or i18n directly. It is pure simulation state + a few `logEv`/`sfxCreak` side effects.

---

## 2. Global / state variables defined or mutated here

### Defined in this range

| Name | Line | Type / shape | Notes |
|---|---|---|---|
| `world` | 883 | `{seed:uint32, name:string, springs:[{x,y,rate,(player?,lvl?,ph?)}], camp:{x,y}|null, rivers:[[ [x,y],... ]]}` | `name` doubles as "an isle exists" flag at 6339 (`!cam.free&&world.name`). Player-made springs (11081) add `player:true, lvl, ph`. |
| `flowers` | 884 | `[{x,y,c:'#hex',n:2..4,sd:0..9}]` | meadow flowers, drawn at 9710 when zoom Z>0.8. Placed on the **sim** RNG. |
| `cover` | 884 | `[{x,y,k:0|1|2,sd:0..9,sc:0.8..1.25}]` | ground-cover props (0 grass tuft, 1 clover, 2 pebble). Placed on the **visual** RNG. Drawn at 9710 when Z>=1.0. |
| `wetList` | 1079 | `number[]` | the active set of wet tile indices for the next `waterStep`. |
| `inWet` | 1079 | `Uint8Array(NC)` | dedupe flag for `wetList`. |
| `WETP` | 1080 | `Uint8Array(NC)` | "is in this step's source set" marker. |
| `SC` | 1080 | `Float32Array(NC)` | per-tile outflow scale (0..1) so no tile gives more than 90 % of its water in a step. |
| `U` | 1080 | `Float32Array(NC)` | smoothed water speed (discharge/depth). Also reset at 2075 by channel digging. |
| `DW`, `DS` | 1080 | `Float32Array(NC)` | per-step water / sediment deltas. |
| `AX`, `AY` | 1080 | `Float32Array(NC)` | accumulated incoming momentum direction (weighted by amount) → feeds `MX/MY`. |
| `touched`, `inTouched` | 1081 | `number[]`, `Uint8Array(NC)` | receivers of water this step that may not be in `wetList`. |
| `waterTotal`, `erosionTotal`, `lateralTotal` | 1082 | numbers | debug totals; only read by `window.__GV.info()` at 12241. Never reset on a new isle. |
| `erodeHold` | 1082 | seconds | countdown before erosion may start after `initWater` (8 s). |
| `SPRING_BASE` | 1083 | 2.2 | natural spring rate. |
| `SOAK` | 1084 | 0.002 levels/s | still water on land soaks away. |
| `SPRING_W` | 1085 | `[0.40,0.15,0.15,0.15,0.15]` | spring spread over centre + 4 neighbours. |
| `SPRING_CAP` | 1086 | 0.55 | max depth a spring pool fills to. |
| `G_ACC`, `FR_A`, `FR_B`, `WT_D` | 1087 | 12, 0.6, 0.04, 0.5 | head push, base friction, depth friction, diagonal edge weight. |
| `D_HOLD` | 1088 | 0.06 | film thinner than this clings to ground unless head drop ≥ 0.25. |
| `KC`,`U_C`,`KE`,`KD`,`ROCK_K`,`KL`,`KI` | 1089 | 0.068, 3.5, 0.016, 1.6, 0.22, 0.0007, 0.5 | capacity coeff, threshold speed, dig rate, settle rate, rock hardness, bank wear, bar growth. Comment logs v9.22 retune (KE 0.012→0.016, KL 0.0005→0.0007, KC 0.06→0.068). |
| `iceT`, `iceCount`, `froze` | 1108 | number, int, bool | ice throttle timer (1.6 s), count of ice tiles (**write-only, never read elsewhere**), "has frozen" latch for the log messages. `froze` is **not reset** by `newIsland`/`initWater`. |
| `ICE_NB` | 1109 | 4-neighbour offsets | |
| `SLQ`, `inSLQ` | 1300 | `number[]`, `Uint8Array(NC)` | slump work queue (declared after its first use at 1086 — fine at runtime, TDZ never hit). |
| `slumpT` | 1302 | seconds | slump throttle accumulator (0.25 s). |
| `RELAX` | 1311 | `Float32Array(NC)` | seconds left of "fresh earthwork" per tile. Not cleared on new isle. |
| `RELAX_AT`, `RELAX_T` | 1311 | 0.75, 60 | settle target bank (levels per fine tile), settle duration (s). |
| `SLUMP_AT`, `ROCK_AT`, `SLUMP_RATE` | 1347 | 0.32, 1.5, 0.30 | soil bank limit, rock wall limit, slump rate. Declared **after** `slumpStep` uses them (runtime-OK). |
| `FLOW_STREAM` | 1348 | 0.5 | "reads as a stream" (ripples, sound, `wetLo` threshold at 692, pathfinding 1435, sweep 3534, mill 2864…). |
| `FLOW_RIVER` | 1349 | 1.3 | can sweep a gnome; a mill wants ≥ this (1656, 1996, 2012, 3047, 3173, 3323, 3434). |
| `FLOW_ICE` | 1350 | 4.0 | faster than this never freezes (only used in `iceStep`). |
| `matT` | 1351 | seconds | material refresh throttle (0.7 s). |

### Mutated here but declared elsewhere (declaration line in parens)

- `_rng`, `rngN`, `vrng` (588, 594) — reseeded at 887: sim stream = `mulberry32(seed)`, visual stream = `mulberry32(seed ^ 0x9E3779B9)`.
- `E` (612) ground height; `E0` (613) "given ground" snapshot (969; and updated at 1334 for fresh earthwork).
- `WD` (614) water depth; `SOIL` (615); `FLOW` (616); `FDX/FDY` (617–618) flow direction; `WEAR` (619, cleared only); `MAT` (621).
- `PREP/PREPF` (622–623), `BRIDGE` (626), `PIER` (627), `STEPS` (628), `DAM` (629), `PAVE` (630), `OCC` (631), `FISHN/CLIMBN/QUARRYN` (632–634), `MADE` (635) — all **cleared** at 985–986 (read-only otherwise here).
- `MINEB/MINEZ` (2996–2997) — cleared at 985 behind a `typeof` guard; `MINEB` read at 1237 *without* a guard.
- `SEAC` (636) via `markSea()` in `initWater`.
- `RIVER` (653) set 1 on river path + 4-neighbours at 988.
- `ICE` (654).
- `FX/FY/FP/FQ` (660–663) edge discharges; `SED` (664); `SAND` (665); `KSOFT` (666); `MX/MY` (667–668); `VX/VY` (669–670).
- `T.season/T.thaw/T.cold` (814) read; `W.rain/W.spate` (845) read.

---

## 3. Functions (all in range, in order)

| Function | Line | Signature | Does | Called by |
|---|---|---|---|---|
| `genIsland` | 885 | `(seed)` | Builds the whole isle (see §4). | `newIsland` 12110; exported on `window.__GV` 12224 |
| `blurE` | 1039 | `(times)` | `times` passes of a 5-tap box blur (centre×4 + 4 neighbours)/8 over interior tiles; border row/col untouched. Allocates a `Float32Array` copy per pass. | `genIsland` 911 |
| `snowy` | 1046 | `(x,y)→bool` | counts the 8 neighbours at coarse distance `S` whose height ≥ `EMAX-1.1` (7.9); snow if ≥5. | `setMaterials` 1056 |
| `setMaterials` | 1051 | `()` | classifies every tile into `WAT/SNW/ROK/SCR/SND/GRS/MEA` (rules in §4.3). | `genIsland` 1002; `updateMaterials` 1354; undo 11112; terrain-stroke end 11158; exported |
| `markWet` | 1090 | `(i)` | dedupe push onto `wetList`. | all over the water code; dam 3524/3667/4185; tools 11082/11128/11131; mine 2679/3125; exported |
| `touch` | 1091 | `(i)` | dedupe push onto `touched`. | `move` closure 1181 |
| `initWater` | 1092 | `()` | `markSea()`; clears every flow/sediment/direction array, `SLQ`, `touched`; `erodeHold=8`; re-marks every tile with `WD>0.02` wet. Does **not** clear `U`, `SC`, `RELAX`, `froze`, `iceT`, `slumpT`, `matT`, totals. | `newIsland` 12113; undo 11112; exported |
| `rainFactor` | 1100 | `()→number` | seasonal × thaw × rain × spate multiplier for spring output (§4.4). | `waterStep` 1137 |
| `iceStep` | 1110 | `(dt)` | every 1.6 s: bank-creeping freeze/thaw (§4.6); logs the two ice events. | `updateMaterials` 1355 |
| `isSpringTile` | 1133 | `(i)→bool` | true if `i` is a spring centre or one of its 4 neighbours (no x-wrap check on `±1`). | `iceStep` 1125; `waterStep` 1244 |
| `edgeFlux` | 1135 | `(F,o,p,wt,dt)` | integrates one edge's discharge: ice blocks; push by head × `G_ACC` × `wt`; thin-film hold rule; Chezy-ish friction with film drag. | `waterStep` 1151–1157 |
| `waterStep` | 1161 | `(dt)` | one shallow-water + sediment substep over the active set (§4.5). | `simulate` 12028–12029 (sub-stepped ≤0.034 s); exported |
| `slumpMark` | 1301 | `(i)` | dedupe push onto `SLQ`. | `waterStep` 1258, 1281; `relaxMark` 1312; `slumpStep` |
| `relaxMark` | 1312 | `(x,y)` | sets `RELAX=60` on the 3×3 around (x,y) and queues them. | raise tool 11128; lower tool 11131 |
| `slumpStep` | 1313 | `(dt)` | every ≥0.25 s: relax over-steep banks from `SLQ`; then whole-grid sand decay + soil regrowth (§4.7). | `simulate` 12028–12029 |
| `updateMaterials` | 1352 | `(dt)` | every 0.7 s `setMaterials()`; then `iceStep(dt)` each call. | `simulate` 12032 |

Note: `move` (1180) is an arrow closure *inside* `waterStep`, allocated per call.

---

## 4. Concrete rules & tuning numbers

### 4.1 Grid facts used here (declared 567–576)
- `S=2` fine tiles per legacy "v7" tile; `N=36*S=72`; `NC=5184`; `EMAX=9` levels; `SEA=2.0`; `SEAS=SEA+0.5=2.5` (sea surface); `S2=4`; `DIG_FLOOR=SEA-1.0`.
- `slopeOf(x,y)` (804) = max |Δh| to 4-neighbours **× S**, i.e. levels per coarse tile.

### 4.2 `genIsland(seed)` step by step
1. **886–887** seed stored as uint32; sim RNG = `mulberry32(seed||1)`, `rngN=0`; visual RNG = `mulberry32((seed ^ 0x9E3779B9)>>>0)`.
2. **888** two noise fields: `nA=noise2(seed*19+3)`, `nB=noise2(seed*77+11)`.
3. **889–890** `shape=pick(['crescent','ridge','bowl','twin'])` → names `Crescent Isle / Long Ridge / The Green Bowl / Twin Fells`.
4. **891** `ridgeA∈[0,2π)`, `c1∈[0.30,0.50]²`, `c2∈[0.55,0.75]²` (u,v fractions).
5. **892–910** height field per tile (`u,v` = 0..1 across map; `cx,cy=x/S` so noise is sampled at coarse scale):
   - base `h = 0.48 + (fbm2(nA, cx*0.07, cy*0.07, 5) − 0.5) * 0.52`
   - ridge: `d=|(u−.5)cosA+(v−.5)sinA|`; `h += clamp01(1−d/0.34)^1.7 * 0.38`
   - crescent: `h += clamp01(1−dist(c1)/0.40)^1.5 * 0.50`
   - bowl: `d=dist(center)`; `h += clamp01((d−0.14)/0.30)^1.4 * 0.36` (rim high, centre low)
   - twin: `+= clamp01(1−dist(c1)/0.28)^1.6*0.46` and `+= clamp01(1−dist(c2)/0.24)^1.6*0.40`
   - edge falloff (square): `edge=max(|u−.5|,|v−.5|)*2`; `h −= edge^3.2 * 0.72`
   - detail: `+(fbm2(nB,cx*.20,cy*.20,3)−.5)*0.08` and `+(fbm2(nB,cx*.09+7.3,cy*.09+2.1,2)−.5)*0.05`
   - `E = clamp(h*EMAX*0.96, 0, EMAX)`
6. **911** `blurE(5)`.
7. **913–965 rivers**, two passes:
   - **915–922** spring candidate: scan tiles with margin `5*S` from edges; need `E > SEA+2.2`; must be ≥ `12*S` Manhattan from existing springs; score `E + rnd(0,1.2)`; highest wins; break if none.
   - **923–935** greedy downhill walk, 4-neighbour, up to `220*S` steps, noise `rnd(0,0.55)` on neighbour heights, no revisits (`seen` object), stop at `E ≤ SEA+0.15` or dead end.
   - **936–939** spring moves down-path to the first index (within first 40 % of path) where 4 consecutive drops are each ≤ 0.26 ("not on the summit cascade").
   - **940** `springs.push({x,y,rate: 2.2 + pass*0.30})` → 2.2 and 2.5.
   - **941–957 valley**: `R=4*S` (half-width 8 fine tiles); profile `prof = max(eSea+(eTop−eSea)*(1−k/L)^1.4, eSea+(L−k)*0.06)` with `eTop=E[spring]−0.40`, `eSea=SEA−0.1`; `floor` is monotone non-rising: `floor=max(min(floor, prof, E[path]−0.15), eSea)`; each tile within R lowered to `min(E, max(lerp(E,floor,w), floor+0.30*max(0,dist−0.5)))` with Gaussian `w=exp(−dist²/(1.4*S*1.4))` (**note:** `1.4*S*1.4 = 3.92`, not `(1.4*S)² = 7.84` — probably a typo; narrower than intended). Valley sides max 0.30 per fine tile.
   - **960–963 channel**: bed `= E−0.65`; the 4 neighbours clamped to `≤ bed+0.48`.
8. **968** micro-grain `±0.03` on tiles above `SEA+0.3` (sim RNG, NC draws); clamp ≥0.
9. **969** `E0.set(E)`.
10. **985–986** reset of 22 per-tile arrays (water, flags, counters, ICE, MADE, RIVER).
11. **987** sea fill `WD = SEAS−E` where `E ≤ SEA`.
12. **988** river tiles above sea get `WD ≥ 0.35`; `RIVER=1` on path + 4-neighbours.
13. **992–996 soil**: `SOIL = clamp(0.95 − slope*0.40 − max(0,E−6)*0.14, 0.12, 1.0)`; `KSOFT = 0.55 + 0.9*fbm2(nC=noise2(seed*131+7), x*0.45, y*0.45, 3)` → [0.55,1.45].
14. **997** `SAND=0; SED=0`.
15. **999–1001** river bed is bedrock: on path `SOIL=0, KSOFT≤0.10`; radius-2 ring: `SOIL ≤ 0.35` (dist<1.5) / `≤ 0.5`; `KSOFT ≤ 0.15` for dist<1.5.
16. **1002** `setMaterials()`.
17. **1004–1009 flowers**: `160*S=320` tries on sim RNG; keep if `WD≤0.05`, `SEA+1.2 < E ≤ 6.6`, `slope ≤ 0.55`; colours `#F2B9CF #FBE7B8 #F7F2F8 #EDA9C4`; `n∈[2,4]`; jitter ±0.45.
18. **1013–1020 cover**: `300*S=600` tries on **visual** RNG; keep if `WD≤0.05`, `E > SEA+0.25`, `slope ≤ 1.4`; `SCR/ROK/SND→pebble(2)`; `MEA→72 % tuft(0) else clover(1)`; `GRS→85 % tuft else pebble`; other materials skipped; `sc∈[0.8,1.25]`.
19. **1022–1035 camp**: margin `4*S`; candidates `WD≤0.05`, `SEA+0.8 < E ≤ 6.2`; `flat` = Σ|e − eAt(neighbour at distance S)| over 8 dirs; `wd` = ring distance to nearest `isWater` (≤`10*S`); score `= −flat*2.0 − |wd−3S|*1.5/S − |e−(SEA+2.2)|*0.8` → prefers flat ground ~6 fine tiles from water at ≈4.2 levels; default `(N/2,N/2)`.
20. **1036** `rebuildSurface()`.

### 4.3 `setMaterials()` rule order (1055–1061)
1. `wetD(i) > 0.12` → `WAT`
2. `E ≥ EMAX−0.9 (8.1)` and `snowy` → `SNW`
3. `SOIL < 0.06` or `slope ≥ 1.9` → `E ≥ 6.5 ? ROK : SCR`
4. `E ≥ 8` → `SCR`
5. `E ≤ SEA+0.95 (2.95)` → `SND`
6. `E ≥ 6` → `GRS`
7. else `MEA`
(ICE is not a material; frozen tiles still read `WAT`.)

### 4.4 `rainFactor()` (1100–1105)
`f = 1`; spring(0) ×1.35, summer(1) ×0.72, autumn(2) ×1.0 (implicit), winter(3) ×0.55; thaw ×1.6; then `× (1 + W.rain*1.9) × (1 + W.spate*2.2)`.

### 4.5 `waterStep(dt)` (1161–1298)
- **Springs 1140–1144**: for `[i, i+1, i−1, i+N, i−N]` with `SPRING_W`; skip `E ≤ SEA`; `cap = 0.55*(1+spate*0.6)`, neighbours fill to `0.8*cap`; add `rate*dt*rf*w`.
- **Rain 1145–1148**: only if `W.rain > 0.28`; `n = min(180, round(rain*dt*120*S2*(1+spate)))` random land tiles each `+0.030`. (At rain=1, dt=1/60: 8 tiles/substep.)
- **Step 1 (1153–1160)**: each wet interior tile integrates its 4 owned edges (+x, +y, +x+y wt 0.5, −x+y wt 0.5) and the edges owned by dry neighbours, so every edge touching wet water is done once. Border ring skipped.
- **`edgeFlux` (1135–1146)**: `f += dt*12*Δ(E+WD)*wt`; hold: source `WD ≤ 0.004`, or `WD < 0.06` with head < 0.25 → `0`; `d = max(0.04, upstream WD)`; `film = d<0.2 ? 1+0.5*(0.2/d)² : 1`; `f /= 1 + dt*(0.6 + 0.04*film*|f|/d³)`.
- **Step 2 (1162–1175)**: outflow sum; `SC = min(1, 0.9*WD/(out*dt))`; `VX = .5(fx⁺+fx⁻) + .3536(fp⁺+fp⁻) − .3536(fq⁺+fq⁻)`, `VY` similar; `FLOW` eases to `out*SC` with rate `dt*2.0`; `U` eases to `oq/max(0.06,w)` with rate `dt*4.0`; `U` clamped at 7 later (1248).
- **Step 3 (1180–1201)**: `move(from,to,amt)` transfers water, a proportional share of `SED` (`amt/WD`), and momentum `amt*FDX/FDY` into `AX/AY`. Dry-owned edges may only carry water *out* of the wet tile. Deltas applied; touched tiles with `WD>0.004 && !ICE` become wet.
- **Step 4 (1203–1296)** per source tile:
  - sea (`E ≤ SEA`): sediment deposits only if `E ≥ SEA−0.9`, up to `SEA−0.1` (a shoal, never dry); `WD = SEAS−E`, `FLOW=0`; stays wet if it had surplus `>0.01` or edge fluxes sum `>0.02`. Line 1229 ("a bar has risen out of the sea") is **unreachable** (nothing between the two `E≤SEA` checks can raise E above SEA).
  - border → zeroed (map edge is a sink).
  - dry (`w ≤ 0.004`): sediment dumped onto ground (`E+=SED, SOIL+=SED`), everything reset incl. `ICE`.
  - ice → keep.
  - `MINEB` (mine pit) → drains `0.12/s` (v9.20).
  - direction smoothing: `FDX/FDY ← VX/|V|` rate `dt*1.2`; `MX/MY ← AX/|A|` rate `dt*0.8`.
  - **still** (`FLOW < 0.02`): `w −= 0.002*dt` unless `DAM` or spring tile; sediment settles `SED*1.6*dt` (`SAND += dep*0.5`).
  - **erosion** gate: `mayDig` (erodeHold ≤ 0) and `!DAM && BRIDGE==0 && !OCC && E > SEA+0.5`:
    - `ue = (u > 3.5 && w ≥ 0.10 && q ≥ 0.6) ? u−3.5 : 0`; `cap = 0.068*ue²*q`.
    - dig: `cut = (cap−SED)*0.016*KSOFT*dt`; beyond soil only `0.22×`; `cut ≤ 0.25`; `SAND` reduced; self + 4 neighbours `slumpMark`.
    - deposit: `dep = (SED−cap)*1.6*dt` → `E, SOIL, SAND`.
    - **bend** (`q > 0.6`): outward component of `MX/MY` perpendicular to flow, plus bank-softness bias `(KSOFT[left]−KSOFT[right])*0.45` if `|dk|>0.02`; if `s > 0.35`: outer bank tile must be `> E+w*0.5` and `> SEA+0.5`, unprotected; `bc = 0.0007*q*u*s*KSOFT[kk]*dt` (rock ×0.22), capped at `(E[kk]−E[i])*0.5` → `lateralTotal`. Inner bank: `dep = min(SED*0.5*s*dt, max(0, E+w*0.6−E[jj]))` if `E[jj] < E+w` and `> SEA+0.3`.
  - `waterTotal = Σ w` (includes sea depths).
- Sub-stepping: `simulate` (12028–12029) splits each `SIM_DT=1/60` tick into `ceil(dt/0.034)` substeps; at `T.speed>6` (`lite&2`) water is batched when `waterPend ≥ 0.030`.

### 4.6 `iceStep(dt)` (1110–1132)
- Throttle 1.6 s; `cold=T.cold` (814–828: autumn's last day ramps in, winter 1, spring's first 0.8 day ramps out; `max(cold, W.snow*0.6)`).
- **Thaw**: ice tile with `cold < 0.45` and any 4-neighbour open (not ice, or off-map): 30 % chance → melt, `markWet`; creak SFX for the first two melts at 40 %.
- **Rain film in the cold**: `cold > 0.6`, not sea, `0.004 < WD ≤ wetLo(i)`, `FLOW < 0.5` → `WD −= 0.02` (zero below 0.005).
- **Freeze**: `cold > 0.6`, `WD > wetLo(i)`, not sea, `FLOW < 4.0`, not a spring tile, and a neighbour is ice / dry (`≤0.004`) / sea / off-map: 40 % chance → `ICE=1`, `FLOW=0`, edge fluxes zeroed.
- Events: first ice → `logEv('The river has frozen over — the gnomes can walk across', at)` (at = first ice tile in scan order); all gone → `'The ice has gone; the water runs again'`.

### 4.7 `slumpStep(dt)` (1313–1346)
- Throttle: accumulate; run when `slumpT ≥ 0.25` and queue non-empty; `step` = accumulated seconds.
- Skip border, `DAM`, `OCC`, `BRIDGE>0`, `E ≤ SEA+0.3`.
- `fresh = RELAX[j] > 0` (decrement by step). `at = fresh ? 0.75 : SOIL>0.02 ? 0.32 : 1.5`; `rate = fresh ? 0.48 : soil ? 0.30 : 0.12`.
- For each 4-neighbour `k`: `dh = E[j]−E[k]`; skip if `dh ≤ at` or k protected; `ex = fresh ? dh : dh − (E0[j]−E0[k])` (only steepness the water added); skip if `ex ≤ at`; `s = min(dh*0.45, (ex−at)*rate*step)`; non-fresh soil limited to `SOIL[j]`; `E[j] −= s`; `E[k] += s*(fresh?0.85:0.55)`; `SOIL[k] += s*0.55`; fresh → `E0` rewritten, neighbour `RELAX ≥ 30`.
- Re-queues neighbours (and self while still fresh).
- Whole-grid pass each run: `SAND −= 0.00025*step`; soil regrowth `+0.0012/s` (or `+0.0006/s` if `SOIL ≤ 0.02`) when `SOIL<0.6, WD<0.06, E>SEA+0.6, !DAM`, interior, local max slope `< 0.5`.

### 4.8 `updateMaterials(dt)` (1352–1358)
`setMaterials()` every 0.7 s; `iceStep(dt)` every call.

---

## 5. UI elements / controls / input
None in this range. Side-effects into UI: two `logEv` event-feed strings (1130–1131) and `sfxCreak` (1118). The isle name is toasted at 12125 (outside). The Creator's raise/lower tools (11128, 11131) call `relaxMark`; the spring tool (11072–11083) pushes into `world.springs` with the shape this section defines; undo (11112) calls `initWater(); setMaterials(); rebuildSurface()`.

## 6. MODE 'creator' vs 'gnome'
Nothing in the range reads `MODE` or `PLAYER` (declared 5630). The sim is mode-agnostic. Indirectly: `newIsland` (12107) forces `MODE='creator'` before calling `genIsland`; the relax/settle behaviour (`relaxMark`) exists only to serve Creator-mode terrain tools; the "gnomes can walk across" ice event is text aimed at either mode.

## 7. Progression / unlock / economy
None here. The section *provides* the quantities other systems gate on: `FLOW_RIVER` (mill placement 3434, sweep risk 1656), `FLOW_STREAM` (water sound/ripple, pathing cost 1435), `RIVER[]` (2980: "a river" vs "the stream you opened"), `world.springs` (player spring tool limits to 6 player springs, 11080), `world.camp` (founder spawn 12116 and village centroid fallback 2498).

## 8. Persistence
None. The file has no `localStorage`/`JSON.stringify` at all. The only persistence is the seed in the URL hash (`#s=<seed>`, written at 12115 right after `genIsland`; `&halt` starts paused). An isle is therefore reproducible from seed + deterministic sim RNG (`rngN` counter at 588 exists for replay harnesses), but eroded/settled terrain is not saved.

## 9. Mobile / touch / performance tricks
- **Active-set sim**: only tiles in `wetList` (+ `touched` receivers) are stepped; dedupe via `Uint8Array` flags (`inWet`, `inTouched`, `inSLQ`, `WETP`). Dry land costs nothing.
- **Preallocated typed arrays** for every field; no per-tile objects. (Per-step allocations remain: `wetList=[]` at 1149, the `move` closure at 1180, `SLQ.slice()` at 1316, `Float32Array.from(E)` per blur pass.)
- **Fixed-dt sub-stepping** ≤0.034 s for solver stability; batched at high speed (`lite&2`).
- **Throttles**: materials 0.7 s, ice 1.6 s, slump 0.25 s.
- **Two RNG streams**: cover props use `vrng` so visuals never perturb sim determinism.
- Flowers/cover are only drawn at high zoom (9710) — placement cost is paid once at gen.
- Grid is small (72×72) so whole-grid passes (`setMaterials`, slump regrowth) are cheap.

## 10. i18n (en/es)
Nothing localised here. The intro screen has an EN/ES toggle (`#lang` 309–312, handlers 12212–12214, `paintIntro`), but this section's user-visible strings are hard-coded English: isle names (890) and the two ice messages (1130–1131). Any port wanting Spanish in-game text needs a string table these call into.

## 11. Oddities, bugs, dead code, TODOs
1. **Dead branch** 1229: `WD[i]=Math.max(0,SEAS-E[i]); // a bar has risen out of the sea` — unreachable; the shoal deposition caps `E ≤ SEA−0.1`, so the inner `if(E[i]<=SEA)` always fires.
2. **Inconsistent guard** 985 vs 1237: `typeof MINEB!=='undefined'` in `genIsland`, bare `MINEB[i]` in `waterStep`. `MINEB` is a `const` at 2996 so the guard is dead defensive code (and `typeof` on a TDZ const would throw anyway, not return 'undefined').
3. **Probable typo** 952: Gaussian width `1.4*S*1.4` (=3.92) where `(1.4*S)*(1.4*S)` (=7.84) reads as intended; the valley is narrower than the `R=4*S` loop suggests. Tuned-by-eye, so may be "correct" now.
4. **State not reset on a new isle**: `froze` (1108) → if the old isle was frozen, the new isle logs "The ice has gone" on its first `iceStep`; `RELAX` (1311) → stale 60 s timers could make a freshly eroded tile on the new isle settle as "fresh" and overwrite `E0`; `U`, `SC`, `iceT`, `slumpT`, `matT`, `erosionTotal/lateralTotal/waterTotal` likewise persist (mostly harmless).
5. **`iceCount`** (1108, 1132) is write-only.
6. **Mass loss in slumping** 1333: non-fresh slump moves `s` off `j` but only `0.55*s` onto `k` (fresh: 0.85) — intentional "compaction", but terrain volume is not conserved.
7. `isSpringTile` (1133) checks `j±1` without a row-wrap test (a spring at x=0/N−1 would bleed a neighbour test across rows; springs never sit that close to the edge, margin 5*S).
8. `AX/AY` of a touched tile that stays below 0.004 depth are never zeroed (only cleared when the tile is processed as wet) → stale momentum direction on first wetting. Cosmetic.
9. The rain-film-soaks rule in `iceStep` (1123) changes `WD` without touching `wetList`; harmless because step 4 re-evaluates.
10. `waterTotal` includes sea depths (1226), so it is not "water on land".
11. Declaration order relies on hoisting of `const` through the TDZ (`SPRING_BASE` 1083 used in `genIsland` 940; `SLQ` 1300 used in `initWater` 1086; `SLUMP_AT…` 1347 used in `slumpStep`; `FLOW_STREAM/FLOW_ICE` 1348/1350 used in `iceStep`) — fine because everything is called after script evaluation, but fragile for refactors.
12. Comments carry version history inline (v9.15, v9.20, v9.22) — e.g. 1089 records previous tuning values; "v7" at 893 refers to a legacy coarse grid (`S=1`). No `TODO`/`FIXME` markers in range.
13. `seen` in the river walk (924) is a plain object keyed by index; a `Uint8Array` would be cheaper (gen-time only).
14. `flowers` are placed on the **sim** RNG (1004–1009) while `cover` is on the visual RNG (1013–1020): the comment at 1010–1012 explains the intent for cover; flowers consuming sim draws is a leftover inconsistency (still deterministic).

---

## 12. Reusable engine/shell vs gnome-specific content (for "Parque D'Amour")

### Reusable as-is or with renaming
- Typed-array tile grid, `I()/inB()/eAt()`, active-set + dedupe-flag queue pattern (`markWet/touch/slumpMark`), fixed-dt sub-stepping and the throttled updater pattern (`matT`, `iceT`, `slumpT`).
- Seeded dual RNG (sim vs visual) and `noise2/fbm2` height-field construction with shape templates (`shape → name` lookup is a clean slot for park layouts).
- The site-scoring loop (camp, 1022–1035): "flat, near water, at a comfortable height" is a generic placement heuristic (kiosk, bench, fountain).
- The decoration scatter pattern (flowers/cover) keyed by material and slope.
- The shallow-water solver + ice if the park has a pond/canal/fountain that should look alive; the erosion/sediment layer can be switched off by leaving `mayDig` false.
- `relaxMark/slumpStep` fresh-earthwork settling if Creator mode keeps raise/lower tools.
- The `window.__GV.info()` debug export style.

### Gnome/isle-specific content to replace
- Island silhouettes, names, the square edge falloff into **sea** (`SEA/SEAS/SEAC/markSea`), rivers with springs, spring rates (2.2/2.5; player 0.35–3.6), graded valley carving, bedrock-under-river soil model.
- The 7-material palette and its elevation/slope rules (meadow/grass/scree/rock/snow/sand/water; snow line at 8.1, sand below 2.95, grass above 6).
- Erosion/bank-wear constants and the whole sediment economy (`KC/KE/KD/KL/KI/ROCK_K`), soil regrowth rates, sand greening.
- Freeze/thaw text ("the gnomes can walk across"), season multipliers in `rainFactor`, thaw meltwater.
- Hooks to other gnome systems: `DAM`, `BRIDGE`, `OCC`, `MINEB` (mine drain), `WEAR/PAVE/STEPS/FISHN/CLIMBN/QUARRYN` resets, `RIVER` naming, `FLOW_RIVER` as "a mill wants this".
- Meadow flower colours and "pebbles on scree" cover kinds.

---

## 13. Design questions for the Parque D'Amour port raised by this section
1. Is the park **procedurally generated** from a seed (like the isle's 4 shapes), hand-authored, or a fixed layout with seeded variation (flowerbed colours, bench positions)? What replaces `shape → world.name`?
2. What bounds the map — the isle uses the sea; a park needs walls/streets/gates. Is the border a sink (water/people leave) or a wall?
3. Does the park have a **height field** at all (gentle slopes, a hill, a grotto) or is it flat with layers? If terrain exists, which Creator tools sculpt it and should the 60-s "settle into a basin" behaviour stay?
4. Which **water features** exist — pond, fountain, canal, stream, puddles after rain? Do they need live hydraulics (ripples, rain filling, drains) or a painted water mask? Is erosion ever wanted (probably not)?
5. Do **seasons and weather** drive the park (rain → umbrellas/sheltering as romance beats; winter → frozen pond skating; spring → blossom)? `rainFactor`/`iceStep` only matter if yes.
6. What is the **material palette** — lawn, gravel allée, flowerbed, parterre hedge, pavement, water, sand? Are materials derived by rule (as here) or painted by the designer/Creator?
7. Where do the lovers / the avatar **start** (the `camp` heuristic)? Is the spawn chosen by score (near the bandstand, flat, near water) or fixed?
8. Which per-tile **occupancy/protection flags** survive (benches, kiosks, paths vs `DAM/BRIDGE/OCC`)? Do paths wear (`WEAR/PAVE`) in a park?
9. Do rain/puddles affect **pathing and mood** (the isle uses `FLOW_STREAM/FLOW_RIVER` for swim cost, sweeping, mill placement)? What are the park's equivalent thresholds?
10. Does the Creator place **fountains/springs** with a rate dial like the spring tool (seep/stream/river/torrent, max 6)?
11. **Determinism**: keep the sim/visual RNG split and `rngN` replay counter for a test harness? Should the seed go in the URL hash as now?
12. **i18n**: generated names and event strings are English literals here; the port wants a string table from day one if ES is in scope.
13. Decoration density/zoom gating: flowers at Z>0.8 and cover at Z≥1.0 — what are the park's LOD tiers (parterres, gravel texture, fallen leaves)?
14. Should any **terrain state persist** (the isle saves nothing but the seed)? Sabotage/assist actions that reshape the park would need saving if sessions are resumable.
