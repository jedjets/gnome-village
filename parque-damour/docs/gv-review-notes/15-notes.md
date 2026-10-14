# Gnome Village review — section 15: lines 8045–8847
## "Gnomes drawing, the ways and the steps (v9.22), ambient effects"

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Range read in full: 8045–8847 (803 lines). Symbols outside the range were resolved with grep only; line numbers for those are marked "(ext)".

---

## 1. Purpose of the section

This is a **pure render layer** on the 2D canvas (`ctx`). It contains no simulation logic, no input handling, no persistence and no user-facing strings. Four sub-blocks:

| Lines | Block | Role |
|---|---|---|
| 8045–8442 | **Gnome drawing** | `toolFor` (state → hand-prop), `swingCurve` (work-phase animation), `drawTool` (12 prop sprites), `hatPath`, `drawGnome` (the stick-figure rig: body lean/bob/crouch table, arm-angle table for ~60 states, carry loads, hat/hair/beard/face, chief sash, selection ring). |
| 8443–8627 | **Critters, cart, birds, spring, particles** | `drawRabbit`, `drawDeer`, `drawFox`, `drawCartAt`, `birdPerch`/`drawBirdAt`/`drawBirdOn`/`drawBirdFlying`, `drawSpring`, `drawPart` (14 particle kinds). |
| 8628–8815 | **The ways and the steps (v9.22)** | Turns the footfall array `WEAR` + the paving array `PAVE` into a cached list of "pieces": continuous worn-earth ribbons through tile centres, flagstones laid along the ribbon on paved tiles, hearth slabs round the fire, trodden-ground blend (`TROD`) for broad yards; plus `drawStepsTile` for stone steps cut into a slope. |
| 8816–8847 | **Ambient effects** | `ambientFx(dt)`: fireflies on warm dusks, spring-morning valley mist, storm lightning flash + delayed rumble, raindrop splashes/rings. All on the *visual* RNG stream (`vchance`/`vrnd`) so the sim seed replays identically with or without them. |

Design principle stated repeatedly in comments (8172, 8274, 8816–8818): the draw layer **never writes back to the sim** (e.g. an angler's screen-facing is computed locally, not stored on the gnome), and ambient decoration uses the visual RNG only.

---

## 2. Globals / state defined or mutated in this range

### Defined here
| Name | Line | Type / shape | Meaning |
|---|---|---|---|
| `SKIN` | 8046 | const string `'#F0DCCB'` | gnome skin colour |
| `LINE` | 8046 | const string `'#736C82'` | stick-figure line colour |
| `GH` | 8047 | const number `14.3` | grown gnome height in px at zoom 1 ("a little over half a level" — `EH=26`, ext 569) |
| `SWING_P` | 8081 | const object `{chop:1.10,quarry:1.30,building:0.80,dig:0.9,tinker:0.85}` | seconds per full tool swing per work state. **Shared with the sim**: `swingStep(g,dt,SWING_P.x,…)` at ext 2092, 5121, 5136, 5175, 5184, 5213 — the sim's strike fires at 70% of the period (ext 4550) and the draw's `swingCurve` hits 0 (struck) at phase 0.72, so sound/chips and the visual strike line up. |
| `BIRDC` | 8443 | const object `{robin:[body,breast], tit:[…], black:[…]}` | bird palettes |
| `UIFONT` | 8608 | const string `'"Figtree",system-ui,sans-serif'` | font for canvas text particles ('z', '!') |
| `ND8X`, `ND8Y` | 8629 | const arrays of 8 ints | 8-neighbour offsets, clockwise from +x |
| `pieceList` | 8630 | const array of piece objects | rebuilt by `buildPieces`; consumed in draw loop (ext 9726) and exposed to the harness `info()` (ext 12241) |
| `pieceEp` | 8630 | let number, init -1 | colour-epoch the pieces were built for; **mutated outside** at ext 9726 (`pieceEp=EP`) |
| `WORN_T` | 8637 | const number `2.6` | footfall at which a worn way shows |
| `pathAt` | 8638 | `Uint8Array(NC)` | 0 nothing / 1 worn way / 2 paved; rebuilt per colour epoch by `buildPieces` |
| `drawN` | 8639 | let number | frame counter for the ribbon outline cache; **incremented outside** at ext 9579 (`drawN++`, once per draw) |
| `mistN` | 8819 | let number | live count of 'mist' particles (cap 44) |

### Piece / curve object shapes (created in `buildPieces`, 8654–8702)
- Ribbon piece: `{at:tileIdx, curves:[cv…], own:[cv…], paved:bool}` — `curves` = every curve that reaches this tile (drawn clipped to this tile), `own` = the curves centred on this tile (used for far-LOD lines and slab placement).
- Hearth piece: `{i, at, hearth:true, fx, fy}` — `fx,fy` = the fire's position (first finished `fire` build, else the tile itself + 1 in y).
- Cloth piece (from outside, ext 9727): `{cloth:F, at:ti}` — the balloon envelope; `drawPiece` delegates to `drawClothTile` (ext 11670).
- Curve `cv`: `{i, hw, x0,y0, [cx,cy], x1,y1, [capA], [capB]}` in **tile units**; `cx` undefined ⇒ straight stub. `ribbonPts` caches on the curve as `cv._o={n:drawN,pts}` and `cv._i` (8704, 8716).

### Mutated here (defined elsewhere)
| Name | Where mutated | Notes |
|---|---|---|
| `PATHST` (ext 625, Uint8Array) | 8663–8671 | hysteresis state 0/1/2 per tile |
| `TROD` (ext 624, Float32Array) | 8663, 8670, 8673 | trodden-ground blend 0..1; read by the ground colour pass (ext 6732) |
| `pathAt` | 8663–8670 | see above |
| `W.flash`, `W.rumble` (ext 845) | 8837–8839 | lightning state |
| `parts` via `P(o)` (ext 2386) | 8832, 8846 | mist / ring / splash particles; also `fireflyFx` (8826–8827), `splashFx` from `drawSpring` (8602) |
| per-gnome transient `g._bf`, `g._fq` | **read only** here (8182, 8184) | written by the boat/balloon drawing (ext 11643, 11695) |

### Read-only dependencies (ext)
`ctx, now, cam{z,…}` (6331–6333), `T{f,light,season,cold}` (814), `W{rain,wind,wet,kind,flash,rumble}` (845), `DBG.shadows` (12041, **default false**), `selected`, `MODE` (5630), `tool` (11047), `critters/gnomes/builds/trees/parts` (1371, 1690), `E, WEAR, PAVE, STEPS, DAM, MINEB, OCC, BRIDGE, FLOW, WD` (614–631, 2996), `SVX/SVY` (6416), `C` palette (6445–6448), `FOGC` (6449), `cw, chh` (6331), `rotC, rotS` (6344), `SEA` (570), `N, NC, S` (567–568), `TW, TH, EH` (569), `TS` (6744), `FLOW_STREAM=0.5` (1349).
Helpers: `GC(hex,a)` cached lit-colour (6471), `lit`, `css`, `hx`, `mixc`, `shade`, `wRGBA`, `smooth`, `lerp`, `clamp01`, `vchance/vrnd/vrint` (visual RNG, 595–598), `screenOf`/`wp`, `eLerp`, `topAt`, `wetD`, `poly`, `quad`, `faceLight`, `faceVis`, `h01` (hash), `isChief` (3259), `villagePos` (2493), `screenCentreWorld` (11303), `sfxRumble` (6184), `drawClothTile` (11670).

---

## 3. Functions (every one in the range)

| # | Name & signature | Line | What it does | Called from |
|---|---|---|---|---|
| 1 | `levelNext(g)` | 8049 | true if the builder's next plan piece is `k==='level'` (earthwork) → spade instead of mallet | `toolFor`, `drawGnome` (8322) |
| 2 | `toolFor(g)` → string\|null | 8050–8079 | switch on `g.st` → prop kind: axe, pick, rod, mallet, shovel, sickle, basket, bucket, crook, shears, paddle (31 states mapped, incl. the `go*` walking states) | `drawGnome` 8334 |
| 3 | `swingCurve(ph)` → 0..1 | 8082–8088 | one swing cycle: ph<0.62 slow lift 0.30→1.0 (smoothstep); 0.62–0.72 quick strike 1→0 (quadratic); 0.72–0.84 tiny 3% rebound sine; 0.84–1 return 0→0.30. 1 = raised, 0 = struck | `drawGnome` body table 8215 & arm table |
| 4 | `drawTool(kind,hx,hy,ang,dirF,h,lw,g,extra)` | 8092–8160 | draws a prop at the hand `(hx,hy)` rotated by `ang` along its handle; `L=h*0.46` handle length, `W=max(0.9,lw*1.05)` handle width. Kinds: axe, pick, mallet (uses `ctx.roundRect` if available, 8116), rod (+ line to water with pink/white float; `extra.waterX/Y`, `extra.bite`), sickle, basket (upright; berries drawn if carrying food or state pickB), crook (upright staff), shears, bucket (upright; water fill when `carry==='water'` or state water), shovel, paddle | `drawGnome` 8341, 8358, 8360 |
| 5 | `hatPath(hr)` | 8161–8167 | the pointed hat outline (brim ±1.42hr, tip at −2.35hr) — "the same size on a child as a grown-up, which is the joke" (8161) | `drawGnome` 8206, 8370, 8427 |
| 6 | `dirFOf(g)` | 8168 | ±1 from `g.face` | `drawGnome` 8191 |
| 7 | `drawGnome(g,p)` | 8169–8442 | the whole figure; see §4 | draw loop ext 9550, under-sea pass 9960, balloon/boat 11643/11695/11999, harness 12227 |
| 8 | `drawRabbit(c,p)` | 8444–8466 | rabbit: swept-away variant (head+ears above water, wake), fleece scallops when `wool>0.3`, kit scale, hidden in hutch at night | ext 9552 |
| 9 | `drawDeer(c,p,rid)` | 8467–8505 | deer with walk cycle, optional cart behind (hitched), saddle blanket when tame, rider's load behind saddle, neck+head (grazing lowers head), ear, tail, antlers, eye; faces away from a groomer | ext 7753 (stabled), 9552, and `drawGnome` 8190 (`{ridden:true,g}`) |
| 10 | `drawFox(c,p)` | 8506–8549 | fox/dog: lying (curled, brush round front, paws, head on paws) vs trotting; red collar when tame; looks at its person when lying; food item (fish/berries/apple) drawn at `c.food` when `cam.z>0.7` | ext 9552 |
| 11 | `drawCartAt(x,y,s,f,g,hitched)` | 8550–8568 | cart: far wheel, bed with 3 board lines, side board, load (wood 5 logs / stone 5 / reeds 6), shafts, near wheel; spokes rotate `now*0.006` when hitched. Inner lambda `wheel(wx,wy,r)` 8552 | `drawDeer` 8472, ext 7773 (parked cart) |
| 12 | `birdPerch(b)` → {x,y} | 8569–8574 | screen point on top of the bird's tree (`Z=cam.z*TS*clamp(0.22+age*0.78)`, top blob) | `drawBirdOn`, `drawBirdFlying` |
| 13 | `drawBirdAt(x,y,col,face,s)` | 8575–8582 | body, breast, head, tail stroke, beak `#E7B97A` | `drawBirdOn` |
| 14 | `drawBirdOn(b,p)` | 8583–8587 | perched bird, `s=4.2*cam.z`, bob `sin(now*0.006+b.bob)*s*0.08`, facing from sign of `sin(b.bob)` | ext 9552 |
| 15 | `drawBirdFlying(b)` | 8588–8598 | lerp from perch to perch (or off-screen `±cw*0.6, −chh*0.3` if no target), arc `46*cam.z` px, wings flap `sin(now*0.03)` | ext 9976 |
| 16 | `drawSpring(sp,p)` | 8599–8607 | `s=cam.z*(9+lvl*3)`; **side effect**: `splashFx` with chance `0.05*lvl` per frame when `lvl>=2`; faint expanding double ring only while `tool==='spring'` (creator tool) | ext 9551 |
| 17 | `drawPart(p0,p)` | 8609–8627 | particle renderer, `a=l/m` alpha, `s=8*cam.z`. Kinds: dust, smoke (grows), chip, mist (radial gradient, radius `r*TW*z`), logf (floating log), spark, bee (jitter + yellow stripe), drop, splash (expanding ring on ground), ring (ripple on water), fly (firefly twinkle `sin(now*0.006+ph)`), heart (two arcs + triangle, `#EDA9C4`), zzz (text 'z'), note (text `p0.t` or '!') | ext 9550, 9960 |
| 18 | `pathTile(j)` | 8640 | bounds-checked `pathAt[j]>0` | `buildPieces` |
| 19 | `clipTile(x,y)` | 8642–8648 | `ctx.save()` + clip to the tile's projected quad fattened by `F=0.8` px outward from its centroid (hides hairline seams). Caller must `ctx.restore()` | `drawPiece` 8765, `drawStepsTile` 8790, ext 11673 |
| 20 | `pathHalfW(i)` | 8649 | half-width in tiles: paved 0.31; worn `0.15+0.14*clamp01((WEAR-2.6)/2)` → 0.15..0.29 | `buildPieces` |
| 21 | `curveAt(cv,t)` | 8652 | quadratic Bézier point (or linear stub) | ribbon code |
| 22 | `curveTan(cv,t)` | 8653 | unit tangent | ribbon code |
| 23 | `buildPieces(cs)` | 8654–8702 | rebuilds `pathAt`, `PATHST`, `TROD`, `pieceList`. Steps: (a) classify tiles (8663–8667); (b) broad-vs-narrow with 8-neighbour count hysteresis (8668–8671); (c) way tiles next to trodden ground take half its blend (8673); (d) hearth pieces for `PAVE===2` (8677); (e) for each way tile pick the two most-opposite path neighbours (max of `-cos` between offset vectors, 8683–8688) → one through-curve mid→centre(ctrl)→mid, a single neighbour → stub with `capB`, none → 0.02-tile dot with both caps (8691–8693); other neighbours → stubs from the centre (8694); (f) every tile within `reach=hw*1.5+0.06` of 9 samples × 3 lateral offsets gets the curve added (8697–8700). Inner lambdas `add` (8675), `mid` (8689). **Param `cs` unused.** | ext 9726 (only when `Z>0.35` and colour epoch changed) |
| 24 | `ribbonPts(cv,hw,key)` | 8703–8717 | projected outline polygon of the ribbon: 7 samples (`NS=6`) each side offset ±hw in world space, lifted `+0.015` level, with 5-point semicircular end caps where `capA/capB`; cached on `cv[key]` for the current `drawN` | `drawPiece` 8767–8768 |
| 25 | `wetLook()` | 8718 | `W.wet||0` | `drawSlab` |
| 26 | `slabHash(s,k)` | 8719 | deterministic 0..1 hash (`sin(s*12.9898+k*78.233)*43758.5453` frac) | `drawSlab` |
| 27 | `drawSlab(cx,cy,ang,len,wid,seed,fog)` | 8720–8737 | one flagstone: 8 points round an ellipse, radii jittered ±8%, len/wid ±10%, joined by quadratic midpoints (v9.22 note: the old 6-gon "read as a hexagon"); tone `0.94..1.06 × (1−0.14*wet)` on `C.pave`, edge `C.paveD` alpha 0.4 width `0.65*z`; fog mix | `drawHearthTile`, `drawPiece` |
| 28 | `drawHearthTile(pc,x,y,fog)` | 8738–8747 | Z<0.7: one 0.4-tile ellipse of pave colour alpha 0.7; else slabs tangent to the ring round `(fx,fy)`: 1 slab (len 0.6) or 2 at ±0.24 (len 0.42) when `Z>1.3`, width 0.34 | `drawPiece` |
| 29 | `earthCol(fog)` | 8748 | worn-earth colour: `C.track` when `T.cold>0.5` (snowy), else `mix(C.prep,C.dirtL,0.3)`; fog-mixed | `drawPiece`, `drawStepsTile` |
| 30 | `drawPiece(pc,fog,dirC)` | 8749–8776 | dispatch: cloth → `drawClothTile`; hearth → `drawHearthTile`; Z<0.7 → thin lines along `own` curves (width `hw*2*TW*Z*0.6`, paved alpha 0.85 / earth 0.5; **Z<0.45 unpaved hidden**); else clip tile, fill outer band (1.45×hw, alpha 0.17) then inner band (hw, alpha 0.42) for every reaching curve, then on paved tiles lay slabs along `own` curves (3 per curve if `Z>1.3` else 2; straight stubs `round(n*len)`; alternating ±0.03 side offset; sizes 0.36 or 0.5 × 0.40; isolated dot → single 0.5×0.42 slab). **Param `dirC` unused.** | ext 9964 |
| 31 | `stepDir(i,x,y)` → [gx,gy] | 8777–8786 | direction a step tile runs: from lowest to highest 4-neighbour step tile; else from the one step neighbour; else the ground gradient | `drawStepsTile` |
| 32 | `drawStepsTile(i,x,y,fog)` | 8787–8812 | `s=30*Z` (skip <3). Clip tile; earth cut band (±0.75 along, ±(K+0.07) across, alpha 0.55, `K=W+0.09`, `W=0.25`); 3 treads at f=−1/3,0,+1/3 (each ±1/6 long, full width ±0.25): riser quad when seen from below (`faceVis`), tread top `zTop=eLerp+0.025`, riser bottom clamped to [zTop−0.22, zTop−0.05], outline, nosing highlight, worn hollow ellipse `s*0.09×0.032`; paint order far→near by `fromBelow`; kerb stones both sides at `K`: shadow ellipse, stone (4-grey palette, hashed size `0.07*TW*Z*(0.9..1.1)`, hashed tilt ±0.2 rad), highlight. Inner lambda `tread(k)` 8797 | ext 9812 (`fine&&STEPS[i]&&Z>0.4`) |
| 33 | `ambientFx(dt)` | 8820–8847 | see §4.6 | ext 12091 (main loop, `dtr` real dt) |

Inner closure in `drawGnome`: `B(t)` 8267 — Bézier point on the spine used to place the chief's sash.

---

## 4. Concrete rules and tuning numbers

### 4.1 Gnome size and LOD gates (drawGnome)
- `h = GH*cam.z*(g.h/19)` (8186); `heightOf`: baby 8, child 13, elder 17, adult 19 (ext 1377) → adult 14.3 px at zoom 1.
- `h<3` → not drawn (8187). `inside` (in a building) → not drawn (8170).
- Hat radius: baby `h*0.135`, everyone else `GH*cam.z*0.135` — a grown-up's hat regardless of body (8188).
- Tool drawn only if `h>4` (8341, 8356). Eyes if `h>10` (8407). "Close" detail (tunic, belt+buckle, hands, nose, cheeks, hat band) if `h>18` ≈ zoom ≥ 1.3 (8259, 8265, 8359, 8411, 8428). Chief sash if `h>7` (8266).
- Rig proportions (8240): hip `−0.30h`, shoulder `−0.56h`, head centre `−0.72h`, head radius `0.135h`, line width `max(0.9, 0.075h)`, arm length `0.27h`, shoulder x offset `bend*0.30h`.
- Leg swing amplitude: walking `0.15h`, swept `0.12h`, floating `0.06h` (8239); sitting legs folded (8248); chop/quarry legs braced (8250).
- Hop arc: `sin(clamp01(hop/0.45)*π)*0.22h` (8195). Sleep: rotate `face*1.35` rad (8194). Swim: sink `0.28h*swim` when `swim>0.3` (8199). Climb: rotate `face*0.22` (8200). Floating (parachute hat): rise `z*EH*z` + bob (8197).

### 4.2 Body language table (8212–8237) — lean (rad), bob/crouch (×h)
chop lean `face*(0.16−0.22*sw)`, bob `0.06(1−sw)`; quarry `0.10−0.14sw`, bob `0.09`; building crouch 0.22, lean 0.08, bob 0.02; tinker lean 0.07; fibre crouch 0.16, lean `0.22+0.10 sin(now*0.006)`; pickB crouch/lean on `sin(now*0.005)`; collect crouch 0.14; tend/harvest crouch 0.18 lean 0.14; patDog crouch 0.15; groom sway 0.007; snow crouch 0.20; drain crouch 0.10 + spade swing; haul lean back wood 0.06 / stone 0.14 / other 0.08; fishing lean −0.16 (bite) / 0.05; stones sway `sin(work*4)`; row crouch 0.24, lean follows `inBoat.stroke`; netFish crouch 0.24; boating (hat-boat) crouch 0.30; any other sitting crouch 0.24.
Sitting states (8201): story, listen, huddle, dine, boat/adventure, chat (only even `g.id`), riding without cart, row, passenger, netFish.

### 4.3 Arm-angle table (8272–8331)
`aF` front arm, `aB` back arm, radians (positive = raised). ~55 branches, priority ordered. Highlights with numbers: floating 1.30/1.30; glider aloft 1.72 (hanging from bar); balloon pilot at burner 2.2/−0.3 when `burn>0.4`, else −0.25; passenger waving 2.55±0.35; carryGlider/atSummit 1.75; cheering watcher 2.35±0.4 when `cheer>0`; child passenger waves on `sin(now*0.004)`; help/heave 1.35±; wave 2.55; wood on shoulder 1.05/−1.05; stone hugged −0.42; food basket −1.0; water pail −1.05; chop `lerp(−0.08,1.40,swing)` two-handed, toolRot 0.25; quarry `lerp(−0.40,1.80)`, toolRot 0.2; building (mallet) `lerp(−0.25,0.85)`, toolRot 0.35; earthwork/dig/drain `lerp(−0.45,0.6)` two-handed toolRot −0.2; tinker `lerp(0.15,1.05)`; fishing two-handed toolRot 0.55 (bite) / 0.80; dance 1.25±0.45; `go*` with tool over the shoulder toolRot 1.7; swimming ±0.8 on `walkPh*1.3`; lying −0.75/−1.25; hat in hand −1.1/−0.55; default idle −1.18 ± `0.55 sin(walkPh)` (walking) or ±0.07 breathing.
- Two-handed: back hand placed `0.12h` down the handle from the front hand (8337). `toolBack` draws the prop in the back hand (harvest, draw, goCatch, pickB, collect). Fishing rod gets `extra={waterX,waterY,bite:g.t<1.6}` so the line ends on the actual water tile (8358).
- "Bite" = `g.t<1.6` on the fishing timer (8229, 8325, 8358).

### 4.4 Identity visuals
- Carry loads: wood log across shoulder (8343), stone hexagon in front hand (8347), reeds fan from back hand (8350), food = basket prop (8360), water = bucket prop via `toolFor`. A rider's load is drawn on the deer/cart instead (`cr=null` when `g.ride`, 8171; `drawDeer` 8483; `drawCartAt` 8560).
- Caught rabbit's ears over the basket in state `goPen` (8361).
- Hat in hand (`g.hatHand`) drawn at the back hand, rotated `dirF*1.25` (8366–8374). Hat is the boat in state boat/adventure (upside down, scaled 1.25×−0.62, 8203–8209); the rowing adventurer gets a wooden boat instead (8182–8202). Floating: hat is a parachute scaled 1.75 with two strings to the hands (8418–8426).
- Female: long hair `L` baby 0.95hr / child 1.55hr / adult 2.10hr, elder hair `#E4E1EA` (8375–8386); fringe when female or hat off (8397–8405). Male adult/elder: beard, elder longer (2.5 vs 1.9) and whiter (8390–8396). Eyes offset `0.34hr`, radius `0.16hr` (8408–8410). Hat colours from `HAT_F` pinks / `HAT_M` blues (ext 1366–1367).
- Chief sash: red `#9E3B3B` + gold `#E2B04A` from spine t=0.80 to 0.22 (8266–8271), gated by `isChief(g)`.
- Selection ring (8435–8441): pulsing white ellipse `h*0.40 + 1.2z*t` by `h*0.16 + 0.6z*t`, alpha 0.5–0.75, fill alpha 0.10 — **suppressed for the player's gnome in gnome mode** (that one gets `playerRing`, ext 9550).

### 4.5 Critters / props
- Rabbit `s=7.5z × 0.7 kit × (1+0.22 wool) × 0.85 in fox's mouth`, skip <2; hidden `inHutch && T.light<0.35` (8445–8446); fleece from `wool>0.3`, 8 scallops (8456–8458); eye if `s>4`.
- Deer `s=15z × 0.62 fawn`, skip <3; leg swing freq 0.010 (0.022 fleeing); tame blanket `#C96A7A`/`#F0D9A8` + girth; head lowered by `c.head` when drink/graze/eat; antlers if `c.antl && s>5`.
- Fox `s=9.5z × 0.65 cub`, skip <2.5; trot freq 0.018; colours body `#D4885A`, dark `#9E5A36`, pale `#F4E8DC`; collar `#C83C3C` when tame; looks at master/patter within 2.5 tiles when lying.
- Cart wheel radius `0.19s`, far wheel 0.9×; bed from `−0.42s` to `+0.34s`.
- Birds `s=4.2z`, skip <1.6; flight arc 46z px; wing flap `0.03` rad/ms.
- Spring ring: two rings cycling at `now*0.0006`, alpha `1−f`.
- Particles: `s=8z`; smoke grows `0.40→1.0 ×s`; splash ring expands `0.10→0.52 ×s`; water ring `0.3→1.9 ×s`.

### 4.6 The ways (v9.22)
- `WEAR` (ext 619) grows `dt*0.42*S*(1+0.6*min(1,W/1.2))` per footfall, capped at **4** (ext 1680); decays ×0.9975/tick below 0.6, ×0.99945 above (ext 1685). Comment at 8637: village paves from **2.8**, a lantern's spot is **1.8**.
- Tile excluded from ways when `wetD>0.15 || BRIDGE || OCC || STEPS || DAM || MINEB || E<=SEA+0.5` (8663).
- `PAVE===1` → paved way (pathAt 2); `PAVE===2` → hearth piece; worn hysteresis **on at WEAR≥2.6, off below 2.1** (8666).
- Broad vs narrow: a way tile with **≥5** of 8 neighbours path/paved becomes trodden ground (PATHST 2, not a ribbon); back to a ribbon at **≤3** (8669). Trodden blend `TROD=clamp01((WEAR−2.0)/1.6)` (8670); a ribbon tile beside trodden ground takes half the max neighbour blend (8673). A worn tile with **no** path neighbour shows nothing (a "scuff").
- Through-curve: the pair of neighbours whose offset vectors are most nearly opposite (8683–8688).
- Reach for neighbour-tile painting `hw*1.5+0.06` tiles (8697).
- Pieces rebuilt only when the colour epoch `EP` changes (ext 9587: every 220 ms, or 110 ms while the camera turns) and only when `Z>0.35` (ext 9726).
- Ribbon lift `+0.015` level above ground; slabs `+0.02`; far-LOD lines `+0.01`; steps cut `+0.012`, treads `+0.025`, kerbs `+0.05`.

### 4.7 Ambient (ambientFx)
- Skipped entirely when `cam.z<0.45` (8821).
- Warm = `season≠3 (winter) && cold<0.2 && rain<0.25`; dusk = `light<0.32 && f>0.5` (evening half of the day). Seasons: 0 spring, 1 summer, 2 autumn, 3 winter (ext 2189, 4704, 6671, 10858).
- Fireflies/second near the village (±7 tiles, dry land, not occupied): `(summer 3.2 : 1.2) × clamp01((0.32−light)/0.2)`; over still water (`wetD>0.1, E>SEA, FLOW<0.5`) at half that rate with 10 random tries (8824–8828).
- Mist: spring only, `0.19<f<0.36`, `rain<0.4`, `cold<0.3`, amount `clamp01(1−(f−0.19)/0.17)`; spawn chance `dt*6*amt`, cap `mistN<44`, 12 tries for low ground `SEA−0.2 < E < SEA+2.2` not occupied; particle life 9–15 s, radius 1.2–2.0 tiles, drifts with wind `×0.04` (8831–8834).
- Lightning: `W.flash` decays with half-life **45 ms**, snapped to 0 below 0.02; `W.rumble` counts down then `sfxRumble()`; a storm with `rain>0.6` triggers a flash with chance `dt/22` (≈ one per 22 s) and a rumble delay `0.6–2.0 s` (8837–8839).
- Rain impacts: when `rain>0.25 && cam.z>0.7 && parts.length<360`: `round(rain*5)` tries per frame around the screen-centre world point ±9×±6 tiles, on-screen only; water → 'ring' (life 0.5 s), ground → 'splash' (life 0.3 s) (8841–8846).

---

## 5. UI elements, controls, input handling
None in this range. Indirect UI couplings:
- `selected===g` (8435) — the selection ring for the Creator's tapped gnome (`tapSelect`, ext 11223).
- `tool==='spring'` (8603) — the Creator's Spring tool makes springs visible as rings so they can be tapped away.
- Canvas text uses the UI font Figtree (8608) so 'z'/'!' particles match the HUD typography.

---

## 6. MODE 'creator' vs 'gnome'
- Only one reference: 8435 `if(selected===g && !(g.player && MODE==='gnome'))` — in gnome (avatar) mode the player's own gnome does not get the generic selection ring; the draw loop draws `playerRing` for it instead (ext 9550). Everything else in this range is mode-agnostic.
- `drawSpring`'s ring is gated by the Creator tool `tool==='spring'`; `setMode('gnome')` forces `setTool('hand')` (ext 11256), so springs are invisible in gnome mode.

---

## 7. Progression / unlock / economy
Nothing is decided here, but the renderer *reflects* progression state owned elsewhere: chief sash (`isChief`), tame deer blanket and fox collar (`c.tame`), rabbit wool growth, kits/fawns/cubs scale, hearth slabs round a finished `fire`, paving (`PAVE` set by `pave`/`hearth` builds, ext 3664–3666, 4164), builder's earthwork (`levelNext`), the balloon/glider states (aloft, flyPrep, carryGlider, atSummit, watch/cheer), elder colours. Wear→worn way→paved is the emergent "the village paves where it walks" loop; the threshold ladder 1.8 (lantern) / 2.6 (way shows) / 2.8 (village paves) / 4 (cap) is the visible part of it.

## 8. Persistence
None. `pathAt/PATHST/TROD/pieceList` are derived caches rebuilt from `WEAR/PAVE` each colour epoch; nothing here is saved or loaded.

## 9. Mobile / touch / performance tricks
- Size-based culling on every actor: gnome `h<3`, rabbit `s<2`, deer `s<3`, fox `s<2.5`, bird `s<1.6`, spring `s<3`, steps `s<3`; detail tiers at h>4 / 7 / 10 / 18.
- `GC(hex,alpha)` memoises lit CSS colour strings per time-of-day bucket (ext 6471) — every stroke here goes through it.
- Ribbon outlines cached per frame on the curve object keyed by `drawN` (8704, 8716) so a curve reaching 3 tiles is projected once.
- `buildPieces` runs per colour epoch (≈4.5 Hz, 9 Hz when turning), not per frame; pieces bucketed by tile cell (ext 9726) so painter's order is preserved ("a hill in front still hides them", 8628).
- Far-LOD for ways (`Z<0.7` lines; `Z<0.45` unpaved hidden) and hearths (`Z<0.7` ellipse); slab count 2→3 and hearth 1→2 above `Z>1.3`.
- `clipTile` fattens by 0.8 px to avoid seams instead of anti-alias tricks; one `save/clip/restore` per path tile per frame (the main cost of this system).
- Particle budget `P()` caps `parts` at **220** (ext 2386); mist additionally capped at 44 because each is a `createRadialGradient` per frame (8613).
- `ambientFx` off below zoom 0.45; rain impacts only above 0.7 and only on-screen.
- `ctx.roundRect ? … : ctx.rect` feature check (8116) for older mobile browsers.
- `DBG.shadows` default **false** (ext 12041): the actor ground shadows (8244, 8453, 8474) are off in production.

## 10. i18n (en/es)
No user-visible strings in this range. The only canvas text is the glyph `'z'` (8625) and `p0.t||'!'` (8626); 'note' text is set by the spawner elsewhere. The es/en table lives at ext 12200–12206 and is not consulted here.

## 11. Oddities, bugs, dead code, TODOs
1. **Unused parameters**: `buildPieces(cs)` never uses `cs` (8654); `drawPiece(pc,fog,dirC)` never uses `dirC` (8749; called with `dirtC` at ext 9964).
2. **Misleading particle guard**: `ambientFx` checks `parts.length<360` (8841) but `P()` refuses pushes at 220 (ext 2386), so the 360 check never binds and raindrop rings are silently dropped whenever the pool is full of other particles.
3. **Stale duplicate comments** at 8813–8815 ("a flagstone…", "the hearth…") repeat the headers already above `drawSlab`/`drawHearthTile` — leftovers from moving code.
4. **Latent NaN**: in the hat-in-hand branch (8368) `Math.cos(aB)` is used directly, but the two-handed branches (chop 8300, quarry 8301, fishing 8325, dig/drain 8328, earthwork 8322) never assign `aB`. Elsewhere the code guards with `aB===undefined?aF:aB` (8336). If `hatHand` is ever non-zero during one of those states, the hat is drawn at NaN (vanishes). Probably unreachable today (`hatHand` is cleared when jobs start, ext 2060, 4660, 4744).
5. **Draw function with sim-visible side effect**: `drawSpring` spawns `splashFx` particles (8602) — on the visual stream so the seed is safe, but it depends on the spring being on screen and `s>=3`, so splashes stop when zoomed out.
6. **Shadowing of globals**: `const hx=…` inside `drawDeer` (8492) and `drawFox` (8524, 8543) shadows the global colour helper `hx()`; `const … W=wid*…` in `drawSlab` (8723) and `W=0.25` in `drawStepsTile` (8789) shadow the weather object `W` (the latter is why `wetLook()` exists as a separate function). Fragile but currently correct.
7. `drawTool('rod')` does `ctx.restore(); ctx.save();` mid-function (8125) to leave the handle rotation — relies on exactly one outer save; fine but brittle.
8. Hearth orientation uses the **first** finished fire in `builds` (8656); with several villages every hearth ring orients to that one fire.
9. `drawGnome` references `now` (global ms clock) for all idle motion, so paused sims still breathe/wave — intended ("decoration on the visual stream") but worth knowing.
10. The comment block 8631–8636 embeds the owner's change request ("Jed (09/10/2026): Stairs and pathways to be more aesthetically pleasing") — a design log in code.
11. Version tags scattered through comments (v9.14–v9.24) show this section has been revised many times; `toolFor` and the arm table are the main growth points (each new behaviour added a case).
12. `goTinker`, `goTend`, `goHarvest`, `goWell`, `goWater`, `goPen`, `goFold`, `herdWalk`, `herdBack`, `goBush` map to a prop in `toolFor` but are not in `goingWithTool` (8276), so the prop hangs at the idle arm angle rather than over the shoulder — intentional for baskets/buckets/crooks.

## 12. Reusable engine vs gnome-specific content

### Reusable as-is or with a palette swap
- **Work-phase animation pattern**: `SWING_P` + `swingStep` (sim) + `swingCurve` (draw) sharing one period so sound/particles/pose line up (8081–8088).
- **State→prop map + prop sprite switch** (`toolFor`, `drawTool`): generic "what is in the hand" architecture; prop shapes are content.
- **Stick-figure rig** in `drawGnome`: hip/shoulder/head proportions, lean/bob/crouch table, front/back arm angle table, two-handed tool placement, carry-load hooks, size-based LOD tiers, screen-facing overrides computed locally (face the dog / the water / the flyer) — the structure ports directly; the ~60 state branches are content.
- **Selection ring** (8435) and its mode exception.
- **Particle renderer** `drawPart`: kinds heart, zzz, note, mist, smoke, dust, spark, splash, ring are game-neutral; bee/logf/chip/fly are content.
- **Birds** (perch on a tree top, hop between trees, arc flight) — generic small-fauna pattern.
- **The ways system** (8628–8776): entirely data-driven from `WEAR/PAVE/OCC/…` arrays; the ribbon-through-tile-centres algorithm, hysteresis, broad-vs-narrow, per-tile clipping, slab placement, far-LOD. Only `earthCol`/`C.pave` palette and the hearth-round-the-fire are content.
- **Steps tile renderer** (`stepDir`, `drawStepsTile`) — generic terrace stairs.
- **ambientFx skeleton**: visual-RNG decoration gated by zoom, season/time/weather predicates, particle caps, lightning flash/rumble pattern, on-screen rain impacts.
- Helpers it leans on (ext): `GC` colour cache, `clipTile`, `wp/screenOf`, `faceLight/faceVis`, `h01` hash, `slabHash`.

### Gnome-specific content
- The hat as identity and gag (child-size hat, hat-boat, hat-parachute, hat in hand), beard/hair/sex/stage rules, pink/blue hat palettes, chief sash.
- Prop set (axe, pick, rod, mallet, shovel, sickle, basket, bucket, crook, shears, paddle) and the loads (wood/stone/reeds/food/water).
- Rabbit/deer/fox/cart drawings and their tame/wool/fawn/cub/collar rules; riding and carting.
- Hearth slabs round the fire; worn-earth colours; `WORN_T`/paving ladder tuned to gnome footfall rates.
- Fireflies/mist/storm seasonality tied to this world's `T`/`W` model and the sea-level isle.
- Flight states (balloon pilot/passenger/glider/watchers), swept/float/flood states.

## 13. Design questions for the Parque D'Amour port raised by this section
1. **Avatar rig**: keep the stick-figure + signature prop? What replaces the hat as the instantly readable identity/joke (beret, parasol, scarf, baguette)? Does the "same hat on a child" gag have an equivalent?
2. **Identity palette**: hats are pink (f) / blue (m) by sex. What marks characters in the park (coat colour, the two lovers' complementary colours, NPC vs lover)? Should sex drive any visual at all?
3. **Action vocabulary**: list every park-goer state that needs a pose and prop (stroll, sit on bench, read, paint, feed pigeons, picnic, buy ice cream, row on the pond, kiss, argue, propose, dance, play pétanque, walk a dog…). Each is one `toolFor` case + one arm-table branch + one body-table branch.
4. **Rhythmic work**: which actions are periodic enough to use `SWING_P`/`swingCurve` (painting strokes, pétanque throw, accordion, rowing) and should sound/particles sync to the strike?
5. **Romance visualisation**: the heart particle exists; what else shows attraction/jealousy/awkwardness (facing logic toward the beloved as with the dog/flyer, blush at close zoom, gaze lines, note particles with text)? Which are visual-only vs sim-driven?
6. **Paths**: a French park has designed gravel allées. Keep emergent desire-lines from `WEAR` (lawn worn where people cut across — could be a sabotage/assist lever), creator-placed paved paths (`PAVE`), or both? What are the park's thresholds for "a line shows" / "the gardener paves it"?
7. **Hearth analogue**: slabs round the fire → slabs round a fountain/bandstand/statue? Multiple centres (fix the first-fire assumption)?
8. **Steps/terraces**: does the park have level changes needing `drawStepsTile` (terraces, a grotto, the pond bank)? Same grey-stone palette or Parisian limestone?
9. **Fauna**: pigeons, ducks/swans, sparrows, a leashed dog, cats. Which get the fox-style "tame → collar → follows its person" pattern? Which perch (birds on benches/lamps rather than trees)?
10. **Vehicles/props**: cart → pram, ice-cream cart, bicycle, rowing boat (rowing pose already exists). Which are ridden vs pushed?
11. **Ambient effects**: swap fireflies/valley mist for falling leaves, blossom petals, lamplight haloes at dusk, umbrellas in rain, pigeons scattering? Which seasons/times trigger each? Keep the lightning/rumble pattern?
12. **Zoom range and detail tiers**: how close does the camera get to the couple? The face details only appear at `h>18` (zoom ≳1.3); a romance game may want expressions readable at the default zoom, i.e. a larger base `GH` or lower tiers.
13. **Modes**: in avatar mode the player's own figure skips the selection ring (`playerRing` instead). Does the Creator mode need multi-select or a "the lovers" highlight? Does the avatar have creator powers that need tool-gated overlays like the spring ring?
14. **Night**: fireflies and the pulsing ring exist "so the one followed is found at night". Is the park open at night; what lights it (lanterns, the moon)?
15. **Performance budget**: a park would have far more path tiles than a village; per-tile `clipTile` ribbons and 220-particle cap may need re-tuning for mobile. Decide the particle vocabulary size and the mist-style gradient budget early.
16. **Weather coupling**: `earthCol` goes to the snowy `C.track` when `T.cold>0.5`; `drawSlab` darkens 14% when wet. Keep the same weather model (`T`, `W`) so these hooks stay free?
