// src/world/gen.ts
// The seeded starter park (02 2.5), as tile data only: lawn, two gravel loops, five gate spokes, the fountain's flagstone ring, a pond, two beds.
// Ported from GV 885-911 (seed and reseed shape). ADAPT: fixed skeleton, the seed varies only the pond position and the bed colour order.
// TODO(S2): props (fountain, benches, kiosk, lamps, trees) through core/ids.ts, the seeded pond outline, the bridge; S0 keeps the pond 4 x 4.
import { seedSim, seedVisual, rint, chance } from '../core/rng.ts';
import { N, I, inB, Kind, KIND, WATER, BEDC, clearLayers, markBlockDirty, rebuildBlock } from './grid.ts';
import { GATES, type Gate } from './park.ts';

const CX = (N - 1) / 2; // 23.5
const CY = (N - 1) / 2;

function setKind(x: number, y: number, k: Kind): void {
  if (inB(x, y)) KIND[I(x, y)] = k;
}

/** A 2-tile-wide ring of gravel: tiles whose Chebyshev distance from the centre floors to d or d + 1. */
function ring(d: number): void {
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const c = Math.floor(Math.max(Math.abs(x - CX), Math.abs(y - CY)));
      if (c === d || c === d + 1) KIND[I(x, y)] = Kind.gravel;
    }
}

/** Both gate tiles, then one straight gravel spoke from the first tile inward until it meets gravel. */
function spoke(g: Gate): void {
  const [a, b] = g.tiles;
  setKind(a.x, a.y, Kind.gravel);
  setKind(b.x, b.y, Kind.gravel);
  const dx = g.side === 'west' ? 1 : g.side === 'east' ? -1 : 0;
  const dy = g.side === 'north' ? 1 : g.side === 'south' ? -1 : 0;
  let cx = a.x + dx, cy = a.y + dy;
  while (inB(cx, cy) && KIND[I(cx, cy)] !== Kind.gravel) {
    KIND[I(cx, cy)] = Kind.gravel;
    cx += dx;
    cy += dy;
  }
}

/** Build the park for `seed`. Writes layers only; the sim stream is consumed from a fresh seed. */
export function genPark(seed: number): void {
  seedSim(seed);
  seedVisual((seed ^ 0x9e3779b9) >>> 0);
  clearLayers();

  ring(13); // outer loop (Chebyshev 13 and 14)
  ring(5); // inner loop (Chebyshev 5 and 6)

  for (const g of GATES) spoke(g);

  // the fountain's flagstone ring: 4 x 4 around the 2 x 2 fountain at (23,23)-(24,24)
  for (let y = 22; y <= 25; y++) for (let x = 22; x <= 25; x++) setKind(x, y, Kind.flagstone);

  // the pond: 4 x 4, seeded along the row below the outer loop inside the box of 02 2.5
  const px = 30 + rint(0, 3);
  const py = 11;
  for (let y = py; y < py + 4; y++)
    for (let x = px; x < px + 4; x++) {
      KIND[I(x, y)] = Kind.pond;
      WATER[I(x, y)] = 0.6;
    }

  // two bed clusters; the seed swaps rose and lavender
  const swap = chance(0.5);
  const beds: Array<[number, number, number]> = [
    [19, 19, swap ? 1 : 0],
    [27, 27, swap ? 0 : 1],
  ];
  for (const [bx, by, col] of beds)
    for (let y = by; y < by + 2; y++)
      for (let x = bx; x < bx + 2; x++) {
        KIND[I(x, y)] = Kind.bed;
        BEDC[I(x, y)] = col;
      }

  markBlockDirty();
  rebuildBlock();
}
