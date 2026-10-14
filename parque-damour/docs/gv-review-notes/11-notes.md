# Gnome Village review — section 11: lines 5622–6049
## "Playing as a gnome (v9.8 avatar mode), building as a gnome (v9.9)"

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Every line 5622–6049 was read. Line numbers below are exact. Symbols outside the range were resolved by grep only (their line numbers are given where useful).

---

## 1. Purpose of the section

Two sub-blocks plus two per-frame simulation loops that happen to sit between them:

1. **Avatar mode (v9.8), 5622–5688.** One gnome on the isle can be *the player's own*. `MODE` is `'creator'` (god view, terrain tools) or `'gnome'` (avatar). In gnome mode a tap on the isle is an *order* to the avatar (`playerTap`), and the avatar's own decision routine (`playerDecide`) only handles bodily needs (starving / exhausted / frozen), hauling a carried load home, and continuing the player's own build. Otherwise it waits.
2. **Per-tick loops, 5689–5804.** `updateGnomes(dt)` (the per-gnome simulation step for *all* gnomes, where the `MODE==='gnome' && g.player` branch picks `playerDecide` over `decide`) and `updateFlora(dt)` (trees, stumps, rocks, bushes, and per-building ecology: hive honey, trap stock, fire fuel, gardens, water wheel, windmill power, frost/thaw flags). `updateFlora` has nothing to do with the avatar; it is here because of the file's history.
3. **Building as a gnome (v9.9), 5805–6048.** A Build panel (`PB_LIST`) lets the player pick a structure; a *ghost* footprint (`pbGhost`) follows taps, green/red with a reason; `Place` (`pbPlace`) turns it into a project flagged `mine` that only the player's gnome works on; `Pause`/`Stop` (`pbStop`) and a status string (`pbStatus`); `drawGhost` renders the panes.

UI wiring for these (buttons, panel, ghost bar, `setMode`, `playerCommand`) lives **outside** the range at 10993–11030 and 11252–11279, 12184–12196; it is summarised in §6 because the section is meaningless without it.

---

## 2. Globals / state defined or mutated here

### Defined in this range
| Name | Line | Type / shape | Notes |
|---|---|---|---|
| `PLAYER` | 5630 | `let`, gnome object or `null` | The avatar. Set in `playerArrive` (5636). Reset to `null` by `newIsland` (12107, outside). |
| `MODE` | 5630 | `let`, `'creator'` \| `'gnome'` | Only read in-range at 5696. Written by `setMode` (11256/11261) and `newIsland` (12107). |
| `PLAYER_HOLD` | 5631 | `const` set `{chop,quarry,fibre,building,pickB,fishing,float,swept,shiver,yelp,heave,dig,dine,collect}` | States during which a tap is refused with `'busy'` (5655). Note: `sleep` is **not** in it, so a tap wakes a sleeping avatar outdoors (5656). |
| `PB` | 5817 | `const {pick:null, ghost:null, tiles:[], paused:false}` | Build-pick state. `pick` = type string; `ghost` = `G` object from `pbGhost`; `tiles` = chosen tile indices for a flagstone run; `paused` = player's project paused. |
| `PB_LIST` | 5818–5828 | `const` array of `[type, label, hint]` triples (26 entries) | The Build panel's catalogue and its one-line placement hints (English). |
| `PB_SPAN` | 5829 | `const {logbridge,plankbridge,ropebridge,stonebridge,dam,pave:1}` | Types whose cost is "per tile" (used by `pbCostText`). |

### Ghost object shape (`G`, 5842)
`{type, ok:boolean, tiles:number[], msg:string, mk:()=>build|null}` — `mk` is a closure that *creates and stages* the project when Place is pressed.

### Mutated here, defined elsewhere
| Name | Line(s) | What happens |
|---|---|---|
| `gnomes[]` | 5636 push | avatar added |
| `STATS.arrived` | 5636 | counter (STATS at 4658) |
| gnome fields `g.player, g.stranger, g.parents, g.hunger, g.energy, g.st, g.job, g.partner, g.hatHand, g.arrived, g.path, g.project, g.decide, g.tx/g.ty (via goTo), g.ride, g.cart, g.gz, g.bend, g.bendV, g.hop, g.wary, g.tagT, g.ph, g.blink` | 5635–5639, 5644–5650, 5655–5687, 5695–5712, 6012, 6015 | see function notes |
| `trees[i].marked` (gnome id), `rocks[i].marked=1`, `bushes[i].marked=1`, `builds[i].marked=1` | 5664–5666, 5677 | reservation marks |
| `PB.paused` | 5650 read, 5673 `=false`, 6012 `=false`, 6034 read | a tap on your own site un-pauses |
| `dugRecently` | 5690 (decays) | defined 4659; set when the creator digs |
| `logActor` | 5693 / 5715 | current gnome for `logEv` attribution |
| `trees, stumps, rocks, bushes` arrays | 5719–5760 | growth/fall/seed/trickle |
| per-build fields `b.honey, b.stock, b.out, b.tendT, b.crop, b.treeAge, b.applesYear, b.apples, b.spin` | 5771–5794 | ecology |
| `store.wood` | 5777 (fuel burn), 6021 (refund); `store.stone/fibre` 6021 | economy |
| `village.lastRain, village.dryOn, village.power, village.powerDay, village.frost, village.thawed` | 5765–5803 | world flags |
| `builds[]` | 6012 push, 6024 `removeBuild` | the player's project |
| `BRIDGE[], PIER[], DAM[]` typed arrays | 6022 | cleared on Stop for span tiles |
| `b.home.gardenTried / fenceTried / hiveTried` | 6023 | reset so villager AI may try again |
| `b.mine`, `b.hamlet`, `b.owners`, `b.kids`, `b.vil`, `b.home`, `b.dx/dy/sx/sy`, `b.ang`, `b.fold`, `b.work`, `b.why` | 5981–5986, 5916, 5927, 5940, 6010–6011 | project metadata |
| canvas `ctx` state | 6041–6046 | ghost rendering |

---

## 3. Functions (every one in the range)

### `playerArrive()` — 5632–5641
Signature: `playerArrive(): gnome`. Called only from `setMode('gnome')` at 11255 when there is no live `PLAYER`.
- 5633: `c=villagePos()` (green of village 0, or average); `sh=nearestShoreFrom(c.x,c.y,40*S)` i.e. within 80 fine tiles, else fall back to `c`.
- 5634: `makeGnome(sh.x, sh.y, 50% 'f'/'m', AGE_ADULT+rnd(0.5,3))` — `AGE_ADULT=24` (1375); ages are in **days**, 12 days = 1 year (`T.day/12` at 5789), so the avatar is a 2-year-old adult.
- 5635: flags `player=true`, `stranger=true`, `parents=null`, `hunger=0.25`, `energy=0.9`.
- 5636: pushed to `gnomes`, becomes `PLAYER`, `STATS.arrived++`.
- 5637: `splashFx(..,4)` + `sfxSplash(g)` (audio helper at 6146).
- 5638: `logEv(name+' came ashore — that is you')`, `toast('You come ashore as '+name)`.
- 5639: `st='wander'`, `goTo` toward the green ±1 tile (`rnd(-1,1)*S`).

### `playerDecide(g)` — 5642–5651
Signature: `playerDecide(g): void`. Called from `updateGnomes` at 5696 instead of `decide(g)` when `g.player && MODE==='gnome'`. The avatar's **autonomy**:
- 5643: no-op while in any `BUSY` state (4558).
- 5644: carrying something → `haulHome(g)` (4584: own project first, then village sites, else the store).
- 5645: **starving** `hunger>0.86` and `store.food>=1` and not already `goEat` → walks to the food drop point (`dropPoint('food',g)`) ±0.5 tile, toast "is starving and goes to the larder". (Villagers' equivalent threshold is 0.94 at 4833.)
- 5646: **exhausted** `energy<0.06` → `releaseBed`, `st='sleep'` on the spot, `hatHand=0`, `arrived=true`, `path=null`, toast "worn out and dozes off on the spot".
- 5647: **frozen** `warm<0.12` → `warmSpot(g)` (3732) or `nearestRoof(g)` (3748) → `goHome(g,sh,'goHuddle','huddle')`, toast "frozen through and goes in to the fire".
- 5648: arrived from a walk (`wander`+`arrived`) → `idle`.
- 5650 (v9.9): if `idle` and not `PB.paused`, and `ownsProject(g)` (4240) has a plan and is not done → `siteJob(g,pp)` (4190) — fetch/lay the next piece.

### `playerTap(tx,ty)` — 5653–5688
Signature: `playerTap(tx:int tile, ty:int tile): string|null`. Called from `playerCommand` (11275, outside), which toasts the returned string (`'busy'`→"X is busy — a moment", `'asleep'`→"X is asleep", `'walking'`→silent, anything else → "X: msg").
Intent cascade, in order:
1. 5654: no live avatar → `null`.
2. 5655: `PLAYER_HOLD[g.st] || g.inside` → `'asleep'` if sleeping else `'busy'` (order refused).
3. 5656–5657: wake if sleeping; `clearMarks`, `releaseBed`, `job=null`, `partner=null`, `hatHand=0` (abandon whatever was in hand).
4. 5658–5663: **nearest resource** within a 0.75-tile box of the tap, distance-ranked across trees (not falling), rocks, bushes:
   - 5664 tree: `age<0.35` → `pat` job (`goPat`) "a sapling — a pat, no more"; else `t.marked=g.id`, job `chop`, `goChop`, "off to fell that tree".
   - 5665 rock: `r.marked=1`, job `quarry`, `goQuarry`, "off to break that rock".
   - 5666 bush: `b<1` berries → "no berries on it yet"; else `marked=1`, job `{k:'bush', stock:true}`, `goBush`, "off to pick berries".
5. 5668–5678: **building under the tile** (`onIt`: footprint `fp`, span `tiles`, rounded centre, or path tiles `pt`). An unfinished site with a plan wins over a finished build on the same tile (5670); failing that, a village site (`villageSites()`, 2475) within 1 tile (5671).
   - 5673 unfinished site: if it is the player's (`b.mine`) un-pause; `siteJob(g,b)` → "back to work on the X" / "lending a hand at the X" (label from `BT[type].label`), else "nothing to do at that site just now".
   - 5674 done fire: bedtime (`isBedtime`, 4616) → `toBed(g)` "settling down by the fire for the night"; else `goWarm` to fire ±1 x, +0.3..1.2 y, "off to sit by the fire".
   - 5675 done rack: `store.food>=1` → `goEat`, "off to eat from the larder"; else "the larder is empty".
   - 5676 done home (tent/cabin, `isHome` 2477): `toBed(g)` "off to rest".
   - 5677 done trap with `stock>=2`: `marked=1`, job `collect`, `goCollect` to `(b.sx,b.sy)`, "off to empty the trap".
6. 5680–5684: **water** (`wetD>0.3`, or `isWater && wetD>0.2`): nearest shore spot from `IDX.shores` within 2.5 tiles (`2.5*2.5*S2`) not `shoreTaken` → job `fish`, `goFish`, "off to fish"; else "no bank to fish that from".
7. 5686: **reeds on a second tap**: same target as last `goTo` (±0.5), already arrived, standing within 0.8, tile material `MEA` or `GRS` (671) and `WD<0.1` → job `fibre`, `goFibre`, "cutting reeds here".
8. 5687: default **walk**: `st='wander'`, `goTo`, returns `'walking'`.

### `updateGnomes(dt)` — 5689–5716
Signature: `updateGnomes(dt:seconds): void`. The main per-gnome step, called from the sim tick (outside). Iterates backwards so removals are safe.
- 5690: `dugRecently -= dt`.
- 5691: `spaceOut(dt)` (5599, crowd separation).
- 5693: `logActor=g` for event attribution.
- 5694: `needs(g,dt)` (5552: hunger/energy/warm, ageing, leaving at `AGE_LEAVE` — excluded for `g.player` at 5562).
- 5695–5696: **decision cadence**: `g.decide` counts down; on expiry reset to `rnd(0.5,1.3)` s; decide only if not `BUSY` and not a rider mid-errand (`g.ride && st in {goFetch,haul}`, v9.17). `g.player && MODE==='gnome'` → `playerDecide`, else `decide`. **This is the single point where MODE changes the simulation.**
- 5697: `act(g,dt)` (4968, state machine).
- 5698–5699: a gnome indoors in a non-`INDOORS` state (`sleep, shelter, huddle`, 4566) or whose building vanished → `leaveBuild`.
- 5700: `moveGnome(g,dt)` (1600).
- 5701: ridden deer is snapped to the rider (`x,y,face,moving`, `st='ridden'`); dropped if the critter is gone.
- 5702: `wearStep(g,dt)` (1674, path trampling).
- 5703–5705: ground-height tracking `g.gz`; if the gnome is >1.4 above the new ground, `gz>0`, and ground was dug recently → `startFloat(g, drop, true)` (4670) — the "creator dug the ground from under a gnome" gag. Skipped when `inside`, `inBoat`, `inFlyer`, or in `float/swept/shiver/boat`.
- 5706–5707: body-lean spring: `bendV += (-bend*40 - bendV*3.4)*dt`, `bend` clamped ±0.7.
- 5708–5710: timers `hop`, `wary`, `tagT` decay.
- 5711: animation phase `ph += 2.2*dt`.
- 5712: blink timer, re-armed to `rnd(2.5,8)` s.
- 5713: swimming (`swim>0.5`) → splash particle at rate 2/s.

### `updateFlora(dt)` — 5717–5804
Signature: `updateFlora(dt): void`. World ecology tick (not avatar-related).
- **Trees** 5718–5734: falling tree `fall += 0.95*dt` → at ≥1 removed and a stump `{life:26}` pushed (5721–5722). Sapling growth `age += dt/DAYLEN*0.42` (full in ~2.4 days; `DAYLEN=210` s at 573). Drowning: tile `wetD>0.4` → falls with chance `0.08/s` (5726). Seeding: mature tree, chance `0.004/s`, cap **1600** trees, offset ±2.5*S tiles, needs land, `E>SEA+0.6`, `E<8`, slope `<1.0`, no `BRIDGE/OCC/PAVE/MINEB`, `PREPF<0.3` (not in a yard/pit, v9.20), no tree within `0.9*S`; new tree age 0.06 (5727–5733).
- **Stumps** 5735: life decays, removed at 0.
- **Rocks trickle** 5737–5746: when `rocks.length < max(10, 3*gnomes)`, chance `0.13/s`; 50% of the time biased to the most-quarried face (`QUARRYN`, ±2*S); 40 placement tries; tile must have `WD<=0.12`, `E>SEA`, no bridge/occ/pave, and be `SCR`/`ROK` material or `E>=5`; rock `r=rnd(0.7,1.2)`; `puff`.
- **Bushes** 5748–5760: regrowth rate `rg`: `cold>0.5→0`, winter(season 3)→0.16, summer(1)→1.15, else 0.85. Drown at `wetD>0.4` (0.1/s). Frost strips a berry at 0.4/s while `cold>0.5`. Up to **6** berries; timer `re` counts down at `rg`, re-armed `rnd(14,26)`. Spread: `b>=4`, cap **800**, chance 0.0035/s, offset ±2*S, `E>SEA+0.6`, slope `<0.9`, no bush within 0.8*S; new `{b:1, re:rnd(10,20), sc:rnd(.85,1.15)}`.
- **Rain memory / dry spell** 5765–5768: `W.rain>0.3` stamps `village.lastRain=T.abs`; `drySpell()` (4712: spring/summer, cold<0.2, >1.0 day since rain) toggles `village.dryOn` with a log line.
- **Per finished building** 5769–5795:
  - hive 5771: honey `+= dt/(3*DAYLEN)` in spring/summer, `light>0.4`, `rain<0.3`, `cold<0.2`; cap 1.
  - trap 5772–5773: if any 4-neighbour is water, `stock += dt/45` (×0.5 in winter), cap 3.
  - fire / cabin / lodge 5774–5780: when `cold>0.3`, burns `store.wood` at `fire: 0.011/s ×(0.5 with a hearth)`, `cabin/lodge: 0.006/s`, scaled by `T.cold`; sets `b.out` when wood runs dry, logs "The fire has gone out — there is no wood" / "The fire is lit again".
  - garden 5781–5790: `tendT` countdown; grows in spring/summer with `cold<0.2`: `crop += dt/(3.2*DAYLEN) × (tended?1:0.55) × (hive within 6 tiles?1.25:1) × (dry && not watered?0.4:1)`; winter decays `dt/DAYLEN`; `treeAge += dt/(20*DAYLEN)`; in autumn (season 2) with a mature tree, once per 12-day year → `apples=3`.
  - wheel 5791–5792: flow from a done dam's tiles (`FLOW` or `WD>0.05→0.6`) or own tile; `spin += 1.4*dt` when `f>0.05`.
  - windmill 5793–5794: `spin += dt*(0.25+1.3*W.wind)*(cloth>=1?1:0.15)` (unfinished mill spins slowly once cloth is on); `powered=true` when `light<0.42 && wind>0.12`.
- 5797–5798: `village.power=powered`; first time each day logs "The windmill turns in the night wind…".
- 5799: `decayWear(dt)` (1683, paths fade).
- 5800–5803: `village.frost` set at `cold>0.3` ("First frost — the berries are done for the year"), cleared in spring at `cold<0.1`; `village.thawed` set on `T.thaw` ("The thaw — meltwater…"), cleared when thaw ends outside spring.

### `pbLabel(t)` — 5830
`pbLabel(type): string` — label from `PB_LIST`, else the raw type. Used for toasts/status/log.

### `pbCostText(t)` — 5831–5836
`pbCostText(type): string` — human cost from `BT[t]` (`w` wood, `s` stone, `f` reed(s)), with overrides: `pave`→"1 stone a tile", `hearth`→"4 stone", `steppath`→"a stone a tile", `garden`→"the work only"; `PB_SPAN` types get " a tile" appended. Used by the Build panel (11009) and ghost bar (11022).

### `pbHome()` — 5837
`pbHome(): build|null` — `homeOf(PLAYER)` (4241: `g.home` that is done and still in `builds`).

### `pbTileOK(i)` — 5838
`pbTileOK(i): boolean` — a flagstone tile: `!PAVE && !OCC && wetD<=0.1 && BRIDGE===0 && !DAM && !STEPS && E>SEA+0.4`.

### `pbGhost(type, tx, ty)` — 5840–5989
`pbGhost(type:string, tx?:int, ty?:int): G|null`. The validator + factory. `tx===undefined` means "no tap yet" (called from `pbPick`). Branches:
- 5844–5860 **home-anchored, no tap needed** (`fence`, `steppath`, and `garden` with no tap): no home → "you need a home of your own first".
  - fence 5846–5851: already has one → "your home has its fence"; no garden (`fenceGarden`, 4454) → "plant your kitchen garden first — the fence goes round it"; builds `mkProj('fence', home.dx, home.dy+1, home.dx+1, home.dy+1, {home, owners:[PLAYER]})`, runs `makePlan` to collect the segment tiles into `G.tiles`; `mk` just stages it.
  - steppath 5853–5859: already has one → "your door has its path"; `stepPathTiles(home)` (4456) empty → "no paving near enough to join"; `mk` makes `mkProj('steppath', …, {pt, home, owners:[PLAYER], cost:{s:ceil(len/2), work:8}})`.
- 5861: no tap for any other type → `msg` = the `PB_LIST` hint.
- 5863–5869 **pave**: tiles are `PB.tiles` (from `pbTap`); none → "tap each tile of the run, then Place"; `mk` builds `mkProj('pave', mid tile, …, {pt:run, cost:{s:ceil(L/2), work:5*L}})`.
- 5870–5878 **hearth**: nearest done fire; none → "there is no fire yet"; one exists/queued → "the fire has its hearth"; ring = tiles within radius 1.9 of the fire (5×5 box minus centre) that are free of `OCC/wet>0.1/BRIDGE/DAM/STEPS/PAVE`; fewer than **6** → "no room round the fire".
- 5879–5885 **steps**: tile blocked → "not here"; `stepsChain(ti)` (3641) must have ≥2 tiles and height range ≥0.45 else "no slope here to cut steps into"; `mk` → `mkProj('steps', …, {hidden:true, chain})`.
- 5886–5893 **trap**: must be `land(ti)` and `E>SEA+0.3` ("a trap stands on the bank"); a 4-neighbour with `wetD>0.3` ("no water beside it"); no other trap within `2*S` ("a trap is set near here already"); `mk` → `{stock:0}`.
- 5894–5917 **log / plank / stone bridge**: tap must be water (`wetD>=0.2` or `FLOW>0.25`) else "tap the water it is to cross"; `findSpan(tx,ty,SPAN[type][1])` (2883; `SPAN={logbridge:[1,3], plankbridge:[2,6], ropebridge:[4,10], stonebridge:[5,14]}` at 2457, `SPAN_MAX=14`). No span → try `SPAN_MAX` and say "too wide for this — a <kind> would cross it" / "too wide to bridge from here" / "no crossing here: it needs firm ground on both sides". Too short → "too narrow for this — a <kind> is all it wants". Overlap with an existing bridge → "a bridge is here already". `G.tiles` = span tiles + both end tiles. `mk` (5909–5916) builds with `bridgePlan(sp)` / `stonePlan(sp)`:
  - stonebridge cost `w=1*L, s=4*L+4, work=26*L`;
  - logbridge `w=3*L, s=2 per pier, work=12*L+8 per pier`;
  - plankbridge piers at odd indices (all if `L<=2`), `w=4*L, s=2+2 per pier, f=2, work=14*L+8 per pier`, `fresh:true`;
  - all: `b.why='where you wanted it'`, `placeBuild`, `stageProject`.
- 5918–5929 **ropebridge**: `gorgeSpan(ti,tx,ty)` (1529) none → "no gorge to sling it across from here: tap its rim"; `>10` tiles → "too wide to sling a rope across — 10 tiles is the most"; overlap (any build with `tiles` except `bank`) → "a bridge is here already"; cost `w=1*L, s=4, f=2, work=9*L+12`; `why='across the gorge, where you wanted it'`.
- 5930–5942 **dam**: `wetD<=0.12 || E<=SEA` → "tap the river it is to hold"; `FLOW<0.4` (`0.8*FLOW_STREAM`, 1349) → "still water: there is nothing to hold back here"; bridge/dam already → "not here"; `damRun(tx,ty)` (3597) none → "no dam here: it needs a bank on both sides within a few tiles"; cost `w=5*L, s=2*L, work=20*L`; `why='across the river, where you wanted it'`.
- 5943–5948 **wheel**: `tileFree(tx,ty,1.8)` (2605) else "not here: it wants open ground"; `wheelWater(tx,ty)` (2868: a neighbour with `wetD>0.3`, no dam, surface ≤ tile+0.25) else "no running or held water beside it"; `mkProj('wheel',tx,ty,tx,ty+1,{ang:0})`.
- 5949–5954 **lantern**: dry open ground (`!PAVE/!OCC/wet<=0.1/no BRIDGE/DAM/STEPS`, `E>SEA+0.6`) else "not here: a post wants dry open ground"; another lantern within `S` → "a lantern hangs near here already"; `{lit:0, ph:rng()*TAU}`.
- 5956–5989 **footprint builds** (tent 1×2, cabin 2×2, fire, pile, rack, garden 2×2, windmill 2×2, hive, well, fold 3×3, kennel, stable 2×2, cart): `x0=tx-((fw-1)>>1)`, `y0=ty-((fh-1)>>1)` (tap = top-left for even sizes, centre for 3×3); door tile `(x0, y0+fh)` shown with the footprint except for a garden (5958).
  - garden 5959–5964: needs a home; one per home ("your home has its garden"); within 4 tiles of the home centre ("too far from your home"); not on the home's yard tile `(home.yx, home.yy)` ("not on the yard where loads are set down").
  - hive 5966: a done garden within 6 tiles, else "too far from a garden — the bees want the blossom".
  - well / fold / stable 5967, 5968, 5970: one per village (`countB || queued`).
  - kennel 5969: done fold required ("build the fold first — the dog guards it"), one only, within 5 tiles of it.
  - cart 5971: done stable required ("build the stable first — the deer pulls it"), one only, within 5 tiles.
  - 5972–5975 `siteFree(x0,y0,fw,fh)` (2629) fails → diagnose in priority: wet (`wetD>0.08`) "not on the water" → `E<=SEA+0.6` "too near the sea" → taken (`OCC/PAVE/BRIDGE/DAM`) "the ground is taken" → `MAT===ROK` "not on bare rock" → steepness (`hi-mean>EARTH(0.6)` or `mean-lo>EARTH` or multi-tile `siteSpread>SITE_SPREAD(2.0)`) "too steep here, even with a spade" → fallback "not here: too near the fire, or a rock stands on it".
  - 5977–5979 ok; fire hints: `hamletSite` (2519: >HAMLET_R=18 from every green, only while no second village) → "far out from the green: lit, it founds a hamlet for your household"; else if a village exists and no hamlet → "a second fire for the village — further out, it would found a hamlet".
  - 5980–5988 `mk`: `mkBuild(type,x0,y0)`; tent/cabin: `owners=[PLAYER]` when the player has no home, else `[]` (a village home), `kids=[]`, `vil=vilOf(PLAYER)`; garden: `home`, `owners=[PLAYER]`, `dx=x0, dy=y0+2`, `sx/sy` same; windmill `ang=0`; hive by the player's own garden (and no hive yet) is the household's; kennel gets `fold`; `placeBuild`, `stageProject`.

### `pbTap(tx,ty)` — 5991–5997
`pbTap(tx,ty): boolean` — false if no pick. For `pave`: toggles the tapped tile in `PB.tiles` (max **14** tiles, must pass `pbTileOK`, else toast "not that tile: stone goes on dry open ground"). Then recomputes `PB.ghost=pbGhost(PB.pick,tx,ty)`. Called from `playerCommand` 11273 (every tap while a pick is in hand).

### `pbPick(type)` — 5998–6002
Sets `PB.pick`, clears `PB.tiles`, `PB.ghost=pbGhost(type)` (no tap). Toast: if the ghost is already ok with tiles (fence/steppath) "X: tap Place", else "X: <hint>". Called from the Build panel buttons (11012).

### `pbClear()` — 6003
Resets `pick/ghost/tiles`. Called by Cancel (12189), the Build button when a pick is in hand (12186), `setMode('creator')` (11263), `newIsland` (12108), and `pbPlace` (6014).

### `pbPlace()` — 6005–6017
`pbPlace(): boolean`. Guards: ghost ok, live `PLAYER`; an existing own project → toast "finish or stop your X first" (6008). `b=gh.mk()`; `b.mine=true`; stage if not yet planned (6010). A fire at a hamlet site → `b.hamlet=true` + log (6011). `builds.push(b)`, `PLAYER.project=b`, `PB.paused=false` (6012). Log "You are raising a X", toast "You start on the X" (6013). `pbClear()`; drops the avatar's current marks/bed/job and, unless sleeping or in a `PLAYER_HOLD` state, sets `idle` with `decide=0` so `playerDecide` picks up the site at once (6015). Called by the Place button (12188).

### `pbStop()` — 6019–6028
`pbStop(): boolean`. Refunds materials delivered to the site (`b.got.wood/stone/fibre` → `store`) (6021); clears `BRIDGE/PIER` (and `DAM` for a dam) over span tiles (6022); resets the home's `gardenTried/fenceTried/hiveTried` so villager AI can try again (6023); `removeBuild(b)` (2739), `PLAYER.project=null` (6024); any gnome whose job pointed at the site is reset to `idle` with `decide=0.2` (6025); toast "The X is left", log "You gave up the X" (6026). Called by the Stop button (12196).

### `pbStatus()` — 6030–6035
`pbStatus(): string` — "Label · k of n" (+" · paused" or " · needs <mat> (none in the store)" when the next piece's material is absent at the site and `store[m]-reserveOf(m)<1`; `reserveOf` 4149 = `2*gnomes` wood in the cold). Material `fibre` is worded "reeds". Shown in the `#gstat` chip (11000).

### `drawGhost()` — 6037–6048
Draws one quad per tile of `gh.tiles` (or `PB.tiles` while picking flagstones). Fill `rgba(150,215,150,0.42)` / stroke `rgba(70,140,80,0.9)` when ok, `rgba(235,120,120,0.42)` / `rgba(170,60,60,0.9)` when not; `lineWidth=max(1,1.2*cam.z)`. Uses the per-frame projected vertex caches `SVX/SVY` (ground) and `SWY` (water surface, 6416): on wet/sea tiles (`wetD>0.12 || SEAC`) it takes `min(SVY,SWY)` so the pane sits on the water. Called from the render loop at 12049 only when `MODE==='gnome' && PB.pick`.

### Inline closures
- `near(o)` 5658 — 0.75-tile box test.
- `onIt(o)` 5669 — "build covers tile" test.
- `G.mk` closures at 5851, 5857, 5867, 5877, 5884, 5892, 5909, 5925, 5938, 5947, 5953, 5980 — deferred constructors.

---

## 4. Rules and tuning numbers (consolidated)

**Avatar**
- Arrival: shore within `40*S`=80 tiles of the green; adult `24+rnd(0.5,3)` days old; hunger 0.25, energy 0.9 (5633–5635).
- Decision cadence: every `rnd(0.5,1.3)` s (5696).
- Autonomy thresholds: eat at `hunger>0.86` (needs ≥1 food in store); sleep-on-the-spot at `energy<0.06`; seek fire at `warm<0.12` (5645–5647).
- Tap pick radius for trees/rocks/bushes: 0.75 tile box, nearest wins (5658). Sapling cutoff `age<0.35` (5664). Bush needs ≥1 berry (5666). Trap needs `stock>=2` (5677). Fishing shore within 2.5 tiles of the tap (5681). Water thresholds `wetD>0.3` or (`isWater` and `>0.2`) (5680). Reeds: second tap within 0.5 of the previous target while standing within 0.8, grass/meadow tile, `WD<0.1` (5686).
- Fire rest spot: `x±1`, `y+0.3..1.2` tiles (5674); larder spot `x±0.5`, `y+0.6` (5675).

**Build (player)**
- One own project at a time (6008). Pause/Stop; Stop refunds delivered materials (6021).
- Flagstone run ≤14 tiles (5994); cost ceil(L/2) stone in the mkProj extra (5867) but see §9 — `stageProject` recomputes cost from the plan.
- Hearth ring radius 1.9, min 6 tiles (5875–5876). Steps need ≥2 chain tiles and ≥0.45 drop (5883). Trap: no other trap within 4 tiles; lantern: none within 2 tiles (5891, 5952). Garden within 4 tiles of home (5962). Hive within 6 of a done garden (5966). Kennel within 5 of fold; cart within 5 of stable (5969, 5971). One well/fold/stable/kennel/cart/hearth per village.
- Spans: `SPAN` table (log 1–3, plank 2–6, rope 4–10, stone 5–14); `SPAN_MAX=14`; dam needs `FLOW>=0.4`; wheel `tileFree` slope ≤1.8.
- Site levelness: `EARTH=0.6`, `SITE_SPREAD=2.0` (3596, 2628).
- Hamlet founding radius `HAMLET_R=18` (2486).
- Costs: see `BT` 2411–2456 (e.g. tent 5w/3f/20 work; cabin 18w/10s/54; fire 3w/2s/13; windmill 8w/2s/2f/36; fold 12w/34; stable 10w/2s/2f/36).

**Ecology (updateFlora)** — see §3 `updateFlora`; key caps: 1600 trees, 800 bushes, rocks ≥ max(10, 3×gnomes); sapling matures in ~2.4 days; honey 3 days; garden 3.2 days; apple tree 20 days; apples 3/year; year = 12 days (`SEASON_DAYS=3`, `DAYLEN=210 s`).

---

## 5. MODE 'creator' vs 'gnome'

- `MODE` (5630) is the only switch. In-range it is read exactly once (5696): the player's gnome runs `playerDecide` in gnome mode and the ordinary `decide` in creator mode. **The avatar persists across modes** (`g.player` stays true); in creator mode it "lives as any villager does" (5629) but with permanent exclusions enforced elsewhere by `!g.player`: never courts (4314, 4377, 4380, 4490, 4499), never fights (2054), never leaves the isle at `AGE_LEAVE` (5562), never becomes chief/engineer/boatwright (3139, 3162, 3166), never rides the deer (4211), never does animal jobs (4910), never takes a boat trip (11796, 11805), never a glider watcher/pilot while in gnome mode (11408, 11417), and its tent is never recycled (3705). The villagers' "starving" fallback skips it (4833).
- `setMode` (11252–11269, outside): entering gnome mode spawns the avatar if needed, forces tool `hand`, selects & follows it, zooms to ≥1.5, toasts the control hint; leaving clears selection/pick/panel and toasts "<name> goes on as one of the village/hamlet". `document.body.classList.toggle('gnome')` drives CSS: creator tools, size row and Undo hidden (169); the gnome card re-laid (173–178); `#grow` row shown (181). Button `#bPlay` text flips "Be a gnome" ↔ "Creator" (11267).
- Input: in gnome mode a short tap (`moved<9px`, `<420 ms`) with the hand tool goes to `playerCommand` (11223) → `pbTap` if a pick is in hand else `playerTap`. In creator mode the same tap selects (`tapSelect`).
- Build-as-gnome is gnome-mode only: `drawGhost` is gated on `MODE==='gnome'` (12049); `updateGrow` early-returns otherwise (10996).
- `newIsland` (12107–12108) resets `PLAYER`, forces `MODE='creator'`, clears `PB`.

---

## 6. UI elements, controls, input handling (DOM/CSS/wiring outside the range, referenced by it)

- `#bPlay` (287) toggle button; `#bBuild` (267) opens `#bld` panel (256, `role=dialog`) with `#bldGrid` 3-column buttons built by `openBuild` (11003–11015): label + `pbCostText`, disabled with "needs a home of your own" for `PB_NEED_HOME={fence,steppath,garden}` (10994).
- `#gbar` ghost bar (255): `#gbName`, `#gbCost`, `#gbMsg` (italic; `.no` red when invalid), `#gbPlace` (disabled unless `gh.ok`), `#gbCancel`. Filled by `updateGbar` (11017–11028): for pave shows "N tiles — tap more, or Place"; for ok ghosts shows `gh.msg` or "tap elsewhere to move it, or Place".
- `#gstat` chip + `#bPause` ("Pause"/"Go on") + `#bStop` in the `#grow` row (268–270), managed by `updateGrow` (10995–11002); Pause handler at 12190–12195 also pulls the avatar off the site if it is not `BUSY`.
- Toasts via `toast()` (10685, `#hint`, 3.4 s); events via `logEv` (10717).
- Status strings returned by `playerTap` are the toast text — the function doubles as the UI copywriter.

---

## 7. Progression / unlock / economy

- No explicit unlock tree for the player; gating is by **prerequisite structures and ownership**: fence needs a garden needs a home; hive needs a garden; kennel needs fold; cart needs stable; hearth needs a fire; well/fold/stable/kennel/cart/hearth are one-per-village (also counting the village's own queue via `queued`).
- Economy: materials `wood/stone/fibre` in `store`; the player's site is fed by the avatar alone through `siteJob` — from the store when `store[m]-reserveOf(m)>=1`, else by felling (allowed down to 8 trees for a `mine` build vs 26 for the village, 4213), quarrying, reed cutting. Stop refunds what reached the site, not what was spent felling.
- Fuel: fires/cabins/lodge consume wood in the cold (5776); a hearth halves the fire's burn.
- A player-lit fire far from the green founds a **hamlet** (`b.hamlet`, 6011; resolved in `finishBuild`/village code at 2504–2512, outside) and re-hats the player's household.

---

## 8. Persistence

None in this section or the file: no `localStorage`/`sessionStorage`/`JSON.*` anywhere (grep returned nothing). `PLAYER`, `MODE`, `PB`, the project and all marks are in-memory only and are reset by `newIsland`. Reloading loses the avatar.

---

## 9. Mobile / touch / performance

- Touch-first: tap classification (`<9 px`, `<420 ms`) at 11223; the panel and ghost bar are fixed-bottom with `env(safe-area-inset-bottom)` (CSS 184, 196); `#bld` width `min(94vw,420px)`; `#gstat` ellipsised at `60vw`.
- Entering gnome mode zooms to ≥1.5 and follows the avatar so a thumb-tap lands on something (11257).
- `drawGhost` reuses the per-frame projected vertex arrays (`SVX/SVY/SWY`) instead of projecting again — cheap even for a 14-tile run.
- `playerTap` does linear scans of `trees`, `rocks`, `bushes`, `builds`, `IDX.shores` per tap (per-tap only; fine).
- `updateFlora`: seeding checks are rate-limited by `chance(dt*k)`; the inner `for(const o of trees)` neighbour check is O(n) per seed attempt (≤1600 trees); rock trickle bounded to 40 tries.
- `updateGnomes` iterates all gnomes every frame; decisions are throttled to ~1/s per gnome via `g.decide`.

---

## 10. i18n (en/es)

- The only localised text in the whole file is the **intro overlay** (`langs` at 12200–12205: title, 4 paragraphs, Begin button; `paintIntro` 12207). The Spanish intro even refers to the English button labels ("Creator en la barra cambia a Gnome").
- Everything in this range — `PB_LIST` hints (5818–5828), ghost reasons (5845–5975), toasts and `logEv` lines (5638, 5645–5647, 5664–5687, 5994, 6000–6001, 6008, 6011, 6013, 6026), `pbCostText` units (5833–5834), `pbStatus` (6033–6034) — is hard-coded English prose, often with typographic dashes and `·`. Porting to a bilingual game means moving every returned/toasted string behind a lookup.

---

## 11. Oddities, bugs, dead code, TODOs

1. **Toast spam while frozen** (5647): the `warm<0.12` branch has no `g.st!=='goHuddle'` guard (the hunger branch has `g.st!=='goEat'`), and `goHuddle` is not `BUSY`, so every decide tick (~every 0.5–1.3 s) re-issues `goHome` and re-toasts "is frozen through and goes in to the fire" until the gnome arrives.
2. **Orphaned marks on dozing off** (5646): the avatar falls asleep without clearing `g.job`/marks (`t.marked=g.id`, `r.marked=1`). When it wakes, `playerDecide` does not resume the job, so the tree/rock stays reserved until the next tap calls `clearMarks` (5657).
3. **Dead `cost:` extras and `b.work=` assignments**: every `mkProj(..., {cost:{…}})` in `pbGhost` (5857, 5867, 5911–5915, 5926, 5939) and the `b.work=b.cost.work` lines (5916, 5927, 5940) are overwritten by `stageProject` (4111, 4123: `b.work=b.plan.length`, `b.cost={w:b.need.wood,…}`), which every `mk` calls. Harmless, but misleading — the real cost is the plan's piece count.
4. **Cost text vs. plan**: `pbCostText('pave')` says "1 stone a tile" (5834) while the pave ghost's (dead) extra says `ceil(L/2)`; the truth is whatever `makePlan` emits.
5. **Rope bridge ignores its minimum span** (5918–5929): `SPAN.ropebridge=[4,10]` but only the max is checked; a 1–3 tile gorge is accepted. The comment at 2453–2456 says nothing is built shorter than its least.
6. **Fishing through ice** (5680): `wetD>0.3` passes regardless of `ICE`; only the `0.2–0.3` band goes through `isWater` (which excludes ice).
7. **Second-tap reeds are undiscoverable** (5686): no hint mentions it, and `goTo` snaps the target via `openNear` (1571), so `g.tx/g.ty` may not equal the tapped tile and the match can fail.
8. **Footprint tile wrap** (5957): `fpTiles` uses `I(x,y)=y*N+x` without bounds; the `i>=0&&i<NC` filter does not catch `x` overflow, so a ghost near the right edge can paint a tile on the next row. `siteFree→tileFree` still rejects it (red), so no placement bug.
9. **Two label sources**: `playerTap` uses `BT[type].label` ("log cabin", 5673) while everything else uses `pbLabel` ("Cabin").
10. **Trap message is a hint, not a reason** (5888): "a trap stands on the bank" is returned for occupied/wet/too-low tiles.
11. `pbGhost` 5861 `PB_LIST.find(...)[2]` would throw for a type not in `PB_LIST` (only reachable via console).
12. The avatar's `warm` need is handled in `playerDecide` but the `huddle` destination requires `warmSpot`/`nearestRoof`; with no fire or roof the avatar simply keeps freezing (no message).
13. `updateFlora` sits inside the "playing as a gnome" block by accident of history; it is pure world simulation.
14. No TODO comments in the range; version tags (`v9.9`, `v9.14`, `v9.17`, `v9.20`) mark incremental additions.

---

## 12. Reusable engine/shell vs gnome-specific content

**Reusable patterns (engine/shell)**
- The **mode switch**: a single global `MODE`, a `body` class, one toggle button whose text names the *other* mode, camera follow + zoom on entering avatar mode, and exactly one branch in the sim loop (5696) that swaps the avatar's brain. Everything else stays shared.
- **Avatar = flagged NPC** (`g.player`): the same entity type, same `act/move/needs`, with explicit `!g.player` exclusions in social/leaving behaviours. Persisting the avatar across modes.
- **Tap → intent cascade** (`playerTap`): refuse while in hold states → wake → clear previous intent → nearest small interactable in a radius → structure under the tile (unfinished first) → terrain class → gesture (second tap) → default walk; return a short status string the shell toasts. The `PLAYER_HOLD`/`BUSY` split (orders refused vs. autonomy suppressed).
- **Needs override orders** (`playerDecide`): hunger/energy/warmth thresholds that pre-empt the player's commands, then "continue own project when idle".
- **Pick → ghost → Place/Cancel** flow: `PB` state, `pbGhost` returning `{ok, tiles, msg, mk}` with the constructor deferred in `mk`, `pbTap` re-validating on every tap, `drawGhost` tile panes, the ghost bar with name/cost/reason, `Pause`/`Stop`/status chip, one-project-at-a-time, refund on Stop, `b.mine` keeping NPC AI off the player's work (by never entering the village queue) while still letting the player "lend a hand" at NPC sites.
- Multi-tile run picking (toggle tiles, cap 14) for paths.
- The `updateGnomes` skeleton: needs → throttled decide → act → leave-building sanity → move → mount sync → wear → ground tracking → cosmetic springs/timers.
- Diagnosing *why* a site fails in a fixed priority (wet → sea → taken → rock → steep → fallback) rather than a generic "not here".

**Gnome-specific content (replace)**
- `PB_LIST` catalogue, hints, `PB_SPAN`, `pbCostText` units, all `pbGhost` type branches (homes/gardens/fences/hives/wells/folds/kennels/stables/carts/hearths/steps/traps/lanterns/spans/dams/wheels/windmills) and their adjacency rules, `BT` costs.
- Resource verbs: fell/quarry/pick/fish/cut reeds/empty trap; the larder/fire/bed rest verbs; `haulHome`.
- Household ownership (`home`, `owners`, `kids`, `vil`), hamlet founding, village-level one-per-village limits.
- All of `updateFlora` (trees, rocks, berries, honey, fuel, crops, apples, wheel, windmill power, frost/thaw).
- The float-when-dug gag (5703–5705), rider sync (5701), swimming splashes.
- Every English string.

---

## 13. Design questions for the Parque D'Amour port raised by this section

1. **Who is the avatar?** A visitor, a gardener, a cupid, a saboteur? Does it *arrive* (like coming ashore) or is it chosen from existing park-goers? Exactly one `PLAYER`, or can the player hop between bodies?
2. **What does the avatar do in Creator mode?** Here it keeps living as an NPC with social exclusions (no courting, no leaving). In a romance game, should the avatar be allowed to fall in love, or be excluded from the couple logic as the gnome is?
3. **What does a tap mean?** Define the cascade for a park: a bench, a couple, a lone visitor, a flowerbed, the fountain, a kiosk, a pigeon, a path tile, water, grass. What is the default action (walk)? Is there a "second tap" gesture, and should it be discoverable?
4. **Assist vs. sabotage verbs**: `playerTap` only has constructive verbs. Does the same tap on the same object do different things depending on a global "intent" toggle (assist/sabotage), a long-press, or a chosen tool? How is the intent shown in the toast/card?
5. **Autonomy**: does the avatar have needs that override orders (hunger 0.86 / energy 0.06 / warmth 0.12 here)? If yes, which (hunger, rain shelter, tiredness) and where does it go to satisfy them?
6. **Hold states**: which avatar states refuse a new order (`PLAYER_HOLD`) vs. are merely interrupted? (e.g. mid-conversation with a couple cannot be interrupted?)
7. **What is "building" in a park?** Benches, flowerbeds, hedges, lamps, fountains, kiosks, bandstands, bridges over the pond, paths. Draft the `PB_LIST` with per-type placement rules, prerequisites (one bandstand per park; a hedge needs a bed?), adjacency radii, and hints.
8. **Economy**: what replaces wood/stone/reed (seeds, flowers, coins, charm)? Is there a store with a reserve (`reserveOf`)? Does the avatar fetch materials itself (as here) or spend currency instantly?
9. **Ownership**: the gnome gates garden/fence/path on "a home of your own". What gates things for a park avatar (their own kiosk, a favourite bench)? Do NPC staff ever help the player's project (`b.mine`), and can the player help NPC projects?
10. **Spans and water**: is there a pond/stream needing bridge/dam-style span search, or can that whole branch be dropped?
11. **Ecology tick** (`updateFlora` analogue): seasonal blooms, fountains on/off, lamps lit at dusk, rain emptying benches — which of these affect the romance sim, and at what rates?
12. **Progress display**: keep "Label · k of n" plus "needs X (none in the store)"? Pause/Stop with refund?
13. **Camera**: keep the auto-zoom to 1.5 and follow on entering avatar mode? Mobile thumb reach for the ghost bar and panel at bottom?
14. **Localisation**: all gameplay strings must be table-driven (en/fr/es?) — including returned status strings from the tap cascade. Decide on string keys vs. prose returns.
15. **Persistence**: none here. Should Parque save `PLAYER/MODE/PB` and the project across reloads?
16. **Hamlet analogue**: does any player action found a new zone (a second lovers' corner) with its own hub, as the far-off fire founds a hamlet?
17. **Toast grammar**: the shell prefixes "<name>: " to returned strings; in a French-flavoured game, will messages be in the avatar's voice, the narrator's, or a park sign's?
