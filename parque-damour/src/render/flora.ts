// src/render/flora.ts
// Tree shapes for three species (plane, chestnut, lime) with three forms each, the crown phase by season, the crown colour,
// and drawTree in the three treatments: GV blob crowns (A), flat two-tone discs (B), an ink skeleton with wash blobs (C) (04 6.3, 3.2 row Trees).
// The game side (direction A only, 04 3.4): the tree sprite cache and the tree prop, bed flowers by BEDC, the hedge pieces with their
// 4-neighbour auto-join (03 2.7 flora.ts row, 7.7 item 2; 04 6.1 rows bed and hedge, 6.3).
// Ported from GV 1692-1728 (makeTree, buildTreeShape: the round, birch and twig forms), 6749-6762 (crownPhase), 6766-6775 (foliageCol,
// treeTint), 6781-6835 (zoomBucket, treeSprite: trunk, branches, twigs, blob crown and highlight, blossom dots, snow; the cache cleared at
// 1400 entries), 6837-6848 (drawTree: the 2.5 px cull and the scaled blit), 6907 (drawFlower: dots only at zoom > 0.8, ground.ts gates it).
// Verdict: ADAPT. Changes: species and colours from the palette, heights in EH, the direction's brush; crownPhase takes the season and the
// day inside it (02 3.4, 04 6.3 item 1, 06 15: bud to 0.9, blossom to 2.0, leafing to 3.0) and an autumn crown turns from day 1 (0 %) to
// day 2 (100 %) (06 15); the sprite key is 03 7.7 item 2 plus the tree's seed (its form and tint, GV 6788 keyed the seed too) and the
// cloud dim; no age, lean, felling, axe shake or snow line. Bed dots and hedges are new (French props).
// Dropped from the range: pines, birches, makeTree's age and lean, fogMix, the shadow (DBG.shadows), drawStump, drawBush, drawRock,
// drawCover, drawMark (02 2.6 has none of them).
// TODO(S9): wind sway and leaf drop on trees, hedge sway and bed shiver in breeze (04 6.1), snow cover on beds and hedges.
import { mulberry32 } from '../core/rng.ts';
import { clamp01, hx, mixc, type RGB, type XY } from '../core/math.ts';
import { css } from '../core/math.ts';
import { SEASON_DAYS, T } from '../core/clock.ts';
import { W } from '../core/weather.ts';
import { BEDC, I, KIND, Kind, N, OCC, inB, propById, type Prop } from '../world/grid.ts';
import { EH, TW, TH, cam, rotVec, view } from './camera.ts';
import { depthOf } from './order.ts';
import { screenInto, screenOf } from './project.ts';
import * as drawMod from './draw.ts';
import {
  AA, AM, GC, faceLight, fillEllipse, fillPoly, h01, inkLine, lit, mix, scaleHex, shade, strokeLine, style,
  type Palette, type Pen, type Proj, type Pt, type StyleSpec,
} from './ambient.ts';

export type Species = 0 | 1 | 2; // plane, chestnut, lime (04 6.3)
export const SPECIES_HEIGHT: readonly number[] = [2.5, 2.2, 2.0]; // EH
export type Blob = { x: number; y: number; r: number }; // fractions of the height, y up is negative
export type Branch = { y: number; len: number; a: number };
export type Twig = { x: number; y: number; len: number; a: number };
export type TreeShape = { species: Species; form: number; seed: number; blobs: Blob[]; branches: Branch[]; twigs: Twig[] };

/** The crown and skeleton of a tree from its seed: three forms per species (GV buildTreeShape 1703-1728 adapted). */
export function treeShape(species: Species, seed: number): TreeShape {
  const r = mulberry32((seed | 0) + 1);
  const t: TreeShape = { species, form: ((seed | 0) % 3 + 3) % 3, seed, blobs: [], branches: [], twigs: [] };
  const F = t.form;
  for (let i = 0; i < 3; i++) t.branches.push({ y: -(0.52 + i * 0.14), len: 0.3, a: (r() - 0.5) * 1.5 });
  const push = (x: number, y: number, rr: number): void => {
    t.blobs.push({ x, y, r: rr });
  };
  // the forms: plane dome / tall oval / umbrella; chestnut umbrella / dome / split; lime oval / tuft / tall wisp (04 6.3)
  const kind = species === 0 ? ['dome', 'oval', 'umbrella'][F] : species === 1 ? ['umbrella', 'dome', 'split'][F] : ['oval', 'tuft', 'wisp'][F];
  if (kind === 'oval') for (let i = 0; i < 6; i++) push((r() - 0.5) * 0.42, -(0.62 + r() * 0.46), 0.17 + r() * 0.1);
  else if (kind === 'umbrella') for (let i = 0; i < 6; i++) push((r() - 0.5) * 0.86, -(0.82 + r() * 0.16), 0.19 + r() * 0.1);
  else if (kind === 'split') for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) push(sd * (0.12 + r() * 0.16), -(0.7 + r() * 0.26), 0.15 + r() * 0.08);
  else if (kind === 'tuft') for (let i = 0; i < 4; i++) push((r() - 0.5) * 0.45, -(0.72 + r() * 0.28), 0.17 + r() * 0.1);
  else if (kind === 'wisp') for (let i = 0; i < 5; i++) push((r() - 0.5) * 0.34, -(0.62 + r() * 0.4), 0.13 + r() * 0.09);
  else for (let i = 0; i < 5; i++) push((r() - 0.5) * 0.62, -(0.7 + r() * 0.34), 0.2 + r() * 0.12);
  // the bare crown: twigs off each branch and a fan off the top of the trunk (GV 1721-1727)
  for (const b of t.branches) {
    const n = 2 + ((r() * 2) | 0);
    for (let i = 0; i < n; i++) {
      const f = 0.45 + r() * 0.5;
      t.twigs.push({ x: Math.sin(b.a) * b.len * f, y: b.y - Math.cos(b.a) * b.len * 0.55 * f, len: 0.1 + r() * 0.1, a: b.a + (r() - 0.5) * 1.4 });
    }
  }
  const n = 4 + ((r() * 3) | 0);
  for (let i = 0; i < n; i++) t.twigs.push({ x: 0.01, y: -1, len: 0.14 + r() * 0.14, a: (i / (n - 1) - 0.5) * 1.9 + (r() - 0.5) * 0.3 });
  return t;
}

export type Phase = 'bud' | 'blossom' | 'leafing' | 'leaf' | 'thin' | 'bare';
/**
 * The crown's phase from the season and the day inside it (GV crownPhase 6749; 02 3.4 read as 04 6.3 item 1 and 06 15): spring bud to
 * 0.9, blossom to 2.0, leafing to 3.0; summer leaf; autumn leaf turning from day 1 (f 0) to day 2 (f 1), thinning after 2.0; winter bare.
 */
export function crownPhase(season: number, dayInSeason: number): { ph: Phase; f: number } {
  if (season === 3) return { ph: 'bare', f: 1 };
  if (season === 0) {
    if (dayInSeason < 0.9) return { ph: 'bud', f: dayInSeason / 0.9 };
    if (dayInSeason < 2.0) return { ph: 'blossom', f: (dayInSeason - 0.9) / 1.1 };
    return { ph: 'leafing', f: (dayInSeason - 2.0) / 1.0 };
  }
  if (season === 2) return dayInSeason > 2.0 ? { ph: 'thin', f: (dayInSeason - 2.0) / 1.0 } : { ph: 'leaf', f: clamp01(dayInSeason) };
  return { ph: 'leaf', f: 1 };
}

/** The crown hex by species, season and phase (04 6.3 table); an autumn crown in leaf is f of the way from summer to autumn (06 15). */
export function crownHex(spec: StyleSpec, species: Species, season: number, ph: Phase, f = 1): string {
  const P = spec.palette;
  if (ph === 'blossom') {
    if (species === 0) return mix(P.rose, P.paper, 0.45);
    return species === 1 ? P.foliageSpring : P.limeSpring;
  }
  if (ph === 'bud' || ph === 'leafing' || season === 0) return species === 2 ? P.limeSpring : P.foliageSpring;
  const summer = species === 1 ? scaleHex(P.foliageSummer, [0.92, 0.92, 0.92]) : species === 2 ? scaleHex(P.foliageSummer, [1.08, 1.08, 1.08]) : P.foliageSummer;
  if (season === 2) {
    const autumn = species === 0 ? P.foliageAutumn : species === 1 ? P.chestnutAutumn : P.limeAutumn;
    return ph === 'leaf' && f < 1 ? mix(summer, autumn, clamp01(f)) : autumn;
  }
  return summer;
}

/** A per-tree lightness and warmth of +-10 % (GV treeTint 6775). */
function treeTint(seed: number, c: RGB): RGB {
  const u = ((seed * 13) % 1) - 0.5, v = ((seed * 29) % 1) - 0.5;
  return [c[0] * (1 + u * 0.1 + v * 0.05), c[1] * (1 + u * 0.1), c[2] * (1 + u * 0.08 - v * 0.05)];
}

/** seedBalls: the winter plane's two seed balls per branch (04 6.3; the game passes it, the board's record does not). */
export type TreeOpts = { scale?: number; snow?: number; mulch?: boolean; seedBalls?: boolean };

/** Draw a tree standing at screen point p (its tile centre), season and day in season (04 6.3), in the direction's manner. */
export function drawTree(pen: Pen, p: Pt, t: TreeShape, season: number, dayInSeason: number, o: TreeOpts = {}): void {
  const { ctx, spec, z } = pen;
  const P = spec.palette;
  const H = (SPECIES_HEIGHT[t.species] as number) * EH * z * (o.scale ?? 1);
  if (H < 2.5) return;
  const cp = crownPhase(season, dayInSeason);
  const bare = cp.ph === 'bare' || cp.ph === 'bud', thin = cp.ph === 'thin';
  const trunk = P.trunk[t.species];
  const X = (fx: number): number => p.x + fx * H, Y = (fy: number): number => p.y + fy * H;
  if (o.mulch !== false) fillEllipse(pen, p.x, p.y, 0.42 * TW * z, 0.42 * TH * z, scaleHex(P.bedEarth, [0.95, 0.95, 0.95]), { noInk: true, alpha: spec.id === 'C' ? 0.5 : 0.85 });
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // the trunk and the branches
  const trunkPts: Pt[] = [];
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    const bx = 2 * (1 - u) * u * 0.05 + u * u * 0.01, by = -u;
    trunkPts.push({ x: X(bx * (1 + 0.3 * (1 - u))), y: Y(by) });
  }
  const trunkW = Math.max(1.4, H * 0.058);
  if (spec.id === 'B') {
    const topY = Math.min(...t.blobs.map((b) => b.y)) + 0.25;
    fillPoly(pen, [{ x: X(-0.035), y: p.y }, { x: X(0.035), y: p.y }, { x: X(0.02), y: Y(topY) }, { x: X(-0.02), y: Y(topY) }], trunk, {});
  } else {
    strokeLine(pen, trunkPts, trunk, trunkW, { open: true, seed: t.seed, noInk: spec.id === 'A' });
    if (spec.id === 'A' && t.species === 0) {
      // the plane's mottled bark: pale patches along the trunk
      ctx.fillStyle = GC(P.trunkPatch, 0.8);
      for (let k = 0; k < 4; k++) {
        const u = 0.15 + h01(t.seed, k, 1) * 0.6;
        ctx.beginPath();
        ctx.ellipse(X(0.03 * u + (h01(t.seed, k, 2) - 0.5) * 0.03), Y(-u), trunkW * 0.28, trunkW * (0.5 + h01(t.seed, k, 3) * 0.5), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const branchPts = (b: Branch): Pt[] => [
    { x: X(0), y: Y(b.y) },
    { x: X(Math.sin(b.a) * b.len * 0.6), y: Y(b.y - Math.abs(Math.cos(b.a)) * b.len * 0.3) },
    { x: X(Math.sin(b.a) * b.len), y: Y(b.y - Math.cos(b.a) * b.len * 0.55) },
  ];
  const showSkeleton = spec.id === 'C' || bare || thin;
  if (showSkeleton && spec.id !== 'B') for (const b of t.branches) strokeLine(pen, branchPts(b), trunk, Math.max(1, H * 0.033), { open: true, seed: t.seed + 3, noInk: spec.id === 'A' });
  if (bare || thin) {
    // the bare crown: twigs off the branches and the fan off the top (GV 6805-6812)
    const tw = spec.id === 'B' ? Math.max(1.2, H * 0.03) : Math.max(0.8, H * 0.02);
    for (const g of t.twigs) {
      const a: Pt = { x: X(g.x), y: Y(g.y) }, b: Pt = { x: X(g.x + Math.sin(g.a) * g.len), y: Y(g.y - Math.cos(g.a) * g.len) };
      if (spec.id === 'B') strokeLine(pen, [a, b], trunk, tw, { open: true });
      else if (spec.id === 'A') strokeLine(pen, [a, b], trunk, tw, { open: true, noInk: true });
      else inkLine(pen, [a, b], { open: true, seed: t.seed + Math.round(g.a * 100), lineW: tw });
      if (cp.ph === 'bud' && spec.id !== 'A') {
        ctx.fillStyle = shade(crownHex(spec, t.species, season, 'bud'), 1, 0.55 + cp.f * 0.4);
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(0.8, H * 0.03), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (cp.ph === 'bud' && spec.id === 'A') {
      // A only (the board draws no bud tile): bursting buds as small clusters of young-green dabs at the twig tips and along them,
      // fuller toward blossom, so a day-1 park reads as spring, not winter (placed by h01 so a cached sprite repeats)
      ctx.fillStyle = shade(mix(crownHex(spec, t.species, season, 'bud'), P.foliageSummer, 0.4), 1, 0.6 + 0.3 * cp.f);
      ctx.beginPath();
      t.twigs.forEach((g, j) => {
        for (let k = 0; k < 3; k++) {
          const u = k === 0 ? 1 : 0.45 + 0.4 * h01(t.seed + j, k, 41), a = h01(t.seed + j, k, 42) * Math.PI * 2;
          const r = Math.max(0.7, H * (0.026 + 0.018 * cp.f) * (k === 0 ? 1.2 : 0.85)), off = r * 0.6;
          const x = X(g.x + Math.sin(g.a) * g.len * u) + Math.cos(a) * off, y = Y(g.y - Math.cos(g.a) * g.len * u) + Math.sin(a) * off;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
      });
      ctx.fill();
    }
    if (spec.id === 'B') for (const b of t.branches) strokeLine(pen, branchPts(b), trunk, Math.max(1.2, H * 0.035), { open: true });
    if ((o.snow ?? 0) > 0) {
      ctx.strokeStyle = GC(P.snow, 0.4 + 0.6 * (o.snow ?? 0));
      ctx.lineWidth = Math.max(0.8, H * 0.022);
      ctx.beginPath();
      for (const g of t.twigs) {
        ctx.moveTo(X(g.x), Y(g.y) - H * 0.012);
        ctx.lineTo(X(g.x + Math.sin(g.a) * g.len), Y(g.y - Math.cos(g.a) * g.len) - H * 0.012);
      }
      ctx.stroke();
    }
    if (o.seedBalls && t.species === 0 && cp.ph === 'bare') {
      // the winter plane's seed balls: two to a branch, hanging on short stalks from near the tip (04 6.3 row plane)
      const r = Math.max(0.7, H * 0.02);
      ctx.strokeStyle = shade(P.trunk[1], 0.9);
      ctx.lineWidth = Math.max(0.5, H * 0.006);
      ctx.fillStyle = shade(P.trunk[1], 0.82);
      for (const b of t.branches)
        for (let k = 0; k < 2; k++) {
          const f = 0.62 + k * 0.3, bx = X(Math.sin(b.a) * b.len * f), by = Y(b.y - Math.cos(b.a) * b.len * 0.55 * f), dy = H * (0.05 + 0.03 * k);
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx, by + dy - r);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(bx, by + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
    }
  }
  if (bare) return;
  const fcHex = crownHex(spec, t.species, season, cp.ph, cp.f);
  const fc = spec.id === 'A' ? treeTint(t.seed, hx(fcHex)) : hx(fcHex);
  const sc = cp.ph === 'leafing' ? 0.55 + 0.45 * cp.f : cp.ph === 'blossom' ? 0.72 : thin ? 1 - 0.45 * cp.f : 1;
  const al = thin ? 1 - 0.55 * cp.f : 1;
  if (spec.id === 'A') {
    // GV's crown: the blobs in a deeper tone, a lighter blob up and left on each, white dots in blossom (GV 6815-6826)
    if (al < 1) ctx.globalAlpha = al;
    ctx.fillStyle = css(lit(mixc(fc, [40, 60, 50], 0.1)));
    ctx.beginPath();
    for (const bl of t.blobs) {
      const r = bl.r * sc * H;
      ctx.moveTo(X(bl.x) + r, Y(bl.y));
      ctx.arc(X(bl.x), Y(bl.y), r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = css(lit(mixc(fc, [255, 255, 255], cp.ph === 'blossom' ? 0.45 : 0.3)));
    ctx.beginPath();
    for (const bl of t.blobs) {
      const r = bl.r * 0.62 * sc * H, x = X(bl.x - bl.r * 0.22 * sc), y = Y(bl.y - bl.r * 0.26 * sc);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    if (cp.ph === 'blossom' && t.species !== 1) {
      ctx.fillStyle = GC(P.paper, 0.85);
      ctx.beginPath();
      for (const bl of t.blobs)
        for (let k = 0; k < 3; k++) {
          const a = k * 2.1 + bl.x * 0.3, x = X(bl.x + Math.cos(a) * bl.r * 0.5 * sc), y = Y(bl.y + Math.sin(a) * bl.r * 0.4 * sc);
          ctx.moveTo(x + H * 0.025, y);
          ctx.arc(x, y, H * 0.025, 0, Math.PI * 2);
        }
      ctx.fill();
    }
    if (al < 1) ctx.globalAlpha = 1;
  } else if (spec.id === 'B') {
    // 3 to 5 flat discs in two greens: a shade disc, then the base disc up and left on it (04 3.2 row Trees; ref1)
    const discs = t.blobs.slice().sort((a, b) => b.r - a.r).slice(0, Math.min(5, Math.max(3, t.blobs.length)));
    const base = fcHex, dark = fcHex;
    for (const bl of discs.slice().reverse()) {
      const r = bl.r * sc * H * 1.15;
      fillEllipse(pen, X(bl.x), Y(bl.y), r, r, dark, { alpha: al, light: 0.82 });
    }
    for (const bl of discs.slice().reverse()) {
      const r = bl.r * sc * H * 1.15;
      fillEllipse(pen, X(bl.x) - r * 0.12, Y(bl.y) - r * 0.14, r * 0.92, r * 0.92, base, { alpha: al });
    }
  } else {
    // C: two or three wash blobs over the skeleton, a scribbled ink outline, the wash off the line (04 3.2 row Trees)
    const groups = groupBlobs(t.blobs);
    for (const g of groups) {
      const n = 18;
      const pts: Pt[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const wob = 1 + (h01(t.seed, i, 7) - 0.5) * 0.18;
        pts.push({ x: X(g.x) + Math.cos(a) * g.rx * sc * H * wob, y: Y(g.y) + Math.sin(a) * g.ry * sc * H * wob });
      }
      fillPoly(pen, pts, fcHex, { alpha: al * 0.9, seed: t.seed + Math.round(g.x * 50), noInk: true });
    }
    for (const g of groups) {
      // the scribble: two loose loops, the second a little smaller and fainter
      for (const [k, a0] of [[1, 0.1], [0.86, 0.9]] as const) {
        const pts: Pt[] = [];
        for (let i = 0; i < 14; i++) {
          const a = a0 + (i / 14) * Math.PI * 2;
          const wob = 1 + (h01(t.seed + 9, i, k * 10) - 0.5) * 0.22;
          pts.push({ x: X(g.x) + Math.cos(a) * g.rx * sc * H * k * wob, y: Y(g.y) + Math.sin(a) * g.ry * sc * H * k * wob });
        }
        inkLine(pen, pts, { seed: t.seed + i32(k * 100), inkAlpha: al * (k === 1 ? 0.9 : 0.5), open: true });
      }
    }
  }
  if (cp.ph === 'blossom' && t.species === 1) {
    // the chestnut's candles: 6 to 10 upright paper ovals (04 6.3)
    const n = 6 + Math.floor(h01(t.seed, 0, 8) * 5);
    for (let k = 0; k < n; k++) {
      const bl = t.blobs[k % t.blobs.length] as Blob;
      const x = X(bl.x + (h01(t.seed, k, 9) - 0.5) * bl.r * 1.2), y = Y(bl.y - bl.r * (0.3 + h01(t.seed, k, 10) * 0.5) * sc);
      fillEllipse(pen, x, y, Math.max(0.8, H * 0.018), Math.max(1.5, H * 0.045), P.paper, { alpha: 0.95, gapless: true });
    }
  }
  if ((o.snow ?? 0) > 0) {
    ctx.fillStyle = GC(P.snow, 0.5 + 0.5 * (o.snow ?? 0));
    ctx.beginPath();
    for (const bl of t.blobs) {
      const r = bl.r * (0.5 + 0.28 * (o.snow ?? 0)) * sc * H;
      ctx.moveTo(X(bl.x) + r, Y(bl.y - bl.r * 0.42 * sc));
      ctx.ellipse(X(bl.x), Y(bl.y - bl.r * 0.42 * sc), r, r * 0.55, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

function i32(v: number): number {
  return Math.round(v) | 0;
}

/** Merge a blob list into two or three ellipses for the wash crown of direction C. */
function groupBlobs(blobs: Blob[]): Array<{ x: number; y: number; rx: number; ry: number }> {
  const bound = (list: Blob[]): { x: number; y: number; rx: number; ry: number } => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of list) {
      x0 = Math.min(x0, b.x - b.r);
      x1 = Math.max(x1, b.x + b.r);
      y0 = Math.min(y0, b.y - b.r);
      y1 = Math.max(y1, b.y + b.r);
    }
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, rx: ((x1 - x0) / 2) * 0.92, ry: ((y1 - y0) / 2) * 0.92 };
  };
  const left = blobs.filter((b) => b.x < 0), right = blobs.filter((b) => b.x >= 0);
  const out = [bound(blobs)];
  if (left.length) out.push(bound(left));
  if (right.length) out.push(bound(right));
  return out;
}

/* ---------- the game side: the canvas, the pen, the projection (direction A only, 04 3.4) ---------- */
type CtxSource = { ctx?: CanvasRenderingContext2D | null; getCtx?: () => CanvasRenderingContext2D };
/** The context to draw on: the one passed, else draw.ts's (03 2.7: draw.ts owns the canvas; ground.ts reads it the same way). */
export function renderCtx(c?: CanvasRenderingContext2D): CanvasRenderingContext2D {
  if (c) return c;
  const m = drawMod as unknown as CtxSource;
  const k = m.ctx ?? m.getCtx?.();
  if (!k) throw new Error('render not initialised');
  return k;
}
const PEN: Pen = { ctx: null as unknown as CanvasRenderingContext2D, spec: style(), z: 1 };
/** The game's pen on `ctx`: direction A (style()) at the camera's zoom. One reused object, good until the next call. */
export function gamePen(ctx: CanvasRenderingContext2D): Pen {
  PEN.ctx = ctx;
  PEN.spec = style();
  PEN.z = cam.z;
  return PEN;
}
/** The game's projection for the primitives: world (x, y) at height e (EH units) to screen, so every prop turns with the camera. */
export const gameProj: Proj = (x, y, e = 0) => screenOf(x, y, e);
/** The Palette keys that hold a single hex: what a prop's parameter table may name instead of a colour. */
export type HexKey = { [K in keyof Palette]: Palette[K] extends string ? K : never }[keyof Palette];
/** Is a face with outward normal (nx, ny, nz) turned toward the viewer, who looks in along (1, 1, 0.5) after the rotation (GV faceVis 6958)? */
export function faceVis(nx: number, ny: number, nz = 0): boolean {
  const r = rotVec(nx, ny);
  return r.x + r.y + 0.5 * nz > 0;
}

/* ---------- the tree sprite cache (GV 6779-6848; 03 7.7 item 2, 15.2 items 5 and 6) ---------- */
export type TreeSprite = { c: HTMLCanvasElement; w: number; h: number; base: number; zb: number };
export const SPRITE_CAP = 1400;
const SPRITES = new Map<string, TreeSprite>();
const SHAPES = new Map<string, TreeShape>();
/** The zoom a sprite is painted at: 8 steps an octave (GV zoomBucket 6781). */
export function zoomBucket(z: number = cam.z): number {
  return Math.pow(2, Math.round(Math.log2(z) * 8) / 8);
}
/** A tree prop's seed, fixed by its tile (the Prop has no seed field), so its form and tint hold across a save (GV kept t.sd, 1693). */
export function treeSeed(p: Prop): number {
  return h01(p.x, p.y, 17) * 997;
}
/** The day inside the season, 0 to 3 (T.abs counts days from the park's first midnight). */
export function seasonDay(abs: number = T.abs): number {
  return ((abs % SEASON_DAYS) + SEASON_DAYS) % SEASON_DAYS;
}
/** Snow on the crowns, in thirds, while snow falls (GV 6786 without the snow line: the ground is flat). */
function crownSnow(): number {
  return Math.round(clamp01((W.snow - 0.3) / 0.4) * 3) / 3;
}

/**
 * The sprite of a tree prop: painted once by drawTree into an offscreen canvas at the zoom bucket, keyed by species, seed, zoom bucket,
 * season, phase (in thirds), light and warm tint (in eighths), the cloud dim, snow and dpr; the whole cache clears at 1400 entries (GV 6788).
 */
export function treeSprite(p: Prop): TreeSprite {
  const sp = (p.data.species ?? 0) as Species, seed = treeSeed(p), zb = zoomBucket(), ds = seasonDay();
  const cp = crownPhase(T.season, ds), snow = crownSnow(), dpr = view.dpr;
  const key = sp + '|' + seed + '|' + zb + '|' + T.season + '|' + cp.ph + Math.round(cp.f * 3) + '|' + Math.round(T.light * 8) + '|' +
    Math.round(AA * 8) + '|' + Math.round(AM[2] * 24) + '|' + snow + '|' + dpr;
  const hit = SPRITES.get(key);
  if (hit) return hit;
  const sk = sp + '|' + seed;
  let shape = SHAPES.get(sk);
  if (!shape) {
    shape = treeShape(sp, seed);
    SHAPES.set(sk, shape);
  }
  const H = (SPECIES_HEIGHT[sp] as number) * EH * zb;
  const w = Math.ceil(H * 1.6) + 6, top = Math.ceil(H * 1.5) + 4, pad = Math.ceil(Math.max(H * 0.18, 0.45 * TH * zb)) + 2;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil((top + pad) * dpr));
  const g = c.getContext('2d');
  if (g) {
    g.scale(dpr, dpr);
    drawTree({ ctx: g, spec: style(), z: zb }, { x: w / 2, y: top }, shape, T.season, ds, { snow, seedBalls: true });
  }
  const s: TreeSprite = { c, w, h: top + pad, base: top, zb };
  if (SPRITES.size >= SPRITE_CAP) SPRITES.clear();
  SPRITES.set(key, s);
  return s;
}

/** A tree prop standing at screen point s (its tile centre): culled below 2.5 px, else its sprite blitted at the zoom (GV drawTree 6837-6848). */
export function drawTreeProp(p: Prop, s: XY, c?: CanvasRenderingContext2D): void {
  const sp = (p.data.species ?? 0) as Species;
  if ((SPECIES_HEIGHT[sp] as number) * EH * cam.z < 2.5) return;
  const t = treeSprite(p), k = cam.z / t.zb;
  renderCtx(c).drawImage(t.c, s.x - (t.w * k) / 2, s.y - t.base * k, t.w * k, t.h * k);
}

/* ---------- bed tiles (04 6.1 row bed; 06 2: BEDC 0 rose, 1 lavender, 2 marigold, 3 white) ---------- */
export type BedSpec = { dotsMin: number; dotsSpread: number; r: number; spread: number; e: number; kerb: number; colours: readonly HexKey[] };
/** Bed tile parameters: 6 to 9 dots of radius 1.3 z px within 0.38 tile of the centre at e 0.1, the kerb at bedEarth x 0.78. */
export const BED: BedSpec = { dotsMin: 6, dotsSpread: 3, r: 1.3, spread: 0.38, e: 0.1, kerb: 0.78, colours: ['rose', 'bedLavender', 'bedMarigold', 'paper'] };
const NB4: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W: mask bits 1 2 4 8
const BP: XY = { x: 0, y: 0 }, BQ: XY = { x: 0, y: 0 };

/**
 * One bed tile (03 2.7 flora.drawBedTile(i, s); ground.ts calls it at z > 0.8 after the tile fills): a darker earth kerb along each edge
 * whose neighbour is not bed, then 6 to 9 flower dots in the tile's BEDC colour, each with a paper highlight (the board's tile 2), half of
 * them in autumn and none in winter (04 6.1 row bed). The dots are placed by h01 so they never jitter.
 */
export function drawBedTile(i: number, _s: XY, c?: CanvasRenderingContext2D): void {
  const ctx = renderCtx(c), z = cam.z, P = style().palette, B = BED;
  const x = i % N, y = (i / N) | 0;
  ctx.strokeStyle = shade(P.bedEarth, B.kerb, 0.9);
  ctx.lineWidth = Math.max(0.8, 1.1 * z);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [dx, dy] of NB4) {
    if (inB(x + dx, y + dy) && KIND[I(x + dx, y + dy)] === Kind.bed) continue;
    screenInto(x + dx * 0.46 - dy * 0.5, y + dy * 0.46 + dx * 0.5, 0, BP);
    screenInto(x + dx * 0.46 + dy * 0.5, y + dy * 0.46 - dx * 0.5, 0, BQ);
    ctx.moveTo(BP.x, BP.y);
    ctx.lineTo(BQ.x, BQ.y);
  }
  ctx.stroke();
  const season = T.season;
  if (season === 3) return;
  const seed = i * 7 + 11;
  const n = Math.round((B.dotsMin + h01(seed, 0, 15) * B.dotsSpread) * (season === 2 ? 0.5 : 1));
  const r = Math.max(0.8, B.r * z);
  const at = (k: number): XY => screenInto(x - B.spread + h01(seed, k, 16) * 2 * B.spread, y - B.spread + h01(seed, k, 17) * 2 * B.spread, B.e, BP);
  ctx.fillStyle = shade(P[B.colours[BEDC[i] ?? 0] ?? 'rose'], 1);
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const q = at(k);
    ctx.moveTo(q.x + r, q.y);
    ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = shade(P.paper, 1, 0.5);
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const q = at(k);
    ctx.moveTo(q.x - r * 0.3 + r * 0.4, q.y - r * 0.3);
    ctx.arc(q.x - r * 0.3, q.y - r * 0.3, r * 0.4, 0, Math.PI * 2);
  }
  ctx.fill();
}

/* ---------- hedges (04 6.1 row hedge; 06 4): box-clipped pieces that join their 4-neighbours ---------- */
export type HedgeSpec = { hw: number; h: number; leaf: HexKey; autumn: HexKey; dust: HexKey; top: number; dab: number };
/** Hedge parameters: a block 0.64 tile wide and 0.5 EH high, summer green, its top lighter by 1.1, highlight dabs 0.07 tile. */
export const HEDGE: HedgeSpec = { hw: 0.32, h: 0.5, leaf: 'foliageSummer', autumn: 'foliageAutumn', dust: 'paper', top: 1.1, dab: 0.07 };
type HBox = { x0: number; y0: number; x1: number; y1: number; open: number; d: number };
const HFACE: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  // corner a, corner b (indices into x0 y0 x1 y1 as 0/2 and 1/3), normal: N, E, S, W (mask bits 1 2 4 8)
  [0, 1, 2, 1, 0, -1], [2, 1, 2, 3, 1, 0], [2, 3, 0, 3, 0, 1], [0, 3, 0, 1, -1, 0],
];
function hedgeAt(x: number, y: number): boolean {
  if (!inB(x, y)) return false;
  const id = OCC[I(x, y)] ?? 0;
  return id !== 0 && propById(id)?.kind === 'hedge';
}

/**
 * A hedge piece on its tile (03 2.7 flora.drawHedge(p, s)): a block with an arm to each 4-neighbour that is a hedge, so a run reads as
 * one hedge (04 6.1: auto-join by the 4-neighbour mask, 16 shapes). The boxes go far to near; each draws its side faces that are turned
 * to the viewer and not inside the run (faceLight, darker toward the ground), then its lighter top with two highlight dabs at zoom 0.9 and
 * over. Autumn mixes 0.3 toward foliageAutumn at x 0.9; winter dusts the top 0.4 toward paper (04 6.1 row hedge).
 */
export function drawHedge(p: Prop, _s: XY, c?: CanvasRenderingContext2D): void {
  const ctx = renderCtx(c), pen = gamePen(ctx), P = pen.spec.palette, Hd = HEDGE, hw = Hd.hw, x = p.x, y = p.y, z = cam.z;
  let mask = 0;
  for (let k = 0; k < 4; k++) {
    const nb = NB4[k] as readonly [number, number];
    if (hedgeAt(x + nb[0], y + nb[1])) mask |= 1 << k;
  }
  const boxes: HBox[] = [{ x0: -hw, y0: -hw, x1: hw, y1: hw, open: mask, d: 0 }];
  if (mask & 1) boxes.push({ x0: -hw, y0: -0.5, x1: hw, y1: -hw, open: 1 | 4, d: 0 });
  if (mask & 2) boxes.push({ x0: hw, y0: -hw, x1: 0.5, y1: hw, open: 2 | 8, d: 0 });
  if (mask & 4) boxes.push({ x0: -hw, y0: hw, x1: hw, y1: 0.5, open: 4 | 1, d: 0 });
  if (mask & 8) boxes.push({ x0: -0.5, y0: -hw, x1: -hw, y1: hw, open: 8 | 2, d: 0 });
  for (const b of boxes) b.d = depthOf(x + (b.x0 + b.x1) / 2, y + (b.y0 + b.y1) / 2);
  boxes.sort((a, b) => a.d - b.d);
  const season = T.season, kL = season === 2 ? 0.9 : 1;
  const leaf = season === 2 ? mix(P[Hd.leaf], P[Hd.autumn], 0.3) : P[Hd.leaf];
  const topHex = season === 3 ? mix(leaf, P[Hd.dust], 0.4) : leaf;
  const e = Hd.h, proj = gameProj;
  for (const b of boxes) {
    const v = [x + b.x0, y + b.y0, x + b.x1, y + b.y1];
    for (let k = 0; k < 4; k++) {
      const f = HFACE[k] as readonly [number, number, number, number, number, number];
      if (b.open & (1 << k) || !faceVis(f[4], f[5])) continue;
      const ax = v[f[0]] as number, ay = v[f[1]] as number, bx = v[f[2]] as number, by = v[f[3]] as number;
      const top = proj(ax, ay, e), foot = proj(ax, ay, 0);
      fillPoly(pen, [foot, proj(bx, by, 0), proj(bx, by, e), top], leaf, { light: faceLight(f[4], f[5]) * kL, grad: { from: top, to: foot, k0: 1.02, k1: 0.84 } });
    }
    const x0 = v[0] as number, y0 = v[1] as number, x1 = v[2] as number, y1 = v[3] as number;
    fillPoly(pen, [proj(x0, y0, e), proj(x1, y0, e), proj(x1, y1, e), proj(x0, y1, e)], topHex, { light: Hd.top * kL });
    if (z >= 0.9) {
      ctx.fillStyle = shade(mix(topHex, P.paper, 0.3), Hd.top * kL, 0.55);
      ctx.beginPath();
      for (let k = 0; k < 2; k++) {
        const q = proj(x0 + (x1 - x0) * (0.2 + 0.6 * h01(x, y, k * 2 + b.open)), y0 + (y1 - y0) * (0.2 + 0.6 * h01(y, x, k * 2 + 7)), e);
        const r = Hd.dab * TW * z;
        ctx.moveTo(q.x + r, q.y);
        ctx.ellipse(q.x, q.y, r, r * 0.5, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }
}
