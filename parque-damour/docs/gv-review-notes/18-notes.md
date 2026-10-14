# Gnome Village review — section 18: lines 10057–10681
## "Weather drawn, the constructs (v9.8), the stone bridge (v9.10)"

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Range read in full: 10057–10681 (625 lines). All line numbers below are absolute.

---

## 1. Purpose of the section

This is a pure **rendering** section of the one-file isometric canvas engine. It contains:

1. **`drawWeather()`** (10062–10105) — the screen-space rain, snow and lightning overlay drawn last in the frame.
2. **The "constructs" primitive kit (v9.8)** (10107–10201) — world-space masonry and timber primitives (`stoneFace`, `stoneBlock`, `logRib`, `grainAt`, `lashing`, `deckLogs`, `deckPlanks`, `deckRails`) in the "cabin's own language": cobbled stone faces lit by their normal, round logs with end grain.
3. **Span structures** (10202–10490) — everything drawn one tile at a time along a `tiles[]` list: log/plank bridge tiles and abutments, piers, the flood bank (v9.19), the stone arch bridge (v9.10), the rope bridge, the log dam with its spillway.
4. **Small single-site structures** (10491–10681) — the waterwheel mill, the fish trap, campfire stones/logs, the woodpile (v9.20), the drying rack.

Nothing here advances the simulation: every function reads sim state (`E`, `WD`, `FLOW`, `PIER`, `DAM`, `W`, `T`, `store`, the build object `b`) and draws. One exception: `drawWheel` spawns splash particles (10538) — a draw-time side effect.

The big architectural idea on display: **a structure is drawn as far as its plan has progressed**. Each build `b` has `b.plan` (ordered steps `{m,k,at,ti,...}` made by `pc()` at 3839), `b.pi` (how many steps are done, 4109/4161) and `b.stc` (counts per step kind, 4161). The drawing code asks `laidOn(b,ti,kind)` (4172: count of done steps of that kind on that tile) or `stc(b,kind)` (7968: count overall, 99 when done) and chooses how much to draw. So the same function draws a planned bridge, a half-built one and a finished one.

---

## 2. Globals / state defined or mutated in this range

| Name | Line | Type / shape | Notes |
|---|---|---|---|
| `DECK_HW` | 10172 | const number `0.40` | bridge deck half-width in tiles |
| `LOG_HW` | 10172 | const number `0.125` | half-width of a deck log in tiles |
| `LOG_P` | 10172 | const number[3] `[-0.265,0,0.265]` | lateral offsets of the three deck logs |

Mutations of outside state:

| What | Line | Effect |
|---|---|---|
| canvas `ctx` state (fillStyle, strokeStyle, lineWidth, lineCap, lineJoin, transform via save/restore) | throughout | normal drawing; `lineCap='round'` is left set by several functions (10076, 10194, 10256, 10388, 10474, 10580, 10656, 10668) and `'butt'` by 10516/10548 — leaks to later draws |
| particle list via `splashFx(...)` | 10538 | `drawWheel` spawns a splash with 5% chance per frame when the finished wheel spins and dips into water; uses `vchance` (visual RNG, 598) so sim determinism is kept |
| `l.d` on each entry of the array passed to `drawLogSet` | 10636 | adds a screen-depth field to the caller's objects, then sorts the caller's array in place (10637) |

No sim arrays are written. No persistence. No DOM.

External state **read** (defined elsewhere): `W` weather object (845: `rain, snow, wind, flash, ...`), `cam` (6333: `z` zoom), `cw/chh/now` (6331: canvas size, frame time ms), `N` grid size (568), `TW/TH/EH` tile px (569), `E/WD/FLOW/PIER/DAM` typed arrays (612–629), `T` time (814: `day, cold, season`), `store` (2409: `food, wood`), `BT` build catalogue (2411), `SUNL` sun vector (6450), `AUTUMN` palette (6765), `MODE`/`PB` only at the call site (12050).

---

## 3. Every function in the range

### 3.1 Weather

**`drawWeather()`** — 10062–10105. Called once per frame at 12051, after `drawIsland()`, `drawGhost()` (gnome mode only) and `drawFocusMark()`; it is the last thing painted. Screen-space; positions come from a value-noise hash of the particle index (`nzAt`, 6631) plus the clock, so there is no particle state at all.
- 10064–10066: v9.15 note — the storm no longer sweeps a navy shadow band; cloud cover dims the light in `computeAmbient()` (6452) instead.
- **Rain** 10067–10089, when `W.rain > 0.06`:
  - 10071 `hy = horizonY()` (6511) — no drops above the horizon (10084 skips `y < hy-6`).
  - 10072 count `n = round(W.rain * 95 * (cw*chh)/(390*800))` — **scaled to a 390×800 phone-portrait reference**, so density per screen area is constant.
  - 10073 `zz = clamp(Z, 0.7, 1.4)` — zoom influence on streak size is bounded.
  - 10074 `slant = -W.wind*(7+6*W.rain)*zz`, `len = (5+4*W.rain)*zz` px, `sp = (460+240*W.rain)*zz` px/s fall speed.
  - 10075 alpha `al = 0.13 + 0.15*W.rain`.
  - 10076 lineWidth `max(0.6, 0.75*zz)`, round caps.
  - 10077–10088 two passes in one `beginPath/stroke` each: far layer (pass 0: odd `k`, alpha×0.55, length×0.65) and near layer (pass 1: even `k`, full). Colour `rgba(206,224,240,a)`. Position: x from `(h1*3.7+h2*1.3)*cw*1.6 + t*slant*4` wrapped over `cw+80` (−40 margin); y from `h2*5.1*chh + t*sp*(0.85+h1*0.3)` wrapped over `chh+60`. Each drop is a segment `(xx,y) → (xx+slant*0.22, y+L)`.
- **Snow** 10090–10100, when `W.snow > 0.06`:
  - 10091 `n = round(W.snow * 120 * (cw*chh)/(390*800))`.
  - 10092 fill `rgba(248,250,255,0.82)`.
  - 10095 sway `sin(t*(0.5+h1*0.5)+k) * (12+10*h2) * Z` px; 10096 x drift `t*W.wind*14`, fall `t*(24+30*h1)*clamp(Z,0.7,1.5)` px/s; 10097 radius `(0.9+h1*1.3)*clamp(Z,0.7,1.5)`.
  - 10098 one `arc`+`fill` per flake (not batched).
- **Lightning** 10102–10103: when `W.flash > 0.02`, a full-canvas `fillRect` of `rgba(236,240,255, 0.38*W.flash)`.

### 3.2 Masonry and timber primitives (v9.8)

**`stoneFace(a,c,zbA,zbC,z1,L,seed)`** — 10118–10122. One wall face between world corners `a` and `c`, bottoms `zbA/zbC` (may differ, following the ground), top `z1`, light `L`. `zLow = max(zbA,zbC)`; if either bottom is more than 0.01 below `zLow`, a plain `#A8A4B6` skirt quad is filled from the true bottoms up to `zLow+0.01` (10120). If `z1 - zLow > 0.03`, calls `cobbles(a,c,zLow,z1,L,seed)` (6967) to draw the cobbled face. Only called by `stoneBlock`.

**`stoneBlock(pts,zTop,zBot,seed,skip,capCol)`** — 10123–10130. The workhorse masonry primitive: `pts` = 4 world corners in order round the block; `zBot(qx,qy)` is a *function* so the bottom can follow terrain; `skip(nx,ny)` optionally culls faces that are buried; `capCol` default `#BDBACB`. For each of 4 edges: outward normal from the edge, flipped to point away from the centroid (10125); skip if `skip()` says so or `faceVis(nx,ny,0)` (6958) says it faces away; `faceLight` (6959) gives the sun shading; `stoneFace` with `seed+e*13`. Then the flat cap (shade ×1.04) and an outline `#8E8AA0` alpha 0.45, width `max(0.4, cam.z*0.5)` (10128–10129). Callers: everything in this section plus the stable footings at 7739.

**`logRib(x0,y0,z0,x1,y1,z1,hw,col,e0,e1,L)`** — 10136–10151. A round log from centre-line point 0 to point 1; `hw` half-width in tiles; vertical half-height `rv = hw*0.55` (10138) — chosen so a log reads as tall as it is wide on screen given `EH` vs tile width. Draws: top face (shade `col × 1.04L`, 10140); the side toward the viewer (`Ls*0.88*L`, 10142); a dark lower band on that side `#8E7A6C` α0.35 from `z-rv*0.25` to `z-rv` (10143); a crown highlight `#F2E2CA` α0.5 (10145) and a far-edge seam `#8E7A6C` α0.55 (10146); end grain via `grainAt` at end 1 if `e1 && faceVis(ax,ay)` and end 0 if `e0 && faceVis(-ax,-ay)` (10147–10148). Used widely outside the range too (3208, 7207, 7424, 7469, 7650...).

**`grainAt(P,ax,ay,hw,rv,L)`** — 10152–10161. The end-grain disc: builds a screen-space ellipse basis from `rotVec` of the perpendicular (`ux,uy` scaled by `TW/2, TH/2 * cam.z * hw`; `vy = -EH*cam.z*rv`), skips if under 0.7 px (10155), draws with `ctx.transform` + unit arc: fill `#D9BC9A ×1.05L`, ring `#8E7A6C` α0.7, two inner rings at 0.58 and 0.24 radius `#A98F76` α0.5.

**`lashing(x,y,ux,uy,px,py,h,W,lwz)`** — 10164–10168. Rope band across the deck logs at a joint: half-width along the deck `w = 0.035`; dark quad `#7E6A5C` α0.75 at `h+0.012` spanning ±`W` across; lighter twist line `#D9C6A8` α0.6 at `h+0.014`, width `max(0.4, lwz*0.5)`. (Parameter `W` shadows the global weather `W` — harmless here.)

**`deckLogs(x,y,ux,uy,px,py,f0,f1,h0,h1,nLogs,e0,e1)`** — 10173–10176. Up to 3 deck logs at `LOG_P` offsets from `f0` to `f1` along the way (tile-centre relative), heights `h0→h1`; log centre is `h - rv` so the deck surface is at `h`. Centre log `#D2B393`, outer `#C9AB8C`.

**`deckPlanks(x,y,ux,uy,px,py,f0,f1,h0,h1,nBoards,withStringers)`** — 10177–10191. Optional two stringers (`logRib` hw 0.09 at ±0.29, `#B8987A`, 0.02 below the deck); boards every 0.19 tiles (`n = max(1, round((f1-f0)/0.19))`, 10181) with 0.012 gaps, drawn up to `nBoards`; alternating `#D3BBA1`/`#CBB196` ×1.03, outline `#8E7A6C` α0.45 width `max(0.4, cam.z*0.45)`; a 0.035-deep darker edge `#A98F76` α0.8 on the side toward the viewer (10188–10189).

**`deckRails(x,y,ux,uy,px,py,f0,f1,h0,h1,post,rope,bar)`** — 10192–10201. On both sides at ±(`DECK_HW+0.02` = 0.42): if `post`, a post at `f=0` (height `RH+0.04`, `RH=0.30`) `#A38C7C` width `max(0.9, s*0.06)` with a knob r `max(0.8, s*0.035)`; if `bar`, a `logRib` hw 0.035 `#C0A78F` at `h+RH`; if `rope`, a line `#B39A86` α0.9 at `h+RH*0.55`, width `max(0.5, s*0.028)`. `s = 30*cam.z` (the engine's "pixels per tile-ish" unit).

### 3.3 Log / plank bridges

**`drawAbutment(b,ti)`** — 10203–10231. The bank-end block of a log or plank bridge. `near` = this end is `b.ends[0]` (10205); `tx,ty` point toward the water; `building = !b.done && b.plan` (10208). While building, returns unless at least one `deck` (log bridge) / `plank` step is laid on the end tile (10210). Heights: `h0 = b.deck` (bank), `h1 = (decks[endK]+b.deck)/2` (10211). Geometry: `ov = spanOver(b)`, block half-width `0.38`, `f1 = 0.5` (water's edge), deck starts at `df0 = 0.5-ov` (onto the bank), block starts at `f0 = max(df0+0.04, 0.18)` (10215–10216). Block top sits just under the logs (`h0 - 0.1375 - 0.01`) or under the stringers (`h0 - 0.02 - 0.099 - 0.01`) (10218); bottom `min(eLerp-0.04, waterline-0.12)` following the bank down (10219); back face (into the bank) culled by `skip` (10220). Then `deckLogs` with end grain at the bank, or `deckPlanks` 9 boards with stringers (10222–10223); a lashing at `df0+0.07` once a log is down (10224). Rails: log bridges have none (`railN=0`) unless the **plank upgrade project** `b.upProj` (3329–3335: a log bridge with ≥40 uses gets a `plankbridge` upgrade) has laid a `rail` on this tile; plank bridges show rails once `laidOn('rail')>=1` (10226–10229); the rope handrail appears when `stc(b,'rope')>=1`.

**`spanOver(b)`** — 10237. How far a bridge/dam runs past the water onto each bank: `L` = count of tiles that `wetDrawn()` (693) says are drawn wet (all tiles for a dam); returns `clamp(0.10*max(L, tiles.length*0.6), 0.60, 0.85)`. **In practice 0.60 tile for any span under 6 wet tiles**, growing to 0.85 at 8.5. Comment at 10232–10236 explains the v9.14 reason: the landing tile is painted dry, so the deck must reach past its middle or it would "end a hand short of the bank".

**`drawPier(b,ti,k,h,pierN)`** — 10239–10247. Stone pier under a span tile: half-width across `0.27`, along `0.19`; top `h - 0.1375 - 0.02` when both pier steps are laid, else a half-height `lerp(bed-0.2, h, 0.55)` (10241); `stoneBlock` down to `bed-0.2`. A wet line `#6E8FB0` α0.45 width `max(0.6, cam.z*1.3)` at `waterline+0.02` on each visible face when the waterline is 0.05 below the top (10244–10246). `k` is unused.

**`drawSpanTile(b,ti,isEnd)`** — 10260–10289. **The dispatcher** for span structures. Called from `drawProp` (9542–9543) for prop kinds 7 (mid tiles) and 14 (end tiles), which the island painter queues per tile at 9688–9689 (`putT(ti,7,{b,ti})` for every `b.tiles`, `putT(ti,14,{b,ti})` for `b.ends`). Dispatch by `b.type`: `bank` → `drawBankTile`; `dam` → `drawDamTile`; `ropebridge` → `drawRopeTile`; `stonebridge` → `drawStoneTile`; else end tiles → `drawAbutment`; else a log/plank bridge mid tile:
- 10268–10270: `pierN = laidOn('pier')` or 2 when done; `deckN = laidOn('deck')` or `BT.logbridge.w` (3); `plankN`/`railN` from own plan (plank bridge: done = 3 / 1) or from the upgrade project `up` for a log bridge.
- 10271: while building, nothing drawn until a pier, deck log or plank is laid.
- 10272: a pier is drawn only if `PIER[ti]` is set or `k` is in `b.piers` and at least one pier step is laid.
- 10273: no deck yet → return.
- 10274–10275: `h0/h1` = averages with the neighbouring tiles' deck heights (`b.decks[k±1]`, falling back to `b.deck` at the ends) so the deck is continuous.
- 10276–10282 log bridge: `deckLogs` across the whole tile (−0.5..0.5); with all 3 logs a lashing at +0.5 and (first tile only) −0.5; if the upgrade has laid planks, `deckPlanks` over the logs at `+0.02` with `plankN*2` boards, no stringers.
- 10284 plank bridge: `deckPlanks` with stringers, 9 boards when 3 planks laid else `plankN*2`.
- 10286 rails when `railN>=1`, with rope when `stc('rope')>=1` (post, rope, bar).

**`drawBankTile(b,ti)`** — 10250–10259 (v9.19 flood bank). The banked ground itself is the terrain (levelled by the builders elsewhere); this only draws the stakes. `stakes = b.done ? 99 : laidOn(b, b.tiles[k&~1], 'stake')` — **tiles are paired**, the even tile of each pair carries the stake step (10251). `wx,wy` = direction to the water (default 0,1). Two stakes at `±0.28` across, `0.30` toward the water: `#A38C7C` width `max(0.8, s*0.05)` from `z-0.02` to `z+0.26` (10255–10256); a woven withy `#B8A07A` α0.9 width `max(0.6, s*0.03)` as two quadratic curves at heights 0.08 and 0.16 with `s*0.02` sag (10257–10258).

### 3.4 The stone bridge (v9.10)

**`archVoid(a,c,zBot,zTop,L,seed)`** — 10298–10314. The arched opening on one long face of a bay. Opening spans `t0=0.12..t1=0.88` of the face; springs at 40% of the height (`zs`), crown at 84% (`zc`) (10301); skipped if `zc-zs < 0.04`. 15-segment arch with profile `sin(πu)^0.55` — a flattened round arch rather than a pointed one (10306–10307). Fill `#7497B4 × 0.95L` — v9.16: "the water in the arch's shadow, a dusky blue" (10310). Voussoir ring stroke `#CFCCDA` width `max(1, cam.z*1.5)` (10312–10313). `seed` is unused.

**`drawStoneTile(b,ti,isEnd)`** — 10315–10358. One bay per tile. Progress: `archN = laidOn('arch')` or `BT.stonebridge.s` (4) when done; `centN = laidOn('centring')` or 1; `parN = laidOn('parapet')` or 1 (10320–10322). Nothing until the centring is up (10323). `W = 0.40` half-width. The masonry starts at `base = min(waterline-0.05, deckMid-0.35)` — "what is founded below it is the water's business" (10327). `f = archN/4` (10328).
- Centring 10330–10337: while `f < 0.999`, a timber arc `#8A6A4A` width `max(1, cam.z*1.5)`, 10 segments from −0.46..0.46 along, rising `sin` from `base+0.06` to `deckMid-0.14`, on each visible long face.
- 10338: no arch stones → stop.
- Spandrel wall 10342–10345: `zTop = lerp(base+0.22, deckMid-0.06, f)` — the wall rises with each stone; `stoneBlock` with the two **end faces culled** (`ends` = |n·u| > 0.5) so adjacent bays merge into one continuous wall; cap `#C6C3D2`; seed `x*17+y*5`.
- Arch opening 10347–10349: `archVoid` on each visible long face once `zTop - base > 0.34`.
- 10350: not finished → stop (so roadway/parapet only appear at full).
- Roadway 10352–10354: quad at `h-0.04`, `#B9B6C7 ×1.03`, outline `#8E8AA0` α0.35.
- Parapet 10355–10357: per side a `stoneBlock` from `W` to `W-0.11` wide, top `deckMid+0.17`, bottom `deckMid-0.06`, cap `#CCC9D8`, ends culled.

**`drawStoneAbutment(b,ti)`** — 10360–10380. Like `drawAbutment` but squat masonry: needs one `arch` stone on the end tile while building (10366); `W = 0.42`; `f0 = max(f1-ov+0.04, 0.16)` (10368); block top `h0-0.05`, bottom `min(eLerp-0.05, waterline-0.10)`, back face culled, cap `#C6C3D2` (10371); roadway from `f0-0.06` to `0.5` at `h-0.04` (10373–10374); parapet when done or `stc('parapet')>=1`: `W..W-0.10`, top `deckMid+0.20`, bottom `h0-0.05`, cap `#CCC9D8`, no face culling (10375–10379).

### 3.5 The rope bridge

**`drawRopeTile(b,ti,isEnd)`** — 10384–10426. `anchors = b.stc.anchor` (4 when done), `ropes = b.stc.rope` (2 when done) (10387). `HW = 0.26` half-width, `RH = 0.30` hand-rope height. **Sway** (10389): `sin(now*0.0013 + k*0.55) * W.wind*0.07 * sin(π(k+0.5)/L)` tiles — up to 0.07 tile lateral at full wind, zero at the ends.
- End tiles 10391–10404: near end shows `min(2, anchors)` anchors, far end `anchors-2` (so the plan lays the near anchors first). Each anchor: cobbled block half-size 0.14 at `±HW*1.2` across, top `ground+0.24`, bottom `ground-0.05` (10397–10400); once a rope is laid, a post `#A38C7C` width `max(1, s*0.07)` up `RH+0.16` with a knob (10401–10402).
- Mid tiles 10405–10425: `h = b.decks[k]`; neighbours fall back to `b.ha`/`b.hb` (bank heights) at the ends (10406). `plank = laidOn('plank')` or 1. Four ropes once `ropes>=1`: hand ropes at `±HW, +RH`, foot ropes at `±0.8HW, +0` — `#B39A86` width `max(0.6, s*0.035)` (10409–10414), offset by the interpolated sway. Three slats at `f = −0.31, 0, 0.31`, half-length 0.10 (10416–10422): underside `#8E7A6C` 0.04 below, top `#D3BBA1 ×1.03`, outline. Cords from the centre slat's ends up to the hand ropes `#B39A86` α0.85 (10424).

### 3.6 The dam

**`drawDamTile(b,ti,isEnd)`** — 10431–10441. End tiles draw only the overhang stretch into the bank (`−0.5−ov..−0.5` for the near end, `0.5..0.5+ov` for the far end) with end grain showing (`e0`/`e1`) — "drawn with the bank tile, so the bank's ground never paints over it" (10434–10437). Mid tiles draw `−0.5..0.5`.

**`damStretch(b,ti,f0,f1,e0,e1,k)`** — 10445–10490. One stretch of wall.
- 10447: `bedN = laidOn('dambed')` or 2; `logN = laidOn('damlog')` or `BT.dam.w` (5). No bed → nothing.
- 10451: downstream side = the side whose `surf()` (695) is lower; `px,py` flipped to point downstream.
- 10452: `closed = DAM[i]===1` (the dam holds water, set by the sim); `ext` = this is an overhang stretch.
- 10453–10455: `base = min(E[i], both neighbour surfaces) − 0.45`; `topFull = (closed ? max(E,b.wall) : max(E+wetD, b.wall)) + 0.30`; `zBed = base+0.22`; `HW = 0.24`.
- Stone bed 10458–10460: `stoneBlock` from `base` (or following the bank on the overhang) to `zBed`; `skip` culls the end faces unless `e0/e1` ask for them and the **upstream** face when closed (it is under water).
- Log crib 10462–10465: 4 courses, course height `cH = (topFull−zBed)/4`, log half-width `min(0.22, cH/1.1)`; while building `rows = max(1, round(4*logN/5))` (1,2,2,3,4 logs → rows), all 4 when closed; each course steps `(3−c)*0.05` downstream so the face batters; colours alternate `#CDB08F`/`#D6BC9C`.
- 10466: not closed → stop (no walk, no spillway).
- Plank walk 10468–10472: half-width `0.16` at `top+0.02`, `#D3BBA1 ×1.04`, cross-lines every 0.25 tile.
- End post 10474: at `f0+0.06`/`f1−0.06`, height 0.30, both walk edges.
- Spillway 10478–10489: only on the middle tile (`k === L>>1`), not on an overhang, when `WD[i] > 0.03 || FLOW[i] > 0.2`, and only when the downstream face is visible. Sheet `#BEDEF0` α0.62 via `GC` (v9.18: so it dims at night) from `top+0.03` down to `zf = max(downstream surface, base)+0.02` over `±0.28` along; four white streaks animated with `ph = now*0.004`; a foam ellipse `s*0.30 × s*0.10` `#F0F8FC` α0.6; three rising bubbles.

### 3.7 Single-site structures

**`drawWheel(b,p,s)`** — 10494–10565 (build type `wheel`, "Waterwheel", BT 2432: w8 s2 work30). Called from 7846 (building) and 7895 (done). Stages read with `stc`: `base` ≤2, `frame` ≤3, `rim` ≤3, `paddle` ≤2 (10496). Nothing until a base stone is laid.
- Water side 10499–10500: the 4-neighbour with the most `wetD`; if the best has `< 0.12` depth, default `(0,−1)`.
- House 10502–10504: half-size `HX = 0.34`, shifted 0.06 away from the water. Footing top `zf = z + 0.18*min(1, base/2)` (10506).
- Wheel level 10508–10510: `wz = clamp(waterline + RV − 0.06, z−0.36, z+0.14)` with `RV = 0.32` (vertical radius, levels), `RH = 0.58` (radius in tiles).
- 10513: `wheelBehind = !faceVis(wx,wy,0)` — when the water side faces away the wheel is drawn first and the house covers it (10539 / 10564).
- `wheel()` closure 10514–10539: axle from the wall to a hub 0.30 past the wall; `a0 = b.spin` (incremented by the sim at 5792: `+dt*1.4` while flow > 0.05); `TH2 = 0.09` half-thickness; `nS = 8` paddles; `span` = full circle when ≥2 rim stages, else 1.1π (a part-built rim); paddles only when `pd ≥ 1` (4 of 8 at stage 1), each lit by its angle against `SUNL` (10524) `#C9AB8C`; near and far rim `#A38C7C` width `max(0.8, s*0.05)`; spokes when `rim ≥ 2` (4, or 8 at stage 3) `#B39A86`; hub `#6E5E52`; **splash** when done, spinning, dipping (`wl > wz−RV+0.02`) with `vchance(0.05)` per frame.
- Footing 10541: `stoneBlock` down to `min(eLerp−0.05, wz−0.15)`.
- Walls 10544–10553: `wallH = 0.62*min(1, fr/2)`, 1 course at frame 1, 2 at ≥2, `cH = 0.31`; each visible wall gets three bands (log colour, a darker lower third `#B8987A`, a highlight `#E6D0B3`) and a seam; `logEnd` (6993) at the corners, alternating by course.
- Door 10556: at frame ≥2 on the side away from the water, `#6E5E52` width `max(1, s*0.11)`, 0.42 tall.
- Roof 10558–10563: at frame ≥3, ridge `zt+0.42`, overhang 0.10, slopes `#B49BB6`/`#A98FA8`, 3 shingle lines, snow cap `#EEF2F6` α0.8 when `snowOn(z)` (7970), gable ends `#CDB08F`, ridge beam.
- `p` is unused.

**`trapDir(b)`** — 10569. Direction to the wettest 4-neighbour, default `[0,1]`. Also used by the painter at 9694 to place the trap's sort anchor 0.8 tile into the water.

**`drawTrap(b,p,s)`** — 10570–10614 (BT `trap` 2420: w1 f3 work10). `st = stc('stake')`, `wv = min(3, stc('weave'))`; nothing until the stake. Water level `wl = max(E[nj]+wetD(nj), E[i]−0.6)` (10575). Mouth 0.62 tile toward the water (10577). Stakes at `±0.21`, `#A38C7C` width `max(0.8, s*0.05)` from `wl−0.12` to `wl+0.18` (10580–10581); line back to a peg 0.2 tile out `#C9B98D` α0.8 (10582–10583). Basket when woven: `len = 0.2 + 0.42*(wv/3)`, `RM = 0.21`, `RV = 0.1155`, tip factor 0.3 (10586); silhouette `#CDBB8E`, underside `#B7A578`, hoops (`wv*2+1`, skipped under 0.6 px) and 3 ribs `#8E7A5C` α0.55; dark mouth `#6E6250` α0.85 when facing the viewer; float at the tip when `wv ≥ 3`; **catch**: when done and `b.stock ≥ 2` (stock grows at 5773: `+dt/45` to a cap of 3, halved in winter), two bobbing fish `#9FBCD2`. `p` unused.

**`drawFireStones(p,s,n,b)`** — 10618–10627. Without `b` (preview/ghost use): `n` flat screen-space stones `#A9A7B6` r `s*0.075` on a half-arc. With `b`: ring radius `0.30`, `m = min(7, n>=5?7 : n>=3?4 : 2)` stones (callers pass 3 or 5: 7975, 7875), 7-colour grey palette, each with a shadow ellipse, the stone and a highlight; size `0.075+0.02*h01()` × `TW*cam.z`.

**`drawFireLogs(p,s,n,b)`** — 10628–10634. Without `b`: up to 3 screen-space strokes. With `b`: up to 3 `logRib`s hw `0.055` at fixed offsets, stacked `z + 0.04 + {0, 0.05, 0.10}`.

**`drawLogSet(L)`** — 10636–10640 (v9.20). Painter's-order helper for a set of `{x0,y0,x1,y1,z,hw,col}` logs: computes screen depth `d`, sorts by `z` (0.004 tolerance) then `d`, draws each with both end grains. Also used by the hauling-cart loads at 8025.

**`drawPileLogs(b,p,s,n,snw)`** — 10646–10663 (v9.20 woodpile, BT `pile`). `rot` 0–3 rotates the local frame (10648). Sizes: log hw `0.068`, layer step `rv*1.95`, half-length `HL=0.25`, crib offset `CU=0.355`, crib log hw `0.036`. `rows = ceil(n/3)` (callers: `stc('log')` while building at 7841; `clamp(round(store.wood/2), 1, 9)` when done at 7893 — **the pile's size shows the village wood stock**). Two sleepers at `±0.2`, logs in rows of three at `v = −0.13, 0, 0.13`, alternating colours; at `n ≥ 2` a crossed crib at each end with `rows*2` layers alternating along/across (10656–10659). Draw order far crib → middle → near crib by screen y (10660–10662). Snow on the top row when `sn > 0.2` (`sn = snw` or `max(T.cold if > 0.4, W.snow*0.8)`), `#EEF2F6` with alpha ramp `(sn−0.2)/0.5`.

**`drawRack(b)`** — 10665–10681 (BT `rack`, drying rack, w4 f2 work15). Height `0.62`; stages `post` ≤2, `bar` ≤2, `line` ≤2. Posts at `x±0.36` `#B39A86` width `max(0.8, cam.z*1.6)`; bars `logRib` hw 0.035 at `h` and 0.03 at `0.6h`. Lines: while building `nL`; when done `clamp(round(store.food/3), 0, 5)` — **the rack shows the village food stock** as hung fish (`#A9C4D6`/`#9FBCD2`), spaced 0.13 from `−0.26`. v9.17 harvest-supper garland (10677–10680) when `b.feast === T.day` (set at 4999 on a harvest feast) and `s > 8`: 9-point sag 0.16 in `#6F9A6A`, alternating `AUTUMN` leaves and `#E07A7A` apples.

---

## 4. Concrete rules and tuning numbers (consolidated)

**Weather**
- Rain shows above `W.rain 0.06`; snow above `W.snow 0.06`; flash above `0.02`.
- Rain density 95 drops at 390×800 per unit rain; snow 120 flakes. Both scale with canvas area.
- Rain speed 460–700 px/s; streak 5–9 px (×zoom clamp 0.7–1.4); alpha 0.13–0.28; slant `−wind×(7..13)`.
- Snow fall 24–54 px/s, sway ±12–22 px, radius 0.9–2.2 px; drift `wind×14` px/s.
- Lightning flash max alpha 0.38.

**Decks and bridges**
- Deck half-width 0.40 tile (rails at 0.42); logs hw 0.125 at ±0.265; stringers hw 0.09 at ±0.29; boards every 0.19 tile; rail height 0.30, rope at 55% of it.
- Log bridge: 3 deck logs per tile (`BT.logbridge.w=3`); lashing after the 3rd. Plank bridge: 3 planks + 1 rail per tile; 9 boards when complete else 2 per plank laid. Piers: 2 stone steps; half-height until both laid.
- Overhang onto each bank: 0.60 tile (0.85 max, for ≥8.5 wet tiles).
- Log→plank upgrade (outside range, 3329–3335): a finished log bridge with ≥40 uses gets a plank upgrade; this section overlays its planks/rails on the logs.
- Pier wet line when the water is ≥0.05 below the pier top.

**Stone bridge**
- 1 centring + 4 arch stones + 1 parapet per bay (`BT.stonebridge` w1 s4 work26). Wall height lerps from `base+0.22` to `deck−0.06` with stones laid; arch opening appears once the wall is 0.34 tall; roadway and parapet only at 4/4. Arch springs at 40%, crown at 84%, profile `sin^0.55`.
- Parapet 0.11 wide, 0.23 tall (0.17 above the deck line).

**Rope bridge**
- 4 anchors (2 per end), 2 ropes, 1 plank per tile. Half-width 0.26, hand rope 0.30 up, foot ropes at 0.8× width. Sway amplitude `0.07×wind` tiles, period ≈4.8 s (`now*0.0013`), phase 0.55 rad per tile, zero at the ends. 3 slats per tile.

**Dam**
- 2 bed stones + 5 logs per tile (`BT.dam` w5 s2 work20). Bed from `min(E, surfaces)−0.45` to `+0.22`; 4 log courses up to `max(E or water, b.wall)+0.30`; rows while building `round(4·logs/5)`; courses batter 0.05 tile per course downstream. Walk half-width 0.16, cross-lines every 0.25. Spillway only on the middle tile, when `WD>0.03` or `FLOW>0.2`, seen from downstream; animation `now*0.004`.

**Waterwheel**
- Stages base 2, frame 3, rim 3, paddles 2. House half-size 0.34, footing 0.18 tall, wall courses 0.31, roof ridge +0.42, overhang 0.10. Wheel radius 0.58 tile × 0.32 level, hung at `water+0.26` clamped to `[ground−0.36, ground+0.14]`; 8 paddles (4 at stage 1), rim arc 1.1π until stage 2, spokes 4/8 at stages 2/3. Splash 5% per frame when dipping and spinning.

**Fish trap**: stake then 3 weaves; basket 0.2–0.62 long, radius 0.21; catch shown at stock ≥ 2 (stock cap 3).
**Fire**: ring of 3 (stage 1) or 5→7 (stage 2) stones radius 0.30; 3 logs hw 0.055.
**Woodpile**: 3 logs per row, size tracks `store.wood/2` (1–9 logs) when done; snow over 0.2.
**Rack**: fish count = `store.food/3` (0–5); harvest garland on feast day.

---

## 5. UI elements, controls and input handling

None. This section has no DOM, no event listeners and no hit-testing. It is only called by the frame painter (`drawProp` 9542–9543 via the depth sorter, the building dispatcher 7836–7896, and the frame at 12051).

---

## 6. MODE 'creator' vs 'gnome'

No `MODE` reference inside the range. The only mode-aware neighbour is the call site: at 12050 `if(MODE==='gnome'&&PB.pick) drawGhost();` runs just before `drawWeather()` — i.e. the weather overlay is painted over the gnome-mode placement ghost too. Every construct here draws identically whoever ordered it; the visuals follow the plan's progress, not the player's role.

---

## 7. Progression / unlock / economy touched

- Builds reveal themselves stage by stage from `laidOn`/`stc` counts (plan built at 3839–3997 with `pc(material, kind, at, {ti,...})`). Materials per step: `wood`, `stone`, `fibre` (10% of the kit is the mapping of those steps to visible parts).
- Log bridge → plank bridge upgrade after 40 uses (3329–3335); drawn here via `b.upProj`.
- The dam is "closed" (`DAM[i]===1`, set by the sim) before the walk and spillway appear.
- Fish trap `stock` accrues over time (5773); rack fish count and woodpile size are **live readouts of `store.food` and `store.wood`**, so the village's stock is visible in the world.
- Feast dressing: rack garland on the harvest feast day (4999 sets `h.feast`).

---

## 8. Persistence

None written. Reads saved build fields: `b.type, b.tiles, b.ends, b.ux/uy, b.deck, b.decks, b.ha/hb, b.piers, b.wall, b.wx/wy, b.plan, b.pi, b.stc, b.done, b.upProj, b.spin, b.stock, b.feast, b.rot, b.z0, b.x/y`. The `b.decks ? ... : b.deck` guards (10212, 10267, 10319, 10367) suggest older saves without per-tile deck heights; line 10275 lacks that guard (see §10).

---

## 9. Mobile / touch / performance tricks

- Weather particle counts are normalised to a **390×800** reference (a phone in portrait) — a clear sign of the target device.
- Zoom influence is clamped (`0.7–1.4` rain, `0.7–1.5` snow) so streaks neither vanish nor balloon.
- Every line width has a floor (`max(0.4..1, k*cam.z)`) so hairlines survive at low zoom and high DPR.
- Sub-pixel culling: end grain skipped under 0.7 px (10155), weave hoops under 0.6 px (10601, 10607), garland only when `s > 8` (10677).
- Rain is batched: all drops of a pass in one `beginPath/stroke`. Snow is **not** batched (one `fill` per flake, up to ~120+ per frame on large canvases).
- Back-face and buried-face culling (`faceVis`, `skip`) halves the masonry work; adjacent stone-bridge bays cull their shared end faces.
- All weather positions are hashed from index+time: zero allocation, zero per-particle state, trivially resumable.
- No touch handling here.

---

## 10. Oddities, bugs, dead code, TODOs

1. **Orphan comment** 10615–10616: "stone steps cut into a slope: three risers a tile…" — no function follows; the steps renderer lives elsewhere (or was removed). Dead comment.
2. **Unused parameters**: `archVoid(...seed)` 10298; `drawPier(...k...)` 10239; `drawWheel(b,p,s)` `p` 10494; `drawTrap(b,p,s)` `p` 10570; `drawPileLogs(b,p,s,n,snw)` `p` 10646.
3. **`spanOver` comment vs code** (10232–10237): the formula's lower clamp 0.60 dominates for every span under 6 wet tiles, so the "tenth of the span" part is effectively dead for normal bridges. Fine, but misleading.
4. **Unguarded `b.decks`** at 10275 (`b.decks[k-1]`) and 10405 (`b.decks[k]`) while 10267/10319/10367 guard it — an old save of a log/plank bridge without `decks` would throw on a mid tile but not on its ends.
5. **Draw-time side effect**: `drawWheel` spawns particles (10538) at 5% per *frame*, so splash rate depends on frame rate, not sim time; and it only happens while the wheel is on screen.
6. **Name shadowing**: `lashing(... W ...)` 10164, `deckPlanks` `W=DECK_HW` 10181, `drawStoneTile` `W=0.40` 10326, `drawStoneAbutment` 10368 shadow the global weather `W`; `drawPileLogs` `cw=0.036` 10648 shadows the global canvas width `cw`. Harmless but hazardous for future edits (adding a `W.wind` read inside those functions would silently break).
7. `drawFireStones`: `min(7, n>=5?7:...)` 10620 is redundant; `n` is only ever 3 or 5.
8. `drawRopeTile` 10418: `A` and `B` are computed, then the underside quad recomputes the same two points inline at `hh−0.04` — small duplication.
9. `drawStoneTile` keeps the centring up until `f ≥ 0.999` (all 4 stones), while the comment (10329) says it is "taken down as the stones close" — it is removed in one step at the end, not gradually.
10. `ctx.lineCap` is set to `'round'` or `'butt'` in many places and never restored; later draws inherit whatever was last set.
11. The rain's horizon test uses the screen y of the *sea* horizon (`horizonY()`), so rain is clipped above the island even when the view is tilted — intentional ("none above the horizon").
12. No TODO/FIXME markers in the range; version notes (v9.14–v9.20) document design reversals ("Jed wants none", "log piles that are circles look weird").

---

## 11. i18n (en/es)

Nothing in this range is user-facing text. Build labels (`BT.*.label`, 2411+) are English only and live outside the range; the only Spanish dictionary in the file is the intro screen at 12203 (`es:{h:'Aldea de Gnomos', ...}`, `lang` at 12206). Any new structure names for Parque D'Amour would need a label table keyed by language rather than a bare `label:`.

---

## 12. Reusable engine vs gnome-specific content

### Reusable as-is (engine/shell)
- **`drawWeather`** 10062–10105 — rain/snow/lightning overlay for any isometric scene; depends only on `W.{rain,snow,wind,flash}`, `cam.z`, `cw/chh/now`, `nzAt`, `horizonY`. A Paris park in the rain is exactly this.
- **Masonry kit** `stoneFace`/`stoneBlock` 10118–10130 — any block of stone with terrain-following bottoms and face culling: fountain basins, balustrades, kerbs, pavilion plinths, steps.
- **Timber kit** `logRib`/`grainAt`/`drawLogSet` 10136–10161, 10636–10640 — round beams with end grain: pergola rafters, bench slats (with a smaller hw), boat ribs.
- **Deck kit** `deckLogs`/`deckPlanks`/`deckRails`/`lashing` 10164–10201 — boardwalks, jetties and wooden footbridges over a pond.
- **Span-tile architecture** `drawSpanTile` dispatcher 10260–10289 + the per-tile queuing contract (prop kinds 7/14 at 9688–9689, `b.tiles`, `b.ends`, `b.decks`) — the pattern for any multi-tile linear structure (an allée of lamp posts, a hedge, a canal wall, a pergola).
- **Stone arch bridge** `archVoid`/`drawStoneTile`/`drawStoneAbutment` 10298–10380 — a stone arch bridge over the park lake is the single most on-theme reuse; only the palette (grey-lilac cobbles → cream dressed stone) needs changing.
- **`drawPier`**, **`spanOver`** 10237–10247 — generic.
- **Staged-construction convention** (`laidOn`/`stc` → how much to draw) — reusable for a Creator mode where gardeners build what the player places.
- **Perf conventions** — 390×800 normalisation, zoom clamps, line-width floors, sub-pixel culling.

### Reusable with re-skinning
- `drawRopeTile` 10384–10426 — sway logic is a nice template for anything that moves in the wind (bunting, hanging lanterns, a swing); the rope bridge itself is unlikely in a park.
- `damStretch` spillway block 10478–10489 — the animated water sheet, streaks, foam and bubbles are a ready-made **fountain / weir** effect.
- `drawWheel` 10494–10565 — the rotating ellipse-in-perspective (`pt(th,f,off)`) is reusable for a carousel, a mill, a Ferris wheel, a bicycle; the log house around it is gnome-specific.
- `drawPileLogs`/`drawRack` — the idea of a prop whose size shows a stock level (`store.wood`, `store.food`) is worth keeping (e.g. a flower stall whose display shows flowers in stock).

### Gnome-specific content (replace)
- Log dam (`drawDamTile`/`damStretch` 10431–10490) — tied to `DAM`, `FLOW`, `b.wall` and the river sim.
- Fish trap (`trapDir`/`drawTrap` 10569–10614) — fishing economy.
- Campfire (`drawFireStones`/`drawFireLogs` 10618–10634), woodpile, drying rack with hung fish and harvest garland, flood bank stakes (`drawBankTile` 10250–10259).
- The whole material vocabulary: cobbled grey-lilac stone (`#A8A4B6`, `#BDBACB`), rough round logs (`#C9AB8C` family), rope and withy. A French park wants dressed stone, painted iron railings, gravel, clipped hedges, green slatted benches, lamp posts — a new primitive set (`ironRail`, `balustrade`, `hedgeBlock`, `gravelPath`) built on the same `wp`/`faceVis`/`faceLight`/`shade` foundations.
- Every hard-coded hex colour (there are ~60 in the range) — no palette table exists; a port should centralise one.

---

## 13. Design questions for the Parque D'Amour port raised by this section

1. **Weather as a mechanic**: rain/snow/lightning exist visually and dim the light. Does weather affect the romance (sheltering under the bandstand, sharing an umbrella = assist; a downpour on a picnic = sabotage)? Can the Creator set the weather, or is it the sim's?
2. **Is there water?** A lake, canal or stream decides whether the entire bridge/pier/abutment/spillway kit is used. If yes: which bridge styles (stone arch, wooden footbridge, an iron bridge with love-locks)? Rowing boats (the file has `drawBoat` at 9540)?
3. **Material and palette vocabulary**: what are the park's three or four "materials" (dressed stone, painted iron, timber, gravel/hedge)? Each needs a primitive like `stoneBlock`/`logRib`, and the build steps (`pc(material, kind, ...)`) need a material list that replaces wood/stone/fibre.
4. **Staged construction or instant placement?** In Creator mode, does a placed gazebo appear whole, or do gardeners build it stage by stage as here (base → frame → roof)? If staged, each object needs its stage list and a drawing that reads partial counts.
5. **Multi-tile linear structures**: which park features are tile-runs (hedges, balustrades, allées, pergolas, canal walls)? They should adopt the `tiles[]`/`ends[]`/`decks[]` contract and the 7/14 prop-kind queuing so the painter sorts them per tile.
6. **Animated features**: here `now` and `W.wind` animate sway, spin, spillway. Which park features animate — fountain jets (reuse the spillway), carousel (reuse the wheel ellipse), flags/bunting (reuse rope sway), lamp flicker?
7. **Upgrade paths**: the log bridge earns planks after 40 crossings. Park equivalents: a bench gains a plaque after N shared moments; a bridge collects love-locks per couple that crosses; does sabotage *reverse* upgrades?
8. **Seasonal / event dressing**: harvest garland, snow caps, bonfire night exist. Park: Bastille Day lanterns, Valentine's bunting, autumn leaves on the gravel, Christmas lights? Which `T.day`/festival hooks drive them?
9. **Economy readouts in the world**: woodpile and rack sizes show `store.wood`/`store.food`. What does the park economy consist of (francs, flowers, bread, wine, "charm"), and which props should display it?
10. **Damage and sabotage visuals**: `W.tookBridge` exists (3327) — storms can take a bridge. Does the sabotage mode need visible broken states (missing plank, toppled rail, dry fountain), and are they modelled as plan steps un-done or as a separate `damage` field?
11. **Avatar mode and walkable surfaces**: `b.decks[]` gives per-tile heights the walkers use. In avatar mode can the avatar sit on benches, stand on the bandstand, row a boat? Each needs a stand/sit anchor like the trap's `standAt`.
12. **Target device and density**: the 390×800 reference and zoom range 0.7–1.5 encode a phone-first design. Same for the park? If desktop-first, the snow loop (unbatched arcs) and per-tile masonry may want batching.
13. **Colour system**: ~60 inline hex colours per section. Should the port define a palette object (stone, iron, timber, foliage, water) once, with `shade()` applied, so the park can have a day/night and seasonal re-tint without touching every function?
14. **Lighting contract**: everything is lit by `faceLight` against a fixed `SUNL` vector and `GC()` for night. Does the park need a moving sun (long evening shadows for romance scenes) — which would make `faceLight` time-dependent?
15. **Localisation**: labels are English-only `label:` strings. The park (French setting, en/es/fr?) needs a label table from day one.
