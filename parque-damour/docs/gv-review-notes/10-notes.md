# Gnome Village review — Section 10: lines 4735–5621 "Children play; gnome behaviour continued"

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Range read in full: 4735–5621 (887 lines). Symbols outside the range were resolved with grep only.

---

## 1. Purpose of the section

This range is the **core agent AI of the game**: the per-gnome *brain* (`decide`, 4816), the *state-machine body* (`act`, 4974, ~560 lines, ~110 `case` labels), the *physiology* (`needs`, 5571: age, hunger, energy, warmth), *reproduction* (`breeding` 5547 / `makeBaby` 5534), the *children's play tree* (`childPlay`, 4742), *animal-husbandry job dispatch* (`animalJob`, 4791), *pet affection* (`petJob`, 4953), bedtime (`toBed`, 4781), and the *crowd separation pass* (`spaceOut`/`nudge`, 5599/5593).

It is driven by `updateGnomes(dt)` just after the range (5689–5700): `spaceOut(dt)` once per frame, then per gnome: `needs(g,dt)` → countdown `g.decide` → when ≤0 and not `BUSY[g.st]`, `decide(g)` (or `playerDecide(g)` for the avatar in `MODE==='gnome'`) → `act(g,dt)` → `moveGnome`. `breeding(dt)` is called from the world tick at 12039.

Architecturally it is a **utility-ordered priority list** (decide) feeding a **flat string-keyed FSM** (act) where each state is `goX` (walk) → `X` (do, timer `g.t`) → `'idle'` with `g.decide` set to a short re-think delay. Walk states give up on `g.pathT` (seconds spent pathing) exceeding a per-state budget (18/20/24/30/40/60 s).

---

## 2. Globals / state defined or mutated in this range

### Defined here
| Name | Line | Type / shape | Meaning |
|---|---|---|---|
| `NO_SPACE` | 5586 | `{stateName:1,...}` const object (26 states) | States exempt from `spaceOut` pushing: float, swept, boat, sleep, fishing, court, comfort, help, goRescue, heave, huddle, shelter, shiver, flee, yelp, adventure, goAdventure, dance, paddle, snow, row, passenger, netFish, aloft, flyPrep, atSummit |
| `SEP_RX`, `SEP_RY` | 5592 | numbers 10, 8 | Half-widths (px at zoom 1) of the personal-space ellipse on screen (a gnome ≈14 px tall, 8 wide) |

### Mutated here (defined elsewhere)
- `store.{food,wood,stone,fibre}` (2409) — many lines: 4999 `food--`, 5005 `food--`, 5014 `wood-=3`, 5433 `food--`, 5449 `food+=got`, 4995 `store[m]-=take`, 5602 baby `food--`.
- `STATS` (4658) — `flee` 4836, `shelter` 4852, `dined` 5003, `feasts` 5006, `dances` 5014, `snowmen` 5042, `paddles` 5044, `boats` 5299, `indoors` 5189, `rescue` 5381, `caught` 5410, `grazes` 5416, `shorn` 5431, `feeds` 5436, `watered` 5404, `honey` 5447, `left` 5503, `born` 5540. (Several are lazily created with `(STATS.x||0)+1`.)
- `village` (2468) — `deerDay` 4814, `feastDay` 5006, `festDay`/`danceDir`/`danceFlip` 5014, 5022, `lateDay` 4856, `waterLog` 5404, `lookLog` 5433, `grazeLog` 5419, `breed` 5548–5550, `felled` 5121; read: `project`, `flyer`, `pilot`, `sawmill`, `lastRain` (via drySpell).
- `gnomes` array — `push(baby)` 5540; `splice` on adventure 5503 and flee 5509.
- `snowmen` (4729) — `push({x,y,life:0.6,hat,sd})` 5042.
- `rocks` — `splice` 5143, 5221; `r.x/r.y` moved 5220.
- `critters` members — rabbits: `held, fold, tame, st, scare, wool, z, inHutch, x, y, t` (5409–5418); fox/deer: `food, feeder, scare, st` (5436), `patBy` (4955, 5461–5465), `groomBy` (4961, 5467–5482), `rider` (5441, via mount/dismount).
- Builds — `occ` (4785, via releaseBed), fold: `catcher, shearer, herd, out, grazedDay, strayed, shornYear, foxDay, lookLog`; garden: `waterer, watered, tendT, crop, apples`; well: `turnT`; hive: `honey, taker`; rack/fire: `feast`, `bonfire`; workshop/boathouse: `logDay, worked`; cabin: `kids`; sites via `placePiece`/`advanceClear`.
- Terrain heat maps: `FISHN[i]` 5103 (+2 centre, +1 neighbours, cap 250), `QUARRYN[i]` 5141 (same scheme).
- Trees — `t.fall=0.001, fallDir, marked, shake` 5121.
- Particles — via `P()` (5267 chip, 5446 smoke).

### Gnome object fields touched (shape of `g`)
`st` (string state), `job` (object, see below), `t` (state timer, s), `decide` (s until next think), `arrived`, `path`, `pathT`, `ptx` (set to −99 to force re-path), `tx/ty` (goTo target), `hatHand` (0/1 — hat carried in hand), `face` (±1), `hop`, `work` + `struck` (swing cycle), `piece`, `carry` (material name or null), `cAmt`, `ate`, `dined` (day index), `restIn` (bed building), `inside`, `tagT`, `chatT`, `storyT`, `tuneT`, `dAng/dR/dDir` (dance ring), `px0/py0` (saved pos while paddling), `boat` (0/1 — in the hat-boat), `bx/by`, `shore`, `swim`, `gz`, `z`, `sweptT`, `panicT`, `fell` (0/1/2), `helpT`, `rescT`, `bendV` (body wobble), `partner`, `mate`, `cool` (days), `adx/ady`, `moving`, `walkPh`, `hunger`, `energy`, `warm`, `age` (days), `stage`, `h` (height px), `hat`, `soloT`, `ride`, `cart`, `player`, `stranger`, `id`, `sex`, `name`, `home`, `vil`, `did` (tally), `bedJit`.

### `g.job` shapes seen in range
`{k:'dance',b}` `{k:'listen',b}` `{k:'shelter'|'huddle',b}` `{k:'chaseR',c}` `{k:'snow',x,y}` `{k:'paddle',s}` `{k:'chase',o}` `{k:'hide',t}` `{k:'stones',s}` `{k:'boat',s}` `{k:'pat',t}` `{k:'follow',c}` `{k:'bed',bed}` `{k:'catch',c,b}` `{k:'shear',b}` `{k:'herd',b,t0,s}` `{k:'feedFox',c,b}` `{k:'feedDeer',c}` `{k:'dine',b,feast}` `{k:'bush',b,stock?}` `{k:'fish',s}` `{k:'story',b}` `{k:'chat',b}` `{k:'tinker',b,flyer?}` `{k:'quarry',r}` `{k:'chop',t}` `{k:'fibre',s}` `{k:'harvest',b}` `{k:'draw',b,gd}` `{k:'tend',b}` `{k:'honey',b}` `{k:'patDog',c}` `{k:'groom',c}` `{k:'deliver',b}`; goFetch reads `{b,m,ride}`; goRescue reads `{v}`; heave reads `{r}`.

---

## 3. Functions (all 17 in range)

### `storyFire(g)` — 4736
Returns `warmSpot(g)` if `evening()` else null. Called by `childPlay` 4743 and `decide` 4860.

### `teller()` — 4737–4740
Returns the first gnome who is an **elder, or an adult with age ≥ AGE_ADULT+12 (= 36 days)**, in state `story` or `goStory`. Null otherwise. Called by childPlay 4743, decide 4861–4862, act `goListen`/`listen` 5242, 5245.

### `goHome(g,b,st,k)` — 4741
Sets `g.st=st`, `g.job={k,b}` and walks to the door (`b.dx,b.dy`) or, lacking one, `b.x+rnd(-0.6,0.6)*S, b.y+0.55*S`. Called by childPlay 4748–4749, decide 4848, 4852, and by `playerDecide` at 5647 (outside range).

### `childPlay(g)` — 4742–4780
The children's decision tree (children never work). Order:
1. 4744 `hatHand=0`.
2. 4744 Midsummer `danceTime()` → `goDance` toward `danceFire(g)` + (x ±1.5S, y +0.5..1.8S).
3. 4745–4747 Evening fire + a teller present → `goListen`; if the teller stands on a lodge porch (`tl.job.b.porch`) the listener sits in front of it using the porch frame (`side=rnd(-1.6,1.6)*S`, `out=rnd(0.6,1.8)*S`, rotated by `fx/fy`), else around the fire (x ±1.6S, y +0.6..1.8S).
4. 4748 `W.rain>0.62` → `goShelter` at `nearestRoof`.
5. 4749 `g.warm<0.14` → `goHuddle` at `warmSpot||nearestRoof`.
6. 4750 `r=rng()`; centre `c` = hearth (evening) or village green; radius `R` = 2.4S (evening) / 3S (day).
7. 4753 Daytime: `petJob(g,null)` (k=1) — a pat for the dog.
8. 4754–4760 Daytime seasonal games, one roll `r2`:
   - `r2<0.22`: chase the nearest **wild rabbit** within 10 tiles (`10*10*S2`) → `chaseR`, `t=rnd(8,14)`, hat in hand 50%.
   - else `T.cold>0.5 && (W.snow>0.2 || snowAt(eLerp(x,y))>0.5) && r2<0.55 && snowmen.length<4`: up to 6 tries for a spot by the fire/green (x ±1.8S, y +0.8..2.0S) that is `critOK`, not `PAVE`, ≥1.6 from the fire and ≥1.6 (Chebyshev) from other snowmen → `goSnow`.
   - else summer (`T.season===1`), `T.cold<0.2`, `W.rain<0.4`, `r2<0.58`: nearest shore within 9 tiles from `IDX.shores` whose bank is dry (`bankDry`), water not a river (`FLOW < FLOW_RIVER*0.8 = 1.04`) and not iced → `goPaddle`.
9. 4762–4763 Other children (not inside) within 9 tiles and `r<0.34` → `chase` (tag), `t=rnd(6,12)`, hat 40%.
10. 4764–4767 Daytime `r<0.48`: sample **12 random trees**, nearest within 6 tiles → `goHide` (offset +0.35S,+0.35S), hat 50%.
11. 4768 Daytime `r<0.58`: `nearestShoreFrom` within 7S, not river, `T.cold<0.5` → `goStones` (skipping stones).
12. 4769 Daytime `r<0.70`, cold<0.5, rain<0.4: `nearestCalm(g,9S)` → `goBoat` (the hat as a boat).
13. 4770 `r<0.82` → `skip` around `c±R`, `t=rnd(3,6)`, hat 45%.
14. 4771 Daytime `r<0.90`: random tree, standing, `age<0.8`, within 10 tiles → `goPat`.
15. 4772–4773 Adults (not inside) within 10 tiles → `follow`, `t=rnd(5,9)`, hat 30%.
16. 4774 else `wander` around `c±R`.
Called by `decide` 4846.

### `toBed(g)` — 4781–4789
If already `goBed` with a valid `restIn` → return (no re-path). `releaseBed`; `homeBed(g)` → `bed.occ++`, `restIn=bed`, `goBed` to `bed.dx,dy`. No bed → `goSleep` at `warmSpot ±1S` or in place ±0.8S. Called by decide 4841, 4849; playerDecide 5674, 5676.

### `animalJob(g)` — 4791–4815 (v9.17)
Returns true if it dispatched a job. Gates (4795–4796): `store.food < pop*2.5+4` → false; `prep` (autumn `T.ds>1.2` or any cold) and (`food<pop*5+12` or `wood<pop*4+16`) → false. `taken(who,k)` 4797: another living gnome holds that job.
With a finished fold `f` with `gateAt`:
- 4800–4803 **Catch**: flock<2, day, `T.f<0.6`, no catcher → nearest `wildRabbits()` (not kit, not swept) → `goCatch`, `t=30`; `f.catcher=g`; log once/day (`f.lookLog`).
- 4805–4806 **Shear**: year `yr=floor((T.day-1)/12)` (12-day year); flock≥1, spring (`T.season===0`), `f.shornYear!==yr`, flock not out, day, `T.cold<0.5`, no shearer, some rabbit `wool≥0.5` → `goShear` at gate.
- 4807 **Herd**: flock≥1, not out, day, `T.f<0.58`, `W.rain<0.5`, `T.cold<0.6`, no herder, `f.grazedDay!==T.day`, and (craft==='herd' or 40%) → `goFold`.
- 4808 **Tame the fox** (dog): flock≥2, no `theDog()`, day, `T.f<0.6`, `food ≥ pop*3+6`, not tried today (`f.foxDay`): untamed fox, no food out, not cub, not carrying → `goFetchFood {k:'feedFox'}` to food drop point.
- 4810–4814 **Tame the deer** (horse): no `theHorse()`, day, `T.f<0.6`, `food ≥ pop*3+6`, `village.deerDay!==T.day`: untamed adult deer, chance 0.9 if `scouting()` else 0.5 → `goFetchFood {k:'feedDeer'}`.
Called by decide 4909 (adults only, not the player).

### `decide(g)` — 4816–4951
The brain. Full priority order (each returns on dispatch):
1. 4817 `BUSY[g.st]` → return.
2. 4818 `clearMarks(g); g.job=null`.
3. 4819 riding with nothing carried → `dismount`. 4820 carrying water → spilt (`carry=null`).
4. 4821 carrying anything → `haulHome`.
5. 4822 `fightJoin` (flood fights, v9.22); 4823 `watchJoin` (flight festival, v9.21).
6. 4826–4838 **Supper**: `(ph==='dinner' || (ph==='social' && T.f<0.84)) && g.dined!==T.day && food≥1 && not baby && !lateShift(g)`. `feast = festival()==='harvest' || flightFeast()`. With a lodge: chief → `porchSpot`, others → `lodgeSpot` in front (side ±1.5S, out −0.4..0.9S). Else `feastSpot` (rack) or `hearth`: at a rack sit on a ring `R=rnd(0.9,1.6)*S` at random angle; at a fire x ±1.7S, y +0.4..1.8S. State `goDine`.
7. 4835–4837 **Flee**: `hunger>0.94 && !foodAround && not baby && !g.player` → `flee` to the nearer map edge (`x<N/2?1:N-2`), `STATS.flee++`, toast + log.
8. 4838–4842 **Hungry** `hunger>0.50 && src`: `'store'` → `goEat` at food drop ±0.5S; `'bush'` → `nearestBush(16S)` marked → `goBush`; `'fish'` → `nearestShore(16S)` → `goFish`.
9. 4843 `isBedtime(g)` (not baby) → `toBed`.
10. 4844 `releaseBed`.
11. 4846 **First fire**: no fire built, adult/elder, not night, `village.project` is a fire with a plan → `siteJob`.
12. 4847–4853 **Baby**: bedtime → bed; else `follow` nearest non-baby not inside; else `wander` ±1.5S.
13. 4854 **Child** → `childPlay`.
14. 4855–4858 `warm<0.12` → `goHuddle` (fire or roof).
15. 4859–4861 `W.rain>0.62 && hunger<0.5 && !carry` → `goShelter` at nearest roof, `STATS.shelter++`.
16. 4862 `food ≥ pop*1.5` → `petJob(g,craft,0.15)` (a pat on the way past).
17. 4864 **Lantern late shift** (v9.14): `lateSite(g)` → `siteJob`; log once/day (`village.lateDay`).
18. 4866–4875 **Evening** (`T.f≥0.68 || <0.235`): midsummer `danceTime()` & not elder → `goDance`; lodge + no teller + chief + 70% → `goStory` on porch; fire + no teller + no lodge + (elder or adult ≥36 d) + 50% → `goStory` at fire (x ±1.2S, y −0.9S); `petJob(g,craft,0.5)`; else `goChat` at hearth (x ±1.8S, y −0.4..1.8S).
19. 4876 `warm<0.26` → `goWarm` at fire ±1S.
20. 4877 `food < pop*1.1` → `foodJob`.
21. 4879 **Flyer** (v9.21): `village.flyer.st==='build'`, `engineerOf()===g`, `T.light>0.3`, day, `T.f<0.62`, 50% → `goTinker` with `flyer`.
22. 4883 **Miner** (v9.24): `isMiner`, adult/elder, light>0.3, day, `T.f<0.62`, 55%, own mine (`mine.home.owners` includes g), benches left or `stone<40` → `goQuarry` at `mineRock`.
23. 4885–4890 **Winter prep** (`T.season===2 && T.ds>1.2`, or cold): `food<pop*5+12 && 60%` → `foodJob`; `wood<pop*4+16 && trees.length>26` → chop `nearestTree(18S)` (marked with `g.id`).
24. 4892 `food < pop*2.5+4` → `foodJob` (larder before building).
25. 4894 **Boatwright** (v9.21): `boatYard`, `boatwrightOf()===g`, boats at yard `< BOAT_MAX (2)`, light>0.3, day, 30% → `goTinker`.
26. 4896 **Crossing** (v9.19): first crossing in `villageSites()`, `g.id%3===0` → `siteJob`.
27. 4897 `ownsProject(g)` → `siteJob` (own home first).
28. 4899–4905 **Kitchen garden** (`homeOf(g).garden`, light>0.3): `crop≥1 || apples>0` → `goHarvest`; `drySpell() && !(gd.watered>T.abs) && gd.done` and nobody else watering → finished well → `goWell {k:'draw',b:well,gd}`; `gd.tendT≤0 && season!==3 && 50%` → `goTend`.
29. 4907–4908 **Hive**: household hive (by home or `owners`), `honey≥1`, autumn (`season===2`), light>0.3, nobody taking → `goHoney`.
30. 4909 adult, `!g.player`, light>0.3 → `animalJob`.
31. 4910–4911 **Village sites**: `villageSites()`; odd `g.id` reverses order (half take the second site first) → `siteJob`.
32. 4913 `food < pop*3.2+6` → `foodJob`.
33. 4914–4916 `wood < 10+pop*3+(craft chop?8:0) && trees>26` → chop `nearestTree(16S)`.
34. 4917 `fibre < 5+pop*1.5+(craft fibre?4:0)` → `nearestGrassTile(11S)` → `goFibre`.
35. 4918–4922 `stone < 4+pop*1.5+((craft quarry||miner)?6:0)`, adult/elder: `mineRock` preferred if craft quarry/miner, or no loose rock, or mine distance² < rock distance²×1.4; else nearest rock within 22S, marked → `goQuarry`.
36. 4924 Miner keeps digging benches: light>0.3, 45%, benches left, own mine → `goQuarry`.
37. 4925–4927 **Workplace** (`workPlace(g)`: workshop/boathouse/slipway), light>0.3, day, 45% → `goTinker` (flyer if workshop & flyer building; else `workSpot`).
38. 4929–4930 Idle: if >9 tiles from the green → `wander` back ±2.4S.
39. 4931–4932 fire && 34% → `goWarm` ±1.3S.
40. 4933 adult && chance(craft fish? 0.55 : 0.30) && `food < pop*6+24` → `boatFishJob` or `nearestShore(12S)` → `goFish`.
41. 4936 `petJob(g,cr)` (k=1).
42. 4937 boats && 25% → `tripJob` (a row round the isle).
43. 4938–4941 22%: random standing young tree (`age<0.8`) within 10 tiles → `goPat`.
44. 4942–4943 `wander` ±4S round the green.
Called from `updateGnomes` 5696.

### `petJob(g,cr,k)` — 4953–4963 (v9.20)
`k` scales odds (default 1; 0.15 "on the way past"; 0.5 evening). Dog (`theDog()` = tame fox): not `patBy`, state in {lie, heel, dogRest, waitDoor}, within 9 tiles, chance `k*(master? 0.20 : child? 0.30 : 0.04)` → `goPatDog` standing at `dog.x ∓0.62, dog.y+0.12`. Then children and `T.light<0.4` return false. Horse (tame deer, not foal, no rider, no cart, not stabled, not `groomBy`) within 16 tiles, chance `k*(tamer? 0.16 : craft herd? 0.06 : 0.025)` → `goGroom` at `∓0.5, +0.55`. Called by childPlay 4753, decide 4862, 4873, 4936.

### `rockTileOf(r)` — 4964–4970
Picks, among the rock's tile and 4 neighbours, the tile with highest score `(ROK 3 | SCR 2 | 0) + slopeOf(x,y)`. Used by `quarry` 5139 to seed `QUARRYN`.

### `atDoor(g,b)` — 4972
`g.arrived` or within 1.1 tiles of the door (`dx,dy` else `x,y`). Used by goBed 5189, goShelter 5230, goHuddle 5325.

### `goIn(g,b)` — 4973
`enterBuild` only if `isHome(b)` (tent or cabin) — one shelters *under the eaves* of a non-home. Used 5230, 5325.

### `act(g,dt)` — 4974–5533
The state machine (see §4 for the full per-state rule table). Delegates: `flyerAct` (4977: goWatch, watch, goFly, flyPrep, carryGlider, atSummit, aloft), `boatAct` (4978: goRow, row, passenger, netFish), `fightAct` (4979: goDrain, drain). No `default:` — unknown states do nothing. Called from `updateGnomes` 5697.

### `makeBaby(a,b)` — 5534–5545
Guards: `gnomes.length ≥ POP_CAP (44)`; `a.mate===b`; shared cabin home. Baby at midpoint, sex 50/50, age 0.02 d, hat from `HAT_B`, `parents=[a,b]`, `home=h`, `vil`, pushed to `h.kids`; `STATS.born++`; both parents `cool=3` (days); heart FX, `sfxBaby`, toast + log. Called by act `court` 5488.

### `breeding(dt)` — 5547–5570
Timer `village.breed` re-armed to **3.5 s**. Skips if pop ≥ 44, `food < 5+pop*1.6`, `T.light<0.3` or night. For each **female adult** with a mate, `cool≤0`, not inside; mate adult, `cool≤0`, not inside; shared cabin; fewer than **2 living kids** at that home; both `hunger≤0.42` and `energy≥0.35`; neither BUSY (except `warming`/`chat`); within 20 tiles → both `court`, `partner` set, `t=16`, walk to midpoint ∓0.4S. One couple per tick. Called at 12039.

### `needs(g,dt)` — 5571–5603
`d=dt/DAYLEN` (DAYLEN 210 s → one day). `age+=d`, `cool-=d`. Stage change via `stageOf` (baby <2 d, child <24, adult <48, elder): `h=heightOf`; baby→child gets a village hat; child→adult: toast/log, `leaveHome`, `soloT=T.abs`; adult→elder log. `age ≥ AGE_LEAVE (84 d)` and not leaving/inside/asleep/player → `setOff` (the adventure). Hunger rate 0.62/day ×0.45 asleep, ×0.5 baby, ×0.8 child, ×(1+cold*0.55+0.1 if snowing). Energy: asleep **+0.16/s** in a bed, +0.072/s otherwise (real seconds); awake −0.72/day (baby ×0.6). Warmth target `tw=0.5+light*0.42`, −0.20 rain>0.3, −0.28 snow>0.3, −cold*0.55, −0.25 swimming; fire within 3S → 1; indoors max(0.88, or 0.45 if the building is `out`); in a bed 0.70/0.45; huddle 0.58; `warm` eases toward `tw` at 0.22/s. Baby auto-eats: hunger>0.55 & food≥1 → `food--`, hunger −0.6. Called 5694.

### `nudge(g,dx,dy)` — 5593–5598
Moves `g` by (dx,dy) clamped to [1,N−2] only if staying on the same tile or the new tile is not `OCC`, has finite `stepCost` (swim allowed unless baby), height difference ≤0.6, `wetD≤0.15`, and bridge/non-bridge status unchanged. Returns success.

### `spaceOut(dt)` — 5599–5621
O(n²) pass over all pairs (skipping inside, `NO_SPACE`, or `swim>0.3`). Early-out if world distance² > 2.5². Degenerate overlap → deterministic angle `(g.id*2.399)%TAU`. Rotates by camera (`rotC/rotS`), projects to screen px at zoom 1 (`HX=TW/2=13, HY=TH/2=6.5`), tests the ellipse `sx²/10² + sy²/8² < 1`. Push direction = across the screen; sign from `sx` or `(g.id+o.id)&1`. Step `k=dt*(moving? 2.6 : 1.4)*0.5` each. If one is hemmed in the other takes the whole step; if both fail, try the opposite way. Called 5691.

---

## 4. Concrete rules & tuning numbers (act states, 4974–5533)

Distance convention: `d2g` returns squared world distance; `S=2` fine tiles per coarse tile, `S2=4`. Some checks use `k*k*S2` (radius k coarse tiles) and others `k*S2` (radius √k ≈ 1.1 tiles for 1.2) — see §10.

| State(s) | Lines | Rule |
|---|---|---|
| `wander` | 4980 | on arrival → idle, re-think in rnd(0.6,2.2) s |
| `follow` | 4981–4987 | children time out (`g.t`); target gone/inside → idle; if > `1.2*S2` away re-walk to target −0.6S,−0.4S |
| `haul` | 4988 | arrived: `deliver` to a site if `job.k==='deliver'`, else `deposit` (food ×1.5 with a rack, larder cap pop*5+16 — in deposit 4579–4580) |
| `goFetch` | 4989–4998 | give up if site done or `pathT>60`; take `min(LOAD[m]×(cart 6 | ride 3 | 1), needRem, store−reserve)`; LOAD wood 3, stone 2, fibre 2 (3838) |
| `goEat` | 4999 | 1 food → hunger −0.52; re-think 0.35 |
| `goDine`/`dine` | 5000–5009, 5051–5055 | abort if day; arrive within 0.45 (porch) / 1.3 tiles; sit `rnd(7,11)` s, feast `rnd(20,30)`; 1 food → `ate` 0.52 (feast 0.9), eaten at end; first feaster per day: `village.feastDay`, `h.feast=T.day` (rack dressed), `STATS.feasts`, `sfxTune`, harvest/flight supper log (thin-supper variant when `food<pop`) |
| `goDance`/`dance` | 5011–5037 | abort if not `danceTime` (midsummer, T.f 0.74–0.9, fire lit) or `pathT>24`; within 2.4 tiles start: `t=rnd(40,80)`, ring radius clamp(dist,1.0S,1.4S); first dancer per day: bonfire, `danceDir` ±1, `danceFlip=T.abs+rnd(0.06,0.12)` (ring reverses every 12.6–25 s), `wood−=3`, 9 sparks, tune, log+toast. Angular speed `2.0/dR` rad/s (×0.25 if within 0.45 rad of the dancer ahead); radius candidates dR+{0,±.25,±.5,.8}S within 0.7S–2.0S and `critOK`; `walkPh+=5.5dt`; hop chance 0.9/s; `~` note 0.12/s; every 8–16 s giggle/murmur, 25% tune. Ends on timer, bedtime, `hunger>0.8`, or dance over |
| `goSnow`/`snow` | 5039–5042 | abort if `T.cold<0.4`, bedtime, `pathT>18`; build `rnd(10,16)` s, puff every 1.4 s (40% "hup"); result `{x:j.x+face*0.45, y:j.y+0.15, life:0.6, hat, sd}` if <4 snowmen; log |
| `goPaddle`/`paddle` | 5043–5047 | abort if `T.cold>0.2`, `W.rain>0.5`, bedtime, `pathT>18`; step 0.42 tile into the water; `rnd(10,18)` s; splash+ripple every 0.9 s, giggle 35%, hop 50%; restores saved position after |
| `chaseR` | 5048–5050 | abort if rabbit penned/held, timer out (giggle), or >14 tiles; re-path every 0.7 s |
| `goChat`/`chat` | 5056–5064 | abort if not evening; within 1.3 tiles; `t=rnd(9,18)`; murmur every rnd(3,7) s (60%), note 30%; ends on bedtime, `hunger>0.7` |
| `goBush`/`pickB` | 5065–5077 | pick 1.1 s; `b.b--`; eat (−0.34) if `hunger>0.42` or not stocking; else carry `millFood(1)` = 1 (1.5 with windmill) |
| `goCollect`/`collect` | 5078–5092 | 1.4 s; take `min(3, floor(stock))`; trap→food, else stone |
| `goFish`/`fishing` | 5093–5109 | cast `rnd(6,10)` s (cold>0.5: `rnd(13,19)`); `FISHN` +2/+1 cap 250 on wet tiles; catch `3` (cold 1) `+2` (`+1` cold) while `scouting()`; eat (−0.55, cold −0.3) if `hunger>0.42` else carry |
| `goChop`/`chop` | 5110–5125 | within `1.2*S2`; `t=rnd(3.6,5.2)`; swing period 1.10 s (strike at 70%); wood `(pine 4 | 3) × (sawmill 2 | 1)`; `village.felled++` |
| `goQuarry`/`quarry` | 5126–5147 | `t=rnd(4,6)`; swing 1.30 s; **mine bench**: `digMine`, +3 stone, miner with <6 stone and benches left chains to the next bench (v9.24); **loose rock**: `QUARRYN` seeded via `rockTileOf`, rock removed, 2 stone |
| `goFibre`/`fibre` | 5148–5156 | 2.4 s → 2 fibre |
| `goBuild`/`building` | 5157–5163, 5172–5185 | `advanceClear`; needs the next plan piece to be non-clear with material in `b.got`; within `0.9*S2`; lay time `LAY_T[kind]||1.3` ×1.3 for elders; swing 0.80 s; if someone else laid the piece (`g.piece!==b.pi`) → idle 0.1; chains to the next piece |
| `goTinker`/`tinker` | 5164–5171 | `pathT>40` abort; within 1.2 tiles; `t=rnd(16,28)`; swing 0.85 s; `flyerWork` or `boatWork` (boathouse/slipway); ends at dusk; `w.worked++`; one log per day per bench |
| `goBed`/`goSleep`/`sleep` | 5186–5195 | enter at door, `STATS.indoors++`; zzz 0.55/s (z 1.8 in a cabin, 1.1 else); wake on `isMorning` (T.f ≥0.235+jitter, <0.6) or `hunger>0.86` |
| `yelp`, `dig`, `heave` | 5196–5226 | player-interaction reactions (set at 4647–4653): wobble `bendV`; dig swing 0.9 s; heave moves the boulder to the first free dry neighbour of 8 (`WD<0.2, E>SEA, !OCC`, no gnome) else deletes it; `sfxYell` |
| `goShelter`/`shelter` | 5227–5231, 5332 | abort if `W.rain<0.3`; `goIn` if a home; leave on `rain<0.3`, `hunger>0.62`, bedtime |
| `goStory`/`story` | 5232–5240 | within 0.45 (porch) / 2.2 tiles; `t=rnd(24,40)`; murmur every rnd(4,7) s; ends on `!evening`, `hunger>0.7`, bedtime |
| `goListen`/`listen` | 5241–5245 | needs a `teller()`; within 2.6 tiles; `t=rnd(15,30)`; heart 0.15/s |
| `chase` (tag) | 5246–5257 | within `0.8*S2` and `tagT≤0` → tag: giggle, hop 0.35, both `tagT=2.5`; tagger `skip` rnd(2,4) s, `decide=3`; the tagged child becomes the chaser (`t=rnd(6,12)`) if not BUSY; re-path 0.8 s |
| `goHide`/`hide` | 5258–5262 | within `0.9*S2`; `rnd(3,6)` s; giggle + hop |
| `goStones`/`stones` | 5263–5269 | `rnd(6,12)` s; every 1.6 s find an adjacent water tile 1.4S out, throw a chip particle (vz 2.2), **`setTimeout` 650 ms** splash+ripple, "hup" |
| `goBoat`/`boat` | 5272–5321 | hat-boat: water tile must have `wetD≥0.4` and `FLOW≤1.04`; `t=rnd(14,26)`, `STATS.boats++`; afloat: current `FLOW>1.04 && wetD>0.3` → `startSweep` (log "the current caught the hat-boat"); `wetD<0.25` or ice → beached; new spot every rnd(2.5,4) s (8 tries, r 0.8–2.2S, `wetD>0.45`, `FLOW<0.5`, no ice, `E>SEA−0.5`, no bridge); speed 0.55S/s; ripple 1.2/s; lands within 0.35S of the shore point |
| `skip` | 5322 | hop 2.5/s; new target ±2S each arrival |
| `goHuddle`/`huddle` | 5323–5331 | `rnd(8,14)` s; shiver wobble outdoors 5/s; ends on `warm>0.5`, `hunger>0.7` |
| `swept` | 5333–5350 | panic cry every 2.3 s (60% "!"), splash 6/s; follow the lowest wet neighbour of 8 (no bridges, `wetD≥0.3`); `washUp` if none, at sea level, `sweptT>9` s, or dry; a drop > `JUMP_AT` (1.2) → `startFloat` (waterfall), `fell=2`; speed `(1.3+max(FLOW)*0.5)*S` |
| `float` | 5351–5361 | fall 0.95 z/s; "!" 1.5/s; landing: `fell===2 && wetD>0.55` → swept again; `fell` → `help` 7 s, `callHelpers(9S, max 2)`; else idle |
| `help`, `shiver`, `goRescue`, `comfort` | 5362–5386 | help cry every 2.6 s ("?"); rescuer gives up after `rescT>28` s; re-path 1.1 s; within 1.7 tiles of a victim in help/shiver → `comfort` 2.6 s, `STATS.rescue++`, victim timer cut to ≤1.2, heart, log |
| `goWarm`/`warming` | 5387–5388 | `rnd(4,9)` s; ends `warm>0.85` |
| `goFarewell`/`wave` | 5389–5393 | wave `rnd(14,20)` s facing the departing boat's shore direction |
| `goTend`/`tend` | 5394–5396 | `rnd(5,7)` s; `tendT=DAYLEN*0.9` (189 s ≈ 0.9 day); sparks 2/s; tally farm |
| `goHarvest`/`harvest` | 5397, 5448–5451 | 4 s; crop → `(windmill 8 | 4) × (big 2 | 1)`; plus apples; eat −0.45 if `hunger>0.35`; **`store.food+=got` directly** (no haul, no rack bonus, no larder cap) |
| `goWell`/`draw`/`goWater`/`water` | 5399–5405 | draw 3.5 s (`w.turnT` animates the windlass); carry 1 water; water 3 s, splashes 5/s; `gd.watered=T.abs+0.8` (0.8 day); log once/day |
| `goCatch`/`goPen` | 5407–5414 | 30 s budget; within 1.1 tiles grab: rabbit not mid-hop and 55% → caught (`tame`, `wool=rnd(0.2,0.5)`), log; miss: `scare=2.2`, −1.5 s, hop; re-path 0.6 s. At the gate: flock out → set down at the gate, else `penRabbit`; `pathT>40` releases it |
| `goFold`/`herdWalk`/`herd`/`herdBack` | 5415–5426 | at gate: `f.out=true`, rabbits to gate ±0.4, `grazeSpot` → walk (`pathT>30` cap) → graze `rnd(25,45)` s per spot; return when `T.f≥0.64`, `rain>0.5`, `cold>0.6`, `hunger>0.78`, flock gone, or **0.22 day (≈46 s) elapsed**; back at the gate (`pathT>60` cap) pen all, log the count |
| `goShear`/`shear` | 5427–5431 | `t=2.5 × flock size`; tap every 0.8 s; wool≥0.5 → 0, n fibre carried; `shornYear` set |
| `goFetchFood`/`goFeed`/`feedWait` | 5433–5439 | 1 food → carry `fish` (fox) or `apple` (any garden `treeAge≥1`) else `berries`; log once/day; within 2.8 tiles (or arrived & <5) set food 40% of the way toward the animal, `c.feeder=g`, animal state → prowl/graze; wait 16 s; food untouched → log "would not come … try again tomorrow" |
| `goMount` | 5441–5443 | deer invalid → fall back to `goFetch` on foot; within 1.3 tiles `mount`, then to the drop point (x ±0.4, y +0..0.4) |
| `goHoney`/`honey` | 5445–5447 | 5 s; smoke particles 3/s; `hv.honey=0`; carry 4 food (log shows `4×rackBonus`) |
| `goPat`/`pat` | 5452–5458 | within `1.4*S2`; 1.5 s; sparks 3/s on the tree |
| `goPatDog`/`patDog` | 5460–5465 | within 0.36 tiles (`pathT>20` cap); `rnd(3,5)` s; hearts 1.4/s |
| `goGroom`/`groom` | 5466–5469, 5481–5482 | within 0.4 (`pathT>30`); `rnd(7,11)` s; hearts 0.8/s |
| `court` | 5483–5492 | both `court`; within `1.4*S2` the lower `id` acts: shared cabin → `makeBaby`, else hearts + murmur; `t` 16 s timeout |
| `goAdventure`/`adventure` | 5493–5505 | boat speed 0.45S/s; steer toward the lowest `E` among 8 directions at 2-tile reach while `E>SEA−1.0`; splash 1.5/s; removed at 1.5 tiles from the edge or after 40 s; log, toast "Farewell", `STATS.left` |
| `flee` | 5506–5512 | ".." notes 0.7/s; removed on arrival or `x<2.2 || x>N−3.2` |

Other constants referenced: `DAYLEN=210` s (573), `SEASON_DAYS=3` → 12-day year; `AGE_CHILD=2, AGE_ADULT=24, AGE_ELDER=48, AGE_LEAVE=84` days (1375); `POP_CAP=44` (575); `FLOW_STREAM=0.5, FLOW_RIVER=1.3` (1349); `JUMP_AT=1.2` (1426); `BOAT_MAX=2` (11711); `LATE_SHIFT=0.045` day (2873); `SWING_P` chop 1.10, quarry 1.30, building 0.80, dig 0.9, tinker 0.85 (8081); day phases (4608): day 0.235–0.68, dinner 0.68–0.76, social 0.76–0.86, night otherwise; bedtime (4615): child 0.80 (0.87 at midsummer), baby 0.80, elder 0.865, adult 0.885, + `bedJit`.

---

## 5. UI elements, controls, input handling

None directly in the range: no DOM access, no event listeners. The section *emits* UI through:
- `toast(msg)` (10685) → the `#hint` HUD element, 3.4 s: used at 4836 (flee), 5015 (midsummer), 5503 (farewell), 5544 (birth), 5577 (grown up).
- `logEv(text, subj)` (10717) → the event feed (~30 call sites in range), rate-limited to once a day per subject via `*Log`/`*Day` fields (`f.lookLog`, `village.lateDay`, `village.waterLog`, `village.grazeLog`, `village.lookLog`, `F.logDay`, `w.logDay`, `village.feastDay`, `village.festDay`).
- `STATS` counters feed the census panel elsewhere.
- Audio hooks: `sfxGiggle, sfxMurmur, sfxTune, sfxHup, sfxSplash, sfxChop, sfxFall, sfxKnock, sfxTap, sfxDrop, sfxYell, sfxPanic, sfxHelp, sfxComfort, sfxBaby, sfxLeave, sfxEat` (via eatNow).
- Particle hooks: `noteFx('~'|'!'|'?'|'..')`, `heartFx`, `sparkFx`, `splashFx`, `rippleFx`, `puff`, `chipFx`, `zzzFx`, raw `P({k:'chip'|'smoke'})`.
Input from the player reaches this code only indirectly: states `yelp/dig/heave` (set by the terrain tools at 4647–4653) and the avatar's `playerDecide` (5630+) which reuses `goHome`, `toBed` and the whole `act` machine.

---

## 6. MODE 'creator' vs 'gnome' (avatar)

- `MODE` is declared at **5630** (`let PLAYER=null, MODE='creator'`), right after this range; toggled at 11256/11261/12107.
- Inside the range there is **no `MODE` reference**; the avatar is recognised by the `g.player` flag (set at 5635): 4835 the player never *flees* the isle from hunger; 4909 the player is never given an `animalJob`; 5581 the player never `setOff`s on the age-84 adventure.
- The driver (5696) swaps `decide(g)` for `playerDecide(g)` when `g.player && MODE==='gnome'`, but **`act`, `needs`, `spaceOut` and `breeding` run unchanged** for the avatar. So the avatar shares the state machine and physiology with NPCs; only the *choice* layer is replaced. `playerDecide` (5647, 5674, 5676) calls `goHome`/`toBed` from this range.
- Creator-mode interactions appear here only as the reaction states `yelp`, `dig`, `heave` (5196–5226): "nothing you do to the island can hurt a gnome" (4644 comment).

---

## 7. Progression / unlock / economy

- **Food economy** (all in `store.food`): eat 1 → −0.52 hunger; supper 1 → −0.52 (feast −0.9); berry → −0.34 or +1 (×1.5 milled); fish +3 (+1 cold) +2/+1 with scouting; harvest +4/+8 (windmill) ×2 big; honey +4 (×1.5 rack on deposit); baby +1 per feed; taming costs 1 food/attempt/day; feast costs 1 per diner; **larder cap `pop*5+16`** (deposit 4580; bypassed by harvest).
- **Material yields**: wood 3/4 (×2 sawmill); stone 2 (rock) / 3 per mine bench; fibre 2 per cut, +n wool at shearing; bonfire −3 wood once a year.
- **Reserve thresholds that gate behaviour** (pop = `gnomes.length`): food `pop*1.1` (urgent), `pop*2.5+4` (before building/animals), `pop*3.2+6` (routine), `pop*5+12` (winter prep), `pop*6+24` (stop leisure fishing), `pop*3+6` (taming), `pop*1.5` (casual pet), `5+pop*1.6` (breeding), `≥pop` (a "thin" feast otherwise); wood `10+pop*3` (+8 for a chopper), `pop*4+16` (winter); fibre `5+pop*1.5` (+4); stone `4+pop*1.5` (+6), mine when `<40`; `trees.length>26` before felling.
- **Crafts** emerge from `tally` counts (`craftOf`: ≥6 actions and ≥40% share) and bias odds (fish 0.55 vs 0.30; herd 40% vs 100%; grooming 0.06). Roles by building ownership: miner (`isMiner`), engineer (`engineerOf`), boatwright, chief (`isChief`), pilot (`village.pilot`).
- **Life cycle**: baby <2 d, child 2–24 d (plays only), adult 24–48, elder 48+ (lighter work, tells stories), leaves at 84 d; adult ≥36 d may tell stories; `leaveHome` at adulthood starts the partner clock (`soloT`).
- **Population**: cap 44; couples need a shared cabin, ≤2 kids at home, 3-day cooldown; one courtship every 3.5 s check.
- **Unlocks implied by buildings**: fire (first project, no rest before it), tent/cabin (beds, breeding), rack (×1.5 food, feast venue), windmill (milled food/flour ×2), sawmill (×2 wood), well (watering in dry spells), garden/hive (seasonal yields), fold (rabbit flock, wool), kennel/stable (dog/horse), workshop (flyer), boathouse/slipway (boats ≤2), lodge (porch stories/feast seating), crossing (bridges), mine (benches).
- **Calendar events**: midsummer dance (summer day 2, T.f 0.74–0.9), harvest feast (autumn day 2), flight feast (`village.flightFeast===T.day`), spring shearing (once per 12-day year), autumn honey, winter snowmen, summer paddling.

---

## 8. Persistence

None in this range (no `localStorage`, no JSON in 4735–5621; the whole file has zero `localStorage` uses). Note for a port: most runtime state here is **object references** (`job.b`, `job.c`, `partner`, `mate`, `restIn`, `ride`, `parents`, `h.kids`, `f.catcher`…), so a save system would need id-based serialisation and re-linking; the day-stamped once-per-day fields (`dined`, `*Day`, `*Log`) compare against `T.day` and would survive naturally.

---

## 9. Mobile / touch / performance tricks

- `spaceOut` (5599) is O(n²) over ≤44 gnomes per frame (≤946 pairs) with a cheap squared-distance early-out before any trig; the ellipse is computed in screen space so depth-squashed sprites don't overlap visually.
- `childPlay` samples **12 random trees** (4765) instead of scanning the whole forest; `teller()` and most `find`s are linear but on small arrays.
- `dance` recomputes the gap to the nearest dancer each frame (O(n) per dancer) — bounded by the pop cap.
- Particles are capped at 220 in `P()` (2386); hearts/notes use fractional `chance(dt*rate)` so emission is frame-rate independent.
- Feed noise is throttled by once-per-day log flags (see §5).
- `setTimeout(650)` in `stones` (5267) is the only wall-clock timer — it ignores sim speed/pause.
- `noteFx`/`heartFx` ambient effects use `chance(dt*k)`, so behaviour is dt-scaled; timers (`g.t`) count sim seconds.
- No touch/pointer code in range.

---

## 10. i18n (en/es)

None. `<html lang="en">` (line 2). All player-facing strings are inline English literals in `logEv`/`toast` calls (about 35 in the range, e.g. 4836, 5007–5008, 5015, 5042, 5234, 5298, 5306, 5383, 5404, 5410, 5419, 5426, 5431, 5433, 5439, 5447, 5450, 5503, 5509, 5544, 5577, 5579), several with typographic dashes/apostrophes and pluralisation by ternary (`n===1?' rabbit':' rabbits'`). A port needs a string table (`t(key, vars)`) with plural rules, and the gendered pronoun at 5577 (`her/his`) needs a locale-aware form.

---

## 11. Oddities, bugs, dead code, TODOs

1. **Distance-threshold convention is mixed.** Many arrival checks compare a *squared* distance against `k*S2` (4985 `1.2*S2`, 5081, 5113, 5128, 5162 `0.9*S2`, 5249 `0.8*S2`, 5260, 5394, 5397, 5455 `1.4*S2`, 5487 `1.4*S2`) while others use `k*k*S2` (5002, 5013, 5058, 5166, 5233, 5243, 5377, 5399…). The former gives a radius of √k tiles (≈1.1 for 1.2, 0.95 for 0.9, 0.89 for 0.8, 1.18 for 1.4) — close enough to work, but not what the literal suggests.
2. **`harvest` bypasses the larder** (5449): `store.food+=got` directly, so garden produce gets neither the rack ×1.5 nor the `pop*5+16` cap that `deposit` applies (4579–4580); `honey` on the other hand hauls and its log pre-computes `4*rackBonus()` (5447). Inconsistent economy path.
3. **Wall-clock `setTimeout`** in `stones` (5267): the splash fires 650 ms later regardless of sim speed/pause and uses captured coordinates.
4. **Energy units asymmetry** (5589–5590): regen uses real `dt` (0.16/s in a bed → full in ~6 s), drain uses `d` days (0.72/day). Probably intentional ("sleep restores fast") but reads like a units slip.
5. **`boat` re-rolls its threshold every frame** (5312 `g.work>rnd(2.5,4)`), making the "new spot" interval stochastic per frame rather than a fixed draw.
6. `act` has **no `default:`** — a typo'd state silently freezes a gnome in place forever (not BUSY, so `decide` would eventually rescue it; BUSY-listed typos would not).
7. `NO_SPACE` omits `dine`, `chat`, `story`, `listen`, `stones`, `hide`, `shear`, `draw`, `water`, `tend`, `harvest`, `patDog`, `groom`, `feedWait` — seated gnomes can be nudged out of their rings; an intentional "a little jostle" choice but worth knowing.
8. `goMount` fallback (5441) calls `dropPoint(g.job&&g.job.m)` **without `g`** while the success path passes `g` (5442) — mild inconsistency in which drop point is chosen.
9. `STATS` lazily creates `feasts, dances, snowmen, paddles, caught, grazes, shorn, feeds, honey, watered, left` with `||0` although the literal at 4658 pre-initialises others — harmless but uneven.
10. `decide` spills carried water on *every* re-think (4820, by design: "a bucket set down is a bucket spilt"), so any interruption between well and garden wastes the trip.
11. `storyFire(g)` (4736) takes `g` but only forwards it to `warmSpot(g)`; `teller()` is called up to three times per decide in the evening (4861–4862) — trivial cost.
12. `flee` (5506) has no log of its own; the log/toast live in `decide` 4836 (fine, but a gnome who fails to reach the edge is removed silently on `arrived`).
13. In `childPlay` the **listen branch (4745) precedes rain/cold shelter (4748–4749)**: children will sit in heavy rain to hear a story at the fire.
14. `goCatch` keeps counting its 30 s budget down even while re-pathing (5407) and every miss costs 1.5 s — intentional pacing, but a far rabbit can eat the whole budget.
15. `follow` for a baby never times out (4983: only children decrement `g.t`), so a baby trails its target until the target goes inside — OK because `decide` re-runs when `g.decide` expires (follow is not BUSY).
16. Version comments (v9.14–v9.24) document rationale inline; no `TODO`/`FIXME` markers in the range.
17. Dead code: none found; every helper in range is referenced (`rockTileOf` once, `goIn` twice, `atDoor` thrice).

---

## 12. Reusable engine/shell vs gnome-specific content

### Reusable as-is or with renaming (engine)
- The **decide → act → needs loop shape** and the `goX`/`X`/`idle` + `g.t` + `g.decide` + `pathT` give-up idiom (whole of `act`); `BUSY`/`NO_SPACE`/`INDOORS` as state-class sets.
- `needs()` as a **needs/physiology template** (per-day rates via `d=dt/DAYLEN`, target-and-ease for warmth; stage thresholds via `stageOf`).
- `spaceOut`/`nudge` — camera-aware personal-space separation that respects walkability; reusable for any isometric crowd (Parque D'Amour strollers, couples on benches).
- `petJob`-style **"claim" pattern** (`patBy`, `groomBy`, `catcher`, `waterer`, `taker`: one actor reserves a target; others test `taken()`).
- **Once-per-day stamps** (`dined`, `*Day`, `*Log`) for rate-limited events and feed lines.
- **Deterministic id-splits** (`g.id%2`, `g.id%3`, `(g.id+o.id)&1`) to spread a crowd across tasks without RNG.
- `swingStep` rhythm hook for any repeated-action animation (sweeping, painting, playing an accordion).
- The **ring dance algorithm** (5017–5037): evenly spaced circle motion with direction flips and obstacle-aware radius — directly reusable for a *bal musette* / carousel.
- `court`/`breeding` as a **two-actor rendezvous** template (both set a state, meet at a midpoint, lower id resolves) — the natural seed for a romance system.
- `chase` (tag) as a reusable **two-actor chase with role swap**.
- `follow`, `wander`, `skip`, `goWarm/warming`, `goShelter/shelter` (weather reactions), `goChat/chat`, `goStory/story/goListen/listen` (performer/audience).
- `rescue` chain (`swept → float → help → goRescue → comfort`) as a **distress/aid template**.
- `makeBaby`/`makeGnome` spawning with lineage fields.

### Gnome-specific content (replace)
- Resource taxonomy and all yields/thresholds (wood/stone/fibre/food, rack, windmill, sawmill, well, hive, garden, fold, mine, flyer, boats).
- Terrain coupling: `FLOW`, `wetD`, `ICE`, `BRIDGE`, `FISHN`, `QUARRYN`, `snowAt`, `bankDry`, `IDX.shores` (hat-boat, paddling, skipping stones, swept/waterfall).
- Animals (rabbit/fox/deer) and husbandry states (catch/pen/fold/herd/shear/feed/mount/groom).
- Festivals (midsummer/harvest/flight), the lodge/chief/porch hierarchy, crafts list, pilot/engineer/boatwright/miner roles.
- Hats (`hatHand`, `HAT_B`), snowmen, the "adventure" departure at age 84 and hunger flight.
- Every string.

---

## 13. Design questions for the Parque D'Amour port raised by this section

1. **Needs model**: which drives replace hunger/energy/warmth for park visitors and the couple — e.g. *affection, boredom, hunger (crêpes), fatigue, weather comfort*? What are their per-day rates and the thresholds that interrupt other behaviour (the 0.50 / 0.94 hunger tiers here)?
2. **Priority ladder**: what is the equivalent of supper → flee → hunger → bedtime → shelter → evening → work → leisure? Does the park have a *closing time* (the `evening()`/bedtime gate) and a *lunch hour* (the shared `goDine`)?
3. **Who is the "child"?** Children here are a pure-leisure class with a separate decision tree. In the park, which agents are ambient (pigeons, kids, tourists, a mime) versus goal-bearing (the two lovers)?
4. **The romance as a `court` rendezvous**: `breeding` picks one eligible couple every 3.5 s and `court` resolves within 16 s. For the romance, what are the *stages* (glance → chat → bench → stroll → kiss → proposal?), their eligibility conditions (mood, privacy, weather, time), and what the player's assist/sabotage does to the thresholds and timers?
5. **Sabotage affordances**: `yelp/dig/heave` show NPC *reactions* to creator tools. What does each park tool do to an agent (a sprinkler → `goShelter`; a rival → `follow`; a dog → `chaseR`; a busker → `goListen`)? Which reactions are BUSY (uninterruptible)?
6. **Performer/audience pattern**: `teller()`/`goListen` is one performer, many listeners, with a seating frame (`fx/fy` porch frame). Which park features are performers (accordionist, puppet show, fountain) and how are audiences seated?
7. **Ring dance reuse**: should the park have a group motion (a *bal*, a carousel, a conga) using the `dance` ring algorithm, and what triggers it (festival calendar vs player action)?
8. **Separation space**: `SEP_RX/RY = 10/8 px` suits 14×8 px gnomes; what sprite sizes do park characters have, and should couples be a `NO_SPACE` pair (holding hands) that moves as one?
9. **Avatar mode**: here the avatar reuses `act` and only replaces `decide`. In Parque D'Amour, does the player's avatar also share the NPC state machine (so sabotage = steering NPCs into existing states), or does it need its own verbs? Which NPC-only outcomes must the avatar be exempt from (cf. `!g.player` at flee/animalJob/setOff)?
10. **Economy**: is there a store at all? If the park has money/flowers/food, which thresholds gate behaviour (the `pop*k+c` family here) and what is the larder cap equivalent?
11. **Calendar**: a 210 s day and 12-day year drive festivals, shearing, honey. Does the park run on a day cycle (morning joggers, lunch crowd, evening lovers) and a season cycle (spring blossom, rain, autumn leaves), and what per-day one-shots (`*Day` stamps) exist?
12. **Weather reactions**: rain>0.62 → shelter, cold → huddle. Which park states react to weather (umbrellas, café awnings) and does weather help or hinder romance?
13. **Claims**: single-owner reservations (`patBy`, `catcher`) prevent two gnomes from doing one job. Which park targets need claims (a bench seat, a rowing boat, the lover's attention)?
14. **Failure/distress chain**: `swept → help → rescue → comfort` gives drama and a hero moment. What is the park's equivalent (a lost child, a fall in the pond, a thief) and who responds?
15. **Logging & toasts**: the feed is rate-limited to one line per subject per day. What feed does the romance need (a diary? both lovers' inner voices?), and is it bilingual (en/fr/es) from day one — meaning a string table replaces inline literals?
16. **Departure/ending**: gnomes leave at age 84 or when starving. What ends a park day/run — a proposal, a break-up, closing time — and how is it logged/scored (the `STATS` counters)?
17. **Timing budgets**: path give-ups of 18–60 s and action timers of 1–80 s are tuned to a 210 s day. What day length and pacing feel right for watching a romance unfold on a phone screen?
