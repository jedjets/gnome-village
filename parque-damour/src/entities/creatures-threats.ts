// src/entities/creatures-threats.ts
// The scatter triggers of the pigeons (02 11.2 item 5): a jogger within 2 tiles, a child chasing a pigeon within 1, a dog on a lead or the
// pomeranian within 3. Split out of creatures.ts (AGENTS rule 9; 03 2.5 row creatures-threats.ts) when the possessed pigeon of S7 took its
// lines. Ported from GV 2299-2340 (updateCritters: the scare when a walker comes near). The pool is reused every step (03 15.2).
import type { XY } from '../core/math.ts';
import type { Creature } from './creatures.ts';
import { visitors } from './visitor.ts';

export const R_SCATTER_JOGGER = 2;
export const R_SCATTER_DOG = 3;
export const R_SCATTER_POM = 3;
export const R_SCATTER_CHILD = 1;
/** The possessed pigeon is startled (not scattered) only by a trigger within this many tiles (02 10.4 refusals: "a dog within 2 tiles"). */
export const R_STARTLE = 2;
/** After a startle the possessed pigeon is left alone this many seconds, waiting, so the player can order it away from a dog that stays (S7 review). */
export const STARTLE_GRACE = 3;
/** True while the player's pigeon is in that grace: a driven pigeon in `wait` whose timer `t` (unused by `wait` otherwise) still runs. */
export const inStartleGrace = (c: Creature): boolean => c.driven === true && c.st === 'wait' && c.t > 0;

type Threat = { x: number; y: number; r2: number };
const pool: Threat[] = []; // reused every step: no garbage per step (03 15.2)
let nThreats = 0;
function threat(x: number, y: number, r: number): void {
  const t = pool[nThreats] ?? (pool[nThreats] = { x: 0, y: 0, r2: 0 });
  t.x = x;
  t.y = y;
  t.r2 = r * r;
  nThreats++;
}

/** This step's triggers, in the order jogger, child chasing a pigeon, then each dog and the pomeranian while he is in the park. */
export function gatherThreats(creatures: readonly Creature[]): void {
  nThreats = 0;
  for (const v of visitors) {
    if (v.archetype === 'jogger') threat(v.x, v.y, R_SCATTER_JOGGER);
    else if (v.archetype === 'child' && v.st === 'play' && v.job.creatureId !== undefined) threat(v.x, v.y, R_SCATTER_CHILD);
  }
  for (const o of creatures) {
    if (o.outside) continue;
    if (o.kind === 'dog') threat(o.x, o.y, R_SCATTER_DOG);
    else if (o.kind === 'pomeranian') threat(o.x, o.y, R_SCATTER_POM);
  }
}

/** The first trigger near a pigeon on the ground, or null; `cap` narrows every trigger's radius (the player's pigeon: R_STARTLE). */
export function threatTo(c: Creature, cap = Infinity): XY | null {
  for (let k = 0; k < nThreats; k++) {
    const t = pool[k] as Threat;
    const dx = t.x - c.x, dy = t.y - c.y;
    if (dx * dx + dy * dy <= Math.min(t.r2, cap * cap)) return t;
  }
  return null;
}
