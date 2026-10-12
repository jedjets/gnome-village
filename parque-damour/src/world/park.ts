// src/world/park.ts
// Park bounds, the apron, the five gates and the backdrop specification in world coordinates (register 3.1, 02 2.4).
// Nothing ported: GV's island edges (642, 674) are replaced by fixed gates on a square boundary. NEW.
// BACKDROP says where the quay, river, pavement, railings, facade blocks and skyline sit, in world (tile) coordinates, and railPieces()
// and facadeBlocks() list the apron props it implies (03 3.6, 7.4 item 4). They are regenerated, never saved, never in OCC. This file
// holds where they stand and how tall they are (04 6.4: facades 6.0 EH, railings 0.5 EH); how they look (windows, awnings) is the renderer's.
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

/** Where the apron's bands sit, in tile rows beyond the park edge (register 3.1). */
export type BackdropSpec = {
  quayY: number; // the quay wall row (north)
  riverFrom: number; // first river row (nearest the park)
  riverTo: number; // last river row (farthest)
  pavement: number; // tiles of pavement between railings and facades (east, south, west)
  facadesFrom: number; // first facade row beyond the boundary
  facadesTo: number; // last facade row (the apron's edge)
  facadeAlong: number; // a facade block is this many tiles along the street ...
  facadeDepth: number; // ... and this many deep (07 S2.6 item 10, 03 7.4 item 4: 3 along x 2 deep)
  facadeHeight: number; // EH, every block (04 6.4: 5 storeys and a mansard)
  railHeight: number; // EH (04 6.4)
  farBankFrom: number; // first row of the far-bank facades beyond the river (04 6.4)
};
export const BACKDROP: BackdropSpec = {
  quayY: -1,
  riverFrom: -2,
  riverTo: -8,
  pavement: 1,
  facadesFrom: 2,
  facadesTo: 8,
  facadeAlong: 3,
  facadeDepth: 2,
  facadeHeight: 6,
  railHeight: 0.5,
  farBankFrom: -9,
};

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

/** A facade block: the footprint is w tiles in x by h tiles in y from the north-west tile (x0, y0); `height` is in EH (04 6.4: 6.0). */
export type FacadeBlock = { id: number; side: Side4; far: boolean; x0: number; y0: number; w: number; h: number; height: number };

let facades: FacadeBlock[] | null = null;
/** East, south and west blocks start `facadesFrom` tiles beyond the boundary; the far bank stands beyond the river. All are fixed, no seed. */
export function facadeBlocks(): readonly FacadeBlock[] {
  if (facades) return facades;
  const { facadeAlong: along, facadeDepth: depth, facadesFrom: from, farBankFrom } = BACKDROP;
  const out: FacadeBlock[] = [];
  const add = (side: Side4, far: boolean, x0: number, y0: number, w: number, h: number): void => {
    const id = out.length + 1;
    out.push({ id, side, far, x0, y0, w, h, height: BACKDROP.facadeHeight });
  };
  const rowLen = N + 2 * APRON; // the south row and the far bank span the whole apron width: tiles -8 .. 55
  for (let k = 0; k * along + along <= rowLen; k++) add('south', false, -APRON + k * along, N - 1 + from, along, depth);
  for (let y = 0; y + along <= N; y += along) {
    add('east', false, N - 1 + from, y, depth, along);
    add('west', false, -from - depth + 1, y, depth, along);
  }
  for (let k = 0; k * along + along <= rowLen; k++) add('north', true, -APRON + k * along, farBankFrom - depth + 1, along, depth);
  facades = out;
  return out;
}
