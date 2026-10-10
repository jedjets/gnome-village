# Gnome Village review — section 19: lines 10682–10992
## "HUD, tools, input, main loop; census; clickable animals"

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`

> Note on the section label: despite the header comment at 10682 ("HUD, tools, input, loop"), this range contains **no tool handling, no pointer/keyboard input handlers and not the main loop**. Those live later (tap selection ~11225–11250, `setMode` 11252, the frame loop ~12060–12096, event wiring 12170–12185). What IS here is: the toast + overlay stacking, the event feed / event log (with fly-to), the focus pin, the weather dot palette, the sound-check panel, the `DOING` state-to-prose table, the gnome card, the HUD refresh, the census sheet, and the clickable-animal card (title/sub/relations/"doing" prose).

---

## 1. Purpose (overview)

This section is the **DOM-side presentation layer** of the game: it turns simulation state (gnomes, critters, store, time, weather) into text in fixed-position HTML overlays, and it owns the small bits of "selection" state (`selected`, `selCrit`) that the canvas renderer and the camera follow. It is almost entirely read-only against the sim; the only sim-ish writes are `cam.follow / cam.free / cam.z` (camera) and `focusMark`.

Sub-blocks, in order:

| Lines | Block |
|---|---|
| 10682–10699 | toast + `layoutOverlays()` (overlay stacking above the bottom rail) |
| 10700–10749 | event feed (1-line HUD feed), `feedAll` (harness log), `feedEv` (40-entry clickable event log), `nameIn`, `logEv`, `ageFeed`, `todName`, event-log sheet open/close/render |
| 10750–10773 | `goToEvent()` fly-to + `drawFocusMark()` canvas pin |
| 10774 | `WCOLD` weather-dot colours |
| 10775–10790 | sound check panel (`SND_CUES`, `midG`, `openSoundCheck`) |
| 10791–10807 | `DOING` — gnome state → English prose table |
| 10808–10838 | `relText()` + `updateCard()` (gnome card) |
| 10839–10862 | `updateHUD()` — throttled HUD refresh, winter larder chip |
| 10863–10871 | census helpers, `selectGnome()` |
| 10872–10972 | clickable animals: `selCrit`, `clearSel`, `selectCrit`, `critTitle/Sub/Rel/Doing/Card` |
| 10973–10992 | `renderCensus()`, `openCensus()`, `closeCensus()` |

---

## 2. Global / state variables defined or mutated here

| Name | Line | Type / shape | Notes |
|---|---|---|---|
| `toastT` | 10683 | number (seconds remaining) | set 3.4 in `toast()` 10685; decremented in `updateHUD` 10841; externally set to 6 at 11259 (gnome-mode intro toast) and 3.4 at 12130 |
| `selected` | 10683 | gnome object or null | the followed gnome; written in `updateCard` 10821 (nulls dead gnome), `selectGnome` 10869, `clearSel` 10874, `selectCrit` 10877; read by renderer 8435 (pulsing ring), build panel 11020, `setMode` 11257/11278; exported via `getSelected` 12233 |
| `hudT` | 10683 | number | HUD refresh throttle; `updateHUD` 10840/10844/10845 |
| `$` | 10684 | `(id)=>Element` | `document.getElementById` shorthand, used file-wide after this point |
| `feed` | 10701 | `[{t:string, age:number}]`, max length 1 | the single on-screen feed line |
| `feedAll` | 10702 | `string[]`, max 400 | `"<T.abs 2dp> <text>"` lines for the test harnesses; exported at 12232 |
| `feedEv` | 10708 | `[{id,text,t,day,f,o,x,y}]`, max 40, newest first | the clickable event log; `o` = subject (gnome / critter / building / boat / flyer / null), `x,y` = tile coords; cleared on reset at 12106; exported at 12231 |
| `feedId` | 10708 | int counter | `++feedId` at 10723 |
| `logActor` | 10708 | gnome / critter / null | "who is stepping right now"; set by the gnome step loop 5693 (`logActor=g`) / 5715 (null) and critter loop 2301/2366; harness `setActor` 12231. Used by `nameIn` and `logEv` to attribute events |
| `evSel` | 10708 | feedEv entry or null | highlighted row in event sheet; set 10752, cleared 10749, 12106 |
| `focusMark` | 10708 | `{x,y,hp,until}` or null | the pin over a building/place; set 10755/10760, aged out in `drawFocusMark` 10765, cleared 12106 |
| `WCOLD` | 10774 | `{kind:hex}` | weather dot colours |
| `SND_CUES` | 10777 | `[[label, fn]]` 36 entries | sound check buttons; exported 12236 |
| `DOING` | 10791 | `{state:string}` ~150 entries | gnome `g.st` → prose |
| `censusT` | 10864 | number | census re-render timer (1.2 s) |
| `selCrit` | 10873 | critter or null | the followed animal; exported `getSelCrit` 12231; also written at 11257/11278 (`setMode`) |
| `WORKING` | 10900 | `{state:1}` | gnome states that count as "working" (for the dog's prose) |
| `FIRESIDE` | 10901 | `{state:1}` | gnome states that count as "by the fire" (for the dog's prose) |
| `cam.follow`, `cam.free`, `cam.z` | 10757, 10759, 10869, 10877 | camera (declared 6333) | fly-to and selection re-aim the camera |
| `document.body.classList` | 10694 (`sheet`), 10856 (`winter`) | CSS state classes | `sheet` hides the card while a sheet is open (CSS 226); `winter` drops the feed under the winter chip (CSS 64) |

Globals **read** from elsewhere: `T` (814: `abs,f,day,season,light,ds,...`), `W` / `WK` (845/829), `SEASONS` (574), `POP_CAP=44` (575), `store` (2409), `gnomes` (1371), `critters`/`builds` (1690), `boats` (11710), `village.flyer` (2468), `cam` (6333), `cw/chh/now/ctx` (6331), `MODE` (5630), `AC`/`muted` (6055), `VOICES` (6220), `BT` (2411), `CRAFT_LABEL` (1380), `TAU` (582), `clamp01` (579).

---

## 3. Every function in the range

### 3.1 Toast and overlay stacking

**`toast(m)` — 10685.** Sets `#hint` text, adds `.on`, `toastT=3.4` s, then `layoutOverlays()`. ~43 callers file-wide (tool hints, mode changes, sound muted, etc.). Toast is pointer-events:none (CSS 158–161).

**`layoutOverlays()` — 10689–10699.** v9.9. Measures the bottom rail height (`#rail.getBoundingClientRect().height + 8`) and sets `style.bottom` of six overlays (`card, gbar, snd, bld, census, evlog`) to that, so they sit just above the rail whatever the rail's wrapped height is on this phone (10693). Toggles `body.sheet` when census or event log is open (10694) — CSS 226 then fades the card out. Computes the toast's bottom: `base+4`, or above the ghost bar (`gbar`) if on, else above the card if on, each `+10` (10695–10698). Called by toast, selectCrit, updateHUD (every 0.35 s!), census/evlog open/close, the build panel (11015/11017/11020), tap-select (11249). **Perf note:** calling `getBoundingClientRect()` three times every 0.35 s forces layout; cheap but not free on low-end phones.

### 3.2 The event feed and event log

**`nameIn(text)` — 10709–10716.** Finds the gnome whose name appears earliest in `text` as a whole word (checks the char before/after is not a letter, via charCode ranges 65–90 / 97–122, 10710/10712). Ties (same index) go to `logActor` (10714). Returns the gnome or null. Only used by `logEv`.

**`logEv(text, subj)` — 10717–10731.** The central event sink (123 external callers).
1. Push `"<T.abs rounded to 0.01> <text>"` to `feedAll` (cap 400, 10718).
2. Resolve the subject `o`: explicit `subj` if passed (may be `null` to force "the green"); else if `logActor` is a critter use it; else `nameIn(text) || logActor || null` (10719). Position: `o.x,o.y` if the subject has coords, else `villagePos(0)` (the first village's green, 10720).
3. Dedupe: if the newest `feedEv[0].text` is identical, refresh its time/subject/pos in place (10722); else unshift a new `{id,text,t,day,f,o,x,y}` and trim to 40 (10723).
4. If the event sheet is open, re-render it (10724).
5. The HUD feed: if the top line is the same text, reset its `age` and return (10725); else unshift `{t,age:0}` and **truncate to length 1** (10727, v9.15: "one slim line (it was three cards over the isle)"). Rebuild `#feed` innerHTML with `.ev` divs (HTML-escaped `&` and `<` only, 10729) and add `.on`.

**`ageFeed(dt)` — 10732–10739.** Ages the feed line(s); opacity = `clamp01(1.3 - age/14)` (10737) so a line fades out over 14 s (fully opaque until ~4.2 s). Removes `.on` when nothing is under 14 s. Called only from `updateHUD` 10842.

**`todName(f)` — 10740.** Day fraction → time-of-day word: `<0.18 Night, <0.28 Dawn, <0.44 Morning, <0.56 Midday, <0.68 Afternoon, <0.82 Dusk, else Night` (v9.23: dusk starts at the lamp hour). Used by HUD and event log.

**`evOpen()` — 10741.** `#evlog` has `.on`.

**`evNote(e)` — 10742.** If the event's subject looks like a gnome (`o.name && o.stage`) but is no longer in `gnomes`, returns `' · <name> is no longer on the isle'`, else ''.

**`renderEvLog()` — 10743–10747.** Fills `#evList` with one `<button class="row" data-id>` per `feedEv` entry: `<small>Day N · <todName> [· just now] [evNote]</small><span>text</span>`. "just now" when `T.abs - e.t < 0.03` days. Empty-state text "Nothing has happened yet." The selected row gets `.sel`.

**`openEvLog()` — 10748.** Closes the census first (mutually exclusive sheets), adds `.on`, scrolls to top, renders, re-layouts. **`closeEvLog()` — 10749.** Removes `.on`, clears `evSel`, re-layouts.

Wiring (outside range, 12176–12181): tapping the feed line opens the sheet and flies to `feedEv[0]` (or closes it if open); tapping a row flies to that event; a single tap on the clock pill toggles the sheet (double tap toggles the perf readout).

### 3.3 Fly-to and focus pin

**`goToEvent(e)` — 10751–10762.** Sets `evSel=e`, then by subject type:
- gnome still alive → `selectGnome(o, true)` (quiet, no toast) 10753;
- critter still alive → `selectCrit(o, true)` 10754;
- a boat (`boats.indexOf(o)>=0`) or the flyer (`o.isFlyer && o===village.flyer`) → v9.21: follow its pilot (flyer: `o.pilot` with `pilot.inFlyer===o`) or first crew member (`crew[0].inBoat===o`) if manned, else `clearSel()` and `cam.follow=o`, `cam.free=true`, zoom to at least 1.5 (10755–10757);
- anything else: `clearSel()`; if the subject is a building, follow the building itself, else follow a synthetic point `{x,y,pt:true}` (10758–10759); zoom to ≥1.5; set `focusMark={x,y,hp,until:now+5200}` where `hp` (pin height) = 40 for a house/windmill/lodge, 22 for other buildings, 12 for a bare place (10760).
- Re-render the sheet if open (10761).

**`drawFocusMark()` — 10764–10773.** Called from the draw pass (12050). Draws a map-pin (triangle + circle + white dot, radius `s=7` px, colour `rgba(74,68,88,0.9)`) at `screenOf(x,y,topAt(x,y))`, raised by `hp*cam.z + 10` px, bobbing `sin(now*0.005)*3`. Alpha fades in over the first 250 ms and out over the last 700 ms of the 5.2 s life (10766). Self-clears when expired or if `left>6000` (guard against a clock jump).

### 3.4 Weather dot palette

**`WCOLD` — 10774.** `clear #F3D9A8, fair #DCE9F2, cloudy #C8CCDA, rain #9FBCD4, mist #DDE2E8, snow #EFF4FA, breeze #CDE3D8, storm #6E7A9A`; fallback `#DDD` at 10850.

### 3.5 Sound check panel (debug/QA tool)

**`SND_CUES` — 10777–10784.** 36 `[label, fn]` pairs, each playing one sfx at `midG()` (centre of the view): chop, knock, tap, drop, eat, moan, hup, splash, yell, oh-oh (panic), help, creak, giggle, snicker, murmur, comfort, tree falls, thud, bridge goes (crash), built, thunder (rumble, no position), baby, leaving, music box (tune), burner, yip, owl, dove, cricket, stream (6× `burble` at 140 ms), rain (10× `plip` at 90 ms), fire (4× `firePop` at 300 ms), and six bird voices `VOICES[0..5](0,0.024)` (robin, warbler, thrush, chiffchaff, blackbird, wren).

**`midG()` — 10785.** Tile under screen point `(cw/2, chh*0.45)` or the village position. Returns `{x,y}`.

**`openSoundCheck()` — 10786–10790.** Lazily builds one `<button>` per cue into `#sndRow` (only on first open); each click does `initAudio()`, resumes a suspended `AudioContext`, and either toasts "Sound is muted" or plays. Opened by a **600 ms long-press** on the mute button (12158). Hidden QA feature.

### 3.6 `DOING` table — 10791–10807

Gnome `g.st` → English present-participle phrase, ~150 keys. Covers idle/wander/follow/haul, resource jobs (goEat/goBush/pickB/goFish/fishing/goChop/chop/goQuarry/quarry/goFibre/fibre/goBuild/building/goTinker/tinker), sleep/warmth, saplings, courting, traps, disasters (flee/heave/dig/yelp/swept/float/help/shiver/goRescue/comfort), weather shelter/huddle, stories, play (chase/hide/stones/skip), supper/chat, hat-boat, garden tend/harvest, farewells/adventure, animal states that double as gnome states (walk/hop/graze/drink/toWater), bonfire dance, snowman, paddle, chaseR, well/water, honey, rabbit catch/pen/fold, herding/shearing, feeding wild animals, mounting the deer, dog/horse care, dog states (prowl/circle/turn/dogRest/dogHome/bark), deer states (ridden/stabled/toStable/cartBack). Fallback at 10830 is the raw state key. Several animal-only keys live here as well (used only via `DOING[g.st]||g.st` for gnomes, so they are effectively dead entries for gnomes — see oddities).

### 3.7 Gnome card

**`relText(g)` — 10809–10817.** v9.17. Builds `partner X · parent(s) A & B · child(ren) C, D` from living relatives (`alive` = still in `gnomes`). If nothing: an adult non-player without mate → `'came ashore alone — looking for a partner'` if `g.stranger`, else `'single'`; a non-adult stranger → `'came ashore'`. Exported 12233.

**`updateCard()` — 10818–10838.** If `selCrit` is set: drop it if dead, else `critCard()` and return. Else `g=selected`; if gone, hide card. Fills:
- `#cRel` = `relText` (hidden when empty) 10823;
- `#cName` = name + `' · you'` for the player 10824;
- `#cSub` = `she|he · stage [· chief] [· role] [· of the hamlet] · age d` where role = engineer (workshop) / boatwright / miner (lives in miner's hut) / `CRAFT_LABEL[craftOf(g)]` 10825;
- three bars via `set(id, v, colour)` 10826: Full = `1-hunger` (pink `#E4899F` when hunger>0.7 else green `#8CBE85`), Rested = `energy` (orange `#F2B67E` when <0.25 else blue `#A6C7E8`), Warm = `warm` (blue when <0.3 else orange);
- `#cDo` = the "doing" line 10830–10837: player in gnome mode idle/wander → `'waiting for your tap'` / `'walking where you tapped'`; else `DOING[st]||st`; overrides: `swim>0.5` (not swept) → 'swimming across'; `climb` → 'climbing'; `machineDoing(g)` (v9.21 balloon/glider/boat) wins; suffix `' in the tent|cabin|<houseLabel>'` when inside; `', hat in hand'` when `hatHand` and outside; `' — the deer and the cart'` / `' — on the deer'` when riding (v9.17); `' — carrying <carry>'`.
Callers: `updateHUD` 10860, `selectGnome` 10870, `selectCrit` 10878, `setMode` 11258/11278.

### 3.8 HUD refresh

**`updateHUD(dt)` — 10839–10862.** Called once per frame from the loop (12094) with real seconds `dtr`.
- Every frame: `hudT-=dt`; toast countdown and hide at 0 (10841); `ageFeed(dt)` (10842); if the census is open, re-render it every `censusT=1.2` s (10843).
- Throttled to every **0.35 s** (10844–10845): `#tTime`=`todName(T.f)`; `#tDay`=`'Day N · <SEASONS[season]>'`; `#tWx`=`WK[W.kind].label`; `#wdot` background = `WCOLD[kind]`; `#tPop`=gnome count; `#tRes`=`'food F · wood W · stone S · reeds R'` (floored).
- **Winter larder chip** 10854–10859: shown when `(season===2 && T.ds>1.2) || season===3` i.e. from day ~1.2 of autumn through winter. Targets: `needFood = pop*5+12`, `needWood = pop*4+16`. Text `'Winter'|'Before winter' · 'larder full'` if both met, else `'food f/nf · wood w/nw'`. Adds `.short` (red text, CSS 43) when either is **below half** the target. Also toggles `body.winter` (feed moves down, CSS 64). The `el.hidden===show` test only flips the DOM when the state changes.
- Then `updateCard()` if something is selected, `updateGrow()` (build panel affordability, 10995) and `layoutOverlays()`.

### 3.9 Census

**`esc(s)` — 10865.** Escapes `&` and `<` only (not `>` or quotes — fine for text nodes, not for attributes).

**`censusOpen()` — 10866.** `#census` has `.on`.

**`selectGnome(g, quiet)` — 10867–10871.** Guards against dead gnome. Clears `selCrit`, sets `selected`, `cam.follow=g`, `cam.free=true`, zoom to at least **1.8** (v9.24: "near enough to see what they do"), `clampCam()`; card on (not `.crit`); `updateCard()`; toast `'Following <name>'` unless quiet. Callers: tap select 11247/11248, census row 12174, goToEvent 10753.

**`renderCensus()` — 10973–10990.** Sorts gnomes oldest-first; for each: a `<button class="row" data-id>` with `<b>name[ · you]</b><small>she|he · stage [· chief] [· miner | · craft] [· hamlet] · age d</small><small class="r">rel · home</small>`. `home` = tent/cabin/house label if `homeOf(g)`, else `'with the family'` for baby/child, else `'raising a <BT[type].label>'` if the gnome owns an unfinished home project, else '' for the player, else `'no home yet'`. Counts adults/elders/children/babies, couples (counted once via `g.id<g.mate.id`), and singles (adult, non-player, no living mate). Summary: `'N on the isle · a grown, b elders, c children, d babies · k couples · s waiting for a partner · room for (POP_CAP-N) more'` (POP_CAP=44). Selected row gets `.sel`.

**`openCensus()` — 10991.** Closes the event log first, `.on`, `censusT=1.2`, render, layout. **`closeCensus()` — 10992.** Remove `.on`, layout. Wired at 12171–12174: the population chip toggles it; its `+` button calls `addVillager()` and re-renders; a row tap `selectGnome` + re-render.

### 3.10 Clickable animals (v9.20)

**`clearSel()` — 10874.** Nulls both selections and hides the card (removing `.crit`). Does NOT touch `cam.follow` (callers do).

**`selectCrit(c, quiet)` — 10875–10880.** Mirror of `selectGnome` for a critter: `selected=null; selCrit=c`, camera follow + zoom ≥1.8, card gets `.crit` (hides the three bars, CSS 227), toast `'Watching the <title>'`. Caller: tap select 11246.

**`gname(o)` — 10881.** Name if `o` is a living gnome, else ''.

**`critTitle(c)` — 10882–10886.** fox: `Dog` (tame) / `Fox cub` / `Fox`; deer: tame → `Foal` / `Horse`, wild → `Fawn` / `Stag` (antlers) / `Deer`; rabbit: in fold → `Kit of the fold` / `Rabbit of the fold`, else `Young rabbit` / `Wild rabbit`.

**`critSub(c)` — 10887–10894.** fox: `tame · the village dog` or `wild [· fed n of 3 days]`; deer: `tame · stabled by the farm|no stable yet` or `wild [· fed n of 3 days]`; rabbit: `tame · wool NN%` (fold) or `wild`; `· young` if `c.young!==undefined`. **Rule exposed:** taming a fox or deer takes **3 fed days** (`c.fed` of 3).

**`critRel(c)` — 10895–10899.** tame fox: `goes about with <master> · tamed by <tamer>` (tamer omitted when same as master); tame deer: `tamed by <tamer>`; else ''.

**`critDoing(c)` — 10902–10965.** The big prose switch:
- *Tame fox (dog)* 10903–10918: `being patted by X` if someone is in `patDog` on it; then by `c.st`: heel (`trotting at heel with`/`at heel with` M), catch, lie (`lying by the fire with M` if master in `FIRESIDE`, `lying by M while she/he works` if in `WORKING`, else `lying at M's feet`), waitDoor, waitBank, dogHome (to the kennel / the fold / M's door / the village), dogRest (`asleep` when `T.light<0.35` else `resting`, at kennel/fold/door/village), circle, turn, bark; fallback `about the village`.
- *Wild fox* 10919–10931: carrying a rabbit (`for a prank` to sea/river if `c.prank`), food left for it (`eating`/`creeping up to the <kind>`), lieup (`curled up` if `T.light<0.45` else `asleep in the bracken`), toLieup, prowl/walk → `prowling in the dark`, chaseR → `hunting a rabbit`, raid → `creeping up on the fold`, flee, eat; fallback `about the wood`.
- *Deer* 10932–10949: ridden (`pulling the cart for` / `carrying` rider, `and a load of <carry>`), `being groomed by X`, food left for it, tame states (stabled: `asleep in the stable` if `T.light<0.4` else `in the stable, out of the weather`; toStable; cartBack; walk/graze `by the stable`), wild states (graze: `in the dark` if `T.light<0.3` else `at the wood's edge`; walk; toWater; drink; flee → `bounding away`; eat); fallback `about the wood`.
- *Rabbit* 10950–10964: held (in the fox's mouth / in a gnome's basket), swept → `paddling to the bank`, in a fold (hutch: `asleep` if `T.light<0.35`; out with the flock with herder named; else in the pen), nibbling a named owner's garden, scared (`bolting` / `frozen still, ears up`), hopping (toward a garden if raiding), fallback `nibbling the grass [in the dark]` (`T.light<0.45`).
Exported 12231.

**`critCard(c)` — 10966–10972.** Fills `#cName/#cSub/#cRel/#cDo` from the four helpers; adds `.crit`.

---

## 4. Concrete rules and tuning numbers

| What | Value | Line |
|---|---|---|
| Toast duration | 3.4 s (6 s for the gnome-mode intro, 11259) | 10685 |
| Overlay stacking gap above rail | rail height + 8 px; toast +4 / +10 above card or gbar | 10691–10698 |
| HUD feed lines shown | 1 (v9.15) | 10727 |
| Feed fade | opacity `1.3 - age/14`, dead at 14 s | 10737 |
| `feedAll` cap | 400 lines, time rounded to 0.01 day | 10718 |
| `feedEv` cap | 40 entries | 10723 |
| "just now" in event log | `T.abs - e.t < 0.03` day | 10746 |
| Time-of-day bands (fraction of day) | Night <0.18, Dawn <0.28, Morning <0.44, Midday <0.56, Afternoon <0.68, Dusk <0.82, Night | 10740 |
| Fly-to zoom floor | 1.5 (events), 1.8 (direct select) | 10757/10759, 10869/10877 |
| Focus pin life / heights | 5200 ms; fade-in 250 ms, fade-out 700 ms; hp 40 house/windmill/lodge, 22 other build, 12 place; radius 7 px; bob ±3 px at 0.005 rad/ms | 10760, 10766–10767 |
| HUD refresh period | 0.35 s | 10845 |
| Census re-render while open | every 1.2 s | 10843, 10991 |
| Winter chip window | autumn after `T.ds>1.2`, and all winter | 10855 |
| Winter larder targets | food = pop×5+12, wood = pop×4+16; `.short` when < 50 % of either | 10857–10859 |
| Bar colour thresholds | hunger>0.7 pink; energy<0.25 orange; warm<0.3 blue | 10827–10829 |
| Swimming label | `swim>0.5` | 10831 |
| Taming | `fed n of 3 days` | 10889–10890 |
| Dog asleep / fox curled / deer asleep / rabbit dark | `T.light<0.35` / `<0.45` / `<0.4` / `<0.3` and `<0.45` | 10912, 10925, 10941, 10947, 10956, 10964 |
| POP_CAP | 44 ("room for N more") | 10989 (const at 575) |
| Sound-check bursts | stream 6×140 ms, rain 10×90 ms, fire 4×300 ms, birds gain 0.024 | 10782–10784 |
| Sound check open | 600 ms long-press on mute (12158) | 10786 |

---

## 5. UI elements, controls, input

DOM touched (defined 231–264): `#hint` (toast), `#rail`, `#card` (`#cName #cSub #cRel #cHun #cEne #cWar #cDo`), `#gbar`, `#snd` / `#sndRow`, `#bld`, `#census` / `#censusSum` / `#censusList`, `#evlog` / `#evList`, `#feed`, HUD chips `#tTime #tDay #tWx #wdot #tPop #tRes #hudWin #tWin`.

Input handled **in this range**: only the dynamically created sound-check buttons (10788). All other input (feed click, evList click, census chip/row, clock pill tap/double-tap, canvas tap-select) is wired at 11225–11250 and 12170–12185 and *calls into* this section. Pattern: sheets are `<button class="row" data-id>` lists with a single delegated click listener on the container (`e.target.closest('.row')`).

Mutual exclusion: census and event log close each other (10748, 10991); the card is hidden (CSS `body.sheet`) while either sheet is open (10694). Photo mode hides everything (CSS 63/164/207/225).

---

## 6. MODE 'creator' vs 'gnome'

- 10830: in `gnome` mode the player's own gnome gets `'waiting for your tap'` / `'walking where you tapped'` instead of the `DOING` idle/wander prose. That is the **only** mode check in the range.
- Everything else is mode-agnostic; CSS `body.gnome #card` (173–178) re-lays the card as a compact wrapped strip in gnome mode, and `relText`'s 'single' wording excludes the player (`!g.player`) in both modes.
- `setMode` (11252, outside) writes `selected`/`selCrit` directly and calls `updateCard()`, bypassing `selectGnome`.

---

## 7. Progression / unlock / economy

None is *defined* here; it is *displayed*: resource totals (10852), the winter-readiness target (pop×5+12 food, pop×4+16 wood — "what the village itself aims for"), population vs `POP_CAP`, taming progress (`fed n of 3`), wool % on fold rabbits, roles (engineer/boatwright/miner/craft) and homes. `updateGrow()` (10995) is called from `updateHUD` so the build panel's affordability follows the store.

## 8. Persistence

None. No localStorage/sessionStorage; `feedAll` is in-memory only (for harnesses). Everything is rebuilt from the sim each refresh. Reset (12106) clears `feedEv`, `feed`, `evSel`, `focusMark`.

## 9. Mobile / touch / performance tricks

- Overlay positions are computed from the **measured rail height** (10691) so wrapped rails on narrow phones do not overlap the card/toast; CSS also uses `env(safe-area-inset-bottom)`.
- HUD text is refreshed only every 0.35 s; the census only every 1.2 s; the feed is a single line to keep the isle visible (v9.15).
- Event sheet rows are plain `<button>`s (tap targets) rendered via one `innerHTML` assignment.
- `openSoundCheck` builds its buttons lazily once.
- Audio: every cue click calls `initAudio()` and `AC.resume()` — the iOS "unlock audio on user gesture" pattern (10788).
- `hidden===show` test (10856) avoids churning the DOM every tick.
- Minor cost: three `getBoundingClientRect` reads per `layoutOverlays`, which runs every 0.35 s and on every toast.

## 10. i18n (en/es)

The intro screen has an EN/ES toggle (`#lang`, DOM 309–311; `lang` variable and `paintIntro()` at 12212–12214) but **nothing in this range is localised**: every string — `DOING`, `todName`, census summary pluralisation (`' elder'/' elders'` etc.), `critTitle/Sub/Rel/Doing`, the toast texts, `'Day '`, `'food … · wood …'`, `WK[].label`, `SEASONS` — is hard-coded English, with English grammar baked into string concatenation (possessives `'’s'`, `she/he`, `' & '`, plural suffixes). Porting to a bilingual game needs a message-table layer here.

## 11. Oddities, bugs, dead code, TODOs

1. **Misleading header** (10682): says "tools, input, loop" but neither tools nor input nor the loop are here.
2. **TDZ-ish ordering**: `selCrit` (10873) and `censusT` (10864) are `let`s referenced by functions defined above them (`updateCard` 10819, `updateHUD` 10843, `selectGnome` 10869). Safe only because those functions are first called after the whole script has run; any top-level call before 10873 would throw a ReferenceError.
3. **`nameIn` early `break`/`continue` logic** (10712–10713): the `while` condition is `k<=bi`, so once a match is found at index > `bi` it stops; combined with `if(k<0||k>bi) continue` this is correct but opaque. Also it matches **any** gnome name appearing anywhere in the line, so an event like "Pip saw Mo" attributes to whichever name appears first — intended ("the first gnome it names").
4. **Word-boundary test is ASCII-only** (10710): a name followed by an accented letter would count as a boundary. Harmless for English names; matters for a French/Spanish port.
5. **`esc()` and the feed's inline escape** (10729) escape only `&` and `<`; OK for text nodes, but `data-id` attributes are built from numeric ids so no injection. The gnome name goes through `esc` in census/evlog but **not** in `#cName.textContent` — that is fine (textContent).
6. **`DOING` contains animal-only keys** (walk/hop/graze/drink/toWater/prowl/circle/turn/dogRest/dogHome/bark/eat/raid/ridden/stabled/toStable/cartBack): gnomes never take those states, and `critDoing` does not use `DOING`, so these entries are dead weight (and the comment-free table is ~150 keys long).
7. **`WORKING`/`FIRESIDE`** (10900–10901) are used only for the dog's "lying by M" prose.
8. **`evNote`** (10742) detects "is a gnome" by duck-typing `o.name && o.stage` — a critter has no `stage`, fine, but any future object with both fields would be mislabelled.
9. **`goToEvent` for a dead critter/gnome** falls to the final `else` and follows the event's remembered `x,y` as a point, with a 12 px pin — reasonable fallback, undocumented.
10. **`drawFocusMark` `left>6000` guard** (10765) — defensive against `now` being reset; `until` is set with `now+5200` so this can only trigger if `now` goes backwards.
11. **Winter chip `nf/nw` duplicated**: the same formula presumably exists in the AI's own "aim" (comment says "what the village itself aims for") — risk of drift if one copy changes. Worth checking the planner section.
12. **`layoutOverlays` runs every HUD tick** even when nothing changed — could be done only on rail resize/orientation change plus open/close.
13. **Pluralisation** is hand-rolled per noun (`elder/elders`, `child/children`, `baby/babies`, `couple/couples`, `parent/parents`, `child/children`) — not reusable across languages.
14. No TODO/FIXME markers in the range; version tags present: v9.9, v9.15, v9.17, v9.20, v9.21, v9.23, v9.24.

## 12. Reusable engine/shell vs gnome-specific

**Reusable as-is (shell):**
- `$` helper, `toast()` + `#hint`, `layoutOverlays()` rail-stacking pattern and the `body.sheet` / card-hiding convention (10684–10699).
- The three-tier event system: `feedAll` (test log), `feed` (1-line HUD), `feedEv` (40-entry clickable log with subject + position) — `logEv/ageFeed/renderEvLog/open/close/goToEvent/drawFocusMark` (10700–10773). Only the subject-resolution rules (`gnomes/critters/boats/builds/village.flyer`) and the pin heights need a game-specific hook.
- `todName` band table (10740) — keep the structure, change bands/labels.
- Throttled `updateHUD` skeleton with 0.35 s tick and the `hidden===show` idiom (10839–10862).
- `select<Thing>` / `clearSel` / camera-follow-and-zoom pattern and the `.crit`-style card variant (10867–10880).
- Census sheet pattern: sorted list of `<button class="row" data-id>` + summary line + delegated click + periodic re-render (10973–10992).
- Sound-check panel scaffold (10777–10790) — a good QA tool for any audio-heavy game; just swap the cue list.
- `esc`, `gname`-style "living-reference" guards (`indexOf>=0`), `relText`'s "only count relatives still present" idiom.

**Gnome-specific (content):**
- `DOING` prose table (10791–10807), `WORKING`/`FIRESIDE` sets, `WCOLD` palette keyed to this game's weather kinds, `SND_CUES` list, the three card bars (hunger/energy/warm) and their thresholds, the winter larder chip and its food/wood formula, the `#tRes` resource line, `relText`'s family model, role labels (engineer/boatwright/miner/craft/chief/hamlet), the whole `critTitle/Sub/Rel/Doing` animal vocabulary (fox/dog, deer/horse, rabbit/fold), census home labels (tent/cabin/house, "raising a …"), POP_CAP.

## 13. Design questions for the Parque D'Amour port

1. What are the **selectable entities** (the couple, passers-by, the avatar, park features like benches/fountains/kiosks)? Each needs a `title/sub/rel/doing` quartet like `critTitle/critSub/critRel/critDoing`.
2. What replaces the three **card bars**? (e.g. affection / mood / suspicion for the lovers; stamina for the avatar). What colour thresholds signal "bad"?
3. What is the **"doing" vocabulary** — the full list of behaviour states for lovers, rivals, park staff, the avatar — and do they need mode-specific wording like `'waiting for your tap'` in avatar mode?
4. What goes in the **top HUD chips**: time of day, day/season, weather, a "romance meter" instead of population, and what replaces the resource line (money? reputation? bouquets?) and the seasonal "winter readiness" warning (e.g. a countdown to a date, a sabotage alert)?
5. Should the **event log subject rules** be: the person the line is about → the object → a place in the park? Which objects deserve a tall pin (bandstand, café) vs a short one?
6. Is a **census** still meaningful (a "who's in the park" list of visitors with relationships: couple, rival, friend) and what is its sort order and summary line?
7. Which **relationships** does `relText` need: partner, ex, rival, confidant, chaperone — and are they symmetric?
8. **Language**: the game is French-themed and the file has an EN/ES toggle. Do all these prose tables need en/es/fr variants, including gender agreement (il/elle, el/ella) and plural rules — i.e. should `DOING`, `todName`, census summary and card text move to a message catalogue from day one?
9. **Avatar vs Creator** mode: should selecting an entity differ by mode (e.g. in avatar mode you can only follow yourself and the lovers; in Creator mode anything)? Should the camera zoom floors (1.5 / 1.8) be the same on a park-sized map?
10. **Sound check**: which cues exist (accordion, fountain, pigeons, kiss, slap, bicycle bell) and should the QA panel stay behind a long-press?
11. **Assist vs sabotage**: does the event log need a visual tag per line (helped / hindered) or a filter, and should the toast colour/tone differ for sabotage outcomes?
12. Should the feed stay one line, or does a romance game want a short dialogue strip (2–3 lines) since "what they just said" is the core content?
13. Do sheets stay mutually exclusive (census vs events), and does the park need a third sheet (e.g. a "plan" or "sabotage kit")?
14. Persistence: the gnome game keeps nothing; does the park need to save the event log / relationship state between sessions?
