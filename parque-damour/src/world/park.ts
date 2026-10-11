// src/world/park.ts
// Park bounds, the apron, the five gates and the backdrop specification in world coordinates (register 3.1, 02 2.4).
// Nothing ported: GV's island edges (642, 674) are replaced by fixed gates on a square boundary. NEW.
// TODO(S2): the full BackdropSpec (skyline band, facade bays, railings); S0 holds the bands the apron ground needs.
import type { XY } from '../core/math.ts';
import { N, inB } from './grid.ts';

export const APRON = 8;

export type GateId = 'g_south_w' | 'g_south_e' | 'g_west' | 'g_east' | 'g_north';
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
};
export const BACKDROP: BackdropSpec = { quayY: -1, riverFrom: -2, riverTo: -8, pavement: 1, facadesFrom: 2, facadesTo: 8 };
