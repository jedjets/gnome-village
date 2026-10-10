# Gnome Village review — section 07: lines 2478–3486

**File:** `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
**Range:** 2478–3486 (1,009 lines). Header comment at 2478–2484 ("v9.20: villages — a green round a fire, a ring of homes round the green").

## 1. Purpose of the section

This is the **settlement-planning layer** of the simulation: the part of the engine that decides *where* buildings go and *what the village builds next*, as distinct from how gnomes carry materials (later sections) or how buildings are drawn (mostly elsewhere, except two mine-drawing routines here). It contains five themes in order:

1. **Villages & the hamlet** (2478–2522): the `villages[]` registry, the "green" (ground round the first fire), the ring-of-homes geometry, hamlet founding rules, hat colours per village.
2. **Site-finding geometry** (2526–2727): can a footprint stand here (`houseSiteOK`, `siteFree`, `tileFree`), ring/green/farm slot search, earthwork pieces for bridge and dam approaches, `levelTile`.
3. **Build object lifecycle** (2730–2849): `placeBuild`, `removeBuild`, `enter/leaveBuild`, `mkBuild`, `mkProj`, `nextType`, `planVillage`, `tallyShortfall`.
4. **What the gnomes' habits build** (2850–2990): bridges (`findSpan`, `bridgePlan`, `stonePlan`), mill siting, lantern reach, water provenance strings.
5. **Craft homes, mine, workshop, boathouse** (2991–3243) and **lodge & chief** (3236–3267), then the master **`planEmergent()`** (3268–3486) that strings every emergent-build rule together each planning tick.

Called every planning tick (1.2 s of sim time) from the main update at line 12038: `tallyShortfall(); planEmergent(); planVillage(); households();`.

## 2. Global / state variables defined or mutated here

| Name | Line | Type / shape | Notes |
|---|---|---|---|
| `villages` | 2485 | `Array<{id, x, y, fire:Build, hamlet:bool, chief?:Gnome}>` | Index 0 = village, index 1 = hamlet. Max two. Reset by `villages.length=0` in `newIsland` (12103). |
| `HAMLET_R` | 2486 | `18` (tiles) | A fire laid ≥18 tiles from every green founds a hamlet. |
| `RING_R` | 2486 | `[6.5, 10.5]` | Inner and outer ring radii for homes. |
| `GREEN_R` | 2486 | `[2.6, 4.6]` | Radial band round the fire for green furniture (rack, pile, well, lodge). |
| `HAT_HF`, `HAT_HM` | 2487 | `string[4]` hex colours | Hamlet hats: purple (f), green (m). Village hats `HAT_F`/`HAT_M` live at 1366–1367. |
| `SITE_SPREAD` | 2628 | `2.0` | Max height spread over footprint + 1-tile margin. |
| `LAMP_R`, `LAMP_RP`, `LATE_SHIFT` | 2873 | `2.5*S=5`, `3.5*S=7`, `0.045` | Lantern working radius (normal / windmill-powered) in fine tiles; late shift ≈ 4.5% of a day after supper. |
| `CRAFT_HOME` | 2995 | `{chop:'woodcutter', quarry:'miner', fish:'fisher', herd:'shepherd', farm:'farmer'}` | Craft → house type. |
| `MINEB` | 2996 | `Uint8Array(NC)` | 1 on a mine-pit tile. Zeroed at 984 on terrain init. |
| `MINEZ` | 2997 | `Float32Array(NC)` | Pit floor level per tile (bench contours drawn relative to it). |
| `village.project2` | 2806 (set), also 2756, 3660 | Build | Second work party's project (crossings, from 6 gnomes). Reset at 12103. |
| `village.wait` | 2824 | number | Zeroed when a queued project is started. |
| `village.short.{wood,stone,fibre}` | 2840–2841 | number (seconds-ish) | +1.2 per planning tick per material a site waits for. |
| `village.minerT` | 3130–3131 | sim-time | Throttle: `planMiner` runs at most every 0.5 days. **Not reset in `newIsland`** (see bugs). |
| `village.boatT` | 3157 | sim-time | Throttle for boathouse/slipway siting (0.5 day). **Not reset in `newIsland`**. |
| `village.damWantT` | 3437, 3448, 3449 | sim-time | When the want for a sawmill was first noted; windmill after ≥2 days. |
| `village.noDamT` | 3460–3461 | sim-time | Hill search once a day. |
| `village.sawmill` | 3466 | bool | Set when a windmill gets a saw. |
| `W.tookBridge` | 3339, 3342 | bool | A spate has already swept one bridge this storm. |
| `FIRES` (Set) | 3427 | `Set<tileIndex>` | Rebuilt each tick from fire builds. |
| `STATS.hamlets / miners / chiefs / digs` | 2514, 3141, 3265, 3124 | counters | Telemetry counters. |
| `store.wood / store.stone` | 2667, 3101 | number | Wood from clearing trees under a footprint; +2 stone per rock removed from a pit. |
| Per-build fields set here | various | — | `b.vil`, `b.hamlet`, `b.z0`, `b.rot`, `b.dx/dy/sx/sy`, `b.fp`, `b.x0/y0/fw/fh`, `b.inN`, `b.why`, `b.owners`, `b.kids`, `b.mineAt`, `b.mine`, `b.moveFrom`, `b.jetty`, `b.eng`, `b.wright`, `b.upgrading`, `b.upProj`, `b.noRiver`, `b.cost`, `b.work`, `b.ends`, `b.app`, `b.tiles/deck/decks/piers/len/uses/ux/uy` |
| Per-gnome fields set here | 2512–2513, 2745–2752, 2760, 2765–2766 | — | `g.vil`, `g.hat`, `g.inside`, `g.restIn`, `g.home`, `g.project`, `g.job`, `g.st`, `g.decide`, `g.x/y/gz/path/arrived/moving/swim/ptx` |
| Terrain arrays mutated | 2673, 2683, 2734–2735, 3105, 3124 | `E`, `E0`, `SOIL`, `OCC`, `MINEB`, `MINEZ` | Levelling, footprint occupancy, mine digging. |
| World lists mutated | 2660–2666, 2675–2677, 3098–3101 | `trees`, `bushes`, `rocks` | Cleared/felled/shoved under footprints and pits. |
| `marks`, `gorges`, `FISHN`, `CLIMBN` | 3304, 3320, 3357–3365, 3371–3375 | arrays / Uint8 grids | Consumed (spliced / zeroed) when an emergent build is queued. |

## 3. Functions (every one in range, with line, signature, behaviour, callers)

### 3a. Villages, green, hamlet (2485–2522)
- **`vilOf(g)`** 2488 — village id of a gnome (0 default). Called widely (1842, 1914, 3727, 4259, 4287… 5558).
- **`bvil(b)`** 2489 — village id of a build. Callers 3660, 3729, 4279, 4283, 4311, 4358–4359, 4425, 4727, 5001.
- **`hatFor(sex,vil)`** 2490 — picks a hat colour: hamlet palettes if `vil`, else village palettes. Callers 4284, 4477, 5558.
- **`greenOf(v)`** 2492 — centre of a village's green: its first fire while it stands, else the stored founding point; no village → `villageAvg()`. Callers 4263, 4323, 4361, 11420, 11906.
- **`villagePos(v)`** 2493 — `greenOf` if the village exists, else `villageAvg()`. 20+ callers (camera, log, HUD, planning).
- **`villageAvg()`** 2494 — mean x,y of all non-tile, non-farm builds (excludes trap, wheel, lantern, fence, garden, steppath, fold, stable, kennel, cart, hive); falls back to gnome mean, then `world.camp`. Only called here.
- **`nearestVil(x,y)`** 2501 — nearest village by green centre. Only called by `founding`.
- **`founding(b)`** 2503 — on a fire finishing (called from `finishBuild` 3659): first fire → `villages[0]`; a player-laid fire flagged `b.hamlet` with no hamlet yet → `villages[1]`, moves the PLAYER, mate and their baby/child offspring to vil 1, re-hats non-babies, re-tags the player's home, logs + toast, `STATS.hamlets++`; otherwise tags the fire with the nearest village.
- **`hamletSite(x,y)`** 2519 — true if a village exists, no hamlet yet, and the point is ≥ `HAMLET_R` from every green. Callers 5978 (ghost message), 6011 (sets `b.hamlet=true`).
- **`faceRot(dx,dy)`** 2521 — rotation 0..3 (0 faces +y, 1 +x, 2 −y, 3 −x) for a direction. Caller 4263.
- **`angDiff(a,b)`** 2522 — wrapped angle difference. Internal.

### 3b. Site geometry (2526–2727)
- **`houseSiteOK(type,x0,y0,rot)`** 2526 — full validity test for a rotated house footprint: every tile `tileFree(...,1.0)` and `PREPF<0.5`; heights within `EARTH` (0.6) of mean both ways; `siteSpread ≤ SITE_SPREAD` (2.0); no fire within the yard box (x0−2.5..x0+fw+1.5, y0−2.5..y0+fh+1.5); no `OCC` in the 1-tile margin; **gap ≥2 clear tiles** to every other house/tent (built or queued) except a lodge which may come within 1; door tile (from `houseTile` with `HOUSE[type].door`, `V+0.5`) must be in bounds, `wetD ≤0.15`, not OCC/BRIDGE, above `SEA+0.3`, within `EARTH+0.2` of the floor. Returns `{x0,y0,rot,fw,fh,dx,dy,gap}` or null. Internal (ringSite, greenSite, nearSite).
- **`ringSite(type,v,rings)`** 2550 — slot on a ring round the green. For each radius R (default `RING_R`): M = max(6, floor(2πR/4.6)) slots; phase offset π/M on the outer ring + 0.21·v; occupied angles = homes within 2.4 of R; candidates need angular gap ≥ 0.72·(2π/M) and not be shadowed by an inner home (angular half-width atan2(1.9, r)). Sorted by gap desc (tiny `h01` jitter), then tries dR ∈ {0,±0.6,±1.2} and da ∈ {0,±0.1,±0.2}; houses rotated to face the fire via `faceRot`. Callers 4262, 4308, 4320 (`startHome`, hamlet moves).
- **`greenSite(type,v,band)`** 2573 — a spot on the green for rack/pile/well/lodge/second fire: 24 angles (+0.13·v), radii from `band` (default `GREEN_R`) in 0.5 steps; score = `gap*2 + min(door,0.5)*1.5 − |r−mid|*0.3 + jitter*0.05 + min(s.gap,3)*0.8` where `door` keeps clear of homes' lines to the fire. Houses use `houseSiteOK`; others `siteFree` + `PREPF<0.5`. Internal (planVillage, planLodges, well).
- **`farmSite(fw,fh,v)`** 2595 — nearest good ground beyond the outer ring: r from `RING_R[1]+2.5`=13 to +14, angular steps max(12, round(2πr/2)), requires `siteFree` and no OCC/PREPF≥0.5 in the margin. Callers 4717, 4722 (fold, stable).
- **`tileFree(x,y,maxSlope)`** 2605 — one tile buildable: inside a 2·S=4-tile border, `wetD ≤0.08`, `E > SEA+0.6`, not rock/bridge/dam/OCC/PAVE, not a build's centre or door tile, slope ≤ maxSlope (default 0.75). Caller 5945.
- **`fpTiles(x0,y0,fw,fh)`** 2614 — index list of a footprint. Callers 4424, 5957.
- **`siteSpread(x0,y0,fw,fh)`** 2617 — height spread over footprint plus 1-tile margin. Caller 5975.
- **`siteFree(x0,y0,fw,fh)`** 2629 — unrotated footprint test (same rules as houseSiteOK minus rotation/gap; fire-yard check only for multi-tile; door = tile below first column). Callers 4249, 4421, 4446, 5972.
- **`findSite(fw,fh)`** 2644 — square-ring search out to 16·S=32 tiles from `villagePos()`, random pick among the first ring with candidates. Callers 4717, 4722.
- **`clearTile(x,y,keepTrees)`** 2657 — removes trees (wood +3 mature/+1 sapling), bushes; shoves rocks 0.8–1.4 tiles. Internal (placeBuild).
- **`levelTile(i,target,force)`** 2669 — sets `E/E0` to target, SOIL ≥0.3, fells trees (`t.fall=0.001`), removes bushes, shoves rocks; eases the 4 dry neighbours halfway if they differ by >0.45; `markWet`, `puff`, `rebuildSurface`. Callers 2076, 4163 (work pieces).
- **`damApproach(b,P)`** 2686 — pushes `clear`+`level` pieces for each dam end to `b.wall+DAM_BANK` (0.40). Caller 3916 (makePlan).
- **`approachPieces(b,P)`** 2699 — bridge landings: each end tile to `deck−0.06`; beyond the lower end up to 3 tiles: k=1 flat landing (skip if within 0.05; abort if >0.6 higher), k≥2 ramp of 0.45 steps while the ground is lower. Caller 3914.

### 3c. Build lifecycle (2730–2849)
- **`placeBuild(b)`** 2730 — mean height → `b.z0`; `clearTile` each footprint tile (keeping trees if `STAGED[type]`), `OCC=1`; unstaged types get snapped flat (dead branch: everything is staged since v9.4). Callers 4268, 4426, 4436, 4717–4725, 5915–5987.
- **`removeBuild(b)`** 2739 — frees OCC, evicts occupants, clears `home/restIn/project`, re-idles workers whose job referenced it (keeps job if `BUSY[g.st]`), splices from `builds`, `plotEnd(b,true)`, clears `village.project/project2`. Callers 3542, 3572, 3712, 4275, 4301, 6024.
- **`enterBuild(g,b)`** 2758 / **`leaveBuild(g)`** 2762 — move a gnome inside (snap to centre, `inN++`) / out (door tile ± jitter along the house frame normal). Callers 4967, 5196 / 2058, 3530, 4542, 5202, 5331, 5334, 5698–5699.
- **`mkBuild(t,x0,y0,rot)`** 2768 — constructs a footprint build: swaps fw/fh when rotated odd; door below first column, or `houseTile(b, HOUSE[t].door, V+0.5)` for houses; `sx/sy` = door. Callers 4265, 4424, 4436, 4717–4725, 5981.
- **`isCabin(b)`** 2778 — HOUSE type with beds>0. 20+ callers.
- **`countHomes()`** 2779 — done cabins. Caller 4716 + internal.
- **`houseLabel(b)`** 2780 — lowercase HOUSE label. Callers 3686, 10834, 10983.
- **`nextType()`** 2782 — village's own basic wants: fire → pile → rack (once any tent/cabin) → fires `< ceil(pop/7)` → racks `< ceil(pop/8)` → piles `< ceil(pop/10)` → null.
- **`homeBed(g)`** 2793 — own home with a free bed, else a parent's cabin for baby/child, else null (sleeps by the fire). Caller 4780.
- **`costOf(b)`** 2799 — `b.cost || BT[b.type]`. Internal.
- **`planVillage()`** 2800 — (1) from 6 gnomes, a crossing at queue head starts at once as `project2` while `project` runs; (2) once a hamlet exists, its own `pile` and `rack` are unshifted to the queue head (sited by `greenSite(t,1)`); (3) if a project runs, return; (4) pop queue head → `placeBuild`, `stageProject`, push, `village.project=` (a logbridge whose span has dried out — fewer than half its tiles `wetDrawn` — is dropped); (5) else `nextType()`: first of a kind in `GREEN_R`, a second in band `[7.5,9.5]` (between the rings), fallback `findSite`. Caller 12038.
- **`tallyShortfall()`** 2836 — for each active site (village's and gnomes' own) and each material with `siteWant>0` and `store−reserve<1`: `village.short[m]+=1.2`; cold night with bare pile adds wood. Caller 12038.
- **`mkProj(type,x,y,sx,sy,extra)`** 2843 — build object for tile/point projects (bridges, dam, trap, steps, lantern, pave, hearth, windmill, wheel); adds footprint if `BT[type].fw`. 17 external callers (3578, 4396, 4409, 4431, 5849–5953).

### 3d. Habit-driven builds helpers (2850–2990)
- **`nearBuild(x,y,r,types)`** 2850 — Chebyshev search in builds and queue. Callers 5891, 5952.
- **`land(i)`** 2855 — `wetD<0.3`, no bridge, no OCC. Caller 5888.
- **`millSpot(ends)`** 2859 — nearest tile ≤4 out from either dam end that is dry-ish (`wetD≤0.2`), above `SEA+0.6`, not rock/bridge/dam/OCC/PAVE, slope ≤1.8, not a build centre/door, with `wheelWater`; score `r*2 + slope*0.4 + wetD − 1.5 if flow>FLOW_STREAM`. Internal.
- **`wheelWater(x,y)`** 2868 — a wet (>0.3) non-dam neighbour whose surface ≤ own ground +0.25. Caller 5946.
- **`wheelFlow(x,y)`** 2869 — max FLOW of wet neighbours. Internal.
- **`lampNear(x,y)`** 2874 — a done lantern within `LAMP_R` (or `LAMP_RP` with windmill power). Caller 4627.
- **`millFood(n)`** 2880 — ×1.5 if a windmill stands. Caller 5073.
- **`lanternAt(i)`** 2881 — lantern on tile (built or queued). Internal.
- **`findSpan(cx,cy,maxLen)`** 2883 — the best straight water crossing within 2·S=4 tiles of a point: a run of non-landing tiles between two `bankDry` landings; must contain river (`FLOW≥0.25`, `WD≥0.5`, or sea) and not deep sea (`SEAS−E>1.7`); firm ends may step up to 2 tiles further onto land if the bank sits under water level; bank heights within 1.5; no cliff >0.5 above landings over land tiles; deck = max(mean bank, highest water surface+0.10)+0.08, each landing within `EARTH` of deck−0.06; score `len*2 + distance`; finally reversed so end A is nearer the stone drop point. Callers 5897, 5899.
- **`bridgePlan(sp)`** 2957 — piers at L/3, 2L/3 for L≥7 or L/2 for L≥4 (snapped to wet tiles); arch 0.10+0.035·L (L≥4), 0.04 (L≥2); deck profile sine. Callers 3577, 5909.
- **`stonePlan(sp)`** 2970 — arch `clamp(0.10·L, 0.25, 1.1)`. Caller 5911.
- **`waterWhy(tiles)`** 2978 — "the channel you cut" (MADE&2) / "the stream you opened" (no RIVER + player spring) / "". Internal.
- **`playerRaised(i)`** 2985 — MADE&1 on tile or 4-neighbour. Internal.

### 3e. Craft homes, mine, workshop, boathouse (2991–3243)
- **`craftHome(g,m)`** 2998 — for a couple leaving a tent: sort their crafts by `did[craft]` count; the first craft whose house isn't already in their village and has a site wins; else (v9.24) if no miner's cottage anywhere and not queued: a couple with `did.quarry≥2` who are not engineer/boatwright gets `'miner'`; else `{type:'cabin', site:null}`. Caller 4363.
- **`craftSite(type,v)`** 3012 — dispatch: farmer→`ringSite`; fisher→`fisherSite`; miner→`minerSite`; shepherd→`nearSite` 2.5–6.5 from a done fold; woodcutter→`woodSite`.
- **`nearSite(type,v,x,y,r0,r1,face)`** 3021 — 16 angles × radii r0..r1 step 0.5 round (x,y), facing the green (or `face`); score `r + 0.12·distToGreen + jitter`.
- **`woodSite(v)`** 3031 — a standing tree 8–24 tiles from the green with ≥7 live trees within a 4-tile box; score `dist − 0.4·n`; house 3 tiles toward the green, radius 0–3.
- **`fisherSite(v)`** 3041 — a shore (from `IDX.shores`) ≤22 from the green: water depth ≥0.25 at 1 and 2 tiles out, no bridge/dam/ice, bank 0.06–0.42 above the water surface, not sea-beach wet sand (`SEAS−E<0.6`), `FLOW ≤ 0.8·FLOW_RIVER`; house 2.6 tiles back, radius ≤1.5, facing the water; attaches `jetty:{x,y,ux,uy,len:2,sx,sy,deck}`.
- **`minerSite(v)`** 3055 — the highest tile on the whole map (4-tile border) at least `g0+1.3` over the green with a dry/open 5×5 (no water, OCC, bridge, pave, dam, sea, steps, existing mine); cottage 5.5/7/8.5/10/12 tiles toward the green (radius ≤3.5); attaches `mineAt:{cx,cy}`.
- **`isMiner(g)`** 3072 — lives in a standing miner's cottage. Callers 4215, 4882, 4919–4925, 5138, 10825, 10985.
- **`minerOf(v)`** 3073 — first living owner of the village's miner cottage. Only internal/unused externally.
- **`startMine(home)`** 3079 — builds the pit when the cottage is done (caller 4390 `homeWorks`): pit = tiles within radius 2.5 of `mineAt`; `H` = lowest rim height (ring ≥ ~2); floor = max(green+1.0, H−1.25); bench targets `tgt(k)=max(floor, H−0.25−(2−k)·0.5)` for ring k∈{0,1,2}; a drainage cut up to 12 tiles along one of 4 axes, bed falling 0.06/tile, until the hillside is below it (else the floor is raised so a cut exists); dig list = passes of 0.45 steps, cut and centre first, ≤80 digs/12 passes; clears trees/bushes/rocks (+2 stone each); windlass on the rim 3.1 tiles toward the cottage (rotated 90° if that is across the cut); pushes a `mine` build (done, work 1) and marks `MINEB/MINEZ`.
- **`mineRock(g)`** 3115 — nearest mine; the next dig tile if dry (`wetD<0.05`), else a random pit tile; null if wet. Callers 4214, 4882, 4920, 4925, 5138.
- **`digMine(r)`** 3123 — applies the next dig (E/E0/SOIL=0, markWet, `STATS.digs++`), logs when the last bench is done. Caller 5137.
- **`planMiner(v)`** 3129 — throttled 0.5 day; one mine per isle; needs ≥6 grown non-player gnomes in the village and ≥2 done cabins; picks the mated couple in a plain cabin with most quarrying (score `q*10 + idx*0.01`), not player/chief/engineer/boatwright/gone/child, not mid-home-project; builds `miner` cottage via `minerSite`, inserts after any crossing at queue head, `STATS.miners++`.
- **`planCrafts()`** 3150 — village 0 only: `planMiner(0)`; from 8 gnomes a `workshop` on the ring if an `engineerCand` exists (push to queue tail); from 8 gnomes and a done fisher cabin (or any adult with `did.fish≥6`), throttled 0.5 day: `boathouse` via `boathouseSite` (inserted after crossings) else `slipway` via `slipwaySite` (11905).
- **`engineerCand(v)`** 3162 — adult/elder non-player in the village with `did.build≥6`, highest.
- **`gone(g)`** 3163 — dead/absent/adventuring/fleeing. Callers 2054, 11417, 11476–11488.
- **`engineerOf()`** 3164 — the done workshop's `eng`, re-chosen if gone. Callers 4314, 4878, 10825, 11353, 11419.
- **`boatwrightOf()`** 3165 — the boatyard's `wright` (best fisher with ≥6 catches) re-chosen if gone. Callers 4314, 4893, 10825, 11743.
- **`boathouseSite(v)`** 3169 — shores ≤16 from the fisher's cabin (else green): depth ≥0.25 at 1 and 2 out, no bridge/dam, flow ≤0.8·FLOW_RIVER; footprint centred 1 tile back, facing water; "front" tiles may be beach (not OCC/PAVE/bridge/dam, `wetD≤0.12`, `E>SEA+0.12`, slope ≤1.4), rear tiles `tileFree(...,1.2)`, spread ≤ `EARTH·1.4`; no OCC in margin; score `d0 + 2·FLOW`.
- **`workSpot(w)`** 3188 — where the worker stands: slipway beside trestles; workshop `R(−0.55U, V+0.85)`; boathouse `R(0.62, V+0.35)`. Callers 4893, 4928, 5171.
- **`workPlace(g)`** 3190 — the workshop for the engineer; the boatyard for the boatwright while boats < `BOAT_MAX` (2). Caller 4926.
- **`drawMine(b,p,s)`** 3197 — canvas drawing of the windlass: stone heap (5 ellipses, depth-sorted), two posts, two log ribs (beam + drum), a crank that spins when `b.turnT>0`, a rope to 0.9 tiles toward the pit centre + bucket. Caller 7872.
- **`drawMineTile(i,x,y,fog)`** 3220 — marching-squares bench contours at `MINEZ+0.20+k·0.45` for k=0..3 (shadow line offset 2·Z px, pale lip), occasional cut block (zoom >0.7, 45% of floor tiles), pick marks on bare rock (zoom >0.9, SOIL<0.05). Caller 9813.

### 3f. Lodge & chief (3236–3267)
- **`homesOf(v)`** 3244 — done cabins in village v.
- **`lodgeOf(v)`** 3245 — the done lodge of v. Callers 4824, 4870–4871.
- **`lodgeSpot(L)`** 3246 — supper spot 2.3 beyond the lodge's front (`R(0, V+2.3)`), with facing normal. Caller 4825.
- **`porchSpot(L)`** 3247 — the chief's porch seat `R(0.3, V+0.5)`, `porch:true`. Callers 4825, 4870.
- **`planLodges()`** 3248 — for every village with ≥3 done cabins and no lodge built/queued: `greenSite('lodge', v, [3.4,5.4])`, inserted after any crossings at queue head; log.
- **`chiefOf(v)`** 3258 — living chief or null. Callers 5001, 11422.
- **`isChief(g)`** 3259. Callers 4314, 4825, 4870, 8267, 10825, 10985.
- **`pickChief(v,why)`** 3260 — eldest adult/elder of the village not adventuring/fleeing; on change logs (why `'lodge'` → "The lodge is finished — X, the eldest, is chief…" else "X is chief … now, the eldest after Y"), toast, `STATS.chiefs++`. Caller 3660 (`finishBuild` of a lodge) + `chiefWatch`.
- **`chiefWatch()`** 3267 — for each village with a lodge, re-pick if the chief is gone/moved village.

### 3g. `planEmergent()` 3268–3486 — the master emergent-build pass
Runs every planning tick after `tallyShortfall`; each sub-rule queues at most one project per tick (`break`):
1. **Bridges** (3269–3297): ≥3 swim `marks` within 2.5·S=5 tiles, no bridge within 4·S=8, `findSpan(…, SPAN_MAX=14)`; kind by `waterKind(L)` (log ≤3, plank ≤6, stone ≤14 if enough stone); costs: stone `w=1·L, s=4·L+4, work=26·L`; plank `w=4L, s=2+2·piers, f=2, work=14L+8·piers`; log `w=3L, s=2·piers, work=12L+8·piers`; `unshift` to queue head; marks consumed.
2. **Rope bridge** (3299–3314): ≥3 `gorges` marks within 5 tiles, no rope bridge near/queued; `gorgeSpan`; cost `w=1·L, s=4, f=2, work=9L+12`; `unshift`.
3. **Spate sweeps a log bridge** (3316–3324): `W.spate>0.5`, max FLOW ≥ 1.4·FLOW_RIVER (1.82), 5% chance/tick → `sweepBridge`; one per storm.
4. **Log → plank upgrade** (3326–3333): a done log bridge with `uses≥40`; cost `w=4L, s=2, f=2, work=14L`; queue tail.
5. **Fish trap** (3335–3344): `FISHN[i]≥8`, no trap within 2·S=4 or steps/dam/wheel on tile; queue tail; FISHN reset.
6. **Steps** (3346–3353): `CLIMBN[i] ≥ 6·S=12`, no steps within S=2; hidden project.
7. **Stone hearth** (3355–3365): a done fire, a rack, no hearth, `stone≥2 || rocks>2`; flagstone ring radius ≤1.9 round the fire (≥6 tiles).
8. **Paving** (3368–3395): rack + hearth, no pave queued, `stone≥4 || rocks>4`, `countB('pave') < 2+floor(pop/3)`; busiest tile `WEAR>2.8` not within 2.6 of the fire or on a lantern; follow worn ground both ways up to 5 steps (`WEAR>1.6`); run ≥3; cost `s=ceil(L/2), work=5·L`.
9. **Lanterns** (3400–3414): fire exists, lanterns `< min(12, 2+floor(pop/2))`, none queued; busiest tile `WEAR>1.8` not within 3·S=6 of a lantern or S=2 of any building; post goes on the driest/least-walked neighbour within 0.5 height.
10. **Well** (3416–3420): rack, ≥1 done garden, no well, `stone≥4||rocks>4`; `greenSite('well',0)`.
11. **Sub-planners** (3423): `planAnimals(); planLodges(); chiefWatch(); planCrafts(); planFlyer();` then `FIRES` rebuilt (3427).
12. **Dam + mill** (3429–3449): want = `countHomes()≥2 || felled≥40 || short.wood ≥ DAYLEN·0.4 (=84)`; no saw yet (no sawmill, no dam built/queued), no windmill queued, `!DBG.noDam`; search every tile with `FLOW≥FLOW_RIVER (1.3)`, `E>SEA+1.2`; `damRun`; score `FLOW + 0.05·E − 0.2·len`; cost `w=5L, s=2L, work=20L`; else note `damWantT`.
13. **Windmill** (3454–3477): `wantWind` = rack, no windmill, (garden ≥1 or homes ≥2); `wantSaw` = want + no saw + `damWantT` ≥2 days ago; an existing windmill takes the saw (`noRiver`, `sawmill=true`); hill search once/day within 3..16·S=32 of the village, `E>SEA+1.0`, score `E − 0.08·d`, `siteFree(x,y,2,2)`; door at `y+2`.
14. **Waterwheel** (3479–3485): done dam, no wheel → `millSpot(d.ends)`.

## 4. Concrete rules & tuning numbers (quick reference)

| Rule | Value | Line |
|---|---|---|
| Hamlet founding distance | 18 tiles from every green | 2486, 2519 |
| Home rings | r = 6.5 (inner), 10.5 (outer); slot pitch 4.6 tiles → M = max(6, floor(2πR/4.6)) ⇒ 8 and 14 slots | 2486, 2553 |
| Tent ring (callers) | `[13, 15]` = `RING_R[1]+2.5..+4.5` | 4262, 4308 |
| Ring slot min angular gap | 0.72 of a slot pitch; inner-home shadow half-angle atan2(1.9, r) | 2558–2559 |
| Green band | r = 2.6..4.6 (first of a kind); second of a kind 7.5..9.5; lodge 3.4..5.4 | 2486, 2829, 3252 |
| Farm band | r from 13 to 27 beyond the green | 2596 |
| House gap | ≥2 clear tiles between houses/tents; lodge ≥1 | 2541–2543 |
| Fire yard clearance | box −2.5..+1.5 round footprint | 2534, 2632 |
| Footprint levelness | each tile within EARTH=0.6 of the mean; spread incl. margin ≤2.0 | 2531–2532, 2628 |
| Door tile | wetD ≤0.15, E > SEA+0.3, within EARTH+0.2 of floor | 2548, 2641–2642 |
| Tile buildable | wetD ≤0.08, E > SEA+0.6, slope ≤0.75 (1.0 for footprints, 1.2 boathouse rear) | 2605–2612 |
| Map border for building | 4 tiles (2·S) | 2606 |
| Clearing wood | +3 per mature tree, +1 sapling | 2661 |
| Level easing | neighbours differing >0.45 lerped halfway | 2683 |
| Bridge ramp | 0.45 per tile step, up to 3 tiles | 2708–2714 |
| Dam bank | wall + 0.40 | 2690 |
| Basic wants | fires ≥ ceil(pop/7), racks ≥ ceil(pop/8), piles ≥ ceil(pop/10) | 2787–2789 |
| Second work party | from 6 gnomes, for crossings only | 2803 |
| Planning tick | 1.2 s; shortfall +1.2/tick | 12038, 2840 |
| Lantern reach | 5 tiles (7 with windmill power); late shift 0.045 day after supper (f≥0.68) | 2873, 4623 |
| Windmill food bonus | ×1.5 | 2880 |
| Span search | within 4 tiles of marks; max 14; banks within 1.5 height; cliff >0.5 refused; deck = water+0.10+0.08 | 2883–2949 |
| Bridge piers | L≥7 → 2 piers at L/3, 2L/3; L≥4 → 1 at L/2 | 2959 |
| Arch | timber 0.10+0.035L (L≥4) / 0.04 (L≥2); stone clamp(0.1L, 0.25, 1.1) | 2963, 2971 |
| Woodcutter site | tree 8–24 from green with ≥7 trees in a 4-box; house 3 tiles greenward | 3033–3038 |
| Fisher site | shore ≤22 from green; depth ≥0.25 at 1 & 2 out; bank 0.06–0.42 above water; flow ≤1.04; house 2.6 back; jetty len 2 | 3043–3052 |
| Miner site | map's highest point ≥ green+1.3 with dry 5×5; cottage 5.5–12 tiles toward green | 3060–3068 |
| Pit | radius 2.5 (21 tiles); floor max(green+1.0, rim−1.25); benches 0.5 apart; digs 0.45; cut ≤12 tiles falling 0.06/tile; ≤80 digs | 3083–3093 |
| Miner planning | ≥6 grown, ≥2 cabins, 0.5-day throttle; couple with most quarrying | 3130–3139 |
| Workshop | pop ≥8, builder with ≥6 builds | 3152, 3162 |
| Boathouse | pop ≥8, fisher cabin or ≥6 catches; shore ≤16 from the fisher's cabin; `BOAT_MAX`=2 | 3155–3160, 3171 |
| Lodge | ≥3 done cabins per village | 3250 |
| Chief | eldest adult/elder; re-picked when gone | 3262, 3267 |
| Swim marks → bridge | ≥3 within 5 tiles; no bridge within 8 | 3271–3274 |
| Spate sweep | spate >0.5, flow ≥1.82, 5%/tick | 3317–3321 |
| Plank upgrade | 40 uses | 3327 |
| Fish trap | 8 catches on a bank; none within 4 | 3337–3339 |
| Steps | 12 climbs; none within 2 | 3348–3350 |
| Hearth | stone ≥2 or rocks >2; ring r ≤1.9; ≥6 tiles | 3357–3365 |
| Paving | WEAR >2.8 seed, >1.6 to follow; ≤5 steps each way; cap 2+pop/3 paths; stone ≥4 | 3368–3394 |
| Lanterns | cap min(12, 2+pop/2); WEAR >1.8; 6 apart; 2 from buildings | 3400–3406 |
| Well | ≥1 garden, stone ≥4 | 3416 |
| Mill want | homes ≥2, felled ≥40, or wood shortfall ≥84 (0.4 day) | 3429 |
| Dam | FLOW ≥1.3, E > SEA+1.2 | 3435 |
| Windmill fallback | 2 days after dam want; hill search once/day, 3..32 tiles | 3455, 3461–3464 |
| Costs (BT, 2411–2452) | fire 3w/2s/13; pile 2w/9; rack 4w/2f/15; cabin 18w/10s/54 (4 beds); lodge 28w/8s/70; fisher 22w/6s/1f/50; miner 8w/20s/52; shepherd 22w/6s/4f/52; farmer 26w/6s/58; woodcutter 26w/6s/54; workshop 22w/6s/50; boathouse 24w/4s/52; slipway 4w/20; mine work 40; well 4w/6s/1f/30; windmill 8w/2s/2f/36; wheel 8w/2s/30; hearth 4s/34; lantern 1w/1f/4; trap 1w/3f/10; steps 2s/9 | outside range |

## 5. UI elements, controls, input handling

This section has **no DOM or input code**. Its only UI touchpoints are:
- `toast(...)` (2514, 3265) — the transient `#hint` banner.
- `logEv(text, subj)` (many) — the event log (`#evlog`) with a world anchor.
- `G.msg` ghost hints for the player's build placement at 5978–5979 (outside range) consume `hamletSite` to tell the player that a far-out fire founds a hamlet.
- `drawMine` / `drawMineTile` are canvas renderers hooked at 7872 and 9813.

## 6. MODE 'creator' vs 'gnome'

- The section never reads `MODE`. The only player-aware code is `founding()` (2503): it moves `PLAYER`, mate and offspring to the hamlet, so hamlets are a *player's* feature — `b.hamlet` is only set at 6011 inside the player-build path (`MODE==='gnome'` placement), and the ghost message at 5978 explains it. In creator mode the AI never founds a hamlet on its own (Jed: "only when I place it").
- `planMiner` (3135), `engineerCand` (3162), `boatwrightOf` (3166) and `pickChief`'s callers exclude `g.player`: the player's avatar can never be chosen miner/engineer/boatwright, but **can** be chief (pickChief 3262 does not exclude `g.player`).
- `planCrafts` only plans for village 0 (3151); hamlets never get a workshop/boathouse but do get lodge/chief/pile/rack (2808–2810, 3249).

## 7. Progression / unlock / economy

Population-gated: 6 gnomes → second work party & miner eligibility; 8 → workshop & boathouse. Home-count gated: 1 cabin → fold; 2 cabins → dam/mill, windmill; 3 cabins per village → lodge & chief. Habit-gated (usage counters): swims→bridge, gorge falls→rope bridge, climbs→steps, catches→trap, footfall→pave & lanterns, 40 uses→plank upgrade, quarrying tallies→miner, 6 builds→engineer, 6 catches→boatwright. Resource-gated: stone for hearth/pave/well/stone bridge; wood for fold/cart. Time-gated: dam want ≥2 days → windmill; miner/boat throttles 0.5 day; hill search daily. Queue priority: crossings first (unshift), then miner/boathouse/lodge inserted after crossings, hamlet pile/rack unshifted, everything else appended.

## 8. Persistence

None anywhere in the file (no `localStorage`/`JSON.stringify`). All state in this section (`villages`, `MINEB/MINEZ`, chiefs, timers) lives in memory and is rebuilt by `newIsland` (12101+). World generation is seeded (`rng`, `h01`), so layouts are reproducible from the seed, not saved.

## 9. Mobile / touch / performance tricks

- No touch code here. Performance notes: `planEmergent` runs several **full-grid scans** per 1.2 s tick (`for i<NC` for traps, steps, paving, lanterns; nested x,y scans for dam sites 3433 and windmill hill 3462, and `minerSite` 3061 scans the whole map). NC = 72² = 5184, so it is cheap, but it would not scale to a larger map.
- `greenSite` 24 angles × ~5 radii × `houseSiteOK` (which loops all builds per candidate) is O(builds²) per tick when a lodge is wanted but no site exists (it retries every tick: 3252).
- Deterministic hashing `h01(a,b,c)` is used for jitter so layouts are stable across ticks.
- `drawMineTile` gates detail by zoom (`Z>0.7`, `Z>0.9`) and fog alpha.

## 10. i18n (en/es)

Nothing in this section is translated. All ~40 narrative strings (`logEv`, `toast`, `b.why`, `G.msg`) are hard-coded English with Unicode apostrophes (`’`). The page's EN/ES toggle (309–311, 12212–12214) only re-paints the intro (`paintIntro()`); game narration is English-only. Any port wanting real i18n must route every `logEv`/`toast` string and the `BT[*].label` / `HOUSE[*].label` tables through a string table.

## 11. Oddities, bugs, dead code, TODOs

1. **Stale throttles on a new island** — `village.minerT` (3131) and `village.boatT` (3157) are set to `T.abs+0.5` but `newIsland` (12103) resets `T.abs=0.34` (12109) without clearing them. On a second island in one session, `planMiner` and boathouse siting are blocked until the clock passes the old value (potentially many days). `village.hamletMoveDay` (4324) has the same smell.
2. **`planVillage` hamlet pile/rack** (2808–2810) `unshift`s *before* the `if(village.project) return` and before the project2 logic — fine — but it is evaluated every tick, calling `greenSite` twice per tick even when both already exist (the `some()` guard runs first, so cost is small). OK.
3. **`placeBuild` unstaged branch** (2735) is dead by the author's own comment ("nothing is unstaged since v9.4"); `STAGED` lacks `lodge`, `fisher`, `miner`, `shepherd`, `farmer`, `woodcutter`, `workshop`, `boathouse`, `mine`, `garden`? — actually `garden` is in STAGED (3836) but the v9.20 houses are **not** listed in `STAGED`, so `placeBuild` *does* take the "unstaged" path for them: trees are felled instantly and the footprint snapped flat (contradicting the comment that builders level with spades). Possibly intentional for houses, but inconsistent with the cabin.
4. **`removeBuild`** does not clear `b.vil`-related village state: if the founding fire (`villages[v].fire`) is removed, `greenOf` falls back to the stored x,y (handled, 2492), but `villages[v].chief` is never cleared when a lodge is removed (`chiefWatch` only runs for villages *with* a lodge, so a chief outlives a demolished lodge forever).
5. **`minerOf(v)`** (3073) and **`houseLabel`'s** sibling `countHomes` are fine, but `minerOf`, `villageAvg`, `nearestVil`, `angDiff`, `houseSiteOK`, `greenSite`, `millSpot`, `wheelFlow`, `lanternAt`, `waterWhy`, `playerRaised`, `craftSite`, `nearSite`, `woodSite`, `fisherSite`, `minerSite`, `planMiner`, `planCrafts`, `engineerCand`, `boathouseSite`, `homesOf`, `planLodges`, `chiefWatch`, `nextType`, `costOf` have no callers outside the range — they are internal helpers, not dead, except **`minerOf`** which has *no* callers at all (dead).
6. **`craftHome` fallback comment vs code**: comment (3005–3007) says "once the village has three cabins, for the next couple whatever they have done", but the code only grants `miner` to a couple with `did.quarry≥2`; the three-cabin clause is implemented separately in `planMiner` (3133: ≥2 cabins, not 3). Comment drift.
7. **`planCrafts` hard-codes `v=0`** (3151): hamlets never get a workshop, boathouse or (via `planMiner(0)`) a miner unless the single isle-wide mine is theirs by `craftHome`.
8. **`ringSite` 'others' filter** excludes `b.offRing` but nothing in this range sets `offRing` — set elsewhere or vestigial.
9. **Windmill door** at `best[1]+2` (3469) assumes fw=fh=2 unrotated; `mkProj` footprint path (2847) sets `dx=sx` consistently. Fine.
10. **`founding`**: `villages[1]` is created even if the player's fire is in creator mode? No — `b.hamlet` only set at 6011 (player path). But a *village-planned* second fire placed ≥18 away by `findSite` fallback (2830) would **not** found a hamlet (no `b.hamlet`), by design.
11. **`approachPieces`** comment says "up to 3 tiles" of ramp but loop is `k<=3` from the tile *beyond* the end, so a landing + 2 ramp steps.
12. Many "Jed:" quotes in comments — the owner's feedback is embedded as design rationale; worth preserving the pattern of citing the designer's words next to the rule.

## 12. Reusable engine/shell vs gnome-specific content

**Reusable (engine):**
- The settlement geometry kit: `faceRot`, `angDiff`, `houseSiteOK`, `ringSite`, `greenSite`, `farmSite`, `nearSite`, `tileFree`, `siteFree`, `siteSpread`, `fpTiles`, `findSite` — a generic "place a rotated footprint on a height-field around a focal point, on concentric rings, with clearance rules". Directly reusable for placing benches, kiosks, fountains, flowerbeds round a park's focal point.
- Build lifecycle: `mkBuild`, `mkProj`, `placeBuild`, `removeBuild`, `enterBuild`, `leaveBuild`, the `BT`/`HOUSE` data-table pattern (footprint, cost, work, beds, label, door offset), `costOf`, `queued/hasB/countB` and the `village.queue / project / project2` scheduler in `planVillage`.
- The **emergent-build pattern** in `planEmergent`: usage counters on the grid (`WEAR`, `FISHN`, `CLIMBN`, `marks`) → threshold → one queued project per tick → counter reset, with an English `why` string and an event-log entry. This is the heart of the "the world responds to habits" feel and transfers to a park (worn grass → gravel path; benches where couples linger; lanterns on busy walks).
- Earthwork helpers `levelTile`, `approachPieces`, `damApproach`, `clearTile` (if the new game keeps a height-field).
- `findSpan`/`bridgePlan`/`stonePlan` if the park has water (ornamental lake, stream with footbridges — very plausible for a French park).
- Role election (`engineerCand`/`engineerOf`/`boatwrightOf`/`pickChief`/`chiefWatch`): "pick the best-qualified living agent by a tally, re-elect when gone" — reusable for park roles (gardener, maître d', musician).
- Multi-settlement registry (`villages`, `vilOf/bvil`, `greenOf`, `founding`) — reusable as "zones" of a park (rose garden, bandstand lawn, lakeside).
- Rendering sub-pattern: marching-squares contour drawing in `drawMineTile` is a generic terracing/contour renderer.

**Gnome-specific (content):**
- Everything in `CRAFT_HOME`, `craftHome`, `woodSite`, `fisherSite`, `minerSite`, `startMine`, `mineRock`, `digMine`, `planMiner`, `drawMine`, mine arrays; `nextType`'s fire/pile/rack ladder; hamlet founding by the player's fire and the hat-colour palettes; lodge/chief/eldest rules; dam/mill/windmill/sawmill economy; swim marks → bridges; all narrative strings and `Jed:` rationale.
- The `BT` cost triples (wood/stone/fibre) and `HOUSE` wall/roof vocabulary.

## 13. Design questions for the Parque D'Amour port

1. **What is the park's "green"?** The village is defined by its first fire; what founds a park zone — a fountain, a bandstand, the player's first bench? Can there be several focal points (`villages[]` max 2 here)?
2. **Rings or paths?** Homes sit on concentric rings facing the fire. Do park features (benches, kiosks, flowerbeds) sit on rings round a focal point, along allées, or on a designer-drawn plan? What are the radii and spacing (4.6-tile pitch, 2-tile clearance)?
3. **Who builds, and from what?** Gnomes haul wood/stone/fibre to staged sites. In a park, is construction instant (Creator mode), budgeted (a park council), or done by gardeners over time? Keep the `BT{w,s,f,work}` shape or replace with francs/flowers/time?
4. **What are the "habits" the park responds to?** Replace swims→bridge, climbs→steps, footfall→paving, catches→trap with romance analogues: lingering→bench, kisses→gazebo, worn grass→gravel, night walks→lanterns, rain→kiosk awning? Which counters, thresholds and caps?
5. **Does the avatar found anything** the AI never does (the hamlet rule: only the player's far-out fire)? What is the sabotage equivalent — a feature placed to split lovers?
6. **Roles and election:** chief = eldest; engineer = most builds; boatwright = most catches. Which park characters are elected (park keeper, florist, violinist, chaperone) and by which tally? Can the avatar hold a role?
7. **Craft homes → character homes?** Does each NPC couple get a themed dwelling/stall placed by a site-finder tied to terrain (water, trees, summit)? Which terrain features exist in the park (lake, grove, hill, café)?
8. **Water and terrain:** will the park have a height-field with rivers/lakes (keeps `findSpan`, bridges, dams, mills) or a flat plan (drop ~400 lines of earthwork and spans)?
9. **Milestones and population gates:** 6/8 gnomes, 1/2/3 homes. What are the romance progression gates (number of couples, dates, the central couple's relationship stage) that unlock lodge-like communal features (bandstand, pavilion)?
10. **Queue priority:** crossings first, then halls/workshops, else FIFO. What is urgent in a park — a rain shelter during a storm, lighting at dusk?
11. **Narration:** every rule writes an English `logEv` line and a `why`. Will Parque D'Amour narrate in FR/EN/ES? Then design a string table from day one — nothing here is translatable as-is.
12. **Save/load:** none exists. Does the new game need persistence (localStorage) of zones, roles, counters?
13. **Scale:** full-grid scans every 1.2 s assume a 72×72 map. How big is the park?
14. **Creator vs avatar placement:** here the ghost (`G.msg`) explains consequences of a placement (founding a hamlet). What consequences should the Creator see when placing a bench near the lovers, and should sabotage be hidden from the "assist" UI?
