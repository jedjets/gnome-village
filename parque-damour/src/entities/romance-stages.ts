// src/entities/romance-stages.ts
// The seven stages of 02 6.2: prerequisites ("Needs"), affinity gates, durations, the start for both members in one tick, completion
// (+0.08, leaveAt +0.1 day, the `stage` event), interruption (retryT 30, 60 for Kiss and Proposal), lingering, and rung 6 (02 5.2).
// Split out of romance.ts (AGENTS rule 9; 03 2.5 row romance-stages.ts). Ported from GV 4338 and 5483-5491 (court: the two walk to their
// midpoint, a little apart, and stand facing; the rendezvous shape only). ADAPT: the midpoint +-0.4 tile of 02 6.2 Chat (06 8: stand
// 0.8 apart) for Notice's approach, Chat and Kiss (+-0.25, assumption S5-A6), a romantic spot within 10 for the Proposal (02 6.7).
// Rules: `pair.stage` is the last stage reached (a new pair is at 1, Notice, which starts at once; a couple at 3); the next attempt is
// stage + 1. Rung 6 on the initiator (the lower id): when the next stage's prerequisites and gate hold, retryT is out, both are in
// CAN_INTERRUPT states and both have comfort >= 0.35, the stage starts for both; else, under the same last three conditions, the pair
// lingers (02 6.2 rules 2-3): it repeats the current stage's activity (Notice: walking up to each other; Chat; Bench; Stroll; Picnic;
// Kiss), with Chat as the fallback when the current activity's own needs are missing and they are within 4 tiles (assumption S5-A7);
// a linger ends with nothing gained and the charm conversion runs all the while. The other member keeps within 2.5 tiles of the
// initiator (a follow walk) and waits (assumption S5-A8), so the initiator's next decision finds them free.
import { T } from '../core/clock.ts';
import { clamp01, type XY } from '../core/math.ts';
import { rnd } from '../core/rng.ts';
import { emit } from '../core/events.ts';
import { weatherAt } from '../core/weather.ts';
import { BLOCK, props, rebuildBlock, type Prop } from '../world/grid.ts';
import { CAN_INTERRUPT } from './brain.ts';
import { LOOP_CORNERS, facilities, freeSeats, nearestTile, ringOf, tileXY } from './staff.ts';
import { finish, release, startSeat, startWalk } from './act.ts';
import { byId, nowTick, type Visitor } from './visitor.ts';
import { happily, midOf, pairParams, type Pair } from './romance.ts';

/** The reaction states of 02 6.4 and the Parted huff: never "together" (02 6.3 item 2). */
export const REACTION_STATES: Readonly<Record<string, true>> = {
  wipe: true, shake: true, stumble: true, chase: true, flap: true, huddle: true, distracted: true, baffled: true, lost: true, duck: true, huff: true,
};
/** The states of a stage in progress (act-romance.ts runs them while the job names the pair). */
export const STAGE_STATES: Readonly<Record<string, true>> = {
  notice: true, chat: true, goBench: true, bench: true, stroll: true, goPicnic: true, picnic: true, kiss: true, proposal: true,
};

/* ---------- numbers (register 3.5; 02 6.2; 06 1.6, 1.7, 8) ---------- */
/** The affinity gate to attempt stage k (index k; Notice has none). */
export const GATES: readonly number[] = [0, 0, 0.3, 0.45, 0.55, 0.65, 0.8, 0.9];
/** Durations in sim seconds: [min, max] (a fixed one has min = max). */
export const DURATION: ReadonlyArray<readonly [number, number]> = [[0, 0], [4, 4], [20, 30], [40, 60], [60, 60], [50, 80], [10, 10], [15, 15]];
export const AFF_PER_STAGE = 0.08;
export const LEAVE_PER_STAGE = 0.1; // days added to leaveAt per completed stage (02 4.2 item 6) ...
export const LEAVE_CAP = 1.2; // ... up to arrivedAt + this
export const RETRY_T = 30;
export const RETRY_T_LATE = 60;
export const STAGE_MIN_COMFORT = 0.35;
export const PROPOSAL_SAME_DAY = 0.95;
export const R_CHAT = 2;
export const R_BENCH = 8;
export const R_LOOP = 10;
export const R_PICNIC = 10;
export const R_ROMANTIC = 10;
export const R_KISS_SPOT = 3; // a fountain or a lit lamp within this (02 6.2 Kiss)
export const RAIN_STAGE = 0.3; // Picnic and Kiss want rain below this
export const HUNGER_PICNIC = 0.6;
export const R_FOLLOW = 2.5; // the other member keeps this close while waiting (assumption S5-A8)
export const GAP_CHAT = 0.4; // each stands this far from the midpoint (06 8: 0.8 apart)
export const GAP_KISS = 0.25;
export const GAP_PROPOSAL = 0.3;

/* ---------- prerequisites (02 6.2 "Needs", 2.6 spots) ---------- */

function cell(x: number, y: number): XY {
  return { x: Math.round(x), y: Math.round(y) };
}
function chebProp(p: Prop, x: number, y: number): number {
  return Math.max(p.x - x, x - (p.x + p.w - 1), p.y - y, y - (p.y + p.h - 1), 0);
}

/** A bench with both seats free within 8 of the midpoint, the nearest. */
export function benchFor(m: XY): Prop | null {
  return nearestProp(facilities().benches, m, R_BENCH, (b) => freeSeats(b) >= 2);
}
/** A picnic blanket, a basket or a cafe table with both seats free within 10. */
export function picnicFor(m: XY): Prop | null {
  const f = facilities();
  return nearestProp([...f.picnics, ...f.tables], m, R_PICNIC, (p) => freeSeats(p) >= 2);
}
function nearestProp(list: readonly Prop[], m: XY, r: number, ok: (p: Prop) => boolean): Prop | null {
  let best: Prop | null = null, bd = r;
  for (const p of list) {
    const d = Math.hypot(p.x - m.x, p.y - m.y);
    if (d <= bd && ok(p)) {
      best = p;
      bd = d;
    }
  }
  return best;
}
/** A loop of >= 12 path tiles within 10 tiles (02 6.2 Stroll): the inner (0) or outer (1) loop, the nearer first; -1 when none. */
export function loopFor(m: XY): number {
  const ok = facilities().loops, r = ringOf(m.x, m.y);
  const away = (l: number): number => (l === 0 ? Math.max(0, 5 - r, r - 6) : Math.max(0, 13 - r, r - 14));
  const order = away(0) <= away(1) ? [0, 1] : [1, 0];
  for (const l of order) if (ok[l] && away(l) <= R_LOOP) return l;
  return -1;
}
/** Kiss (02 6.2): golden hour or evening, or within 3 of a fountain, or within 3 of a lit lamp; and rain below 0.3 unless an umbrella. */
export function kissSpot(p: Pair, m: XY): boolean {
  const c = cell(m.x, m.y);
  const setting =
    T.phase === 'golden' || T.phase === 'evening' ||
    props.some((q) => (q.kind === 'fountain' && chebProp(q, c.x, c.y) <= R_KISS_SPOT) || (q.kind === 'lamp' && T.lamps && chebProp(q, c.x, c.y) <= R_KISS_SPOT));
  return setting && (weatherAt(c.x, c.y).rain < RAIN_STAGE || p.umbrellaUntil >= T.abs);
}
/** The open tiles of the romantic spots (02 2.6): within 4 of a bandstand, a bridge tile, within 3 of a fountain, a lamp-lit bench's front. */
export function romanticTiles(): number[] {
  const f = facilities(), out = new Set<number>();
  const ring = (p: Prop, r: number): void => {
    for (let y = p.y - r; y < p.y + p.h + r; y++)
      for (let x = p.x - r; x < p.x + p.w + r; x++) if (x >= 0 && y >= 0 && x < 48 && y < 48 && chebProp(p, x, y) <= r) out.add(y * 48 + x);
  };
  for (const b of f.bandstands) ring(b, 4);
  for (const fo of f.fountains) ring(fo, 3);
  for (const q of props) if (q.kind === 'bridge') ring(q, 0);
  if (T.lamps)
    for (const b of f.benches) if (props.some((l) => l.kind === 'lamp' && chebProp(l, b.x, b.y) <= 3)) ring(b, 1);
  rebuildBlock();
  return [...out].filter((i) => BLOCK[i] === 0).sort((x, y) => x - y); // open tiles (a bridge's deck is open)
}
export function romanticFor(m: XY): number {
  return nearestTile(romanticTiles(), m.x, m.y, R_ROMANTIC);
}

/** The prerequisites of stage k for the pair now (02 6.2 "Needs"), without the gate. */
export function needsHold(p: Pair, k: number): boolean {
  const a = byId(p.a), b = byId(p.b);
  if (!a || !b) return false;
  const m = midOf(p);
  switch (k) {
    case 1:
      return true;
    case 2:
      return Math.hypot(a.x - b.x, a.y - b.y) <= R_CHAT;
    case 3:
      return benchFor(m) !== null;
    case 4:
      return loopFor(m) >= 0;
    case 5:
      return picnicFor(m) !== null && weatherAt(Math.round(m.x), Math.round(m.y)).rain < RAIN_STAGE && a.hunger < HUNGER_PICNIC && b.hunger < HUNGER_PICNIC;
    case 6:
      return kissSpot(p, m);
    case 7:
      return romanticFor(m) >= 0;
    default:
      return false;
  }
}

/** The affinity gate of stage k, with the Proposal's same-day rule (02 6.2 stage 7, 6.7). */
export function gateHolds(p: Pair, k: number): boolean {
  if (p.affinity < (GATES[k] ?? 2)) return false;
  return !(k === 7 && p.formedDay === T.day && p.affinity < PROPOSAL_SAME_DAY);
}

/** Both free to start (02 5.2 rung 6): retryT out, both CAN_INTERRUPT, both comfort >= 0.35. */
export function bothFree(p: Pair): boolean {
  const a = byId(p.a), b = byId(p.b);
  return !!a && !!b && p.retryT <= 0 && !!CAN_INTERRUPT[a.st] && !!CAN_INTERRUPT[b.st] && a.comfort >= STAGE_MIN_COMFORT && b.comfort >= STAGE_MIN_COMFORT;
}

/** 03 2.5 nextStageReady: the next stage's needs, its gate and rung 6's conditions all hold. */
export function nextStageReady(p: Pair): boolean {
  const k = p.stage + 1;
  return k <= 7 && p.doing === 0 && gateHolds(p, k) && needsHold(p, k) && bothFree(p);
}

/* ---------- start, completion, interruption ---------- */

/** Both walk to their places beside `at` (each `gap` from it, on the line between them) in state `st`. */
function rendezvous(a: Visitor, b: Visitor, at: XY, gap: number, st: string, p: Pair): void {
  let ux = b.x - a.x, uy = b.y - a.y;
  const d = Math.hypot(ux, uy);
  if (d < 1e-6) {
    ux = 1;
    uy = 0;
  } else {
    ux /= d;
    uy /= d;
  }
  startWalk(a, st, { pairId: p.id }, at.x - ux * gap, at.y - uy * gap);
  startWalk(b, st, { pairId: p.id }, at.x + ux * gap, at.y + uy * gap);
}

/** Seat both on `spot` (a bench, a blanket, a table): the walk in `walkSt`, both seats promised now (first come, first served, 02 6.6). */
function seatBoth(a: Visitor, b: Visitor, spot: Prop, walkSt: string, p: Pair): boolean {
  const kind = walkSt === 'goBench' ? 'bench' : 'picnic';
  if (!startSeat(a, spot, walkSt, kind, 0) || !startSeat(b, spot, walkSt, kind, 0)) return false;
  a.job.pairId = p.id;
  b.job.pairId = p.id;
  p.spotPropId = spot.id;
  return true;
}

/**
 * Start stage k for both members in this tick (02 6.2 rule 6; 03 6.4 item 2), or its linger when `linger` (no gain at its end). The
 * stage's length is drawn here (one draw for Chat, Bench and Picnic) into pair.stageT; act-romance.ts counts it down once both are in place.
 */
export function startStage(p: Pair, k: number, linger: boolean): boolean {
  const a = byId(p.a), b = byId(p.b);
  if (!a || !b) return false;
  const m = midOf(p);
  release(a);
  release(b);
  const [lo, hi] = DURATION[k] ?? [0, 0];
  let ok = true;
  switch (k) {
    case 1:
      if (linger) rendezvous(a, b, m, GAP_CHAT, 'notice', p);
      else
        for (const v of [a, b]) {
          v.st = 'notice';
          v.job = { pairId: p.id };
          v.path = null;
        }
      break;
    case 2:
      rendezvous(a, b, m, GAP_CHAT, 'chat', p);
      a.social = 0; // Chat sets social to 0 (02 4.3 single item 6)
      b.social = 0;
      emit({ kind: 'chat', tick: nowTick(), x: m.x, y: m.y, ids: [a.id, b.id] });
      break;
    case 3: {
      const bench = benchFor(m);
      ok = !!bench && seatBoth(a, b, bench, 'goBench', p);
      break;
    }
    case 4: {
      const l = loopFor(m);
      ok = l >= 0;
      if (ok) startStroll(a, b, l, p);
      break;
    }
    case 5: {
      const spot = picnicFor(m);
      ok = !!spot && seatBoth(a, b, spot, 'goPicnic', p);
      break;
    }
    case 6:
      rendezvous(a, b, m, GAP_KISS, 'kiss', p);
      break;
    case 7: {
      const i = romanticFor(m);
      ok = i >= 0;
      if (ok) {
        rendezvous(a, b, tileXY(i), GAP_PROPOSAL, 'proposal', p);
        emit({ kind: 'proposal', tick: nowTick(), x: m.x, y: m.y, ids: [a.id, b.id, p.id] });
      }
      break;
    }
    default:
      ok = false;
  }
  if (!ok) {
    finish(a, 0);
    finish(b, 0);
    return false;
  }
  p.doing = linger ? -k : k;
  p.stageT = lo === hi ? lo : rnd(lo, hi);
  if (linger) emit({ kind: 'linger', tick: nowTick(), x: m.x, y: m.y, ids: [a.id, b.id, p.id], params: pairParams(p) });
  return true;
}

/** Stroll (02 6.2 stage 4): the initiator walks the loop from its nearest corner, the other half a tile behind, both in `stroll`. */
function startStroll(a: Visitor, b: Visitor, l: number, p: Pair): void {
  const c = LOOP_CORNERS[l] as readonly XY[];
  let k = 0, bd = Infinity;
  c.forEach((q, n) => {
    const d = Math.hypot(q.x - a.x, q.y - a.y);
    if (d < bd) {
      bd = d;
      k = n;
    }
  });
  const to = c[k] as XY;
  startWalk(a, 'stroll', { pairId: p.id, kind: 'loop' + l, step: k }, to.x, to.y);
  b.st = 'stroll';
  b.job = { pairId: p.id, kind: 'follow', visitorId: a.id };
  b.t = 0;
  b.path = null;
}

/** Both members back to idle for a fresh decision; the pair holds no stage in progress. */
function endBoth(p: Pair, idle: number): void {
  p.doing = 0;
  p.stageT = 0;
  p.spotPropId = 0;
  for (const v of [byId(p.a), byId(p.b)]) {
    if (!v || v.job.pairId !== p.id) continue;
    release(v);
    finish(v, idle);
    v.decideT = 0;
  }
}

/**
 * The stage in progress ran its length (act-romance.ts, the initiator's timer). A real stage: stage = k, affinity + 0.08 (clamped),
 * each member's leaveAt + 0.1 day up to arrivedAt + 1.2, the `stage` event (S6 scores it), Happily after a Proposal. A linger: nothing.
 */
export function completeStage(p: Pair): void {
  const k = p.doing;
  endBoth(p, 1);
  if (k <= 0) return;
  p.stage = k as Pair['stage'];
  p.affinity = clamp01(p.affinity + AFF_PER_STAGE);
  for (const v of [byId(p.a), byId(p.b)]) if (v) v.leaveAt = Math.min(v.arrivedAt + LEAVE_CAP, v.leaveAt + LEAVE_PER_STAGE);
  const m = midOf(p);
  emit({ kind: 'stage', tick: nowTick(), x: m.x, y: m.y, ids: [p.a, p.b, p.id], params: pairParams(p, k >= 2 ? { feed: 'feed.stage.' + STAGE_KEY[k] } : {}) });
  if (k === 7) happily(p);
}
const STAGE_KEY = ['', 'notice', 'chat', 'bench', 'stroll', 'picnic', 'kiss', 'proposal'] as const;

/** An interrupted stage gives nothing (02 6.2 rule 4): retryT 30, or 60 for Kiss and Proposal, unless `retry` says otherwise. */
export function interruptStage(p: Pair, retry?: number): void {
  if (p.doing === 0) return;
  const k = Math.abs(p.doing);
  p.retryT = retry ?? (k >= 6 ? RETRY_T_LATE : RETRY_T);
  endBoth(p, 0);
}

/* ---------- rung 6 (02 5.2) ---------- */

/** The activity a lingering pair repeats (02 6.2 rule 2): the current stage's, else Chat when they are within 4 (S5-A7); 0 for none. */
function lingerStage(p: Pair): number {
  const a = byId(p.a), b = byId(p.b);
  if (!a || !b) return 0;
  const c = p.stage;
  if (c === 1) return 1;
  if (c >= 2 && c <= 6 && needsHold(p, c) && (c !== 2 || Math.hypot(a.x - b.x, a.y - b.y) <= 4)) return c;
  return Math.hypot(a.x - b.x, a.y - b.y) <= 4 ? 2 : 0;
}

/** True while `v` is in a state of the stage in progress of `p`. */
function inStage(v: Visitor, p: Pair): boolean {
  return v.job.pairId === p.id && !!STAGE_STATES[v.st];
}

/**
 * Rung 6 for a member of `p`. A stage in progress carries on (a member who dropped out of it interrupts it). The initiator starts the
 * next stage when it is ready, else lingers when both are free; true when it did. The other keeps close and waits (S5-A8).
 */
export function romanceRung(p: Pair, v: Visitor): boolean {
  if (p.doing !== 0) {
    if (inStage(v, p)) return true;
    interruptStage(p);
  }
  const a = byId(p.a), b = byId(p.b);
  if (!a || !b) return false;
  if (v.id === p.a) {
    if (nextStageReady(p)) return startStage(p, p.stage + 1, false);
    if (!bothFree(p)) return false;
    const k = lingerStage(p);
    return k > 0 && startStage(p, k, true);
  }
  if (Math.hypot(a.x - b.x, a.y - b.y) > R_FOLLOW) {
    release(b);
    startWalk(b, 'wander', { kind: 'follow', visitorId: a.id }, b.x, b.y);
  } else if (b.st !== 'idle') {
    release(b);
    finish(b, 1);
  }
  return true;
}

/** Tests and the card: the stage the pair attempts next, 0 after Proposal. */
export function nextStage(p: Pair): number {
  return p.stage < 7 ? p.stage + 1 : 0;
}

