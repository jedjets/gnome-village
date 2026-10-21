// tests/astar.test.ts
// Locks 02 5.5 (8-connected A*, octile heuristic, node budget 2600, partial path, the costs, no corner cutting, the outside tiles) and
// 02 2.4 "Done when" / 07 S4.7 item 4 / 08 2.3 astar.test.ts rows. GV 1412-1507 is the port (findPath, stepCost reduced, cornerOK).
import { describe, it, expect, beforeEach } from 'vitest';
import { newPark } from '../src/core/loop.ts';
import { mulberry32, rngN } from '../src/core/rng.ts';
import { resetIds } from '../src/core/ids.ts';
import type { XY } from '../src/core/math.ts';
import { BLOCK, I, KIND, Kind, N, OCC, addProp, clearLayers, inB, markBlockDirty, propById, props, rebuildBlock, removeProp } from '../src/world/grid.ts';
import { GATES } from '../src/world/park.ts';
import {
  ASTAR_NODES, BRIDGE_COST, DIAG, H_SCALE, PFSTAT, STEP_COST, findPath, pathCost, stepCost, walkable,
} from '../src/entities/astar.ts';

const open = (x: number, y: number): boolean => inB(x, y) && BLOCK[I(x, y)] === 0;

/** Every rule a path must keep (02 5.5): in the park, never on a blocked tile, no diagonal past a blocked corner. */
function checkPath(from: XY, path: readonly XY[]): void {
  let px = Math.round(from.x), py = Math.round(from.y);
  for (const p of path) {
    expect(open(p.x, p.y), `tile ${p.x},${p.y}`).toBe(true);
    const k = KIND[I(p.x, p.y)];
    expect(k, `kind at ${p.x},${p.y}`).not.toBe(Kind.bed);
    if (k === Kind.pond || k === Kind.canal) expect(props.some((q) => q.kind === 'bridge' && p.x >= q.x && p.x < q.x + q.w && p.y >= q.y && p.y < q.y + q.h)).toBe(true);
    const occ = OCC[I(p.x, p.y)] as number;
    if (occ !== 0) expect(propById(occ)?.passable).toBe(true);
    expect(Math.max(Math.abs(p.x - px), Math.abs(p.y - py))).toBe(1); // 8-connected steps
    if (p.x !== px && p.y !== py) {
      expect(open(p.x, py), `corner ${p.x},${py}`).toBe(true);
      expect(open(px, p.y), `corner ${px},${p.y}`).toBe(true);
    }
    px = p.x;
    py = p.y;
  }
}

/** An empty all-lawn park (no props). */
function bare(): void {
  clearLayers();
  resetIds();
  rebuildBlock();
}

function hedge(x: number, y: number): void {
  addProp({ kind: 'hedge', x, y, w: 1, h: 1, rot: 0, placedBy: 'player' });
}

beforeEach(() => {
  newPark(101);
});

describe('costs (02 5.5: lawn 1.0, gravel 0.75, flagstone 0.7, mulch 1.0, bridge 0.8; diagonals x 1.4142)', () => {
  it('a straight 10-tile run costs 10 on lawn, 7.5 on gravel, 7 on flagstone; the bridge tile 0.8', () => {
    expect(STEP_COST).toEqual({ lawn: 1.0, gravel: 0.75, flagstone: 0.7, mulch: 1.0 });
    bare();
    for (const [k, want] of [[Kind.lawn, 10], [Kind.gravel, 7.5], [Kind.flagstone, 7], [Kind.mulch, 10]] as const) {
      for (let x = 5; x <= 15; x++) KIND[I(x, 10)] = k;
      const r = findPath(5, 10, 15, 10);
      expect(r.partial).toBe(false);
      expect(r.path).toHaveLength(10);
      expect(r.path.every((p) => p.y === 10)).toBe(true);
      expect(pathCost({ x: 5, y: 10 }, r.path)).toBeCloseTo(want, 10);
    }
    newPark(101);
    expect(stepCost(I(34, 11))).toBe(BRIDGE_COST);
    expect(stepCost(I(34, 12))).toBe(0.8);
    expect(DIAG).toBe(1.4142);
  });
  it('gravel pulls a route off the lawn when it is cheaper (09 1.3 example)', () => {
    bare();
    for (let x = 5; x <= 15; x++) KIND[I(x, 11)] = Kind.gravel;
    const r = findPath(5, 10, 15, 10);
    expect(r.path.some((p) => p.x === 10 && p.y === 11)).toBe(true);
    expect(pathCost({ x: 5, y: 10 }, r.path)).toBeLessThan(10);
  });
  it('the heuristic is scaled to the cheapest step, so it never overestimates (09 6 item 1)', () => {
    expect(H_SCALE).toBe(Math.min(...Object.values(STEP_COST), BRIDGE_COST));
  });
});

describe('blocked tiles are never crossed (02 5.5; 07 S4.7 item 4; 08 2.3)', () => {
  it('200 seeded pairs on the starter park: no bed, pond, canal without a bridge, non-passable OCC tile or cut corner', () => {
    const r = mulberry32(4242);
    let full = 0;
    for (let k = 0; k < 200; k++) {
      const sx = (r() * N) | 0, sy = (r() * N) | 0, tx = (r() * N) | 0, ty = (r() * N) | 0;
      const res = findPath(sx, sy, tx, ty);
      checkPath({ x: sx, y: sy }, res.path);
      if (!res.partial) {
        full++;
        const last = res.path[res.path.length - 1];
        expect(last).toEqual({ x: tx, y: ty });
      }
      expect(PFSTAT.last).toBeLessThanOrEqual(ASTAR_NODES);
    }
    expect(full).toBeGreaterThan(100); // most random tiles are reachable lawn or path
  });
  it('never cuts a corner: a hedge beside a diagonal sends the walker round it', () => {
    bare();
    expect(findPath(5, 5, 6, 6).path).toEqual([{ x: 6, y: 6 }]);
    hedge(6, 5);
    rebuildBlock();
    const p = findPath(5, 5, 6, 6).path;
    expect(p).toEqual([{ x: 5, y: 6 }, { x: 6, y: 6 }]);
    hedge(5, 6);
    rebuildBlock();
    const q = findPath(5, 5, 6, 6);
    checkPath({ x: 5, y: 5 }, q.path);
    expect(q.path.length).toBeGreaterThan(2);
  });
  it('a bed, a pond, a canal and a tree are walls', () => {
    bare();
    KIND[I(10, 9)] = Kind.bed;
    KIND[I(10, 10)] = Kind.pond;
    KIND[I(10, 11)] = Kind.canal;
    addProp({ kind: 'tree', x: 10, y: 12, w: 1, h: 1, rot: 0, placedBy: 'player' });
    addProp({ kind: 'picnic', x: 10, y: 8, w: 1, h: 1, rot: 0, placedBy: 'player' }); // passable
    rebuildBlock();
    for (const y of [9, 10, 11, 12]) expect(walkable(10, y, {}), 'y ' + y).toBe(false);
    expect(walkable(10, 8, {})).toBe(true);
    const r = findPath(8, 10, 12, 10);
    checkPath({ x: 8, y: 10 }, r.path);
    expect(r.partial).toBe(false);
    expect(r.path.some((p) => p.x === 10 && p.y >= 9 && p.y <= 12)).toBe(false);
  });
});

describe('the bridge over the neck (02 2.5; 07 S4.7 item 4)', () => {
  it('a walk from the outer loop at (34, 9) to (34, 14) crosses on (34, 11) and (34, 12); without the bridge it goes round', () => {
    const r = findPath(34, 9, 34, 14);
    expect(r.partial).toBe(false);
    checkPath({ x: 34, y: 9 }, r.path);
    expect(r.path).toContainEqual({ x: 34, y: 11 });
    expect(r.path).toContainEqual({ x: 34, y: 12 });
    const over = pathCost({ x: 34, y: 9 }, r.path);
    const bridge = props.find((p) => p.kind === 'bridge');
    removeProp(bridge?.id ?? 0);
    rebuildBlock();
    const round = findPath(34, 9, 34, 14);
    expect(round.partial).toBe(false);
    checkPath({ x: 34, y: 9 }, round.path);
    expect(round.path.some((p) => KIND[I(p.x, p.y)] === Kind.pond)).toBe(false);
    expect(pathCost({ x: 34, y: 9 }, round.path)).toBeGreaterThan(over);
  });
});

describe('partial paths and the node budget (02 5.5; GV 1475, 1498, 1504)', () => {
  it('a target walled by hedges: a non-empty partial path to the closest reachable tile, at most 2600 nodes', () => {
    expect(ASTAR_NODES).toBe(2600);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) hedge(5 + dx, 5 + dy);
    rebuildBlock();
    const r = findPath(30, 30, 5, 5);
    expect(r.partial).toBe(true);
    expect(r.path.length).toBeGreaterThan(0);
    checkPath({ x: 30, y: 30 }, r.path);
    const last = r.path[r.path.length - 1] as XY;
    expect(Math.max(Math.abs(last.x - 5), Math.abs(last.y - 5))).toBe(2); // the ring just outside the hedges
    expect(Math.min(Math.abs(last.x - 5), Math.abs(last.y - 5))).toBe(0); // straight out from the target: the lowest estimate
    expect(PFSTAT.last).toBeGreaterThan(0);
    expect(PFSTAT.last).toBeLessThanOrEqual(2600);
  });
  it('the budget can run out on a reachable target: partial at 2600 nodes, so partial never proves a target unreachable', () => {
    bare();
    for (let x = 0; x < N - 1; x++) KIND[I(x, 24)] = Kind.bed; // a wall across the park, open only at x 47
    markBlockDirty();
    rebuildBlock();
    // a flood fill from (0, 47) reaches (0, 0) through the gap at (47, 24)
    const seen = new Uint8Array(N * N), queue = [I(0, 47)];
    seen[I(0, 47)] = 1;
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q] as number, cx = c % N, cy = (c / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const x = cx + dx, y = cy + dy;
        if (!open(x, y) || seen[I(x, y)]) continue;
        seen[I(x, y)] = 1;
        queue.push(I(x, y));
      }
    }
    expect(seen[I(0, 0)]).toBe(1);
    const r = findPath(0, 47, 0, 0);
    expect(PFSTAT.last).toBe(ASTAR_NODES);
    expect(r.partial).toBe(true);
    expect(r.path.length).toBeGreaterThan(40); // most of the way round: toward the gap, then back along the wall's far side
    checkPath({ x: 0, y: 47 }, r.path);
    const short = findPath(0, 40, 0, 8); // the same detour from nearer the wall fits the budget
    expect(short.partial).toBe(false);
    expect(short.path.at(-1)).toEqual({ x: 0, y: 8 });
  });
  it('the start is the target: one step onto it; A* never draws on the sim stream', () => {
    const n0 = rngN();
    expect(findPath(20, 20, 20, 20)).toEqual({ path: [{ x: 20, y: 20 }], partial: false });
    findPath(2, 2, 45, 45);
    expect(rngN()).toBe(n0);
  });
});

describe('the apron and the gates (02 2.4 "Done when", 02 5.5)', () => {
  it('a path to another gate\'s outside tile fails; to the walker\'s own gateOut it ends there, one step after the gate', () => {
    expect(findPath(20, 20, 12, 48, { gateIn: 'g_south_e', gateOut: null })).toEqual({ path: [], partial: true });
    const own = findPath(20, 20, 12, 48, { gateIn: 'g_south_e', gateOut: 'g_south_w' });
    expect(own.partial).toBe(false);
    expect(own.path.at(-1)).toEqual({ x: 12, y: 48 });
    expect(own.path.at(-2)).toEqual({ x: 12, y: 47 });
    expect(findPath(20, 20, 20, 48, { gateIn: 'g_south_w', gateOut: 'g_south_w' }).path).toEqual([]); // an apron tile that is no outside
  });
  it('from every gate\'s outside tile the first step is its gate tile, and no step is on any other apron tile', () => {
    for (const g of GATES) {
      const r = findPath(g.outside.x, g.outside.y, 23, 20, { gateIn: g.id });
      expect(r.partial, g.id).toBe(false);
      expect(r.path[0], g.id).toEqual(g.tiles[0]);
      expect(Math.max(Math.abs(g.outside.x - g.tiles[0].x), Math.abs(g.outside.y - g.tiles[0].y))).toBe(1);
      checkPath(g.tiles[0], r.path.slice(1));
      expect(walkable(g.outside.x, g.outside.y, { gateIn: g.id })).toBe(true);
      expect(walkable(g.outside.x, g.outside.y, {})).toBe(false);
    }
  });
  it('the boundary ring is walkable, the apron beyond it is not', () => {
    expect(walkable(0, 5, {})).toBe(true);
    expect(walkable(-1, 5, {})).toBe(false);
    const r = findPath(0, 2, 0, 20);
    expect(r.partial).toBe(false);
    expect(r.path.every((p) => inB(p.x, p.y))).toBe(true);
  });
});
