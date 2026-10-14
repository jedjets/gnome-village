// src/render/order.ts
// Painter order for everything that stands on the flat ground: a counting sort into 1/64-tile depth buckets, ties by lower id (03 7.2).
// Ported from GV 6365-6373 (OB, OK, orderBy) and 6376 (depth = rx + ry after rotXY).
// Verdict: PORT. Changes: sorts the drawable list every frame (actors move; GV sorted the tile grid on angle change only); the bucket
// range follows the frame's own depth range on the fixed 1/64-tile grid, so apron and far-bank depths below 0 sort too (GV offset one
// tile, 6370); inside a bucket the lower id paints first, so a pair on one bench never flickers (03 7.2 item 5); a multi-tile prop
// takes the largest depth of its footprint tiles (03 7.2 item 2; GV frontKey 9633-9648 idea).
// Dropped from the range: tileOrder over tiles and the coarse 2 x 2 lattice (6359-6364, 6374-6381; 03 7.2 item 4), ORDIDX.
import type { XY } from '../core/math.ts';
import { rotInto } from './camera.ts';

export type Drawable = {
  depth: number;
  kind: string;
  id: number;
  x: number;
  y: number;
  z: number;
  draw: (d: Drawable, ctx: CanvasRenderingContext2D) => void;
};

/** Buckets per tile of depth (GV 6370). */
export const DEPTH_BUCKETS = 64;
/** At most this many buckets in one sort (2048 tiles of depth); a wilder depth shares the end bucket. */
const MAX_BUCKETS = 2048 * DEPTH_BUCKETS;

const R0: XY = { x: 0, y: 0 };

/** Depth of a ground point for the current angle: rx + ry after the rotation (GV 6376). Allocates nothing. */
export function depthOf(x: number, y: number): number {
  rotInto(x, y, R0);
  return R0.x + R0.y;
}

/** Depth of a w x h footprint whose north-west tile is (x, y): the largest of its tiles' depths (03 7.2 item 2). */
export function footprintDepth(x: number, y: number, w: number, h: number): number {
  const x1 = x + Math.max(1, w) - 1, y1 = y + Math.max(1, h) - 1;
  return Math.max(depthOf(x, y), depthOf(x1, y), depthOf(x, y1), depthOf(x1, y1));
}

let OB = new Int32Array(160 * DEPTH_BUCKETS + 2); // bucket starts; grows to the widest frame seen
let OK = new Int32Array(1024); // each item's bucket
let SK = new Int32Array(1024); // bucket of each sorted slot
let tmp: Drawable[] = [];

/** Sort `items` in place, back to front: by 1/64-tile depth bucket, then lower id first; otherwise stable (GV orderBy 6368-6373). */
export function sortByDepth(items: Drawable[]): void {
  const n = items.length;
  if (n < 2) return;
  if (OK.length < n) {
    OK = new Int32Array(n * 2);
    SK = new Int32Array(n * 2);
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const d = (items[i] as Drawable).depth;
    if (!Number.isFinite(d)) continue;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  if (!(lo <= hi)) lo = hi = 0; // no finite depth at all
  const k0 = Math.floor(lo * DEPTH_BUCKETS);
  const nb = Math.min(MAX_BUCKETS, Math.floor(hi * DEPTH_BUCKETS) - k0 + 1);
  if (OB.length < nb + 1) OB = new Int32Array(nb + 1);
  OB.fill(0, 0, nb + 1);
  for (let i = 0; i < n; i++) {
    const d = (items[i] as Drawable).depth;
    // NaN and -Infinity go first, +Infinity and anything past the bucket cap last
    let k = d >= lo ? (d <= hi ? Math.floor(d * DEPTH_BUCKETS) - k0 : nb - 1) : 0;
    if (k > nb - 1) k = nb - 1;
    OK[i] = k;
    OB[k + 1] = (OB[k + 1] as number) + 1;
  }
  for (let k = 1; k <= nb; k++) OB[k] = (OB[k] as number) + (OB[k - 1] as number);
  if (tmp.length < n) tmp = Array.from({ length: n * 2 }, () => items[0] as Drawable);
  for (let i = 0; i < n; i++) {
    const k = OK[i] as number;
    const pos = OB[k] as number;
    OB[k] = pos + 1;
    tmp[pos] = items[i] as Drawable;
    SK[pos] = k;
  }
  // ties inside one bucket: lower id first (buckets hold a few items, so an insertion pass is enough)
  for (let i = 0; i < n; i++) {
    const d = tmp[i] as Drawable;
    const k = SK[i] as number;
    let j = i - 1;
    while (j >= 0 && SK[j] === k && (items[j] as Drawable).id > d.id) {
      items[j + 1] = items[j] as Drawable;
      j--;
    }
    items[j + 1] = d;
  }
}
