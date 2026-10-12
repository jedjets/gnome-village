// src/core/ids.ts
// One allocator per record type: counters start at 1, 0 is none; PropId is recycled through a free list so it fits OCC (03 2.3, 3.1).
// NEW (GV holds object references, review section 11).
// Policy: a freed PropId joins the back of a queue and is handed out again before any fresh id (first freed, first reused), so a
// stale reference is as old as it can be before its id is reused. An id freed by a tool that undo can reverse is freed with `reserve`:
// it is held out of the queue until its undo entry leaves the stack (releasePropId) or the undo puts the prop back (reclaimPropId), so
// the undo can re-add the prop under its old id (03 5.6 item 3). Everything here is plain numbers, so the state saves as JSON.

export type VisitorId = number;
export type PairId = number;
export type CreatureId = number;
export type PropId = number;
export type EffectId = number;
export type GateId = 'g_south_w' | 'g_south_e' | 'g_west' | 'g_east' | 'g_north';
export type Side = 'park' | 'cupid' | 'mischief';

/** OCC is a Uint16Array, so a PropId never exceeds this (03 3.1). */
export const PROP_ID_MAX = 65535;

export type IdsState = {
  visitor: number; // last id handed out
  pair: number;
  creature: number;
  prop: number;
  effect: number;
  propFree: number[]; // freed PropIds, oldest first
  propReserved: number[]; // freed PropIds an undo entry may still re-add, in the order they were freed
};

let visitor = 0;
let pair = 0;
let creature = 0;
let prop = 0;
let effect = 0;
let propFree: number[] = [];
let propReserved: number[] = [];

export function nextVisitorId(): VisitorId {
  return ++visitor;
}
export function nextPairId(): PairId {
  return ++pair;
}
export function nextCreatureId(): CreatureId {
  return ++creature;
}
export function nextEffectId(): EffectId {
  return ++effect;
}

/** A recycled id first, else the next fresh one. Throws only if all 65535 ids are live at once (the soft cap is 600). */
export function nextPropId(): PropId {
  const reused = propFree.shift();
  if (reused !== undefined) return reused;
  if (prop >= PROP_ID_MAX) throw new Error('PropId space exhausted');
  return ++prop;
}

/**
 * Give a PropId back. With `reserve` the id is held for an undo entry and is not handed out until releasePropId (03 5.6 item 3).
 * Ignores 0, ids never handed out and ids already free or reserved.
 */
export function freePropId(id: PropId, reserve = false): void {
  if (id < 1 || id > prop || propFree.includes(id) || propReserved.includes(id)) return;
  (reserve ? propReserved : propFree).push(id);
}

/** The undo entry that reserved `id` left the stack (it fell off the bottom, or the stack was cleared): the id joins the free queue. */
export function releasePropId(id: PropId): void {
  const k = propReserved.indexOf(id);
  if (k < 0) return;
  propReserved.splice(k, 1);
  propFree.push(id);
}

/** The undo re-adds a removed prop under its old id: a reserved id becomes live again. False when `id` is not reserved. */
export function reclaimPropId(id: PropId): boolean {
  const k = propReserved.indexOf(id);
  if (k < 0) return false;
  propReserved.splice(k, 1);
  return true;
}

/** A new park starts every counter over. */
export function resetIds(): void {
  visitor = pair = creature = prop = effect = 0;
  propFree = [];
  propReserved = [];
}

export function idsState(): IdsState {
  return { visitor, pair, creature, prop, effect, propFree: propFree.slice(), propReserved: propReserved.slice() };
}

export function setIdsState(s: IdsState): void {
  visitor = s.visitor;
  pair = s.pair;
  creature = s.creature;
  prop = s.prop;
  effect = s.effect;
  propFree = s.propFree.slice();
  propReserved = (s.propReserved ?? []).slice(); // a save written before the field existed holds none
}
