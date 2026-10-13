// src/render/ghost.ts
// Green and red tile panes for an armed big stamp or run, the ability target square, the selection ring, the focus pin (03 2.7, 7.8 items 3, 4).
// Ported from GV 6037-6049 (drawGhost: one pane per tile, filled and stroked green when the ghost is ok, red otherwise, line width
// max(1, 1.2 z), round joins). Verdict: PORT. Changes: the ghost is play/tools.ts Ghost (03 2.6), handed in by draw.ts's phase 7 from
// the rail's armed ghost (render cannot import ui, 03 2.1); the ground is flat and ponds sit at e = 0, so the panes need no water
// surface (GV 6043-6045); the colours come from direction A's palette in ambient.ts (lawn and awning red, eased toward white for the
// fill and toward night for the line) instead of GV's rgba literals (04 4.5), unlit, so the panes read the same by night.
// Dropped from the range: PB.tiles as a fallback list (6039: a run's tiles are already the ghost's tiles), wetD and SEAC (6043).
// TODO(S6): the armed area ability's square at alpha 0.25 in the side's accent (03 7.8 item 3). TODO(S4): the selection ring (GV 8435)
// under the selected figure. TODO(S5): the focus pin for 5.2 s after goToEvent (GV drawFocusMark 10764).
import { css, hx, mixc, type XY } from '../core/math.ts';
import type { Ghost } from '../play/tools.ts';
import { WHITE, style } from './ambient.ts';
import { cam } from './camera.ts';
import { screenInto } from './project.ts';

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

/** The focus pin at an event's place for 5.2 s after goToEvent (GV drawFocusMark 10764). S5 fills it. */
export function drawFocusMark(): void {
  // TODO(S5)
}

/** The selection ring under the selected figure (GV 8435). S4 fills it with figures to ring. */
export function drawSelection(): void {
  // TODO(S4)
}
