// src/render/water.ts
// Still water, direction A (04 3.2 row Water; 03 7.5): the pond and canal body as one outline cached in world units and rebuilt on a
// water epoch (only tools change water), the fill, the shallows, the sky sheen, ripples at z > 0.7, the wet rim and GV's feather, the
// winter ice; and the river beyond the quay, which backdrop.ts places (04 6.4 row river).
// Ported from GV 9017-9033 (WR, WRN, WW, FMARK, BLK), 9034-9107 (buildWV: the ribbon round a skeleton of water-tile centres, the
// distance field on the half-tile grid, the Gaussian blur and the narrow ribbon laid back over it), 9112-9121 (fsPoly: the marching
// squares cases), 9165-9176 (waterPath: Catmull-Rom cubics through the crossings with chord-scaled tangents), 9260-9264 (strokeBanks:
// the feather, 3.2 z px), 9363-9367 (the still-water sky sheen), 10049-10055 (the still-water ripple).
// Verdict: ADAPT. Changes: flat ground and one depth, so the bank penalty (9082), the waterline cut (9101-9102) and the cascade surface
// (9088-9090) are gone; off the map is dry, not water (GV 9045; 09 2.6 row water.ts), so a canal at the railings ends round; the field
// is contoured once per water epoch into closed loops over the whole park and smoothed into one Path2D in world units, filled under the
// world transform with the even-odd rule, where GV built each tile's share of the outline every frame (so the sheet overlap WEX of
// GV 8971 is not needed: one fill has no seams); the epoch turns on markWaterDirty() or a changed set of water tiles, not on the colour
// epoch (09 2.6); the sheen and the ripples move on sim seconds (T.abs * DAYLEN) where GV read the wall clock; ice is a flat `ice` fill
// with `iceHi` patches and glints, and no ripples (04 6.5); the river is a flat band 0.3 EH under the quay with streaks drifting east.
// Dropped from the range: FDH, WV and the harness-only corner field (9032, 9104, 9258-9259), fsOtherEnd, fsAll, fsAny and the per-tile
// waterPath (9123-9180), the sea sheet (9265-9337), waterRaw's flow, sediment and cold terms (9346-9353), tumble lips and current
// streaks (10008-10048).
import { clamp01, css, hx, mixc, TAU, type RGB } from '../core/math.ts';
import { DAYLEN, T } from '../core/clock.ts';
import { W } from '../core/weather.ts';
import { ICE, KIND, Kind, N, NC, inB, worldVersion } from '../world/grid.ts';
import { TH, TW, cam, view } from './camera.ts';
import { screenInto } from './project.ts';
import { ctxOf, resetTransform, setWorldTransform, viewBounds } from './ground.ts';
import { WHITE, grain, h01, lit, mix, nightW, nzAt, skyRamp, style } from './ambient.ts';

/* ---------- the field (GV 9017-9107) ---------- */
const FN = 2 * N + 1; // points on the half-tile grid: tile corners, edge midpoints and centres; point f sits at world f / 2 - 0.5
const FNN = FN * FN;
const FW = new Float32Array(FNN), FWN = new Float32Array(FNN), FWB = new Float32Array(FNN), NEAR = new Uint8Array(FNN);
const SKW = new Uint8Array(NC), SKN = new Uint8Array(NC); // the skeleton: water tiles, and which of their 8 neighbours are joined
const D8X = [1, 1, 0, -1, -1, -1, 0, 1], D8Y = [0, 1, 1, 1, 0, -1, -1, -1];
/** The reach of the body and of the narrow ribbon past the skeleton, the soft edge, the mark (GV 9020, 9023). */
export const WR = 0.72, WRN = 0.6, WW = 0.4, FMARK = 0.45;
/** A Gaussian one tile wide (sigma = 2 points), 11 taps, normalised (GV 9031). */
const BLK = (() => {
  const k = [0.0439, 0.1353, 0.3247, 0.6065, 0.8825, 1, 0.8825, 0.6065, 0.3247, 0.1353, 0.0439];
  const t = k.reduce((a, b) => a + b, 0);
  return k.map((v) => v / t);
})();

function isWater(i: number): boolean {
  const k = KIND[i];
  return k === Kind.pond || k === Kind.canal;
}

/** The ribbon round the skeleton as a field on the half-tile grid: 1 inside, falling to 0 over WW past the reach (GV buildWV 9034). */
function buildField(): void {
  for (let i = 0; i < NC; i++) SKW[i] = isWater(i) ? 1 : 0;
  NEAR.fill(0);
  for (let i = 0; i < NC; i++) {
    SKN[i] = 0;
    if (!SKW[i]) continue;
    const x = i % N, y = (i / N) | 0;
    let m = 0;
    for (let q = 0; q < 8; q++) {
      const nx = x + (D8X[q] as number), ny = y + (D8Y[q] as number);
      if (inB(nx, ny) && SKW[ny * N + nx]) m |= 1 << q; // off the map is dry (09 2.6)
    }
    SKN[i] = m;
    // a tile's water reaches at most a tile past its centre (GV 9049-9051)
    for (let fy = Math.max(0, 2 * y - 1); fy <= Math.min(FN - 1, 2 * y + 3); fy++)
      for (let fx = Math.max(0, 2 * x - 1); fx <= Math.min(FN - 1, 2 * x + 3); fx++) NEAR[fy * FN + fx] = 1;
  }
  FW.fill(0);
  FWN.fill(0);
  for (let fy = 0; fy < FN; fy++)
    for (let fx = 0; fx < FN; fx++) {
      const fk = fy * FN + fx;
      if (!NEAR[fk]) continue;
      const ex = fx & 1, ey = fy & 1, vx = fx >> 1, vy = fy >> 1;
      // a point with water on every side is deep inside: no search (GV 9056-9058; off the map counts as dry here)
      let all = true;
      for (let ty = ey ? vy : vy - 1; ty <= vy && all; ty++)
        for (let tx = ex ? vx : vx - 1; tx <= vx; tx++)
          if (tx < 0 || ty < 0 || tx >= N || ty >= N || !SKW[ty * N + tx]) {
            all = false;
            break;
          }
      if (all) {
        FW[fk] = 1;
        FWN[fk] = 1;
        continue;
      }
      // the distance to the nearest centre or joining segment, in GV's frame where tile x spans x .. x + 1 (GV 9059-9073)
      const px = fx * 0.5, py = fy * 0.5;
      let best = 1e9;
      for (let ty = Math.max(0, vy - 1); ty <= Math.min(N - 1, vy + 1); ty++)
        for (let tx = Math.max(0, vx - 1); tx <= Math.min(N - 1, vx + 1); tx++) {
          const i = ty * N + tx;
          if (!SKW[i]) continue;
          const cx = tx + 0.5, cy = ty + 0.5;
          const d0 = (px - cx) * (px - cx) + (py - cy) * (py - cy);
          if (d0 < best) best = d0;
          const m = SKN[i] as number;
          if (!m) continue;
          for (let q = 0; q < 8; q++) {
            if (!(m & (1 << q))) continue;
            const sx = D8X[q] as number, sy = D8Y[q] as number;
            let t = ((px - cx) * sx + (py - cy) * sy) / (sx * sx + sy * sy);
            if (t <= 0) continue;
            if (t > 1) t = 1;
            const qx = cx + sx * t - px, qy = cy + sy * t - py, d = qx * qx + qy * qy;
            if (d < best) best = d;
          }
        }
      if (best > 1e8) continue;
      const de = Math.sqrt(best);
      FW[fk] = clamp01((WR - de) / WW);
      FWN[fk] = clamp01((WRN - de) / WW);
    }
  // the blur along the rows, then the columns, and the narrow ribbon laid back over it (GV 9093-9103)
  for (let fy = 0; fy < FN; fy++) {
    const r = fy * FN;
    for (let fx = 0; fx < FN; fx++) {
      let a = 0;
      for (let q = -5; q <= 5; q++) a += (FW[r + Math.min(FN - 1, Math.max(0, fx + q))] as number) * (BLK[q + 5] as number);
      FWB[r + fx] = a;
    }
  }
  for (let fx = 0; fx < FN; fx++)
    for (let fy = 0; fy < FN; fy++) {
      const fk = fy * FN + fx;
      if (!NEAR[fk]) {
        FW[fk] = 0;
        continue;
      }
      let a = 0;
      for (let q = -5; q <= 5; q++) a += (FWB[Math.min(FN - 1, Math.max(0, fy + q)) * FN + fx] as number) * (BLK[q + 5] as number);
      const n = FWN[fk] as number;
      FW[fk] = a > n ? a : n;
    }
}

/* ---------- the outline: marching squares over the whole grid, closed loops, Catmull-Rom (GV 9112-9121, 9165-9176) ---------- */
const G = FN + 2; // the grid with a dry border one point wide, so every loop closes
const EX = new Float32Array(G * G * 2), EY = new Float32Array(G * G * 2); // the crossing on each grid edge, in world units
const EA = new Int32Array(G * G * 4); // the (at most two) segments meeting at each edge
let SEG = new Int32Array(4096);

function fv(gx: number, gy: number): number {
  return gx < 1 || gy < 1 || gx > FN || gy > FN ? 0 : (FW[(gy - 1) * FN + gx - 1] as number);
}
/** The crossing at FMARK on edge `id` of the padded grid (even: the edge to the right of point (gx, gy); odd: the edge below it). */
function crossing(id: number, gx: number, gy: number): void {
  const a = fv(gx, gy), down = id & 1, b = down ? fv(gx, gy + 1) : fv(gx + 1, gy);
  const t = Math.abs(b - a) < 1e-6 ? 0.5 : clamp01((FMARK - a) / (b - a));
  EX[id] = (gx + (down ? 0 : t)) * 0.5 - 1;
  EY[id] = (gy + (down ? t : 0)) * 0.5 - 1;
}
/** The pairs of cell edges (0 top, 1 right, 2 bottom, 3 left) cut by the outline in each of the 16 corner cases; 5 and 10 are saddles. */
const CASES: readonly (readonly number[])[] = [
  [], [3, 0], [0, 1], [3, 1], [1, 2], [], [0, 2], [3, 2], [2, 3], [0, 2], [], [1, 2], [3, 1], [0, 1], [3, 0], [],
];

/** The water's outline as closed loops of world points, smoothed into one path (GV waterPath's curve, laid round the whole body). */
function buildOutline(): Path2D | null {
  EA.fill(-1);
  let ns = 0;
  const addSeg = (e0: number, e1: number): void => {
    if (ns * 2 + 2 > SEG.length) {
      const n = new Int32Array(SEG.length * 2);
      n.set(SEG);
      SEG = n;
    }
    SEG[ns * 2] = e0;
    SEG[ns * 2 + 1] = e1;
    for (const e of [e0, e1]) {
      if (EA[e * 2] === -1) EA[e * 2] = ns;
      else EA[e * 2 + 1] = ns;
    }
    ns++;
  };
  for (let cy = 0; cy < G - 1; cy++)
    for (let cx = 0; cx < G - 1; cx++) {
      const a = fv(cx, cy), b = fv(cx + 1, cy), c = fv(cx + 1, cy + 1), d = fv(cx, cy + 1);
      const cs = (a >= FMARK ? 1 : 0) | (b >= FMARK ? 2 : 0) | (c >= FMARK ? 4 : 0) | (d >= FMARK ? 8 : 0);
      if (cs === 0 || cs === 15) continue;
      const edge = [(cy * G + cx) * 2, (cy * G + cx + 1) * 2 + 1, ((cy + 1) * G + cx) * 2, (cy * G + cx) * 2 + 1];
      const pos = [[cx, cy], [cx + 1, cy], [cx, cy + 1], [cx, cy]];
      const cut = (k: number): number => {
        const id = edge[k] as number, p = pos[k] as number[];
        crossing(id, p[0] as number, p[1] as number);
        return id;
      };
      if (cs === 5 || cs === 10) {
        // a saddle: the cell's mean decides whether the inside corners join (GV fsPoly's quarter cells meet the same way)
        const joinA = (a + b + c + d) / 4 >= FMARK;
        if ((cs === 5) === joinA) {
          addSeg(cut(0), cut(1));
          addSeg(cut(2), cut(3));
        } else {
          addSeg(cut(3), cut(0));
          addSeg(cut(1), cut(2));
        }
        continue;
      }
      const pr = CASES[cs] as readonly number[];
      addSeg(cut(pr[0] as number), cut(pr[1] as number));
    }
  if (!ns) return null;
  const used = new Uint8Array(ns);
  const path = new Path2D();
  const xs: number[] = [], ys: number[] = [];
  for (let s0 = 0; s0 < ns; s0++) {
    if (used[s0]) continue;
    xs.length = 0;
    ys.length = 0;
    const start = SEG[s0 * 2] as number;
    let e = SEG[s0 * 2 + 1] as number, s = s0;
    used[s0] = 1;
    xs.push(EX[start] as number);
    ys.push(EY[start] as number);
    for (let guard = 0; e !== start && guard < ns; guard++) {
      const lx = xs[xs.length - 1] as number, ly = ys[ys.length - 1] as number;
      if (Math.abs((EX[e] as number) - lx) + Math.abs((EY[e] as number) - ly) > 1e-3) {
        xs.push(EX[e] as number);
        ys.push(EY[e] as number);
      }
      const t = EA[e * 2] === s ? (EA[e * 2 + 1] as number) : (EA[e * 2] as number);
      if (t < 0 || used[t]) break;
      used[t] = 1;
      s = t;
      e = SEG[t * 2] === e ? (SEG[t * 2 + 1] as number) : (SEG[t * 2] as number);
    }
    if (xs.length > 1 && Math.abs((xs[xs.length - 1] as number) - (xs[0] as number)) + Math.abs((ys[ys.length - 1] as number) - (ys[0] as number)) <= 1e-3) {
      xs.pop();
      ys.pop();
    }
    if (xs.length >= 3) smoothLoop(path, xs, ys);
  }
  return path;
}

/** One closed Catmull-Rom loop as cubics, the tangents scaled by the chord lengths so a short piece cannot throw a loop (GV 9165-9176). */
function smoothLoop(p: Path2D, xs: number[], ys: number[]): void {
  const n = xs.length;
  const X = (k: number): number => xs[(k + n) % n] as number, Y = (k: number): number => ys[(k + n) % n] as number;
  p.moveTo(X(0), Y(0));
  for (let k = 0; k < n; k++) {
    const d01 = Math.max(1e-4, Math.hypot(X(k) - X(k - 1), Y(k) - Y(k - 1)));
    const d12 = Math.max(1e-4, Math.hypot(X(k + 1) - X(k), Y(k + 1) - Y(k)));
    const d23 = Math.max(1e-4, Math.hypot(X(k + 2) - X(k + 1), Y(k + 2) - Y(k + 1)));
    const k1 = d12 / (d01 + d12) / 3, k2 = d12 / (d12 + d23) / 3;
    p.bezierCurveTo(
      X(k) + (X(k + 1) - X(k - 1)) * k1, Y(k) + (Y(k + 1) - Y(k - 1)) * k1,
      X(k + 1) - (X(k + 2) - X(k)) * k2, Y(k + 1) - (Y(k + 2) - Y(k)) * k2,
      X(k + 1), Y(k + 1),
    );
  }
  p.closePath();
}

/* ---------- the water epoch (03 2.7: only tools change water) ---------- */
let BODY: Path2D | null = null;
let TILES: number[] = []; // the water tiles, for the sheen, the ripples and the ice
let dirty = true, seenWorld = -1, seenSig = -1;

/** A tool painted or removed water, or a park was loaded: rebuild the outline before the next draw. */
export function markWaterDirty(): void {
  dirty = true;
}
function waterSig(): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < NC; i++) if (isWater(i)) h = Math.imul(h ^ (i + 1), 0x01000193);
  return h >>> 0;
}
function refreshWater(): void {
  if (!dirty && worldVersion() === seenWorld) return;
  seenWorld = worldVersion();
  const sig = waterSig(); // a changed prop bumps the world version too: rebuild only when the water tiles changed
  if (!dirty && sig === seenSig) return;
  dirty = false;
  seenSig = sig;
  TILES = [];
  for (let i = 0; i < NC; i++) if (isWater(i)) TILES.push(i);
  buildField();
  BODY = TILES.length ? buildOutline() : null;
}

/** The outline in world units (for tests and the harness); null when the park has no water. */
export function waterOutline(): Path2D | null {
  refreshWater();
  return BODY;
}

/* ---------- drawing (03 7.9 phase 5) ---------- */
const SP = { x: 0, y: 0 };
const SHEEN_STEPS = 4;

/** The pond and canal body: fill, shallows, sheen, ripples at z > 0.7, rim and feather, or ice (04 3.2 row Water, column A; 6.5). */
export function drawWater(c?: CanvasRenderingContext2D): void {
  refreshWater();
  if (!BODY) return;
  const ctx = ctxOf(c), z = cam.z, P = style().palette;
  const frozen = TILES.some((i) => ICE[i] === 1);
  const water = nightW(lit(hx(P.water)));
  const t = T.abs * DAYLEN; // sim seconds: a paused park holds still and a screenshot repeats
  ctx.save();
  setWorldTransform(ctx);
  ctx.fillStyle = css(frozen ? nightW(lit(hx(P.ice))) : water);
  ctx.fill(BODY, 'evenodd');
  ctx.save();
  ctx.clip(BODY, 'evenodd');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (frozen) drawIce(ctx, P.iceHi);
  else {
    // the shallows: a paler band along the inside of the bank, as GV's still water pales toward its edge (04 3.2 row Water)
    ctx.strokeStyle = css(mixc(water, nightW(lit(hx(P.paper))), 0.22), 0.4);
    ctx.lineWidth = 0.42;
    ctx.stroke(BODY);
    drawSheen(ctx, t);
    if (z > 0.7) {
      resetTransform(ctx); // the clip holds; the ripples are drawn in screen px like GV's
      drawRipples(ctx, z, t);
      setWorldTransform(ctx);
    }
  }
  ctx.restore();
  // the wet rim on the bank, then GV's feather on the edge (strokeBanks 9260 at 3.2 z px, here about 0.12 tile on the ground)
  ctx.lineJoin = 'round';
  ctx.strokeStyle = css(nightW(lit(mixc(hx(P.water), hx(P.bedEarth), 0.6).map((v) => v * 0.78) as RGB)), 0.42);
  ctx.lineWidth = 0.17;
  ctx.stroke(BODY);
  if (z > 0.45) {
    ctx.strokeStyle = css(mixc(frozen ? nightW(lit(hx(P.ice))) : water, lit(WHITE), 0.16), 0.36);
    ctx.lineWidth = 0.1;
    ctx.stroke(BODY);
  }
  ctx.restore();
}

/** Still water gives the sky back: soft pale patches drifting slowly, gone in the rain or a wind (GV 9363-9367; SHEEN GV 9587). */
function drawSheen(ctx: CanvasRenderingContext2D, t: number): void {
  const k = 0.17 * (1 - W.rain) * (1 - clamp01(W.wind - 0.3) * 0.7);
  if (k < 0.01) return;
  const sheen = mixc(skyRamp(style(), T.f)[1], WHITE, 0.4);
  const paths: Path2D[] = [];
  for (let q = 0; q < SHEEN_STEPS; q++) paths.push(new Path2D());
  let any = false;
  for (const i of TILES) {
    const x = i % N, y = (i / N) | 0;
    const sh = nzAt(x * 0.19 + t * 0.06 + 3.1, y * 0.19 - t * 0.035 + 8.6);
    const a = clamp01((sh - 0.44) / 0.5);
    if (a < 0.06) continue;
    const p = paths[Math.min(SHEEN_STEPS - 1, Math.floor(a * SHEEN_STEPS))] as Path2D;
    p.moveTo(x + 0.75, y);
    p.ellipse(x, y, 0.75, 0.75, 0, 0, TAU); // a disc on the ground; neighbours overlap into one soft patch
    any = true;
  }
  if (!any) return;
  for (let q = 0; q < SHEEN_STEPS; q++) {
    ctx.fillStyle = css(sheen, (k * (q + 1)) / SHEEN_STEPS * 0.6);
    ctx.fill(paths[q] as Path2D);
  }
}

/** A slow soft ripple on some tiles of still water, a shallow arc that drifts a little (GV 10049-10055, sim seconds for the clock). */
function drawRipples(ctx: CanvasRenderingContext2D, z: number, t: number): void {
  const vb = viewBounds(1), m = TW * z, rim = lit(WHITE);
  ctx.lineCap = 'round';
  for (const i of TILES) {
    const x = i % N, y = (i / N) | 0;
    if (x < vb.x0 || x > vb.x1 || y < vb.y0 || y > vb.y1 || nzAt(x * 0.9 + 31, y * 0.9 + 17) <= 0.7) continue;
    screenInto(x, y, 0, SP);
    if (SP.x < -m || SP.y < -m || SP.x > view.cw + m || SP.y > view.chh + m) continue;
    const n1 = nzAt(x * 1.7 + 3, y * 1.7 + 9), n2 = nzAt(x * 1.3 + 21, y * 1.3 + 5), n3 = nzAt(x * 2.1 + 15, y * 2.1 + 29);
    ctx.strokeStyle = css(rim, 0.16 + n3 * 0.14);
    ctx.lineWidth = Math.max(0.7, (0.8 + n2 * 0.5) * z);
    const mx = SP.x + (n1 - 0.5) * TW * 0.5 * z + Math.sin(t * 0.5 + n1 * TAU) * 2.2 * z, my = SP.y + (n2 - 0.5) * TH * 0.5 * z;
    const L = (4 + n3 * 5) * z, wob = Math.sin(t * 1.1 + n1 * TAU) * z;
    ctx.beginPath();
    ctx.moveTo(mx - L * 0.5, my + wob);
    ctx.quadraticCurveTo(mx, my - L * 0.22 + wob, mx + L * 0.5, my + wob);
    ctx.stroke();
  }
}

/** Ice: `iceHi` patches by the grain (GV 9348: ice toward iceL by 0.5 + grain) and a short glint on some tiles (04 6.5 row pond). */
function drawIce(ctx: CanvasRenderingContext2D, iceHi: string): void {
  const hi = nightW(lit(hx(iceHi)));
  const patches: Path2D[] = [new Path2D(), new Path2D(), new Path2D()], glint = new Path2D();
  for (const i of TILES) {
    const x = i % N, y = (i / N) | 0, a = clamp01(0.5 + grain(x, y));
    const p = patches[Math.min(2, Math.floor(a * 3))] as Path2D;
    p.moveTo(x + 0.78, y);
    p.ellipse(x, y, 0.78, 0.78, 0, 0, TAU); // wide enough to close the gaps at the tile corners
    if (h01(x, y, 41) < 0.35) {
      const u = x - 0.3 + h01(x, y, 42) * 0.4, v = y - 0.2 + h01(x, y, 43) * 0.4;
      glint.moveTo(u, v);
      glint.lineTo(u + 0.32, v - 0.18);
    }
  }
  for (let q = 0; q < 3; q++) {
    ctx.fillStyle = css(hi, 0.22 * (q + 1));
    ctx.fill(patches[q] as Path2D);
  }
  ctx.strokeStyle = css(hi, 0.85);
  ctx.lineWidth = 0.05;
  ctx.stroke(glint);
}

/* ---------- the river (04 6.4 row river; backdrop.ts places it) ---------- */
const STREAKS = 90;
/**
 * The river as a flat band from world (x0, y0) to (x1, y1) at height e: base `water` x 0.95 toward the night (GV nightW 6494), and
 * long pale streaks (0.6 tile, `paper` at alpha 0.25) drifting east at 0.3 tile per sim second (04 6.4). It never freezes.
 */
export function drawRiver(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, e: number): void {
  const P = style().palette;
  const base = hx(P.water);
  ctx.save();
  setWorldTransform(ctx, e);
  ctx.fillStyle = css(nightW(lit([base[0] * 0.95, base[1] * 0.95, base[2] * 0.95])));
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // the sky in the river: a paler band down its middle, under the streaks
  ctx.fillStyle = css(nightW(lit(hx(mix(P.water, P.sky, 0.45)))), 0.35);
  ctx.fillRect(x0, y0 + (y1 - y0) * 0.3, x1 - x0, (y1 - y0) * 0.4);
  if (cam.z >= 0.4) {
    const t = T.abs * DAYLEN, span = x1 - x0, streak = new Path2D(), n = Math.round((STREAKS * span) / 64); // 90 on the apron's 64
    for (let k = 0; k < n; k++) {
      const v = y0 + 0.35 + h01(k, 1, 61) * (y1 - y0 - 0.7);
      const u = x0 + ((((h01(k, 2, 61) * span + 0.3 * t * (0.8 + 0.4 * h01(k, 3, 61))) % span) + span) % span);
      const len = 0.6 * Math.min(1, (x1 - u) / 0.6);
      if (len <= 0.05) continue;
      streak.moveTo(u, v);
      streak.lineTo(u + len, v);
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = css(lit(hx(P.paper)), 0.25);
    ctx.stroke(streak);
  }
  ctx.restore();
}
