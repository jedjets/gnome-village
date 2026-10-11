// src/render/order.ts
// Painter order for everything that stands on the flat ground: a counting sort into 1/64-tile depth buckets (03 7.2).
// Ported from GV 6359-6381 (orderBy counting sort). ADAPT: sorts a drawable list every frame (actors move), not the tile grid;
// ties inside a bucket paint the lower id first so a pair on one bench never flickers.
// TODO(S2): multi-tile props use the maximum footprint depth (GV frontKey ~9634).
import { N } from '../world/grid.ts';
import { APRON } from '../world/park.ts';
import { rotXY } from './camera.ts';

export type Drawable = {
  depth: number;
  kind: string;
  id: number;
  x: number;
  y: number;
  z: number;
  draw: (d: Drawable, ctx: CanvasRenderingContext2D) => void;
};

/** Depth of a ground point for the current angle: rx + ry (GV 6377). */
export function depthOf(x: number, y: number): number {
  const r = rotXY(x, y);
  return r.x + r.y;
}

const SPAN = 2 * (N + 2 * APRON) + 8; // tiles of depth the apron box can cover
const OFF = (2 * APRON + 4) * 64; // bucket offset so apron depths (negative) stay in range
const OB = new Int32Array(SPAN * 64 + OFF + 8);
let OK = new Int32Array(1024);
let tmp: Drawable[] = [];

/** Sort `items` in place by depth, stable, ties by id. */
export function sortByDepth(items: Drawable[]): void {
  const n = items.length;
  if (n < 2) return;
  if (OK.length < n) OK = new Int32Array(n * 2);
  if (tmp.length < n) tmp = Array.from({ length: n }, () => items[0] as Drawable);
  OB.fill(0);
  for (let i = 0; i < n; i++) {
    const d = items[i] as Drawable;
    const k = Math.max(0, Math.min(OB.length - 2, (d.depth * 64 + OFF) | 0));
    OK[i] = k;
    OB[k + 1] = (OB[k + 1] ?? 0) + 1;
  }
  for (let k = 1; k < OB.length; k++) OB[k] = (OB[k] ?? 0) + (OB[k - 1] ?? 0);
  for (let i = 0; i < n; i++) {
    const k = OK[i] as number;
    const pos = OB[k] as number;
    OB[k] = pos + 1;
    tmp[pos] = items[i] as Drawable;
  }
  for (let i = 0; i < n; i++) items[i] = tmp[i] as Drawable;
  // ties inside one bucket: lower id first (runs are tiny, an insertion pass is enough)
  for (let i = 1; i < n; i++) {
    const d = items[i] as Drawable;
    let j = i - 1;
    while (j >= 0) {
      const p = items[j] as Drawable;
      if (((p.depth * 64 + OFF) | 0) !== ((d.depth * 64 + OFF) | 0) || p.id <= d.id) break;
      items[j + 1] = p;
      j--;
    }
    items[j + 1] = d;
  }
}
