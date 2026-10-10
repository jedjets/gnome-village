# Gnome Village review — Section 01: lines 1-314 (head, CSS, body DOM)

File: `/root/.claude/uploads/7b9497e6-6ad3-50a2-ab24-653e6edd687e/38de409f-gnomevillage09-10.html`
Range: lines 1-314. Lines 1-14 = `<head>`; 15-230 = the main `<style>` block (inside `<body>`); 231-314 = the DOM shell. There is **no JavaScript in this range** — zero functions and zero JS variables are defined here. Everything below that cites a line > 314 is a cross-reference into the script, looked up only to explain how a node in this range is driven.

---

## 1. Purpose of the section

This is the **UI shell** of a single-canvas, phone-first simulation game. The canvas (`#cv`, line 231) fills the viewport; every other element is a fixed-position "glass" overlay (translucent, blurred, pill-shaped) that floats over the canvas:

| Layer | Element | Line | Role |
|---|---|---|---|
| top HUD | `.hud` with `#hudTime`, `#hudR` (`#hudPop`, `#hudRes`, `#hudWin`) | 233-241 | clock/day chip, weather+population chip with "+" button, resources chip, seasonal (winter) target chip |
| follow card | `#card` | 243-251 | the selected gnome's name, subtitle, relationship line, three need bars, "doing" line |
| toast | `#hint` | 253 | transient message |
| build ghost bar | `#gbar` | 254 | name/cost/message + Place/Cancel while placing a building as a gnome |
| sheets (dialogs) | `#bld`, `#snd`, `#census`, `#evlog` | 255-257, 260 | Build picker, Sound check, village census, event log |
| debug | `#perf` | 258 | frame/sim/draw timing overlay (hidden) |
| event feed | `#feed` | 259 | last few event pills top-left |
| photo exit | `#photoX` | 261 | X button shown only in photo mode |
| bottom rail | `#rail` → `#tools`, `#grow`, `#sizerow`, `#rail2` | 263-287 | creator tool strip; gnome-mode Build/Pause/Stop; brush slider + Undo; speed group + camera/mode group |
| intro | `#intro` → `#introbox` | 289-314 | splash with logo SVG, title, paragraphs, Begin, EN/ES toggle |

The CSS also encodes the game's **modes as body classes** (`body.gnome`, `body.photo`, `body.winter`, `body.sheet`) and per-element state classes (`.on`, `.gone`, `.crit`, `.short`, `.sel`, `.more`, `.before`, `.no`), which is the main "state" this section carries.

---

## 2. Head (lines 1-14)

| Line | What | Notes |
|---|---|---|
| 1-2 | `<!doctype html>`, `<html lang="en">` | `lang` is never updated when the user picks ES (see §9). |
| 4 | `charset utf-8` | |
| 5 | viewport `width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover` | `maximum-scale=1` disables browser pinch-zoom so pinch reaches the canvas; `viewport-fit=cover` enables `env(safe-area-inset-*)` used throughout. Accessibility trade-off (WCAG 1.4.4). |
| 6 | `theme-color #DCE6EC` | matches page background (the sea colour). Static; never changed at runtime (grep: only this line). |
| 7 | `apple-mobile-web-app-capable yes` | iOS home-screen full-screen. **No manifest, no apple-touch-icon, no service worker** → half-finished PWA posture. |
| 8 | inline pre-paint `<style>`: `html,body{margin:0;padding:0;background:#DCE6EC;color-scheme:light} img{max-width:100%} [hidden]{display:none!important}` | Exists so the first paint (before the body `<style>` at line 15 is parsed) already has the right background and `hidden` elements stay hidden. `img{max-width:100%}` is **dead CSS** — there are no `<img>` elements in the file. `[hidden]` is duplicated at line 25. |
| 9 | `<title>Gnome Village</title>` | gnome-specific |
| 10-12 | preconnect to Google Fonts + stylesheet for **Fraunces** (opsz 9..144, wght 500/700) and **Figtree** (400/500/700), `display=swap` | External network dependency; offline falls back to Georgia / system sans (line 22-23). |

---

## 3. CSS tokens & global rules (lines 15-29)

### Design tokens (`:root`, lines 16-23)
| Token | Value | Use |
|---|---|---|
| `--paper` | `#F1EDF5` | (declared; not referenced elsewhere in range — check script) |
| `--paper-2` | `#E6E0EF` | slider track (116), bar track (134) |
| `--ink` | `#4A4458` | text, pressed-button bg, slider thumb |
| `--ink-soft` | `#6E6680` | secondary text |
| `--moss` `#8CBE85`, `--sky` `#A6CDE6`, `--berry` `#EDA9C4`, `--ember` `#F2B67E`, `--stone` `#B9B7C6` | accent palette | **not used by any rule in lines 15-230**; they are nature-themed names for the script/canvas side. Rename for a new theme. |
| `--glass` | `rgba(250,248,253,.82)` | overlay background |
| `--glass-line` | `rgba(74,68,88,.13)` | overlay border / separators |
| `--shadow` | `0 2px 10px rgba(74,68,88,.13)` | overlay shadow |
| `--ui` | Figtree stack | body font |
| `--display` | Fraunces stack | headings, italic "doing" lines, gbar title |

Hard-coded colours that bypass tokens: `#FBF9FE` (light text on ink, many places), `#DCE6EC` (bg, 8/27), `#A85A3C` (`#hudWin.short`, 46), `#A94A5A` (`#gbar .m.no`, 190), `#4A4458`/`#fff` (`#bPlay[aria-pressed]`, 173 — duplicates `--ink`), `#3B3A4C` + `rgba(255,255,255,.72)` (`#perf`, 157), `#DDD` fallback is in script (10850). Intro gradient colours `#F7F2FA #E4E9F0 #D6E1E6` (141). Intro SVG colours (291-299).

### Global (lines 24-29)
- 24: `*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}`
- 25: `[hidden]{display:none!important}` (dup of line 8)
- 26-27: `html,body{height:100%;overflow:hidden;background:#DCE6EC;font-family:var(--ui);color:var(--ink);overscroll-behavior:none;touch-action:none}` → **no page scroll, no pull-to-refresh, all gestures go to the canvas**. Key mobile trick.
- 28: `#stage{position:fixed;inset:0}`; 29: `canvas{position:absolute;inset:0;width:100%;height:100%}`.

---

## 4. HUD chips (CSS 31-80; DOM 233-241)

### CSS
- 32-34 `.hud`: fixed top, `padding-top: env(safe-area-inset-top)+8px`, flex `space-between`, `flex-wrap:wrap`, `pointer-events:none`, z 5.
- 35-39 `.chip`: glass pill, **font-size 10px**, 500 weight, `backdrop-filter:blur(9px)`, `tabular-nums`, `white-space:nowrap`, flex gap 8px; `.chip b` 700; `.chip .sep` 1×11px divider (41).
- 42-43 `#hudRes{max-width:min(62vw,300px);overflow:hidden}` + inner span ellipsis → the resources line truncates on narrow phones.
- 46 `#hudWin.short{color:#A85A3C}` → rust colour when the winter larder is under half target (set at 10859: `f<nf*0.5||w<nw*0.5`, where `nf=pop*5+12`, `nw=pop*4+16`; chip shown when `season===2&&ds>1.2` or `season===3`, 10855).
- 47 `#hudPop{cursor:pointer}`; 49-50 `#bAdd` 18×18 round ink button inside the pop chip, `:disabled{opacity:.35}`. Comment (48) "v9.17: the + on the gnome chip calls a villager ashore; the chip itself opens the census".
- 80 `#hudR{flex-direction:column;align-items:flex-end;display:flex;gap:6px;margin-left:auto}` → right-hand chips stack vertically.
- 75 `body.winter #feed{top:…+114px}` → the feed drops 28px lower when the winter chip exists (normal 86px, line 162).

### DOM (233-241)
- `#hudTime` (234-235): `.dotm#wdot` weather dot (colour set from `WCOLD[W.kind]`, 10850) · `#tTime` "Dawn" (todName, 10847) · sep · `#tDay` "Day 1" (`'Day '+T.day+' · '+SEASONS[T.season]`, 10848). Input: `pointerdown` (12181): **single tap (after 400ms timer) toggles the events sheet; double tap (<380ms) toggles `#perf`** (FT.on). `cursor:pointer` at 228.
- `#hudPop` (237): `role="button" aria-label="Who lives on the isle"`; `#tWx` "Fair" (WK label, 10849) · sep · `<b id="tPop">2</b>&nbsp;gnomes` (10851) · `<button id="bAdd">+</button>` aria "Call a new villager ashore". Click chip → open/close census (12172). Click `+` → `addVillager()` with `stopPropagation` (12171). **A11y issue:** a `div[role=button]` with no `tabindex`/key handler, and an interactive `<button>` nested inside a `role=button` (invalid ARIA nesting).
- `#hudRes` (238): `#tRes` "—" → `'food N · wood N · stone N · reeds N'` (10852-10853).
- `#hudWin` (239): `hidden` by default; `#tWin` → `'Winter'|'Before winter' + ' · larder full' | 'food f/nf · wood w/nw'` (10858).

---

## 5. Sheets / dialogs (census, sound, build picker, events)

All four share the same recipe: `position:fixed; z-index:8; left:50%; translateX(-50%); bottom: safe-area + 108px; width:min(94vw,420px); glass; border-radius:16px; display:none; .on{display:block}`; a `.x` close button absolutely placed top-right (`font-size:18px`); an `h4` 13px/600. **The CSS `bottom` values are fallbacks only** — `layoutOverlays()` (10689-10699) overwrites `style.bottom` for `card, gbar, snd, bld, census, evlog` with `rail height + 8px`, and sets `#hint` above whichever of gbar/card is open.

| Sheet | CSS lines | DOM line | Specifics |
|---|---|---|---|
| `#census` | 51-71 | 257 | `max-height:52vh; overflow-y:auto`. `.sum` 10.5px summary; `.row` is a **button styled as a 2-col grid** (`1fr auto`), `b` 12px name, `small` 10px, `small.r` spans both columns (relationship), `.row.sel` inverted (ink bg). `body.photo #census{display:none!important}` (74). Opened by `#hudPop` (12172); row click → `selectGnome` (12174). `role="dialog" aria-label="Who lives on the isle"`, heading "The village". |
| `#snd` | 76-79 | 256 | bottom offset is **112px** (inconsistent with the others' 108px; moot since overridden). `.row` wraps pill buttons 12px. Populated once from `SND_CUES` in `openSoundCheck()` (10786-10790). Close at 12168. A developer sound-check panel. |
| `#bld` | 196-207 | 255 | `max-height:52vh`. `.grid` 3 columns; buttons have `b` 12px name + `small` 10px cost/desc; `:disabled{opacity:.45}`. Filled by `openBuild` (11006 `pbHome()`). `body.photo #bld{display:none}` (208). |
| `#evlog` | 213-225 | 260 | `max-height:34vh`. `.row` block button; `small` 9.5px time; `span` 11.5px text; `.sel` inverted. Comment (212): "v9.20: the events sheet — a tap on the feed line (or on the clock) opens the last forty lines in full; a tap on one flies there". Row click → `goToEvent` (12178). |

Related: `body.sheet #card{opacity:0!important;pointer-events:none!important}` (226): the card hides while census or evlog is open (`sheet` toggled at 10694).

---

## 6. Bottom rail (CSS 82-122; DOM 263-287)

- 83-85 `#rail`: fixed bottom, `padding:8px 8px calc(safe-area-bottom+8px)`, column flex gap 7px, `pointer-events:none` (children re-enable so canvas gets touches between controls), z 6.
- 86-88 `#tools`: horizontal scroller, `overflow-x:auto`, hidden scrollbar (`scrollbar-width:none`, `::-webkit-scrollbar{display:none}`), `scroll-snap-type:x proximity`, `pointer-events:auto`.
- 89-93 `.tool`: glass card 14px radius, column layout (swatch above label), 10.5px/600 label, 13s-ish transitions; 94-95 `.sw` 17px rounded swatch w/ 1.5px border, holds a 15px SVG icon (icon html from `TOOL_ICON`, bg colour from `t.col`, 11055). `[aria-pressed="true"]` → ink bg, `translateY(-2px)` (99-100). Focus ring (101).
- 96-98 **scroll-edge fade masks**: `#tools.more` masks right 16%; `.more.before` masks both ends; `.before:not(.more)` masks left only. Toggled by `more()` at 11059 (thresholds 6px) on scroll/resize.
- 102 `#rail2`: flex `space-between`, wrap. 103 `#sizerow`: centred row. 104 `.gb.glass`: glass variant of `.gb`. 105 `.gb:disabled{opacity:.35}`.
- 107 `#depth`: tabular, `min-width:64px`, right-aligned — shows `'1 tile'` or `(2*brush-1)+' tiles'`, or `SPRING_NAME[brush-1]` for the spring tool (11062).
- 109-114 `.grp` pill group (padding 4px) and `.gb` flat button 11px/600 `min-width:30px`; `#bRotL,#bRotR` tighter (112); `.gb[aria-pressed="true"]` inverted (113).
- 115-118 `#sizewrap`: glass pill, hidden by `opacity:0; translateY(6px); pointer-events:none`; `.on` reveals (transition .18s). Shown whenever `tool!=='hand'` (11067).
- 119-121 range inputs `#size` (118px) and `#spdR` (92px): 3px track `--paper-2`; 16px ink thumb with 2px light border (webkit), 14px (moz).
- 122 `#spdLbl` 11px/700 tabular `min-width:30px`; 123 `#spd{align-items:center}`.

### DOM
- 264 `#tools` — empty; built by `buildTools()` (11048-11061) from `TOOLS[]`.
- 265-270 `#grow` — hidden unless `body.gnome` (177-179): `#bBuild` ("Build", aria "Build something with your gnome", `.gb.glass`), `#gstat` chip (hidden; status of your build; 10px, ellipsis, `max-width:60vw`, line 180), `#bPause` (hidden), `#bStop` (hidden). Toggled by `updateGrow()` (10997-11001); `#bBuild[aria-pressed]` (184) is pressed while picker or ghost is active.
- 271-274 `#sizerow`: `#sizewrap` → `#sizelbl` "Brush" (becomes "Flow" for spring, 11068) · `<input id="size" type="range" min=1 max=6 value=1 step=1>` (max is set to **4** for spring, 11065) · `#depth`; `#bUndo` ("Undo", disabled; enabled when `undoStack.length>0`, 11116; click → `undoStroke`, 12197).
- 275-287 `#rail2`: group `#spd` = `#bHalt` "||" (aria "Pause the isle") · `<input id="spdR" min=1 max=20 value=1>` (aria "Speed, one to twenty times") · `#spdLbl` "1×" — handler 12134-12140: slider sets `want` (1-20) and `T.speed` if running; halt toggles `T.speed` 0/want and resets `simAcc`; label shows `'Paused'` when 0. Second group: `#bRotL` ◀ / `#bRotR` ▶ (`turn(∓1)`, 12149-12150), `#bFit` "Fit" (12151), `#bMute` "Sound" (`aria-pressed`, 12157), `#bPlay` "Be a gnome" (aria "Switch between shaping the isle as its creator and playing as a gnome of your own"; click → `setMode(MODE==='gnome'?'creator':'gnome')`, 12184; text flips to "Creator" when in gnome mode, 11267), `#bPhoto` "Photo" (`photo(true)`, 12183), `#bNew` "New" (`newIsland(random uint32)`, 12169 — **no confirmation**).

---

## 7. The gnome card (CSS 125-137, 72-73, 174-182, 227; DOM 243-251)

- 126-130 `#card`: fixed, z 7, centred, bottom = safe-area+108px (fallback), glass 14px radius, `min-width:186px; max-width:min(300px,88vw)`, hidden via `opacity:0;pointer-events:none;translateY(8px)`; `.on` slides up (.18s).
- 132 `h3` display font 15px/700; 133 `.sub` 10px soft.
- 134-137 `.bar`: grid `46px 1fr`, 9.5px uppercase 600 label, `i` = 4px track (`--paper-2`), `i>u` = fill (width/colour set by script). Labels in DOM (247-249): **"Full" (`#cHun`), "Rested" (`#cEne`), "Warm" (`#cWar`)** → hunger, energy, warmth needs.
- 138 `.doing` 11px italic display font (`#cDo`; text from `DOING[g.st]` with player-specific overrides at 10830).
- 72 `#card .rel` 10px soft, negative top margin — relationship text (`relText(g)`/`critRel(c)`, hidden when empty, 10823/10970).
- 227 `#card.crit .bars{display:none}` — when a **critter** (animal) is selected the bars are hidden (`crit` class added 10878/10967).
- **Gnome-mode compaction (174-182, "building as a gnome (v9.9)")**: `body.gnome #card` becomes `display:flex; flex-wrap:wrap; width:min(300px,88vw)`; `h3` 14px; `.sub` flexes on the same line; `.bars` becomes a row of three `flex:1` bars with `grid-template-columns:auto 1fr` and **8.5px** labels; `.doing` 10.5px; `.rel` full width (73). Rationale in comment 175: "the isle keeps the screen".
- DOM placeholders: "Pip", "young gnome", "wandering" — overwritten by `updateCard()`.

---

## 8. Ghost/placement bar `#gbar` (CSS 185-195; DOM 254)

- Fixed, z 7, centred, `width:min(300px,88vw)`, glass 16px radius, `display:none`/`.on`.
- `.t` flex space-between: `#gbName` (display 16px/700, placeholder "Cabin") and `#gbCost` (`span` 11px/600 soft right-aligned).
- `.m` message 12px italic display font `min-height:16px`; `.m.no{color:#A94A5A}` for "cannot place here" messages.
- `.b` button row right-aligned: `#gbPlace` (ink highlight when enabled: `#gbPlace:not(:disabled)`, 194; disabled unless `PB.ghost.ok`, 11026) and `#gbCancel` (→ `pbClear()`, toast "Nothing placed", 12189).
- `body.photo #gbar{display:none}` (208). No `role=dialog` (unlike the sheets).

---

## 9. Intro / splash (CSS 140-156; DOM 289-314)

- 141-144 `#intro`: fixed full-screen, **z 20**, centred flex, padding 22px, radial gradient (`#F7F2FA → #E4E9F0 55% → #D6E1E6`), `transition:opacity .5s`; `.gone{opacity:0;pointer-events:none}` then script sets `display:none` after 600ms (12218-12219).
- 145 `#introbox{max-width:340px;text-align:center}`; 146 `.mark` logo centred.
- 147-148 `h1` display 34px/700, `letter-spacing:-.015em`, `text-wrap:balance`; 149 `p` 13.5px/1.55 soft, `text-wrap:pretty`.
- 150-153 `#begin` pill CTA 14px/700, `padding:12px 30px`, heavier shadow; focus ring.
- 154-156 `#lang` row; buttons 11px/600 outline pills; `[aria-pressed="true"]` inverted.
- DOM 291-300: inline SVG 92×76 "mark" = **two gnome hats (blue `#A6C7E8`, pink `#EDA9C4`) with faces (`#F0DCCB`), beards and dot eyes** — gnome-specific art; `aria-hidden`.
- 301 `#iTitle` "Gnome Village"; 302 `#iP` (filled with `<p>` per `L.p`); 303 `#begin` "Begin"; 309-312 `#lang` buttons `data-l="en"` (pressed) / `data-l="es"`.
- Script (12200-12220): `langs={en:{h,p[],b}, es:{h:'Aldea de Gnomos',…,b:'Comenzar'}}`, `let lang='en'`; `paintIntro()` rewrites title/paragraphs/button and `aria-pressed`. `#begin` click → `initAudio()` (user-gesture requirement for AudioContext), resume AC, fade intro.

### i18n verdict
- **Only the intro (title, 3 paragraphs, Begin) is translated.** Every other string in this range is English-only and hard-coded in markup or script: "gnomes", "Day", resource names, "Full/Rested/Warm", "wandering", "Build/Pause/Stop/Place/Cancel/Undo/Brush/Flow/Fit/Sound/Be a gnome/Creator/Photo/New", all `aria-label`s, "The village", "Sound check", "Events", "Who lives on the isle", "What has happened on the isle", "Show the controls again".
- `lang` is a closure-local variable; **not persisted** (no `localStorage` anywhere in the file) and `<html lang>` is never updated.
- The intro copy even references UI words untranslated ("Fit", "Spring") inside the Spanish text.

---

## 10. Other overlays

- 157 `#perf`: fixed `left:12px; top:safe+58px`, z 6, monospace 11px, white 72% bg, `white-space:pre`, `hidden` + `aria-live="off"` (258). Toggled by double-tapping the clock chip (12181). Shows frame ms/fps, sim ms (peak), draw ms (peak), counts, zoom, slopes (12067-12068). **Developer tool left in production.**
- 158-161 `#hint`: toast, fixed centred, bottom fallback safe+150px (overridden by `layoutOverlays`), z 8, dark `rgba(74,68,88,.86)` bg, 11.5px, `max-width:88vw`, `.on` fades in .3s. `toast(m)` (10685) shows for `toastT=3.4` s (10841). **No `role=status`/`aria-live`.**
- 162-163 `#feed`: fixed `left:10px; top:safe+86px`, z 5, `max-width:min(66vw,300px)`, 9.5px soft text, `opacity:0`→`.on` (209). 210-211 `.ev` pills (glass, ellipsis, `transition:opacity 1s`, `cursor:pointer`), `#feed:not(.on) .ev{pointer-events:none}`. Click an `.ev` → open event sheet and fly to latest (12176). Cleared on new island (12106).
- 164 `body.photo .hud, #rail, #card, #hint, #feed {opacity:0!important; pointer-events:none!important}`; 165-168 `#photoX` (fixed top-right, 34px round glass, **z 30**, `display:none` → `block` under `body.photo`). `photo(on)` at 12182 also `clearSel()` + `closeEvLog()`.
- 229 `@media (prefers-reduced-motion:reduce){*{transition-duration:.01ms!important}}`.

---

## 11. Z-index map
`.hud` 5 · `#feed` 5 · `#rail` 6 · `#perf` 6 · `#card` 7 · `#gbar` 7 · `#census/#snd/#bld/#evlog/#hint` 8 · `#intro` 20 · `#photoX` 30.

## 12. Vertical stacking convention (why the CSS bottoms all say 108px)
Every bottom-anchored overlay has a CSS fallback `bottom: safe-area + 108px` (hint 150px, snd 112px), but at runtime `layoutOverlays()` (10689) measures `#rail`'s real height and stacks: sheets/card/gbar at `railH+8`, the toast above the open gbar/card (+10). The script also measures the HUD (`hudTime`, `hudR`, `feed`) and the open overlays to compute the camera's free area (11287-11288). **Port this convention as-is**: CSS = fallback, JS = measured stacking.

---

## 13. "State" carried by this section (no JS variables; DOM/CSS state)

| Carrier | Values | Set by (script line) |
|---|---|---|
| `body.gnome` | mode = gnome | 11266 (`setMode`), 12107 (`newIsland` resets) |
| `body.photo` | controls hidden | 12182 |
| `body.winter` | winter chip visible | 10856 |
| `body.sheet` | census or evlog open → hides card | 10694 |
| `#card.on/.crit` | selected gnome / critter | 10822-10878, 10967, 11258, 11278 |
| `#gbar.on`, `#bld.on`, `#snd.on`, `#census.on`, `#evlog.on`, `#feed.on`, `#hint.on`, `#sizewrap.on` | visibility | various |
| `#intro.gone` | splash dismissed | 12218 |
| `#hudWin[hidden]`, `#hudWin.short` | larder target shown / under half | 10856-10859 |
| `#tools.more/.before` | scroll edge fades | 11059 |
| `[aria-pressed]` on `.tool`, `.gb`, `#bPlay`, `#bMute`, `#bHalt`, `#lang button` | pressed state (also styling hook) | 11066, 11267, 12136, 12157, 12212 |
| `#size.value/max` (1-6 or 1-4), `#spdR.value` (1-20) | brush, speed | 11065, 12137-12139 |
| `#bUndo[disabled]`, `#bAdd[disabled]`, `#gbPlace[disabled]`, `#bld button[disabled]` | affordance | 11116, 11026 |
| `#cRel[hidden]`, `#gstat/#bPause/#bStop[hidden]`, `#perf[hidden]` | | 10823, 10997-11000, 12181 |
| `data-l` on lang buttons; `data-id` on `.tool`, census/evlog rows | identifiers | 310-311, 11054, 12174, 12178 |

## 14. Functions in range
**None.** Cross-reference of script functions that drive nodes defined here (outside range, for the merger): `layoutOverlays` 10689, `toast` 10685, `evOpen/renderEvLog/openEvLog/closeEvLog` 10741-10749, `openSoundCheck` 10786, `censusOpen/openCensus/closeCensus/renderCensus` 10866-10992, `updateCard` ~10820, `clearSel` 10874, `updateGrow` 10997, `openBuild` ~11006, `updateGbar` 11019, `buildTools` 11048, `showDepth` 11062, `setTool` 11064, `showUndo` 11116, `setMode` ~11256, `paintIntro` 12207, perf writer 12067, init wiring 12134-12220.

---

## 15. Rules & tuning numbers visible in this range
- Brush slider 1..6 (DOM 272), reduced to 1..4 for spring (11065); depth label = `2*brush-1` tiles (1,3,5,7,9,11).
- Speed slider 1..20× (DOM 277); pause toggles to 0.
- Transition timings: chips/tools .13s; card/sizewrap .18s; hint .3s; feed .4s; intro .5s (+600ms JS); feed pill fade 1s; reduced-motion → .01ms.
- Blur radii: 8px (feed pills), 9px (chips, tools, groups, snd), 11px (card, census, gbar, bld, evlog).
- Sizes: chips 10px text; tool label 10.5px; `.gb` 11px; card h3 15px (14 in gnome mode); bars 9.5px (8.5 in gnome mode); intro h1 34px, p 13.5px; begin 14px.
- Widths: sheets `min(94vw,420px)`; card/gbar `min(300px,88vw)`; card min 186px; hudRes `min(62vw,300px)`; feed `min(66vw,300px)`; gstat `60vw`; introbox 340px; sliders 118px/92px.
- Heights: census/bld `52vh`, evlog `34vh`.
- Safe-area offsets: HUD top +8; perf +58; feed +86 (+114 in winter); photoX +10; rail bottom +8; overlays +108 (snd +112, hint +150 — fallbacks).
- Winter chip (cross-ref 10855-10859): shown season 2 with `ds>1.2` or season 3; targets `food = pop*5+12`, `wood = pop*4+16`; `.short` when either < 50% of target.
- Toast duration 3.4 s (10685); clock double-tap window 380 ms, single-tap delay 400 ms (12181).

---

## 16. Oddities, bugs, dead code, TODOs
1. `img{max-width:100%}` (line 8) — dead; no `<img>` in file.
2. `[hidden]` rule duplicated (8 and 25). `html,body` background declared three times (8, 26-27, plus theme-color).
3. `<style>` inside `<body>` (15-230) is non-conforming HTML (metadata content belongs in `<head>`), though every browser honours it. Likely done so the head stays tiny for first paint.
4. `#bPlay[aria-pressed="true"]{background:#4A4458;color:#fff}` (173) and `#bBuild[aria-pressed="true"]` (184) duplicate the generic `.gb[aria-pressed="true"]` rule (113) and use literal colours instead of tokens.
5. `#snd` bottom 112px vs 108px elsewhere — inconsistent but overridden by `layoutOverlays`.
6. `#hudPop` is a `div[role=button]` with no `tabindex` and no key handler; contains a nested `<button>` (interactive-in-interactive ARIA violation). Click on `+` relies on `stopPropagation`.
7. `#gbar` lacks `role="dialog"`; `#hint` and `#feed` lack `aria-live`; `#card` has no landmark/role.
8. `maximum-scale=1` blocks user zoom; combined with 8.5-10px text this is a legibility/accessibility risk.
9. i18n: only intro translated; `lang` not persisted; `<html lang>` static; Spanish text contains untranslated UI tokens ("Fit", "Spring").
10. No persistence whatsoever (`localStorage` grep: 0 hits) — refresh loses the island; `#bNew` has no confirm.
11. PWA half-measure: `apple-mobile-web-app-capable` with no manifest/icon/service worker; fonts need network.
12. `#perf` debug overlay and `#snd` sound-check dialog shipped in production (hidden, but reachable: double-tap clock / `openSoundCheck`).
13. Accent tokens `--moss/--sky/--berry/--ember/--stone` and `--paper` unused in CSS (consumed, if at all, by script).
14. Placeholder DOM text ("Pip", "young gnome", "Cabin", "2 gnomes", "Dawn", "Day 1", "Fair") shows for one frame if the script errors before the first `updateHUD`.
15. `body.winter #feed` offset (75) is a static guess at the right-column height; `layoutOverlays` measures the HUD for the camera but **not** for the feed's `top`.
16. Version breadcrumbs in CSS comments: v9.9 (gnome-mode building), v9.17 (`+` calls villager), v9.20 (events sheet). No TODO/FIXME in range.

---

## 17. Mode handling in this range (`creator` vs `gnome`)
- `MODE` lives in the script (`let PLAYER=null, MODE='creator'`, 5630). The CSS reacts to `body.gnome` only:
  - 172 `body.gnome #tools, #sizerow, #bUndo {display:none!important}` — creator terrain tools, brush slider and undo vanish in gnome mode.
  - 177-179 `#grow{display:none}` → `body.gnome #grow{display:flex}` — gnome-mode action row (Build / status / Pause / Stop).
  - 174-182 compact card strip in gnome mode (name+age one line, three bars side by side, `.rel` full width).
  - 73 `body.gnome #card .rel{flex-basis:100%}`.
- `#bPlay` (282) is the mode toggle; its label alternates "Be a gnome"/"Creator" (11267) and `aria-pressed` mirrors mode.
- `#gbar`/`#bld` (building UI) are not CSS-gated by mode; the script only opens them in gnome mode (`PB.pick`, 11020, 12049).
- Photo mode (`body.photo`) and sheet state (`body.sheet`) are orthogonal to creator/gnome.
- Creator-only affordances: `#tools` strip, `#sizewrap`/`#size`/`#depth`, `#bUndo`. Shared: HUD chips, speed group, rotate/Fit/Sound/Photo/New, census, events, card.

## 18. Progression / economy / persistence touchpoints
- Economy surfaces: `#tRes` (food/wood/stone/reeds), `#hudWin` winter larder target with `.short` warning, `#gbCost` build cost, `#bld .grid button small` (cost text), disabled build buttons when unaffordable (`:disabled{opacity:.45}`).
- Progression surfaces: `#tDay` day+season, `#tPop` population, `#bAdd` to add villagers (disabled state exists), `#census` list, `#evlog` last 40 events.
- Persistence: **none** in the whole file.

## 19. Mobile / touch / performance tricks
- `touch-action:none`, `overscroll-behavior:none`, `overflow:hidden`, `-webkit-tap-highlight-color:transparent`, `maximum-scale=1` → canvas owns all gestures.
- `env(safe-area-inset-*)` + `viewport-fit=cover` on HUD, rail, every overlay.
- `pointer-events:none` containers with `pointer-events:auto` children so touches fall through to the canvas between controls.
- Horizontal tool strip with hidden scrollbar, scroll-snap, and gradient edge masks signalling overflow.
- Overlays measured and stacked by JS (`layoutOverlays`) rather than fixed offsets → adapts to rail wrapping on small screens.
- `backdrop-filter:blur` on ~15 elements — GPU cost on low-end phones; the photo mode and `display:none` sheets mitigate.
- `prefers-reduced-motion` kill-switch; `text-wrap:balance/pretty`; `font-display:swap`; preconnect.
- `color-scheme:light` forces light rendering of form controls.

---

## 20. Reusable shell vs gnome-specific content

### Reusable as-is (engine/shell)
- Token system (`:root`), glass pill/chip/button/group vocabulary (`.chip`, `.sep`, `.grp`, `.gb`, `.gb.glass`, `.tool`, `.sw`), range-slider styling.
- Full-screen canvas stage + fixed overlay layering + z-index map.
- HUD skeleton (left clock chip, right column of chips with `margin-left:auto`, wrap).
- Bottom rail: scrollable tool strip with snap/masks, secondary rows, speed group, camera group.
- Sheet/dialog recipe (`#census/#bld/#snd/#evlog` CSS) and the row-button pattern (`.row`, `.row.sel`).
- Card panel with bars (`.bar i>u`) and the compact "strip" variant for avatar mode.
- `#gbar` placement bar pattern (name/cost/message/Place/Cancel).
- Toast (`#hint`), feed (`#feed .ev`), perf overlay, photo mode (`body.photo` + `#photoX`), intro overlay with language toggle, `layoutOverlays` stacking convention, reduced-motion rule, safe-area handling, mode-as-body-class pattern.

### Gnome-specific (replace)
- Title, `<title>`, `theme-color`/sea background, intro copy (en/es) and the gnome-hat SVG logo.
- Chip texts: "gnomes", "Day", "Fair", resources "food · wood · stone · reeds", winter larder chip + `.short` rust colour and its thresholds.
- Card bar labels Full/Rested/Warm; "young gnome", "wandering"; `.rel` relationship line semantics.
- `#bPlay` label "Be a gnome"/"Creator"; `#bFit` "Fit the whole island"; `#bNew` "New island"; `#bAdd` "Call a new villager ashore"; census "The village"/"Who lives on the isle"; evlog "What has happened on the isle".
- Build picker items/costs, "Cabin" placeholder, "Spring"/"Flow" brush label and the 1..4 cap, `SPRING_NAME` depth names.
- Palette names (moss/sky/berry/ember/stone) and the lavender/sea colour scheme.

---

## 21. Design questions for the Parque D'Amour port raised by this section
1. **HUD chips**: what are the 3-4 glanceable numbers? Keep time-of-day/day chip; replace "N gnomes" with visitors/couples; replace resources with a romance meter, park budget, or mood; does the seasonal "winter target" chip become a deadline chip (e.g. "Before dusk · romance 3/5")?
2. **Card bars**: what replaces Full/Rested/Warm for a park visitor or the couple — Affection / Trust / Mood? Does the card show one character or the couple as a pair (two names, shared bars)? Does `.rel` become the headline?
3. **Assist vs sabotage**: is it a stance toggle (a third chip/button like `#bPlay`), or emergent from which objects/actions the player uses? Does the UI need a visible stance indicator or a hidden alignment score?
4. **Creator mode tools**: which park-shaping tools go in `#tools` (paths, hedges, benches, fountains, flower beds, lamps, kiosks)? Do they need a brush size and depth readout? Is there an Undo? Is there a "Spring"-like continuous tool (water, music) with its own cap?
5. **Avatar mode row (`#grow`)**: what are the avatar's verbs — approach, talk, give, place object, hide, whistle? Is there a long-running action needing Pause/Stop like the gnome build? Does the avatar place objects via a ghost bar (`#gbar`) with a cost?
6. **Economy**: is there currency/cost at all (`#gbCost`, disabled build buttons), or is it purely time/attention?
7. **Sheets**: keep census ("who is in the park"), events ("what happened"), build picker? Add a relationship-history or dialogue sheet? Keep the sound-check and perf overlays as debug-only (hidden behind a flag)?
8. **Camera controls**: does the park rotate in 4 steps (`#bRotL/R`) and need Fit? Is the map an island or a bounded park with edges?
9. **Speed/pause**: keep 1-20× and the halt button? Romance pacing may want fewer speeds.
10. **New**: "New island" → "New park" — random seed or seed input? Add a confirm (GV has none)?
11. **Persistence**: GV saves nothing; does Parque need localStorage save/resume, and should the language choice persist?
12. **i18n**: GV translates only the intro. Decide up front on a full string table (EN/ES/FR?) covering aria-labels, chips and dynamic text; and update `<html lang>`.
13. **Visual theme**: new tokens (greens/roses/cream), display font (Fraunces → a French-feeling serif?), theme-color, intro gradient, logo SVG (bench/two hearts). Keep glass look?
14. **Accessibility**: raise minimum font sizes (8.5-10px here), fix `role=button` div + nested button, add `aria-live` to toast/feed, consider allowing zoom.
15. **Photo mode**: keep; romance scenes are photogenic. Anything else to hide (feed pills)?
16. **Layout**: portrait phone first as here; is landscape/desktop in scope (rail wraps, sheets 420px max)?
17. **Mode naming**: "Be a gnome"/"Creator" → "Walk the park"/"Gardener"? Does the avatar have identity (name/age shown in card) and is it chosen on the intro screen?
