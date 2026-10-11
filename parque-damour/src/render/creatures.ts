// src/render/creatures.ts
// The pigeon (walking, flying) and the pomeranian (running, an item in its mouth) in the three treatments (04 7.4).
// Ported from GV 8575-8598 (drawBirdAt, drawBirdFlying: body, sheen, head, tail, beak, two-stroke wings), 8506-8530 (drawFox
// idea: legs as short strokes, ears as triangles, a collar). ADAPT: the pigeon's sheen is `teal`, the pomeranian is three fluff
// ellipses with a curled tail; the direction's brush draws every shape.
// TODO(S4): drawCreature(c, s) dispatch by kind and state, the walkers' dog (GV 8506), perched pigeons, culling by size.
import { EH } from './camera.ts';
import { GC, fillEllipse, fillPoly, inkLine, mix, shade, strokeLine, type Pen, type Pt } from './ambient.ts';

export type PigeonOpts = { face: 1 | -1; mode: 'walk' | 'fly'; phase: number };

/** A pigeon at ground point p; s is its size (0.18 EH z in the game, 04 7.4). */
export function drawPigeon(pen: Pen, p: Pt, o: PigeonOpts, s = 0.18 * EH * pen.z): void {
  const { ctx, spec, z } = pen;
  if (s < 1.6) return;
  const P = spec.palette;
  const thin = Math.max(0.6, 0.5 * z), jitterK = 0.4;
  const f = o.face;
  const ink = spec.line === 'ink';
  if (o.mode === 'fly') {
    // two-stroke wings flapping, the body a small ellipse under them (GV 8591-8597)
    const flap = Math.sin(o.phase * Math.PI * 2) * 0.9;
    const x = p.x, y = p.y;
    const wing: Pt[] = [{ x: x - s * 0.95, y: y - flap * s * 0.55 }, { x: x - s * 0.3, y: y - s * 0.05 }, { x, y: y + s * 0.1 }, { x: x + s * 0.3, y: y - s * 0.05 }, { x: x + s * 0.95, y: y - flap * s * 0.55 }];
    strokeLine(pen, wing, P.pigeon, Math.max(0.7, s * 0.22), { open: true, seed: 3, lineW: thin, jitterK });
    fillEllipse(pen, x, y + s * 0.05, s * 0.36, s * 0.22, P.pigeon, { gapless: true, seed: 4, lineW: thin, jitterK });
    fillEllipse(pen, x + f * s * 0.42, y - s * 0.02, s * 0.17, s * 0.17, P.pigeon, { gapless: true, seed: 5, lineW: thin, jitterK });
    beak(pen, x + f * s * 0.56, y - s * 0.02, f, s * 0.7);
    return;
  }
  // walking: the body bobs at 3 Hz and the head pecks (04 7.4)
  const bob = Math.sin(o.phase * Math.PI * 2 * 3) * s * 0.08;
  const peck = Math.max(0, Math.sin(o.phase * Math.PI * 2 * 3 + 1)) * s * 0.12;
  const x = p.x, y = p.y - s * 0.5 + bob;
  // feet first, under the body
  ctx.strokeStyle = GC(P.beak);
  ctx.lineWidth = Math.max(0.6, s * 0.09);
  ctx.lineCap = 'round';
  const step = Math.sin(o.phase * Math.PI * 2 * 3) * s * 0.18;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.12 + step, y + s * 0.3);
  ctx.lineTo(x - s * 0.1 + step * 1.2, y + s * 0.5);
  ctx.moveTo(x + s * 0.14 - step, y + s * 0.3);
  ctx.lineTo(x + s * 0.16 - step * 1.2, y + s * 0.5);
  ctx.stroke();
  // the tail, the body with a pale breast and a darker wing, the neck sheen, the head on a short neck (GV 8576-8580)
  strokeLine(pen, [{ x: x - f * s * 0.5, y }, { x: x - f * s * 1.05, y: y - s * 0.26 }], P.pigeon, Math.max(0.7, s * 0.24), { open: true, seed: 6, noInk: !ink, lineW: thin, jitterK });
  fillEllipse(pen, x, y, s * 0.64, s * 0.42, P.pigeon, { seed: 7, rim: true, away: false, lineW: thin, jitterK });
  fillEllipse(pen, x + f * s * 0.1, y + s * 0.1, s * 0.44, s * 0.24, mix(P.pigeon, P.paper, 0.35), { gapless: true, noInk: true, seed: 12 });
  fillEllipse(pen, x - f * s * 0.12, y - s * 0.08, s * 0.4, s * 0.2, P.pigeon, { light: 0.84, gapless: true, noInk: true, seed: 13 });
  fillEllipse(pen, x + f * s * 0.28, y - s * 0.14, s * 0.2, s * 0.14, P.teal, { alpha: 0.7, gapless: true, noInk: true, seed: 8 });
  const hx0 = x + f * s * 0.62, hy0 = y - s * 0.36 + peck;
  strokeLine(pen, [{ x: x + f * s * 0.4, y: y - s * 0.12 }, { x: hx0, y: hy0 }], P.pigeon, Math.max(1, s * 0.3), { open: true, noInk: true });
  fillEllipse(pen, hx0, hy0, s * 0.27, s * 0.27, P.pigeon, { seed: 9, gapless: true, rim: true, lineW: thin, jitterK });
  beak(pen, hx0 + f * s * 0.24, hy0 + s * 0.02, f, s);
  if (z >= 1.5) {
    ctx.fillStyle = GC(P.ink);
    ctx.beginPath();
    ctx.arc(hx0 + f * s * 0.08, hy0 - s * 0.06, Math.max(0.5, s * 0.055), 0, Math.PI * 2);
    ctx.fill();
  }
}

function beak(pen: Pen, x: number, y: number, f: number, s: number): void {
  const pts: Pt[] = [{ x, y: y - s * 0.08 }, { x: x + f * s * 0.24, y: y - s * 0.02 }, { x, y: y + s * 0.06 }];
  fillPoly(pen, pts, pen.spec.palette.beak, { gapless: true, seed: 11, lineW: Math.max(0.6, 0.5 * pen.z), jitterK: 0.3 });
}

export type PomOpts = { face: 1 | -1; running: boolean; phase: number; hatHex?: string | null };

/** The pomeranian at ground point p; s is its size (0.3 EH z in the game, 04 7.4). */
export function drawPomeranian(pen: Pen, p: Pt, o: PomOpts, s = 0.3 * EH * pen.z): void {
  const { ctx, spec, z } = pen;
  if (s < 2) return;
  const P = spec.palette;
  const [body, chest, ears] = P.pomeranian;
  const f = o.face;
  const stretch = o.running ? 1.15 : 1;
  const bounce = o.running ? Math.abs(Math.sin(o.phase * Math.PI * 2 * 4)) * s * 0.12 : 0;
  const x = p.x, y = p.y - s * 0.46 - bounce;
  const ink = spec.line === 'ink';
  const thin = Math.max(0.6, 0.5 * z), jitterK = 0.45;
  // legs: four short strokes at 8 Hz when running (04 7.4)
  const k = o.running ? Math.sin(o.phase * Math.PI * 2 * 8) : 0;
  const legW = Math.max(0.8, s * 0.11);
  const legs: Array<[number, number]> = [[-0.42, -k], [-0.28, k], [0.3, k], [0.44, -k]];
  for (const [lx, lk] of legs) {
    const top: Pt = { x: x + f * lx * s * stretch, y: y + s * 0.28 };
    const foot: Pt = { x: x + f * lx * s * stretch + f * lk * s * 0.22, y: p.y - bounce * 0.5 };
    strokeLine(pen, [top, foot], ears, legW, { open: true, seed: Math.round(lx * 100), noInk: !ink, lineW: thin, jitterK });
  }
  // the tail: a thick curled arc over the back
  const tail: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * 0.95 - (i / 8) * Math.PI * 1.35;
    tail.push({ x: x - f * s * 0.5 + Math.cos(a) * s * 0.26 * -f, y: y - s * 0.25 + Math.sin(a) * s * 0.26 });
  }
  strokeLine(pen, tail, body, Math.max(1.2, s * 0.22), { open: true, seed: 21, lineW: thin, jitterK });
  // three fluff ellipses: body, chest, head with ears
  if (spec.id === 'A') fluff(pen, x, y, s * 0.78 * stretch, s * 0.46, body, 23);
  fillEllipse(pen, x, y, s * 0.75 * stretch, s * 0.42, body, { seed: 24, rim: true, lineW: thin, jitterK });
  if (spec.id === 'B') fillEllipse(pen, x - f * s * 0.05, y + s * 0.14, s * 0.55 * stretch, s * 0.2, body, { light: 0.82, gapless: true });
  fillEllipse(pen, x + f * s * 0.38 * stretch, y + s * 0.08, s * 0.34, s * 0.3, chest, { seed: 25, gapless: true, noInk: true });
  const hx0 = x + f * s * 0.62 * stretch, hy0 = y - s * 0.22;
  const earL: Pt[] = [{ x: hx0 - f * s * 0.2, y: hy0 - s * 0.16 }, { x: hx0 - f * s * 0.26, y: hy0 - s * 0.46 }, { x: hx0 - f * s * 0.02, y: hy0 - s * 0.26 }];
  const earR: Pt[] = [{ x: hx0 + f * s * 0.04, y: hy0 - s * 0.26 }, { x: hx0 + f * s * 0.16, y: hy0 - s * 0.46 }, { x: hx0 + f * s * 0.24, y: hy0 - s * 0.14 }];
  fillPoly(pen, earL, ears, { seed: 26, gapless: true, lineW: thin, jitterK });
  fillPoly(pen, earR, ears, { seed: 27, gapless: true, lineW: thin, jitterK });
  if (spec.id === 'A') fluff(pen, hx0, hy0, s * 0.34, s * 0.32, body, 28);
  fillEllipse(pen, hx0, hy0, s * 0.32, s * 0.3, body, { seed: 29, gapless: true, rim: true, lineW: thin, jitterK });
  fillEllipse(pen, hx0 + f * s * 0.14, hy0 + s * 0.1, s * 0.16, s * 0.11, chest, { seed: 30, gapless: true, noInk: true });
  // the collar, the eyes and the nose
  strokeLine(pen, [{ x: hx0 - f * s * 0.14, y: hy0 + s * 0.24 }, { x: hx0 + f * s * 0.12, y: hy0 + s * 0.28 }], P.awningRed, Math.max(0.8, s * 0.07), { open: true, noInk: true });
  ctx.fillStyle = GC(P.ink);
  ctx.beginPath();
  ctx.arc(hx0 + f * s * 0.3, hy0 + s * 0.08, Math.max(0.6, s * 0.055), 0, Math.PI * 2);
  ctx.fill();
  if (z >= 1.2) {
    ctx.beginPath();
    ctx.arc(hx0 + f * s * 0.1, hy0 - s * 0.04, Math.max(0.5, s * 0.045), 0, Math.PI * 2);
    ctx.arc(hx0 - f * s * 0.1, hy0 - s * 0.05, Math.max(0.4, s * 0.035), 0, Math.PI * 2);
    ctx.fill();
  }
  // the snatched item in the mouth: a flat cap held by its brim (04 7.4)
  if (o.hatHex) {
    const mx = hx0 + f * s * 0.36, my = hy0 + s * 0.2;
    const cap: Pt[] = [{ x: mx, y: my }, { x: mx + f * s * 0.5, y: my + s * 0.04 }, { x: mx + f * s * 0.44, y: my + s * 0.22 }, { x: mx + f * s * 0.08, y: my + s * 0.3 }, { x: mx - f * s * 0.06, y: my + s * 0.16 }];
    fillPoly(pen, cap, o.hatHex, { seed: 31, gapless: true, lineW: thin, jitterK });
    fillPoly(pen, [{ x: mx + f * s * 0.44, y: my + s * 0.22 }, { x: mx + f * s * 0.62, y: my + s * 0.3 }, { x: mx + f * s * 0.5, y: my + s * 0.36 }, { x: mx + f * s * 0.1, y: my + s * 0.32 }], mix(o.hatHex, P.ink, 0.25), { seed: 32, gapless: true, lineW: thin, jitterK });
  }
  if (ink) {
    // a light fluffy scribble along the back
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 1.1 + (i / 5) * Math.PI * 0.8;
      const cx = x + Math.cos(a) * s * 0.72 * stretch, cy = y + Math.sin(a) * s * 0.4;
      inkLine(pen, [{ x: cx - s * 0.06, y: cy + s * 0.05 }, { x: cx + s * 0.03, y: cy - s * 0.07 }, { x: cx + s * 0.09, y: cy + s * 0.04 }], { open: true, seed: 40 + i, inkAlpha: 0.45, gapless: true, lineW: Math.max(0.6, 0.6 * z) });
    }
  }
}

/** Direction A's fluff: a ring of small soft discs round an ellipse so the dog reads as fur, not a bean. */
function fluff(pen: Pen, x: number, y: number, rx: number, ry: number, hex: string, seed: number): void {
  const { ctx } = pen;
  ctx.fillStyle = shade(hex, 0.94, 0.9);
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = Math.max(0.8, ry * 0.26) * (0.8 + ((seed * 7 + i * 13) % 5) * 0.08);
    const cx = x + Math.cos(a) * rx * 0.95, cy = y + Math.sin(a) * ry * 0.95;
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
  ctx.fill();
}
