// src/render/backdrop.ts
// The apron: pavement around the park, the river band and quay to the north, plain facade blocks east, south and west (register 3.1).
// Ported from GV 6953-7035 (the iso box kit idea: top and two visible faces, flat shaded). ADAPT: boxes only, no roofs, no windows.
// TODO(S2): sky ramp with sun and moon (GV 6480-6618), skyline band, railings, gates, facade bays (04 6.4); S9 night windows.
import { css, type RGB } from '../core/math.ts';
import { lit, PAL } from './ambient.ts';
import { N } from '../world/grid.ts';
import { APRON, BACKDROP } from '../world/park.ts';
import { rotXY } from './camera.ts';
import { sxOf, syOf } from './project.ts';
import { depthOf, type Drawable } from './order.ts';

const LO = -APRON - 0.5; // outer edge of the apron in world units
const HI = N + APRON - 0.5;

/** Fill a world-space rectangle at height e as one projected quad. */
function fillWorldRect(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, e: number, col: RGB): void {
  ctx.fillStyle = css(lit(col));
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

/** Pavement under everything, then the river and the quay wall along the north edge (02 2.4 item 1). */
export function apronGround(ctx: CanvasRenderingContext2D): void {
  fillWorldRect(ctx, LO, LO, HI, HI, 0, PAL.pavement);
  fillWorldRect(ctx, LO, LO, HI, BACKDROP.riverFrom + 0.5, 0, PAL.river);
  fillWorldRect(ctx, LO, BACKDROP.quayY - 0.5, HI, BACKDROP.quayY + 0.5, 0, PAL.quay);
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
  const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]] as const;
  const gx: number[] = [], gy: number[] = [], tx: number[] = [], ty: number[] = [];
  let near = 0;
  for (let k = 0; k < 4; k++) {
    const [x, y] = corners[k] as readonly [number, number];
    const r = rotXY(x, y);
    gx[k] = sxOf(r.x, r.y);
    gy[k] = syOf(r.x, r.y, 0);
    tx[k] = gx[k] as number;
    ty[k] = syOf(r.x, r.y, b.h);
    if ((gy[k] as number) > (gy[near] as number)) near = k;
  }
  const face = (i: number, j: number, col: RGB): void => {
    ctx.fillStyle = css(lit(col));
    ctx.beginPath();
    ctx.moveTo(gx[i] as number, gy[i] as number);
    ctx.lineTo(gx[j] as number, gy[j] as number);
    ctx.lineTo(tx[j] as number, ty[j] as number);
    ctx.lineTo(tx[i] as number, ty[i] as number);
    ctx.closePath();
    ctx.fill();
  };
  const prev = (near + 3) % 4, next = (near + 1) % 4;
  // the two faces that meet at the nearest corner; the one on the left is in shade
  const leftIsPrev = (gx[prev] as number) < (gx[next] as number);
  face(leftIsPrev ? prev : next, near, PAL.facadeShade);
  face(near, leftIsPrev ? next : prev, PAL.facade);
  ctx.fillStyle = css(lit(PAL.roof));
  ctx.beginPath();
  ctx.moveTo(tx[0] as number, ty[0] as number);
  for (let k = 1; k < 4; k++) ctx.lineTo(tx[k] as number, ty[k] as number);
  ctx.closePath();
  ctx.fill();
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
