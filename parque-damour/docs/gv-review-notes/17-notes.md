# Gnome Village review — section 17: lines 9265-10056
## "The sea sheet, the tile colour/gradient caches, drawIsland (the painter), running-water detail"

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Range read in full: 9265-10056 (the weather overlay begins at 10057).

---

## 1. Purpose of the section

This is the heart of the **terrain renderer**. It contains:

1. **The sea sheet** (9265-9337): a flat, opaque water surface at height `SEAS` drawn in two tones (pale shore band + sea-plane colour), bounded by marching-squares contours so it meets the sand exactly.
2. **Per-tile water colour** (9338-9403): `waterRaw`/`blendWater` compute an RGBA for every wet tile (depth, flow, ice, sediment, cold rim, sheen, estuary fade) and feather it with neighbours.
3. **Per-tile ground colour** (9404-9448): `litRaw`/`blendCol` (fine lattice) and `litRaw2`/`blendCol2` (coarse 2x2 lattice for the zoomed-out LOD), lit by a sun vector from the vertex gradient.
4. **Colour caches + gradient shading** (9449-9525): per-epoch caches keyed on `colEpoch`, corner colours (`vertCol`, `vertCol2`, `wvertCol`), and `fitTileGrad`, which fits a linear gradient plane to a tile's four corner colours so slopes don't read as a chequer of flat diamonds.
5. **Small draw helpers** (9526-9577): `playerRing`, `critRing`, `drawProp` (the kind-code dispatcher for everything that stands on the ground), `drawSnowman`.
6. **`drawIsland()`** (9578-9977): the painter's-algorithm frame: rebuild surface, project vertices, sort tiles back-to-front, bucket every prop/walker/building into the cell it should be painted after (with elaborate overhang/foot/wall rules), then walk the cells painting ground, sea, inland water, path pieces and props.
7. **`drawWaterDetail`** (9978-10056): the close-up decoration on inland water: tumble lips with foam, current streaks on streams/rivers, slow ripples on still water.

There is **no input handling, no UI element, no persistence, no i18n** in this range. It is pure canvas rendering plus derived-field computation. The one gameplay-mode touch is the player ring in `drawProp` (line 9550).

---

## 2. Globals / state defined or mutated here

| Name | Line | Type / shape | Meaning |
|---|---|---|---|
| `SEAV` | 9278 | `Uint8Array(NV*NV)` | per-vertex: 0 = not sheet; 1 = corner of a sea tile or map edge; 2..4 = BFS step out over the beach |
| `SF` | 9278 | `Float32Array(NV*NV)` | signed field for the sheet: `SEAS-V[v]` where the sheet is (positive = under the surface), `-0.4` elsewhere below SEAS |
| `NSF` | 9278 | `Float32Array(NV*NV)` | `-SF` — the land outside the sheet (used by `MS_LAND`) |
| `SF2` | 9278 | `Float32Array(NV*NV)` | field for the **deep** tone: mean DT of the 4 tiles around the vertex minus `SEA_BAND`; `-1` outside the sheet |
| `DT` | 9278 | `Float32Array(NC)` | per-tile chamfer distance (in tiles, 1 / 1.4 diag) from "shore" (ground at/above SEAS-0.05, or drawn non-sea water) |
| `SQ` | 9278 | `Int32Array(NV*NV)` | BFS queue scratch for `buildSea` |
| `SEA_BAND` | 9279 | const `1.5` | width (tiles) of the pale shore band |
| `SEA_TOUCH` | 9279 | `Uint8Array(NC)` | 1 if any corner of the tile has `SF>0` (the sheet reaches the tile) |
| `SEA_FILM` | 9280 | const `0.06` | a touched tile whose `E+WD <= SEAS+0.06` is drawn as sheet rather than inland water |
| `isSheet` | 9280 | arrow `(i)=>bool` | `SEAC[i]===1 || (SEA_TOUCH[i]===1 && E[i]+WD[i]<=SEAS+SEA_FILM)`; also used at line 720 (rebuildSurface) and 9522, 9751, 9754 |
| `seaEp` | 9281 | `let number` | epoch memo for `buildSea` |
| `MS_SEA`, `MS_DEEP`, `MS_LAND` | 9307 | marching-squares contexts (`mkMS(F,T)` at 9186: `{F,T,N:Int8Array(NC),P:Float32Array(NC*24),EP:Int32Array(NC)}`) | contour of SF, SF2, NSF at threshold 0 |
| `seaColEp` | 9308 | `let number` | epoch memo for sea colour strings |
| `SEA_SHALLOW`, `SEA_RIM` | 9308 | `let string` (css colour) | band fill colour and rim stroke colour, rebuilt per epoch at 9319 |
| `SEA_EX` | 9308 | const `0.7` | px by which a sheet tile's corners are pushed outward (overlap to hide hairlines) |
| `RAWC2`, `RAW_EP2` | 9406 | `Float32Array(NLC*3)`, `Int32Array(NLC)` | coarse-cell lit ground colour cache |
| `RAWC`, `RAW_EP` | 9428 | `Float32Array(NC*3)`, `Int32Array(NC)` | fine-tile lit ground colour cache |
| `TILE_COL`, `TILE_EP`, `WAT_COL`, `WAT_EP`, `WAT_F1` | 9449 | `Array(NC)`/`Int32Array(NC)` | fine css colour caches (ground / water / water feather). **`WAT_F1` is never referenced anywhere else — dead** |
| `FIL_COL`, `FIL_F1`, `FIL_EP` | 9450 | same | concave-corner fillet colour cache (own cache so it never marks a wet tile as coloured — v9.15 bug fix) |
| `TILE_COL2`, `TILE_EP2`, `WAT_COL2`, `WAT_EP2`, `TILE_G2` | 9451 | same, coarse | coarse-cell caches |
| `VCOL`, `VC_EP`, `VC_NB` | 9453 | `Float32Array(NV*NV*3)`, `Int32Array`, `[[-1,-1],[0,-1],[-1,0],[0,0]]` | ground colour at a vertex (mean of the up-to-4 tiles meeting there) |
| `TILE_G` | 9467 | `Uint8Array(NC)` | 1 when the fine tile has a fitted gradient this epoch |
| `mkK` | 9468 | factory arrow | builds a colour-cache bundle `K = {col,ep,wc,wep,g, gr[], s0..s3[], wf1[], wg:Uint8Array, wa:Float32Array, W:{gr,s0..s3}}`; `W` holds the water's own gradients |
| `KF`, `KS` | 9469 | K bundles | fine cache (`KF`) and the coarse/shore cache (`KS`) |
| `GRAD_MIN` | 9470 | const `6` | min luminance spread (0-255) across corners before a tile is gradient-shaded |
| `NLV`, `VCOL2`, `VC_EP2` | 9505 | `NL+1`, `Float32Array(NLV*NLV*3)`, `Int32Array` | coarse-lattice vertex colours |
| `WVCOL`, `WVC_EP`, `WBL`, `WBL_EP` | 9518 | `Float32Array(NV*NV*3)`, `Int32Array`, `Float32Array(NC*4)`, `Int32Array(NC)` | water colour at vertices; blended water RGBA per tile (memo of `blendWater`) |
| `colEpoch` | 9526 | `let number`, starts 1 | **the colour epoch**: all caches above compare their `*_EP` against it. Incremented in `drawIsland` (9587) |
| `colAt`, `colAng`, `colCS` | 9526 | `let` | time, camera angle and LOD cell-size at the last epoch bump |
| `lateList` | 9527 | `Array` | props held back by `DBG.late` and painted after all ground (9973) |
| `SHEEN`, `NIGHTC`, `WHITE_LIT` | mutated 9587 | rgb triples (defined 8970, 6493) | recomputed each epoch from `rampSky()` |
| `drawN` | mutated 9579 | number (def 8639) | frame counter for ribbon outline cache |
| `curOrd` | mutated 9947 | number (def 6836) | painter's position in the back-to-front order (trees read it to know who stands behind) |
| `EDGE_DX`, `EDGE_DY` | 9980 | `[0,1,0,-1]`, `[-1,0,1,0]` | tile-edge direction table for `drawWaterDetail` |
| `bucket`, `pieceBucket` | mutated 9597, 9725 | `Map<cellIndex, Array<[kind,obj]>>` (def 8849) | cleared and refilled every frame |
| `o._sx`, `o._sy`, `o._ord` | 9615, 9617, 9618 | fields written onto gnome objects | last screen position and bucket order, read elsewhere (tap-select / tree logic) |

Read-only dependencies worth knowing: `SEA=2.0`, `SEAS=SEA+0.5=2.5` (570-571); `N=72`, `NC=5184`, `NV=73` (568); `NL=36`, `NLC=1296` (6360); `TW=26`, `TH=13`, `EH=26` (569); `GH=14.3` (8047); `TS=0.42` (6744); `S=2` (567); `FLOW_STREAM=0.5`, `FLOW_RIVER=1.3` (1349-1350); `WEX=0.7` (8976); `WS_WALL=0.9` (9104); `C` palette (6445-6448); `FOGC=[226,232,238]` (6449); `DBG` (12041).

---

## 3. Functions (every one in the range)

### `buildSea(EP)` — 9282-9306
Memoised on `seaEp` (9283). Builds the sheet's fields once per colour epoch:
- 9289-9290: every vertex touching a `SEAC` tile **or the map edge** (`!inB`) is seeded `SEAV=1` and queued.
- 9291-9295: BFS out over the beach up to depth 4 (`if(d>=4) continue`) in 4-neighbourhood (`WS_NDX/WS_NDY`), onto vertices with `V[u] < SEAS-0.02` whose surrounding tiles are all `E <= SEAS+0.6` (so it never climbs a real bank; "a pit dug beside the beach is a lagoon for a step or two, not an inland sea").
- 9296: `SF[v] = SEAS-V[v]` where sheet, else `SEAS-V[v]` if ground is above SEAS (negative) else `-0.4`; `NSF=-SF`.
- 9301: `DT[i]=0` where `E[i]>=SEAS-0.05` or (not sea and `wetDrawn(i)`) — rivers and lagoons count as shore (v9.14); else 99.
- 9302-9303: two-pass chamfer (orthogonal +1, diagonal +1.4).
- 9304: `SF2[v] = mean DT of 4 tiles - SEA_BAND` (off-map tiles count 9) if sheet vertex, else -1.
- 9305: `SEA_TOUCH[i]` = any corner `SF>0`.
Called from `drawIsland` 9589 and exposed to the harness at 12229.

### `drawSeaTile(i,x,y,a,b,c,d,EP)` — 9311-9337
One tile of the sheet. Corners lifted to the surface: `sy(v)=SVY[v]-(SEAS-V[v])*EH*Z` (9313). Corners pushed out by `SEA_EX` from the tile centre (9318). Per-epoch colour strings (9319): `SEA_SHALLOW = nightW(lit(mix(mix(C.shallow,C.water,0.30),FOGC,FOGA*0.5)))`, `SEA_RIM = nightW(lit(mix(mix(C.foam,C.shallow,0.30),FOGC,FOGA*0.5)))`. Fills `msPath(MS_SEA,...)` with SHALLOW (9320-9322); if any corner `SF2>0` fills `msPath(MS_DEEP,...)` with `seaPlaneCol(my)` (9324-9327); strokes the saved `BANKS` rim at `max(0.8,1.1*Z)` px (9328); glints when `Z>0.7` and `nzAt(x*0.9+31,y*0.9+17)>0.74` and in the deep part — a 3.5-8.5 px white line wobbling with `sin(now*0.0011)` (9330-9336). Called from `paintCell` 9838.

### `waterRaw(i,EP)` — 9338-9384
Per-epoch raw RGBA of inland/sea water tile `i` into `WRAW[i*4..]`. Rules:
- `dep=wetDV(i)`; `<=0.004` → alpha 0 (9342).
- `dp = clamp01((SEAS-E[i])/2.2)` (9344) — how far under sea level the bed lies.
- `flowing = FLOW>FLOW_STREAM*0.5 (=0.25)` (9346).
- Colour (9347): ice → `mix(C.ice,C.iceL, 0.5+grain)`; flowing → shallow-tinted water going to `C.deep` at `(dep-0.25)/0.7`; still → `mix(mix(shallow,water,dep/0.35), deep, max(dp,(dep-0.35)/0.9))`.
- 9348: fast streams above sea (`fl>0.5 && E>SEA`) whiten by `clamp01((fl-0.5)/2.5)*0.12` toward `[222,240,248]`.
- 9349: sediment `SED>0.01` → mix toward `C.bank` by `clamp01((SED-0.01)/0.06)*0.18` (muddy).
- 9353: when `T.cold>0.6`, ice rim: mix toward `C.ice` by `0.32*clamp01((0.7-dsm)/0.6)` where `dsm` = mean depth over the 3x3 (v9.15 fix for facets).
- 9354: `nightW(lit(wc))`.
- 9360: river mouth (non-sea tile touched by sheet or 4-adjacent to a sea tile) takes 90% of the sheet's SHALLOW tone (v9.13).
- 9363-9367: sky sheen on still water deeper than 0.2: drifting noise `nzAt(x*0.19+now*0.00006.., y*0.19-now*0.000035..)`, alpha `clamp01((sh-0.44)/0.5)*0.17*(1-W.rain)*(1-clamp01(W.wind-0.3)*0.7)`, mixed toward `SHEEN`.
- Alpha (9375): flowing → 1; still → `0.86+0.14*clamp01((dep-0.06)/0.12)` (opaque from 0.18 deep); ice → 0.96 (9376).
- 9377-9382: a sea tile (`SEAC && E<=SEA`) with `t=clamp01((SEAS-E-0.35)/1.3)>0` goes over to `seaPlaneCol(screenY)` by `t` and alpha → 1 at `t*1.6`.
Callers: `blendWater` 9386, 9395.

### `blendWater(i,x,y,EP)` — 9385-9403
Returns `[r,g,b,a]` feathered across 3x3: self 0.36, orthogonal 0.12 each, diagonal 0.04 each (9398-9400). Colour weighted by `w*alpha` (dry neighbours pull no blue), alpha a plain weighted mean over **wet** neighbours only (`aw`). Falls back to the raw tile if `cw<1e-4`. Callers: `wblend` 9519, fillet 9855, `paintCell` 9875.

### `litRaw2(ci,EP)` — 9407-9419
Coarse cell (2x2 tiles) lit ground colour. Normal from mean vertex gradient `VGX/VGY` of the cell's 4 corners (stride 2), rotated by camera (`rotVec`), scaled `S`; Lambert `L=0.82+clamp01(n·SUNL)*0.28` (9414); colour `lit(groundCol(i,x,y,hm,|g|))` × L into `RAWC2`. Note it passes `Math.hypot(gx,gy)` **without** `*S` whereas `litRaw` passes `*S` (9439) — inconsistent slope input to `groundCol`.

### `blendCol2(ci,EP)` — 9420-9427
4-neighbour blur of `RAWC2`: self 0.44, each neighbour 0.14.

### `litRaw(i,EP)` — 9429-9441
Fine-tile version of `litRaw2` into `RAWC`. Also exposed via harness `probeTile` (12240).

### `blendCol(i,x,y,EP)` — 9442-9448
4-neighbour blur of `RAWC` (0.44 / 0.14).

### `vertCol(v,EP)` — 9454-9459
Mean of `RAWC` over the ≤4 tiles around vertex `v` into `VCOL`; returns `v*3` (an offset, not a colour).

### `fitTileGrad(K,ci,VC,ka,kb,kc,kd,ax,ay,bx,by,cx,cy,dx,dy,fog,al,gmin)` — 9471-9503
Least-squares plane fit of 4 corner luminances (`0.3R+0.59G+0.11B`, 9473). Returns 0 (flat) if luminance spread `< gmin ?? GRAD_MIN(6)` (9475), if determinant `<1e-6` (9481), gradient length `<1e-6` (9482), or projected extent `t1-t0<0.5` px (9485). Otherwise regresses each channel against `t`, clamps end colours (9487), builds a `createLinearGradient` **in coordinates relative to corner a** so a pan needs no rebuild (9492-9494, "the dearest thing here"), applies fog (`mix(c,lit(FOGC),fog)`) and alpha `al`, stores in `K.gr[ci]`, and also stores four bilinear sub-quad colours `K.s0..s3` sampled a quarter in from each corner (weights 0.5625/0.1875/0.0625/0.1875) for the cheap non-gradient path (9496-9501). Returns 1. Used for ground (9776, 9777, 9824) and water (9890 with `gmin=0.8`).

### `vertCol2(vx,vy,EP)` — 9506-9512
Coarse-lattice analogue of `vertCol` using `RAWC2` into `VCOL2`.

### `wblend(i,EP)` — 9519
Memo of `blendWater` into `WBL[i*4..]`; returns `i*4`.

### `wvertCol(v,EP)` — 9520-9525
Water colour at a vertex: alpha-weighted mean of `WBL` over surrounding tiles that are drawn water (`wetDV>wetLo`) and **not** sheet. Zero if none.

### `playerRing(p)` — 9529-9534
Pulsing white ellipse under the player's gnome: radius `(8.5+1.2t)*Z` × `(4.2+0.6t)*Z`, `t=0.5+0.5sin(now*0.004)`, stroke alpha 0.55-0.80, fill alpha 0.12. Called from `drawProp` 9550 only when `o.player && MODE==='gnome' && !o.inside`.

### `critRing(c,p)` — 9536-9539
Thin grey (`#6A6377` @0.5) ellipse under the selected critter (`selCrit`): size deer 15 (fawn ×0.62), fox 9.5 (cub ×0.65), rabbit 7.5 (kit ×0.7), ×`cam.z`; rabbit lifted by its hop `c.z*EH*Z`.

### `drawProp(k,o,fog)` — 9540-9553
Kind-code dispatcher. Codes: 0 tree, 1 bush, 2 rock, 3 building, 4 gnome (+ player ring + carried glider), 5 part (`z` offset), 6 stump, 7 span tile, 8 mark, 9 flower (default branch), 10 rabbit, 11 deer, 12 perched bird, 13 player spring, 14 span end, 15 cover (needs `DBG.flowers && DBG.cover!==false`), 16 snowman, 17 fox, 18 fence piece, 19 boat, 20 grounded flyer. Height: kinds 5 and 10 use `topAt+o.z`, others `topAt`. Called from `drawIsland` 9960, 9970, 9973.

### `drawSnowman(sm,p)` — 9556-9577
Size `s = GH*Z*0.9*(0.55+0.45*sm.life)`; skip if `s<3`. Three balls (radii 0.34/0.27/0.20 of s at y 0/-0.44/-0.80), shade disc, highlight, rim `#9CAEC4`; pebble eyes, carrot nose `#E29A5C`, two buttons, scarf in `sm.hat` colour, twig arms `#8E7A6C`. Sags via `life`.

### `drawIsland()` — 9578-9977
The frame. Steps:
- 9579: `drawN++`.
- 9580-9582: `cs=lodCS()` (2 when `TW*cam.z<15` px, else 1), `fine=cs===1`; `rebuildSurface(); projectVerts(); tileOrder()`.
- 9586-9587: **epoch policy**: bump `colEpoch` when `now-colAt>220` ms, or `>110` ms while the camera is turning, or LOD changed; then `yardRefresh(); vertGrads(); valleyShade();` and recompute `SHEEN=mix(rampSky()[1],white,0.4)`, `NIGHTC=rampSky()[0]`, `WHITE_LIT=lit(white)`.
- 9589: `buildSea(EP); buildWV(EP); seaYh=horizonY()`.
- 9590-9592: pick fine/coarse order arrays; `cellOf`, `cellOfTile`.
- 9594-9596: `bucket.clear()`, `put`, `putT`.
- 9604-9619 `putWalker(x,y,k,o)`: tests the 3 tiles toward the camera (`FDX,0`/`0,FDY`/`FDX,FDY`) for whether their screen polygon covers the feet (`P.y-0.5`), knee (`P.y-GH*Z*0.3`) or shadow edge (`P.y+GH*Z*0.14`); water `>0.12` deep or a bridge in front → leave; a rise `>=0.8` level → leave (wall hides); else bucket with the front-most such tile, inserting **before** any tree/bush/rock already there (`q[0]<=2` → `unshift`). Writes `o._sx,_sy,_ord` for gnomes.
- 9620: local `FDX/FDY` = unit step toward the camera (±1 or 0 when `|rotC±rotS|<0.05`). **Shadows the global flow arrays `FDX/FDY` (617) inside `drawIsland` only.**
- 9621-9623 `inTile(j,px,py)`: even-odd point-in-quad test on the projected tile.
- 9633-9648 `frontKey(tiles)`: for a multi-tile building, the highest-order cell among its tiles and their 3 camera-ward neighbours, skipping neighbours that stand `>base+0.8` above (incl. water).
- 9649-9650 `bigs`, `putFront(tiles,k,o,own)`: bucket with `frontKey`, record in `bigs` for `frontFix`.
- 9660-9673 `putProp(x,y,k,o,w,sh)`: like `putWalker` but tests the foot's near edge (`P.y+sh`) and both sides (`P.x±w, P.y+sh*0.5`) and the top (`P.y-0.5`); off-screen (`P.x<-80||>cw+80||P.y<-160||>chh+80`) → own cell, no sort.
- 9674-9676: trees (`H=t.h*Z*TS*clamp(0.22+age*0.78)`; foot `H*0.42`, `H*0.16`), bushes (`13*Z*sc`; `*0.64`, `*0.08`), rocks (`15*Z*r`; `*0.44`, 0.5).
- 9681-9696: buildings. `BIG={wheel,trap,rack,pile}` get a 30*Z*0.5 / 0.22 foot, others 0.36 / 0.15. Fences/folds with a plan → `fenceQueue` (pieces with `faceVis` near/far flag); hutch as kind 18. Spans (`b.tiles`) → kind 7 per tile, kind 14 per end, plus a kind-3 yard marker while unfinished. Footprint buildings → `putFront(drawTiles(b),3,b, big?b.fp:null)` where big = `fw*fh>=2 || isHouse || tent`. Fence plans without split → tiles of every segment plus its midpoint. Trap → offset 0.8 toward its water (`trapDir`).
- 9697: gnomes not `inside/inBoat/inFlyer` → `putWalker`.
- 9699: boats → the highest-order cell under hull samples at -0.5, 0, +0.6 along heading.
- 9700: the flyer on the ground → `putProp` kind 20.
- 9701-9709: parts (5), stumps (6, foot 3.2Z/1.5Z), marks (8), player springs (13), critters (ridden/held/stabled skipped; penned rabbit → plain `put`; else `putWalker` 10/17/11), perched birds (12), snowmen (16, foot 5Z/1.5Z).
- 9710: flowers only when `Z>0.8 && !turning`; cover only when `Z>=1.0`.
- 9716: `frontFix(bigs,...)` unless `DBG.frontFix===false`.
- 9718-9723: fence pieces: near pieces spliced just after the last big building in the cell, far pieces appended.
- 9725-9727: `pieceBucket` of path pieces (`buildPieces(cs)` once per epoch when `Z>0.35`) plus the balloon cloth tiles.
- 9728-9731: `dirtC` (track colour when cold), `fogAmb=FOGA*0.55`, `foamC`, `wetAny`.
- 9736-9935 `paintCell(ci,fine,fog,K)` → 0 painted / 1 under sea / 2 open sea / 3 off-screen:
  - 9741-9742 screen cull: `maxx<-TW*cs || minx>cw+TW*cs || maxy<-EH*Z*4 || miny>chh+120`.
  - 9750-9752 wetness: fine → `wetAny && !isSheet`; coarse → ≥1 wet of 4 and (≥2 wet or `dmax>0.12`); `underSea` = (coarse) ≥2 SEAC and mean E ≤ SEA.
  - 9754-9755 `seaT`, `deepAll`.
  - 9757-9758 open-sea cull: deep+underSea tiles whose top is below the horizon (`yTop>seaYh+1`) return 2; coarse variant uses mean E `<= SEA-1.3`.
  - 9765-9767 radial push of corners by `EX=0.8` px (v9.15 fix for hairline grid).
  - 9768-9815 ground: colour per epoch via `blendCol`/`blendCol2` + fog; `K.g` via `fitTileGrad` when `DBG.smooth` and (fine: `Z>0.5`). Shore tiles (`SEA_TOUCH && !SEAC`) fill only the `MS_LAND` contour; gradient path uses `setTransform(dpr,0,0,dpr,ax*dpr,ay*dpr)`; `DBG.smooth==='grad'` → gradient fill; other truthy `smooth` → four sub-quads pushed out by `S=0.65` px (cheap mobile path); else flat. Puddles (9809-9811): `W.wet>0.1 && Z>0.7 && (PAVE || WEAR>1.4) && h01(x,y,5)<0.55`, ellipse `TW*(0.12+h*0.14)*Z` wide, alpha `0.26*W.wet`, highlight `0.18*W.wet`. Then `drawStepsTile` / `drawMineTile` when `Z>0.4`.
  - 9822-9832: an under-sea tile with a corner above SEAS draws its above-surface land part (v9.14 "teeth at a river's mouth").
  - 9833-9841: sea tiles: `deepAll` → plain quad in `seaPlaneCol` at the surface; else `drawSeaTile`. Returns.
  - 9845-9864: **concave-corner fillet**: dry, non-bridge, non-sea tile with `fsAny(i)` takes the wettest of 8 neighbours (`wetShow`, not sea) if `E[i] <= E[jb]+wetDV(jb)+WS_WALL(0.9)`; colour cached in `FIL_*`; path via `waterPath` with corner heights at the water level (or `SWY` where `VWn`); feather stroke `FIL_F1` width `3.2*Z` butt caps when `pc>0 && Z>0.45 && DBG.feather`.
  - 9866-9932: inland water. Colour cached in `K.wc/wf1/wa/wg`; fine → `blendWater`; coarse → own formula (alpha `(ice?0.96:0.30+clamp01((dep-0.09)/0.30)*0.58+dp*0.08)*(0.55+0.45*wn/4)`, sea cells flat `seaPlaneCol`). Water gradient `fitTileGrad(K.W,...,gmin=0.8)` only fine+grad+`Z>0.5`+not underSea. Corner push `wex = wa>=0.995 ? 0.5 : WEX(0.7)`. `fsAll` → plain quad; else `waterPath` + feather stroke `3.2*Z` butt. Ice crack line when `nzAt(x*0.8+41,y*0.8+13)>0.66 && Z>0.6`; fine `Z>0.55` → `drawWaterDetail`; coarse ripple when noise `>0.74 && Z>0.3`.
- 9937-9944 `shoreCell(ci)`: a coarse cell is painted as its 4 fine tiles (sorted by `DEPTH`, cache `KS`) when: E range straddles `[SEA-1.3, SEA+0.5]`; any `SEA_TOUCH`; sea tile with `min DT < SEA_BAND+1.6`; any `wetDrawn`; or straddles the snow line ±0.7 (v9.16).
- 9946-9972 main loop over `ORD`: `fog = clamp01(1-s/(2*(N or NL)))*0.22 + fogAmb`; `r===2` (open sea) → only gnomes (at SEAS), parts, spans/ends/buildings/boats/flyer; else path pieces (not under sea), then props from the bucket with `DBG.late` (defer) / `DBG.hide` (skip).
- 9973-9976: deferred props, the airborne flyer, flying birds.
Caller: `draw()` at 12048 (`if(DBG.island) drawIsland();`).

### `drawWaterDetail(i,x,y,a,b,c,d,way,wby,wcy,wdy,fl,foamC)` — 9981-10056
- 9988-10004: **dead code** — `edgeF=0` ("gone for good", v9.13), so the pale edge-line loop never runs.
- 10008-10033 tumble: for each edge, neighbour `j` must be non-bridge, `FLOW[j]>=0.4`, `wetD(j)>=0.16`, this tile `wetDV>=0.14` (v9.19), `drop=(E[j]+wetD(j))-surfI >= 0.5`, and flow toward `i` (`FDX[j]*(-EDGE_DX)+FDY[j]*(-EDGE_DY) >= 0.5`, using the **global** flow arrays). Lip line alpha `0.35+min(drop,1)*0.25`, width `max(0.8,1.4Z)`; 3-4 foam ellipses (`Z>1.1 ? 4 : 3`) drifting from edge toward centre with phase `(now*0.0011+q*0.37+x*0.13+y*0.29)%1`.
- 10034-10048 current: `fl>0.35 && E>SEA && wetDV>0.05` → 1 streak (2 for `fl>FLOW_RIVER`), direction `rotVec(FDX[i],FDY[i])` mapped to screen `((rd0-rd1)*TW/2*Z, (rd0+rd1)*TH/2*Z)`, speed `0.0009*(0.7+min(fl,3)*0.35)`, alpha `clamp01((fl-0.35)/1.2)*0.42*(1-|f|*1.6)+0.06`.
- 10049-10055 still ripple: noise `>0.70 && Z>0.7`, quadratic arc length `(4+n3*5)*Z`, drift `sin(now*0.0005)*2.2Z`.
Caller: `paintCell` 9925.

---

## 4. Concrete rules & tuning numbers (consolidated)

**Sea sheet**
- Surface at `SEAS = 2.5` levels (`SEA=2.0 + 0.5`).
- Beach BFS depth ≤ 4 vertex steps; vertex must be `< SEAS-0.02`; surrounding tiles `<= SEAS+0.6`.
- Shore band width `SEA_BAND=1.5` tiles (chamfer metric 1 / 1.4).
- `SEA_FILM=0.06`: a touched tile with water standing ≤0.06 above SEAS is sheet.
- Tile corner overlap `SEA_EX=0.7` px; inland `WEX=0.7` (opaque water uses 0.5); ground `EX=0.8`; sub-quads 0.65.
- Rim stroke `max(0.8, 1.1*Z)`; feather stroke `3.2*Z` (needs `Z>0.45`).
- Band colour = `mix(mix(shallow,water,0.30), FOGC, FOGA*0.5)`; rim = `mix(mix(foam,shallow,0.30), FOGC, FOGA*0.5)`.
- Sea-plane take-over for a sea tile: `t=clamp01((SEAS-E-0.35)/1.3)`.
- Open-sea cull: deep tile wholly under the horizon line (`yTop > seaYh+1`); coarse: mean E `<= SEA-1.3`.

**Water colour**
- Draw threshold `wetLo`: 0.09 standing, 0.045 flowing (691).
- "flowing" = `FLOW > 0.25`; stream `0.5`; river `1.3`; tumble needs neighbour flow `>= 0.4`; current streaks need `> 0.35`.
- Depth→colour breakpoints 0.3 / 0.25..0.95 (flowing), 0.35 / 0.35..1.25 (still); sea-depth factor `/2.2`.
- Whitening of fast water `(fl-0.5)/2.5 * 0.12`; sediment `(SED-0.01)/0.06 * 0.18`; cold rim `0.32*(0.7-depth)/0.6` when `T.cold>0.6`.
- Alpha: still `0.86 + 0.14*(dep-0.06)/0.12` (opaque at 0.18); flowing 1; ice 0.96.
- Sheen: alpha `≤0.17`, suppressed by rain and wind above 0.3; drift speeds 0.00006 / 0.000035 per ms.
- Feather weights: 0.36 / 0.12×4 / 0.04×4. Ground blur 0.44 / 0.14×4.
- River mouth tiles take 90% of the sheet tone.

**Lighting / gradients**
- Lambert `0.82 + 0.28*clamp01(n·SUNL)`.
- `GRAD_MIN=6` luminance units for ground; `0.8` for water; minimum projected extent 0.5 px.
- Gradients only when `Z>0.5`; flowers `Z>0.8` and not turning; cover `Z>=1.0`; path pieces `Z>0.35`; steps/mine `Z>0.4`; water detail `Z>0.55`; glints/ripples/puddles `Z>0.7`; coarse ripple `Z>0.3`.
- Epoch cadence: 220 ms, 110 ms while turning, immediate on LOD change.
- Fog: `clamp01(1-depthOrder/(2*N))*0.22 + FOGA*0.55`.
- LOD: coarse when `TW*cam.z < 15` px (`LOD_PX`).

**Depth sorting**
- Walls hide walkers/props when neighbour rises `>= 0.8` level; water `> 0.12` deep in front leaves a walker alone.
- Walker test points: feet, knee at `GH*Z*0.3` above, shadow at `GH*Z*0.14` below.
- Big-building footprint threshold `fw*fh >= 2`.

**Decorations**
- Player ring 8.5-9.7 × 4.2-4.8 px, pulse 0.004 rad/ms; critter ring sizes 15/9.5/7.5 (young ×0.62/0.65/0.7).
- Snowman min size 3 px; max 4 snowmen (elsewhere, 5037).
- Puddles on paved/worn (`WEAR>1.4`) tiles, 55% of candidates, alpha `0.26*W.wet`.

---

## 5. UI / controls / input
None. The only screen-space concerns are culling against `cw/chh` and the `dpr` transform. Gnome objects receive `_sx/_sy/_ord` (9615-9618) which the tap-select code outside this range uses.

## 6. MODE 'creator' vs 'gnome'
- 9550: `if(o.player && MODE==='gnome' && !o.inside) playerRing(op)` — the only mode-dependent line. In creator mode no ring is drawn.
- Everything else is mode-agnostic. (`drawGhost` for the gnome-mode placement ghost is called after `drawIsland` at 12049, outside this range.)

## 7. Progression / unlock / economy
Nothing. The renderer reads world state (`builds`, `boats`, `village.flyer`, `snowmen`, etc.) but changes none of it.

## 8. Persistence
None in range (no localStorage/JSON). All caches are transient, epoch-keyed typed arrays.

## 9. Mobile / touch / performance tricks
- Typed-array caches everywhere, each with an `*_EP` epoch array; nothing is recomputed more than once per epoch (≈4.5 Hz, 9 Hz turning).
- Gradients built once per epoch **relative to corner a** and painted under a translation (9492-9494), so panning never rebuilds them.
- `DBG.smooth` has a cheaper non-'grad' mode: four flat sub-quads (9796-9803) "the chequer goes without a gradient fill, which phones find dear".
- Coarse LOD (`NL=36` cells) when tiles are <15 px, with shore/water/snow-line cells promoted back to fine (9937-9944).
- Small stuff (flowers, cover) skipped while the camera turns or when zoomed out (9710).
- Off-screen props skip the sort (9664); cells culled by bbox (9741-9742); open sea not painted at all (sea plane behind).
- Corner push-out (0.5-0.8 px) to avoid anti-aliasing seams rather than stroking.
- Flat colour strings cached (`css()` results) so `fillStyle` assignment is a string, not a fresh template each tile.
- `ctx.setTransform(dpr,...)` used per gradient tile and reset (9779, 9792, 9830, 9900).

## 10. i18n (en/es)
Nothing in this range; no user-facing text.

## 11. Oddities, bugs, dead code, TODOs
1. **Dead constants**: `ONE=[0]` (9682) unused; `WAT_F1` (9449) unused (the real feather cache is `K.wf1`).
2. **Dead loop**: `edgeF=0` at 9988 makes 9989-10004 unreachable (acknowledged in the comment).
3. **Shadowing**: local `FDX/FDY` in `drawIsland` (9620) shadow the global flow-direction arrays (617). `putWalker` (9604) is defined before 9620 but references `FDX` — fine at call time (TDZ not hit) but fragile. `S=0.65` (9801) shadows global `S=2` inside one block.
4. `litRaw2` passes slope `hypot(gx,gy)` while `litRaw` passes `hypot(gx,gy)*S` to `groundCol` (9416 vs 9439) — coarse cells are told a slope half as steep as fine tiles.
5. `DBG.frontFix`, `DBG.fenceSplit`, `DBG.late`, `DBG.hide`, `DBG.cover` are not in the `DBG` object (12041); they are harness-only toggles relying on `undefined` defaults.
6. Comments carry a version changelog (v9.9 → v9.22) and reference a tester ("Jed") — product history, not code.
7. `buildSea` treats the map edge as sea (9290) so the sheet always wraps the island — an island-world assumption.
8. `drawWaterDetail` uses `wetD(j)` (raw) for the neighbour but `wetDV(i)` (slack-hidden) for self — intentional per 682 but subtle.
9. `fitTileGrad` writes `K.s0..s3` only when a gradient is fitted; the sub-quad path (9796) is only reached when `K.g[ci]` is 1, so that is consistent.
10. `vertCol`/`vertCol2`/`wvertCol`/`wblend` return array **offsets**, not colours — callers index `VCOL[k+ch]`; easy to misuse.
11. Nothing here is a TODO marker; there are none in the range.

## 12. Reusable vs gnome-specific

**Reusable engine (port nearly as-is if the park keeps a heightfield + isometric camera):**
- Epoch-keyed colour caching pattern (`colEpoch`, `*_EP` arrays, `mkK` bundles) — 9449-9527, 9586-9587.
- `fitTileGrad` + `vertCol*` — plane-fitted gradients per tile, pan-invariant gradients (9460-9512).
- `litRaw/blendCol` Lambert + 4-neighbour blur (9404-9448).
- The painter's-algorithm skeleton of `drawIsland`: `tileOrder` → bucket by cell → `putWalker`/`putProp`/`putFront`/`frontKey` overhang rules → paint loop with `lateList`/`DBG.hide` harness hooks (9578-9736, 9946-9977).
- `paintCell`'s ground paths (cull, radial push, gradient/sub-quad/flat), puddles (9736-9815).
- LOD scheme (`lodCS`, `shoreCell` promotion) (9937-9944).
- `drawProp` as a kind-code dispatcher (9540-9553) — the table itself is content.

**Water stack — reusable only if the park has water (a pond, fountain, canal):**
- `buildSea`, `drawSeaTile`, `MS_*` contours, `SF/SF2/DT` (9265-9337) are specific to an island ringed by sea with beaches; a park pond would use the inland path (`waterRaw`/`blendWater`/fillet/`waterPath`), not the sheet.
- `waterRaw` rules for flow/sediment/ice/cold are river-sim-specific (9338-9384); keep depth→colour and sheen, drop FLOW/SED/ICE unless the park simulates them.
- `drawWaterDetail` tumble/current streaks presuppose a flow field (9981-10056); still-water ripple (10049-10055) is generic.

**Gnome-specific content (replace):**
- `playerRing` colour/size and `MODE==='gnome'` gate (9529-9534, 9550).
- `critRing` species table (9536-9539).
- `drawSnowman` (9556-9577).
- All the entity lists and kind codes in `drawIsland` (trees, bushes, rocks, builds with `wheel/trap/rack/pile/fold/fence/tent`, gnomes, boats, flyer/glider/balloon cloth, parts, stumps, marks, springs, critters, birds, snowmen, flowers, cover) 9674-9727; the `r===2` open-sea exceptions (9961); `drawStepsTile`/`drawMineTile` hooks (9812-9813).
- `BIG` set, `isHouse`, `trapDir` offsets.
- Seasonal/weather couplings: `T.cold` (ice rim, track colour), `W.wet` puddles, `W.rain/W.wind` sheen.

---

## 13. Design questions for the Parque D'Amour port raised by this section

1. Does the park have a heightfield at all, or is it flat? Most of this section (gradients, walls hiding walkers, sheet contours, `topAt`) exists because the ground has relief. A flat park could drop `fitTileGrad`, `putWalker`'s rise test and the sheet entirely.
2. What is the world boundary? `buildSea` treats the map edge as sea (9290). A park needs a different edge: hedge, railings, a street, fog — and whatever it is must be painted where the sea plane currently is.
3. Is there water, and of what kind? A fountain, pond or canal is **inland water** (contour ribbon + fillet path), not the sea sheet; do we keep a flow field (`FLOW/FDX/FDY`) for a stream or fountain jets, or only still water (sheen + ripple)?
4. Which actors get a ground ring (9529-9539) — the player's avatar only, the couple being matched, the selected NPC? In Creator mode is there any ring at all (today: none)?
5. What is the prop taxonomy (`drawProp` kind codes 0-20)? Benches, lampposts, kiosks, hedges, statues, flower beds, the couple, passers-by, dogs, pigeons — each needs a foot size (`w`, `sh`) for `putProp` and a decision on whether it is a "big" multi-tile footprint (`putFront`) or a walker.
6. Which props do gnomes-style walkers stand *on* (bridges, decks → `BRIDGE[]`, `putT` kinds 7/14)? Footbridges over the pond, a bandstand?
7. Weather/season coupling: do we keep `T.cold` (ice on the pond, snow line), `W.wet` puddles on paved paths? A quaint French park probably wants rain puddles but may not want frozen ponds.
8. Epoch cadence (220/110 ms) and LOD threshold (15 px) — are they right for a smaller, denser park where the camera rarely zooms to "Fit"? Does the coarse lattice even need to exist?
9. Does the game run on phones? If so keep the sub-quad non-gradient path and the `Z` gates; if desktop-only, `DBG.smooth='grad'` everywhere and the gates can loosen.
10. Mode semantics: in this file Creator vs gnome differs only by the ring. For Parque D'Amour, does Creator mode show hidden affordances (e.g., romance heat-map, sabotage targets) that the renderer must paint, and does avatar mode hide them?
11. Debug harness hooks (`DBG.late/hide/frontFix/fenceSplit`, `lateList`, `probeTile`) — keep the harness surface so visual regressions can be measured automatically?
12. The river-mouth / estuary special cases (9360, 9822-9832, v9.13/v9.14) are heavy engineering for a feature the park won't have; the port should cut them rather than carry them.
