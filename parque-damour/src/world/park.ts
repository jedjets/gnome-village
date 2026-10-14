// src/world/park.ts
// Park bounds, the apron, the five gates and the backdrop specification in world coordinates (register 3.1, 02 2.4).
// Nothing ported: GV's island edges (642, 674) are replaced by fixed gates on a square boundary. NEW.
// BACKDROP says where the quay, river, boulevard, railings, street trees, street lamps, facade blocks and skyline sit, in world (tile)
// coordinates, and railPieces(), streetTrees(), streetLamps() and facadeBlocks() list the apron props it implies (03 3.6, 7.4 item 4).
// They are regenerated, never saved, never in OCC, and nothing in the simulation reads them (only GATES feeds the sim). This file holds
// where they stand and how tall they are (04 6.4: facades 6.0 EH, railings 0.5 EH); how they look (paving, cobbles, crowns, windows,
// awnings, the lamps' globes) is the renderer's.
// The boulevard (register 3.1, the owner on 2026-10-13: "some trees as a border, then a road, then buildings"): on the east, south and
// west sides, counting rings of tiles out from the boundary row or column (ring k is the k-th tile beyond it; the north side stays the
// quay and the river): the railings and gates on the boundary; rings 1-2 the tree pavement (paving, a kerb on the road side) with a
// plane tree every 2 tiles on the line between the two rings and a street lamp every 4 on its kerb; rings 3-4 the road (two lanes, a faint dashed centre line, kerbs); ring 5
// the far pavement; rings 6-7 the facade blocks; ring 8 the back pavement behind them, the apron's edge. Each ring turns the south-east and
// south-west corners as a square L (the south band owns the corner square), so the trees, the road and the blocks go round cleanly; on
// the east and west the bands run north to the quay row (y = -1). The gates' outside tiles (GATES[].outside) lie in ring 1, on the tree
// pavement in front of each gate, which is kept clear of trees (BACKDROP.gateClear).
import type { XY } from '../core/math.ts';
import type { GateId } from '../core/ids.ts';
import { N, inB } from './grid.ts';

export const APRON = 8;

export type { GateId };
export type Gate = {
  id: GateId;
  side: 'south' | 'west' | 'east' | 'north';
  tiles: readonly [XY, XY];
  outside: XY;
  weight: number;
};

/** The gate table of 02 2.4. */
export const GATES: readonly Gate[] = [
  { id: 'g_south_w', side: 'south', tiles: [{ x: 12, y: 47 }, { x: 13, y: 47 }], outside: { x: 12, y: 48 }, weight: 30 },
  { id: 'g_south_e', side: 'south', tiles: [{ x: 34, y: 47 }, { x: 35, y: 47 }], outside: { x: 34, y: 48 }, weight: 30 },
  { id: 'g_west', side: 'west', tiles: [{ x: 0, y: 23 }, { x: 0, y: 24 }], outside: { x: -1, y: 23 }, weight: 15 },
  { id: 'g_east', side: 'east', tiles: [{ x: 47, y: 23 }, { x: 47, y: 24 }], outside: { x: 48, y: 23 }, weight: 15 },
  { id: 'g_north', side: 'north', tiles: [{ x: 23, y: 0 }, { x: 24, y: 0 }], outside: { x: 23, y: -1 }, weight: 10 },
];

export function gateById(id: GateId): Gate {
  const g = GATES.find((o) => o.id === id);
  if (!g) throw new Error('unknown gate ' + id);
  return g;
}

export function nearestGate(x: number, y: number, exclude?: GateId): Gate {
  let best: Gate = GATES[0] as Gate;
  let bd = Infinity;
  for (const g of GATES) {
    if (g.id === exclude) continue;
    const t = g.tiles[0];
    const d = Math.max(Math.abs(t.x - x), Math.abs(t.y - y));
    if (d < bd) {
      bd = d;
      best = g;
    }
  }
  return best;
}

/** The outer edge of row 0, row N-1, column 0 and column N-1. */
export function isBoundary(x: number, y: number): boolean {
  return inB(x, y) && (x === 0 || y === 0 || x === N - 1 || y === N - 1);
}

export function isGateTile(x: number, y: number): GateId | null {
  for (const g of GATES) for (const t of g.tiles) if (t.x === x && t.y === y) return g.id;
  return null;
}

/** Where the apron's bands sit, in rings of tiles beyond the park edge (register 3.1; the boulevard on E, S and W, the header above). */
export type BackdropSpec = {
  quayY: number; // the quay wall row (north)
  riverFrom: number; // first river row (nearest the park)
  riverTo: number; // last river row (farthest)
  treePavement: readonly [number, number]; // first and last ring of the tree pavement (east, south, west)
  road: readonly [number, number]; // first and last ring of the road: two lanes, a dashed centre line on the seam between them
  farPavement: number; // the ring of the far pavement in front of the facades
  facadesFrom: number; // first facade ring beyond the boundary
  facadesTo: number; // last facade ring (ring 8 behind it is the back pavement, the apron's edge)
  treeLine: number; // the street trees stand this far beyond the boundary tile's centre: 1.5, the seam of the tree pavement's two rings
  treeStep: number; // one street tree every this many tiles along the street, the corners included
  gateClear: number; // no street tree or lamp within this many tiles of a gate's centre along its street (the approach, the gate's pavement)
  lampLine: number; // the street lamps stand this far beyond the boundary tile's centre: 2.2, on the tree pavement's kerb (its edge at 2.5)
  lampStep: number; // one street lamp every this many tiles along the street: midway between two street trees in every second gap
  facadeAlong: number; // a facade block is this many tiles along the street ...
  facadeDepth: number; // ... and this many deep (07 S2.6 item 10, 03 7.4 item 4: 3 along x 2 deep; 2 x 2 at the corners and the ends)
  facadeHeight: number; // EH, every block (04 6.4: 5 storeys and a mansard)
  railHeight: number; // EH (04 6.4)
  farBankFrom: number; // first row of the far-bank facades beyond the river (04 6.4)
};
export const BACKDROP: BackdropSpec = {
  quayY: -1,
  riverFrom: -2,
  riverTo: -8,
  treePavement: [1, 2],
  road: [3, 4],
  farPavement: 5,
  facadesFrom: 6,
  facadesTo: 7,
  treeLine: 1.5,
  treeStep: 2,
  gateClear: 2,
  lampLine: 2.2,
  lampStep: 4,
  facadeAlong: 3,
  facadeDepth: 2,
  facadeHeight: 6,
  railHeight: 0.5,
  farBankFrom: -9,
};

/**
 * The world rectangles [x0, y0, x1, y1] (tile edges) of the boulevard band between `from` and `to` tile edges beyond the park edge, as
 * one L round the two southern corners: the west strip, the south strip with both corner squares, the east strip; the east and west
 * strips run north to the quay's edge (y = quayY + 0.5). Band ring k is bandRects(k - 1, k); the road is bandRects(2, 4).
 */
export function bandRects(from: number, to: number): readonly (readonly [number, number, number, number])[] {
  const lo = -0.5, hi = N - 0.5, top = BACKDROP.quayY + 0.5;
  return [
    [lo - to, top, lo - from, hi + from],
    [lo - to, hi + from, hi + to, hi + to],
    [hi + from, top, hi + to, hi + from],
  ];
}

/** The skyline band (04 6.4): the Eiffel Tower stands at the north-west bearing (-x, -y), 2.2 times the facade height. */
export const SKYLINE = { towerAngle: (-3 * Math.PI) / 4, towerScale: 2.2 } as const;

export type Side4 = 'north' | 'south' | 'west' | 'east';

/** One railing piece per boundary tile along each of the four edges, except the gate tiles; (x, y) is the boundary tile. */
export type RailPiece = { id: number; side: Side4; x: number; y: number };

let rails: RailPiece[] | null = null;
export function railPieces(): readonly RailPiece[] {
  if (rails) return rails;
  const out: RailPiece[] = [];
  const add = (side: Side4, x: number, y: number): void => {
    if (isGateTile(x, y) === null) out.push({ id: out.length + 1, side, x, y });
  };
  for (let x = 0; x < N; x++) add('north', x, 0);
  for (let y = 0; y < N; y++) add('east', N - 1, y);
  for (let x = 0; x < N; x++) add('south', x, N - 1);
  for (let y = 0; y < N; y++) add('west', 0, y);
  rails = out;
  return out;
}

/** A street tree: a plane on the tree pavement at world (x, y), `side` the street it lines (the corner trees line the south one). */
export type StreetTree = { id: number; side: Side4; x: number; y: number };

let trees: StreetTree[] | null = null;
/**
 * The street trees (register 3.1; BACKDROP.treeLine, treeStep, gateClear): one every 2 tiles on the line 1.5 tiles beyond the boundary
 * tiles' centres, x or y = -1.5 or 48.5, running from the south-west corner (-1.5, 48.5) east to the south-east corner (48.5, 48.5) and
 * north from each corner to y = 0.5 by the quay, so a tree stands on each corner and the rows turn it; none within 2 tiles of a gate's
 * centre along its street, which leaves the gate's approach and the pavement in front of it clear (the south gates' centres fall on the
 * row's step, so three trees give way there; the east and west gates' fall between two, so two do). Fixed, no seed.
 */
export function streetTrees(): readonly StreetTree[] {
  if (trees) return trees;
  const { treeLine: t, treeStep: step } = BACKDROP;
  const lo = -t, hi = N - 1 + t, out: StreetTree[] = [];
  const add = (side: Side4, x: number, y: number): void => {
    if (!nearGate(side, side === 'south' ? x : y)) out.push({ id: out.length + 1, side, x, y });
  };
  for (let x = lo; x <= hi + 1e-9; x += step) add('south', x, hi);
  for (let y = hi - step; y >= 0; y -= step) {
    add('west', lo, y);
    add('east', hi, y);
  }
  trees = out;
  return out;
}

/** Is a place `along` its street (x on the south, y on the east and west) within BACKDROP.gateClear of a gate's centre on that street? */
function nearGate(side: Side4, along: number): boolean {
  return GATES.some((g) => g.side === side && Math.abs((side === 'south' ? (g.tiles[0].x + g.tiles[1].x) / 2 : (g.tiles[0].y + g.tiles[1].y) / 2) - along) <= BACKDROP.gateClear);
}

/** A street lamp: the park's three-globe lamp (04 6.2) on the tree pavement's kerb at world (x, y), `side` the street it lines (the
 *  corner lamps line the south one, as the corner trees do). */
export type StreetLamp = { id: number; side: Side4; x: number; y: number };

/** A corner lamp stands on the kerb diagonal only when it clears the corner tree by this many tiles; else the corner stays bare. */
const CORNER_CLEAR = 0.9;

let lamps: StreetLamp[] | null = null;
/**
 * The street lamps (register 3.1 and section 4; the owner on 2026-10-13: "Yes Just generate an option and use it"; BACKDROP.lampLine,
 * lampStep, gateClear): one row on the tree pavement's kerb, the line 2.2 tiles beyond the boundary tiles' centres (x = -2.2 on the
 * west, 49.2 on the east, y = 49.2 on the south), running round both southern corners and north to the quay as the street trees do.
 * Along the street each lamp stands midway between two neighbouring places of the trees' 2-tile step, in every second gap counted from
 * the corner tree, the first in the second gap (x or y = 1.5, 5.5 ... 45.5): one every 4 tiles, mirror-symmetric under x -> 47 - x.
 * That phase leaves the gap beside each corner tree empty, so the corner's own lamp, on the kerb diagonal at (-2.2, 49.2) and
 * (49.2, 49.2), stands 3.7 tiles along the kerb from the next ones and keeps the rhythm (it clears the corner tree by 0.99 tiles; the
 * other phase would put it 1.7 from them). None within 2 tiles of a gate's centre along its street (the gate pillars carry their own
 * lamps). 32 in all. Fixed, no seed, no rng; regenerated, never saved, not props, no charm (register 3.5 counts the park's lamps only).
 */
export function streetLamps(): readonly StreetLamp[] {
  if (lamps) return lamps;
  const { treeLine: t, treeStep: step, lampLine: l, lampStep } = BACKDROP;
  const lo = -t, hi = N - 1 + t, out: StreetLamp[] = [];
  const add = (side: Side4, x: number, y: number): void => {
    if (!nearGate(side, side === 'south' ? x : y)) out.push({ id: out.length + 1, side, x, y });
  };
  const corner = (x: number): void => {
    if (Math.hypot(l - t, l - t) >= CORNER_CLEAR) add('south', x, N - 1 + l);
  };
  corner(-l);
  for (let x = lo + 1.5 * step; x + step / 2 <= hi + 1e-9; x += lampStep) add('south', x, N - 1 + l);
  corner(N - 1 + l);
  // north from the corners while a tree stands on each side of the gap (the trees run to y = 0.5 by the quay)
  for (let y = hi - 1.5 * step; y - step / 2 >= 0; y -= lampStep) {
    add('west', -l, y);
    add('east', N - 1 + l, y);
  }
  lamps = out;
  return out;
}

/** A facade block: the footprint is w tiles in x by h tiles in y from the north-west tile (x0, y0); `height` is in EH (04 6.4: 6.0). */
export type FacadeBlock = { id: number; side: Side4; far: boolean; x0: number; y0: number; w: number; h: number; height: number };

/** Split a run of `len` tiles into blocks `along` long, as [start, length]: when `along` does not divide it, a 2-long block at the run's
 *  end (a remainder of 2) or at both ends (a remainder of 1). */
function runBlocks(len: number, along: number): [number, number][] {
  const r = len % along, out: [number, number][] = [];
  let at = 0;
  if (r === 1) {
    out.push([0, 2]);
    at = 2;
  }
  const end = r === 0 ? len : len - 2;
  for (; at + along <= end; at += along) out.push([at, along]);
  if (r !== 0) out.push([at, 2]);
  return out;
}

let facades: FacadeBlock[] | null = null;
/**
 * The blocks in rings 6-7 (BACKDROP.facadesFrom, facadesTo) and the far bank beyond the river. The south row runs the whole boulevard
 * from the south-west corner square to the south-east one (tiles x -7 .. 54 at y 53-54): a 2 x 2 block on each corner square, a 2-long
 * block at each end of the straight, 3-long blocks between; the east and west rows run north from the corner squares to the quay
 * (y 52 .. 0 at x 53-54 and -7 .. -6): 3-long blocks, then a 2-long block by the quay. Ids run along the south row, then alternate east
 * and west from the corners north, then the far bank, so the renderer's wash by (id x 3) mod 5 never repeats between neighbours (ids 1
 * or 2 apart along a row, and 1 or 23 apart across a corner). Fixed, no seed.
 */
export function facadeBlocks(): readonly FacadeBlock[] {
  if (facades) return facades;
  const { facadeAlong: along, facadeDepth: depth, facadesFrom: from, farBankFrom } = BACKDROP;
  const out: FacadeBlock[] = [];
  const add = (side: Side4, far: boolean, x0: number, y0: number, w: number, h: number): void => {
    const id = out.length + 1;
    out.push({ id, side, far, x0, y0, w, h, height: BACKDROP.facadeHeight });
  };
  const sy = N - 1 + from, ex = N - 1 + from, wx = -from - depth + 1; // the south row's y0, the east row's x0, the west row's x0
  // the south row: the south-west corner square, the straight (x -5 .. 52), the south-east corner square
  add('south', false, wx, sy, depth, depth);
  for (const [a, l] of runBlocks(ex - (wx + depth), along)) add('south', false, wx + depth + a, sy, l, depth);
  add('south', false, ex, sy, depth, depth);
  // the east and west rows from the corner squares (y sy - 1) north to the quay (y 0), the short block last, by the quay
  let y = sy;
  for (const [, l] of runBlocks(sy, along)) {
    y -= l;
    add('east', false, ex, y, depth, l);
    add('west', false, wx, y, depth, l);
  }
  const rowLen = N + 2 * APRON; // the far bank spans the whole apron width: tiles -8 .. 55
  for (let k = 0; k * along + along <= rowLen; k++) add('north', true, -APRON + k * along, farBankFrom - depth + 1, along, depth);
  facades = out;
  return out;
}
