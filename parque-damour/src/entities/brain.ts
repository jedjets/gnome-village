// src/entities/brain.ts
// The decide ladder (02 5.2; register 3.4) and the archetype routines (02 4.3); sets v.st and v.job and hands the rest to act.ts.
// Ported from GV 4816-4945 (decide: the ladder shape, each rung returns on dispatch; BUSY first, then the needs, then the work, then a
// wander round the green) and 4742-4780 (childPlay: a child's own list, a chase at 22 % per decision, following the grown-ups).
// Verdict: ADAPT. Changes: the rungs are exactly 02 5.2 (0 busy, 1 an embarrassment reaction, 2 shelter, 3 leave, 4 eat, 5 rest, 6 the
// romance step, 7 the archetype routine, 8 wander) instead of GV's 44 work and need rules; rung 6 is a call into romance.ts that S5 fills
// (romanceStep); the routines of 02 4.3 pick an activity by weight on the sim stream and keep it until act.ts ends it (an activity in
// progress is continued, so a re-decision every 0.5-1.3 s does not flip it; GV re-decided its errands from scratch); children run rungs
// 0-3 by following the parent, then their own list (02 5.2 last line; GV childPlay); staff skip the visitor needs (06 5.2: staff have no
// needs that matter); the gardener shelters at a kiosk in rain above 0.6, paves the pending run, tidies a bed every 120 s, and patrols the
// outer loop; a vendor serves. Weights 02 4.3 does not give (the family's three activities) are play 50, kiosk 25, pond 25 (assumption).
// Dropped from the range: 4818-4823 (marks, riders, carrying, fights), 4826-4837 (supper, flee), 4843-4853 (bedtime, babies), 4859-4945's
// work (fire, flyer, mines, winter stores, boats, crossings, projects, gardens, hives, animals, sites, wood, fibre, stone, workshops,
// fishing, pats, trips), and childPlay's dance, story, snow, paddle, tag, hide, stones and hat-boat games.
import type { XY } from '../core/math.ts';
import { DAYLEN, T } from '../core/clock.ts';
import { rint, rnd, rng } from '../core/rng.ts';
import type { GateId } from '../core/ids.ts';
import { weatherAt } from '../core/weather.ts';
import { inB, propById, type Prop } from '../world/grid.ts';
import { gateById } from '../world/park.ts';
import { blockedFor, NO_SPACE } from './move.ts';
import { walkable } from './astar.ts';
import { SHELTERED } from './needs.ts';
import { formStep, leaving, pairOf, partnerOf, romanceStep } from './romance.ts';
import { actRomance } from './act-romance.ts';
import { creatures } from './creatures.ts';
import { TIDY_EVERY, facilities, freeSeats, nearestTile, paveAdvance, paveNext, servingTile, tileXY, vendorFor } from './staff.ts';
import {
  act, finish, lapsOf, release, startKiosk, startLeave, startLeaveNearest, startLoop, startSeat, startShelter, startWalk,
} from './act.ts';
import { byId, setBrain, visitors, type EmbKind, type Visitor } from './visitor.ts';

export { NO_SPACE, SHELTERED };

/** The reaction state and its length for each embarrassment (02 6.4); S5 adds the states to act.ts. */
export const REACTION: Readonly<Record<EmbKind, readonly [string, number]>> = {
  poop: ['wipe', 4], soaked: ['shake', 3], trip: ['stumble', 3], snatched: ['chase', 8], wasp: ['flap', 6],
  drenched: ['huddle', 5], rival: ['distracted', 30], mime: ['baffled', 4], fog: ['lost', 60], flock: ['duck', 5],
};

/** 02 5.3 BUSY: every reaction state and the states listed there; a visitor in one is not re-decided (rung 0). */
export const BUSY: Readonly<Record<string, true>> = {
  wipe: true, shake: true, stumble: true, chase: true, huff: true, flap: true, huddle: true, distracted: true, baffled: true, lost: true, duck: true,
  eat: true, sit: true, read: true, feed: true, chat: true, bench: true, stroll: true, picnic: true, kiss: true, proposal: true, boat: true,
  photo: true, paint: true, play: true, pave: true, tidy: true, serve: true, shelter: true, goLeave: true, laugh: true,
  hand: true, pick: true, scatter: true, // the flower seller avatar's three holds (S7, act-romance.ts)
};
/** 02 5.3 CAN_INTERRUPT (GV CAN_HELP 4564): what a romance stage start (S5) or the matchmaker (S7) may pull a visitor out of. */
export const CAN_INTERRUPT: Readonly<Record<string, true>> = {
  idle: true, wander: true, strollLoop: true, goBench: true, goKiosk: true, goSit: true, goEat: true, watch: true,
};

/* ---------- numbers (02 5.2, 4.3; 06 1.6) ---------- */
export const RAIN_SHELTER = 0.6;
export const COMFORT_SHELTER = 0.3;
export const COMFORT_LEAVE = 0.1;
export const HUNGER_EAT = 0.6;
export const ENERGY_REST = 0.25;
export const R_SHELTER = 20;
export const R_KIOSK = 30;
export const R_REST_BENCH = 15;
export const R_WANDER = 6;
export const R_CHILD_CHASE_PIGEON = 5;
export const CHILD_CHASE = 0.22; // per decision (GV childPlay 4754)
export const KIOSK_QUEUE = 2; // a third customer goes elsewhere (02 4.3 vendor)
export const STAFF_REACTION_MAX = 4; // s (04 9.3 rules; 02 13 T9)

/* ---------- lookups ---------- */

function dist(v: XY, x: number, y: number): number {
  return Math.hypot(x - v.x, y - v.y);
}

/** The prop of `list` nearest to `v` within `r` that `ok` accepts and that `v` does not remember as out of reach; null when none. */
function nearestProp(v: Visitor, list: readonly Prop[], r: number, ok: (p: Prop) => boolean): Prop | null {
  let best: Prop | null = null, bd = r;
  for (const p of list) {
    const d = dist(v, p.x, p.y);
    if (d > bd || !ok(p) || blockedFor(v, p.x, p.y)) continue;
    best = p;
    bd = d;
  }
  return best;
}

function customers(k: Prop): number {
  let n = 0;
  for (const o of visitors) if (o.job.propId === k.id && (o.st === 'goKiosk' || o.st === 'goEat' || o.st === 'eat')) n++;
  return n;
}

/** A kiosk with its vendor and fewer than two customers, nearest within `r`. */
function kioskNear(v: Visitor, r: number): Prop | null {
  return nearestProp(v, facilities().kiosks, r, (k) => vendorFor(k.id) !== 0 && customers(k) < KIOSK_QUEUE);
}

function benchNear(v: Visitor, r: number, seats = 1): Prop | null {
  return nearestProp(v, facilities().benches, r, (b) => freeSeats(b) >= seats);
}

/** A random tile of `list` within `r` of `v` (one draw), else the nearest; -1 when the list is empty. */
function tileNear(v: Visitor, list: readonly number[], r: number): number {
  const near = list.filter((i) => dist(v, i % 48, (i / 48) | 0) <= r);
  if (near.length > 0) return near[rint(0, near.length - 1)] as number;
  return nearestTile(list, v.x, v.y);
}

/** A loop to walk: one of the two that still have their gravel (one draw when both do), or -1. */
function pickLoop(prefer = -1): number {
  const ok = facilities().loops;
  if (prefer >= 0 && ok[prefer]) return prefer;
  if (ok[0] && ok[1]) return rng() < 0.5 ? 0 : 1;
  return ok[0] ? 0 : ok[1] ? 1 : -1;
}

/** The tiles of `list` that `v` does not remember as out of reach (move.ts blockedFor). */
function reachable(v: Visitor, list: readonly number[]): number[] {
  return list.filter((i) => !blockedFor(v, i % 48, (i / 48) | 0));
}

function avoidGate(v: Visitor): (g: GateId) => boolean {
  return (g) => {
    const o = gateById(g).outside;
    return blockedFor(v, o.x, o.y);
  };
}

/** Pick by weight (02 4.3) with one draw. */
function pick<K extends string>(table: ReadonlyArray<readonly [K, number]>): K {
  let total = 0;
  for (const [, w] of table) total += w;
  let u = rng() * total;
  for (const [k, w] of table) {
    if (u < w) return k;
    u -= w;
  }
  return (table[table.length - 1] as readonly [K, number])[0];
}

/* ---------- rungs 1-5 and 8 (02 5.2) ---------- */

/** Rung 1: an embarrassment landed this tick: its reaction state (02 6.4). The possessed actor takes it too (avatar.ts avatarDecide). */
export function reactionRung(v: Visitor): boolean {
  const k = v.pendingEmb;
  if (!k) return false;
  release(v);
  const [st, t] = REACTION[k];
  const p = pairOf(v), o = p ? partnerOf(p, v) : undefined;
  v.st = st;
  v.t = v.archetype === 'gardener' || v.archetype === 'vendor' ? Math.min(t, STAFF_REACTION_MAX) : t; // staff react 4 s at most (04 9.3, 02 T9)
  v.job = st === 'lost' && o ? { visitorId: o.id } : {}; // a lost visitor stops when the partner is near (act-romance.ts)
  v.path = null;
  v.pendingEmb = null;
  return true;
}

/** Rung 2: heavy rain and low comfort: the nearest shelter tile within 20, else home (02 5.2). */
function shelterRung(v: Visitor): boolean {
  if (weatherAt(Math.round(v.x), Math.round(v.y)).rain <= RAIN_SHELTER || v.comfort >= COMFORT_SHELTER) return false;
  const i = nearestTile(reachable(v, facilities().shelter), v.x, v.y, R_SHELTER);
  release(v);
  if (i < 0) startLeaveNearest(v, avoidGate(v));
  else {
    const t = tileXY(i);
    startShelter(v, t.x, t.y);
  }
  return true;
}

/** Rung 3: the visit is over or comfort is gone: out by the nearest gate; a couple leaves together by one gate (02 4.3 couple item 4). */
function leaveRung(v: Visitor): boolean {
  if (T.abs < v.leaveAt && v.comfort >= COMFORT_LEAVE) return false;
  const along = leaving(v); // a pair from stage 2 leaves together, else v alone (02 6.5 "other dissolutions")
  const p = v.coupleOf ? byId(v.coupleOf) : along;
  release(v);
  if (p && p.st === 'goLeave' && p.gateOut) startLeave(v, p.gateOut);
  else startLeaveNearest(v, avoidGate(v));
  if (p && p.st !== 'goLeave' && v.gateOut) {
    release(p);
    startLeave(p, v.gateOut);
  }
  return true;
}

/** Rung 4: hungry: the nearest kiosk within 30, else a snack on the nearest free bench (a jogger never sits: 07 S4.7 item 3). */
function eatRung(v: Visitor): boolean {
  if (v.hunger <= HUNGER_EAT) return false;
  if (v.st === 'goEat' || v.st === 'goKiosk' || (v.st === 'goSit' && v.job.kind === 'snack')) return true;
  const k = kioskNear(v, R_KIOSK);
  if (k) {
    release(v);
    return startKiosk(v, k, 'goEat');
  }
  if (v.archetype === 'jogger') return false;
  const b = benchNear(v, Infinity);
  if (!b) return false;
  release(v);
  return startSeat(v, b, 'goSit', 'snack', 0);
}

/** Rung 5: tired and a free bench within 15: sit until energy 0.45 or 90 s (02 5.2). */
function restRung(v: Visitor): boolean {
  if (v.energy >= ENERGY_REST || v.archetype === 'jogger') return false;
  if (v.st === 'goSit' && v.job.kind === 'rest') return true;
  const b = benchNear(v, R_REST_BENCH);
  if (!b) return false;
  release(v);
  return startSeat(v, b, 'goSit', 'rest', 90);
}

/** Rung 8: nothing to do: a walk to an open tile within 6, then an idle of 2-5 s (02 5.2). */
function wanderRung(v: Visitor): void {
  release(v);
  for (let k = 0; k < 6; k++) {
    const x = Math.round(v.x + rnd(-R_WANDER, R_WANDER)), y = Math.round(v.y + rnd(-R_WANDER, R_WANDER));
    if (!inB(x, y) || !walkable(x, y, v) || blockedFor(v, x, y)) continue;
    startWalk(v, 'wander', { kind: 'wander' }, x, y);
    return;
  }
  finish(v);
}

/* ---------- rung 7: the routines (02 4.3) ---------- */

function single(v: Visitor): boolean {
  const what = pick([['stroll', v.social > 0.6 ? 70 : 35], ['bench', 20], ['kiosk', 15], ['feed', 15], ['read', 15]] as const);
  if (what === 'stroll') {
    const l = pickLoop();
    if (l < 0) return false;
    startLoop(v, l);
    return true;
  }
  if (what === 'kiosk') {
    const k = kioskNear(v, Infinity);
    return !!k && startKiosk(v, k, 'goKiosk');
  }
  const b = benchNear(v, Infinity);
  if (!b) return false;
  if (what === 'bench') return startSeat(v, b, 'goBench', 'sit', rnd(20, 60));
  return startSeat(v, b, 'goBench', what, 40);
}

/** Free the second of a couple (or an elder's chess partner) for a shared activity: not when busy or seated elsewhere. */
function free(o: Visitor | undefined): o is Visitor {
  return !!o && !BUSY[o.st];
}

function couple(v: Visitor): boolean {
  const o = byId(v.coupleOf);
  if (!o) return single(v);
  if (v.id > o.id) {
    // the second follows the first's lead (02 4.3 couple: the lower id leads)
    if (o.st === 'strollLoop' && o.job.kind !== 'follow') {
      v.st = 'strollLoop';
      v.job = { kind: 'follow', visitorId: o.id };
      v.t = 0;
      return true;
    }
    const p = propById(o.job.propId ?? 0);
    if (p && (o.st === 'goBench' || o.st === 'sit' || o.st === 'goPicnic' || o.st === 'picnic') && freeSeats(p) > 0)
      return startSeat(v, p, o.st === 'goPicnic' || o.st === 'picnic' ? 'goPicnic' : 'goBench', 'with', 0, o.id);
    if (dist(v, o.x, o.y) > 2) startWalk(v, 'wander', { kind: 'follow', visitorId: o.id }, v.x, v.y);
    else finish(v, 1);
    return true;
  }
  const what = pick([['stroll', 50], ['bench', 30], ['picnic', T.season === 1 ? 30 : 20]] as const);
  if (what === 'stroll') {
    const l = pickLoop();
    if (l < 0) return false;
    startLoop(v, l);
    if (free(o)) {
      release(o);
      o.st = 'strollLoop';
      o.job = { kind: 'follow', visitorId: v.id };
      o.t = 0;
    }
    return true;
  }
  const spot =
    what === 'bench'
      ? benchNear(v, Infinity, 2)
      : nearestProp(v, [...facilities().picnics, ...facilities().tables], Infinity, (p) => freeSeats(p) >= 2);
  if (!spot) return false;
  const st = what === 'bench' ? 'goBench' : 'goPicnic';
  if (!startSeat(v, spot, st, what === 'bench' ? 'sit' : 'picnic', what === 'bench' ? rnd(30, 60) : rnd(40, 60))) return false;
  if (free(o)) {
    release(o);
    startSeat(o, spot, st, 'with', 0, v.id);
  }
  return true;
}

function family(v: Visitor): boolean {
  const what = pick([['play', 50], ['kiosk', 25], ['pond', 25]] as const);
  const f = facilities();
  if (what === 'kiosk') {
    const k = kioskNear(v, Infinity);
    return !!k && startKiosk(v, k, 'goKiosk');
  }
  const i = tileNear(v, what === 'play' ? f.lawnSpots : f.pondEdge, 12);
  if (i < 0) return false;
  const t = tileXY(i);
  startWalk(v, 'wander', { kind: what === 'play' ? 'lawn' : 'pond' }, t.x, t.y);
  return true;
}

/** A pigeon on the ground within 5 of the child and 6 of its parent (02 4.3 family item 2), or null. */
function pigeonToChase(v: Visitor, p: Visitor): number {
  for (const c of creatures)
    if (c.kind === 'pigeon' && (c.st === 'walk' || c.st === 'peck') && dist(v, c.x, c.y) <= R_CHILD_CHASE_PIGEON && dist(p, c.x, c.y) <= 6) return c.id;
  return 0;
}

/** A child (02 5.2 last line, 4.3 family): rungs 0-3 by the parent, then its own list; never far from the parent (act.ts keepNear). */
function child(v: Visitor): void {
  const p = byId(v.childOf);
  if (!p) {
    startLeaveNearest(v, avoidGate(v));
    return;
  }
  if (p.st === 'goLeave' && p.gateOut) {
    release(v);
    startLeave(v, p.gateOut);
    return;
  }
  if (p.st === 'shelter') {
    const at = p.job.tile ?? p;
    startShelter(v, at.x, at.y);
    return;
  }
  if (rng() < CHILD_CHASE) {
    const id = pigeonToChase(v, p);
    if (id) {
      v.st = 'play';
      v.job = { creatureId: id };
      v.t = rnd(4, 8);
      return;
    }
  }
  if (p.st === 'watch' && p.job.kind === 'play' && p.job.tile) {
    v.st = 'play';
    v.job = { kind: 'circle', tile: { x: p.job.tile.x, y: p.job.tile.y } };
    v.t = p.t;
    return;
  }
  if (p.st === 'watch' && p.job.kind === 'pond') {
    startWalk(v, 'wander', { kind: 'pond' }, p.x + 0.6, p.y);
    return;
  }
  if (dist(v, p.x, p.y) > 1.5) startWalk(v, 'wander', { kind: 'follow', visitorId: p.id }, v.x, v.y);
  else finish(v, 1);
}

function elder(v: Visitor): boolean {
  const what = pick([['bench', 50], ['feed', 30], ['chess', 20]] as const);
  if (what === 'chess') {
    // two elders at one cafe table, 90 s; no table or no second elder: the bench instead (02 4.3 elder item 3)
    const tbl = nearestProp(v, facilities().tables, Infinity, (t) => freeSeats(t) >= 2);
    const o = visitors.find((x) => x !== v && x.archetype === 'elder' && free(x) && x.sitPropId === 0 && x.st !== 'goLeave');
    if (tbl && o && startSeat(v, tbl, 'goSit', 'chess', 90)) {
      release(o);
      startSeat(o, tbl, 'goSit', 'chess', 90);
      return true;
    }
  }
  const b = benchNear(v, Infinity);
  if (!b) return false;
  return what === 'feed' ? startSeat(v, b, 'goBench', 'feed', 40) : startSeat(v, b, 'goBench', 'sit', rnd(60, 120));
}

/** A tourist's three viewpoints in order: the fountain, the bandstand if any, the north edge (02 4.3 tourist); `plan` is the next. */
function tourist(v: Visitor): boolean {
  const f = facilities();
  for (; v.plan < 3; v.plan++) {
    const list = v.plan === 0 ? f.viewFountain : v.plan === 1 ? f.viewBandstand : f.viewNorth;
    if (list.length === 0) continue;
    const t = tileXY(list[rint(0, list.length - 1)] as number);
    startWalk(v, 'wander', { kind: 'view' }, t.x, t.y);
    return true;
  }
  return false;
}

function artist(v: Visitor): boolean {
  if (v.plan > 0) {
    startLeaveNearest(v, avoidGate(v));
    return true;
  }
  const f = facilities();
  const lists = [f.viewFountain, f.viewBandstand, f.pondEdge, f.viewNorth].filter((l) => l.length > 0);
  if (lists.length === 0) return false;
  const list = lists[rint(0, lists.length - 1)] as number[];
  const t = tileXY(list[rint(0, list.length - 1)] as number);
  startWalk(v, 'wander', { kind: 'easel' }, t.x, t.y);
  return true;
}

function busker(v: Visitor): boolean {
  if (v.plan > 0) {
    startLeaveNearest(v, avoidGate(v));
    return true;
  }
  const f = facilities();
  const taken = (b: Prop): boolean => visitors.some((o) => o !== v && o.archetype === 'busker' && dist(o, b.x + 1, b.y + 1) < 4);
  const stand = f.bandstands.find((b) => !taken(b));
  const spot = stand ? nearestTile(f.viewBandstand, stand.x + 1, stand.y + 1, 3) : -1;
  const i = spot >= 0 ? spot : f.junctions.length > 0 ? (f.junctions[rint(0, f.junctions.length - 1)] as number) : -1;
  if (i < 0) return false;
  const t = tileXY(i);
  startWalk(v, 'wander', { kind: 'busk' }, t.x, t.y);
  return true;
}

/** A jogger's laps or a dog walker's loops (02 4.3): the outer loop for the jogger, either for the walker. */
function looper(v: Visitor): boolean {
  if (v.plan >= lapsOf(v)) {
    startLeaveNearest(v, avoidGate(v));
    return true;
  }
  const l = pickLoop(v.archetype === 'jogger' ? 1 : -1);
  if (l < 0) return false;
  startLoop(v, l);
  return true;
}

/** The gardener (02 4.3): shelter at a kiosk in rain above 0.6, the pending paving run, a bed tidied every 120 s, else the patrol. */
function gardenerDecide(v: Visitor): void {
  const f = facilities();
  if (weatherAt(Math.round(v.x), Math.round(v.y)).rain > RAIN_SHELTER) {
    const k = nearestProp(v, f.kiosks, Infinity, () => true);
    const s = k ? servingTile(k) : null;
    const i = s ? s.y * 48 + s.x : nearestTile(f.shelter, v.x, v.y);
    release(v);
    if (i >= 0) {
      const t = tileXY(i);
      startShelter(v, t.x, t.y);
      return;
    }
  }
  let next = paveNext();
  while (next && blockedFor(v, next.x, next.y)) {
    paveAdvance(); // a tile he could not reach: on to the next (02 11.1 item 5 lays the run in order)
    next = paveNext();
  }
  if (next) {
    release(v);
    startWalk(v, 'pave', { kind: 'pave', left: 0 }, next.x, next.y);
    return;
  }
  if (T.abs >= v.plan && f.bedNear.length > 0 && !(v.st === 'wander' && v.job.kind === 'tidy')) {
    const i = nearestTile(reachable(v, f.bedNear), v.x, v.y);
    if (i < 0) v.plan = T.abs + TIDY_EVERY / DAYLEN; // no bed in reach: the next tidy in 120 s
    else {
      release(v);
      const t = tileXY(i);
      startWalk(v, 'wander', { kind: 'tidy' }, t.x, t.y);
      return;
    }
  }
  if (v.st !== 'idle' || v.t > 0) return; // patrolling or walking to a bed: carry on
  const l = pickLoop(1);
  if (l >= 0) startLoop(v, l);
  else wanderRung(v);
}

/** Rung 7: the archetype's routine (02 4.3). An activity in progress carries on; an idle between activities waits it out. */
function routine(v: Visitor): boolean {
  if (v.archetype === 'single' && formStep(v)) return true; // pair formation while strolling or idle (02 4.3 single item 6, 6.1)
  if (v.st !== 'idle' || v.t > 0) return true;
  switch (v.archetype) {
    case 'single':
      return single(v);
    case 'couple':
      return couple(v);
    case 'family':
      return family(v);
    case 'elder':
      return elder(v);
    case 'tourist':
      return tourist(v);
    case 'artist':
      return artist(v);
    case 'busker':
      return busker(v);
    case 'jogger':
    case 'dogwalker':
      return looper(v);
    default:
      return false;
  }
}

/**
 * The decide ladder (02 5.2): the first rung that fires wins. Children and staff run their own short ladders (02 5.2 last line; 06 5.2).
 * Called by the cadence in visitor.ts (03 4.4), which already skips a BUSY visitor; rung 0 is kept here so a direct call obeys it too.
 */
export function decide(v: Visitor): void {
  if (BUSY[v.st]) return; // rung 0
  if (reactionRung(v)) return; // rung 1
  if (v.archetype === 'vendor') {
    if (propById(v.job.propId ?? 0)) v.st = 'serve';
    return;
  }
  if (v.archetype === 'gardener') {
    gardenerDecide(v);
    return;
  }
  if (v.archetype === 'child') {
    child(v);
    return;
  }
  if (v.archetype === 'cameo' && !v.spawnedForPlayer) return; // scripted by its ability (S6); the avatar's flower seller, once let go, lives on (S7)
  if (shelterRung(v)) return; // rung 2
  if (leaveRung(v)) return; // rung 3
  if (eatRung(v)) return; // rung 4
  if (restRung(v)) return; // rung 5
  if (romanceStep(v)) return; // rung 6
  if (routine(v)) return; // rung 7
  wanderRung(v); // rung 8
}

/** act.ts's states, with the romance and reaction states of act-romance.ts first (03 2.5). */
function actAll(v: Visitor, dt: number): void {
  if (!actRomance(v, dt)) act(v, dt);
}

setBrain({ decide, act: actAll, busy: BUSY });
