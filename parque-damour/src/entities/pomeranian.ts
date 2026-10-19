// src/entities/pomeranian.ts
// Pompon's run for m_pomeranian (02 9.3, 11.3): he enters by the gate nearest the victim, runs at 4.5 to them, snatches the first item
// (hat, purse, baguette, iceCream: embarrass.land 'snatched'), runs with it to the gate nearest him while the victim chases 8 s at 4.0
// (the reaction `chase` of 02 6.4; this file walks the victim toward him), drops it on the gate's outside tile where the victim has it
// back (their `items` again: 02 13 T4, "snatched items come back", within 10 s), and waits outside 60 s (06 1.8 POM_WAIT_T) before the
// next cast. The record is the Creature of creatures.ts (`thePomeranian`): `outside` while he waits, `st` idle / run / carry / home,
// `targetId` the victim, `carry` the item, `t` the replan countdown, `cdUntil` the deadline of the run (T.abs) and, once he is outside
// again, the time he is free. Every value is on the record, so a save in the middle of a run restores it exactly (08 3.2 run 6).
// Split out of creatures.ts (AGENTS rule 9; 03 2.5 row pomeranian.ts). NEW. Movement: A* (astar.ts) every 0.5 s or at each waypoint, the
// first tile of the path the waypoint, straight at 4.5 between; the gates are his own (gateIn/gateOut), so the walk goes through them.
// Dogs on leads are not involved (the cast refuses when one is within 3: abilities-mischief.ts); the child chase of 02 11.4 and the
// bark of 11.3 item 1 are not built.
// TODO(S6-art): Pompon is not drawn yet (render/people.ts skips the pomeranian until the S6 art is picked).
import { DAYLEN, T } from '../core/clock.ts';
import { emit } from '../core/events.ts';
import type { VisitorId } from '../core/ids.ts';
import { nearestGate } from '../world/park.ts';
import { findPath } from './astar.ts';
import { walkDirect } from './act.ts';
import { creatures, type Creature } from './creatures.ts';
import { land, firstItem } from './embarrass.ts';
import { byId, nowTick } from './visitor.ts';

export const SPD_POM = 4.5; // 06 1.5
export const POM_WAIT_T = 60; // s outside after the run (06 1.8)
export const POM_REACH = 1.2; // tiles from the victim at which he snatches (a seated victim stands on a tile he cannot enter)
export const POM_GATE_REACH = 0.3;
export const POM_RUN_MAX = 60; // s: a run that has not ended by then goes home
export const POM_REPLAN = 0.5; // s
export const CHASE_EVERY = 30; // steps between the victim's re-aims at him

/** The pomeranian's record, or undefined before seedCreatures (a parked test world). */
export function pompon(): Creature | undefined {
  return creatures.find((c) => c.kind === 'pomeranian');
}

/** Is he outside and past his wait, so that m_pomeranian may send him? */
export function pomeranianFree(): boolean {
  const c = pompon();
  return !!c && c.outside && c.st === 'idle' && T.abs >= c.cdUntil;
}

/** m_pomeranian's first step: he appears on the outside tile of the gate nearest the victim and starts the run. */
export function sendPomeranian(victim: VisitorId): boolean {
  const v = byId(victim), c = pompon();
  if (!v || !c || !pomeranianFree()) return false;
  const g = nearestGate(v.x, v.y);
  c.x = c.tx = g.outside.x;
  c.y = c.ty = g.outside.y;
  c.z = 0;
  c.outside = false;
  c.st = 'run';
  c.t = 0;
  c.targetId = victim;
  c.carry = null;
  c.cdUntil = T.abs + POM_RUN_MAX / DAYLEN;
  emit({ kind: 'bark', tick: nowTick(), x: c.x, y: c.y, ids: [c.id] });
  return true;
}

/** One step toward (gx, gy); true once within `reach` of it. */
function aim(c: Creature, gx: number, gy: number, reach: number, dt: number, gate: ReturnType<typeof nearestGate>): boolean {
  if (Math.hypot(gx - c.x, gy - c.y) <= reach) return true;
  c.t -= dt;
  if (c.t <= 0 || Math.hypot(c.tx - c.x, c.ty - c.y) < 0.05) {
    const w = findPath(c.x, c.y, gx, gy, { gateIn: gate.id, gateOut: gate.id }).path[0];
    c.tx = w ? w.x : gx;
    c.ty = w ? w.y : gy;
    c.t = POM_REPLAN;
  }
  const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
  if (d > 1e-6) {
    const step = Math.min(d, SPD_POM * dt);
    c.x += (dx / d) * step;
    c.y += (dy / d) * step;
    c.face = dx - dy < 0 ? -1 : 1;
  }
  return Math.hypot(gx - c.x, gy - c.y) <= reach;
}

/** On the victim: take the item and run for the gate; nothing to take (it was lost meanwhile) or the landing refused: home empty-handed. */
function snatch(c: Creature, victim: NonNullable<ReturnType<typeof byId>>): void {
  const item = firstItem(victim);
  const r = item ? land('snatched', victim.id, 'mischief') : null;
  if (!item || !r?.ok) {
    c.st = 'home';
    return;
  }
  victim.items[item] = false; // taken even when the pair laughs it off (the backfire): the item comes back all the same
  c.carry = item;
  c.st = 'carry';
  c.t = 0;
  emit({ kind: 'snatch', tick: nowTick(), x: c.x, y: c.y, ids: [c.id, victim.id], params: { item } });
}

/** At the gate: the item is dropped and the victim has it back; he waits outside 60 s. */
function drop(c: Creature, g: ReturnType<typeof nearestGate>): void {
  const v = byId(c.targetId);
  if (v && c.carry) v.items[c.carry] = true;
  emit({ kind: 'snatch', tick: nowTick(), x: c.x, y: c.y, ids: [c.id, c.targetId], params: { drop: 1 } });
  c.carry = null;
  c.targetId = 0;
  c.x = c.tx = g.outside.x;
  c.y = c.ty = g.outside.y;
  c.outside = true;
  c.st = 'idle';
  c.cdUntil = T.abs + POM_WAIT_T / DAYLEN;
}

/** Phase 9, after stepCreatures (loop.ts): Pompon's run, if there is one. */
export function stepPomeranian(dt: number): void {
  const c = pompon();
  if (!c || c.outside) return;
  const v = byId(c.targetId);
  if (c.st === 'run') {
    if (!v || T.abs > c.cdUntil) c.st = 'home';
    else if (aim(c, v.x, v.y, POM_REACH, dt, nearestGate(v.x, v.y))) snatch(c, v);
    return;
  }
  const g = nearestGate(c.x, c.y);
  if (c.st === 'carry' && v?.st === 'chase' && nowTick() % CHASE_EVERY === 0) walkDirect(v, c.x, c.y); // the victim chases him at 4.0 (move.ts speedOf)
  if (!aim(c, g.outside.x, g.outside.y, POM_GATE_REACH, dt, g)) return;
  if (c.st === 'carry') drop(c, g);
  else {
    c.carry = null; // 'home': no item to drop
    c.targetId = 0;
    c.x = c.tx = g.outside.x;
    c.y = c.ty = g.outside.y;
    c.outside = true;
    c.st = 'idle';
    c.cdUntil = T.abs + POM_WAIT_T / DAYLEN;
  }
}
