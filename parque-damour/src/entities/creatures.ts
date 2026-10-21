// src/entities/creatures.ts
// Pigeons, dogs on leads and the pomeranian's record; crumbs (02 11.2-11.4, 03 3.5, 6.6).
// Ported from GV 1753-1758 (seedCritters: the spawn loop with tries on the sim stream), 1863 and 1893-1900 (dogStep: the companion idiom,
// "with its person by day", walkTo a point beside the master), 2293-2297 (landBird: perching on a prop for a while), 2299-2340
// (updateCritters: the per-critter timer, the scare when a walker comes near, a hop away from it, the next spot picked when the timer
// runs out).
// Verdict: ADAPT. Changes: one Creature record (03 3.5) for pigeons, dogs and the pomeranian instead of GV's rabbits, deer and foxes;
// pigeons walk at 1.2 and fly at 6.0 in a straight line (02 5.4), perch on a lamp, a bench, a fountain rim or a tree (02 11.2 item 2), go
// to crumbs within 10 tiles (at most 5 a crumbs prop), peck a crumb every 4 s and empty it, and scatter 3 tiles over 3 s (06 1.8) from
// a jogger within 2, a dog or the pomeranian within 3, or a child chasing within 1 (02 11.2 item 5; GV's rabbit scare at 2.4); 6 at a new
// park, +1 every 90 s from the north edge to 12 (the planning tick, 03 4.3 item 4); a dog walker's dog follows 1 tile behind at 3.0 and goes
// when its walker goes; the pomeranian's record exists from the start and waits outside the south-west gate, not drawn (pomeranian.ts runs
// him); the caps are 12 pigeons and 4 dogs with the pomeranian (register 3.3). Every decision draws on the sim stream; positions, heights
// (z, in EH units: a lamp's head 1.65, a bench 0.45, a fountain rim 0.9, a tree 2.2) and timers are saved and hashed. "A gathering" (3
// pigeons at one crumbs prop) is announced once per crumbs prop with params.feed on the `peck` that makes it. A pigeon's crumbs are the
// ones its targetId names at the spot it was sent to (targetCrumbs): a PropId is recycled, so crumbs dropped elsewhere can carry its id.
// S6: the pigeon's `swoop` (m_pigeon, 02 9.3): startSwoop sends a pigeon at 6.0 to follow a visitor (its `ownerId`; `targetId` is the
// crumbs' slot), 2 s late in fog; on arrival the swoop hook the ability registered lands the `poop` and the pigeon flies off.
// S7 (07 S7.5, 02 10.4): the possessed pigeon (a_pigeon) is the same record with `driven` set while it is the player's (absent otherwise, so
// a park without avatars hashes as before). play/avatar-pigeon.ts gives its orders by setting st, tx, ty and the target fields; this file runs
// them with the states it has (fly, swoop, peck, perch) and these: `wait` (an order done: nextPigeon stays put), `poop` (0.5 s) then `startled`
// (1 s; 2 s when a threat comes near, instead of the scatter) and `drink` (3 s, after `flyDrink`). No MODE or PLAYER is read here (03 4.4).
// Dropped from the range: rabbits, deer, foxes, folds, hutches, riders, taming, raids, the fox's barking at night, swimming, sweeps.
import type { XY } from '../core/math.ts';
import { T } from '../core/clock.ts';
import { emit } from '../core/events.ts';
import { rint, rnd, rng } from '../core/rng.ts';
import { nextCreatureId, type CreatureId, type PropId, type VisitorId } from '../core/ids.ts';
import { BLOCK, I, KIND, Kind, inB, addProp, propById, props, rebuildBlock, removeProp, type Prop } from '../world/grid.ts';
import { gateById } from '../world/park.ts';
import { byId, nowTick, visitors } from './visitor.ts';
import { R_STARTLE, gatherThreats, threatTo } from './creatures-threats.ts';

export type CreatureKind = 'pigeon' | 'dog' | 'pomeranian';
/** 03 3.5. */
export type Creature = {
  id: CreatureId; kind: CreatureKind; x: number; y: number; z: number; face: -1 | 1;
  st: string; t: number; tx: number; ty: number; ownerId: VisitorId; targetId: number;
  perchPropId: PropId; carry: 'hat' | 'purse' | 'baguette' | 'iceCream' | null; cdUntil: number; outside: boolean;
  driven?: true; dest?: XY; // S7: the player's pigeon or Pompon (dest: where Pompon runs); present only while possessed, so the hash does not see them
};

/* ---------- numbers (register 3.3; 02 5.4, 11.2, 11.3; 06 1.4, 1.5, 1.6, 1.8) ---------- */
export const CAP_PIGEONS = 12;
export const CAP_DOGS = 4; // the pomeranian included
export const PIGEONS_START = 6;
export const PIGEON_TOPUP_STEPS = 5400; // 90 s
export const SPD_PIGEON_WALK = 1.2;
export const SPD_PIGEON_FLY = 6.0;
export const SPD_DOG = 3.0;
export const SCATTER_T = 3; // s
export const SCATTER_D = 3; // tiles
export const R_CRUMBS_ATTRACT = 10;
export const CAP_PIGEONS_PER_CRUMBS = 5;
export const PECK_T = 4; // s per crumb
export const CRUMBS_LIFE_STEPS = 3600; // 60 s
export const GATHERING_N = 3;
export const DOG_LEAD = 1; // tiles behind the walker
/** Perch heights in EH units by prop kind (04 6.1 heights: a lamp's head, a bench seat, a fountain rim, a tree crown). */
const PERCH_Z: Readonly<Record<string, number>> = { lamp: 1.65, bench: 0.45, fountain: 0.9, tree: 2.2 };

/* ---------- state ---------- */
export const creatures: Creature[] = [];
const index = new Map<CreatureId, Creature>();
let gathered: number[] = []; // crumbs props whose gathering was announced

export function creatureById(id: CreatureId): Creature | undefined {
  return index.get(id);
}
export function count(kind: CreatureKind): number {
  let n = 0;
  for (const c of creatures) if (c.kind === kind) n++;
  return n;
}
/** Dogs in the park's count: walkers' dogs and the pomeranian (register 3.3). */
export function dogCount(): number {
  return count('dog') + count('pomeranian');
}

function add(c: Omit<Creature, 'id'>): Creature {
  const r = { id: nextCreatureId(), ...c } as Creature;
  creatures.push(r);
  index.set(r.id, r);
  return r;
}
function remove(c: Creature): void {
  const k = creatures.indexOf(c);
  if (k >= 0) creatures.splice(k, 1);
  index.delete(c.id);
}
function blank(kind: CreatureKind, x: number, y: number): Omit<Creature, 'id'> {
  return { kind, x, y, z: 0, face: 1, st: 'idle', t: 0, tx: x, ty: y, ownerId: 0, targetId: 0, perchPropId: 0, carry: null, cdUntil: 0, outside: false };
}

/** An open in-park tile (walkable ground: not water, not a bed, not occupied). */
function open(x: number, y: number): boolean {
  rebuildBlock();
  const rx = Math.round(x), ry = Math.round(y);
  return inB(rx, ry) && BLOCK[I(rx, ry)] === 0;
}

/** A random open tile within `r` of (x, y), up to 8 tries on the sim stream (2 draws each); null when none was found. */
function openAround(x: number, y: number, r: number): XY | null {
  for (let k = 0; k < 8; k++) {
    const tx = Math.round(x + rnd(-r, r)), ty = Math.round(y + rnd(-r, r));
    if (open(tx, ty)) return { x: tx, y: ty };
  }
  return null;
}

/* ---------- spawning (GV seedCritters 1753) ---------- */

/** A pigeon flying in from over the river to a lawn tile in the north of the park (02 11.2 item 1), or null at 12. */
export function spawnPigeon(): Creature | null {
  if (count('pigeon') >= CAP_PIGEONS) return null;
  const x = rint(4, 43);
  const to = openAround(x, 8, 6) ?? { x, y: 8 };
  const c = add({ ...blank('pigeon', x, -2), z: 1.5, st: 'fly', tx: to.x, ty: to.y });
  c.face = to.x - to.y < c.x - c.y ? -1 : 1;
  return c;
}

/** A pigeon on the ground near (x, y) (a new park's six round the fountain), or null at 12. */
export function spawnPigeonAt(x: number, y: number): Creature | null {
  if (count('pigeon') >= CAP_PIGEONS) return null;
  const at = openAround(x, y, 6) ?? { x, y };
  return add({ ...blank('pigeon', at.x, at.y), st: 'peck', t: rnd(1, 4) });
}

/** A dog walker's dog, on a lead beside its walker, or null at 4 dogs (the pomeranian counts). */
export function spawnDog(ownerId: VisitorId): Creature | null {
  const o = byId(ownerId);
  if (!o || dogCount() >= CAP_DOGS) return null;
  return add({ ...blank('dog', o.x, o.y), st: 'walk', ownerId });
}

/** The pomeranian's record: it exists from the start and waits outside the south-west gate until S6 calls it in (02 11.3 item 2). */
export function thePomeranian(): Creature {
  for (const c of creatures) if (c.kind === 'pomeranian') return c;
  const o = gateById('g_south_w').outside;
  return add({ ...blank('pomeranian', o.x, o.y), outside: true });
}

/** A new park's creatures: six pigeons round the fountain, then the pomeranian's record (draws: the pigeons' spots and timers). */
export function seedCreatures(): void {
  resetCreatures();
  for (let k = 0; k < PIGEONS_START; k++) spawnPigeonAt(23.5, 23.5);
  thePomeranian();
}

/** The planning tick's top-up (03 4.3 item 4): one more pigeon every 90 s while below 12. */
export function topUpPigeons(tick: number): void {
  if (tick > 0 && tick % PIGEON_TOPUP_STEPS === 0) spawnPigeon();
}

/* ---------- crumbs (02 11.2 item 3) ---------- */

/** The feed-pigeons routine drops crumbs on (x, y): a new crumbs prop with 1-3 crumbs, or more crumbs (to 3) on the one already there. */
export function dropCrumbs(x: number, y: number, ownerId: VisitorId): void {
  if (!open(x, y) || KIND[I(x, y)] === Kind.pond || KIND[I(x, y)] === Kind.canal) return;
  const until = nowTick() + CRUMBS_LIFE_STEPS;
  const here = props.find((p) => p.kind === 'crumbs' && p.x === x && p.y === y);
  if (here) {
    here.data.stock = Math.min(3, (here.data.stock ?? 0) + rint(1, 3));
    here.untilTick = until;
    return;
  }
  addProp({ kind: 'crumbs', x, y, w: 1, h: 1, rot: 0, placedBy: 'sim', untilTick: until, data: { stock: rint(1, 3), ownerId } });
}

function dropCrumbsProp(p: Prop): void {
  removeProp(p.id);
  gathered = gathered.filter((id) => id !== p.id); // the id is free again
}

/**
 * The crumbs `c` walks or flies to, or pecks: the crumbs prop its targetId names, if it lies at the spot `c` was sent to (nextPigeon aims
 * within 0.3 of it). Crumbs that went (stock 0, 60 s, the remove tool) leave their PropId free (03 3.1), and new crumbs elsewhere can take
 * it: those are not `c`'s, so `c` neither pecks them from where it is nor counts toward their 5 or their gathering.
 */
function targetCrumbs(c: Creature): Prop | undefined {
  if (c.targetId === 0) return undefined;
  const p = propById(c.targetId);
  return p?.kind === 'crumbs' && Math.abs(p.x - c.tx) <= 0.5 && Math.abs(p.y - c.ty) <= 0.5 ? p : undefined;
}

/* ---------- scatter (02 11.2 item 5) ---------- */

function onGround(c: Creature): boolean {
  return c.kind === 'pigeon' && (c.st === 'walk' || c.st === 'peck' || c.st === 'idle' || c.st === 'wait');
}

/** A pigeon on the ground flies 3 tiles away from (fx, fy) for 3 s. */
function scatter(c: Creature, fx: number, fy: number): void {
  let dx = c.x - fx, dy = c.y - fy;
  const d = Math.hypot(dx, dy);
  if (d < 1e-3) {
    dx = 1;
    dy = 0;
  } else {
    dx /= d;
    dy /= d;
  }
  c.tx = Math.min(47, Math.max(0, c.x + dx * SCATTER_D));
  c.ty = Math.min(47, Math.max(0, c.y + dy * SCATTER_D));
  c.st = 'scatter';
  c.t = SCATTER_T;
  c.targetId = 0;
  emit({ kind: 'scatter', tick: nowTick(), x: c.x, y: c.y, ids: [c.id] });
}

/** Every pigeon on the ground within `r` of (x, y) scatters (m_flock, S6; the jogger, dog and child triggers below). */
export function scatterNear(x: number, y: number, r: number): void {
  for (const c of creatures) if (onGround(c) && Math.hypot(c.x - x, c.y - y) <= r) scatter(c, x, y);
}

/** Fog (m_fog, S6): every pigeon perches until `until` (T.abs) wherever it is (02 11.2 item 5). */
export function perchAll(until: number): void {
  for (const c of creatures) {
    if (c.kind !== 'pigeon') continue;
    c.st = 'perch';
    c.cdUntil = until;
    c.t = 0;
  }
}

/* ---------- the swoop (m_pigeon, 02 9.3) ---------- */

export const POOP_T = 0.5; // s: the landing beat of a possessed swoop (S7), then `startled` for STARTLED_POOP_T
export const STARTLED_POOP_T = 1;
export const STARTLED_T = 2; // s: a possessed pigeon with a threat close by (a dog within 2: 02 10.4)
export const DRINK_T = 3;
export const SWOOP_REACH = 0.45; // tiles from the visitor's head at which the pigeon lands the poop
export const SWOOP_FOG_DELAY = 2; // s: in fog the pigeon takes longer (it was perched, 02 9.3)
const SWOOP_Z = 1.1; // EH: head height in flight

/** abilities-mischief.ts hands in what happens on arrival (the poop lands); entities cannot import play/ (03 2.1). */
export type SwoopHook = (pigeon: Creature, victim: VisitorId) => void;
let swoopHook: SwoopHook = () => {};
export function setSwoopHook(fn: SwoopHook): void {
  swoopHook = fn;
}

/** The pigeon not already swooping nearest to (x, y), or null: the one m_pigeon sends (02 9.3 "the nearest pigeon"). */
export function nearestFreePigeon(x: number, y: number): Creature | null {
  let best: Creature | null = null, bd = Infinity;
  for (const c of creatures) {
    if (c.kind !== 'pigeon' || c.st === 'swoop') continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** Send `c` at `victim` after `delay` s; it follows the visitor wherever they go. */
export function startSwoop(c: Creature, victim: VisitorId, delay = 0): void {
  c.st = 'swoop';
  c.ownerId = victim;
  c.targetId = 0;
  c.perchPropId = 0;
  c.cdUntil = 0;
  c.t = delay;
  c.tx = c.x;
  c.ty = c.y;
}

function swoopStep(c: Creature, dt: number): void {
  if (c.t > 0) {
    c.t -= dt; // perched a little longer in fog
    return;
  }
  const v = byId(c.ownerId);
  if (!v) {
    c.ownerId = 0;
    c.st = 'fly'; // the visitor left before the pigeon came
    const to = openAround(c.x, c.y, 8);
    c.tx = to ? to.x : c.x;
    c.ty = to ? to.y : c.y;
    return;
  }
  c.tx = v.x;
  c.ty = v.y;
  c.z += (SWOOP_Z - c.z) * Math.min(1, dt * 5);
  if (Math.hypot(v.x - c.x, v.y - c.y) > SWOOP_REACH) {
    moveTo(c, SPD_PIGEON_FLY, dt, true);
    return;
  }
  swoopHook(c, v.id);
  c.ownerId = 0;
  if (c.driven) {
    c.st = 'poop'; // the player's pigeon stays where it landed: the beat, then startled (stepPigeon), then wait
    c.t = POOP_T;
    return;
  }
  const to = openAround(c.x, c.y, 8);
  c.st = 'fly';
  c.tx = to ? to.x : c.x;
  c.ty = to ? to.y : c.y;
  emit({ kind: 'fly', tick: nowTick(), x: c.x, y: c.y, ids: [c.id] });
}

/* ---------- the pigeon (GV updateCritters 2299 shape) ---------- */

/** Move toward (tx, ty) at `speed` tiles/s; true on arrival. A walker stops at a blocked tile (a flyer does not). */
function moveTo(c: Creature, speed: number, dt: number, fly: boolean): boolean {
  const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
  if (d < 0.05) return true;
  const step = Math.min(d, speed * dt);
  const nx = c.x + (dx / d) * step, ny = c.y + (dy / d) * step;
  if (!fly && !open(nx, ny)) return true;
  c.x = nx;
  c.y = ny;
  c.face = dx - dy < 0 ? -1 : 1;
  return step >= d;
}

/** Crumbs within 10 tiles with room for one more pigeon (at most 5 each), nearest first; null when none. */
function crumbsFor(c: Creature): Prop | null {
  let best: Prop | null = null, bd = R_CRUMBS_ATTRACT;
  for (const p of props) {
    if (p.kind !== 'crumbs') continue;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d > bd) continue;
    let n = 0;
    for (const o of creatures) if (o.targetId === p.id && targetCrumbs(o) === p) n++;
    if (n < CAP_PIGEONS_PER_CRUMBS) {
      best = p;
      bd = d;
    }
  }
  return best;
}

/** The next thing a pigeon does when its timer runs out (sim draws): crumbs first, else walk, peck, perch or fly somewhere. */
function nextPigeon(c: Creature): void {
  c.perchPropId = 0;
  if (c.driven) {
    c.st = 'wait'; // the player decides (S7)
    c.targetId = 0;
    return;
  }
  const cr = crumbsFor(c);
  if (cr) {
    c.targetId = cr.id;
    c.tx = cr.x + rnd(-0.3, 0.3);
    c.ty = cr.y + rnd(-0.3, 0.3);
    c.st = Math.hypot(cr.x - c.x, cr.y - c.y) > 3 ? 'fly' : 'walk';
    return;
  }
  c.targetId = 0;
  const r = rng();
  if (r < 0.55) {
    const to = openAround(c.x, c.y, 3);
    if (to) {
      c.st = 'walk';
      c.tx = to.x + rnd(-0.3, 0.3);
      c.ty = to.y + rnd(-0.3, 0.3);
      return;
    }
  } else if (r < 0.88) {
    const perches = props.filter((p) => PERCH_Z[p.kind] !== undefined && Math.hypot(p.x - c.x, p.y - c.y) <= 8);
    if (r < 0.75 || perches.length === 0) {
      c.st = 'peck';
      c.t = rnd(2, 5);
      emit({ kind: 'peck', tick: nowTick(), x: c.x, y: c.y, ids: [c.id] });
      return;
    }
    const p = perches[rint(0, perches.length - 1)] as Prop;
    c.st = 'fly';
    c.perchPropId = p.id;
    c.tx = p.x + (p.w - 1) / 2;
    c.ty = p.y + (p.h - 1) / 2;
    emit({ kind: 'fly', tick: nowTick(), x: c.x, y: c.y, ids: [c.id] });
    return;
  }
  const to = openAround(c.x, c.y, 8);
  c.st = to ? 'fly' : 'peck';
  c.t = rnd(2, 5);
  if (to) {
    c.tx = to.x;
    c.ty = to.y;
    emit({ kind: 'fly', tick: nowTick(), x: c.x, y: c.y, ids: [c.id] });
  }
}

/** A pigeon lands: on its perch, at its crumbs (pecking, and maybe a gathering), or on the ground to decide again. */
function land(c: Creature): void {
  const perch = c.perchPropId ? propById(c.perchPropId) : undefined;
  if (perch) {
    c.st = 'perch';
    c.z = PERCH_Z[perch.kind] ?? 1.2; // the AI perches only where PERCH_Z has a height; a possessed pigeon may also take the bandstand
    c.t = rnd(8, 20);
    return;
  }
  c.z = 0;
  const cr = targetCrumbs(c);
  if (cr) {
    c.st = 'peck';
    c.t = PECK_T;
    let n = 0;
    for (const o of creatures) if (o.targetId === cr.id && o.st === 'peck' && targetCrumbs(o) === cr) n++;
    const first = n >= GATHERING_N && !gathered.includes(cr.id);
    if (first) gathered.push(cr.id);
    emit({ kind: 'peck', tick: nowTick(), x: c.x, y: c.y, ids: [c.id], params: first ? { feed: 'feed.pigeons' } : undefined });
    return;
  }
  c.targetId = 0;
  c.st = 'walk';
  c.t = 0;
}

function stepPigeon(c: Creature, dt: number): void {
  if (c.cdUntil > 0) {
    if (T.abs < c.cdUntil) return; // perched out a fog (S6)
    c.cdUntil = 0;
  }
  if (onGround(c)) {
    const th = threatTo(c, c.driven ? R_STARTLE : Infinity); // the player's pigeon minds only what is within 2 tiles (02 10.4)
    if (th) {
      if (c.driven) {
        c.st = 'startled'; // the player's pigeon flutters in place: its order is lost, not thrown 3 tiles away (02 10.4)
        c.t = STARTLED_T;
        c.targetId = 0;
      } else scatter(c, th.x, th.y);
      return;
    }
    if (!open(c.x, c.y)) {
      const to = openAround(c.x, c.y, 3); // a tool made its tile blocked: off it goes
      if (to) {
        c.st = 'fly';
        c.tx = to.x;
        c.ty = to.y;
      }
      return;
    }
  }
  switch (c.st) {
    case 'fly':
    case 'flyDrink':
      c.z += ((c.perchPropId ? 1.8 : 1.2) - c.z) * Math.min(1, dt * 4);
      if (!moveTo(c, SPD_PIGEON_FLY, dt, true)) return;
      if (c.st === 'fly') land(c);
      else {
        c.z = 0; // a possessed pigeon at the water's edge (S7)
        c.st = 'drink';
        c.t = DRINK_T;
      }
      return;
    case 'wait':
      if (!c.driven) nextPigeon(c); // the player let go: the AI decides
      return;
    case 'poop':
    case 'startled':
    case 'drink':
      c.t -= dt;
      c.z -= c.z * Math.min(1, dt * 4);
      if (c.t > 0) return;
      if (c.st === 'poop') {
        c.st = 'startled';
        c.t = STARTLED_POOP_T;
      } else nextPigeon(c);
      return;
    case 'swoop':
      swoopStep(c, dt);
      return;
    case 'scatter':
      c.t -= dt;
      c.z = Math.sin(Math.max(0, Math.min(1, 1 - c.t / SCATTER_T)) * Math.PI) * 1.2;
      moveTo(c, SCATTER_D / SCATTER_T, dt, true);
      if (c.t <= 0) {
        c.z = 0;
        c.st = 'walk';
        c.tx = c.x;
        c.ty = c.y;
        if (!open(c.x, c.y)) {
          const to = openAround(c.x, c.y, 3);
          if (to) {
            c.st = 'fly';
            c.tx = to.x;
            c.ty = to.y;
          }
        }
      }
      return;
    case 'walk':
      if (moveTo(c, SPD_PIGEON_WALK, dt, false)) {
        if (c.targetId) land(c);
        else nextPigeon(c);
      }
      return;
    case 'peck': {
      c.t -= dt;
      if (c.t > 0) return;
      const cr = targetCrumbs(c);
      if (cr) {
        cr.data.stock = (cr.data.stock ?? 1) - 1; // one crumb a peck (02 11.2 item 3)
        if ((cr.data.stock ?? 0) <= 0) dropCrumbsProp(cr);
        else if (!c.driven) {
          c.t = PECK_T; // one crumb a peck; the player's pigeon pecks once (02 10.4 3b)
          return;
        }
      }
      nextPigeon(c);
      return;
    }
    case 'perch':
      c.t -= dt;
      if ((c.t <= 0 && !c.driven) || (c.perchPropId !== 0 && !propById(c.perchPropId))) {
        const to = openAround(c.x, c.y, 6);
        c.perchPropId = 0;
        c.st = to ? 'fly' : 'walk';
        if (to) {
          c.tx = to.x;
          c.ty = to.y;
        } else c.z = 0;
      }
      return;
    default:
      nextPigeon(c);
  }
}

/* ---------- the dog on a lead (GV dogStep 1863, "with its person by day") ---------- */

function stepDog(c: Creature, dt: number): boolean {
  const o = byId(c.ownerId);
  if (!o) return false; // its walker left the park: so does the dog
  let dx = c.x - o.x, dy = c.y - o.y;
  const d = Math.hypot(dx, dy);
  if (d > 4) {
    c.x = o.x; // its walker was moved off a blocked tile: the lead brings it along
    c.y = o.y;
    return true;
  }
  if (d < 1e-3) {
    dx = 0;
    dy = 1;
  } else {
    dx /= d;
    dy /= d;
  }
  c.tx = o.x + dx * DOG_LEAD;
  c.ty = o.y + dy * DOG_LEAD;
  const moving = Math.hypot(c.tx - c.x, c.ty - c.y) > 0.1;
  c.st = moving ? 'walk' : 'idle';
  if (moving) moveTo(c, SPD_DOG, dt, true);
  return true;
}

/* ---------- phase 9 (03 4.2) ---------- */

/** Phase 9 of a step: crumbs that ran out of time go; each walker's dog comes and goes with it; dogs follow; pigeons live. */
export function stepCreatures(dt: number): void {
  const tick = nowTick();
  for (let k = props.length - 1; k >= 0; k--) {
    const p = props[k] as Prop;
    if (p.kind === 'crumbs' && p.untilTick > 0 && tick >= p.untilTick) dropCrumbsProp(p);
  }
  for (const v of visitors) {
    if (v.archetype !== 'dogwalker') continue;
    if (!creatures.some((c) => c.kind === 'dog' && c.ownerId === v.id)) spawnDog(v.id);
  }
  for (let k = creatures.length - 1; k >= 0; k--) {
    const c = creatures[k] as Creature;
    if (c.outside || c.kind !== 'dog') continue;
    if (!stepDog(c, dt)) remove(c);
  }
  gatherThreats(creatures); // after the dogs moved, as the pigeons see them
  for (const c of creatures) if (c.kind === 'pigeon') stepPigeon(c, dt);
}

/* ---------- state ---------- */

export function creaturesState(): Creature[] {
  return JSON.parse(JSON.stringify(creatures)) as Creature[];
}
export function setCreaturesState(list: readonly Creature[]): void {
  creatures.length = 0;
  index.clear();
  for (const r of list) {
    const c = JSON.parse(JSON.stringify(r)) as Creature;
    creatures.push(c);
    index.set(c.id, c);
  }
}
/** The crumbs props whose gathering was announced (saved with the schedulers, store.ts). */
export function gatheredState(): number[] {
  return gathered.slice();
}
export function setGatheredState(s: readonly number[]): void {
  gathered = s.slice();
}
export function resetCreatures(): void {
  creatures.length = 0;
  index.clear();
  gathered = [];
}
