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
// TODO(S6): the armed area ability's square at alpha 0.25 in the side's accent (03 7.8 item 3). TODO(S5-art): the featured pair's rose
// ring on both members (04 7.1 rule 9, 7.3 item 4) waits for the owner's pick of the romance art.
import { DAYLEN, T } from '../core/clock.ts';
import { now } from '../core/loop.ts';
import { css, hx, mixc, type XY } from '../core/math.ts';
import type { Ghost } from '../play/tools.ts';
import { byId } from '../entities/visitor.ts';
import { WHITE, style } from './ambient.ts';
import { cam } from './camera.ts';
import { screenInto } from './project.ts';
import { anchorOf, type Anchor } from './people.ts';

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
