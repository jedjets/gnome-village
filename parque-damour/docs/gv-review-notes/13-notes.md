# Gnome Village review — section 13: lines 6330-6951
## Camera & projection, palette, sky/sea/horizon, ground colour, props

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Range read in full: 6330-6951 (622 lines). Sub-headers in the source: `camera & projection` (6330), `palette (the original one)` (6444), `sky, sea, horizon` (6479), `ground colour` (6619), `props` (6742). The next section (`buildings`) starts at 6952.

---

## 1. Purpose

This is the first half of the **renderer**: everything between "the simulation's numbers" and "pixels on a 2D canvas", excluding the island tile/water drawing itself (`drawIsland`, ~9578+), buildings (6952+) and characters.

1. **Camera & projection** (6330-6443): an isometric (2:1 diamond) projection of an N×N tile grid that can be **rotated by any angle about the island's centre**, zoomed and panned. Provides world→screen (`screenOf`), screen→tile picking (`screenToTile`), the painter's back-to-front tile order (`tileOrder`, a counting sort), a 2-level LOD switch (`lodCS`), fit-to-island and clamp logic, and per-frame projection of all ground/water vertices into typed arrays.
2. **Palette & lighting** (6444-6478): the fixed pastel palette `C`, the time-of-day ambient (`AM`, `AT`, `AA`, `FOGA`) computed once per frame, `lit()` to apply it to any RGB triple, and a memoised CSS-colour cache `GC()`.
3. **Sky / sea / horizon** (6479-6618): a 9-keyframe day-cycle sky ramp, stars, sun/moon, fair-weather clouds, a storm bank, the open-sea gradient below the island's horizon with a far shore; painted into an offscreen bitmap a few times a second and blitted.
4. **Ground colour** (6619-6741): `groundCol(i,x,y,hm,slope)` — the big per-tile colour function: ~20 layered blends from height, slope, soil, sand, material, wetness, seepage, hollows, AO, banks, wet sand, mine pits, prepared/trodden ground, fire-yard, snow line, and two layers of value noise.
5. **Props** (6742-6951): seasonal tree phenology (`crownPhase`, `foliageCol`), a tree **sprite cache** keyed by zoom bucket/season/light/snow, and the draw routines for trees, stumps, bushes, rocks, flowers, ground cover (tufts/clover/pebbles) and survey marks.

Nothing in this section is gameplay logic; it is read-only with respect to the simulation (it reads `T`, `W`, `E`, `MAT`, `builds`, etc., and never writes them).

---

## 2. External symbols this section depends on (resolved outside the range)

| Symbol | Where | Value / meaning |
|---|---|---|
| `S` | 567 | `2` — fine tiles per old "v7" tile |
| `N, NC, NV` | 568 | `N=36*S=72`, `NC=5184`, `NV=73` (vertices per side) |
| `TW, TH, EH` | 569 | tile width `52/S=26px`, tile depth `26/S=13px`, one height level `26px` — all at zoom 1 |
| `EMAX, SEA, SEAS` | 570-571 | max level 9, sea level 2.0, sea **surface** 2.5 |
| `DAYLEN, SEASON_DAYS` | 573 | 210 real seconds per day, 3 days per season |
| `TAU` | 582 | 2π |
| `clamp, clamp01` | 578-579 | numeric clamps |
| `vrnd` | 595 | visual RNG (separate stream from sim `rnd`) |
| `hx, mixc, css` | 607-609 | hex→[r,g,b], lerp of triples, triple→`rgb()`/`rgba()` string |
| `E, WD, SOIL, WEAR, MAT, PREP, TROD, PAVE, OCC, SAND` | 612-665 | per-tile Float32/Uint8 fields |
| `MEA,GRS,SCR,ROK,SNW,SND,WAT` | 671 | material enum 0..6 (meadow, grass, scree, rock, snow, sand, water) |
| `I(x,y), VI(x,y)` | 672, 702 | tile index / vertex index |
| `wetD(i)` | 677 | `WD[i]` standing water depth |
| `V, VW` | 699-700 | ground / water surface height at vertices |
| `eLerp(fx,fy)` | 790 | bilinear ground height at a fractional position |
| `T` | 814 | time: `abs,f(0..1 of day),day,season(0..3),light(0..1),speed,cold(0..1),thaw,ds(day-in-season+f)` |
| `W` | 845 | weather: `kind,cloud,rain,mist,snow,wind,drift,front(-1 or 0..2),...` |
| `world` | 883 | `{seed,name,...}` |
| `builds` | 1690 | buildings array (used for `type==='fire'`) |
| `MINEB, MINEZ` | 2996-2997 | mine-pit tiles and pit floor level |
| `AO, HM` | 8942 | ambient-occlusion field and smoothed heightmap |
| `DBG` | 12041 | debug flags (`shadows:false`, `trees`, `flowers`, `cover`...) |
| `pinch` | 11166 | non-null while a two-finger gesture is live |
| `MODE` | 5630 | `'creator'` or `'gnome'` — **not referenced anywhere in this section** |

Prop object shapes consumed here (created elsewhere): tree `{x,y,sp:'round'|'pine'|'birch',age,sd(float 0..1000),h(30..64),lean,blobs[],branches[],twigs[],form,fall,fallDir,shake,marked}` (1692-1727); bush `{x,y,b(berries),re,sc(.85..1.15),marked}` (1748); rock `{x,y,r(0.7..1.4),sd,marked}` (1739-1741); flower `{x,y,c(hex),n(2..4),sd}` (1007); cover `{x,y,k(0 tuft|1 clover|2 pebble),sd,sc(0.8..1.25)}` (1018); mark `{x,y,t,sd}` (1663, 4666 — capped at 60).

---

## 3. State: globals defined or mutated in this section

| Name | Line | Type / shape | Notes |
|---|---|---|---|
| `cvs, ctx` | 6331 | HTMLCanvasElement, 2D context | set in `initRender` 6334 |
| `cw, chh` | 6331 | number px (CSS pixels) | defaults 390×800 (phone portrait); set in `resize` 6337 |
| `dpr` | 6331 | number | `min(devicePixelRatio,2)` at 6336 |
| `now` | 6331 | number ms | declared here; advanced by the main loop elsewhere |
| `VANCH` | 6332 | const 0.46 | vertical anchor: sea level of tile (N-1)/2 sits at 46% of screen height |
| `cam` | 6333 | `{ox,oy,z,fitZ,ang,angT,follow,free}` (+`turnKeep` added by input code 12147) | ox/oy pan px, z zoom, fitZ the fit-to-island zoom, ang current/angT target rotation, follow a gnome or null, free = user has left the fit view |
| `CTR` | 6343 | const 35.5 | rotation centre (tile coords) |
| `rotC, rotS` | 6344 | numbers | cos/sin of `cam.ang`, refreshed by `setAngle` 6345 |
| `ORDER, ORDIDX, DEPTH` | 6359 | Int32Array(NC)×2, Float32Array(NC) | fine back-to-front order, inverse index, depth |
| `NL, NLC` | 6360 | 36, 1296 | coarse (2×2) grid size |
| `ORDER2, ORDIDX2, DEPTH2` | 6361 | same for coarse grid | |
| `orderDirty` | 6362 | bool | set true by `setAngle`; cleared in `tileOrder` 6376 |
| `LOD_PX` | 6363 | const 15 | tile pixel width below which the coarse grid is drawn |
| `OB, OK` | 6367 | Int32Array(2*N*64+8=9224), Int32Array(NC) | counting-sort buckets / key per item |
| `SVX, SVY, SWY` | 6416 | Float32Array(NV*NV) | screen x, ground screen y, water screen y per vertex (refreshed by `projectVerts` each frame) |
| `C` | 6445-6448 | object of 23 RGB triples | the palette (see §5.3) |
| `FOGC` | 6449 | [226,232,238] | fog/haze colour |
| `AM` | 6450 | [r,g,b] multipliers | ambient light; written in `computeAmbient` 6454-6457 |
| `AT` | 6450 | [r,g,b] | warm tint target (dawn/dusk); written 6460 |
| `AA` | 6450 | 0..~0.22 | warm tint amount; written 6459 |
| `FOGA` | 6450 | 0..1 | fog amount; written 6461 |
| `SUNL` | 6450-6451 | unit vector | sun direction (-0.50,-0.30,0.82) normalised once |
| `gcache` | 6470 | plain object | memo of lit CSS colours; flushed when >900 keys (6475) |
| `SKYR` | 6480-6488 | array of 9 `{f,t,b}` | sky keyframes (day fraction, top hex, bottom hex) |
| `NIGHTC` | 6493 | [44,50,82] | night water tint; **reassigned to `rampSky()[0]` in `drawIsland` 9587** |
| `WHITE_LIT` | 6493 | [255,255,255] | lit white; **reassigned to `lit([255,255,255])` at 9587** |
| `stars` | 6496 | array of 70 `{x,y,s,p}` | filled in `initBackdrop` 6498 |
| `clouds` | 6496 | array of 10 `{x,y,s,o,v}` | filled 6499 |
| `SEA_T, SEA_M, SEA_B` | 6516 | RGB triples | sea plane gradient top/mid/bottom |
| `skyC, skyG` | 6524 | offscreen canvas + ctx | created in `initRender` 6334 |
| `skyAt, skyKey` | 6524 | ms, string | backdrop bitmap cache stamp |
| `YARD_X, YARD_Y, YARD_R, YARD_R2` | 6623 | numbers | fire-yard centre, radius 2.6 tiles, radius² (0 = no fire) |
| `NZN, NZ` | 6629-6630 | 32, Float32Array(1024) | value-noise lattice, seeded LCG 1337 (deterministic, not from world seed) |
| `TRUNK` | 6743 | `{round,pine,birch}` hex | trunk colours |
| `TS` | 6744 | const 0.42 | tree px per height unit at zoom 1 |
| `AUTUMN` | 6765 | 4 hex | autumn foliage choices |
| `sprCache, sprN` | 6780 | Map, counter | tree sprite cache; cleared wholesale when >1400 (6832) |
| `curOrd` | 6836 | number | written at 9947 (painter position); **never read** |
| `COVC, covcEp` | 6917 | object / number | ground-cover colours memo and its epoch |

Mutations of **outside** state by this section: `cam.*` (in `fitCam`, `clampCam`, `setAngle`, `turnStep`, `resize`), `orderDirty`, `cvs.width/height`, `skyC.width/height`. No simulation field is written.

---

## 4. Functions (every one in the range)

### 4.1 Camera & projection
| Function | Line | Signature | Does | Callers |
|---|---|---|---|---|
| `initRender` | 6334 | `()` | grabs `#cv`, 2D ctx, creates offscreen sky canvas | `boot` 12128 |
| `resize` | 6335 | `()` | dpr=min(DPR,2); cw/chh = window inner size; canvas backing size = CSS×dpr; if camera not free and an island exists → `fitCam()` else `clampCam()` | `boot` 12128 (and presumably a resize listener elsewhere) |
| `setAngle` | 6345 | `(a)` | sets `cam.ang`, cos/sin, marks tile order dirty | `newIsland` 12121, harness export 12227 |
| `rotXY` | 6346 | `(x,y)→[rx,ry]` | rotate tile coords about CTR by cam.ang | everywhere in render (e.g. 7221) |
| `invRot` | 6347 | `(rx,ry)→[x,y]` | inverse rotation | **no callers — dead code** |
| `rotVec` | 6348 | `(gx,gy)→[..]` | rotate a direction vector (no centre) | normals/face lighting 6958-6959, 7003, 7700, 9413... |
| `turnStep` | 6349 | `(dt)` | eases `cam.ang` toward `cam.angT`; snaps when |d|<0.0015; easing `1-0.0008^dt` for button turns (~half a second), `1-0.00002^dt` during a pinch (~a tenth) | main loop 12089 |
| `lodCS` | 6364 | `()→1|2` | cell size: 2 (coarse) when `TW*cam.z<15px`, i.e. cam.z<0.577 | `drawIsland` 9580, harness 12227 |
| `orderBy` | 6368 | `(n,depth,order,oidx)` | counting sort of depths into 1/64-tile buckets (`k=(depth*64+64)|0`), fills order & inverse index | `tileOrder` only |
| `tileOrder` | 6374 | `()` | if dirty: depth = rx+ry of each fine tile and of each 2×2 coarse cell centre `(x*2+0.5,y*2+0.5)`, then counting-sort both | `drawIsland` 9582, `screenToTile` 6425 |
| `sxOf` | 6382 | `(rx,ry)` | screen x = `cw/2+(rx-ry)*TW/2*z+ox` | in-range only |
| `syOf` | 6383 | `(rx,ry,e)` | screen y = `chh*0.46+((rx+ry)-(N-1))*TH/2*z-(e-SEAS)*EH*z+oy` — heights measured from the sea surface | in-range only |
| `screenOf` | 6384 | `(x,y,e)→{x,y}` | rotate then project; the universal world→screen | ~50 call sites (1641... 12227) |
| `landBox` | 6385 | `()→{a,b,c,d}` | projected bounding box (unzoomed) of all land tiles (`E>SEA`), including water top `max(E,E+wetD)`, padded TW/2 sideways, TH/2 up, TH*1.4 down; whole-map fallback if no land | `fitCam` |
| `fitCam` | 6400 | `()` | zoom so the land fits: `availW=max(120,cw-18)`, `availH=max(160,chh*0.58)`; `z=clamp(min(availW*1.16/w, availH/h),0.16,2.8)`; centre pan; stores `fitZ`; `clampCam()` | 12121, Fit button 12152 |
| `clampCam` | 6409 | `()` | `z∈[min(0.30,fitZ*0.85),3.0]`; pan limit `max(240,N*TW*z*0.56)` px each axis | follow/centre/input code: 10757, 10759, 10869, 10877, 11206, 11211, 11229, 11257, 11300, 11314, 11321 |
| `projectVerts` | 6417 | `()` | per frame: screen x/y of every ground vertex and of the water surface vertex (`V`, `VW`), vertex (vx,vy) sits at tile coords (vx-0.5,vy-0.5) | `drawIsland` 9581 |
| `screenToTile` | 6423 | `(sx,sy)→{x,y}|null` | picking: walks fine `ORDER` from nearest to farthest, tests the point against each tile's projected quad (using water top where `wetD>0.12`) | input 10785, 11176, 11184, 11213, 11272, 11305 |
| `ptInQuad` | 6436 | `(px,py,x0..y3)→bool` | even-odd point-in-polygon for 4 points | `screenToTile` |

### 4.2 Palette & lighting
| Function | Line | Signature | Does | Callers |
|---|---|---|---|---|
| `computeAmbient` | 6452 | `()` | `AM = mix([0.46,0.50,0.72],[1,1,1],light^0.7)`; cloud/storm dim `dim=cloud*0.12+cover*0.16` applied evenly (blue ×0.92 of dim); warm tint `AA=0.22*max(0.25,light)*warm` where warm peaks at f=0.26 and f=0.74 with half-width 0.11; `AT` = [255,204,162] before noon else [255,186,158]; `FOGA=mist*0.30+rain*0.03+snow*0.14` | `draw` 12043 (once per frame) |
| `lit` | 6465 | `(c)→[r,g,b]` | multiply by AM, then lerp toward AT by AA | ~25 sites outside (8260... 9885) + many inside |
| `GC` | 6471 | `(hexString, alpha?)→cssString` | memoised `css(lit(hx(h)),a)`; key `h|a|(AM[0]*100|0)(AA*100|0)`; whole cache dropped when >900 entries | ~200 sites across buildings/gnomes/UI (3213 ... 12010) |

### 4.3 Sky, sea, horizon
| Function | Line | Signature | Does | Callers |
|---|---|---|---|---|
| `nightW` | 6494 | `(c)` | mixes a water colour toward `NIGHTC` by `(1-light)*0.52` (skips <0.012) | water drawing 9319, 9354, 9360 + `seaPlaneCol`, `paintSky` |
| `wRGBA` | 6495 | `(a)→'rgba(...)'` | lit white with alpha (foam, rims, streaks) | 8437, 8439, 8604, 8620, 9332, 9531, 9533, 9927, 10017... |
| `initBackdrop` | 6497 | `()` | 70 stars (`x∈[0,1]`, `y∈[0,0.5]`, size 0.6-1.7, phase), 10 clouds (`x∈[0,1.6]`, `y∈[0.03,0.30]`, size 26-70, opacity .35-.85, speed .5-1.3), all from the **visual** RNG | `newIsland` 12114 |
| `rampSky` | 6501 | `()→[top,bottom]` | piecewise-linear interpolation of `SKYR` at `T.f` | `paintSky`, `drawIsland` 9587 (SHEEN, NIGHTC) |
| `horizonY` | 6511 | `()→px` | screen y of the farthest map corner at sea-surface height, minus TH/2*z; corrected for rotation (v9.9) | `paintSky`, `seaPlaneCol`, `drawSky` key, 9589, 10071 |
| `seaPlaneCol` | 6517 | `(sy)→[r,g,b]` | the sea-plane gradient colour at a screen y (0..0.35 top→mid, 0.35..1 mid→bottom, fog-mixed, night-mixed, lit) so sea tiles can blend seamlessly into the plane | 9326, 9381, 9834, 9883 |
| `drawSky` | 6525 | `()` | repaints the offscreen backdrop when size/dpr/horizon(÷6px) changes or every 260ms; blits it | `draw` 12046 |
| `paintSky` | 6535 | `(ctx)` | gradient sky (grey under cloud: `gr=cloud*0.35+cover*0.4` → top mixed to [132,140,160], bottom ×0.8 to [178,184,198]; fog mixed `FOGA*0.5/0.55`); stars when `light<0.42` (`na=1-light*2.4`), twinkle `0.35+0.4*(...)`, dimmed `1-cloud*0.8`; sun (`light>0.16`, r=17, `#FFEBC6`) or moon (r=12, `#EDF0FA`, crescent via destination-out) on an ellipse `(cw*0.5+sin(ang)*cw*0.62, chh*0.5-cos(ang)*chh*0.46)`, `ang=(f-0.25)*TAU`, glow radius 5.5r, glow alpha `1-cloud*0.55`; `drawClouds`; open sea below the horizon (gradient SEA_T/M/B at 0/0.35/1 from `y0=max(-40,yh)`), two sine-wave far-shore bands (amp 22 & 30, offsets -16 & -5, alpha 0.55), a pale horizon line `max(1,2*z)` px | `drawSky` |
| `drawClouds` | 6583 | `(ctx,skyB)` | storm bank when `W.front>=0`: 7 four-arc blobs centred at `off=(front-1)*cw*1.45`, spread `cw*1.2`, y `chh*(0.04+0.05*sin)`, size `cw*(0.30+0.08*sin)`, alpha .86, ends lighter; underside veil gradient to `chh*0.36`, alpha `0.55*cover`; then fair clouds if `cloud>=0.03`: colour = skyB mixed 50% white, parallax `-cam.ox*0.08`, `-cam.oy*0.05`, drift `W.drift*v*0.5`, wrap over `cw*1.6` shifted `-cw*0.3`, alpha `cloud*o*0.7`, four arcs | `paintSky` |

### 4.4 Ground colour
| Function | Line | Signature | Does | Callers |
|---|---|---|---|---|
| `snowLine` | 6621 | `()→level` | `7.9-T.cold*6.2` (7.9 in warm months, 1.7 ≈ shore in deep cold) | `snowAt`, 9944 |
| `snowAt` | 6622 | `(hm)→0..1` | `clamp01((hm-snowLine())/1.2+0.5)` — 1.2-level blend band | ground, trees, bushes, rocks, flowers, cover; 4757, 7841, 7893, 7970 |
| `yardRefresh` | 6624 | `()` | finds the first finished `type==='fire'` build; sets yard centre and `YARD_R2=6.76` else 0 | `drawIsland` 9587 (on colour epochs) |
| `nzAt` | 6631 | `(u,v)→0..1` | smoothstep-interpolated tiling value noise over the 32×32 lattice | `grain`, water/ribbon code 9330-10096 |
| `grain` | 6638 | `(x,y)→±~0.5` | two octaves: `(nz(0.16x)-.5)*0.72+(nz(0.46x+off)-.5)*0.28` | `groundCol`, 9347, 9877 |
| `fld` | 6647 | `(A,i,x,y)` | 9-tap neighbourhood blend of a per-tile field: self .36, edge .11, corner .05, renormalised at borders | `groundCol`, harness 12240 |
| `matAmt` | 6656 | `(i,x,y,m)→0..1` | same 9-tap weights, counting tiles whose `MAT===m` | `groundCol`, 12240 |
| `groundCol` | 6665 | `(i,x,y,hm,slope)→[r,g,b]` | the per-tile base colour (see §5.5 for the full rule list) | tile colouring 9417, 9439; harness probe 12240 |

### 4.5 Props
| Function | Line | Signature | Does | Callers |
|---|---|---|---|---|
| `crownPhase` | 6749 | `(t)→{ph,f}` | pine → `leaf`; `cold>0.62` or winter (season 3) → `bare`; spring: `ds<0.9` bud, `<1.9` blossom, else leafing (to 3.0); autumn `ds>2.0` → thin; else leaf | `treeSprite` |
| `foliageCol` | 6766 | `(t,ph)→hex` | pine `#8FBF9B` (`#8FB6A4` in winter); blossom birch `#CFE4A6`, round `#F4CBD8`/`#F8DCE4` by seed parity; bud/leafing `#CBE3A9`/`#C4E2B4`; autumn birch gold `AUTUMN[2]`, round `AUTUMN[(sd*7)%4]`; summer `#A5CF97`; spring `#B9DEAE` | `treeSprite` |
| `treeTint` | 6775 | `(t,c)` | per-tree lightness/warmth jitter ±10%/±5% from fractional parts of `sd*13`, `sd*29` | `treeSprite` |
| `fogMix` | 6776 | `(c,fog)` | mix toward FOGC when fog>0.01 | bush, rock (not tree) |
| `zoomBucket` | 6781 | `()` | `2^(round(log2(z)*8)/8)` — 8 zoom steps per octave | `treeSprite` |
| `treeSprite` | 6782 | `(t)→{c,w,h,base,zb}` | builds/caches an offscreen tree bitmap; key = `floor(sd)|sp|zoomBucket|ageBucket(0..10)|season|phase+round(f*3)|round(light*8)|round(AA*8)|snow(thirds)`; paints optional shadow (`DBG.shadows`), trunk (quadratic curve, width `max(1.4/Z,h*0.058)`), branches (`h*0.033`), twigs (`h*0.02`) + buds + snow on twigs when bare/thin, leaf blobs (dark base mixed 10% to [40,60,50]; highlight 62% radius offset (-0.22,-0.26) mixed 30% white, 45% in blossom), blossom dots (3 per blob, non-birch), snow caps (ellipse `r*(0.5+0.28*snow)`, aspect .55); scale by phase (leafing .55→1, blossom .72, thin 1→.55 with alpha 1→.45); evicts everything at 1400 entries | `drawTree` |
| `drawTree` | 6837 | `(t,p,fog)` | skip if `H<2.5px`; rotation = `lean*0.6` + fall (`min(1,fall)^1.6*fallDir*1.45` rad) + axe shake (420ms, `sin(dt*0.05)*0.05`) + wind sway (`wind>0.2 && z>0.55`: `(sin(now*.0011+ph)*.022+sin(now*.0031+2.1ph)*.007)*wind`); straight blit if |rot|<0.004 else translate/rotate/drawImage; **`fog` param unused** | prop dispatch 9548 (behind `DBG.trees`) |
| `drawStump` | 6851 | `(s,p)` | trunk-colour ellipse 3.2z×2.4z plus 6z×3.6z block; skip when `z*0.9<0.3` | 9551 |
| `drawBush` | 6862 | `(b,p,fog)` | `s=13*z*sc`, skip <1.5px; bare when `cold>0.6`; snow when bare or `snowAt>0.5` or `W.snow>0.45`; seasonal base/top colours (bare `#ADA39B/#C6BDB5`, autumn `#B89E6A/#D6C088`, spring `#84BA7E/#A8D49E`, else `#78AE74/#9ECD90`), per-bush tint from position; 3 lobes `[-0.30,-0.28,r.34],[0.30,-0.26,r.32],[0,-0.52,r.38]`, crowns at 58% radius when s>3, snow ellipses 74% radius; berries when `s>5 && b.b>0 && (!bare || b.b>1)`: colour `#C8556A` (bare/autumn) or `#D9607D`, count `bare?min(2,b):b`, radius `s*0.065/0.075` | 9548 |
| `drawRock` | 6886 | `(r,p,fog)` | `s=15*z*r.r`, skip <1.5px; lopsided boulder (`u` from position): body `#B3B2C2`, lit top `#D0CDD9`, shade `#9C9AAE` (details only when s>3); snow cap ellipse when `snowAt>0.5` or `W.snow>0.45` | 9549 |
| `drawFlower` | 6907 | `(f,p)` | skip if `z<0.8`, `cold>0.55`, or snow; `n` petals radius 1.4z on a 4z×2z ellipse, colour `f.c` alpha .9 via GC | 9552 (behind `DBG.flowers`) |
| `coverCols` | 6918 | `()→{tuft,cl1,cl2,peb,pebS,pebL}` | per-frame memo of ground-cover CSS colours keyed by `(AM[0]*100|0)*1000+(AA*100|0)*10+season`; tuft colour by season (`#B9A86A` autumn, `#A8B29A` winter, `#7FAF78` else) | `drawCover` |
| `drawCover` | 6923 | `(c,p)` | only when `z>=1.0`; hidden where `WEAR>0.9`, `PAVE`, `OCC`, or `wetD>0.05`; tuft (3 blades, length `(2.6+((sd*7+k)%3)*0.6)*s`, width `.95s`), clover (3 leaves r 1.1s + centre .5s), pebble (1.7s×1.1s + highlight); tuft/clover hidden under snow, pebble recoloured | 9552 (behind `DBG.flowers && DBG.cover!==false`) |
| `drawMark` | 6944 | `(m,p)` | a stake (`#A38C7C`, height 1.1s, s=10z) with a pennant triangle (`#EFD9B4`, 0.6s wide); skip when s<2 | 9551 |

---

## 5. Rules, thresholds and tuning numbers

### 5.1 Projection geometry (6343-6384)
- Isometric 2:1 diamond: tile width 26px, depth 13px, one level 26px at zoom 1 (so a level of height is as tall as a tile is wide — a strongly "tall" iso).
- Rotation about `CTR=35.5`; depth for painter's sort is `rx+ry` in the rotated frame.
- Vertical anchor `VANCH=0.46`: with `ox=oy=0`, the sea surface at the island's centre tile is at 46% of the screen height.
- Heights are drawn relative to `SEAS=2.5` (sea surface), not the ground sea level 2.0.
- Vertex (vx,vy) is at tile coordinates (vx-0.5, vy-0.5) — a tile's four corners are its index ±0.5.

### 5.2 Sorting / LOD (6359-6381)
- Counting sort bucket = 1/64 tile; `OB` has 9224 buckets, offset +64 to keep keys ≥0.
- `LOD_PX=15`: coarse 2×2 cells when a tile is narrower than 15px, i.e. `cam.z<0.577`.
- Order recomputed only when `orderDirty` (set by `setAngle`).

### 5.3 Camera (6349-6413)
- Turn snap tolerance 0.0015 rad. Button-turn easing base 0.0008/s, pinch easing base 0.00002/s.
- Fit: side gutter 18px (min width 120); island may use 58% of the height (min 160); width overfill 1.16; zoom clamp [0.16, 2.8].
- Clamp: zoom [min(0.30, 0.85·fitZ), 3.0]; pan ±max(240, 0.56·N·TW·z) = ±max(240, 1048·z) px.
- `dpr` capped at 2.
- `newIsland` 12121-12123 overrides: start zoom `clamp(max(fitZ*2.6,1.15),0.9,1.6)` and `cam.free=true` (close to camp); the Fit button (12151-12153) toggles between whole-island and village views with the same numbers.

### 5.4 Lighting (6450-6478)
- Night ambient floor [0.46,0.50,0.72] (blue-shifted); curve `light^0.7`.
- Cloud dim 12%, storm-bank cover dim 16%, blue channel dims 8% less.
- Golden hour: two triangular windows centred at f=0.26 and 0.74, half-width 0.11; max strength 0.22 (×max(0.25,light)); dawn tint [255,204,162], dusk [255,186,158].
- Fog: mist 30%, rain 3%, snow 14% toward [226,232,238].
- Sun direction (-0.50,-0.30,0.82) normalised → light from upper-left/behind.
- `GC` cache flush at 900 keys.

### 5.5 Sky / sea (6480-6618)
- Sky keyframes `(f: top / bottom)`: 0 `#2C3252/#4A5170`; .17 `#4A5075/#8C87A8`; .24 `#7C8CBA/#F2C8B0`; .31 `#A5C4DE/#F7DFCB`; .50 `#A9CEE7/#E7F0F3`; .68 `#9BB9DC/#F2D6C0`; .76 `#7A85B4/#F0BFAC`; .85 `#3D4467/#5C6389`; 1.0 = 0.
- Stars visible when `light<0.42`; 70 stars in the top half; cloud hides up to 80%.
- Sun when `light>0.16`, radius 17; moon radius 12; glow 5.5×; the body moves on an ellipse of radii 0.62·cw × 0.46·chh centred mid-screen, angle `(f-0.25)·2π` (top-centre at f=0.25, off the right edge at noon, bottom-centre at dusk, left side at night — see §12).
- Sea plane colours top [128,193,224], mid [103,171,210], bottom [78,146,192]; stops 0/0.35/1; fog mix 0.6/0.5/0.4.
- Far shore bands: amplitude 22 & 30, colours [191,203,217] & [170,185,205], offsets -16 & -5, alpha 0.55, sampled every 8px with `sin(0.011x)·sin(0.0037x)`.
- Backdrop repaint: every 260ms or when size/dpr/horizon (6px quantised) changes.
- Clouds: 10, parallax 8%/5% of pan, drift `W.drift·v·0.5`, alpha `cloud·o·0.7`; storm bank 7 blobs, present while `W.front∈[0,2]` (0→1 arriving, 1→2 leaving; `STORM_LEAD` seconds per unit, set at 860-861).
- Night water: toward `NIGHTC` by `(1-light)·0.52`.

### 5.6 Ground colour rules (`groundCol` 6665-6741), in application order
1. Fields read through 9-tap blend: `so=fld(SOIL)`, `sa=fld(SAND)`, `wdv=fld(WD)` (6666).
2. `hm<SEA+0.55` (2.55) → beach sand `mix(sand,sandL,.3)` (6668).
3. Else grass: `hm>6.3` upland `mix(upland,grassL,.25)` else `mix(grass,grassL,.35)`; autumn +28% `C.autumn`; summer +25% `C.grass` (6670-6672).
4. Steep face: `k=clamp01((slope-1.3)/0.9)·0.85` toward earth (`mix(dirt,dirtL,.4)`) or stone where soil `<0.06` (6673).
5. Low shore blend to sand: `hm<SEA+1.15`, strength `clamp01((3.15-hm)/0.6)·0.85` (6674).
6. Rock/scree materials (9-tap): stone ×0.75·rk, stoneL ×0.6·sc (6676-6678).
7. Bared ground (not water/sand/snow, `hm>SEA+0.6`): `bare=clamp01((0.05-so)/0.05)` → 55% toward stone/dirt (stonier with slope>0.7..1.1); `thin=clamp01((0.30-so)/0.25)·(1-bare)` → 45% toward dirt (6683-6688).
8. Sand field: `sa>0.015` → `clamp01(sa/0.10)·0.8` toward sandL (6690).
9. Seepage/damp: `damp=clamp01(wdv/0.055)·clamp01((0.16-wdv)/0.06)` → darken to ×[.86,.90,.92] (6695-6696).
10. Hollow shadow: `sink=mean(HM at ±2 tiles)-hm`; if `>0.3` darken by up to 16% over 1.1 levels (6700-6703).
11. AO: `g·(1-AO[i])` when `hm>SEA+0.3` (6705).
12. Bank strip: dry, unoccupied, non-sand ground beside water (`wetD>0.12`): edge neighbours +0.34, corners +0.12, → `0.32·clamp01(bk)` toward `C.bank` (6708-6715).
13. Wet sand: `hm<SEAS+0.55` beside `wetD>0.06` (edges .30, corners .11), faded over 0.55 levels → darken ×[.79,.78,.73] by `f·0.80` (6718-6727).
14. Mine pit: `MINEB[i]` → 86% toward `mix([150,147,163],stoneL,(hm-MINEZ)/1.4)` (6730).
15. Prepared plot: `PREP>0.01` → `clamp01(PREP)·0.82` toward `C.prep` (or `C.track` when `cold>0.5`) (6732).
16. Trodden green: `TROD·0.40` toward `mix(prep,dirtL,.3)` / `track` in cold (6733).
17. Fire yard: within `YARD_R=2.6` tiles of the finished fire, `clamp01((2.6-d)/1.7)·0.30` toward dirt/track (6735).
18. Snow: `amt=snowAt·0.85+W.snow·0.28·(1-snowAt)`, ×0.4 on sand material (6737).
19. Grain: `grain(x,y)` modulates ×(1+j·0.075, 0.075, 0.06); meadow/grass mottle `k=(nz(0.83x+3.1,0.83y+5.7)-.5)·0.9` warms/cools (±4.5%,+2%,-3.5%) (6738-6740).

### 5.7 Snow line (6621-6622)
- `7.9 - 6.2·cold` levels; with `EMAX=9` the peaks above 7.9 are white all year; at `cold=1` the line is 1.7 (below the shore). Blend band 1.2 levels.

### 5.8 Props
- Tree: `TS=0.42` px/height-unit; height 30-64 units → 13-27 px tall at zoom 1 (full age); age scales size `0.22+0.78·age`; cull below 2.5px; sprite cache 1400 entries; zoom buckets 8/octave.
- Phenology: spring bud 0-0.9 days, blossom 0.9-1.9, leafing 1.9-3.0; autumn thinning from day 2.0; bare in winter or `cold>0.62`.
- Bush: 13px·sc at zoom 1; bare at `cold>0.6`; berries: 2-6 wild, 1 planted (1748, 5758, 11154).
- Rock: 15px·r at zoom 1 (r 0.7-1.4).
- Flower: hidden below zoom 0.8 or `cold>0.55`; cover hidden below zoom 1.0.
- Snow on props when `snowAt>0.5` or `W.snow>0.45`.
- Wind sway needs `W.wind>0.2` and zoom `>0.55`.

---

## 6. UI elements, controls and input handling
This section has **no DOM elements and registers no listeners**. It provides the primitives the input layer (11166-11321) and buttons (12143-12153) call:
- `screenToTile` for taps (select/command/paint) — called with `tool==='hand'` tap at 11223 (dispatching to `playerCommand` in gnome mode or `tapSelect` in creator mode; that branch is outside this range).
- `clampCam` after every pan/zoom; `fitCam` for the Fit button and on `resize` when not free.
- `turnStep` consumes `cam.angT` set by the rotate buttons (quarter turns, 12145-12146) and by two-finger twist (11202); it reads the global `pinch` to pick the faster easing.
- `VANCH` is used by the pinch-zoom anchor math (11205).

## 7. MODE 'creator' vs 'gnome'
Nothing in 6330-6951 reads `MODE` or `PLAYER`. The camera, lighting, sky, ground and props render identically in both modes; mode-specific drawing (the player ring, 9550) lives in the dispatch outside this range. `cam.follow` (6333) is the hook the gnome-mode camera uses (set/cleared at 10757-11311, 12106), but following itself is implemented elsewhere (`followStep` 12090).

## 8. Progression / unlock / economy
None directly. Indirect reads: the fire yard appears only once a `fire` build is `done` (6624); `PREP`/`TROD`/`MINEB`/`PAVE`/`OCC`/`WEAR` (buildings, mines, paths) change ground colour and hide cover; `marks` are drawn for survey/swim marks pushed at 1663/4666. Berry counts differ for wild vs planted bushes.

## 9. Persistence
None. All state here is derived per frame or cached in memory (`gcache`, `sprCache`, sky bitmap, `COVC`). `NZ` noise is seeded with a fixed 1337 LCG, so ground grain is identical across islands; stars/clouds come from the visual RNG at `initBackdrop` (per new island). The only "persistent" touch nearby is `history.replaceState('#s=seed')` at 12115, outside this range.

## 10. Mobile / touch / performance tricks
- `dpr` capped at 2 (6336) and `imageSmoothingEnabled=false` in `draw` (12044).
- Backdrop (gradients, stars, clouds, sea) painted to an offscreen canvas at most every 260ms (6525-6532) — "full-screen gradients are the dearest thing a phone can draw".
- Counting sort instead of comparison sort for painter's order (6367-6373), recomputed only on angle change.
- Two-level LOD: 2×2 coarse cells when zoomed out (6360-6364).
- Projected vertex arrays (`SVX/SVY/SWY`) computed once per frame and shared by all tile/water/pick code (6416-6421).
- Tree sprites cached per zoom bucket/season/light/snow (6780-6835); straight `drawImage` when no rotation (6848).
- `GC` memo for CSS colour strings (6471-6478); `coverCols` memo per frame epoch (6918-6922).
- Distance culls: trees <2.5px, bushes/rocks <1.5px, stumps `z<0.33`, flowers `z<0.8`, cover `z<1.0`, marks `s<2`.
- Wind sway skipped when zoomed out (`z<=0.55`).
- Pinch twist smoothing: target angle + exponential ease so fingertip jitter never reaches the picture (6349-6355).
- Colour refresh throttling (220ms / 110ms while turning) is in `drawIsland` 9584-9587, which also refreshes `WHITE_LIT/NIGHTC/yardRefresh`.

## 11. i18n (en/es)
No user-facing strings in this range; all text is code comments (English, changelog style: v7, v9.9, v9.9.1, v9.15, v9.20, v9.22). The `lang` toggle (12206-12214) only affects the intro. Toasts near this code ('Whole island', 'Back to the village', 12152-12153) are hard-coded English and outside the range.

## 12. Oddities, bugs, dead code, TODOs
1. **Dead function** `invRot` (6347): no callers anywhere.
2. **Dead state** `curOrd` (6836): written at 9947, never read; its comment promises occlusion logic that does not exist.
3. **Unused parameter** `fog` in `drawTree` (6837): trees are never fog-mixed while bushes and rocks are (`fogMix` 6776) — a distant wood will read sharper than the rocks beside it.
4. **Sprite cache key is lossy** (6788): keyed on `t.sd|0` (sd is a float 0..1000, 1692) but omits `t.h` (random 30-64, independent of sd) and the fractional part of sd used by `treeTint` (6775). Two trees of the same species, age bucket and `floor(sd)` share a sprite built from the first one's height and tint; with hundreds of trees over 1000 integers, collisions are expected (≈45 pairs for 300 trees). `buildTreeShape` seeds from `sd|0` too (1702), so shape matches but **size can be off by up to ~70%** for the colliding tree. Fix: add `t.h|0` to the key or derive h from the seed.
5. **`GC` key has no separator** between `(AM[0]*100|0)` and `(AA*100|0)` (6472): string concatenation "72"+"0" vs "7"+"20" can collide in principle (not in practice given AM≥~0.33). The key also ignores `AM[1..2]` and `AT`, so a dawn-tinted colour can be reused at dusk when AM[0]/AA happen to match.
6. **`gcache` eviction** calls `Object.keys(gcache).length` on every insert (O(n)) and then drops the whole cache (6475).
7. **`ptInQuad` allocates two arrays per call** (6438); `screenToTile` may call it up to 5184 times per tap (6426-6432). Fine on tap frequency, but a hot path if ever used for hover.
8. **`seaPlaneCol` recomputes `horizonY()`** (four rotations) on every call; it is called per sea tile (9326, 9381, 9834, 9883). `drawIsland` already holds `seaYh` (9589) that could be passed in.
9. **Sun path vs comment** (6555-6557): the comment says "an arc across the top of the screen", but the parametrisation puts the sun at top-centre at f=0.25, off the **right edge at mid-height at noon** (f=0.5), and at the **bottom-centre at dusk** (f=0.75); the moon likewise rises on the left-bottom and climbs the left edge. On a portrait phone the sun is on screen roughly f∈[0.1,0.42] only. Possibly intended (the body hides behind the island), but a port should decide.
10. **`landBox` uses `SEA` while `syOf` uses `SEAS`** — consistent (box is in unzoomed px relative to the surface), just noting `E[i]<=SEA` excludes shallow wet tiles so a flooded shore may fall outside the fit.
11. **`resize` guards with `world.name`** (6339): before the first island, resize only clamps. `initRender` creates `skyC` before the `let skyC` at 6524 executes — fine because `let` hoisting applies inside the same script and `initRender` runs from `boot()` at the end (12242), but reordering the file would break it (TDZ).
12. **`NZ` noise is not seeded from `world.seed`** (6630): every island has the same grain pattern. Harmless, but a designer may expect variety.
13. `YARD_R2` comparisons use the first finished fire only (`builds.find`) — a second village's fire gets no yard.
14. `DBG.shadows` is `false` by default (12041, "Jed — don't need shadows anywhere"), so the shadow code in `treeSprite`/`drawBush`/`drawRock` (6794, 6865, 6889) is effectively dead unless toggled by the harness.
15. Threshold inconsistency: snow on props uses `snowAt>0.5 || W.snow>0.45`, flowers vanish at `cold>0.55`, bushes go bare at `cold>0.6`, trees at `cold>0.62`, ground swaps to `C.track` at `cold>0.5` — five different cold thresholds; probably deliberate staggering, but undocumented.
16. No TODO/FIXME markers in the range; versioned comments act as the changelog.

## 13. Reusable engine vs gnome-specific content

**Reusable as-is (engine/shell):**
- Rotatable iso camera: `cam`, `setAngle/rotXY/rotVec`, `sxOf/syOf/screenOf`, `turnStep`, `fitCam/clampCam/landBox`, `projectVerts`, `screenToTile/ptInQuad` (6331-6443). Only the constants `N, TW, TH, EH, SEAS, VANCH` and the "land" predicate in `landBox` are world-specific.
- Counting-sort painter's order + 2-level LOD (6359-6381, 6364).
- Lighting pipeline: `computeAmbient/lit/GC` and the `AM/AT/AA/FOGA` model (6450-6478) — generic day/night/weather tinting for any palette.
- Sky system: `SKYR` ramp, stars, sun/moon, clouds, storm bank, offscreen-bitmap cache (6480-6618). The **open-sea plane and far shore** (6511-6523, 6568-6581) are island-specific and would be replaced for an inland park (city skyline, tree line, hedges).
- Value noise `nzAt/grain` and the 9-tap `fld/matAmt` smoothing idiom (6629-6664).
- The sprite-cache pattern (`zoomBucket`, keyed offscreen canvases, bounded Map) and the "cull below N px" convention (6780-6835).
- Prop drawing idioms: multi-arc blobs, lit top/shaded underside, per-instance tint from position/seed.

**Gnome-specific content:**
- The palette `C` (grass/sand/snow/water/pave/prep/track) and all hex literals in sky, sea, foliage, bush, rock, cover, mark.
- The whole rule stack of `groundCol` (soil erosion, sand bars, mine pits, prepared plots, trodden greens, fire yard, snow line) — tied to this sim's fields `SOIL/SAND/WD/MINEB/PREP/TROD/AO/HM`.
- Seasonal phenology (`crownPhase/foliageCol/AUTUMN`), snow logic (`snowLine/snowAt`), three tree species and their forms, berries, the `fire` yard, survey `marks`, stumps/axe shake/felling rotation.
- Weather coupling to `W.front/cloud/mist/rain/snow/wind/drift`.

## 14. Design questions for the Parque D'Amour port
1. **Rotation**: keep arbitrary-angle rotation (and the pinch-twist) or lock to 4 quarter views? Arbitrary angles force the counting sort and per-frame vertex projection; fixed views allow precomputed orders and simpler sprites.
2. **Map size & scale**: N=72 fine tiles, 26×13px tiles, 26px per level. A park is flatter: do you still need multi-level terrain (`EH`), or a near-flat ground with a few terraces/ponds? That decides whether `syOf`'s height term, `landBox` and the whole hollow/AO/slope logic survive.
3. **What replaces the sea?** The island's horizon/sea plane/far shore are a large part of the backdrop. A park needs a boundary treatment: city rooftops, a boulevard, hedges, the Seine? And what is the "fit" bounding box when there is no sea — the park fence?
4. **Day/night and seasons**: does the romance game run a day cycle (dusk is romantic — the golden-hour `AA` logic is a gift), and does it need seasons at all? If no seasons, `crownPhase/snowLine` and half the thresholds go.
5. **Weather**: keep storms (a storm could be a sabotage tool), or reduce to sun/cloud/rain? `W.front` drives both lighting and the cloud bank.
6. **Palette**: French-park pastels (gravel paths, plane trees, wrought iron, lawns, flowerbeds) — a new `C` and new tree species (plane, chestnut, lime, topiary). Which tree forms and how many species?
7. **Ground materials**: replace soil/sand/scree/snow with gravel, lawn, flowerbed, paving, water, mulch. Which "wear" effects matter (trodden lawns, mud after rain)?
8. **Props**: benches, lamp posts, fountains, hedges, statues, café tables — how many need sprite caching (trees) vs direct draws (bushes/rocks)? Which are animated (fountain spray, lamps lighting at dusk)?
9. **Zoom range & LOD**: the game assumes a phone portrait screen; the coarse LOD switches at z<0.577. Will the park be small enough to drop LOD entirely?
10. **Picking**: `screenToTile` returns a tile; the romance game will likely need to pick characters, benches and small props first — what is the hit-test priority (people > props > tile)?
11. **Creator vs avatar camera**: this section is mode-agnostic; where should the avatar-mode camera follow (`cam.follow`) and should the creator mode have a free camera plus fit-to-park? Should rotation be available in both?
12. **Lighting for mood**: the ambient model is linear tinting. Does the romance need localised light (lamps, café glow, moonlight on the pond) — which this renderer does not do?
13. **Hidden/visibility**: do canopies and buildings occlude characters (the `curOrd` idea that was never finished)? For a game about watching a couple, occlusion by a hedge may be a mechanic.
14. **Determinism**: the ground grain is fixed-seeded; the stars/clouds use a visual RNG. Does the park need per-save deterministic visuals (for screenshots/replays)?
15. **Performance budget**: target the same phone class? Keep the backdrop bitmap, sprite cache and count-sort, or is the park small enough to simplify?
