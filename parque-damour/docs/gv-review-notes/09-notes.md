# Gnome Village review — section 09: lines 4222–4734
## "Households, gnome brain, shape of a day, mishaps, gatherings"

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Range read in full: 4222–4734 (513 lines). Peeks outside the range only to resolve symbols; those are marked "(outside)".

---

## 1. Purpose of the section

This block is the **social-simulation layer** that sits between the per-tick gnome state machine (next section, from ~4736) and the village planner (`planVillage`, earlier). It contains:

1. **Households (4222–4546)** — pairing of single adults, courting, tents → cabins, the couple's "small works" (flagstone step-path, kitchen garden, picket fence, beehive, flood bank), empty-home reuse, the hamlet (second settlement) top-up migration, strangers arriving by sea after a day alone, the player's "+ villager" button, grown children leaving home, and elders at seven years setting off in a boat with the family waving from the shore.
2. **Tool-swing and lay-time tables (4548–4556)** — `swingStep` and `LAY_T` (seconds per construction piece).
3. **Gnome brain tables and utilities (4557–4606)** — the `BUSY` / `SHAKEN` / `CAN_HELP` / `INDOORS` state sets, `clearMarks`, `releaseBed`, `deposit` (larder cap), `eatNow`, `haulHome`, `foodJob`.
4. **Shape of a day (4607–4631)** — `dayPhase`, bedtimes with per-gnome jitter, the "lantern's hour" late shift, `hearth`.
5. **Player-caused jostling (4632–4657)** — what a gnome does when the creator buries it, digs under it or drops a rock on it.
6. **Mishaps (4658–4701)** — `STATS` object, river sweep, falls/float, rescue callers, washing up.
7. **Gatherings & seasonal (4702–4734)** — midsummer dance, harvest supper, dry spell, animal buildings planner (`planAnimals`), feast spot, children's snowmen.

The schedule: `households()` is called once per **planning tick (1.2 s)** from the main `step()` at line 12038 (outside): `planT-=dt; if(planT<=0){ planT=1.2; tallyShortfall(); planEmergent(); planVillage(); households(); }`. `planAnimals()` is called from `planVillage` at 3424 (outside). `updateSnowmen(dt)` from `step()` at 12036.

---

## 2. Global / module-level state defined or mutated here

### Defined in this range

| Name | Line | Type / shape | Notes |
|---|---|---|---|
| `strangerT` | 4292 | `let` number, seconds-ish countdown | Cooldown between strangers coming ashore. Set to `DAYLEN*0.12` (=25.2) on a newcomer (4384), decremented by 1.2 per planning tick (4386) i.e. ~1 per second. Reset to 0 in `newIsland` (12104 outside); exposed to the test harness as `strangerT:()=>strangerT` (12233). |
| `NO_COURT` | 4293 | `{state:1}` set | States a gnome may not court from: swept, float, help, shiver, heave, dig, yelp, goRescue, comfort, sleep, goAdventure, adventure, flee, court. |
| `LAY_T` | 4554 | `{pieceKind: seconds}` | Seconds to lay each construction piece; consumed at 5167 (outside) as `g.t=(LAY_T[nx.k]||1.3)*(elder?1.3:1)`. Default 1.3 s for unknown pieces. |
| `BUSY` | 4558 | `{state:1}` set | States that a decision tick must not interrupt (used at 2751, 4810, 5271, 5542, 5543, 5643, 5696, 11148, 11809, 12193 outside). Very large: ~100 states, including the v9.21 machines (flyer, rowboat). |
| `SHAKEN` | 4562 | `{state:1}` | heave, dig, yelp, float, swept — a jostle on a gnome already in these only "kicks" (4642). Only used inside this range. |
| `CAN_HELP` | 4564 | `{state:0/1}` | States a friend can be pulled out of to go rescue. Note `follow:0` is an explicit false. Only used in `callHelpers` (4678). |
| `INDOORS` | 4566 | `{sleep,shelter,huddle}` | The only states allowed behind a door; consumed at 5698 (outside). |
| `STATS` | 4658 | object of counters | Initial keys: sweep, float, rescue, shelter, flee, born, climbs, boats, dined, indoors (all 0). Many more keys are added ad hoc elsewhere (`STATS.arrived`, `.called`, `.hamletMoves`, `.banks`, `.flyers`, `.flights`, `.landings`, `.rowboats`, `.tripsOut`, `.boatCatch`, …) via `(STATS.x||0)+1`. Never persisted; it is a debug/harness tally (no reader in the UI was found in the greps — it is read by the external test harness through the exported object at 12231–12235). |
| `dugRecently` | 4659 | `let` number (seconds) | Set to 0.5 by the `lower` tool (11131 outside); decays `-=dt` at 5690; gates the "ground dug out from under" float at 5704. |
| `snowmen` | 4729 | array of `{x,y,life,...}` | Pushed at 5037 (outside, children's winter game), drawn at 9709, cleared on new island (12104), exported to harness (12234). |

### Mutated here (defined elsewhere)

| Name | Where mutated (this range) | What |
|---|---|---|
| `store.fibre/.wood/.stone/.food` | 4274 (`retireHome` +1 fibre, +2 wood), 4299 (`dropHomeWork` refunds `b.got`), 4579–4580 (`deposit`) | Materials economy. |
| `builds[]` | push in `startHome` 4268, `homeWorks` 4397/4410/4425/4432/4437, `planAnimals` (via `village.queue`), remove via `removeBuild` in `retireHome`/`dropHomeWork` | |
| `gnomes[]` | push in `newcomer` 4478, `addVillager` 4497 | |
| `village.hamletMoveDay` | 4322 | Day of the last hamlet move (one per day). **Only read inside `hamletTopUp` (4305); not reset in `newIsland`.** |
| `village.queue` | `planAnimals` 4717, 4720, 4722, 4725 | Village build queue for fold/kennel/stable/cart. |
| `marks[]` | 4666 (`startSweep`) | Bridge-wanting marks: a sweep pushes 2 marks at `g.swimFrom`; capped at 60 entries. |
| `g.*` per-gnome fields | throughout | See §3 per function. New fields introduced in this range: `g.partner`, `g.soloT`, `g.waitT`, `g.stranger`, `g.called`, `g.sweptT`, `g.panicT`, `g.helpT`, `g.fell`, `g.rescT`, `g.wary`, `g.swimFrom`, `g.struck`, `g.work`, `g.bendV`, `g.hop`, `g.adx/ady` (set at 5494). `g.called` (4497) is **write-only** — never read anywhere. |
| `b.*` per-building fields | throughout | `b.owners`, `b.kids`, `b.vil`, `b.jetty`, `b.mineAt`, `b.bigGarden`, `b.moveFrom`, `b.stepAt`, `b.stepPath`, `b.gardenTried`, `b.fenceTried`, `b.hiveTried`, `b.bankTried`, `b.fenceWreck`, `b.fenceWet`, `b.lanternNight`, `b.putOff`, `b.home`, `b.big`. |

---

## 3. Functions — every one in the range

### Households (4222–4546)

**Block comment 4222–4228** states the rules: tent = first home; cabin = couple's own, only cabin couples have children, two at a time; a grown child moves off, pitches a tent, waits for a partner (an unrelated single or a stranger from the sea); **at seven years** a gnome walks to the shore and sets off (age 84 days / 12 days per year = 7 years; `AGE_LEAVE=84` at 1375 outside).

| Line | Signature | Does | Called by |
|---|---|---|---|
| 4229 | `isSingle(g)` | adult or elder with no mate. | households 4336; exported to harness 12233. |
| 4230 | `related(a,c)` | Incest guard: true if parent/child, siblings (shared parent), first cousins (shared grandparent), or aunt/uncle–niece/nephew (a's parent is c's grandparent or vice versa). Uses `g.parents` arrays (2 entries, may contain null). | households 4336, 4381; exported 12233. |
| 4240 | `ownsProject(g)` | `g.project` if it is unfinished and still in `builds`, else null. | Widely (2839, 3140, 4896, 5650, 6007, 6020, 6031, 10982, 10997, 11004, 12191 outside). |
| 4241 | `homeOf(g)` | `g.home` if finished and still in `builds`, else null. | Widely (1914, 2511, 2794, 2796, 3736, 4898, 5488, 5520, 5539, 5837, 10912, 10913, 10981). |
| 4243 | `findSiteNear(x,y,fw,fh,rmin,rmax)` | Searches concentric square rings of Chebyshev radius `r` from `rmin` to `rmax` round (x,y) for a footprint `fw×fh` that `siteFree` accepts **and** whose 1-tile margin has no `OCC` or `PAVE`; stops once ≥6 candidates found on a ring; returns a random candidate `{x,y,r}` (uses seeded `rng()`), else null. | startHome 4263; planAnimals 4720, 4725. |
| 4258 | `startHome(owners,type,near,rmin,rmax,site)` | Sites and stages a home. Order: (1) an explicit `site` ({x0,y0,rot,jetty?,mineAt?}) from `craftHome`; (2) `ringSite` on the owners' village ring — tents on an outer band `[RING_R[1]+2.5, RING_R[1]+4.5]` = [13, 15] tiles, cabins on `RING_R` = [6.5, 10.5]; (3) `findSiteNear` fallback, rotated to face the green via `faceRot` if square footprint. Creates `mkBuild`, sets `owners`, `kids=[]`, `vil`, copies `jetty`/`mineAt`, `farmer` gets `bigGarden=true`. Logs a flavour line for craft houses (fisher/miner/shepherd/farmer/woodcutter). `placeBuild`, `stageProject`, push to `builds`, each owner's `g.project=b`. Returns b or null. | households 4357, 4359, 4367; hamletTopUp 4320. |
| 4272 | `retireHome(b)` | Removes a building (a tent) with a `puff`, refunds **+1 fibre, +2 wood** (tent cost 5 wood/3 fibre, so partial refund). | households 4345, 4351, 4353, 4358; finishBuild 3684 (outside). |
| 4277 | `moveIn(g,b)` | `g.home=b`, `g.project=null`, adds g to `b.owners`. | households 4351, 4356. |
| 4279 | `emptyHome(type,v)` | A finished building of `type` (optionally in village `v`) none of whose owners is still alive. Comment: a home the player raised for the village (v9.9) or one whose household sailed. | households 4357, 4365. |
| 4283 | `homeCount(v)` | Count of finished tents/cabins in village `v` with a living owner (v9.23: a tent and the cabin beside it count as one household — approximately; actually both would count if both `done`, but the tent is retired when the cabin finishes). | settleVil, hamletTopUp, households. |
| 4284 | `joinVil(list,v)` | Sets `g.vil=v` and re-rolls a village-coloured hat (`hatFor`) for everyone in `list` not already in v (babies keep no hat). | settleVil, hamletTopUp, households 4353. |
| 4285 | `settleVil(g,m)` | v9.20: which village a new couple settles in. 0 if no hamlet. If either already belongs to the hamlet → 1; else → 1 while `homeCount(1)*2 < homeCount(0)` (hamlet has fewer than half the village's households). Logs "setting up home in the hamlet — green and purple hats". Returns v. | households 4357, 4359. |
| 4298 | `dropHomeWork(b)` | Abandons a household project: refunds whatever was delivered (`b.got`), resets the home's `gardenTried/fenceTried/hiveTried` so the next household starts afresh, `removeBuild`, clears `g.project` on owners and any `g.job` pointing at it (idle, decide in 0.2 s). | hamletTopUp 4318. |
| 4304 | `hamletTopUp()` | v9.23 "keep it topped up": once per day (`village.hamletMoveDay!==T.day`), while hamlet households × 2 < village households, and no move is in flight (`b.moveFrom&&!b.done`), and the hamlet has room on both its tent band and cabin ring: picks the **newest** (highest index in `builds`) plain `cabin` in village 0 finished ≥2 days (`T.abs-b.doneT>=2`), owned by exactly 2 living mutual mates, neither a child, neither the player / chief / engineer / boatwright, neither inside/in boat/in flyer/in a NO_COURT state/already of the hamlet, and not currently raising a home or a flood bank. Drops any half-done garden/fence (`dropHomeWork`), `joinVil` couple + their baby/child kids to 1, starts a tent near the hamlet green (`findSiteNear` ring 2–6 as fallback), tags `nb.moveFrom=b`, sets `hamletMoveDay`, `STATS.hamletMoves++`, logs. On failure to site the tent, reverts `joinVil(...,0)`. | households 4329. |
| 4327 | `households()` | The per-planning-tick household pass (see §4 for the full rule order). | step() 12038 (outside). |
| 4388 | `homeWorks(g,m,home)` | A settled couple's "small works", one at a time, each the couple's own project (see §4.3). | households 4347, 4350. |
| 4440 | `hiveSite(gd,home)` | v9.17: candidate tiles on the ring **two** out from the garden's edge (excludes the beds and the fence line one out), excluding the garden's stand (`gd.dx,gd.dy`), the home's yard (`yx,yy`) and door (`dx,dy`), must be `siteFree(x,y,1,1)`; picks the one nearest the garden's far corner (apple tree at `x0+fw-1, y0+fh-1`). Returns `[x,y]` or null. | homeWorks 4435; exported 12234. |
| 4454 | `fenceGarden(h)` | The home's garden (done or in progress) or any garden building with `b.home===h`. | homeWorks 4428; 4007, 5848 outside. |
| 4456 | `stepPathTiles(home)` | BFS (4-neighbour, max 160 pops, ±6 tiles from the door) from the door tile to the nearest already-`PAVE`d tile over dry (`wetD≤0.1`), unoccupied, non-bridge ground with step ≤0.6 levels. Returns the unpaved tiles on the path, truncated to **7**, or null. | homeWorks 4396; 5855 outside. |
| 4472 | `newcomer(forG)` | A stranger of the other sex, age `AGE_ADULT+0.5..+6` days, `stranger=true`, `parents=null`, hunger 0.3, energy 0.8, `soloT=T.abs`; takes the village of `forG` (hat recoloured); spawns at the nearest **sea** shore (`nearestSeaShore`, else `nearestShoreFrom` within 40*S = 80 tiles). `STATS.arrived++`, splash FX, log + toast, state `wander` towards `forG` ±1 tile. | households 4384; exported 12233. |
| 4488 | `addVillager()` | The **+ on the gnome chip** (`$('bAdd')` click at 12171 outside). Refuses at `POP_CAP` (44) with a toast. Sex: male if a free adult female waits and no free male, female if vice versa, else coin flip. Lands on the sea shore nearest the village green; `stranger=true`, `called=true`, `STATS.arrived++`, `STATS.called++`; log says who is waiting. Walks to the green ±1 tile. | bAdd handler 12171; exported 12233. |
| 4505 | `leaveHome(g)` | Removes g from `home.kids`, clears `g.home`, `g.waitT=0`. | 5559 (outside) on the child→adult transition. |
| 4512 | `nearestSeaShore(x,y)` | Scans the whole grid (excluding the 1-tile border) for a dry tile (`E` in `(SEA, SEA+1.2]`, `wetD≤0.2`, not `OCC`) with a 4-neighbour at/below `SEA`; nearest by squared distance; returns `{x,y,dx,dy}` where (dx,dy) is the direction out to sea. O(N²)=5184 tiles per call — fine at this scale. | newcomer, addVillager, setOff; exported 12233. |
| 4522 | `family(g)` | Living non-baby gnomes who are g's child, parent, mate, sibling, or grandchild. | setOff 4545. |
| 4531 | `setOff(g)` | At `AGE_LEAVE` (5562 outside): `dropAll`, `releaseBed`, leave `owners`, the cabin gets `lanternNight=T.day` (a lantern burns at the door that night, drawn at 7255), the mate is widowed (`mate=null` both ways), `home/project=null`, state `goAdventure` with `job={k:'adventure',s:shore}`; walks to the shore (fallback: the map edge). Up to **6** family members (not asleep indoors) are pulled out (`leaveBuild`, `dropAll`, `releaseBed`) into `goFarewell` with `job={k:'farewell',s,who}` and positioned in a line 1.2+0.5n tiles back from the water. | 5562 (outside). |

### Tool swing and lay times (4548–4556)

| Line | Signature | Does |
|---|---|---|
| 4548 | `swingStep(g,dt,P,onStrike)` | Accumulates `g.work`; fires `onStrike()` once at **70 %** of period `P` (`g.struck`), wraps at `P`. Called from chop/quarry/dig/drain etc. (2092, 5121, 5136, 5175, 5184, 5213 outside). |
| 4554 | `LAY_T` | Seconds per piece. Cabin pieces: found 8, chimwall 8, chim 6, wall 6, gable 6, ridge 6, shingle 5, window 5, door 5. Small: slab 1.8, pole 2, cloth 2, peg 1.5, post 2, bar 2, line 1.5, ring 2, log 1.6, lamp 1.5. Bridge/dam: pier 4, deck 3, footing 3, plank 2.5, rail 2.5, rope 2, dambed 4, damlog 3, stake 2.5, weave 2.5, step 3. Mill/flyer/boat: base 4, frame 3, rim 3, paddle 2.5, lintel 3, cart 2.5, picket 3, row 7, apple 6, anchor 4, tower 4, cap 3, sail 3, level 4, centring 4, arch 5, parapet 3. v9.17 animals/hive/well: stand 2.5, skep 4, wring 4, wpost 3, wbeam 3, wroof 3, wrope 2.5, hutch 4, gate 3, kbox 3, kroof 2.5, srail 3, hay 2.5, sroof 3, wheelc 4, bed 3, shaft 2.5, runner 3, trestle 3. Elders ×1.3 (5167). |

### Gnome brain tables and utilities (4557–4606)

| Line | Signature | Does | Called by |
|---|---|---|---|
| 4558 | `BUSY` | see §2. | |
| 4562 | `SHAKEN` | see §2. | |
| 4564 | `CAN_HELP` | see §2. | |
| 4566 | `INDOORS` | see §2. | |
| 4567 | `clearMarks(g)` | Un-marks the resource the gnome's job had claimed: `job.t.marked` (tree), `job.b.marked` for `bush`/`collect`, `job.r.marked` (rock). | 1522, 2059, 2752, 4811, 5546, 5657, 6015, 11150, 11402, 11412, 11801, 11814, 11815, 12193 + many in-range. |
| 4574 | `releaseBed(g)` | Decrements `g.restIn.occ`, clears `restIn`. | ~20 sites. |
| 4575 | `rackBonus()` | 1.5 if a drying rack is built, else 1 — multiplier on food deposited. | deposit; 5459. |
| 4576 | `deposit(g)` | Puts `g.carry` into `store`. Water is discarded. Food × `rackBonus()`. **Larder cap: `store.food ≤ gnomes.length*5+16`.** `sfxDrop`. | 2059, 4152, 4982 (outside). |
| 4583 | `eatNow(g,a)` | `hunger -= a` (clamped), eat sfx, '~' note FX. | 4993, 5049, 5073, 5105, 5462. |
| 4584 | `haulHome(g)` | Water carried → dropped, idle. Else: deliver to own project if it still needs that material (`needRem`), then to a village site (`villageSites()`), else to the store's drop point (`dropPoint`). Sets `st='haul'`, `job={k:'deliver',b}` or `{k:'store'}`. Food is never delivered to a site. | 13 call sites. |
| 4591 | `foodJob(g)` | Food-seeking priority: (1) non-child: a stocked fish trap within 18*S=36 tiles → `goCollect`; (2) non-child: a free boat (`boatFishJob`, v9.21); (3) non-child whose top craft is `fish`: nearest shore within 36 tiles → `goFish`; (4) nearest bush within 16*S=32 tiles → `goBush` (`stock:1`); (5) non-child: nearest shore → `goFish`. Returns bool. | 4876, 4887, 4891, 4914. |

### Shape of a day (4607–4631)

| Line | Signature | Does |
|---|---|---|
| 4608 | `dayPhase()` | `T.f` ∈ [0.235,0.68) → 'day'; [0.68,0.76) → 'dinner'; [0.76,0.86) → 'social'; else 'night'. (`DAYLEN=210` s, so day ≈ 93 s, dinner ≈ 17 s, social ≈ 21 s, night ≈ 79 s.) |
| 4615 | `bedtimeOf(g)` | child 0.80 (0.87 on midsummer night), baby 0.80, elder 0.865, adult 0.885, plus `g.bedJit` ∈ [−0.02,0.02] (set in `makeGnome` 1398). |
| 4616 | `isBedtime(g)` | `T.f ≥ bedtimeOf(g)` or `T.f < 0.235+bedJit`. |
| 4617 | `isMorning(g)` | `[0.235+bedJit, 0.6)`. |
| 4618 | `evening()` | `T.f ≥ 0.68 || T.f < 0.235` — nobody works. |
| 4623 | `lateSite(g)` | v9.14 lantern's hour: for `T.f ∈ [0.68, 0.68+LATE_SHIFT)` (LATE_SHIFT=0.045 ≈ 9.5 s), an adult/elder keeps working on a site that is lit (`lampNear`): own project if unfinished, else the village's sites. Returns the site or null. |
| 4630 | `lateShift(g)` | boolean wrapper. |
| 4631 | `hearth(g)` | `warmSpot(g)` (a lit fire) or the village green centre with `camp:true`. |

### Jostling (4632–4657)

| Line | Signature | Does |
|---|---|---|
| 4635 | `gnomesOn(x,y)` | Gnomes (not inside/in boat/in flyer) whose rounded position is (x,y). Called by the terrain tools at 11129/11135/11142 and 5229. |
| 4640 | `jostle(g,kind,obj)` | The creator's edits "cannot hurt a gnome". `kick`: random lean `bendV ±7..12`, `hop ≥ 0.45`. If already `SHAKEN` → just kick. If in a boat, out of the boat. Otherwise `clearMarks`, `releaseBed`, clear job/partner/path, then by kind: `'rock'` → `heave` for 1.6 s (`job={k:'heave',r:boulder}`), moan + '!' + puff; `'bury'` → `dig` 1.3 s, moan + puff; else → `yelp` 0.85 s, yell + '!'. `decide` set to 2.4 / 2.0 / 1.4 s. Callers: raise tool → bury, lower tool → yelp, rock tool → rock, demolish/footprint → yelp (3535–3536). |

### Mishaps (4658–4701)

| Line | Signature | Does |
|---|---|---|
| 4660 | `dropAll(g)` | Full reset: `clearMarks`, `releaseBed`, job/partner/path null, `arrived=true`, `boat=0`, `hatHand=0`, `dismount` if riding; drops perishable carries (water, fish, apple, berries) but keeps wood/stone/fibre/food. Only called in-range (setOff, startSweep, startFloat). |
| 4661 | `startSweep(g)` | River sweep: `dropAll`, `st='swept'`, `sweptT=0`, `panicT=1.4`, `swim=1`, **`wary=240`** (seconds of avoiding swims; pathfinder swim cost 9.0 vs 3.6 while `wary>0`, line 1575), `STATS.sweep++`, panic sfx; pushes **2** bridge-marks at `g.swimFrom` (cap 60); log; `callHelpers(g, 9*S=18 tiles, 2)`. Callers: river entry 1657, building demolition 3534, 3569, hat-boat 5306. |
| 4670 | `startFloat(g,drop,dug)` | Falling with the hat as a parachute: `z=max(0.3,drop)`, `st='float'`, `helpT=0`, `fell=dug?1:0`, `STATS.float++`; dug → yell + log "had the ground dug out from under her/him — out came the hat", else `sfxHup`. Callers: ledge jump 1651, waterfall 5347 (`fell=2` after), dug-under 5704. |
| 4676 | `callHelpers(v,radius,max)` | Nearest `max` adults/elders (not baby/child/inside, state in `CAN_HELP`) within `radius` (squared compare) become `goRescue` with `job={k:'rescue',v}`, `rescT=0`. Returns count. Also 5362. |
| 4685 | `washUp(g)` | After a sweep: nearest dry tile within 2*S=4 tiles (not wet>0.3, above sea, no bridge, not OCC); teleports there ±0.2; `swimFrom=null`, `swim=0`, re-indexes tile and `gz`; `st='shiver'` for 8 s, `warm=min(warm,0.22)`, `decide=8.5`; splash FX; log. Called 5345. |

### Gatherings and seasonal (4702–4734)

| Line | Signature | Does |
|---|---|---|
| 4703 | `festival()` | `'midsummer'` on summer (season 1) day 2 (`T.ds ∈ [1,2)`); `'harvest'` on autumn (season 2) day 2; else null. `T.ds = ((T.day-1)%SEASON_DAYS)+T.f` (822 outside), SEASON_DAYS=3. |
| 4708 | `danceTime()` | midsummer and `T.f ∈ [0.74,0.9)` and a lit fire exists. |
| 4710 | `danceFire(g)` | The gnome's own village's green fire if lit, else any `warmSpot`. |
| 4712 | `drySpell()` | Spring/summer, `T.cold<0.2`, and `T.abs - village.lastRain > 1.0` day. (`lastRain` set at 5765 when `W.rain>0.3`.) Gardens wilt unless watered from the well. |
| 4713 | `hiveNear(gd)` | A done hive within Chebyshev 6 of a garden (5786). |
| 4714 | `planAnimals()` | Queues village animal buildings: **fold** (3×3) when no fold, a rack exists, ≥1 finished cabin, ≥3 wild rabbits, wood ≥6 (`farmSite(3,3,0)` else `findSite`); **kennel** (1×1) 2–4 tiles from the fold once a fox is tamed (`theDog`); **stable** (2×2) once a deer is tamed (`theHorse`); **cart** 2–4 tiles from a finished stable when ≥1 finished pave tile and wood ≥6. Each: `mkBuild`, `placeBuild`, `village.queue.push`, log. |
| 4727 | `feastSpot(g)` | The village's done drying rack (own village first, else any), else `hearth(g)`. |
| 4730 | `updateSnowmen(dt)` | Each snowman: if `T.cold<0.3` or `W.rain>0.5` it melts (`life -= dt/50`, removed at ≤0); else firms up (`life += dt/20`, cap 1). |

---

## 4. Concrete rules and tuning numbers

### 4.1 Pairing and courting (households 4331–4346)
- Eligible actors: adult/elder, not inside, not flee/adventure/goAdventure, not the player.
- A **single adult** (not elder) not in a NO_COURT state picks the **nearest** adult single of the other sex, not related, not in NO_COURT. Both get `mate`, `partner`, `waitT=0`, `soloT=-1`, `st='court'`, `t=16` s, jobs cleared; they walk to their midpoint ±0.4*S. Log + toast "X and Y are courting". The `court` state (5483 outside) resolves on meeting (<1.4*S) with a heart FX, or `makeBaby` if they share a cabin; times out at 16 s.
- Tent merge: if g has a tent and the other has a different tent, the other's tent is retired; the other joins g's tent. If g has no home but the other has a tent, g joins it.
- **Elders never initiate courting** (stage must be 'adult'), but a single elder is still a valid *target*? No — target must be `o.stage==='adult'` too (4336). So elders never pair.

### 4.2 Homes (4347–4369)
- v9.19: a flooded cabin yard (`home.flooded && !bankTried && W.spate<0.3`) pre-empts whatever the couple is on.
- If g already owns an unfinished project → skip.
- A couple: join the mate's project if any; if either has a cabin, both live there, then `homeWorks`. Else an **empty cabin** in the village they'd settle in (`vE`) is taken over (tent retired, `joinVil`). Else share the mate's home. Else with no home at all: `settleVil`, take an **empty tent**, else `startHome(...,'tent', hamlet green or village centre, ring 1–8)`.
- A tent couple starts their cabin when **`store.food ≥ 6` and a woodpile and drying rack exist** ("the camp's woodpile and drying rack go up before anyone starts on a house"). `craftHome` (2998 outside) chooses a craft house (fisher/miner/shepherd/farmer/woodcutter) by the couple's top craft, else `cabin`; sited via `startHome` ring 2–6 from the tent.
- A single adult (not elder) with no home: an empty tent, else a new tent 5–9 tiles from the parents' cabin (or village centre).

### 4.3 Small works (`homeWorks` 4388–4439), strictly in order, one at a time
- Prerequisite: home done; miner's cottage with `mineAt` and no mine → `startMine`.
- **Flood bank** first (v9.19): `bankPlan(home)` → `mkProj('bank', …)`, puts off the current project (`b.putOff`), `STATS.banks++`. If no bank possible, log "the water comes from all round".
- Nothing else while either owns a project, or while **`store.food < gnomes.length*3+8`** ("the small works wait for a full larder").
- **Step path**: retried every 0.3 day (`home.stepAt`); cost `{w:0, s:ceil(len/2), f:0, work:8}`, ≤7 tiles.
- **Garden** (v9.15 before fence; v9.20 behind the house first, then either end): 2×2, or 3×3 for a farmhouse (`bigGarden`); candidate anchors from `houseFrame` for HOUSE types or the three sides of a plain footprint; must be `siteFree`, not on the yard tile or paving. `gardenTried` set regardless of success (reset only by `dropHomeWork`).
- **Fence** after the garden (or after a failed garden attempt): v9.22 a fence the water took (`fenceWreck`) is retried after **1.5 days** once no `fenceWet` tile has `WD>0.12`. v9.20: no fence across the green before a house that faces it (`!fenceGarden(home)&&HOUSE[home.type]` → return).
- **Hive** (v9.17) once the garden is done and the fence is done or tried: `hiveSite`.

### 4.4 Hamlet (settleVil 4285, hamletTopUp 4304)
- A hamlet exists when `villages[1]` is set (elsewhere). New couples go to the hamlet while `homeCount(1)*2 < homeCount(0)`.
- Top-up: **one household per day**, newest plain cabin ≥2 days old, exact 2 living mutual mates, excluded roles: player, chief, engineer, boatwright. Kids (baby/child) move too. Old cabin stands empty (emptied in `finishBuild` 3685 outside via `b.moveFrom`).

### 4.5 Strangers (4374–4386)
- Every grown single (adult, not player, not flee/adventure), `soloT` starts at `T.abs` if unset (also set at coming-of-age 5559 and on arrival).
- A stranger of the other sex comes **exactly 1 day** after `soloT`, unless `strangerT>0`, population ≥ **POP_CAP=44**, or any free unrelated adult of the other sex is on the isle.
- Cooldown `strangerT = DAYLEN*0.12 = 25.2`, decremented 1.2 per 1.2-s tick → ~21 s real time ("a few hours apart").

### 4.6 Ages (outside, for reference)
- `g.age += dt/DAYLEN` (5554): age in days. Child at 2 days, adult at 24 (2 years), elder at 48 (4 years), sets off at 84 (7 years). Year = 12 days = 4 seasons × 3 days.

### 4.7 Mishap numbers
- Sweep: wary 240 s, rescuers 2 within 18 tiles, 2 bridge marks, marks cap 60.
- Float: min z 0.3; `helpT`; fall after dig only if `dugRecently>0` (0.5 s window) and drop >1.4 levels (5704).
- Wash-up: search 4 tiles, shiver 8 s, warmth ≤0.22.
- Jostle timers: heave 1.6 s, dig 1.3 s, yelp 0.85 s; lean 7–12, hop 0.45.

### 4.8 Economy numbers
- Larder cap `gnomes*5+16`; small-works threshold `gnomes*3+8`; cabin start threshold food ≥6 + pile + rack.
- Rack bonus ×1.5 on food.
- Tent refund +1 fibre +2 wood (tent costs 5w/3f/20 work; cabin 18w/10s/54 work; garden 20 work; fence 5w/12 work; hive 2w/1f/10 work; steppath s=ceil(len/2), work 8; bank work 12; fold 12w/34 work; kennel 4w/12; stable 10w/2s/2f/36; cart 6w/1f/16 — from `BT` 2411+ outside).
- Animal planner gates: fold needs rack + ≥1 cabin + ≥3 wild rabbits + wood ≥6; cart needs ≥1 pave + wood ≥6.

---

## 5. UI elements / controls / input handling

This section has almost no direct DOM work. The hooks:
- **`addVillager()` (4488)** is bound to `$('bAdd')` click at 12171 (outside) — the "+" on the gnome population chip; refreshes the census if open. It uses `toast(...)` for feedback (`$('hint')`, 10685).
- **`jostle` / `gnomesOn`** are the gnome-side response to the creator's terrain tools (`raise`, `lower`, `rock` at 11125–11142, and demolition at 3530–3537).
- `logEv(text, subject)` (10717 outside) feeds the event log/feed panel; `toast` the transient hint. Every log string in this section is **hard-coded English**.
- Sounds triggered here: `sfxSplash`, `sfxMoan`, `sfxYell`, `sfxPanic`, `sfxHup`, `sfxDrop`, `sfxEat`; particle FX `puff`, `noteFx`, `splashFx`.

---

## 6. MODE 'creator' vs 'gnome'

`MODE` is declared at 5630 (outside): `let PLAYER=null, MODE='creator'`. Within this range the mode is never read directly; instead the **player's gnome is excluded by `g.player`**:
- `households` skips `g.player` adults (4330) — the player never courts, never builds a home, never gets a partner.
- The stranger loop skips `g.player` (4375); `addVillager`'s free-partner check ignores the player (4490, 4499).
- `hamletTopUp` never moves the player's household (4313).
- `setOff` is gated by `!g.player` at the caller (5562) — the player never leaves the isle.
- `jostle`, `startSweep`, `startFloat`, `washUp` apply to the player too (no guard): the player gnome can be swept, fall, and be jostled by… the creator, i.e. themselves after switching mode.
- `family(g)` could include the player (it is a mate/parent/child like anyone) so the player would walk down to wave off a departing relative — a nice emergent touch if the player is a relative (but the player arrives as a stranger, `playerArrive`, so normally has no family).
- The in-range comment at 5626–5629 (outside, just below) states: "It never courts, never leaves the isle, and while the player is the creator again it lives as any villager does."

Design implication: the architecture uses a **flag on the entity**, not the global mode, to carve out the avatar from autonomous behaviour. The global `MODE` only drives camera, input routing and HUD.

---

## 7. Progression / unlock / economy

- Progression is **emergent from thresholds**, not an explicit unlock tree: tent → (food ≥6 + pile + rack) → cabin/craft house → (larder ≥ 3n+8) → step path → garden → fence → hive. Children only in cabins (enforced in `court` state at 5488: `makeBaby` only if both live in the same cabin).
- The hamlet is a second-tier settlement that grows to half the village's size by migration and by routing new couples.
- Animals: fold → (fox tamed) kennel, (deer tamed) stable → (paving) cart. These are village-queue projects, not household ones.
- Population cap 44 limits strangers and the + button.
- `STATS` is a telemetry tally only; nothing in the UI unlocks from it.

---

## 8. Persistence

**None.** No `localStorage`/`sessionStorage`/IndexedDB anywhere in the file (grep returned nothing). All household, stranger, stats and snowman state is in-memory and reset by `newIsland` (12102–12106), which resets `strangerT`, `snowmen`, `village.lastRain=0.34` etc. — but **not `village.hamletMoveDay`**, which therefore leaks across islands (harmless: it is compared to `T.day` which also restarts at 1, so on a new island day 1 could be blocked if the previous island last moved on day 1 — a minor bug).

---

## 9. Mobile / touch / performance tricks

- `households()` runs on a **1.2-s planning tick**, not per frame; everything here is O(gnomes × gnomes) or O(builds) per tick, fine at ≤44 gnomes.
- `nearestSeaShore` is a full-grid scan (72×72) but only called on rare events (stranger arrival, setting off).
- `stepPathTiles` BFS is bounded (160 pops, ±6 tiles) and retried at most every 0.3 day.
- `findSiteNear` stops at the first ring with ≥6 candidates.
- No touch-specific code in this range; `addVillager` is tied to a button with `e.stopPropagation()` at the binding site.

---

## 10. i18n (en/es)

- The file's only localisation is the **intro overlay** (`langs` at 12200–12215 outside: `en`/`es` for title, three paragraphs, "Begin/Comenzar"; `#lang` buttons at 309 / CSS 153–156).
- Everything in this section — ~35 `logEv`/`toast` strings ("are courting", "came ashore, looking for a home", "moved into the empty cabin", "went quietly down to the shore", "was swept away by the river", "The village is building a rabbit fold…", the craft-house descriptions in `startHome`, "The isle is full — 44 gnomes is as many as it holds") — is **hard-coded English with inline string concatenation and pronoun logic** (`g.sex==='f'?'her':'him'`). There is no string table; porting to es would require extracting every string.

---

## 11. Oddities, bugs, dead code, TODOs

1. **`g.called` is write-only** (4497): set in `addVillager`, never read. `STATS.called` is only a tally.
2. **`homeCount` comment vs code** (4283): the comment claims "a tent and the cabin going up beside it are one household", but the function counts every *done* tent and cabin with living owners; a tent is only retired when the cabin *finishes* (3684), so the claim holds only because an in-progress cabin isn't `done`. Correct, but the comment is slightly misleading.
3. **`village.hamletMoveDay` not reset in `newIsland`** (see §8).
4. **`related()` does not catch grand-parent ↔ grand-child** directly (it checks cousins and aunt/uncle but a grandparent and grandchild share no parent/grandparent set). Given elders never court (stage must be adult on both sides, 4335–4336) and adulthood lasts 2 years while a generation is ≥2 years, this is practically unreachable, but it is a gap. `family()` does include grandchildren.
5. **Elders are excluded from courting on both sides** but `isSingle` accepts elders — `isSingle` is used only for targets and then `o.stage!=='adult'` re-excludes them; mild redundancy.
6. **RNG determinism is intact**: `findSiteNear` uses `rng()`, and `rnd`/`chance` (589–593 outside) both wrap the same seeded `rng`, so `addVillager`'s coin flip and the stranger ages are replayable. (Verified; not a bug.)
7. **`hamletTopUp` picks "newest" by `builds.indexOf`** — array index is not strictly build order after removals (`removeBuild` splices), but close enough.
8. **`settleVil` is called twice** on the tent→cabin path (4357 and 4367) and once in `homeCount`-based `vE` (4352) with duplicated logic — the hamlet-choice expression `(vilOf(g)||vilOf(m))?1:(homeCount(1)*2<homeCount(0)?1:0)` appears three times (4287, 4352). Candidate for a single helper.
9. **Dead-ish:** `g.job.r` (rock mark) in `clearMarks` exists for `heave` jobs; `SHAKEN`/`CAN_HELP` are local to this block.
10. **`stepPathTiles` prev map uses `-1` sentinel and `undefined` check** (4469) — fine, but the `qi<160` cap means a long detour silently fails and is retried every 0.3 day forever if no paving is within reach (every 0.3 day `home.stepAt` is set, BFS runs — cheap, but it never gives up).
11. **`homeWorks` garden candidates for non-HOUSE homes** (4411): `home.x0-2, home.y0` etc. assume `fw=2`; a plain `cabin` is 2×2 so OK; a `tent` never reaches `homeWorks` (only cabins do), fine.
12. **Comment style:** inline version-history comments ("v9.17 (Jed: …)", "v9.23 (Jed: 'keep it topped up')") record the owner's feature requests inline — useful provenance, but it's a changelog living in code.
13. **`deposit` drops water silently** and `haulHome` too — water is only ever carried to a garden (handled elsewhere).
14. **`LAY_T` is a flat namespace** of piece kinds across every building type; adding a new building means remembering to add its pieces here or they default to 1.3 s.
15. No TODO/FIXME markers in the range.

---

## 12. Reusable engine/shell vs gnome-specific content

### Reusable pattern / engine (port as-is or with renaming)
- **Planning-tick architecture**: a cheap per-frame state machine plus a 1.2-s "social planner" pass (`households()` called from `step()`), with helpers that validate references (`ownsProject`, `homeOf` check `builds.indexOf`) so stale pointers never crash. This is the core shell to keep.
- **Relationship graph utilities**: `related`, `family`, `isSingle` — generic kinship over `parents`/`mate` arrays.
- **Site search**: `findSiteNear` (ring search with margin), `stepPathTiles` (bounded BFS to nearest paved tile), `hiveSite` (ring-around-footprint with exclusions). All grid-generic.
- **State-set tables**: `BUSY`, `CAN_HELP`, `INDOORS`, `SHAKEN`, `NO_COURT` — the pattern of "named sets of states that gate interruption" is reusable; the contents are game-specific.
- **Day-shape API**: `dayPhase`, `bedtimeOf` with per-agent jitter, `isBedtime`, `isMorning`, `evening`, `lateSite` (a "lit spot lets you work later" rule). Parametrised by `T.f` fractions — directly portable to a park's opening hours/dusk.
- **Interrupt/reset primitives**: `dropAll`, `clearMarks`, `releaseBed`, `jostle` (creator-can't-hurt-agents policy), `callHelpers` (nearest-k agents pulled into a response state).
- **Mishap framework**: `startSweep`/`startFloat`/`washUp` show how to transition an agent into a physics-driven state and back, with STATS tally and log.
- **Festival calendar**: `festival()` keyed on season + day-in-season; `danceTime` keyed on day fraction.
- **Arrival of newcomers from the map edge** (`newcomer`, `nearestSeaShore`, `addVillager` with the "complement the waiting sex" rule, a population cap, and a cooldown).
- **Swing/lay timing**: `swingStep` with a strike at 70 % of the period; a `LAY_T` table.
- **Avatar carve-out by `g.player` flag** rather than global mode checks.

### Gnome-specific content (replace)
- Tent/cabin/craft-house lifecycle, the five craft houses and their flavour text, the hamlet second settlement and its "half the village" ratio, hat recolouring (`joinVil`).
- The small-works ladder (step path → garden → fence → hive → flood bank) and all its thresholds.
- Rabbit fold / kennel / stable / cart planner (`planAnimals`), snowmen, drying rack feast spot, hive proximity.
- River sweep, hat-parachute float, "out came the hat" — tied to the island's water sim and gnome hats.
- Seven-year "set off in a boat" exit with the family waving — a lovely mechanic but tied to the sea shore.
- Larder caps and food thresholds; the rack bonus.
- All English log strings and the he/she pronoun logic.

---

## 13. Design questions for the Parque D'Amour port raised by this section

1. **What is the "household" analogue?** In the park, is the unit a *couple on a bench*, a *date*, a *family picnic*? What replaces tent → cabin (e.g. first meeting → regular bench → engagement)? Which stages gate "children" (or the park's equivalent: a shared ritual, a proposal)?
2. **Pairing rule**: gnomes pair with the *nearest* unrelated single of the other sex instantly. For a romance game, do you want attraction scores, sexual-orientation options, multiple candidates, rejection, or is nearest-single still fine? Does the player's assist/sabotage change the `related`/eligibility test or the distance metric?
3. **Who is the avatar and what can it not do?** Here the player gnome never courts, never leaves. In avatar mode, can the player themselves be courted? Can they be a rival? The `g.player` carve-out needs a decision per behaviour (court, newcomer, setOff, hamlet move, rescue).
4. **Newcomers**: strangers arrive from the sea exactly one day after someone becomes single. In a park, do visitors arrive at the gate on a timetable? Is there a cap (44 here)? Does the Creator's "+" button pick the complementary sex, or does the player choose who arrives?
5. **Departure**: at seven years gnomes leave by boat with the family waving. What is the park's exit (closing time? a wedding? leaving by the gate)? Is leaving permanent and does it widow the partner?
6. **Day shape**: `dayPhase` has day/dinner/social/night with bedtimes per life-stage. What are the park's phases (morning stroll, lunch, afternoon, dusk promenade, closing)? Does a "lit spot" (lanterns → late shift) exist — e.g. lamplit benches where couples linger after dusk?
7. **Mishaps**: river sweeps, falls, rescues are the island's drama. What are the park's mishaps (a dropped ice cream, rain, a pigeon, a rival appearing, a lost dog)? Which states can be interrupted to help (`CAN_HELP`), and which protect the agent (`SHAKEN`)?
8. **Creator interference**: `jostle` guarantees the creator cannot hurt agents. For sabotage mode, is that still true — can the Creator *hurt* the romance but never the people? What are the tool → agent reactions (bury/rock/yelp → ?).
9. **Household works ladder**: step path → garden → fence → hive are *couple-owned* projects that need a full larder. What are the couple's "small works" in a park — a picnic, a shared boat, a photo, flowers planted? What resource gates them (money? mood? weather?).
10. **Second settlement / hamlet**: is there an analogue (a second corner of the park, a café vs. the lake)? Is the "keep it half as big" migration wanted at all?
11. **Festivals**: midsummer dance and harvest supper are keyed to season/day. What are the park's set-pieces (Bastille Day fireworks, a Sunday concert)? Does the player trigger them or the calendar?
12. **Economy thresholds**: `store.food ≥ 6`, larder cap `5n+16`, works threshold `3n+8`. What is the park's shared resource, if any, and do couples draw on it?
13. **Stats/telemetry**: `STATS` is harness-only. Does the new game surface a score (romances assisted/sabotaged) in the HUD? That decides whether the tally becomes UI state.
14. **i18n**: this section's ~35 narrative strings are inline English with pronoun branching. The new game presumably needs fr/en at least — adopt a string table with pronoun/gender helpers from the start.
15. **Persistence**: nothing is saved. Should a park day be resumable (localStorage), and if so which of these per-agent fields (mate, partner, soloT, home, project) must serialise — object references would need ids.
16. **Kinship**: do you need `related` at all? If families/children aren't in the park, drop it; if they are (families visiting), decide the generational rules.
17. **Sites & rings**: homes are placed on rings round the green (`RING_R`) — does the park have equivalent layout anchors (benches round a fountain, paths), and does the Creator place them or the sim?
