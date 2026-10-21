// src/entities/romance.ts
// Pairs: formation, the couple's Pair at arrival, charm conversion, decay, endings, alumni, the featured pair and the pin (02 6; 03 6.4).
// The seven stages themselves (prerequisites, gates, start, completion, interruption, lingering) are in romance-stages.ts, the stage and
// reaction states in act-romance.ts, the embarrassments in embarrass.ts (split along 03 2.5, AGENTS rule 9).
// Ported from GV 4338 and 5483-5491 (court: the rendezvous shape only, used by romance-stages.ts). NEW otherwise.
// Rules (02 6.1): a Pair forms at a decision of a single (brain.ts rung 7, formStep) when two singles without a pair are within 4 tiles (2
// when the mist at the decider is 0.5 or more, assumption S5-A3) with line of sight (no non-passable prop and no water on the Bresenham
// line between the tile centres, the end tiles excepted), both in CAN_INTERRUPT states, compatible by seeks, and a 50 % roll passes on
// their first encounter: the roll is spent once per two ids per day (`rolled`, cleared at the day reset); affinity rnd(0.2, 0.4), stage 1
// (Notice) begins at once; feed.pair.formed. Regulars with a remembered partner skip the roll and the Pair comes back at the remembered
// stage and affinity, its formedDay the remembered lastDay (02 4.5 item 4, 6.7); a regular married here (memory stage 7) does not pair
// again (assumption S5-A4). A couple archetype arrives as a Pair at stage 3, affinity rnd(0.55, 0.70), no roll and no feed line
// (register 3.4; visitor.ts calls coupleArrived through its hook); an alumni couple (6.5) returns at stage 3 with affinity 0.70.
// Who may pair (owner 2026-10-20, register section 4 "Who can pair"): every Pair is one woman and one man. newPair, the one place a Pair
// is made (tryForm, formStep, coupleArrived, alumniRoll all end there), refuses two of the same sex; a restore drops a saved same-sex
// Pair or alumni couple (setRomanceState).
// Each step (03 4.2 phase 10, stepRomance): retryT counts down; a pair is together while its members are within 4 tiles and neither is in
// a reaction state; together, every 10 s, affinity += 0.004 x charmAt(midpoint, pair).total; the endings of 02 6.5 (Parted: affinity
// below 0.20 at stage >= 2, or three embarrassments in a day at stage >= 3). At the day reset (newDay) a pair apart loses 0.1 (02 6.3
// item 3, 03 6.4 item 3) and the rolls of the day are forgotten. Every 1.2 s planning tick (alumniRoll) checks once a day, from f 0.30,
// the 20 % roll that one alumni couple comes back (assumption S5-A5: the first planning tick of the day at f >= 0.30 rolls).
// This module never reads MODE or PLAYER (02 14.7).
import { T } from '../core/clock.ts';
import { chance, rint, rnd, rng } from '../core/rng.ts';
import { emit, type Params } from '../core/events.ts';
import { onResetCommands } from '../core/commands.ts';
import { nextPairId, type PairId, type PropId, type VisitorId } from '../core/ids.ts';
import { weatherAt } from '../core/weather.ts';
import { clamp01 } from '../core/math.ts';
import { I, OCC, WATER, inB } from '../world/grid.ts';
import { nearestGate } from '../world/park.ts';
import { charmAt, clearCharmSources, setLiveSources, setPairCharm, type CharmSource } from '../world/charm.ts';
import { regularsState, rememberPair } from './names.ts';
import {
  CAP_PEOPLE, byId, compatible, gateForRoll, nowTick, people, setPairHooks, spawnVisitor, visitors, type Sex, type Visitor,
} from './visitor.ts';
import { CAN_INTERRUPT } from './brain.ts';
import { REACTION_STATES, romanceRung, startStage } from './romance-stages.ts';
import { finish, release, startLeave } from './act.ts';

/** 03 3.4, plus `doing` (the stage in progress: 1-7, its negative while lingering, 0 none) and `alumniId` (an alumni couple's entry). */
export type Pair = {
  id: PairId; a: VisitorId; b: VisitorId; // a < b; a is the initiator
  stage: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; affinity: number; retryT: number; togetherT: number; charmT: number;
  embToday: number; embDay: number; formedDay: number; formedAbs: number;
  lastCupidAt: number; lastTogetherAbs: number; umbrellaUntil: number; boatUntil: number;
  spotPropId: PropId; stageT: number;
  doing: number; alumniId: number;
};
/** A Happily pair as the park remembers it (02 6.5: names and looks), and who of it is in the park now. */
export type AlumMember = { name: string; sex: Sex; lookSeed: number; ageWord: 'young' | 'grown' | 'elder' };
export type Alumni = { id: number; a: AlumMember; b: AlumMember; day: number; inPark: VisitorId[] };
export type RomanceSched = { rolled: number[]; alumniDay: number };

/* ---------- numbers (register 3.4, 3.5; 02 6; 06 1.6, 1.7) ---------- */
export const R_PAIR_FORM = 4;
export const R_PAIR_FORM_MIST = 2;
export const MIST_FORM = 0.5; // the mist at the decider from which the formation reach is 2 (assumption S5-A3)
export const R_TOGETHER = 4;
export const PAIR_ROLL = 0.5;
export const AFF_START_MIN = 0.2;
export const AFF_START_MAX = 0.4;
export const COUPLE_STAGE = 3;
export const COUPLE_AFF_MIN = 0.55;
export const COUPLE_AFF_MAX = 0.7;
export const ALUMNI_AFF = 0.7;
export const ALUMNI_RETURN = 0.2;
export const ALUMNI_F = 0.3; // the alumni roll waits for this f of the day (assumption S5-A5)
export const CHARM_RATE = 0.004;
export const CHARM_PERIOD = 10; // s
export const AFF_DECAY_DAY = 0.1;
export const PARTED_AFF = 0.2;
export const PARTED_EMB = 3;
export const HUFF_T = 6; // s

/* ---------- state ---------- */
export const pairs: Pair[] = [];
let alumni: Alumni[] = [];
let rolled: number[] = []; // the two ids of every encounter that rolled today, flat
let alumniDay = 0;
let pinned: PairId = 0;

export function pairById(id: PairId): Pair | undefined {
  return id ? pairs.find((p) => p.id === id) : undefined;
}
/** The pair `v` is in, or undefined. */
export function pairOf(v: Visitor): Pair | undefined {
  return pairById(v.pairId);
}
/** The other member of `p` for `v`. */
export function partnerOf(p: Pair, v: Visitor): Visitor | undefined {
  return byId(v.id === p.a ? p.b : p.a);
}
export function membersOf(p: Pair): [Visitor | undefined, Visitor | undefined] {
  return [byId(p.a), byId(p.b)];
}
export function midOf(p: Pair): { x: number; y: number } {
  const a = byId(p.a), b = byId(p.b);
  if (!a || !b) return { x: (a ?? b)?.x ?? 0, y: (a ?? b)?.y ?? 0 };
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
/** The names and a stage word of a pair as i18n params (03 12 item 6: the stage is a nested key). */
export function pairParams(p: Pair, extra: Params = {}): Params {
  return { a: byId(p.a)?.name ?? '', b: byId(p.b)?.name ?? '', stage: '@stage.' + STAGE_IDS[shownStage(p)], ...extra };
}
export const STAGE_IDS = ['notice', 'notice', 'chat', 'bench', 'stroll', 'picnic', 'kiss', 'proposal'] as const;
/** The stage a pair shows (the chip, the card, the sheet): the one in progress, else the last reached (a linger shows the current one). */
export function shownStage(p: Pair): number {
  return p.doing > 0 ? p.doing : p.stage;
}

function emitPair(kind: 'formed' | 'stage' | 'happily' | 'parted' | 'linger' | 'step', p: Pair, params: Params): void {
  const m = midOf(p);
  emit({ kind, tick: nowTick(), x: m.x, y: m.y, ids: [p.a, p.b, p.id], params: pairParams(p, params) });
}

/* ---------- formation (02 6.1) ---------- */

/** No non-passable prop and no water on the Bresenham line between the two tile centres (the end tiles excepted). */
export function lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
  let x = Math.round(x0), y = Math.round(y0);
  const tx = Math.round(x1), ty = Math.round(y1);
  const dx = Math.abs(tx - x), dy = -Math.abs(ty - y), sx = x < tx ? 1 : -1, sy = y < ty ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x === tx && y === ty) return true;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    if (x === tx && y === ty) return true;
    if (!inB(x, y)) return false;
    const i = I(x, y);
    if (OCC[i] !== 0 || (WATER[i] as number) > 0) return false;
  }
}

function rolledToday(a: VisitorId, b: VisitorId): boolean {
  for (let k = 0; k < rolled.length; k += 2) if (rolled[k] === a && rolled[k + 1] === b) return true;
  return false;
}

/** The six conditions of 02 6.1 but the roll: who may pair with whom here and now. */
export function canForm(a: Visitor, b: Visitor): boolean {
  if (a === b || a.archetype !== 'single' || b.archetype !== 'single' || a.pairId !== 0 || b.pairId !== 0) return false;
  if (!CAN_INTERRUPT[a.st] || !CAN_INTERRUPT[b.st] || !compatible(a, b)) return false;
  const w = weatherAt(Math.round(a.x), Math.round(a.y));
  const r = w.mist >= MIST_FORM ? R_PAIR_FORM_MIST : R_PAIR_FORM;
  if (Math.hypot(a.x - b.x, a.y - b.y) > r) return false;
  return lineOfSight(a.x, a.y, b.x, b.y);
}

/** The one place a Pair is made: null for two of the same sex (owner 2026-10-20: only a woman and a man), whatever the caller thinks. */
function newPair(a: Visitor, b: Visitor, stage: Pair['stage'], affinity: number): Pair | null {
  if (a.sex === b.sex) return null;
  const [x, y] = a.id < b.id ? [a, b] : [b, a];
  const p: Pair = {
    id: nextPairId(), a: x.id, b: y.id, stage, affinity, retryT: 0, togetherT: 0, charmT: 0, embToday: 0, embDay: T.day,
    formedDay: T.day, formedAbs: T.abs, lastCupidAt: -1, lastTogetherAbs: T.abs, umbrellaUntil: 0, boatUntil: 0, spotPropId: 0, stageT: 0,
    doing: 0, alumniId: 0,
  };
  pairs.push(p);
  a.pairId = p.id;
  b.pairId = p.id;
  return p;
}

/**
 * Form a pair of two singles (02 6.1): null unless the conditions hold and, without `skipRoll`, the once-a-day 50 % roll passes (a
 * failed roll is not repeated for the two that day, and costs no draw then). Affinity rnd(0.2, 0.4); Notice starts at once.
 */
export function tryForm(a: Visitor, b: Visitor, skipRoll = false): Pair | null {
  if (!canForm(a, b)) return null;
  const lo = Math.min(a.id, b.id), hi = Math.max(a.id, b.id);
  if (!skipRoll) {
    if (rolledToday(lo, hi)) return null;
    rolled.push(lo, hi);
    if (!chance(PAIR_ROLL)) return null;
  }
  const p = newPair(a, b, 1, rnd(AFF_START_MIN, AFF_START_MAX));
  if (!p) return null;
  emitPair('formed', p, { feed: 'feed.pair.formed' });
  startStage(p, 1, false);
  return p;
}

/** A regular's remembered partner who is `o` (02 4.5 item 4), with the memory; null otherwise. */
function memoryOf(v: Visitor, o: Visitor): { stage: number; affinity: number; lastDay: number } | null {
  if (v.regularId === 0 || o.regularId === 0) return null;
  const r = regularsState().find((s) => s.regularId === v.regularId);
  return r && r.memory.partnerId === o.regularId ? r.memory : null;
}
function married(v: Visitor): boolean {
  if (v.regularId === 0) return false;
  return regularsState().find((s) => s.regularId === v.regularId)?.memory.stage === 7;
}

/**
 * Rung 7's formation check for a single (02 4.3 single item 6, 03 6.4 item 1): the first single in list order it can pair with now.
 * A remembered partner comes back without a roll at the remembered stage and affinity. True when a pair formed.
 */
export function formStep(v: Visitor): boolean {
  if (v.archetype !== 'single' || v.pairId !== 0 || !CAN_INTERRUPT[v.st] || married(v)) return false;
  for (const o of visitors) {
    if (o === v || o.archetype !== 'single' || o.pairId !== 0 || married(o) || !canForm(v, o)) continue;
    const m = memoryOf(v, o);
    if (m && m.stage > 0) {
      const p = newPair(v, o, Math.min(6, Math.max(1, m.stage)) as Pair['stage'], m.affinity);
      if (!p) continue;
      p.formedDay = m.lastDay; // a later visit (02 6.7)
      emitPair('formed', p, { feed: 'feed.pair.formed' });
      return true;
    }
    if (tryForm(v, o)) return true;
  }
  return false;
}

/** visitor.ts's couple arrival (register 3.4): the two as a Pair at stage 3 with affinity rnd(0.55, 0.70), no roll, no feed line. */
function coupleArrived(f: Visitor, m: Visitor): void {
  const p = newPair(f, m, COUPLE_STAGE, rnd(COUPLE_AFF_MIN, COUPLE_AFF_MAX));
  if (p) emitPair('formed', p, { couple: 1 });
}

/* ---------- endings and dissolutions (02 6.5) ---------- */

function drop(p: Pair): void {
  const k = pairs.indexOf(p);
  if (k >= 0) pairs.splice(k, 1);
  for (const id of [p.a, p.b]) {
    const v = byId(id);
    if (v && v.pairId === p.id) v.pairId = 0;
  }
  if (pinned === p.id) pinned = 0;
}

/** Write both regulars' memory of the pair (02 4.5 item 4); `partnerless` forgets the partner (Parted, T8). */
function remember(p: Pair, partnerless: boolean): void {
  const a = byId(p.a), b = byId(p.b);
  if (!a || !b || a.regularId === 0 || b.regularId === 0) return;
  const m = (o: Visitor) => ({ partnerId: partnerless ? 0 : o.regularId, affinity: p.affinity, stage: partnerless ? 0 : p.stage, lastDay: T.day });
  rememberPair(a.regularId, m(b));
  rememberPair(b.regularId, m(a));
}

/** Parted (02 6.5): a 6 s huff facing away, the pair gone, each to a different gate (the two nearest distinct ones). */
export function part(p: Pair): void {
  const a = byId(p.a), b = byId(p.b);
  emitPair('parted', p, { feed: 'feed.parted', ending: 'parted' });
  remember(p, true);
  drop(p);
  const ga = a ? nearestGate(a.x, a.y).id : 'g_south_w';
  const gb = b ? nearestGate(b.x, b.y, ga).id : 'g_south_e';
  for (const [v, o, g] of [[a, b, ga], [b, a, gb]] as const) {
    if (!v) continue;
    release(v);
    v.st = 'huff';
    v.t = HUFF_T;
    v.path = null;
    v.gateOut = g; // act-romance.ts walks it there when the huff ends
    v.job = { kind: 'parted', visitorId: o?.id ?? 0 };
  }
}

/** Happily (02 6.5): they leave together by the nearest gate; alumni (once); regulars married in memory; CP is S6's. */
export function happily(p: Pair): void {
  const a = byId(p.a), b = byId(p.b);
  const renewed = p.alumniId !== 0;
  emitPair('happily', p, { feed: renewed ? 'feed.romance.renewed' : 'feed.happily', ending: 'happily' });
  if (!renewed && a && b) {
    const mem = (v: Visitor): AlumMember => ({ name: v.name, sex: v.sex, lookSeed: v.lookSeed, ageWord: v.ageWord });
    alumni.push({ id: alumni.reduce((n, x) => Math.max(n, x.id), 0) + 1, a: mem(a), b: mem(b), day: T.day, inPark: [a.id, b.id] });
  }
  remember(p, false);
  drop(p);
  const m = { x: ((a?.x ?? 0) + (b?.x ?? a?.x ?? 0)) / 2, y: ((a?.y ?? 0) + (b?.y ?? a?.y ?? 0)) / 2 };
  const g = nearestGate(m.x, m.y).id;
  for (const v of [a, b]) {
    if (!v) continue;
    release(v);
    startLeave(v, g);
  }
}

/**
 * A member is leaving (brain.ts rung 3; 02 6.5 "other dissolutions"): from stage 2 on the two leave together by `v`'s gate ("strolled off
 * together"); before that `v` leaves alone and the other keeps social 0.5. Regulars remember. Returns the partner who leaves along, if any.
 */
export function leaving(v: Visitor): Visitor | undefined {
  const p = pairOf(v);
  if (!p) return undefined;
  const o = partnerOf(p, v);
  const both = p.stage >= 2 && !!o;
  // a feed line on a `step` event, as the gardener's (S4; events.ts has no feed kind); never a `stage`, which S6 scores
  emitPair('step', p, both ? { feed: 'feed.left_together', ending: 'left' } : { feed: 'feed.left_alone', a: v.name, b: o?.name ?? '', ending: 'left' });
  remember(p, false);
  drop(p);
  if (o && !both) {
    o.social = 0.5;
    release(o);
    finish(o, 0);
  }
  return both ? o : undefined;
}

/** visitor.ts removes `v` (a gate, a test): a pair it is still in goes without a line; alumni forget it is in the park. */
function removed(v: Visitor): void {
  const p = pairOf(v);
  if (p) {
    remember(p, false);
    drop(p);
  }
  for (const al of alumni) al.inPark = al.inPark.filter((id) => id !== v.id);
}

/* ---------- each step (03 4.2 phase 10, 6.4 item 3) ---------- */

/** Together (02 6.3 item 2): within 4 tiles and neither in a reaction state. */
export function together(p: Pair): boolean {
  const a = byId(p.a), b = byId(p.b);
  if (!a || !b || REACTION_STATES[a.st] || REACTION_STATES[b.st]) return false;
  return Math.hypot(a.x - b.x, a.y - b.y) <= R_TOGETHER;
}

export function stepRomance(dt: number): void {
  for (const p of pairs.slice()) {
    if (!byId(p.a) || !byId(p.b)) {
      drop(p);
      continue;
    }
    if (p.retryT > 0) p.retryT = Math.max(0, p.retryT - dt);
    if (together(p)) {
      p.togetherT += dt;
      p.lastTogetherAbs = T.abs;
      p.charmT += dt;
      if (p.charmT >= CHARM_PERIOD) {
        p.charmT -= CHARM_PERIOD;
        const m = midOf(p);
        p.affinity = clamp01(p.affinity + CHARM_RATE * charmAt(m.x, m.y, p.id).total);
      }
    }
    if ((p.stage >= 2 && p.affinity < PARTED_AFF) || (p.stage >= 3 && p.embToday >= PARTED_EMB)) part(p);
  }
}

/** The day reset (03 4.2 phase 5): a pair apart loses 0.1 (02 6.3 item 3); today's rolls are forgotten. No draw. */
export function newDay(): void {
  rolled = [];
  for (const p of pairs) if (!together(p)) p.affinity = clamp01(p.affinity - AFF_DECAY_DAY);
}

/* ---------- alumni (02 6.5 "Returning couples") ---------- */

/**
 * The planning tick (03 4.3 item 5): once a day, at the first tick from f 0.30, a 20 % roll (only when some alumni couple is outside and
 * there is room for two) brings one of them back as the couple archetype through a gate by weight: a Pair at stage 3 with affinity 0.70.
 */
export function alumniRoll(): void {
  if (alumniDay === T.day || T.f < ALUMNI_F) return;
  alumniDay = T.day;
  const out = alumni.filter((al) => al.inPark.length === 0 && al.a.sex !== al.b.sex); // one woman and one man
  if (out.length === 0 || CAP_PEOPLE - people() < 2) return;
  if (!chance(ALUMNI_RETURN)) return;
  const al = out[rint(0, out.length - 1)] as Alumni;
  const gate = gateForRoll(rng() * 100);
  const leaveAt = T.abs + rnd(0.25, 0.5);
  const spawn = (m: AlumMember): Visitor | null => {
    const v = spawnVisitor('couple', gate, { sex: m.sex, name: m.name, leaveAt, ageWord: m.ageWord }); // seeks the opposite sex
    if (v) v.lookSeed = m.lookSeed;
    return v;
  };
  const a = spawn(al.a), b = a && spawn(al.b);
  if (!a || !b) return;
  a.coupleOf = b.id;
  b.coupleOf = a.id;
  const p = newPair(a, b, COUPLE_STAGE, ALUMNI_AFF);
  if (!p) return;
  al.inPark = [a.id, b.id];
  p.alumniId = al.id;
  emitPair('formed', p, { feed: 'feed.alumni_return', couple: 1 });
}

/* ---------- the featured pair (02 6.6) ---------- */

/** The pinned pair while it lasts, else the highest stage, then the earliest formedDay, then the lowest id. */
export function featured(): Pair | null {
  if (pinned && !pairById(pinned)) pinned = 0;
  const pin = pairById(pinned);
  if (pin) return pin;
  let best: Pair | null = null;
  for (const p of pairs)
    if (!best || p.stage > best.stage || (p.stage === best.stage && (p.formedDay < best.formedDay || (p.formedDay === best.formedDay && p.id < best.id)))) best = p;
  return best;
}
/** The Romances sheet's and the pair card's Pin (UI state per client, not a command: 02 14.3; saved, never hashed: 03 11). */
export function setPin(id: PairId | 0): void {
  pinned = id && pairById(id) ? id : 0;
}
export function pinnedPair(): PairId {
  return pinned;
}

/* ---------- rung 6 (02 5.2) ---------- */

/** Rung 6 of the decide ladder: romance-stages.ts runs it (the stage start, lingering, the partner keeping close). */
export function romanceStep(v: Visitor): boolean {
  const p = pairOf(v);
  return !!p && romanceRung(p, v);
}

/* ---------- state ---------- */

export function pairsState(): Pair[] {
  return JSON.parse(JSON.stringify(pairs)) as Pair[];
}
export function alumniState(): Alumni[] {
  return JSON.parse(JSON.stringify(alumni)) as Alumni[];
}
export function romanceSched(): RomanceSched {
  return { rolled: rolled.slice(), alumniDay };
}
/**
 * A restore: the pairs (with their umbrella charm), the alumni, the day's rolls, the pin. A saved pair of two of the same sex, or an alumni
 * couple of them, is forgotten (owner 2026-10-20: a Pair is one woman and one man): the two walk on as singles, nobody throws.
 */
export function setRomanceState(list: readonly Pair[], al: readonly Alumni[], s: Partial<RomanceSched> | undefined, pin: PairId): void {
  pairs.length = 0;
  clearCharmSources();
  for (const r of list) {
    const a = byId(r.a), b = byId(r.b);
    if (a && b && a.sex === b.sex) {
      for (const v of [a, b]) {
        release(v);
        finish(v, 0);
        v.pairId = 0;
      }
      if (pin === r.id) pin = 0;
      continue;
    }
    const p = { ...(JSON.parse(JSON.stringify(r)) as Pair) };
    p.doing ??= 0;
    p.alumniId ??= 0;
    pairs.push(p);
    if (p.umbrellaUntil > 0) setPairCharm(p.id, 'umbrella', p.umbrellaUntil);
    if (p.boatUntil > 0) setPairCharm(p.id, 'boat', p.boatUntil);
  }
  alumni = (JSON.parse(JSON.stringify(al)) as Alumni[]).filter((x) => x.a.sex !== x.b.sex);
  rolled = (s?.rolled ?? []).slice();
  alumniDay = s?.alumniDay ?? 0;
  pinned = pin;
}
export function resetRomance(): void {
  setRomanceState([], [], undefined, 0);
}

/** The live charm sources the entities own (03 6.7 item 4): an AI or summoned busker playing, +3 within 8. */
function liveSources(out: CharmSource[]): void {
  for (const v of visitors)
    if (v.archetype === 'busker' && v.st === 'play') out.push({ kind: 'busker', x: v.x, y: v.y, r: 8, amount: 3, player: v.spawnedForPlayer, until: 0 });
}

setLiveSources(liveSources);
setPairHooks({ couple: coupleArrived, removed });
onResetCommands(resetRomance);
