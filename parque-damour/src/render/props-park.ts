// src/render/props-park.ts
// The park's built props that the Style Gate board did not show, in direction A only (04 3.4 item 2): the kiosk, the bandstand (the
// owner's pick 3B, Belle Époque), the picnic blanket and the footbridge (pick 5C, iron lattice; register section 4, 2026-10-13), drawn to
// match the board's bench, lamp, fountain and facade tiles (soft gradient faces by faceLight, no outlines, iron as lines, palette tokens
// only), each from a parameter table; and the board's bench, moved here from props.ts with no change. Split out of props.ts, which
// dispatches to these, to keep both files near the 600-line rule (AGENTS rule 9; same module, same layer: 03 2.7 props.ts row).
// Ported from GV 6953-6960 (wp, poly, faceVis, faceLight: the box primitives), 7046-7056 (houseFrame: a quarter-turned local frame), 10294
// (archVoid: the flattened sin^0.55 arch over dusky water).
// Verdict: ADAPT. Changes: regular octagons, frustums (prism to cone) and turned boxes replace GV's house kit; faces are shown by faceVis
// on their slanted normals and lit by faceLight; a bandstand and a bridge draw in two parts, back and front, so people inside paint between
// them (GV frontFix 8871 idea; 03 7.2).
// Dropped from the range: logs, cobbles, planks, thatch, chimneys, smoke and the build stages of the house kit (6952-8044).
// TODO(S4): the bandstand's string lights at night while a busker plays (06 4); TODO(S9): the kiosk's winter steam, awning flap in breeze,
// snow on the deck and roofs (04 6.1).
import { TW } from './camera.ts';
import { faceLight, fillEllipse, fillPoly, GC, h01, lampGlow, mix, scaleHex, shade, strokeLine, type Pen, type Proj, type Pt } from './ambient.ts';
import { TAU, clamp01 } from '../core/math.ts';
import type { Prop } from '../world/grid.ts';
import { depthOf } from './order.ts';
import { faceVis, type HexKey } from './flora.ts';

type W3 = readonly [number, number, number]; // world x, y, e

function quad(proj: Proj, ...w: W3[]): Pt[] {
  return w.map(([x, y, e]) => proj(x, y, e));
}
/** n points round a world circle of radius r at height e (a plate, a ring). */
function ring(proj: Proj, cx: number, cy: number, r: number, e: number, n = 16): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    out.push(proj(cx + Math.cos(a) * r, cy + Math.sin(a) * r, e));
  }
  return out;
}

/* ---------- the game's iso kit (direction A only, 04 3.4 item 2): polygons, frustums and boxes through proj ---------- */
/** n points of a regular polygon of radius r at height e about (cx, cy); edge i (point i to i + 1) faces angle a0 + i x TAU / n. */
function ngon(cx: number, cy: number, r: number, e: number, n = 8, a0 = 0): W3[] {
  const out: W3[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + ((i - 0.5) / n) * TAU;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, e]);
  }
  return out;
}
function lerp3(a: W3, b: W3, t: number, e = a[2] + (b[2] - a[2]) * t): W3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, e];
}
type FrOpts = { n?: number; light?: number; alpha?: number; cap?: number };
/** Whether frustum face i (r0 at e0 up to r1 at e1, n sides) is turned to the viewer, by its slanted normal (GV faceVis 6958). */
function frustumVis(i: number, r0: number, e0: number, r1: number, e1: number, n = 8): boolean {
  const a = (i / n) * TAU, dh = e1 - e0, dr = r0 - r1, len = Math.hypot(dh, dr) || 1;
  return faceVis((Math.cos(a) * dh) / len, (Math.sin(a) * dh) / len, dr / len);
}
/**
 * The side faces of a frustum between an n-gon of radius r0 at e0 and one of radius r1 at e1 (a prism when r0 = r1, a cone when r1 = 0)
 * that face the viewer, each lit by faceLight and brighter as it turns up; `cap` fills the top polygon at that light.
 */
function frustum(pen: Pen, proj: Proj, cx: number, cy: number, r0: number, e0: number, r1: number, e1: number, hex: string, o: FrOpts = {}): void {
  const n = o.n ?? 8, lo = ngon(cx, cy, r0, e0, n), hi = ngon(cx, cy, r1, e1, n);
  const up = (r0 - r1) / (Math.hypot(e1 - e0, r0 - r1) || 1);
  for (let i = 0; i < n; i++) {
    if (!frustumVis(i, r0, e0, r1, e1, n)) continue;
    const a = (i / n) * TAU, j = (i + 1) % n;
    const L = (faceLight(Math.cos(a), Math.sin(a)) * (1 - 0.5 * up) + 0.53 * up) * (o.light ?? 1); // a roof keeps its facets
    fillPoly(pen, quad(proj, lo[i] as W3, lo[j] as W3, hi[j] as W3, hi[i] as W3), hex, { light: L, alpha: o.alpha });
  }
  if (o.cap !== undefined) fillPoly(pen, quad(proj, ...hi), hex, { light: o.cap, alpha: o.alpha });
}
/** An upright box about (cx, cy), half sizes hu by hv turned by ang radians, from e0 to e1: its faces turned to the viewer, then its top. */
function box(pen: Pen, proj: Proj, cx: number, cy: number, hu: number, hv: number, ang: number, e0: number, e1: number, hex: string, top = 1.06): void {
  const c = Math.cos(ang), s = Math.sin(ang);
  const pts = ([[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]] as const).map(([u, v]) => [cx + u * c - v * s, cy + u * s + v * c] as const);
  for (let i = 0; i < 4; i++) {
    const a = pts[i] as readonly [number, number], b = pts[(i + 1) % 4] as readonly [number, number];
    const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy, l = Math.hypot(mx, my) || 1;
    if (!faceVis(mx / l, my / l)) continue;
    fillPoly(pen, quad(proj, [a[0], a[1], e0], [b[0], b[1], e0], [b[0], b[1], e1], [a[0], a[1], e1]), hex, { light: faceLight(mx / l, my / l) });
  }
  fillPoly(pen, pts.map(([x, y]) => proj(x, y, e1)), hex, { light: top });
}
/** Whether octagon face i (face 0 looks east, 2 south) is turned to the viewer. */
function visF(i: number): boolean {
  return faceVis(Math.cos((i / 8) * TAU), Math.sin((i / 8) * TAU));
}
/** The points of a list from last to first, as a new array. */
function backward<T>(a: readonly T[]): T[] {
  const out: T[] = [];
  for (let i = a.length - 1; i >= 0; i--) out.push(a[i] as T);
  return out;
}
/** a[i] with i taken round the list (a polygon's corners). */
const nth = <V>(a: readonly V[], i: number): V => a[((i % a.length) + a.length) % a.length] as V;
/** The light of octagon face i (face 0 looks east). */
function faceL(i: number): number {
  return faceLight(Math.cos((i / 8) * TAU), Math.sin((i / 8) * TAU));
}
/** The ribs where the faces of a roof meet, along its profile of rings [radius, height] (a cone is two rings, the apex radius 0), on the
 *  side the viewer sees, at zoom 1.0 and over. */
function ribs(pen: Pen, proj: Proj, cx: number, cy: number, rings: readonly (readonly [number, number])[], hex: string): void {
  const { ctx, z } = pen;
  if (z < 1.0) return;
  const [r0, e0] = rings[0] as readonly [number, number], [r1, e1] = rings[1] as readonly [number, number];
  ctx.strokeStyle = shade(hex, 0.8, 0.8);
  ctx.lineWidth = Math.max(0.5, 0.5 * z);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    if (!frustumVis(i, r0, e0, r1, e1) && !frustumVis((i + 7) % 8, r0, e0, r1, e1)) continue;
    rings.forEach(([r, e], k) => {
      const q = proj(...(ngon(cx, cy, r, e, 8)[i] as W3));
      if (k) ctx.lineTo(q.x, q.y);
      else ctx.moveTo(q.x, q.y);
    });
  }
  ctx.stroke();
}
/** A gilt finial: a small ball on a spike h EH tall at the top of a roof (the railings' gilt spear tips, 04 6.4). */
function finial(pen: Pen, proj: Proj, cx: number, cy: number, e: number, hex: string, h = 0.12): void {
  const z = pen.z, a = proj(cx, cy, e), b = proj(cx, cy, e + h);
  strokeLine(pen, [a, b], hex, Math.max(0.6, 0.6 * z), { light: 0.95 });
  fillEllipse(pen, b.x, b.y, Math.max(0.8, 0.05 * TW * z), Math.max(0.8, 0.05 * TW * z), hex, { light: 1.05 });
}

/* ---------- the bench (04 6.1 row bench; moved here from props.ts, AGENTS rule 9: the board still imports it from there) ---------- */
/**
 * A bench on tile (x, y); rot 0 runs along world x and faces +y (south), each step a quarter turn on (1 west, 2 north, 3 east; the
 * game's Prop.rot r is (r + 2) % 4 here); height 0.45 EH; seat 0.2 EH. The far end, the back and the seat, the near end paint in the order
 * the projection puts them; wet slats darken to x 0.86 (04 6.1).
 */
export function drawBench(pen: Pen, proj: Proj, x: number, y: number, rot = 0, wet = 0): void {
  const P = pen.spec.palette;
  const q = Math.PI / 2 * rot;
  const cq = Math.cos(q), sq = Math.sin(q);
  // a local frame: u along the seat, v from the back (negative) to the front (positive)
  const W = (u: number, v: number, e: number): W3 => [x + u * cq - v * sq, y + u * sq + v * cq, e];
  const slat = scaleHex(P.bedEarth, [1.2, 1.2, 1.2]);
  const wk = 1 - 0.14 * wet;
  const lightTop = 1.0 * wk, lightFront = faceLight(-sq, cq) * wk;
  const seatE = 0.2, thick = 0.035;
  // the cast-iron ends: two legs, a seat rail, the armrest curl (zinc, drawn as lines)
  const ironW = Math.max(0.8, 1.1 * pen.z);
  const end = (u: number, seed: number): void => {
    for (const v of [-0.14, 0.13]) strokeLine(pen, quad(proj, W(u, v, 0), W(u, v, seatE)), P.zinc, ironW, { open: true, seed });
    strokeLine(pen, quad(proj, W(u, -0.22, seatE), W(u, 0.18, seatE)), P.zinc, ironW, { open: true, seed: seed + 1 });
    const curl: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const v = -0.2 + t * 0.34, e = seatE + 0.12 + Math.sin(t * Math.PI) * 0.1 - t * 0.04;
      curl.push(proj(...W(u, v, e)));
    }
    strokeLine(pen, [proj(...W(u, -0.2, seatE)), ...curl], P.zinc, ironW, { open: true, seed: seed + 2 });
  };
  // which end is nearer, and whether the front faces the viewer, by where the projection puts them (screen y grows toward the viewer)
  const uFar = proj(...W(-0.46, 0, 0)).y <= proj(...W(0.46, 0, 0)).y ? -0.46 : 0.46;
  const frontNear = proj(...W(0, 0.2, 0)).y >= proj(...W(0, -0.2, 0)).y;
  const back = (): void => {
    // the back: two slats standing at the rear
    for (const [e0, e1] of [[0.27, 0.35], [0.37, 0.45]] as const) {
      fillPoly(pen, quad(proj, W(-0.45, -0.2, e0), W(0.45, -0.2, e0), W(0.45, -0.2, e1), W(-0.45, -0.2, e1)), slat, { seed: 10 + e0 * 100, light: lightFront });
      fillPoly(pen, quad(proj, W(-0.45, -0.23, e1), W(0.45, -0.23, e1), W(0.45, -0.2, e1), W(-0.45, -0.2, e1)), slat, { seed: 11 + e0 * 100, light: lightTop, noInk: true });
    }
  };
  const seat = (): void => {
    // the seat: three slats along u, each 0.11 tile deep, with a thin front face where the viewer can see it
    for (let k = 0; k < 3; k++) {
      const v0 = -0.19 + k * 0.12, v1 = v0 + 0.11;
      fillPoly(pen, quad(proj, W(-0.45, v0, seatE), W(0.45, v0, seatE), W(0.45, v1, seatE), W(-0.45, v1, seatE)), slat, { seed: 20 + k, light: lightTop });
      if (frontNear) fillPoly(pen, quad(proj, W(-0.45, v1, seatE - thick), W(0.45, v1, seatE - thick), W(0.45, v1, seatE), W(-0.45, v1, seatE)), slat, { seed: 30 + k, light: lightFront * 0.92, noInk: true });
    }
  };
  end(uFar, 3); // the far end first
  if (frontNear) {
    back();
    seat();
  } else {
    seat();
    back();
  }
  end(-uFar, 6); // the near end over the seat
}

/* ---------- the kiosk (04 6.1 row kiosk; 06 4): a green octagonal Paris kiosque ---------- */
export type KioskSpec = {
  r: number; plinth: number; body: number; cornice: number; roofR: number; apex: number; awningOut: number; awningDrop: number;
  stripes: number; valance: number; wall: HexKey; wallK: number; trim: HexKey; roof: HexKey; stripeA: HexKey; stripeB: HexKey;
  shop: HexKey; window: HexKey; board: HexKey; gilt: HexKey;
};
/** The kiosk's numbers (EH heights, tile radii) and palette keys; a later slice shows the owner variants by changing these. */
export const KIOSK: KioskSpec = {
  r: 0.66, plinth: 0.08, body: 1.0, cornice: 0.08, roofR: 0.86, apex: 1.48, awningOut: 0.32, awningDrop: 0.2, stripes: 6, valance: 0.07,
  wall: 'foliageSummer', wallK: 0.8, trim: 'stone', roof: 'zinc', stripeA: 'awningRed', stripeB: 'paper', shop: 'ink', window: 'lamp',
  board: 'paper', gilt: 'lamp',
};

/**
 * A kiosk whose north-west tile is (x, y), serving on `rot` (0 south, then 1 west, 2 north, 3 east: the serving tile is south of the
 * south-west tile at rot 0, 02 8.3): a stone plinth; the green octagonal body (foliageSummer x 0.8, 04 6.1) with moulded panels; the
 * serving window over its counter, lamp-lit at night; a menu board on the face beside it; a stone cornice; a striped awning over the three
 * serving faces with a scalloped valance; the zinc cone with ribs and a gilt finial, 1.6 EH in all. Awning faces turned away paint first.
 */
export function drawKiosk(pen: Pen, proj: Proj, x: number, y: number, rot: number, night: boolean): void {
  const { ctx, z } = pen, P = pen.spec.palette, K = KIOSK, cx = x + 0.5, cy = y + 0.5;
  const sf = ((((rot + 2) % 4) * 2 + 6) % 8 + 8) % 8; // compass (0 N, 1 E, 2 S, 3 W) to the octagon face: face 0 looks east, 2 south
  const green = scaleHex(P[K.wall], [K.wallK, K.wallK, K.wallK]), top = K.body + K.cornice;
  const inner = ngon(cx, cy, K.r + 0.04, K.body, 8), outer = ngon(cx, cy, K.r + K.awningOut, K.body - K.awningDrop, 8);
  const awn = [(sf + 7) % 8, sf, (sf + 1) % 8], per = Math.max(1, Math.round(K.stripes / awn.length));
  const awning = (front: boolean): void => {
    awn.forEach((fi, k) => {
      if (visF(fi) !== front) return;
      const fj = (fi + 1) % 8, i0 = inner[fi] as W3, i1 = inner[fj] as W3, o0 = outer[fi] as W3, o1 = outer[fj] as W3;
      for (let s = 0; s < per; s++) {
        const t0 = s / per, t1 = (s + 1) / per, hex = (k * per + s) % 2 === 0 ? P[K.stripeA] : P[K.stripeB];
        const A0 = lerp3(i0, i1, t0), A1 = lerp3(i0, i1, t1), B0 = lerp3(o0, o1, t0), B1 = lerp3(o0, o1, t1);
        fillPoly(pen, quad(proj, A0, A1, B1, B0), hex, { light: front ? 1.02 : 0.9, grad: { from: proj(...A0), to: proj(...B0), k0: 1.0, k1: 0.88 } });
        const edge: Pt[] = [proj(...B0), proj(...B1)];
        for (let q = 4; q >= 0; q--) {
          const w = lerp3(o0, o1, t0 + ((t1 - t0) * q) / 4);
          edge.push(proj(w[0], w[1], w[2] - (q % 2 ? K.valance : K.valance * 0.4)));
        }
        fillPoly(pen, edge, hex, { light: front ? 0.95 : 0.85 });
      }
    });
  };
  awning(false);
  frustum(pen, proj, cx, cy, K.r + 0.04, 0, K.r + 0.04, K.plinth, P[K.trim], { light: 0.94 });
  frustum(pen, proj, cx, cy, K.r, K.plinth, K.r, K.body, green);
  const ring0 = ngon(cx, cy, K.r, 0, 8);
  for (let i = 0; i < 8; i++) {
    if (!visF(i)) continue;
    const a = ring0[i] as W3, b = ring0[(i + 1) % 8] as W3, L = faceLight(Math.cos((i / 8) * TAU), Math.sin((i / 8) * TAU));
    const at = (t: number, e: number): W3 => lerp3(a, b, t, e);
    if (i === sf) {
      // the serving window over the counter: dark by day, lamp-lit at night; the counter is a stone shelf 0.14 out
      fillPoly(pen, quad(proj, at(0.14, 0.47), at(0.86, 0.47), at(0.86, 0.88), at(0.14, 0.88)), night ? P[K.window] : mix(P[K.shop], P.foliageSummer, 0.35), { light: night ? 1.1 : L * 0.9 });
      const nx = Math.cos((i / 8) * TAU) * 0.14, ny = Math.sin((i / 8) * TAU) * 0.14, c0 = at(0.08, 0.47), c1 = at(0.92, 0.47);
      const out0: W3 = [c0[0] + nx, c0[1] + ny, 0.47], out1: W3 = [c1[0] + nx, c1[1] + ny, 0.47];
      fillPoly(pen, quad(proj, c0, c1, out1, out0), P[K.trim], { light: 1.04 });
      fillPoly(pen, quad(proj, [out0[0], out0[1], 0.42], [out1[0], out1[1], 0.42], out1, out0), P[K.trim], { light: L * 0.92 });
      continue;
    }
    if (z >= 0.8) fillPoly(pen, quad(proj, at(0.16, K.plinth + 0.1), at(0.84, K.plinth + 0.1), at(0.84, K.body - 0.12), at(0.16, K.body - 0.12)), green, { light: L * 0.9 });
    if (i === (sf + 2) % 8) {
      // the menu board beside the window: a paper card with three ruled lines at zoom 1.2 and over (drawn, never text)
      fillPoly(pen, quad(proj, at(0.24, 0.28), at(0.76, 0.28), at(0.76, 0.66), at(0.24, 0.66)), P[K.board], { light: 1.0 });
      if (z >= 1.2) {
        ctx.strokeStyle = GC(P.ink, 0.45);
        ctx.lineWidth = Math.max(0.5, 0.45 * z);
        ctx.beginPath();
        for (const e of [0.56, 0.47, 0.38]) {
          const p0 = proj(...at(0.32, e)), p1 = proj(...at(0.62 + 0.06 * h01(x, y, e * 100), e));
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
        }
        ctx.stroke();
      }
    }
  }
  frustum(pen, proj, cx, cy, K.r + 0.06, K.body, K.r + 0.06, top, P[K.trim]);
  awning(true);
  frustum(pen, proj, cx, cy, K.roofR, top, 0, K.apex, P[K.roof]);
  ribs(pen, proj, cx, cy, [[K.roofR, top], [0, K.apex]], P[K.roof]);
  finial(pen, proj, cx, cy, K.apex, P[K.gilt]);
}

/* ---------- the bandstand (04 6.1 row bandstand; 06 4): the owner's pick 3B, a Belle Époque kiosque a musique ---------- */
export type BandstandSpec = {
  r: number; base: number; postR: number; posts: number; eaveR: number; eave: number; roof: number; lantR: number; lantern: number;
  apex: number; entrance: number; stone: HexKey; trim: HexKey; iron: HexKey; zinc: HexKey; glass: HexKey; gilt: HexKey;
};
/** The bandstand's numbers (EH heights, tile radii; the entrance is an octagon face, 2 = south) and palette keys (register section 4,
 *  pick 3B, 2026-10-13: the tall panelled base, lacework arches, lambrequin, concave roof and glazed lantern of the owner's options page). */
export const BANDSTAND: BandstandSpec = {
  r: 1.36, base: 0.44, postR: 1.2, posts: 1.5, eaveR: 1.52, eave: 1.58, roof: 2.34, lantR: 0.25, lantern: 2.54, apex: 2.8, entrance: 2,
  stone: 'stone', trim: 'paper', iron: 'ink', zinc: 'zinc', glass: 'sky', gilt: 'lamp',
};

/**
 * A bandstand whose north-west tile is (x, y) (3 x 3), Belle Époque (pick 3B): a tall octagonal stone base with moulded panels and three
 * steps at the entrance, a cream cornice, a cast-iron balustrade, eight slender columns with lacework arches between them, a pointed
 * lambrequin under the eave, a concave zinc roof sweeping up to a glazed lantern (lamp-lit at night) and a gilt finial. part 1 is the back
 * (base, steps, the rails, columns and arches behind the centre), part 2 the front (the near ones, lambrequin and roof), 0 both, so a
 * busker on the platform paints between them (03 7.2).
 */
export function drawBandstand(pen: Pen, proj: Proj, x: number, y: number, part: 0 | 1 | 2 = 0): void {
  const { ctx, z } = pen, P = pen.spec.palette, B = BANDSTAND, cx = x + 1, cy = y + 1, cd = depthOf(cx, cy);
  const iron = mix(P[B.iron], P.zinc, 0.1), posts = ngon(cx, cy, B.postR, B.base, 8), w = Math.max(0.6, 0.55 * z);
  const nearPost = (i: number): boolean => depthOf(nth(posts, i)[0], nth(posts, i)[1]) > cd;
  const nearSeg = (i: number): boolean => {
    const a = nth(posts, i), b = nth(posts, i + 1);
    return depthOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) > cd;
  };
  const rings = (pts: readonly W3[], rr: number, h: number): void => {
    for (const q of pts) {
      const c = proj(...q), r = rr * TW * z;
      ctx.moveTo(c.x + r, c.y);
      ctx.ellipse(c.x, c.y, r, r * h, 0, 0, TAU);
    }
  };
  const rails = (near: boolean): void => {
    for (let i = 0; i < 8; i++) {
      if (i === B.entrance || nearSeg(i) !== near) continue;
      const a = nth(posts, i), b = nth(posts, i + 1);
      for (const e of [B.base + 0.34, B.base + 0.05]) strokeLine(pen, [proj(a[0], a[1], e), proj(b[0], b[1], e)], iron, w, { light: 0.92 });
      if (z < 1.0) continue;
      ctx.strokeStyle = shade(iron, near ? 0.95 : 0.85);
      ctx.lineWidth = Math.max(0.5, 0.35 * z);
      ctx.beginPath();
      for (let k = 1; k < 10; k++) {
        const q = lerp3(a, b, k / 10), p0 = proj(q[0], q[1], B.base + 0.05), p1 = proj(q[0], q[1], B.base + 0.34);
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
      }
      if (z >= 1.4) rings([0, 1, 2, 3, 4].map((k) => lerp3(a, b, (k + 0.5) / 5, B.base + 0.2)), 0.035, 1);
      ctx.stroke();
    }
  };
  const lace = (near: boolean): void => {
    const L = near ? 0.95 : 0.85;
    for (let i = 0; i < 8; i++) {
      if (nearSeg(i) !== near) continue;
      const a = nth(posts, i), b = nth(posts, i + 1), arch: Pt[] = [], arch2: Pt[] = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, q = lerp3(a, b, t), s = Math.pow(Math.sin(Math.PI * t), 0.7);
        arch.push(proj(q[0], q[1], B.posts - 0.26 + 0.22 * s));
        arch2.push(proj(q[0], q[1], B.posts - 0.18 + 0.14 * s));
      }
      strokeLine(pen, arch, iron, w * 0.85, { light: L });
      strokeLine(pen, [proj(a[0], a[1], B.posts), proj(b[0], b[1], B.posts)], iron, w, { light: L });
      if (z < 1.0) continue;
      strokeLine(pen, arch2, iron, w * 0.5, { light: L });
      ctx.strokeStyle = shade(iron, L);
      ctx.lineWidth = Math.max(0.5, 0.35 * z);
      ctx.beginPath();
      rings([lerp3(a, b, 0.1, B.posts - 0.08), lerp3(a, b, 0.9, B.posts - 0.08)], 0.045, 0.9);
      ctx.stroke();
    }
  };
  const columns = (near: boolean): void => {
    const pw = Math.max(0.8, 0.042 * TW * z);
    for (let i = 0; i < 8; i++) {
      if (nearPost(i) !== near) continue;
      const q = nth(posts, i), c = proj(q[0], q[1], B.posts - 0.02);
      strokeLine(pen, [proj(q[0], q[1], B.base), proj(q[0], q[1], B.posts)], iron, pw, { light: near ? 1.0 : 0.88 });
      fillEllipse(pen, c.x, c.y, pw * 1.2, pw * 0.8, iron, { light: 1.0 });
    }
  };
  if (part !== 2) {
    const ea = (B.entrance / 8) * TAU, ux = Math.cos(ea), uy = Math.sin(ea), front = faceVis(ux, uy);
    const steps = (): void => {
      for (const k of front ? [0, 1, 2] : [2, 1, 0])
        box(pen, proj, cx + ux * (B.r + 0.08 + 0.16 * k), cy + uy * (B.r + 0.08 + 0.16 * k), 0.08, 0.44, ea, 0, (B.base * (3 - k)) / 4, P[B.stone], 1.05);
    };
    if (!front) steps();
    frustum(pen, proj, cx, cy, B.r, 0, B.r, B.base - 0.06, P[B.stone]);
    if (z >= 0.8) {
      const r0 = ngon(cx, cy, B.r + 0.002, 0, 8);
      for (let i = 0; i < 8; i++) {
        if (!visF(i) || i === B.entrance) continue;
        const a = nth(r0, i), b = nth(r0, i + 1);
        fillPoly(pen, quad(proj, lerp3(a, b, 0.16, 0.07), lerp3(a, b, 0.84, 0.07), lerp3(a, b, 0.84, B.base - 0.13), lerp3(a, b, 0.16, B.base - 0.13)), P[B.stone], { light: faceL(i) * 0.9 });
      }
    }
    frustum(pen, proj, cx, cy, B.r + 0.06, B.base - 0.06, B.r + 0.06, B.base, mix(P[B.stone], P[B.trim], 0.45), { cap: 1.0 });
    if (front) steps();
    rails(false);
    columns(false);
    lace(false);
  }
  if (part !== 1) {
    rails(true);
    columns(true);
    lace(true);
    // the lambrequin: each eave face the viewer sees, its lower edge in pointed teeth
    const top = ngon(cx, cy, B.eaveR, B.eave, 8);
    for (let i = 0; i < 8; i++) {
      if (!frustumVis(i, B.eaveR, 0, B.eaveR, 1)) continue;
      const a = nth(top, i), b = nth(top, i + 1), pts: Pt[] = [proj(...a), proj(...b)];
      for (let q = 8; q >= 0; q--) pts.push(proj(...lerp3(a, b, q / 8, B.eave - (q % 2 ? 0.14 : 0.04))));
      fillPoly(pen, pts, P[B.trim], { light: faceL(i) });
    }
    // the concave roof: eight bands from the eave up to the lantern, steep at the top
    const prof: [number, number][] = [];
    for (let k = 0; k <= 8; k++) prof.push([B.lantR + 0.04 + (B.eaveR + 0.02 - B.lantR) * Math.pow(1 - k / 8, 2.6), B.eave + (B.roof - B.eave) * (k / 8)]);
    for (let k = 0; k < 8; k++) frustum(pen, proj, cx, cy, nth(prof, k)[0], nth(prof, k)[1], nth(prof, k + 1)[0], nth(prof, k + 1)[1], P[B.zinc]);
    ribs(pen, proj, cx, cy, prof, P[B.zinc]);
    frustum(pen, proj, cx, cy, B.lantR, B.roof, B.lantR, B.lantern, P[B.trim], { light: 1.0 });
    if (z >= 1.0) {
      const lr = ngon(cx, cy, B.lantR + 0.004, 0, 8), lit = lampGlow() > 0.5;
      for (let i = 0; i < 8; i++) {
        if (!visF(i)) continue;
        const a = nth(lr, i), b = nth(lr, i + 1);
        fillPoly(pen, quad(proj, lerp3(a, b, 0.25, B.roof + 0.05), lerp3(a, b, 0.75, B.roof + 0.05), lerp3(a, b, 0.75, B.lantern - 0.05), lerp3(a, b, 0.25, B.lantern - 0.05)), lit ? P.lamp : P[B.glass], { light: faceL(i) * 0.9 });
      }
    }
    frustum(pen, proj, cx, cy, B.lantR + 0.07, B.lantern, 0, B.apex, P[B.zinc]);
    finial(pen, proj, cx, cy, B.apex, P[B.gilt], 0.14);
  }
}

/* ---------- the picnic blanket (04 6.1 row picnic; 06 4: also the c_picnic basket prop) ---------- */
export type PicnicSpec = { inset: number; checks: number; tilt: number; a: HexKey; b: HexKey; basket: HexKey; plate: HexKey };
/** The blanket's numbers: inset 0.12 tile inside its 2 x 2, 4 x 4 checks, turned up to +-0.175 rad by its tile (h01), and palette keys. */
export const PICNIC: PicnicSpec = { inset: 0.12, checks: 4, tilt: 0.35, a: 'awningRed', b: 'paper', basket: 'wicker', plate: 'paper' };

/** A picnic on the 2 x 2 whose north-west tile is (x, y): a red and white gingham blanket, two plates and a wicker basket with its handle. */
export function drawPicnic(pen: Pen, proj: Proj, x: number, y: number): void {
  const P = pen.spec.palette, K = PICNIC, cx = x + 0.5, cy = y + 0.5, half = 1 - K.inset;
  const th = (h01(x, y, 5) - 0.5) * K.tilt, c = Math.cos(th), s = Math.sin(th);
  const W = (u: number, v: number, e: number): W3 => [cx + u * c - v * s, cy + u * s + v * c, e];
  fillPoly(pen, quad(proj, W(-half, -half, 0.01), W(half, -half, 0.01), W(half, half, 0.01), W(-half, half, 0.01)), P[K.b], { light: 1.0 });
  const st = (2 * half) / K.checks;
  for (let i = 0; i < K.checks; i++)
    for (let j = 0; j < K.checks; j++) {
      const bi = i % 2 === 0, bj = j % 2 === 0;
      if (!bi && !bj) continue;
      const u0 = -half + i * st, v0 = -half + j * st;
      fillPoly(pen, quad(proj, W(u0, v0, 0.012), W(u0 + st, v0, 0.012), W(u0 + st, v0 + st, 0.012), W(u0, v0 + st, 0.012)), P[K.a], { alpha: bi && bj ? 0.9 : 0.5 });
    }
  for (const [u, v] of [[-0.38, 0.28], [0.06, 0.46]] as const) {
    const q = W(u, v, 0.015);
    fillPoly(pen, ring(proj, q[0], q[1], 0.13, 0.015, 14), P[K.plate], { light: 1.04 });
    fillPoly(pen, ring(proj, q[0], q[1], 0.08, 0.016, 12), P[K.plate], { light: 0.94 });
  }
  const bc = W(0.36, -0.3, 0), hb = 0.17, he = 0.17;
  box(pen, proj, bc[0], bc[1], hb, 0.12, th, 0.01, he, P[K.basket], 1.1);
  const handle: Pt[] = [];
  for (let k = 0; k <= 8; k++) {
    const u = -hb * 0.8 + (1.6 * hb * k) / 8;
    handle.push(proj(bc[0] + u * c, bc[1] + u * s, he + 0.15 * Math.sin((Math.PI * k) / 8)));
  }
  strokeLine(pen, handle, P[K.basket], Math.max(0.8, 0.9 * pen.z), { light: 0.8 });
}

/* ---------- the bridge (04 6.1 row bridge; 06 4; 02 8.3 the crossing): the owner's pick 5C, an iron lattice footbridge ---------- */
export type BridgeSpec = {
  hw: number; land: number; end: number; rise: number; arch: number; rail: number; post: number; plank: number;
  deck: HexKey; deckK: number; iron: HexKey; dusk: HexKey;
};
/** The bridge's numbers: deck half-width 0.34 tile, 0.35 tile onto each bank, 0.05 EH at the banks rising 0.2 to the middle (a gentle
 *  camber), the girder's arch 0.07 EH, lattice railings 0.3 EH with posts every 0.33 tile, planks 0.14 tile; palette keys (pick 5C). */
export const BRIDGE: BridgeSpec = {
  hw: 0.34, land: 0.35, end: 0.05, rise: 0.2, arch: 0.07, rail: 0.3, post: 0.33, plank: 0.14, deck: 'bedEarth', deckK: 0.3, iron: 'ink', dusk: 'night',
};

/**
 * A footbridge over its 1 to 4 water tiles (Prop.data.span; data.dir 0 north to south, 1 west to east), iron lattice (pick 5C, register
 * section 4, 2026-10-13): a pale plank deck on a gentle camber; on each side a light iron girder, its top chord under the deck edge and
 * its bottom chord on a slim arch from bank to bank, joined by a diagonal lattice web, the water dusky under it; lattice railings of two
 * crossing diagonals between posts; wet darkens the deck to x 0.86 (04 6.1). part 1 is the deck and the far railing, part 2 the near
 * girder and railing, 0 both: walkers on the deck paint between them (03 7.2).
 */
export function drawBridge(pen: Pen, proj: Proj, p: Prop, part: 0 | 1 | 2 = 0, wet = 0): void {
  const { ctx, z } = pen, P = pen.spec.palette, B = BRIDGE, wk = 1 - 0.14 * wet;
  const dir = p.data.dir ?? (p.w > p.h ? 1 : 0), span = p.data.span ?? Math.max(p.w, p.h);
  const L = span + 2 * B.land, u0 = (dir === 0 ? p.y : p.x) - 0.5 - B.land;
  const W = (u: number, v: number, e: number): W3 => (dir === 0 ? [p.x + v, u0 + u, e] : [u0 + u, p.y + v, e]);
  const deckE = (u: number): number => B.end + B.rise * Math.pow(Math.sin(Math.PI * clamp01(u / L)), 0.6);
  const w0 = B.land - 0.05, w1 = L - w0;
  const archE = (u: number): number => (u <= w0 || u >= w1 ? 0 : B.arch * Math.pow(Math.sin((Math.PI * (u - w0)) / (w1 - w0)), 0.7));
  const sa = W(L / 2, B.hw, 0), sb = W(L / 2, -B.hw, 0);
  const nearV = depthOf(sa[0], sa[1]) >= depthOf(sb[0], sb[1]) ? B.hw : -B.hw;
  const FL = faceLight(dir === 0 ? Math.sign(nearV) : 0, dir === 0 ? 0 : Math.sign(nearV));
  const n = Math.max(10, Math.round(L * 8)), us: number[] = [];
  for (let i = 0; i <= n; i++) us.push((L * i) / n);
  const iron = mix(P[B.iron], P.zinc, 0.1), lw = Math.max(0.6, 0.55 * z), deckHex = mix(P[B.deck], P.paper, B.deckK);
  const railing = (v: number): void => {
    const vv = v - Math.sign(v) * 0.04, H = B.rail, np = Math.max(2, Math.round((L - 0.16) / B.post));
    const uk = (k: number): number => 0.08 + ((L - 0.16) * k) / np;
    if (z >= 1.0)
      for (let k = 0; k < np; k++) {
        // the lattice panel between two posts: two crossing diagonals
        const a = uk(k), b = uk(k + 1), ea = deckE(a), eb = deckE(b);
        strokeLine(pen, [proj(...W(a, vv, ea + 0.02)), proj(...W(b, vv, eb + H - 0.04))], iron, lw * 0.6, { light: 0.85 });
        strokeLine(pen, [proj(...W(a, vv, ea + H - 0.04)), proj(...W(b, vv, eb + 0.02))], iron, lw * 0.6, { light: 0.85 });
      }
    strokeLine(pen, us.map((u) => proj(...W(u, vv, deckE(u) + H))), iron, lw, { light: 0.95 });
    strokeLine(pen, us.map((u) => proj(...W(u, vv, deckE(u) + 0.04))), iron, lw * 0.8, { light: 0.9 });
    for (let k = 0; k <= np; k++) {
      const u = uk(k), e = deckE(u);
      strokeLine(pen, [proj(...W(u, vv, e)), proj(...W(u, vv, e + H))], iron, (k === 0 || k === np ? 1.7 : 1.0) * lw, { light: 0.9 });
    }
  };
  if (part !== 2) {
    if (z < 0.8) {
      const deck = [...us.map((u) => proj(...W(u, -B.hw, deckE(u)))), ...backward(us).map((u) => proj(...W(u, B.hw, deckE(u))))];
      fillPoly(pen, deck, deckHex, { light: wk });
    } else
      for (let u = 0, k = 0; u < L - 0.01; u += B.plank, k++) {
        const a = u, b = Math.min(L, u + B.plank - 0.02);
        fillPoly(pen, quad(proj, W(a, -B.hw, deckE(a)), W(b, -B.hw, deckE(b)), W(b, B.hw, deckE(b)), W(a, B.hw, deckE(a))), deckHex, { light: (0.94 + 0.1 * h01(p.id, k, 3)) * wk });
      }
    railing(-nearV);
  }
  if (part !== 1) {
    // the near girder: the water dusky under its arch, the lattice web, the bottom chord on the arch, the top chord under the deck edge
    const under: Pt[] = [];
    for (const u of us) if (u >= w0 && u <= w1) under.push(proj(...W(u, nearV, archE(u))));
    under.push(proj(...W(w1, nearV, 0)), proj(...W(w0, nearV, 0)));
    fillPoly(pen, under, P[B.dusk], { alpha: 0.28 });
    const m = Math.max(6, Math.round((w1 - w0) / 0.13));
    ctx.strokeStyle = shade(iron, FL * 0.95);
    ctx.lineWidth = Math.max(0.5, (z >= 1.0 ? 0.45 : 0.6) * z);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k < m; k++) {
      const a = w0 + ((w1 - w0) * k) / m, b = w0 + ((w1 - w0) * (k + 1)) / m;
      const pa = proj(...W(a, nearV, archE(a))), pb = proj(...W(b, nearV, archE(b)));
      const qa = proj(...W(a, nearV, deckE(a) - 0.04)), qb = proj(...W(b, nearV, deckE(b) - 0.04));
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(qb.x, qb.y);
      ctx.moveTo(qa.x, qa.y);
      ctx.lineTo(pb.x, pb.y);
    }
    ctx.stroke();
    strokeLine(pen, us.filter((u) => u >= w0 && u <= w1).map((u) => proj(...W(u, nearV, archE(u)))), iron, lw * 1.5, { light: FL });
    strokeLine(pen, us.map((u) => proj(...W(u, nearV, deckE(u) - 0.035))), iron, lw * 1.6, { light: FL });
    railing(nearV);
  }
}
