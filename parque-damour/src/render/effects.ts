// src/render/effects.ts
// The particle drawings the Style Gate board needs (hearts, fountain spray, ripple rings), the chat bubble, and direction C's
// screen-space paper grain (04 section 8, 7.5 item 4, 3.2 row Texture); and the game's particle system: the P records with the 220 cap on
// the visual stream (addPart), the spawners, stepping on the frame, the fountain's spray and ripples from ambientFx, the fx event listener and the
// particles as painter drawables (03 2.7 effects.ts row, 4.1 items 7 and 9, 7.8 item 1; 04 section 8).
// Ported from GV 2385-2407 (P, puff, sparkFx, heartFx, splashFx, rippleFx, updateParts), 8609-8626 (drawPart: dust, spark, bee, drop,
// ring, heart), 8818-8847 (ambientFx: the zoom floor 0.45 and the visual-stream rates).
// Verdict: PORT. Changes: particles step on the frame by min(0.05, dtr) x T.speed (03 4.1 item 7), not inside the sim step; at the cap the
// oldest particle goes (04 section 8; GV refused the new one); kinds are Parque's (GV drop is splash, GV bee is wasp, the fountain spray is
// drop: paper dots, 04 section 8); a particle may carry a ring's radii in tiles, a gap behind a column and a depth bias; heights are EH
// units, gravity 2.6 EH/s2 (GV 2405); downwind is east (an assumption); ambientFx sprays fountains (12 drops a second, budget 30, ripple
// rings 0.5 a second) and spawns nothing while paused (08 4.5 item 2); the wasp's flutter runs on sim time, not the wall clock.
// Dropped from the range: chips, zzz, logs, smoke, fireflies, valley mist, lightning and rumble, rain rings and splashes (S9 reshapes
// the weather overlay and its rain), the text glyphs of zzz and notes (04 section 8 asks for a drawn note).
// TODO(S9): drawWeatherOverlay (GV 10062-10105 on sim time), petals, leaves, notes, flash, fireworks, lamp halos (04 section 8, 10.2);
// TODO(S4, S6): poopDot, bubble, hat, the wasp circling a table.
import { mulberry32, vrng, vrnd } from '../core/rng.ts';
import { TAU, clamp01, type XY } from '../core/math.ts';
import { DAYLEN, T } from '../core/clock.ts';
import { W } from '../core/weather.ts';
import { watch, type GameEvent } from '../core/events.ts';
import { props } from '../world/grid.ts';
import { iceState } from '../world/water.ts';
import { TH, TW, cam, view } from './camera.ts';
import { screenInto } from './project.ts';
import { depthOf, type Drawable } from './order.ts';
import { GC, fillPoly, inkLine, shade, style, type Pen, type Pt, type StyleSpec } from './ambient.ts';

/** A heart of size s (8 z in the game): two arcs r 0.22 s and a point (GV 8622); `hexR` colours the right lobe for a two-tone heart. */
export function drawHeart(pen: Pen, x: number, y: number, s: number, alpha: number, hexL: string, hexR = hexL): void {
  const { ctx, spec, z } = pen;
  const lobe = (cx: number, from: number, to: number): void => {
    ctx.arc(cx, y, s * 0.22, from, to);
  };
  const half = (hex: string, side: -1 | 1): void => {
    ctx.fillStyle = shade(hex, 1, alpha * (spec.id === 'C' ? 0.85 : 1));
    ctx.beginPath();
    const dx = spec.id === 'C' ? 0.5 * z : 0, dy = spec.id === 'C' ? 0.3 * z : 0;
    ctx.save();
    ctx.translate(dx, dy);
    if (side < 0) {
      ctx.moveTo(x, y + s * 0.55);
      ctx.lineTo(x - s * 0.36, y + s * 0.09);
      lobe(x - s * 0.18, Math.PI, Math.PI * 1.5);
      ctx.lineTo(x, y - s * 0.1);
    } else {
      ctx.moveTo(x, y + s * 0.55);
      ctx.lineTo(x, y - s * 0.1);
      lobe(x + s * 0.18, Math.PI * 1.5, Math.PI * 2);
      ctx.lineTo(x + s * 0.36, y + s * 0.09);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  half(hexL, -1);
  half(hexR, 1);
  if (spec.id === 'A' && s > 6) {
    ctx.fillStyle = GC(spec.palette.paper, alpha * 0.45);
    ctx.beginPath();
    ctx.arc(x - s * 0.2, y - s * 0.08, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  if (spec.line === 'ink') {
    const pts: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      pts.push({ x: x - s * 0.18 + Math.cos(a) * s * 0.22, y: y + Math.sin(a) * s * 0.22 });
    }
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      pts.push({ x: x + s * 0.18 + Math.cos(a) * s * 0.22, y: y + Math.sin(a) * s * 0.22 });
    }
    pts.push({ x: x + s * 0.36, y: y + s * 0.09 }, { x: x, y: y + s * 0.55 }, { x: x - s * 0.36, y: y + s * 0.09 });
    inkLine(pen, pts, { seed: Math.round(x + y), inkAlpha: alpha * 0.75, gapless: true, lineW: Math.max(0.6, 0.5 * pen.z), jitterK: 0.3 });
  }
}

/** A fountain spray drop: a paper dot r 0.1 s at alpha 0.7 (04 section 8). */
export function drawSprayDot(pen: Pen, x: number, y: number, s: number, alpha = 0.7): void {
  const { ctx, spec } = pen;
  ctx.fillStyle = GC(spec.palette.paper, alpha);
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.6, s * 0.1), 0, Math.PI * 2);
  ctx.fill();
  if (spec.line === 'ink' && s > 6) {
    ctx.strokeStyle = GC(spec.palette.ink, alpha * 0.5);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.6, s * 0.1), 0.5, 3.6);
    ctx.stroke();
  }
}

/** A ripple ring on water: a pale ellipse, fading as it widens (GV ring 8620). */
export function drawRipple(pen: Pen, x: number, y: number, rx: number, ry: number, alpha: number): void {
  const { ctx, spec, z } = pen;
  ctx.strokeStyle = spec.line === 'ink' ? GC(spec.palette.ink, alpha * 0.5) : GC(spec.palette.paper, alpha);
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.beginPath();
  if (spec.line === 'ink') ctx.ellipse(x, y, rx, ry, 0, 0.3, 2.9);
  else ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** The chat bubble: a paper ellipse with three ink dots above the speaker (04 7.5 item 4); never text. */
export function drawChatBubble(pen: Pen, x: number, y: number, hr: number, face: number): void {
  const { ctx, spec, z } = pen;
  const P = spec.palette;
  const rx = hr * 1.25, ry = hr * 0.8;
  const pts: Pt[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    pts.push({ x: x + Math.cos(a) * rx, y: y + Math.sin(a) * ry });
  }
  pts.splice(13, 0, { x: x - face * rx * 0.15, y: y + ry * 1.55 }); // the tail toward the mouth
  fillPoly(pen, pts, P.paper, { seed: 3, contour: true, lineW: Math.max(0.6, 0.5 * z), inkAlpha: 0.8, gapless: true, jitterK: 0.35 });
  ctx.fillStyle = GC(P.ink, 0.9);
  for (let k = -1; k <= 1; k++) {
    ctx.beginPath();
    ctx.arc(x + k * rx * 0.42, y, Math.max(0.6, hr * 0.14), 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ---------- direction C's paper (04 3.2 row Texture, 3.3 item 1) ---------- */
let grainTile: HTMLCanvasElement | null = null;

/** A 256 x 256 value-noise tile, generated once on its own fixed generator (visual only, never the sim stream). */
function paperTile(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(S, S);
  const r = mulberry32(4242);
  const M = 64;
  const lat = new Float32Array(M * M);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const at = (i: number, j: number): number => lat[((j % M) + M) % M * M + (((i % M) + M) % M)] as number;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = (x / S) * M, v = (y / S) * M;
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
      const n0 = at(i, j) + (at(i + 1, j) - at(i, j)) * su, n1 = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
      const n = n0 + (n1 - n0) * sv;
      const speck = r() < 0.06 ? r() * 0.5 : 0; // the cold-press pits of ref2
      const val = Math.round(255 * Math.min(1, Math.max(0, 0.72 + n * 0.28 - speck)));
      const k = (y * S + x) * 4;
      img.data[k] = val;
      img.data[k + 1] = val;
      img.data[k + 2] = val;
      img.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/** Multiply the paper grain over (0, 0, w, h) of a scene canvas in direction C; A and B draw nothing (04 3.2 row Texture). */
export function paperGrain(ctx: CanvasRenderingContext2D, spec: StyleSpec, w: number, h: number, alpha = 0.06): void {
  if (spec.grain !== 'paper') return;
  const tile = paperTile();
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha * 4; // the tile is pale (0.72 to 1.0), so the multiply needs weight to read as 6 % grain
  for (let y = 0; y < h; y += 256) for (let x = 0; x < w; x += 256) ctx.drawImage(tile, x, y);
  ctx.restore();
}

/* ---------- the particle system (GV 2385-2407; 03 7.8 item 1; 04 section 8) ---------- */
export type FxKind =
  | 'heart' | 'petal' | 'leaf' | 'drop' | 'splash' | 'ring' | 'dust' | 'spark' | 'note' | 'flash' | 'firework' | 'wasp' | 'poopDot'
  | 'bubble' | 'hat';
export const FX_KINDS: readonly FxKind[] = [
  'heart', 'petal', 'leaf', 'drop', 'splash', 'ring', 'dust', 'spark', 'note', 'flash', 'firework', 'wasp', 'poopDot', 'bubble', 'hat',
];
/**
 * A particle (GV's P record): ground point x, y in tiles, height z in EH units, velocities per sim second, life l left of m seconds and a
 * phase. Optional: r0 and r1, a ring's radius in tiles from birth to death; gap, the radius of a column the ring passes behind (its back
 * arc is left out there); db, a depth bias (the fountain's spray paints after the fountain). n is the spawn serial, for stable ties.
 */
export type Part = {
  k: FxKind; x: number; y: number; z: number; vx: number; vy: number; vz: number; l: number; m: number; ph: number;
  r0?: number; r1?: number; gap?: number; db?: number; n: number;
};
export const PARTS_CAP = 220; // register 3.3, 03 3.11
export const GRAVITY = 2.6; // EH per sim second squared (GV 2405)
export const WIND_LEAN = 0.15; // tiles per sim second squared per unit of W.wind on drops, petals and leaves; downwind is east (+x)
const parts: Part[] = [];
let serial = 0;

/** The live particles, oldest first (read only; perf counts them). */
export function particles(): readonly Part[] {
  return parts;
}
/** Drop every particle and the spray clocks (a new park or a restore: they belong to the old scene). */
export function clearParticles(): void {
  parts.length = 0;
  sprayAcc.clear();
  ringAcc.clear();
}
/** Add a particle (GV's P, 2386); at the cap the oldest goes (04 section 8 "drop the oldest"; GV refused the new one). */
export function addPart(o: Omit<Part, 'n'>): void {
  const q = o as Part;
  q.n = ++serial;
  if (parts.length >= PARTS_CAP) parts.shift();
  parts.push(q);
}

/** A spawn recipe from GV: spread v (tiles a second), rise vz0 to vz1 (EH a second), life l0 to l1 (s), start height z (EH). */
type Recipe = { v: number; vz0: number; vz1: number; l0: number; l1: number; z: number };
const RECIPES: Partial<Record<FxKind, Recipe>> = {
  heart: { v: 0.15, vz0: 0.5, vz1: 1, l0: 1.6, l1: 1.6, z: 0.8 }, // GV heartFx 2389
  dust: { v: 0.4, vz0: 0.3, vz1: 1.1, l0: 0.5, l1: 1, z: 0.2 }, // GV puff 2387
  spark: { v: 0.5, vz0: 0.5, vz1: 1.4, l0: 1, l1: 1, z: 0.3 }, // GV sparkFx 2390
  splash: { v: 0.7, vz0: 0.7, vz1: 1.8, l0: 0.7, l1: 0.7, z: 0.2 }, // GV splashFx 2392 (its kind 'drop')
  ring: { v: 0, vz0: 0, vz1: 0, l0: 1.1, l1: 1.1, z: 0.02 }, // GV rippleFx 2395
  drop: { v: 0.2, vz0: 1.2, vz1: 1.8, l0: 1, l1: 1, z: 0.5 }, // a spray drop (the fountain's come from ambientFx with their own arcs)
  wasp: { v: 0, vz0: 0, vz1: 0, l0: 6, l1: 6, z: 0.6 }, // GV bee 8617, fluttering in place
};

/**
 * n particles of a kind at ground point (x, y), on the visual stream (03 2.7 effects.spawn). A kind with no drawing yet (petal, leaf, note,
 * flash, firework, poopDot, bubble, hat: their slices show the owner options first, 04 12 item 3) spawns nothing.
 */
export function spawn(kind: FxKind, x: number, y: number, n = 1): void {
  const r = RECIPES[kind];
  if (!r) return;
  for (let i = 0; i < n; i++) {
    const vx = vrnd(-r.v, r.v), vy = vrnd(-r.v, r.v), vz = vrnd(r.vz0, r.vz1), l = vrnd(r.l0, r.l1);
    addPart({ k: kind, x, y, z: r.z, vx, vy, vz, l, m: l, ph: vrnd(0, TAU) });
  }
}

/** Age and move the particles by dt sim seconds (GV updateParts 2396-2407); the frame passes min(0.05, dtr) x T.speed (03 4.1 item 7). */
export function stepParticles(dt: number): void {
  if (!(dt > 0)) return;
  const lean = W.wind * WIND_LEAN * dt, float = Math.pow(0.99, dt * 60);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i] as Part;
    p.l -= dt;
    if (p.l <= 0) {
      parts.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.k === 'heart' || p.k === 'note') p.vz *= float; // they float up and slow (GV 2399, per 1/60 s there)
    else if (p.k !== 'ring' && p.k !== 'wasp' && p.k !== 'flash') {
      p.vz -= GRAVITY * dt;
      if (p.k === 'drop' || p.k === 'petal' || p.k === 'leaf') p.vx += lean;
    }
  }
}

/* ---------- ambient effects: the fountains' spray and ripple rings (GV ambientFx 8818-8847 skeleton; 04 section 8 row fountain spray) ---------- */
/**
 * The spray, matched to props.ts drawFountain: the finial top at e 1.5, the upper bowl's lip r 0.45 at e 0.9, the basin water at e 0.28, the
 * pedestal r 0.17 (a ring's gap 0.19). 12 drops a second (a third over the bowl's lip, the rest a low fan from the finial: up 0.2 to 0.28
 * EH and out 0.3 to 0.4 tile into the bowl, the arc of the board's tile 6), budget 30, ripple rings 0.5 a second for 4 s from r 0.2 to
 * 0.68; db paints them after the fountain, whose depth is at most 1 past its centre.
 */
export const SPRAY = {
  rate: 12, budget: 30, cascade: 1 / 3, top: 1.5, bowl: 0.9, lip: 0.45, basin: 0.28,
  ringRate: 0.5, ringLife: 4, ring0: 0.2, ring1: 0.68, gap: 0.19, db: 1.02, minZoom: 0.45,
} as const;
const sprayAcc = new Map<number, number>(), ringAcc = new Map<number, number>();
const SP0: XY = { x: 0, y: 0 };

/** Seconds until a particle thrown up at vz is `drop` EH below where it started. */
function fallTime(vz: number, drop: number): number {
  return (vz + Math.sqrt(vz * vz + 2 * GRAVITY * drop)) / GRAVITY;
}
function sprayDrop(cx: number, cy: number): void {
  const S = SPRAY, a = vrnd(0, TAU), ca = Math.cos(a), sa = Math.sin(a);
  if (vrng() < S.cascade) {
    const v = vrnd(0.14, 0.26), vz = vrnd(0, 0.25), l = fallTime(vz, S.bowl - S.basin);
    addPart({ k: 'drop', x: cx + ca * S.lip, y: cy + sa * S.lip, z: S.bowl, vx: ca * v, vy: sa * v, vz, l, m: l, ph: 0, db: S.db });
  } else {
    const v = vrnd(0.24, 0.34), vz = vrnd(1.0, 1.2), l = fallTime(vz, S.top - S.bowl);
    addPart({ k: 'drop', x: cx, y: cy, z: S.top, vx: ca * v, vy: sa * v, vz, l, m: l, ph: 0, db: S.db });
  }
}

/** dt sim seconds of ambient spawning: every fountain near the screen and not frozen sprays and rings its basin (zoom >= 0.45, GV 8821). */
function ambientStep(dt: number): void {
  if (!(dt > 0) || cam.z < SPRAY.minZoom || iceState().on === 1) return;
  const S = SPRAY, m = 60 * cam.z;
  let drops = 0;
  for (const q of parts) if (q.k === 'drop') drops++;
  for (const p of props) {
    if (p.kind !== 'fountain') continue;
    const cx = p.x + (p.w - 1) / 2, cy = p.y + (p.h - 1) / 2;
    screenInto(cx, cy, 0, SP0);
    if (SP0.x < -m || SP0.x > view.cw + m || SP0.y < -m || SP0.y > view.chh + m) continue;
    let a = (sprayAcc.get(p.id) ?? 0) + S.rate * dt;
    for (; a >= 1; a--)
      if (drops < S.budget) {
        sprayDrop(cx, cy);
        drops++;
      }
    sprayAcc.set(p.id, a);
    let b = (ringAcc.get(p.id) ?? 1) + S.ringRate * dt;
    for (; b >= 1; b--) {
      const l = S.ringLife;
      addPart({ k: 'ring', x: cx, y: cy, z: S.basin, vx: 0, vy: 0, vz: 0, l, m: l, ph: 0, r0: S.ring0, r1: S.ring1, gap: S.gap, db: S.db });
    }
    ringAcc.set(p.id, b);
  }
}

/** Once a frame (03 4.1 item 9): the ambient particles for this frame's sim time, min(0.05, dt) x T.speed; none while paused (08 4.5 item 2). */
export function ambientFx(dt: number): void {
  if (T.speed <= 0) return;
  ambientStep(Math.min(0.05, dt) * T.speed);
}
/** The harness's fxStep (03 13 Screenshots group, 08 4.1 item 4): n steps of dt of ambient spawning and motion, paused or not. */
export function fxStep(dt: number, n = 1): void {
  for (let i = 0; i < n; i++) {
    ambientStep(dt);
    stepParticles(dt);
  }
}

/** The sim's fx events spawn particles: { kind: 'fx', x, y, params: { fx: <FxKind>, n?: <count> } } (03 7.8 item 1; the payload is ours). */
function onFx(ev: GameEvent): void {
  const k = ev.params?.fx, n = ev.params?.n;
  if (typeof k !== 'string' || ev.x === undefined || ev.y === undefined || !(FX_KINDS as readonly string[]).includes(k)) return;
  spawn(k as FxKind, ev.x, ev.y, typeof n === 'number' ? n : 1);
}
watch('fx', onFx);

/* ---------- particles as painter drawables (03 7.2 item 2: a particle uses its ground point) and their drawing (GV drawPart 8609) ---------- */
type FxDrawable = Drawable & { p: Part | null };
const FX_POOL: FxDrawable[] = [];
const FX_OUT: Drawable[] = [];
const FPEN: Pen = { ctx: null as unknown as CanvasRenderingContext2D, spec: style(), z: 1 };
const PP: XY = { x: 0, y: 0 };

/** One drawable per particle near the screen, depth = its ground point's depth plus its bias, ties by spawn order. Reused each frame. */
export function particleDrawables(): Drawable[] {
  FX_OUT.length = 0;
  const m = 40 + 30 * cam.z, cw = view.cw, chh = view.chh;
  for (const p of parts) {
    screenInto(p.x, p.y, p.z, SP0);
    if (SP0.x < -m || SP0.x > cw + m || SP0.y < -m || SP0.y > chh + m) continue;
    let d = FX_POOL[FX_OUT.length];
    if (!d) {
      d = { depth: 0, kind: 'fx', id: 0, x: 0, y: 0, z: 0, draw: drawPartItem, p: null };
      FX_POOL.push(d);
    }
    d.depth = depthOf(p.x, p.y) + (p.db ?? 0);
    d.id = p.n;
    d.x = p.x;
    d.y = p.y;
    d.z = p.z;
    d.p = p;
    FX_OUT.push(d);
  }
  return FX_OUT;
}
function drawPartItem(d: Drawable, ctx: CanvasRenderingContext2D): void {
  const p = (d as FxDrawable).p;
  if (p) drawPart(p, ctx);
}

/** A ring on water: a pale ellipse widening and fading; with a gap, its back arc behind the column is left out (GV ring 8620). */
function drawRing(pen: Pen, p: Part, q: XY, a: number): void {
  const { ctx, z } = pen, f = 1 - a;
  let rx: number, ry: number, a0 = 0, a1 = TAU;
  if (p.r0 !== undefined && p.r1 !== undefined) {
    const R = p.r0 + (p.r1 - p.r0) * f; // a world circle of radius R lands as R x 0.707 TW by R x 0.707 TH
    if (p.gap) {
      if (R <= p.gap) return;
      const dl = Math.asin(p.gap / R);
      a0 = -Math.PI / 2 + dl;
      a1 = 1.5 * Math.PI - dl;
    }
    rx = R * Math.SQRT1_2 * TW * z;
    ry = R * Math.SQRT1_2 * TH * z;
  } else {
    rx = 8 * z * (0.3 + f * 1.6);
    ry = 8 * z * (0.15 + f * 0.8);
  }
  ctx.strokeStyle = GC(pen.spec.palette.paper, 0.5 * a);
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.beginPath();
  ctx.ellipse(q.x, q.y, rx, ry, 0, a0, a1);
  ctx.stroke();
}

/** Draw one particle where it is, in direction A (GV drawPart 8609-8626 for the kinds Parque draws today; 04 section 8). */
export function drawPart(p: Part, ctx: CanvasRenderingContext2D): void {
  FPEN.ctx = ctx;
  FPEN.spec = style();
  FPEN.z = cam.z;
  const pen = FPEN, PL = pen.spec.palette, z = cam.z, s = 8 * z, a = clamp01(p.l / p.m);
  const q = screenInto(p.x, p.y, p.z, PP);
  const dot = (hex: string, alpha: number, r: number): void => {
    ctx.fillStyle = GC(hex, alpha);
    ctx.beginPath();
    ctx.arc(q.x, q.y, Math.max(0.5, r), 0, TAU);
    ctx.fill();
  };
  switch (p.k) {
    case 'drop':
      drawSprayDot(pen, q.x, q.y, s, 0.7 * (0.55 + 0.45 * a));
      break;
    case 'splash':
      dot(PL.splash, a * 0.9, s * 0.22);
      break;
    case 'dust':
      dot(PL.dust, a * 0.5, s * 0.5);
      break;
    case 'spark':
      dot(PL.lamp, a, s * 0.25);
      break;
    case 'heart':
      drawHeart(pen, q.x, q.y, s, a, PL.rose);
      break;
    case 'ring':
      drawRing(pen, p, q, a);
      break;
    case 'wasp': {
      const t = T.abs * DAYLEN, jx = Math.sin(t * 20 + p.ph) * s * 0.18, jy = Math.sin(t * 27 + p.ph * 1.3) * s * 0.12;
      ctx.fillStyle = GC(PL.ink, 0.9);
      ctx.beginPath();
      ctx.ellipse(q.x + jx, q.y + jy, s * 0.085, s * 0.055, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = GC(PL.waspStripe, 0.95);
      ctx.fillRect(q.x + jx - s * 0.02, q.y + jy - s * 0.05, s * 0.04, s * 0.1);
      break;
    }
    default:
      break; // petal, leaf, note, flash, firework, poopDot, bubble, hat: never spawned until their slice draws them
  }
}

/** Phase 8 of the pipeline (03 7.9): screen-space rain and snow and the fog wash. S2 draws no weather (07 S2.9); S9 ports GV 10062-10105. */
export function drawWeatherOverlay(): void {
  // TODO(S9): rain dashes and snow discs hashed from index and T.abs x DAYLEN (08 4.5 item 1), the fog wash at FOGA x 0.55
}
