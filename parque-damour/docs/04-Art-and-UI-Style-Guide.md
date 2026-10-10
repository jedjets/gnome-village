# Parque D'Amour: Art and UI Style Guide

Version 1 · 2026-10-10 · Owner: Jeduthun Oosthuis · Author: Claude (design session)

**How to use this document.** This is the art bible for every model that draws, styles or lays out anything in Parque D'Amour. Read `01-Decision-Register.md` (the register) and `00-Product-Brief.md` (the brief) first; every number, name and id here matches them, and where this document defines a value they do not, that value is listed in section 13 so the owner can object. Section 1 describes what Gnome Village (GV) looks like today, precisely enough to reproduce it; "GV 6445" means line 6445 of the GV HTML file as indexed in `10-Gnome-Village-HTML-Architecture-Review.md`. Section 2 analyses the owner's three reference images. Section 3 defines the three directions for the Style Gate; section 4 specifies the board that renders them. Sections 5 to 11 lock everything that does not depend on the gate. Section 12 is the checklist for any model doing art work. Rules marked "Do not" are hard limits. "Done when" lines are acceptance tests. No model draws a final prop, figure, ground or sky before the owner's pick is recorded in the register §4 (brief 3.4 rule 3).

---

## 1. What GV looks like today

### 1.1 Projection and camera (ported as is)
| Item | Value | GV line |
|---|---|---|
| Tile width, height at zoom 1 | `TW = 26`, `TH = 13` px (2:1 soft isometric) | 569 |
| Height unit | `EH = 26` px per level at zoom 1 | 569 |
| Vertical anchor | `VANCH = 0.46` of canvas height | 6332 |
| Screen x | `cw/2 + (rx − ry)·TW/2·z + ox` | 6382–6384 |
| Screen y | `chh·VANCH + ((rx + ry) − (N − 1))·TH/2·z − e·EH·z + oy` (GV subtracts `SEAS`; Parque has `e = 0`) | 6382–6384 |
| Rotation | any angle about the grid centre; quarter-turn buttons; pinch twist after a 0.06 rad dead zone | 6345–6349, 11199, 12142–12150 |
| Turn easing | `ang → angT` by `1 − 0.0008^dt` (buttons), `1 − 0.00002^dt` (pinch), snap below 0.0015 rad | 6349 |
| Painter's order | counting sort of `rx + ry` into 1/64-tile buckets, recomputed only when the angle changes | 6374 |
| Coarse LOD | 2×2 cells when `TW·z < 15` px (z < 0.577) | 6364 |
| Zoom range | 0.30 to 3.0 | 11195 |
| `dpr` | capped at 2; `imageSmoothingEnabled = false`; one `setTransform(dpr)` per frame | 6335, 12044 |

Parque keeps every row. Fit frames the 48×48 park plus the 8-tile apron (register 3.1), not an island shoreline (GV `fitCam` 6400 fits land).

### 1.2 Palette `C` (GV 6445–6448) and the other colour constants
The 23 entries of `C`, as hex:

| Name | Hex | Name | Hex | Name | Hex |
|---|---|---|---|---|---|
| grass | `#9CCB92` | sand | `#E9D7AE` | shallow | `#9AD2E6` |
| grassL | `#B4DCA6` | sandL | `#F3E5C6` | foam | `#F4FAFC` |
| upland | `#A9CFA0` | snow | `#EEF2F6` | pave | `#CBC4B6` |
| dirt | `#C7A98D` | water | `#6FB8DC` | paveL | `#DBD5C8` |
| dirtL | `#D5BB9F` | deep | `#4C95C3` | paveD | `#A49C8E` |
| stone | `#B2B1C1` | autumn | `#C9CB8E` | bank | `#B9A48A` |
| stoneL | `#C4C3D1` | ice | `#DCE9F1` | prep | `#BE9C7C` |
| | | iceL | `#EEF5F9` | track | `#B9C4CF` |

Other constants a port needs:

| Constant | Value | GV line |
|---|---|---|
| `FOGC` (fog mix target) | `[226,232,238]` = `#E2E8EE` | 6449 |
| `NIGHTC` (night water target) | `[44,50,82]` = `#2C3252` | 6494 |
| `SKIN`, `LINE` (figure) | `#F0DCCB`, `#736C82` | 8046 |
| `TRUNK` | round `#B39A86`, pine `#A38C7C`, birch `#E2DDD6` | 6743 |
| `AUTUMN` foliage choices | `#D9A441`, `#C8763F`, `#E3B94A`, `#D98B3C` | 6765 |
| Foliage by phase | pine `#8FBF9B` (winter `#8FB6A4`); blossom `#F4CBD8` / `#F8DCE4` (birch `#CFE4A6`); bud and leafing `#C4E2B4` (birch `#CBE3A9`); summer `#A5CF97`; spring leaf `#B9DEAE` | 6766–6775 |
| Heart particle | `#EDA9C4` (the `--berry` token) | 8622 |
| Lit lantern pane, flame | `#F0BE6A`; `rgba(255,246,216,0.95)` | 8000, 8004 |
| Weather dot `WCOLD` | clear `#F3D9A8`, fair `#DCE9F2`, cloudy `#C8CCDA`, rain `#9FBCD4`, mist `#DDE2E8`, snow `#EFF4FA`, breeze `#CDE3D8`, storm `#6E7A9A` | 10774 |
| Body background, theme colour | `#DCE6EC` | 6, 8, 26 |

About 180 further hex literals sit inside drawing code with no table (review §7.2). Parque forbids that: section 4.5.

### 1.3 How GV colours the ground (summary of review §7.4; `groundCol` GV 6665–6741)
1. Base grass: `mix(grass, grassL, 0.35)`; upland above level 6.3 uses `mix(upland, grassL, 0.25)` (6670).
2. Season: autumn mixes 0.28 toward `C.autumn`; summer mixes 0.25 toward `C.grass` (6671–6672).
3. Then, in order: steep faces toward earth and stone, shore sand, rock and scree by a 9-tap neighbourhood count (`matAmt` 6656), bared and thin soil, sand fields, seepage darkening (×0.86, ×0.90, ×0.92), hollow shadow up to −16 %, ambient occlusion `AO`, a bank strip 0.32 toward `C.bank` beside water, wet sand, mine pit, prepared plot 82 %, trodden green `TROD·0.40` (6733), fire yard 30 %, the snow line (6736).
4. Grain: two octaves of value noise over a 32×32 lattice seeded with a fixed LCG 1337 (`NZ` 6630, `nzAt` 6631, `grain` 6638), applied as ×(1 + j·0.075, 1 + j·0.075, 1 + j·0.06); plus a finer warm-cool meadow mottle (±4.5 % red, +2 % green, −3.5 % blue) at 0.83 tiles (6738–6740). Nothing lines up with the tile edges; that is what stops a lawn reading as a grid of diamonds.
5. Light: per-tile Lambert `0.82 + 0.28·n·SUNL` (9407, 9429) with `SUNL = (−0.50, −0.30, 0.82)` normalised (6450), blurred over 4 neighbours, then `fitTileGrad` (9471) fits a pan-invariant linear gradient per tile when the corner luminance spread is ≥ 6 (`GRAD_MIN`) and `z > 0.5`.
6. Cadence: every per-tile colour is cached per "colour epoch", bumped every 220 ms, or 110 ms while turning (9586–9587).

Parque keeps rows 1, 2 (retuned per direction), 4, 5 and 6, and the wet darkening and snow of row 3. Parque drops soil, sand, slope, scree, seepage, hollow, mine, plot and yard rules: the ground is flat (register 3.1).

### 1.4 Trees, bushes, rocks, flowers
1. A tree is `{x, y, sp, age, sd, h, lean, blobs[], branches[], twigs[]}` (`makeTree` 1692–1697): heights pine 40–64, birch 34–50, round 30–52 units; lean ±0.10 rad.
2. `buildTreeShape` (1703–1728) gives each species three forms from the seed: round = dome, tall oval, umbrella; pine = cone, slim spire, broad fir; birch = tuft, tall wisp, forked pair. A crown is a list of circles ("blobs") with `x, y, r` in units of `h`; winter crowns are twig lists off the branches plus a fan off the trunk top.
3. `crownPhase` (6749–6762): pine always `leaf`; `bare` in winter or `cold > 0.62`; spring `bud` 0–0.9 d, `blossom` 0.9–1.9 d, `leafing` to 3.0 d; autumn `thin` after day 2.0.
4. `treeSprite` (6782–6835) paints a tree once into an offscreen canvas keyed by seed, species, zoom bucket (8 per octave), age, season, phase, light, warm tint and snow; the cache clears at 1400 entries. Trunk line width `max(1.4/Z, h·0.058)`. `drawTree` (6837) blits it with lean, wind sway when `wind > 0.2` and `z > 0.55`, and culls below 2.5 px.
5. Bushes (6862): `s = 13·z`, three lobes, berries `#D9607D`; rocks (6886); flowers only at `z > 0.8` (6907); ground cover tufts, clover, pebbles only at `z ≥ 1.0` (6923), hidden on worn, paved, occupied or wet tiles.

Parque keeps the blob-crown model, the per-species forms, the phase machine and the sprite cache; it replaces the species with plane, chestnut and lime (section 6.3) and drops bushes, rocks and wild cover.

### 1.5 The house kit vocabulary (GV 6953–7307, 7978–8010)
| Primitive | What it does | GV line |
|---|---|---|
| `wp` | world point to screen (`screenOf`) | 6953 |
| `poly` | fill or stroke a list of world points | 6955 |
| `faceVis(n)` | a face is visible when `rot(n)·(1, 1, 0.5) > 0` | 6958 |
| `faceLight(n)` | face brightness 0.74 to 1.04 from `SUNL` | 6959 |
| `shade(c, k)` | darken a colour | 6960 |
| `h01(seed)` | hash to [0, 1) for per-piece jitter | 6965 |
| `houseFrame(b)` | a local u/v frame rotated by `b.rot` quarter turns | 7048 |
| `drawHouse` | footing, far walls, floor, near walls, openings with depth (`reveal` 7169), roof rows (`roofRow` 7309) | 7080–7307 |
| `reveal` | windows lit when `light < 0.65`; door lantern at `light < 0.42` | 7169 |
| `drawLantern` | post, bracket, hanging housing; lit at `light < 0.5`; glow = radial gradient radius `1.15·s` from `rgba(255,214,150,0.32)` to 0; pane `#F0BE6A`; flame teardrop | 7978–8010 |

Parque keeps `wp`, `poly`, `faceVis`, `faceLight`, `shade`, `h01`, `houseFrame` and the `roofRow` idea, and the lantern glow recipe. Parque drops `cobbles` (6967), `plankFace` (7064), the masonry and log kit (10124–10201), thatch, bark, chimneys, smoke and the construction progress gates (`stc` 7968).

### 1.6 The gnome rig (GV 8045–8442)
| Item | Value | GV line |
|---|---|---|
| Adult height at zoom 1 | `GH = 14.3` px; drawn height `h = GH·z·(g.h/19)` | 8047, 8179 |
| Not drawn | `h < 3` | 8180 |
| Rig (fractions of `h`, up from the feet) | hip −0.30, shoulder −0.56, head centre −0.72, head radius 0.135, arm 0.27, line width `max(0.9, 0.075h)` | 8240–8242 |
| Walk | leg swing `sin(walkPh)·0.15h`; hop arc 0.22h | 8239, 8187 |
| Sitting | crouch 0.24h; legs folded forward | 8233, 8248 |
| LOD tiers | signifier tool at `h > 4`; sash at `h > 7`; eyes at `h > 10`; tunic, belt, hands, nose, cheeks, hat band at `h > 18` (zoom ≈ 1.3) | 8341, 8266, 8407, 8259–8265 |
| Face | skin disc; two eye dots `#5A5468` r 0.16·hr; nose `#E6C4B0`; blush `#F0A8B8` at alpha 0.42 | 8407–8414 |
| Pose tables | lean, bob and crouch per state (8212–8236); ~55 front and back arm angles in radians (8272–8331); `toolFor` state → hand prop, `drawTool` along the handle (8050–8160) | 8212–8331 |
| Swing sync | `SWING_P` periods shared with the sim; `swingCurve` strikes at phase 0.62–0.72 | 8081–8088 |
| Selection ring | pulsing white ellipse `h·0.40 × h·0.16`, alpha 0.5–0.75, fill 0.10 | 8435–8440 |
| Player ring | same, 8.5·z × 4.2·z, alpha 0.55–0.80 | 9529–9534 |

What GV got wrong for a romance game: faces appear only at zoom 1.3 or more (review §15 item 53). Section 7.1 raises the base height and lowers the tiers.

### 1.7 Lighting and golden hour (`computeAmbient` GV 6452–6464, `lit` 6465)
1. `light = clamp01(−cos(2πf)·0.86 + 0.42)` (815). Parque replaces this with the register's eight bands and the linear table in `02-Game-Design.md` §3.2.
2. Ambient multiplier `AM = mix([0.46, 0.50, 0.72], [1, 1, 1], light^0.7)`: night keeps 72 % of blue and 46 % of red, so the scene goes dark teal, never grey.
3. Cloud dims 12 % and a storm front 16 % more, evenly across channels except blue ×0.92 of the dim (6458).
4. Warm tint: `warm = tri(f, 0.26, 0.11) + tri(f, 0.74, 0.11)` (triangles of half-width 0.11); `AA = warm·0.22·max(0.25, light)`; tint colour `AT = [255,204,162]` before noon, `[255,186,158]` after (6460–6462).
5. Fog alpha `FOGA = mist·0.30 + rain·0.03 + snow·0.14` (6463); per-cell fog also grows with depth, `clamp01(1 − depth/(2N))·0.22 + FOGA·0.55` (review §7.7).
6. `lit(c)` multiplies by `AM` then lerps toward `AT` by `AA`; `GC(hex, alpha)` memoises the CSS string, flushed at 900 keys (6471).
7. Water at night mixes toward `NIGHTC` by `(1 − light)·0.52` (`nightW` 6494).
8. Sun direction `SUNL = (−0.50, −0.30, 0.82)`; shadows are off (`DBG.shadows: false`, 12041).

### 1.8 Sky (`SKYR` GV 6480–6488, `paintSky` 6535–6581)
| f | top | bottom |
|---|---|---|
| 0.00 | `#2C3252` | `#4A5170` |
| 0.17 | `#4A5075` | `#8C87A8` |
| 0.24 | `#7C8CBA` | `#F2C8B0` |
| 0.31 | `#A5C4DE` | `#F7DFCB` |
| 0.50 | `#A9CEE7` | `#E7F0F3` |
| 0.68 | `#9BB9DC` | `#F2D6C0` |
| 0.76 | `#7A85B4` | `#F0BFAC` |
| 0.85 | `#3D4467` | `#5C6389` |
| 1.00 | `#2C3252` | `#4A5170` |

70 stars (visible when `light < 0.42`) and 10 clouds from the visual RNG (6497); sun r 17 px when `light > 0.16`, crescent moon r 12 px, on an ellipse 0.62·cw × 0.46·chh (6555–6557); storm bank of 7 blobs; far shore as two sine bands over a sea gradient; the backdrop is an offscreen canvas repainted at most every 260 ms (6525–6532).

### 1.9 Weather overlay (`drawWeather` GV 10062–10105)
1. Rain: `n = rain·95·(cw·chh)/(390·800)` dashes, two depth layers, colour `rgba(206,224,240, 0.13 + 0.15·rain)`, length `(5 + 4·rain)·zz`, speed 460–700 px/s, slant `−wind·(7 + 6·rain)`, none above the horizon, positions hashed from index and time (no particle state).
2. Snow: `n = snow·120·(cw·chh)/(390·800)` discs `rgba(248,250,255,0.82)`, radius 0.9–2.2 px, sine sway.
3. Lightning: full-canvas `rgba(236,240,255, 0.38·flash)`.
4. Ambient effects (`ambientFx` 8820–8847): fireflies on warm dusks, spring morning mist (cap 44), raindrop rings on the ground at `rain > 0.25` and `z > 0.7`.

### 1.10 The paper HUD (GV CSS 16–23 tokens; the glass recipe)
Tokens (exact values go into `src/styles/tokens.css`, brief 3.2): `--paper #F1EDF5`, `--paper-2 #E6E0EF`, `--ink #4A4458`, `--ink-soft #6E6680`, `--moss #8CBE85`, `--sky #A6CDE6`, `--berry #EDA9C4`, `--ember #F2B67E`, `--stone #B9B7C6`, `--glass rgba(250,248,253,.82)`, `--glass-line rgba(74,68,88,.13)`, `--shadow 0 2px 10px rgba(74,68,88,.13)`, `--ui` Figtree stack, `--display` Fraunces stack.

The glass recipe, used by every floating element:
| Element | Recipe | GV CSS |
|---|---|---|
| chip `.chip` | background `--glass`, 1 px `--glass-line`, radius 999 px, padding 4 px 9 px, `backdrop-filter: blur(9px)`, `--shadow`, tabular numerals, a 1×11 px separator between fields | 35–40 |
| tool pill `.tool` | same glass, radius 14 px, padding 7 px 11 px 6 px, a 17×17 px swatch (radius 6 px, 1.5 px border) above a label, `transform: translateY(−2px)` when pressed | 83–96 |
| pressed state | background `--ink`, text `#FBF9FE` | 93, 108 |
| button group `.grp` | glass pill, padding 4 px, inner `.gb` buttons transparent | 103–109 |
| card `#card` | glass, radius 14 px, `blur(11px)`, min-width 186 px, max-width `min(300px, 88vw)`, `h3` in Fraunces, 4 px bars on `--paper-2` | 125–137 |
| sheet (`#census` and kin) | glass, radius 16 px, `blur(11px)`, width `min(94vw, 420px)`, max-height 52 vh, bottom = safe-area + rail height + 8 px (`layoutOverlays` 10689) | 48–72, 196–225 |
| toast `#hint` | `rgba(74,68,88,.86)` on `#FBF9FE`, radius 16 px, fade 0.3 s | 158–161 |
| intro `#intro` | radial gradient `#F7F2FA` 0 % → `#E4E9F0` 55 % → `#D6E1E6` 100 % at 50 % 12 %; `h1` Fraunces 34 px; Begin as an ink pill with shadow `0 4px 14px rgba(74,68,88,.24)` | 140–156 |
| transitions | 0.13 s on tool pills, 0.18 s on the card, 0.5 s intro fade; all killed under `prefers-reduced-motion` | 86, 129, 142, 229 |

GV type sizes are 8.5 to 11.5 px (review §13). Section 5.2 raises them.

---

## 2. The three references, analysed

### 2.1 ref1: flat pastel vector map of Paris
1. Shapes: chunky, rounded, icon-like; buildings are stacked rectangles with repeated window rows and a darker roof slab; trees are 3 to 5 overlapping discs; the river is one pale band with a lighter wavy stroke; paths are beige ribbons with soft corners.
2. Line: none. Shapes meet at value steps. Nothing is outlined.
3. Colour: cream `#F3E9D8` walls, sage `#A8D1A0` lawn, deeper `#7DBF7A` tree discs, sky `#BEDFF2` river, awning and roof red `#E25B5F`, mustard `#F2C14E` chairs and fountain, zinc blue-grey `#A9B5C3` for the tower and roofs. Saturation is medium, value is high; no blacks.
4. Shading: two tones per object (base and one darker face), no gradients, no cast shadows.
5. Texture and lighting: none; every object is lit the same way.
6. Take: the colour mood (cream, sage, rose, sky, awning red); the striped café awning and bistro chairs; the fountain icon; the river as scenery with a sailboat; the balloon over the park; the whole of direction B.
7. Leave: the bird's-eye map projection (Parque is isometric); the lack of any shading on figures (figures must read at 22 px).

### 2.2 ref2: watercolour girl with beret and baguette basket
1. Shapes: long limbs, small head, profile walk with a long stride; a dot eye, a blush cheek, no mouth; hands as simple wedges.
2. Line: a thin grey-brown pencil contour, slightly broken, drawn once; the wash does not stay inside it.
3. Colour: black beret, red hair ribbon, orange ponytail, blue and white horizontal stripes, white trousers, black flat shoes, a tan wicker basket with two baguettes.
4. Shading: transparent washes; one slightly darker wash marks a fold or the inside of the basket.
5. Texture and lighting: cold-press paper grain visible everywhere, including inside the washes; local colour only.
6. Proportions measured on the figure: legs 0.55 of height, torso 0.28, head 0.12 (head radius 0.06); shoulder width 0.16 of height.
7. Take: the `a_matchmaker` avatar exactly (section 7.4); the long-limbed, small-headed rig proportions (section 7.1); the single blush dot as the main expression device; paper grain and soft, misregistered wash edges for direction C.

### 2.3 ref3: line and wash, Arc de Triomphe with autumn leaves
1. Line: loose black ink, varied weight, sketchy, with gaps and overshoots at corners; hatching for the shadowed faces; small figures as ink ticks.
2. Colour: warm ochre and amber wash `#E7B766` to `#F1D8A5` on the monument; teal `#7FB7B0` and orange `#EFA24A` on the foliage; white paper left unpainted on the lit faces and the sky.
3. Shading: wash density only; the ink hatching carries the shadow.
4. Edge: washes are deliberately misregistered from the line by about 1 to 2 % of the picture width, and bleed past it.
5. Texture: light paper grain; the washes mottle.
6. Objects to copy: the three-globe street lamp (a post with two curved arms and three round globes); bare autumn trees as ink skeletons with teal and orange wash blots; the large foreground leaf with ink veins and two-colour wash.
7. Take: the facade and lamp treatment for direction C; the autumn palette for every direction (section 10.4); the three-globe lamp silhouette for every direction (section 6.2); the restraint of leaving paper white.

---

## 3. Style Gate: the three directions

All three share the locked items of section 5 (projection, HUD paper, fonts, layout). They differ only in the scene: palette, line, shading, edges, texture, figures, trees, water, mood. Each direction is a `StyleSpec` (section 4.5). The owner picks one; the pick is recorded in the register §4 and in `profile.stylePick`.

### 3.1 Palette tokens (16 per direction)
| Token | A Storybook | B Pastel Postcard | C Line and Wash | Used for |
|---|---|---|---|---|
| `lawn` | `#9CCB92` (GV `C.grass` 6445) | `#A8D8A2` | `#D3E3BC` | `KIND` lawn base |
| `gravel` | `#D9CBAE` | `#EFDFBF` | `#F0E6CF` | `KIND` gravel, gardener paving |
| `flagstone` | `#CBC4B6` (GV `C.pave` 6448) | `#DDD6C8` | `#E6E0D3` | `KIND` flagstone, quay coping |
| `bedEarth` | `#BE9C7C` (GV `C.prep` 6448) | `#CFA883` | `#DAB890` | `KIND` bed and mulch earth |
| `water` | `#6FB8DC` (GV `C.water` 6447) | `#9DD4E9` | `#BFDDE7` | pond, canal, river base |
| `foliageSpring` | `#B9DEAE` (GV 6775) | `#C2E5AC` | `#DAE8AE` | leafing crowns |
| `foliageSummer` | `#A5CF97` (GV 6774) | `#7DBD79` | `#A3CB92` | full crowns |
| `foliageAutumn` | `#D9A441` (GV `AUTUMN[0]` 6765) | `#E9A43F` | `#EAA74C` | autumn crowns and leaves |
| `stone` | `#EADFCB` | `#F5EBD8` | `#F2DFBB` | Haussmann walls, fountain, gate pillars, bandstand base |
| `zinc` | `#9FA6B4` | `#A9B5C3` | `#B7C0C9` | roofs, railings, lamp posts, skyline |
| `awningRed` | `#D9636A` | `#E6555F` | `#DA535B` | awnings, kiosk stripes, picnic blanket |
| `ink` | `#736C82` (GV `LINE` 8046) | `#5A5468` | `#2B2832` | contours, iron, eyes |
| `paper` | `#F1EDF5` (`--paper`) | `#FBF7F0` | `#F7F3EA` | highlights, left-white areas, blossom base |
| `rose` | `#EDA9C4` (`--berry`) | `#F2A7BD` | `#EFA9BD` | hearts, blossom, rose beds, blush |
| `sky` | `#A9CEE7` (GV `SKYR` f 0.50 top, 6483) | `#C2E2F3` | `#D2E5EF` | midday sky top; water sheen |
| `lamp` | `#F0BE6A` (GV pane 8000) | `#F6C96A` | `#F2C66E` | lit globes, lit windows |

Secondary autumn colour for leaves in every direction: teal `#86BBB3` on 30 % of leaves (ref3).

### 3.2 Treatment per direction
| Aspect | A Storybook | B Pastel Postcard | C Line and Wash |
|---|---|---|---|
| Line | GV's soft contour `ink` on figures only, width `max(0.9, 0.06h)`; no outlines on ground or props; iron drawn as lines | none; shapes meet at value steps; a 1 px rim in `shade(base, 0.82)` on figures only at zoom ≥ 1.3 | loose ink `ink` on every prop, tree and figure, width `max(0.8, 0.9·z)`, jittered ±0.6·z px by `nzAt` along its length, 8 % of segments left as gaps, corners overshoot 1.5·z px |
| Shading | soft gradient: `faceLight` 0.74–1.04 on prop faces (GV 6959), pan-invariant tile gradients (GV 9471), feathered water rims | flat two-tone: base and `shade(base, 0.82)` on away faces; no gradients except the sky; no tile gradients | hatched wash: one flat wash per face plus hatching (3 ink lines per quarter tile, angle 45°) on away faces at zoom ≥ 1.0; the wash is offset from the line by (+0.6·z, +0.4·z) px |
| Edges | soft: blob crowns, feathered banks at 3.2·z px (GV `strokeBanks` 9260) | hard and crisp; corners rounded by 0.08 tile | ink hard, wash soft: wash alpha 0.85 with a 1.5·z px feather |
| Texture | GV grain ±7.5 % and meadow mottle (1.3 rule 4) | none | screen-space paper grain: a cached 256×256 value-noise tile drawn with `globalCompositeOperation = 'multiply'` at alpha 0.06 over the whole scene (not the HUD) once per frame; plus mottle inside washes (grain ±5 %) |
| Figures | GV stick rig with the new proportions (7.1), clothes as a tunic stroke, face dots | capsule bodies (rounded rectangles) in solid colour, dot eyes, no contour; hair as one flat shape | ink contour rig with washes inside, misregistered; blush dot; hair as a scribble |
| Trees | GV blob crowns with per-tree tint (`treeTint` 6776) and sprite cache | 3–5 flat discs in two greens (`foliage` and `shade(foliage, 0.82)`), flat trunk rectangle | ink trunk and branch skeleton always visible; crown as 2–3 wash blobs with a scribbled ink outline; autumn leaves ink-veined |
| Water | GV still water: depth colour, sky sheen, feathered rim, slow ripples at `z > 0.7` (9981), night mix toward `NIGHTC` | flat `water` fill, one lighter wavy stroke per tile in `paper` at alpha 0.6, no sheen; night tint by `AM` only | paper left pale: `water` wash at alpha 0.5, a darker wash band 0.3 tile wide along the bank, 3–4 horizontal ink ticks per 2×2 tiles |
| Sky | GV ramp (1.8) | ramp with the B `sky` at midday, flat clouds as 3-disc shapes | ramp mostly `paper`; clouds as unpainted paper with an ink underline |
| Mood | GV's lavender pastel storybook, dusky and soft, with French props | a cheerful tourist map in daylight; the postcard you buy at the kiosk | a sketchbook from a Paris café in autumn |
| Theme colour, body background | `#DCE6EC` (GV 6) | `#C2E2F3` | `#F7F3EA` |

### 3.3 Rules for all three
1. Zero image assets. Grain and paper textures are generated once from the visual RNG into an offscreen canvas.
2. All three use the same rig skeleton, the same prop footprints and the same particle kinds; only the drawing of each differs. All three must keep 60 fps with the full scene (brief 9.3); direction C's ink jitter is computed per segment from `nzAt`, never from `Math.random`.
3. Do not: mix treatments (an ink-outlined tree in direction B); add a fourth direction; use any colour outside the 16 tokens plus `lit()` transforms, except the HUD tokens.

---

## 4. The style board specification (`style-board.html`)

### 4.1 Purpose and placement
1. One HTML page that renders the three directions with the real primitives from `src/render/*`, so the pick is made on what the game will draw, not a mock-up.
2. Source: `style-board.html` at the app root with its script in `src/debug/style-board.ts`; built by Vite as a second entry to `dist/style-board.html`, single file. (The module map does not name a board module; `07-Build-Plan.md` confirms the path. Section 13.)
3. It is built in Slice 1 and blocks all art work from Slice 2 on (register §4).

### 4.2 Tiles to render, per direction (the same list, the same order)
| # | Tile | Content | Canvas size (CSS px) | Zoom |
|---|---|---|---|---|
| 1 | Palette strip | 16 swatches with token names and hex, 2 rows of 8 | 320×72 | none |
| 2 | Ground sampler | a 6×6 tile patch: lawn with a worn desire path (`WEAR` 1.6 and 2.6 ribbons), a 2-wide gravel path, a flagstone ring, a 2×2 rose bed, one wet puddle | 300×180 | 1.0 |
| 3 | Tree, three seasons | one plane tree at spring blossom, summer, autumn, side by side; a small winter one at half size | 320×160 | 1.2 |
| 4 | Bench | one bench facing the camera with a sitter | 160×160 | 1.6 |
| 5 | Lamp | one three-globe lamp unlit (f = 0.50) and one lit (f = 0.85) with its ground glow | 200×160 | 1.6 |
| 6 | Fountain | 2×2 fountain with spray particles and ripple rings | 200×160 | 1.2 |
| 7 | Two lovers | a pair at stage Chat, facing, two hearts rising, at the default zoom | 200×160 | 1.3 |
| 8 | Two lovers close | the same pair at close zoom | 200×160 | 2.4 |
| 9 | Pigeon | one walking, one flying | 160×120 | 2.0 |
| 10 | Pomeranian | running with a snatched hat | 160×120 | 2.0 |
| 11 | Facade | one Haussmann bay with a café awning and two bistro tables, at f = 0.50 and f = 0.90 | 320×200 | 1.0 |
| 12 | Sky strip | the sky gradient at f = 0.30, 0.76, 0.90 as three bands | 320×60 | none |
| 13 | HUD sample | the clock chip, the Visitors chip, one pressed tool pill, the cooldown chip and a single card, styled with the direction's theme colour behind | 320×200 | none |

Done when: every tile renders in all three columns with no console error, each tile is drawn by the same function with a different `StyleSpec`, and the page passes section 12 screenshots.

### 4.3 Layout
1. Phone (width < 900 px): a sticky header with the title and a segmented switch **A | B | C**; below it the 13 tiles of the chosen direction in a 2-column grid (tiles wider than 200 px span both columns); vertical scroll only. The switch is the `.grp` recipe (1.10).
2. Desktop (width ≥ 900 px): three columns side by side, one per direction, each 400 px wide, with the tiles on aligned rows so tile 4 of A sits level with tile 4 of B and C. Column headers read "A Storybook", "B Pastel Postcard", "C Line and Wash".
3. Safe areas and 16 px side gutters as the game shell.

### 4.4 Recording the pick
1. Under each column (desktop) or under the switch (phone) sits a button **Choose A** / **Choose B** / **Choose C** in the Begin-button recipe.
2. Tapping it writes `profile.stylePick = 'A' | 'B' | 'C'` into `parque:profile-v1` through `src/save/store.ts` (register 3.11 names the field "style pick"; the TypeScript name is `stylePick`, section 13), shows a toast "Picked: Storybook" (through `t()`), and marks the button pressed.
3. The owner also tells the model which letter was picked; the model records the pick and the date in the register §4 row (brief 10.2 rule 4). The profile field alone is not the record.
4. Until a pick exists, the game runs direction A (brief 4.2 names GV's look as the default).

### 4.5 One source of truth for colour
1. `src/render/ambient.ts` exports `PALETTES: Record<'A'|'B'|'C', Palette>`, `STYLES: Record<'A'|'B'|'C', StyleSpec>`, and `style(): StyleSpec` which returns the entry named by `profile.stylePick` (default `'A'`). Every scene colour in `src/render/*` is read as `style().palette.lawn` and passed through `lit()`.
2. `src/styles/tokens.css` holds every HUD colour as a custom property. `shell.css` uses only `var(--...)`.
3. No other file in `src/` may contain a colour literal (hex, `rgb(`, `rgba(`, `hsl(`). `08-Test-Plan.md` adds a grep test for this; GV's ~180 scattered literals are the reason (review §7.2).
4. Type signatures:

```ts
export interface Palette {
  lawn: string; gravel: string; flagstone: string; bedEarth: string; water: string;
  foliageSpring: string; foliageSummer: string; foliageAutumn: string;
  stone: string; zinc: string; awningRed: string; ink: string; paper: string;
  rose: string; sky: string; lamp: string;
}
export interface StyleSpec {
  id: 'A' | 'B' | 'C';
  palette: Palette;
  line: 'soft' | 'none' | 'ink';        // 3.2 row Line
  shading: 'gradient' | 'flat' | 'wash'; // 3.2 row Shading
  grain: 'gv' | 'none' | 'paper';        // 3.2 row Texture
  themeColor: string;                    // 3.2 last row
}
```

---

## 5. Locked now, regardless of the gate

### 5.1 Iso constants
`TW = 26`, `TH = 13`, `EH = 26`, `VANCH = 0.46`, zoom 0.30 to 3.0, `N = 48`, apron 8 tiles, flat ground `e = 0` (register 3.1; section 1.1). A new park opens at zoom 1.3 centred on the fountain at (23.5, 23.5); this is the **default zoom** every readability rule below refers to. Tap-select zooms to ≥ 1.8 (GV `selectGnome` 10867); avatar entry zooms to 1.5 if below 1.3 (GV 11257).

### 5.2 HUD paper identity: tokens, glass, fonts, type scale
1. Tokens and glass recipe exactly as 1.10, in `src/styles/tokens.css` and `shell.css`.
2. Accent assignment (brief 3.2): `--moss` Park group and positive bars, `--berry` Cupid and hearts, `--ember` Mischief and warnings, `--sky` information, `--stone` disabled and locked tiers.
3. Fonts: Fraunces (display: title, card name, doing line, pair names, sheet titles) and Figtree (everything else), self-hosted woff2 subsets, never fetched (brief 2, register 23).
4. Type scale (CSS px; minimum 11 px for any text, brief 3.1 item 5; GV sizes in brackets for the port):

| Element | Size | Weight | GV was |
|---|---|---|---|
| chip text | 12 | 500, `b` 700 | 10 (CSS 36) |
| tool pill label | 11 | 600 | 10.5 (CSS 85) |
| tier badge on a locked pill | 11 | 700 | none |
| group button `.gb` | 12 | 600 | 11 (CSS 105) |
| speed label | 12 | 700 | 11 (CSS 121) |
| card name `h3` | 16 | 700 Fraunces | 15 (CSS 131) |
| card sub, relationship line | 11 | 400 | 10 (CSS 132, 61) |
| bar label | 11 | 600 uppercase, letter-spacing 0.03 em | 9.5 (CSS 133) |
| card doing line | 12 | italic Fraunces | 11 (CSS 137) |
| avatar strip (name, sub, bars, doing) | 14 / 11 / 11 / 11 | as above | 14 / 10 / 8.5 / 10.5 (CSS 174–178) |
| sheet title `h4` | 14 | 600 | 13 (CSS 52) |
| sheet summary | 11 | 400 `--ink-soft` | 10.5 (CSS 54) |
| sheet row name | 13 | 700 | 12 (CSS 56) |
| sheet row detail | 11 | 400 | 10 (CSS 57) |
| feed line | 11 | 400 | 9.5 (CSS 162) |
| toast | 12 | 500 | 11.5 (CSS 159) |
| intro title | 34 | 700 Fraunces | 34 (CSS 146) |
| intro paragraph | 14 | 400 | 13.5 (CSS 148) |
| Begin, Continue | 15 | 700 | 14 (CSS 149) |
| language toggle | 11 | 600 | 11 (CSS 154) |
| perf overlay (dev) | 11 | 600 monospace | 11 (CSS 157) |

5. Line height 1.3 for single lines, 1.55 for intro paragraphs. Tabular numerals on chips and the speed label.
6. Chips (register 3.10): the Clock chip at the top left (weather dot 8 px, phase word, separator, "Day N · Season"); a right column (GV `#hudR` 74) of Visitors (count, a "+" button in the ink style of GV `#bAdd` 46), Romance ("A & B · Stage" in Fraunces 12 px, or "No one courting yet"; pulses once, scale 1.06 for 0.3 s, when the featured pair changes stage) and Points ("Cupid n · Mischief m" with the numbers in `--berry` and `--ember`; the gained number flashes to `--ink` for 0.3 s) (02 §12.2). Every chip is a `<button>`.
7. Do not: put text smaller than 11 px anywhere, including `small` and `sub`; use a third font; load a font from the network.

### 5.3 z-index map (GV CSS 32–230; kept)
| Layer | z | Elements |
|---|---|---|
| canvas | 0 | `#cv` |
| HUD, feed | 5 | `.hud` chips, `#feed` |
| rail, perf | 6 | `#rail`, `#perf` |
| card, contextual bar | 7 | `#card`, row-2 ghost bar `#gbar` |
| sheets, toast | 8 | Census, Romances, Progress, Events, Avatar picker, Options, `#hint` |
| intro | 20 | `#intro` |
| photo close | 30 | `#photoX` |

`layoutOverlays` (GV 10689) measures the rail height every 0.35 s and sets `bottom` on card, ghost bar and sheets to rail height + 8 px; the toast sits 10 px above whichever of card or ghost bar is open. Photo mode hides layers 5 to 8 (GV CSS 164–168).

### 5.4 Rail layout with the three-group switch (register 3.9)
1. Row 1: a `.grp` segmented switch with three `.gb` buttons **Park | Cupid | Mischief** at the left, then the `#tools` scroll-snap strip of that group (GV 80–92 recipe, with the edge fade masks `.more/.before`). The switch stays visible while the strip scrolls.
2. Tool pill swatch border colour by group: `--moss`, `--berry`, `--ember`. The pressed switch button takes the ink background; its group colour shows as a 3 px bottom bar on the button.
3. Locked abilities: pill at opacity 0.45 with the swatch replaced by the tier badge text "T2" in 11 px; tap toasts "Unlocks at Cupid T2".
4. Row 2 (contextual): Park: brush size slider 1–3 in `#sizewrap` (GV 110–117) and **Undo**; big stamps and runs: the ghost bar with name, reason line (italic Fraunces, `#A94A5A` when refused, GV CSS 191) and **Place / Cancel** (GV `#gbar` 184–195). Cupid or Mischief: the **cooldown chip**: a glass chip with the ability name, an SVG ring (circle, `stroke-dasharray`, stroke `--berry` or `--ember`) that empties over the cooldown, the seconds left in tabular numerals, and "1/1" for charged abilities.
5. Row 3: `.grp` pause + speed slider 1–8× + label; `.grp` rotate left, rotate right, Fit, Sound, **Be someone**, Photo, New. Row 3 wraps to two lines below 400 px width; `layoutOverlays` measures the result.
6. Avatar mode (`body.avatar`): row 1 shows three glass chips with the avatar's hints (02 §10.2); the Park strip, size row, Undo and the ability strips are hidden (GV CSS 169 pattern); the mode button reads **Creator**.
7. Hit targets: every button at least 36×36 px CSS; pills at least 44 px tall.
8. Do not: show more than one contextual bar at once; let the rail exceed 40 % of the viewport height at 390×844; use icons without a label on the tool pills.

### 5.5 Card and pair card (register 3.10, 02 §12.3)
1. Single card (`#card`): `h3` name; sub line "archetype · ageWord"; relationship line; bars **Mood** (comfort, `--moss`, turns `--ember` below 0.3), **Rested** (energy, `--sky`, `--ember` below 0.25), **Full** (1 − hunger, `--moss`, `--ember` below 0.3), plus **Heart** (affinity, `--berry`) when paired, with a 1 px `--ink` tick on the bar at the next stage's gate value; doing line in italic Fraunces.
2. Pair card variant: both names in Fraunces with a heart glyph between them in `--berry`; the shared affinity bar full width with the gate tick; a stage chip "Bench · 3 of 7"; two doing lines; a **Pin** toggle (`.gb`, pressed = ink). Tapping a name switches to that single card; tapping the pair line on a single card switches back.
3. Avatar strip: GV CSS 173–178 layout (name and sub on one line, three bars side by side, doing line) at the 5.2 sizes; name gets " · you".
4. The card hides while a sheet is open (`body.sheet`, GV 226) and in photo mode.
5. Done when: at 390×844 the pair card is at most 300 px wide and 150 px tall and never overlaps the rail.

### 5.6 Sheets (register 3.10, 02 §12.4)
Recipe as 1.10 (radius 16 px, `blur(11px)`, width `min(94vw, 420px)`, max-height 52 vh, close button top right, `h4` title). Rows are glass buttons (`rgba(255,255,255,.62)`, radius 10 px, 1 px `--glass-line`), selected row = ink background (GV CSS 55–60).
| Sheet | Row content | Extra |
|---|---|---|
| Census | name 13 px · "archetype · doing" 11 px · partner 11 px | summary line "N in the park · k courting · room for M more" |
| Romances | "A & B" Fraunces 13 px · stage chip · affinity bar · "n today" embarrassments · Pin | sorted by stage descending; a footer "Today: Happily n · Parted m" |
| Progress | two ladders as horizontal bars with tier ticks at 8, 20, 40, 70; Cupid in `--berry`, Mischief in `--ember`; the next unlock named under each | the unlock table from 02 §7.4, locked rows in `--stone` |
| Events | "Day N · phase" 11 px over the line 12 px | 40 rows; tap flies there with the 5.2 s focus pin (GV `drawFocusMark` 10764: ink teardrop with a paper dot, bobbing 3 px) |
| Avatar picker | 6 cards in a 2×3 grid: a 40×40 drawn portrait (the rig at zoom 2.2 on the canvas, copied to an offscreen canvas), name, "Cupid · T3", a lock glyph when locked | side stripe 3 px on the card's left: `--berry` or `--ember` |
| Options | language EN / ES, sound on / off, speed, the seed; dev flag reveals sound check and perf | none |

Census and Events are mutually exclusive (GV 10748).

### 5.7 Intro screen and logo
1. Layout as GV 294–313: the mark, the title **Parque D'Amour** in Fraunces 34 px, four short paragraphs, **Begin** (and **Continue** above it when a save exists, register Q21), the EN / ES toggle. Background: the radial paper gradient of 1.10 until the gate, then the direction's `paper` to `sky` at 55 %.
2. The mark is an inline SVG (as GV's gnome hats 295–305), 92×76, no file. Two sketches; the default is A.

Sketch A, two hearts on a bench (Cupid rose, Mischief ember):
```svg
<svg class="mark" width="92" height="76" viewBox="0 0 92 76" aria-hidden="true">
  <rect x="18" y="46" width="56" height="6" rx="3" fill="#8C7B6B"/>
  <rect x="20" y="36" width="52" height="5" rx="2.5" fill="#8C7B6B"/>
  <path d="M24 52 V66 M68 52 V66 M26 41 V46 M66 41 V46" stroke="#6E6680" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M36 34 C31 29 26 26 28 21 C30 17 35 18 36 21 C37 18 42 17 44 21 C46 26 41 29 36 34 Z" fill="#EDA9C4"/>
  <path d="M56 32 C51 27 46 24 48 19 C50 15 55 16 56 19 C57 16 62 15 64 19 C66 24 61 27 56 32 Z" fill="#F2B67E"/>
</svg>
```

Sketch B, a beret and a pigeon:
```svg
<svg class="mark" width="92" height="76" viewBox="0 0 92 76" aria-hidden="true">
  <path d="M14 36 C14 24 28 18 44 18 C60 18 72 24 70 34 C68 40 18 42 14 36 Z" fill="#4A4458"/>
  <path d="M42 18 V13" stroke="#4A4458" stroke-width="2.5" stroke-linecap="round"/>
  <ellipse cx="62" cy="56" rx="13" ry="8" fill="#B9B7C6"/>
  <circle cx="75" cy="50" r="5" fill="#B9B7C6"/>
  <path d="M79 50 L85 52 L79 54 Z" fill="#E7B97A"/>
  <path d="M53 54 C57 47 66 47 70 53" stroke="#8E8AA0" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <ellipse cx="70" cy="54" rx="3" ry="2" fill="#8CBE85" opacity="0.8"/>
  <path d="M58 64 V69 M66 64 V69" stroke="#E7B97A" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="76.5" cy="49" r="1.1" fill="#4A4458"/>
</svg>
```

3. Favicon: the same mark as a `data:image/svg+xml` `<link rel="icon">` in `index.html`; no file (brief 8.2 item 1). No apple-touch icon in v1 (brief 8.2 item 12).
4. Theme colour `<meta name="theme-color">` and body background: `#DCE6EC` until the gate (brief 3.2), then the picked direction's value from 3.2.
5. Done when: the intro renders at 390×844 with nothing under the safe areas and the mark is crisp at dpr 3.

### 5.8 Photo mode, feed, toast
As GV: photo mode hides every overlay and shows `#photoX` (CSS 164–168); the feed is one glass pill line that fades over 14 s (10727–10732); the toast is 3.4 s, 6 s for the avatar hint (10685, 11259). Both carry `aria-live="polite"` (section 11).

---

## 6. Prop vocabulary

Units: footprint in tiles; height in EH units (1 EH = 26 px at zoom 1; a grown visitor is 0.85 EH, section 7.1). "Orientations" is how many facings the drawing supports; all props rotate with the camera through `houseFrame` (GV 7048) regardless. Every prop is drawn in `src/render/props.ts` except trees and beds (`flora.ts`) and the apron set (`backdrop.ts`). All props are culled below 1.5 px of drawn size (GV prop culls, review §13).

### 6.1 Placeable props (register 3.7, 02 §8.3)
| Prop | Footprint | Height | Orientations | Parts to draw (back to front) | Variants | Animation |
|---|---|---|---|---|---|---|
| bench | 1×1 | 0.45 | 4 (rotates on repeat tap) | two cast-iron ends (`zinc`, curled), seat of 3 slats (`bedEarth` lightened 1.2), back of 2 slats | wet: slats ×0.86; snow cap 2 px | none; sitters use the sitting pose |
| lamp | 1×1 | 1.4 post + 0.25 head | 1 | fluted post (`zinc`, 0.06 tile wide), base disc, two curved arms, three globes (ref3) r 0.09 tile; lit: globes `lamp`, halo radial gradient r 0.9 tile from `rgba(255,214,150,0.32)` to 0 (GV 7995), ground pool ellipse 1.6×0.8 tiles at alpha 0.16 | lit f ≥ 0.80 or f < 0.28; `c_lamplight`: halo r ×1.4, alpha ×1.3 | halo breathes ±5 % at 0.5 Hz |
| fountain | 2×2 | 0.9 basin + 0.6 column | 1 | octagonal basin wall (`stone`), water disc (`water` with sky sheen), central tier and bowl, column top | winter with `ICE`: no spray, disc `#DCE9F1`, frost on the rim | spray particles 12/s, ripple rings 0.5/s (section 8) |
| kiosk | 2×2 | 1.6 | 4 (serving side) | octagonal base (`foliageSummer` darkened 0.8, the Paris green), counter on the serving side, striped awning (`awningRed`/`paper`, 6 stripes), conical roof (`zinc`) with finial, menu board; two café tables (1×1 each, two chairs) on its east side when free | night: counter window `lamp`; winter: steam puff every 4 s | awning edge scallops flap ±1 px in breeze |
| bandstand | 3×3 | 0.25 platform + 1.6 roof | 1 | octagonal platform (`stone`), 8 posts (`zinc`), railing, roof (`zinc`) with finial | night and busker playing: string lights (8 `lamp` dots) | notes particles while playing |
| bridge | 1×span (1–4) | 0.3 arch | 2 (N–S, E–W) | arch under-curve (`stone`), deck planks (`bedEarth`), two railings (`zinc`) | wet ×0.86; snow on deck | none |
| hedge | 1×1 run pieces | 0.5 | auto-join by 4-neighbour bitmask (16 shapes) | box-clipped block (`foliageSummer`), top face lighter 1.1, side faces by `faceLight` | autumn ×0.9 toward `foliageAutumn` at 0.3; winter dusted `paper` 0.4 | sway ±1 px in breeze |
| bed (`KIND`, not a prop) | 1×1 | 0.1 | none | earth rim (`bedEarth`), 6–9 flower dots in the bed colour: rose `rose`, lavender `#B9A6E0`, marigold `#F2C14E`, white `paper` | spring and summer full, autumn 50 % dots, winter earth only | dots shiver in breeze |
| tree (3 species) | 1×1 (`OCC`), crown overhangs 1.5 tiles | 2.0–2.5 | 3 forms by seed | section 6.3 | 4 seasons | wind sway, leaf drop |
| picnic | 2×2 passable | 0.05 | 1 | red-white check blanket (`awningRed`/`paper`, 4×4 check), basket, two plates | none | none |
| table (café) | 1×1 | 0.5 | 1 | round top (`paper`), pedestal (`zinc`), two bistro chairs (`sky` seats, ref1) | none | none |
| easel | 1×1 | 0.9 | 1 | tripod (`bedEarth`), canvas (`paper`) with a smear of the current sky colour | none | none |
| crumbs | 1×1 passable | 0 | 1 | 5–9 dots `#E7D7B0` | stock 1–3 = 3/6/9 dots | none |
| peel | 1×1 passable | 0.02 | 1 | yellow `#F2C14E` three-lobe shape with brown tip | none | none |
| sprinkler | 1×1 | 0.15 | 1 | small post (`zinc`), 3 arcs of drops | none | arcs rotate 1 rev/s |
| rowboat | on a pond | 0.25 | 8 (by heading) | hull (`bedEarth`), two seats, two oars; wake ellipse (GV `drawBoat` 11966 recipe) | none | bob ±1 px, oars by stroke |
| umbrella | over a pair | 0.9 | 1 | canopy `awningRed`, handle `ink` | `c_umbrella`; backfire newspaper variant `paper` | sway ±2° |

### 6.2 The lamp, in detail (every direction)
1. Post height 1.4 EH (36 px at zoom 1), base disc 0.3 tile wide, fluting as 3 vertical lines at zoom ≥ 1.3.
2. Two arms curve out and up 0.22 tile each side; three globes: left, right and a higher centre one (0.12 tile higher).
3. Unlit globes are `paper` at alpha 0.9 with a `zinc` cap; lit globes are `lamp` with a `paper` highlight dot top-left and the halo of 6.1.
4. Charm: a lit lamp counts +1 within 3 tiles (register 3.5); the ground pool makes that radius readable: pool radius = 1.6 tiles at full alpha, fading to 0 at 3 tiles.
5. Gate pillars carry a single-globe version (0.5 EH).

### 6.3 Trees: three species, four seasons
| Species | Height (EH) | Form | Trunk | Spring | Summer | Autumn | Winter |
|---|---|---|---|---|---|---|---|
| plane | 2.5 | tall dome; forms dome / tall oval / umbrella | mottled: `#C9B9A3` with `#E2D8C8` patches | bud then `foliageSpring` | `foliageSummer` | `foliageAutumn` (ochre) | bare; twigs; two seed balls per branch |
| chestnut | 2.2 | broad umbrella; forms umbrella / dome / split | `#9A8470` | `foliageSpring` with 6–10 white "candles" (`paper` upright ovals) in blossom | `foliageSummer` darkened 0.92 | `#C8763F` (rust, GV `AUTUMN[1]`) | bare; thick twigs |
| lime | 2.0 | tall oval; forms oval / tuft / tall wisp | `#A99683` | `#DAE8AE` (pale lime) | `foliageSummer` lightened 1.08 | `#E3B94A` (gold, GV `AUTUMN[2]`) | bare; fine twigs |

1. Phase machine as GV `crownPhase` (6749): spring bud days 1–2 (f 0–0.9 d bud, 0.9–1.9 blossom), leafing day 3; autumn thins from day 2.0; winter bare (02 §3.4).
2. Crowns are blob lists (GV 1703–1728) painted into the sprite cache (GV 6782) with a per-tree tint ±10 % (GV `treeTint` 6776). Mulch disc (`bedEarth`) under every tree on its own tile (02 §2.3).
3. Snow: crowns whiten in thirds as `snow` rises (GV 6786). Tiles adjacent to a tree are shelter tiles (02 §5.2); the drawing need not show it.
4. Do not: add a fourth species; draw leaves individually (crowns are blobs; leaves are particles).

### 6.4 Backdrop props (apron and skyline; `src/render/backdrop.ts`)
All are world-space props outside the 48×48 interior so they turn with the camera (register 2.4). **Near-side rule:** the two apron sides nearest the camera draw only railings and pavement; facades, the café and the quay wall draw on the far sides only, as GV draws its far shore (review §7.3). When the camera turns through a quarter, the sides swap over 0.4 s with alpha.

| Prop | Where | Height | Parts | Variants | Animation |
|---|---|---|---|---|---|
| railings | the boundary of rows 0 and 47, columns 0 and 47 | 0.5 | iron rail (`ink` ×0.9 toward `zinc`), uprights every 0.25 tile with gilt spear tips (`lamp`), a stone plinth 0.08 EH (`stone`) | none | none |
| gates (5) | 02 §2.4 tiles | pillars 0.9, leaves 0.5 | two pillars (`stone`) with caps and a single-globe lamp each, two open iron leaves | lamps lit as 6.1 | none |
| pavement | 1 tile outside E, S, W | 0 | `flagstone` with kerb line (`zinc`), 3 bistro tables outside the café | wet puddles as 6.5 | none |
| facades | 2 to 8 tiles outside E, S, W | 6.0 (5 storeys + mansard) | per bay 2 tiles wide: wall (`stone`), 5 rows of windows (2 per bay, `sky` glass, `zinc` frames), wrought-iron balconies on rows 2 and 5 (`ink` lines), shop front on the ground floor, mansard roof (`zinc`) with 2 dormers, chimney stacks | night: 40 % of windows `lamp` from f 0.80 to 0.28, chosen per bay by `h01` so the pattern is stable; rain: roof ×0.86 | none |
| café | one bay on each of E, S, W | 1.2 awning | striped awning (`awningRed`/`paper`), "CAFÉ" lettering as 4 blocks, 3 bistro tables with chairs on the pavement, a glowing window at night | none | awning scallops flap ±1 px in breeze |
| quay | y = −1 | 0.3 | wall (`stone` ×0.9), coping (`flagstone`), mooring rings every 4 tiles, steps at `g_north` (3 treads) | wet ×0.86 | none |
| river | y = −2 to −8 | 0 | base `water` ×0.95, long streaks (0.6 tile) in `paper` at alpha 0.25 drifting east 0.3 tile/s, one moored péniche barge (4×1.5 tiles, `ink` hull, `awningRed` cabin) near the east end, a sailboat (ref1) crossing once per day | night toward `NIGHTC` as GV 6494; never freezes | streak drift; barge bob ±0.5 px |
| far bank | y < −8 | 6.0 | a second facade row at 60 % contrast (fog mix 0.35 toward `FOGC`) | night windows as facades | none |
| skyline band | beyond the apron on every side | none | a rooftop silhouette band (`zinc` mixed 0.5 toward the sky bottom colour), domes and chimneys at fixed world bearings, the Eiffel Tower silhouette at bearing north-west (between the west and north sides), 2.2× the facade height, drawn relative to camera angle like GV's far shore sine bands (`paintSky` 6535–6581) | night: 12 window dots per 100 px and a tower beacon dot (`lamp`) that blinks 0.2 s every 4 s | none |

Done when: at zoom 0.30 (Fit) the park, apron, facades and skyline all show with no gap between bands, and turning a quarter keeps the Eiffel Tower on the same world bearing.

### 6.5 Ground kinds (`src/render/ground.ts`)
| Kind | Base | Detail at zoom ≥ 1.0 | Wear and wet |
|---|---|---|---|
| lawn | `lawn` + season tint (10.3) + grain (1.3 rule 4) | tufts every 0.5 tile at zoom ≥ 1.0 (GV cover 6923), hidden on worn tiles | `WEAR ≥ 1.6`: a trodden ribbon in `bedEarth` at alpha 0.35, half-width 0.15–0.29 tile (GV `ribbonPts` 8703); `WEAR ≥ 2.6`: bare earth `bedEarth` at alpha 0.8, hysteresis off below 2.1 (GV `WORN_T` 8637) |
| gravel | `gravel` + grain | 6–9 pebble dots `shade(gravel, 0.9)` | wet ×0.88; puddles as below |
| flagstone | `flagstone` + grain | 2–3 jittered slabs per tile (GV `drawSlab` 8720), joints `shade(flagstone, 0.85)` | wet ×0.86 |
| bed | 6.1 | none | none |
| mulch | `bedEarth` ×0.95 | none | none |
| pond, canal | 3.2 row Water | ripples at `z > 0.7` | `ICE`: `#DCE9F1` with `#EEF5F9` highlights, no ripples |

Puddles (`WET`): an ellipse 0.6×0.3 tile per tile with `WET > 0.3`, filled with the sky top colour at alpha `0.35·WET`, drawn in `paintCell` as GV puddles (review §2.4). Petals on the ground (`PETALS` layer, 02 §2.2): 8 to 12 `rose` dots r 0.04 tile per tile at alpha `PETALS`, placed by `h01` so they do not jitter, drawn after the ground and before props; the layer fades 1/40 per second in the simulation, so the dots fade with it.

---

## 7. Characters

### 7.1 The visitor rig (`src/render/figures.ts`)
1. Base height `VH = 22` px at zoom 1 for a grown visitor (0.85 EH). Child 0.65·VH = 14.3 px (GV's gnome height, 8047); elder 0.95·VH. Drawn height `h = VH·z·scale`.
2. Proportions (fractions of `h`, up from the feet, after ref2): hip −0.38, shoulder −0.66, head centre −0.82, head radius 0.10, neck 0.04, upper arm 0.16 and forearm 0.14 (arm 0.30), leg 0.38, shoulder width 0.16, line width `max(0.9, 0.06h)`. Compare GV 8240: hip −0.30, shoulder −0.56, head −0.72, head r 0.135. The Parque figure is longer in the leg and smaller in the head.
3. Walk: leg swing `sin(walkPh)·0.15h`; `walkPh += dt·speed·2.1` (one stride every 0.46 s at 3.0 tiles/s); arms counter-swing ±0.55 rad (GV default idle arm −1.18 ± 0.55, review notes 15 line 123); bob 0.02h at twice the stride.
4. Idle: breathing ±0.07 rad on the arms at 0.5 Hz (GV 8331 pattern); a glance (head turn ±0.2 rad) every 4–7 s on the visual RNG.
5. LOD tiers (drawn height `h`):

| h | Zoom at VH 22 | Drawn |
|---|---|---|
| < 3 | < 0.14 | nothing |
| ≥ 3 | 0.14 | body stroke, head disc, coat colour |
| ≥ 4 | 0.18 | archetype signifier (7.2) |
| ≥ 8 | 0.36 | eyes |
| ≥ 12 | 0.55 | expression: brows, mouth, blush (7.5) |
| ≥ 18 | 0.82 | close: clothing stripes, hands, hat band, basket weave, buttons |

At the default zoom 1.3, `h = 28.6`: every tier shows. At Fit (0.30), `h = 6.6`: body and signifier only.
6. Sitting: crouch 0.24h, legs folded forward (GV 8248); kneeling (proposal): crouch 0.30h, one knee down.
7. Facing: `face = ±1` by movement; a courting member faces its partner on screen (computed from `screenOf`, never written back to the sim, GV 8172 comment).
8. Colour: skin `#F0DCCB` (GV `SKIN` 8046) with 3 alternatives `#E8C9A8`, `#C9A07C`, `#8E6B4E` by seed; hair 6 tones; coat from the crowd palette: `#B9B7C6`, `#C7B8A6`, `#A6B4C2`, `#B5C2A8`, `#C9B2B8`, `#9E9AAE`, `#D1C3A2`, `#8F9AA8`; `ink` contour per 3.2.
9. Selection ring: GV 8435 recipe in `paper` at alpha 0.5–0.75; the **featured pair** wears the same ring in `rose` on both members at alpha 0.35–0.55 so they are found in a crowd and at night.
10. Do not: draw more than one coat colour per figure; give children any item; draw hats as GV's pointed gnome hats (hats are berets, flat caps, sunhats, headbands only).

### 7.2 Archetype signifiers (visible from `h ≥ 4`)
| Archetype | Signifier (one prop or garment) | Colours |
|---|---|---|
| single | a scarf in the signature colour (7.3) | signature |
| couple | matching scarves (same hue) | one hue |
| family parent | a tote bag; the child beside at 0.65 scale with an ice cream or balloon | bag `bedEarth`; balloon `rose` or `sky` |
| elder | a cane and a flat cap; grey hair `#E4E1EA` (GV elder hair 8399) | cane `ink` |
| tourist | a camera at the chest and a sunhat; a flash particle when photographing | camera `ink`, hat `paper` |
| jogger | a headband and a bright band across the shirt; shorts | band `awningRed` or `sky` |
| artist | a floppy hat and a palette in the hand; the easel prop | palette `paper` with 4 dots |
| busker | an accordion held at the chest; notes particles while playing | bellows `awningRed`, keys `paper` |
| dog walker | a lead to the dog, drawn as a 1 px `ink` line | none |
| gardener | a green apron and a rake over the shoulder | apron `foliageSummer` ×0.8 |
| vendor | a white apron and a cap, behind the kiosk counter | `paper` |
| charming stranger (`m_rival`) | a long coat and a bouquet; hair slicked | coat `ink` ×1.3 |

### 7.3 The lovers' colour axis
1. The crowd wears the muted coat palette (7.1 rule 8) and no saturated accent.
2. Every `single` gets one **signature colour** from 8 saturated tones at arrival: `#E25B5F`, `#F2C14E`, `#5FA8D3`, `#7DBF7A`, `#EDA9C4`, `#B9A6E0`, `#F08A4B`, `#4A4458`; drawn as the scarf. Singles are the romance candidates, so the eye finds them.
3. When a `Pair` forms, nothing changes on the figures; the pair card shows both signatures as two dots beside the names, and the hearts between a pair are two-tone (left lobe one signature, right lobe the other) from stage 3 on.
4. The featured pair wears the rose ring (7.1 rule 9). A pinned pair keeps it.
5. Scenery couples share one hue so they read as "already together".
6. Do not: use colour to imply compatibility; change a signature colour during a visit.

### 7.4 The avatars and the creatures
| Actor | Scale | Drawing | Notes |
|---|---|---|---|
| `a_matchmaker` | 1.0 VH | ref2 exactly: black beret, orange ponytail with a red ribbon, blue `#3F7FC4` and white stripes, white trousers, black flat shoes, wicker basket with two baguettes (`#E0A85C`) | the only figure with a ponytail; stripes horizontal |
| `a_florist` | 1.0 VH | straw hat (`#E9D7AE`), green apron, a wicker basket (`#C98F4C`) of flowers (3 dots in rose, marigold, lavender; the same basket is the `c_bouquet` cameo's); petals scatter from the hand | none |
| `a_busker` | 1.0 VH | as the busker archetype, flat cap | none |
| `a_mime` | 1.0 VH | white face (`paper` disc over the skin), black beret, black and white horizontal stripes, red scarf, white gloves | differs from the matchmaker by the white face, the black stripes and no hair showing |
| `a_pigeon`, pigeons | 0.18 EH (4.7 px at zoom 1) | GV bird recipe (8575–8598): body ellipse `#8E8AA0`, head disc, beak `#E7B97A`, a neck sheen ellipse `#8CBE85` at alpha 0.6, tail stroke; walking: bob 0.08·s at 3 Hz and a head peck; flying: two-stroke wings flapping at 5 Hz, arc height 46·z px (GV 8591–8592) | culled below 1.6 px; `m_flock` adds 20 visual pigeons |
| `a_pomeranian` | 0.3 EH | three overlapping fluff ellipses (`#F2C98A` body, `#F7DFB0` chest, `#E8B06C` ears), a curled tail, black dot eyes and nose, a tiny red collar; running: body stretches 1.15× along the heading, legs as 4 short strokes at 8 Hz; the snatched item drawn in the mouth | never drawn outside the park |
| dogs (walkers') | 0.45 EH | GV fox/dog recipe (8506) at 9.5·z: trotting body, collar `awningRed`, lead to the walker | on a lead 1 tile behind |
| wasp | particle | GV bee recipe (8617): jittering `ink` ellipse with a `#E8C64A` stripe | none |

### 7.5 Expressions readable at the default zoom
1. From `h ≥ 8`: two eye dots `#5A5468` (GV 8407), r 0.16·hr, at ±0.34·hr; the far eye at 0.05·hr when in profile.
2. From `h ≥ 12`: brows as two 0.3·hr strokes; mouth as one 0.5·hr stroke; blush as two `rose` discs at alpha 0.42 (GV 8414).
3. Expression table (state → brows, mouth, blush, extra):

| State | Brows | Mouth | Blush | Extra |
|---|---|---|---|---|
| idle, walking | flat | flat | none | none |
| Notice, Chat | raised 0.1·hr | small arc up | both | eyes toward the partner |
| Bench, Stroll, Picnic | flat | arc up | both | none |
| Kiss | closed eyes (two lines) | arc up | both ×1.3 | 6 hearts |
| Proposal (kneeling) | raised | open O | both | ring sparkle at 8 s |
| Proposal (receiving) | raised | open O then arc up | both ×1.3 | hands to face at 12 s |
| wipe, shake, huddle, duck | drawn together | wavy | none | none |
| stumble | raised | open O | none | dust puff |
| flap | raised | open O | none | wasp particle |
| distracted | one raised | small arc | left only | eyes toward the stranger |
| baffled | one raised | flat | none | "?" note particle |
| lost | drawn together | flat | none | "…" note particle |
| huff (Parted) | drawn together, angled | arc down | none | split heart |
| laugh (backfire) | raised | wide arc up | both | 2 hearts, head back 0.15 rad |
| watch (fireworks) | raised | open O | none | none |

4. Chat bubbles: a 0.6·hr paper ellipse with three `ink` dots above the speaker, alternating every 3 s (02 §6.2 stage 2); drawn, never text (brief 8.2 item 15).
5. Done when: at zoom 1.3 a screenshot shows the difference between Chat and huff on a 28.6 px figure without zooming the image.

### 7.6 Hearts and blush
1. Heart particle: GV `drawPart` heart (8622): two arcs r 0.22·s and a triangle, `s = 8·z`, colour `rose`; rises `vz` 0.5–1.0 for 1.6 s (GV `heartFx` 2389). Notice: 2 hearts; Bench every 10 s: 1; Picnic every 8 s: 1; Kiss: 6; Happily: 12 then fireworks.
2. Two-tone hearts for pairs from stage 3 (7.3 rule 3); blush as 7.5 rule 2, growing ×1.3 at Kiss and Proposal.
3. Heartbreak (Parted): one heart that splits into two halves drifting apart over 1.2 s, colour `rose` ×0.85.

---

## 8. Effects and particles (`src/render/effects.ts`)

Cap 220 particles (register 3.3), spawned on the visual RNG only; the simulation never reads them. Screen-space effects (rain, snow, flash, fog overlay) are hashed from index and time like GV 10062 and hold no state. World-space particles use GV's `P(o)` record `{k, x, y, vx, vy, vz, l, m, z}` (2386).

| Kind | Trigger | Spawn rate | Look | Budget |
|---|---|---|---|---|
| petals | `c_petals`, `a_florist` scatter, blossom trees in spring | burst of 24; blossom trees 0.2/s each | `rose` 5-petal rosette r 0.12·s, tumbling, drifting 1 tile downwind in breeze; land and fade 20 s | 60 |
| leaves | trees in autumn | 0.3/s per tree, ×3 in breeze | 5-point leaf path (unit path: `M0,-1 L0.3,-0.3 L1,-0.2 L0.4,0.2 L0.6,1 L0,0.5 L-0.6,1 L-0.4,0.2 L-1,-0.2 L-0.3,-0.3 Z`) at 0.18·s, `foliageAutumn` or teal `#86BBB3` (30 %), ink veins in direction C; sway, land, fade 20 s | 60 |
| rain | global or `m_raincloud` | GV formula (1.9) | GV dashes; under a raincloud only inside its 5×5 | screen-space |
| snow | winter | GV formula | GV discs; crowns and roofs whiten | screen-space |
| fountain spray | fountain, not frozen | 12/s | `paper` dots r 0.1·s rising 0.6 EH then falling, alpha 0.7; ripple rings on the disc 0.5/s (GV ring 8620) | 30 |
| fireworks | Happily, `c_fireworks` | 1 shell per 0.8 s for 10 s (30 s for the ability) | a `paper` dot rising 4 EH over 0.8 s, then 24 sparks in `rose`, `lamp`, `sky` fanning r 1.2 EH, fading 1.2 s; a soft flash alpha 0.10 on burst | 80 |
| poop splat (tasteful) | `m_pigeon`, `a_pigeon` swoop | 1 | a `paper` blob r 0.3·hr with a `#DCE9F1` edge on the hat or hair, no brown, no drip; gone at the end of `wipe` | 1 per victim |
| sprinkler | `m_sprinkler` | 3 arcs rotating | `sky` drops r 0.12·s on 3 arcs r 1.5 tiles, 1 rev/s; tiles inside shimmer with `WET` | 24 |
| fog | `m_fog`, mist weather | none | per-cell fog mix (1.7 rule 5) plus 44 mist blobs (GV mist 8614: radial gradient `rgba(240,244,250)`) drifting 0.1 tile/s | 44 |
| dust puff | stumble, dig | 2–3 | GV dust (8611) `#CFC6C0` | none |
| splash | soaked, drenched, paddling | 5 | GV drop (8618) `#A9D3E6` | none |
| wasp | `m_wasp` | 1 | GV bee (8617) circling the table r 0.4 tile at 2 Hz | 1 |
| notes | busker, bandstand, serenade | 1 per 0.6 s | `ink` note glyph drawn as a path (head ellipse + stem + flag), rising, swaying | 12 |
| flash, ring sparkle | tourist photo; proposal at 8 s | 1; 8 | a `paper` disc r 0.5 EH at alpha 0.6 for 0.12 s; `lamp` 4-point stars r 0.15·s for 1 s | 8 |
| hat flying | `m_flock` duck | 1 per victim | the hat shape on an arc 2 tiles long, spinning, landing on the ground as a pickup | none |
| raincloud | `m_raincloud` | 1 | a 3-blob cloud (`zinc` ×1.1) 2.5 tiles wide hovering 2 EH up with rain dashes beneath | 1 |
| sunbeam | `c_sunbeam` | 1 | a warm pool: radial gradient 7×7 tiles from `AT` at alpha 0.18 to 0; particles none | 1 |

Rules: particles are drawn in the painter's cell of their tile (GV `putWalker` ~9604) so a tree in front hides them; weather overlays draw last (GV 12051). Do not: draw blood, bruises, tears or anything brown on a person; exceed the cap (drop the oldest).

---

## 9. Motion language

### 9.1 Timings and easing
| Motion | Value | Source |
|---|---|---|
| Camera follow | `k = 1 − 0.02^dt` per second | GV 11292 |
| Quarter turn | `1 − 0.0008^dt`, snap below 0.0015 rad | GV 6349 |
| Pinch turn | `1 − 0.00002^dt` | GV 6349 |
| Lean and crouch changes | smoothstep over 0.25 s | GV `smooth` 581 |
| Stride | 0.46 s at 3.0 tiles/s; scales with speed | 7.1 rule 3 |
| Tool swing (rake, paint, accordion squeeze) | `SWING_P` pattern: 0.85 s, strike at phase 0.62–0.72 | GV 8081–8088 |
| Heart rise | 1.6 s, `vz` 0.5–1.0 | GV 2389 |
| Toast | fade 0.3 s, hold 3.4 s | GV 158, 10685 |
| Card show, tool pill press | 0.18 s opacity and 8 px rise; 0.13 s and −2 px | GV 129, 86, 93 |
| Focus pin | 5.2 s, bob 3 px at 0.8 Hz | GV 10764 |
| Lamp halo breathing | ±5 % at 0.5 Hz | 6.1 |
| Tree sway | amplitude `wind·0.03` rad at 0.4 Hz, per-tree phase from seed; only when `wind > 0.2` and `z > 0.55` | GV 6837 |
| Hedge and awning flutter | ±1 px at 1.2 Hz in breeze | 6.1 |
| Pigeon walk bob | 3 Hz; flap 5 Hz | GV 8586, 8592 |
| Idle breathing | ±0.07 rad at 0.5 Hz | GV 8331 |
| Sim speed | every world motion scales with `T.speed`; UI transitions do not | register 3.2 |

### 9.2 Romance stage animations (02 §6.2)
| Stage | Animation |
|---|---|
| Notice (4 s) | both stop; turn to face over 0.4 s; 2 hearts; a 0.1 rad lean toward each other |
| Chat (20–30 s) | stand 0.8 tile apart facing; chat bubbles alternate every 3 s; the listener nods (head bob 0.03h at 1 Hz) |
| Bench (40–60 s) | walk to the bench; sit side by side (crouch 0.24h); the pair leans 0.08 rad toward each other; 1 heart every 10 s |
| Stroll (60 s) | walk as one unit 0.5 tile apart; a 1 px `ink` line between the near hands (holding hands) at `h ≥ 12`; in step (shared `walkPh`) |
| Picnic (50–80 s) | sit on the blanket or at the table; eat (arm to mouth every 2 s); 1 heart every 8 s |
| Kiss (10 s) | face; lean in 0.25 rad over 1 s; hold 1 s; 6 hearts; lean back |
| Proposal (15 s) | the initiator kneels (crouch 0.30h) at 0 s; ring sparkle at 8 s; the other claps hands to face at 12 s; both stand and embrace (two rigs overlapping 0.3h, arms around) at 15 s |
| Happily | 12 hearts, fireworks 10 s, the pair walks off as one unit |
| Parted | huff 6 s facing away, arms folded; the split heart; they walk to different gates |

### 9.3 Reaction animations per embarrassment kind (02 §6.4 lengths)
| Kind | State, length | Animation (times from the landing) |
|---|---|---|
| poop | `wipe` 4 s | splat appears; hand to head 0–1 s; hat off into the hand 1–2.5 s (GV hat-in-hand arm −1.1/−0.55, notes 15 line 123); hat back on 2.5–4 s; splat gone at 4 s; mouth wavy |
| soaked | `shake` 3 s | arms out ±0.9 rad, shaking ±0.25 rad at 6 Hz; 5 drops; hair flat at `h ≥ 18` |
| trip | `stumble` 3 s | lean forward 0.5 rad over 0.3 s; down (crouch 0.5h) 0.3–1.2 s with a dust puff; up by 2.0 s; brushing knees (arm sweeps) 2–3 s; never lying flat |
| snatched | `chase` 8 s then `huff` 3 s | run cycle at 4.0 with both arms raised 1.3 rad; huff: arms folded, one foot taps at 1 Hz |
| wasp | `flap` 6 s | arms windmill at 3 Hz; flee 3 tiles at 4.0; the wasp circles |
| drenched | `huddle` 5 s | hands over the head (both arms 2.2 rad), crouch 0.1h, drops |
| rival | `distracted` 30 s | turned to the stranger; idle sway; the partner's arms folded; at t+15 on the 50 % roll the partner steps between (walk 0.6 tile) and the stranger leaves |
| mime | `baffled` 4 s | hands up 1.6 rad; head tilt ±0.15 rad alternating at 1 Hz; "?" note |
| fog | `lost` ≤ 60 s | hands forward 0.6 rad, slow walk 1.5 tiles/s, "…" note every 5 s; stops when within 2 tiles |
| flock | `duck` 5 s | crouch 0.3h, arms over head; the hat flies 2 tiles (8); stand and fetch it |
| backfire laugh | `laugh` 4 s | head back 0.15 rad, bob at 2 Hz, 2 hearts; the partner mirrors |

Rules: every reaction ends standing; no reaction exceeds 8 s except `distracted` (30) and `lost` (60) (02 §13); staff reactions are capped at 4 s (02 T9).

---

## 10. Light and seasons (`src/render/ambient.ts`)

### 10.1 The day curve
`light` per phase from `02-Game-Design.md` §3.2 (linear within a phase). The ambient pipeline is GV's (1.7) with these changes:
1. Warm windows moved to the register bands: `warm = tri(f, 0.24, 0.08) + tri(f, 0.76, 0.10)`; the second peak is golden hour (register 3.2; 02 says the tint peaks at f = 0.76).
2. Sky keyframes re-keyed to the bands, direction A values (B and C substitute `sky` and `paper` at f 0.50 and keep the night and golden colours):

| f | Band | top | bottom |
|---|---|---|---|
| 0.00 | night | `#2C3252` | `#4A5170` |
| 0.20 | dawn start | `#4A5075` | `#8C87A8` |
| 0.25 | dawn | `#7C8CBA` | `#F2C8B0` |
| 0.32 | morning | `#A5C4DE` | `#F7DFCB` |
| 0.50 | midday | `sky` | `#E7F0F3` |
| 0.70 | afternoon end | `#9BB9DC` | `#F2D6C0` |
| 0.76 | golden hour peak | `#7A85B4` | `#F0BFAC` |
| 0.84 | dusk | `#3D4467` | `#5C6389` |
| 1.00 | night | `#2C3252` | `#4A5170` |

3. Stars at `light < 0.42`, sun and crescent moon on GV's ellipse, 10 clouds; the backdrop canvas repaints at most every 260 ms (GV 6525).
4. Lamps lit at `f ≥ 0.80 || f < 0.28` (02 §3.2): the window and lamp glows fade in over 0.02 of a day (7 s at 1×), never pop.
5. Night is dark teal, not black: `AM` at `light = 0.06` is about `[0.52, 0.56, 0.75]`, so the lamp pools and the lit windows carry the scene.

### 10.2 Lamp glow treatment
1. The GV lantern recipe (7995): a radial gradient on the lamp head, plus Parque's ground pool (6.1).
2. Glow is additive-looking but drawn as normal alpha over the ground; never `lighter` composite (it blows out on glass HUD screenshots). At most 24 pools are drawn per frame (nearest to the camera centre); beyond that lamps draw lit globes only.
3. Facade windows at night: 40 % lit (6.4), each a `lamp` rectangle at alpha 0.85 with a 2 px `lamp` bleed at alpha 0.25.

### 10.3 Season tints (lawn and crowns)
| Season | Lawn | Crowns | Other |
|---|---|---|---|
| spring | `mix(lawn, foliageSpring, 0.20)` | 6.3 | petals under blossom trees; beds full |
| summer | `lawn × [0.94, 1.0, 0.90]` (deeper, warmer; GV mixes 0.25 toward `C.grass`, 6672) | `foliageSummer` | midday haze: `FOGA + 0.03` |
| autumn | `mix(lawn, #C9CB8E, 0.28)` (GV `C.autumn`, 6671) | `foliageAutumn` by species (6.3); thinning from day 2 | leaves particles; beds 50 % |
| winter | `mix(lawn, #C6CCC4, 0.35)` then snow cover `mix(·, #EEF2F6, snowCover)` where `snowCover` rises 0.2/s of snowfall to 1 and falls 0.05/s without | bare | pond `ICE`; river unchanged; steam at the kiosk |

Gravel and flagstone take snow at ×0.7 cover; paths show through (GV sand ×0.4 rule, 6736).

### 10.4 Autumn leaves like ref3
1. Leaf particles as section 8, two colours (`foliageAutumn` 70 %, teal 30 %).
2. Landed leaves persist on the tile as up to 6 small leaf shapes for 20 s, drawn under walkers.
3. In direction C each leaf has an `ink` outline and a vein line; in A and B it is a flat shape. A breeze sends landed leaves tumbling 1 tile (visual only).
4. Crowns in autumn mix toward `foliageAutumn` from day 1 of autumn (0 %) to day 2 (100 %), then thin (fewer blobs) to day 3.

### 10.5 Weather on the scene
| Kind | Scene change | Weather dot (clock chip) |
|---|---|---|
| clear | sky ramp as is; `AM` full | `#F3D9A8` |
| fair | 3 soft clouds | `#DCE9F2` |
| cloudy | 8 clouds; dim 12 % (GV 6458) | `#C8CCDA` |
| breeze | sway on trees, hedges, awnings, hats (02 §3.3) | `#CDE3D8` |
| rain | GV rain; wet darkening; puddles; umbrellas on the pair with `c_umbrella` | `#9FBCD4` |
| shower | rain at half density, 30–60 s | `#B7CCDE` |
| mist | per-cell fog 0.30·mist; mist blobs; facades at 60 % | `#DDE2E8` |
| snow | GV snow; cover as 10.3; crowns whiten | `#EFF4FA` |

Seven dots are GV `WCOLD` (10774); `shower` is new (section 13).

---

## 11. Accessibility rules
1. Minimum text size 11 px everywhere (5.2). `maximum-scale=1` stays (the canvas needs it, GV 5), so the sizes must carry the load.
2. Contrast: `--ink` on `--paper` is 9.6:1; `--ink-soft` on `--glass` over a mid scene is at least 4.5:1 (test over the darkest night screenshot). Never put `--ink-soft` text on `--ink`.
3. Not colour alone: Cupid and Mischief groups carry their names, not only `--berry` and `--ember`; the Heart bar has a gate tick, not only a fill; locked pills carry the tier text; the weather dot sits beside the phase word.
4. `aria-live="polite"` on the toast and the feed line (review §15 item 64); `role="dialog"` with `aria-label` on every sheet (GV 256–261); chips that open sheets are `<button>` elements, not `div[role=button]` with a nested button (GV 238 is the anti-pattern).
5. Hit targets ≥ 36×36 px; pills ≥ 44 px tall; the "+" on the Visitors chip at least 28 px with `stopPropagation` (GV 12171).
6. `prefers-reduced-motion`: UI transitions 0.01 ms (GV 229); in the scene: no sway, no halo breathing, no pulsing rings (static at the mid alpha), particle counts halved, fireworks flash alpha 0.
7. Flashing: nothing flashes faster than 2 Hz; the lightning flash (GV 10104) is at most once per 22 s and alpha ≤ 0.38; fireworks bursts ≤ 1.25 Hz.
8. Focus: `:focus-visible` outlines 2 px `--ink` offset 2 px on every control (GV 95, 109, 152).
9. `<html lang>` follows the language choice (register 3.12); every `aria-label` goes through `t()`; photo mode must remain exitable by the `#photoX` button at 34×34 px minimum (GV 165).

---

## 12. Checklist for any model doing art work
Before starting:
1. Read the register §3 and §4, the brief §3, and this document's sections 3 to 7 for the thing you are drawing.
2. Confirm the Style Gate is recorded as passed in the register §4. If it is not, you may only work on `style-board.html` (section 4).
3. **Present options first** (register row 26): for any new prop, figure, effect or screen, render two or three variants as small tiles on a scratch page, screenshot them, and show the owner before building the final one.

While working:
4. Read every colour from `style().palette` or `tokens.css`; add no literal (4.5).
5. Use the visual RNG only (`vrnd`, GV 594–598 pattern); never `Math.random`; never read or write simulation state from draw code (review §2.5).
6. Keep the painter's order: everything on a tile draws in that tile's cell (GV `putWalker` ~9604, `putProp` ~9660).
7. Cull by drawn size as GV does (figures `h < 3`, props `< 1.5 px`, trees `< 2.5 px`); cite GV line numbers in the pull request for anything ported.

Before finishing:
8. Screenshot with puppeteer-core (`/opt/pw-browsers/chromium`) at **390×844** (dpr 3) and **1280×800** (dpr 2), at f = 0.30, 0.76 and 0.90, at zoom 0.30, 1.3 and 2.4.
9. Compare each screenshot against the style board column of the picked direction; the palette, line, shading and texture must match the board tile for the same object.
10. Check the perf overlay: frame EMA ≤ 16.7 ms and sim + draw ≤ 12 ms with 30 visitors, 12 pigeons, 4 dogs and 220 particles (brief 9.3).
11. Run `npm test` and `npm run lint`; the determinism test must still pass (draw code cannot change it; if it does, you touched sim state).
12. **Never add image assets**: no PNG, JPG, SVG files, sprite sheets, fonts beyond the two bundled families, or fetches. Inline SVG markup in `index.html` for the mark, the favicon and tool icons is allowed (GV 295–305, 11029–11037).
13. Done when: the screenshots of step 8 are attached to the pull request, every new string is in both `strings/en.ts` and `strings/es.ts`, and no colour literal exists outside `ambient.ts` and `tokens.css`.

Do not: start a prop with a photo-realistic goal; draw text into the canvas except the dev perf overlay; use `globalCompositeOperation` other than `source-over` and the direction C `multiply` grain; add shadows (GV ships them off, 12041) without presenting an option first; change `TW`, `TH`, `EH` or `VANCH`.

---

## 13. Assumptions and open points

Values this document defines that the register does not (the owner may object to any):
1. The visitor base height `VH = 22` px at zoom 1 (0.85 EH), child 0.65, elder 0.95; the rig proportions of 7.1 rule 2; the LOD tiers at `h` 3 / 4 / 8 / 12 / 18 (7.1). GV uses 14.3 px and tiers 4 / 7 / 10 / 18 (GV 8047, 8341–8428).
2. The default zoom 1.3 for a new park, centred on the fountain (5.1).
3. All hex values of the three direction palettes (3.1), the treatment table (3.2) and the per-direction theme colours. Direction A reuses GV constants where a GV constant exists.
4. The 13 board tiles, their sizes and zooms, the phone and desktop layouts, and the board's file paths `style-board.html` and `src/debug/style-board.ts` (4.1–4.3). The module map does not list a board module; `07-Build-Plan.md` decides.
5. The profile field name `stylePick` with values `'A' | 'B' | 'C'`, and direction A as the default until a pick exists (4.4).
6. The `Palette` and `StyleSpec` types and the "no colour literal outside two files" rule with its grep test (4.5); `ambient.ts` holds all three palettes rather than only the chosen one (brief 3.4 item 4 says the chosen palette is written once; keeping all three lets the board and the game share one file and a later second style needs no migration, register 3.11).
7. The full type scale of 5.2 (the brief fixes only the 11 px minimum); the bar colours and low-state thresholds of 5.5; the gate tick on the Heart bar.
8. The segmented switch styling, the tier badge on locked pills, the cooldown chip design, the row-3 wrap rule, and the 36 px / 44 px hit targets (5.4).
9. Sheet row content and the avatar picker portraits (5.6); the two logo sketches, A as the default; the inline SVG favicon (5.7).
10. Every footprint, height, orientation count, part list, variant and animation in section 6; the three-globe lamp as the lamp for every direction; the lamp pool radius 1.6 tiles; the kiosk's Paris green; the hedge auto-join; the Eiffel Tower bearing north-west; the péniche and the sailboat; the near-side rule for facades (6.4).
11. The species table (plane, chestnut, lime) with heights and autumn colours (6.3); `02-Game-Design.md` §2.5 names the species, this document gives them their look; the `PETALS` ground dots (6.5).
12. The archetype signifiers (7.2), the 8 signature colours and the lovers' colour axis (7.3), the avatar and creature drawings (7.4), the expression table (7.5), heart counts per stage (7.6).
13. Every particle kind, rate, look and budget in section 8, including the tasteful poop splat (white-grey, no brown).
14. Every timing in 9.1 that is not a GV constant; the stage animations of 9.2; the reaction animations of 9.3 (lengths from `02-Game-Design.md` §6.4).
15. The re-keyed sky ramp and warm windows (10.1), the 24-pool cap (10.2), the season tint formulas and the `snowCover` rates (10.3), the leaf rules (10.4), the `shower` dot colour `#B7CCDE` (10.5); the Romance chip pulse and Points flash timings (5.2).
16. Accessibility thresholds (contrast test over the darkest screenshot, 2 Hz flash limit, halved particles under reduced motion) (11); the screenshot matrix of 12.9 (three times of day, three zooms, two viewports).

Open points for the owner:
1. Is 22 px (0.85 EH) the right figure height? It makes faces readable at zoom 1.0 and above but makes people larger relative to tiles than GV's gnomes (0.55 EH). The board tile 7 shows it.
2. The brief (11 item 4) assumes the gate may not retint the five HUD accent tokens; this document keeps them fixed in every direction. Confirm.
3. Register row 15 names a statue in the folly set but §3.7 has no `statue` tool (brief 11 item 13). No statue is in section 6; if the owner adds the tool, a statue (1×1, 1.2 EH, `stone`, plinth and figure) is the obvious addition.
4. Direction C's screen-space paper grain is drawn over the whole scene every frame (one `drawImage` of a 256×256 tile, multiply). If the perf overlay shows it costing more than 1 ms on a mid phone, the fallback is grain baked into tile colours as in A.
5. Whether the featured pair's rose ring should also show in avatar mode (this document says yes).
6. The 40 % lit-window rate on facades at night, and whether the Eiffel Tower should sparkle (a 5-minute real-time cycle would not be deterministic in sim time; this document gives it only a 4 s beacon).

Register inconsistencies seen, not resolved here (brief 11 items 12 and 13 already report them): row 16 "18 abilities" versus 19 ids in §3.8; row 15 "statue".
