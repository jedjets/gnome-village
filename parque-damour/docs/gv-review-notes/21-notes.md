# Gnome Village review — section 21: lines 11323–12246
**"The machines (v9.21), the flyer, the boats, boot/intro/lang/mode wiring, end of script"**

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Every line 11323–12246 was read. Line numbers below are exact (verified with grep).

Useful outside-range facts used here: `S=2` fine tiles per old tile, `N=72`, `TW=26` px, `EH=26` px per level, `GH=14.3` px gnome height (567–569, 8047); `DAYLEN=210` s per day, `SEASON_DAYS=3` → a year is 12 days (573–574); `T={abs,f,day,season,light,speed,cold,thaw,ds}` (814); `W={kind,rain,mist,snow,wind,...}` (845); `MODE`/`PLAYER` (5630); `STATS` (4658); `village` (2468); `$`=getElementById (10684).

---

## 1. Purpose of the section

Four things live here, in order:

1. **The flyer** (11323–11709): once a year the engineer builds a hot-air balloon or a glider (alternating) before the workshop in spring, and flies it at an autumn festival. The village gathers to watch; after a landing the pilot has "scouted" the isle for 3 days (fishing and taming bonuses elsewhere in the file) and there is a supper that night. Includes planning, work, the flight state machine (two separate kinematic models), the watcher crowd, and all the drawing (balloon envelope lying on the grass as ground "pieces", the balloon in the air, the glider on trestles / carried / flying).
2. **The boats** (11710–12012): a boathouse or beach slipway lets a boatwright build up to two rowing boats; boats are used for fishing out on the water (any season at sea) and for a once-a-day fair-weather trip round the isle with children/partner. Includes mooring/tie/boarding geometry, coast loop path-finding, boat kinematics, the slipway site search and drawing, and the boat drawing.
3. **The main loop and performance governor** (12013–12096): `simulate()` (fixed 1/60 s steps with a "lite" bitmask for fast-forward), `draw()`, the frame-time overlay + automatic quality step-down, and `frame()` with a time budget.
4. **Boot** (12097–12243): seed from URL hash, `newIsland()` full reset + founders + camera, `boot()` wiring every HUD/rail control, the bilingual intro (en/es), the `window.__GV` debug/harness surface, and the closing `boot();` / IIFE end / `</script>`.

---

## 2. Globals / state defined or mutated here

### Constants (flyer)
| name | line | type / value |
|---|---|---|
| `FLYER_WORK` | 11329 | `90` seconds of engineer tinker time to finish a flyer |
| `FLYER_COST` | 11330 | `{balloon:{wood:3,fibre:8,stone:2}, glider:{wood:8,fibre:5,stone:0}}` |
| `FLYER_COLS` | 11331 | two 6-entry pastel palettes (hex), alternate by `village.flyerN` |
| `NO_WATCH` | 11332 | set of gnome states that must not be yanked into the crowd: swept, float, shiver, help, goRescue, comfort, heave, dig, yelp, flee, adventure, goAdventure, goFarewell, wave, goDrain, drain, row, netFish, passenger, goRow, aloft, goFly, flyPrep, carryGlider, atSummit, sleep, court |
| `FLIGHT_ON` | 11333 | `{gather,inflate,fly,landed}` — flyer states during which the festival is "on" |

### Constants (boats)
| name | line | value |
|---|---|---|
| `boats` | 11710 | `const []` — array of boat objects (module-level, reset by `newIsland` 12105) |
| `boatId` | 11710 | `let 0` counter |
| `BOAT_WORK` | 11711 | `80` s of boatwright tinker time per boat |
| `BOAT_MAX` | 11711 | `2` boats per boathouse/slipway |

### Loop / perf state
| name | line | shape |
|---|---|---|
| `planT`, `last` | 12013 | `let 0,0` — planner countdown (s), last rAF timestamp |
| `SP` | 12014 | `{time,water,mat,idx,gnomes,flora,crit,parts,plan,breed,audio}` ms profile per sim phase (`audio` never lapped here) |
| `waterPend` | 12023 | `let 0` — accumulated dt for the every-other-tick water solve |
| `PROF` | 12041 | `{sky,island,tiles,props,n}` draw profile |
| `DBG` | 12041 | `{slackHide:true,sky:true,island:true,props:true,haze:true,water:true,ground:true,trees:true,flowers:true,smooth:'grad',noDam:false,feather:true,shadows:false}` — debug toggles; `smooth` is mutated by the auto-degrade (12064) |
| `SIM_DT` | 12054 | `1/60` |
| `simAcc`, `simSteps`, `setSpeed` | 12054 | accumulator (s), step counter (harness), speed setter closure assigned in boot (12139) |
| `FT` | 12056 | `{on,sim,draw,frame,wSim,wDraw,wAt,fps,n,t0,acc}` + dynamically `slow`, `stepped` (12064) |

### Village/STATS/gnome/build fields written by this section
- `village.flyer` (11362, 11470, 11553, 11557, 12105): the flyer object `F` — `{kind:'balloon'|'glider', yr, prog:0..1, st:'build'|'ready'|'gather'|'inflate'|'fly'|'landed'|'done', x,y,z, w:workshop, lay:angle, h:heading, isFlyer:true, inf:0..1, t:seconds-in-state, cols[]}` (11361); later gains `pilot, pass, site, watch{x,y,r0,r1,avoid}, watchPlan, watchCalled, gatherMax, land, route, carried, sumT, carryMax, cx,cy,R,a0,a,dir, z0,za, ph:'up'|'loop'|'down'|'glide', burn, burnT, dd, ri, dur, bank, zTouch, zl, logDay, _box`.
- `village.flyerYr` (11362): year the current flyer was begun; `village.flyerN` (11362): count, parity picks kind; `village.flownYr` (11431); `village.flightDay` (11431, **never read anywhere**); `village.pilot` (11431, read at 5000 for the supper line); `village.scoutUntil` (11541, `T.abs+3` days); `village.flightFeast` (11541, read by `flightFeast()` 11581 → 4822); `village.tripDay` (11815); `village.boatLog` (11829). All reset at 12105.
- `STATS.flyers` (11362), `STATS.flights` (11431), `STATS.landings` (11541), `STATS.rowboats` (11743), `STATS.boatCatch` (11828), `STATS.trips` (11830), `STATS.tripsOut` (11815). **None of these is read anywhere else** (only exposed through `__GV.STATS`).
- Gnome fields: `g.job={k:'watch',F}` / `{k:'fly',F,role}` / `{k:'row',boat,role}` (11402, 11412, 11801, 11813–11814); `g.st` in goWatch/watch/goFly/flyPrep/carryGlider/atSummit/aloft/goRow/row/passenger/netFish; `g.inFlyer`, `g.seat` (11479); `g.inBoat` (11840, 11824); `g.cheer` (11402, 11543); `g.hatHand=0`, `g.swim=0`, `g.climb=false`, `g.hop`, `g.gz` (ground z for drawing), `g.carry='food'`, `g.cAmt` (11828); draw-side `g._sx,g._sy,g._bf,g._fq` (11631, 11693, 11997–11999).
- Build fields: `w.boatProg` (11750–11753), `b.wdir` (slipway, set at 3160 from `slipwaySite`), `h.z0` read (11726, 11924).
- Store: `store.wood/fibre/stone -=` cost (11360); `newIsland` sets `store` to `{wood:0,stone:0,fibre:0,food:3}` (12102).
- `T.abs=0.34` (12109), `T.speed` (12137–12139), `cam.*` (12121–12124, 12146–12153), `MODE='creator'` + `PLAYER=null` (12107), `muted` (12163), `brush` (12141), `toastT` (12130), `paintCool` (12075), `now` (12073), `last` (12072), `lang` (12206, local to boot).

---

## 3. Every function in the range

Format: **name** (line) `signature` — what it does — callers.

### Flyer: planning and placement
- **yearOf** (11334) `()` → `Math.floor((T.day-1)/12)`. Hard-codes 12 days/year (= `SEASON_DAYS*4`). Callers: planFlyer.
- **scouting** (11335) `()` → `village.scoutUntil > T.abs`. Read outside at 1822 (deer feeding counts double), 5104 (shore fishing catch +1/+2), and here at 11828 (boat catch +3).
- **fairFlying** (11336) `()` → `W.rain<0.15 && W.snow<0.2 && kind∉{storm,rain,snow} && W.wind<0.9 && W.mist<0.6`. Caller: flyerStep.
- **flyerSpot** (11338–11351) `(w)` → `{x,y,lay}|null`. Candidate points in the workshop's local frame (`houseFrame(w).R(u,v)`) at v∈{V+1.7, V+2.5, V+3.3}, u∈{0.6,-0.6,1.4,-1.4}. A tile is `okT` if in bounds with a 2-tile margin, `!OCC`, `wetD<=0.08`, no bridge/dam, `slopeOf<=0.8`, `E>SEA+0.4`; `clear` additionally rejects a standing tree or a rock within 0.7. Then it needs a straight "lay" run for the envelope: bearing `away` from the workshop, tried at offsets {0,±45°,±90°,±135°}, with points at 0.7/1.3/1.9/2.5 tiles all clear. Caller: planFlyer.
- **planFlyer** (11352–11364) `()`. Needs a done workshop and an `engineerOf()`; only in season 0 or 1 (spring/summer), one per year (`flyerYr===yr` guard), never while a flyer exists. Kind = balloon when `flyerN` even, glider when odd. Material gate: `store.wood - reserveOf('wood') >= cost.wood+4`, `store.fibre>=cost.fibre`, `store.stone>=cost.stone` (reserveOf = 2 wood per gnome in cold, 4149). Deducts cost, creates `F` (st 'build'), bumps `flyerN`, `STATS.flyers`, logs. Caller: `planCrafts()` 3424 (runs on the 1.2 s planner tick).
- **flyerWorkSpot** (11365) `(F)` → `{x:F.x-0.6, y:F.y+0.35}` — where the engineer stands. Callers: 4878, 4927 (job dispatch), 5171 (goTinker arrival).
- **flyerWork** (11366–11371) `(g,dt)`. If `g.job.flyer` is the live flyer in 'build', `prog += dt/FLYER_WORK`; at 1 → 'ready', log, `sfxBuilt`. Caller: 'tinker' state 5176 (sessions of 16–28 s, 5171; engineer takes them with chance 0.5 per decision while daylight and `T.f<0.62`, 4878, or via workPlace 4927 with chance 0.45).

### Flyer: the glider's summit / landing / watchers
- **summitSpot** (11372–11381) `(c)` → highest tile anywhere (v9.23) at least 4 tiles from the green `c`, rejecting `OCC`, `wetD>0.05`, `MINEB` (mine pit), bridge, `slopeOf>1.1`, `E<=SEA+0.5`. Caller: startFlight.
- **landSpot** (11382–11399) `(c,sm)` → landing tile on the green toward the summit. Scans rings r=2.4…6.0 step 0.8, 24 bearings from `a0` (toward summit). Rejects `OCC`, `wetD>0.08`, bridge, `STEPS`, `slopeOf>0.8`, `E<=SEA+0.4`, any build within 1.6 tiles, any wet 3×3 neighbour ("not the bank of the river"). Score (lower better) = `obstacleNeighbours*1.5 + angleFromSummit*0.5 + |r-3.8|*0.25 + slope`. Fallback: first plain dry tile; last resort `{c.x+1.5,c.y+1.5}`. Caller: startFlight. (Variable named `clear` actually counts obstacles.)
- **watchJob** (11400–11405) `(g,F)`. Puts a gnome on the watch ring: angle by golden-angle hash `g.id*2.39996`, kept out of the `avoid` sector (gap 0.9 rad each side), radius `r0 + frac(g.id*0.618)*(r1-r0)`. Clears marks/bed, `job={k:'watch',F}`, st 'goWatch', `goTo`. Callers: startFlight, gliderStep, watchJoin, balloonStep (late passenger), flyerAct.
- **watchJoin** (11406–11410) `(g)` → bool. A free gnome joins the crowd if `FLIGHT_ON[F.st]` and `F.watch` is set, unless pilot/passenger/baby/inside/`g.player&&MODE==='gnome'`/`NO_WATCH`. Caller: idle decision 4816.
- **crewTo** (11411–11416) `(g,F,role)`. Sends pilot/passenger to the flyer: balloon → stand at `F.x±0.45, F.y+0.55`; glider → `F.x+0.6,F.y+0.6`, `F.carried=false` (v9.23: fetched from the workshop). Caller: startFlight.
- **flyOK** (11417) `(g)` → adult/elder, not `gone`, not inside, not asleep, not NO_WATCH, not player-in-gnome-mode. Caller: startFlight.
- **startFlight** (11418–11438) `(F)` → bool. Pilot = engineer. Balloon: passenger = chief of village 0 if ≠pilot and flyOK, else pilot's mate; `site=F`; watch ring `{r0:2.3,r1:3.8,avoid:F.lay}`; every eligible gnome gets `watchJob` now. Glider: `site=summitSpot`, `land=landSpot`, `route=glideRoute`, `watchPlan={r0:2.5,r1:4.2,avoid:route.approach}`, `watch=null` (crowd is called only when the pilot reaches the summit), `gatherMax = 60 + 2.5*(|F→summit| + |pilot→F|)` s. Sets st 'gather', `flownYr`, `flightDay`, `pilot`, `STATS.flights`; `crewTo` pilot (+pass); `logEv`; `toast('…tap the line at the top to watch')`. Caller: flyerStep.
- **glideRoute** (11439–11466) `(F)` → `{pts[{x,y,z,bank}],dist[],len,A,zs,zl,z0,dir,approach}`. Builds a per-tile "need" ceiling: `max(E+wetD, SEA)+0.35`; trees `E + t.h*TS*clamp(0.22+age*0.78)/EH + 0.3`; buildings `E + (HOUSE type 2.6 | windmill 3.8 | lantern 1.8 | else 1.2)` on their footprint tiles. `needAt(x,y,h)` samples 7 points under the wing (span ±0.55 across heading, ±0.4 along). Final straight run length `L=clamp(d0-4,4,7)` tiles; 12 candidate approach bearings at ±k·30° from the summit side, scored by worst (need − zl − glide gain at 0.45/tile) + `|da|*0.12`. Circling leg: `turns = dA<6 ? 0.6 : 1.4`, `R0=min(3.2, dA*0.45)`, direction chosen so the start heading runs toward the green; `M=max(40, round(dA*6))` points with smoothstep centre travel and `R=R0*sin(πu)`, `bank=-dir*0.2*sin(πu)`; straight leg `L*5` points. Height: last 1.6 tiles flare to ground+0.05; `req` made monotone backwards (never climbs); start `zs=max(z0+0.7, req[0])`; descent ≤ 0.45 level/tile (1.0 in last 2 tiles) toward `want=lerp(zs, zl+0.05, (d/len)^1.1)`. Callers: startFlight, gliderStep (re-plan), exposed in `__GV`.

### Flyer: the flight state machine
- **flyerStep** (11467–11478) `(dt)`. `F.t+=dt`. In 'build'/'ready': winter (season 3) scraps it (`village.flyer=null`, log "laid up"); launch when 'ready' ∧ autumn (season 2) ∧ not flown this year ∧ `0.30<=T.f<0.42` (late morning) ∧ `fairFlying()`. Otherwise abort via `endFlight(F,true)` if pilot `gone` or 'gather' exceeds `gatherMax||90` s; then dispatch `balloonStep`/`gliderStep`. Caller: simulate 12034.
- **boardFlyer** (11479) `(F,g,k)` — `g.inFlyer=F`, st 'aloft', seat k, clears path/hat/swim/climb.
- **seatFlyer** (11480–11482) `(F)` — pins pilot/passenger positions to the flyer (balloon ±0.10/∓0.04 offsets; glider exactly on it), `gz=F.z`.
- **balloonStep** (11483–11509) `(F,dt)`. 'gather': go when pilot is in 'flyPrep' and the passenger too (or none) and `t>8`, or pilot ready and `t>30` (late passenger is demoted to a watcher) → 'inflate', `sfxBurner`. 'inflate': `inf=min(1,t/8)`, `burn=1`; at `t>=9` board both, plan a loop: random bearing `wa`, `R=7`, centre = site + 7 along `wa`, `a0=wa+π` (loop starts/ends at the site), random direction; `za = max(z0+4.6, hi+3.2)` with `hi` the max ground on 32 loop samples; `ph='up'`, st 'fly'. 'fly': burner pulses every 4–7 s (`burn=1.6`, decays 1/s), ground speed 1.5 tiles/s; 'up' climbs at `(za-z0)/6` per s; 'loop' `a += dt*1.5/7` until a full turn; 'down' descends at `(za-z0)/7` per s → `landFlyer`. 'landed': deflate from `t>2` over 6 s; `endFlight` at `t>8`. 'done': `packFlyer` at `t>20`.
- **gliderStep** (11510–11537) `(F,dt)`. 'gather': while carried the flyer follows the pilot (heading from `mx,my`). When pilot is 'atSummit' and not yet called: call the crowd (`watch=watchPlan`), and if the pilot stopped >1.5 from the planned summit, re-site and re-route from where he stands (note: after the watchers were dispatched, see §11). After `sumT>8` s: place at site, `z=z0+0.45`, board pilot, `dur=len/1.6`, st 'fly', heading from first two route points. 'fly': advance `dd` at 1.6 tiles/s along `route.pts` by cumulative `dist`; lift-off blend over the first 1.5 tiles; `bank` interpolated; at the end snap to `land`, `zTouch=z`, `landFlyer`. 'landed': settle `zTouch→ground` over 0.6 s; `endFlight` at `t>7`. 'done': pack at `t>20`.
- **landFlyer** (11538–11547) `(F)`. st 'landed'; `scoutUntil=T.abs+3`; `flightFeast=T.day`; `STATS.landings`; `sfxTune`; all watchers `cheer=4` s; log "saw shoals… / where the deer graze / the foxes' lie-ups" depending on untamed critters.
- **endFlight** (11548–11555) `(F,aborted)`. Crew off at `F.x±0.5, F.y+0.5` with a hop; watchers/flyers idle with `decide` 0.2–1.2 s. Aborted → log + `village.flyer=null`; else st 'done'.
- **packFlyer** (11556–11560) `(F)` → `village.flyer=null`, log "next spring … builds a glider/balloon".
- **flyerAct** (11562–11580) `(g,dt)` → bool handled. Per-gnome side: 'goWatch' → 'watch' when arrived or `pathT>30`; 'watch' → cheer particles with chance `dt*2.2` (50/50 heart or '♪'), children hop with chance `dt*1.2`; drops out when the flyer is gone/done. 'goFly'/'flyPrep': non-crew are redirected to watch or idled; arrival (or `pathT>40`) → glider: 'carryGlider' with `carryMax=30+2.5*dist`, `goTo(site)`; balloon: 'flyPrep'. 'carryGlider' → 'atSummit' when arrived or `pathT>carryMax||70`. 'atSummit', 'aloft': hold unless the flyer vanished. Caller: gnome state switch 4971.
- **flightFeast** (11581) `()` → `village.flightFeast===T.day`. Caller: 4822 (supper is a feast like the harvest's).

### Flyer: audio and drawing
- **sfxBurner** (11584–11585) `(F)`. Gap 1800 ms (`aOK`), distance gain, two descending tones (118→84 Hz 0.7 s with wobble; 176→120 Hz 0.5 s). Callers: balloonStep.
- **flyerAirborne** (11587) `(F)` → `st==='fly' && F.z - ground > 2.0`. Used at 9700 (sorted prop vs. overlay), 9975 (drawn over the whole scene), 11295 (follow-cam height).
- **drawFlyer** (11588–11592) `(F)` → `drawBalloon`/`drawGlider`. Callers: drawProp kind 20 (9543), overlay 9975.
- **drawBalloon** (11593–11659) `(F)`. Basket 1.35G wide × 0.55G tall (G=GH·zoom); during 'build' the basket grows over prog 0–0.4 (wicker frame lines) then a fire pan appears. `fill=clamp01(inf/0.55)`, `rise=smoothstep((inf-0.35)/0.65)`: the envelope fills lying along `lay`, then stands up (mouth from `z0+0.06` beside the basket to `zb+0.93` above it); the landing is the reverse. Envelope radius `R=1.30G*(0.30+0.70*fill)`; 6 vertical colour panels clipped to a bezier outline + a left-to-right light gradient + an equator line; 4 ropes from the rim; a flickering flame (only while not landed). Sway `sin(now*0.0011)*0.03` while flying. Sets `F._box` (tap hit-box). Draws the crew inside the basket via `drawGnome`. Order: crown behind basket when `rise>0.5` or the crown is screen-above the basket.
- **clothShown** (11660–11666) `(F)` → alpha of the flat envelope on the grass: balloon only; 'build' → 1 once `prog>=0.4`; ready/gather/done → 1; inflate/landed → `1-clamp01(fill/0.3)`; else 0.
- **clothHW** (11667) `(t)` — half-width profile: smoothstep 0.14→0.60 up to t=0.72, then an elliptical tip.
- **clothPt** (11668) `(F,t,f)` — world point on the laid-out envelope: `0.45+2.0*t` along `lay`, `clothHW(t)*f` across.
- **clothTiles** (11669) `(F)` — set of tile indices the cloth covers (17×5 samples). Caller: 9727 (adds `{cloth:F,at:ti}` pieces to the ground-piece buckets so standing things overdraw it).
- **drawClothTile** (11670–11682) `(pc)`. Clips to one tile, alpha `clothShown`; draws 6 longitudinal panels, `n = floor((prog-0.4)/0.6*6)` of them coloured during build (the rest undyed `#E9E1CE`), outline stroke. Caller: drawPiece 8750.
- **drawGlider** (11683–11709) `(F)`. Height above ground: carried +0.52, done +0.07, on ground +0.34, flying/landed +0.48 (landed settles with `zTouch`). Span 1.05 tiles; `P(u,v,dz)` maps wing coords with bank roll and a 0.10 tip droop on the ground. Trestles while on the ground (not 'done'). Pilot drawn hanging under at z−0.48 while flying. 14-point wing outline; panels covered from the middle outward by `clamp01((prog-0.5)/0.5)`; keel, leading edges and 4 ribs as poles. Sets `F._box`.

### Boats: yards, water, moorings
- **boatYard** (11712) `()` → first done boathouse, else first done slipway, else null. Used by boatwrightOf 3165, workPlace 3192, dispatch 4893.
- **boatHomes** (11713) `()` → all done boathouses/slipways. **Never called** (only exported in `__GV`).
- **waterAt** (11714) `(x,y,deep)` → navigable water at the rounded tile: in bounds with 1-tile margin, no bridge/dam/ice; sea tile (`SEAC>0`) → true, or if `deep` only when `E<SEA-0.15`; inland → `wetD > (deep?0.45:0.3)`.
- **waterZ** (11715) `(x,y)` → `SEAS` at sea, else `E + max(0.05, WD)`.
- **mooringOf** (11717–11724) `(h,k)` → `{x,y,h}`. Boathouse: frame point `R(k?0.85:-0.25, V+2.1)`, heading = frame normal; slipway: 1.65 along `wdir`, ±0.85 sideways for slot k. If not water, nearest water tile within ±2.
- **tieOf** (11725–11729) `(b)` → rope anchor `{x,y,z}`: boathouse `R(±0.40, V+1.55)` at `z0-0.36`; slipway 0.95 along `wdir`, ±0.22, z = max(water, z0−0.25)+0.04.
- **boardSpot** (11730–11736) `(b)` → nearest dry open tile within ±3 of the mooring (`!OCC`, `wetD<=0.12`, no bridge, `E>SEA+0.05`), else the mooring itself.
- **launchBoat** (11737–11747) `(h)` → boat|null. Max `BOAT_MAX` per home; slot `k` = first unused of {0,1}; boat object `{id,home,k,moor,x,y,h,st:'moored',crew:[],path,pi,t,stroke,sd:(id*7.31)%9,kind}`; `STATS.rowboats`; log naming `boatwrightOf()`; splash sfx/fx. Callers: boatWork, `__GV`.
- **boatWork** (11748–11755) `(g,w,dt)`. For a boathouse/slipway with fewer than 2 boats, `w.boatProg += dt/BOAT_WORK`; at 1 → `launchBoat`. Caller: 'tinker' 5176 (boatwright takes sessions with chance 0.3, 4893; or via workPlace 0.45).

### Boats: routes
- **isleCentre** (11756) `()` → centroid of all land tiles (`E>SEA`).
- **coastLoop** (11757–11770) `()` → polyline round the isle: 60 bearings from the centre; walk inward from `r=N*0.75` in 0.5 steps until the first non-deep-water tile; mark at `hit+3` tiles (must itself be deep water). Then, between consecutive marks whose straight run is not `clearRun`, insert one detour mark pushed outward 1–7 tiles. Called every `tripPath` (no caching).
- **clearRun** (11771) `(x0,y0,x1,y1)` — samples every 0.35 tiles with `waterAt(...,false)`.
- **pathLen** (11772) `(pts,x,y)` — polyline length from (x,y).
- **fishingPath** (11774–11780) `(b)` → `{out:[far],back:[[moor]]}`: along the mooring heading, r from 4.5 down to 1.5 in 0.5 steps, first water point with a clear run.
- **tripPath** (11781–11790) `(b)` → `{out,back:null}`. At sea: coast loop if ≥12 marks; enter at the nearest mark reachable with a clear run; direction by boat id parity; the whole loop (+1 to close) then home. Lake/river (or no loop): a small loop of up to 4 marks at (forward,side) = (2.5,0),(3.5,1.6),(2,2.6),(0.6,1.4) then home; null if none valid.
- **freeBoat** (11791) `(g,maxD)` → nearest moored, empty boat whose home still exists, with `boardSpot` within `maxD||22` fine tiles (squared compare).
- **boatWeather** (11792) `()` → not storm, `wind<0.92`, `rain<0.85`, `T.light>0.32`.

### Boats: jobs
- **boatFishJob** (11794–11803) `(g)` → bool. Adult/elder, not player, boats exist, `boatWeather`, `0.26<=T.f<=0.6`; fishers (`craftOf(g)==='fish'`) always, anyone else 35%; `freeBoat(g,24)`; `fishingPath`. Boat ← `crew=[g], kind='fish', path=out, pathBack=back, st='board', t=40`; gnome ← `job={k:'row',boat,role:'rower'}`, st 'goRow', walk to `boardSpot`. Callers: 4594 (food job, non-children), 4934 (fisher chance 0.55 / other 0.30 when `store.food < pop*6+24`).
- **tripJob** (11804–11819) `(g)` → bool. Adult, not player, boats, `boatWeather`, one trip per day (`village.tripDay`), weather kind ∈ {clear, fair, breeze}, `T.cold<=0.6`, `0.24<=T.f<=0.31` ("out early: round the isle is most of a day"), `store.food >= 2*gnomes.length`; `freeBoat(g,22)`; `tripPath`. Passengers: up to 2 from candidates not inside/player, child or `g.mate`, not BUSY, within `12*12*S2` (12 old tiles) — children first, then nearest. All get `job={k:'row',boat,role}` and walk to the board spot (passengers with ±0.4 jitter). Sets `tripDay`, `STATS.tripsOut`, log. Caller: 4938 (chance 0.25).
- **seatBoat** (11820–11823) `(b)` — crew positions along the heading: rower −0.06, 2nd +0.36, 3rd −0.40; `gz=waterZ`.
- **stepAshore** (11824) `(b,g)` — put at `boardSpot` ± 0.3 jitter, hop, clear path.
- **endBoatTrip** (11825–11832) `(b,why)`. Everyone ashore and idle. `why==='fish'`: catch `n = (T.cold>0.5 ? 5 : 10) + (scouting() ? 3 : 0)`, two `tally(rower,'fish')`, `carry='food', cAmt=n`, `STATS.boatCatch`, `haulHome(rower)`, one log line per day (`boatLog`). `why==='trip'` → `STATS.trips`. Boat reset to moored at the mooring.
- **boatStep** (11833–11870) `(dt)`. For each boat: home gone → end + remove. Moored → `stroke=0`. Crew pruning: anyone whose job no longer points at the boat is dropped (and set ashore if aboard); no rower → end. 'board': `t` counts down from 40; a crew member boards when arrived or `pathT>30` (st 'row'/'passenger'); when the rower is aboard and (all aboard or `t<=0`) the stragglers are released and the boat goes 'out'; at `t<=-20` abandon. 'out'/'back': homing kicks in once when `!boatWeather()` or `T.f>0.66` (dusk): trips take the shorter of back-the-way vs. on-round; a fishing boat still outbound turns straight home (`kind='fishHome'`, no catch). Steering: turn rate 1.6 rad/s toward the mark, forward speed `(trip 1.55 : fish 1.2) * S` tiles/s × `max(0.25, cos(da))`, moves only onto `waterAt`; fallback slide straight at the mark; stuck >4 s skips the mark. `stroke += dt*2.4`. Mark reached at `d<0.35`. End of path: fishing boat outbound → 'fishing' for 16–24 s (rower 'netFish'); otherwise end (trip / fish-with-catch / off). 'fishing': timer, slow yaw wobble `sin(T.abs*40+sd)*0.02`, splash fx chance `dt*0.5`; on timeout / weather / dusk → 'back' along `pathBack`. Caller: simulate 12034.
- **boatAct** (11871–11882) `(g,dt)` → bool. 'goRow': idle if boat gone. 'row'/'passenger'/'netFish': idle if boat gone or not aboard; child passengers emit '♪' with chance `dt*0.15`. Caller: 4972.
- **machineDoing** (11883–11904) `(g)` → card "doing" string or null for goDrain/drain (flood section's states, oddly here), goWatch, watch, goFly, flyPrep, carryGlider, atSummit, aloft, goRow, row, passenger, netFish, goTinker, tinker. Caller: card update 10833.

### Boats: slipway and drawing
- **slipwaySite** (11905–11922) `(v)` → `{x,y,wdir}|null`. Search radius 24 round the fisher's cabin (else the green). Tile must be dry: not sea, `!OCC`, `!PAVE`, no bridge/dam, `wetD<=0.12`, `E>=SEA+0.45`, `slopeOf<=1.0`. For each of 4 directions: tile 1 out is beach (sea or `E<SEA+0.5`, unoccupied); tiles 2 and 3 out are sea, 3 out `E<SEA-0.15` (deep); tile behind is dry; no point-build within 1. Score `d0 + (E-SEA)*0.5` (near and low). Caller: planCrafts 3160 when `boathouseSite` fails.
- **drawSlipway** (11923–11955) `(b,p,s)`. Two log runners (`logRib`) from 0.45 behind to 1.35 ahead down to `min(z,SEAS)-0.18`, shown per build stage count `stc(b,'runner')`; two A-frame trestles (`stc(b,'trestle')`) at 0.30 above ground. When done and under `BOAT_MAX`, the boat under construction by `boatProg`: keel grows over 0–0.2, 7 ribs over 0.15–0.55, planking over 0.55–0.95 (far side first, then near side, via `faceVis`), gunwale line. Callers: 7854, 7870.
- **plankSide** (11956–11965) `(W,A0,A1,kz,wdOf,sd,pl)` — one planked flank (12 segments × `pl`) with a seam line.
- **drawBoat** (11966–12012) `(b)`. Bob `sin(now*0.0021+sd)*0.015`; 10-point gunwale outline, lower hull at 0.9/0.78 scale; wake curves and a pale ring on the water; inside planking + floor; 3 thwarts; oars shipped at the mooring, out and animated by `stroke` (sweep `sin(ph·π)`, lift `cos`) when rowing; crew drawn seated (rower faces stern, passengers the bow, a fisher faces over the side with `_fq`); near-side hull strips over their legs by `faceVis`/`faceLight`; mooring rope from stern to `tieOf` sagging to the water. Caller: drawProp kind 19 (9542); sorted into the front-most cell its hull covers (9698).

### Loop and boot
- **simulate** (12024–12040) `(dt,lite)`. `simSteps++`; `updateTime`, `updateWeather`; water: with `lite&2` accumulate and solve every ≥0.030 s in substeps ≤0.034 s, else substeps ≤0.034 s every call; `slumpStep`; `rebuildSurface` unless `lite&1`; then `updateMaterials`, `refreshIndex`, `updateGnomes`, `updateFlora`, `updateCritters`, `updateSnowmen`, `floodWatch`, `prepFade`, **`flyerStep`, `boatStep`** (v9.21), `updateParts`; every 1.2 s: `tallyShortfall`, `planEmergent`, `planVillage`, `households`; `breeding`. Each phase lapped into `SP`. Callers: frame, `__GV.simulate` (harness).
- **draw** (12042–12053) `()`. `computeAmbient`; reset transform to `dpr`, no smoothing; sky (or flat `#A9CEE7`), island, build ghost only when `MODE==='gnome' && PB.pick`, focus mark, weather; `PROF` timings.
- **ftNote** (12057–12069) `(sim,drw,total,ts)`. EMA (k=0.08) of sim/draw/frame ms; per-second peaks and fps. **Auto-degrade**: if `DBG.smooth` and `FT.draw>22 ms` after the first 4 s and not under `navigator.webdriver`, count frames; after 180 such frames step `smooth` 'grad'→'sub'→false for the session. Overlay text (`#perf`) refreshed every 8 frames when `FT.on`.
- **frame** (12070–12096) `(ts)`. rAF re-armed first; `dtr=min(0.05, Δ)`; `now=ts`; `paintCool` decay; `simAcc += dtr*T.speed`; `nsMax=clamp(ceil(speed*2.2)+4, 8, 48)`; time budget 26/13/9 ms for speed >6 / >3 / else; `lite = speed>6 ? 3 : 1`; run steps while `simAcc>=SIM_DT` and `ns<nsMax`, breaking after ≥8 steps once over budget; `rebuildSurface` once if any step ran; backlog dropped if `ns>=nsMax` or `simAcc>SIM_DT*nsMax`; `updateAudio(dtr)` in real seconds when running; `turnStep`, `keepCentre`, `followStep`, `ambientFx`, `draw`, `updateHUD`, `ftNote`.
- **seedFromHash** (12097–12100) `()` → `#s=<digits>` as uint32, else random uint32.
- **newIsland** (12101–12126) `(seed)`. Resets `store`, `villages`, ~40 `village.*` fields, `builds/gnomes/parts/stumps/marks/gorges/undoStack/snowmen/floods/boats`, `CHAN`, `strangerT`, `boatId`, all v9.21 fields; clears selection/follow/feed/events; forces **creator mode** (`PLAYER=null`, `MODE='creator'`, body class, button text 'Be a gnome'); clears the player build (`pbClear`, `PB.paused=false`, hides `#bld`, `#gbar`, census); `T.abs=0.34` (morning); `genIsland(seed)`, `seedFlora`, `seedCritters`, `initWater`, `initBackdrop`; writes `#s=<seed>` to the URL (`history.replaceState`, fallback `location.hash`); founders **Wren (f, 26)** and **Bram (m, 27)** at `world.camp` ±0.4, mated; camera: angle 0, `fitCam`, then zoom `clamp(max(fitZ*2.6,1.15), 0.9, 1.6)`, `rebuildSurface`, `centreOn(camp)`; toast "A new isle: <name>". Callers: boot, `#bNew`, `__GV`.
- **boot** (12127–12222) `()`. See §5 for the wiring. Inner closures: `show` (12136), `setSpeed` (12139, assigned to the module `let`), `turn` (12142), `up` (12159), `photo` (12182), `paintIntro` (12207). Calls `requestAnimationFrame(frame)` last (12221). Called once at 12242.
- **`window.__GV`** (12223–12241): object literal exposing ~300 internals for a harness/console (`det.js` is mentioned at 12022). Inline helpers: `rebuild`, `setTool`, `lodCS`, `setStrict`, `setBrush`, `steps`, `rngN`, `draw`, `drawGnomeAt`, `pix` (reads canvas pixels), `dpr`, `wsPoly`, `buildSea`, `buildWV`, `getSelCrit`, `setActor`, `getPlayer`, `getMode`, `setSpeed`, `getSelected`, `strangerT`, `getAC`, `gradCount`, `probeTile` (per-tile lighting/material probe), `info`.

---

## 4. Concrete rules and tuning numbers

### Calendar
- Year = 12 days (`yearOf` 11334); seasons 0 spring, 1 summer, 2 autumn, 3 winter, 3 days each; a day is 210 real seconds at 1×.
- `T.f` windows used here: flyer launch 0.30–0.42 (11473); fishing by boat 0.26–0.60 (11796); trip departure 0.24–0.31 (11805); boats turn home at `T.f>0.66` (11847, 11867); engineer only works on the flyer before 0.62 (4878).

### Flyer economy / cadence
- One flyer per year, begun in spring or summer (11355), scrapped if still unflown when winter arrives (11470).
- Cost: balloon 3 wood / 8 fibre / 2 stone; glider 8 wood / 5 fibre / 0 stone, plus a 4-wood margin over the winter reserve (11330, 11357).
- Build: 90 s of tinker time (11329), done in 16–28 s sessions.
- Kind alternates balloon → glider → balloon (11356).
- Launch window: autumn, late morning, fair weather (`rain<0.15, snow<0.2, wind<0.9, mist<0.6`, kind not storm/rain/snow) (11336, 11473).
- Gather timeout: balloon 90 s default; glider `60 + 2.5*(distances)` s (11427, 11476).
- Balloon: inflate 8 s (board at 9 s); loop radius 7 tiles starting/ending at the site; cruise altitude `max(z0+4.6, highest ground on the loop + 3.2)` levels; 1.5 tiles/s; climb over 6 s, descend over 7 s; burner every 4–7 s; deflate 6 s after a 2 s pause; crew out at 8 s; packed 20 s later (11483–11509).
- Glider: pilot carries it to the summit (`carryMax = 30 + 2.5*dist` s), waits 8 s at the summit, flies 1.6 tiles/s; route: 0.6 or 1.4 circling turns (threshold `dA<6`), max circle radius 3.2, final run 4–7 tiles, sink ≤0.45 level/tile (1.0 in the last 2), 0.35-level ground clearance, +0.3 over trees, roof heights 2.6/3.8/1.8/1.2 levels (11439–11466, 11510–11537).
- Watch ring: balloon r 2.3–3.8 round the site avoiding the envelope's lay; glider r 2.5–4.2 round the landing spot avoiding the approach; 0.9 rad gap each side (11400, 11425, 11427).
- Rewards: `scoutUntil = +3 days` (11541): boat catch +3 (11828), shore catch +1/+2 (5104), deer feeding counts double (1822); `flightFeast` makes that night's supper a feast (11581 → 4822); cheering 4 s (11543).
- Audio: burner tones rate-limited to one per 1.8 s (11584).

### Boats
- Boathouse (or slipway) when `pop>=8` and the village "fishes" (a done fisher's cabin, or any adult with ≥6 catches) — outside at 3155–3160; slipway only if no boathouse shore (3160).
- 80 s tinker time per boat, max 2 per yard (11711); boatwright = adult with the most catches (≥6) (3165).
- Water: sea tiles always navigable (deep = `E<SEA-0.15`); inland `wetD>0.3` (deep 0.45); never on bridge/dam/ice (11714).
- Boat weather: not storm, `wind<0.92`, `rain<0.85`, `light>0.32` (11792).
- Fishing: 16–24 s on station; 10 fish (5 in cold) +3 if scouting; counts as two catches for the rower (11828, 11864). Spot 1.5–4.5 tiles out along the mooring heading (11774).
- Trips: one per village per day, clear/fair/breeze only, `cold<=0.6`, needs food ≥ 2×pop in store; up to 2 passengers (children first, then the mate) within 12 old tiles; speed 1.55·S = 3.1 fine tiles/s (fish 1.2·S = 2.4); coast loop at 60 bearings 3 tiles off the last land; detours up to 7 tiles (11757, 11804, 11848).
- Boarding: 40 s window, −20 s abandon; a crew member teleports aboard after 30 s of failed pathing (11839–11842).
- Steering: 1.6 rad/s yaw, speed × `max(0.25, cos(Δheading))`, mark radius 0.35, stuck skip after 4 s (11850–11856).
- Mooring geometry: boathouse slots at frame (−0.25 | 0.85, V+2.1), slipway 1.65 out ±0.85 (11717); rope ties (11725); boarding tile within ±3 (11730).
- Slipway site: radius 24 from the fisher's cabin; 3 tiles of water in a straight line, deep at 3 (11905–11922).

### Loop
- Fixed step 1/60 s; frame dt clamped to 50 ms; `nsMax = clamp(ceil(speed*2.2)+4, 8, 48)`; budgets 9/13/26 ms; `lite=3` above 6×; water substep ≤0.034 s; planner every 1.2 s (12024–12086).
- Auto quality: draw EMA >22 ms for 180 frames → slopes 'grad'→'sub'→flat (12064).
- Speed dial 1–20×, pause remembers the dial (12134–12140).

---

## 5. UI elements, controls, input handling (boot wiring 12127–12222)

| control (DOM id, 231–314) | lines | behaviour |
|---|---|---|
| window `resize` / `orientationchange` | 12131–12132 | `resize()`; orientation re-layout after 220 ms; passive listeners |
| `#spdR` range 1–20, `#spdLbl`, `#bHalt` | 12134–12140 | dial sets `T.speed` when running; `||` toggles pause/`want` and resets `simAcc`; label `N×` / 'Paused'; `aria-pressed`; module `setSpeed(v)` for the harness |
| `#size` range 1–6 | 12141 | `brush`, `showDepth()` |
| `#bRotL` / `#bRotR` | 12142–12150 | quarter-turn snap of `cam.angT` (floor/ceil with 1e-4 epsilon), pivot kept on the screen-centre world point via `cam.turnKeep` |
| `#bFit` | 12151–12154 | toggles whole-island (`cam.free=false`, `fitCam`) ⇄ village close-up (zoom `clamp(max(fitZ*2.6,1.15),0.9,1.6)`, `centreOn(villagePos())`), toasts |
| `#bMute` | 12156–12167 | pointer long-press 600 ms → `openSoundCheck()` (click swallowed via `held`); tap toggles `muted`, label 'Muted'/'Sound', resumes a suspended AudioContext |
| `#sndX` | 12168 | closes the sound check |
| `#bNew` | 12169 | `newIsland(random uint32)` |
| `#bAdd` (+ on the gnome chip) | 12171 | `addVillager()`; stopPropagation so the chip's own click doesn't fire; re-renders census if open |
| `#hudPop` chip | 12172 | toggles the census sheet |
| `#censusX`, `#censusList` rows (`data-id`) | 12173–12174 | close; select+follow that gnome |
| `#feed` line (`.ev`) | 12176 | opens the events sheet and flies to the newest event (or closes it) |
| `#evlogX`, `#evList` rows | 12177–12178 | close; `goToEvent` |
| `#hudTime` clock pill | 12181 | `pointerdown`: double tap <380 ms toggles the `#perf` overlay; single tap (after a 400 ms timer) toggles the events sheet; `preventDefault` |
| `#bPhoto` / `#photoX` | 12182–12183, 12198 | `body.photo` hides HUD/rail/card/hint/feed/sheets (CSS 164–225), clears selection and closes the events sheet |
| `#bPlay` | 12184 | `setMode(MODE==='gnome'?'creator':'gnome')` |
| `#bBuild`, `#bldX`, `#gbPlace`, `#gbCancel` | 12186–12189 | gnome-mode build panel: open/close; a pick → ghost; Place → `pbPlace()`; Cancel → `pbClear()` + toast |
| `#bPause` | 12190–12195 | pauses/resumes the player's own project (`ownsProject`), pulling the player off it if not BUSY |
| `#bStop` | 12196 | `pbStop()` |
| `#bUndo` | 12197 | `undoStroke`; `showUndo()` sets disabled state |
| `visibilitychange` | 12199 | suspend/resume the AudioContext |
| `#lang` buttons (`data-l`) | 12214 | switch intro language, `aria-pressed` |
| `#begin` | 12216–12220 | `initAudio()` (user gesture), resume AC, fade `#intro` (`.gone`, then `display:none` after 600 ms) |

Hit-boxes for tapping the flyer: `F._box` set in drawBalloon (11610) and drawGlider (11691), consumed by the tap code elsewhere (`followAlive` accepts `o.isFlyer&&o===village.flyer`, 11289). Toasts during the flight tell the player to "tap the line at the top to watch" (11436) — the feed line (`#feed`) flies the camera to the event.

Follow-cam integration (outside, 11292–11301): a followed gnome in a flyer or boat is tracked at the flyer's/boat's height (`g.inFlyer`, `g.isFlyer`, `g.moor`).

---

## 6. MODE 'creator' vs 'gnome'

- The player's gnome is never conscripted into the crowd or crew while in gnome mode: `watchJoin` (11409), `flyOK` (11417), `startFlight` watcher loop (11430), `gliderStep` watcher loop (11515) all test `g.player && MODE==='gnome'`. (In creator mode a former player gnome, still flagged `g.player`, *can* be pulled to watch.)
- Boats exclude `g.player` **regardless of mode** (11796, 11805, passengers 11809) — the player never rows or rides.
- `newIsland` forces creator mode and resets `PLAYER` (12107); `setMode` (outside, 11252) is the switch the `#bPlay` button calls (12184).
- `draw()` only draws the build ghost in gnome mode (12049).
- CSS: `body.gnome` hides the creator tools/brush/undo and shows the gnome build row (169–181); `body.photo` hides everything.
- Gnome-mode build controls are all wired here (12186–12196) and operate on `PB` (pick/ghost/paused) and `ownsProject(PLAYER)`.
- The intro copy (12201) explains "Creator in the bar switches to Gnome" — stale: the button now reads 'Be a gnome' / 'Creator' (v9.24, 11267).

---

## 7. Progression / unlock / economy

- Flyer unlock chain: ≥8 pop → workshop (3153, needs an engineer candidate with ≥6 builds) → spring with spare materials → flyer → autumn festival → 3-day scouting bonus + feast night. Alternates kinds each year, so the second flyer type is a year-2 payoff.
- Boat unlock chain: ≥8 pop + fishing culture (fisher cabin or a ≥6-catch adult) → boathouse (or slipway if no shore) → boatwright (most catches) builds up to 2 boats at 80 s each → boat fishing (10 fish a trip, 5 in winter, +3 scouting) becomes a major food source that works at sea in winter; trips are purely flavour (one a day, no payoff beyond STATS/logs).
- Material sink: the flyer is the only thing here that consumes store materials (11360); boats cost only time.
- No persistent progression: everything resets with the island; STATS counters are write-only.

---

## 8. Persistence

- None beyond the URL: `#s=<seed>` written by `newIsland` (12115) and read by `seedFromHash` (12097); `#halt` is read at 814 (outside) to start paused. No localStorage/sessionStorage anywhere in this range; `muted`, `lang`, speed, `DBG.smooth` step-down, `FT.on` are session-only.
- Determinism: the sim is fixed-step and seed-driven so a seed replays (comment 12015–12022; `simSteps`/`rngN` exposed for `det.js`). Note `balloonStep` uses `rnd`/`chance` (seeded RNG, presumably) and `tripJob` uses `rnd` for jitter — fine as long as `rnd` is the seeded generator.

---

## 9. Mobile / touch / performance tricks

- Fixed-step sim with a per-frame time budget and step cap; backlog dropped rather than chased (12081–12086); `lite` bitmask skips surface rebuilds and halves water solves above 6× (12024–12031).
- Automatic quality step-down of slope shading when draw time stays >22 ms (12064), disabled under WebDriver so screenshots are stable.
- Perf overlay via double-tap on the clock (12181); `#perf` uses `env(safe-area-inset-top)` (CSS 157).
- `dtr` clamp 50 ms (12073) avoids spiral-of-death after tab switches; `visibilitychange` suspends audio (12199).
- Pointer-event long press (600 ms) and double-tap (380 ms) with a 400 ms single-tap delay (12158, 12181); `preventDefault` on the pill to stop synthetic clicks; passive resize/orientation listeners; orientation re-layout delayed 220 ms (12132).
- `ctx.imageSmoothingEnabled=false`, `setTransform(dpr…)` per frame (12044).
- `coastLoop` is recomputed on every `tripPath` (a 60×~100 scan + clearRun sampling) — cheap enough at one trip a day but not cached.
- Cloth pieces only bucketed when `Z>0.35` (9727).
- Line widths everywhere are `Math.max(0.5…0.9, Z*k)` so thin strokes stay visible on small zoom.

---

## 10. i18n (en/es)

- Only the intro is bilingual: `langs` (12200–12205) with `h` (title), `p` (4 paragraphs), `b` (Begin/Comenzar); `paintIntro` (12207–12213) writes `#iTitle`, `#iP`, `#begin` and `aria-pressed` on the `#lang` buttons; `lang` is a `let` inside `boot` (12206), default 'en', not persisted; `<html lang="en">` is never updated.
- Everything else is English only: all `logEv` strings (11363, 11369, 11435, 11470, 11508, 11536, 11546, 11553, 11559, 11745, 11829, 11817), toasts (11436, 12125, 12152–12153, 12189, 12193–12194), button labels ('Be a gnome', 'Muted'/'Sound', 'Paused', 12136, 12164, 12107), and the card strings in `machineDoing` (11883–11904).
- The Spanish intro references English control labels ('Fit', 'Spring', 'Creator', 'Gnome') and the English label 'Creator/Gnome' is itself stale (§6).
- Typographic apostrophes (’) and '♪' are used inline in strings (11363, 11435, 11508, 11546, 11571, 11880); `×` for ×.

---

## 11. Oddities, bugs, dead code, TODOs

1. **Stale village timers survive "New island"** (12103–12105): `village.boatT` (set at 3157 as `T.abs+0.5`), `village.minerT`, `village.hamletMoveDay`, `village.frost`, `village.thawed`, `village.danceDir/danceFlip` are not reset while `T.abs` restarts at 0.34. On a fresh island after a long game, the boathouse planner (`(village.boatT||0)<T.abs`) is blocked until the new island's clock passes the old timestamp — potentially many days. Same risk for `minerT`. Root cause: the reset list is maintained by hand field-by-field; a `resetVillage()` that rebuilds the object would be safer.
2. **Glider watchers dispatched before the re-route** (11514–11516): when the pilot stops >1.5 from the planned summit, `watchJob` has already positioned everyone with the old `avoid` bearing; `F.watch.avoid` is updated after the fact and never re-applied.
3. **`glideRoute` has no guard for `best===null`** (11450–11452): if all 12 approach bearings fall out of bounds, `best.Ax` throws inside `simulate`. Practically unlikely (land spot is ≥2 tiles inside and L≥4) but an unguarded crash path in the sim loop.
4. **Write-only state**: `STATS.flyers/flights/landings/rowboats/boatCatch/trips/tripsOut` (never read), `village.flightDay` (11431, never read), `FT.t0` (12056), `SP.audio` (never lapped), `PROF.tiles/props` (not touched here).
5. **Dead code**: `boatHomes()` (11713) has no caller except the `__GV` export; `bucketOf:null` placeholder in `__GV` (12228).
6. **Duplicate keys in the `window.__GV` literal** (12223–12241): `E0`, `PAVE`, `STEPS`, `WEAR`, `levelTile`, `mkBuild`, `placeBuild`, `stageProject` each appear twice (harmless in sloppy mode, but a linter would flag it; the whole object is a debug surface that ships to players).
7. **Magic 12** in `yearOf` (11334) instead of `SEASON_DAYS*4`.
8. **Mixed distance units**: `freeBoat` radii 22/24 are fine tiles (11791, 11799, 11806) while `tripJob`'s passenger radius is `12*12*S2` (old tiles, 11809); boat speeds are `×S` (11848) but flyer speeds (1.5, 1.6 tiles/s) are not.
9. **Naming**: `landSpot`'s `clear` counts obstacles (11391); `machineDoing` also carries the flood-section strings goDrain/drain (11886–11887); `job.F` (watch/fly) vs `job.flyer` (tinker) for the same object.
10. **Teleports by timeout**: a crew member who cannot path to the basket/boat is still boarded after `pathT>40`/`pathT>30` (11572, 11840) — the gnome snaps aboard.
11. **Intro copy drift** (12201, 12204): mentions 'Creator/Gnome' button names that changed in v9.24, and 'Spring' tool/‘Fit’ which are English in the Spanish text.
12. **`simulate` comment** (12015–12022) references an external `det.js` harness that is not part of this file.
13. `drawBalloon` uses `ctx.scale(1,kk)` after `rotate(phi)` to foreshorten the envelope (11636) — a 2-D trick that is fine but makes the mouth ellipse non-circular at steep `phi`; cosmetic.
14. `frame` calls `requestAnimationFrame(frame)` before doing work (12071), so an exception inside a frame does not stop the loop but will spam the console every frame.

No `TODO`/`FIXME` markers in the range; author notes are "Jed (date)" and version tags v9.21/v9.23/v9.24.

---

## 12. Reusable engine/shell vs gnome-specific content

### Reusable as-is (engine / shell)
- **Main loop** (`simulate`, `frame`, `SIM_DT`, `simAcc`, `nsMax`, time budget, `lite` bitmask, backlog drop) 12024–12096 — generic fixed-step simulation with speed dial. Only the list of phase calls inside `simulate` is game-specific.
- **Frame-time overlay + auto quality step-down** (`FT`, `ftNote`, `DBG.smooth`) 12056–12069.
- **Boot wiring pattern** (speed dial with remembered `want`, quarter-turn rotation with pivot keep, Fit toggle, long-press/double-tap gestures, photo mode, visibilitychange audio, census/events sheets, intro with `langs` + `paintIntro`, `#begin` as the audio-unlock gesture) 12127–12222.
- **Seed in the URL hash** (`seedFromHash`, `history.replaceState`) 12097–12100, 12115, and the shape of `newIsland` as the single world reset.
- **`window.__GV` debug surface** idea (expose internals for a harness; `setSpeed`, `simulate`, `steps`, `pix`).
- **Crowd/watch-ring placement** (`watchJob` golden-angle spread with an avoid sector) — directly reusable for "spectators gather round an event" (a proposal, a duel, a busker).
- **Vehicle kinematics**: `boatStep`'s heading-limited steering with `waterAt` collision and stuck-skip; the balloon's up/loop/down profile; `glideRoute`'s obstacle-ceiling path planning — generic "thing moves along a planned route with height" code.
- **Site search patterns** (`flyerSpot`, `landSpot`, `slipwaySite`): scan + filter + score; templates for "find a place near X with properties Y".
- **Draw helpers**: `plankSide`, the `P(u,v,dz)` local-frame projection in `drawGlider`, `_box` hit-boxes, `faceVis`-ordered hull strips, cloth-as-ground-pieces technique (`clothTiles`/`drawClothTile`).

### Gnome-specific content (replace)
- Everything about balloons, gliders, boats, slipways, boathouses, the workshop/engineer/boatwright/chief roles, fish/deer/fox scouting payoffs, feasts, 'Wren' and 'Bram', the island/sea/wetD/ICE water model, HOUSE frame geometry, all `logEv`/toast/`machineDoing` prose, `FLYER_COST`, seasons/autumn-festival timing, `NO_WATCH` state list, `BUSY` coupling, the `STATS` keys, the intro text and SVG mark, the `#size`/brush/undo terrain tools, `PB` build panel semantics.
- The whole `village.*` field zoo and the hand-maintained reset list in `newIsland`.

---

## 13. Design questions for the Parque D'Amour port (raised by this section)

1. **What is the park's "festival"?** The flyer pattern = a once-a-year build → scheduled spectacle → crowd → temporary buff. In a romance park: a seasonal fête, fireworks, a concert on the bandstand, a boat race on the lake? Who builds/prepares it, what does it cost, which season/time window, what weather cancels it, and what buff follows (couples more likely to meet for 3 days?).
2. **Who is the "pilot"?** The engineer is a role derived from stats (most builds). Which park characters hold roles (gardener, baker, busker, boatman, mayor) and how are they chosen/replaced when a character leaves?
3. **Crowd mechanics**: which character states must never be interrupted to join a crowd (the `NO_WATCH` equivalent: mid-proposal, asleep, arguing, on a date)? Does the player-avatar join crowds automatically or never (gnome mode excludes the player)?
4. **Boats on the park lake**: keep rowing boats as a date activity? `tripJob` already models "one adult takes passengers round the water on a fair day" — a two-seater romantic row is a direct reskin. What is the payoff (affection points instead of fish)? One trip a day, or per couple?
5. **Water model**: Gnome Village's boats need `SEAC`/`wetD`/`ICE` tile fields and sea vs lake branching. Will the park have a lake/canal with a fixed shape (simpler: hand-authored loop path instead of `coastLoop`)? Does it freeze in winter?
6. **Economy of spectacle**: the flyer is the only material sink here; boats cost only time. What do park events consume (money, flowers, bread), and is there a store at all?
7. **Time scale**: 210 s days, 3-day seasons, 12-day years, and all the `T.f` windows (0.24–0.31 trip, 0.30–0.42 launch, >0.66 home). What are the park's day length, opening hours, and "dusk = everyone goes home" rule?
8. **Weather gating**: `fairFlying`/`boatWeather` thresholds depend on the gnome weather model. Which park activities are rained off, and does rain create romance (shared umbrella) rather than cancel it?
9. **Player sabotage/assist hooks**: in this section the player cannot touch the flight or the boats at all. Should the avatar be able to board a boat, interrupt a launch, or block the crowd? Should Creator mode be able to trigger/cancel an event directly (a `__GV`-style `startFlight` exposed as a tool)?
10. **Mode reset on New**: `newIsland` forces Creator mode and discards the avatar. Should a new park keep the avatar identity? Should there be save/load (there is none here — seed-only replay)?
11. **Spectator placement**: golden-angle rings with an avoid sector work for an open green; a park has benches, paths and a bandstand. Should crowds use authored seats/spots instead of rings?
12. **Determinism and fast-forward**: the loop's `lite` bits skip the water solver and surface rebuilds. Which park systems are expensive enough to need a fast-forward lite path, and must the seed replay exactly (needed for a harness/tests)?
13. **Intro and language**: only the intro is bilingual and `lang` is not persisted. For a French park: en/fr (and es?), should `lang` drive all strings (a string table) and be remembered?
14. **Debug surface**: keep a `window.__PD` export for tests, but strip or gate it in production? Decide early, since duplicated/stale keys already crept in here.
15. **Feed/events sheet**: the flight toast says "tap the line at the top to watch" — the event feed doubles as the spectator camera. Should park events (first kiss, break-up) use the same feed-line-to-camera flow?
16. **Hand-maintained resets**: decide on a single `newWorld()` that rebuilds `village`-like state from a factory function, to avoid the `boatT` class of bug.
