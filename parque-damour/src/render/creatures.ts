// src/render/creatures.ts
// The creatures. For the game (direction A, 04 3.4): the pigeon in its five sim states walk, peck, perch, fly and scatter, and the walkers'
// two dogs, the white terrier (A) and the black poodle (B), one per dog walker by its lookSeed, on a 1 px `ink` lead, taut while they
// trot and slack while they stand (register section 4, Figure rig, 2026-10-13: "both dogs"; 04 7.2, 7.4; 07 S4.6 step 13), through the
// lamp warmth of the figures (03 7.3 item 5). Frozen for style-board.html (04 3.4): drawPigeon and drawPomeranian in the three treatments.
// Ported from GV 8575-8598 (drawBirdAt, drawBirdFlying: body, sheen, head, tail, beak, two-stroke wings; the flight arc), 8506-8530
// (drawFox: legs as short strokes, ears, a collar), by way of the options page the owner picked from (scratch/s4-options-creatures.ts).
// ADAPT: the pigeon's sheen is `teal`; a peck tips the body over its feet, a perch tucks the feet and settles the body, a scatter throws
// both wings up and the tail out; the dog is 0.45 EH (11.7 z px) with an `awningRed` collar: a Jack Russell (white, tan head and saddle)
// or a poodle in a continental clip (black, its clipped parts a shade lighter); creatures have no ink contour (04 3.2 row Line: figures
// only). Dropped from the range: GV's foxes, hares, deer, fish and bees as animals (the wasp is an effects.ts particle).
// S6 art (register section 4 "S6 art and S5 poses", picked by Claude on the owner's delegation, 2026-10-20; scratch/s6-options-pom.ts and
// -pigeon.ts): Pompon on the run in a rolling cloud of dust (run 3, "dust-cloud dash": puffs behind and under him, two speed lines, the dog
// over its top half) with what he has taken in his mouth (the hat, the purse, the baguette or the ice cream cone), and the m_pigeon swoop 1,
// the dive: the pigeon drawn 1.45 times its size so it reads, with three speed lines up its dive and the dropping let go as a paper bead.
import { EH } from './camera.ts';
import { GC, fillEllipse, fillPoly, inkLine, mix, shade, strokeLine, type Pen, type Pt } from './ambient.ts';
import { P2, ellPath, fillOf, inkOf, linePath, polyPath, softPath, type Ink } from './figure-rig.ts';
import { TAU } from '../core/math.ts';
import { h01 } from './romance-fx.ts';
import { bead, speedLines } from './fx-play.ts';

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

/* ---------- the game's pigeon in its five states and the walkers' two dogs (the picked options page) ---------- */

export type PigeonState = 'walk' | 'peck' | 'perch' | 'fly' | 'scatter';

/** A pigeon at ground or perch point p, facing f, in one of its five states; s = 0.18 EH z (04 7.4), culled under 1.6 px. */
export function drawPigeonState(c: Ink, p: Pt, f: 1 | -1, st: PigeonState, phase: number, s = 0.18 * EH * c.pen.z): void {
  const { ctx, z } = c.pen;
  const P = c.pen.spec.palette;
  if (s < 1.6) return;
  const fill = (path: Path2D, hex: string, k = 1, a?: number): void => {
    ctx.fillStyle = fillOf(c, hex, k, a);
    ctx.fill(path);
  };
  const stroke = (path: Path2D, hex: string, w: number, k = 1): void => {
    ctx.strokeStyle = fillOf(c, hex, k);
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(path);
  };
  const beakAt = (x: number, y: number, k: number): void => fill(polyPath([P2(x, y - s * 0.08 * k), P2(x + f * s * 0.24 * k, y - s * 0.02 * k), P2(x, y + s * 0.06 * k)]), P.beak);
  const eye = (x: number, y: number): void => {
    if (z < 1.5) return;
    ctx.fillStyle = inkOf(c, P.ink);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, s * 0.055), 0, Math.PI * 2);
    ctx.fill();
  };
  const breast = mix(P.pigeon, P.paper, 0.35);
  if (st === 'scatter') {
    // the take-off: the body tipped up, both wings thrown high, feet dangling, the tail fanned
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(f, 1);
    ctx.rotate(-0.55);
    const flap = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
    const wingL = new Path2D();
    wingL.moveTo(-s * 0.1, -s * 0.05);
    wingL.quadraticCurveTo(-s * 0.55, -s * (0.75 + flap * 0.3), -s * 0.2, -s * (1.15 + flap * 0.25));
    wingL.quadraticCurveTo(0, -s * 0.5, s * 0.15, -s * 0.05);
    fill(wingL, P.pigeon, 0.86);
    stroke(linePath([P2(-s * 0.05, s * 0.18), P2(-s * 0.1, s * 0.42)]), P.beak, Math.max(0.6, s * 0.08));
    stroke(linePath([P2(s * 0.08, s * 0.18), P2(s * 0.06, s * 0.42)]), P.beak, Math.max(0.6, s * 0.08));
    fill(polyPath([P2(-s * 0.5, -s * 0.02), P2(-s, -s * 0.2), P2(-s, s * 0.18)]), P.pigeon, 0.92);
    fill(ellPath(0, 0, s * 0.62, s * 0.36), P.pigeon);
    fill(ellPath(s * 0.12, s * 0.1, s * 0.42, s * 0.2), breast);
    fill(ellPath(s * 0.3, -s * 0.12, s * 0.2, s * 0.13), P.teal, 1, 0.7);
    fill(ellPath(s * 0.62, -s * 0.24, s * 0.26, s * 0.26), P.pigeon);
    fill(polyPath([P2(s * 0.84, -s * 0.3), P2(s * 1.06, -s * 0.24), P2(s * 0.84, -s * 0.18)]), P.beak);
    const wingR = new Path2D();
    wingR.moveTo(-s * 0.05, 0);
    wingR.quadraticCurveTo(-s * 0.2, -s * (0.85 + flap * 0.3), s * 0.25, -s * (1.25 + flap * 0.2));
    wingR.quadraticCurveTo(s * 0.25, -s * 0.5, s * 0.3, -s * 0.02);
    fill(wingR, P.pigeon, 1.04);
    eye(s * 0.68, -s * 0.3);
    ctx.restore();
    return;
  }
  if (st === 'fly') {
    // the board's two-stroke wings at 5 Hz on GV's arc (GV 8591-8597)
    const flap = Math.sin(phase * Math.PI * 2) * 0.9;
    stroke(linePath([P2(p.x - s * 0.95, p.y - flap * s * 0.55), P2(p.x - s * 0.3, p.y - s * 0.05), P2(p.x, p.y + s * 0.1), P2(p.x + s * 0.3, p.y - s * 0.05), P2(p.x + s * 0.95, p.y - flap * s * 0.55)]), P.pigeon, Math.max(0.7, s * 0.22));
    fill(ellPath(p.x, p.y + s * 0.05, s * 0.36, s * 0.22), P.pigeon);
    fill(ellPath(p.x + f * s * 0.42, p.y - s * 0.02, s * 0.17, s * 0.17), P.pigeon);
    beakAt(p.x + f * s * 0.56, p.y - s * 0.02, 0.7);
    return;
  }
  if (st === 'perch') {
    // perched on a rail: feet tucked, a rounder body settled on the perch, the head drawn in
    const x = p.x, y = p.y - s * 0.32;
    stroke(linePath([P2(x - f * s * 0.45, y + s * 0.05), P2(x - f * s * 0.92, y + s * 0.32)]), P.pigeon, Math.max(0.7, s * 0.26), 0.92);
    fill(ellPath(x, y, s * 0.6, s * 0.4), P.pigeon);
    fill(ellPath(x + f * s * 0.12, y + s * 0.12, s * 0.42, s * 0.24), breast);
    fill(ellPath(x - f * s * 0.14, y - s * 0.06, s * 0.42, s * 0.2), P.pigeon, 0.84);
    fill(ellPath(x + f * s * 0.3, y - s * 0.16, s * 0.2, s * 0.14), P.teal, 1, 0.7);
    const hx = x + f * s * 0.5, hy = y - s * 0.3;
    fill(ellPath(hx, hy, s * 0.26, s * 0.26), P.pigeon);
    beakAt(hx + f * s * 0.22, hy + s * 0.03, 0.9);
    eye(hx + f * s * 0.08, hy - s * 0.05);
    return;
  }
  // walk (the board's): the body bobs at 3 Hz and the head nods; peck: the body tips forward over its feet, the beak at the ground
  const pecking = st === 'peck';
  const bob = pecking ? 0 : Math.sin(phase * Math.PI * 2 * 3) * s * 0.08;
  const x = p.x, y = p.y - s * 0.5 + bob;
  ctx.fillStyle = inkOf(c, P.ink, 0.14);
  ctx.beginPath();
  ctx.ellipse(x, p.y + 0.3, s * 0.55, s * 0.55 * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  const step = pecking ? 0 : Math.sin(phase * Math.PI * 2 * 3) * s * 0.18;
  stroke(linePath([P2(x - s * 0.12 + step, y + s * 0.3), P2(x - s * 0.1 + step * 1.2, y + s * 0.5)]), P.beak, Math.max(0.6, s * 0.09));
  stroke(linePath([P2(x + s * 0.14 - step, y + s * 0.3), P2(x + s * 0.16 - step * 1.2, y + s * 0.5)]), P.beak, Math.max(0.6, s * 0.09));
  ctx.save();
  if (pecking) {
    ctx.translate(x, y + s * 0.25);
    ctx.rotate(f * 0.42);
    ctx.translate(-x, -(y + s * 0.25));
  }
  stroke(linePath([P2(x - f * s * 0.5, y), P2(x - f * s * 1.05, y - s * 0.26)]), P.pigeon, Math.max(0.7, s * 0.24));
  fill(ellPath(x, y, s * 0.64, s * 0.42), P.pigeon);
  fill(ellPath(x + f * s * 0.1, y + s * 0.1, s * 0.44, s * 0.24), breast);
  fill(ellPath(x - f * s * 0.12, y - s * 0.08, s * 0.4, s * 0.2), P.pigeon, 0.84);
  fill(ellPath(x + f * s * 0.28, y - s * 0.14, s * 0.2, s * 0.14), P.teal, 1, 0.7);
  ctx.restore();
  const hx = x + f * s * (pecking ? 0.86 : 0.62), hy = pecking ? p.y - s * 0.24 : y - s * 0.36;
  const n0 = pecking ? P2(x + f * s * 0.42, y + s * 0.12) : P2(x + f * s * 0.4, y - s * 0.12);
  stroke(linePath([n0, P2(hx, hy)]), P.pigeon, Math.max(1, s * 0.3));
  fill(ellPath(hx, hy, s * 0.27, s * 0.27), P.pigeon);
  if (pecking) fill(polyPath([P2(hx + f * s * 0.1, hy + s * 0.12), P2(hx + f * s * 0.3, hy + s * 0.28), P2(hx + f * s * 0.22, hy + s * 0.05)]), P.beak);
  else beakAt(hx + f * s * 0.24, hy + s * 0.02, 1);
  eye(hx + f * s * 0.06, hy - s * 0.08);
}

export type Breed = 'terrier' | 'poodle';

/** A walker's dog at ground point p, facing f, trotting or standing; returns the collar point for the lead. s = 0.45 EH z (04 7.4). */
export function drawDog(c: Ink, p: Pt, f: 1 | -1, breed: Breed, trot: boolean, phase: number, s = DOG_EH * EH * c.pen.z): Pt {
  const { ctx, z } = c.pen;
  const P = c.pen.spec.palette;
  const k = trot ? Math.sin(phase * Math.PI * 2) : 0;
  const bounce = trot ? Math.abs(Math.sin(phase * Math.PI * 2)) * s * 0.04 : 0;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(f, 1);
  const fill = (path: Path2D, hex: string, kk = 1): void => {
    ctx.fillStyle = fillOf(c, hex, kk);
    ctx.fill(path);
  };
  const stroke = (path: Path2D, hex: string, w: number, kk = 1): void => {
    ctx.strokeStyle = fillOf(c, hex, kk);
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(path);
  };
  const dot = (x: number, y: number, r: number, hex: string): void => {
    ctx.fillStyle = inkOf(c, hex);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  ctx.fillStyle = inkOf(c, P.ink, 0.15);
  ctx.beginPath();
  ctx.ellipse(0, 0.4, s * 0.55, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  let collar: Pt;
  if (breed === 'terrier') {
    // A: a Jack Russell: white (`paper`) with a tan head and saddle (hair 2), wiry eyebrows and beard, a docked tail held up
    const white = P.paper, tan = P.hair[2] as string;
    const by = -s * 0.44 - bounce, legW = Math.max(0.8, s * 0.1);
    const leg = (x: number, sw: number, kk: number): void => stroke(linePath([P2(x, by + s * 0.08), P2(x + sw * s * 0.14, by + s * 0.25), P2(x + sw * s * 0.18, -s * 0.02)]), white, legW, kk);
    leg(-s * 0.26, -k, 0.82);
    leg(s * 0.22, k, 0.82);
    stroke(linePath([P2(-s * 0.36, by - s * 0.06), P2(-s * 0.44, by - s * 0.3)]), white, Math.max(0.9, s * 0.11), 0.96);
    fill(softPath([P2(-s * 0.42, by - s * 0.12), P2(-s * 0.1, by - s * 0.2), P2(s * 0.3, by - s * 0.18), P2(s * 0.38, by + s * 0.04), P2(s * 0.2, by + s * 0.16), P2(-s * 0.3, by + s * 0.14), P2(-s * 0.44, by + s * 0.04)]), white);
    fill(ellPath(-s * 0.12, by - s * 0.1, s * 0.16, s * 0.08), tan);
    fill(ellPath(-s * 0.02, by + s * 0.08, s * 0.3, s * 0.07), white, 0.9);
    leg(-s * 0.32, k, 1);
    leg(s * 0.28, -k, 1);
    // the head: a tan mask over white, folded ears, a square muzzle with a beard
    const hx = s * 0.42, hy = by - s * 0.26;
    fill(ellPath(hx, hy, s * 0.17, s * 0.16), white);
    fill(softPath([P2(hx - s * 0.16, hy - s * 0.02), P2(hx - s * 0.08, hy - s * 0.15), P2(hx + s * 0.06, hy - s * 0.15), P2(hx + s * 0.04, hy + s * 0.04), P2(hx - s * 0.12, hy + s * 0.08)]), tan);
    fill(softPath([P2(hx + s * 0.06, hy - s * 0.06), P2(hx + s * 0.3, hy - s * 0.02), P2(hx + s * 0.3, hy + s * 0.08), P2(hx + s * 0.1, hy + s * 0.12)]), white, 0.98);
    fill(polyPath([P2(hx - s * 0.12, hy - s * 0.1), P2(hx - s * 0.04, hy - s * 0.24), P2(hx + s * 0.03, hy - s * 0.12)]), tan, 0.85);
    fill(ellPath(hx + s * 0.3, hy, Math.max(0.6, s * 0.045), Math.max(0.6, s * 0.04)), P.ink);
    if (z >= 1.2) {
      dot(hx + s * 0.06, hy - s * 0.06, Math.max(0.5, s * 0.035), P.ink);
      stroke(linePath([P2(hx + s * 0.02, hy - s * 0.12), P2(hx + s * 0.12, hy - s * 0.1)]), white, Math.max(0.5, s * 0.03), 1.05);
    }
    collar = P2(hx - s * 0.12, hy + s * 0.12);
    stroke(linePath([P2(hx - s * 0.16, hy + s * 0.06), P2(hx - s * 0.04, hy + s * 0.15)]), P.awningRed, Math.max(0.8, s * 0.06));
  } else {
    // B: a black poodle in a continental clip: pom-pom bracelets, a puffed chest and hips, a topknot and ear tufts, a pompom on the tail;
    // the shaved parts a shade lighter, the eye a `paper` glint so the face reads on black
    const coat = P.hair[0] as string, shave = mix(P.hair[0] as string, P.zinc, 0.45);
    const by = -s * 0.6 - bounce, legW = Math.max(0.8, s * 0.075);
    const leg = (x: number, sw: number, kk: number): void => {
      const foot = P2(x + sw * s * 0.18, -s * 0.06);
      stroke(linePath([P2(x, by + s * 0.1), P2(x + sw * s * 0.12, by + s * 0.32), foot]), shave, legW, kk);
      fill(ellPath(foot.x, foot.y - s * 0.03, s * 0.095, s * 0.08), coat, kk);
    };
    leg(-s * 0.25, -k, 0.84);
    leg(s * 0.2, k, 0.84);
    stroke(linePath([P2(-s * 0.34, by - s * 0.05), P2(-s * 0.44, by - s * 0.32)]), shave, Math.max(0.7, s * 0.06));
    fill(ellPath(-s * 0.45, by - s * 0.36, s * 0.11, s * 0.11), coat, 1.04);
    fill(ellPath(-s * 0.25, by, s * 0.16, s * 0.15), coat, 0.96);
    fill(softPath([P2(-s * 0.2, by - s * 0.06), P2(s * 0.05, by - s * 0.09), P2(s * 0.05, by + s * 0.08), P2(-s * 0.2, by + s * 0.07)]), shave);
    fill(ellPath(s * 0.13, by - s * 0.03, s * 0.23, s * 0.2), coat, 1.03);
    leg(-s * 0.29, k, 1);
    leg(s * 0.24, -k, 1);
    // a long neck to a small head with a topknot, an ear tuft and a fine muzzle
    const hx = s * 0.33, hy = by - s * 0.42;
    stroke(linePath([P2(s * 0.18, by - s * 0.1), P2(hx, hy + s * 0.06)]), coat, Math.max(1, s * 0.14));
    fill(ellPath(hx - s * 0.03, hy - s * 0.11, s * 0.12, s * 0.11), coat, 1.06);
    fill(ellPath(hx, hy, s * 0.09, s * 0.08), shave);
    fill(softPath([P2(hx + s * 0.04, hy - s * 0.02), P2(hx + s * 0.24, hy + s * 0.03), P2(hx + s * 0.22, hy + s * 0.08), P2(hx + s * 0.04, hy + s * 0.07)]), shave, 0.98);
    fill(ellPath(hx - s * 0.07, hy + s * 0.08, s * 0.075, s * 0.13), coat, 0.9);
    fill(ellPath(hx + s * 0.235, hy + s * 0.045, Math.max(0.5, s * 0.035), Math.max(0.5, s * 0.032)), P.ink, 0.8);
    if (z >= 1.2) dot(hx + s * 0.06, hy - s * 0.01, Math.max(0.5, s * 0.03), P.paper);
    collar = P2(hx - s * 0.06, hy + s * 0.14);
    stroke(linePath([P2(hx - s * 0.1, hy + s * 0.1), P2(hx + s * 0.02, hy + s * 0.17)]), P.awningRed, Math.max(0.8, s * 0.055));
  }
  ctx.restore();
  return P2(p.x + collar.x * f, p.y + collar.y);
}

/** The lead: a 1 px `ink` line from the hand to the collar (04 7.2), slack (a sag of `sag` px) or taut. */
export function drawLead(c: Ink, a: Pt, b: Pt, sag: number): void {
  const { ctx } = c.pen;
  ctx.strokeStyle = inkOf(c, c.pen.spec.palette.ink, 0.9);
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo((a.x + b.x) / 2, Math.max(a.y, b.y) + sag, b.x, b.y);
  ctx.stroke();
}

/* ---------- the Creature record to the drawing above ---------- */

/** A walking pigeon's phase grows 1 a sim second (the bob at 3 Hz, 04 9.1); a flying or scattering one's 5 (the flap at 5 Hz, GV 8592). */
export const PIGEON_WALK_HZ = 1;
export const PIGEON_FLAP_HZ = 5;
/** A walker's dog is 0.45 EH tall (03 7.7 item 5, 04 7.4: 11.7 px at zoom 1); it trots at 2 leg cycles a sim second (assumption). */
export const DOG_EH = 0.45;
export const DOG_TROT_HZ = 2;

/**
 * The five states the sim gives a pigeon (07 S4.6 step 9); anything else (idle) stands as a still walk. The player's pigeon (S7, 02 10.4) adds
 * `flyDrink` (in the air for the water's edge: fly), `startled` (it flutters in place for 2 s: the take-off pose, wings thrown up), `drink` (the beak
 * to the water: the peck pose) and `wait` and `poop` (standing: the still walk); its swoop is drawn by drawSwoop.
 */
export function pigeonStateOf(st: string): PigeonState {
  if (st === 'peck' || st === 'perch' || st === 'fly' || st === 'scatter') return st;
  return st === 'flyDrink' ? 'fly' : st === 'startled' ? 'scatter' : st === 'drink' ? 'peck' : 'walk';
}

/**
 * Does Pompon run (the dust-cloud dash, 04 7.4 run 3) in state `st`? Every state of an errand and of the player's Pompon that moves him does:
 * he stands, without the dust, while he waits for a tap (`wait`, and `idle` at the gate), digs, paddles and shakes himself dry (S7).
 */
export function pomRuns(st: string): boolean {
  return st !== 'idle' && st !== 'wait' && st !== 'dig' && st !== 'paddle' && st !== 'shakeOff';
}

/** A pigeon in state `st` at point p (its flight or perch height already in p); `tSim` is sim seconds, `id` staggers the flock. */
export function drawPigeonOf(c: Ink, p: Pt, st: string, face: 1 | -1, id: number, tSim: number): void {
  const ps = pigeonStateOf(st);
  const flying = ps === 'fly' || ps === 'scatter';
  const phase = flying ? tSim * PIGEON_FLAP_HZ + id * 0.37 : st === 'walk' ? tSim * PIGEON_WALK_HZ + id * 0.37 : 0.15;
  drawPigeonState(c, p, face, ps, phase);
}

/** A walker's dog at ground point p, trotting while `running`; returns its collar point. `tSim` is sim seconds. */
export function drawDogOf(c: Ink, p: Pt, face: 1 | -1, breed: Breed, running: boolean, id: number, tSim: number): Pt {
  return drawDog(c, p, face, breed, running, running ? tSim * DOG_TROT_HZ + id * 0.29 : 0);
}


/* ---------- S6 art: Pompon on the run and the swoop of the pigeon ---------- */

export type PomItem = 'hat' | 'purse' | 'baguette' | 'iceCream';
/** The pigeon of a swoop is drawn this much over its 0.18 EH so it reads at the default zoom (the page's SCALE). */
export const SWOOP_SCALE = 1.45;

/** What Pompon carries, drawn in his mouth at m (the dog's size s, facing f): a hat by its edge (`hatHex`), a purse by its strap, a baguette across, an ice cream cone. */
function mouthItem(pen: Pen, it: PomItem, m: Pt, f: 1 | -1, s: number, hatHex: string): void {
  const { ctx } = pen, P = pen.spec.palette;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.scale(f, 1);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const rim = GC(P.ink, 0.8), lw = Math.max(0.6, s * 0.05);
  if (it === 'hat') {
    // her beret, held by its edge, hanging down off the muzzle
    ctx.fillStyle = shade(hatHex, 1);
    ctx.strokeStyle = rim;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.ellipse(s * 0.3, s * 0.12, s * 0.56, s * 0.3, 0.35, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.3, 0);
    ctx.lineTo(s * 0.32, -s * 0.14);
    ctx.lineWidth = s * 0.09;
    ctx.stroke();
  } else if (it === 'purse') {
    const hex = P.crowdTop[9] as string; // the cognac of figure-props.ts's purse: the one she was seen with
    ctx.strokeStyle = shade(hex, 0.85);
    ctx.lineWidth = Math.max(0.8, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 0.2, -s * 0.35, s * 0.55, s * 0.05);
    ctx.stroke();
    ctx.fillStyle = shade(hex, 1);
    ctx.strokeStyle = rim;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.rect(s * 0.28, s * 0.05, s * 0.58, s * 0.4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = shade(P.lamp, 1.05);
    ctx.beginPath();
    ctx.arc(s * 0.57, s * 0.13, s * 0.05, 0, TAU);
    ctx.fill();
  } else if (it === 'baguette') {
    // a baguette across the mouth, longer than the dog is high: golden, four slashes
    ctx.translate(s * 0.1, s * 0.05);
    ctx.rotate(-0.42);
    const Lb = s * 1.75, Wb = s * 0.27;
    ctx.fillStyle = shade(P.baguette, 1);
    ctx.strokeStyle = rim;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.roundRect(-Lb * 0.45, -Wb / 2, Lb, Wb, Wb * 0.5);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = shade(P.baguette, 1.28);
    ctx.lineWidth = Math.max(0.7, s * 0.05);
    for (let i = 0; i < 4; i++) {
      const x = -Lb * 0.3 + i * Lb * 0.22;
      ctx.beginPath();
      ctx.moveTo(x - Wb * 0.2, Wb * 0.2);
      ctx.lineTo(x + Wb * 0.2, -Wb * 0.2);
      ctx.stroke();
    }
  } else {
    // an ice cream: the cone point in his teeth, a rose scoop up and forward with a paper shine
    ctx.fillStyle = shade(P.baguette, 0.95);
    ctx.strokeStyle = rim;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(s * 0.05, s * 0.05);
    ctx.lineTo(s * 0.62, -s * 0.28);
    ctx.lineTo(s * 0.62, s * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = shade(P.rose, 1);
    ctx.beginPath();
    ctx.arc(s * 0.72, -s * 0.05, s * 0.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = GC(P.paper, 0.85);
    ctx.beginPath();
    ctx.arc(s * 0.64, -s * 0.15, s * 0.07, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Pompon at ground point p (the pomeranian's 0.3 EH at this zoom, `s`): running (run, carry and home) in the page's run 3, the dust-cloud
 * dash, with the item in his mouth when he carries one; `t` sim seconds. The dog is `drawPomeranian` of the style board.
 */
export function drawPompon(c: Ink, p: Pt, f: 1 | -1, running: boolean, t: number, item: PomItem | null, hatHex: string, s = 0.3 * EH * c.pen.z): void {
  const { ctx } = c.pen, P = c.pen.spec.palette;
  if (s < 2) return;
  ctx.fillStyle = GC(P.ink, 0.16); // the shadow stays on the ground
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, s * 0.75, s * 0.2, 0, 0, TAU);
  ctx.fill();
  if (running) {
    // a dust cloud round the legs: puffs rolling off behind and under him, two speed lines; the dog is drawn over its top half
    for (let i = 0; i < 6; i++) {
      const k = (i / 6 + t * 2.4) % 1, px = p.x - f * (s * 0.2 + k * s * 1.9), py = p.y - s * (0.2 + 0.22 * Math.sin(k * 3 + 1) + 0.1 * h01(i, 3));
      ctx.fillStyle = GC(P.dust, (0.85 - k * 0.35) * Math.min(1, k * 6, (1 - k) * 4));
      ctx.beginPath();
      ctx.arc(px, py, s * (0.5 - k * 0.12 + 0.08 * h01(i, 5)), 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = GC(P.paper, 0.9);
    ctx.lineWidth = Math.max(1, 0.1 * s);
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(p.x - f * s * (1.0 + 0.3 * i), p.y - s * (0.55 + 0.18 * i));
      ctx.lineTo(p.x - f * s * (2.0 + 0.3 * i), p.y - s * (0.55 + 0.18 * i));
      ctx.stroke();
    }
  }
  drawPomeranian(c.pen, p, { face: f, running, phase: t }, s);
  if (item) {
    const bounce = running ? Math.abs(Math.sin(t * TAU * 4)) * s * 0.12 : 0;
    const stretch = running ? 1.15 : 1, yy = p.y - s * 0.46 - bounce, hx = p.x + f * s * 0.62 * stretch, hy = yy - s * 0.22;
    mouthItem(c.pen, item, P2(hx + f * s * 0.36, hy + s * 0.2), f, s, hatHex);
  }
}

/**
 * The m_pigeon swoop 1, the dive (04 8 row poop splat; 02 9.3): the pigeon in flight drawn at `s`, three speed lines trailing up its dive
 * toward `from` (a screen point behind it and above) and, within a few tiles of the victim, the dropping let go as a paper bead with a dotted
 * fall line to the head `head`; `bead` null before that. Nothing gross: the bead is `paper` with an `ice` rim.
 */
export function drawSwoop(c: Ink, p: Pt, f: 1 | -1, phase: number, s: number, from: Pt, head: Pt | null): void {
  const pen = c.pen, d = P2(from.x - p.x, from.y - p.y), l = Math.hypot(d.x, d.y) || 1;
  speedLines(pen, p, from, P2(-d.y / l, d.x / l));
  drawPigeonState(c, p, f, 'fly', phase, s);
  if (head) bead(pen, P2(p.x, p.y + 0.18 * EH * pen.z), head);
}
