// src/ui/rail.ts
// The three-row rail: the Park | Cupid | Mischief switch and strip, the contextual row 2, the controls row 3 (register 3.9, 03 10.4).
// Ported from GV 11029-11072 (TOOL_ICON, TOOLS, buildTools with the .more/.before edge masks, setTool, showDepth), 11116 (showUndo),
// 11018-11027 (updateGbar: the ghost's name, its reason line and a Place that is disabled while the ghost is red) and 12134-12198 (speed,
// halt, turns, Fit, mute, photo wiring). Verdict: ADAPT. Changes: the Park strip is play/tools.ts TOOLS with t() labels and the icon set
// the owner picked on scratch/s3-options.html (set 3, 2026-10-13, register section 4 row Tool icons: two-tone, the lines 17 x 17 stroked
// in currentColor over small fills whose classes f-rose, f-lawn, f-gravel, f-water and f-awning shell.css fills from the tokens.css
// accents, so no colour literal); the swatch border is --moss (04 5.4 item 2); setTool clears the follow for every tool but the hand (GV 11070; the selection joins in
// S4); GV's gbar is row 2 here: #depth holds the tool's label or the ranked reason, #sizewrap the brush size 1-3, #bPlace / #bCancel the
// live ghost, #bUndo enqueues the `undo` command and is disabled while undo.depth() is 0; the speed dial and the pause enqueue `speed`
// (03 4.6, hard rule 2); Fit is the camera's two-way toggle; New calls the handler main.ts hands in (the confirm). A big stamp or run
// keeps its ghost here (armed): a tap shows it, a second tap on the same tile or Place enqueues it, Cancel drops it, and the ghost is
// checked again each frame because the world may change under it (a paused command applying, an undo).
// Options (register 3.9 and section 4 "Park pace and Options", owner 2026-10-14): row 3 ends with #bOptions, which opens the Options
// sheet (sheets.ts; a second press closes it, as the chips do).
// Dropped from the range: the spring tool's size 4 and its names (11063, 11072), sizelbl's Flow (11068), the build sheet (11010-11017).
// S6 (07 S6.6 step 6; 02 8.1, 9.1; 04 5.4 items 2-4): the Cupid and Mischief groups fill the strip from ui/ability-strip.ts (the pills from
// ABILITIES, locked ones dimmed with the tier badge, arming, the cooldown chip in row 2's #cdChip); arming is held there and armAbility /
// armedAbility are re-exported here: for these groups row 2 holds the chip alone (the Undo and the Park context are the Park group's;
// the chip says "Pick an ability" with nothing armed, so the row keeps its height and the strip does not jump on arming). The group
// switch, a Park tool and the avatar mode disarm. TODO(S8): mute through audio.
// S7 (07 S7.6 step 7; 02 10.1; 04 5.4 items 5-6): row 3's mode button is the avatar mode's switch: "Be someone" opens the Avatar picker
// (sheets.ts, picker.ts), "Creator" (the mode button's text while body.avatar is on) enqueues the logged `avatar.leave` on the possessed
// avatar's side; neither sets the class: hud.ts does, from the sim's `mode` event, and calls syncMode, which disarms the tool and the ability,
// presses the button and fills row 1's three hint chips (#hints, the avatar's `hints` keys; CSS shows them in place of the switch and the
// strip) in the current language.
import { T } from '../core/clock.ts';
import { AVATAR_SIDE, enqueue } from '../core/commands.ts';
import type { XY } from '../core/math.ts';
import { AVATARS } from '../play/avatar.ts';
import { getAvatar, getMode } from '../play/mode.ts';
import { TOOLS, ghost, toolById, type Ghost, type ToolClass, type ToolId } from '../play/tools.ts';
import { depth } from '../play/undo.ts';
import { fitToggle, follow, turn } from '../render/camera.ts';
import { $, setBodyClass, toast, layoutOverlays } from './dom.ts';
import { t, onLang } from './i18n.ts';
import { closeSheets, toggleSheet } from './sheets.ts';
import { armedAbility, buildAbilityStrip, endAbilityStrip, setArmed, updateAbilityStrip } from './ability-strip.ts';
import type { AbilityId } from '../core/commands.ts';

export { armedAbility };

export type Group = 'park' | 'cupid' | 'mischief';
type Dial = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * The Park strip's icons, set 3 of scratch/s3-options.html (owner 2026-10-13): inner markup of a 17 x 17 viewBox, the lines stroked in
 * currentColor, the small fills by class (`f-<token>`: shell.css fills each with var(--<token>) of tokens.css).
 */
const ICON: Readonly<Record<ToolId, string>> = {
  hand: '<ellipse cx="8.5" cy="8.5" rx="6.5" ry="4"/><circle cx="8.5" cy="8.5" r="2" fill="currentColor" stroke="none"/>',
  path:
    '<path d="M3 15.5 C4.4 11.5 8.6 11 7.2 7 C6.6 5.2 7.4 3.2 8.9 1.5 H12.1 C10.7 3.2 10.2 5 10.8 7 C12.4 11.6 8.9 13 8 15.5 Z" class="f-gravel"/>' +
    '<circle cx="6.4" cy="13.4" r="0.7" fill="currentColor" stroke="none"/>' +
    '<circle cx="9.6" cy="8.7" r="0.7" fill="currentColor" stroke="none"/>' +
    '<circle cx="9.1" cy="4.1" r="0.7" fill="currentColor" stroke="none"/>',
  lawn:
    '<path d="M1.5 15.5 C3.5 12.2 13.5 12.2 15.5 15.5 Z" class="f-lawn"/><path d="M4.6 13.6 Q4 10.2 2.6 8.2"/>' +
    '<path d="M7 12.9 Q7 8.9 6.2 5.6"/><path d="M9.6 12.9 Q9.8 8.4 11 4.6"/><path d="M12.3 13.4 Q12.9 10.6 14.4 8.8"/>',
  bed:
    '<path d="M9.62 4.86 A2 2 0 1 1 10.31 6.99 A2 2 0 1 1 8.5 8.3 A2 2 0 1 1 6.69 6.99 A2 2 0 1 1 7.38 4.86 A2 2 0 1 1 9.62 4.86 Z" class="f-rose"/>' +
    '<circle cx="8.5" cy="6.4" r="1" fill="currentColor" stroke="none"/><path d="M8.5 9.6 V15.5"/>' +
    '<path d="M8.5 13.2 C9.4 11.4 11.8 11 13 11.6 C12.1 13.2 10.1 13.8 8.5 13.2 Z" class="f-lawn"/>',
  hedge:
    '<path d="M2 13.5 V9.6 C2 7.1 4.6 6.1 6.1 7.3 C6.7 4.9 10.3 4.9 10.9 7.3 C12.4 6.1 15 7.1 15 9.6 V13.5 Z" class="f-lawn"/>' +
    '<path d="M2 15.6 H15"/>',
  tree: '<circle cx="8.5" cy="6.8" r="5" class="f-lawn"/><path d="M8.5 11.8 V15.6"/><path d="M8.5 11.8 V9.4 M8.5 10.4 L10.3 8.6"/>',
  pond:
    '<ellipse cx="8.5" cy="10" rx="7" ry="4.4" class="f-water"/><path d="M4.6 10 Q6.2 8.9 7.8 10 M9.4 11.7 Q11 10.6 12.6 11.7"/>' +
    '<path d="M12.6 6.4 V2.6 M14.4 7.4 V4.4"/>',
  canal:
    '<rect x="1.5" y="5" width="14" height="7" rx="0" class="f-water" stroke="none"/><path d="M1.5 5 H15.5 M1.5 12 H15.5"/>' +
    '<path d="M3 8.5 Q4.75 7.3 6.5 8.5 T10 8.5 T13.5 8.5"/>',
  bridge:
    '<path d="M1 13.6 Q3.25 12.4 5.5 13.6 T10 13.6 T14.5 13.6 L16 13.4 V16 H1 Z" class="f-water" stroke="none"/>' +
    '<path d="M1.5 10.4 Q8.5 6.4 15.5 10.4"/><path d="M2.6 7.2 Q8.5 3.2 14.4 7.2"/>' +
    '<path d="M4.6 9.1 V5.9 M8.5 8.4 V5.2 M12.4 9.1 V5.9"/><path d="M1 13.6 Q3.25 12.4 5.5 13.6 T10 13.6 T14.5 13.6"/>',
  bench:
    '<rect x="2.5" y="3.6" width="12" height="3" rx="1" class="f-gravel"/>' +
    '<rect x="2" y="8.4" width="13" height="2.6" rx="1" class="f-gravel"/>' +
    '<path d="M4.6 6.6 V8.4 M12.4 6.6 V8.4 M4 11 V14.6 M13 11 V14.6"/>',
  picnic: '<path d="M8.5 4.4 L15.5 9 L8.5 13.6 L1.5 9 Z" class="f-rose"/><path d="M5 6.7 L12 11.3 M12 6.7 L5 11.3"/>',
  lamp:
    '<path d="M8.5 5.4 V14.4"/><path d="M6.2 15.3 H10.8"/><path d="M4.6 7.3 Q8.5 5.3 12.4 7.3"/>' +
    '<circle cx="4.6" cy="5.6" r="1.5" class="f-gravel"/><circle cx="8.5" cy="3.6" r="1.6" class="f-gravel"/>' +
    '<circle cx="12.4" cy="5.6" r="1.5" class="f-gravel"/>',
  fountain:
    '<path d="M2 10.2 H15 L13.4 13.8 Q8.5 15.6 3.6 13.8 Z" class="f-water"/>' +
    '<path d="M8.5 10.2 V3.4 M8.5 3.4 Q5.4 3.4 4.7 8 M8.5 3.4 Q11.6 3.4 12.3 8"/>',
  kiosk:
    '<path d="M2.4 7.4 L4 3.4 H13 L14.6 7.4 Z" class="f-awning"/><path d="M6.6 3.4 L6.1 7.4 M8.5 3.4 V7.4 M10.4 3.4 L10.9 7.4"/>' +
    '<path d="M3.6 7.4 V15.2 H13.4 V7.4 M3.6 10.6 H13.4"/>',
  bandstand:
    '<path d="M1.8 7.6 Q6.4 6.6 8.5 2.6 Q10.6 6.6 15.2 7.6 Z" class="f-water"/><path d="M8.5 2.6 V1.2"/>' +
    '<path d="M3.6 7.6 V12 M7 7.6 V12 M10 7.6 V12 M13.4 7.6 V12"/>' +
    '<rect x="2" y="12" width="13" height="3.2" rx="0.6" class="f-gravel"/>',
  remove: '<circle cx="8.5" cy="8.5" r="6.4" class="f-awning"/><path d="M6 6 L11 11 M11 6 L6 11"/>',
};
const SVG_OPEN =
  '<svg viewBox="0 0 17 17" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">';

/** A tool's icon as inline SVG markup (04 12 item 12: inline markup, no file). */
export function toolIcon(id: ToolId): string {
  return SVG_OPEN + ICON[id] + '</svg>';
}

/** A big stamp or a run waiting for Place: the tapped tile, the payload's anchor, the run so far and its ghost. */
type Armed = { tool: ToolId; tile: XY; at: XY; run: XY[]; g: Ghost };

let group: Group = 'park';
let tool: ToolId = 'hand';
let armed: Armed | null = null;
let want = 1; // the dial's value while paused
let muted = false;
let row2Key = '';

export type RailHandlers = { onNew: () => void };

export function activeGroup(): Group {
  return group;
}
export function activeTool(): ToolId {
  return tool;
}
/** The class of the armed tool (02 8.2), for the tap routing and camera.ts's one-finger gesture. */
export function toolClass(): ToolClass {
  return toolById(tool).class;
}
/** The brush size of the #size slider, 1 to 3 (02 8.3). */
export function brushSize(): 1 | 2 | 3 {
  const v = parseInt(($('size') as HTMLInputElement).value, 10);
  return (v >= 1 && v <= 3 ? v : 1) as 1 | 2 | 3;
}
/** The live ghost draw.ts paints (phase 7), or null. */
export function armedGhost(): Ghost | null {
  return armed ? armed.g : null;
}

/* ---------- row 1: the switch and the Park strip (GV 11048-11061) ---------- */

/** Arm an ability (or disarm with null); ui/ability-strip.ts holds the arming and paints the chip. */
export function armAbility(id: AbilityId | null): void {
  setArmed(id);
}

function buildStrip(): void {
  const wrap = $('tools');
  wrap.replaceChildren();
  wrap.scrollLeft = 0;
  if (group !== 'park') {
    buildAbilityStrip(wrap, group);
    return;
  }
  endAbilityStrip();
  for (const d of TOOLS) {
    const b = document.createElement('button');
    b.className = 'tool park';
    b.type = 'button';
    b.dataset.id = d.id;
    b.setAttribute('aria-pressed', d.id === tool ? 'true' : 'false');
    const sw = document.createElement('span');
    sw.className = 'sw';
    sw.innerHTML = toolIcon(d.id);
    const lb = document.createElement('span');
    lb.className = 'lb';
    lb.textContent = t(d.labelKey);
    b.append(sw, lb);
    b.addEventListener('click', () => setTool(d.id));
    wrap.appendChild(b);
  }
  wrap.dispatchEvent(new Event('scroll')); // the edge masks
}

export function setGroup(g: Group): void {
  if (g !== group) setArmed(null); // an armed ability belongs to its strip
  group = g;
  document.querySelectorAll<HTMLButtonElement>('#groups button').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.group === g ? 'true' : 'false');
  });
  if (g !== 'park') {
    tool = 'hand'; // a park tool does not stay armed behind another group's strip
    armed = null;
  }
  buildStrip();
  paintRow2();
}

/** Arm a park tool (GV setTool 11063-11071): the pill pressed, a live ghost dropped, and the follow ended for every tool but the hand. */
export function setTool(id: ToolId): void {
  setArmed(null);
  tool = id;
  armed = null;
  document.querySelectorAll<HTMLButtonElement>('#tools .tool').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.id === id ? 'true' : 'false');
  });
  if (id !== 'hand') follow(null);
  paintRow2();
}

/* ---------- row 2: the context (04 5.4 item 4; GV updateGbar 11018, showUndo 11116) ---------- */

function show(el: HTMLElement | null, on: boolean): void {
  if (el && el.hidden === on) el.hidden = !on;
}

/** Row 2 for the group, the tool and the ghost; writes the DOM only when something changed. */
function paintRow2(): void {
  const cls = toolById(tool).class;
  const park = group === 'park';
  const live = armed !== null && (cls === 'stampBig' || cls === 'run');
  const refused = live && armed !== null && !armed.g.ok;
  const line = refused && armed?.g.reason ? t(armed.g.reason) : t(toolById(tool).labelKey);
  const key = [group, tool, live, refused, line, depth() === 0].join('|');
  if (key === row2Key) return;
  row2Key = key;
  show(document.querySelector<HTMLElement>('#row2 .ctx'), park && tool !== 'hand');
  show($('sizewrap'), park && cls === 'brush');
  show($('bPlace'), park && live);
  show($('bCancel'), park && live);
  show($('bUndo'), park);
  const d = $('depth');
  d.textContent = line;
  d.classList.toggle('no', refused);
  ($('bPlace') as HTMLButtonElement).disabled = !live || refused;
  ($('bUndo') as HTMLButtonElement).disabled = depth() === 0;
  layoutOverlays();
}

/** The payload of the armed ghost, for the `tool` command (03 5.1). */
function enqueueArmed(a: Armed): void {
  if (a.tool === 'hedge' || a.tool === 'canal') enqueue({ side: 'park', kind: 'tool', payload: { tool: a.tool, tiles: a.run.map((p) => ({ x: p.x, y: p.y })) } });
  else if (a.tool === 'picnic' || a.tool === 'fountain' || a.tool === 'kiosk' || a.tool === 'bandstand' || a.tool === 'bridge')
    enqueue({ side: 'park', kind: 'tool', payload: { tool: a.tool, at: { x: a.at.x, y: a.at.y } } });
}

/** Place (or the second tap on the same tile): an ok ghost is enqueued and the ghost goes; a red one toasts its reason and stays. */
export function placeGhost(): void {
  const a = armed;
  if (!a) return;
  if (!a.g.ok) {
    toast(a.g.reason ?? 'reason.not_here');
    return;
  }
  enqueueArmed(a);
  armed = null;
  paintRow2();
}

export function cancelGhost(): void {
  armed = null;
  paintRow2();
}

/** The north-west tile of a w x h stamp tapped at `tile`: the tap is the footprint's centre tile, or the one north-west of centre. */
function anchor(id: ToolId, tile: XY): XY {
  const fp = toolById(id).footprint;
  if (fp.kind !== 'rect') return { x: tile.x, y: tile.y };
  return { x: tile.x - Math.floor((fp.w - 1) / 2), y: tile.y - Math.floor((fp.h - 1) / 2) };
}

/**
 * A tap with a big stamp or a run armed (03 8.2 item 3; 02 8.2): a second tap on the tile of the last one places; otherwise a big stamp
 * shows its ghost at the tile, and a run adds the straight segment to the tap (a tap off the line toasts the reason and keeps the run).
 */
export function tapGhost(tile: XY): void {
  const cls = toolById(tool).class;
  if (cls !== 'stampBig' && cls !== 'run') return;
  if (armed && armed.tool === tool && armed.tile.x === tile.x && armed.tile.y === tile.y) {
    placeGhost();
    return;
  }
  if (cls === 'stampBig') {
    const at = anchor(tool, tile);
    armed = { tool, tile, at, run: [], g: ghost(tool, at) };
  } else {
    const run = armed && armed.tool === tool ? armed.run : [];
    const g = ghost(tool, tile, { run });
    if (!g.ok && g.reason === 'reason.straight_line') {
      toast(g.reason);
      return;
    }
    armed = { tool, tile, at: tile, run: g.ok ? g.tiles : run, g };
  }
  paintRow2();
}

/** Check the armed ghost against the world as it is now (the stamp's own tiles, or the run with its last tap). */
function recheck(): void {
  const a = armed;
  if (!a) return;
  if (toolById(a.tool).class === 'stampBig') {
    a.g = ghost(a.tool, a.at);
  } else if (a.g.ok) {
    // the run's last tile against the run before it: the same tiles, checked again (its last two tiles are neighbours)
    a.g = ghost(a.tool, a.run[a.run.length - 1] ?? a.tile, { run: a.run.slice(0, -1) });
  } else {
    const g = ghost(a.tool, a.tile, { run: a.run }); // the refused tap again: the run grows by it once it is good
    if (g.ok) a.run = g.tiles;
    a.g = g;
  }
}

/* ---------- row 3 and the wiring (GV 12134-12198) ---------- */

function showSpeed(): void {
  $('spdLbl').textContent = T.speed > 0 ? t('rail.speed', { n: want }) : t('rail.pause');
  $('bHalt').setAttribute('aria-pressed', T.speed > 0 ? 'false' : 'true');
}

/** Re-read T.speed into the dial (after a `speed` command applied, a `#halt` start or a restore). */
export function syncSpeed(): void {
  const sr = $('spdR') as HTMLInputElement;
  if (T.speed > 0) want = T.speed;
  sr.value = String(want);
  showSpeed();
}

function speedCmd(v: number): void {
  enqueue({ side: 'park', kind: 'speed', payload: { speed: Math.max(0, Math.min(8, Math.round(v))) as Dial } });
}

/** Row 1's three hint chips of the avatar mode (02 10.1 item 3): the possessed avatar's `hints` keys through t(); none outside the mode. */
function paintHints(): void {
  const box = $('hints'), d = AVATARS.find((o) => o.id === getAvatar());
  if (!d || !document.body.classList.contains('avatar')) {
    box.replaceChildren();
    return;
  }
  box.dataset.side = d.side;
  box.replaceChildren(
    ...d.hints.map((k) => {
      const c = document.createElement('span');
      c.className = 'hc';
      c.textContent = t(k);
      return c;
    }),
  );
}

/**
 * hud.ts calls this once body.avatar follows the sim's mode: the button is pressed and says Creator while the mode lasts, entering disarms
 * the Park tool, the ability and the ghost (the hand is the tool; the strips are hidden, 04 5.4 item 6), and the hint chips are filled.
 */
export function syncMode(): void {
  const avatar = document.body.classList.contains('avatar');
  $('bMode').setAttribute('aria-pressed', avatar ? 'true' : 'false');
  if (avatar) setTool('hand'); // also disarms an ability and drops a live ghost
  paintLabels();
  layoutOverlays();
}

function paintLabels(): void {
  $('bMute').textContent = t(muted ? 'rail.sound_off' : 'rail.sound_on');
  const avatar = document.body.classList.contains('avatar');
  $('bMode').textContent = t(avatar ? 'rail.creator' : 'rail.be_someone');
  paintHints();
  if (group === 'park') {
    document.querySelectorAll<HTMLElement>('#tools .tool').forEach((b) => {
      const lb = b.querySelector('.lb');
      if (lb && b.dataset.id) lb.textContent = t(toolById(b.dataset.id as ToolId).labelKey);
    });
  } else updateAbilityStrip(); // the pills and the chip in the new language
  row2Key = '';
  paintRow2();
  showSpeed();
}

export function buildRail(h: RailHandlers): void {
  document.querySelectorAll<HTMLButtonElement>('#groups button').forEach((b) => {
    b.addEventListener('click', () => setGroup((b.dataset.group as Group) || 'park'));
  });
  setGroup('park');

  // the strip's edge masks (GV 11059-11061)
  const wrap = $('tools');
  const more = (): void => {
    wrap.classList.toggle('more', wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 6);
    wrap.classList.toggle('before', wrap.scrollLeft > 6);
  };
  wrap.addEventListener('scroll', more, { passive: true });
  window.addEventListener('resize', more);
  setTimeout(more, 50);

  $('bPlace').addEventListener('click', placeGhost);
  $('bCancel').addEventListener('click', cancelGhost);
  $('bUndo').addEventListener('click', () => enqueue({ side: 'park', kind: 'undo', payload: {} }));

  // the speed: a dial from 1x to 8x, and a pause that remembers where the dial was (GV 12134-12140), through `speed` (03 4.6)
  const sr = $('spdR') as HTMLInputElement;
  sr.addEventListener('input', () => {
    want = parseInt(sr.value, 10) || 1;
    if (T.speed > 0) speedCmd(want); // while paused the dial only moves; the pause button resumes at it
    showSpeed();
  });
  $('bHalt').addEventListener('click', () => speedCmd(T.speed > 0 ? 0 : want));

  $('bRotL').addEventListener('click', () => turn(-1));
  $('bRotR').addEventListener('click', () => turn(1));
  // Fit is the camera's two-way toggle: the whole park, then back to the start view (GV 12151-12154)
  $('bFit').addEventListener('click', () => toast(fitToggle() === 'whole' ? 'toast.fit' : 'toast.start'));

  const bm = $('bMute');
  bm.addEventListener('click', () => {
    muted = !muted;
    bm.setAttribute('aria-pressed', muted ? 'true' : 'false');
    paintLabels();
  });

  // Be someone opens the picker; Creator lets the actor go (the `mode` event then drops body.avatar: hud.ts)
  $('bMode').addEventListener('click', () => {
    const a = getAvatar();
    if (getMode() === 'avatar' && a) {
      enqueue({ side: AVATAR_SIDE[a], kind: 'avatar.leave', payload: {} }); // applies at once, a paused park included (03 4.6)
    } else toggleSheet('picker');
  });

  $('bPhoto').addEventListener('click', () => {
    closeSheets();
    setBodyClass('photo', true);
  });
  $('photoX').addEventListener('click', () => setBodyClass('photo', false));
  $('bNew').addEventListener('click', h.onNew);
  $('bOptions').addEventListener('click', () => toggleSheet('options'));

  onLang(paintLabels);
  syncSpeed();
  paintLabels();
}

/** Every frame: the armed ghost checked against the world, Undo's state, row 2 (writes only on a change). */
export function updateRail(_dtr: number): void {
  recheck();
  paintRow2();
  updateAbilityStrip(); // a tier reached rebuilds the pills; the cooldown chip (04 5.4 item 4)
}
