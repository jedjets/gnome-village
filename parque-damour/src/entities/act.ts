// src/entities/act.ts
// The state machine: every v.st string, its timer, and what it does when the timer ends or the walk arrives (03 2.5, 6.3 item 4).
// Ported from GV 4968-4987 (act: the switch, `wander` on arrival to idle, `follow`), 4999 (goEat), 5056-5061 (chat: a timer and its
// ends), 5186-5195 (goBed: walk to a door, then a state with a timer), 5227-5231 (goShelter, shelter), 5322 (skip: a child's hops round a
// spot), 5452-5458 (goPat, pat: arrive within reach, a timed state), 5483-5492 (court: two walkers meet), and 4548-4556 (swingStep, LAY_T:
// one piece laid per period).
// Verdict: ADAPT. Changes: the `goX -> X (timer) -> idle` idiom (GV) keeps its shape, with the states of 02 4.3 and 06 16.9 instead of
// GV's jobs; arrival is `v.path === null` (move.ts) instead of g.arrived; a finished activity idles rnd(2, 5) s before the routine picks
// again (02 4.3); a seat (bench, table, picnic blanket) is promised in the prop's `sitters` when the walk starts and taken on arrival
// (first come, first served, 02 6.6 item 3), and a listed id that no longer holds the seat does not count (staff.ts holdsSeat); a
// couple's second sits until the first has sat down and stood up (02 4.3 couple item 2); an easel goes when its artist stops painting at
// it (dropStrayEasels, the planning tick); the kiosk serves one eater at a time and a second waits 5 s (02 4.3 vendor); the feeder drops
// crumbs every 10 s for 40 s (06 1.8); the gardener lays 1.3 s per tile (GV LAY_T 4554); a `default` case logs one `warn` per unknown
// state and sets `idle` (03 6.3 item 4; GV had none, review 6.3). Particles and cues are events (`fx`, `sit`, `stand`, `eat`); their
// timing comes from the timers, never from a draw. The reaction states of 02 6.4 and the romance stages are S5's (07 S4.6 step 7).
// Dropped from the range: every gnome job (haul, fetch, dine, dance, snow, paddle, chop, quarry, fibre, build, tinker, bed, rescue, boat,
// herd, shear, feed animals, hive, well, adventure, flee), 4548's swing strike (no tool strikes here), 4554's other piece times.
import type { XY } from '../core/math.ts';
import { DAYLEN, T } from '../core/clock.ts';
import { emit } from '../core/events.ts';
import { weatherAt } from '../core/weather.ts';
import type { GateId } from '../core/ids.ts';
import { BLOCK, I, KIND, Kind, OCC, PAVEDAY, inB, addProp, propById, props, rebuildBlock, removeProp, type Prop } from '../world/grid.ts';
import { gateById, isGateTile } from '../world/park.ts';
import { markPaved } from '../world/wear.ts';
import { goTo } from './move.ts';
import { creatureById, dropCrumbs } from './creatures.ts';
import {
  LAY_T, LOOP_CORNERS, TIDY_EVERY, approachOf, freeSeats, liveSitters, paveAdvance, paveNext, paveStarted, seatPos, servingTile, vendorFor,
} from './staff.ts';
import { byId, nowTick, someoneOn, visitors, type Job, type Visitor } from './visitor.ts';
import { rnd } from '../core/rng.ts';

/** Every state act handles, for the card's doing line `t('doing.' + st)` (06 16.9) and act.test.ts. */
export const DOING = [
  'idle', 'wander', 'arrive', 'strollLoop', 'goBench', 'goKiosk', 'goSit', 'goEat', 'goLeave', 'watch', 'eat', 'sit', 'read', 'feed',
  'chess', 'photo', 'paint', 'play', 'pave', 'tidy', 'serve', 'shelter', 'goPicnic', 'picnic',
] as const;

/* ---------- numbers (02 4.3, 4.4, 5.2; 06 1.8, 5.2, 7) ---------- */
export const IDLE_MIN = 2; // s between a routine's activities
export const IDLE_MAX = 5;
export const KIOSK_EAT_T = 12;
export const KIOSK_HUNGER = 0.1; // hunger after the kiosk or a picnic
export const SNACK = 0.4; // a bench snack takes this off hunger
export const QUEUE_WAIT = 5; // s a second customer waits
export const REST_UNTIL = 0.45; // the rest rung sits until this energy ...
export const REST_MAX = 90; // ... or this long
export const SHELTER_MAX = 90; // s
export const SHELTER_END_RAIN = 0.3;
export const FEED_T = 40;
export const CRUMBS_EVERY = 10;
export const PHOTO_T = 6;
export const PAINT_DAYS = 0.4;
export const BUSK_T = 120; // an AI busker
export const BUSK_T_SUMMONED = 90; // c_musician's
export const CHESS_T = 90;
export const POND_T = 20;
export const CHILD_NEAR = 4; // a child further than this from its parent goes back to them (S4.7 item 3: never more than 8)
export const CHILD_PLAY_R = 2; // the circle a child runs (02 4.3 family item 1)
export const SPD_CHILD = 2.6;

/* ---------- small helpers ---------- */

function open(x: number, y: number): boolean {
  rebuildBlock();
  return inB(x, y) && BLOCK[I(x, y)] === 0;
}

/** Walk `v` to (x, y) directly when its tile is open (no A*: a child's circle, a short follow), else by A*. */
export function walkDirect(v: Visitor, x: number, y: number): void {
  if (open(Math.round(x), Math.round(y))) {
    v.path = [{ x, y }];
    v.pi = 0;
    v.ptx = x;
    v.pty = y;
  } else goTo(v, x, y);
}

/** The activity is over: idle rnd(2, 5) s before the routine picks again (02 4.3). */
export function finish(v: Visitor, idle = rnd(IDLE_MIN, IDLE_MAX)): void {
  v.st = 'idle';
  v.t = idle;
  v.job = {};
  v.path = null;
  v.pi = 0;
}

/** Stand up from a seat: off the prop's list, onto its approach tile (a walker is never left on a blocked tile). */
export function standUp(v: Visitor): void {
  const p = v.sitPropId ? propById(v.sitPropId) : undefined;
  if (p?.data.sitters) p.data.sitters = p.data.sitters.filter((id) => id !== v.id);
  if (v.sitPropId !== 0) {
    const a = p ? approachOf(p) : null;
    if (a) {
      v.x = a.x;
      v.y = a.y;
    }
    v.sitPropId = 0;
    emit({ kind: 'stand', tick: nowTick(), x: v.x, y: v.y, ids: [v.id], params: { prop: p?.kind ?? '' } });
  }
}

/** Leave whatever `v` was doing before the brain gives it something else: a promised seat goes back, a seated visitor stands. */
export function release(v: Visitor): void {
  const pid = v.job.propId;
  const p = pid ? propById(pid) : undefined;
  if (p?.data.sitters && v.sitPropId !== pid) p.data.sitters = p.data.sitters.filter((id) => id !== v.id);
  standUp(v);
}

/** Begin a walk in state `st` toward (x, y) with `job`. */
export function startWalk(v: Visitor, st: string, job: Job, x: number, y: number, t = 0): void {
  v.st = st;
  v.job = job;
  v.t = t;
  goTo(v, x, y);
}

/**
 * Promise one of the prop's seats and walk to it: `st` while walking (goBench, goSit, goPicnic), `kind` says what happens seated. The list
 * drops its stale ids first (staff.ts holdsSeat), so a seat a walker gave up or an undo listed again is promised afresh.
 */
export function startSeat(v: Visitor, p: Prop, st: string, kind: string, t: number, partner = 0): boolean {
  const a = approachOf(p);
  if (!a || freeSeats(p) <= 0) return false;
  p.data.sitters = liveSitters(p).filter((id) => id !== v.id);
  p.data.sitters.push(v.id);
  startWalk(v, st, partner ? { propId: p.id, kind, visitorId: partner } : { propId: p.id, kind }, a.x, a.y, t);
  return true;
}

/** Walk to a kiosk's serving tile (goKiosk on the routine, goEat on the eat rung); the kiosk must have its vendor. */
export function startKiosk(v: Visitor, k: Prop, st: 'goKiosk' | 'goEat'): boolean {
  if (vendorFor(k.id) === 0) return false;
  const s = servingTile(k);
  startWalk(v, st, { propId: k.id }, s.x + 0.1, s.y + 0.35);
  return true;
}

/** One round of a loop (inner 0, outer 1) from its nearest corner: the leg to that corner, then four more back to it. */
export function startLoop(v: Visitor, loop: number): void {
  const c = LOOP_CORNERS[loop] as readonly XY[];
  let k = 0, bd = Infinity;
  c.forEach((p, n) => {
    const d = Math.hypot(p.x - v.x, p.y - v.y);
    if (d < bd) {
      bd = d;
      k = n;
    }
  });
  const to = c[k] as XY;
  startWalk(v, 'strollLoop', { kind: 'loop' + loop, step: k, left: 5 }, to.x, to.y);
}

/** Leave the park by `gate` (02 5.2 rung 3): its outside tile is the walk's end; visitor.ts removes the walker there. */
export function startLeave(v: Visitor, gate: GateId): void {
  v.gateOut = gate;
  const o = gateById(gate).outside;
  startWalk(v, 'goLeave', {}, o.x, o.y);
}

/** Shelter on tile `i` until the rain there eases below 0.3 or 90 s (02 5.2 rung 2). */
export function startShelter(v: Visitor, x: number, y: number): void {
  startWalk(v, 'shelter', { tile: { x, y }, kind: 'shelter' }, x, y, SHELTER_MAX);
}

/* ---------- arrivals of the purposeful walks ---------- */

/** The tile beside (x, y) where an artist sets the easel: open lawn or gravel, not a gate tile, nobody on it. */
function easelTile(x: number, y: number): XY | null {
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    const tx = x + dx, ty = y + dy;
    if (!open(tx, ty) || isGateTile(tx, ty) || OCC[I(tx, ty)] !== 0) continue;
    const k = KIND[I(tx, ty)];
    if ((k === Kind.lawn || k === Kind.gravel) && !someoneOn([{ x: tx, y: ty }])) return { x: tx, y: ty };
  }
  return null;
}

/** A `wander` walk arrived: what it was for (job.kind) starts now. */
function arrived(v: Visitor): void {
  switch (v.job.kind) {
    case 'view':
      v.st = 'photo';
      v.t = PHOTO_T;
      emit({ kind: 'fx', tick: nowTick(), x: v.x, y: v.y, ids: [v.id], params: { fx: 'flash' } });
      return;
    case 'easel': {
      const x = Math.round(v.x), y = Math.round(v.y);
      const e = easelTile(x, y);
      if (!e) {
        finish(v);
        return;
      }
      const p = addProp({ kind: 'easel', x: e.x, y: e.y, w: 1, h: 1, rot: 0, placedBy: 'sim', data: { ownerId: v.id } });
      v.st = 'paint';
      v.t = PAINT_DAYS * DAYLEN;
      v.job = { propId: p.id };
      v.plan = 1; // painted (or painting): the artist leaves after this (02 4.3 artist)
      return;
    }
    case 'busk':
      v.st = 'play';
      v.t = v.spawnedForPlayer ? BUSK_T_SUMMONED : BUSK_T;
      v.plan = 1;
      return;
    case 'tidy':
      v.st = 'tidy';
      v.t = 6;
      return;
    case 'lawn':
      v.st = 'watch';
      v.t = rnd(30, 60);
      v.job = { kind: 'play', tile: { x: v.x, y: v.y } };
      return;
    case 'pond':
      v.st = 'watch';
      v.t = POND_T;
      v.job = { kind: 'pond', tile: { x: v.x, y: v.y } };
      return;
    case 'follow':
      v.st = 'idle';
      v.t = 0;
      v.job = {};
      return;
    default:
      finish(v);
  }
}

/** A walk that follows someone (a child its parent, a couple's second its first): close in every 0.6 s, done within 1.2 tiles. */
function followStep(v: Visitor, dt: number): void {
  const o = byId(v.job.visitorId ?? 0);
  if (!o) {
    finish(v, 0);
    return;
  }
  v.t -= dt;
  if (v.t > 0) return;
  v.t = 0.6;
  if (Math.hypot(o.x - v.x, o.y - v.y) < 1.2) arrived(v);
  else walkDirect(v, o.x, o.y);
}

/* ---------- the states ---------- */

function loopStep(v: Visitor, dt: number): void {
  if (v.job.kind === 'follow') {
    // a couple's second strolls half a tile behind the first (02 4.3 couple item 1)
    const o = byId(v.job.visitorId ?? 0);
    if (!o || o.st !== 'strollLoop') {
      finish(v);
      return;
    }
    v.t -= dt;
    if (v.t > 0) return;
    v.t = 0.5;
    const d = Math.hypot(v.x - o.x, v.y - o.y) || 1;
    walkDirect(v, o.x + ((v.x - o.x) / d) * 0.5, o.y + ((v.y - o.y) / d) * 0.5);
    return;
  }
  if (v.path) return;
  const loop = v.job.kind === 'loop0' ? 0 : 1;
  const left = (v.job.left ?? 1) - 1;
  if (left > 0) {
    const step = ((v.job.step ?? 0) + 1) % 4;
    const to = (LOOP_CORNERS[loop] as readonly XY[])[step] as XY;
    v.job = { kind: v.job.kind, step, left };
    goTo(v, to.x, to.y);
    return;
  }
  // a round done (02 4.3): a jogger runs 2-4 laps, a dog walker two loops, then they leave; the others idle and pick again
  if (v.archetype === 'jogger' || v.archetype === 'dogwalker') {
    v.plan++;
    if (v.plan < lapsOf(v)) startLoop(v, loop);
    else startLeaveNearest(v);
    return;
  }
  finish(v);
}

/** A jogger's laps (2-4, read from the look so no draw is spent) and a dog walker's two loops (02 4.3). */
export function lapsOf(v: Visitor): number {
  return v.archetype === 'jogger' ? 2 + ((v.lookSeed >>> 7) % 3) : 2;
}

/** Leave by the nearest gate whose outside tile is not remembered as out of reach (02 4.5 item 1). */
export function startLeaveNearest(v: Visitor, avoid: (g: GateId) => boolean = () => false): void {
  const gates = ['g_south_w', 'g_south_e', 'g_west', 'g_east', 'g_north'] as const;
  let best: GateId = 'g_south_w', bd = Infinity;
  for (const g of gates) {
    if (avoid(g)) continue;
    const t = gateById(g).tiles[0];
    const d = Math.max(Math.abs(t.x - v.x), Math.abs(t.y - v.y));
    if (d < bd) {
      bd = d;
      best = g;
    }
  }
  startLeave(v, best);
}

function seatStep(v: Visitor): void {
  const p = propById(v.job.propId ?? 0);
  if (!p) {
    finish(v);
    return;
  }
  if (v.path) return;
  takeSeat(v, p);
  const kind = v.job.kind === 'with' ? (byId(v.job.visitorId ?? 0)?.job.kind === 'picnic' ? 'picnic' : 'sit') : v.job.kind;
  v.st = kind === 'read' ? 'read' : kind === 'feed' ? 'feed' : kind === 'snack' ? 'eat' : kind === 'chess' ? 'chess' : kind === 'picnic' ? 'picnic' : 'sit';
  if (kind === 'feed') {
    v.t = FEED_T;
    v.job.left = 3;
    const a = approachOf(p);
    if (a) dropCrumbs(a.x, a.y, v.id); // the first handful at once, then every 10 s (06 1.8)
  } else if (kind === 'read') v.t = FEED_T;
  else if (kind === 'snack') v.t = KIOSK_EAT_T;
  else if (kind === 'chess') v.t = CHESS_T;
}

/** Arrived at a seat prop: take a seat nobody already sits on (02 4.3 bench, table, picnic; act-romance.ts for a pair's seats). */
export function takeSeat(v: Visitor, p: Prop): void {
  let k = 0;
  for (let s = 0; s < 2; s++) {
    const at = seatPos(p, s);
    if (!visitors.some((o) => o !== v && o.sitPropId === p.id && Math.hypot(o.x - at.x, o.y - at.y) < 0.1)) {
      k = s;
      break;
    }
  }
  const at = seatPos(p, k);
  v.x = at.x;
  v.y = at.y;
  v.sitPropId = p.id;
  if (!p.data.sitters?.includes(v.id)) (p.data.sitters ??= []).push(v.id);
  emit({ kind: 'sit', tick: nowTick(), x: v.x, y: v.y, ids: [v.id], params: { prop: p.kind } });
}

function seatedStep(v: Visitor, dt: number): void {
  const p = propById(v.sitPropId);
  if (!p) {
    finish(v);
    v.sitPropId = 0;
    return;
  }
  v.t -= dt;
  let done = v.t <= 0;
  if (v.st === 'feed' && (v.job.left ?? 0) > 0 && v.t <= (v.job.left ?? 0) * CRUMBS_EVERY) {
    v.job.left = (v.job.left ?? 0) - 1;
    const a = approachOf(p);
    if (a) dropCrumbs(a.x, a.y, v.id);
  }
  if (v.job.kind === 'rest') done = v.energy >= REST_UNTIL || v.t <= 0;
  if (v.job.kind === 'with') {
    // a couple's second gets up with the first (02 4.3 couple items 2-3): once the first has sat here and stood up, or gave up the
    // walk to it; a second who got there first waits for the first to sit down
    const o = byId(v.job.visitorId ?? 0);
    done = !o || (o.sitPropId !== p.id && o.job.propId !== p.id);
  }
  if (!done) return;
  if (v.st === 'picnic') v.hunger = Math.min(v.hunger, KIOSK_HUNGER);
  standUp(v);
  finish(v);
}

function kioskStep(v: Visitor, dt: number): void {
  const k = propById(v.job.propId ?? 0);
  if (!k || vendorFor(k.id) === 0) {
    finish(v);
    return;
  }
  if (v.path) return;
  const busy = visitors.some((o) => o !== v && o.st === 'eat' && o.job.propId === k.id);
  if (busy) {
    v.t += dt; // a second customer waits beside the counter (02 4.3 vendor)
    if (v.t > QUEUE_WAIT) finish(v);
    return;
  }
  v.st = 'eat';
  v.t = KIOSK_EAT_T;
  emit({ kind: 'eat', tick: nowTick(), x: v.x, y: v.y, ids: [v.id], params: { at: 'kiosk' } });
  const c = byId(v.parentOf);
  if (c && Math.hypot(c.x - v.x, c.y - v.y) <= CHILD_NEAR) c.items.iceCream = true; // the child's ice cream (02 4.3 family item 3)
}

function eatStep(v: Visitor, dt: number): void {
  v.t -= dt;
  if (v.t > 0) return;
  if (v.sitPropId !== 0) {
    v.hunger = Math.max(0, v.hunger - SNACK); // a bench snack (02 4.4)
    standUp(v);
  } else v.hunger = KIOSK_HUNGER;
  finish(v);
}

function playStep(v: Visitor, dt: number): void {
  v.t -= dt;
  if (v.archetype === 'busker') {
    if (Math.floor(v.t / 1.5) !== Math.floor((v.t + dt) / 1.5)) emit({ kind: 'fx', tick: nowTick(), x: v.x, y: v.y, ids: [v.id], params: { fx: 'note' } });
    if (v.t <= 0) startLeaveNearest(v);
    return;
  }
  // a child: chasing a pigeon, or running a circle round the parent's spot (02 4.3 family items 1-2; GV skip 5322)
  if (v.job.creatureId !== undefined) {
    const c = creatureById(v.job.creatureId);
    if (!c || c.st === 'scatter' || c.st === 'fly' || v.t <= 0) {
      finish(v, 0.5);
      return;
    }
    if (Math.floor(v.t / 0.4) !== Math.floor((v.t + dt) / 0.4)) walkDirect(v, c.x, c.y);
    return;
  }
  const p = byId(v.childOf);
  const c = v.job.tile;
  if (!p || !c || v.t <= 0 || p.st !== 'watch' || p.job.kind !== 'play') {
    finish(v, 0.5);
    return;
  }
  if (Math.floor(v.t / 0.25) === Math.floor((v.t + dt) / 0.25)) return;
  const a = (v.t * SPD_CHILD) / CHILD_PLAY_R + 0.6; // round the spot at 2.6 tiles/s
  const x = c.x + Math.cos(a) * CHILD_PLAY_R, y = c.y + Math.sin(a) * CHILD_PLAY_R;
  if (open(Math.round(x), Math.round(y))) walkDirect(v, x, y);
}

function paveStep(v: Visitor, dt: number): void {
  if (v.path) return;
  const next = paveNext();
  if (!next) {
    finish(v);
    return;
  }
  if (v.job.left !== 1) {
    v.job.left = 1; // at the tile: lay it (GV swingStep 4548 shape, one piece per LAY_T)
    v.t = LAY_T;
    return;
  }
  v.t -= dt;
  if (v.t > 0) return;
  const i = I(next.x, next.y);
  if (KIND[i] === Kind.lawn && OCC[i] === 0 && PAVEDAY[i] !== T.day) {
    paveStarted(next.x, next.y);
    markPaved(i, T.day);
    emit({ kind: 'fx', tick: nowTick(), x: next.x, y: next.y, ids: [v.id], params: { fx: 'dust', n: 3 } });
  }
  paveAdvance();
  v.job.left = 0;
  const after = paveNext();
  if (after) goTo(v, after.x, after.y);
  else finish(v);
}

/**
 * The planning tick's easel check (loop.ts; 02 4.3 artist item 2, 07 S4.7 item 3 "the easel leaves with the artist"): an easel whose
 * artist is not painting at it goes. The paint timer takes an artist's easel away (below); this catches the one the remove tool took
 * and an undo put back after its artist had stopped painting, or left.
 */
export function dropStrayEasels(): void {
  for (let k = props.length - 1; k >= 0; k--) {
    const p = props[k] as Prop;
    if (p.kind !== 'easel') continue;
    const o = byId(p.data.ownerId ?? 0);
    if (!o || o.st !== 'paint' || o.job.propId !== p.id) removeProp(p.id);
  }
}

function timed(v: Visitor, dt: number): boolean {
  v.t -= dt;
  return v.t <= 0;
}

/** A child further than 4 tiles from its parent goes back to them (07 S4.7 item 3: never more than 8). */
function keepNear(v: Visitor): void {
  const p = byId(v.childOf);
  if (!p || v.st === 'goLeave' || v.st === 'shelter' || (v.st === 'wander' && v.job.kind === 'follow')) return;
  if (Math.hypot(p.x - v.x, p.y - v.y) <= CHILD_NEAR) return;
  release(v);
  v.st = 'wander';
  v.job = { kind: 'follow', visitorId: p.id };
  v.t = 0;
}

const warned = new Set<string>();
/** Tests: forget which unknown states were reported. */
export function resetActWarnings(): void {
  warned.clear();
}

/** One step of `v`'s state (03 6.3 item 4): timers, arrivals, and what comes next. */
export function act(v: Visitor, dt: number): void {
  if (v.archetype === 'child') keepNear(v);
  switch (v.st) {
    case 'idle':
      if (v.t > 0) v.t = Math.max(0, v.t - dt);
      return;
    case 'arrive':
      if (!v.path) finish(v, 0);
      return;
    case 'wander':
      if (v.job.kind === 'follow') followStep(v, dt);
      else if (!v.path) arrived(v);
      return;
    case 'strollLoop':
      loopStep(v, dt);
      return;
    case 'goBench':
    case 'goSit':
    case 'goPicnic':
      seatStep(v);
      return;
    case 'goKiosk':
    case 'goEat':
      kioskStep(v, dt);
      return;
    case 'goLeave':
      if (!v.path && v.gateOut) {
        const o = gateById(v.gateOut).outside;
        goTo(v, o.x, o.y, true); // short of the gate (a blocked step gave up the route): walk on
      }
      return;
    case 'sit':
    case 'read':
    case 'feed':
    case 'chess':
    case 'picnic':
      seatedStep(v, dt);
      return;
    case 'eat':
      eatStep(v, dt);
      return;
    case 'watch':
    case 'photo':
      if (timed(v, dt)) {
        if (v.st === 'photo') v.plan++; // the tourist's next viewpoint
        finish(v);
      }
      return;
    case 'paint':
      if (timed(v, dt)) {
        const e = propById(v.job.propId ?? 0);
        if (e?.kind === 'easel') removeProp(e.id); // the artist leaves with the easel (02 4.3 artist item 2)
        startLeaveNearest(v);
      }
      return;
    case 'play':
      playStep(v, dt);
      return;
    case 'pave':
      paveStep(v, dt);
      return;
    case 'tidy':
      if (timed(v, dt)) {
        v.plan = T.abs + TIDY_EVERY / DAYLEN;
        finish(v);
      }
      return;
    case 'serve':
      return; // the vendor stands at the counter (02 4.3 vendor); staff.ts takes it away with its kiosk
    case 'shelter':
      v.t -= dt;
      if (weatherAt(Math.round(v.x), Math.round(v.y)).rain < SHELTER_END_RAIN || v.t <= 0) finish(v);
      return;
    default:
      if (!warned.has(v.st)) {
        warned.add(v.st);
        emit({ kind: 'warn', tick: nowTick(), x: v.x, y: v.y, ids: [v.id], params: { what: 'act.unknown_state', st: v.st } });
      }
      v.st = 'idle';
      v.t = 0;
  }
}
