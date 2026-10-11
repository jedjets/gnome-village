// src/render/flora.ts
// Tree shapes for three species (plane, chestnut, lime) with three forms each, the crown phase by season, the crown colour,
// and drawTree in the three treatments: GV blob crowns (A), flat two-tone discs (B), an ink skeleton with wash blobs (C) (04 6.3, 3.2 row Trees).
// Ported from GV 1703-1728 (buildTreeShape: the round, birch and twig forms), 6749-6762 (crownPhase), 6775 (treeTint),
// 6782-6835 (treeSprite: trunk, branches, twigs, blob crown and highlight, blossom dots, snow). ADAPT: species and colours
// from the palette, heights in EH, the direction's brush; the sprite cache comes in S2.
// TODO(S2): the sprite cache keyed by species, zoom bucket, season, phase, light, snow (GV 6782-6790); bed flowers by BEDC
// live in ground.ts for now; TODO(S9): wind sway and leaf drop.
import { mulberry32 } from '../core/rng.ts';
import { hx, mixc, type RGB } from '../core/math.ts';
import { css } from '../core/math.ts';
import { EH, TW, TH } from './camera.ts';
import { GC, fillEllipse, fillPoly, h01, inkLine, lit, mix, scaleHex, shade, strokeLine, type Pen, type Pt, type StyleSpec } from './ambient.ts';

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
/** The crown's phase from the season and the day inside it (GV crownPhase 6749; 04 6.3 item 1). */
export function crownPhase(season: number, dayInSeason: number): { ph: Phase; f: number } {
  if (season === 3) return { ph: 'bare', f: 1 };
  if (season === 0) {
    if (dayInSeason < 0.9) return { ph: 'bud', f: dayInSeason / 0.9 };
    if (dayInSeason < 2.0) return { ph: 'blossom', f: (dayInSeason - 0.9) / 1.1 };
    return { ph: 'leafing', f: (dayInSeason - 2.0) / 1.0 };
  }
  if (season === 2 && dayInSeason > 2.0) return { ph: 'thin', f: (dayInSeason - 2.0) / 1.0 };
  return { ph: 'leaf', f: 1 };
}

/** The crown hex by species, season and phase (04 6.3 table). */
export function crownHex(spec: StyleSpec, species: Species, season: number, ph: Phase): string {
  const P = spec.palette;
  if (ph === 'blossom') {
    if (species === 0) return mix(P.rose, P.paper, 0.45);
    return species === 1 ? P.foliageSpring : P.limeSpring;
  }
  if (ph === 'bud' || ph === 'leafing' || season === 0) return species === 2 ? P.limeSpring : P.foliageSpring;
  if (season === 2) return species === 0 ? P.foliageAutumn : species === 1 ? P.chestnutAutumn : P.limeAutumn;
  return species === 1 ? scaleHex(P.foliageSummer, [0.92, 0.92, 0.92]) : species === 2 ? scaleHex(P.foliageSummer, [1.08, 1.08, 1.08]) : P.foliageSummer;
}

/** A per-tree lightness and warmth of +-10 % (GV treeTint 6775). */
function treeTint(seed: number, c: RGB): RGB {
  const u = ((seed * 13) % 1) - 0.5, v = ((seed * 29) % 1) - 0.5;
  return [c[0] * (1 + u * 0.1 + v * 0.05), c[1] * (1 + u * 0.1), c[2] * (1 + u * 0.08 - v * 0.05)];
}

export type TreeOpts = { scale?: number; snow?: number; mulch?: boolean };

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
      if (cp.ph === 'bud') {
        ctx.fillStyle = shade(crownHex(spec, t.species, season, 'bud'), 1, 0.55 + cp.f * 0.4);
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(0.8, H * 0.03), 0, Math.PI * 2);
        ctx.fill();
      }
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
  }
  if (bare) return;
  const fcHex = crownHex(spec, t.species, season, cp.ph);
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
