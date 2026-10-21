// src/render/ghost.ts
// Green and red tile panes for an armed big stamp or run, the ability target square, the selection ring, the focus pin (03 2.7, 7.8 items 3, 4).
// Ported from GV 6037-6049 (drawGhost: one pane per tile, filled and stroked green when the ghost is ok, red otherwise, line width
// max(1, 1.2 z), round joins). Verdict: PORT. Changes: the ghost is play/tools.ts Ghost (03 2.6), handed in by draw.ts's phase 7 from
// the rail's armed ghost (render cannot import ui, 03 2.1); the ground is flat and ponds sit at e = 0, so the panes need no water
// surface (GV 6043-6045); the colours come from direction A's palette in ambient.ts (lawn and awning red, eased toward white for the
// fill and toward night for the line) instead of GV's rgba literals (04 4.5), unlit, so the panes read the same by night.
// Dropped from the range: PB.tiles as a fallback list (6039: a run's tiles are already the ghost's tiles), wetD and SEAC (6043).
// S4 part C: the selection ring, ported from GV 8435-8440 (the soft pulsing ring at the feet of the one followed, so it is found in a
// crowd and at night): an ellipse 1.5 z below the ground point, radii 0.40 h + 1.2 z t and 0.16 h + 0.6 z t, stroked at alpha 0.5 + 0.25 t
// and filled at 0.10, line width max(1, 1.2 z), t = 0.5 + 0.5 sin(4 x seconds). ADAPT: in direction A's `paper` (04 7.1 rule 9) unlit,
// where GV stroked white; the pulse runs on sim seconds (T.abs x DAYLEN) where GV read the wall clock (GV `now`, 0.004 a ms), so a paused
// park holds still and a screenshot repeats (08 4.5); drawn in phase 7 over the scene (03 7.9) for whoever card.ts selected, which
// main.ts hands in (render cannot import ui, 03 2.1); h is the figure's drawn height (render/people.ts anchorOf). Dropped: 8435's
// avatar-mode skip (the possessed one wears no ring: S7).
// S5: the focus pin for 5.2 s after goToEvent (GV drawFocusMark 10764), timed on the frame clock (loop.ts now: a UI transition, 04 9.1).
// S6 (03 7.8 item 3): the armed area ability's square, marked by ui/ability-strip.ts at each tap (setAimMark) and drawn by phase 7 at alpha
// 0.25 in the side's accent: the palette's rose for Cupid (the --berry of tokens.css) and lamp amber for Mischief (--ember), the fill with a
// hairline of the same colour at 0.55; it stands 3 s of the frame clock (UI time, like the focus pin) and fades over the last 0.6 s.
// S6 art (register section 4 "S6 art and S5 poses": ring 3, the rose glow, picked by Claude on the owner's delegation, 2026-10-20; scratch/
// s6-options-ring.ts; 04 7.1 rule 9, 7.3 item 4): the featured pair, or the pinned one, wears a soft rose pool under each member, bigger than
// the figure, with three gold twinkles turning round it, so the eye finds them in a crowd, at Fit and at night; unlit like the selection ring
// (a marker is not dimmed by the dark), a drawable just under its member in the painter order, and not on the member the selection ring is on:
// the ring replaces that glow and the partner keeps its own (featuredDrawables; owner 2026-10-21). Floors on its size keep it findable at Fit (RING_MIN).
// S7 (07 S7.6 step 7; register section 4 row "Avatar picker and player ring", Claude's pick on the owner's delegation, 2026-10-21): the player ring,
// drawn instead of the selection ring for the possessed actor, a visitor or a creature (GV playerRing 9529-9535: a soft ring on the ground under the
// player's own gnome, so it is never lost in the crowd): two ellipses at the feet, the outer one `paper` at alpha 0.75 over a hairline of `ink` at 0.22 so
// it reads on a pale lawn, the inner one at 0.62 of it and alpha 0.45, a `paper` fill at 0.14; unlit, on sim seconds, a painter drawable just under the
// actor (phase 6) so it lies on the ground and the actor stands over its back arc. A pigeon in the air has it on the ground below. The avatar is never a Pair member (cameos never pair), so it never wears the featured glow too
// (featuredDrawables is told the possessed visitor as well).
import { DAYLEN, T } from '../core/clock.ts';
import { now } from '../core/loop.ts';
import { css, hx, mixc, type XY } from '../core/math.ts';
import type { Ghost } from '../play/tools.ts';
import { byId } from '../entities/visitor.ts';
import { creatureById } from '../entities/creatures.ts';
import { getAvatar, getMode, getPlayer } from '../play/mode.ts';
import { featured } from '../entities/romance.ts';
import { WHITE, lampGlow, style } from './ambient.ts';
import { EH, cam } from './camera.ts';
import { screenInto } from './project.ts';
import { anchorOf, type Anchor } from './people.ts';
import { depthOf, type Drawable } from './order.ts';
import { view } from './camera.ts';
import { star } from './romance-fx.ts';

export type { Ghost };

/** The pane colours (GV 6040: fill alpha 0.42, line alpha 0.9), from the palette once. */
type Panes = { okFill: string; okLine: string; noFill: string; noLine: string };
let panes: Panes | null = null;
function colours(): Panes {
  if (panes) return panes;
  const p = style().palette, lawn = hx(p.lawn), red = hx(p.awningRed), night = hx(p.night);
  panes = {
    okFill: css(mixc(lawn, WHITE, 0.5), 0.6),
    okLine: css(mixc(lawn, night, 0.45), 0.9),
    noFill: css(mixc(red, WHITE, 0.2), 0.42),
    noLine: css(mixc(red, night, 0.25), 0.9),
  };
  return panes;
}

const A: XY = { x: 0, y: 0 }, B: XY = { x: 0, y: 0 }, C: XY = { x: 0, y: 0 }, D: XY = { x: 0, y: 0 };

/** The armed tool's ghost panes over its tiles (GV drawGhost 6037-6049), in CSS pixels; null or an empty ghost draws nothing. */
export function drawGhost(c: CanvasRenderingContext2D, g: Ghost | null): void {
  if (!g || g.tiles.length === 0) return;
  const k = colours();
  c.fillStyle = g.ok ? k.okFill : k.noFill;
  c.strokeStyle = g.ok ? k.okLine : k.noLine;
  c.lineWidth = Math.max(1, 1.2 * cam.z);
  c.lineJoin = 'round';
  for (const t of g.tiles) {
    // tile (x, y) spans x +- 0.5 and y +- 0.5 (project.ts screenToTile); the four corners at ground level
    screenInto(t.x - 0.5, t.y - 0.5, 0, A);
    screenInto(t.x + 0.5, t.y - 0.5, 0, B);
    screenInto(t.x + 0.5, t.y + 0.5, 0, C);
    screenInto(t.x - 0.5, t.y + 0.5, 0, D);
    c.beginPath();
    c.moveTo(A.x, A.y);
    c.lineTo(B.x, B.y);
    c.lineTo(C.x, C.y);
    c.lineTo(D.x, D.y);
    c.closePath();
    c.fill();
    c.stroke();
  }
}

/** The focus pin's life (GV goToEvent 10764: until now + 5200) and its bob (04 9.1: 3 px at 0.8 Hz). */
export const FOCUS_MS = 5200;
let mark: { x: number; y: number; until: number } | null = null;
const MP: XY = { x: 0, y: 0 };

/** The Events sheet flew to a place (ui/sheets.ts goToEvent): the pin stands over tile (x, y) for 5.2 s of the frame clock (UI time). */
export function setFocusMark(x: number, y: number): void {
  mark = { x, y, until: now() + FOCUS_MS };
}
export function focusMark(): Readonly<{ x: number; y: number; until: number }> | null {
  return mark;
}

/**
 * The focus pin (GV drawFocusMark 10764-10773): an ink teardrop with a paper dot in the air over the event's place, fading in over 0.25 s
 * and out over the last 0.7 s, bobbing 3 px at 0.8 Hz (04 5.6, 9.1). ADAPT: direction A's ink and paper (04 4.5) where GV wrote rgba
 * literals; 12 px above the ground point (GV's place height), the ground being flat.
 */
export function drawFocusMark(c: CanvasRenderingContext2D | null = null): void {
  const m = mark;
  if (!m || !c) return;
  const t = now(), left = m.until - t;
  if (left <= 0 || left > FOCUS_MS + 800) {
    mark = null;
    return;
  }
  const a = Math.min(1, left / 700) * Math.min(1, (FOCUS_MS - left) / 250);
  const bob = Math.sin((t / 1000) * Math.PI * 2 * 0.8) * 3;
  screenInto(m.x, m.y, 0, MP);
  const x = MP.x, y = MP.y - 12 * cam.z - 10 - bob, s = 7;
  const P = style().palette;
  c.save();
  c.globalAlpha = Math.max(0, a);
  c.fillStyle = css(hx(P.ink), 0.9);
  c.beginPath();
  c.moveTo(x, y + s * 1.3);
  c.lineTo(x - s * 0.72, y + s * 0.1);
  c.lineTo(x + s * 0.72, y + s * 0.1);
  c.closePath();
  c.fill();
  c.beginPath();
  c.arc(x, y - s * 0.3, s * 0.95, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = P.paper;
  c.beginPath();
  c.arc(x, y - s * 0.3, s * 0.38, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** The armed area ability's square (03 7.8 item 3): alpha 0.25 in the side's accent, 3 s, the last 0.6 s fading. */
export const AIM_MS = 3000;
export const AIM_FADE_MS = 600;
export const AIM_ALPHA = 0.25;
export type AimSide = 'cupid' | 'mischief';
let aim: { x: number; y: number; r: number; side: AimSide; until: number } | null = null;

/** ui/ability-strip.ts: the tap at tile (x, y) with an `area` ability armed; r is the square's half-width (3 x 3 is 1). */
export function setAimMark(x: number, y: number, r: number, side: AimSide): void {
  aim = { x, y, r, side, until: now() + AIM_MS };
}
export function clearAimMark(): void {
  aim = null;
}
export function aimMark(): Readonly<{ x: number; y: number; r: number; side: AimSide; until: number }> | null {
  return aim;
}

/** The square over tiles x - r .. x + r, y - r .. y + r at ground level, filled at AIM_ALPHA with a hairline; nothing once it has expired. */
export function drawAimMark(c: CanvasRenderingContext2D): void {
  const m = aim;
  if (!m) return;
  const left = m.until - now();
  if (left <= 0) {
    aim = null;
    return;
  }
  const a = AIM_ALPHA * Math.min(1, left / AIM_FADE_MS);
  const p = style().palette, col = hx(m.side === 'cupid' ? p.rose : p.lamp);
  const lo = -m.r - 0.5, hi = m.r + 0.5;
  screenInto(m.x + lo, m.y + lo, 0, A);
  screenInto(m.x + hi, m.y + lo, 0, B);
  screenInto(m.x + hi, m.y + hi, 0, C);
  screenInto(m.x + lo, m.y + hi, 0, D);
  c.beginPath();
  c.moveTo(A.x, A.y);
  c.lineTo(B.x, B.y);
  c.lineTo(C.x, C.y);
  c.lineTo(D.x, D.y);
  c.closePath();
  c.fillStyle = css(col, a);
  c.fill();
  c.strokeStyle = css(col, Math.min(1, a * 2.2));
  c.lineWidth = Math.max(1, 1.2 * cam.z);
  c.lineJoin = 'round';
  c.stroke();
}

const RING: Anchor = { x: 0, y: 0, gx: 0, gy: 0, h: 0, e: 0, sit: false };

/** The selection ring at the feet of visitor `id` (GV 8435-8440), in CSS pixels; 0 or a visitor who has left draws nothing. */
export function drawSelection(c: CanvasRenderingContext2D, id: number): void {
  const v = id ? byId(id) : undefined;
  if (!v) return;
  anchorOf(v, RING);
  const z = cam.z, h = RING.h, t = 0.5 + 0.5 * Math.sin(T.abs * DAYLEN * 4);
  const paper = hx(style().palette.paper);
  c.strokeStyle = css(paper, 0.5 + 0.25 * t);
  c.lineWidth = Math.max(1, 1.2 * z);
  c.beginPath();
  c.ellipse(RING.gx, RING.gy + 1.5 * z, h * 0.4 + 1.2 * z * t, h * 0.16 + 0.6 * z * t, 0, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = css(paper, 0.1);
  c.fill();
}

/* ---------- the player ring (07 S7.6 step 7; GV playerRing 9529) ---------- */

/** The ring's floor (px, outer radius across) so it still reads at Fit, and its radii as fractions of a figure's height or a creature's EH. */
export const PLAYER_RING_MIN = 9, PLAYER_RING_VISITOR = 0.5, PLAYER_RING_PIGEON = 0.42, PLAYER_RING_POM = 0.4;
/** The id of the possessed visitor (the flower seller), 0 when the actor is a creature or there is no avatar mode. */
export function playerVisitorId(): number {
  const a = getAvatar();
  return getMode() === 'avatar' && a === 'a_florist' ? getPlayer() : 0;
}
/** Is the avatar mode on (so draw.ts leaves the selection ring out, whether or not the actor is on screen)? */
export function avatarRingOn(): boolean {
  return getMode() === 'avatar' && getAvatar() !== null;
}

type PlayerRingD = Drawable & { gx: number; gy: number; r: number };
const PLAYER_RING: PlayerRingD = { depth: 0, kind: 'ring', id: 0, x: 0, y: 0, z: 0, draw: drawPlayerRing, gx: 0, gy: 0, r: 0 };
const PLAYER_OUT: Drawable[] = [];

/**
 * The player's ring as a painter drawable, a hair before the actor's own (phase 6), so it lies on the ground under the actor and its legs and
 * body stand over the back of it, as GV's playerRing was drawn under the gnome; none when the avatar mode is off, the actor is gone (a creature
 * waiting outside, a visitor who left) or off screen. Reused each frame.
 */
export function playerDrawables(): Drawable[] {
  PLAYER_OUT.length = 0;
  const a = getAvatar(), id = getPlayer();
  if (getMode() !== 'avatar' || !a || id === 0) return PLAYER_OUT;
  const z = cam.z, d = PLAYER_RING;
  if (a === 'a_pigeon' || a === 'a_pomeranian') {
    const cr = creatureById(id);
    if (!cr || cr.outside) return PLAYER_OUT;
    screenInto(cr.x, cr.y, 0, MP);
    d.gx = MP.x;
    d.gy = MP.y;
    d.r = (a === 'a_pigeon' ? PLAYER_RING_PIGEON : PLAYER_RING_POM) * EH * z;
    d.x = cr.x;
    d.y = cr.y;
  } else {
    const v = byId(id);
    if (!v) return PLAYER_OUT;
    anchorOf(v, RING);
    d.gx = RING.gx;
    d.gy = RING.gy;
    d.r = PLAYER_RING_VISITOR * RING.h;
    d.x = v.x;
    d.y = v.y;
  }
  d.r = Math.max(d.r, PLAYER_RING_MIN);
  const m = d.r + 12;
  if (d.gx < -m || d.gx > view.cw + m || d.gy < -m || d.gy > view.chh + m) return PLAYER_OUT;
  d.depth = depthOf(d.x, d.y) - 0.02;
  PLAYER_OUT.push(d);
  return PLAYER_OUT;
}

/** The ring itself: `paper` at 0.75 over a hairline of `ink` at 0.22, an inner ring at 0.45, a faint fill, pulsing 6 % on sim seconds. */
function drawPlayerRing(dr: Drawable, c: CanvasRenderingContext2D): void {
  const d = dr as PlayerRingD, z = cam.z, P = style().palette, paper = hx(P.paper), ink = hx(P.ink);
  const t = 0.5 + 0.5 * Math.sin(T.abs * DAYLEN * 3);
  const R = d.r * (1 + 0.06 * t), lw = Math.max(1.4, 1.6 * z), y = d.gy + 1.5 * z;
  c.save();
  c.fillStyle = css(paper, 0.14);
  c.beginPath();
  c.ellipse(d.gx, y, R, R * 0.42, 0, 0, Math.PI * 2);
  c.fill();
  c.lineJoin = 'round';
  c.lineWidth = lw + 2;
  c.strokeStyle = css(ink, 0.22);
  c.stroke();
  c.lineWidth = lw;
  c.strokeStyle = css(paper, 0.75);
  c.stroke();
  c.beginPath();
  c.ellipse(d.gx, y, R * 0.62, R * 0.62 * 0.42, 0, 0, Math.PI * 2);
  c.lineWidth = Math.max(1, 1.1 * z);
  c.strokeStyle = css(paper, 0.45);
  c.stroke();
  c.restore();
}

/* ---------- the featured pair's rose glow (04 7.1 rule 9; ring 3) ---------- */
type RingD = Drawable & { gx: number; gy: number; h: number; k: number };
const FR_POOL: RingD[] = [];
const FR_OUT: Drawable[] = [];
const FPEN = { ctx: null as unknown as CanvasRenderingContext2D, spec: style(), z: 1 };

/**
 * Floors of the glow's pool radius, the twinkles' orbit and the twinkles' size, in px: they act only at far zoom (below about 1.2), see drawRing.
 * Raised in S7 (owner 2026-10-21, "the featured pair's glow strengthened at Fit": 14, 6.5 and 1.8 before): at Fit a figure is 6.6 px tall and the
 * pool now measures 18 px, the orbit 10, a twinkle 2. Each stays under the figure-scaled value at 1.3 even for an elder (0.95 h: 25.8, 13.6 and
 * 2.04 px; an adult's are 27.2, 14.3 and 2.15), so 1.3 and 2.4 draw as before; the twinkle floor crosses an adult's value at about 1.2.
 */
export const RING_MIN = 18, RING_ORBIT_MIN = 10, RING_STAR_MIN = 2;
/**
 * The glow's pool of radius R px at the feet: `rose` from 0.85 at the middle to 0, flattened to 0.42, and three `lamp` twinkles turning round
 * it. R is 0.95 h, the orbit 0.5 h and a twinkle 0.075 h, each with a floor, so that at Fit, where a figure is 8 px tall, the pair is still a
 * pink pool with gold sparks that the eye finds; at 1.3 and closer the floors do nothing and the drawing is what it was.
 */
function drawRing(d: Drawable, c: CanvasRenderingContext2D): void {
  const r = d as RingD, z = cam.z, P = style().palette, rose = hx(P.rose), R = Math.max(r.h * 0.95, RING_MIN);
  c.save();
  c.translate(r.gx, r.gy + z);
  c.scale(1, 0.42);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
  g.addColorStop(0, css(rose, 0.85 * r.k));
  g.addColorStop(0.55, css(rose, 0.5 * r.k));
  g.addColorStop(1, css(rose, 0));
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, R, 0, Math.PI * 2);
  c.fill();
  c.restore();
  FPEN.ctx = c;
  FPEN.spec = style();
  FPEN.z = z;
  const t = T.abs * DAYLEN * 0.9, orbit = Math.max(r.h * 0.5, RING_ORBIT_MIN);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.6 + t;
    star(FPEN, r.gx + Math.cos(a) * orbit, r.gy + z + Math.sin(a) * orbit * 0.42, Math.max(RING_STAR_MIN, 0.075 * r.h), P.lamp, 0.9 + 0.1 * r.k, a);
  }
}

/**
 * The two rose glows of the featured pair as painter drawables, a hair before each member's own (phase 6): none for the member the selection
 * ring `sel` is on (the ring replaces its glow; the partner keeps its own, owner 2026-10-21), none off screen. `k` is 0.82 by day and 1 by night (lampGlow). Reused each frame.
 */
export function featuredDrawables(sel: number): Drawable[] {
  FR_OUT.length = 0;
  const p = featured();
  if (!p) return FR_OUT;
  const k = 0.82 + 0.18 * lampGlow();
  for (const id of [p.a, p.b]) {
    const v = id === sel ? undefined : byId(id); // the selected one wears the selection ring instead; the partner keeps its glow
    if (!v) continue;
    anchorOf(v, RING);
    const m = RING.h + 12;
    if (RING.gx < -m || RING.gx > view.cw + m || RING.gy < -m || RING.gy > view.chh + m) continue;
    const d = FR_POOL[FR_OUT.length] ?? (FR_POOL[FR_OUT.length] = { depth: 0, kind: 'ring', id: 0, x: 0, y: 0, z: 0, draw: drawRing, gx: 0, gy: 0, h: 0, k: 0 });
    d.depth = depthOf(v.x, v.y) - 0.02;
    d.x = v.x;
    d.y = v.y;
    d.gx = RING.gx;
    d.gy = RING.gy;
    d.h = RING.h;
    d.k = k;
    FR_OUT.push(d);
  }
  return FR_OUT;
}
