// src/render/props-play.ts
// The two props of Mischief's tier 0 and 1 (m_sprinkler and m_peel; register section 4 row "S6 art and S5 poses", picked by Claude on the owner's
// delegation, 2026-10-20: "make your own judgement calls on style"): the sprinkler as the page's variant 1, the pop-up rotary (a short zinc
// riser with a brass head springing out of a ring of lifted turf, its arm turning once a second; the spray is fx-play.ts's), and the peel as
// its variant 2, the half-peeled banana (a banana lying on the path with its skin half off and two strips fallen open at one end).
// NEW, ported from the options page scratch/s6-options-water.ts (sprinklerItem, cyl) and scratch/s6-options-peel.ts (peelItem, strip, glint).
// Changes: the riser pops up over the first 0.4 s and sinks over the last 0.4 s of the prop's 10 s (02 9.3: "pops up ... t10: it sinks"); the
// banana is drawn on the ground in the prop's own frame from the game's pen; colours through the palette. Split out of props.ts (AGENTS rule 9).
import { TAU } from '../core/math.ts';
import { GC, fillEllipse, fillPoly, mix, shade, strokeLine, type Pen, type Proj, type Pt } from './ambient.ts';
import { TH, TW } from './camera.ts';
import type { Prop } from '../world/grid.ts';
import { SPRINKLER_LIFE, SPRINKLER_POP, sprinklerT } from './fx-play.ts';

const smooth = (u: number): number => {
  const k = Math.max(0, Math.min(1, u));
  return k * k * (3 - 2 * k);
};
/** A world circle of radius r tiles as screen semi-axes (rotation about the vertical keeps it an ellipse of these axes). */
const ellR = (z: number, r: number): { rx: number; ry: number } => ({ rx: r * Math.SQRT1_2 * TW * z, ry: r * Math.SQRT1_2 * TH * z });
const brass = (pen: Pen): string => mix(pen.spec.palette.lamp, pen.spec.palette.zinc, 0.45);

/** An upright cylinder of radius r tiles at (x, y) from e0 to e1 (EH): the side as a quad with a lit top. */
function cyl(pen: Pen, proj: Proj, x: number, y: number, r: number, e0: number, e1: number, hex: string, seed: number): void {
  const b = proj(x, y, e0), t = proj(x, y, e1), { rx, ry } = ellR(pen.z, r);
  const side: Pt[] = [{ x: b.x - rx, y: b.y }, { x: t.x - rx, y: t.y }, { x: t.x + rx, y: t.y }, { x: b.x + rx, y: b.y }];
  for (let i = 0; i <= 10; i++) side.push({ x: b.x + Math.cos(Math.PI * (i / 10)) * rx, y: b.y + Math.sin(Math.PI * (i / 10)) * ry });
  fillPoly(pen, side, hex, { light: 0.9, seed });
  fillEllipse(pen, t.x, t.y, rx, ry, hex, { light: 1.12, seed: seed + 1 });
}

/** The sprinkler (m_sprinkler variant 1, the pop-up rotary): a ring of lifted turf, the riser and its brass head, the arm turning once a second. */
export function drawSprinkler(pen: Pen, proj: Proj, p: Prop): void {
  const P = pen.spec.palette, z = pen.z, t = sprinklerT(p.untilTick);
  const up = smooth(t / SPRINKLER_POP) * smooth((SPRINKLER_LIFE / 60 - t) / SPRINKLER_POP);
  const g = proj(p.x, p.y, 0), { rx, ry } = ellR(z, 0.2);
  fillEllipse(pen, g.x, g.y, rx * 1.3, ry * 1.3, P.bedEarth, { light: 0.78, noInk: true, seed: 2 }); // the turf lifted round the riser
  if (up <= 0.02) return;
  cyl(pen, proj, p.x, p.y, 0.09, 0, 0.2 * up, P.zinc, 3);
  cyl(pen, proj, p.x, p.y, 0.07, 0.2 * up, 0.3 * up, brass(pen), 5);
  const th = t * TAU, nz = proj(p.x + Math.cos(th) * 0.1, p.y + Math.sin(th) * 0.1, 0.3 * up), c = proj(p.x, p.y, 0.3 * up);
  strokeLine(pen, [c, nz], brass(pen), Math.max(1.2, 1.8 * z), { open: true, seed: 7 });
}

/** The banana's skin colours: the yellow skin (`bedMarigold`), the pale inside (`paper` toward it) and the brown tip (`wicker` toward `ink`). */
const yel = (P: { bedMarigold: string }): string => P.bedMarigold;
const inside = (P: { paper: string; bedMarigold: string }): string => mix(P.paper, P.bedMarigold, 0.2);
const tipHex = (P: { wicker: string; ink: string }): string => mix(P.wicker, P.ink, 0.45);

/** One peel strip: a leaf shape from the stem (0, 0) out to len, widest a third along, a pale inside on the curled side, a brown tip. */
function strip(pen: Pen, len: number, w: number, ang: number, curl: number, showInside: boolean): void {
  const { ctx, z } = pen, P = pen.spec.palette;
  ctx.save();
  ctx.rotate(ang);
  const path = new Path2D();
  path.moveTo(0, 0);
  path.bezierCurveTo(len * 0.25, -w * 1.3 + curl, len * 0.7, -w * 0.9 + curl * 1.6, len, curl * 2);
  path.bezierCurveTo(len * 0.7, w * 0.9 + curl * 1.6, len * 0.25, w * 1.3 + curl, 0, 0);
  ctx.fillStyle = shade(showInside ? inside(P) : yel(P), 1);
  ctx.fill(path);
  if (showInside) {
    ctx.strokeStyle = shade(yel(P), 1);
    ctx.lineWidth = Math.max(1.2, 1.8 * z);
    ctx.lineJoin = 'round';
    ctx.stroke(path);
  }
  ctx.strokeStyle = GC(mix(P.bedMarigold, P.ink, 0.55), 0.8);
  ctx.lineWidth = Math.max(0.7, 0.8 * z);
  ctx.stroke(path);
  ctx.fillStyle = shade(tipHex(P), 1);
  ctx.beginPath();
  ctx.ellipse(len * 0.97, curl * 2, len * 0.07, w * 0.28, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = GC(showInside ? P.bedMarigold : mix(P.bedMarigold, P.paper, 0.5), 0.8);
  ctx.lineWidth = Math.max(0.6, 0.6 * z);
  ctx.beginPath();
  ctx.moveTo(len * 0.12, 0);
  ctx.quadraticCurveTo(len * 0.5, curl * 0.6, len * 0.85, curl * 1.8);
  ctx.stroke();
  ctx.restore();
}

/** The peel (m_peel variant 2, half-peeled): the banana lying on the tile whose centre is `g` on screen, two strips fallen open at one end. */
export function drawPeel(pen: Pen, g: Pt): void {
  const { ctx, z } = pen, P = pen.spec.palette, s = 13 * z; // half a tile's width in px
  ctx.fillStyle = GC(P.ink, 0.12); // a soft shadow
  ctx.beginPath();
  ctx.ellipse(g.x, g.y + 0.6 * z, s * 0.9, s * 0.35, 0, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.scale(1, 0.5);
  ctx.rotate(-0.2);
  const Lb = s * 1.1;
  ctx.save();
  ctx.translate(-s * 0.35, 0);
  const fruit = new Path2D();
  fruit.moveTo(-Lb * 0.5, 0);
  fruit.bezierCurveTo(-Lb * 0.3, -s * 0.38, Lb * 0.3, -s * 0.38, Lb * 0.5, -s * 0.02);
  fruit.bezierCurveTo(Lb * 0.3, s * 0.2, -Lb * 0.3, s * 0.2, -Lb * 0.5, 0);
  ctx.fillStyle = shade(inside(P), 1);
  ctx.fill(fruit);
  ctx.strokeStyle = GC(mix(P.bedMarigold, P.ink, 0.5), 0.8);
  ctx.lineWidth = Math.max(0.7, 0.8 * z);
  ctx.stroke(fruit);
  ctx.fillStyle = shade(yel(P), 1); // the skin still on the near half
  ctx.beginPath();
  ctx.moveTo(-Lb * 0.5, 0);
  ctx.bezierCurveTo(-Lb * 0.3, -s * 0.38, -Lb * 0.02, -s * 0.34, -Lb * 0.02, -s * 0.07);
  ctx.bezierCurveTo(-Lb * 0.1, s * 0.18, -Lb * 0.3, s * 0.2, -Lb * 0.5, 0);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(s * 0.15, -s * 0.03);
  strip(pen, s * 0.75, s * 0.2, 0.6, s * 0.06, true);
  strip(pen, s * 0.7, s * 0.2, -0.5, -s * 0.05, false);
  ctx.restore();
  ctx.restore();
  // a glint of shine (two `paper` strokes crossed)
  ctx.strokeStyle = GC(P.paper, 0.95);
  ctx.lineWidth = Math.max(0.8, 0.9 * z);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(g.x - s * 0.3 - 2.2 * z, g.y - s * 0.2);
  ctx.lineTo(g.x - s * 0.3 + 2.2 * z, g.y - s * 0.2);
  ctx.moveTo(g.x - s * 0.3, g.y - s * 0.2 - 2.2 * z);
  ctx.lineTo(g.x - s * 0.3, g.y - s * 0.2 + 2.2 * z);
  ctx.stroke();
}
