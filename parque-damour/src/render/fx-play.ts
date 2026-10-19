// src/render/fx-play.ts
// The drawings of the abilities of Slice 6 (register section 4 row "S6 art and S5 poses", picked by Claude on the owner's delegation,
// 2026-10-20: "make your own judgement calls on style"; 04 8): the c_petals sparkle flurry (soft round petals, some paper-white, gold
// twinkles in the air and on the ground, a dashed rose outline on the 3 x 3 that got the charm), the m_sprinkler pop-up rotary's spray (three
// arms turning once a second, eight drops each, and the shimmer on the wet tiles), the m_pigeon swoop's speed lines and falling bead and the
// paper dollop on the head, the dust poof of a trip, the busker's ink notes and his cap with its coins, and the flower seller's petals.
// NEW, ported from the options page scratch/s6-options-light.ts, -water.ts, -pigeon.ts, -peel.ts and -cameos.ts (the picked variants only).
// Changes: the petals are particles of effects.ts (the page's 24 petals, each its own depth-sorted item, from the visual stream instead of
// the page's hash), the spray is time-driven from the prop's own clock (the sim tick, so a paused park holds still) and handed to the
// painter as 30 pooled drawables; every colour through the palette (ambient.ts tokens), lit by the ambient so the night tints them.
import { TAU } from '../core/math.ts';
import { tick } from '../core/loop.ts';
import { props } from '../world/grid.ts';
import { GC, mix, shade, style, type Pen, type Pt } from './ambient.ts';
import { cam, view } from './camera.ts';
import { screenInto } from './project.ts';
import { depthOf, type Drawable } from './order.ts';
import { h01, star } from './romance-fx.ts';

/* ---------- c_petals: the sparkle flurry (04 8 row petals; the owner's page, variant 3 of the options) ---------- */

/** A petal's flight: from (sx, sy) 1.6 EH up, swaying down to land at (lx, ly) after T seconds, then it lies. `cue` marks the outline. */
export type Petal = { sx: number; sy: number; lx: number; ly: number; T: number; rot: number; tone: number; sz: number; i: number; cue?: 1 };
export const PETAL_N = 24; // 02 9.2: a burst of 24
export const PETAL_LIFE = 20; // land and fade over 20 s (04 8)
export const PETAL_CUE_T = 2.6; // the outline stands while they fall, then fades
export const PETAL_R = 1; // the 3 x 3

/** Where a petal is `age` seconds after the cast (tiles, and EH up): the page's fall with a sway, then lying at its landing point. */
export function petalAt(p: Petal, ph: number, age: number, out: { x: number; y: number; z: number; flip: number; landed: boolean }): void {
  const u = Math.max(0, Math.min(1, age / p.T)), v = 1 - u;
  if (u >= 1) {
    out.x = p.lx;
    out.y = p.ly;
    out.z = 0.02;
    out.flip = 0;
    out.landed = true;
    return;
  }
  const sway = Math.sin(ph + age * 3.4) * 0.22 * v, o = 1 - v * v;
  out.x = p.sx + (p.lx - p.sx) * o + sway;
  out.y = p.sy + (p.ly - p.sy) * o - sway * 0.6;
  out.z = 0.06 + 1.55 * Math.pow(v, 1.25) + Math.sin(u * Math.PI) * 0.35;
  out.flip = ph + age * 8;
  out.landed = false;
}

/** The three tones of a petal: `rose`, a paler `rose` and `rose` toward `awningRed`. */
const tone = (P: { rose: string; paper: string; awningRed: string }, i: number): string => (i === 0 ? P.rose : i === 1 ? mix(P.rose, P.paper, 0.45) : mix(P.rose, P.awningRed, 0.3));

/** One petal (variant 3): a soft round petal with a lighter lip, tumbling edge-on while it falls, flat and lower once it lies. */
export function drawPetal(pen: Pen, p: Petal, ph: number, age: number, q: Pt, g: Pt, a: number, landed: boolean, flip: number): void {
  const { ctx, z } = pen, P = pen.spec.palette, s = 8 * z, few = z < 0.55;
  const sq = landed ? 0.5 : 0.35 + 0.65 * Math.abs(Math.cos(flip));
  const r = 0.46 * s * p.sz, hex = p.i % 3 === 0 ? P.paper : tone(P, p.tone);
  ctx.save();
  ctx.globalAlpha = a;
  if (!landed) {
    // a soft contact shadow where it will land
    ctx.fillStyle = GC(P.ink, 0.1);
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, s * 0.3, s * 0.12, 0, 0, TAU);
    ctx.fill();
  }
  ctx.translate(q.x, q.y);
  ctx.scale(1, Math.max(0.2, sq));
  ctx.rotate(p.rot + flip * 0.3);
  ctx.fillStyle = shade(hex, 1);
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.68, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = GC(P.paper, 0.45);
  ctx.beginPath();
  ctx.ellipse(-r * 0.2, -r * 0.18, r * 0.5, r * 0.28, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  // the gold twinkles: one petal in four while falling, one in five lying; fewer at Fit, where they would only be noise
  const tw = 0.75 + 0.25 * Math.sin(ph * 3 + age * 7);
  ctx.save();
  ctx.globalAlpha = a;
  if (!landed && p.i % (few ? 8 : 4) === 0) star(pen, q.x + s * 0.4, q.y - s * 0.45, s * 0.3 * tw, P.lamp, 0.9, ph + flip * 0.2);
  else if (landed && p.i % (few ? 10 : 5) === 0) star(pen, q.x, q.y - s * 0.14, s * 0.24 * tw, P.lamp, 0.85, ph);
  ctx.restore();
}

/** The dashed rose outline of the 3 x 3 that got the charm, with a faint wash (the page's area cue); k its alpha. */
export function areaCue(pen: Pen, cx: number, cy: number, r: number, k: number): void {
  const { ctx, z } = pen, P = pen.spec.palette, o = r + 0.5;
  const a = screenInto(cx - o, cy - o, 0, CA), b = screenInto(cx + o, cy - o, 0, CB), c = screenInto(cx + o, cy + o, 0, CC), d = screenInto(cx - o, cy + o, 0, CD);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fillStyle = GC(P.rose, 0.1 * k);
  ctx.fill();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = GC(mix(P.rose, P.awningRed, 0.2), 0.7 * k);
  ctx.lineWidth = Math.max(1, 0.9 * z);
  ctx.stroke();
  ctx.restore();
}
const CA: Pt = { x: 0, y: 0 }, CB: Pt = { x: 0, y: 0 }, CC: Pt = { x: 0, y: 0 }, CD: Pt = { x: 0, y: 0 };

/* ---------- m_sprinkler: the pop-up rotary's spray (04 8 row sprinkler: 3 arcs of r 1.5 tiles, 1 rev a second, budget 24) ---------- */

/** A sprinkler lives 10 s (abilities-mischief.ts SPRINKLER_T): it pops up in the first 0.4 s, sinks in the last 0.4, sprays between. */
export const SPRINKLER_LIFE = 600;
export const SPRINKLER_POP = 0.4;
export const SPRAY_R = 1.5;
/** A water drop (`splash` with the `sky` of the sky in it and a `paper` glint): r 0.19 s x size at alpha al. */
export function dropDot(pen: Pen, q: Pt, s: number, size: number, al: number): void {
  const { ctx } = pen, P = pen.spec.palette, r = Math.max(0.8, 0.19 * s * size);
  ctx.fillStyle = GC(P.splash, al);
  ctx.beginPath();
  ctx.arc(q.x, q.y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = GC(P.sky, al * 0.7);
  ctx.beginPath();
  ctx.arc(q.x, q.y + r * 0.2, r * 0.75, 0, TAU);
  ctx.fill();
  ctx.fillStyle = GC(P.paper, al * 0.9);
  ctx.beginPath();
  ctx.arc(q.x - r * 0.3, q.y - r * 0.3, Math.max(0.4, r * 0.35), 0, TAU);
  ctx.fill();
}

/** The seconds a sprinkler prop has been up (its birth is its end tick less its life). */
export function sprinklerT(untilTick: number): number {
  return (tick() - (untilTick - SPRINKLER_LIFE)) / 60;
}

type SprayD = Drawable & { e: number; size: number; al: number; star: number };
const SPRAY_POOL: SprayD[] = [];
const SPEN: Pen = { ctx: null as unknown as CanvasRenderingContext2D, spec: style(), z: 1 };
const SQ: Pt = { x: 0, y: 0 }, SC: Pt = { x: 0, y: 0 };
function drawSprayItem(d: Drawable, ctx: CanvasRenderingContext2D): void {
  const s = d as SprayD;
  SPEN.ctx = ctx;
  SPEN.spec = style();
  SPEN.z = cam.z;
  const q = screenInto(s.x, s.y, s.e, SQ);
  if (s.star > 0) star(SPEN, q.x, q.y - 1, s.star * cam.z, SPEN.spec.palette.paper, s.al, s.id);
  else dropDot(SPEN, q, 8 * cam.z, s.size, s.al);
}

/**
 * The sprinklers' spray as painter drawables, appended to `out`: per sprinkler prop in its spraying time, 3 arms x 8 drops on a lagging arc
 * of 1.5 tiles turning once a second (the page's variant 1, "pop-up rotary"), and 6 twinkles shimmering on the wet 3 x 3. Pooled; culled
 * to the screen.
 */
export function sprayDrawables(out: Drawable[]): void {
  let n = 0;
  const take = (): SprayD => {
    let d = SPRAY_POOL[n++];
    if (!d) {
      d = { depth: 0, kind: 'fx', id: 0, x: 0, y: 0, z: 0, draw: drawSprayItem, e: 0, size: 1, al: 1, star: 0 };
      SPRAY_POOL.push(d);
    }
    return d;
  };
  const m = 2.2 * 26 * cam.z;
  for (const p of props) {
    if (p.kind !== 'sprinkler') continue;
    const t = sprinklerT(p.untilTick);
    if (t < SPRINKLER_POP || t > 10 - SPRINKLER_POP) continue;
    screenInto(p.x, p.y, 0, SC);
    if (SC.x < -m || SC.x > view.cw + m || SC.y < -m || SC.y > view.chh + m) continue;
    for (let k = 0; k < 3; k++)
      for (let j = 0; j < 8; j++) {
        const u = (j + 1) / 9, th = t * TAU + (k / 3) * TAU - u * 0.7, r = SPRAY_R * Math.pow(u, 0.9);
        const d = take();
        d.x = p.x + Math.cos(th) * r;
        d.y = p.y + Math.sin(th) * r;
        d.e = 0.2 + 0.62 * 4 * u * (1 - u);
        d.size = 1 - 0.35 * u;
        d.al = 0.95 - 0.35 * u;
        d.star = 0;
        d.id = p.id * 64 + k * 8 + j;
        d.depth = depthOf(d.x, d.y) + 0.3;
        out.push(d);
      }
    for (let i = 0; i < 6; i++) {
      const d = take(), k = 0.5 + 0.5 * Math.sin(t * 9 + i * 1.7);
      d.x = p.x - 1.2 + h01(i, 81) * 2.4;
      d.y = p.y - 1.2 + h01(i, 82) * 2.4;
      d.e = 0;
      d.star = 0.9 + 1.1 * k;
      d.al = 0.35 + 0.55 * k;
      d.id = p.id * 64 + 40 + i;
      d.depth = depthOf(d.x, d.y) + 0.05;
      out.push(d);
    }
  }
}

/* ---------- the dollop, the poof, the bead and the lines ---------- */

/** The paper dollop on a head or a hat (m_pigeon splat 3: a round bead with a shine and a gold twinkle, nothing brown, nothing dripping). */
export function splat(pen: Pen, at: Pt, hr: number, t: number): void {
  const { ctx } = pen, P = pen.spec.palette, k = Math.min(1, 0.6 + t * 0.4);
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.fillStyle = GC(P.ice, 1);
  ctx.beginPath();
  ctx.ellipse(0, 0.08 * hr, 0.6 * hr * k, 0.42 * hr * k, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = GC(P.paper, 1);
  ctx.beginPath();
  ctx.ellipse(0, -0.04 * hr, 0.5 * hr * k, 0.34 * hr * k, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = GC(P.ice, 1);
  ctx.beginPath();
  ctx.arc(0.5 * hr, -0.1 * hr, Math.max(0.6, 0.12 * hr), 0, TAU);
  ctx.arc(-0.6 * hr, 0.1 * hr, Math.max(0.5, 0.09 * hr), 0, TAU);
  ctx.fill();
  star(pen, 0.78 * hr, -0.62 * hr, 0.42 * hr, P.lamp, 0.95, 0.3);
  ctx.restore();
}

/** The trip's dust (m_peel fall 3, "plop and grin": one soft cloud with short rays round it), k the life from 0 to 1; the `dust` token. */
export function poof(pen: Pen, at: Pt, k: number): void {
  const { ctx, z } = pen, P = pen.spec.palette, s = 8 * z * (1 + 0.45 * k), al = 0.6 * (1 - 0.6 * k);
  ctx.save();
  ctx.fillStyle = GC(P.dust, al);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    ctx.beginPath();
    ctx.arc(at.x + Math.cos(a) * s * 0.5, at.y - s * 0.5 + Math.sin(a) * s * 0.35, s * 0.34, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = GC(P.paper, al);
  ctx.lineWidth = Math.max(0.8, 0.14 * s);
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + h01(i, 5) * 0.4;
    ctx.beginPath();
    ctx.moveTo(at.x + Math.cos(a) * s * 1.05, at.y - s * 0.5 + Math.sin(a) * s * 0.8);
    ctx.lineTo(at.x + Math.cos(a) * s * 1.45, at.y - s * 0.5 + Math.sin(a) * s * 1.1);
    ctx.stroke();
  }
  ctx.restore();
}

/** The swoop's three speed lines trailing from `a` (the pigeon) to `b` (up its dive), spread by `perp` (a unit screen normal). */
export function speedLines(pen: Pen, a: Pt, b: Pt, perp: Pt): void {
  const { ctx, z } = pen, P = pen.spec.palette;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, 1.2 * z);
  for (let k = -1; k <= 1; k++) {
    ctx.strokeStyle = GC(P.paper, 0.85 - 0.25 * Math.abs(k));
    ctx.beginPath();
    ctx.moveTo(a.x + perp.x * k * 2.4 * z, a.y + perp.y * k * 2.4 * z);
    ctx.lineTo(b.x + perp.x * k * 3 * z, b.y + perp.y * k * 3 * z);
    ctx.stroke();
  }
  ctx.restore();
}

/** The dropping just let go: a small paper bead at `d` with a dotted fall line to the head `head` (nothing gross; `paper` with an `ice` rim). */
export function bead(pen: Pen, d: Pt, head: Pt): void {
  const { ctx, z } = pen, P = pen.spec.palette;
  ctx.save();
  ctx.fillStyle = GC(P.paper, 1);
  ctx.strokeStyle = GC(P.ice, 1);
  ctx.lineWidth = Math.max(0.8, 0.8 * z);
  ctx.beginPath();
  ctx.arc(d.x, d.y, Math.max(1.2, 1.5 * z), 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([1.5 * z, 3 * z]);
  ctx.strokeStyle = GC(P.paper, 0.65);
  ctx.beginPath();
  ctx.moveTo(d.x, d.y + 3 * z);
  ctx.lineTo(head.x, head.y - 5 * z);
  ctx.stroke();
  ctx.restore();
}

/* ---------- the busker: ink notes and his cap with its coins (c_musician; busker 1, "standing with cap and coins") ---------- */

/** An `ink` music note as a path: a head ellipse, a stem and a flag; `beamed` two joined by a beam (04 8 row notes). */
function note(pen: Pen, x: number, y: number, s: number, hex: string, beamed: boolean, rot: number, a: number): void {
  const { ctx } = pen;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = hex;
  ctx.strokeStyle = hex;
  ctx.lineWidth = Math.max(0.7, s * 0.09);
  ctx.lineCap = 'round';
  const head = (hx: number): void => {
    ctx.beginPath();
    ctx.ellipse(hx, 0, s * 0.2, s * 0.14, -0.4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx + s * 0.17, -s * 0.03);
    ctx.lineTo(hx + s * 0.17, -s * 0.72);
    ctx.stroke();
  };
  head(0);
  if (beamed) {
    head(s * 0.5);
    ctx.lineWidth = Math.max(1, s * 0.16);
    ctx.beginPath();
    ctx.moveTo(s * 0.17, -s * 0.72);
    ctx.lineTo(s * 0.67, -s * 0.66);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(s * 0.17, -s * 0.72);
    ctx.quadraticCurveTo(s * 0.5, -s * 0.5, s * 0.4, -s * 0.28);
    ctx.stroke();
  }
  ctx.restore();
}

/** Notes rising from the bellows at `from`, toward the way he faces: one every 0.6 s, each living 2.4 s (04 8 row notes); `t` sim seconds. */
export function drawNotes(pen: Pen, from: Pt, face: 1 | -1, t: number): void {
  const z = pen.z, s = 8 * z * 1.15, ink = shade(pen.spec.palette.ink, 0.85);
  for (let i = 0; i < 4; i++) {
    const u = (t / 2.4 + i / 4) % 1, a = Math.min(1, u * 8, (1 - u) * 4);
    note(pen, from.x + face * (6 * z + u * 24 * z + Math.sin(u * 9 + i) * 4 * z), from.y - u * 50 * z, s * (0.95 + 0.1 * i), ink, (Math.floor(t / 2.4 + i / 4) + i) % 3 === 1, Math.sin(u * 5 + i) * 0.25, a);
  }
}

/** His flat cap on the path with a few coins in it, `g` the ground point beside him. */
export function drawCap(pen: Pen, g: Pt): void {
  const { ctx, z } = pen, P = pen.spec.palette, s = 8 * z;
  ctx.save();
  ctx.fillStyle = shade(P.crowdHat[3] as string, 1);
  ctx.strokeStyle = GC(P.ink, 0.8);
  ctx.lineWidth = Math.max(0.7, 0.7 * z);
  ctx.beginPath();
  ctx.ellipse(g.x, g.y, s * 0.62, s * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = GC(P.lamp, 1);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(g.x - s * 0.25 + i * s * 0.25, g.y - s * 0.03, Math.max(0.8, s * 0.1), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** A few rose petals drifting from the flower seller's hand (04 7.4 a_florist: petals scatter from the hand); `t` sim seconds. */
export function handPetals(pen: Pen, c: Pt, h: number, t: number): void {
  const { ctx } = pen, P = pen.spec.palette;
  for (let i = 0; i < 6; i++) {
    const u = (t * 0.7 + i / 6) % 1, x = c.x + (h01(i, 31) - 0.5) * 0.4 * h, y = c.y - 0.05 * h + u * 0.34 * h;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(i + u * 3);
    ctx.fillStyle = shade(i % 2 ? P.rose : mix(P.rose, P.paper, 0.4), 1, 1 - u * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.03 * h * 1.4, 0.018 * h * 1.4, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
