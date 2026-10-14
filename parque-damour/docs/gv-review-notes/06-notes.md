# Gnome Village review — section 06: lines 1752–2477
## "Wildlife, farmed animals, the water's teeth (v9.22)"

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Range read in full: 1752–2477 (726 lines). Peeks outside the range were made only with `grep -n` to resolve symbols and callers; those line numbers are marked "(outside)".

---

## 1. Purpose of the section

This block is the **animal simulation plus the "water's teeth" flood sub-game**, followed by a tail of **core economy/build tables** that happen to sit here:

1. **Wild critters** (1752–1774, 2251–2366): seeding and per-frame AI for rabbits (hop, garden raiding at night), deer (graze, flee, drink at dawn/dusk) and foxes (lie up by day, prowl at night, raid the fold, prank-carry a rabbit to water), plus decorative birds.
2. **Farmed animals (v9.17–v9.20)** (1775–1958): fold rabbits (penned, grazed by a shepherd, bred, wool), a tamed fox that becomes the village dog (herds strays, sees off wild foxes, follows its master), a tamed deer that becomes the horse (ridden, hitched to a cart, stabled, foals).
3. **Hand-feeding / taming** (1812–1832): any food-left-down logic shared by fox and deer.
4. **Breeding / population caps (v9.19)** (2160–2196): litters, fawns, cubs, foals; wild rabbit top-up.
5. **The water's teeth (v9.22)** (1977–2126): water wrecks light builds; pooling water next to a cabin starts a "flood fight" where every nearby adult grabs a spade to raise the yard and cut a drainage channel.
6. **Flood bank planning (v9.19)** (2127–2158): `bankPlan` – the household's lasting fix after a storm (executed by `homeWorks` elsewhere).
7. **Particle system** (2367–2398): spawners and the per-frame integrator.
8. **Economy tables** (2399–2477): `store`, the build table `BT` (costs/work/footprints/labels for every building), bridge `SPAN` rules, `waterKind`, the `village` state object, and small build-query helpers.

Everything in the range runs inside the single sim tick: `updateCritters(dt)` and `floodWatch(dt)` are called from the main loop at line 12036 (outside), `updateParts(dt)` at 12037 (outside). `seedCritters()` is called on world creation at 12112 (outside).

---

## 2. Global / module state defined or mutated here

### Defined in this range
| Name | Line | Type / shape | Notes |
|---|---|---|---|
| `floods` | 1986 | `Array<{type:'flood',home,x,y,pieces:[{ti,target,raise?/cut?,at:[x,y],by?,done}],done,t0,n}>` | active flood fights; cleared at reset (12105 outside); exposed on debug API (12237 outside) |
| `CHAN` | 1986 | `Uint8Array(NC)` | 1 where a flood-fight channel was cut; permanently excluded from `poolNear` |
| `WRECKABLE` | 1987 | `{tent,fence,rack,pile}` | build types water can destroy |
| `NO_FIGHT` | 2053 | map of gnome `st` strings | states that can't be conscripted into a flood fight |
| `floodT` | 2113 | `let number` | 2-second cadence timer for `floodWatch` |
| `NB8` | 2127 | `[[dx,dy]×8]` | 8-neighbourhood; used by `floodPlan` (2030+, earlier in text than its `const` — fine at runtime, TDZ hazard only if ever called during initial script evaluation) |
| `breedT` | 2159 | `let number` | 1-second cadence for the breeding pass |
| `FIRES` | 2284 | `Set<tileIndex>` | fire tiles, kept by `planEmergent` (3425 outside); read by `critOK` |
| `store` | 2399 | `{wood:0,stone:0,fibre:0,food:3}` | the village stockpile; start with 3 food |
| `BT` | 2401 | `{type:{w,s,f,work,label,fw?,fh?,beds?,roof?}}` | build table (see §5.14) |
| `SPAN` | 2446 | `{logbridge:[1,3],plankbridge:[2,6],ropebridge:[4,10],stonebridge:[5,14]}` | min/max span in tiles |
| `SPAN_MAX` | 2447 | `14` | |
| `village` | 2468 | `{breed:6,project:null,want:null,queue:[],wait:0,sawmill:false,short:{wood,stone,fibre},felled:0,damWantT:0,power:false,powerDay:-1,lateDay:-1}` | the village brain; many more fields are added ad hoc elsewhere (`rideLog`, `prankLog`, `fawnYear`, `cubYear`, `foalYear`, `project2`, `scoutUntil`, `flyer`…) |
| `CROSSING` | 2472 | `{logbridge,plankbridge,stonebridge,ropebridge}` | |

### Mutated here (declared elsewhere)
| Name | Declared (outside) | Mutations in range |
|---|---|---|
| `critters` | 1690 | emptied/filled by `seedCritters` (1754); pushed by `spawnRabbitNear` 2161, fold kits 2172, fawns 2184, cubs 2187, foals 2191, top-up 2196; every critter object mutated per frame |
| `birds` | 1690 | emptied 1754; pushed by `landBird` 2289; spliced in `updateCritters` 2369–2381 |
| `parts` | 1690 | pushed by `P` 2387 (cap 220); spliced in `updateParts` 2400 |
| `STATS` | 4658 | counters added: `rides, cartTrips, foxTamed, deerTamed, sawOff, strayed, wrecks, fights, fightsDone, floods, kits, litters, fawns, cubs, foals, pranks, foxTook` |
| `WD, FLOW, U` | 614, 616, 1080 | zeroed on a raised tile in `fightPiece` 2092 (water removed, not conserved) |
| `E` (via `levelTile`) | 612 | ground raised/cut by `fightPiece` 2093 |
| `PF_SWIM` | 1451 | temporarily set to 9.0 inside `dogGo` 1852 then restored |
| `store.wood / store.food` | 2399 | docked by `waterWreck` 2000–2001 |
| `logActor` | 10708 | set to each critter during its update (2301) so `logEv` attributes the line; reset 2366 |
| Build objects (`fold`, `stable`, `cart`, `kennel`, cabins) | — | fields: `f.strayed, f.sawOffDay, f.raidDay, f.kitT, f.grazedDay(read)`, `ct.hitched`, `h.fightAt, fightDay, fightN, flooded, floodTiles, fightPool, bankTried, fightDone`, `home.fenceTried, fenceWreck, fenceWet` |
| Gnome objects | — | `g.ride, g.cart, g.job={k:'flood',f,p}, g.st, g.hatHand, g.cheer, g.partner, g.carry, g.cAmt, g.t, g.work, g.face, g.arrived, g.path, g.decide` |

### Critter object shapes (as created in this range)
- **rabbit** (1757, 2161, 2172, 2196): `{k:'rabbit',x,y,st,t,tx,ty,fx,fy,p,z,face,sd,tone(0|1),scare}` + optional `fold, tame, wool, kit, young, held, inHutch, raid, turnT, noTurnT, wasFold, sweptT`
- **deer** (1764, 2184, 2191): `{k:'deer',x,y,st,t,tx,ty,face,sd,antl,drank,scare,head,fed,fedDay,tame}` + optional `stable, rider, cart, groomBy, food, feeder, tamer, fawn, foal, young`
- **fox** (1771, 2187): `{k:'fox',x,y,st,t,tx,ty,lx,ly(lie-up),face,sd,scare,head,fed,fedDay,tame,ph}` + optional `fold, master, carry, prey, prank, raidF, raidDay/raidNight, prankNight, cub, young, path, pi, pathT, pathTo, lost, waitT, lieA, ang, turned, blockT, patBy, moving`
- **bird** (2289): `{tree,t,fly:null|{from,to,p,dur,dir},col:'robin'|'tit'|'black',bob}`
- **particle** (2387–2395): `{k,x,y,vx,vy,vz,l(life),m(max life),z,t?,ph?}`

---

## 3. Every function in the range

| Line | Function | Signature | What it does | Called from |
|---|---|---|---|---|
| 1753 | `seedCritters` | `()` | Clears critters/birds; places 7 wild rabbits on dry flat meadow, 2 deer and 2 foxes on meadow/grass with ≥2 trees nearby (500 tries each). First deer gets antlers. | 12112 (outside, new world) |
| 1784 | `wildRabbits` | `()→rabbit[]` | Rabbits not in a fold and not held. | 2177–2196 in range; 4716, 4798 (outside, planAnimals/animalJob); debug API 12234 |
| 1785 | `theFold` | `()→build|null` | First finished `fold`. | 1826, 1879, 2269; 4718, 4788 outside |
| 1786 | `flockOf` | `(f)→rabbit[]` | Rabbits whose `fold===f`. | many; 5420–5441 outside (shepherd job) |
| 1787 | `theDog` | `()→fox|null` | The tamed fox. | 1942, 2255, 2269; 4720, 4804, 4949, 5430 outside |
| 1788 | `theHorse` | `()→deer|null` | A tame grown deer (not a foal). | 2190; 4722, 4806 outside |
| 1789 | `freeHorse` | `()→deer|null` | Tame grown deer not ridden/carted, with a finished stable. | 4210 outside (fetch job) |
| 1790 | `foldCap` | `(f)→8` | Constant 8; param unused. | 2171 |
| 1791 | `inFold` | `(f,x,y)→bool` | Inside the pen rectangle (x0-0.35 … x0+fw-0.65). | 1806; 9706 outside (draw order) |
| 1793 | `penSpot` | `(f)→[x,y]` | Random pen spot not within 0.6 of the hutch tile (12 tries, else fold centre). | 1801, 1957, 2172 |
| 1795 | `mount` | `(g,d)` | Gnome mounts deer; deer snaps to gnome's position; hitches the stable's cart if it is done and free; STATS.rides/cartTrips; one log line a day. | 5454 outside (goFetch job); debug API |
| 1800 | `dismount` | `(g)` | Unmounts; deer takes the cart back (`d.cart`, `cart.hitched=d`). | 1808(not), 2057; 4660, 4812 outside |
| 1803 | `penRabbit` | `(c,f)` | Puts a caught rabbit into the pen: tame, fold, idle. | 5425, 5437 outside |
| 1805 | `grazeSpot` | `(f,g)→{x,y}` | Grass tile 1.5–8 tiles from the fold gate, ≥3 tiles from the fire, not in the fold, with random jitter; fallback 2 tiles past the gate. `g` unused. | 5429, 5434 outside (herd job) |
| 1810 | `flockCentre` | `(f)→{x,y}|null` | Mean position of the flock. | 1879 |
| 1812 | `toFood` | `(c,dt,sp)→bool` | Hand-feeding: walk to `c.food`, eat 4 s, count a fed day (×2 while `scouting()`), tame at ≥3; fox→dog (`fold`, `master`), deer→horse (`stable`). Returns false when no food. | 2304 (fox, 1.3·S), 2305 (deer, 0.9·S) |
| 1839 | `dogMaster` | `(c)→gnome|null` | Resolves/replaces the dog's person: current master if valid adult; else the shepherd; else the old master's mate/parent/child; else the eldest in village 0. | 1897 |
| 1846 | `dogOK` | `(x,y)→bool` | Walkability for the dog: bridges OK; wet<0.3 or ice; E>SEA+0.3; slope<1.4; no dam/occupied. | 1865 (walkTo closure) |
| 1849 | `dogGo` | `(c,tx,ty,sp,dt)→'there'|'moving'|'water'` | Path-following with `findPath` (swim cost 9.0, repath each 1.6 s or if target moved >1.2); returns 'water' before stepping into a swim. | 1917, 1933 |
| 1863 | `dogStep` | `(c,dt)` | Dog AI: pat-stand; herding (turn strays, circle flock); bark off wild fox at night; heel/lie/wait-at-door/follow master; else home to kennel/gate/door/green. | 2304 |
| 1936 | `horseStep` | `(c,dt)` | Tame deer AI when unridden: haul cart back; stand for grooming; into stable by night/rain/cold (2 stalls); graze-wander near stable. | 2305 |
| 1954 | `inAnyFp` | `(x,y)→bool` | `OCC` at the rounded tile. | 1940,1944,1968,2165 |
| 1956 | `tameRabbit` | `(c,dt)` | Fold rabbit AI: grows wool; hop animation; in pen (hutch at night/cold) or on the graze (stay near shepherd, be turned, stray to the wild without a dog). | 2303 |
| 1988 | `wreckTiles` | `(b)→tile[]` | Footprint tiles: `b.fp`, fence plan segments, or the single tile. | 1996 |
| 1994 | `waterWreck` | `()` | Destroys finished tents/fences/racks/piles standing in deep or fast water; docks stock; `collapseBuild`; marks fence as recently wrecked. | 2101 |
| 2009 | `poolNear` | `(h)→tile[]` | Standing non-river water ≥0.14 deep within the 2-tile ring of a cabin, at/above platform−0.25. | 2106; debug API |
| 2015 | `fightOf` | `(h)→flood|null` | Active fight for a home. | 2102 |
| 2019 | `floodPlan` | `(h,pool)→piece[]` | Builds the work list: raise ring-1 yard tiles on the water's side; then a downhill channel of up to 7 cuts from the pool's lowest edge tile. | 2065 |
| 2054 | `canFight` | `(g)→bool` | Adult/elder, not the player avatar, not in a NO_FIGHT state, not in boat/flyer, not gone. | 2062, 2067 |
| 2055 | `nextPiece` | `(f,g)→piece|null` | First undone piece not claimed by another live gnome. | 2057, 2096 |
| 2056 | `joinFight` | `(g,f)→bool` | Drops everything (leave building, marks, bed, mount, partner, load) and sends g to a piece as `goDrain`. | 2062, 2067 |
| 2062 | `fightJoin` | `(g)→bool` | Idle-decision hook: join any live fight within 12 tiles. | 4815 outside (decide) |
| 2063 | `startFight` | `(h,pool)→flood|null` | Creates the fight, conscripts all nearby adults, updates home flood bookkeeping, logs. | 2109; debug API |
| 2089 | `fightPiece` | `(f,p)` | Completes a piece: raise → zero water/flow; cut → `CHAN=1`; `levelTile`; closes fight when all done. | 2122 |
| 2095 | `fightNext` | `(g)` | Next piece or back to idle. | 2119, 2120, 2122 |
| 2099 | `fightAct` | `(g,dt)→bool` | State handler for `goDrain`/`drain` (3.2 s dig with spade swing, puffs, taps). | 4973 outside (gnome act switch) |
| 2101 | `floodFight` | `()` | Every 2 s: wreck pass, prune finished/orphan fights, start fights at cabins whose yards pool (≤3/day, 0.12-day breather, skip the same already-fought pool). | 2116; debug API |
| 2114 | `floodWatch` | `(dt)` | 2-s cadence driver: `floodFight()` always; during spate/heavy rain marks cabins whose yard ring has water >0.16 as `flooded` for the v9.19 bank. | 12036 outside (main loop) |
| 2128 | `bankPlan` | `(home)→{tiles,targets,wx,wy,drain,camber}|null` | v9.19 flood bank plan from `home.floodTiles`: ring-2 tiles on the water's side (or the ring-1 tile inside), targets ≤ z0+0.4 / +1.0; camber ring-1 to z0+0.08; a drain on the lee side. | 4395 outside (homeWorks) |
| 2160 | `spawnSpotNear` | `(x,y)→[x,y]|null` | A walkable unoccupied tile 0.6–1.6 tiles away (20 tries). | 2161, 2184, 2187 |
| 2161 | `spawnRabbitNear` | `(x,y)→rabbit|null` | Spawns a wild rabbit near a spot. | 2178 |
| 2163 | `updateFolds` | `(dt)` | Fold litters; growing-up of young; wild litters/fawns/cubs/foals (1-s cadence); wild rabbit top-up. | 2300 |
| 2202 | `prankWater` | `(c)→{wx,wy,sx,sy,sea}|null` | Nearest water tile within 14 tiles with a dry 4-neighbour to stand on (full-grid scan). | 2211 |
| 2209 | `foxGrab` | `(c,r,f)` | Fox picks up rabbit r (from fold f or wild); heads for prank water (or a random spot) with a 28-s timer. | 2271, 2277 |
| 2214 | `foxDrop` | `(c,where)` | Drops the rabbit into water (`swept`) or grass; log once a day (always for a fold rabbit); fox flees to lie-up. | 2227–2231 |
| 2223 | `foxPrankStep` | `(c,dt,walkTo)` | Carrying: walk to target; drop at water, on timeout, or after 5 tiles with no water; sidestep-teleport when hemmed in >0.4 s. | 2255 |
| 2236 | `rabbitSwept` | `(c,dt)` | Carried by current to the lowest wet neighbour at (1+flow·0.5)·S; ashore after ≤7 s / shallow / sea. | 2302 |
| 2251 | `wildFoxStep` | `(c,dt)` | Wild fox AI: flee gnomes, lie up by day, prowl by night (raid the fold 30% of eligible nights, chase a wild rabbit, wander). | 2304 |
| 2278 | `critOK` | `(x,y)→bool` | Walkability for wild animals: wet<0.3, E>SEA+0.5, slope<1.2, no bridge/dam/occupied/fire. | throughout; 4757, 5025 outside |
| 2285 | `nearestGnomeD2` | `(x,y)→[d2,g]` | Nearest outdoor gnome, squared distance. | 2256, 2314, 2340 |
| 2286 | `landBird` | `(tree,dur)→bird|null` | Perches a decorative bird (≤6) using the **visual** RNG so sound on/off doesn't alter the sim. | 6303 outside (birdsong) |
| 2292 | `updateCritters` | `(dt)` | Master per-frame animal loop (see §5) plus the bird flight loop. | 12036 outside |
| 2387 | `P` | `(o)` | Push a particle if fewer than 220. | all Fx below |
| 2388 | `puff` | `(x,y,n=2)` | dust | 2121 + many outside |
| 2389 | `chipFx` | `(x,y,n=3)` | wood chips | outside |
| 2390 | `heartFx` | `(x,y)` | 4 hearts (courtship) | 5263, 5388, 5476… outside |
| 2391 | `sparkFx` | `(x,y,n=5)` | sparks | outside |
| 2392 | `zzzFx` | `(x,y,z)` | sleep Z | 5201 outside |
| 2393 | `splashFx` | `(x,y,n=5)` | drops | 2218, 2238, 2244 + outside |
| 2394 | `noteFx` | `(x,y,t)` | a text glyph (e.g. '~' while eating) | 1819 + outside |
| 2395 | `fireflyFx` | `(x,y)` | firefly | 8827 outside |
| 2396 | `rippleFx` | `(x,y)` | ring on water | outside |
| 2397 | `updateParts` | `(dt)` | Integrates particles; kind-specific physics (zzz/heart/note drift, flies jitter, smoke rises & leans with wind, `logf` rides the current, else gravity −2.6). | 12037 outside |
| 2448 | `spanFits` | `(t,L)→bool` | Span within `SPAN[t]`. **Never called anywhere — dead code.** | — |
| 2451 | `waterKind` | `(L)→type|null` | Bridge type for an L-tile water gap: log ≤3, plank ≤6, stone ≤14 if stone affordable, else null. | 3280, 5900, 5904 outside |
| 2469 | `countB` | `(t,d)→n` | Count builds of type (optionally done). | many outside |
| 2470 | `hasB` | `(t)→bool` | Any finished build of type. | many outside |
| 2471 | `queued` | `(t)→bool` | Type in queue, project or project2. | many outside |
| 2473 | `isCrossing` | `(b)→bool` | Any bridge type. | 2803, 3147… outside |
| 2474 | `villageSites` | `()→build[]` | Unfinished project(s) (project, project2). | outside |
| 2475 | `bedCount` | `()→n` | Beds in finished tents + cabins. | 3707 outside |
| 2476 | `isHome` | `(b)→bool` | tent or cabin. | many outside |

---

## 4. Units and clocks used throughout (resolved outside the range)
- `S=2` fine tiles per "v7 tile" (567); `N=72`, `NC=5184` (568); `S2=4`. Distances written as `k*S` mean *k old tiles*; squared tests use `k*k*S2`.
- `DAYLEN=210` seconds per day, `SEASON_DAYS=3` (573) → a year is 12 days (`yr=Math.floor((T.day-1)/12)` 2181). `T.season` 0 spring, 1 summer, 2 autumn, 3 winter.
- `T.light` 0–1 daylight; `T.f` fraction of day; `T.abs` absolute days; `T.cold` 0–1 (814).
- `W.rain`, `W.spate`, `W.wind` weather (845).
- `SEA=2.0` sea level; `SEAS=2.5` sea surface (570–571). `FLOW_STREAM=0.5`, `FLOW_RIVER=1.3` (1349–1350).
- `rng/rnd/rint/chance` = seeded **sim** RNG; `vrng/vrnd/vchance/vpick` = **visual** RNG (589–598). Birds and particles use the visual stream; everything else the sim stream.

---

## 5. Concrete rules and tuning numbers

### 5.1 Seeding (1753–1774)
- 7 wild rabbits: tile is MEA (meadow), `wetD≤0.05`, slope ≤0.6, margins 2·S…N−3·S; jitter ±0.3; `tone` 50/50 colour variant.
- 2 deer: MEA or GRS, wet ≤0.05, slope ≤0.7, margins 3·S…N−4·S, ≥2 trees within 3 tiles (Chebyshev). First deer `antl:true`.
- 2 foxes: same but ≥2 trees within 2.5 tiles; `lx,ly` = lie-up spot; `ph` random phase for trot animation.

### 5.2 Wild rabbit (2306–2338)
- Hop: duration 0.32 s (`p+=dt/0.32`), arc height 0.30; idle 0.8–4.5 s, or 0.05–0.2 s when scared.
- Scared by a gnome within 2.4 tiles or a wild fox within 2.4 tiles → `scare=2.2` s, flee 1.2 tiles away ±0.3.
- Night (`T.light<0.45`): 35 % per decision to head for a garden within 7 tiles that is done, `crop≥0.15`, and whose home is **not** `gardenFenced`; steps of ≤1.2 tiles; within 0.6 tile → `nibble` 5–9 s, `crop -= dt·0.006` (≈0.03–0.05 per bout); one log line per garden per day. Stops when scared or at daylight (`T.light≥0.45`).
- Will not hop onto sand (`MAT===SND`). 30 % chance to forget a garden target if the hop is blocked.

### 5.3 Wild deer (2338–2364)
- Scared by a gnome within 4.2 tiles (unless food is down) → `scare=2.8`, flee 5 tiles at 2.6·S.
- Graze: head rises at 2/s; after `t`, at dawn/dusk (`T.f` 0.20–0.33 or 0.67–0.80) and not yet drunk today → walk (0.9·S) to the nearest shore within 11 tiles, drink 9 s, `drank=T.day`.
- Otherwise wander 1.5–3.2 tiles at 0.55·S, never within 6 tiles of the village centre (`>36·S2`).

### 5.4 Wild fox (2251–2277)
- Night = `T.light<0.45`. Flees a gnome within 3.2 tiles (5 tiles away at 2.6·S) unless food is down.
- Day: return to lie-up at 1.1·S; asleep, flips facing 30 % every 5–12 s.
- Night prowl, each 1.5–4 s decision: (a) if not a cub, fold has rabbits, no dog, fold not raided today and this fox hasn't rolled tonight → 30 % to **raid** (walk to gate at 1.5·S, grab one random rabbit, `f.raidDay=T.day`, STATS.foxTook); (b) if not a cub and no prank in the last 2 nights, a wild rabbit within 3 tiles → **chaseR** for 3–5 s at 2.4·S, catch when within 0.55 tile with probability `dt·0.6`/s; (c) else wander 1–2.5 tiles at 0.9·S for ≤4 s.

### 5.5 Prank (no death in this game) (2197–2250)
- `prankWater`: nearest water (sea tile or `WD>0.25`, no ice) within 14 tiles with a dry orthogonal neighbour.
- Carrying: walks at 2.0·S; 28-s timeout; drops in grass after 5 tiles if there was no water target; sidestep-teleport of 1.2 tiles when stuck >0.4 s.
- Drop in water: rabbit `swept`, 4 splash drops, snicker sfx, STATS.pranks; log once a day (always for a fold rabbit). Fox then flees to lie-up with `scare=4`.
- `rabbitSwept`: follows lowest wet neighbour (`wetD≥0.25`, no bridge/ice) at `(1+max(flow)·0.5)·S`; ashore when stuck, sea, shallow (<0.2) or after 7 s, to the nearest dry tile within 2 tiles.

### 5.6 Hand-feeding and taming (1812–1832)
- Food object: `{x,y,kind,by}` placed by a gnome (5448 outside). Animal walks at `sp` (fox 1.3·S, deer 0.9·S), eats 4 s with '~' notes (`chance(dt·0.8)`).
- One fed-day per calendar day; **2 per day while `scouting()`** (glider flight, v9.21). Tame at `fed≥3` → so 3 days normally, 2 with a scouting bonus.
- Fox → `tame`, `fold=theFold()`, `st='dogRest'`, `master=feeder`, STATS.foxTamed, toast. Deer → `stable=first done stable`, STATS.deerTamed, toast.

### 5.7 The dog (1839–1935)
- Walkability `dogOK`: may use bridges and ice; slope <1.4; E>SEA+0.3.
- Herding (fold `out` with a live `herd`): stray = rabbit with `noTurnT≤0`, 3–7 tiles from the shepherd; run at 2.4·S; within 1 tile → rabbit `turnT=2`, `noTurnT=4`, STATS `c.turned`, 50 % yip. Blocked >1.2 s → leave that rabbit 6 s. No stray → circle the flock centre at radius 2.2 tiles, 0.7 rad/s, 1.6·S.
- Night guard: `T.light<0.45`, dog within 9 tiles of fold, wild fox within 6 tiles (Chebyshev) of fold → `bark`, fox `scare=4`, fox flees twice its offset; one log/STATS.sawOff per fold per day. **No distance check between dog and fox** – it works from across the yard.
- Bedtime = no master, `T.light<0.12`, or master in sleep/goBed/goSleep. Pat: stays still while a gnome is in `goPatDog`/`patDog`.
- With master: indoors → `waitDoor` at the door tile (within 0.9). Outdoors within 1.4: if master moving → heel at `gSpeed(m)·1.12`, 0.8 behind along their velocity; still → lie 0.85 to one side (random angle). Further: follow by path at 2.1·S (2.8·S when >5 tiles behind). Master swimming/boating → `waitBank`; after 30 s → `lost`, goes home; un-lost when master is within 5 tiles outdoors or at bedtime.
- Home: kennel door spot 0.62 in front on the fold-facing side (approach point 1.25), else 1 tile outside the fold gate, else master's door, else green (+0.9,+1.3). Trot 1.7·S; final 1.4 tiles into the kennel tile at 1.4·S with no ground check.

### 5.8 The horse and cart (1795–1802, 1936–1953)
- Mount: deer snaps to rider position; cart hitched only if the stable's cart is done and unhitched. Log once/day: "three loads a trip, half as fast again" (ride) / "six loads a trip" (cart) — the actual load/speed multipliers live elsewhere (gSpeed/fetch), not here.
- Unridden: hauls cart back at 1.1·S (no ground check); stands for grooming; into stable when `T.light<0.4` or `W.rain>0.5` or `T.cold>0.7` at 1.0·S; stall offsets (−0.25,−0.1) and (+0.55,+0.15) by index among the stable's tame deer; grazes 3–8 s, wanders 1.5–3.5 tiles around the stable at 0.55·S.

### 5.9 Fold rabbits (1956–1976)
- Wool grows to 1 over 10 days (`dt/(DAYLEN·10)`).
- In pen: hutch at `T.light<0.35` or `T.cold>0.6` (teleported to hutch ±0.25 every 2–5 s); else hops toward a `penSpot` (≤1 tile per hop), idle 0.8–4 s.
- On the graze: without a dog, >4.2 tiles from the shepherd → lost to the wild if >6 tiles or 20 % per decision (STATS.strayed, one log per fold). Turned back when `turnT>0` or >2.6 tiles (always with dog, 50 % without), hops of ≤1.1 tiles. Else wanders 0.5–1.3 tiles staying within 3.2 tiles of the shepherd.

### 5.10 Breeding and caps (2163–2196)
- Fold litter: ≥2 and <8 rabbits, spring/summer, grazed today or yesterday, `kitT` accumulates to 1.5 days (**resets to 0 if a condition lapses**) → kit (`young:1` = grows up in 1 day).
- `young` decrements 1/DAYLEN per second (1-s cadence). Grown foal → "a second horse" log.
- Wild rabbits: ≥2 adults, <10 total, `chance(1/(DAYLEN·0.9))` per second in growing seasons → litter near a parent.
- Fawn: spring only, one per 12-day year, wild deer ≥1, total deer <5, `chance(1/(DAYLEN·1.2))`/s; `young:3`.
- Cub: spring, one per year, wild foxes 1–3; `young:3`; cubs don't raid.
- Foal: spring, one per year, a stabled horse, tame deer <2; born tame (`fed:3`), `foal:1,young:3`; toast.
- Top-up: while wild rabbits <5, `chance(dt/(DAYLEN·0.7))` per frame → spawn on meadow ≥8 tiles from village centre (30 tries).

### 5.11 Water wrecks (1987–2008)
- Applies to finished, unhidden tent/fence/rack/pile. A tile is a hit if `WD≥0.35`, or `WD≥0.14 && FLOW≥0.8·FLOW_RIVER (=1.04)`; never where `E≤SEA`.
- Pile loses `min(10, floor(wood·0.2))`; rack loses `min(8, floor(food·0.15))`. STATS.wrecks. `collapseBuild(b,why,{toast:'the water took it',noUndo:true})`.
- Fence: `home.fenceTried=true, fenceWreck=T.abs, fenceWet=tiles` → not rebuilt until the line has stood dry 1.5 days (enforced in homeWorks, 4429–4433 outside).

### 5.12 Flood fight (2009–2126)
- `poolNear`: ring of 2 tiles round the footprint; skip sea, `E≤SEA+0.2`, bridge, dam, mine, channel; pooled if `WD≥0.14`, `FLOW<FLOW_RIVER`, surface `E+WD ≥ z0−0.25`.
- Cadence: `floodT=2` s. Per home: ≤3 fights/day; 0.12-day (~25 s) breather; skip if the pool is a subset of the already-fought pool.
- `floodPlan` raise pieces: ring-1 tiles on the water's side (`dot≥0.2` with the pool's mean direction), usable (`okT`: 2-tile margin, not footprint/OCC/PAVE/bridge/dam/steps/sea, `E>SEA+0.3`, not mine, not the door), that are wet ≥0.06 or lower than `z0+0.06`; target `min(E+0.6, z0+0.14)` if ≥ +0.03 higher.
- Channel: start at the lowest open neighbour of the pool (≥2 from walls), `tgt = maxSurface−0.22`; each cut `−0.08` lower; ≤7 cuts in ≤11 steps; never below a river surface+0.06 or `SEAS+0.06`; next tile must be within 0.9 of target; stop when the next tile already lies below `tgt−0.06`.
- Conscription: adults/elders within 12 tiles (`12·12·S2`) that pass `canFight` (not player, not in `NO_FIGHT`, not in boat/flyer). `joinFight` drops bed, marks, mount, partner, load (water discarded, other loads deposited).
- Work: `goDrain` → arrive when `g.arrived` or `pathT>40` or (`pathT>10` and within 1.6 tiles); `drain` 3.2 s (×1.3 elder) with `SWING_P.dig` swings, puffs, 35 % tap sfx; `tally(g,'build')`.
- `fightPiece`: raise → `WD=FLOW=U=0` (water deleted); cut → `CHAN[i]=1`; `levelTile(i,target,false)`. Fight done when all pieces done → `h.fightDone`, STATS.fightsDone, log "a flood bank will follow".
- `startFight` also sets `h.flooded=T.day`, `h.floodTiles=pool`, resets `h.bankTried=false` if there is no bank — so a fight also triggers the v9.19 bank.
- `floodWatch` storm pass only when `W.spate≥0.25` or `W.rain≥0.55`: cabin without a done bank and not yet flooded today, yard ring tile `WD>0.16 && E>SEA` → `flooded`, `floodTiles`, STATS.floods, log.

### 5.13 Flood bank plan (v9.19) (2128–2158)
- Needs `home.z0` and `home.floodTiles`. Usable tile: 2-tile map margin, not footprint/OCC/PAVE/bridge/dam/steps/visibly wet/`E≤SEA+0.2`, not the door or yard tile, `z0−0.7 ≤ E ≤ z0+0.35`.
- Sector: directions of flooded tiles, `dot>0.45`. Ring-2 tiles in the sector; if unusable, the ring-1 tile one step in. Need ≥2 tiles.
- Targets `min(E+1.0, z0+0.4)`; camber: ring-1 tiles in sector with `z0−0.5<E<z0+0.05` → `z0+0.08`.
- Drain: lee-side ring-1 tile (`dot ≤ −0.3`) with the greatest drop to its ring-2+ neighbour; only if the best drop <0.08 → cut to `min(E, lo−0.08)`.

### 5.14 Particles (2387–2398)
- Cap 220. Life `l`, max `m`, height `z`. Velocities in old tiles/s (`*S` when applied).
- Kinds and physics: `zzz/heart/note` → `vz*=0.99`; `fly` → random jitter, `z∈[0.1,1.2]`; `smoke` → rises to 1.1, leans with `W.wind·0.14`, `vy` halves per second; `ring/mist/splash/bee` → no physics; `logf` → `vx,vy = FDX,FDY·FLOW·0.55`, life cut to ≤1.2 when grounded or in the sea; everything else gravity `vz−=2.6·dt`.

### 5.15 Economy tables (2399–2477)
- `store` starts `{wood:0,stone:0,fibre:0,food:3}`.
- `BT` (w=wood, s=stone, f=fibre, work units; fw×fh footprint in fine tiles; beds):
  fire 3/2/0/13 (1×1) · pile 2/0/0/9 · tent 5/0/3/20, 2 beds (1×2, roof) · rack 4/0/2/15 · cabin 18/10/0/54, 4 beds (2×2, roof) · logbridge 3/0/0/12 per tile · plankbridge 4/2/2/14 per tile · trap 1/0/3/10 · steps 0/2/0/9 · dam 5/2/0/20 per tile · wheel 8/2/0/30 · lantern 1/0/1/4 · pave 0/1/0/5 per tile · hearth 0/4/0/34 · steppath 0/2/0/8 · fence 5/0/0/12 · garden 0/0/0/20 (2×2) · ropebridge 1/2/1/9 per tile · windmill 8/2/2/36 (2×2) · stonebridge 1/4/0/26 per tile · hive 2/0/1/10 · well 4/6/1/30 · fold 12/0/0/34 (3×3) · kennel 4/0/0/12 · stable 10/2/2/36 (2×2) · cart 6/0/1/16 · bank 0/0/0/12 · lodge 28/8/0/70 (3×2) · fisher 22/6/1/50, 4 beds · miner 8/20/0/52, 4 beds · shepherd 22/6/4/52, 4 beds · farmer 26/6/0/58, 4 beds (3×2) · woodcutter 26/6/0/54, 4 beds · workshop 22/6/0/50 · boathouse 24/4/0/52 (2×3) · slipway 4/0/0/20 · mine 0/0/0/40.
- `SPAN`: log 1–3, plank 2–6, rope 4–10, stone 5–14; `SPAN_MAX=14`.
- `waterKind(L)`: log if `L≤3`, plank if `≤6`, stone if `≤14` and `store.stone + rocks.length·2 ≥ 4·L·0.5 (=2L)`; rope bridges are never chosen here (gorges handled elsewhere).
- `village.breed=6` (initial breeding/pop parameter used elsewhere), `short` = seconds a site waited per material, `felled` = trees cut.

---

## 6. UI elements, controls and input handling
- **None directly.** This section has no DOM access and no event listeners. It feeds the UI through: `logEv(text, subj)` (event feed, 10717 outside) and `toast(msg)` (hint bar, 10685 outside). `logActor` (set at 2301) lets `logEv` attach the critter as the subject so the feed can focus/select it.
- Critter state strings written here are consumed by the HUD text builder `critDoing` (10902 outside: 'carried off in the fox's mouth', 'paddling to the bank', 'asleep in the hutch', 'grazing with the flock, X minding them', 'nibbling Y's garden', 'bolting', …) and by the renderers `drawRabbit` 8444, `drawDeer` 8467, `drawFox` 8506 (lying for `lieup/dogRest/lie`, trot for `moving/circle/turn/flee/chaseR`; cubs drawn at 0.65 scale; the lying dog turns its head toward master/patter).
- Draw-order hook: `inFold` is used at 9706 (outside) to draw penned rabbits inside the fence.

---

## 7. MODE 'creator' vs 'gnome'
- The only mode-sensitive line is `canFight` (2054): `!g.player` — the **player's avatar gnome is never conscripted into a flood fight**. Everything else in the section is mode-agnostic: animals behave the same whether the camera is the creator's or the player is "being a gnome".
- `MODE` itself is declared at 5630 (outside) and toggled by `setMode` (11256–11267); the section never reads it. Feeding/petting/grooming animals as the player is handled by `playerDecide`/animal jobs outside the range.

---

## 8. Progression / unlock / economy touch-points
- Unlock chain (triggers live in `planAnimals` 4716–4722 outside, data here): rack + a home + ≥3 wild rabbits + 6 wood → **fold** (12 wood); tamed fox → **kennel** (4 wood) by the fold; tamed deer → **stable** (10/2/2); stable → **cart** (6 wood, 1 fibre) → "six loads a trip".
- Animal taming costs food (3 apples / 3 fish over 3 days; 2 days during a scouting flight).
- Fold economy: breeding to 8; wool over 10 days (shearing elsewhere); losses to foxes (prank, not death) without a dog; strays without a dog.
- Garden damage: unfenced gardens lose crop at night to rabbits — the fence's raison d'être (v9.14).
- Flood damage: wood (≤10 / 20 %) and food (≤8 / 15 %) losses from wrecked pile/rack; rebuilding costs via `BT`.
- Season gating: all reproduction in spring/summer; fawn/cub/foal spring only, once a year.

---

## 9. Persistence
- **None.** The file has no `localStorage`/`sessionStorage`/IndexedDB anywhere. A new world calls `seedCritters()` (12112) and the reset at 12105 clears `floods` and `CHAN`. All animal and flood state is in-memory and lost on reload.
- Determinism is the substitute: sim RNG (`rng`) vs visual RNG (`vrng`) are separated so birds/particles do not perturb a seeded run (`#s=101&halt` harness, 814). The debug API at 12224–12237 exposes `critters, birds, floods, CHAN, poolNear, startFight, floodPlan, waterWreck, floodFight, fightOf, theFold, flockOf, wildRabbits, theDog, theHorse, penRabbit, mount, dismount, STATS`.

---

## 10. Mobile / touch / performance tricks
- Cadenced passes: breeding every 1 s (`breedT`), flood checks every 2 s (`floodT`), dog repath every 1.6 s (`pathT`).
- Precomputed `IDX.grass` list (3781 outside) for `grazeSpot` instead of scanning the grid.
- Particle cap 220 (`P`).
- Birds limited to 6 and purely visual.
- Cheap walkability tests (`critOK`, `dogOK`) on rounded tiles instead of pathfinding for wild animals; only the dog uses `findPath`.
- Perf smells: `wildRabbits()` (a `filter`) is called up to 4× per frame in `updateFolds` (2177, 2178, 2196); `flockOf(f)` filters per fold per frame; `horseStep` filters critters to find the stall index each frame; `nearestGnomeD2` is O(gnomes) per critter per frame; `prankWater` scans all 5184 tiles (rare).
- No touch handling in this section.

---

## 11. i18n (en/es)
- **All strings in this range are hard-coded English**: ~30 `logEv` lines, 4 `toast`s, and the `BT[*].label` build names (used by the build menu/HUD elsewhere).
- The file's only localisation is the intro screen (`langs={en,es}` at 12200–12215 outside). Nothing in this section consults `lang`. Porting requires an i18n layer for event text, labels, toasts and `critDoing` strings.

---

## 12. Oddities, bugs, dead code, TODOs
1. **Dead code**: `spanFits` (2448) is never called. `foldCap(f)` ignores `f`; `grazeSpot(f,g)` ignores `g`.
2. **Water is deleted, not moved**: `fightPiece` (2092) sets `WD=FLOW=U=0` on a raised tile; mass is not conserved (deliberate shortcut, but the hydrology elsewhere is conservative).
3. **"Blocked" and "arrived" are the same return value** in the local `walkTo` closures (1865, 2253) — in the fox raid (2266) a fox blocked short of the gate still grabs a rabbit (`walkTo(...)||hypot<0.6` → true); in `dogStep` a blocked lie-spot makes the dog lie where it stands (commented as intended).
4. **Dog bark has no range check against the fox** (1894): a dog anywhere within 9 tiles of the fold scares off any fox within 6 tiles of the fold instantly, and sets the fox's flee target relative to the fold, not the dog.
5. **Teleports**: fold rabbits are re-placed inside the hutch every 2–5 s at night (1962); the prank fox sidesteps 1.2 tiles through fences when stuck (2230); mount snaps the deer to the gnome (1795); cart-return and kennel entry move without ground checks (1939, 1932).
6. **Fold litter timer resets** (`f.kitT=0` at 2174) whenever the flock wasn't grazed within the last two days — progress toward a litter is lost rather than paused.
7. `prankWater` (2205) has a redundant `||ICE[i]` after already excluding ice.
8. `fightAct` (2117) sets `g.face` from world-x of the tile rather than `screenOf` (the rest of the file faces by screen x, and the camera can rotate) — faces may be mirrored under rotation.
9. **TDZ ordering fragility**: `NB8` (2127), `FIRES` (2284), `store` (2399) and `village` (2468) are `const`s declared *after* functions that use them (`floodPlan` 2030, `critOK` 2282, `waterWreck` 2000, `mount` 1799). Fine today because those are only called from the loop, but any future call during initial script evaluation would throw.
10. `young` growth loop (2180) writes `kit/fawn/cub/foal=0` onto any critter that had `young` set, including kinds that never used those fields — harmless.
11. `toFood` taming log says "day N of 3" with `Math.min(3,c.fed)` — with the scouting ×2 bonus an animal can go 0→2→4, so "day 2 of 3" then tame; cosmetic.
12. The ride/cart multipliers quoted in log text (1799: "three loads", "half as fast again", "six loads") are not enforced in this range; they live in the fetch/gSpeed code. Any tuning change must be made in two places.
13. The `village` literal at 2468 declares ~12 fields but the section alone adds `rideLog, prankLog, fawnYear, cubYear, foalYear`; the object is an untyped grab-bag.
14. No explicit TODOs in the range; comments carry the designer's dated change requests ("Jed (09/10/2026): …") as rationale.

---

## 13. Reusable engine/shell vs gnome-specific content

### Reusable (engine-grade, port as-is or with renames)
- **Critter framework**: a flat `critters[]` of plain objects with `k`, `st`, timers, `tx/ty` targets, facing by `screenOf`, `scare` decay, `logActor` attribution; the per-kind dispatch in `updateCritters` (2292–2366). The hop-lerp with a sine arc (0.32 s, 0.30 high) is a generic "small creature" locomotion.
- **Walkability predicates** (`critOK`, `dogOK`) as a pattern: a cheap rounded-tile test for ambient fauna, full `findPath` only for the one companion animal.
- **Companion AI** (`dogStep`, `dogGo`, `dogMaster`): follow/heel/lie/wait-at-door/wait-at-water/lost-and-go-home, master succession rules. Directly reusable for any pet or child NPC.
- **Hand-feeding → affinity → tame** (`toFood`): a generic "repeated daily gift builds a relationship" meter with a day-counter and a bonus multiplier — the same shape as a romance meter.
- **Timed/cadenced subsystems** (`breedT`, `floodT`), population caps and seasonal gating (`updateFolds`).
- **Decorative birds** on the visual RNG (`landBird`, bird loop) — the sim/visual RNG split is a key engine property.
- **Particle system** (`P`, spawners, `updateParts`) including `heartFx` — already a romance effect.
- **Hazard → emergency work party** pattern (`floods`, `startFight`, `joinFight`, `nextPiece`, `fightAct`): a generic "event spawns pieces of work; nearby eligible agents are conscripted, each claims a piece, state machine goTo→work→next". Reusable for any communal emergency (a storm, a lost child, a wedding set-up).
- **Build table pattern** (`BT`: costs/work/footprint/label/beds/roof) and the query helpers (`countB`, `hasB`, `queued`, `villageSites`, `bedCount`, `isHome`), `store`, `village` state object.
- **Terrain-plan generators** (`floodPlan`, `bankPlan`, `poolNear`): reusable only if the new game keeps the heightfield + water sim; otherwise they are the most disposable part.

### Gnome-specific content (replace)
- Species and their fiction: rabbits/deer/foxes, the no-death "prank" dunk, fold/hutch/shepherd/wool, kennel, deer-as-horse with cart, antlers, garden nibbling vs picket fence.
- All tuning numbers in §5 and all `logEv`/`toast` prose (hard-coded English, village voice).
- The water's-teeth content: tents/fences/racks/woodpiles as wreckables, spades/dig animation (`SWING_P.dig`), flood banks.
- `BT` entries, `SPAN`/`waterKind` bridge rules, `village.breed`, STATS keys.
- Season/day constants (`DAYLEN=210`, 12-day year) and the meadow/grass material tests in seeding.

---

## 14. Design questions for the Parque D'Amour port raised by this section
1. **Fauna roster**: which park animals (pigeons, ducks, a dog on a leash, squirrels, swans, a cat) and which are ambient-only (bird layer, visual RNG) vs simulated actors with states and a HUD "doing" line?
2. **Companion animal**: is there a pet (dog/cat) that follows a character the way the dog follows its master? Who is its "master" and what is the succession rule when that character leaves the park?
3. **Affinity meters**: `toFood`'s "fed N days of 3 → tame" is the obvious template for the romance meter. What counts as a "feeding" (a gift, a shared bench, a compliment), how many are needed, do they decay, and is there a per-day cap or a bonus multiplier (the scouting ×2 analogue — e.g. a sunset or music)?
4. **Sabotage**: the fox is the built-in antagonist (raids when there is no guardian, pranks without killing). What is the saboteur's equivalent — a rival suitor, a pigeon stealing the picnic, rain? Does the avatar mode let the player *be* the fox-equivalent?
5. **No death rule**: Gnome Village explicitly forbids death ("drops it in a river and giggles"). Does Parque D'Amour keep a comparable tone rule (no heartbreak that is permanent? no one leaves forever?) and how does that bound the sabotage design?
6. **Communal emergencies**: the flood fight conscripts every adult within 12 tiles regardless of hour. Is there a park equivalent (a sudden shower → everyone runs for the bandstand; a lost child; a proposal everyone gathers for) and what are the pieces of work, the radius, the daily cap?
7. **Terrain and water**: do we keep the heightfield + water simulation at all? If the park is flat with ponds and paths, `floodPlan/bankPlan/poolNear/waterWreck` can be dropped wholesale; if fountains/ponds matter, what can water damage (a picnic blanket, a newspaper, a love letter)?
8. **Wreckables**: which light props are destroyed by weather and rebuilt (`WRECKABLE`), and what do they cost?
9. **Build table**: what is the park's `BT` — benches, lamp posts, kiosk, bandstand, flower beds, fountain, boat hire, hedges — with costs in which resources (francs? flowers? goodwill?) and which have "beds"/capacity (seats)?
10. **Avatar vs creator exemptions**: `canFight` excludes the player's gnome from conscription. Which systems should leave the avatar alone in Parque D'Amour (emergencies, courtship AI, being followed by the dog) and which should include them?
11. **Day/season clock**: keep `DAYLEN=210` s and 3-day seasons? Romance pacing (meetings per day, a wedding after N days) and animal breeding gates depend on it.
12. **Reproduction/population**: is there any analogue (ducklings in spring, a growing pigeon flock, children of the couple)? Caps and once-per-year gates as here?
13. **Garden raiding analogue**: rabbits punish unfenced gardens. What low-level nuisance punishes neglect in the park (pigeons on an unattended picnic, litter, weeds)?
14. **i18n from day one**: all event prose here is inline English. Should the new game route every `logEv`/`toast`/label through a key table with en/es/fr from the start?
15. **Persistence**: Gnome Village has none and relies on seeded determinism. Does Parque D'Amour need save/load (localStorage) given a story arc, and how would animals/fights be serialised (object references like `c.fold`, `c.master`, `f.home` need ids)?
16. **Debug/harness API**: keep the `window` debug surface (critters, floods, start/force functions) for automated tests of the new systems?
