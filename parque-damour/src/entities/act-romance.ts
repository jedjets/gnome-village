// src/entities/act-romance.ts
// The stage states of 02 6.2 (notice, chat, goBench, bench, stroll, goPicnic, picnic, kiss, proposal), the Parted huff, the backfire
// laugh and the reaction states of 02 6.4 (wipe, shake, stumble, chase, flap, huddle, distracted, baffled, lost, duck).
// Split out of act.ts (AGENTS rule 9; 03 2.5 row act-romance.ts): brain.ts hands visitor.ts an act that tries actRomance first.
// Ported from GV 4968-4987 (act: a state with a timer and what follows it) and 5483-5492 (court: two walkers meet, then a timed state).
// ADAPT: the initiator (the lower id) keeps the stage's clock in pair.stageT and counts it down once both are in place (arrived, or
// seated, or from the start of a Stroll); a member who left the stage interrupts it (02 6.2 rule 4); a stage that rungs 2-5 would cut
// (02 6.2 "Interrupted by"; Chat, Bench and Stroll by rungs 2-5, Picnic by rungs 2-3 and by rain above 0.3) ends at once and the two
// decide again. Hearts, the chat bubbles and the ring sparkle are `fx` events (render/effects.ts draws them; their timing comes from the
// timers, never from a draw). The Stroll moves as one unit at 2.4 (move.ts speedOf): the initiator walks the loop's corners, the other
// half a tile behind (02 4.3 couple item 1, 6.2 stage 4). Reactions end standing; the snatched chase ends in a 3 s huff; a flap flees 3
// tiles; a lost visitor wanders and stops when the partner is within 2 (02 6.4, 04 9.3).
import { T } from '../core/clock.ts';
import { rnd } from '../core/rng.ts';
import { emit } from '../core/events.ts';
import { weatherAt } from '../core/weather.ts';
import type { XY } from '../core/math.ts';
import { propById } from '../world/grid.ts';
import { LOOP_CORNERS } from './staff.ts';
import { goTo } from './move.ts';
import { finish, release, startLeave, takeSeat, walkDirect } from './act.ts';
import { byId, nowTick, type Visitor } from './visitor.ts';
import { midOf, pairById, partnerOf, type Pair } from './romance.ts';
import { RAIN_STAGE, REACTION_STATES, STAGE_STATES, completeStage, interruptStage } from './romance-stages.ts';

/** The snatched chase ends in this huff (02 6.4); a lost visitor wanders a step every 5 s and stops within 2 of the partner. */
export const SNATCH_HUFF_T = 3;
export const LOST_STEP_T = 5;
export const LOST_NEAR = 2;
export const FLAP_FLEE = 3;
/** Hearts (04 7.6 item 1): Notice 2, Bench 1 every 10 s, Picnic 1 every 8 s, Kiss 6; the ring sparkle 8 s into the Proposal. */
export const HEARTS = { notice: 2, kiss: 6, benchEvery: 10, picnicEvery: 8, ringAt: 8 } as const;
/** Rung thresholds a stage in progress yields to (02 5.2 rungs 2-5). */
const RAIN_SHELTER = 0.6, COMFORT_SHELTER = 0.3, COMFORT_LEAVE = 0.1, HUNGER_EAT = 0.6, ENERGY_REST = 0.25;

function fx(x: number, y: number, kind: string, n: number, ids: number[]): void {
  emit({ kind: 'fx', tick: nowTick(), x, y, ids, params: { fx: kind, n, romance: 1 } });
}

/** True when one of rungs 2-5 (or 2-3) would fire on `v` now (02 6.2 "Interrupted by"). */
function rungWants(v: Visitor, upTo: 3 | 5): boolean {
  if (weatherAt(Math.round(v.x), Math.round(v.y)).rain > RAIN_SHELTER && v.comfort < COMFORT_SHELTER) return true;
  if (T.abs >= v.leaveAt || v.comfort < COMFORT_LEAVE) return true;
  if (upTo === 3) return false;
  return v.hunger > HUNGER_EAT || (v.energy < ENERGY_REST && v.sitPropId === 0);
}

/** Both in place: arrived at the rendezvous, seated on the spot, or (Stroll, Notice) at once. */
function inPlace(st: string, a: Visitor, b: Visitor): boolean {
  if (st === 'stroll' || (st === 'notice' && !a.path && !b.path)) return true;
  if (st === 'bench' || st === 'picnic') return a.st === st && b.st === st;
  return !a.path && !b.path && a.st === b.st;
}

/** The initiator's clock: hearts by the stage, the yields of 02 6.2, completion at the end. */
function clock(p: Pair, a: Visitor, b: Visitor, dt: number): void {
  const st = a.st;
  const yields = st === 'chat' || st === 'bench' || st === 'stroll' || st === 'goBench' ? 5 : st === 'picnic' || st === 'goPicnic' ? 3 : 0;
  if (yields && (rungWants(a, yields) || rungWants(b, yields))) {
    interruptStage(p);
    return;
  }
  const m = midOf(p);
  if ((st === 'picnic' || st === 'goPicnic') && weatherAt(Math.round(m.x), Math.round(m.y)).rain > RAIN_STAGE) {
    interruptStage(p); // rain rising above 0.3 cancels the picnic (02 6.2 stage 5)
    return;
  }
  if (!inPlace(st, a, b)) return;
  const k = Math.abs(p.doing);
  if (!a.job.left) {
    a.job.left = 1; // the stage's first counted step
    if (k === 1) fx(m.x, m.y, 'heart', HEARTS.notice, [a.id, b.id]);
    if (k === 6) fx(m.x, m.y, 'heart', HEARTS.kiss, [a.id, b.id]);
  }
  const t0 = p.stageT;
  p.stageT -= dt;
  const every = st === 'bench' ? HEARTS.benchEvery : st === 'picnic' ? HEARTS.picnicEvery : 0;
  if (every && Math.floor(t0 / every) !== Math.floor(p.stageT / every) && p.stageT > 0) fx(m.x, m.y, 'heart', 1, [a.id, b.id]);
  if (k === 7 && t0 > 15 - HEARTS.ringAt && p.stageT <= 15 - HEARTS.ringAt) fx(m.x, m.y, 'spark', 8, [a.id, b.id]);
  if (p.stageT <= 0) {
    if (st === 'picnic') for (const v of [a, b]) v.hunger = Math.min(v.hunger, 0.1); // they ate (02 6.2 stage 5)
    completeStage(p);
  }
}

/** A stroll's legs: the initiator round the loop's corners, the other half a tile behind (every 0.5 s, GV follow idiom). */
function strollStep(v: Visitor, o: Visitor, dt: number): void {
  if (v.job.kind === 'follow') {
    v.t -= dt;
    if (v.t > 0) return;
    v.t = 0.5;
    const d = Math.hypot(v.x - o.x, v.y - o.y) || 1;
    walkDirect(v, o.x + ((v.x - o.x) / d) * 0.5, o.y + ((v.y - o.y) / d) * 0.5);
    return;
  }
  if (v.path) return;
  const l = v.job.kind === 'loop0' ? 0 : 1;
  const step = ((v.job.step ?? 0) + 1) % 4;
  v.job.step = step;
  const to = (LOOP_CORNERS[l] as readonly XY[])[step] as XY;
  goTo(v, to.x, to.y);
}

/** One step of a stage state for a member of the pair its job names. */
function stageStep(v: Visitor, dt: number): void {
  const p = pairById(v.job.pairId ?? 0);
  if (!p || p.doing === 0) {
    release(v);
    finish(v, 0);
    return;
  }
  const o = partnerOf(p, v);
  if (!o || o.job.pairId !== p.id || !STAGE_STATES[o.st]) {
    interruptStage(p);
    return;
  }
  if (v.st === 'goBench' || v.st === 'goPicnic') {
    const spot = propById(v.job.propId ?? 0);
    if (!spot) {
      interruptStage(p); // the bench or the blanket went (02 6.2 stage 3)
      return;
    }
    if (!v.path) {
      takeSeat(v, spot);
      v.st = v.st === 'goBench' ? 'bench' : 'picnic';
    }
  } else if ((v.st === 'bench' || v.st === 'picnic') && !propById(v.sitPropId)) {
    interruptStage(p);
    return;
  } else if (v.st === 'stroll') strollStep(v, o, dt);
  if (v.id === p.a) clock(p, v, o, dt);
}

/** One step of a reaction, the huff or the laugh; when it ends, the visitor stands and decides again. */
function reactionStep(v: Visitor, dt: number): void {
  if (v.st === 'flap' && !v.job.left) {
    v.job.left = 1; // flee 3 tiles at 4.0 (02 6.4 wasp; move.ts speedOf)
    goTo(v, v.x + (v.face === 1 ? FLAP_FLEE : -FLAP_FLEE), v.y);
  }
  const t0 = v.t;
  v.t -= dt;
  if (v.st === 'lost') {
    const p = byId(v.job.visitorId ?? 0);
    if (p && Math.hypot(p.x - v.x, p.y - v.y) <= LOST_NEAR) v.t = 0;
    else if (Math.floor(t0 / LOST_STEP_T) !== Math.floor(v.t / LOST_STEP_T) && !v.path) goTo(v, v.x + rnd(-2, 2), v.y + rnd(-2, 2));
  }
  if (v.t > 0) return;
  v.path = null;
  if (v.st === 'chase') {
    v.st = 'huff';
    v.t = SNATCH_HUFF_T;
    v.job = { kind: 'snatched' };
    return;
  }
  if (v.st === 'huff' && v.job.kind === 'parted' && v.gateOut) {
    startLeave(v, v.gateOut);
    return;
  }
  finish(v);
  v.decideT = 0;
}

/**
 * The romance and reaction states (03 2.5 act.ts: "the reaction states and backfire scenes are S5's"). True when `v` was in one of
 * them (act.ts then does nothing more this step); false for every other state, and for a seat walk that is not a pair's.
 */
export function actRomance(v: Visitor, dt: number): boolean {
  if (REACTION_STATES[v.st] || v.st === 'laugh') {
    reactionStep(v, dt);
    return true;
  }
  if (!STAGE_STATES[v.st] || !v.job.pairId) return false;
  stageStep(v, dt);
  return true;
}

/** The romance states the card's doing line names (06 16.9 `doing.<st>`), beside act.ts DOING. */
export const ROMANCE_DOING = [
  'notice', 'chat', 'bench', 'stroll', 'kiss', 'proposal', 'laugh', 'huff', 'wipe', 'shake', 'stumble', 'chase', 'flap', 'huddle', 'distracted',
  'baffled', 'lost', 'duck',
] as const;
