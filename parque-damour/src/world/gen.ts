// src/world/gen.ts
// The seeded starter park (02 2.5): tile data, then props. Fixed skeleton: fountain, flagstone rings, two gravel loops, five gate spokes,
// the pond's neck and bridge, six benches, two beds, the kiosk with two tables, four lamps and (S6, owner 2026-10-19) two picnic
// blankets. The seed varies only the pond outline, the bed colour order and the tree positions.
// Ported from GV 885-911 (seed and reseed shape: both streams are reseeded first, 887) and the site-scoring loop shape of 1022-1035 (the
// shuffled candidate list with spacing tests for the trees). ADAPT: a fixed skeleton instead of GV's silhouettes, rivers, soil and
// flowers (889-910, 913-1020 are dropped).
//
// Geometry (02 2.5):
//  - A loop is the tiles whose floor(max(|x - 23.5|, |y - 23.5|)) is in {5, 6} (inner: 17-18 / 29-30 on each axis) or {13, 14} (outer:
//    9-10 / 37-38), 2 wide.
//  - The pond lies in x 30-36, y 11-13 (the part of the old box (30,8)-(37,13) inside the outer loop): a west lobe (x 30-33), an east
//    lobe (x 35-36) and the 2-tile neck (34,11)-(34,12) between them, 14 to 20 tiles; (34,10) is the loop and (34,13) is lawn, so the
//    bridge spans the neck north to south with land at both ends.
//  - Starter trees stay on lawn (no mulch under them, so the seed changes KIND only on pond tiles); the tree tool writes mulch (02 8.3).
import { seedSim, seedVisual, chance, rng } from '../core/rng.ts';
import { resetIds } from '../core/ids.ts';
import { resetWeather } from '../core/weather.ts';
import { N, NC, I, inB, Kind, KIND, WATER, BEDC, OCC, addProp, clearLayers, markBlockDirty, props, rebuildBlock, type Prop } from './grid.ts';
import { GATES, type Gate } from './park.ts';
import { resetIce } from './water.ts';
import { markCharmDirty } from './charm.ts';

const CX = (N - 1) / 2; // 23.5
const CY = (N - 1) / 2;

let seed0 = 0;
/** The seed the current park was built from (saved with it). */
export function parkSeed(): number {
  return seed0;
}
export function setParkSeed(seed: number): void {
  seed0 = seed >>> 0;
}

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

/* ---------- the pond ---------- */

const NECK: ReadonlyArray<readonly [number, number]> = [[34, 11], [34, 12]];
// the neck, (34,11) and (34,12), and the tiles beside it, (33,11) (33,12) (35,11) (35,12), are never offered below, so the lobes always meet
// water the seed may take away, in a fixed order; corners are the likeliest to go
const OPTIONAL: ReadonlyArray<readonly [number, number]> = [
  [30, 11], [31, 11], [32, 11], [30, 12], [31, 12], [32, 12], [30, 13], [31, 13], [32, 13], [33, 13],
  [36, 11], [36, 12], [35, 13], [36, 13],
];
const CORNERS = new Set(['30,11', '30,13', '36,11', '36,13']);
export const POND_MIN = 14; // the outline never shrinks below this (a rowboat needs 12, 02 9.2)

function pondTiles(): number[] {
  const out: number[] = [];
  for (let y = 11; y <= 13; y++) for (let x = 30; x <= 36; x++) if (KIND[I(x, y)] === Kind.pond) out.push(I(x, y));
  return out;
}

/** Tiles reachable from the neck over pond tiles (4-connected). */
function connected(): number {
  const seen = new Set<number>();
  const stack = [I(NECK[0]![0], NECK[0]![1])];
  while (stack.length > 0) {
    const i = stack.pop() as number;
    if (seen.has(i) || KIND[i] !== Kind.pond) continue;
    seen.add(i);
    const x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (inB(x + dx, y + dy)) stack.push(I(x + dx, y + dy));
  }
  return seen.size;
}

function water(x: number, y: number): void {
  KIND[I(x, y)] = Kind.pond;
  WATER[I(x, y)] = 0.6;
}

/** A pond tile with a dry 4-neighbour: taking it leaves the outline, never a lawn island in the middle of the water. */
function onEdge(x: number, y: number): boolean {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => KIND[I(x + (dx as number), y + (dy as number))] !== Kind.pond);
}

function makePond(): void {
  for (let y = 11; y <= 13; y++) for (let x = 30; x <= 36; x++) if (x !== 34 || y < 13) water(x, y);
  for (const [x, y] of OPTIONAL) {
    const take = rng() < (CORNERS.has(x + ',' + y) ? 0.5 : 0.15); // one draw per optional tile, whatever happens
    if (!take || !onEdge(x, y)) continue;
    KIND[I(x, y)] = Kind.lawn;
    WATER[I(x, y)] = 0;
    const left = pondTiles().length;
    if (left < POND_MIN || connected() !== left) water(x, y); // would split the pond or shrink it too far: keep the tile
  }
}

/* ---------- props ---------- */

type Rot = 0 | 1 | 2 | 3;

/** The side a bench or kiosk faces to look at (cx, cy): 0 north, 1 east, 2 south, 3 west. */
function facing(x: number, y: number, cx: number, cy: number): Rot {
  const dx = cx - x, dy = cy - y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 1 : 3;
  return dy > 0 ? 2 : 0;
}

// The six bench tiles: the lawn ring just outside the inner loop (floor distance 7), at the angles 0, 60, ..., 300 degrees from the fountain.
const BENCHES: ReadonlyArray<readonly [number, number]> = [[31, 24], [28, 31], [19, 31], [16, 24], [19, 16], [28, 16]];
// Two lamps per loop at its north and south points, on the lawn side.
const LAMPS: ReadonlyArray<readonly [number, number]> = [[24, 16], [23, 31], [24, 11], [23, 36]];
// The two starter picnic blankets (2 x 2, north-west tile; owner 2026-10-19, "Continue" to the recommendation; register section 4,
// Starter picnic spots). Happily was rare (1 of 200 Calm seeds in 3 days) because the Picnic stage (a spot within 10 tiles of the pair,
// 02 6.2 stage 5) only found the kiosk's tables: 59 % of the seconds a pair spent waiting for it at stage 4 had no spot. Chosen by
// measuring, as the S5 harness drives the sim (scratch/s6 heat and scan): over seeds 1-80 the pairs waiting at stage 4 sit mostly between
// the loops, so each blanket takes lawn one tile clear of every path, prop and bed: the first on the inner loop's west side (x 14-15, y
// 21-22, two tiles from the gravel at x 17), the second on the outer loop's east side (x 34-35, y 24-25, two tiles from the gravel at x
// 37). With the kiosk tables 83 % of the pair-seconds at stage 4 have a spot within 10 (kiosk alone 37 %), the inner loop is 82 % and
// the outer loop 47 % covered (kiosk alone 0 % and 14 %).
export const PICNICS: ReadonlyArray<readonly [number, number]> = [[14, 21], [34, 24]];

function placeProps(): Prop[] {
  const out: Prop[] = [];
  const gen = 'gen' as const;
  out.push(addProp({ kind: 'fountain', x: 23, y: 23, w: 2, h: 2, rot: 0, placedBy: gen }));
  for (const [x, y] of BENCHES) out.push(addProp({ kind: 'bench', x, y, w: 1, h: 1, rot: facing(x, y, CX, CY), placedBy: gen }));
  const kiosk = addProp({ kind: 'kiosk', x: 14, y: 44, w: 2, h: 2, rot: 0, placedBy: gen });
  out.push(kiosk);
  const t1 = addProp({ kind: 'table', x: 16, y: 44, w: 1, h: 1, rot: 0, placedBy: gen });
  const t2 = addProp({ kind: 'table', x: 16, y: 45, w: 1, h: 1, rot: 0, placedBy: gen });
  kiosk.data.tableIds = [t1.id, t2.id];
  out.push(t1, t2);
  for (const [x, y] of LAMPS) out.push(addProp({ kind: 'lamp', x, y, w: 1, h: 1, rot: 0, placedBy: gen }));
  for (const [x, y] of PICNICS) out.push(addProp({ kind: 'picnic', x, y, w: 2, h: 2, rot: 0, placedBy: gen }));
  out.push(addProp({ kind: 'bridge', x: 34, y: 11, w: 1, h: 2, rot: 0, placedBy: gen, data: { span: 2, dir: 0 } }));
  return out;
}

/** Twelve trees, four of each species: on lawn, at least 3 tiles from any path or prop, at least 4 from each other (02 2.5). */
function placeTrees(): void {
  const blocked = new Uint8Array(NC); // 1 = within Chebyshev 2 of a path tile or a prop
  const mark = (x: number, y: number): void => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (inB(x + dx, y + dy)) blocked[I(x + dx, y + dy)] = 1;
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const k = KIND[I(x, y)];
      if (k === Kind.gravel || k === Kind.flagstone || OCC[I(x, y)] !== 0) mark(x, y);
    }
  for (const p of props) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) mark(x, y);
  const cand: number[] = [];
  for (let y = 1; y < N - 1; y++)
    for (let x = 1; x < N - 1; x++) {
      const i = I(x, y);
      if (KIND[i] === Kind.lawn && WATER[i] === 0 && blocked[i] === 0) cand.push(i);
    }
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = cand[i] as number;
    cand[i] = cand[j] as number;
    cand[j] = t;
  }
  const chosen: number[] = [];
  for (const i of cand) {
    const x = i % N, y = (i / N) | 0;
    if (chosen.some((c) => Math.max(Math.abs((c % N) - x), Math.abs(((c / N) | 0) - y)) < 4)) continue;
    chosen.push(i);
    addProp({ kind: 'tree', x, y, w: 1, h: 1, rot: 0, placedBy: 'gen', data: { species: (chosen.length - 1) % 3 as 0 | 1 | 2 } });
    if (chosen.length === 12) break;
  }
}

/** Build the park for `seed`: reseed both streams, reset every world-owned state (ids, props, layers, weather, ice), then lay the park. */
export function genPark(seed: number): void {
  seedSim(seed);
  seedVisual((seed ^ 0x9e3779b9) >>> 0); // GV 887: the visual stream follows the seed too
  setParkSeed(seed);
  resetIds();
  clearLayers();
  resetWeather();
  resetIce();

  ring(13); // outer loop (floor distance 13 and 14)
  ring(5); // inner loop (5 and 6)
  for (const g of GATES) spoke(g);

  // flagstone around the fountain (4 x 4 around the 2 x 2) and around the kiosk (4 x 4 around the 2 x 2), with its serving tile (14,46)
  for (let y = 22; y <= 25; y++) for (let x = 22; x <= 25; x++) setKind(x, y, Kind.flagstone);
  for (let y = 43; y <= 46; y++) for (let x = 13; x <= 16; x++) setKind(x, y, Kind.flagstone);

  makePond();

  // two bed clusters of 2 x 2; the seed swaps rose and lavender
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

  placeProps();
  placeTrees();
  markBlockDirty();
  rebuildBlock();
  markCharmDirty();
}
