// src/render/apron.ts
// The apron drawables the painter sorts with the props (03 7.4 item 4; 04 6.4): one railing piece per boundary tile except the gates,
// the five gates (two stone pillars with single-globe lamps and open iron leaves), the facade blocks as iso boxes in the manner of the
// board's tile 11 (with the near-side cutaway, and a cafe with its awning and three bistro tables on each of E, S and W), the moored
// peniche and a sailboat. Split out of backdrop.ts (AGENTS rule 9; 03 2.7 row apron.ts), which keeps the sky and the apron ground.
// Ported from GV 6953-6965 (wp, poly, faceVis, faceLight, shade, h01: the iso box kit), 7509-7547 (fencePieces: the railing idea).
// Verdict: ADAPT. Changes: boxes are prisms of world points, any polygon, faces culled by faceVis and lit by faceLight; a facade block is
// one drawable at the largest depth of its footprint (03 7.2 item 2); a block nearer the camera than the park centre fades to the cutaway
// over 0.4 s of frame time (04 6.4, A7); windows one a tile (3 a row on a 3-tile block), 40 % lit at night by h01; the cafe is the block
// nearest the middle of each side that does not face a gate; railings come from park.railPieces() (all four sides: the north gate needs a barrier to sit in).
// Dropped from the range: the house kit beyond the box primitives (6967-7035), GV's fences of logs.
// TODO(S9): mist greys the facades to 60 % (04 10.5); awning scallops flap in a breeze (04 6.4 row cafe).
import { clamp01, css, hx, TAU, type XY } from '../core/math.ts';
import { DAYLEN, T } from '../core/clock.ts';
import { W } from '../core/weather.ts';
import { now } from '../core/loop.ts';
import { N } from '../world/grid.ts';
import { BACKDROP, GATES, facadeBlocks, railPieces, type FacadeBlock } from '../world/park.ts';
import { CTR, EH, TH, TW, cam, view } from './camera.ts';
import { screenInto } from './project.ts';
import { depthOf, footprintDepth, type Drawable } from './order.ts';
import { GC, faceLight, h01, lampGlow, mix, shade, style } from './ambient.ts';
import { HI, LO, RIVER_DROP, vis, wall, xy } from './backdrop.ts';

const SP: XY = { x: 0, y: 0 }, SQ: XY = { x: 0, y: 0 };

/* ---------- the apron drawables (03 7.4 item 4; 04 6.4) ---------- */
type Item = Drawable & { ref: number; r: number; h: number; fw: number; fh: number };
type Fr = { ax: number; ay: number; len: number; tx: number; ty: number; nx: number; ny: number; ox: number; oy: number; ux: number; uy: number; wx: number; wy: number; L: number };
type Blk = { b: FacadeBlock; x0: number; y0: number; x1: number; y1: number; street: number; open: number; cafe: boolean; cut: number; tone: number };
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
    // each building's stone a shade lighter or darker than its neighbours' (+-3 %, by h01 so it holds), so a row reads as houses
    BLKS.push({ b, x0, y0, x1, y1, street, open, cafe: cafeOf[b.side] === b, cut: -1, tone: 0.97 + 0.06 * h01(b.id, 7, 97) });
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

/** The sailboat crosses the river once a day, west to east, from f 0.36 to 0.64 (04 6.4 row river). */
function sailX(): number | null {
  return T.f < 0.36 || T.f > 0.64 ? null : LO + 1 + (HI - LO - 2) * ((T.f - 0.36) / 0.28);
}

/**
 * Phase 6's apron share (03 7.9): every apron drawable near the screen with its depth for this angle (a block takes the largest depth
 * of its footprint tiles), and the near-side cut of each facade eased over 0.4 s (04 6.4). The list is reused frame to frame.
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
  return OUT;
}

/** A facade nearer the camera than the park centre is cut away (03 7.4 item 4, A7); the change fades over 0.4 s of frame time. */
function stepCuts(): void {
  const t = now(), dt = t - cutAt, c0 = depthOf(CTR, CTR);
  cutAt = t;
  for (const B of BLKS) {
    const target = depthOf((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2) > c0 ? 1 : 0;
    if (B.cut < 0 || dt <= 0 || dt > 1000) B.cut = target;
    else B.cut = target > B.cut ? Math.min(target, B.cut + dt / 400) : Math.max(target, B.cut - dt / 400);
  }
}

/** A prism on a world polygon (clockwise, north-west first) between heights e0 and e1: its visible sides by faceLight, then the top. */
function prism(ctx: CanvasRenderingContext2D, pts: readonly number[], e0: number, e1: number, hex: string, top = hex, a?: number): void {
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = pts[i * 2] as number, ay = pts[i * 2 + 1] as number, bx = pts[((i + 1) % n) * 2] as number, by = pts[((i + 1) % n) * 2 + 1] as number;
    const l = Math.hypot(bx - ax, by - ay) || 1;
    if (vis((by - ay) / l, (ax - bx) / l)) wall(ctx, ax, ay, bx, by, e0, e1, hex, 1, a);
  }
  ctx.fillStyle = shade(top, 1.06, a);
  ctx.beginPath();
  for (let i = 0; i < n; i++) ctx.lineTo(...xy(screenInto(pts[i * 2] as number, pts[i * 2 + 1] as number, e1, SP)));
  ctx.closePath();
  ctx.fill();
}
function sq(x: number, y: number, r: number, ry = r): number[] {
  return [x - r, y - ry, x + r, y - ry, x + r, y + ry, x - r, y + ry];
}

let IRON = '';
/** Iron: `ink` a tenth of the way toward `zinc` (04 6.4 row railings; the board's balconies). */
function iron(): string {
  const P = style().palette;
  return IRON || (IRON = mix(P.ink, P.zinc, 0.1));
}
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
  for (const e of [0.14, top - 0.06]) {
    ctx.moveTo(SP.x, SP.y - e * ez);
    ctx.lineTo(SQ.x, SQ.y - e * ez);
  }
  for (let k = 0; k < 4; k++) {
    const u = 0.125 + 0.25 * k;
    ctx.moveTo(SP.x + ux * u, SP.y + uy * u - 0.08 * ez);
    ctx.lineTo(SP.x + ux * u, SP.y + uy * u - top * ez);
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
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
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
  for (const e of [0.06, 0.48]) {
    ctx.moveTo(SP.x, SP.y - e * ez);
    ctx.lineTo(SQ.x, SQ.y - e * ez);
  }
  for (let k = 0; k <= n; k++) {
    const x = SP.x + ((SQ.x - SP.x) * k) / n, y = SP.y + ((SQ.y - SP.y) * k) / n;
    ctx.moveTo(x, y - 0.06 * ez);
    ctx.lineTo(x, y - 0.54 * ez);
  }
  ctx.stroke();
}

/* ---------- facade blocks: iso boxes in the manner of the board's tile 11 (04 6.4 row facades; GV box kit 6953-6965) ---------- */
const WALL = 5, ROOF = 6, INS = 0.45; // the wall top under the mansard, the roof top (6.0 EH), the mansard's set-back
type Hexes = { stone: string; zinc: string; sky: string; shop: string; iron: string; paper: string; red: string; lamp: string };
const HEX: Partial<Record<'near' | 'far', Hexes>> = {};
/** The facade colours; the far bank's in the haze at 0.35 toward `fog` (04 6.4 row far bank). */
function hexes(far: boolean): Hexes {
  const k = far ? 'far' : 'near', got = HEX[k];
  if (got) return got;
  const P = style().palette, f = (h: string): string => (far ? mix(h, P.fog, 0.35) : h);
  const h: Hexes = {
    stone: f(P.stone), zinc: f(P.zinc), sky: f(P.sky), shop: f(mix(P.ink, P.foliageSummer, 0.35)), iron: f(iron()), paper: f(P.paper),
    red: f(P.awningRed), lamp: P.lamp,
  };
  HEX[k] = h;
  return h;
}

/** Face f of a block (0 north, 1 east, 2 south, 3 west) as an affine frame: u along it, e up, w out, straight to screen px. */
function frame(B: Blk, f: number): Fr {
  const c = [B.x0, B.y0, B.x1, B.y0, B.x1, B.y1, B.x0, B.y1];
  const ax = c[f * 2] as number, ay = c[f * 2 + 1] as number, bx = c[((f + 1) % 4) * 2] as number, by = c[((f + 1) % 4) * 2 + 1] as number;
  const len = Math.hypot(bx - ax, by - ay), tx = (bx - ax) / len, ty = (by - ay) / len, [nx, ny] = FN4[f] as readonly [number, number];
  const o = screenInto(ax, ay, 0, { x: 0, y: 0 }), u = screenInto(ax + tx, ay + ty, 0, { x: 0, y: 0 }), w = screenInto(ax + nx, ay + ny, 0, { x: 0, y: 0 });
  return { ax, ay, len, tx, ty, nx, ny, ox: o.x, oy: o.y, ux: u.x - o.x, uy: u.y - o.y, wx: w.x - o.x, wy: w.y - o.y, L: faceLight(nx, ny) };
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
  ctx.moveTo(fr.ox + u0 * fr.ux + w0 * fr.wx, fr.oy + u0 * fr.uy + w0 * fr.wy - e0 * ez);
  ctx.lineTo(fr.ox + u1 * fr.ux + w1 * fr.wx, fr.oy + u1 * fr.uy + w1 * fr.wy - e1 * ez);
}

/** A facade block, full or cut away; between the two (0.4 s after a turn) the full block fades out over the cut one. */
function drawFacade(d: Drawable, ctx: CanvasRenderingContext2D): void {
  const B = BLKS[(d as Item).ref] as Blk, [sx, sy] = FN4[B.street] as readonly [number, number];
  if (B.cafe && !vis(sx, sy)) tables(ctx, frame(B, B.street), hexes(false), cam.z); // seen from behind: the tables are farther off
  if (B.cut < 1) {
    ctx.globalAlpha = 1 - B.cut;
    facade(ctx, B, false);
  }
  if (B.cut > 0) {
    ctx.globalAlpha = B.cut;
    facade(ctx, B, true);
  }
  ctx.globalAlpha = 1;
}

/**
 * The block's visible open walls (5 storeys, 04 6.4: shop front, four rows of windows a tile apart, balconies on rows 2 and 5, string
 * courses), the mansard (zinc, set back 0.45, with dormers and chimneys), the cafe's awning. The near-side cut keeps the ground floor
 * band only, 0.6 EH at alpha 0.35, no roof (03 7.4 item 4, A7).
 */
function facade(ctx: CanvasRenderingContext2D, B: Blk, cut: boolean): void {
  const z = cam.z, C = hexes(B.b.far), glow = lampGlow(), a = cut ? 0.35 : undefined, top = cut ? 0.6 : WALL;
  let st: Fr | null = null;
  if (cut)
    for (let f = 0; f < 4; f++) {
      // the far walls' inner faces first, in shade, so the cut reads as a box with its top taken off (GV drawHouse 7080 idea)
      const [nx, ny] = FN4[f] as readonly [number, number];
      if (!((B.open >> f) & 1) || vis(nx, ny)) continue;
      const fr = frame(B, f);
      ctx.fillStyle = shade(C.stone, faceLight(-nx, -ny) * 0.82 * B.tone, a);
      ctx.beginPath();
      rect(ctx, fr, 0, fr.len, 0, top);
      ctx.fill();
    }
  for (let f = 0; f < 4; f++) {
    const [nx, ny] = FN4[f] as readonly [number, number];
    if (!((B.open >> f) & 1) || !vis(nx, ny)) continue;
    const fr = frame(B, f), street = f === B.street;
    ctx.beginPath();
    rect(ctx, fr, 0, fr.len, 0, top);
    if (!cut && z >= 0.6) {
      const g = ctx.createLinearGradient(fr.ox, fr.oy - top * EH * z, fr.ox, fr.oy);
      g.addColorStop(0, shade(C.stone, fr.L * 1.06 * B.tone));
      g.addColorStop(1, shade(C.stone, fr.L * 0.94 * B.tone));
      ctx.fillStyle = g;
    } else ctx.fillStyle = shade(C.stone, fr.L * B.tone, a);
    ctx.fill();
    if (street) {
      st = fr;
      ctx.fillStyle = shade(C.shop, fr.L, a); // the shop front, a dark Paris green; a wide window a tile
      ctx.beginPath();
      rect(ctx, fr, 0.06, fr.len - 0.06, 0, cut ? 0.6 : 1.05);
      ctx.fill();
    }
    if (cut) continue;
    windows(ctx, fr, B, f, street, C, glow, z);
    if (street && z >= 0.6) balcony(ctx, fr, 2.2, windowSpans(fr.len), C, z);
  }
  if (cut) return;
  roof(ctx, B, C, glow, z);
  if (st && z >= 0.6) balcony(ctx, st, WALL + 0.02, [0, st.len], C, z);
  if (st && B.cafe) {
    awning(ctx, st, C, z);
    tables(ctx, st, C, z);
  }
}

/** The cafe's three bistro tables on the pavement under the awning: a `paper` top on a `zinc` pedestal, two chairs with `sky` seats. */
function tables(ctx: CanvasRenderingContext2D, fr: Fr, C: Hexes, z: number): void {
  if (z < 0.45) return;
  const P = style().palette, ez = EH * z, r = 0.17 * Math.SQRT2 * z;
  for (let k = 0; k < 3; k++) {
    const u = (fr.len * (k + 0.5)) / 3, w = 0.62;
    const cx = fr.ox + u * fr.ux + w * fr.wx, cy = fr.oy + u * fr.uy + w * fr.wy;
    ctx.fillStyle = shade(P.sky, 0.95);
    ctx.beginPath();
    for (const du of [-0.24, 0.24]) rect(ctx, fr, u + du - 0.07, u + du + 0.07, 0.2, 0.25, w);
    ctx.fill();
    ctx.strokeStyle = shade(C.zinc, 0.85);
    ctx.lineWidth = Math.max(0.5, 0.7 * z);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 0.45 * ez);
    for (const du of [-0.24, 0.24]) line(ctx, fr, u + du * 1.25, 0.25, w, u + du * 1.25, 0.55, w);
    ctx.stroke();
    ctx.fillStyle = shade(P.paper, 1.02);
    ctx.beginPath();
    ctx.ellipse(cx, cy - 0.45 * ez, r * (TW / 2), r * (TH / 2), 0, 0, TAU);
    ctx.fill();
  }
}

/** Windows a tile apart, 0.36 x 0.62, in `sky` glass; 40 % lit at night by h01 so the pattern holds, with a 2 px bleed (04 10.2 item 3). */
function windows(ctx: CanvasRenderingContext2D, fr: Fr, B: Blk, f: number, street: boolean, C: Hexes, glow: number, z: number): void {
  const glass = new Path2D(), lamp = new Path2D(), seed = B.b.id * 7 + f;
  const rows = street ? 4 : 5;
  for (let r = 0; r < rows; r++) {
    const e0 = street ? 1.25 + r * 0.95 : r === 0 ? 0.3 : 1.25 + (r - 1) * 0.95, h = street || r > 0 ? 0.62 : 0.55;
    for (let k = 0; k < fr.len; k++) {
      rect(glass, fr, k + 0.32, k + 0.68, e0, e0 + h);
      if ((street || r > 0) && glow > 0.01 && h01(seed, r, k) < 0.4) rect(lamp, fr, k + 0.32, k + 0.68, e0, e0 + h);
    }
  }
  if (street && glow > 0.01 && B.cafe) for (let k = 0; k < fr.len; k++) rect(lamp, fr, k + 0.18, k + 0.82, 0.2, 0.85); // the cafe glows
  else if (street && z >= 0.45) for (let k = 0; k < fr.len; k++) rect(glass, fr, k + 0.18, k + 0.82, 0.2, 0.85);
  ctx.fillStyle = shade(C.sky, fr.L * 0.92);
  ctx.fill(glass);
  if (z >= 1) {
    ctx.strokeStyle = shade(C.zinc, 0.9);
    ctx.lineWidth = Math.max(0.5, 0.5 * z);
    ctx.stroke(glass);
  }
  if (glow > 0.01) {
    ctx.fillStyle = css(hx(C.lamp), 0.85 * glow);
    ctx.fill(lamp);
    if (z >= 0.8) {
      ctx.strokeStyle = css(hx(C.lamp), 0.25 * glow);
      ctx.lineWidth = 2;
      ctx.stroke(lamp);
    }
  }
  if (z >= 0.6) {
    // the string courses between the storeys
    ctx.strokeStyle = shade(C.stone, fr.L * 0.86);
    ctx.lineWidth = Math.max(0.6, 0.9 * z);
    ctx.beginPath();
    for (let r = 0; r < 4; r++) line(ctx, fr, 0, 1.17 + r * 0.95, 0.02, fr.len, 1.17 + r * 0.95, 0.02);
    ctx.stroke();
  }
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
  let s = SPANS.get(len);
  if (!s) {
    s = [];
    for (let k = 0; k < len; k++) s.push(k + 0.17, k + 0.83);
    SPANS.set(len, s);
  }
  return s;
}

/** Fill a path in one colour. */
function fillPath(ctx: CanvasRenderingContext2D, p: Path2D, style: string): void {
  ctx.fillStyle = style;
  ctx.fill(p);
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
      // the face's dormers in three batched fills (bodies, caps, glass): they never overlap one another
      const fr = frame(B, f), body = new Path2D(), cap = new Path2D(), glass = new Path2D(), lamp = new Path2D();
      for (let k = 0; k < fr.len; k++) {
        const u = k + 0.5;
        rect(body, fr, u - 0.13, u + 0.13, WALL + 0.15, WALL + 0.7, -0.22);
        rect(glow > 0.01 && h01(B.b.id, 9, k + f * 5) < 0.4 ? lamp : glass, fr, u - 0.07, u + 0.07, WALL + 0.27, WALL + 0.58, -0.22);
        q4(cap, fr, u - 0.17, WALL + 0.7, -0.2, u + 0.17, WALL + 0.7, -0.2, u, WALL + 0.9, -0.32, u, WALL + 0.9, -0.32);
      }
      fillPath(ctx, body, shade(C.stone, fr.L));
      fillPath(ctx, cap, shade(C.zinc, 1));
      fillPath(ctx, glass, shade(C.sky, fr.L * 0.9));
      fillPath(ctx, lamp, css(hx(C.lamp), 0.85 * glow));
    }
  if (z >= 0.45)
    for (let k = 0; k < 2; k++)
      prism(ctx, sq(X0 + (X1 - X0) * (0.2 + 0.6 * h01(B.b.id, k, 95)), Y0 + (Y1 - Y0) * (0.2 + 0.6 * h01(B.b.id, k, 96)), 0.12, 0.1), ROOF, ROOF + 0.45, C.stone);
}

/** The cafe's awning: six stripes `awningRed` and `paper` sloping out 0.55 over the pavement, a valance, two poles, "CAFE" as 4 blocks. */
function awning(ctx: CanvasRenderingContext2D, fr: Fr, C: Hexes, z: number): void {
  const len = fr.len, out = 0.55, eW = 1.15, eE = 0.95, n = 6;
  if (z >= 0.9) {
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

/* ---------- on the river: the moored peniche and the day's sailboat (04 6.4 row river) ---------- */
const BARGE: readonly number[] = [43.6, -3.6, 47.3, -3.6, 48.1, -2.85, 47.3, -2.1, 43.6, -2.1];
const CABIN: readonly number[] = [44.2, -3.3, 46.8, -3.3, 46.8, -2.4, 44.2, -2.4];

/** The peniche, 4 x 1.5 tiles, moored by the quay near the east end: an `ink` hull, an `awningRed` cabin, bobbing +-0.5 px. */
function drawBarge(_d: Drawable, ctx: CanvasRenderingContext2D): void {
  const P = style().palette, glow = lampGlow();
  ctx.save();
  ctx.translate(0, 0.5 * Math.sin(T.abs * DAYLEN * 1.3));
  prism(ctx, BARGE, -RIVER_DROP - 0.05, 0.1, P.ink, mix(P.bedEarth, P.ink, 0.25));
  prism(ctx, CABIN, 0.1, 0.48, P.awningRed, P.paper);
  for (const [y, ny] of [[-3.3, -1], [-2.4, 1]] as const) {
    if (!vis(0, ny)) continue;
    ctx.fillStyle = glow > 0.5 ? css(hx(P.lamp), 0.9) : shade(P.sky, 0.95);
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const x0 = 44.45 + 0.8 * k;
      for (const [x, e] of [[x0, 0.22], [x0 + 0.42, 0.22], [x0 + 0.42, 0.38], [x0, 0.38]] as const) ctx.lineTo(...xy(screenInto(x, y + ny * 0.01, e, SP)));
      ctx.closePath();
    }
    ctx.fill();
  }
  ctx.restore();
}

/** A small sailboat with a `paper` sail crossing west to east (sailX). */
function drawSail(d: Drawable, ctx: CanvasRenderingContext2D): void {
  const P = style().palette, x = d.x, y = d.y, z = cam.z;
  prism(ctx, [x - 0.55, y - 0.16, x + 0.35, y - 0.16, x + 0.6, y, x + 0.35, y + 0.16, x - 0.55, y + 0.16], -RIVER_DROP - 0.04, -0.14, P.paper, P.bedEarth);
  const m0 = screenInto(x, y, -0.14, { x: 0, y: 0 }), m1 = screenInto(x, y, 1.5, { x: 0, y: 0 });
  ctx.strokeStyle = shade(P.ink, 1);
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.beginPath();
  ctx.moveTo(m0.x, m0.y);
  ctx.lineTo(m1.x, m1.y);
  ctx.stroke();
  ctx.fillStyle = shade(P.paper, 0.98, 0.95); // the mainsail aft of the mast and the jib forward, in the hull's plane
  ctx.beginPath();
  for (const tri of [[-0.04, 0, -0.04, 1.42, -0.6, 0.05], [0.04, 0, 0.04, 1.25, 0.55, -0.06]]) {
    for (let i = 0; i < 3; i++) {
      const p = screenInto(x + (tri[i * 2] as number), y, tri[i * 2 + 1] as number, SP);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    }
    ctx.closePath();
  }
  ctx.fill();
}
