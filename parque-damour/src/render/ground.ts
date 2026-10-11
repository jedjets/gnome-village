// src/render/ground.ts
// The tile pass: 2304 flat diamonds coloured by KIND with a little grain, painted in index order with a bounding-box cull (03 7.2 item 1, 7.5).
// Ported from GV 6417-6422 (projectVerts) and 6665-6741 (groundCol, reduced to the kind rule). ADAPT: no slopes, no epoch cache yet.
// TODO(S2): TILE_COL epoch cache (GV 9449-9465), desire-path ribbons, lamp halos; TODO(S9): season lawn, puddles, ice, snow, petals.
import { css, type RGB, type XY } from '../core/math.ts';
import { lit, PAL } from './ambient.ts';
import { N, NC, KIND } from '../world/grid.ts';
import { TW, TH, rotInto, cam, view } from './camera.ts';
import { sxOf, syOf } from './project.ts';

const NV = N + 1;
const SVX = new Float32Array(NV * NV);
const SVY = new Float32Array(NV * NV);
const scratch: XY = { x: 0, y: 0 };

/** Tile grain: three brightness steps from a cheap hash of the index, fixed for the park's life. */
const GRAIN = new Uint8Array(NC);
for (let i = 0; i < NC; i++) {
  let h = Math.imul(i ^ 0x5bd1e995, 0x27d4eb2d);
  h ^= h >>> 15;
  GRAIN[i] = (h >>> 0) % 3;
}

const KIND_COL: RGB[] = [PAL.lawn, PAL.gravel, PAL.flagstone, PAL.bed, PAL.mulch, PAL.pond, PAL.canal];
const GRAIN_K = [0.965, 1, 1.03];
const colCache: string[] = Array.from({ length: KIND_COL.length * 3 }, () => '');

/** Base colour of tile i before the ambient light. */
export function groundCol(i: number): RGB {
  const base = KIND_COL[KIND[i] ?? 0] ?? PAL.lawn;
  const g = GRAIN_K[GRAIN[i] ?? 1] ?? 1;
  return [base[0] * g, base[1] * g, base[2] * g];
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

export function drawGround(ctx: CanvasRenderingContext2D): void {
  projectVerts();
  for (let k = 0; k < KIND_COL.length; k++)
    for (let g = 0; g < 3; g++) {
      const base = KIND_COL[k] as RGB;
      const m = GRAIN_K[g] as number;
      colCache[k * 3 + g] = css(lit([base[0] * m, base[1] * m, base[2] * m]));
    }
  const mx = TW * cam.z, my = TH * cam.z;
  const cw = view.cw, chh = view.chh;
  ctx.lineWidth = 0.8;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const a = y * NV + x, b = a + 1, c = a + NV + 1, d = a + NV;
      const cx = SVX[a] as number, cy = SVY[a] as number;
      if (cx < -mx || cx > cw + mx || cy < -my || cy > chh + my) continue;
      const i = y * N + x;
      const col = colCache[(KIND[i] ?? 0) * 3 + (GRAIN[i] ?? 1)] as string;
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
