// src/render/ground.ts
// Tile colours by KIND and season with the direction's grain, the game's tile pass, and the tile sampler the Style Gate
// board draws (a patch of tiles through any projection: lawn, desire-path ribbons, gravel, flagstone slabs, beds, puddles) (04 6.5).
// Ported from GV 6417-6422 (projectVerts), 6665-6741 (groundCol reduced to kind, season, grain, wet), 8703-8716 (ribbonPts),
// 8720-8735 (drawSlab). ADAPT: no slopes, no epoch cache yet; the sampler takes a Proj so the board and the game share it.
// TODO(S2): TILE_COL epoch cache (GV 9449-9465), the pan-invariant tile gradient of A (GV fitTileGrad 9471; a per-tile one read as a
// grid of diamonds, so the sampler fills flat and lets the grain carry the unevenness), ribbons from WEAR, lamp pools; TODO(S9): puddles, ice, snow, petals.
import { css, hx, mixc, type RGB } from '../core/math.ts';
import { N, NC, KIND, Kind } from '../world/grid.ts';
import { TW, TH, rotInto, cam, view } from './camera.ts';
import { sxOf, syOf } from './project.ts';
import {
  GC, fillPoly, grain, h01, inkLine, lit, mix, nzAt, scaleHex, shade, skyRamp, style,
  type Pen, type Proj, type Pt, type StyleSpec,
} from './ambient.ts';

export type Season = 0 | 1 | 2 | 3;

/** The lawn hex for a season (04 10.3): spring toward foliageSpring, summer deeper and warmer, autumn and winter mixes. */
export function lawnHex(spec: StyleSpec, season: Season): string {
  const P = spec.palette;
  if (season === 0) return mix(P.lawn, P.foliageSpring, 0.2);
  if (season === 1) return scaleHex(P.lawn, [0.94, 1, 0.9]);
  if (season === 2) return mix(P.lawn, P.lawnAutumn, 0.28);
  return mix(P.lawn, P.winterLawn, 0.35);
}

/** The base hex of a tile kind in a season, before grain and light (04 6.5). */
export function kindHex(spec: StyleSpec, kind: number, season: Season): string {
  const P = spec.palette;
  switch (kind) {
    case Kind.gravel: return P.gravel;
    case Kind.flagstone: return P.flagstone;
    case Kind.bed: return P.bedEarth;
    case Kind.mulch: return scaleHex(P.bedEarth, [0.95, 0.95, 0.95]);
    case Kind.pond:
    case Kind.canal: return P.water;
    default: return lawnHex(spec, season);
  }
}

/** The unlit tile colour at world (x, y): base, the direction's grain, wet darkening (GV 6736-6741; 04 1.3 rule 4, 3.2 row Texture). */
export function tileRGB(spec: StyleSpec, kind: number, x: number, y: number, season: Season, wet = 0): RGB {
  const g = hx(kindHex(spec, kind, season));
  const wetK = 1 - 0.14 * wet;
  if (spec.grain === 'gv') {
    const j = grain(x, y);
    const k = kind === Kind.lawn ? (nzAt(x * 0.83 + 3.1, y * 0.83 + 5.7) - 0.5) * 0.9 : 0;
    return [g[0] * (1 + j * 0.075 + k * 0.045) * wetK, g[1] * (1 + j * 0.075 + k * 0.02) * wetK, g[2] * (1 + j * 0.06 - k * 0.035) * wetK];
  }
  if (spec.grain === 'paper') {
    const j = 1 + grain(x, y) * 0.05;
    return [g[0] * j * wetK, g[1] * j * wetK, g[2] * j * wetK];
  }
  return [g[0] * wetK, g[1] * wetK, g[2] * wetK];
}

/* ---------- the game's tile pass (S0 shape, now through the palette) ---------- */
const NV = N + 1;
const SVX = new Float32Array(NV * NV);
const SVY = new Float32Array(NV * NV);
const scratch: Pt = { x: 0, y: 0 };

/** Base colour of tile i before the ambient light (the current direction, spring). */
export function groundCol(i: number): RGB {
  return tileRGB(style(), KIND[i] ?? 0, i % N, (i / N) | 0, 0);
}

function projectVerts(): void {
  for (let vy = 0; vy < NV; vy++)
    for (let vx = 0; vx < NV; vx++) {
      const r = rotInto(vx - 0.5, vy - 0.5, scratch);
      const k = vy * NV + vx;
      SVX[k] = sxOf(r.x, r.y);
      SVY[k] = syOf(r.x, r.y, 0);
    }
}

const colCache: string[] = Array.from({ length: NC }, () => '');

export function drawGround(ctx: CanvasRenderingContext2D): void {
  projectVerts();
  const mx = TW * cam.z, my = TH * cam.z;
  const cw = view.cw, chh = view.chh;
  ctx.lineWidth = 0.8;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const a = y * NV + x, b = a + 1, c = a + NV + 1, d = a + NV;
      const cx = SVX[a] as number, cy = SVY[a] as number;
      if (cx < -mx || cx > cw + mx || cy < -my || cy > chh + my) continue;
      const i = y * N + x;
      const col = (colCache[i] = css(lit(groundCol(i))));
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(SVX[b] as number, SVY[b] as number);
      ctx.lineTo(SVX[c] as number, SVY[c] as number);
      ctx.lineTo(SVX[d] as number, SVY[d] as number);
      ctx.closePath();
      ctx.fill();
      ctx.stroke(); // the same colour over the edge hides the hairline seams between diamonds
    }
}

/* ---------- the tile sampler (04 4.2 tile 2; the same primitives the S2 tile pass will call per tile) ---------- */
export type TileSample = { kind: number; wet?: number; bedc?: number };
export type WornPath = { pts: Pt[]; wear: number[] }; // world points and the WEAR at each
export type Patch = {
  w: number;
  h: number;
  season: Season;
  at: (x: number, y: number) => TileSample;
  worn?: WornPath[];
};

function tileCorners(proj: Proj, x: number, y: number): Pt[] {
  return [proj(x - 0.5, y - 0.5), proj(x + 0.5, y - 0.5), proj(x + 0.5, y + 0.5), proj(x - 0.5, y + 0.5)];
}

/** One tile's fill in the direction's manner: A a pan-invariant gradient, B flat, C a mottled wash (04 3.2 row Shading). */
function fillTile(pen: Pen, proj: Proj, x: number, y: number, kind: number, season: Season, wet: number): void {
  const { ctx, spec } = pen;
  const pts = tileCorners(proj, x, y);
  const rgb = tileRGB(spec, kind, x, y, season, wet);
  const water = kind === Kind.pond || kind === Kind.canal;
  if (spec.shading === 'wash') {
    // C: paper shows through the wash (alpha 0.85, water 0.5), mixed in so the seams never double up; the wash sits off the line
    const a = water ? 0.5 : 0.85;
    const dx = 0.6 * pen.z, dy = 0.4 * pen.z;
    const col = css(lit(mixc(hx(spec.palette.paper), rgb, a)));
    ctx.beginPath();
    ctx.moveTo((pts[0] as Pt).x + dx, (pts[0] as Pt).y + dy);
    for (let i = 1; i < 4; i++) ctx.lineTo((pts[i] as Pt).x + dx, (pts[i] as Pt).y + dy);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    return;
  }
  // A and B: one flat colour per tile (A's unevenness is the grain of tileRGB, GV 6736-6741)
  ctx.fillStyle = css(lit(rgb));
  ctx.strokeStyle = css(lit(rgb));
  ctx.beginPath();
  ctx.moveTo((pts[0] as Pt).x, (pts[0] as Pt).y);
  for (let i = 1; i < 4; i++) ctx.lineTo((pts[i] as Pt).x, (pts[i] as Pt).y);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

/** A rounded, slightly uneven slab lying flat on the ground (GV drawSlab 8720-8735, through the brush). */
function drawSlab(pen: Pen, proj: Proj, cx: number, cy: number, ang: number, len: number, wid: number, seed: number): void {
  const ca = Math.cos(ang), sa = Math.sin(ang), pts: Pt[] = [];
  const L = len * (0.9 + h01(seed, 1) * 0.2), Wd = wid * (0.9 + h01(seed, 2) * 0.2);
  for (let k = 0; k < 8; k++) {
    const th = ((k + 0.5) / 8) * Math.PI * 2, r = 1 + (h01(seed, 3 + k) - 0.5) * 0.16;
    const ox = Math.cos(th) * L * 0.5 * r, oy = Math.sin(th) * Wd * 0.5 * r;
    pts.push(proj(cx + ox * ca - oy * sa, cy + ox * sa + oy * ca, 0.02));
  }
  const tone = 0.94 + h01(seed, 9) * 0.12;
  const P = pen.spec.palette;
  if (pen.spec.shading === 'wash') {
    fillPoly(pen, pts, P.flagstone, { light: tone, seed, alpha: 0.9, inkAlpha: 0.35, lineW: Math.max(0.6, 0.5 * pen.z), jitterK: 0.5 });
    return;
  }
  const { ctx } = pen;
  ctx.beginPath();
  const n = pts.length;
  const m0 = { x: ((pts[n - 1] as Pt).x + (pts[0] as Pt).x) / 2, y: ((pts[n - 1] as Pt).y + (pts[0] as Pt).y) / 2 };
  ctx.moveTo(m0.x, m0.y);
  for (let k = 0; k < n; k++) {
    const q = pts[k] as Pt, r = pts[(k + 1) % n] as Pt;
    ctx.quadraticCurveTo(q.x, q.y, (q.x + r.x) / 2, (q.y + r.y) / 2);
  }
  ctx.closePath();
  ctx.fillStyle = shade(P.flagstone, tone);
  ctx.fill();
  ctx.strokeStyle = shade(P.flagstone, 0.85, pen.spec.shading === 'flat' ? 0.5 : 0.4);
  ctx.lineWidth = Math.max(0.5, 0.65 * pen.z);
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** The detail a tile wears at zoom >= 1.0 (04 6.5): tufts, pebbles, slabs, flowers; puddles at any zoom. */
function tileDetail(pen: Pen, proj: Proj, x: number, y: number, s: TileSample, season: Season, worn: boolean): void {
  const { ctx, spec, z } = pen;
  const P = spec.palette;
  const seed = x * 131 + y * 7 + 3;
  if (z >= 1.0 && s.kind === Kind.lawn && !worn && !(s.wet && s.wet > 0.3) && spec.id !== 'B') {
    // tufts every half tile (GV cover 6923): soft blades in A, little ink ticks in C
    ctx.strokeStyle = spec.id === 'C' ? GC(P.ink, 0.32) : shade(lawnHex(spec, season), 0.86, 0.7);
    ctx.lineWidth = Math.max(0.6, 0.7 * z);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      if (h01(seed, k, 4) < (spec.id === 'C' ? 0.72 : 0.6)) continue;
      const u = x - 0.35 + h01(seed, k, 5) * 0.7, v = y - 0.35 + h01(seed, k, 6) * 0.7;
      const a = proj(u, v), tip = proj(u + 0.03, v - 0.03, 0.09);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(tip.x + 1.6 * z, tip.y + 0.6 * z);
    }
    ctx.stroke();
  }
  if (z >= 1.0 && s.kind === Kind.gravel) {
    const n = 6 + Math.floor(h01(seed, 0, 7) * 4);
    ctx.fillStyle = shade(P.gravel, 0.9);
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const q = proj(x - 0.42 + h01(seed, k, 8) * 0.84, y - 0.42 + h01(seed, k, 9) * 0.84);
      const r = Math.max(0.5, (0.5 + h01(seed, k, 10) * 0.5) * z);
      ctx.moveTo(q.x + r, q.y);
      ctx.ellipse(q.x, q.y, r, r * 0.55, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  if (z >= 1.0 && s.kind === Kind.flagstone) {
    const n = 2 + (h01(seed, 0, 11) < 0.5 ? 0 : 1);
    for (let k = 0; k < n; k++) {
      const u = x - 0.25 + ((k + 0.5) / n - 0.5) * 0.7 + (h01(seed, k, 12) - 0.5) * 0.1;
      const v = y + (h01(seed, k, 13) - 0.5) * 0.25;
      drawSlab(pen, proj, u, v, (h01(seed, k, 14) - 0.5) * 0.5, 0.42, 0.8, seed * 3 + k);
    }
  }
  if (s.kind === Kind.bed) {
    // the earth rim and 6 to 9 flower dots in the bed colour; autumn half, winter earth only (04 6.1 row bed)
    const bedc = s.bedc ?? 0;
    const flower = [P.rose, P.bedLavender, P.bedMarigold, P.paper][bedc] ?? P.rose;
    const n = season === 3 ? 0 : Math.round((6 + h01(seed, 0, 15) * 3) * (season === 2 ? 0.5 : 1));
    if (n > 0) {
      const r = Math.max(0.8, 1.3 * z);
      for (let k = 0; k < n; k++) {
        const q = proj(x - 0.38 + h01(seed, k, 16) * 0.76, y - 0.38 + h01(seed, k, 17) * 0.76, 0.1);
        if (spec.shading === 'wash') {
          ctx.fillStyle = shade(flower, 1, 0.85);
          ctx.beginPath();
          ctx.arc(q.x + 0.5 * z, q.y + 0.3 * z, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = GC(P.ink, 0.7);
          ctx.lineWidth = Math.max(0.5, 0.5 * z);
          ctx.beginPath();
          ctx.arc(q.x, q.y, r, 0.3, 4.8);
          ctx.stroke();
        } else {
          ctx.fillStyle = shade(flower, 1);
          ctx.beginPath();
          ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
          ctx.fill();
          if (spec.id === 'A') {
            ctx.fillStyle = shade(P.paper, 1, 0.5);
            ctx.beginPath();
            ctx.arc(q.x - r * 0.3, q.y - r * 0.3, r * 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }
  if (s.wet && s.wet > 0.3) {
    // a puddle: an ellipse 0.6 x 0.3 tile in the sky's top colour at alpha 0.35 WET (04 6.5)
    const [top] = skyRamp(spec, 0.5);
    const c = proj(x, y, 0.01);
    ctx.fillStyle = css(lit(top), 0.35 * s.wet);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 0.3 * TW * z, 0.3 * TH * z, 0, 0, Math.PI * 2);
    ctx.fill();
    if (spec.id === 'C') {
      ctx.strokeStyle = GC(P.ink, 0.45);
      ctx.lineWidth = Math.max(0.5, 0.6 * z);
      ctx.beginPath();
      ctx.moveTo(c.x - 0.2 * TW * z, c.y + 0.1 * TH * z);
      ctx.lineTo(c.x + 0.1 * TW * z, c.y + 0.12 * TH * z);
      ctx.stroke();
    }
  }
}

/** A desire path: a trodden ribbon in bedEarth, half-width 0.15 to 0.29 tile by WEAR, bare earth from 2.6 (GV ribbonPts 8703; 04 6.5). */
function drawRibbon(pen: Pen, proj: Proj, worn: WornPath): void {
  const { ctx, spec, z } = pen;
  const n = worn.pts.length;
  if (n < 2) return;
  const NS = 6;
  const L: Pt[] = [], R: Pt[] = [];
  const wearAt: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = worn.pts[i] as Pt, b = worn.pts[i + 1] as Pt;
    const kEnd = i === n - 2 ? NS : NS - 1;
    for (let k = 0; k <= kEnd; k++) {
      const t = k / NS;
      const wear = (worn.wear[i] ?? 0) + ((worn.wear[i + 1] ?? 0) - (worn.wear[i] ?? 0)) * t;
      const hw = 0.15 + Math.max(0, Math.min(1, (wear - 1.6) / 1.0)) * 0.14;
      const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      const ox = (-dy / l) * hw, oy = (dx / l) * hw;
      L.push(proj(px + ox, py + oy, 0.015));
      R.push(proj(px - ox, py - oy, 0.015));
      wearAt.push(wear);
    }
  }
  const pts = L.concat(R.slice().reverse());
  const earth = spec.palette.bedEarth;
  const maxWear = Math.max(...wearAt);
  const bare = maxWear >= 2.6;
  if (spec.shading === 'wash') {
    fillPoly(pen, pts, earth, { alpha: bare ? 0.8 : 0.35, noInk: true, seed: 77 });
    return;
  }
  ctx.fillStyle = shade(earth, 1, bare ? 0.8 : 0.35);
  ctx.beginPath();
  ctx.moveTo((pts[0] as Pt).x, (pts[0] as Pt).y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo((pts[i] as Pt).x, (pts[i] as Pt).y);
  ctx.closePath();
  ctx.fill();
  if (spec.shading === 'flat') {
    ctx.strokeStyle = shade(earth, 1, bare ? 0.8 : 0.35);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.8, 2 * z);
    ctx.stroke();
  }
}

/** Water detail: ripples (A), a wavy paper stroke (B), a bank wash and ink ticks (C) (04 3.2 row Water). */
function waterDetail(pen: Pen, proj: Proj, x: number, y: number, patch: Patch): void {
  const { ctx, spec, z } = pen;
  const P = spec.palette;
  const c = proj(x, y);
  const seed = x * 17 + y * 29;
  if (spec.id === 'A') {
    const [top] = skyRamp(spec, 0.5);
    ctx.fillStyle = css(lit(mixc(top, hx(P.paper), 0.5)), 0.22);
    ctx.beginPath();
    ctx.ellipse(c.x - 0.1 * TW * z, c.y - 0.1 * TH * z, 0.3 * TW * z, 0.16 * TH * z, 0, 0, Math.PI * 2);
    ctx.fill();
    if (z > 0.7) {
      ctx.strokeStyle = GC(P.paper, 0.35);
      ctx.lineWidth = Math.max(0.5, 0.6 * z);
      ctx.beginPath();
      ctx.ellipse(c.x + (h01(seed, 1) - 0.5) * 6 * z, c.y + (h01(seed, 2) - 0.5) * 3 * z, 0.22 * TW * z, 0.22 * TH * z, 0, 0.2, 2.6);
      ctx.stroke();
    }
  } else if (spec.id === 'B') {
    ctx.strokeStyle = GC(P.paper, 0.6);
    ctx.lineWidth = Math.max(1, 1.4 * z);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const w = 0.28 * TW * z;
    ctx.moveTo(c.x - w, c.y);
    ctx.quadraticCurveTo(c.x - w * 0.5, c.y - 2.2 * z, c.x, c.y);
    ctx.quadraticCurveTo(c.x + w * 0.5, c.y + 2.2 * z, c.x + w, c.y);
    ctx.stroke();
  } else {
    // a darker band along the bank where a neighbour is dry, then ink ticks
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      const inside = nx >= 0 && ny >= 0 && nx < patch.w && ny < patch.h;
      const k = inside ? patch.at(nx, ny).kind : Kind.lawn;
      if (k === Kind.pond || k === Kind.canal) continue;
      const band = [proj(x + dx * 0.5 - dy * 0.5, y + dy * 0.5 - dx * 0.5), proj(x + dx * 0.5 + dy * 0.5, y + dy * 0.5 + dx * 0.5),
        proj(x + dx * 0.2 + dy * 0.5, y + dy * 0.2 + dx * 0.5), proj(x + dx * 0.2 - dy * 0.5, y + dy * 0.2 - dx * 0.5)];
      ctx.fillStyle = shade(P.water, 0.85, 0.35);
      ctx.beginPath();
      ctx.moveTo((band[0] as Pt).x, (band[0] as Pt).y);
      for (let i = 1; i < 4; i++) ctx.lineTo((band[i] as Pt).x, (band[i] as Pt).y);
      ctx.closePath();
      ctx.fill();
    }
    if ((x + y) % 2 === 0) {
      const w = 0.22 * TW * z;
      for (let k = 0; k < 2; k++) {
        const yy = c.y + (k - 0.5) * 3.2 * z + (h01(seed, k, 3) - 0.5) * 2 * z;
        const xx = c.x + (h01(seed, k, 4) - 0.5) * 8 * z;
        inkLine(pen, [{ x: xx - w, y: yy }, { x: xx + w, y: yy + 0.4 * z }], { open: true, seed: seed + k, inkAlpha: 0.55, gapless: true });
      }
    }
  }
}

/** Draw a w x h patch of tiles at world (0..w, 0..h) through `proj` (the board's tile 2; S2 calls the same pieces per tile). */
export function drawTilePatch(pen: Pen, proj: Proj, patch: Patch): void {
  const { spec } = pen;
  const wornTiles = new Set<string>();
  for (const w of patch.worn ?? []) for (const p of w.pts) wornTiles.add(Math.round(p.x) + ',' + Math.round(p.y));
  for (let y = 0; y < patch.h; y++)
    for (let x = 0; x < patch.w; x++) {
      const s = patch.at(x, y);
      fillTile(pen, proj, x, y, s.kind, patch.season, s.wet ?? 0);
    }
  if (spec.line === 'ink') {
    // C: an ink line where the ground changes kind (the road edges of ref3), at half strength
    for (let y = 0; y < patch.h; y++)
      for (let x = 0; x < patch.w; x++) {
        const k = patch.at(x, y).kind;
        const water = (kk: number): boolean => kk === Kind.pond || kk === Kind.canal;
        if (x + 1 < patch.w && patch.at(x + 1, y).kind !== k && !(water(k) && water(patch.at(x + 1, y).kind)))
          inkLine(pen, [proj(x + 0.5, y - 0.5), proj(x + 0.5, y + 0.5)], { open: true, seed: x * 31 + y, inkAlpha: 0.45 });
        if (y + 1 < patch.h && patch.at(x, y + 1).kind !== k)
          inkLine(pen, [proj(x - 0.5, y + 0.5), proj(x + 0.5, y + 0.5)], { open: true, seed: x * 31 + y + 7, inkAlpha: 0.45 });
      }
  }
  for (const w of patch.worn ?? []) drawRibbon(pen, proj, w);
  for (let y = 0; y < patch.h; y++)
    for (let x = 0; x < patch.w; x++) {
      const s = patch.at(x, y);
      if (s.kind === Kind.pond || s.kind === Kind.canal) waterDetail(pen, proj, x, y, patch);
      else tileDetail(pen, proj, x, y, s, patch.season, wornTiles.has(x + ',' + y));
    }
}
