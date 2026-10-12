// src/render/props.ts
// The props of the Style Gate board in the three treatments: the three-globe lamp with its halo and pool, the 2 x 2 fountain, the
// bistro table, and the Haussmann facade bay with the cafe awning, lit windows at night and the near-side cutaway (04 6.1, 6.2, 6.4;
// 3.2); the board's bench is props-park.ts's, re-exported here. Every prop draws in world space through a Proj so it turns with the camera (GV `wp`).
// The game side, direction A only (04 3.4): drawProp dispatching every placed kind (the kiosk, bandstand, picnic and bridge come from
// props-park.ts, trees and hedges from flora.ts), and the props as painter drawables with their depth keys and culls (03 2.7 props.ts row,
// 7.2, 7.7, 15.2 item 6; 04 6.1). The board's primitives are reused for the bench, lamp, fountain and table.
// Ported from GV 6953-6960 (wp, poly, faceVis, faceLight idea), 7978-8010 (drawLantern: post, bracket, the halo gradient and the lit pane
// with its highlight), 9540-9553 (drawProp: the kind dispatcher), 6837-6848 (the cull below a few pixels).
// Verdict: ADAPT. Changes: the hanging lantern became the three-globe Paris lamp (ref3); boxes are iso quads lit by faceLight; the
// direction's brush draws every face; the bench and the table order their parts by the projection, so all four facings and every camera
// angle paint right (the board's own order is unchanged); a wet bench darkens to x 0.86; a lamp's glow fades in (glow); in the game the
// fountain leaves its spray and ripples to effects.ambientFx (03 7.7 item 4); a bandstand and a bridge are two drawables, back and front,
// so people inside paint between them (GV frontFix 8871 idea; 03 7.2).
// Dropped from the range: the house kit beyond the box primitives (6952-8044), the gnome, critter and part branches of drawProp
// (figures.ts, creatures.ts and effects.ts own those).
// TODO(S4, S6): easel, crumbs, peel, sprinkler, rowboat, umbrella. TODO(S9): the halo breath, snow caps, a halo pool cap of 24 (04 10.2).
import { EH, TH, TW, cam, view } from './camera.ts';
import {
  GC, faceLight, fillEllipse, fillPoly, h01, inkLine, lampGlow, mix, shade, skyRamp, strokeLine,
  type Pen, type Proj, type Pt,
} from './ambient.ts';
import { drawRipple, drawSprayDot } from './effects.ts';
import { css, hx, mixc, type XY } from '../core/math.ts';
import { tick } from '../core/loop.ts';
import { I, WET, inB, props, type Prop, type PropKind } from '../world/grid.ts';
import { iceState } from '../world/water.ts';
import { screenInto } from './project.ts';
import { depthOf, footprintDepth, type Drawable } from './order.ts';
import { SPECIES_HEIGHT, drawHedge, drawTreeProp, gamePen, gameProj, renderCtx, type Species } from './flora.ts';
import { drawBandstand, drawBench, drawBridge, drawKiosk, drawPicnic } from './props-park.ts';

export { treeSprite } from './flora.ts';
/** The bench lives in props-park.ts (AGENTS rule 9); the Style Gate board imports it from here. */
export { drawBench } from './props-park.ts';

type W3 = readonly [number, number, number]; // world x, y, e

function quad(proj: Proj, ...w: W3[]): Pt[] {
  return w.map(([x, y, e]) => proj(x, y, e));
}

/** The leftmost and rightmost screen points of a world circle at height e (sampled, so it holds at any camera angle). */
function sides(proj: Proj, cx: number, cy: number, r: number, e: number): [Pt, Pt] {
  let l: Pt = { x: Infinity, y: 0 }, rr: Pt = { x: -Infinity, y: 0 };
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const p = proj(cx + Math.cos(a) * r, cy + Math.sin(a) * r, e);
    if (p.x < l.x) l = p;
    if (p.x > rr.x) rr = p;
  }
  return [l, rr];
}

function ring(proj: Proj, cx: number, cy: number, r: number, e: number, n = 16, ry = r): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(proj(cx + Math.cos(a) * r, cy + Math.sin(a) * ry, e));
  }
  return out;
}

/** A vertical cylinder from e0 to e1: the side (one quad between the screen extremes) and the top disc. */
function cylinder(pen: Pen, proj: Proj, cx: number, cy: number, r: number, e0: number, e1: number, hex: string, seed: number, grad = true): void {
  const [l0, r0] = sides(proj, cx, cy, r, e0), [l1, r1] = sides(proj, cx, cy, r, e1);
  const body = [l0, r0, r1, l1];
  fillPoly(pen, body, hex, { seed, light: 0.9, grad: grad ? { from: l1, to: r1, k0: 1.08, k1: 0.86 } : undefined, away: false });
  fillPoly(pen, ring(proj, cx, cy, r, e1), hex, { seed: seed + 1, light: 1.02, gapless: true });
}

/* ---------- the three-globe lamp (04 6.2; ref3) ---------- */
/** glow: how far the lamp has come on, 0 to 1 (ambient.lampGlow: a 0.02-day fade, 04 10.1 item 4); 1 when left out (the board). */
export type LampOpts = { lit: boolean; charm?: boolean; breath?: number; glow?: number };

/** The ground pool of a lit lamp standing at p: 1.6 x 0.8 tiles at alpha 0.16, fading to nothing at 3 tiles (04 6.1, 6.2 item 4). */
export function drawLampPool(pen: Pen, p: Pt, o: LampOpts): void {
  if (!o.lit) return;
  const { ctx, spec, z } = pen;
  const k = o.charm ? 1.4 : 1;
  const R = 3 * TW * z * k;
  const inner = (1.6 / 3) * (1 + (o.breath ?? 0) * 0.05);
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
  const halo = hx(spec.palette.halo);
  const a = 0.16 * (o.charm ? 1.3 : 1) * (o.glow ?? 1);
  g.addColorStop(0, css(halo, a));
  g.addColorStop(inner, css(halo, a));
  g.addColorStop(1, css(halo, 0));
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1, TH / TW);
  ctx.translate(-p.x, -p.y);
  ctx.fillStyle = g;
  ctx.fillRect(p.x - R, p.y - R, R * 2, R * 2);
  ctx.restore();
}

/** The lamp at ground point p: fluted post 1.4 EH, base disc, two curved arms, three globes; lit globes glow (04 6.2). */
export function drawLamp(pen: Pen, p: Pt, o: LampOpts): void {
  const { ctx, spec, z } = pen;
  const P = spec.palette;
  const tile = TW * z;
  const post = 1.4 * EH * z;
  const postW = 0.06 * tile;
  const top = p.y - post;
  // the base disc and the foot
  const thin = Math.max(0.6, 0.6 * z);
  fillEllipse(pen, p.x, p.y, 0.15 * tile, 0.15 * tile * (TH / TW), P.zinc, { seed: 41, light: 0.95, noInk: true });
  fillPoly(pen, [{ x: p.x - postW * 1.4, y: p.y }, { x: p.x + postW * 1.4, y: p.y }, { x: p.x + postW * 0.9, y: p.y - 0.12 * EH * z }, { x: p.x - postW * 0.9, y: p.y - 0.12 * EH * z }], P.zinc, { seed: 42, light: 0.9, noInk: true });
  // the post, fluted at zoom 1.3 and over
  fillPoly(pen, [{ x: p.x - postW / 2, y: p.y - 0.1 * EH * z }, { x: p.x + postW / 2, y: p.y - 0.1 * EH * z }, { x: p.x + postW * 0.4, y: top }, { x: p.x - postW * 0.4, y: top }], P.zinc, { seed: 43, grad: { from: { x: p.x - postW / 2, y: top }, to: { x: p.x + postW / 2, y: top }, k0: 1.1, k1: 0.8 } });
  if (z >= 1.3 && spec.id !== 'B') {
    ctx.strokeStyle = spec.id === 'C' ? GC(P.ink, 0.35) : shade(P.zinc, 0.8, 0.6);
    ctx.lineWidth = Math.max(0.4, 0.3 * z);
    ctx.beginPath();
    for (const k of [-0.25, 0, 0.25]) {
      ctx.moveTo(p.x + postW * k, p.y - 0.14 * EH * z);
      ctx.lineTo(p.x + postW * k * 0.8, top + 2 * z);
    }
    ctx.stroke();
  }
  // the collar and the two arms curving out and up 0.22 tile each side
  fillEllipse(pen, p.x, top, postW * 1.1, postW * 0.5, P.zinc, { seed: 44, gapless: true });
  const armOut = 0.22 * tile, armUp = 0.12 * tile;
  const armW = Math.max(0.8, 0.035 * tile);
  const globes: Pt[] = [];
  for (const side of [-1, 1]) {
    const pts: Pt[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push({ x: p.x + side * armOut * Math.sin((t * Math.PI) / 2), y: top - armUp * (1 - Math.cos((t * Math.PI) / 2)) + 1.5 * z });
    }
    strokeLine(pen, pts, P.zinc, armW, { open: true, seed: 45 + side });
    globes.push({ x: p.x + side * armOut, y: top - armUp - 0.07 * tile });
  }
  // the centre spike and its higher globe (0.12 tile higher)
  strokeLine(pen, [{ x: p.x, y: top }, { x: p.x, y: top - armUp - 0.12 * tile }], P.zinc, armW, { open: true, seed: 48 });
  globes.push({ x: p.x, y: top - armUp - 0.12 * tile - 0.08 * tile });
  const gr = 0.11 * tile;
  const gk = o.glow ?? 1; // a lamp coming on fades its glow in (04 10.1 item 4); the board's lamps are fully on
  if (o.lit) {
    // the halo round the head (GV 7995 recipe) and the glow on each globe
    const hr = 0.9 * tile * (o.charm ? 1.4 : 1) * (1 + (o.breath ?? 0) * 0.05);
    const halo = hx(P.halo);
    const hy = top - armUp - 0.08 * tile;
    const g = ctx.createRadialGradient(p.x, hy, 0, p.x, hy, hr);
    g.addColorStop(0, css(halo, 0.32 * (o.charm ? 1.3 : 1) * gk));
    g.addColorStop(1, css(halo, 0));
    ctx.fillStyle = g;
    ctx.fillRect(p.x - hr, hy - hr, hr * 2, hr * 2);
  }
  for (const [i, gp] of globes.entries()) {
    if (o.lit) {
      const gg = ctx.createRadialGradient(gp.x, gp.y, 0, gp.x, gp.y, gr * 3);
      gg.addColorStop(0, css(hx(P.lamp), 0.7 * gk));
      gg.addColorStop(0.4, css(hx(P.lamp), 0.3 * gk));
      gg.addColorStop(1, css(hx(P.lamp), 0));
      ctx.fillStyle = gg;
      ctx.fillRect(gp.x - gr * 3, gp.y - gr * 3, gr * 6, gr * 6);
      fillEllipse(pen, gp.x, gp.y, gr, gr, gk < 1 ? mix(P.paper, P.lamp, gk) : P.lamp, { seed: 50 + i, gapless: true, light: 1.02, lineW: thin, inkAlpha: 0.7 });
      ctx.fillStyle = GC(P.paper, 0.9);
      ctx.beginPath();
      ctx.arc(gp.x - gr * 0.35, gp.y - gr * 0.35, Math.max(0.6, gr * 0.22), 0, Math.PI * 2);
      ctx.fill();
    } else {
      fillEllipse(pen, gp.x, gp.y, gr, gr, P.paper, { seed: 50 + i, gapless: true, alpha: 0.9, light: 0.98, rim: true, lineW: thin, inkAlpha: 0.8 });
      if (spec.id === 'A') {
        ctx.fillStyle = shade(P.zinc, 0.9, 0.35);
        ctx.beginPath();
        ctx.arc(gp.x + gr * 0.25, gp.y + gr * 0.25, gr * 0.6, -0.4, 1.9);
        ctx.fill();
      }
    }
    // the cap on each globe
    fillPoly(pen, [{ x: gp.x - gr * 0.55, y: gp.y - gr * 0.82 }, { x: gp.x + gr * 0.55, y: gp.y - gr * 0.82 }, { x: gp.x, y: gp.y - gr * 1.3 }], P.zinc, { seed: 60 + i, gapless: true, lineW: thin });
  }
}

/* ---------- the fountain (04 6.1 row fountain) ---------- */
/** fx false leaves the spray and the ripple rings to effects.ambientFx (the game, 03 7.7 item 4); the board draws them here at `phase`. */
export type FountainOpts = { frozen?: boolean; phase?: number; fx?: boolean };

/** A 2 x 2 fountain whose north-west tile is (x, y): octagonal basin, water disc, pedestal, upper bowl, column, spray, ripples. */
export function drawFountain(pen: Pen, proj: Proj, x: number, y: number, o: FountainOpts = {}): void {
  const { ctx, spec, z } = pen;
  const P = spec.palette;
  const cx = x + 0.5, cy = y + 0.5;
  const R = 0.95, Ri = 0.78, wallH = 0.3;
  const oct = (r: number, e: number): W3[] => {
    const out: W3[] = [];
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, e]);
    }
    return out;
  };
  const lo = oct(R, 0), hi = oct(R, wallH), inner = oct(Ri, wallH);
  // the wall faces, far ones first: a face is "far" when its outward normal points away from the viewer
  const faces: Array<{ i: number; depth: number }> = [];
  for (let i = 0; i < 8; i++) {
    const a = lo[i] as W3, b = lo[(i + 1) % 8] as W3;
    const pa = proj(a[0], a[1], 0), pb = proj(b[0], b[1], 0);
    faces.push({ i, depth: (pa.y + pb.y) / 2 });
  }
  faces.sort((p, q) => p.depth - q.depth);
  const drawFace = (i: number): void => {
    const a = lo[i] as W3, b = lo[(i + 1) % 8] as W3, c = hi[(i + 1) % 8] as W3, d = hi[i] as W3;
    const nx = (a[0] + b[0]) / 2 - cx, ny = (a[1] + b[1]) / 2 - cy;
    const l = faceLight(nx, ny);
    fillPoly(pen, quad(proj, a, b, c, d), P.stone, { seed: 70 + i, light: l, away: l < 0.84 });
  };
  const half = faces.length / 2;
  for (let k = 0; k < half; k++) drawFace((faces[k] as { i: number }).i);
  // the coping: the top octagon in stone, then the water disc (or ice) inside it
  fillPoly(pen, quad(proj, ...hi), P.stone, { seed: 81, light: 1.04, noInk: true });
  const water = ring(proj, cx, cy, Ri * 0.97, wallH - 0.02, 24);
  if (o.frozen) {
    fillPoly(pen, water, P.ice, { seed: 80, noInk: true, light: 1 });
    ctx.strokeStyle = GC(P.iceHi, 0.8);
    ctx.lineWidth = Math.max(0.6, 0.8 * z);
    ctx.beginPath();
    const c0 = proj(cx, cy, wallH - 0.06);
    for (const [ax, ay] of [[-0.3, 0.2], [0.25, -0.15], [0.05, 0.3]] as const) {
      const q = proj(cx + ax, cy + ay, wallH - 0.06);
      ctx.moveTo(c0.x + (q.x - c0.x) * 0.3, c0.y + (q.y - c0.y) * 0.3);
      ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
  } else {
    const [top] = skyRamp(spec, 0.5);
    const sheen = mixc(hx(P.water), top, 0.35);
    fillPoly(pen, water, P.water, { seed: 80, noInk: true, alpha: spec.id === 'C' ? 0.6 : 1 });
    const c0 = proj(cx, cy, wallH - 0.02);
    ctx.fillStyle = css(mixc(sheen, hx(P.paper), 0.3), spec.id === 'C' ? 0.25 : 0.35);
    ctx.beginPath();
    ctx.ellipse(c0.x - 0.15 * TW * z, c0.y - 0.08 * TH * z, 0.42 * TW * z, 0.22 * TH * z, 0, 0, Math.PI * 2);
    ctx.fill();
    if (o.fx !== false)
      for (const [k, rr] of [[0, 0.22], [1, 0.42]] as const) {
        const ph = ((o.phase ?? 0) + k * 0.5) % 1;
        drawRipple(pen, c0.x, c0.y, (rr + ph * 0.25) * TW * z, (rr + ph * 0.25) * TH * z, 0.5 * (1 - ph));
      }
  }
  if (spec.line === 'ink') {
    inkLine(pen, quad(proj, ...hi), { seed: 83 });
    inkLine(pen, quad(proj, ...inner), { seed: 84, inkAlpha: 0.6 });
  } else {
    ctx.strokeStyle = shade(P.stone, 0.86, 0.6);
    ctx.lineWidth = Math.max(0.5, 0.6 * z);
    const inn = quad(proj, ...inner);
    ctx.beginPath();
    ctx.moveTo((inn[0] as Pt).x, (inn[0] as Pt).y);
    for (let i = 1; i <= 8; i++) ctx.lineTo((inn[i % 8] as Pt).x, (inn[i % 8] as Pt).y);
    ctx.stroke();
  }
  // the pedestal, the upper bowl, the column and its finial
  cylinder(pen, proj, cx, cy, 0.17, wallH - 0.02, 0.58, P.stone, 90);
  const [bl, br] = sides(proj, cx, cy, 0.45, 0.9), [pl, pr] = sides(proj, cx, cy, 0.2, 0.62);
  fillPoly(pen, [pl, pr, br, bl], P.stone, { seed: 92, light: 0.9, grad: { from: bl, to: br, k0: 1.06, k1: 0.86 } });
  fillPoly(pen, ring(proj, cx, cy, 0.45, 0.92, 20), P.stone, { seed: 93, light: 1.03 });
  if (!o.frozen) fillPoly(pen, ring(proj, cx, cy, 0.36, 0.9, 20), P.water, { seed: 94, noInk: true, alpha: spec.id === 'C' ? 0.6 : 1, light: 1.05 });
  else fillPoly(pen, ring(proj, cx, cy, 0.36, 0.9, 20), P.ice, { seed: 94, noInk: true });
  cylinder(pen, proj, cx, cy, 0.07, 0.88, 1.38, P.stone, 95);
  const fin = proj(cx, cy, 1.5);
  fillEllipse(pen, fin.x, fin.y, 0.08 * TW * z, 0.08 * TW * z, P.stone, { seed: 97, gapless: true, light: 1.02 });
  if (!o.frozen && o.fx !== false) {
    // the spray: dots on arcs from the finial into the upper bowl, and from its rim into the basin (12/s, 04 section 8)
    const ph = o.phase ?? 0;
    const s = 8 * z;
    for (let i = 0; i < 10; i++) {
      const t = (h01(i, 1, 5) + ph) % 1;
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const rr = 0.38 * t;
      const q = proj(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.5 + Math.sin(t * Math.PI) * 0.5 - t * 0.55);
      drawSprayDot(pen, q.x, q.y, s, 0.7 * (1 - t * 0.4));
    }
    for (let i = 0; i < 8; i++) {
      const t = (h01(i, 2, 6) + ph * 1.3) % 1;
      const a = (i / 8) * Math.PI * 2 + 0.9;
      const rr = 0.45 + 0.3 * t;
      const q = proj(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.9 - t * t * 0.62);
      drawSprayDot(pen, q.x, q.y, s * 0.9, 0.6 * (1 - t * 0.5));
    }
  }
  for (let k = half; k < faces.length; k++) drawFace((faces[k] as { i: number }).i);
  if (o.frozen) {
    // frost on the rim
    ctx.strokeStyle = GC(P.iceHi, 0.9);
    ctx.lineWidth = Math.max(0.8, 1.2 * z);
    ctx.beginPath();
    const rim = quad(proj, ...hi);
    ctx.moveTo((rim[0] as Pt).x, (rim[0] as Pt).y);
    for (let i = 1; i <= 8; i++) ctx.lineTo((rim[i % 8] as Pt).x, (rim[i % 8] as Pt).y);
    ctx.stroke();
  }
}

/* ---------- the bistro table (04 6.1 row table) ---------- */
/** A round cafe table with two bistro chairs on tile (x, y); the chairs sit at u = +-0.42 along world x. */
export function drawBistroTable(pen: Pen, proj: Proj, x: number, y: number): void {
  const P = pen.spec.palette;
  const chair = (u: number, seed: number): void => {
    const cxx = x + u, back = u < 0 ? -0.14 : 0.14;
    const legW = Math.max(0.6, 0.8 * pen.z);
    for (const [dx, dy] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]] as const)
      strokeLine(pen, quad(proj, [cxx + dx, y + dy, 0], [cxx + dx, y + dy, 0.3]), P.zinc, legW, { open: true, seed, noInk: true });
    fillPoly(pen, quad(proj, [cxx - 0.13, y - 0.13, 0.3], [cxx + 0.13, y - 0.13, 0.3], [cxx + 0.13, y + 0.13, 0.3], [cxx - 0.13, y + 0.13, 0.3]), P.sky, { seed, light: 1.02 });
    const bx = cxx + back;
    fillPoly(pen, quad(proj, [bx, y - 0.13, 0.3], [bx, y + 0.13, 0.3], [bx, y + 0.13, 0.62], [bx, y - 0.13, 0.62]), P.sky, { seed: seed + 1, away: back > 0, light: 0.92 });
  };
  const first = proj(x - 0.42, y).y <= proj(x + 0.42, y).y ? -0.42 : 0.42; // the farther chair first, at any angle
  chair(first, first < 0 ? 100 : 110);
  const legW = Math.max(0.8, 1.1 * pen.z);
  fillEllipse(pen, proj(x, y).x, proj(x, y).y, 0.14 * TW * pen.z, 0.14 * TH * pen.z, P.zinc, { seed: 103, noInk: true, light: 0.9 });
  strokeLine(pen, quad(proj, [x, y, 0], [x, y, 0.48]), P.zinc, legW, { open: true, seed: 104 });
  cylinder(pen, proj, x, y, 0.25, 0.46, 0.5, P.paper, 105, false);
  chair(-first, first < 0 ? 110 : 100);
}

/* ---------- the Haussmann facade bay (04 6.4 rows facades, cafe; the near-side cutaway) ---------- */
export type FacadeOpts = { f: number; cutaway?: boolean; cafe?: boolean; seed?: number; tables?: boolean };

/** One bay 2 tiles wide standing on (x0, y0) to (x0 + 2, y0 + 1.2), its front face at y0 + 1.2, 6 EH high (5 storeys and a mansard). */
export function drawFacadeBay(pen: Pen, proj: Proj, x0: number, y0: number, o: FacadeOpts): void {
  const { ctx, spec, z } = pen;
  const P = spec.palette;
  const x1 = x0 + 2, y1 = y0 + 1.2;
  const seed = o.seed ?? 1;
  const night = o.f >= 0.8 || o.f < 0.28;
  const lf = faceLight(0, 1), ls = faceLight(1, 0);
  const wallTop = o.cutaway ? 0.6 : 5.0;
  const alpha = o.cutaway ? 0.35 : 1;
  const shop = mix(P.ink, P.foliageSummer, 0.35);
  // the side face (x = x1) in shade, then the front face with a soft vertical gradient in A
  fillPoly(pen, quad(proj, [x1, y0, 0], [x1, y1, 0], [x1, y1, wallTop], [x1, y0, wallTop]), P.stone, { seed: seed + 1, light: ls, away: true, alpha });
  const fTL = proj(x0, y1, wallTop), fBL = proj(x0, y1, 0);
  fillPoly(pen, quad(proj, [x0, y1, 0], [x1, y1, 0], [x1, y1, wallTop], [x0, y1, wallTop]), P.stone, { seed: seed + 2, light: lf, alpha, grad: { from: fTL, to: fBL, k0: 1.06, k1: 0.94 } });
  // the shop front: a dark panel with a wide window and a door; the cafe's window glows at night
  const shopTop = o.cutaway ? 0.6 : 1.05;
  fillPoly(pen, quad(proj, [x0 + 0.06, y1, 0], [x1 - 0.06, y1, 0], [x1 - 0.06, y1, shopTop], [x0 + 0.06, y1, shopTop]), shop, { seed: seed + 3, light: lf, alpha, noInk: true });
  const winHex = night && o.cafe ? P.lamp : P.sky;
  fillPoly(pen, quad(proj, [x0 + 0.18, y1, 0.2], [x0 + 1.15, y1, 0.2], [x0 + 1.15, y1, Math.min(shopTop - 0.12, 0.85)], [x0 + 0.18, y1, Math.min(shopTop - 0.12, 0.85)]), winHex, { seed: seed + 4, light: night && o.cafe ? 1.1 : 0.95, alpha, gapless: true });
  fillPoly(pen, quad(proj, [x0 + 1.35, y1, 0], [x0 + 1.8, y1, 0], [x0 + 1.8, y1, Math.min(shopTop - 0.12, 0.85)], [x0 + 1.35, y1, Math.min(shopTop - 0.12, 0.85)]), mix(shop, P.paper, 0.25), { seed: seed + 5, light: lf, alpha, gapless: true });
  if (o.cutaway) {
    // the near-side rule: only the ground floor band, 0.6 EH, at alpha 0.35, no roof (04 6.4)
    return;
  }
  // four storeys of windows, two per bay, in zinc frames; 40 % lit at night, chosen per window by h01 so the pattern holds
  const ww = 0.36, wh = 0.62;
  for (let row = 0; row < 4; row++) {
    const e0 = 1.25 + row * 0.95;
    for (const u of [0.5, 1.5]) {
      const lit = night && h01(seed, row, u * 10) < 0.4;
      const hex = lit ? P.lamp : P.sky;
      const wq = quad(proj, [x0 + u - ww / 2, y1, e0], [x0 + u + ww / 2, y1, e0], [x0 + u + ww / 2, y1, e0 + wh], [x0 + u - ww / 2, y1, e0 + wh]);
      if (lit) {
        ctx.fillStyle = GC(P.lamp, 0.25);
        ctx.beginPath();
        ctx.moveTo((wq[0] as Pt).x - 2, (wq[0] as Pt).y + 2);
        ctx.lineTo((wq[1] as Pt).x + 2, (wq[1] as Pt).y + 2);
        ctx.lineTo((wq[2] as Pt).x + 2, (wq[2] as Pt).y - 2);
        ctx.lineTo((wq[3] as Pt).x - 2, (wq[3] as Pt).y - 2);
        ctx.closePath();
        ctx.fill();
      }
      fillPoly(pen, wq, hex, { seed: seed + 10 + row * 2 + u, light: lit ? 1.05 : 0.92, alpha: lit ? 0.85 : 1, gapless: true });
      if (spec.id !== 'C') {
        ctx.strokeStyle = shade(P.zinc, 0.9);
        ctx.lineWidth = Math.max(0.5, 0.5 * z);
        ctx.beginPath();
        ctx.moveTo((wq[0] as Pt).x, (wq[0] as Pt).y);
        for (let i = 1; i < 4; i++) ctx.lineTo((wq[i] as Pt).x, (wq[i] as Pt).y);
        ctx.closePath();
        ctx.stroke();
      }
      // the glazing bar
      ctx.strokeStyle = spec.id === 'C' ? GC(P.ink, 0.5) : shade(P.zinc, 0.9, 0.7);
      ctx.lineWidth = Math.max(0.4, 0.4 * z);
      const m0 = proj(x0 + u, y1, e0), m1 = proj(x0 + u, y1, e0 + wh);
      ctx.beginPath();
      ctx.moveTo(m0.x, m0.y);
      ctx.lineTo(m1.x, m1.y);
      ctx.stroke();
    }
    // the string course between storeys
    strokeLine(pen, quad(proj, [x0, y1 + 0.02, e0 - 0.08], [x1, y1 + 0.02, e0 - 0.08]), P.stone, Math.max(0.6, 0.9 * z), { open: true, light: 0.86, noInk: true });
  }
  // wrought-iron balconies on rows 2 and 5 (the storey above the shop, and the long one under the mansard)
  const balcony = (e: number, outAll: boolean, s: number): void => {
    const d = 0.14;
    const u0 = outAll ? 0.0 : 0.3, u1 = outAll ? 2.0 : 1.7;
    fillPoly(pen, quad(proj, [x0 + u0, y1, e], [x0 + u1, y1, e], [x0 + u1, y1 + d, e], [x0 + u0, y1 + d, e]), P.stone, { seed: s, light: 1.02, noInk: true, alpha });
    const railW = Math.max(0.5, 0.6 * z);
    const iron = mix(P.ink, P.zinc, 0.1);
    strokeLine(pen, quad(proj, [x0 + u0, y1 + d, e + 0.42], [x0 + u1, y1 + d, e + 0.42]), iron, railW, { open: true, seed: s + 1 });
    const n = outAll ? 10 : 7;
    for (let i = 0; i <= n; i++) {
      const u = u0 + ((u1 - u0) * i) / n;
      strokeLine(pen, quad(proj, [x0 + u, y1 + d, e], [x0 + u, y1 + d, e + 0.42]), iron, railW * 0.9, { open: true, seed: s + 2 + i, noInk: true });
    }
    if (spec.id === 'C') inkLine(pen, quad(proj, [x0 + u0, y1 + d, e], [x0 + u1, y1 + d, e]), { open: true, seed: s + 20, inkAlpha: 0.7 });
  };
  balcony(1.25 + 0.95, false, seed + 30);
  balcony(1.25 + 3 * 0.95 + 0.92, true, seed + 40);
  // the mansard: a slanted zinc face set back 0.45 tile, two dormers, a chimney; the side gable
  fillPoly(pen, quad(proj, [x1, y0, 5.0], [x1, y1, 5.0], [x1, y1 - 0.45, 6.0], [x1, y0, 6.0]), P.zinc, { seed: seed + 50, light: ls * 0.9, away: true });
  fillPoly(pen, quad(proj, [x0, y1, 5.0], [x1, y1, 5.0], [x1, y1 - 0.45, 6.0], [x0, y1 - 0.45, 6.0]), P.zinc, { seed: seed + 51, light: lf * 1.02, grad: { from: proj(x0, y1 - 0.45, 6.0), to: proj(x0, y1, 5.0), k0: 1.08, k1: 0.9 } });
  fillPoly(pen, quad(proj, [x0, y0, 6.0], [x1, y0, 6.0], [x1, y1 - 0.45, 6.0], [x0, y1 - 0.45, 6.0]), P.zinc, { seed: seed + 52, light: 1.08, noInk: true });
  for (const u of [0.5, 1.5]) {
    const dy = y1 - 0.22, dw = 0.26, de0 = 5.15, de1 = 5.7;
    fillPoly(pen, quad(proj, [x0 + u + dw, dy - 0.2, de0], [x0 + u + dw, dy, de0], [x0 + u + dw, dy, de1], [x0 + u + dw, dy - 0.2, de1]), P.stone, { seed: seed + 60 + u, light: ls, away: true });
    fillPoly(pen, quad(proj, [x0 + u - dw, dy, de0], [x0 + u + dw, dy, de0], [x0 + u + dw, dy, de1], [x0 + u - dw, dy, de1]), P.stone, { seed: seed + 61 + u, light: lf });
    const lit = night && h01(seed, 9, u * 10) < 0.4;
    fillPoly(pen, quad(proj, [x0 + u - 0.14, dy, de0 + 0.1], [x0 + u + 0.14, dy, de0 + 0.1], [x0 + u + 0.14, dy, de1 - 0.1], [x0 + u - 0.14, dy, de1 - 0.1]), lit ? P.lamp : P.sky, { seed: seed + 62 + u, light: lit ? 1.05 : 0.92, gapless: true });
    fillPoly(pen, quad(proj, [x0 + u - dw - 0.05, dy + 0.05, de1], [x0 + u + dw + 0.05, dy + 0.05, de1], [x0 + u + dw + 0.05, dy - 0.3, de1 + 0.22], [x0 + u - dw - 0.05, dy - 0.3, de1 + 0.22]), P.zinc, { seed: seed + 63 + u, light: 1.0 });
  }
  const chx = x0 + 1.7, chy = y0 + 0.25;
  fillPoly(pen, quad(proj, [chx + 0.12, chy - 0.1, 6.0], [chx + 0.12, chy + 0.1, 6.0], [chx + 0.12, chy + 0.1, 6.45], [chx + 0.12, chy - 0.1, 6.45]), P.stone, { seed: seed + 70, light: ls, away: true });
  fillPoly(pen, quad(proj, [chx - 0.12, chy + 0.1, 6.0], [chx + 0.12, chy + 0.1, 6.0], [chx + 0.12, chy + 0.1, 6.45], [chx - 0.12, chy + 0.1, 6.45]), P.stone, { seed: seed + 71, light: lf });
  fillPoly(pen, quad(proj, [chx - 0.12, chy - 0.1, 6.45], [chx + 0.12, chy - 0.1, 6.45], [chx + 0.12, chy + 0.1, 6.45], [chx - 0.12, chy + 0.1, 6.45]), P.stone, { seed: seed + 72, light: 1.06, noInk: true });
  if (o.cafe) drawAwning(pen, proj, x0, y1, seed);
  if (o.tables !== false) {
    drawBistroTable(pen, proj, x0 + 0.5, y1 + 0.75);
    drawBistroTable(pen, proj, x0 + 1.5, y1 + 0.75);
  }
}

/** The striped cafe awning over the shop front, with "CAFE" as four paper blocks on the fascia above it (04 6.4 row cafe). */
function drawAwning(pen: Pen, proj: Proj, x0: number, y1: number, seed: number): void {
  const { spec, z } = pen;
  const P = spec.palette;
  const x1 = x0 + 2;
  const out = 0.55, eWall = 1.15, eEdge = 0.95;
  // the four letter blocks on the fascia
  for (let k = 0; k < 4; k++) {
    const u = 0.45 + k * 0.3;
    fillPoly(pen, quad(proj, [x0 + u, y1, 1.22], [x0 + u + 0.2, y1, 1.22], [x0 + u + 0.2, y1, 1.42], [x0 + u, y1, 1.42]), P.paper, { seed: seed + 80 + k, light: 1.0, gapless: true });
  }
  // six stripes, red and paper, from the wall out over the pavement
  const n = 6;
  for (let i = 0; i < n; i++) {
    const u0 = 0.04 + ((2 - 0.08) * i) / n, u1 = 0.04 + ((2 - 0.08) * (i + 1)) / n;
    const hex = i % 2 === 0 ? P.awningRed : P.paper;
    fillPoly(pen, quad(proj, [x0 + u0, y1, eWall], [x0 + u1, y1, eWall], [x0 + u1, y1 + out, eEdge], [x0 + u0, y1 + out, eEdge]), hex, { seed: seed + 90 + i, light: 1.02, noInk: i > 0, grad: { from: proj(x0 + u0, y1, eWall), to: proj(x0 + u0, y1 + out, eEdge), k0: 1.0, k1: 0.9 } });
  }
  // the scalloped valance along the outer edge
  const valance = quad(proj, [x0 + 0.04, y1 + out, eEdge], [x1 - 0.04, y1 + out, eEdge]);
  const a = valance[0] as Pt, b = valance[1] as Pt;
  const pts: Pt[] = [a];
  const scallops = 8;
  for (let i = 0; i < scallops; i++) {
    const t0 = i / scallops, t1 = (i + 1) / scallops, tm = (t0 + t1) / 2;
    pts.push({ x: a.x + (b.x - a.x) * tm, y: a.y + (b.y - a.y) * tm + 0.1 * EH * z });
    pts.push({ x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 });
  }
  const back = pts.slice().reverse().map((p) => ({ x: p.x, y: p.y - 0.12 * EH * z }));
  fillPoly(pen, [...pts, ...back], P.awningRed, { seed: seed + 99, light: 0.95 });
  // the two poles holding the awning's outer edge
  for (const u of [0.1, 1.9]) strokeLine(pen, quad(proj, [x0 + u, y1 + out, 0], [x0 + u, y1 + out, eEdge]), P.zinc, Math.max(0.6, 0.8 * z), { open: true, seed: seed + 100 + u });
}

/* ---------- the dispatcher and the painter drawables (03 2.7 props.ts row, 7.2, 7.7, 15.2 item 6; GV drawProp 9540-9553) ---------- */
/** Drawn height in EH of each kind the game draws, for the size and screen culls (04 6.1; a tree's crown stands 1.5 x its height). */
const PROP_H: Partial<Record<PropKind, number>> = {
  bench: 0.6, lamp: 1.75, fountain: 1.6, kiosk: 1.65, table: 0.62, bandstand: 3.0, picnic: 0.35, basket: 0.35, bridge: 0.6, hedge: 0.5, tree: 3.8,
};
/** How far the lamp is on: the lamps' hours with their fade (ambient.lampGlow), or a c_lamplight litUntil still ahead (03 7.7 item 3). */
function lampOn(p: Prop): number {
  return (p.data.litUntil ?? 0) > tick() ? 1 : lampGlow();
}
/** The wet of a prop's north-west tile, 0 to 1 (04 6.1: wet slats and decks x 0.86). */
function wetOf(p: Prop): number {
  return inB(p.x, p.y) ? (WET[I(p.x, p.y)] ?? 0) : 0;
}

/**
 * Draw one prop (03 2.7 drawProp(p, s)): s is its north-west tile's centre on screen, c the context (draw.ts's when left out), part 1 or 2
 * the back or front half of a bandstand or bridge (0 the whole). Direction A through the camera's projection; a kind with no drawing yet
 * (easel, crumbs, peel, sprinkler, rowboat, umbrella: S4, S6) draws nothing, and the apron kinds are backdrop.ts's.
 */
export function drawProp(p: Prop, s: XY, c?: CanvasRenderingContext2D, part: 0 | 1 | 2 = 0): void {
  const ctx = renderCtx(c), pen = gamePen(ctx), proj = gameProj;
  switch (p.kind) {
    case 'bench':
      drawBench(pen, proj, p.x, p.y, (p.rot + 2) % 4, wetOf(p));
      break;
    case 'lamp': {
      const g = lampOn(p);
      drawLamp(pen, s, { lit: g > 0, glow: g });
      break;
    }
    case 'fountain':
      drawFountain(pen, proj, p.x, p.y, { frozen: iceState().on === 1, fx: false });
      break;
    case 'kiosk':
      drawKiosk(pen, proj, p.x, p.y, p.rot, lampGlow() > 0.5);
      break;
    case 'table':
      drawBistroTable(pen, proj, p.x, p.y);
      break;
    case 'bandstand':
      drawBandstand(pen, proj, p.x, p.y, part);
      break;
    case 'picnic':
    case 'basket':
      drawPicnic(pen, proj, p.x, p.y);
      break;
    case 'bridge':
      drawBridge(pen, proj, p, part, wetOf(p));
      break;
    case 'hedge':
      drawHedge(p, s, ctx);
      break;
    case 'tree':
      drawTreeProp(p, s, ctx);
      break;
    default:
      break;
  }
}

type PropDrawable = Drawable & { p: Prop | null; part: 0 | 1 | 2 };
const PROP_POOL: PropDrawable[] = [];
const PROP_OUT: Drawable[] = [];
const S0: XY = { x: 0, y: 0 }, S1: XY = { x: 0, y: 0 };
function drawPropItem(d: Drawable, ctx: CanvasRenderingContext2D): void {
  const pd = d as PropDrawable;
  if (pd.p) drawProp(pd.p, screenInto(pd.p.x, pd.p.y, 0, S1), ctx, pd.part);
}
function addDrawable(p: Prop, part: 0 | 1 | 2, depth: number): void {
  let d = PROP_POOL[PROP_OUT.length];
  if (!d) {
    d = { depth: 0, kind: 'prop', id: 0, x: 0, y: 0, z: 0, draw: drawPropItem, p: null, part: 0 };
    PROP_POOL.push(d);
  }
  d.depth = depth;
  d.id = p.id;
  d.x = p.x + (p.w - 1) / 2;
  d.y = p.y + (p.h - 1) / 2;
  d.p = p;
  d.part = part;
  PROP_OUT.push(d);
}
/** The shallowest depth of a footprint (order.ts footprintDepth gives the deepest). */
function shallowDepth(p: Prop): number {
  const x1 = p.x + Math.max(1, p.w) - 1, y1 = p.y + Math.max(1, p.h) - 1;
  return Math.min(depthOf(p.x, p.y), depthOf(x1, p.y), depthOf(p.x, y1), depthOf(x1, y1));
}

/**
 * The props as painter drawables for this frame (03 7.2): depth is the deepest footprint tile; a bandstand or bridge gives a back half at
 * its shallowest depth less 0.5 and a front half at its deepest plus 0.49, and a picnic blanket lies at its shallowest less 0.5, so people
 * inside or on them paint between. Culled (03 15.2 item 6): trees under 2.5 px tall, other props under 1.5 px, and anything off screen.
 * The objects and the array are reused: good for this frame only.
 */
export function propDrawables(): Drawable[] {
  PROP_OUT.length = 0;
  const z = cam.z, cw = view.cw, chh = view.chh;
  for (const p of props) {
    const hEH = PROP_H[p.kind];
    if (hEH === undefined) continue;
    const big = Math.max(p.w, p.h), tree = p.kind === 'tree';
    if (tree ? (SPECIES_HEIGHT[(p.data.species ?? 0) as Species] ?? 2.5) * EH * z < 2.5 : Math.max(hEH * EH, big * TW * 0.5) * z < 1.5) continue;
    screenInto(p.x + (p.w - 1) / 2, p.y + (p.h - 1) / 2, 0, S0);
    const half = (big * 0.75 + (tree ? 1.9 : 0.4)) * TW * z, up = hEH * EH * z + 4, dn = big * TH * 0.75 * z + 4;
    if (S0.x + half < 0 || S0.x - half > cw || S0.y + dn < 0 || S0.y - up > chh) continue;
    if (p.kind === 'bandstand' || p.kind === 'bridge') {
      addDrawable(p, 1, shallowDepth(p) - 0.5);
      addDrawable(p, 2, footprintDepth(p.x, p.y, p.w, p.h) + 0.49);
    } else if (p.kind === 'picnic' || p.kind === 'basket') addDrawable(p, 0, shallowDepth(p) - 0.5);
    else addDrawable(p, 0, footprintDepth(p.x, p.y, p.w, p.h));
  }
  return PROP_OUT;
}
