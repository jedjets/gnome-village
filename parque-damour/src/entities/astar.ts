// src/entities/astar.ts
// 8-connected A* with preallocated typed scratch, octile heuristic, node budget 2600, partial path, no corner cutting (02 5.5, 03 2.5).
// Ported from GV 1412-1421 (PF_G, PF_F, PF_P, PF_S, PF_H, pfPush, pfPop), 1427-1450 (stepCost), 1452-1453 (PF_DX, PF_DY, PF_DD,
// PFSTAT), 1459-1465 (cornerOK), 1466-1507 (findPath).
// Verdict: PORT. Changes: stepCost is reduced to the costs of 02 5.5 (lawn 1.0, gravel 0.75, flagstone 0.7, mulch 1.0, a bridge over
// pond or canal 0.8; bed, pond and canal without a bridge and a non-passable OCC tile are blocked, which is grid.ts BLOCK); the heuristic
// is octile x 0.7, the cheapest step (flagstone), so it is admissible and a closed node never needs reopening (09 4 row 13, 09 6 item 1;
// GV 0.45 at 1472); the node budget is 2600 (GV 2600*S2 at 1475); the outer ring is searchable (GV skipped it at 1484; 09 6 item 4);
// a gate's `outside` apron tile is a node only for the walker's own gateIn or gateOut (02 5.5; every other apron tile is never one);
// the heap holds 8 x NC entries (GV NC: a node may be pushed once per neighbour, there is no decrease-key); the result is
// { path, partial } instead of an Array carrying a `partial` property (09 2.4 move.ts gotcha, GV 1504); PFSTAT counts calls and nodes
// only (entities read no wall clock, 03 P3). Diagonals cost x 1.4142 as GV 1452 and 09 2.4 (02 5.5 writes x 1.41).
// Dropped from the range: 1422-1426 (tileH, the climb and jump limits), 1430-1445 (bridge deck heights, ice, swimming, wading, rock,
// steps and slopes), 1448 (paving x 0.30), 1451 (PF_SWIM), 1454-1458 (PF_STRICT), 1462-1463 (the strict ledge and water corner tests),
// 1467 and 1505 (the wall-clock timing).
import type { XY } from '../core/math.ts';
import type { GateId } from '../core/ids.ts';
import { BLOCK, I, KIND, Kind, N, NC, inB, rebuildBlock } from '../world/grid.ts';
import { GATES, type Gate } from '../world/park.ts';

/** Expansions per call (06 1.4 ASTAR_NODES; GV 1475). */
export const ASTAR_NODES = 2600;
/** The cost of entering a tile, by KIND (02 5.5); bed, pond and canal are blocked unless a bridge opens them (BRIDGE_COST). */
export const STEP_COST: Readonly<Record<'lawn' | 'gravel' | 'flagstone' | 'mulch', number>> = { lawn: 1.0, gravel: 0.75, flagstone: 0.7, mulch: 1.0 };
export const BRIDGE_COST = 0.8;
/** The cheapest step: the heuristic's scale, so octile x H_SCALE never overestimates (09 6 item 1). */
export const H_SCALE = 0.7;
export const DIAG = 1.4142;

/** Who walks: a gate's outside tile is a node only for the walker whose gateIn or gateOut it is (02 5.5). */
export type PathWho = { gateIn?: GateId | null; gateOut?: GateId | null };
export type PathResult = { path: XY[]; partial: boolean };

/** Calls and expanded nodes since boot, and the nodes of the last call (GV PFSTAT 1453, without the wall-clock ms). */
export const PFSTAT = { calls: 0, nodes: 0, last: 0 };

const PF_G = new Float32Array(NC);
const PF_F = new Float32Array(NC);
const PF_P = new Int32Array(NC);
const PF_S = new Uint8Array(NC); // 0 unseen, 1 open, 2 closed
const PF_H = new Int32Array(NC * 8); // a binary heap of tile indices ordered by PF_F
let pfN = 0;

// The 8 neighbours in GV's order (PF_DX, PF_DY, PF_DD at 1452): E, W, S, N, SE, NE, SW, NW.
const PF_DX = [1, -1, 0, 0, 1, 1, -1, -1];
const PF_DY = [0, 0, 1, -1, 1, -1, 1, -1];
const PF_DD = [1, 1, 1, 1, DIAG, DIAG, DIAG, DIAG];

function pfPush(i: number): void {
  let k = pfN++;
  PF_H[k] = i;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if ((PF_F[PF_H[p] as number] as number) <= (PF_F[PF_H[k] as number] as number)) break;
    const t = PF_H[p] as number;
    PF_H[p] = PF_H[k] as number;
    PF_H[k] = t;
    k = p;
  }
}

function pfPop(): number {
  const top = PF_H[0] as number;
  const last = PF_H[--pfN] as number;
  if (pfN > 0) {
    PF_H[0] = last;
    let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1;
      let m = k;
      if (l < pfN && (PF_F[PF_H[l] as number] as number) < (PF_F[PF_H[m] as number] as number)) m = l;
      if (r < pfN && (PF_F[PF_H[r] as number] as number) < (PF_F[PF_H[m] as number] as number)) m = r;
      if (m === k) break;
      const t = PF_H[m] as number;
      PF_H[m] = PF_H[k] as number;
      PF_H[k] = t;
      k = m;
    }
  }
  return top;
}

/** The cost of stepping onto in-park tile `j` (02 5.5), Infinity when it is blocked. The caller has run rebuildBlock. */
export function stepCost(j: number): number {
  if (BLOCK[j] === 1) return Infinity;
  switch (KIND[j]) {
    case Kind.gravel:
      return STEP_COST.gravel;
    case Kind.flagstone:
      return STEP_COST.flagstone;
    case Kind.mulch:
      return STEP_COST.mulch;
    case Kind.pond:
    case Kind.canal:
      return BRIDGE_COST; // open water is BLOCK; an open water tile is a bridge
    case Kind.bed:
      return Infinity;
    default:
      return STEP_COST.lawn;
  }
}

/** A diagonal step brushes two corner tiles; neither may be blocked (GV cornerOK 1459, without the strict height and water tests). */
function cornerOK(c: number): boolean {
  return isFinite(stepCost(c));
}

/** The gate whose outside tile is (x, y), when `who` may use it (its gateIn or gateOut); else null. */
export function ownOutside(x: number, y: number, who: PathWho): Gate | null {
  for (const g of GATES) if (g.outside.x === x && g.outside.y === y) return g.id === who.gateIn || g.id === who.gateOut ? g : null;
  return null;
}

/** May `who` stand on tile (x, y)? In the park: not blocked. Off it: only its own gate's outside tile (02 5.5). */
export function walkable(x: number, y: number, who: PathWho): boolean {
  if (inB(x, y)) {
    rebuildBlock();
    return isFinite(stepCost(I(x, y)));
  }
  return ownOutside(x, y, who) !== null;
}

/** Octile distance to the target scaled to the cheapest step (admissible, 09 6 item 1). */
function hOf(x: number, y: number, tx: number, ty: number): number {
  const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
  return (Math.max(dx, dy) + (DIAG - 1) * Math.min(dx, dy)) * H_SCALE;
}

/** The search inside the park, from in-park tile s to in-park tile t (GV findPath 1466-1507). */
function search(sx: number, sy: number, tx: number, ty: number): PathResult {
  const s = I(sx, sy), t = I(tx, ty);
  if (s === t) return { path: [{ x: tx, y: ty }], partial: false };
  PF_S.fill(0);
  pfN = 0;
  PF_G[s] = 0;
  PF_F[s] = hOf(sx, sy, tx, ty);
  PF_P[s] = -1;
  pfPush(s);
  PF_S[s] = 1;
  let best = s, bestH = hOf(sx, sy, tx, ty), n = 0;
  while (pfN > 0 && n < ASTAR_NODES) {
    const cur = pfPop();
    n++;
    if (cur === t) {
      best = t;
      break;
    }
    if (PF_S[cur] === 2) continue;
    PF_S[cur] = 2;
    const cx = cur % N, cy = (cur / N) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = cx + (PF_DX[k] as number), ny = cy + (PF_DY[k] as number);
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx;
      if (PF_S[j] === 2) continue;
      if (k >= 4) {
        // no cutting corners round a bed, the water or a prop
        const a = cy * N + nx, b = ny * N + cx;
        if (!cornerOK(a) || !cornerOK(b)) continue;
      }
      const c = stepCost(j);
      if (!isFinite(c)) continue;
      const g = (PF_G[cur] as number) + c * (PF_DD[k] as number);
      if (PF_S[j] === 1 && g >= (PF_G[j] as number)) continue;
      PF_G[j] = g;
      PF_P[j] = cur;
      const h = hOf(nx, ny, tx, ty);
      PF_F[j] = g + h;
      PF_S[j] = 1;
      pfPush(j);
      if (h < bestH) {
        bestH = h;
        best = j;
      }
    }
  }
  const out: XY[] = [];
  for (let i = best; i !== -1 && i !== s; i = PF_P[i] as number) out.push({ x: i % N, y: (i / N) | 0 });
  out.reverse();
  PFSTAT.nodes += n;
  PFSTAT.last = n;
  return { path: out, partial: best !== t }; // the target was never reached: this is the way to the closest ground
}

/**
 * A path of tile centres from (sx, sy) to (tx, ty), the start excluded (GV findPath 1466). A start or target on the walker's own gate's
 * outside tile goes through that gate's first tile (one step to the gate, 02 2.4); any other target off the park is refused with an
 * empty partial path; any other start off the park is clamped into it (GV 1469). `partial` is true when the target was not reached: the
 * path then leads to the reachable tile closest to it (GV 1498, 1504). That covers two cases: the target is out of reach, or the
 * 2600-node budget ran out first (PFSTAT.last 2600) on a long detour to a reachable target, as GV's fixed budget does (02 5.5). Partial
 * therefore never proves a target unreachable: the walker replans from the path's end (move.ts moveStep) and gets there.
 */
export function findPath(sx: number, sy: number, tx: number, ty: number, who: PathWho = {}): PathResult {
  PFSTAT.calls++;
  PFSTAT.last = 0;
  rebuildBlock();
  sx = Math.round(sx);
  sy = Math.round(sy);
  tx = Math.round(tx);
  ty = Math.round(ty);
  if (sx === tx && sy === ty) return { path: [{ x: tx, y: ty }], partial: false };
  let head: XY | null = null;
  if (!inB(sx, sy)) {
    const g = ownOutside(sx, sy, who);
    if (g) {
      head = { x: g.tiles[0].x, y: g.tiles[0].y };
      sx = head.x;
      sy = head.y;
    } else {
      sx = Math.min(N - 1, Math.max(0, sx));
      sy = Math.min(N - 1, Math.max(0, sy));
    }
  }
  let tail: XY | null = null;
  if (!inB(tx, ty)) {
    const g = ownOutside(tx, ty, who);
    if (!g) return { path: [], partial: true };
    tail = { x: tx, y: ty };
    tx = g.tiles[0].x;
    ty = g.tiles[0].y;
  }
  const r: PathResult = sx === tx && sy === ty ? { path: [], partial: false } : search(sx, sy, tx, ty);
  if (head) r.path.unshift(head);
  if (tail && !r.partial) r.path.push(tail);
  return r;
}

/** The cost of walking `path` from `from` (each step priced as the search prices it): a test and a debug read (02 5.5 costs). */
export function pathCost(from: XY, path: readonly XY[]): number {
  rebuildBlock();
  let c = 0, px = Math.round(from.x), py = Math.round(from.y);
  for (const p of path) {
    const d = p.x !== px && p.y !== py ? DIAG : 1;
    c += (inB(p.x, p.y) ? stepCost(I(p.x, p.y)) : 1) * d;
    px = p.x;
    py = p.y;
  }
  return c;
}
