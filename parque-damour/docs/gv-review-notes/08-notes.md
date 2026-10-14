# Gnome Village review — section 08: lines 3487–4221
## "Built stands on ground (v9.10)" + "real construction"

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Range read in full: 3487–4221 (three slices: 3487–3730, 3731–3980, 3981–4221). A few greps outside the range were used only to resolve symbols (BT table at 2411, HOUSE at 7036, undo restore at 11095–11110, the two external callers of `collapseBuild`/`sweepBridge` at 2004 and 3324, the debug export object at ~12225).

---

## 1. Purpose of the section

Three sub-systems live here, in order:

1. **Foundations / collapse (3487–3584).** Every build has a set of "foundation tiles" (`foundTiles`). After a player raise/lower stroke, `checkFoundations` compares the ground now against the undo snapshot of the ground when the stroke began; any build whose foundation moved more than `FOUND_MOVE` (0.5 level) is brought down by `collapseBuild` (salvage to store, gnomes on it dunked, undo-able). `sweepBridge` is the weather variant: a spate carries off a log bridge and queues a plank-on-piers replacement.
2. **Site geometry helpers (3585–3657) and completion (3658–3721).** `damRun` finds a bank-to-bank line for a dam and computes the wall height; `stepsChain` grows a staircase up a slope; `finishBuild` is THE completion hook that writes a finished build's effects into the tile arrays and village/household state and logs the event; `retireTents` is an older tent-retirement routine (now only exposed for debugging).
3. **Nearest-X query helpers (3718–3826)** used by the gnome AI: drop points (racks/piles), fires, roofs, traps, trees, bushes, rocks, grass, shores, and the periodic `IDX` spatial index that caches shore/grass/calm-water tiles every 1.8 s.
4. **Real construction (3827–4221).** Since v9.4 every build is a *plan*: an ordered list of *pieces* (`pc(material, kind, standPoint, extra)`). `makePlan` writes the plan per build type (and `housePlan` for all HOUSE types), `stageProject` initialises a project for piece-by-piece building, and the runtime loop is `siteJob` (hand a gnome a job: fell, level, lay, fetch, chop, quarry, cut reeds) → `deliver` (drop a load at the yard) → `placePiece` (lay the next piece, which may immediately make a bridge tile walkable via `tileLaid`) → `finishBuild`.

The architecture is: **data-driven cost table (`BT`) + per-type procedural plan + generic site job dispatcher + per-piece drawing elsewhere (drawing code reads `b.stc` / `laidOn` at ~10210+).** This is the part of the engine most worth lifting for a new game, minus the per-type content.

---

## 2. Globals / state defined or mutated here

### Defined in this range
| Name | Line | Type / shape | Meaning |
|---|---|---|---|
| `FOUND_MOVE` | 3497 | const number 0.5 | Max ground movement (levels) a foundation tolerates before collapse. |
| `DAM_RISE` | 3596 | const 0.35 | Dam crest sits this far above the river surface at the line. |
| `DAM_BANK` | 3596 | const 0.40 | Each dam end must be banked to wall+0.40. |
| `EARTH` | 3596 | const 0.6 | Max earthwork (levels) a builder will cut/bank per tile (also used in `makePlan` ring prep: `d<=EARTH+0.3`). |
| `IDX` | 3781 | `{shores:[{x,y,dx,dy}], grass:[tileIdx], calm:[{x,y,dx,dy}], t:number}` | Spatial index of fishable shores, reed-grass tiles, calm deep water; `t` is the refresh countdown. |
| `STAGED` | 3836 | `{type:1,...}` set of 26 build types | Which build types are built piece by piece (consumed at 2733 `placeBuild`: on a staged site the gnomes fell trees themselves). |
| `MK` | 3837 | `{wood:'w',stone:'s',fibre:'f'}` | Material → BT key map. **Unused anywhere (dead).** |
| `LOAD` | 3838 | `{wood:3,stone:2,fibre:2}` | Units one gnome carries from the store per trip. |
| `PREP_RING` | 3842 | set of 13 types | Types that get a one-tile levelled "yard" around the footprint. |
| `prepT` | 3848 | let number | Accumulator for `prepFade` (runs once per second). |

### Mutated here (defined elsewhere)
- Tile arrays (all `NC`-sized, defined 612–670): `E` (ground height; `finishBuild` 3667 and `tileLaid` 4185 raise dam tiles to `b.wall`; `placePiece` via `levelTile`), `WD` (water depth zeroed on dam tiles), `SOIL` (zeroed on dam tiles), `BRIDGE` (deck height; set 3661/4179/4181/4183, cleared 3524/3573), `PIER` (3524/3573/3661/4178), `DAM` (3524/3667/4185), `PAVE` (3525/3664/3666/4164; 1 = path, 2 = hearth), `STEPS` (3526/3663/4165), `PREP`/`PREPF` (3846–3849), `OCC` (read only here).
- `store.wood/stone/fibre/food` (salvage 3521; `retireTents` 3713; `deliver` doesn't touch store, it debits `g.cAmt`).
- `builds[]` (removed via `removeBuild`, 3542/3576/3714; spliced on plank upgrade 3662).
- `village.queue`, `village.project`, `village.project2`, `village.sawmill` (3541, 3560, 3583, 3660, 3668).
- `undoStack[top].fallen[]` (3528) — the collapse is recorded on the current undo entry.
- Per-build fields written: `b.fell` (3517), `b.done`, `b.doneT`, `b.plan`, `b.pi`, `b.got`, `b.stc`, `b.need`, `b.work`, `b.prog`, `b.yx/yy` (yard), `b.cost`, `b.plot`, `b.plotOn`, `b.chain`, `b.round`, `b.gate`, `b.gateSide`, `b.gateAt`, `b.hutch`, `b.crop/apples/treeAge/tendT/applesYear`, `b.honey`, `b.out/herd/shornYear/kitT`, `b.fold`, `b.cart`, `b.at`, `b.boatProg`, `b.kids`, `b.moveFrom`, `b.up.type/uses/upgrading`.
- Per-home fields: `home.garden`, `gardenTried`, `fence`, `gardenFenced`, `fenceTried`, `stepPath`, `bank`, `flooded`, `hive`, `owners`, `kids`.
- Per-gnome fields: `g.home`, `g.project`, `g.job`, `g.st`, `g.carry`, `g.cAmt`, `g.decide`, `g.swimFrom`, `g.ride`; tree/rock `marked`; critter (deer) `h.rider`.

---

## 3. Functions (every one in the range)

| Function | Line | Signature | What it does | Callers |
|---|---|---|---|---|
| `foundTiles` | 3498 | `(b) → [tileIdx]` | The tiles a build stands on: footprint `b.fp` + door tile `(b.dx,b.dy)`; span landings `b.ends`; dam: all `b.tiles`; bridges: only the pier tiles `b.tiles[k] for k in b.piers`; `b.pt` (every flagstone); `b.chain` (every step); fallback the centre tile. | `checkFoundations` 3554, 3560 |
| `collapseBuild` | 3510 | `(b, why?, opts?{noUndo,toast})` | Wreck a build: snapshot `b.fell` for undo (salvage, tile values, owners, home flags, project flags); salvage = all `b.got[m]` + floor(0.5 × pieces laid) per material back to `store`; clear BRIDGE/PIER/DAM/PAVE/STEPS on its tiles; reset home flags for garden/fence/steppath; push onto `undoStack` top's `fallen` unless `noUndo`; gnomes inside leave; gnomes standing on it: swept if `wetD>0.3 && FLOW>FLOW_STREAM*0.5`, splash+yelp if wet, yelp if dry; 6 dust puffs, splashes, crash SFX; drop any upgrade project `b.upProj` from the queue; `removeBuild`; log + toast. | `checkFoundations` 3555; water wreck 2004 (`{toast:'the water took it',noUndo:true}`) |
| `checkFoundations` | 3548 | `(E1: Float32Array) → n` | After a raise/lower stroke: for each build (reverse order), max `|E[i]-E1[i]|` over `foundTiles`; `> FOUND_MOVE` → `collapseBuild`. Queued-but-unstarted projects whose ground moved are silently dropped from `village.queue` with a log line. Returns the count. | 11162 (`tool==='raise'||'lower'`, with `u.E` the undo snapshot) |
| `sweepBridge` | 3567 | `(b)` | Spate takes a done log bridge: sweep anyone on it, clear tiles, spawn 3 floating-log particles per tile (`k:'logf'`, life 9–14 s), splashes, drop `upProj`, `removeBuild`, log/toast/crash; then build a replacement `plankbridge` project with piers on every odd tile (every tile if L≤2), `fresh:true`, explicit cost `{w:4L, s:2+2·piers, f:2, work:14L+8·piers}`, and `unshift` it to the head of `village.queue`. | weather 3324 (`W.spate>0.5`, `fmax>=FLOW_RIVER*1.4`, 5 % chance, once per spate) |
| `damRun` | 3597 | `(x,y) → {tiles,ux,uy,wall,ax,ay,bx,by} \| null` | Find the bank-to-bank line through (x,y) in either axis: collect every drawn-wet tile each way (≤ 4·S = 8 steps, stop at border/taken), `surf=max(E+WD)`, `top=max E`, `wall=max(surf+DAM_RISE, top+0.15)`, `bank=wall+DAM_BANK`; then up to 3 tiles beyond each wet run find a landing: dry tile with `E ≥ bank−EARTH` (banked up) and `E−bank ≤ EARTH` (not too high to cut); lower dry tiles / second channels become more wall tiles. Rejects if no landing either side or total > 8 tiles. Returns the shorter of the two axes. | village planner 3435; player pick 5935 |
| `stepsChain` | 3641 | `(i) → [tileIdx]` sorted by E ascending | From tile i, walk up and down the slope ≤ 2·S = 4 tiles each way, each step taking the 4-neighbour with the steepest rise `> 0.45` that is not steps/OCC/wet>0.15/bridge. Max 9 tiles. | `finishBuild` 3657 (via layStepsFrom), `stageProject` 4108, player pick 5882 |
| `layStepsFrom` | 3657 | `(i)` | `STEPS[j]=1` for `stepsChain(i)`. | `finishBuild` 3663 fallback; debug export 12237 |
| `finishBuild` | 3658 | `(b)` | The completion hook (see §4.4 for every per-type effect). Sets `done/doneT`, plot fade, `founding(b)`, lodge → `pickChief`, clears village project slots, writes BRIDGE/PIER/STEPS/PAVE/DAM, handles the plank-bridge *upgrade* (mutates the old log bridge in place and swaps `b`), household moves (owners' `home`, kids, old tents retired via `retireHome`, `moveFrom` hamlet move), SFX/sparks/toast, and the big `EVT` log-text table. | `advanceClear` 4138, `placePiece` 4169 |
| `retireTents` | 3701 | `()` | Older routine: up to 2 tents per call come down when `bedCount()−2 ≥ pop+1`, furthest from any cabin first; +1 fibre +2 wood to store; never a tent owned by the player gnome. | **No gameplay caller** — only exposed on the debug export object (12227). Superseded by `retireHome` (4272) which `finishBuild` calls. |
| `dropPoint` | 3723 | `(kind:'food'\|other, g?) → build \| {x,y}` | Where a load is set down / fetched from: racks for food, else piles, else fires, else `villagePos`. With a gnome: nearest by squared distance with +400 penalty for a different village (v9.20 multi-village). | 2950, 4155, 4208, 4589, 4804, 4806, 4839, 5453, 5454, 5645 |
| `warmSpot` | 3732 | `(g?) → fire build \| null` | A lit fire (`done && !out`): prefer own village's; nearest to the gnome's home (or parents' home when a child), else to the gnome. | 12 callers (sitting, warming, night) |
| `fireNear` | 3741 | `(g, r) → fire \| null` | Any lit fire within `r` tiles. | 5575 |
| `freeBed` | 3742 | `(g) → build \| null` | Nearest done build with `occ < beds`; cabin distance weighted ×0.3. | **None — dead.** |
| `nearestRoof` | 3748 | `(g) → build \| null` | Nearest done tent/HOUSE/wheel/windmill within 14 tiles, skipping homes already holding `inN ≥ beds·2`. | 4749, 4750, 4856, 4860, 5647 |
| `stockedBuild` | 3755 | `(g, md)` | Nearest fish trap with `stock ≥ 2` and not `marked`, within `md`. | 4592 |
| `nearestTree` | 3761 | `(g, md)` | Nearest standing mature tree (`age ≥ 0.95`, not `fall`, not `marked`, not `blockedFor`). | 4213, 4888, 4916 |
| `nearestBush` | 3767 | `(g, md)` | Nearest bush with berries (`b.b ≥ 1`), unmarked, reachable. | 3820, 4597, 4840 |
| `nearestRock` | 3773 | `(g, md)` | Nearest unmarked reachable rock. | 4214, 4920 |
| `refreshIndex` | 3782 | `(dt)` | Every 1.8 s rebuilds `IDX`: grass = MEA/GRS tiles with `WD<0.10`, no ice, no OCC; shore = tile with `wetD≤0.30`, no bridge/OCC, having a 4-neighbour water tile `wetD>0.45` not iced (in deep winter `T.cold>0.85` only sea tiles `SEAC` count); calm = that neighbour has `FLOW<FLOW_STREAM·0.8 && WD>0.5`. | main loop 12033 |
| `nearestGrassTile` | 3797 | `(g, md) → {x,y}` | Nearest indexed reed/grass tile (fibre source). | 4217, 4918 |
| `shoreTaken` | 3802 | `(s, g) → bool` | Another gnome fishing or going to fish within 1.5 tiles of spot `s`. | `nearestShore` |
| `nearestShore` | 3807 | `(g, md)` | Nearest free, reachable indexed shore spot. | 3817, 3821, 4596, 4600, 4841, 4934 |
| `nearestCalm` | 3812 | `(g, md)` | Nearest calm-water shore (no taken/blocked checks). | 4770 |
| `nearestShoreFrom` | 3817 | `(x0,y0,md)` | `nearestShore` from a point rather than a gnome. | 2351, 4473, 4494, 4769, 5633 |
| `foodAround` | 3818 | `(g) → 'store'\|'bush'\|'fish'\|null` | Store if `store.food ≥ 1` and any build exists; else bush within 16·S; else (adults only) shore within 16·S. | 4817 |
| `pc` | 3839 | `(m, k, at, extra?) → piece` | Piece constructor: `{m: 'wood'\|'stone'\|'fibre'\|null, k: kind string, at: [x,y] stand point, ...extra}`. Extras seen: `n` (ordinal for drawing), `ti`/`tk` (span tile & index), `ti2`, `target`, `force`, `ring`, `tree`, `tiles`, `steps`, `seg`, `camber`, `drain`. | `housePlan`, `makePlan` |
| `ringTiles` | 3843 | `(b) → [tileIdx]` | The 1-tile ring around footprint `(x0,y0,fw,fh)`, excluding the map border. | `makePlan` 3905 |
| `prepOK` | 3844 | `(i) → bool` | A tile may be taken into a plot: not OCC/bridge/dam, `wetD<0.1`, no PAVE/STEPS, `E>SEA+0.5`, not rock, `PREPF<0.5` (not someone else's plot). | `makePlan` 3905 |
| `plotStart` | 3846 | `(b)` | First piece laid: `PREP=PREPF=1` on the plot (raked bare). Idempotent via `b.plotOn`. | `finishBuild` 3659, `placePiece` 4162 |
| `plotEnd` | 3847 | `(b, gone)` | Set the fade floor: footprint → 0; ring → 0.32 for cabins/lodge (a trodden yard), else 0; `gone` → 0 everywhere. | `removeBuild` 2755, `finishBuild` 3659 |
| `prepFade` | 3849 | `(dt)` | Once a second, fade every `PREP[i]` toward `PREPF[i]` at a rate of full range per `DAYLEN·2` = 420 s (two days); snaps up if below floor and floor < 1. | main loop 12036 |
| `housePlan` | 3854 | `(b, P)` | Appends the piece list for any HOUSE type (see §4.3). | `makePlan` 3918 |
| `lerp2` | 3880 | `(a, c, f) → [x,y]` | Lerp between two points. | `makePlan` 4066 (fold half-runs) |
| `standAt` | 3883 | `(b, x, y) → [x,y]` | Builder's standing point: `(x,y)` itself if open (in bounds, off border, not OCC, `wetD≤0.3`, no bridge, not in `b.fp`), else the first open tile in Chebyshev rings r=1..3, else `(x,y)` anyway. | 44 uses, nearly all in `makePlan` |
| `makePlan` | 3890 | `(b) → [piece]` | The full per-type plan (see §4.3). | `stageProject` 4109, build picker 5849 |
| `stageProject` | 4107 | `(b)` | Initialise a project for construction: steps chain if missing; `plan`, `pi=0`, `got={0,0,0}`, `stc={}`, `need` counts per material, `work=plan.length`, `prog=0`; pick the yard `(yx,yy)` from shape-specific candidate lists (beside the door using the house frame vectors; beside the near landing of a span; beside the trap stake / centre) — first candidate that is in bounds, not OCC/wet>0.2/bridge/PAVE/rock/STEPS; `cost={w,s,f,work}` recomputed from `need`. | 2806, 2818, 2830, 4268, 4397, 4409, 4426, 4431, 4436, 5851–5947 (player build picker) |
| `placedOf` | 4123 | `(b, k)` | Pieces of kind k laid (1e9 when done). | **None — dead.** |
| `inbound` | 4125 | `(b, m) → n` | Material on the way to a site (carried deliveries + fetch jobs × LOAD). | **None — dead** (logic duplicated inside `needRem`). |
| `placedCount` | 4134 | `(b, m) → n` | Pieces of material m among the first `pi` plan entries. | 3520, 4146, 4148 |
| `advanceClear` | 4136 | `(b)` | Skip past leading `clear` pieces whose tree is felled or gone (`stc.clear++`); finish the build if nothing remains. | `siteJob` 4192, 5165 |
| `needRem` | 4140 | `(b, m, excl) → n` | `need − placed − got − inbound(excluding gnome excl)`. | 4206, 4587, 4588, 4987 |
| `siteWant` | 4148 | `(b, m) → n` | `need − placed − got` (ignores inbound). | 2840, 4153 |
| `reserveOf` | 4149 | `(m) → n` | Store reserve not to be spent on building: wood = `gnomes.length·2` when `T.cold>0`; else 0. | 2840, 2841, 4207, 4987, 6033, 11357 |
| `deliver` | 4151 | `(g, b)` | Drop the carried load at the yard: `take=min(cAmt, siteWant)`; puff + drop SFX; any remainder → `g.job={k:'store'}`, `st='haul'`, walk to `dropPoint`; else idle with `decide=0.15`. If no plan/done → `deposit(g)`. | 'haul' state 4982 |
| `placePiece` | 4159 | `(b, g)` | Lay piece `plan[pi]`: debit `got[m]`, `pi++`, `prog=pi`, `stc[k]++`, `plotStart`; `level` pieces call `levelTile(ti,target,force)` (+`ti2`); `tiles` → PAVE 1/2; `steps` → STEPS; span pieces → `tileLaid`; knock SFX when the last wall course of a house goes on; 2 chip particles at `p.at`; `finishBuild` when done. | 5186 (`tally(g,'build')`) |
| `laidOn` | 4172 | `(b, ti, k) → n` | Pieces of kind k already laid on span tile ti (linear scan of plan[0..pi)). | `tileLaid` ×4; drawing code 10210–10448 (×13) |
| `tileLaid` | 4175 | `(b, p)` | Progressive usability of a span tile: log/plank bridge — 2 pier stones → `PIER=1`; 3 deck logs or 3 planks → `BRIDGE=deck`; stone bridge — `BT.stonebridge.s`=4 arch stones → BRIDGE; rope bridge — 1 plank → BRIDGE; dam — `BT.dam.w`=5 logs → `DAM=1`, `E=max(E,wall)`, `WD=0`, `SOIL=0`, `markWet` self + 4 neighbours. | `placePiece` 4166 |
| `siteJob` | 4190 | `(g, b) → bool` | Hand gnome g a job for site b (see §4.5 for the decision order and numbers). | 4846, 4864, 4895, 4896, 4912, 5650, 5673 |

---

## 4. Rules and tuning numbers

### 4.1 Foundations & collapse (3487–3565)
- Tolerance: `FOUND_MOVE = 0.5` level (3497). Comparison is against the **undo snapshot** at stroke start, so the river's own erosion during the stroke never counts (3493–3494 comment; 11162 passes `u.E`).
- Foundation set per shape (3498–3508): footprint + door; span landings; dam = whole wall; bridge = **pier tiles only** (a pierless log bridge is checked only at its two landings); pave/steppath = **every slab**; steps = every step; else the centre tile.
- Salvage (3519–3522): 100 % of material delivered-not-laid (`b.got`) + 50 % (floored) of what was laid, per material; a *done* build therefore returns half of everything.
- Gnomes on the wreck (3530–3537): in flowing water (`wetD>0.3 && FLOW>FLOW_STREAM·0.5 = 0.25`) → `startSweep`; in still water (`wetD>0.3`) → 3 splash drops + splash SFX + 'yelp' jostle; dry → 'yelp'.
- FX: 6 dust puffs in ±0.6 tile (3538); splash on wet non-dam tiles `wetD>0.2` (3539); `sfxCrash` (3540).
- Undo integration (3528, consumed at 11101–11110): the wreck is pushed onto the current stroke's `fallen` list; undoing restores the build, OCC, tile values, salvage (debited from store), owners' homes, home flags, project slots. Water wrecks pass `noUndo:true` (2004) because they are "nobody's stroke".
- Queued-not-begun sites whose ground moved > 0.5 are dropped with no wreck (3558–3563).
- Text: done → "The X came down — <why>"; in progress → "The X site fell in — <why>"; default why `'the ground under it gave way'`; toast default `'you moved the ground under it'`.

### 4.2 Spate (3567–3584)
- Trigger (outside, 3319–3326): `W.spate>0.5`, log bridge done, max FLOW over its tiles `≥ FLOW_RIVER·1.4`, 5 % chance per check, at most one bridge per spate.
- 3 floating-log particles per tile, life 9–14 s, mass 12.
- Replacement plank bridge: piers at odd indices k (`k%2===1`), or every tile when `L≤2`; cost `w = 4·L`, `s = 2 + 2·piers`, `f = 2`, `work = 14·L + 8·piers` (matches `BT.plankbridge {w:4,s:2,f:2,work:14}` per tile at 2418); goes to the **head** of the queue.

### 4.3 Dam line (3585–3640)
- `DAM_RISE=0.35`, `DAM_BANK=0.40`, `EARTH=0.6` (3596).
- Wet run limit `4·S = 8` tiles each way; landing search ≤ 3 tiles beyond; total span ≤ 8 tiles (`tiles.length>4*S` rejects); must stay off the 1-tile map border.
- `wall = max(surfaceMax + 0.35, groundMax + 0.15)`; `bank = wall + 0.40`.
- Landing: `bankDry(i)` (drawn dry, not sea) and `E ≤ SEA+0.3` rejects; `E − bank > 0.6` → no landing (abort axis); `E ≥ bank − 0.6` → landing; otherwise the wall extends over the low tile (dyke).
- Outside guards (caller 3433–3437): village only dams where `FLOW ≥ FLOW_RIVER` and `E > SEA+1.2`; scores `FLOW + E·0.05 − len·0.2`. Player pick (5933–5937) needs `FLOW ≥ FLOW_STREAM·0.8`.

### 4.4 Steps (3641–3657)
- Chain grows ≤ 4 tiles up and ≤ 4 down (`2·S` each), following rises `> 0.45` level per step; max chain 9; sorted foot-to-top. Plan: **one stone per two tiles** (3989–3992) → cost `s = ceil(len/2)`.

### 4.5 finishBuild effects (3658–3698)
- All: `done=true`, `doneT=T.abs`, `plotStart`+`plotEnd(b,false)`, `founding(b)`, lodge → `pickChief(vil,'lodge')`, project slots cleared.
- Bridges (3661): `BRIDGE[tile]=decks[k]||deck` for all tiles, `PIER=1` on piers.
- Plank upgrade (3662): old log bridge object becomes `type='plankbridge'`, `uses=0`, `upgrading=false`; the upgrade project is removed from `builds` and `b` is re-pointed at the old object for the rest of the function.
- steps → STEPS (3663); pave → PAVE=1 (3664); hearth → PAVE=2 on non-OCC tiles (3666); dam → DAM=1, E raised to wall, WD=0, SOIL=0, markWet (3667).
- bank (3665): `home.bank=b`, `home.flooded=0`, owners resume `b.putOff` project if still live; log.
- wheel, or windmill with `noRiver` → `village.sawmill=true` (3668).
- Household: steppath → `home.stepPath`; fence → `home.fence`, `gardenFenced` iff `round==='garden'`; garden → `home.garden=b`, `crop=apples=treeAge=tendT=0`, `applesYear=−1`; hive → `honey=0`, `home.hive`; fold → `out=false, herd=null, shornYear=−1, kitT=0`; kennel ↔ fold link; stable adopts every tame unstabled deer; cart → `stable.cart=b`, `at='stable'`; boathouse → `boatProg=0.5` (3669–3678).
- Homes (3679–3687): each living owner's `home=b`, `project=null`; tents they leave for a cabin are collected and `retireHome`d; babies/children whose `parents[0]` is an owner join `b.kids`; `moveFrom` (v9.23 hamlet move) empties the old cabin of these owners/kids; "X and Y moved into their cabin" log.
- Feedback: `sfxBuilt`, 9 sparks, toast `'<Label> finished'`, event log line from the `EVT` table (3690–3693) or `'You finished the …'` when `b.mine` (player-raised, v9.9), plus household lines naming the owners for steppath/fence/garden/hive (3696–3697).

### 4.6 retireTents (3701–3717, dead in gameplay)
- ≤ 2 tents per call; condition `bedCount()−2 ≥ pop+1`; furthest from any done cabin first; refund 1 fibre + 2 wood; 6 puffs; player-owned tents exempt.

### 4.7 Nearest-X helpers (3723–3826)
- `dropPoint` other-village penalty: +400 squared tiles (= 20 tiles) (3730).
- `nearestRoof` radius 14 tiles (`14·14·S2`), skips homes with `inN ≥ beds·2` (3748–3753).
- `freeBed` cabin weight 0.3 (dead).
- `stockedBuild`: trap `stock ≥ 2`.
- `nearestTree`: `age ≥ 0.95`.
- `refreshIndex`: every **1.8 s** (3783); grass `WD<0.10`; shore `wetD≤0.30` with neighbour `>0.45`; calm `FLOW<0.4 && WD>0.5`; deep winter `T.cold>0.85` → sea only (v9.20 fix for mass starvation).
- `shoreTaken` spacing 1.5 tiles.
- `foodAround` search radius `16·S = 32` tiles; children never fish.

### 4.8 Real construction constants (3836–3849)
- `LOAD = {wood:3, stone:2, fibre:2}` per trip (3838); ×3 on a deer, ×6 with the cart (4987, outside).
- Plot: yard ring only for `PREP_RING` types; ring tile levelled if `0.15 < |E−z0| ≤ EARTH+0.3 = 0.9`; footprint tile levelled if `|E−z0| > 0.05` (with `force`); door tile levelled if `|E−z0| > 0.2` and it is dry (`wetD<0.15`, `E>SEA+0.3`) and not garden/slipway (3898–3899). Two adjacent ring tiles share one spade piece (3907–3909).
- Plot fade: full range over `DAYLEN·2 = 420 s`; yard floor 0.32 for cabins/lodge (3847, 3849).
- `standAt` search radius 3 (Chebyshev), wet limit 0.3 (3883–3889).

### 4.9 Plans — piece counts per type (makePlan 3890–4105, housePlan 3854–3879)
Format: material×count kind (stand point).
- **Clearing (3892–3893):** every unfelled tree on the footprint (+1 tile margin for HOUSE types) → `clear` pieces, m=null, `tree` ref. Bridges also clear trees on their tiles (3912–3913) and add `approachPieces` (3914, outside); dams add `damApproach` (3916, outside).
- **HOUSE (housePlan):** stone×4 `found` (one per side); stone×(stoneWalls·stoneP, default stoneP=3) `chimwall`; wood×(courses·2, default courses=4 → 8) `wall` alternating log/plank sides; wood×2 `gable` per log/plank side among sides 1,3; wood×1 `ridge`; ×4 `shingle` of roof material (thatch→fibre, slate→stone, else wood) alternating front/back; stone×2 `chim` if `chim`; wood×1 `window` per distinct window index; wood×1 `door` if `doorW>0`; wood×2 `porch`; fibre×1 `net` + wood×jetty.len `jetty`; wood×2 `hurdle`; wood×2 `stack`; wood×2 `bench`; wood×1 `loft`; wood×2 `slip` + wood×2 `ribs`. (Cabin: 4+3+8+4+1+4+2+windows+1 ≈ BT.cabin w:18 s:10.)
- **tent (3919–3925):** wood×2 `pole`, wood×1 `ridge`, fibre×3 `cloth`, wood×2 `peg` (= w5 f3 ✓).
- **rack (3926–3929):** wood×2 `post`, wood×2 `bar`, fibre×2 `line` (= w4 f2 ✓).
- **fire (3930–3933):** stone×2 `ring` only if any rock exists or `store.stone>0`; wood×3 `log`.
- **pile (3934–3935):** wood×2 `log`.
- **lantern (3936–3937):** wood×1 `post`, fibre×1 `lamp`.
- **logbridge (3938–3943):** per tile from the near bank: stone×2 `pier` where `piers` includes k, then wood×`BT.logbridge.w`=3 `deck`; each laid *from* the previous tile.
- **plankbridge fresh (3944–3951):** stone×1 `footing` near; per tile stone×2 `pier` (if pier) + wood×3 `plank` + wood×1 `rail`; stone×1 `footing` far; fibre×2 `rope` at mid.
- **plankbridge upgrade over log deck (3952–3959):** same without piers, using `b.up.tiles`.
- **ropebridge (3960–3967):** stone×2 `anchor` + fibre×2 `rope` at near rim; wood×1 `plank` per tile; stone×2 `anchor` far (n=2,3).
- **stonebridge (3968–3979):** stone×2 `footing` near; per tile wood×1 `centring` + stone×`BT.stonebridge.s`=4 `arch`; stone×2 `footing` far; stone×1 `parapet` per tile (laid after the arch stands).
- **dam (3980–3985):** per tile stone×`BT.dam.s`=2 `dambed` then wood×`BT.dam.w`=5 `damlog`, from one bank.
- **trap (3986–3988):** wood×1 `stake` + fibre×3 `weave` at `(sx,sy)`.
- **steps (3989–3992):** stone×1 `step` per 2 chain tiles (`steps:[…]` group).
- **wheel (3993–3998):** stone×2 `base`, wood×3 `frame`, wood×3 `rim`, wood×2 `paddle` (= w8 s2 ✓).
- **windmill (3999–4005):** stone×2 `base`, wood×3 `tower`, wood×1 `cap`, wood×4 `sail`, fibre×2 `cloth` (= w8 s2 f2 ✓).
- **fence round garden (4006–4022):** margin `m=0.32` outside the beds; 4 runs N/E/S/W; the run facing the house gets a gateway between t=0.36 and 0.64 (two pickets); `b.round='garden'`, `b.gate=[g0,g1]` → 5 wood pieces. **fence round front yard (4023–4031):** 4 pickets along `yF = Y1+1.5` with a gap at the door, plus two returns; `b.round='front'`.
- **garden (4032–4036):** `row`×(big?5:3) + `apple`×1, all m=null (work only).
- **bank (4037–4042):** `level` per tile to `b.targets[i]`, camber tiles, drain tile; wood×1 `stake` every other tile.
- **hive (4043–4047):** wood×2 `stand`, fibre×1 `skep`.
- **well (4048–4054):** stone×6 `wring` (alternating two stand points), wood×2 `wpost`, wood×1 `wbeam`, wood×1 `wroof`, fibre×1 `wrope` (= w4 s6 f1 ✓).
- **fold (4055–4072):** 3×3 pen; gate on the side facing `villagePos()` between t=0.34–0.66; other sides two half-run pickets each → 8 pickets + wood×1 `gate` + wood×3 `hutch` in the corner furthest from the gate (= w12 ✓).
- **kennel (4073–4077):** wood×3 `kbox`, wood×1 `kroof`.
- **stable (4078–4085):** stone×2 `found`, wood×4 `post`, wood×3 `srail`, wood×1 + fibre×2 `hay`, wood×2 `sroof` (= w10 s2 f2 ✓).
- **cart (4086–4092):** wood×2 `wheelc`, wood×2 `bed`, wood×2 `shaft`, fibre×1 `wrope`.
- **slipway (4093–4097):** wood×2 `runner`, wood×2 `trestle`, stand point up-beach of `wdir`.
- **pave / steppath (4098–4102):** stone×1 `slab` per **2** tiles; **hearth:** tiles sorted by angle round the fire, 4 slabs of `ceil(n/4)` tiles each (= BT.hearth s:4).

### 4.10 Site job dispatcher (siteJob 4190–4220)
Decision order for gnome g at site b:
1. `advanceClear`; if the next piece is `clear`: an adult/elder marks and goes to chop the first unmarked standing tree (`tr.marked=g.id`, job `{k:'chop',t,site:b,m:'wood'}`); children get nothing; if all are being felled → false (other work meanwhile).
2. Builder cap: lodge 3, any HOUSE 2, else **1** concurrent `place` job. If `nxt.m===null` (work-only) or `got[m]>0` and under the cap → `goBuild` to `nxt.at`.
3. Fetch order: next piece's material first, then stone, wood, fibre. For each with `needRem>0`:
   - Store: `spare = store[m] − reserveOf(m) ≥ 1` → `goFetch` to `dropPoint` (+ jitter ±0.4). **Deer ride** (v9.17): a free, stabled, adult-ridden-only (`!g.player`) deer, yard ≥ `3·S = 6` tiles from the store, `rem ≥ 2·LOAD` and `spare ≥ 2·LOAD` → `goMount`.
   - Wood from the forest only while `trees.length > 26` (or `> 8` for a player's own build `b.mine`), within `20·S` tiles.
   - Stone: adults/elders; `mineRock(g)` preferred over the nearest loose rock (within `24·S`) when there is no rock, or the gnome is a quarry-craft/miner, or the mine is nearer than 1.4× the rock's distance.
   - Fibre: a grass tile within `14·S`.
4. Nothing → false.

### 4.11 Delivery and reserves
- `reserveOf('wood') = 2 × population` whenever `T.cold>0` (firewood first) (4149).
- `deliver`: overflow beyond `siteWant` goes to the store, never left on site (4155).

---

## 5. UI elements / input handling
- None directly in this range (no DOM or event listeners). Indirect UI: `toast()` (3545, 3579, 3689) and `logEv()` event feed lines with a subject position so the player can tap-to-go. The build picker (5849–5947, outside) calls `makePlan`/`stageProject` to produce ghost previews and costs; `damRun` supplies the ghost tiles for the dam pick (5935–5937).
- Text strings are the main "UI" here: the `EVT` table (3690–3693) is the narrative log for every build type and is pure content.

## 6. MODE 'creator' vs 'gnome'
- No `MODE` reference in the range. Mode-adjacent flags: `b.mine` (a build raised by the player's own gnome, v9.9) changes the log line to "You finished the …" (3694) and relaxes the forest limit from 26 to 8 trees (4213); `g.player` gnomes never ride the deer on a fetch (4211) and their tent is never retired (3705). Everything else is mode-agnostic simulation that the creator's terrain tools can trigger (`checkFoundations` is the creator-tool hook at 11162).

## 7. Progression / unlock / economy
- Material economy: three materials (wood/stone/fibre), delivered straight from source or from the store; the store is a fallback, not a prerequisite (3828–3835 comment). Salvage rate 50 % on collapse. Firewood reserve in winter.
- Unlock-like effects in `finishBuild`: wheel/windmill → `village.sawmill` (timber doubled, per EVT text); lodge → chief; stable/kennel/fold/cart link the animal husbandry chain; hearth halves fire wood use (EVT text); lantern extends work an hour into dark (EVT text). The actual numeric effects live elsewhere.
- Costs are derived from the plan (`stageProject` 4121 overwrites `b.cost` from `need`), so the `BT` table numbers are expectations/queue-time estimates, and the plan is the truth.

## 8. Persistence
- No save/load code here. Within-session persistence: `b.fell` snapshot + `undoStack[...].fallen` (3517, 3528) make collapses undo-able (restore at 11101–11110). `b.doneT=T.abs` timestamps completion. Everything else is plain object state on `builds[]` and the tile arrays, which whatever serializer exists elsewhere would need to include (`plan`, `pi`, `got`, `stc`, `need`, `yx/yy`, `plot`, `chain`, `gate`, etc.).

## 9. Mobile / touch / performance
- `IDX` + `refreshIndex` (3781–3796): the explicit perf fix — "scanning the whole grid inside every decision was the dearest thing in the game"; rebuilt every 1.8 s instead.
- `prepFade` throttled to once per second (3849).
- `standAt` bounded to radius 3 (3887).
- Cost hotspot to note: `laidOn` (4172) is a linear scan of the plan and is called ~13 times from the drawing code per bridge/dam per frame (10210–10448); for long spans that is O(frames × tiles × plan). `b.stc` already counts per kind; a per-tile count would remove it.
- `needRem`/`inbound` scan all gnomes per call; `siteJob` calls `needRem` up to 3× per gnome decision.

## 10. i18n
- None. `<html lang="en">`, no language table, no Spanish strings anywhere in the file (grep for `'es'`, `LANG`, `español` → 0). All player-facing text in this section is inline English prose built with string concatenation (and English pluralisation/possessive logic like `name+"'s"` at 3665 and `/^[a-z]+'s /` at 3686), which would have to be externalised for an en/es game.

## 11. Oddities, bugs, dead code, TODOs
1. **Dead code:** `MK` (3837), `freeBed` (3742), `placedOf` (4123), `inbound` (4125, duplicates the inbound logic inside `needRem`). `retireTents` (3701) has no gameplay caller — only the debug export (12227); it was superseded by `retireHome` (4272).
2. **Comment/code mismatch in `damRun` (3591–3595 vs 3597–3640):** the comment promises that "a bank that would want more than EARTH of earthwork lowers the wall to what it can hold, and a wall that cannot rise 0.15 is not worth building". The function neither lowers `wall` nor checks a minimum rise; it just rejects the landing. If that logic exists it is in `damApproach` (2686) or the callers.
3. **`foundTiles` ignores a flood bank's tiles** (3503–3504): `b.tiles` exists for `bank` but it is neither dam nor piered, so only the centre tile is checked; a bank can have its ends dug out without falling.
4. **Pave/steppath collapse is all-or-nothing** (3505, 3525): moving any one slab tile > 0.5 destroys the entire path. Design choice, but harsh for a long path.
5. **`sweepBridge` explicit `cost`** (3581–3582) is overwritten by `stageProject` (4121) once the project starts; the two agree today only because the plan shape matches BT — a silent coupling.
6. **Plank-upgrade re-pointing** (3662): `b=b.up` mid-function means later lines (`b.fresh`, `b.mine`, `b.home`) read the *old* log bridge's fields. Works, but subtle.
7. **Fold hutch x** (4070): `side==='E'?b.x0:side==='W'?b.x0+b.fw-1:b.x0+b.fw-1` — for N/S gates the hutch is always on the east column; the last two branches are identical (probably intended a corner choice).
8. **`collapseBuild` snapshot of `tiles`** (3517) uses `b.tiles.map` even for a `bank` (whose tiles carry no BRIDGE/PIER/DAM) — harmless but wasteful.
9. **`finishBuild` plot calls** (3659): `plotStart(b)` then immediately `plotEnd(b,false)` — `plotStart` sets `PREPF=1` only to have `plotEnd` lower it in the same tick; harmless.
10. **Door levelling guard** (3899) excludes `garden` and `slipway` by name — a type-specific exception buried in generic code; a plan flag would be cleaner.
11. **Builder cap of 1** for most types (4200) means a village can starve a 14-tile stone bridge of labour; only the fetch side parallelises.
12. **`fire` ring stones** (3930–3931) depend on `rocks.length>0||store.stone>0` *at plan time*; if stone later runs out the two stone pieces still block the plan until someone quarries.
13. **Hard-coded version tags** (v9.9 … v9.23) and Jed quotes in comments are a changelog, not documentation — useful for archaeology, noisy for a template.

## 12. Reusable vs gnome-specific (for Parque D'Amour)

### Reusable engine/shell (lift nearly as-is)
- The **piece-plan construction pattern**: `pc()`, `makePlan→stageProject→siteJob→deliver→placePiece→finishBuild`, `need/got/stc/pi/prog`, `needRem/siteWant/reserveOf`, `LOAD`, the builder cap, the fetch-order heuristic, the yard (`yx,yy`) concept, `standAt`. Any game where NPCs raise things over time from carried materials (a bandstand, a fountain, a kiosk, a rose arbour) fits this verbatim; the types and piece kinds are data.
- **Foundation checking against an undo snapshot** (`foundTiles`, `checkFoundations`, `collapseBuild` + `b.fell`/`fallen` undo integration) — generic to any terrain-editing creator mode with structures.
- **Plot/yard prep + fade** (`PREP/PREPF`, `plotStart/plotEnd/prepFade`, `ringTiles/prepOK`) — a nice visual for "under construction" ground in any tile world.
- **Periodic spatial index** (`IDX`, `refreshIndex`) and the `nearestX(g, maxDist)` with `marked`/`blockedFor` conventions — the standard cheap AI query layer.
- `dropPoint`/`warmSpot` pattern: "nearest facility of a kind, biased to the actor's own group/home" — maps to "nearest bench / café / fountain of this couple's quarter".
- `tileLaid` progressive-usability idea (a half-built bridge is walkable as far as it goes) — reusable for paths/footbridges in the park.

### Gnome-specific content (replace)
- The 30+ build types and their plans (`STAGED`, `PREP_RING`, every branch of `makePlan`, `housePlan`'s vernacular architecture), the `EVT` narrative strings, the materials triple wood/stone/fibre, the deer/cart ride, the spate/log-bridge/dam hydrology (`sweepBridge`, `damRun`, `DAM_*`), `stepsChain` (slope stairs), fishing shores (`shoreTaken`, calm water, winter sea rule), tents→cabins household migration, rabbits/hives/fold/kennel/stable chains, `reserveOf` firewood rule, `retireTents`.
- Terrain-coupled rules (`SEA`, `wetD`, `FLOW`, `ICE`, `SEAC`) assume a river-and-sea island; a park would keep only "pond/stream" subsets if any.

---

## 13. Design questions for the Parque D'Amour port
1. Does the park get **constructed** by NPCs at all (gardeners raising a gazebo, laying a gravel path, planting a parterre), or does the Creator place finished props instantly? If the former, the whole plan/piece pipeline applies; if the latter, only `finishBuild`-style effect hooks and foundation checks are needed.
2. What are the **materials**? Wood/stone/fibre → perhaps stone, timber, flowers/plants, iron (railings, lamps)? How many, and where do they come from (a nursery, a delivery cart at the gate, a store shed)? The `LOAD` and `reserveOf` rules need park equivalents (is anything "reserved" the way firewood is in winter?).
3. Is there **terrain editing** in Creator mode (raise/lower)? If yes, keep `FOUND_MOVE`-style collapse and the undo snapshot; decide what "collapse" means for a bandstand or a fountain and what is salvaged. If terrain is flat/fixed, drop §4.1 entirely.
4. Is there **water** (pond, stream, fountain basin) with depth and flow, or decorative only? That decides whether shores/calm/dam/bridge logic survives in any form (a footbridge over a stream, a boating pond).
5. Which builds are **household/couple-owned** (the gnome fence/garden/hive/steppath pattern: a couple's own project, logged with their names) vs **park-wide** (village queue)? In a romance sim the "couple project" could be a love-lock on a bridge, a planted rose, a picnic spot — the `b.home/b.owners/ownsProject` pattern supports this directly.
6. How does **sabotage** interact with construction? Can the player (or a rival NPC) wreck or stall a build (the `collapseBuild` path with a different `why`, or a `PB.paused`-like stall)? Should salvage differ for sabotage vs accident?
7. **Who builds** — gardeners/workmen as a separate NPC class (cap per site: lodge 3 / house 2 / else 1 here), or the romance characters themselves? Does the avatar-mode player build (`b.mine`) with relaxed limits as the gnome does?
8. **Progressive usability**: should half-finished things be usable (a bench with only its frame)? `tileLaid` shows how; decide per type.
9. **Plot prep visuals**: should ground under construction show as bare earth and fade back (PREP/PREPF), and is there a permanent "trodden yard" equivalent (gravel round a kiosk)?
10. **Text/i18n**: the `EVT` narrative table and all toasts are English string concatenation with possessives. For en/es (or en/fr for a French park) every build type needs a message key and the possessive/plural logic has to go through a translation function from day one.
11. **Costs as truth vs table**: keep the "plan defines cost; BT is an estimate" coupling, or make the table authoritative and derive plans from it? The former is more robust to plan edits; the latter is easier for a designer to tune.
12. **Spatial index cadence**: 1.8 s suits gnome decisions at ~0.5–1.3 s intervals; what is the park NPC decision tempo, and what do they query (free benches, quiet spots, flower beds, the other half of the couple)?
13. **Upgrades in place** (log bridge → plank bridge mutates the old object): will park props upgrade (a plain bench → painted bench with a plaque)? If so, keep the `b.up/upProj/upgrading` pattern and the `b=b.up` swap, or design a cleaner "replace" op.
14. **Seasonal rules**: winter firewood reserve and winter-only sea fishing are examples of season-gated economy; does the park have seasons (spring blossom, autumn leaves) that gate construction or materials?
