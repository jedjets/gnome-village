# Gnome Village review — section 14: Buildings drawing, the house kit (v9.20)

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Range: lines **6952–8044** (every line read).

---

## 1. Purpose of the section

This is the **building renderer** for the isometric canvas. Everything in it is pure drawing: it reads building objects (`b`) and world/time state and paints onto `ctx`. Nothing here mutates game state except a per-building render cache (`b._fpc`) and particle emission (smoke, bees, sparks).

Core ideas:

- **World-space geometry, not sprites.** Every building is built from polygons whose corners are world points `(x tiles, y tiles, z levels)` projected by `wp()` → `screenOf()` (6953). Because `screenOf` applies the island's rotation (`rotXY`/`rotVec`, lines 6346–6348, driven by `cam.ang`), every building turns correctly with the 4 quarter-turn views. The comment at 6961–6963 says this explicitly.
- **Face culling + fixed sun.** `faceVis` (6958) decides which faces of a box point at the viewer; `faceLight` (6959) gives a 0.74–1.04 brightness from a fixed sun direction `SUNL` (defined 6450: `[-0.50,-0.30,0.82]`, normalised 6451). `shade()` (6960) tints a hex colour by that brightness and passes it through `lit()` (6465) so buildings follow the day/night colour grade.
- **Piece-by-piece construction.** A building under construction has `b.plan` (a list of pieces from `makePlan`, 3890) and `b.stc` (counts of placed pieces per kind, set at 4109/4161). `stc(b,k)` (7968) returns the count, or 99 when done. Every renderer here checks `stc(b,'found')`, `stc(b,'wall')`, etc. and draws exactly as much of the structure as has been laid, so the player watches walls rise course by course.
- **The house kit (v9.20).** Nine house types share one renderer, `drawHouse` (7080), parametrised by the `HOUSE` spec table (7036). Each house is drawn in its own local frame (`houseFrame`, 7048) rotated by `b.rot` quarter turns so it can face the village green.
- **Depth-sorted fences (v9.20).** Fences are cut into per-tile pieces (`fencePieces`, 7509) so the main draw loop (9683–9722) can interleave them correctly with gnomes/rabbits.

The section ends with the dispatcher `drawBuild` (7829) that routes a building to its renderer, and some shared helpers (`drawPost`, `stc`, `snowOn`, `drawYard`, `shadowFp`).

---

## 2. Globals / state defined or mutated

| Name | Line | Type / shape | Notes |
|---|---|---|---|
| `WT` | 7032 | `const` number `0.13` | Wall thickness in tiles; used by `inner()`, `reveal()`, floor inset. |
| `HOUSE` | 7036–7046 | `const` object keyed by house type | Spec table: `{U,V,courses,walls[4]{m,win[[f,n]]},door,doorW,doorK,roof,rc[2],chim,stoneP?,porch?,nets?,lamp?,hurdles?,loft?,stack?,bench?,slip?,floor?,beds,label}`. Keys: `cabin, lodge, fisher, miner, shepherd, farmer, woodcutter, workshop, boathouse`. Read all over the file (placement 2527–2583, 2765–2780, 3189, 3246–3247, 3854 housePlan, 4114, 4167, 4201, 4416, 8857, 11339, 11719–11727). |
| `SAIL_N` | 7901 | `const [number,number]` `[-sin(0.44),-cos(0.44)]` | Windmill sail-plane normal (world), turned 0.44 rad off the back so no square-on view sees sails edge-on. |
| `b._fpc`, `b._fpcN` | 7510, 7529 | per-building cache: array of fence pieces; plan length | **Mutated** by `fencePieces`. Transient (underscore), invalidated when `b.plan.length` changes. |
| particles via `P()` | 7219 (smoke), 7630 (bee), 7876 (spark) | pushes into global `parts` (cap 220, line 2386) | Side effect of rendering: smoke from chimneys, bees from hives, sparks from the midsummer bonfire. |
| `ctx` state | throughout | `lineCap`, `lineJoin`, `lineWidth`, fill/stroke styles | Not always restored (e.g. `ctx.lineCap='round'` set in many places and left). |

**Globals read (defined elsewhere):** `ctx`, `cam.z` (zoom), `now`, `T` (time: `.light`, `.cold`, `.day`, `.season`, `.f`), `W` (weather: `.wind`, `.wet`, `.rain`, `.snow`), `village.power`, `store.wood`, `builds`, `boats`, `BOAT_MAX`, `critters`, `trees`, `E`/`WD`/`SEAC`/`SEAS` (terrain arrays), `N`, `TW`/`TH`/`EH` (569: 52/S, 26/S, 26 px), `TAU`, `S`, `DBG.shadows` (12041, default `false`), `AUTUMN` (6765), `SUNL`.

**Building fields read here** (so a port must keep them or map them): `type, x, y, x0, y0, fw, fh, z0, rot, done, plan, stc, got{wood,stone,fibre}, yx, yy, out, inN, jetty{x,y,ux,uy,len,deck}, lanternNight, bonfire, ph, boatProg, turnT, gate[2], gateSide('N'|'S'|'E'|'W'), hutch[2], fold, hitched, spin, crop, treeAge, apples, big, tiles, hidden, up`.

---

## 3. Functions (every one in the range)

### 3.1 Projection and shading primitives

| Fn | Line | Signature | What it does |
|---|---|---|---|
| `wp` | 6953 | `(x,y,e)` → `{x,y}` screen | Alias for `screenOf` (6384): world tile coords + level → screen px, rotated by island angle. |
| `quad` | 6954 | `(a,b,c,d)` | Begins a closed 4-point path from screen points. Not used inside this range (used at 8799–8800, 10164+). |
| `poly` | 6955 | `(p[])` | Begins a closed path from an array of screen points. Used everywhere here. |
| `faceVis` | 6958 | `(nx,ny,nz)` → bool | Face with outward normal (tiles,tiles,levels) is visible when `rot(n)·(1,1,0.5) > 0`. The viewer looks along (1,1,0.5) in the rotated frame. |
| `faceLight` | 6959 | `(nx,ny)` → 0.74..1.04 | `0.74 + 0.30*clamp01(0.55 + 0.6*dot(n̂, SUNL.xy))`. Fixed sun, no shadows. |
| `shade` | 6960 | `(hex,L,alpha?)` → css colour | Multiplies RGB by L, passes through `lit()` (time-of-day grade), optional alpha. |
| `h01` | 6965 | `(a,b,c?)` → [0,1) | Integer hash → deterministic jitter for "hand-made" irregularity. Used for log girth, pebble placement, board shades. |

### 3.2 Material primitives

| Fn | Line | Signature | What it does |
|---|---|---|---|
| `cobbles` | 6967 | `(a[2],c[2],z0,z1,L,seed,peak?[3])` | A wall face of rounded stones between world points a→c. Fills mortar `#A8A4B6`, then rows (`(zTop-z0)/0.17`) × cols (`len/0.19`) staggered ellipses from a 5-colour palette, each with outline and highlight. **LOD:** at `cam.z<0.7` draws only mortar + one lighter half-band (6971–6972). Optional `peak` makes a gable pentagon and skips pebbles above the gable line. Callers: `drawCobblePost`, `houseCobbles`, `drawWell` (7639), `stoneBlock` (10122). |
| `logEnd` | 6993 | `(x,y,z,r,ax,ay,L,lw)` | The stub of a log passing a corner (`out=0.15` tiles) with an end-grain disc drawn via `ctx.transform` so it is a full disc looking along the wall and a sliver face-on; skipped when `hypot(ux,uy)<0.7px`. Called by `cornerEnds` (7165) and the water wheel (10546). |
| `drawCobblePost` | 7013 | `(x,y,z0,z1,hw,seed)` | Visible faces of a square cobbled stack (chimney) + light cap + dark flue square (0.55 hw). Called by `drawChim`. |
| `drawPost` | 7776 | `(x,y,z0,z1,hw,col)` | Generic square box: visible side faces + lighter top. Used for porch posts, jetty piles, hutch/kennel bodies, stable posts, well posts, mine (3207). |

### 3.3 The house kit

| Fn | Line | Signature | What it does |
|---|---|---|---|
| `isHouse` | 7047 | `(b)` → bool | `!!HOUSE[b.type]`. Used at 4167, 4201, 9692, 10760. |
| `houseFrame` | 7048 | `(b)` → `{sp,rot,cx,cy,U,V,R,RN,Q,FV,FV3,FL}` | Local frame: `u` across the house (ridge along u), `v` toward the front (door on +v). `R(u,v)` → world xy rotated by `b.rot` quarter turns; `RN(nu,nv)` rotates normals; `Q(u,v,z)` → screen; `FV/FV3/FL` are faceVis/faceLight in the frame. Allocates closures every call (also called from AI/placement code: 2765, 3189, 3246–3247, 3855, 4114, 4416, 8857, 11339, 11719, 11727). |
| `houseTile` | 7059 | `(b,u,v)` → `[tx,ty]` | World tile under a frame point (door tile at 2542, 2773). |
| `houseCobbles` | 7061 | `(F,a,c,z0,z1,L,seed,peak?)` | Frame-space wrapper around `cobbles`. |
| `plankFace` | 7064 | `(F,a,c,z0,z1,L,seed,prof?)` | Lapped horizontal boards up to a flat top or a gable profile `prof=[[f,z],...]`. Board height 0.17; alternating shades `#CDBCA4/#C2B094` with ±6% jitter; lap shadow 0.03 under each board; clipped to the outline. |
| `drawCabin` | 7079 | `(b)` | **Dead alias** → `drawHouse(b)`. No callers anywhere. |
| `drawHouse` | 7080–7307 | `(b)` | The whole house renderer (see §4). |
| └ `CZ` | 7087 | array of course z's | `NCO+1` z's; each course `(ztF-zf)/NCO * (0.88+0.24*h01)` → slightly uneven logs. |
| └ `walls` | 7089–7094 | 4 wall descriptors | front(+v, f=0), right(+u, gable, f=1), back(-v, f=2), left(-u, gable, f=3); each has outer line a→c and normal n. |
| └ `mOf` | 7095 | `(w)` → `'log'|'plank'|'stone'|'open'` | Material from `sp.walls[f].m`. |
| └ `stoneS` | 7098 | number 0..1 | `nSW/(stoneP*nStone)` — fraction of stone pieces laid. |
| └ `coursesOf` | 7099 | `(w)` → 0..NCO | Log/plank courses shown: `floor(nW/2)` plus one for the front wall when `nW` is odd (walls rise in pairs, front leads). Stone/open → 0. |
| └ `gableOf` | 7101 | `(w)` → 0..2 | Right gable gets pieces 1–2, left gets 3–4 (`clamp(nG-k*2,0,2)`). |
| └ `wallTopZ` | 7102 | `(w)` → z | Open → zf; stone → `zf+(zt4-zf)*min(1, stoneS*stoneP/(stoneP-1))` (full height at 3/4 of the stones, last quarter builds the gable); timber → `CZ[coursesOf]`. |
| └ `profOf` | 7104 | `(w)` → `[[f,z]...]|null` | Gable outline: stone → full peak when `stoneS>=1`; timber → needs all courses; g>=1 trapezoid to `zt4+0.26` at f=0.16/0.84; g>=2 adds the ridge peak. |
| └ `inner` | 7109 | `(w)` → `{a,c}` | Inner wall line, offset by WT and shortened by WT at both ends. |
| └ `band` | 7110 | `(a,c,z0,z1,col,L)` | One filled horizontal strip in frame space. |
| └ `face` | 7115–7144 | `(w,isInner)` | Draws one wall face: footing cobbles (`zb..zf`) when `nF>w.f`; stone (cobbles, with gable peak if `prof`); plank (`plankFace`); or round logs course by course (3 bands + seam line per course) plus gable trapezoid/triangle. Inner faces are reversed and 0.80× darker. |
| └ `topOf` | 7145–7155 | `(w)` | The wall's top strip (WT wide) at its current height or along the gable; colour per material (`#B4B2C2` stone, `#D8C8AE` plank, `#E2CBAA` log), footing-only top when no courses yet. Drawn before the roof so the roof covers it. |
| └ `cornerEnds` | 7157–7168 | `(far)` | Log ends at the 4 corners where two **log** walls meet: a wall's logs pass the corner on even courses if it runs along u, odd if along v, so they interlock. `far` selects corners whose both walls are hidden (drawn before the floor). |
| └ `reveal` | 7169–7206 | `(w,uf,hw,z0,z1,kind)` | A window or door opening with real depth: clip to the outer outline (arched `zH=0.16` for `kind==='door'`), fill the pane/leaf on the inner line, the visible jamb, the sill/threshold, then the frame stroke; windows get a sill lip (`e=0.035`, out 0.05) and, when `litW`, a radial glow. Door kinds: `door` (4 planks, knob at 0.75), `double` (6 planks + centre meeting line), `barn` (6 planks + centre + 2 braces), knob at 0.42. |
| └ `lintel` | 7207 | `(w)` | Beam across an open front (boathouse) once a side wall has all its courses; `logRib` (10137) at `zt4-0.07`, r=0.07. |
| └ `extChim` | 7209 | bool | Chimney is external when the +u gable wall is not stone. |
| └ `drawChim` | 7210–7220 | `()` | External: broad cobbled base (hw `chim*1.3`) to `zt4-0.20`, shoulder slab, stack (hw `chim`) to `ridge+0.30` once `nC>=2`; internal: stack from `zt4-0.10`. Smoke particle when `hearthLit` and `nC>=2` with `vchance(0.10)` per frame. |
| └ `jFront` | 7221 | bool | Whether the jetty is in front of the house in the rotated frame (depth order). |
| └ `frontStuff` | 7226 | `()` | Doorstep ellipse (no porch), porch, hurdles, bench, saw-horse, slip (outer part). |
| └ `rightStuff` | 7228 | `()` | Log stack on the +u side. |
| `roofRow` | 7309–7349 | `(F,kind,col,L,A0,A1,B0,B1,row,lw,halfW)` | One row of a slope between lower edge A and upper edge B in the house's covering: `slate` (3 courses of staggered slates, `ns=halfW*2/0.15`), `shingle` (scalloped tabs, `n=halfW*2/0.19`, offset half a tab on row 1), `board`/`bark` (long boards + batten), `thatch` (2n strands + thick rounded fringe). |

### 3.4 Craft props attached to houses

| Fn | Line | Signature | What it does |
|---|---|---|---|
| `drawPorch` | 7350 | `(b,F,zf,zt4,nS)` | Lodge porch: step ellipse, deck (`D=0.92` deep, posts at `±0.62U`), two posts (`nP>=1`), lean-to roof + edge when `nP>=2`, snow, **harvest garland** when `festival()==='harvest'`, porch lamp lit at `T.light<0.5`. |
| `drawNets` | 7378 | `(b,F,zf)` | Fisher's drying nets on the front wall (`stc net>=1`): 7 verticals, 5 sagging horizontals, 5 cork floats. |
| `drawJetty` | 7388 | `(b)` | World-space jetty from `b.jetty`: posts in pairs per tile sunk to water/ground, 0.17-wide boards, side faces, water rings at `cam.z>0.9`, mooring post + rope loop when complete. `n=min(j.len, stc jetty)`. |
| `drawHurdles` | 7408 | `(b,F,zb)` | Shepherd's woven panels (0.34×0.50) leaning on the front wall, up to 2; crook when 2. |
| `drawLogStack` | 7419 | `(b,F,zb)` | Woodcutter's stack on +u side under the eave: 2 or 3 rows of `[5,4,3]` logs via `logRib`. |
| `drawSawHorse` | 7427 | `(b,F,zb)` | X-legged saw-horse with a log across it when `stack>=2`. |
| `drawBench` | 7434 | `(b,F,zb)` | Engineer's bench: 4 legs + top (`bench>=1`), hammer/rope coil/brass ring (`bench>=2`). |
| `drawPulley` | 7447 | `(b,F,zb,ridge)` | Pulley wheel under the +u gable peak with a rope down (`bench>=2`). |
| `drawLoft` | 7454 | `(b,F,zt4,ridge)` | Farmhouse loft door high in the +u gable + hoist beam + rope (`loft>=1`). |
| `drawSlip` | 7463 | `(b,F,zb,zf,part)` | Boathouse slip: 2 stringers + boards from inside (`part='in'`) or out to the water (`part='out'`, drops 0.40 levels per 1.6 tiles). Inside: boat on the stocks — keel, `m` ribs, gunwales, planking. While building: `m=4` (ribs 1) or 7 (ribs 2). Once done (v9.21): shows the boatwright's current boat from `b.boatProg`: nothing if `boats.filter(home===b).length>=BOAT_MAX`; ribs `round(clamp01(pr/0.5)*7)`; gunwales at `pr>=0.5`; planking `pl=clamp01((pr-0.55)/0.4)` over 12 segments, far side first. |

### 3.5 Fences, gardens and small structures

| Fn | Line | Signature | What it does |
|---|---|---|---|
| `drawFence` | 7488 | `(b)` | Whole-fence renderer (pre-v9.20 path): each `plan` run with `k==='picket'&&seg` gets pickets every 0.24 tiles, 0.26 high (+0.03 alternating), rail at 0.17; gate posts (0.40 high, knob) when all runs are laid. Now only reached via `drawFold` or `drawBuild` when `DBG.fenceSplit===false`. |
| `fencePieces` | 7509 | `(b)` → piece[] | Splits each run at tile boundaries (`k+0.5`), computes outward normal (away from the fence's centre; fold uses footprint centre), assigns each piece the tile 0.25 outward of its midpoint (`ti`), plus a `gate`(fold)/`posts`(fence) piece. Cached in `b._fpc` keyed by `b.plan.length`. Consumed by the draw loop at 9684 and 9718–9722 which inserts near-side pieces after big props and far-side pieces first. |
| `drawFencePiece` | 7531 | `(o)` | Draws one piece: `hutch`→`drawFoldHutch`, `gate`→`drawFoldGate`, `posts`→gate posts (needs `n>=nRuns`), `run`→pickets from `f0..f1` (last piece includes the end picket) + rail segment. Requires `o.q < stc picket`. Called from `drawProp` k===18 (9541). |
| `drawGarden` | 7548 | `(b)` | Raised bed (`hB=0.12`, inset 0.12) as a board box whose sides run down to sampled terrain (v9.19 fix for floating beds); `NR=5` rows if `b.big` else 3, at `Y0+0.45+r*0.5`; frost palette when `T.cold>0.5`; plants when done and not cold: `n=10` (3 wide) or 6, size `(0.05+crop*0.17)*EH*cam.z`, fruit at `crop>0.95`; apple tree when `stc apple>0`: height `0.45+age*0.7`, canopy `(0.18+age*0.22)*TW`, seasonal colour, 3 apples when `b.apples>0`. |
| `drawHive` | 7602 | `(b)` | Stand (legs at `st>=1`, board top at `st>=2`, `HW=0.24`), skep of 7 straw bands, doorway on the near face; **bees**: when done, season 0/1, `T.light>0.4`, `W.rain<0.3`, `T.cold<0.2`, `cam.z>0.9`, `vchance(0.08)` → particle to/from nearest done garden within 7 tiles. |
| `drawWell` | 7632 | `(b)` | Octagonal cobble ring (`wring` up to 6, 0.08 each, R=0.30), dark water + glint, 2 posts (`PX=0.26`, `zp=z+0.95`), beam + drum (turns `now*0.012` while `b.turnT>0`) + crank, little gabled roof (ridge `zp+0.34`, eave `zp+0.10`, overhang 0.14), rope + bucket (on the rim idle; rises over 3.5 s while drawn). |
| `drawFold` | 7679 | `(b)` | Legacy whole-fold renderer: fence + gate + hutch. |
| `drawFoldGate` | 7680 | `(b)` | Gate of 3 rails (0.09/0.20/0.31) + 2 uprights across `b.gate`; swings 90° outward (via `b.gateSide`) while `b.out`. |
| `drawFoldHutch` | 7692 | `(b)` | Box (`hw=0.30`, height `0.22*min(2,nH)`), round door facing the pen centre, mono-pitch board roof at `nH>=3` (lo `zt-0.02` → hi `zt+0.20`, overhang 0.08) with v9.18 edge boards and snow. |
| `drawKennel` | 7717 | `(b)` | Box (`hw=0.27`, `zt=z+0.02+0.16*nB`, up to 3), round door toward `b.fold` (else front), lid roof (`kroof>=1`, overhang 0.07) with edges and snow. |
| `drawStable` | 7732 | `(b)` | Stone footings (`found` 1–2 → 2 then 4 blocks via `stoneBlock`), 4 posts (`H=1.15`, back pair +0.18), rails on back/E/W at 0.42/0.80 (`srail` up to 3), hay rack on the back wall (`hay`: slats at 1, straw at 2), the stabled deer (`critters` with `st==='stabled'&&stable===b`), roof sloping to the front (`sroof` 1 = back half, 2 = full) with edge boards and snow. |
| `drawCart` | 7768 | `(b)` | Nothing if `b.hitched`; one wheel placeholder until `wheelc>=2 && bed>=1`; then `drawCartAt` (8550). |
| `drawTent` | 7783 | `(b)` | Two cloth sheets over a ridge (`ridge=zb+1.05`): cloth grows along the ridge with `nCl/3`, doorway triangle on the +y end at `nCl>=3`, drape shading, seams, pegged skirt (`nCl>=3 && cam.z>0.9`), snow, ridge pole, poles (up to 2), guy ropes (`peg` up to 2). |

### 3.6 Dispatcher and shared small renderers

| Fn | Line | Signature | What it does |
|---|---|---|---|
| `drawBuild` | 7829–7900 | `(b,p)` | Called from `drawProp` k===3 (9549). `s=30*cam.z`; returns if `s<2`. Spans/steps (`b.tiles||b.hidden||b.up`) only draw their yard. In progress: `drawYard` + type-specific partial renderer. Done: dispatch; optional drop-shadow ellipse (only if `DBG.shadows`); **fire**: stones + logs, ash disc when `b.out`, radial glow, midsummer **bonfire** when `b.bonfire===T.day && 0.70<T.f<0.95` (×1.75 size, cone logs, sparks `vchance(0.35)`), 3-tongue bezier flame flickering `0.8+0.2*sin(now*0.0021+ph)`; **pile**: `clamp(round(store.wood/2),1,9)` logs; trap/wheel/lantern delegated. |
| `drawWindmill` | 7902–7967 | `(b)` | Base ring (octagonal frustum, `0.22*base` high, up to 2), tower (`0.55*tower` high, radius `0.62→0.62-0.13*tw`, up to 3), door on +y, cap dome (3 ellipses), 4 sails (`RH=1.55, RV=0.86`, axle at `rt*1.05` on the back face, angle `b.spin`), cloth on 2 or 4 sails, hub; sails drawn behind or in front depending on `faceVis(SAIL_N)`; lamp over the door when `village.power`. Inner closures `drawSails` (7912), `ring` (7937). |
| `stc` | 7968 | `(b,k)` → count | `99` when `b.done||!b.plan`, else `b.stc[k]||0`. The whole section's progress oracle. |
| `snowOn` | 7970 | `(z)` → bool | `snowAt(z)>0.5 || W.snow>0.45`. |
| `drawFireSite` | 7972 | `(b,p,s)` | Fire under construction: ring stones (3 then 5), logs, no flame. |
| `drawLantern` | 7978 | `(b,p,s)` | **Screen-space** lamp post: post `0.98s`, curved iron bracket, chain, cap, amber pane (`#FFD98E` powered / `#F0BE6A`), glazing bar, foot, flame; lit when done and `T.light<0.5`; glow radius `1.6s` powered / `1.15s`. |
| `drawYard` | 8010 | `(b)` | Materials waiting at `b.yx,b.yy` (v9.20, world space): wood crib up to 8 logs (2 per layer, crossed), stone heap up to 6, reed sheaves up to 4; sorted by screen depth. |
| `shadowFp` | 8040 | `(b)` | Footprint shadow rectangle — only when `DBG.shadows` (default false → effectively dead). |

---

## 4. `drawHouse` in detail (7080–7307) — order of drawing

1. **Constants** (7081–7085): `FH=0.16` footing height; `zf=zb+FH`; `NCO=sp.courses||4`; `ztF=zf+0.25*NCO` (nominal wall top); `ridge=ztF+0.70`; `ov=0.16` roof overhang; seed from `b.x0,b.y0`. Piece counts: `nF` found, `nSW` chimwall, `nC` chim (≤2), `nW` wall, `nG` gable, `nR` ridge, `nS` shingle (≤4), `nWin` window, `nD` door.
2. `litW` (7084): windows glow when `b.done && T.light<0.65 && !b.out && doorK!=='none'`.
3. Course heights `CZ` with jitter (7087); `zt4=CZ[NCO]` is the real wall top.
4. `roofOn = nR>=1 && nS>=4` (7111); `hasFloor = sp.floor!==false && nF>=4` (7112).
5. Jetty behind the house first (7222); external chimney if its side is hidden (7223).
6. Props on hidden sides first (7229–7230).
7. **Interior** when `!roofOn` or the front is open and visible (7232–7243): far corner log ends, far walls' inner faces, their tops, lintels, inner slip, then the floor boards (`U-WT × V-WT`, boards every 0.22).
8. **Near walls** outer faces (7244), lintels, then **openings** (7246–7251): each window `[f,n]` of a visible wall when `nWin>n` and the wall top ≥ `zf+0.72`; window z `zf+0.40..zf+0.72`, half-width 0.15. Door on the front wall when `nD>=1`: `uf=(U-sp.door)/(2U)`, height `0.62` (`door`) or `0.70`.
9. Near wall tops if no roof (7252); near corner log ends (7253).
10. **Door lantern** (7255–7257): when front visible, done, (`b.lanternNight===T.day` or `sp.lamp`), `T.light<0.42`, placed at `door+doorW+0.16`, `zf+0.55`.
11. Craft signs on walls (7259–7261); near-side props (7262–7263); interior chimney if behind (7265).
12. **Roof** (7267–7303): `ze=zt4-0.02`; two slopes, front rows `clamp(nS,0,2)`, back `clamp(nS-2,0,2)`; far slope culled by `FV3(n.x, n.y*0.62, 1.0)` but its underside + 5 rafters show through an open near slope; rafters (5 lines) on an empty slope while building; each row via `roofRow`; **snow** cap when `snowOn(zb)&&nS>=4`; **wet** tint `rgba(40,48,80,0.13*wet)` + eave highlight; **rain drips** (3, animated) when `W.rain>0.25 && rows>=1 && nS>=2 && cam.z>0.9`; eave and verge edge boards `TH2=0.05` in a per-roof edge colour; ridge line.
13. Chimney in front (7304), jetty in front (7305).

### HOUSE spec table values (7037–7045)

| type | U×V (half-tiles) | courses | walls (front,right,back,left) | door / w / kind | roof / colours | chim | extras | beds | label |
|---|---|---|---|---|---|---|---|---|---|
| cabin | 1×1 | 4 | log, **stone**, log, log | -0.5 / 0.19 / door | shingle `#B49BB6/#A98FA8` | 0.13 | stoneP 4 | 4 | Log cabin |
| lodge | 1.5×1 | 5 | log×4 | 0 / 0.27 / double | shingle | 0.17 | porch | 0 | Village lodge |
| fisher | 1×1 | 4 | plank×4 | -0.5 / 0.19 / door | board `#8FA3B4/#7E92A3` | 0.11 | nets (+jetty) | 4 | Fisher's cabin |
| miner | 1×1 | 4 | stone×4 | -0.5 / 0.19 / door | slate `#7D8193/#6F7385` | 0.14 | stoneP 3, lamp | 4 | Miner's cottage |
| shepherd | 1×1 | 4 | log×4 | -0.5 / 0.19 / door | thatch `#D2B66E/#C3A75F` | 0.12 | hurdles | 4 | Shepherd's cottage |
| farmer | 1.5×1 | 4 | log, plank, log, plank | 0 / 0.28 / barn | board `#C08A72/#AF7B64` | 0.14 | loft | 4 | Farmhouse |
| woodcutter | 1×1 | 4 | log×4 | -0.5 / 0.19 / door | bark `#A0816A/#91735D` | 0.12 | stack | 4 | Timber lodge |
| workshop | 1×1 | 4 | plank×4 | 0.3 / 0.27 / double | board `#9CA0B0/#8C90A0` | 0.12 | bench | 0 | Engineer's workshop |
| boathouse | 1×1.5 | 4 | **open**, plank, plank, plank | none | board | 0 | slip, floor:false | 0 | Boathouse |

Window entries `[f,n]`: `f` = fraction along the wall, `n` = which `window` piece unlocks it.

The matching piece schedule is `housePlan` (3854–3882): 4 `found`, `stoneP×nStoneWalls` `chimwall`, `courses*2` `wall`, 2 `gable` per timber gable wall, 1 `ridge`, 4 `shingle` (material wood/stone/fibre by roof), 2 `chim`, N `window`, 1 `door`, 2 `porch`, 1 `net` + `jetty.len` `jetty`, 2 `hurdle`, 2 `stack`, 2 `bench`, 1 `loft`, 2 `slip` + 2 `ribs`.

---

## 5. Concrete rules and tuning numbers (consolidated)

**Geometry (tiles / levels):** `WT=0.13`; footing `FH=0.16`; course `0.25` (×0.88–1.12 jitter); ridge `+0.70` above nominal wall top; roof overhang `0.16`; roof edge `0.05`; eave `zt4-0.02`; window `0.40–0.72` high, half-width `0.15`; door `0.62` (single, arch +0.16) / `0.70` (double/barn); sill lip `0.035`/`0.05`; floor boards every `0.22`; porch depth `0.92`, posts `±0.62U`; jetty half-width `0.30`, boards `0.17`; fence pickets every `0.24`, `0.26` high, rail `0.17`, gate posts `0.40`; garden bed `0.12` high, inset `0.12`, rows `0.5` apart from `Y0+0.45`; hive stand `0.16`, `HW=0.24`; well `R=0.30`, rings `0.08` each (≤6), posts `0.95` high; hutch `hw=0.30`, `0.22`/piece; kennel `hw=0.27`, `0.16`/piece; stable `H=1.15`, rails `0.42/0.80`, roof overhang `0.18`; tent ridge `1.05`; windmill base `0.22`/piece, tower `0.55`/piece, radius `0.62→0.23`, sails `RH 1.55 / RV 0.86`.

**Textures:** cobble rows `0.17`, cols `0.19`, pebble `rx=(0.075+0.03j)·TW·z`, `ry=(0.055+0.025j)·EH·z·0.5`; boards `0.17`; slates `0.15`, 3 courses; shingles `0.19`; thatch 2×.

**Lighting:** `faceLight ∈ [0.74,1.04]`; inner faces `×0.80`; window lit `T.light<0.65`; door lantern `T.light<0.42`; porch lamp & lamppost `T.light<0.5`; powered colours `#FFF0C8/#FFD98E` vs `#F8DDA6/#F0BE6A`; glow radii `TW·z·0.9/1.25` (window), `1.1·TW·z` (door lantern), `1.2·TW·z` (porch), `s·1.15/1.6` (lamppost), `s·1.3` (mill).

**Weather:** snow when `snowAt(z)>0.5 || W.snow>0.45`; wet tint `0.13·W.wet`; rain drips `W.rain>0.25`; rafters/drips/pegs/rings/bees need `cam.z>0.9`; cobbles LOD below `cam.z<0.7`; `drawBuild` skips below `cam.z<0.067` (`s<2`).

**Animation:** smoke `vchance(0.10)/frame`, vz 0.35, life 2.2–3.4 s, drift `W.wind·0.06`; bees `vchance(0.08)`, 1.6–2.6 s; sparks `vchance(0.35)`; flame flicker `now·0.0021`; drum spin `now·0.012`; bucket rise over 3.5 s; drips `now·0.0011`.

**Fire/pile economy visuals:** bonfire window `0.70<T.f<0.95` on `b.bonfire===T.day` (set 5008); pile shows `round(store.wood/2)` logs (1–9); fire `b.out` ash disc (set 5777–5779 when wood runs out).

**Boat:** `BOAT_MAX` cap; ribs `7·clamp01(pr/0.5)`; gunwales `pr≥0.5`; planking `(pr-0.55)/0.4`.

---

## 6. UI elements / controls / input

None. This section has no DOM, no event handlers, no text rendering. The only "UI-ish" output is lit windows/lamps as feedback for night and power, and the visual progress of construction.

## 7. MODE 'creator' vs 'gnome'

Nothing in 6952–8044 references `MODE`, `PLAYER` or the avatar. Rendering is mode-agnostic. (Mode checks live in the gnome renderer/draw loop, e.g. 9550.)

## 8. Progression / unlock / economy touchpoints

- Construction progress is purely `b.stc` counts vs the plan (no costs here; costs are in `BT`, 2411+, e.g. cabin `w:18,s:10,work:54`).
- `village.power` (windmill running) brightens windows, lamppost, and lights the mill lamp.
- `store.wood` drives how many logs the pile shows.
- `boats`/`BOAT_MAX`/`b.boatProg` drive the boat on the stocks.
- Garden `crop`/`treeAge`/`apples` growth visuals (grown at 5788–5789).
- Festival hooks: `festival()==='harvest'` garland (7369); midsummer `b.bonfire`.
- `b.lanternNight` (set 4534 when an elder sets off) and `sp.lamp` (miner always).

## 9. Persistence

No save/load code here. The renderer depends on these persisted fields: `type, x, y, x0, y0, fw, fh, z0, rot, done, plan, stc, got, yx, yy, jetty, gate, gateSide, hutch, fold, out, crop, treeAge, apples, big, boatProg`. `_fpc/_fpcN` is a transient cache (underscore naming; should be excluded from save).

## 10. Mobile / touch / performance

- **LOD by zoom:** cobbles collapse to two bands at `cam.z<0.7` (6971–6972, explicit v9.20 perf note); rain drips, jetty water rings, tent pegs, bees only at `cam.z>0.9`; `drawBuild` bails at `s<2`.
- **Line-width floors** `Math.max(0.5, cam.z*k)` keep strokes visible at low zoom / high DPR.
- **Particle cap** 220 (2386) bounds smoke/bee/spark cost.
- **Fence piece cache** `_fpc` avoids re-splitting every frame.
- **No caching of house rasters**: every house is fully re-drawn each frame with hundreds of path ops (pebbles are `rows×cols` ellipses per visible stone face at close zoom; log walls 4 bands/course/face). With many stone houses at high zoom this is the hot spot. `houseFrame` allocates ~8 closures per call per frame per house.
- `ctx.save/restore` used around clips (plankFace, reveal, logEnd disc transforms).
- No touch handling here.

## 11. i18n (en/es)

- `HOUSE[*].label` strings are **English only** (`'Log cabin'`, `"Fisher's cabin"`, …). They are used by `houseLabel()` (2780) for event-log text. The Spanish table (`es:{h:'Aldea de Gnomos',…}`, 12203) does not cover them → untranslated log lines in Spanish mode.
- No other text is produced in this section.

## 12. Oddities, bugs, dead code, TODOs

1. **`drawCabin` (7079) is dead** — nothing calls it.
2. **`drawFence`/`drawFold`/`drawFoldGate`-via-drawBuild are effectively dead** in normal play: the draw loop (9686) `continue`s past fence/fold buildings when `DBG.fenceSplit!==false` and routes them through `fencePieces`/`drawFencePiece` instead. `drawBuild`'s `fence`/`fold` branches (7869, 7872, 7885, 7888) only run with the debug flag off.
3. **Unused locals:** `postsBehind` in `drawWell` (7651); `q` in `drawHive` (7620).
4. **`quad` (6954)** is unused inside the range (used elsewhere).
5. **`shadowFp` and the drop-shadow ellipses** (7877, 7974, 8040) are gated by `DBG.shadows` which is `false` by default (12041, "Jed — don't need shadows anywhere") → dead in practice.
6. **Inconsistent dusk thresholds:** windows `<0.65`, door lantern `<0.42`, porch lamp/lamppost `<0.5`. Probably intentional staggering but undocumented; a port should name these constants.
7. **Mixed paradigms:** houses, wells, fences, yards are world-space (rotate with the isle) but `drawLantern`, `drawFireSite`, fire, pile, trap, wheel take a screen point `p` and draw in screen space (bracket always to screen-right). Comments at 8011–8013 show the author migrating things to world space over versions.
8. **`fencePieces` cache key** is only `plan.length`; if `b.gate` is set after the first call with the same plan length the `posts/gate` piece would be missing until the plan grows. In practice the gate is set during planning (4061) so it is fine, but fragile.
9. **`houseFrame` is re-created on every call** including inside AI code paths each tick (3189, 4114, …) — allocation churn.
10. **Hard-coded colours** (~120 hex literals) with no palette table; the only "theme" is `lit()`'s time-of-day grade. Porting to a different art direction means touching every call.
11. `reveal` for `kind==='window'` draws a jamb colour `#B8987A` even on stone walls (cobble walls get timber-coloured jambs) — a minor visual inconsistency.
12. The chimney is not drawn until `nR>=1` (7210) even if `chim` pieces are laid; harmless because `housePlan` schedules `chim` after `shingle`.
13. In `drawJetty` (7402) `wp(x0-px*W2*-s, …)` — double negation, correct but confusing.
14. Comments cite tester feedback ("Jed: …") and version tags v9.14–v9.21 inline — useful changelog, but it would belong in a design doc for a new project.
15. No TODO/FIXME markers in the range.

## 13. Reusable engine vs gnome-specific content

**Reusable (engine/shell) — keep almost verbatim:**
- `wp/quad/poly`, `faceVis/faceLight/shade`, `h01` (6953–6965): the isometric box-drawing toolkit.
- Material primitives: `cobbles`, `logEnd`, `drawCobblePost`, `drawPost`, `plankFace`, `roofRow` (parametrised by material kind), `logRib`/`stoneBlock` (external).
- `houseFrame` + the **declarative kit pattern** (`HOUSE` spec → one renderer): local u/v frame with quarter-turn rotation, walls with materials, windows `[f,n]`, door spec, roof kind/colours. This is the most valuable reusable idea for Parque D'Amour's pavilions, kiosks, café, bandstand.
- `reveal` (openings with thickness: pane/leaf, jamb, sill, frame, glow) — generic.
- Progressive-construction oracle `stc()` and the "draw what has been laid" convention.
- `fencePieces`/`drawFencePiece` depth-splitting — essential for hedges/railings that characters walk behind.
- `drawYard` (material loads at a site), `snowOn`, weather overlays (snow cap, wet tint, drips), night glow pattern (radial gradient + pane colour), `drawBuild` dispatcher shape.
- LOD conventions (`cam.z` cutoffs, `Math.max(0.5,…)` widths).

**Gnome-specific (content) — replace:**
- Every `HOUSE` entry and label; the craft props (`drawNets`, `drawJetty`, `drawHurdles`, `drawLogStack`, `drawSawHorse`, `drawBench`, `drawPulley`, `drawLoft`, `drawSlip` + boat logic/`BOAT_MAX`).
- `drawGarden` (kitchen garden/apple tree), `drawHive` + bees, `drawWell`, `drawFold`/gate/hutch (rabbits), `drawKennel`, `drawStable` (+ stabled deer), `drawCart`, `drawTent`, `drawWindmill`/`SAIL_N`, fire/bonfire/pile/lantern branches of `drawBuild`.
- Festival garland (`festival()==='harvest'`), midsummer bonfire, `village.power`, `lanternNight`, hearth smoke rules, the purple-shingle/log palette.
- Material vocabulary `log/plank/stone/open`, roof vocabulary `shingle/board/slate/thatch/bark`, yard materials `wood/stone/fibre`.

**Mapping sketch for Parque D'Amour:** kit walls → `render | stone | ironwork | glass | open`; roofs → `slate | zinc | tile | canvas-awning | glass`; `reveal` kinds → `french-door | shutter-window | arch`; fence → `hedge | iron-railing | low-chain`; garden → `parterre/flowerbed`; well → `fountain`; lantern → `gas lamppost` (already close); tent → `kiosk/marquee`; yard → creator-mode material deliveries; smoke/bees → petals, fountain spray, café steam, fireflies.

## 14. Design questions for the Parque D'Amour port

1. Does Parque D'Amour keep **piece-by-piece construction** (`plan`/`stc`) visible to the player, or does Creator mode place structures whole? If whole, the progressive thresholds in `drawHouse` collapse to the done state and `drawYard` becomes a Creator-mode delivery animation or goes away.
2. What is the **structure kit vocabulary**: which wall materials (render, stone, ironwork, glass, open), roof kinds (slate, zinc, tile, awning, glass), opening kinds (French doors, shuttered windows, arches), and which park buildings (gazebo, bandstand, café, kiosk, boathouse, carousel, pergola) does the spec table need? Footprints (U×V), door positions, rotations?
3. Does the park **rotate** (4 quarter-turn views)? If yes, keep world-space geometry and `faceVis`; if the view is fixed, much of the culling can be simplified or structures could be pre-rendered.
4. Is the park **flat** or terraced? Terrain-conforming footings/beds (`eLerp` sampling, v9.19 fix) matter only on slopes.
5. Which **day/night, season and weather** states exist, and what lights up at dusk (café windows, lampposts, fairy lights)? Should there be one named dusk threshold instead of four?
6. What are the romance-game equivalents of the **"signs of the craft"** props — café chairs, a flower cart, a music stand, a painter's easel? Who owns a structure and does ownership change its look?
7. Hedges/railings: do characters walk **behind** them (needs `fencePieces` depth splitting) and can the player (sabotage) break them?
8. Do open-front structures (gazebo, bandstand, boathouse) need **visible interiors** with people inside (as the boathouse shows the boat)? Does the avatar enter buildings (`inN`) and should occupancy light windows?
9. **Sabotage/decay states:** the current renderer models construction progress only, never damage or neglect. Does the design need broken benches, dry fountains, graffiti, wilted beds, and if so as extra piece kinds or as a separate `damage` field?
10. **Palette/theme system:** replace ~120 hard-coded hex colours with a named palette (Haussmann cream, zinc grey, wrought-iron green, awning red). Which palette, and should Creator mode let the player recolour (awning colours, paint)?
11. **Mobile budget:** what zoom range on phones, how many structures on screen, and should houses be cached to offscreen canvases when static (only invalidated on construction/weather/time-of-day changes)?
12. **Particles:** which ambient effects (petals, fountain spray, café steam, fireflies, pigeons) replace smoke/bees/sparks, and under what conditions (season, time, romance state)?
13. **Events:** what replaces the harvest garland and midsummer bonfire — Bastille Day bunting, a fête, a wedding? How are they hooked (date-based `festival()` or story-state)?
14. **i18n:** structure labels need fr/en(/es) from day one; move labels out of the spec table into the string table.
15. Creator vs avatar mode: should the renderer show anything mode-specific (placement ghosts, selection outlines, footprint highlights) that is currently absent here?
