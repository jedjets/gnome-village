# Gnome Village review — section 02: lines 315-610
## "Script header: version history + top-level constants"

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Range read line by line: 315-610 (296 lines). Peeked outside the range only with grep to resolve symbols.

---

## 1. Purpose of the section

Three things happen here, in order:

| Lines | What |
|---|---|
| 315-317 | `<script>` opens, then `(function(){` and `'use strict';` — the **entire 12k-line game is one strict-mode IIFE**. Nothing leaks to `window` except whatever the harness object near line 12227 exposes. |
| 318-566 | A single block comment: the **v9 design narrative / changelog**, v9 → v9.19. It is written as prose by/for the owner ("Jed"), and reads as the design document for the whole file. |
| 567-609 | **Top-level constants and pure helpers**: grid size, projection sizes, height/sea levels, clock, population cap; math helpers; two seeded PRNG streams with a draw counter; value noise + fBm; colour helpers. Line 610 is blank. |

No DOM, no event handlers, no game state arrays live in this range (those start at line 611 `/* ---------- the island ----- */`).

---

## 2. The version narrative (318-566) — what it says, entry by entry

The comment is the only place the file explains *why* things are the way they are. Each entry, with the line it starts on and the concrete rules/numbers it states. (These numbers are **narrative claims**; the code that implements them is elsewhere in the file — line refs given where I resolved them.)

- **v9 (319-324)** "the river that digs": 72×72 fine isle; water has momentum, carries sediment, cuts channels/gorges, drops sand, wanders over soft ground. Ground is a smooth surface (tile corners share vertex heights). Everything the gnomes build grows out of what they do.
- **v9.1 (325)** gnome scale "a little over half a level tall"; tools with wind-up/strike/rest; paths under feet; elbow room; no corner-cutting off a river bank.
- **v9.2 (328)** real construction from carried logs/stones/reeds: fire = ring of stones + 3 logs; cabin = corner stones → wall courses → chimney → roof frame → thatch → door. Ground rising in front of a walker no longer hides feet; personal space measured on screen.
- **v9.2.1 (333)** painter's-order fix: walkers drawn after any front tile covering feet/knee/shadow; canopy with a gnome behind goes see-through.
- **v9.3 (335)** households: couple's tent → cabin built "over a few days" (cobble footing + chimney wall, round logs, shingled roof, windows, hearth smoke). **Children only in a cabin, two at a time, grown at two years**; grown leave, pitch a tent, wait for a partner (a stranger comes ashore if needed); **at seven years** a walk to the shore and a boat (death = departure). **Ground can be dug no deeper than one level under the sea** (→ `DIG_FLOOR`, 572).
- **v9.4 (342)** everything piece by piece incl. bridges, dams, mill; storms; a spate can carry a log bridge away; snow line comes down the hill; couple's small works: flagstone path, picket fence, kitchen garden; farewell at the shore.
- **v9.5 (346)** no drawn footfall tracks; only laid stone shows (flagstones set along paved neighbours). Ground painted as one continuous field: slope smoothed over vertices, soil/sand/damp read across neighbourhood, colour blended with 4 neighbours. Built things drawn after the ground in front.
- **v9.6 (355)** surface smoothing only where water corrugated it; water blended with neighbours, no half-pixel fattening; shore = damp sand + breathing foam band + non-lattice glints.
- **v9.7 (362)** "the review build": storm cloud bank rolls in **over half a minute**; rain/snow; tree phenology (bud, blossom, leaf, thin, bare+snow); tufts/clover/pebbles thinned where walked; contact shadows; valley shade; sky reflections. Steep tile shaded "a gradient, **or four flat fills on a slow phone**" (perf fallback). Coast keeps fine shape at Fit view. **Feed names the player's hand** (channel you cut, etc.). **Winter chip** counts larder vs frost from mid-autumn. Gnomes tally work → card names a craft → craft biases work choice. Originals: rope bridge over a gorge; unreachable target given up for a while; windmill when no river to dam; mine shaft with halls seen in X-ray. **Long press on Sound opens a sound check.**
- **v9.7.1 (382)** "from the phone": sea = flood from map edge over ground ≤ sea level (so an inland pit is a pond, not sea); sea floor never drawn; sea tile water fades to the sea plane colour with depth; smoke rises; chimney stack last; **no name plates**; a tree hides what's behind it.
- **v9.8 (391)** constructs redrawn in world space (log bridge 3 lashed logs, plank bridge, rope bridge, dam with spillway, mill with wheel, windmill sails, fish trap cone, steps, fire ring, woodpile). Bridge/dam **runs on a tenth of its span** past the water onto flat ground; end tiles (+1) dug/banked level by builders; ramp of steps at lower end; home footprint + ring cut to a platform. **Mines and X-ray removed.** Bank = spline through contour midpoints. **Player can be a gnome: Creator/Gnome switch in the rail; tap ground walks, tap tree/rock/berries/water/site/fire works or rests; hunger, cold, tiredness still bite; back to Creator → the gnome lives on as a villager.**
- **v9.9 (413)** sea is one opaque two-tone marching-squares sheet (shoreline contour + a band contour 1.5 tiles out). **Overlays stack from the rail up, measured, so the card never covers buttons and a toast never covers the card; the card is a strip in gnome mode.** **Build in the rail (gnome mode) opens a panel of the nineteen things the village can build; ghost footprint follows taps, green/red with a reason; Place makes a player project built by the player's gnome alone; Pause and Stop; a tent/cabin placed while homeless is the player's, any other home the village's.**
- **v9.9.1 (426)** water sheet lifted to drawn ground; opaque; tiles overlap by most of a pixel; at night water tinted toward sky and all whites lit.
- **v9.10 (436)** built things depend on the ground under them: dig/raise under footprint/landing/pier/dam bed → collapse, salvage back to pile, people on it fall in the water, workers re-task. **Gap decides bridge type: felled log ≤3 tiles, planks on piers ≤6, rope bridge ≤10, dressed-stone arch ≤14** (also crosses a strait cut through the isle).
- **v9.11 (446)** **speed dial 1x–20x with pause**; sound keeps real-time pacing (cue gaps widen with speed: at 20x you hear one chop of twenty); ambient sounds driven by frame not sim. **Past 6x**: drawn surface rebuilt once per frame; water stepped every other tick with double step.
- **v9.11.1 (454)** water-edge fixes: sheet lift bounded by real water at that corner; shoreline field nudged by real water height (continuous) instead of quarter-step wet share.
- **v9.12 (467)** owner quote: *"I want the water to always be smooth and bubbly and soft. Not block like and distinct."* Inland water as soft round blobs, feathered rim over half a tile.
- **v9.13 (477)** blobs → one ribbon along a skeleton (tile centres to 8 wet neighbours), distance field on a 2× finer grid blurred a tile wide, cut back to the waterline; marching squares on 4 quarter-cells with one Catmull-Rom curve.
- **v9.14 (491)** dams/bridges end on `wetDrawn`-dry ground (`wetDrawn` defined line 693) and run past; dam holds a pond: wall `DAM_RISE` above river (= 0.35, line 3596), ends banked above crest, dyke across low banks; every footprint/landing levelled by a gnome with a spade ('level' pieces, `EARTH` of a level max = 0.6, line 3596). Function of buildings: **hearth halves the fire's wood; lantern keeps builders an hour past supper; fence keeps rabbits off the garden; windmill grinds flour by day and lights lamps at night; waterwheel saws.**
- **v9.15 (506)** rain drawn as drops + splashes; `W.wet` wetness (W object line 845); puddles; lightning flash + rumble; `DBG.shadows` (DBG at 12041); `RELAX` pit slumping (1309); 3 tree species; autumn colours; fence with gate; raised beds; faces/hands; slimmer chrome; water gradient `wvertCol` (9520), **opaque from 0.18 deep**; ponds freeze from banks; radial push of ground quads.
- **v9.16 (521)** angle/zoom QA; undo restores collapsed builds; rope bridge over sub-sea gorge; lanterns scale with village.
- **v9.17 (527)** **"+" on the gnome chip calls a stranger ashore** (opposite sex to whoever waits); **partner arrives exactly one day after coming of age/ashore alone, strangers a few hours apart**; card shows who is who; gnome chip opens a census. Midsummer bonfire dance with music box; harvest supper; children build snowmen/paddle/chase rabbits. Beehive → honey in autumn; well waters gardens in dry spell. Farm: rabbit fold (pair caught with basket, bred, grazed, sheared each spring); **fox fed fish for three days = dog** with kennel (turns strays, sees off foxes); **deer fed apples = horse** with stable, **3 loads a trip at 1.5× speed**, cart **6 loads along flagstones**. Fire is its own light.
- **v9.18 (543)** more visual QA (deer neck, fox, fleece, hutch roof, dance direction, lamp positions, lantern pane, spillway night light, snowman rim).
- **v9.19 (553)** "from Jed's phone": garden box sides reach the ground on slopes; **a crossing goes to the front of the queue; from six gnomes a second work party (a third of the village) builds it**; after a storm floods a cabin yard the household raises a **staked flood bank two tiles out** on the water side, cambers yard, cuts a drain; fox drops a caught rabbit in water with a snicker — **"nothing dies"**; wild animals breed in growing seasons; stabled horse gets a foal → second horse; deer tamed with larder berries until apples bear; feed line when a gnome sets off after an animal.
- **566** closing `===== */`.

**Stale header:** the narrative stops at v9.19, but the code is annotated through **v9.24** (126 inline mentions of v9.20–v9.22, e.g. 622, 624, 814, 1089, 1822; v9.23 at 11426; v9.24 at 8435/11267; CSS has a v9.20 note at 212 for the events sheet "last forty lines"). The brief's "v9..v9.22" is slightly off: the header covers v9..v9.19. Later changes are documented only inline.

---

## 3. Globals / state defined in this range

### Constants (all `const`, module-scope inside the IIFE)

| Name | Line | Value | Type | Meaning / uses elsewhere |
|---|---|---|---|---|
| `S` | 567 | `2` | int | "fine tiles per v7 tile": legacy scale factor; old distances are multiplied by `S` by hand all over the file (340 `S` uses, 70 `S2` uses). |
| `N` | 568 | `36*S` = **72** | int | tiles per side (855 uses). |
| `NC` | 568 | `N*N` = **5184** | int | cell count; size of every per-tile typed array (611+). |
| `NV` | 568 | `N+1` = **73** | int | vertices per side (shared corner heights). |
| `TW` | 569 | `52/S` = **26** | px | tile screen width at zoom 1. |
| `TH` | 569 | `26/S` = **13** | px | tile screen depth at zoom 1 (2:1 isometric diamond). |
| `EH` | 569 | **26** | px | one height level in px at zoom 1. **Not** divided by `S`, so a level is as tall as a fine tile is wide (slopes draw twice as steep per fine tile as in v7). Used in the projection `syOf` at 6383: `-(e-SEAS)*EH*cam.z`. |
| `EMAX` | 570 | **9** | levels | max ground height. Terrain gen clamps to `EMAX*0.96` (911); snow heuristics at `EMAX-1.1` / `EMAX-0.9` (1048, 1056); raise tool caps at EMAX (11128). |
| `SEA` | 570 | **2.0** | levels | sea level (ground at/below is sea if joined to the edge flood). 123 uses. |
| `SEAS` | 571 | `SEA+0.5` = **2.5** | levels | sea *surface*; the projection's zero reference (6383). 62 uses. |
| `DIG_FLOOR` | 572 | `SEA-1.0` = **1.0** | levels | dig tool floor (used once, 11131: `E[i]=Math.max(DIG_FLOOR, E[i]-0.6*fall)`): "a pond or a harbour, never a chasm". |
| `DAYLEN` | 573 | **210** | sim seconds | one game day (816: `T.abs+=dt/DAYLEN`). Also scales breeding/wool/litter rates (1948, 2172, 2185-2189). |
| `SEASON_DAYS` | 573 | **3** | days | season length → **year = 12 days** (comment at 1372). Season index `floor((day-1)/3)%4` (817); autumn cold ramps on the last season day (824). |
| `SEASONS` | 574 | `['Spring','Summer','Autumn','Winter']` | string[] | **English only**; used once, clock chip at 10848: `'Day '+T.day+' · '+SEASONS[T.season]`. |
| `POP_CAP` | 575 | **44** | int | hard population cap: strangers stop arriving (4379, 5518, 5533), toast "The isle is full — 44 gnomes is as many as it holds" (4489), census "room for N more" (10989). |
| `S2` | 576 | `S*S` = **4** | int | area / squared-distance scaling for the fine grid (e.g. arrive radius `0.35²·S2` at 1610, rain drop count `*S2` at 1161, `LIM=2600*S2` at 1475). |
| `TAU` | 582 | `2π` | number | 265 uses (canvas arcs). |

### Mutable module state (`let`)

| Name | Line | Type | Mutated where |
|---|---|---|---|
| `_rng` | 588 | `()=>number` (mulberry32 closure), default seed **1** | reseeded at 887: `_rng=mulberry32(world.seed||1)` when a world is (re)built. Read only via `rng()`. |
| `rngN` | 588 | int draw counter, starts 0 | `++` in `rng()` (589); reset to 0 at 887; exposed read-only to the test harness at 12227 (`rngN:()=>rngN`). Purpose: "so a harness can tell where two runs part" — determinism diagnostics. |
| `vrng` | 594 | `()=>number`, default seed **7** | reseeded at 887: `vrng=mulberry32(((world.seed||1)^0x9E3779B9)>>>0)` (golden-ratio xor so the visual stream differs from the sim's for the same seed). |

Because `rng`/`vrnd` etc. read the `let` binding at call time, reseeding works without rebinding the helpers.

---

## 4. Functions (every one in the range)

| Name | Line | Signature | Does | Callers / notes |
|---|---|---|---|---|
| `clamp` | 578 | `(v,a,b)` | clamp v to [a,b]. | 183 uses. |
| `clamp01` | 579 | `(v)` | clamp to [0,1]. | 125 uses. |
| `lerp` | 580 | `(a,b,t)` | linear interpolate. | 205 uses; also inside `noise2`. |
| `smooth` | 581 | `(t)` | smoothstep `t²(3−2t)`. | `noise2` and ~30 other sites (easing). |
| `mulberry32` | 583-584 | `(a) → ()=>[0,1)` | 32-bit integer PRNG (standard mulberry32: `a+=0x6D2B79F5`, two `Math.imul` mixes, `>>>0 / 2^32`). Seed is `|0`-coerced so floats/negatives are fine. | Seeds the sim stream (588), visual stream (594), reseeds (887), `noise2` lattices (600), per-tree detail `mulberry32((t.sd|0)+1)` (1703). |
| `rng` | 589 | `()` | sim random: increments `rngN`, returns `_rng()`. | 49 direct uses; basis for `rnd/rint/pick/chance`. |
| `rnd` | 590 | `(a=1,b)` | `rnd()`→[0,1); `rnd(a)`→[0,a); `rnd(a,b)`→[a,b). | 301 uses (the workhorse). |
| `rint` | 591 | `(a,b)` | integer in [a,b] **inclusive** (`floor(rnd(a,b+1))`). | 18 uses. |
| `pick` | 592 | `(arr)` | random element (sim stream). | 41 uses. |
| `chance` | 593 | `(p)` | `rng()<p`. | 118 uses. |
| `vrnd` | 595 | `(a=1,b)` | visual-stream twin of `rnd`. | 86 uses (particles, sky, sound). |
| `vrint` | 596 | `(a,b)` | visual twin of `rint`. | 14 uses. |
| `vpick` | 597 | `(arr)` | visual twin of `pick`. | 1 use (bird colour, 2296). |
| `vchance` | 598 | `(p)` | visual twin of `chance`. | 24 uses. |
| `noise2` | 599-605 | `(seed) → (x,y)=>[0,1]` | builds a **128×128 Float32 lattice** of uniform randoms from `mulberry32(seed)`, returns a sampler: wrap-around lookup `at(i,j)`, bilinear with `smooth` fades (value noise, tileable at period 128). | 4 call sites, all at world build: `noise2(world.seed*19+3)`, `*77+11` (888), `*131+7` (991), `*31+9` (1731). ~64 KB per lattice; not per-frame. |
| `fbm2` | 606 | `(n,x,y,o=5)` | fractal Brownian motion over sampler `n`: `o` octaves, gain 0.5, lacunarity 2, normalised by total amplitude so output stays in [0,1]. | 6 uses (terrain/soil/texture). |
| `hx` | 607 | `('#rrggbb') → [r,g,b]` | parse 6-digit hex (strips `#`). **No 3-digit or alpha support** → NaN if given `#abc`. | 137 uses (palettes). |
| `mixc` | 608 | `([r,g,b],[r,g,b],t)` | per-channel lerp of colour triples. | 96 uses (e.g. `SHEEN=mixc(rampSky()[1],[255,255,255],0.4)` at 9587). |
| `css` | 609 | `(c, al?)` | `rgb()` / `rgba()` string; channels truncated with `|0` (not rounded); alpha not clamped. | 55 uses. |

No other functions, classes, or event listeners are defined in 315-610.

---

## 5. Concrete rules / tuning numbers in this range (code, not narrative)

- World: **72×72** fine tiles (= 36×36 "v7" tiles × `S=2`), **5184** cells, **73** vertex rows.
- Projection at zoom 1: tile **26 px wide × 13 px deep**; one level of height **26 px**. Vertical screen position (6383): `chh*VANCH + ((rx+ry)-(N-1))*(TH/2)*z - (e-SEAS)*EH*z + cam.oy` — the sea surface is the height datum.
- Heights **0..9** levels; sea level **2.0**; sea surface **2.5**; dig floor **1.0** (so a dug inland pit can hold at most 1.5 levels of water below the sea surface datum).
- Clock: day = **210 s** of sim time; season = **3 days**; year = **12 days**; 4 named seasons.
- Population cap **44**.
- PRNG defaults: sim seed **1**, visual seed **7**; on world build: sim = `seed`, visual = `seed ^ 0x9E3779B9`.
- Noise: lattice **128²**, fBm **5 octaves**, gain **0.5**, lacunarity **2**.

Narrative numbers (see §2) worth carrying into a tuning sheet: bridge spans 3/6/10/14; past-water run-on 10% of span; cloud roll-in ~30 s; fast-forward threshold 6x, dial max 20x; children 2 per cabin, grown at 2 years, leave at 7 years; partner after exactly 1 day; fox→dog after 3 days of fish; horse 3 loads @1.5×, cart 6 loads; second work party from 6 gnomes (one third); flood bank 2 tiles out; water opaque from 0.18 deep; `DAM_RISE` 0.35, `EARTH` 0.6 (code at 3596); events sheet shows last 40 lines (CSS 212).

---

## 6. UI elements / input handling

None defined in this range. The narrative *references* the shell that later code builds, which is the spec of the reusable "rail + overlays" layout:
- A **rail** of buttons: Creator/Gnome (Be a gnome) switch (`bPlay`, wired 12184), **Build** (gnome mode) opening a 19-item panel, **Sound** with long-press sound check, **speed dial 1x–20x + pause**, **Fit** view, arrows to turn the isle, **Undo**.
- **Overlays stacked from the rail up, measured** (card, toast, feed; card becomes a strip in gnome mode) — `layoutOverlays()` elsewhere.
- **Gnome chip** with **+** (call a stranger) that opens a **census**; **winter chip** (larder vs frost); **feed** of reasons naming the player's actions; **card** naming a craft.
- Build flow: ghost footprint green/red with reason → **Place** → **Pause/Stop**.
- Gestures named: drag to move, pinch to zoom, tap to select/follow, tap-to-walk in gnome mode, long press.

---

## 7. MODE 'creator' vs 'gnome' (as described here; code at 5630+)

- `MODE` itself is declared at **5630** (`let PLAYER=null, MODE='creator';`), outside this range.
- Header v9.8 (411-412): Creator/Gnome switch in the rail; as a gnome a tap on the ground walks, on a tree/rock/berries/water/site/fire works or rests; hunger, cold, tiredness apply to the player; switching back leaves the gnome as an AI villager (`PLAYER` persists as a normal gnome).
- Header v9.9 (419-425): the card is a strip in gnome mode; **Build** panel exists only in gnome mode; a player project is built by the player's gnome alone; homeless-placed tent/cabin is the player's, other homes the village's.
- Everything else in this range is mode-agnostic (constants, RNG, noise).

---

## 8. Progression / unlock / economy

Nothing coded here; the narrative gives the model: no tech tree, **emergent progression** driven by need and footfall (wear → paving, swimming → bridge, no river → windmill), materials fetched by hand (logs, stones, reeds, planks, dressed stone), buildings with real functions (§2 v9.14), household life-cycle (tent → cabin → children → departure at 7 years), taming (fox→dog, deer→horse), festivals (midsummer dance, harvest supper), and a hard **POP_CAP=44**. Player nudges via terrain (dig/raise/spring/rock) and, in gnome mode, by placing projects.

---

## 9. Persistence

None in this range; the narrative never mentions save/load. The one persistence-adjacent design is **determinism**: two seeded streams + `rngN` counter + reseed from `world.seed` (887) so "the same seed and the same steps give the same isle whatever the frame rate" (585-587). Whether the game saves state at all must be checked in later sections (grep for `localStorage` is out of my scope).

---

## 10. Mobile / touch / performance

- Code: integer PRNG (`Math.imul`, `|0`), `Float32Array` noise lattice, arrow-function helpers — cheap per call; noise only at world build.
- Visual randomness on its own stream so frame-rate (phone vs desktop) never changes the sim (585-587).
- Narrative: "four flat fills on a slow phone" instead of a gradient (v9.7, 371); Fit view LOD (`lodCS` at 6364 uses `TW*cam.z`); fast-forward > 6x rebuilds the surface once per frame and half-steps the water (v9.11); sound cue gating by speed; overlay stacking measured so nothing covers the rail on small screens (v9.9); several entries are explicitly "from the phone" (v9.7.1, v9.19).

---

## 11. i18n (en/es)

- `SEASONS` (574) is **hardcoded English** and goes straight to the clock at 10848. The only i18n in the file is the intro screen (`langs` en/es at ~12200-12214, `#lang` buttons at 309-311, `<html lang="en">`), and even the Spanish intro says "Toca **Spring**" — an untranslated button name inside Spanish text. So: the engine has no string table; every in-game string (feed, toasts, card, census) is English. A port needs a `t(key)`/table from day one if en/es/fr is wanted.

---

## 12. Oddities, bugs, dead code, TODOs

1. **Header out of date** — ends v9.19 while code is at v9.24 (see §2). Design intent for v9.20-9.24 lives only in inline comments.
2. **Changelog ≠ spec**: several header entries are superseded within the header itself (mines/X-ray added v9.7, removed v9.8; name boards v9.5 vs "No name plates" v9.7.1; v9.9.1 unbounded lift fixed in v9.11.1; v9.12 blobs replaced by v9.13 ribbon). A reader must read to the end for current behaviour.
3. **Legacy `S=2` scaling** is applied by hand at hundreds of sites (`*S`, `*S2`) rather than once; `EH` is deliberately not scaled. Porting hazard: easy to miss a site. A fresh build should set the fine grid as the only grid (S=1) or centralise scaling.
4. `hx` silently returns NaNs for 3-digit hex or `#rrggbbaa`; `css` truncates rather than rounds and does not clamp alpha. Harmless today, but fragile for a new palette.
5. `rngN` is a debug-only counter incremented on every sim draw (hot path); negligible cost but it is test-harness plumbing left in production.
6. `vpick` is used exactly once (2296); `DIG_FLOOR` once (11131); `SEASONS` once (10848). Not dead, but single-use constants.
7. No TODO/FIXME markers in the range.
8. `'use strict'` inside the IIFE: good; but the entire game is one closure, so nothing is unit-testable except through the harness object (12227).

---

## 13. Reusable vs gnome-specific (for Parque D'Amour)

**Reusable engine/shell (copy as-is or near as-is):**
- 315-317 the strict IIFE wrapper + the pattern of exposing a small harness object at the end.
- 578-582 math helpers (`clamp`, `clamp01`, `lerp`, `smooth`, `TAU`).
- 583-598 **twin deterministic PRNG streams** (sim vs visual) with `rngN` and reseed-from-seed; this is the backbone of replayable/seed-shareable worlds and frame-rate-independent sims.
- 599-606 `noise2`/`fbm2` for terrain, lawn mottle, gravel texture, flower-bed variation.
- 607-609 colour helpers.
- 567-569 the grid/projection constant *pattern* (N, NC, NV, TW, TH, EH) for a 2:1 isometric diamond height-field.
- 573-574 the clock *pattern* (DAYLEN, SEASON_DAYS, SEASONS).
- The narrative's shell conventions: rail + measured overlay stack, card/toast/feed, speed dial with sound gating, Fit/LOD, Creator⇄avatar switch, Build panel with ghost footprint/Place/Pause/Stop, "+" chip to summon a newcomer, census.

**Gnome/isle-specific (replace):**
- `SEA`, `SEAS`, `DIG_FLOOR`, the whole "sea = flood from the edge" model, `EMAX=9` (a park is flatter and probably not an island).
- `POP_CAP=44` and the stranger-ashore mechanic.
- `SEASONS` English strings.
- `S=2` v7-legacy scaling.
- The entire v9 narrative content (river erosion, construction from logs/stones/reeds, households, farm animals, festivals) — valuable as a *style guide* for how to write the new game's design log, not as content.

---

## 14. Design questions for the Parque D'Amour port raised by this section

1. **Map shape:** island with sea, or a walled/gated park (maybe bounded by a river or boulevard)? What replaces `SEA`/`SEAS`/`DIG_FLOOR`? Is there any water at all (pond, fountain, Seine bank)?
2. **Grid & relief:** keep 72×72 and 9 levels, or a smaller, flatter park (e.g. 48×48, 3-4 levels with terraces, steps, a bandstand hill)? Rebuild at S=1 or keep the legacy S scaling?
3. **Can the Creator reshape ground** (dig/raise) as in Gnome Village, or only place/plant (paths, hedges, benches, flower beds, a kiosk)? What is the park's equivalent of "the stream you opened" in the feed?
4. **Timescale:** DAYLEN=210 s / 3-day seasons / 12-day year — does the romance play out over an afternoon, a day, a season, a year? Do park opening hours and night matter? Does weather (rain → shared umbrella, blossom, snow) act as a romance lever, and can the Creator trigger it?
5. **Population:** what replaces POP_CAP=44 — a cap on visitors? Is there one protagonist couple plus extras, or many couples? Who enters by the gate when the "+" chip is tapped?
6. **Determinism:** keep seedable deterministic sims (shareable park seeds, replayable romances)? Must the romance outcome be reproducible from seed + player actions?
7. **Modes:** Creator (god hand) vs **avatar** (one park-goer) — what are the avatar's verbs for assist/sabotage (hand a flower, spill coffee, play accordion, block a path, release pigeons)? Does the avatar keep hunger/cold/tiredness or a "mood/energy" equivalent? When the player leaves avatar mode, does their character stay as an NPC (as the gnome does)?
8. **Build panel:** is there a "19 things" list for the park (bench, fountain, kiosk, hedge, lamp, bandstand, carousel...)? Who builds — gardeners? Does the ghost-footprint/Place/Pause/Stop flow carry over?
9. **Emergent paths:** gnomes pave where they walk (WEAR → PAVE). Should the park grow desire-lines, or are paths designed?
10. **Tone rule:** Gnome Village's "nothing dies" (v9.19) — what is the park's equivalent (sabotage never cruel; worst case the couple leaves separately)? Define win/lose states.
11. **i18n:** French-first? Season names and all feed/toast strings need a table (`Printemps/Été/Automne/Hiver`); decide en/fr/es set now.
12. **Speed dial:** does a romance sim need 1x–20x fast-forward? Keep sound gating by speed?
13. **Design log convention:** keep the in-file version narrative with owner quotes as the living design doc (and keep it current — the gnome header fell 5 versions behind)?
14. **Testing hook:** keep the harness object (`rngN`, `steps`, `draw`, `pix`) for automated checks of the new game?
