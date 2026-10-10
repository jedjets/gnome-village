# Gnome Village review — section 20: lines 10993–11322
## "Building as a gnome: the rail row, the Build panel, the ghost bar (v9.9)" + creator tools, undo, pointer input, camera follow

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Range read in full: 10993–11322 (330 lines). Symbols outside the range were resolved with grep; those line numbers are given too.

---

## 1. Purpose of the section

Despite the header comment (10993) naming only the gnome-mode build UI, this range is the whole **player-input shell** of the game. It contains, in order:

| Lines | Sub-block | What it is |
|---|---|---|
| 10994–11033 | Gnome-mode build UI | `#grow` rail row (Build / status chip / Pause / Stop), the `#bld` Build panel (grid of pickable build types), and the `#gbar` ghost bar (name, cost, message, Place/Cancel) |
| 11034–11074 | Creator tool rail | `TOOL_ICON` SVGs, `TOOLS` list, `tool`/`brush` state, `buildTools`, `setTool`, `showDepth` |
| 11075–11086 | Spring tool | `SPRING_RATE`/`SPRING_NAME`, `placeSpring` |
| 11087–11115 | Undo | `undoStack`, `snapshotWorld`, `beginStroke`, `undoStroke`, `showUndo` |
| 11116–11160 | Terrain painting | `paintCool`, `paintTile` (raise/lower/spring/rock/tree/bush brush) |
| 11161–11223 | Pointer input | `ptrs`, `pinch`, `setupInput` (pan, pinch-zoom, pinch-rotate, tap, drag-paint, wheel) |
| 11224–11244 | `tapSelect` | Hit-test gnomes / animals / the flyer on a tap in creator mode |
| 11245–11276 | Mode switch | `setMode('gnome'|'creator')`, `playerCommand` (a tap as an order) |
| 11277–11322 | Camera follow | `followAlive`, `focusY`, `followStep`, `screenCentreWorld`, `keepCentre`, `centreOn` |

The build-as-gnome **logic** (ghost computation, placing, stopping, status text) lives earlier, at 5817–6040 (`PB`, `PB_LIST`, `pbGhost`, `pbTap`, `pbPick`, `pbClear`, `pbPlace`, `pbStop`, `pbStatus`). This section is only the **DOM side** of that feature plus the shared input/camera shell. The button wiring is in `boot()` at 12184–12197.

---

## 2. Globals / state defined or mutated here

### Defined in this range

| Name | Line | Type / shape | Notes |
|---|---|---|---|
| `PB_NEED_HOME` | 10994 | `{fence:1, steppath:1, garden:1}` | Build types a player may pick only when they own a *finished* home (`pbHome()` 5837 → `homeOf` 4241). |
| `TOOL_ICON` | 11034–11041 | `{hand,raise,lower,spring,rock,tree,bush: '<svg …>'}` | 17×17 inline SVG per tool swatch (v9.24). Hand-coded colours (`#4A4458` ink, `#8E6F52` earth, `#2F6F8F` water, `#4E8F5E` leaf, `#D8546E` berry…). |
| `TOOLS` | 11042–11050 | `[{id,label,col}]×7` | Order of the rail: Look, Raise, Lower, Spring, Rock, Sapling, Berries. `col` is the swatch background. |
| `tool` | 11051 | `let string` = `'hand'` | Current creator tool id. |
| `brush` | 11051 | `let number` = `1` | Brush radius index 1..6 (1..4 for spring, where it means flow level). Also set by the `#size` slider at 12141 and by the debug harness `setBrush` 12227. |
| `SPRING_RATE` | 11075 | `[0.35, 1.0, 2.0, 3.6]` | Water rate per spring level 1..4. |
| `SPRING_NAME` | 11075 | `['a seep','a stream','a river','a torrent']` | Display names; English article hacked off with `.replace('a ','')`. |
| `undoStack` | 11087 | `const Array<snapshot>` | Max 10 entries (11092). Cleared on new island at 12104. Exposed to the debug harness at 12226. |
| `paintCool` | 11116 | `let number` seconds | Throttle between drag-paints; decremented in `frame()` at 12075. |
| `ptrs` | 11162 | `Map<pointerId,{x,y}>` | Active pointers. |
| `dragging` | 11163 | `let boolean` | Hand-tool pan in progress. |
| `pinch` | 11163 | `let null|{d,z,mx,my,ox,oy,a0,ang0,twist,lastDa?,live?,base?}` | Two-finger gesture state. |
| `downInfo` | 11163 | `let null|{x,y,t,moved}` | First-pointer press for tap detection. |
| `pinchWorld` | 11163 | `let null` | **Dead**: only ever assigned `null` (11213). |
| `pos` | 11164 | arrow `e=>({x,y})` | Client coords of a pointer event. |

### Snapshot shape (`snapshotWorld`, 11088–11091)
`{E,E0,WD,SOIL,FLOW,SAND: Float32Array copies; MAT,MADE: Uint8Array copies; trees,bushes,rocks,springs: shallow array copies; label: tool; fallen?: Build[] (added later by collapseBuild 3528)}`.
`label` is never read anywhere in the file (dead field). Memory: 6×Float32 + 2×Uint8 over NC=5184 tiles ≈ 135 KB per snapshot, ≈1.3 MB at 10 deep.

### External state mutated by this range

- `MODE` (5630) — set to `'gnome'` 11253 / `'creator'` 11259.
- `PLAYER` (5630) — created via `playerArrive()` 11251; its `.job`, `.st`, `.decide` touched through `pbPlace`/`playerTap` indirectly; in `undoStroke` every gnome's `gz`, `ptx=-99`, `st`, `z` (11111).
- `PB` (5817) `{pick,ghost,tiles,paused}` — read widely; written only through `pbPick/pbTap/pbClear` which this section calls (11013, 11263, 11269).
- `selected`, `selCrit`, `toastT` (10683, 10873) — 11254, 11255, 11257, 11275.
- `cam` (6333) `{ox,oy,z,fitZ,ang,angT,follow,free,turnKeep}` — pan 11206, zoom 11190/11222, rotate target 11196, follow 11073/11254/11260/11275/11293, `turnKeep` 11179/11212/11311/11315.
- Terrain arrays `E, E0, WD, SOIL, MAT, FLOW, SAND, MADE` (paint 11128–11131, undo 11095); `OCC, BRIDGE, PIER, DAM, PAVE, STEPS` (undo-restore of fallen builds 11103–11106).
- Entity arrays `trees, bushes, rocks, builds, world.springs` (paint 11133–11134, 11141, 11146, 11155; spring 11079/11083; undo 11096–11109).
- `store` (2409) — undo subtracts salvage back out 11107.
- `village.project / project2` (2468) — restored on undo 11109.
- `dugRecently` (4659) — set to `0.5` at 11131 (makes gnomes float when the ground is dug from under them, 5704).
- `document.body.classList` `gnome` 11264; `#bPlay` text/aria 11265.
- DOM: `#gstat/#bPause/#bStop` hidden+text, `#bBuild` aria-pressed, `#bld` `.on`, `#bldGrid` innerHTML, `#gbar` `.on` + `#gbName/#gbCost/#gbMsg/#gbPlace`, `#card` `.on/.crit`, `#tools` innerHTML + `.more/.before`, `.tool` aria-pressed, `#size` max/value, `#sizewrap` `.on`, `#sizelbl`, `#depth`, `#bUndo` disabled.

---

## 3. Functions (every one in the range)

| Name | Line | Signature | What it does | Called from |
|---|---|---|---|---|
| `updateGrow` | 10995 | `()` | Gnome-mode only (early return otherwise). Shows `#gstat`, `#bPause`, `#bStop` iff the player owns an unfinished project (`ownsProject` 4240); status text from `pbStatus()` 6030; Pause button reads "Go on" when `PB.paused`. Sets `#bBuild` aria-pressed when the panel is open or a pick is active. | 10861 (`updateCard`), 11012, 11015, 11017, 11268, 12186–12196 (button handlers) |
| `openBuild` | 11004 | `()` | Refuses with a toast if a project is already owned. Rebuilds `#bldGrid` from `PB_LIST` (5818): one `<button><b>label</b><small>cost</small>` per type; types in `PB_NEED_HOME` are disabled with "needs a home of your own" when `pbHome()` is null. Click → `closeBuild(); pbPick(t); updateGbar(); updateGrow()`. Then shows `#bld`, `layoutOverlays()`. | 12186 (`#bBuild`) |
| `closeBuild` | 11019 | `()` | Hides `#bld`, `updateGrow`, `layoutOverlays`. | 11012, 11263, 11274, 12186, 12187 (`#bldX`) |
| `updateGbar` | 11020 | `()` | If no pick: hide `#gbar`, re-show `#card` when the player is selected in gnome mode. Else hide card, fill name/cost, message (pave: "N tile(s) — tap more, or Place"; otherwise ghost msg or "tap elsewhere to move it, or Place"; red `.no` class when the ghost is rejected and something is laid out), enable `#gbPlace` only when `ghost.ok`. | 11012, 11263, 11273, 12186, 12188, 12189 |
| `buildTools` | 11052 | `()` | Builds the `#tools` rail from `TOOLS`: `.tool` buttons with swatch+SVG+label, `aria-pressed`, `data-id`, click → `setTool`. Inner `more()` (11062) toggles `.more`/`.before` fade-mask classes from scroll position (6 px slack) on scroll/resize and once after 50 ms. | 12128 (`boot`) |
| `showDepth` | 11066 | `()` | Writes `#depth`: spring → `SPRING_NAME[brush-1]` minus "a "; else "1 tile" or `(2*brush-1)+' tiles'`. | 11069, 12141 (slider) |
| `setTool` | 11067 | `(id)` | Sets `tool`; slider max 4 for spring else 6, clamps `brush`; updates `.tool` aria-pressed; shows `#sizewrap` for any non-hand tool; label "Flow" for spring else "Brush"; `showDepth()`; for non-hand tools clears selection and stops following. | 11056, 11256 (`setMode`), 12226 (harness) |
| `placeSpring` | 11076 | `(x,y)` | Tap within Chebyshev `S`=2 tiles of one of *your* springs removes it (puff, toast, log). Rejects below `SEA+0.2`, on a bridge, dam or occupied tile. Keeps at most 6 player springs (drops the oldest). Pushes `{x,y,rate:SPRING_RATE[brush-1],player:true,lvl:brush,ph}`, adds 0.15 water, `markWet`, splash ×5, toast + `logEv`. | 11137 (`paintTile`) |
| `snapshotWorld` | 11088 | `() → snapshot` | Copies the 8 terrain arrays and shallow-copies the four entity arrays (see §2). | 11092 |
| `beginStroke` | 11092 | `()` | Pushes a snapshot, keeps the stack ≤10, `showUndo()`. | 11176 (pointerdown with a paint tool), harness 12226 |
| `undoStroke` | 11093 | `()` | Pops a snapshot; restores arrays; rebuilds entity arrays in place; v9.16: re-raises every build that stroke collapsed (`u.fallen`, written by `collapseBuild` 3528) — pushes back to `builds`, clears `b.fell`, re-marks `OCC`, `BRIDGE/PIER/DAM`, `PAVE`, `STEPS`, takes the salvage back out of `store`, re-homes owners, restores household flags and `village.project(2)`. Then `initWater(); setMaterials(); rebuildSurface()`, resets each gnome's ground height/path cache and un-floats them. Toast "Undone". | 12197 (`#bUndo`), harness 12226 |
| `showUndo` | 11115 | `()` | `#bUndo.disabled = undoStack.length===0`. | 11092, 11114, 12197 |
| `paintTile` | 11117 | `(tx,ty)` | One brush application of the current tool centred on a tile (details in §4). Ends with `setMaterials(); markSea();` and, for raise/lower, `checkFoundations(u.E)` against the stroke's snapshot (3548). | 11176 (down), 11214 (move) |
| `pos` | 11164 | `(e)` | `{x:e.clientX,y:e.clientY}`. | 11169, 11186 |
| `setupInput` | 11165 | `()` | Attaches pointerdown/move/up/cancel/wheel on the canvas (details in §5). | 12128 (`boot`) |
| ↳ `up` | 11210 | `(e)` inner | Pointer release: ends pinch, detects a tap (hand tool, <9 px moved, <420 ms) → `playerCommand` in gnome mode else `tapSelect`. | 11220, 11221 |
| `tapSelect` | 11224 | `(sx,sy)` | Creator-mode hit test: nearest gnome within 34 px (minus 4 px bias; crew drawn in boats/flyers use their `_sx/_sy`), else nearest animal within 30 px (skips ridden, hutched-at-night or held rabbits; head heights deer 12/fawn 8, fox 6, others 4), else the flyer's screen box (select its pilot or follow the craft), else clear selection and follow. | 11223 |
| `setMode` | 11246 | `(m)` | Switch between `'gnome'` and `'creator'` (details in §6). | 11271, 12184 (`#bPlay`) |
| `playerCommand` | 11266 | `(sx,sy)` | A tap on the isle as an order in gnome mode: no player → back to creator; active pick → `pbTap` (ghost moves/pave tiles toggle) + `updateGbar`; open panel → close it; else `playerTap(tx,ty)` (5653) and toast its message ('busy', 'asleep', anything else except 'walking'); then re-follow and re-select the player. | 11223 |
| `followAlive` | 11277 | `(o) → bool` | A follow target is still valid: has `.pt`, or is in `gnomes`, `critters`, `builds`, `boats`, or is the village flyer. | 11294 |
| `focusY` | 11279 | `() → px` | v9.24: the clear vertical band between the top chips/feed and whichever bottom overlay is showing (`card, hint, gbar, evlog, census, bld`, and `rail` always); returns `top + 0.46*(bot-top)`, clamped to `[100, chh*0.5]`. Overlays nearer than 60 px below the top band are ignored. | 11299 |
| `followStep` | 11291 | `(dt)` | Eases the camera toward the followed thing each frame: `k = 1-0.02^dt`; height from flyer altitude (+1.6 balloon / +0.4 glider airborne; +0.8/+0.3 on the ground), moored boat → `waterZ`, rabbit → its hop `z`. Horizontal target `cw/2`, vertical target `focusY()`. | 12090 (`frame`) |
| `screenCentreWorld` | 11303 | `() → {x,y}` | The world point to pivot a turn on: the followed thing, else the tile under `(cw/2, chh*0.46)`, else `villagePos()`. | 8842, 12144 (`turn`) |
| `keepCentre` | 11308 | `()` | While `cam.turnKeep` is set, keeps that world point under its screen point each frame (used by button turns and pinch); clears itself once the angle has settled (<0.0015 rad) and no pinch is live; a follow cancels it. | 11204, 12089 (`frame`) |
| `centreOn` | 11317 | `(x,y)` | Puts world `(x,y)` at `(cw/2, chh*0.46)`. | 12124 (new island), 12153 (`#bFit`) |

---

## 4. Concrete rules and tuning numbers

### Build panel / ghost bar (10994–11033)
- Only one owned project at a time: `openBuild` and `pbPlace` (6008) both refuse while `ownsProject(PLAYER)`.
- `PB_NEED_HOME` = fence, steppath, garden require a *finished* home (`homeOf`: `g.home.done && in builds`).
- Pave run: counted `PB.tiles.length` (capped at 14 in `pbTap` 5994); message pluralises "tile/tiles".
- Place enabled iff `PB.ghost && PB.ghost.ok`.
- `.no` (red, `#A94A5A` CSS 191) only when the ghost is rejected **and** there is something drawn (`gh.tiles.length || PB.tiles.length`).
- Costs come from `BT[t]` (2411) via `pbCostText` (5831): wood/stone/reeds; special cases pave "1 stone a tile", hearth "4 stone", steppath "a stone a tile", garden "the work only"; span builds append " a tile".

### Tool rail (11034–11074)
- 7 tools; slider range 1–6 (`#size` DOM 273), forced to 1–4 for spring (11069).
- Brush diameter shown as `2*brush-1` tiles (1,3,5,7,9,11).
- Scroll fade masks: `.more` when `scrollLeft+clientWidth < scrollWidth-6`, `.before` when `scrollLeft>6` (11062); CSS 90–92 mask gradients at 84 % / 10 %.

### Spring (11075–11086)
- Rates by level: 0.35 / 1.0 / 2.0 / 3.6 (natural springs are `SPRING_BASE`=2.2 + 0.30·pass, line 950/1083).
- Not allowed where `E <= SEA+0.2` (SEA=2.0 → ≤2.2), or on bridge/dam/occupied tiles.
- Remove radius: `|dx|<=2 && |dy|<=2` (S=2) around an existing player spring.
- Cap: 6 player springs; the oldest is silently removed.
- Initial wetting `WD += 0.15`, splash particles ×5.

### Undo (11087–11115)
- Depth 10 strokes. One stroke = one pointerdown with a paint tool (drag-paints don't push).
- Restores builds collapsed *during that stroke* (via `u.fallen`), including the salvage (`store[m] = max(0, store[m]-salv)`).

### Terrain paint (11117–11160)
- Radius `r = brush-1`; disc mask `hypot(dx,dy) <= r+0.01`.
- Falloff `fall = smooth(clamp01(1 - dd/(r+0.6)))` (smoothstep), or 1 when r=0.
- Border: tiles with `x<1 || y<1 || x>=N-1 || y>=N-1` (N=72) are never painted.
- Occupied tiles (`OCC`) are skipped: "a building stands firm".
- **Raise**: `E += 0.6*fall` up to `EMAX`=9; `E0 = E`; `SOIL += 0.5*fall` up to 1.2; crossing sea level from below zeroes `WD`; `MADE |= 1`; `relaxMark` (slump timer `RELAX_T`=60, 1310). Gnomes on the tile jostled `'bury'` (→ `dig` state 1.3 s) when `dd<0.5 || fall>0.6`.
- **Lower**: `E -= 0.6*fall` down to `DIG_FLOOR` = SEA-1 = 1.0; `dugRecently = 0.5` s (floats gnomes left hanging >1.4 above the new ground, 5704); `MADE |= 2`. When `fall>0.6`: a tree rooted on that tile starts falling (`t.fall=0.001`, random `fallDir ±1`), bushes on it are removed with a puff. Gnomes jostled `'yelp'` (0.85 s).
- **Spring**: centre tile only (`dd<0.5`) → `placeSpring`.
- **Rock**: centre only; needs `WD<0.2`; `SOIL = min(SOIL,0.4)`; boulder `r ∈ [0.8,1.3]`, seed `rng()*99`; `MADE |= 4`; gnomes on it jostled `'rock'` → `heave` state 1.6 s.
- **Tree** ("Sapling"): centre only; `WD<0.12`, `E>SEA+0.3`, no bridge; jitter ±0.25 tile; random `SPECIES` (round/pine/birch), age 0.08; sparks ×4. Nearest non-baby, non-busy gnome within 16 tiles (`d² < 256`) is sent to pat it down (`job {k:'pat',t}`, `st 'goPat'`, `decide=6`).
- **Bush** ("Berries"): centre only; same wetness/height rule; `{b: rint(1,3) berries, re: rnd(6,20) regrow, sc: rnd(.85,1.15) scale}`; sparks ×3.
- After every brush application: `setMaterials()`, `markSea()`; for raise/lower, `checkFoundations(snapshot.E)` — any build whose foundation tiles moved more than `FOUND_MOVE`=0.5 collapses (3548/3497); comment 11154 explains why the stroke's snapshot is the reference so the river's own erosion never counts.

### Pointer / camera (11161–11322)
- Tap = hand tool, `moved < 9 px`, `< 420 ms` (11216).
- Paint throttle: first paint then `paintCool = 0.14` s; drag paints every `0.10` s (11177, 11215). Spring tool never drag-paints (11211).
- Pinch zoom: `z1 = clamp(z0 * d/d0, min(0.30, fitZ*0.85), 3.0)` (11190). Wheel: ×1.12 in / ×0.89 out (11222).
- Pinch rotate dead zone: cumulative twist or |Δangle| > 0.06 rad (11195); after that `cam.angT = ang0 + da - base` and `turnStep` (6349) eases toward it (0.00002^dt while pinching, 0.0008^dt for button turns).
- Vertical anchor `VANCH`=0.46 of canvas height (6332) used for zoom-about-midpoint and `centreOn`.
- Follow easing `k = 1 - 0.02^dt` (≈98 % closed per second) (11298).
- `focusY` clamp `[100, chh*0.5]`, factor 0.46 of the clear band, overlay guard `top+60` (11287–11289).
- Gnome-mode entry: zoom raised to 1.5 if `cam.z < 1.3` (11254); welcome toast held 6 s (`toastT=6`, 11257) instead of the usual 3.4.
- Hit radii: gnome 34 px (with a 4 px bias in its favour), animal 30 px; sprite y-offsets 8·z for gnomes, head height·z for animals (11228, 11236).

---

## 5. UI elements, controls and input handling

### DOM (231–314) touched here
- `#rail` (264) fixed bottom, column flex, `pointer-events:none` with children re-enabled (CSS 77–79, 102, 108).
  - `#tools` (265) horizontal scroll-snap strip, scrollbar hidden, fade masks (CSS 80–92). `.tool` glass pill with `.sw` 17×17 swatch (CSS 83–95); pressed = ink background + 2 px lift.
  - `#grow` (266–271): `#bBuild`, `#gstat` chip (ellipsised, max 60 vw, CSS 182), `#bPause`, `#bStop`. Hidden unless `body.gnome` (CSS 179–181).
  - `#sizerow` (272–275): `#sizewrap` (`#sizelbl`, `#size` range 1–6, `#depth` tabular-nums 64 px) fades in via `.on` (CSS 110–114); `#bUndo`.
  - `#rail2` (276–290): speed group, turn L/R, Fit, Sound, `#bPlay` ("Be a gnome"/"Creator"), Photo, New.
- `#bld` (256) dialog: `#bldX` close, `<h4>Build</h4>`, `#bldGrid` 3-column grid of buttons (CSS 196–206; disabled 0.45 opacity).
- `#gbar` (255): `.t` (`#gbName` display-font 16 px bold, `#gbCost` 11 px), `.m #gbMsg` italic (red `.no`), `.b` (`#gbPlace` ink-filled when enabled, `#gbCancel`) (CSS 184–195).
- `#card` (244) — in gnome mode restyled as a one-line strip (CSS 171–178). `#hint` (254) toast.
- Both `#gbar` and `#bld` have a CSS fallback `bottom: safe-area + 108px`, but `layoutOverlays` (10689) overrides `style.bottom` at runtime from the rail's measured height.

### Button wiring (outside range, `boot()` 12184–12197)
- `#bPlay` → `setMode(toggle)`.
- `#bBuild` → close panel if open; cancel pick if one is active; else `openBuild()`.
- `#bldX` → `closeBuild`. `#gbPlace` → `pbPlace()` then refresh. `#gbCancel` → `pbClear()` + toast "Nothing placed".
- `#bPause` → toggles `PB.paused`; when pausing, drops the player's current job on that site unless they are mid-BUSY action; toast "Paused — Go on, or tap the site, to carry on".
- `#bStop` → `pbStop()` (6019) then refresh. `#bUndo` → `undoStroke`. `#size` input → `brush`, `showDepth`.

### Canvas input (`setupInput` 11165)
- `pointerdown`: pointer capture; first pointer → tap bookkeeping, pan (hand) or stroke start (other tools). Second pointer → kills drag, starts pinch, records the world tile under the midpoint as `cam.turnKeep` so "the ground under the fingers stays under the fingers".
- `pointermove`: accumulates movement; pinch → zoom + optional rotate + re-centre; drag → pan; paint tool + single pointer + throttle expired → `paintTile`.
- `pointerup/cancel`: ends pinch; on last pointer, tap detection routes to `playerCommand` (gnome) or `tapSelect` (creator).
- `wheel`: zoom, `preventDefault` (passive:false).
- All pointer listeners are `passive:true`.

### Accessibility
`aria-pressed` on tool and mode buttons, `aria-label` on every control, `role="dialog"` + `aria-label` on `#bld`, `:focus-visible` outlines (CSS 95, 109). No keyboard handling for the canvas itself.

---

## 6. MODE 'creator' vs 'gnome'

- `MODE` global (5630) defaults `'creator'`. `setMode` (11246) is the only switch; `#bPlay` toggles it (12184).
- **Entering gnome** (11248–11257): spawns `PLAYER` via `playerArrive()` if none/dead; forces `setTool('hand')`; selects and follows the player; zoom to ≥1.5; card shown as the gnome strip; 6-second tutorial toast ("Tap the ground to walk; a tree, rock, bush, water or site to work; the fire to rest.").
- **Entering creator** (11258–11262): drops follow and selection; `pbClear(); closeBuild(); updateGbar()` so no ghost/panel survives; toast says the player gnome "goes on as one of the hamlet/village" (`vilOf` 2488) — the avatar persists as an ordinary villager.
- `body.gnome` class (11264) drives CSS: hides `#tools`, `#sizerow`, `#bUndo` (169); shows `#grow` (181); compacts `#card` (171–178).
- `#bPlay` label flips "Creator" ↔ "Be a gnome" with `aria-pressed` (11265; CSS 170).
- `updateGrow` (10995) early-returns unless gnome; `updateGbar` (11022) only re-shows the card when `MODE==='gnome' && selected===PLAYER`.
- Tap routing (11216): gnome → `playerCommand` (an order), creator → `tapSelect` (inspect/follow).
- In gnome mode the terrain tools are unreachable by UI, but `setTool`/`undoStroke`/`beginStroke` remain callable from the debug harness (12226); nothing in `paintTile` checks `MODE`.
- `playerCommand` with an active pick (11269) swallows the tap for ghost placement, so the avatar cannot be walked while choosing a site; Cancel/Build-again clears it.

---

## 7. Progression / unlock / economy

- No unlock tree in this section; the Build panel lists all 26 `PB_LIST` types always (11007), gated only by `PB_NEED_HOME` + a finished home, and by the one-project-at-a-time rule.
- Costs are informational here (`pbCostText`); actual material flow happens in `pbPlace`/`stageProject` (4107) and the gnome work loop. `pbStatus` (6030) shows "k of n · needs wood (none in the store)" when the next plan step's material is short after `reserveOf` (4149: cold weather reserves 2 wood per gnome).
- Creator tools are free and unlimited (sandbox), apart from the 6-spring cap and the destruction they cause (`checkFoundations`).

---

## 8. Persistence

None. The file has no `localStorage`/`sessionStorage`/IndexedDB anywhere (grep returned nothing). `undoStack` is cleared on `newIsland` (12104). Tool, brush, mode and camera are session-only; the island is re-derived from a seed in the URL hash (`seedFromHash`, 12129).

---

## 9. Mobile / touch / performance tricks

- Pointer Events with `setPointerCapture` (try/catch for browsers that throw) and `passive:true` listeners; the only `preventDefault` is on wheel.
- Pinch handles zoom **and** rotation with a 0.06 rad dead zone so a two-finger pan doesn't twist; rotation target is eased each frame by `turnStep` so fingertip jitter never reaches the picture (comment 11197–11198).
- Tap vs drag disambiguation by 9 px / 420 ms.
- Drag-paint throttled to 10 Hz (`paintCool`) — each `paintTile` runs `setMaterials()` + `markSea()` over the whole grid plus `checkFoundations`, so throttling matters.
- Undo snapshots are typed-array copies (fast `Float32Array.from`/`.set`), capped at 10.
- Rail uses `env(safe-area-inset-bottom)` padding, horizontal scroll-snap, `backdrop-filter` glass, and gradient masks as scroll affordances instead of arrows.
- `layoutOverlays` measures the rail once per change and stacks the card/ghost bar/toast above it rather than using fixed offsets.
- `focusY` reads `getBoundingClientRect` of up to 10 elements per frame while following — cheap but note it runs every frame in `followStep`.
- Camera follow is frame-rate independent (`1-0.02^dt`).

---

## 10. i18n (en/es)

- **None in this range.** Every string is hard-coded English: "Go on"/"Pause", "Finish or stop your … first", "needs a home of your own", "tap more, or Place", "tap elsewhere to move it, or Place", "Spring stopped", "wells up", "Undone", "You are {name}. Tap the ground to walk; …", "{name} goes on as one of the hamlet/village", "Creator"/"Be a gnome", "{name} is busy — a moment", "{name} is asleep", tool labels Look/Raise/Lower/Spring/Rock/Sapling/Berries, "Flow"/"Brush", "1 tile"/"N tiles".
- `SPRING_NAME` relies on English article surgery (`replace('a ','')`, `replace(/^a /,'A ')`, 11066, 11085) — will not port to French/Spanish.
- The only i18n in the whole file is the intro screen (`langs={en,es}` at 12200–12214, `lang` is a local inside `boot()` and never reaches game strings).
- Event-log lines ("You opened a stream on the hillside", "You stopped a seep") are also composed inline in English.

---

## 11. Oddities, bugs, dead code, TODOs

1. **Dead statement** 11134: `if(BRIDGE[i]>0&&E[i]+wetD(i)>BRIDGE[i]) {}` — empty body, a leftover of a planned "water rises over a bridge" check.
2. **Dead variable** `pinchWorld` (11163, 11213): declared and nulled, never read.
3. **Dead field** `label: tool` in `snapshotWorld` (11090): never read anywhere.
4. **Shallow undo of entities** (11090): `trees/bushes/rocks/springs` are `slice()`d, so the objects are shared. A Lower stroke that sets `t.fall=0.001` on a tree (11133) mutates the very object the snapshot references; after Undo the tree is back in the array but still falling. Same class of issue for any per-object mutation during a stroke (`t.marked=0`, `rocks[].marked`). Terrain is correctly deep-copied.
5. **Brush size is cosmetic for Rock / Sapling / Berries**: `setTool` shows the slider with "Brush … N tiles" for every non-hand tool (11071–11072), but those three tools only act at `dd<0.5` (11139, 11144, 11153), i.e. the centre tile. Only Raise/Lower use the disc; Spring reuses it as Flow.
6. **Rock placement vs `OCC`**: the `OCC` guard at 11126 covers every tool, so a boulder can never land on a building tile; but the `WD<0.2` guard (11139) only looks at water on the centre tile, so a rock can be dropped on a riverbank one tile from a stream with no erosion check.
7. `updateGrow` (11002) reads `$('bBuild')` without the null guard it applies to `#gstat` (10998) — harmless since the DOM is static, just inconsistent.
8. `openBuild` is reachable only via `#bBuild`, which is inside `#grow` (gnome-only), yet `openBuild` itself never checks `MODE`; the harness could open it in creator mode.
9. **Undo does not touch** `OCC` except through fallen builds, nor `ICE`, `RELAX`, `SEAC`, gnome positions, or `PB`/`PLAYER.project`. Since paint skips `OCC` tiles and `initWater` re-runs `markSea` (1093), this is consistent in practice.
10. `undoStroke` while a gnome is `'float'` forces it to `idle` with `z=0` (11111) — abrupt but intentional.
11. A second finger landing mid-stroke keeps the stroke open: pinch suppresses painting (11188 early return), but after lifting one finger the remaining finger resumes painting on the **same** undo entry (no new `beginStroke`). Acceptable, but worth knowing.
12. `tapSelect` comment "a gnome wins a near tie with an animal" is implemented as a 4 px bias **plus** a larger gnome radius (34 vs 30) — two mechanisms for one rule.
13. The 420 ms tap window means a long press is silently ignored (no context action); no long-press affordance on the canvas.
14. `wheel` zoom does not clear `cam.follow` while drag does (11206 vs 11222) — intentional (zoom while following) but asymmetric with pinch, which clears follow (11199).
15. `followStep` tests `g.k==='rabbit'`, `g.inFlyer`, `g.isFlyer`, `g.moor` on whatever is followed — duck-typing across gnome/critter/boat/flyer/build. `followAlive` additionally accepts any object with `.pt` (an event-log place marker).
16. `setMode('gnome')` toast is set **before** `layoutOverlays` runs for the new card layout — `toast()` calls `layoutOverlays` itself (10685) so the hint lands correctly; fine.
17. Section header (10993) says "v9.9" but the body carries v9.10, v9.16, v9.20, v9.21, v9.22, v9.24 annotations — version drift in comments only.
18. No TODO markers in the range.

---

## 12. Reusable engine/shell vs gnome-specific content

### Reusable as-is (shell / engine)
- **Pointer shell** `setupInput` + `ptrs/pinch/downInfo` (11161–11223): pan, pinch-zoom, pinch-rotate with dead zone, tap detection, drag-paint throttle, wheel. Only the two tap targets (`playerCommand`/`tapSelect`) and the paint hook are game-specific.
- **Camera follow & pivot** (11277–11322): `followStep`, `focusY` (overlay-aware framing), `keepCentre`, `screenCentreWorld`, `centreOn`. Needs only a list of overlay ids and a height function for the followed entity.
- **Undo pattern** (11087–11115): snapshot typed arrays + entity arrays, 10 deep, `beginStroke` on pointerdown, with a hook for "things destroyed by this stroke". Generic if the array list is parameterised.
- **Tool rail** `TOOLS`/`TOOL_ICON`/`buildTools`/`setTool`/`showDepth` with scroll-snap and fade masks: a data-driven palette. Swap the data.
- **Brush kernel** in `paintTile`: disc + smoothstep falloff + border guard + occupied-tile guard, with per-tool branches. The raise/lower branch is a general heightmap sculptor.
- **Mode switch skeleton** `setMode`: body class, button relabel, forced tool, follow/select the avatar, clear build state on exit.
- **Build-panel pattern**: list-of-types → grid of buttons with cost text and disabled reasons → pick → ghost on the map → Place/Cancel bar → owned project with status chip + Pause/Stop. The DOM/CSS (`#bld`, `#gbar`, `#grow`) and the four functions 10995–11033 are generic given `PB_LIST`, `pbCostText`, `pbGhost`, `pbStatus`.
- CSS layout conventions: fixed bottom rail with safe-area padding, `layoutOverlays` stacking, glass pills, `aria-pressed` states.

### Gnome-specific content (replace)
- Tool set (Raise/Lower/Spring/Rock/Sapling/Berries), their SVG icons and swatch colours, and every branch of `paintTile` except the generic kernel.
- Spring mechanics (`SPRING_RATE`, 6-spring cap, water seeding), tree felling by digging, bush removal, "pat the sapling" job dispatch, `jostle` kinds (`bury`, `yelp`, `rock/heave`), `dugRecently` floating.
- Undo's `fallen` restoration (bridges, piers, dams, paving, steps, households, village projects, salvage) — tied to the gnome build system.
- `PB_NEED_HOME`, `PB_LIST` content, cost wording ("a stone a tile", "the work only").
- `tapSelect`'s entity taxonomy (gnomes, deer/fawn/fox/rabbit, boats, balloon/glider) and hit heights.
- `playerCommand`'s message vocabulary ('busy', 'asleep', 'walking') and `playerTap`'s target semantics (tree/rock/bush/water/site/fire).
- All English copy and the article-stripping hacks.
- Tuning: 0.6 height step, EMAX 9, DIG_FLOOR 1.0, SOIL caps, wetness thresholds 0.12/0.2, FOUND_MOVE 0.5.

---

## 13. Design questions for the Parque D'Amour port raised by this section

1. **What are the Creator tools?** Gnome Village sculpts terrain and seeds nature. In a park: lay paths, plant hedges/flowerbeds, place benches, fountains, lamps, a bandstand? Which are *brush* tools (area, with falloff) and which are *stamp* tools (single tile, like rock/tree here)? Should the brush slider even exist for stamps (see oddity 5)?
2. **Is terrain height a mechanic at all?** If the park is flat, Raise/Lower, `E/E0/SOIL`, `checkFoundations`, `DIG_FLOOR`, `dugRecently` and the "ground moved under it" collapse rule all go away — or become "dig a pond / raise a mound" with a much smaller role.
3. **What does a creator stroke destroy, and should it be undoable?** Here moving ground collapses buildings and undo rebuilds them (the `fallen` record). For a romance game: does bulldozing a bench where a couple sits break a scene? Does undo rewind the couple's mood? Decide whether undo is terrain-only or also narrative state.
4. **Undo depth and scope**: 10 strokes, terrain + entity arrays. Will the port need undo of placed props, of sabotage actions, of dialogue choices? Should undo exist in avatar mode (it is hidden in gnome mode here)?
5. **What is the avatar's "Build" equivalent?** `PB_LIST` is 26 structures with material costs. In the park the avatar might *arrange* things (a picnic, flowers, a letter) rather than build. What is the pick → ghost → Place → owned-project loop for that? Is there a progress chip ("k of n") and Pause/Stop?
6. **Gating rule for picks**: `PB_NEED_HOME` gates three items on owning a home. What gates park actions — reputation with the couple, time of day, money, items in hand?
7. **One project at a time?** The gnome may own one build. Does the park avatar carry several intents (assist *and* sabotage)? How is a conflicting pick refused and worded?
8. **Tap semantics in avatar mode**: `playerCommand` turns a tap into walk / work / rest depending on what is under it, and swallows taps while a ghost is active. Define the park's tap verbs (walk, talk, sit, hide, eavesdrop, pick flowers) and whether an active placement should block walking.
9. **Tap semantics in creator mode**: `tapSelect` picks gnomes, animals, boats, flyers with per-species hit radii. What is selectable in the park (lovers, rivals, passers-by, pigeons, props) and what does selecting do (follow, card, mood readout)?
10. **Follow framing**: `focusY` positions the subject 46 % down the clear band and lists specific overlay ids. The port will have different sheets (dialogue, mood card, sabotage menu) — list them for `focusY` and decide the vertical bias.
11. **Camera rotation**: pinch-rotate and 90° button turns assume an isometric rotatable isle. Does a French park need rotation, or a fixed painterly view with pan/zoom only (which deletes `turnKeep`, `keepCentre`, `screenCentreWorld` and half of the pinch code)?
12. **Zoom limits**: `[min(0.30, fitZ*0.85), 3.0]` and the 1.5 zoom-in on entering avatar mode — tune for the park's map size and sprite scale.
13. **Mode persistence of the avatar**: on leaving gnome mode the avatar "goes on as one of the village". Does the park avatar stay in the scene as an NPC when the player is Creator, keep its relationships, and can Creator-mode sabotage affect their own avatar?
14. **Placement feedback copy**: the ghost bar's messages ("tap elsewhere to move it, or Place", "not that tile: stone goes on dry open ground") are rule explanations. Each park placement rule needs its own reason string — and in which language(s)? The section has zero i18n; decide now whether UI strings are a table (fr/en/es) rather than inline literals.
15. **Persistence**: nothing is saved. A romance arc is long-form — does the port need save/load (localStorage) of world + narrative + undo stack?
16. **Touch affordances**: tap 9 px/420 ms, no long press. Will the park want long-press (e.g. whisper/sabotage menu on a character) or double-tap? The clock pill already uses a double-tap at 12180.
17. **Which rail rows survive**: `#tools` (creator palette), `#grow` (avatar actions), `#sizerow` (brush + undo), `#rail2` (speed, turn, fit, sound, mode, photo, new). Speed 1–20× and "New" island are sim-sandbox affordances; a story game may want scene skip or day/night control instead.
18. **Entity height model** for follow/hit-testing (`topAt`, flyer altitudes, rabbit hop): define the park's z-conventions (ground level, benches, a balcony?) or flatten to 2D.
