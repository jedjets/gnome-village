// src/world/water.ts
// Static water bodies: pond and canal tile sets, connected-component size, the bridge crossing search, winter ice timing (03 2.4).
// NEW (not GV waterStep; no water simulation, no flow, one depth). Idea only: the BFS with a preallocated queue of GV markSea 642 for the
// components, and the straight-crossing search reduced from findSpan 2883 for findCrossing.
import type { XY } from '../core/math.ts';
import { W } from '../core/weather.ts';
import { I, ICE, inB, KIND, Kind, N, NC, worldVersion } from './grid.ts';

function isWater(x: number, y: number): boolean {
  if (!inB(x, y)) return false;
  const k = KIND[I(x, y)];
  return k === Kind.pond || k === Kind.canal;
}

/* ---------- bodies ---------- */

/** A 4-connected set of pond and canal tiles; `tiles` are tile indices in ascending order. */
export type Body = { id: number; kind: 'pond' | 'canal' | 'mixed'; tiles: number[]; size: number };

let bodies: Body[] = [];
const bodyIndex = new Int16Array(NC); // body id of each tile, 0 for none
let bodiesAt = -1;
const queue = new Int16Array(NC);

function rebuildBodies(): void {
  bodies = [];
  bodyIndex.fill(0);
  for (let s = 0; s < NC; s++) {
    if (bodyIndex[s] !== 0 || !isWater(s % N, (s / N) | 0)) continue;
    const id = bodies.length + 1;
    const tiles: number[] = [];
    let head = 0, tail = 0, ponds = 0;
    queue[tail++] = s;
    bodyIndex[s] = id;
    while (head < tail) {
      const i = queue[head++] as number;
      tiles.push(i);
      if (KIND[i] === Kind.pond) ponds++;
      const x = i % N, y = (i / N) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (!isWater(nx, ny)) continue;
        const j = ny * N + nx;
        if (bodyIndex[j] !== 0) continue;
        bodyIndex[j] = id;
        queue[tail++] = j;
      }
    }
    tiles.sort((a, b) => a - b);
    bodies.push({ id, kind: ponds === tiles.length ? 'pond' : ponds === 0 ? 'canal' : 'mixed', tiles, size: tiles.length });
  }
  bodiesAt = worldVersion();
}

function fresh(): void {
  if (bodiesAt !== worldVersion()) rebuildBodies();
}

/** Every body, by lowest tile index; rebuilt only after KIND, OCC or the props changed. */
export function waterBodies(): readonly Body[] {
  fresh();
  return bodies;
}

export function bodyAt(x: number, y: number): Body | null {
  fresh();
  if (!inB(x, y)) return null;
  const id = bodyIndex[I(x, y)] as number;
  return id === 0 ? null : (bodies[id - 1] as Body);
}

/* ---------- the bridge crossing (02 8.3) ---------- */

export const BRIDGE_MAX = 4;

/** The span of a bridge: `dir` 0 runs north-south, 1 east-west; (x, y) is its first (north-west) water tile; `tiles` are the water tiles in order. */
export type Crossing = { dir: 0 | 1; x: number; y: number; span: number; tiles: XY[] };

function across(x: number, y: number, dir: 0 | 1): Crossing | null {
  const dx = dir === 1 ? 1 : 0, dy = dir === 0 ? 1 : 0;
  let lo = 0, hi = 0;
  while (isWater(x + dx * (lo - 1), y + dy * (lo - 1))) lo--;
  while (isWater(x + dx * (hi + 1), y + dy * (hi + 1))) hi++;
  const span = hi - lo + 1;
  if (span > BRIDGE_MAX) return null;
  // land at both ends: the tiles beyond the run must be inside the park and not water
  if (!inB(x + dx * (lo - 1), y + dy * (lo - 1)) || !inB(x + dx * (hi + 1), y + dy * (hi + 1))) return null;
  const tiles: XY[] = [];
  for (let k = lo; k <= hi; k++) tiles.push({ x: x + dx * k, y: y + dy * k });
  return { dir, x: x + dx * lo, y: y + dy * lo, span, tiles };
}

/** The shortest straight north-south or east-west crossing through a water tile with land at both ends and at most 4 water tiles; ties go north-south. */
export function findCrossing(x: number, y: number): Crossing | null {
  if (!isWater(x, y)) return null;
  const ns = across(x, y, 0), ew = across(x, y, 1);
  if (ns && ew) return ew.span < ns.span ? ew : ns;
  return ns ?? ew;
}

/* ---------- winter ice (02 3.3 snow row) ---------- */

export const ICE_ON_T = 60; // sim seconds of snow above 0.3 before the water freezes
export const ICE_OFF_T = 120; // sim seconds without it before it thaws
export const SNOW_MIN = 0.3;
const EPS = 1e-6; // a sum of 1/60 steps lands a hair under a whole second

export type IceState = { on: 0 | 1; snowT: number; dryT: number };
const ice: IceState = { on: 0, snowT: 0, dryT: 0 };

/** Write the ICE layer from `ice.on`: 1 on every pond and canal tile while frozen, else 0. Tools call it after painting water in winter. */
export function syncIce(): void {
  for (let i = 0; i < NC; i++) {
    const k = KIND[i];
    ICE[i] = ice.on === 1 && (k === Kind.pond || k === Kind.canal) ? 1 : 0;
  }
}

/** Phase 4 of a step: count snow and dry seconds on the global weather and flip the ice at 60 and 120. */
export function stepIce(dt: number): void {
  if (W.snow > SNOW_MIN) {
    ice.snowT += dt;
    ice.dryT = 0;
    if (ice.on === 0 && ice.snowT >= ICE_ON_T - EPS) {
      ice.on = 1;
      syncIce();
    }
  } else {
    ice.dryT += dt;
    ice.snowT = 0;
    if (ice.on === 1 && ice.dryT >= ICE_OFF_T - EPS) {
      ice.on = 0;
      syncIce();
    }
  }
}

export function resetIce(): void {
  ice.on = 0;
  ice.snowT = 0;
  ice.dryT = 0;
}
export function iceState(): IceState {
  return { ...ice };
}
export function setIceState(s: IceState): void {
  ice.on = s.on;
  ice.snowT = s.snowT;
  ice.dryT = s.dryT;
}
