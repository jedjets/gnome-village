// src/render/ground.ts
// The game's ground pass (04 6.5): tile colours by KIND, season, grain, wear, wet and petals on a colour epoch, filled once per colour
// from paths built in world units and drawn through one affine world transform; worn-lawn ribbons at z >= 0.45; petals, puddles;
// pebbles, flagstones and tufts at z >= 1.0; bed flowers at z > 0.8 (03 7.5). The tile colour helpers (lawnHex, kindHex, tileRGB) are
// shared with the Style Gate board's tile sampler, which lives in board-ground.ts (frozen for the board, 04 3.4; AGENTS rule 9).
// Ported from GV 6631-6638 (nzAt, grain, in ambient.ts), 6665-6741 (groundCol), 8628-8716 (WORN_T, buildPieces, curveAt, curveTan,
// ribbonPts), 8720-8735 (drawSlab), 9449-9465 (TILE_COL, TILE_EP), 9586-9587 (the epoch cadence), 9809-9811 (puddles), 6923 (cover).
// Verdict: ADAPT. Changes: groundCol is reduced to kind, the season hook, grain and mottle, trodden ground (GV TROD), wet and petals (03
// 7.5 item 3: no slope, AO, gradients, sand, rock, snow line, fire yard); colours are quantised to steps of 3 so tiles group by colour,
// and each colour is one cached Path2D in world units filled under setWorldTransform (03 7.5 item 4's runs and per-tile cull become one
// fill per colour); the ribbon threshold is 04 6.5's (a way from WEAR 1.6, off below 1.1; bare earth on at 2.6, off below 2.1) where GV
// had one way threshold 2.6; a way runs on into a gravel or flagstone tile beside it; ribbons are one nonzero fill, not per-tile clips
// (flat ground: nothing in front can hide them); the epoch also turns on a changed tile layer (worldVersion) or quality level, and its
// 220 ms tick rebuilds only when what the colours read has moved (a paused park rebuilds nothing); pebbles are tiny world squares.
// Dropped from the range: paved ways and hearth slabs (KIND gravel is the paving), clipTile, the line mode below z 0.7, steps.
// TODO(S9): snow cover (04 10.3), landed leaves (04 10.4). The lamp pools (03 7.3 item 5) are draw.ts's, right after this pass.
import { clamp01, css, hx, mixc, TAU, type RGB, type XY } from '../core/math.ts';
import { T } from '../core/clock.ts';
import { now } from '../core/loop.ts';
import { I, ICE, N, NC, KIND, Kind, OCC, PETALS, WEAR, WET, inB, worldVersion } from '../world/grid.ts';
import { CTR, EH, TH, TW, VANCH, cam, rotVec, screenToWorld, view } from './camera.ts';
import { screenInto } from './project.ts';
import { drawBedTile } from './flora.ts';
import * as drawMod from './draw.ts';
import { AA, AM, GC, grain, h01, lit, mix, nzAt, scaleHex, seasonHex, shade, skyRamp, style, type StyleSpec } from './ambient.ts';

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

/* ---------- the game: the canvas, the world transform (03 2.7, 7.1 item 2) ---------- */
type CtxSource = { ctx?: CanvasRenderingContext2D | null; getCtx?: () => CanvasRenderingContext2D };
/** The context a pass draws on: the one passed, else draw.ts's (03 2.7: draw.ts owns the canvas; either export name is read). */
export function ctxOf(c?: CanvasRenderingContext2D): CanvasRenderingContext2D {
  if (c) return c;
  const m = drawMod as unknown as CtxSource;
  const k = m.ctx ?? m.getCtx?.();
  if (!k) throw new Error('render not initialised');
  return k;
}

/** World (x, y) at height e straight to device pixels: sxOf and syOf as one affine map, so a path built once in tiles draws at any pan,
 *  zoom and angle (a world circle lands as the flat iso ellipse a thing lying on the ground should be). */
export function setWorldTransform(c: CanvasRenderingContext2D, e = 0): void {
  const z = cam.z, d = view.dpr, r = rotVec(1, 0), co = r.x, si = r.y;
  const a = z * (TW / 2) * (co - si), cc = -z * (TW / 2) * (si + co), b = z * (TH / 2) * (co + si), dd = z * (TH / 2) * (co - si);
  const ex = view.cw / 2 + cam.ox - (a + cc) * CTR, fy = view.chh * VANCH + cam.oy - e * EH * z - (b + dd) * CTR;
  c.setTransform(a * d, b * d, cc * d, dd * d, ex * d, fy * d);
}
/** Back to CSS pixels, the transform draw.ts sets in phase 1. */
export function resetTransform(c: CanvasRenderingContext2D): void {
  c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
}

const VB = { x0: 0, y0: 0, x1: 0, y1: 0 };
const W0: XY = { x: 0, y: 0 };
/** The world box under the canvas, grown by `m` tiles (a reused object), for the passes that loop over what is on screen. */
export function viewBounds(m = 1): Readonly<typeof VB> {
  VB.x0 = VB.y0 = Infinity;
  VB.x1 = VB.y1 = -Infinity;
  for (const [sx, sy] of [[0, 0], [view.cw, 0], [0, view.chh], [view.cw, view.chh]] as const) {
    screenToWorld(sx, sy, W0);
    VB.x0 = Math.min(VB.x0, W0.x - m);
    VB.y0 = Math.min(VB.y0, W0.y - m);
    VB.x1 = Math.max(VB.x1, W0.x + m);
    VB.y1 = Math.max(VB.y1, W0.y + m);
  }
  return VB;
}

/* ---------- the colour epoch (GV 9449-9465, 9586-9587; 03 7.5 items 1-2) ---------- */
export let colEpoch = 1;
let colAt = -1e9, colAng = 0, colSeason = -1, colLamps = false, colWorld = -1, colAmb = '', builtEp = 0, quality = 0;
const TILE_COL: string[] = Array.from({ length: NC }, () => '');
const TILE_EP = new Int32Array(NC);
/** Recolour on the next frame (a tool painted tiles, a restore). */
export function bumpEpoch(): void {
  colEpoch++;
}
/** perf.qualityLevel() as main.ts hands it in (render may not import debug, 03 2.1): level 1 and up drops the ribbons, 2 the petals. */
export function setGroundQuality(q: number): void {
  if (q !== quality) {
    quality = q;
    colEpoch++;
  }
}
/** The quality level handed in, for the lamp pools draw.ts paints in this phase (level 1 and up drops them, 03 13). */
export function groundQuality(): number {
  return quality;
}
/** What the tile colours read that the sim changes without a world version: the light, the season blend and the WET, PETALS, WEAR
 *  and ICE layers, as one number (a weighted sum; the epoch only needs to know that something moved). */
function colourState(): string {
  let s = 0;
  for (let i = 0; i < NC; i++) s += (WET[i] as number) * 3.1 + (PETALS[i] as number) * 5.3 + (WEAR[i] as number) * 1.7 + (ICE[i] as number) * 7.9;
  return ((AM[0] * 1000) | 0) + ',' + ((AM[1] * 1000) | 0) + ',' + ((AA * 1000) | 0) + ',' + seasonHex((q) => lawnHex(style(), q)) + ',' + s;
}
/** A new epoch every 220 ms, 110 ms while turning (GV 9586-9587), when what the colours read has changed (colourState; a paused or
 *  unchanged park rebuilds nothing), or at once when the season, the lamps, the quality or the tiles change; with no frame clock running
 *  (a test, a scripted draw) a change counts as the time having passed. */
function stepEpoch(): void {
  const t = now(), turning = cam.ang !== colAng;
  if (t - colAt <= (turning ? 110 : 220) && t > colAt && T.season === colSeason && T.lamps === colLamps && worldVersion() === colWorld) return;
  const amb = colourState();
  colAt = t;
  colAng = cam.ang;
  if (amb !== colAmb || T.season !== colSeason || T.lamps !== colLamps || worldVersion() !== colWorld) {
    colEpoch++;
    colSeason = T.season;
    colLamps = T.lamps;
    colWorld = worldVersion();
    colAmb = amb;
  }
}

/* ---------- tile colours: groundCol reduced (GV 6665-6741 rule stack without slope, AO or gradients; 03 7.5 item 3) ---------- */
const BASE: RGB[] = [];
let EARTH: RGB = [0, 0, 0], ROSE: RGB = [0, 0, 0], ICEC: RGB = [0, 0, 0], LAWN_HEX = '';
const GJ = new Float32Array(NC), GM = new Float32Array(NC); // grain and meadow mottle per tile: fixed noise, computed once
let grainDone = false;
function computeBase(): void {
  const spec = style(), P = spec.palette;
  LAWN_HEX = seasonHex((s) => lawnHex(spec, s)); // the season-tint hook, blended over half a day across a change (03 7.3 item 6)
  const lawn = hx(LAWN_HEX);
  EARTH = hx(P.bedEarth);
  ROSE = hx(P.rose);
  ICEC = hx(P.ice);
  for (let k = 0; k <= Kind.canal; k++)
    BASE[k] = k === Kind.lawn ? lawn : k === Kind.pond || k === Kind.canal ? mixc(lawn, EARTH, 0.35) : hx(kindHex(spec, k, 0));
  if (!grainDone) {
    grainDone = true;
    for (let i = 0; i < NC; i++) {
      const x = i % N, y = (i / N) | 0;
      GJ[i] = grain(x, y);
      GM[i] = (nzAt(x * 0.83 + 3.1, y * 0.83 + 5.7) - 0.5) * 0.9;
    }
  }
}

/**
 * Tile i's colour before the light: the kind's base (lawn by the season hook; a water tile shows its bank, which the water body covers
 * but for its rounded corners), GV's grain +-7.5 % and the lawn's mottle, broad trodden ground toward earth, WET darker by 14 % (gravel
 * 12 %, 04 6.5), PETALS toward rose by half, ICE whitening a water tile's bank toward `ice` (03 7.5 item 3; water.ts draws the ice).
 */
export function groundCol(i: number): RGB {
  if (!BASE.length) computeBase();
  const k = KIND[i] ?? 0, g = BASE[k] ?? (BASE[0] as RGB);
  const j = GJ[i] as number, m = k === Kind.lawn ? (GM[i] as number) : 0;
  let r = g[0] * (1 + j * 0.075 + m * 0.045), gg = g[1] * (1 + j * 0.075 + m * 0.02), b = g[2] * (1 + j * 0.06 - m * 0.035);
  const t = (TROD[i] as number) * 0.4;
  if (t > 0) {
    r += (EARTH[0] - r) * t;
    gg += (EARTH[1] - gg) * t;
    b += (EARTH[2] - b) * t;
  }
  const wet = WET[i] as number;
  if (wet > 0) {
    const w = 1 - (k === Kind.gravel ? 0.12 : 0.14) * wet;
    r *= w;
    gg *= w;
    b *= w;
  }
  if (ICE[i] && (k === Kind.pond || k === Kind.canal)) {
    r += (ICEC[0] - r) * 0.6;
    gg += (ICEC[1] - gg) * 0.6;
    b += (ICEC[2] - b) * 0.6;
  }
  const pe = (PETALS[i] as number) * 0.5;
  if (pe > 0) {
    r += (ROSE[0] - r) * pe;
    gg += (ROSE[1] - gg) * pe;
    b += (ROSE[2] - b) * pe;
  }
  return [r, gg, b];
}

/** A lit colour as a CSS string on steps of 3, so neighbouring tiles share a string and the pass fills each colour once. */
function qcss(c: RGB): string {
  const q = (v: number): number => (v <= 0 ? 0 : v >= 255 ? 255 : ((v / 3) | 0) * 3);
  return 'rgb(' + q(c[0]) + ',' + q(c[1]) + ',' + q(c[2]) + ')';
}
/** The cached CSS colour of tile i for this epoch (GV TILE_COL / TILE_EP 9449). */
export function tileCol(i: number): string {
  if (TILE_EP[i] !== colEpoch) {
    TILE_EP[i] = colEpoch;
    TILE_COL[i] = qcss(lit(groundCol(i)));
  }
  return TILE_COL[i] as string;
}

/* ---------- worn lawn: ways and trodden ground (GV buildPieces 8654-8701, ribbonPts 8703-8716; 03 7.5 item 5; 04 6.5) ---------- */
const WST = new Uint8Array(NC); // 0 none, 1 a way (a ribbon), 2 broad trodden ground (a tint in the tile colour, GV TROD)
const BARE = new Uint8Array(NC); // bare earth: on at WEAR 2.6, off below 2.1 (GV WORN_T 8637)
const TROD = new Float32Array(NC);
const D8X = [1, 1, 0, -1, -1, -1, 0, 1], D8Y = [0, 1, 1, 1, 0, -1, -1, -1];
type Curve = { hw: number; x0: number; y0: number; cx?: number; cy?: number; x1: number; y1: number; capA?: boolean; capB?: boolean };
let RIB: Array<Path2D | null> = [null, null, null, null]; // trodden outer, trodden inner, bare outer, bare inner
let nWays = 0;

function updateWays(): void {
  nWays = 0;
  for (let i = 0; i < NC; i++) {
    TROD[i] = 0;
    if (KIND[i] !== Kind.lawn || OCC[i]) {
      WST[i] = 0;
      BARE[i] = 0;
      continue;
    }
    const w = WEAR[i] as number;
    if (WST[i] === 0) {
      if (w >= 1.6) WST[i] = 1;
    } else if (w < 1.1) WST[i] = 0;
    if (BARE[i] === 0) {
      if (w >= 2.6) BARE[i] = 1;
    } else if (w < 2.1) BARE[i] = 0;
  }
  for (let i = 0; i < NC; i++) {
    if (!WST[i]) continue;
    const x = i % N, y = (i / N) | 0;
    let n = 0;
    for (let d = 0; d < 8; d++) if (inB(x + (D8X[d] as number), y + (D8Y[d] as number)) && WST[I(x + (D8X[d] as number), y + (D8Y[d] as number))]) n++;
    if (WST[i] === 1 && n >= 5) WST[i] = 2; // most of its neighbours worn too: trodden ground, not a way
    else if (WST[i] === 2 && n <= 3) WST[i] = 1;
    if (WST[i] === 2) TROD[i] = clamp01(((WEAR[i] as number) - 1.0) / 1.6);
    else nWays++;
  }
}

function curveAt(cv: Curve, t: number, o: number[]): void {
  const u = 1 - t;
  if (cv.cx === undefined || cv.cy === undefined) {
    o[0] = cv.x0 + (cv.x1 - cv.x0) * t;
    o[1] = cv.y0 + (cv.y1 - cv.y0) * t;
    o[2] = cv.x1 - cv.x0;
    o[3] = cv.y1 - cv.y0;
  } else {
    o[0] = u * u * cv.x0 + 2 * u * t * cv.cx + t * t * cv.x1;
    o[1] = u * u * cv.y0 + 2 * u * t * cv.cy + t * t * cv.y1;
    o[2] = 2 * u * (cv.cx - cv.x0) + 2 * t * (cv.x1 - cv.cx);
    o[3] = 2 * u * (cv.cy - cv.y0) + 2 * t * (cv.y1 - cv.cy);
  }
  const l = Math.hypot(o[2] as number, o[3] as number) || 1;
  o[2] = (o[2] as number) / l;
  o[3] = (o[3] as number) / l;
}
/** The ribbon round a curve, in tiles, into a path: left side out, round cap, right side back, round cap; always the same winding, so
 *  one nonzero fill joins the pieces without doubling the alpha where they meet (GV ribbonPts 8703). */
function ribbonInto(p: Path2D, cv: Curve, hw: number): void {
  const L: number[] = [], R: number[] = [], o = [0, 0, 0, 0];
  for (let k = 0; k <= 6; k++) {
    curveAt(cv, k / 6, o);
    const [px, py, tx, ty] = o as [number, number, number, number];
    L.push(px - ty * hw, py + tx * hw);
    R.push(px + ty * hw, py - tx * hw);
  }
  p.moveTo(L[0] as number, L[1] as number);
  for (let k = 2; k < L.length; k += 2) p.lineTo(L[k] as number, L[k + 1] as number);
  const cap = (t: number, a0: number): void => {
    curveAt(cv, t, o);
    const [px, py, tx, ty] = o as [number, number, number, number];
    for (let a = 1; a <= 5; a++) {
      const th = a0 + (a * Math.PI) / 6, c = Math.cos(th), s = Math.sin(th);
      p.lineTo(px + (-ty * c + tx * s) * hw, py + (tx * c + ty * s) * hw);
    }
  };
  if (cv.capB) cap(1, 0);
  for (let k = R.length - 2; k >= 0; k -= 2) p.lineTo(R[k] as number, R[k + 1] as number);
  if (cv.capA) cap(0, Math.PI);
  p.closePath();
}
function buildRibbons(): void {
  RIB = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const paved = (k: number): boolean => k === Kind.gravel || k === Kind.flagstone;
  for (let i = 0; i < NC; i++) {
    if (WST[i] !== 1) continue;
    const x = i % N, y = (i / N) | 0, nb: number[] = [];
    for (let d = 0; d < 8; d++) {
      const nx = x + (D8X[d] as number), ny = y + (D8Y[d] as number);
      if (!inB(nx, ny)) continue;
      const j = I(nx, ny);
      if (WST[j] === 1 || (d % 2 === 0 && paved(KIND[j] as number))) nb.push(j); // a way runs on into a worn tile or a path beside it
    }
    if (!nb.length) continue; // a worn tile alone is a scuff, not a way
    let a = -1, c = -1, best = -2;
    for (let p = 0; p < nb.length; p++)
      for (let q = p + 1; q < nb.length; q++) {
        const pj = nb[p] as number, qj = nb[q] as number;
        const px = (pj % N) - x, py = ((pj / N) | 0) - y, qx = (qj % N) - x, qy = ((qj / N) | 0) - y;
        const dot = -(px * qx + py * qy) / ((Math.hypot(px, py) || 1) * (Math.hypot(qx, qy) || 1));
        if (dot > best) {
          best = dot;
          a = pj;
          c = qj;
        }
      }
    if (a < 0) a = nb[0] as number;
    const hw = 0.15 + 0.14 * clamp01(((WEAR[i] as number) - 1.6) / 1.0);
    const mx = (j: number): number => (x + (j % N)) / 2, my = (j: number): number => (y + ((j / N) | 0)) / 2;
    const cvs: Curve[] = [];
    if (c >= 0) cvs.push({ hw, x0: mx(a), y0: my(a), cx: x, cy: y, x1: mx(c), y1: my(c) });
    else cvs.push({ hw, x0: mx(a), y0: my(a), x1: x, y1: y, capB: true });
    for (const j of nb) if (j !== a && j !== c) cvs.push({ hw, x0: x, y0: y, x1: mx(j), y1: my(j) });
    const g = BARE[i] ? 2 : 0;
    for (const cv of cvs) {
      ribbonInto(RIB[g] as Path2D, cv, hw * 1.45);
      ribbonInto(RIB[g + 1] as Path2D, cv, hw);
    }
  }
}

/* ---------- the epoch's paths: tile colours, petals, puddles (03 7.5 item 4; 04 6.5) ---------- */
const groups = new Map<string, Path2D>();
let PET: Path2D[] = [], PUD: Path2D[] = []; // by alpha step, 1/4 to 4/4
let PEB: Path2D | null = null, SLAB: Path2D[] = [], detailWorld = -1;

function refresh(): void {
  if (builtEp === colEpoch) return;
  builtEp = colEpoch;
  computeBase();
  updateWays();
  groups.clear();
  for (let i = 0; i < NC; i++) {
    const col = tileCol(i);
    let p = groups.get(col);
    if (!p) groups.set(col, (p = new Path2D()));
    p.rect((i % N) - 0.51, ((i / N) | 0) - 0.51, 1.02, 1.02); // a hair over the tile, so neighbours overlap instead of leaving a seam
  }
  if (nWays > 0 && quality < 1) buildRibbons();
  else RIB = [null, null, null, null];
  PET = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  PUD = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  for (let i = 0; i < NC; i++) {
    const x = i % N, y = (i / N) | 0, pe = PETALS[i] as number, wet = WET[i] as number, k = KIND[i] as number;
    if (pe > 0.05 && !OCC[i]) {
      // 8 to 12 rose dots r 0.04 tile, placed by h01 so they hold still while the layer fades (04 6.5)
      const p = PET[Math.min(3, Math.floor(pe * 4))] as Path2D, n = 8 + Math.floor(h01(x, y, 31) * 5);
      for (let q = 0; q < n; q++) {
        const u = x - 0.42 + h01(x, y, 32 + q) * 0.84, v = y - 0.42 + h01(x, y, 50 + q) * 0.84;
        p.moveTo(u + 0.04, v);
        p.arc(u, v, 0.04, 0, TAU);
      }
    }
    if (wet > 0.3 && (k === Kind.gravel || k === Kind.flagstone || (WEAR[i] as number) > 1.4) && h01(x, y, 5) < 0.55 && !OCC[i]) {
      // a puddle where the ground is hard or trodden (GV 9809-9811), alpha 0.35 WET (04 6.5)
      const r = 0.18 + h01(x, y, 6) * 0.1, ox = (h01(x, y, 7) - 0.5) * 0.3, oy = (h01(x, y, 8) - 0.5) * 0.3;
      const p = PUD[Math.min(3, Math.floor(wet * 4))] as Path2D;
      p.moveTo(x + ox + r * 1.3, y + oy);
      p.ellipse(x + ox, y + oy, r * 1.3, r * 0.8, 0.6, 0, TAU);
    }
  }
  if (detailWorld !== worldVersion()) buildDetail();
}

/** Pebbles on gravel and flagstones on flagstone tiles in world units, rebuilt only when the tiles change (04 6.5, GV drawSlab 8720). */
function buildDetail(): void {
  detailWorld = worldVersion();
  PEB = new Path2D();
  SLAB = [new Path2D(), new Path2D(), new Path2D()];
  for (let i = 0; i < NC; i++) {
    if (OCC[i]) continue;
    const x = i % N, y = (i / N) | 0, seed = x * 131 + y * 7 + 3;
    if (KIND[i] === Kind.gravel) {
      const n = 6 + Math.floor(h01(seed, 0, 7) * 4);
      for (let k = 0; k < n; k++) {
        // a world square of the round pebble's area: a 4-edge diamond on screen rasters at a fraction of an arc's cost, and at 2 to 4 px
        // the two look the same
        const u = x - 0.42 + h01(seed, k, 8) * 0.84, v = y - 0.42 + h01(seed, k, 9) * 0.84, r = (0.035 + h01(seed, k, 10) * 0.035) * 0.886;
        PEB.rect(u - r, v - r, 2 * r, 2 * r);
      }
    } else if (KIND[i] === Kind.flagstone) {
      const n = 2 + (h01(seed, 0, 11) < 0.5 ? 0 : 1);
      for (let k = 0; k < n; k++) {
        // n strips across the tile, jittered, rounded (the board's slabs, centred on the tile)
        const cx = x + ((k + 0.5) / n - 0.5) * 0.86 + (h01(seed, k, 12) - 0.5) * 0.06, cy = y + (h01(seed, k, 13) - 0.5) * 0.12;
        const s = seed * 3 + k, ang = (h01(seed, k, 14) - 0.5) * 0.3, ca = Math.cos(ang), sa = Math.sin(ang);
        const L = (0.86 / n) * (0.9 + h01(s, 1) * 0.2), Wd = 0.8 * (0.9 + h01(s, 2) * 0.2), pts: number[] = [];
        for (let q = 0; q < 8; q++) {
          const th = ((q + 0.5) / 8) * TAU, rr = 1 + (h01(s, 3 + q) - 0.5) * 0.16;
          const ox = Math.cos(th) * L * 0.5 * rr, oy = Math.sin(th) * Wd * 0.5 * rr;
          pts.push(cx + ox * ca - oy * sa, cy + ox * sa + oy * ca);
        }
        const p = SLAB[Math.min(2, Math.floor(h01(s, 9) * 3))] as Path2D;
        p.moveTo(((pts[14] as number) + (pts[0] as number)) / 2, ((pts[15] as number) + (pts[1] as number)) / 2);
        for (let q = 0; q < 8; q++) {
          const a = q * 2, b = ((q + 1) % 8) * 2;
          p.quadraticCurveTo(pts[a] as number, pts[a + 1] as number, ((pts[a] as number) + (pts[b] as number)) / 2, ((pts[a + 1] as number) + (pts[b + 1] as number)) / 2);
        }
        p.closePath();
      }
    }
  }
}

/* ---------- the tile pass (03 7.9 phase 4) ---------- */
const SP: XY = { x: 0, y: 0 }, SQ: XY = { x: 0, y: 0 };
/**
 * Phase 4: the tiles, filled once per colour from the epoch's paths under the world transform; worn-lawn ribbons at z >= 0.45; petals
 * and puddles; at z >= 1.0 pebbles, flagstones and lawn tufts; bed flowers by BEDC at z > 0.8 (flora.drawBedTile). Lamp pools: draw.ts.
 */
export function drawGround(c?: CanvasRenderingContext2D): void {
  const ctx = ctxOf(c);
  stepEpoch();
  refresh();
  const z = cam.z, P = style().palette;
  ctx.save();
  setWorldTransform(ctx);
  for (const [col, p] of groups) {
    ctx.fillStyle = col;
    ctx.fill(p);
  }
  if (z >= 0.45 && RIB[0]) {
    // the worn earth: a soft band, then the trodden middle; bare earth stronger (04 6.5: alpha 0.35 trodden, 0.8 bare; GV 8761-8762)
    for (let g = 0; g < 4; g++) {
      ctx.fillStyle = GC(P.bedEarth, (g < 2 ? 0.35 : 0.8) * (g % 2 ? 1 : 0.4));
      ctx.fill(RIB[g] as Path2D);
    }
  }
  if (z >= 0.6 && quality < 2)
    for (let q = 0; q < 4; q++) {
      ctx.fillStyle = GC(P.rose, (q + 1) / 4);
      ctx.fill(PET[q] as Path2D);
    }
  if (z >= 0.7) {
    const top = lit(skyRamp(style(), T.f)[0]);
    for (let q = 0; q < 4; q++) {
      ctx.fillStyle = css(top, 0.35 * ((q + 1) / 4));
      ctx.fill(PUD[q] as Path2D);
    }
  }
  if (z >= 1.0 && PEB) {
    ctx.fillStyle = shade(P.gravel, 0.9);
    ctx.fill(PEB);
    ctx.strokeStyle = shade(P.flagstone, 0.85, 0.4);
    ctx.lineWidth = 0.045; // world units under the transform: about 0.65 z px (GV 8734)
    for (let q = 0; q < 3; q++) {
      ctx.fillStyle = shade(P.flagstone, 0.94 + q * 0.05);
      ctx.fill(SLAB[q] as Path2D);
      ctx.stroke(SLAB[q] as Path2D);
    }
  }
  ctx.restore();
  if (z < 0.8) return;
  const vb = viewBounds(1), x0 = Math.max(0, Math.floor(vb.x0)), x1 = Math.min(N - 1, Math.ceil(vb.x1));
  const y0 = Math.max(0, Math.floor(vb.y0)), y1 = Math.min(N - 1, Math.ceil(vb.y1)), mx = TW * z, cw = view.cw, chh = view.chh;
  if (z >= 1.0) {
    // tufts every half tile on unworn, dry, open lawn (GV cover 6923; the board's tile 2), one stroke for all; butt caps, which at under a
    // pixel wide look the same as round ones and cost a third of the raster (several thousand blades at the default zoom)
    ctx.strokeStyle = shade(LAWN_HEX, 0.86, 0.7);
    ctx.lineWidth = Math.max(0.6, 0.7 * z);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = I(x, y);
        if (KIND[i] !== Kind.lawn || WST[i] || OCC[i] || (WET[i] as number) > 0.3) continue;
        screenInto(x, y, 0, SP);
        if (SP.x < -mx || SP.x > cw + mx || SP.y < -mx || SP.y > chh + mx) continue;
        const seed = x * 131 + y * 7 + 3;
        for (let k = 0; k < 3; k++) {
          if (h01(seed, k, 4) < 0.6) continue;
          const u = x - 0.35 + h01(seed, k, 5) * 0.7, v = y - 0.35 + h01(seed, k, 6) * 0.7;
          screenInto(u, v, 0, SP);
          screenInto(u + 0.03, v - 0.03, 0.09, SQ);
          ctx.moveTo(SP.x, SP.y);
          ctx.lineTo(SQ.x, SQ.y);
          ctx.moveTo(SP.x, SP.y);
          ctx.lineTo(SQ.x + 1.6 * z, SQ.y + 0.6 * z);
        }
      }
    ctx.stroke();
  }
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = I(x, y);
      if (KIND[i] !== Kind.bed) continue;
      const s = screenInto(x, y, 0, { x: 0, y: 0 });
      if (s.x < -mx || s.x > cw + mx || s.y < -mx || s.y > chh + mx) continue;
      drawBedTile(i, s); // 03 2.7 flora.drawBedTile(i, s): the earth rim and the flowers by BEDC (04 6.1 row bed)
    }
}
