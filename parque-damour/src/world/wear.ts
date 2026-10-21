// src/world/wear.ts
// Desire paths: wearAt on lawn while moving, decayWear once a sim second, the gardener's paving runs (02 11.1).
// Ported from GV 1674-1687 (wearStep, decayWear) and adapted from GV 3366-3395 (the paving search inside planEmergent).
// Verdict: PORT + ADAPT. Changes: 0.42*S becomes 0.42 (S = 1); wear grows only on lawn and not while WET > 0.5 (GV also skipped bridges and
// water); the decay runs when the loop calls it once per sim second (tick % 60), GV kept its own accumulator and aged swim marks; the paving
// seed needs WEAR >= 2.6 (GV 2.8), skips tiles within 2 of a fountain or lamp (GV: the fire and lanterns), tiles paved today (PAVEDAY, GV
// PAVE), occupied and water tiles; a followed tile must be lawn, unoccupied and not paved today, and may pass a fountain or lamp (the
// exclusion is the seed's only, 02 11.1 item 4); paving is free (GV needed stone) and the stone/work bookkeeping is dropped.
// Dropped from the range: 3367-3369 (stone, hearth gate), 3390-3394 (mkProj and the cost), 1686 (swim marks).
// S4 part B: entities/staff.ts calls findPavingRun every 60 s from the planning tick (03 4.3 item 2) and act.ts calls markPaved as the
// gardener lays each tile; move.ts calls wearAt on every step a visitor moves.
import type { XY } from '../core/math.ts';
import { I, inB, KIND, Kind, N, NC, OCC, PAVEDAY, WATER, WEAR, WET, markBlockDirty, props } from './grid.ts';

export const WEAR_MAX = 4;
export const WEAR_RATE = 0.42; // per sim second, scaled up to 1.6x on an already worn tile
export const WEAR_WET_MAX = 0.5; // no wear while WET is above this
export const PAVE_SEED = 2.6; // the busiest tile must be at least this worn
export const PAVE_FOLLOW_WEAR = 1.6; // a neighbour joins the run when it is worn above this
export const PAVE_FOLLOW = 5; // steps each way
export const PAVE_MIN_RUN = 3;

/** Wear the lawn tile under a walker for `dt` sim seconds; the caller calls it while the visitor is moving (GV 1674-1681). */
export function wearAt(v: { x: number; y: number }, dt: number): void {
  const x = Math.round(v.x), y = Math.round(v.y);
  if (!inB(x, y)) return;
  const i = I(x, y);
  if (KIND[i] !== Kind.lawn || (WET[i] as number) > WEAR_WET_MAX) return;
  const w = WEAR[i] as number;
  const n = w + dt * WEAR_RATE * (1 + 0.6 * Math.min(1, w / 1.2));
  WEAR[i] = n > WEAR_MAX ? WEAR_MAX : n;
}

/** One second of decay: a stray track grasses over in minutes, a real path lasts (GV 1683-1687). */
export function decayWear(): void {
  for (let i = 0; i < NC; i++) {
    const w = WEAR[i] as number;
    if (w > 0) WEAR[i] = w * (w < 0.6 ? 0.9975 : 0.99945);
  }
}

// The 8 neighbours in GV's order (PF_DX, PF_DY at 1452): E, W, S, N, SE, NE, SW, NW.
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
const near = new Uint8Array(NC);

/** Mark every tile within Chebyshev 2 of a fountain or lamp footprint (02 11.1 item 4). */
function markNearFixtures(): void {
  near.fill(0);
  for (const p of props) {
    if (p.kind !== 'fountain' && p.kind !== 'lamp') continue;
    for (let y = p.y - 2; y < p.y + p.h + 2; y++) for (let x = p.x - 2; x < p.x + p.w + 2; x++) if (inB(x, y)) near[I(x, y)] = 1;
  }
}

/** A lawn tile a run may take in on `day`: unoccupied, not water, not paved today (02 11.1 items 4 and 6). */
function followable(i: number, day: number): boolean {
  return KIND[i] === Kind.lawn && OCC[i] === 0 && (WATER[i] as number) === 0 && PAVEDAY[i] !== day;
}

/** A tile that may seed a run: followable and not within 2 tiles of a fountain or a lamp (02 11.1 item 4, the seed only). */
function paveable(i: number, day: number): boolean {
  return followable(i, day) && near[i] === 0;
}

/**
 * The paving search (02 11.1 item 4): the busiest paveable lawn tile with WEAR >= 2.6 (the first in row order on a tie), then the worn
 * ground followed both ways up to 5 steps, each to the unvisited followable 8-neighbour with the highest WEAR above 1.6 (a run may pass
 * a fountain or a lamp). A run of 3 or more tiles is returned in walking order; otherwise null.
 */
export function findPavingRun(day: number): XY[] | null {
  markNearFixtures();
  let best = -1, bw = 0;
  for (let i = 0; i < NC; i++) {
    const w = WEAR[i] as number;
    if (w < PAVE_SEED || !paveable(i, day)) continue;
    if (best < 0 || w > bw) {
      bw = w;
      best = i;
    }
  }
  if (best < 0) return null;
  const run = [best];
  const seen = new Set<number>([best]);
  for (const dir of [0, 1]) {
    let cur = best;
    for (let k = 0; k < PAVE_FOLLOW; k++) {
      const cx = cur % N, cy = (cur / N) | 0;
      let nb = -1, nw = PAVE_FOLLOW_WEAR;
      for (let d = 0; d < 8; d++) {
        const nx = cx + (DX[d] as number), ny = cy + (DY[d] as number);
        if (!inB(nx, ny)) continue;
        const j = ny * N + nx;
        if (seen.has(j) || !followable(j, day)) continue;
        const w = WEAR[j] as number;
        if (w > nw) {
          nw = w;
          nb = j;
        }
      }
      if (nb < 0) break;
      seen.add(nb);
      if (dir === 0) run.push(nb);
      else run.unshift(nb);
      cur = nb;
    }
  }
  if (run.length < PAVE_MIN_RUN) return null;
  return run.map((i) => ({ x: i % N, y: (i / N) | 0 }));
}

/** The gardener has laid tile `i`: it becomes gravel, unworn, and is stamped with the day so it is not paved twice that day (02 11.1 items 5-6). */
export function markPaved(i: number, day: number): void {
  KIND[i] = Kind.gravel;
  WEAR[i] = 0;
  PAVEDAY[i] = day;
  markBlockDirty();
}
