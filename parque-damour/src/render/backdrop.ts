// src/render/backdrop.ts
// The sky ramp with sun, moon, stars and clouds in the direction's manner (04 3.2 row Sky, 10.1), and the apron: pavement
// around the park, the river band and quay to the north, plain facade blocks east, south and west (register 3.1).
// Ported from GV 6480-6488 (SKYR, in ambient.ts), 6501-6507 (rampSky), 6535-6560 (paintSky: gradient, stars, sun and moon),
// 6953-7035 (the iso box kit idea: top and two visible faces, flat shaded). ADAPT: the sun arcs from left at f 0.25 to right at
// f 0.80 (03 7.4 item 1); clouds are flat 3-disc shapes in B and unpainted paper with an ink underline in C.
// TODO(S2): the offscreen sky canvas (260 ms), the skyline band, railings, gates, facade bays from props.ts (04 6.4); S9 night windows.
import { clamp01, css, hx, mixc, type RGB } from '../core/math.ts';
import { N } from '../world/grid.ts';
import { APRON, BACKDROP } from '../world/park.ts';
import { rotXY } from './camera.ts';
import { sxOf, syOf } from './project.ts';
import { depthOf, type Drawable } from './order.ts';
import { AT, AA, FOGA, GC, MOON, SUN, WHITE, fillPoly, h01, inkLine, lit, shade, skyRamp, style, type Pen, type Pt } from './ambient.ts';

/* ---------- the sky (04 4.2 tile 12; S2 paints the same into the offscreen backdrop) ---------- */

/** Paint the sky for day fraction `f` and `light` into the rectangle (x, y, w, h): ramp, stars, sun or moon, clouds. */
export function paintSkyBand(pen: Pen, f: number, light: number, x: number, y: number, w: number, h: number, cloud = 0.3): void {
  const { ctx, spec } = pen;
  const P = spec.palette;
  let [t, b] = skyRamp(spec, f);
  if (spec.id === 'C') {
    // C: the ramp is mostly paper; the night and golden colours stay as tints on it (04 3.2 row Sky)
    const paper = hx(P.paper);
    const k = 0.45 + 0.25 * light;
    t = mixc(t, paper, k * 0.8);
    b = mixc(b, paper, k);
  }
  const fog = hx(P.fog);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css(mixc(t, fog, FOGA * 0.5)));
  g.addColorStop(1, css(mixc(b, fog, FOGA * 0.55)));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // stars when the light is low (GV 6544-6551), fixed by hash so a screenshot repeats
  const na = clamp01(1 - light * 2.4);
  if (na > 0.02) {
    ctx.fillStyle = css(WHITE);
    for (let i = 0; i < 40; i++) {
      const sx = x + h01(i, 1) * w, sy = y + h01(i, 2) * h * 0.6, s = 0.6 + h01(i, 3) * 1.1;
      ctx.globalAlpha = na * (0.35 + 0.4 * h01(i, 4)) * (1 - cloud * 0.8);
      ctx.fillRect(sx, sy, s, s);
    }
    ctx.globalAlpha = 1;
  }
  // the sun on an arc from the left at f 0.25 to the right at f 0.80; the moon at night (03 7.4 item 1)
  const isSun = light > 0.16;
  const tt = clamp01((f - 0.25) / 0.55);
  const sx = isSun ? x + w * (0.12 + 0.76 * tt) : x + w * 0.78;
  const sy = isSun ? y + h * (0.95 - Math.sin(tt * Math.PI) * 0.75) : y + h * 0.28;
  const rr = (isSun ? 0.11 : 0.08) * h;
  const body = hx(isSun ? SUN : MOON);
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr * 4);
  glow.addColorStop(0, css(mixc(body, AT, AA), isSun ? 0.42 : 0.28));
  glow.addColorStop(1, css(WHITE, 0));
  ctx.globalAlpha = 1 - cloud * 0.55;
  ctx.fillStyle = glow;
  ctx.fillRect(sx - rr * 4, sy - rr * 4, rr * 8, rr * 8);
  ctx.globalAlpha = 1;
  if (spec.id === 'C') {
    // a sun left as paper inside an ink ring, a moon as an ink crescent
    ctx.fillStyle = css(mixc(body, hx(P.paper), 0.5));
    ctx.beginPath();
    ctx.arc(sx, sy, rr, 0, Math.PI * 2);
    ctx.fill();
    const ring: Pt[] = [];
    for (let i = 0; i < 16; i++) ring.push({ x: sx + Math.cos((i / 16) * Math.PI * 2) * rr, y: sy + Math.sin((i / 16) * Math.PI * 2) * rr });
    inkLine(pen, ring, { seed: 5, inkAlpha: 0.8 });
  } else {
    ctx.fillStyle = css(body);
    ctx.beginPath();
    ctx.arc(sx, sy, rr, 0, Math.PI * 2);
    ctx.fill();
    if (!isSun) {
      ctx.fillStyle = css(mixc(t, b, 0.3));
      ctx.beginPath();
      ctx.arc(sx + rr * 0.55, sy - rr * 0.35, rr * 0.86, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  drawClouds(pen, x, y, w, h, b, light, cloud);
}

/** Clouds in the direction's manner: soft in A (GV drawClouds idea), 3 flat discs in B, unpainted paper with an ink underline in C. */
function drawClouds(pen: Pen, x: number, y: number, w: number, h: number, bottom: RGB, light: number, cloud: number): void {
  const { ctx, spec } = pen;
  const P = spec.palette;
  const n = Math.round(2 + cloud * 4);
  for (let i = 0; i < n; i++) {
    const cx = x + w * (0.1 + 0.8 * h01(i + 20, 1)), cy = y + h * (0.18 + 0.4 * h01(i + 20, 2)), s = h * (0.12 + 0.12 * h01(i + 20, 3));
    const tone = mixc(mixc(hx(P.paper), bottom, 0.25), lit([255, 255, 255]), 0.1);
    const col = lit([tone[0] * (0.55 + 0.45 * light) + 60 * (1 - light), tone[1] * (0.55 + 0.45 * light) + 60 * (1 - light), tone[2] * (0.6 + 0.4 * light) + 70 * (1 - light)]);
    const lobes: Array<[number, number, number]> = [[-0.9, 0.1, 0.55], [0, -0.15, 0.75], [0.95, 0.12, 0.5]];
    if (spec.id === 'A') {
      ctx.fillStyle = css(col, 0.55 + 0.3 * h01(i + 20, 4));
      ctx.beginPath();
      for (const [lx, ly, lr] of lobes) {
        ctx.moveTo(cx + lx * s + lr * s, cy + ly * s);
        ctx.ellipse(cx + lx * s, cy + ly * s, lr * s * 1.3, lr * s * 0.7, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    } else if (spec.id === 'B') {
      ctx.fillStyle = css(col, 0.95);
      ctx.beginPath();
      for (const [lx, ly, lr] of lobes) {
        ctx.moveTo(cx + lx * s + lr * s, cy + ly * s);
        ctx.arc(cx + lx * s, cy + ly * s, lr * s, 0, Math.PI * 2);
      }
      ctx.rect(cx - 1.4 * s, cy + 0.05 * s, 2.8 * s, 0.45 * s);
      ctx.fill();
    } else {
      // C: the cloud is the paper itself; one ink line underlines it
      ctx.fillStyle = GC(P.paper, 0.9);
      ctx.beginPath();
      for (const [lx, ly, lr] of lobes) {
        ctx.moveTo(cx + lx * s + lr * s, cy + ly * s);
        ctx.ellipse(cx + lx * s, cy + ly * s, lr * s * 1.3, lr * s * 0.8, 0, 0, Math.PI * 2);
      }
      ctx.fill();
      inkLine(pen, [{ x: cx - 1.5 * s, y: cy + 0.5 * s }, { x: cx - 0.3 * s, y: cy + 0.62 * s }, { x: cx + 1.5 * s, y: cy + 0.5 * s }], { open: true, seed: i + 40, inkAlpha: 0.7 });
    }
  }
}

/* ---------- the apron (S0 shape, now through the palette) ---------- */
const LO = -APRON - 0.5; // outer edge of the apron in world units
const HI = N + APRON - 0.5;

/** Fill a world-space rectangle at height e as one projected quad. */
function fillWorldRect(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, e: number, col: string, k = 1): void {
  ctx.fillStyle = shade(col, k);
  ctx.beginPath();
  let first = true;
  for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as const) {
    const r = rotXY(x, y);
    const sx = sxOf(r.x, r.y), sy = syOf(r.x, r.y, e);
    if (first) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
    first = false;
  }
  ctx.closePath();
  ctx.fill();
}

/** Pavement under everything, then the river and the quay wall along the north edge (02 2.4 item 1; 04 6.4). */
export function apronGround(ctx: CanvasRenderingContext2D): void {
  const P = style().palette;
  fillWorldRect(ctx, LO, LO, HI, HI, 0, P.flagstone);
  fillWorldRect(ctx, LO, LO, HI, BACKDROP.riverFrom + 0.5, 0, P.water, 0.95);
  fillWorldRect(ctx, LO, BACKDROP.quayY - 0.5, HI, BACKDROP.quayY + 0.5, 0, P.stone, 0.9);
}

type Block = { x0: number; y0: number; x1: number; y1: number; h: number };
const BLOCKS: Block[] = [];
{
  // facades from 2 to 8 tiles beyond the boundary; one tile of pavement between railings and facades
  const f0 = BACKDROP.facadesFrom - 0.5; // 1.5 tiles beyond the boundary
  const heights = [2.2, 2.6, 2.0, 2.4, 2.3];
  let n = 0;
  const push = (x0: number, y0: number, x1: number, y1: number): void => {
    BLOCKS.push({ x0, y0, x1, y1, h: heights[n++ % heights.length] as number });
  };
  const SOUTH0 = N - 1 + f0; // 48.5
  for (let x = LO; x + 6 <= HI + 0.01; x += 7) push(x, SOUTH0, x + 6, HI); // south row
  for (let y = -0.5; y + 6 <= SOUTH0 - 1 + 0.01; y += 7) {
    push(LO, y, -f0, y + 6); // west column
    push(N - 1 + f0, y, HI, y + 6); // east column
  }
}

function drawBlock(d: Drawable, ctx: CanvasRenderingContext2D): void {
  const b = BLOCKS[d.id] as Block;
  const spec = style();
  const pen: Pen = { ctx, spec, z: 1 };
  const P = spec.palette;
  const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]] as const;
  const g: Pt[] = [], t: Pt[] = [];
  let near = 0;
  for (let k = 0; k < 4; k++) {
    const [x, y] = corners[k] as readonly [number, number];
    const r = rotXY(x, y);
    g[k] = { x: sxOf(r.x, r.y), y: syOf(r.x, r.y, 0) };
    t[k] = { x: (g[k] as Pt).x, y: syOf(r.x, r.y, b.h) };
    if ((g[k] as Pt).y > (g[near] as Pt).y) near = k;
  }
  const face = (i: number, j: number, away: boolean): void => {
    fillPoly(pen, [g[i] as Pt, g[j] as Pt, t[j] as Pt, t[i] as Pt], P.stone, { away, light: away ? 0.88 : 1, noInk: true });
  };
  const prev = (near + 3) % 4, next = (near + 1) % 4;
  // the two faces that meet at the nearest corner; the one on the left is in shade
  const leftIsPrev = (g[prev] as Pt).x < (g[next] as Pt).x;
  face(leftIsPrev ? prev : next, near, true);
  face(near, leftIsPrev ? next : prev, false);
  fillPoly(pen, t, P.zinc, { noInk: true });
}

const drawables: Drawable[] = BLOCKS.map((b, id) => ({
  depth: 0,
  kind: 'facade',
  id,
  x: (b.x0 + b.x1) / 2,
  y: (b.y0 + b.y1) / 2,
  z: 0,
  draw: drawBlock,
}));

/** The facade blocks as drawables with their depth for the current angle (max over the footprint corners). */
export function apronDrawables(): Drawable[] {
  for (const d of drawables) {
    const b = BLOCKS[d.id] as Block;
    d.depth = Math.max(depthOf(b.x0, b.y0), depthOf(b.x1, b.y0), depthOf(b.x1, b.y1), depthOf(b.x0, b.y1));
  }
  return drawables;
}
