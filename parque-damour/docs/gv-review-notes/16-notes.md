# Gnome Village review — section 16: lines 8848–9264
## "The island back to front (render order), the water's body"

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Every line 8848–9264 was read. Line numbers below are from that file. Where I peeked outside the range to resolve a symbol I say so.

---

## 1. Purpose of the section

Three distinct render-engine sub-systems live here, all of them support code for the per-frame painter `drawIsland` (starts ~9580, outside this range) and none of them is game logic:

| Lines | Sub-system | One-liner |
|---|---|---|
| 8848–8907 | **Render-order buckets** | `bucket`/`pieceBucket` maps, `drawTiles(b)` (which tiles a building's picture covers), `FRONT_MOV` + `frontFix()` (post-bucketing fix so that things standing in front of a big building are painted after it). |
| 8908–8989 | **Per-epoch lighting fields** | Vertex slope gradients `VGX/VGY` (`blurG`, `vertGrads`), the "lie of the land" ambient term `AO` (`valleyShade`), and the declarations of the water colour cache `WRAW`, `SHEEN`, `WEX`. |
| 8990–9264 | **The water's body** | A "ribbon round a skeleton" distance field on a half-tile grid (`buildWV`), marching squares on quarter-cells (`fsPoly`, `fsOtherEnd`, `fsAll`, `fsAny`, `waterPath`), the generic marching-squares record used by the sea and land sheets (`mkMS`, `msPoly`, `msOtherEnd`, `msPath`), and the shared bank stroker `strokeBanks`. |

The section contains no UI, no input handling, no MODE branches, no economy, no persistence, no i18n strings. It is pure rendering engine.

---

## 2. Globals / state defined or mutated here

| Name | Line | Type / shape | Notes |
|---|---|---|---|
| `bucket` | 8849 | `Map<cellKey:int, Array<[kind:int, obj]>>` | The painter's per-cell draw list. Cleared and refilled every frame in `drawIsland` (9594 `bucket.clear()`); mutated in place by `frontFix` (8889, 8906). A cell key is a tile index (fine) or a coarse `NL`-grid index (far zoom), via `cellOfTile` (9592). |
| `pieceBucket` | 8849 | `Map<cellKey, Array<piece>>` | Path pieces and the flyer's cloth, per cell. Filled 9725–9727 (only when `Z>0.35`), read 9964. Only declared here. |
| `FRONT_MOV` | 8870 | `{kind:1}` lookup | Which bucket kinds may be moved to after a building. Kinds (from `drawIsland` 9686–9711): 0 tree, 1 bush, 2 rock, 4 gnome, 5 part, 6 stump, 8 mark, 9 flower, 10 rabbit, 11 other critter (deer), 12 perched bird, 13 player spring, 15 ground cover, 16 snowman, 17 fox, 19 boat, 20 flyer. **Not** listed: 3 building (handled specially), 7 path/bridge tile, 14 bridge end, 18 fence piece / hutch. |
| `VGX`, `VGY`, `VGT` | 8915 | `Float32Array(NV*NV)` | Slope of the drawn surface at each vertex (x and y), `VGT` is blur scratch. Written by `vertGrads`; read by the tile light at 9412/9434 and `probeTile` 12240. |
| `AO`, `AOT`, `HM` | 8942 | `Float32Array(NC)` | `HM` = per-tile mean of its 4 drawn vertex heights; `AOT` = row-pass scratch; `AO` = signed shade term. Written by `valleyShade`; read in the tile colour at 6700/6704. |
| `WRAW` | 8963 | `Float32Array(NC*4)` RGBA per tile | A tile's own water colour before neighbour blending. Written by `waterRaw` (9339–9383), read by `blendWater` (9395–9401). Only declared here. |
| `WRAW_EP` | 8963 | `Int32Array(NC)` | Epoch stamp per tile for `WRAW`. |
| `SHEEN` | 8964 | `let [r,g,b] = [230,238,246]` | Sky-sheen colour mixed into water. Reassigned each colour epoch at 9587: `mixc(rampSky()[1],[255,255,255],0.4)`. Read 9366. |
| `WEX` | 8971 | `const 0.7` (px) | How far a translucent water-sheet quad is pushed out past its corners. Read 9902 (an opaque tile uses 0.5 instead) and 9919. |
| `FN`, `FNN` | 9017 | `2*N+1`, `FN*FN` | Half-tile ("fine") grid size. With `N=72` (`N=36*S`, `S=2`, line 567–568) that is 145×145 = 21,025 points. |
| `FW` | 9018 | `Float32Array(FNN)` | The water body field (result): 1 deep inside, 0 outside. |
| `FWN` | 9018 | `Float32Array(FNN)` | The narrow ribbon field (unblurred, laid back over the blurred field with max). |
| `FWB` | 9018 | `Float32Array(FNN)` | Row-blur scratch. |
| `FDH` | 9018 | `Float32Array(FNN)` | How far the ground stands above the water surface at each fine point (−9 = deep inside, +9 = no water near). |
| `FNEAR` | 9018 | `Uint8Array(FNN)` | 1 where a fine point is within reach of any water tile; everything else skipped. |
| `WL0`, `WL1` | 9019 | `0.03`, `0.13` levels | Waterline: water drawn over ground up to `WL0` above its surface, none from `WL1` up (linear fade between). |
| `FMARK` | 9020 | `0.45` | The iso-mark: inside is `FW >= FMARK`. |
| `SKW`, `SKN`, `SK_S` | 9021 | `Uint8Array(NC)`, `Uint8Array(NC)`, `Float32Array(NC)` | Skeleton: tile is water (0/1), 8-bit mask of water neighbours joined, water surface height per tile. |
| `D8X`, `D8Y` | 9022 | `[1,1,0,-1,-1,-1,0,1]`, `[0,1,1,1,0,-1,-1,-1]` | 8-neighbour offsets (also used by the fillet at 9849). |
| `WR`, `WRN`, `WW`, `WH`, `WH0` | 9023 | `0.72`, `0.60`, `0.40`, `0.60`, `0.35` | Body reach (tiles), narrow ribbon reach, soft-edge width, levels of bank per tile of reach lost, bank height before it counts. |
| `BLK` | 9031 | 11-tap array, normalised in place in a block scope | Gaussian with sigma = 2 fine points = 1 tile: raw weights `[0.0439,0.1353,0.3247,0.6065,0.8825,1,…mirrored]` then divided by their sum. |
| `WV` | 9032 | `Float32Array(NV*NV)` | The body field sampled only at tile corners; "for the harnesses" (debug export) — not used by rendering. |
| `wvEp` | 9033 | `let -1` | Epoch stamp guarding `buildWV`. |
| `WS_WALL` | 9108 | `0.9` levels | A dry tile takes a water fillet only if it is at most this far above its wettest neighbour's surface (used 9850). |
| `WS_T`, `WS_CU`, `WS_CV` | 9109 | `FMARK`, `[0,1,1,0]`, `[0,0,1,1]` | Threshold alias; corner (u,v) coordinates for marching squares, corner k=0..3 = (0,0),(1,0),(1,1),(0,1). |
| `FS_N`, `FS_P`, `FS_EP` | 9111 | `Int8Array(NC*4)`, `Float32Array(NC*4*24)`, `Int32Array(NC*4)` | Cached quarter-cell polygons: up to 8 points × (u,v,edge) per sub-cell, with epoch stamps. |
| `WS_NDX`, `WS_NDY` | 9208 | `[0,1,0,-1]`, `[-1,0,1,0]` | Edge k → neighbour tile/sub-cell offset (edge 0 = top, 1 = right, 2 = bottom, 3 = left). |
| `BANKS` | 9213 | `Array<number[]>` | Segments of the last-built path's contour: 8 numbers (cubic) from `waterPath`, 6 numbers (quadratic) from `msPath`. Consumed by `strokeBanks`. Reset at every path build. |
| `WS_DBG` | 9213 | `{pieces,noPrev,noNext,lone,nocorner}` | Debug counters, incremented in `msPath`. Exported via `window.__GV` (12229). `nocorner` is never incremented. |
| `MS_W` | 9258 | marching-squares record over `WV` | "For the harnesses only." |

Peeked (outside range) for the above: `N/NC/NV` 568, `S` 567, `clamp/clamp01` 578–579, `E` 612, `V` 699, `I/inB` 672–673, `VI` 702, `SEAC` 636, `SEAS = SEA+0.5` 571, `wetDV` 682, `wetShow` 683, `wetLo` 692, `DEPTH` 6359/6377 (`DEPTH[i] = rotated x + rotated y`, i.e. how close to the camera), `HOUSE` 7036, `houseFrame` 7048, `DBG` 12041, `window.__GV` 12222.

---

## 3. Functions (every one in range)

### 3.1 `drawTiles(b)` — line 8852
Signature: `drawTiles(b) -> int[]` (tile indices).
Returns the set of tiles a building's **drawing** covers, so it can be bucketed after all of their ground. Starts from `b.fp` (footprint), then adds:
- the yard tile `(b.yx, b.yy)` while the building is unfinished and planned (8855); yard is set at 4120.
- For houses (`HOUSE[b.type]`, 8856–8864), using the house frame `F.R(u,v)` to rotate local (u,v) into world:
  - `porch`: the row `v = V+0.5` for `u ∈ [-U+0.5, U)` step 1, plus `(0, V+1.5)` (the step) — 8858.
  - `stack`: the column `u = U+0.5` for `v ∈ [-V+0.5, V)` — 8859.
  - `bench || hurdles || stack`: the row `v = V+0.5` — 8860 (duplicates the porch row; deduped by `add`).
  - `chim` and wall[1] not stone: `(U+0.5, 0.01)` — 8861.
  - `slip`: two rows `v = V+0.5` and `V+1.5` — 8862.
  - `b.jetty`: `(sx,sy)` plus `len` tiles from `(x,y)` stepping `(ux,uy)` — 8863. Jetty shape set at 3050: `{x,y,ux,uy,len:2,sx,sy,deck}`.
`add` rounds, bounds-checks with `inB`, dedupes (8853).
Callers: `drawIsland` 9692 (`putFront(drawTiles(b),3,b,big?b.fp:null)`), and it is exported in `window.__GV` (12223).

### 3.2 `frontFix(bigs, bucket, cellOfTile, OIDX, FDX, FDY)` — line 8871
Called once per frame at 9716 when `bigs.length && DBG.frontFix!==false`. `bigs` entries are `{key, own, extra, b}` built by `putFront` (9657): `key` = the front-most cell the building was bucketed in, `own` = its footprint tiles, `extra` = `drawTiles(b)`, `b` = the building. `OIDX` = order index of a cell (back-to-front rank). **`FDX`/`FDY` here are integer camera-facing offsets (−1/0/1, from 9620) and shadow the global `Float32Array` flow-direction arrays of the same name (617)** — confusing, but intentional.

Algorithm:
1. 8872–8874: `NB` = the three neighbours toward the camera; `bigSet` = set of big buildings; `fpCell` = cells of every big's footprint tiles.
2. 8875 `movable(it)`: kind in `FRONT_MOV`, or kind 3 (a building) that is small: not a big, no `.tiles` (bridges/paths), not a fence, not a footprint of area ≥ 2, not a house, not a tent.
3. 8876–8883 per big `g`: `dmax` = max `DEPTH` over own tiles; `cells` = camera-side neighbours of each own tile, plus each `extra` tile that is not own and is strictly nearer the camera than `dmax` together with its neighbours. For each cell: skip if it is another big's footprint cell (unless it is `g.key`); claim it for `g.key`, the front-most building winning (`OIDX` larger).
4. 8884–8893: for each claimed cell `c` with owner `key`: skip if `c===key` or `OIDX[c] >= OIDX[key]` (that cell already paints after the building). Split `bucket[c]` into movable and kept; write back kept; queue the movables for `key` tagged with `OIDX[c]`.
5. 8894–8906 per building key cell: find the **last** `[3, big]` entry; items before it that are movable are "lifted" (e.g. a tree on the building's own cell); the result is `pre` (non-movable before + the building), then the moved (sorted by original cell order, back to front), then the lifted, then `post`.
Edge: if a key cell somehow has no `[3,big]` entry (`last<0`, 8898) the moved items were already removed from their cells and are silently dropped for that frame. Cannot normally happen because `putFront` always pushes the building into `bucket[key]`.

### 3.3 `blurG(A)` — line 8917
Separable 3×3 box blur over the `NV×NV` vertex grid using `VGT` as scratch; at edges the missing neighbour is replaced by the centre value. Called only by `vertGrads` (4 times).

### 3.4 `vertGrads()` — line 8923
Central differences of `V` (drawn vertex heights) → `VGX`, `VGY`, divided by the number of available neighbours (1 at borders). Then `blurG` twice on each axis (8935), so the slope the light uses is smoothed over a 5-vertex tent. Rationale in comments 8908–8914 and 8929–8934: without it hillsides read as a chequerboard of diamonds. Called at 9587 on every colour epoch (every 220 ms, or 110 ms while the camera turns). Read by the tile lighting at 9412/9434 and the harness `probeTile` 12240.

### 3.5 `valleyShade()` — line 8943
"Lie of the land" ambient term. `HM[i]` = mean of the tile's four drawn vertices (8947); a 9×9 box mean (`R=4`, `W=9`) by two running-sum passes with clamped indices (8948–8953); then per tile `d = mean − HM`:
- hollow (`d>0`): `AO = clamp01((d−0.2)/1.8) * 0.14` → up to 14 % darker, starting 0.2 levels below the surroundings, saturating at 2.0;
- crest (`d<0`): `AO = −clamp01((−d−0.25)/1.6) * 0.05` → up to 5 % brighter.
Called at 9587 each colour epoch. Consumed at 6704 (`g *= 1−ao`, only when `hm > SEA+0.3`); `HM` is also read at 6700 for a "sink" measure.

### 3.6 `buildWV(EP)` — line 9034
Builds the water body field once per colour epoch (`wvEp` guard, 9035). Callers: `drawIsland` 9589 (every frame, usually a no-op), 9846 and 9868 (lazy), and the harness export 12229 with a `force` option that resets `wvEp`.
1. **Skeleton** (9040–9047): `isW(j) = SEAC[j] || wetShow(j)`. For each tile: `SKW=1` if water; `SK_S` = `SEAS` for sea tiles else `E[i]+wetDV(i)`; `SKN` = 8-bit mask of water neighbours, with **off-map counted as water** ("the water runs on").
2. **Near mask** (9049–9052): a water tile at `(x,y)` marks fine points `2x−1 .. 2x+3`, `2y−1 .. 2y+3`.
3. **Field** (9054–9085) for each near point `(fx,fy)`: parity `ex,ey` says corner/edge-midpoint/centre; if all tiles touching the point are water → `FW=FWN=1`, `FDH=−9`, done. Else search the 3×3 tiles around for the nearest skeleton element (tile centre, or a segment from a centre toward a joined neighbour, clamped `0<t≤1`), taking the **lower** of the two surfaces on a segment (9076). Early exit `best<0.01`. If nothing found: `FDH=9`. The ground height `g` at the point is the vertex, edge mean or 4-vertex mean (9081). Bank penalty: `dh = g − surface − WH0`; if `dh>0`, `d² += (dh/WH)²` (9082). Then `FW = clamp01((WR−de)/WW)`, `FWN = clamp01((WRN−de)/WW)` (9084). `FDH` = ground minus the highest water surface among the tiles the point touches (cascade rule), else the nearest piece's (9088–9090).
4. **Blur + waterline** (9093–9103): 11-tap Gaussian along rows into `FWB`, then columns; `f = max(blurred, FWN)`; if `FDH>WL0` then `f *= (FDH>=WL1 ? 0 : (WL1−FDH)/(WL1−WL0))`; points outside `FNEAR` are zeroed. Finally `WV` is sampled from the even fine points (9104).

### 3.7 `fsPoly(sc, EP)` — line 9112
Marching squares on quarter-cell `sc = tile*4 + (sy*2+sx)`. Reads the four fine-grid corners, emits inside corners (edge = −1) and edge crossings (edge = k, linear interpolation to `FMARK`) into `FS_P[sc*24 ..]`, caches count in `FS_N`, stamped by `FS_EP`. Returns the point count (0–8).

### 3.8 `fsOtherEnd(sc, edge, EP)` — line 9123
For the contour piece in sub-cell `sc` that has a crossing on `edge`, returns the other crossing's `(u,v)` (the adjacent list entry that is also a crossing), else `null`.

### 3.9 `fsAll(i)` — line 9132 and `fsAny(i)` — line 9135
Whether all nine / any of the nine fine points of tile `i` are `>= FMARK`. `fsAll` lets the painter fill the plain quad (9904); `fsAny` lets a dry tile take a fillet (9847). `fsAny` is also exported for the harness.

### 3.10 `waterPath(i, x, y, ax,ay, bx,by, cx,cy, dx,dy, EP, tgt)` — line 9143
Builds tile `i`'s share of the water body as a path into `tgt` (a `Path2D`) or, if `tgt` is absent, onto `ctx` after `beginPath()`. `P(u,v)` maps tile (u,v) onto the bilinear patch of the four screen corners a,b,c,d (9144). For each of the 4 sub-cells with ≥3 points, starting at an inside corner (so no piece wraps the list end): corners go `moveTo/lineTo`; for each pair of crossings the piece is one **Catmull-Rom-derived cubic Bezier** whose tangents come from the neighbouring sub-cells' other ends (`fsOtherEnd` on the opposite edge `(e+2)&3`, 9162–9163) or, when there is none, from reflecting the chord (9170). Tangent scale is chord-length weighted: `k1 = d12/(d01+d12)/3`, `k2 = d12/(d12+d23)/3` (9173). Each segment is pushed into `BANKS` as 8 numbers (9177). Returns the piece count (0 = the whole tile is water with no edge), or −1 if nothing to draw. Callers: 9860 (fillet on a dry tile) and 9905 (a wet tile that is not wholly inside).

### 3.11 `mkMS(F, T)` — line 9178
Factory for a marching-squares record over a corner field `F` (`NV×NV`) with mark `T`: `{F, T, N:Int8Array(NC), P:Float32Array(NC*24), EP:Int32Array(NC)}`. Instances: `MS_W` (9258, harness), `MS_SEA`, `MS_DEEP`, `MS_LAND` (9307, outside range — the sea sheet, the deep sea and the ground outside the sheet).

### 3.12 `msPoly(M, i, EP)` — line 9179
Tile-level marching squares over `M.F` at the tile's four corners `VI(x,y)…`; same emission scheme as `fsPoly`, cached per epoch in the record.

### 3.13 `msOtherEnd(M, j, edge, EP)` — line 9191
Tile-level twin of `fsOtherEnd`.

### 3.14 `msPath(M, i, x, y, ax..dy, EP, tgt)` — line 9214
Tile-level path builder for a corner-field record. Differences from `waterPath`: the bank is a **quadratic spline through the midpoints of pieces**, bending round each crossing; where a neighbour exists the bend is split at the exact parameter where it crosses the tile edge (`edgeT`, 9243) so each tile draws its own half and they meet on the edge. Two 6-number segments per piece go into `BANKS` (9252). Increments `WS_DBG.pieces/noPrev/noNext/lone`. Returns the piece count or −1. Callers (outside range): sea sheet 9320/9325 (`MS_SEA`, `MS_DEEP`), land outside the sea 9788/9791/9827/9830 (`MS_LAND`).

### 3.15 `wsPoly(i, EP)` — line 9259
`msPoly(MS_W, i, EP)`; harness only (exported 12229).

### 3.16 `strokeBanks(style, w, list, cap)` — line 9260
Strokes `list || BANKS` with the given style/width, `lineCap = cap || 'round'`, round joins; chooses `bezierCurveTo` for 8-number segments and `quadraticCurveTo` for 6-number ones. Callers: sea rim 9328 (`SEA_RIM`, `max(0.8, 1.1*Z)`), the water feather 9863 and 9918 (`3.2*Z`, `'butt'`, only when `pc>0 && Z>0.45 && DBG.feather`).

---

## 4. Concrete rules and tuning numbers

**Render order**
- Camera-side neighbours considered: `(FDX,0)`, `(0,FDY)`, `(FDX,FDY)` (8872).
- A building is "big" (gets a `bigs` entry) when `fw*fh >= 2`, or it is a house, or a tent (9692).
- Movable past a building: kinds in `FRONT_MOV` (8870) + small buildings (8875 rule).
- Moved items keep their relative back-to-front order via `OIDX` of their original cell (8903).

**Lighting fields**
- Colour epoch cadence (9587, outside range): every 220 ms, 110 ms while turning, or on a season change.
- Slope blur: 2 passes of 3×3 box per axis (8935).
- Valley shade window 9×9 tiles (`R=4`), hollow: dead zone 0.2 levels, saturates at 2.0, max −14 %; crest: dead zone 0.25, saturates at 1.85, max +5 % (8956). Applied only when `hm > SEA+0.3` (6704).

**Water body**
- Fine grid `FN = 2N+1` → 145×145 at N=72.
- Reach `WR=0.72` tiles, narrow ribbon `WRN=0.60`, soft edge `WW=0.40` (9023).
- Bank penalty starts at `WH0=0.35` levels above the surface; every `WH=0.60` levels beyond costs one tile of reach, added in quadrature (9082).
- Gaussian blur sigma = 1 tile (2 fine points), 11 taps (9031).
- Mark `FMARK=0.45` (9020).
- Waterline fade `WL0=0.03 → WL1=0.13` levels (9019, 9102).
- Off-map neighbours count as water so the ribbon never ends at the map edge (9045).
- Skeleton search 3×3 tiles; near-mask 5×5 fine points per water tile (9050–9051).
- A dry tile takes a fillet only when `E[i] <= E[jb]+wetDV(jb)+WS_WALL(0.9)` (9850, outside range).
- Catmull-Rom tangent scale 1/3 with chord-length ratios; degenerate chord floor `1e-4` (9171–9173).
- Feather stroke `3.2*Z` px wide, butt caps, when `Z>0.45` (9863/9918).
- Sheet quad overlap `WEX=0.7` px translucent, 0.5 px when alpha ≥ 0.995 (8971, 9902).

---

## 5. UI elements, controls, input handling
None in this range. The only "controls" are debug flags read elsewhere: `DBG.frontFix` (9716), `DBG.water`, `DBG.feather` (12041) and the harness export `window.__GV` (12222–12240) that exposes `WS_DBG`, `wsPoly`, `WV`, `FW`, `FN`, `FMARK`, `SKW`, `SKN`, `fsAny`, `buildWV(force)`, `drawTiles`.

## 6. MODE 'creator' vs 'gnome'
Nothing in this range branches on mode. The code is mode-agnostic rendering.

## 7. Progression / unlock / economy
None. (`drawTiles` does look at `b.done`/`b.plan` to include the construction yard tile — a construction-state dependency, not an economy rule.)

## 8. Persistence
None. All arrays here are rebuilt from `E`, `V`, `WD`, `SEAC`, `builds` etc. every epoch/frame; nothing is saved.

## 9. Mobile / touch / performance tricks
- Everything is pre-allocated typed arrays sized at load (`NV*NV`, `NC`, `NC*4*24`, `FNN`); no per-frame allocation except the small `Map`/`Set`s in `frontFix` and the `BANKS` segments.
- Epoch caching everywhere: `wvEp`, `FS_EP`, `M.EP`, `WRAW_EP` — the expensive field and polygons are computed at most once per colour epoch (≈4.5 Hz), not per frame.
- `FNEAR` prunes the field computation to points within a tile of water; "deep inside" shortcut (9060) and `break search` on the skeleton (9067).
- Separable blurs (`blurG`, `BLK` rows then columns) and running-sum box filter (`valleyShade`) — O(n) per pass.
- `frontFix` can be switched off with `DBG.frontFix=false`; it is only run when there is at least one big building.
- Draw detail gated on zoom outside this range (feather `Z>0.45`, pieces `Z>0.35`), which these functions respect by being called less often.
- `waterPath` draws into a `Path2D` when asked, so the caller can stroke something else first.

## 10. i18n (en/es)
Nothing. No strings in range. Comments are English prose, written as a design diary ("Six passes tried…", "Jed's 'clipping over objects…'").

## 11. Oddities, bugs, dead code, TODOs
1. **Name shadowing** 8871: `frontFix(..., FDX, FDY)` shadows the global `FDX`/`FDY` flow-direction `Float32Array`s (617). Inside, they are camera-facing integers. Works, but a reader of the globals will be misled.
2. **Dead counter**: `WS_DBG.nocorner` (9213) is never incremented anywhere.
3. **Harness-only live code**: `WV` (9032, filled at 9104 every epoch), `MS_W` (9258) and `wsPoly` (9259) exist only for `window.__GV`. The `WV` sampling loop runs every epoch for nothing in production.
4. **Superseded comment block** 8990–9002 describes the v9.9 corner-field water (marching squares on tile corners); the v9.13 block right below (9003–9016) explains why it was abandoned. The v9.9 machinery (`mkMS/msPoly/msPath`) survives legitimately for the sea/land sheets but the comment ordering reads as two competing descriptions of "the water's body".
5. **Forward reference**: `WS_NDX`/`WS_NDY` are declared at 9208 but used inside `waterPath` (9143, lines 9162–9163). Safe because `waterPath` is only called from the frame loop after the script has fully evaluated; it would throw a TDZ `ReferenceError` if anything called it during script evaluation.
6. **Part-file reference** 8972: "(v9.14: WET_AT, WET_FLOW, wetLo and wetDrawn live in p2 now…)" — the single file was evidently assembled from numbered parts; the note is stale documentation for the reader of the merged file.
7. `drawTiles` 8860: the `bench||hurdles||stack` row is identical to the porch row (`v=V+0.5`) — harmless duplication caught by the dedupe in `add`.
8. `drawTiles` 8861: the chimney tile is added only when `sp.walls[1].m!=='stone'` — a material-dependent footprint rule with no comment; presumably a stone chimney is drawn inside the body.
9. `frontFix` 8898: if a key cell lacks its `[3,big]` entry the already-extracted movables are dropped for the frame (not re-inserted). Theoretically unreachable; no guard.
10. `fsAll`/`fsAny` (9132/9135) duplicate the same 9-point read; could share a helper. Three naming families coexist for one idea: `FS_*` (fine sub-cell), `WS_*` (legacy "water square"), `MS_*` (marching squares).
11. `strokeBanks` defaults `lineCap` to `'round'` but every production caller passes `'butt'`; the default only matters for the sea rim (9328) which passes no cap.
12. Comment 9036–9039 and code 9045: off-map is treated as water so a river "runs on" at the edge — by design, but it means an inland lake touching the map border is drawn as if open.
13. No TODOs in range.

---

## 12. Reusable engine vs gnome-specific content

**Reusable as-is (engine/shell):**
- The **bucket painter's-algorithm shell** (`bucket`, `pieceBucket`, cell keys, `[kind,obj]` entries) and the `frontFix` pattern of "claim the cells in front of a big object and repaint their movables after it". Only the kind table changes.
- `blurG`, `vertGrads`, `valleyShade`: generic heightfield lighting helpers for any smooth-shaded isometric terrain.
- The **marching-squares record** (`mkMS`, `msPoly`, `msOtherEnd`, `msPath`) + `strokeBanks`: a generic "smooth filled region from a scalar corner field" that already draws three different things (sea, deep sea, land). In a park it could draw lawns, gravel paths, flower beds, a pond, a fountain basin, a hedge maze outline.
- The **ribbon-round-a-skeleton field** (`buildWV` + `fsPoly`/`waterPath`): a generic way to turn a set of tiles (plus 8-connectivity) into a smooth ribbon/blob of set width with rounded corners and straight diagonals. Ideal for garden paths, streams, flower borders, a boating lake.
- Epoch caching, pre-allocated typed arrays, zoom gating — architectural patterns worth keeping.

**Gnome-specific (content):**
- `drawTiles` house extras (porch, stack, bench, hurdles, chimney, slip, jetty) and the `HOUSE` spec it reads.
- `FRONT_MOV` kind codes (trees, bushes, rocks, gnomes, rabbits, foxes, deer, boats, flyer, snowmen) and `movable()`'s exclusions (fence, tent, house, bridge/path tiles).
- `buildWV`'s coupling to the erosion/water sim: `SEAC`, `SEAS`, `wetShow`, `wetDV`, `E`, and the cascade/surface rules — a static park pond would not need the per-epoch rebuild or the bank-height penalty.
- `SHEEN` tied to the sky ramp; `WEX`'s pixel fattening is tied to this file's tile quad drawing.

---

## 13. Design questions for the Parque D'Amour port raised by this section
1. Does the park have a heightfield (slopes, a hill, a sunken garden) or is it flat? If flat, `vertGrads`/`valleyShade` and the bank-height term in `buildWV` can be dropped or stubbed.
2. What water exists (pond, fountain basin, canal, stream)? Is it static (authored tiles, build the field once) or simulated (rebuild each epoch like here)?
3. Is there a sea / off-map water at all? If the park is enclosed, the `SEAC`/`SEAS` branches and the "off-map counts as water" rule disappear, and `MS_SEA/MS_DEEP` are unneeded.
4. What are the entity kinds (lovers, visitors, benches, lamps, trees, kiosks, statues, carts, dogs, pigeons) and which may be repainted in front of a big building? That is the new `FRONT_MOV` table and `movable()` rule.
5. Which structures are "big" (bandstand, café, carousel, gazebo) and what do they draw beyond their footprint (terraces, awnings, tables, steps)? That is the new `drawTiles` per structure type.
6. Does the camera rotate (as here, 4 orientations via `FDX/FDY`) or is it fixed? A fixed camera simplifies `frontFix`, `frontKey` and `putWalker`.
7. Should the marching-squares ribbon be reused for gravel paths, lawn edges and flower beds (same code, different corner fields / skeletons)? If so, which features need soft "feathered" edges and which crisp ones?
8. What zoom range will the park use? The thresholds `Z>0.35` (pieces), `Z>0.45` (feather), `Z>0.8/1.0` (flowers/cover) need re-tuning.
9. Is a 220/110 ms colour-epoch cadence acceptable on the target mobile devices, or should the park (likely fewer colour changes: no erosion, no seasons?) refresh less often?
10. Creator mode: should the author be able to toggle/inspect these debug flags (`DBG.frontFix`, `DBG.water`, `DBG.feather`, `WS_DBG`) and the harness export from an in-game panel, or stay console-only as here?
11. Will structures have rotations like `houseFrame` (4 orientations) — needed before `drawTiles`-style extras can be expressed in local (u,v)?
12. Do romance "props" (a picnic blanket, a bench for two, a rowing boat on the pond) need the boat-style multi-tile bucketing (9699) or the `putWalker` treatment, i.e. which objects can be stood on vs walked in front of?
