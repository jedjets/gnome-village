// src/render/creatures-poses.ts
// The possessed pigeon's four own poses (02 10.4; S7 follow-up, owner 2026-10-22: "give the possessed pigeon poses for wait, poop, startled and
// drink"; they borrowed the walk, the walk, the scatter and the peck of creatures.ts drawPigeonState): `wait` standing alert with its head
// looking about, `poop` the tail up and a paper bead let go, `startled` puffed up and hopping in place with its wings shaking and alarm ticks over
// the head, `drink` the body tipped to the water's edge and the head dipping and lifting with ripples round the beak. Split out of creatures.ts
// (AGENTS rule 9: it stood at 571 lines). NEW. Picked by Claude on the owner's delegation ("make your own judgement calls on style", 2026-10-20)
// from two variants of each on scratch/s7-options-pigeon.html (shots/s7-options-pigeon-<pose>.png): wait 1 (the alert one; 2 settled into a
// lump), poop 1 (the tail up; 2 a squat), startled 2 (puffed and upright; 1 was the scatter with a hop), drink 1 (the dip and lift cycle; 2 a
// held bow). Palette A, direction A (04 3.4): no ink contour, the colours only through the palette and the figure's warmth (fillOf, inkOf).
import { TAU } from '../core/math.ts';
import { POOP_T } from '../entities/creatures.ts';
import { WATER, I, inB } from '../world/grid.ts';
import { EH } from './camera.ts';
import { screenInto } from './project.ts';
import { mix, type Pt } from './ambient.ts';
import { P2, ellPath, fillOf, inkOf, linePath, polyPath, type Ink } from './figure-rig.ts';

export type PigeonPose = 'wait' | 'poop' | 'startled' | 'drink';
export const POSE_STATES: ReadonlySet<string> = new Set<PigeonPose>(['wait', 'poop', 'startled', 'drink']);
/** Seconds a `wait` look-about takes, a `startled` hop and a `drink` dip and lift (cycles of the sim clock; the poop's is its 0.5 s beat). */
export const WAIT_CYCLE_S = 4, STARTLED_CYCLE_S = 0.5, DRINK_CYCLE_S = 1;

/**
 * Where the pose `st` is in its cycle, 0 to 1 (the sprite's frame and the drawing's phase); -1 for a state that is not one of the four. The wait
 * is staggered by the bird's id, the poop is the beat's progress (it ends when the bead has fallen), the others turn on the sim clock `tSim`.
 */
export function pigeonCycle(st: string, id: number, t: number, tSim: number): number {
  switch (st) {
    case 'wait':
      return (tSim / WAIT_CYCLE_S + id * 0.37) % 1;
    case 'poop':
      return Math.max(0, Math.min(1, 1 - t / POOP_T));
    case 'startled':
      return (tSim / STARTLED_CYCLE_S) % 1;
    case 'drink':
      return (tSim / DRINK_CYCLE_S) % 1;
    default:
      return -1;
  }
}

type Stand = { crouch?: number; tilt?: number; tail?: number; neck?: number; reach?: number; sway?: number; bob?: number; dip?: number };

/**
 * A pigeon standing at ground point p facing f: the walk's body with its stride taken out (feet planted), and what a pose changes: the body
 * crouched or tipped about its feet, the tail lifted, the neck's rise and reach, the head swaying side to side, a breathing bob, and `dip`
 * (0 head up, 1 the beak down at the ground) for a drink. `u` is the cycle. Returns the beak's tip.
 */
function standing(c: Ink, p: Pt, f: 1 | -1, s: number, o: Stand, u: number): Pt {
  const { ctx, z } = c.pen, P = c.pen.spec.palette;
  const fill = (path: Path2D, hex: string, k = 1, a?: number): void => {
    ctx.fillStyle = fillOf(c, hex, k, a);
    ctx.fill(path);
  };
  const stroke = (path: Path2D, hex: string, w: number): void => {
    ctx.strokeStyle = fillOf(c, hex);
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(path);
  };
  const crouch = o.crouch ?? 0, tilt = (o.tilt ?? 0) * f, tail = o.tail ?? 0, hasDip = o.dip !== undefined, dip = o.dip ?? 0;
  const x = p.x, y = p.y - s * (0.5 - 0.22 * crouch) + (o.bob ?? 0) * s * Math.sin(u * TAU);
  ctx.fillStyle = inkOf(c, P.ink, 0.14);
  ctx.beginPath();
  ctx.ellipse(x, p.y + 0.3, s * 0.55, s * 0.55 * 0.3, 0, 0, TAU);
  ctx.fill();
  const legW = Math.max(0.6, s * 0.09);
  stroke(linePath([P2(x - s * 0.12, y + s * 0.3), P2(x - s * (0.1 + 0.05 * crouch), p.y - s * 0.02)]), P.beak, legW);
  stroke(linePath([P2(x + s * 0.14, y + s * 0.3), P2(x + s * (0.16 + 0.05 * crouch), p.y - s * 0.02)]), P.beak, legW);
  // the body, tipped about its feet, and the tail that goes with it
  ctx.save();
  ctx.translate(x, y + s * 0.25);
  ctx.rotate(tilt);
  ctx.translate(-x, -(y + s * 0.25));
  stroke(linePath([P2(x - f * s * 0.5, y), P2(x - f * s * (1.05 - 0.1 * tail), y - s * (0.26 + 0.55 * tail))]), P.pigeon, Math.max(0.7, s * 0.24));
  fill(ellPath(x, y, s * 0.64, s * 0.42), P.pigeon);
  fill(ellPath(x + f * s * 0.1, y + s * 0.1, s * 0.44, s * 0.24), mix(P.pigeon, P.paper, 0.35));
  fill(ellPath(x - f * s * 0.12, y - s * 0.08, s * 0.4, s * 0.2), P.pigeon, 0.84);
  fill(ellPath(x + f * s * 0.28, y - s * 0.14, s * 0.2, s * 0.14), P.teal, 1, 0.7);
  ctx.restore();
  // the head: up and swaying for a wait, down to the ground at the bottom of a dip
  const hx = x + f * s * ((o.reach ?? 0.62) + dip * 0.3) + (o.sway ?? 0) * s * Math.sin(u * TAU);
  const hy = hasDip ? p.y - s * (0.2 + 0.3 * (1 - dip)) : y - s * (o.neck ?? 0.36);
  stroke(linePath([P2(x + f * s * 0.4, y - s * 0.12 + s * 0.2 * tilt * f), P2(hx, hy)]), P.pigeon, Math.max(1, s * 0.3));
  fill(ellPath(hx, hy, s * 0.27, s * 0.27), P.pigeon);
  const down = dip > 0.5;
  fill(
    down
      ? polyPath([P2(hx + f * s * 0.1, hy + s * 0.12), P2(hx + f * s * 0.3, hy + s * 0.28), P2(hx + f * s * 0.22, hy + s * 0.05)])
      : polyPath([P2(hx + f * s * 0.24, hy - s * 0.04), P2(hx + f * s * 0.48, hy + s * 0.02), P2(hx + f * s * 0.24, hy + s * 0.1)]),
    P.beak,
  );
  if (z >= 1.5) {
    ctx.fillStyle = inkOf(c, P.ink);
    ctx.beginPath();
    ctx.arc(hx + f * s * 0.06, hy - s * 0.08, Math.max(0.5, s * 0.055), 0, TAU);
    ctx.fill();
  }
  return P2(hx + f * s * (down ? 0.26 : 0.46), hy + (down ? s * 0.22 : s * 0.03));
}

const W0: Pt = { x: 0, y: 0 }, W1: Pt = { x: 0, y: 0 };
/**
 * Which way a pigeon drinking at tile (x, y) faces on screen: toward the nearest water tile within two tiles (1 right, -1 left), 0 when there is
 * none or it lies straight above or below. The sim leaves the bird facing the way it flew in (`face`); the shore is on the other side half the
 * time, so the draw turns it to the water (a look only: nothing is written).
 */
export function drinkFace(x: number, y: number): 1 | -1 | 0 {
  let best = -1, bd = 9;
  const cx = Math.round(x), cy = Math.round(y);
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const tx = cx + dx, ty = cy + dy;
      if (!inB(tx, ty) || !((WATER[I(tx, ty)] ?? 0) > 0)) continue;
      const d = Math.hypot(tx - x, ty - y);
      if (d < bd) {
        bd = d;
        best = tx * 100 + ty;
      }
    }
  if (best < 0) return 0;
  screenInto(x, y, 0, W0);
  screenInto(Math.floor(best / 100), best % 100, 0, W1);
  const dx = W1.x - W0.x;
  return dx > 0.5 ? 1 : dx < -0.5 ? -1 : 0;
}

/** Two rings of ripple at q, `water` blue (the beak is at the edge of the pond), growing and fading with u in [0, 1). */
function ripple(c: Ink, q: Pt, s: number, u: number): void {
  const { ctx } = c.pen, P = c.pen.spec.palette;
  ctx.lineWidth = Math.max(0.6, s * 0.06);
  for (let i = 0; i < 2; i++) {
    const k = (u + i * 0.5) % 1;
    ctx.strokeStyle = fillOf(c, P.water, 0.9, 0.9 * (1 - k));
    ctx.beginPath();
    ctx.ellipse(q.x, q.y, s * (0.15 + 0.5 * k), s * (0.15 + 0.5 * k) * 0.4, 0, 0, TAU);
    ctx.stroke();
  }
}

/** The dropping let go from q as a `paper` bead with an `ice` rim (the swoop's own, fx-play.ts bead), falling and fading with u. */
function drop(c: Ink, q: Pt, s: number, u: number): void {
  const { ctx } = c.pen, P = c.pen.spec.palette;
  ctx.fillStyle = fillOf(c, P.paper, 1, 1 - 0.5 * u);
  ctx.strokeStyle = fillOf(c, P.ice, 1, 1 - 0.5 * u);
  ctx.lineWidth = Math.max(0.6, s * 0.04);
  ctx.beginPath();
  ctx.arc(q.x, q.y + s * 0.9 * u, Math.max(1, s * 0.11 * (1 - 0.3 * u)), 0, TAU);
  ctx.fill();
  ctx.stroke();
}

/** Three short alarm ticks fanning up from over the head at h (a cartoon's "!" without the letter), at strength k. */
function alarm(c: Ink, h: Pt, s: number, k: number): void {
  const { ctx } = c.pen, P = c.pen.spec.palette;
  ctx.strokeStyle = fillOf(c, P.ink, 1, 0.9 * k);
  ctx.lineWidth = Math.max(0.8, s * 0.075);
  ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    const a = -Math.PI / 2 + i * 0.6;
    ctx.beginPath();
    ctx.moveTo(h.x + Math.cos(a) * s * 0.5, h.y - s * 0.3 + Math.sin(a) * s * 0.5);
    ctx.lineTo(h.x + Math.cos(a) * s * 0.78, h.y - s * 0.3 + Math.sin(a) * s * 0.78);
    ctx.stroke();
  }
}

/** The startle: a round, upright body hopping at 2 Hz in place, both wings half open and shaking at 4 Hz, the head back, an eye wide, the ticks over it. */
function startled(c: Ink, p: Pt, f: 1 | -1, s: number, u: number): void {
  const { ctx, z } = c.pen, P = c.pen.spec.palette;
  const hop = Math.abs(Math.sin(u * TAU)) * s * 0.22, flap = 0.5 + 0.5 * Math.sin(u * TAU * 2);
  const x = p.x + Math.sin(u * TAU * 4) * s * 0.05, y = p.y - s * 0.55 - hop;
  ctx.fillStyle = inkOf(c, P.ink, 0.14 * (1 - hop / (s * 0.5)));
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 0.3, s * 0.55, s * 0.17, 0, 0, TAU);
  ctx.fill();
  const wing = (side: number): void => {
    ctx.fillStyle = fillOf(c, P.pigeon, side > 0 ? 1.04 : 0.86);
    ctx.fill(ellPath(x + side * s * 0.55, y - s * (0.05 + 0.18 * flap), s * 0.55, s * 0.19, side * (-0.5 - 0.3 * flap)));
  };
  wing(-1);
  ctx.strokeStyle = fillOf(c, P.beak);
  ctx.lineWidth = Math.max(0.6, s * 0.09);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.1, y + s * 0.3);
  ctx.lineTo(x - s * 0.12, p.y - s * 0.02);
  ctx.moveTo(x + s * 0.14, y + s * 0.3);
  ctx.lineTo(x + s * 0.16, p.y - s * 0.02);
  ctx.stroke();
  ctx.strokeStyle = fillOf(c, P.pigeon);
  ctx.lineWidth = Math.max(0.7, s * 0.24);
  ctx.beginPath();
  ctx.moveTo(x - f * s * 0.5, y);
  ctx.lineTo(x - f * s * 0.95, y - s * 0.3);
  ctx.stroke();
  ctx.fillStyle = fillOf(c, P.pigeon);
  ctx.fill(ellPath(x, y, s * 0.68, s * 0.5));
  ctx.fillStyle = fillOf(c, mix(P.pigeon, P.paper, 0.35));
  ctx.fill(ellPath(x + f * s * 0.08, y + s * 0.12, s * 0.48, s * 0.28));
  wing(1);
  const hx = x + f * s * 0.52, hy = y - s * 0.55;
  ctx.strokeStyle = fillOf(c, P.pigeon);
  ctx.lineWidth = Math.max(1, s * 0.3);
  ctx.beginPath();
  ctx.moveTo(x + f * s * 0.36, y - s * 0.2);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.fillStyle = fillOf(c, P.pigeon);
  ctx.fill(ellPath(hx, hy, s * 0.28, s * 0.28));
  ctx.fillStyle = fillOf(c, P.beak);
  ctx.fill(polyPath([P2(hx + f * s * 0.24, hy - s * 0.06), P2(hx + f * s * 0.5, hy + s * 0.02), P2(hx + f * s * 0.24, hy + s * 0.1)]));
  if (z >= 1.2) {
    ctx.fillStyle = fillOf(c, P.paper);
    ctx.beginPath();
    ctx.arc(hx + f * s * 0.08, hy - s * 0.06, Math.max(0.8, s * 0.1), 0, TAU);
    ctx.fill();
    ctx.fillStyle = inkOf(c, P.ink);
    ctx.beginPath();
    ctx.arc(hx + f * s * 0.1, hy - s * 0.06, Math.max(0.5, s * 0.05), 0, TAU);
    ctx.fill();
  }
  alarm(c, P2(hx, hy), s, 1);
}

/**
 * A pigeon of the player's in pose `pose` at ground point p facing f, `u` in [0, 1) through its cycle (pigeonCycle), `s` its size (0.18 EH z,
 * 04 7.4). The wait looks about (the head sways 0.1 s each way over 4 s), the poop lifts the tail and lets a bead fall, the startle hops and
 * shakes, the drink dips to the water and lifts with a ripple round the beak at the bottom of the dip.
 */
export function drawPigeonPose(c: Ink, p: Pt, f: 1 | -1, pose: PigeonPose, u: number, s = 0.18 * EH * c.pen.z): void {
  if (pose === 'wait') {
    standing(c, p, f, s, { neck: 0.5, reach: 0.56, tilt: -0.08, sway: 0.1, bob: 0.012 }, u);
  } else if (pose === 'poop') {
    standing(c, p, f, s, { tilt: 0.2, tail: 0.85, neck: 0.26, reach: 0.62, crouch: 0.2 }, u);
    drop(c, P2(p.x - f * s * 1.0, p.y - s * 0.52), s, u);
  } else if (pose === 'startled') {
    startled(c, p, f, s, u);
  } else {
    const dip = u < 0.6 ? 1 : 1 - Math.sin(((u - 0.6) / 0.4) * Math.PI);
    const beak = standing(c, p, f, s, { tilt: 0.22 + 0.28 * dip, neck: 0.4, reach: 0.62, dip }, u);
    if (dip > 0.5) ripple(c, P2(beak.x + f * s * 0.02, p.y + s * 0.02), s, (u * 1.5) % 1);
  }
}
