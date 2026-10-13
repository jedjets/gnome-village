// src/render/apron.ts
// The apron drawables the painter sorts with the props (03 7.4 item 4; 04 6.4): one railing piece per boundary tile except the gates,
// the five gates (two stone pillars with single-globe lamps and open iron leaves), the street trees (boulevard.ts's), the facade blocks as
// iso boxes in the manner of the board's tile 11 (a cafe with its awning and three bistro tables on each of E, S and W), the moored
// peniche and a sailboat. Split out of backdrop.ts (AGENTS rule 9; 03 2.7 row apron.ts), which keeps the sky and the apron ground.
// Ported from GV 6953-6965 (wp, poly, faceVis, faceLight, shade, h01: the iso box kit), 7509-7547 (fencePieces: the railing idea).
// Verdict: ADAPT. Changes: boxes are prisms of world points, any polygon, faces culled by faceVis and lit by faceLight; a facade block is
// one drawable at the largest depth of its footprint (03 7.2 item 2); a block nearer the camera than the park centre fades over 0.4 s of
// frame time to its opaque ground floor, 1.2 EH, shop windows toward the camera and its cafe turned to them (variant 1 of the boulevard
// gate, register 3.1 and section 4; 04 6.4); walls in five pastel washes (pick 6B); windows one a tile, 40 % lit at night by h01, cached
// with the dormers in each face's own frame; the cafe is the block nearest the middle of each side that does not face a gate, its tables
// the board's; railings come from park.railPieces() (all four sides: the north gate needs a barrier to sit in).
// Dropped from the range: the house kit beyond the box primitives (6967-7035), GV's fences of logs.
// TODO(S9): mist greys the facades to 60 % (04 10.5); awning scallops flap in a breeze (04 6.4 row cafe).
import { clamp01, css, hx, TAU, type XY } from '../core/math.ts';
import { W } from '../core/weather.ts';
import { now } from '../core/loop.ts';
import { N } from '../world/grid.ts';
import { BACKDROP, GATES, facadeBlocks, railPieces, type FacadeBlock } from '../world/park.ts';
import { CTR, EH, TW, cam, view } from './camera.ts';
import { screenInto } from './project.ts';
import { depthOf, footprintDepth, type Drawable } from './order.ts';
import { GC, faceLight, h01, lampGlow, mix, shade, style } from './ambient.ts';
import { drawBarge, drawSail, prism, sailX, sq, vis, xy } from './backdrop.ts';
import { drawBistroTable } from './props.ts';
import { BOULEVARD, streetTreeDrawables } from './boulevard.ts';
import { gamePen, gameProj } from './flora.ts';
import { resetTransform } from './ground.ts';

const SP: XY = { x: 0, y: 0 }, SQ: XY = { x: 0, y: 0 };

/* ---------- the apron drawables (03 7.4 item 4; 04 6.4) ---------- */
type Item = Drawable & { ref: number; r: number; h: number; fw: number; fh: number };
type Fr = { len: number; ox: number; oy: number; ux: number; uy: number; wx: number; wy: number; L: number };
type Blk = { b: FacadeBlock; x0: number; y0: number; x1: number; y1: number; street: number; open: number; cafe: boolean; cut: number };
type Pillar = { x: number; y: number; nx: number; ny: number; hx: number; hy: number };
const ITEMS: Item[] = [];
const OUT: Drawable[] = [];
const RAILS: { ax: number; ay: number; bx: number; by: number; nx: number; ny: number }[] = [];
const PILLARS: Pillar[] = [];
const BLKS: Blk[] = [];
let cutAt = -1e9;
/** The four faces of a box in order north, east, south, west: their outward normals. */
const FN4: readonly (readonly [number, number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const OUTN: Record<string, readonly [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };

/** A line from (x0, y0) to (x1, y1) onto a path or the context. */
function seg(t: CanvasPath, x0: number, y0: number, x1: number, y1: number): void {
  t.moveTo(x0, y0);
  t.lineTo(x1, y1);
}

function item(kind: string, id: number, ref: number, x: number, y: number, r: number, h: number, draw: Drawable['draw'], fw = 0, fh = 0): void {
  ITEMS.push({ depth: 0, kind, id, x, y, z: 0, draw, ref, r, h, fw, fh });
}

/** The apron set, built once from park.ts: rails, gate pillars with their leaves, facade blocks, the peniche, the sailboat. */
function build(): void {
  for (const r of railPieces()) {
    const [nx, ny] = OUTN[r.side] as readonly [number, number];
    const ex = r.x + nx * 0.5, ey = r.y + ny * 0.5; // the outer edge of the boundary tile
    RAILS.push({ ax: ex - Math.abs(ny) * 0.5, ay: ey - Math.abs(nx) * 0.5, bx: ex + Math.abs(ny) * 0.5, by: ey + Math.abs(nx) * 0.5, nx, ny });
    item('railing', 50000 + r.id, RAILS.length - 1, ex, ey, 0.6, 0.6, drawRail);
  }
  for (const g of GATES) {
    const [nx, ny] = OUTN[g.side] as readonly [number, number];
    const ax = Math.min(g.tiles[0].x, g.tiles[1].x), ay = Math.min(g.tiles[0].y, g.tiles[1].y);
    const bx = Math.max(g.tiles[0].x, g.tiles[1].x), by = Math.max(g.tiles[0].y, g.tiles[1].y);
    const ox = nx * 0.5, oy = ny * 0.5, sx = Math.abs(ny) * 0.5, sy = Math.abs(nx) * 0.5;
    for (const [px, py, s] of [[ax - sx + ox, ay - sy + oy, 1], [bx + sx + ox, by + sy + oy, -1]] as const) {
      PILLARS.push({ x: px, y: py, nx, ny, hx: px + s * sx * 0.3, hy: py + s * sy * 0.3 });
      item('gate', 50400 + PILLARS.length, PILLARS.length - 1, px, py, 1.2, 1.6, drawPillar);
    }
  }
  const all = facadeBlocks(), mid = (N - 1) / 2;
  // one cafe on each of E, S and W (04 6.4): the block nearest the middle of its side that does not face a gate, so the gate's pillars
  // and lamps never stand in front of the awning
  const cafeOf: Record<string, FacadeBlock> = {};
  for (const b of all) {
    const best = cafeOf[b.side];
    if (!b.far && !facesGate(b) && (!best || Math.abs(centreAlong(b) - mid) < Math.abs(centreAlong(best) - mid))) cafeOf[b.side] = b;
  }
  for (const b of all) {
    const x0 = b.x0 - 0.5, y0 = b.y0 - 0.5, x1 = x0 + b.w, y1 = y0 + b.h;
    let open = 0;
    for (let f = 0; f < 4; f++) {
      const shut = all.some((o) => {
        if (o === b) return false;
        const p0 = o.x0 - 0.5, q0 = o.y0 - 0.5, p1 = p0 + o.w, q1 = q0 + o.h;
        const ox = Math.min(x1, p1) - Math.max(x0, p0) > 0.01, oy = Math.min(y1, q1) - Math.max(y0, q0) > 0.01;
        return f === 0 ? q1 === y0 && ox : f === 1 ? p0 === x1 && oy : f === 2 ? q0 === y1 && ox : p1 === x0 && oy;
      });
      if (!shut) open |= 1 << f;
    }
    const street = b.side === 'east' ? 3 : b.side === 'west' ? 1 : b.side === 'south' ? 0 : 2;
    BLKS.push({ b, x0, y0, x1, y1, street, open, cafe: cafeOf[b.side] === b, cut: -1 });
    item('facade', 50500 + b.id, BLKS.length - 1, b.x0, b.y0, 2, BACKDROP.facadeHeight + 0.5, drawFacade, b.w, b.h);
  }
  item('boat', 50700, 0, 44, -3, 3, 1, drawBarge, 5, 2);
  item('boat', 50701, 1, 0, -5.4, 1, 1.6, drawSail);
}
/** True when a gate's tiles lie within the block's span along its street. */
function facesGate(b: FacadeBlock): boolean {
  return GATES.some((g) => g.side === b.side && g.tiles.some((t) => (b.side === 'south' ? t.x >= b.x0 && t.x < b.x0 + b.w : t.y >= b.y0 && t.y < b.y0 + b.h)));
}
function centreAlong(b: FacadeBlock): number {
  return b.side === 'south' ? b.x0 + b.w / 2 - 0.5 : b.y0 + b.h / 2 - 0.5;
}

/**
 * Phase 6's apron share (03 7.9): every apron drawable near the screen with its depth for this angle (a block takes the largest depth
 * of its footprint tiles), the street trees, and the near-side cut of each facade eased over 0.4 s (04 6.4). The list is reused.
 */
export function apronDrawables(): Drawable[] {
  if (!ITEMS.length) build();
  stepCuts();
  const stone = style().palette.stone;
  FN4.forEach(([nx, ny], k) => (PLINTH[k] = shade(stone, vis(nx, ny) ? faceLight(nx, ny) : faceLight(-nx, -ny))));
  OUT.length = 0;
  const z = cam.z, sail = sailX();
  for (const it of ITEMS) {
    if (it.draw === drawSail) {
      if (sail === null) continue;
      it.x = sail;
    }
    const cx = it.fw ? it.x + it.fw / 2 - 0.5 : it.x, cy = it.fh ? it.y + it.fh / 2 - 0.5 : it.y;
    screenInto(cx, cy, 0, SP);
    const m = (it.r * TW + it.h * EH) * z + 8;
    if (SP.x < -m || SP.x > view.cw + m || SP.y < -m || SP.y > view.chh + m) continue;
    it.depth = it.fw ? footprintDepth(it.x, it.y, it.fw, it.fh) : depthOf(it.x, it.y);
    OUT.push(it);
  }
  streetTreeDrawables(OUT);
  return OUT;
}

/** A facade nearer the camera than the park centre is cut to its ground floor (03 7.4 item 4); the change fades over 0.4 s of frame time. */
function stepCuts(): void {
  const t = now(), dt = t - cutAt, c0 = depthOf(CTR, CTR);
  cutAt = t;
  for (const B of BLKS) {
    const target = depthOf((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2) > c0 ? 1 : 0;
    if (B.cut < 0 || dt <= 0 || dt > 1000) B.cut = target;
    else B.cut = target > B.cut ? Math.min(target, B.cut + dt / 400) : Math.max(target, B.cut - dt / 400);
  }
}

let IRON = '';
/** Iron: `ink` a tenth of the way toward `zinc` (04 6.4 row railings; the board's balconies). */
const iron = (): string => IRON || (IRON = mix(style().palette.ink, style().palette.zinc, 0.1));
/** The plinth's lit stone on each side this frame (north, east, south, west), so 182 pieces share four strings. */
const PLINTH = ['', '', '', ''];

/** One railing piece on the outer edge of a boundary tile: a stone plinth 0.08 EH, two rails, four uprights, gilt spear tips (04 6.4). */
function drawRail(d: Drawable, ctx: CanvasRenderingContext2D): void {
  const r = RAILS[(d as Item).ref] as (typeof RAILS)[number], P = style().palette, z = cam.z, ez = EH * z, top = BACKDROP.railHeight;
  screenInto(r.ax, r.ay, 0, SP);
  screenInto(r.bx, r.by, 0, SQ);
  const ux = SQ.x - SP.x, uy = SQ.y - SP.y;
  ctx.fillStyle = PLINTH[r.ny < 0 ? 0 : r.nx > 0 ? 1 : r.ny > 0 ? 2 : 3] as string;
  ctx.beginPath();
  ctx.moveTo(SP.x, SP.y);
  ctx.lineTo(SQ.x, SQ.y);
  ctx.lineTo(SQ.x, SQ.y - 0.08 * ez);
  ctx.lineTo(SP.x, SP.y - 0.08 * ez);
  ctx.fill();
  ctx.strokeStyle = GC(iron());
  ctx.lineWidth = Math.max(0.5, 0.75 * z);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const e of [0.14, top - 0.06]) seg(ctx, SP.x, SP.y - e * ez, SQ.x, SQ.y - e * ez);
  for (let k = 0; k < 4; k++) {
    const u = 0.125 + 0.25 * k;
    seg(ctx, SP.x + ux * u, SP.y + uy * u - 0.08 * ez, SP.x + ux * u, SP.y + uy * u - top * ez);
  }
  ctx.stroke();
  if (z >= 0.8) {
    ctx.fillStyle = GC(P.lamp);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const u = 0.125 + 0.25 * k, x = SP.x + ux * u, y = SP.y + uy * u - top * ez, w = Math.max(0.8, 0.9 * z);
      ctx.moveTo(x - w, y);
      ctx.lineTo(x, y - 2.6 * w);
      ctx.lineTo(x + w, y);
    }
    ctx.fill();
  }
}

/** A gate pillar (stone, 0.9 EH, a cap, a single-globe lamp of 0.5 EH, 04 6.2 item 5) and its iron leaf swung open outward (04 6.4). */
function drawPillar(d: Drawable, ctx: CanvasRenderingContext2D): void {
  const p = PILLARS[(d as Item).ref] as Pillar, P = style().palette, z = cam.z;
  const leafFirst = depthOf(p.hx + p.nx * 0.45, p.hy + p.ny * 0.45) < depthOf(p.x, p.y);
  if (leafFirst) leaf(ctx, p, z);
  prism(ctx, sq(p.x, p.y, 0.15), 0, 0.9, P.stone);
  prism(ctx, sq(p.x, p.y, 0.19), 0.9, 0.97, P.stone, P.paper);
  const a = screenInto(p.x, p.y, 0.97, { x: 0, y: 0 }), b = screenInto(p.x, p.y, 1.4, { x: 0, y: 0 });
  ctx.strokeStyle = shade(P.zinc, 0.9);
  ctx.lineWidth = Math.max(0.6, 1.4 * z);
  ctx.beginPath();
  seg(ctx, a.x, a.y, b.x, b.y);
  ctx.stroke();
  const glow = lampGlow(), gr = Math.max(1, 0.09 * TW * z);
  if (glow > 0.01) {
    ctx.fillStyle = GC(P.halo, 0.3 * glow);
    ctx.beginPath();
    ctx.arc(b.x, b.y - gr, gr * 3.2, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = glow > 0.5 ? css(hx(P.lamp)) : GC(P.paper, 0.9);
  ctx.beginPath();
  ctx.arc(b.x, b.y - gr, gr, 0, TAU);
  ctx.fill();
  if (!leafFirst) leaf(ctx, p, z);
}
function leaf(ctx: CanvasRenderingContext2D, p: Pillar, z: number): void {
  const ez = EH * z, n = 8;
  screenInto(p.hx, p.hy, 0, SP);
  screenInto(p.hx + p.nx * 0.9, p.hy + p.ny * 0.9, 0, SQ);
  ctx.strokeStyle = GC(iron());
  ctx.lineWidth = Math.max(0.5, 0.7 * z);
  ctx.beginPath();
  for (const e of [0.06, 0.48]) seg(ctx, SP.x, SP.y - e * ez, SQ.x, SQ.y - e * ez);
  for (let k = 0; k <= n; k++) {
    const x = SP.x + ((SQ.x - SP.x) * k) / n, y = SP.y + ((SQ.y - SP.y) * k) / n;
    seg(ctx, x, y - 0.06 * ez, x, y - 0.54 * ez);
  }
  ctx.stroke();
}

/* ---------- facade blocks: iso boxes in the manner of the board's tile 11 (04 6.4 row facades; GV box kit 6953-6965) ---------- */
const WALL = 5, ROOF = 6, INS = 0.45; // the wall top under the mansard, the roof top (6.0 EH), the mansard's set-back
type Hexes = { wall: string; stone: string; zinc: string; sky: string; shop: string; iron: string; paper: string; red: string; lamp: string };
const HEX = new Map<number, Hexes>();
/**
 * A block's colours: its wall washed in one of rose, sky, butter, sage or lavender (the owner's pick 6B, register section 4, 2026-10-13),
 * by (id x 3) mod 5 so the blocks either side of it (ids 1 apart along the south and far rows, 2 apart along east and west) never share
 * one, with cream `stone` trim; the far bank's in the haze at 0.35 toward `fog` (04 6.4 rows facades, far bank).
 */
function hexes(b: FacadeBlock): Hexes {
  const got = HEX.get(b.id);
  if (got) return got;
  const P = style().palette, f = (h: string): string => (b.far ? mix(h, P.fog, 0.35) : h);
  const [wash, k] = ([[P.rose, 0.36], [P.sky, 0.55], [P.lamp, 0.3], [P.foliageSpring, 0.5], [P.bedLavender, 0.38]] as const)[(b.id * 3) % 5] as readonly [string, number];
  const h: Hexes = {
    wall: f(mix(mix(P.stone, wash, k), P.paper, 0.22)), stone: f(P.stone), zinc: f(P.zinc), sky: f(P.sky),
    shop: f(mix(P.ink, P.foliageSummer, 0.35)), iron: f(iron()), paper: f(P.paper), red: f(P.awningRed), lamp: P.lamp,
  };
  HEX.set(b.id, h);
  return h;
}

/** Face f of a block (0 north, 1 east, 2 south, 3 west) as an affine frame: u along it, e up, w out, straight to screen px. */
function frame(B: Blk, f: number): Fr {
  const c = [B.x0, B.y0, B.x1, B.y0, B.x1, B.y1, B.x0, B.y1];
  const ax = c[f * 2] as number, ay = c[f * 2 + 1] as number, bx = c[((f + 1) % 4) * 2] as number, by = c[((f + 1) % 4) * 2 + 1] as number;
  const len = Math.hypot(bx - ax, by - ay), tx = (bx - ax) / len, ty = (by - ay) / len, [nx, ny] = FN4[f] as readonly [number, number];
  const o = screenInto(ax, ay, 0, { x: 0, y: 0 }), u = screenInto(ax + tx, ay + ty, 0, { x: 0, y: 0 }), w = screenInto(ax + nx, ay + ny, 0, { x: 0, y: 0 });
  return { len, ox: o.x, oy: o.y, ux: u.x - o.x, uy: u.y - o.y, wx: w.x - o.x, wy: w.y - o.y, L: faceLight(nx, ny) };
}
/** A quad on a face frame from its four (u, e, w) corners, onto a path or the context (no beginPath). */
function q4(t: CanvasPath, fr: Fr, ...c: number[]): void {
  const ez = EH * cam.z;
  for (let i = 0; i < 4; i++) {
    const u = c[i * 3] as number, e = c[i * 3 + 1] as number, w = c[i * 3 + 2] as number;
    const x = fr.ox + u * fr.ux + w * fr.wx, y = fr.oy + u * fr.uy + w * fr.wy - e * ez;
    if (i) t.lineTo(x, y);
    else t.moveTo(x, y);
  }
  t.closePath();
}
function rect(t: CanvasPath, fr: Fr, u0: number, u1: number, e0: number, e1: number, w = 0): void {
  q4(t, fr, u0, e0, w, u1, e0, w, u1, e1, w, u0, e1, w);
}
function line(ctx: CanvasRenderingContext2D, fr: Fr, u0: number, e0: number, w0: number, u1: number, e1: number, w1: number): void {
  const ez = EH * cam.z;
  seg(ctx, fr.ox + u0 * fr.ux + w0 * fr.wx, fr.oy + u0 * fr.uy + w0 * fr.wy - e0 * ez, fr.ox + u1 * fr.ux + w1 * fr.wx, fr.oy + u1 * fr.uy + w1 * fr.wy - e1 * ez);
}

/** A facade block, full or cut to its ground floor; between the two (0.4 s after a turn) the full block fades out over the low one. */
function drawFacade(d: Drawable, ctx: CanvasRenderingContext2D): void {
  const B = BLKS[(d as Item).ref] as Blk, [sx, sy] = FN4[B.street] as readonly [number, number];
  if (B.cut < 1) {
    ctx.globalAlpha = 1 - B.cut;
    if (B.cafe && !vis(sx, sy)) tables(ctx, B, B.street); // seen from behind: the tables are farther off
    facade(ctx, B, false);
  }
  if (B.cut > 0) {
    ctx.globalAlpha = B.cut;
    facade(ctx, B, true);
  }
  ctx.globalAlpha = 1;
}

/** A face's frame as the canvas transform: face-local (u tiles along it, e EH up) to device px, for the cached paths and the fills. */
function onFace(ctx: CanvasRenderingContext2D, fr: Fr, w = 0): void {
  const d = view.dpr;
  ctx.setTransform(fr.ux * d, fr.uy * d, 0, -EH * cam.z * d, (fr.ox + w * fr.wx) * d, (fr.oy + w * fr.wy) * d);
}
/** The wall's light, 1.06 at the top to 0.94 at the foot, as a face-local gradient kept while its colours hold. */
const GRAD = new Map<string, CanvasGradient>();
function wallGrad(ctx: CanvasRenderingContext2D, hex: string, L: number): CanvasGradient {
  const a = shade(hex, L * 1.06), b = shade(hex, L * 0.94), k = a + b;
  let g = GRAD.get(k);
  if (!g) {
    if (GRAD.size > 300) GRAD.clear();
    g = ctx.createLinearGradient(0, WALL, 0, 0);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    GRAD.set(k, g);
  }
  return g;
}

/**
 * The block's visible open walls (5 storeys, 04 6.4: shop front, four rows of windows a tile apart, balconies on rows 2 and 5, string
 * courses), the mansard (zinc, set back 0.45, with dormers and chimneys), the cafe's awning. A near-side block (`low`) is its opaque
 * ground floor only, BOULEVARD.floor high (variant 1 of the boulevard gate; the S2 near-side option 2): shop windows on every face toward
 * the camera, a stone coping, the flat top, and its cafe's awning and tables turned to the camera, onto the back pavement (ring 8).
 */
function facade(ctx: CanvasRenderingContext2D, B: Blk, low: boolean): void {
  const z = cam.z, C = hexes(B.b), glow = lampGlow(), top = low ? BOULEVARD.floor : WALL, [sx, sy] = FN4[B.street] as readonly [number, number];
  const cafeF = low && !vis(sx, sy) ? (B.street + 2) % 4 : B.street;
  let st: Fr | null = null, cf: Fr | null = null;
  for (let f = 0; f < 4; f++) {
    const [nx, ny] = FN4[f] as readonly [number, number];
    if (!((B.open >> f) & 1) || !vis(nx, ny)) continue;
    const fr = frame(B, f), street = f === B.street;
    if (street) st = fr;
    if (f === cafeF) cf = fr;
    onFace(ctx, fr);
    ctx.fillStyle = z >= 0.6 && !low ? wallGrad(ctx, C.wall, fr.L) : shade(C.wall, fr.L);
    ctx.fillRect(0, 0, fr.len, top);
    if (street || (low && f === cafeF && B.cafe)) {
      ctx.fillStyle = shade(C.shop, fr.L); // the shop front, a dark Paris green; a wide window a tile
      ctx.fillRect(0.06, 0, fr.len - 0.12, 1.05);
    }
    windows(ctx, fr, B, f, street || low, C, glow, z, low);
    if (low) {
      ctx.fillStyle = shade(C.stone, fr.L * 1.03); // the coping
      ctx.fillRect(0, top - 0.1, fr.len, 0.1);
    }
    resetTransform(ctx);
    if (low) continue;
    if (z >= 0.6) {
      // the string courses between the storeys
      ctx.strokeStyle = shade(C.stone, fr.L * 0.86);
      ctx.lineWidth = Math.max(0.6, 0.9 * z);
      ctx.beginPath();
      for (let r = 0; r < 4; r++) line(ctx, fr, 0, 1.17 + r * 0.95, 0.02, fr.len, 1.17 + r * 0.95, 0.02);
      ctx.stroke();
    }
    if (street && z >= 0.6) balcony(ctx, fr, 2.2, windowSpans(fr.len), C, z);
  }
  resetTransform(ctx);
  if (low) {
    // the ground floor's flat roof: zinc inside a stone coping, so it reads as a roof and not as more pavement
    ctx.beginPath();
    for (const [x, y] of [[B.x0, B.y0], [B.x1, B.y0], [B.x1, B.y1], [B.x0, B.y1]] as const) ctx.lineTo(...xy(screenInto(x, y, top, SP)));
    ctx.closePath();
    ctx.fillStyle = shade(C.zinc, 1.06 * (1 - 0.14 * clamp01(W.wet)));
    ctx.fill();
    ctx.strokeStyle = shade(C.stone, 1.02);
    ctx.lineWidth = Math.max(0.6, 0.09 * TW * z);
    ctx.stroke();
  } else {
    roof(ctx, B, C, glow, z);
    if (st && z >= 0.6) balcony(ctx, st, WALL + 0.02, [0, st.len], C, z);
  }
  if (cf && B.cafe) {
    awning(ctx, cf, C, z, !low);
    tables(ctx, B, cafeF);
  }
}

/** The cafe's three bistro tables on the pavement 0.62 out from its face f, one a tile: the board's table (props.drawBistroTable). */
function tables(ctx: CanvasRenderingContext2D, B: Blk, f: number): void {
  if (cam.z < 0.45) return;
  const c = [B.x0, B.y0, B.x1, B.y0, B.x1, B.y1, B.x0, B.y1], [nx, ny] = FN4[f] as readonly [number, number], g = (f + 1) % 4;
  const ax = c[f * 2] as number, ay = c[f * 2 + 1] as number, len = Math.hypot((c[g * 2] as number) - ax, (c[g * 2 + 1] as number) - ay);
  const tx = ((c[g * 2] as number) - ax) / len, ty = ((c[g * 2 + 1] as number) - ay) / len;
  for (let k = 0; k < 3; k++) {
    const u = (len * (k + 0.5)) / 3;
    drawBistroTable(gamePen(ctx), gameProj, ax + tx * u + nx * 0.62, ay + ty * u + ny * 0.62);
  }
}

/** A face's window panes in face-local units, built once: `glass` all of them, `lamp` the 40 % lit at night (h01, so the pattern holds). */
type Panes = { glass: Path2D; lamp: Path2D; shop: Path2D };
const PANES = new Map<string, Panes>();
function panes(B: Blk, f: number, len: number, street: boolean, night: boolean, shopGlass: boolean, low: boolean): Panes {
  const key = B.b.id + '|' + f + '|' + (night ? 1 : 0) + (shopGlass ? 1 : 0) + (low ? 1 : 0);
  let p = PANES.get(key);
  if (p) return p;
  p = { glass: new Path2D(), lamp: new Path2D(), shop: new Path2D() };
  const seed = B.b.id * 7 + f, rows = low ? 0 : street ? 4 : 5; // a ground floor has its shop windows only
  for (let r = 0; r < rows; r++) {
    const e0 = street ? 1.25 + r * 0.95 : r === 0 ? 0.3 : 1.25 + (r - 1) * 0.95, h = street || r > 0 ? 0.62 : 0.55;
    for (let k = 0; k < len; k++) {
      p.glass.rect(k + 0.32, e0, 0.36, h);
      if ((street || r > 0) && night && h01(seed, r, k) < 0.4) p.lamp.rect(k + 0.32, e0, 0.36, h);
    }
  }
  if (low)
    for (let k = 0; k < len; k++) {
      // a ground floor's shop windows in painted surrounds, half of them lit at night (all of the cafe's), by h01 so the pattern holds
      p.shop.rect(k + 0.1, 0.08, 0.8, 0.86);
      (night && (B.cafe || h01(seed, 7, k) < 0.5) ? p.lamp : p.glass).rect(k + 0.18, 0.2, 0.64, 0.65);
    }
  else if (street && night && B.cafe) for (let k = 0; k < len; k++) p.lamp.rect(k + 0.18, 0.2, 0.64, 0.65); // the cafe glows
  else if (street && shopGlass) for (let k = 0; k < len; k++) p.glass.rect(k + 0.18, 0.2, 0.64, 0.65);
  PANES.set(key, p);
  return p;
}
/** Windows a tile apart, 0.36 x 0.62, in `sky` glass, framed in zinc from zoom 1; lit ones `lamp` with a 2 px bleed from zoom 0.8 (04
 *  10.2 item 3). Called in the face's frame (onFace); the frames and bleeds stroke the cached panes moved to CSS px at a screen width. */
function windows(ctx: CanvasRenderingContext2D, fr: Fr, B: Blk, f: number, street: boolean, C: Hexes, glow: number, z: number, low = false): void {
  const p = panes(B, f, fr.len, street, glow > 0.01, z >= 0.45, low), m = new DOMMatrix([fr.ux, fr.uy, 0, -EH * z, fr.ox, fr.oy]);
  const edge = (path: Path2D, col: string, w: number): void => {
    const out = new Path2D();
    out.addPath(path, m);
    resetTransform(ctx);
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.stroke(out);
    onFace(ctx, fr);
  };
  if (low) {
    ctx.fillStyle = shade(C.shop, fr.L);
    ctx.fill(p.shop);
  }
  ctx.fillStyle = shade(C.sky, fr.L * 0.92);
  ctx.fill(p.glass);
  if (z >= 1) edge(p.glass, shade(C.zinc, 0.9), Math.max(0.5, 0.5 * z));
  if (glow <= 0.01) return;
  ctx.fillStyle = css(hx(C.lamp), 0.85 * glow);
  ctx.fill(p.lamp);
  if (z >= 0.8) edge(p.lamp, css(hx(C.lamp), 0.25 * glow), 2);
}

/** A wrought-iron balcony: a stone slab 0.14 out, a rail 0.42 up, balusters from zoom 1 (04 6.4; the board's bay). */
function balcony(ctx: CanvasRenderingContext2D, fr: Fr, e: number, spans: readonly number[], C: Hexes, z: number): void {
  const d = 0.14;
  ctx.fillStyle = shade(C.stone, 1.02);
  ctx.beginPath();
  for (let i = 0; i < spans.length; i += 2) {
    const u0 = spans[i] as number, u1 = spans[i + 1] as number;
    q4(ctx, fr, u0, e, 0, u1, e, 0, u1, e, d, u0, e, d);
  }
  ctx.fill();
  ctx.strokeStyle = shade(C.iron, 1);
  ctx.lineWidth = Math.max(0.5, 0.6 * z);
  ctx.beginPath();
  for (let i = 0; i < spans.length; i += 2) {
    const u0 = spans[i] as number, u1 = spans[i + 1] as number;
    line(ctx, fr, u0, e + 0.42, d, u1, e + 0.42, d);
    if (z >= 1) for (let u = u0; u <= u1 + 1e-6; u += 0.2) line(ctx, fr, u, e, d, u, e + 0.42, d);
  }
  ctx.stroke();
}
/** One balcony a window: the spans [k + 0.17, k + 0.83] along a face of `len` tiles (a reused list per length). */
const SPANS = new Map<number, number[]>();
function windowSpans(len: number): readonly number[] {
  if (!SPANS.has(len)) SPANS.set(len, Array.from({ length: len * 2 }, (_, i) => (i >> 1) + (i & 1 ? 0.83 : 0.17)));
  return SPANS.get(len) as number[];
}

/** A face's dormers in face-local units, built once: the stone bodies, their glass, and the 40 % lit at night (h01). */
const DORM = new Map<string, { body: Path2D; glass: Path2D; lamp: Path2D }>();
function dormers(B: Blk, f: number, len: number, night: boolean): { body: Path2D; glass: Path2D; lamp: Path2D } {
  const key = B.b.id + '|' + f + '|' + (night ? 1 : 0);
  let d = DORM.get(key);
  if (d) return d;
  d = { body: new Path2D(), glass: new Path2D(), lamp: new Path2D() };
  for (let k = 0; k < len; k++) {
    d.body.rect(k + 0.37, WALL + 0.15, 0.26, 0.55);
    (night && h01(B.b.id, 9, k + f * 5) < 0.4 ? d.lamp : d.glass).rect(k + 0.43, WALL + 0.27, 0.14, 0.31);
  }
  DORM.set(key, d);
  return d;
}

/** The mansard: zinc slopes on the open sides (set back 0.45), the flat top, dormers a tile apart, two chimney stacks; rain darkens it. */
function roof(ctx: CanvasRenderingContext2D, B: Blk, C: Hexes, glow: number, z: number): void {
  const o = B.open, wet = 1 - 0.14 * clamp01(W.wet); // rain: roof x 0.86 (04 6.4)
  const bot = [B.x0, B.y0, B.x1, B.y0, B.x1, B.y1, B.x0, B.y1];
  const X0 = B.x0 + (o & 8 ? INS : 0), X1 = B.x1 - (o & 2 ? INS : 0), Y0 = B.y0 + (o & 1 ? INS : 0), Y1 = B.y1 - (o & 4 ? INS : 0);
  const tp = [X0, Y0, X1, Y0, X1, Y1, X0, Y1];
  for (let f = 0; f < 4; f++) {
    const [nx, ny] = FN4[f] as readonly [number, number];
    if (!((o >> f) & 1) || !vis(nx, ny, INS)) continue;
    const g = (f + 1) % 4;
    ctx.fillStyle = shade(C.zinc, faceLight(nx, ny) * 0.95 * wet);
    ctx.beginPath();
    for (const [x, y, e] of [[bot[f * 2], bot[f * 2 + 1], WALL], [bot[g * 2], bot[g * 2 + 1], WALL], [tp[g * 2], tp[g * 2 + 1], ROOF], [tp[f * 2], tp[f * 2 + 1], ROOF]] as const)
      ctx.lineTo(...xy(screenInto(x as number, y as number, e, SP)));
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = shade(C.zinc, 1.08 * wet);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) ctx.lineTo(...xy(screenInto(tp[i * 2] as number, tp[i * 2 + 1] as number, ROOF, SP)));
  ctx.closePath();
  ctx.fill();
  if (z >= 0.6)
    for (let f = 0; f < 4; f++) {
      const [nx, ny] = FN4[f] as readonly [number, number];
      if (!((o >> f) & 1) || !vis(nx, ny)) continue;
      // the face's dormers, batched: bodies, glass and lit glass cached in the face's frame 0.22 in, then the caps (none overlap)
      const fr = frame(B, f), d = dormers(B, f, fr.len, glow > 0.01), cap = new Path2D();
      onFace(ctx, fr, -0.22);
      for (const [p, col] of [[d.body, shade(C.stone, fr.L)], [d.glass, shade(C.sky, fr.L * 0.9)], [d.lamp, css(hx(C.lamp), 0.85 * glow)]] as const) {
        ctx.fillStyle = col;
        ctx.fill(p);
      }
      resetTransform(ctx);
      for (let k = 0; k < fr.len; k++) q4(cap, fr, k + 0.33, WALL + 0.7, -0.2, k + 0.67, WALL + 0.7, -0.2, k + 0.5, WALL + 0.9, -0.32, k + 0.5, WALL + 0.9, -0.32);
      ctx.fillStyle = shade(C.zinc, 1);
      ctx.fill(cap);
    }
  if (z >= 0.45)
    for (let k = 0; k < 2; k++)
      prism(ctx, sq(X0 + (X1 - X0) * (0.2 + 0.6 * h01(B.b.id, k, 95)), Y0 + (Y1 - Y0) * (0.2 + 0.6 * h01(B.b.id, k, 96)), 0.12, 0.1), ROOF, ROOF + 0.45, C.stone);
}

/** The cafe's awning: six stripes `awningRed` and `paper` sloping out 0.55 over the pavement, a valance, two poles, "CAFE" as 4 blocks
 *  over it (`sign`; not on a ground floor, whose coping is lower). */
function awning(ctx: CanvasRenderingContext2D, fr: Fr, C: Hexes, z: number, sign: boolean): void {
  const len = fr.len, out = 0.55, eW = 1.15, eE = 0.95, n = 6;
  if (z >= 0.9 && sign) {
    ctx.fillStyle = shade(C.paper, fr.L);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) rect(ctx, fr, len / 2 - 0.55 + 0.3 * k, len / 2 - 0.35 + 0.3 * k, 1.22, 1.42);
    ctx.fill();
  }
  for (let i = 0; i < n; i++) {
    const u0 = 0.04 + ((len - 0.08) * i) / n, u1 = 0.04 + ((len - 0.08) * (i + 1)) / n;
    ctx.fillStyle = shade(i % 2 ? C.paper : C.red, 1.02);
    ctx.beginPath();
    q4(ctx, fr, u0, eW, 0, u1, eW, 0, u1, eE, out, u0, eE, out);
    ctx.fill();
  }
  ctx.fillStyle = shade(C.red, 0.95);
  ctx.beginPath();
  rect(ctx, fr, 0.04, len - 0.04, eE - 0.12, eE, out);
  ctx.fill();
  if (z >= 0.6) {
    ctx.strokeStyle = shade(C.zinc, 0.9);
    ctx.lineWidth = Math.max(0.6, 0.8 * z);
    ctx.beginPath();
    line(ctx, fr, 0.1, 0, out, 0.1, eE - 0.12, out);
    line(ctx, fr, len - 0.1, 0, out, len - 0.1, eE - 0.12, out);
    ctx.stroke();
  }
}
