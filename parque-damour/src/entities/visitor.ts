// src/entities/visitor.ts
// The Visitor record (03 3.3), the factory, the arrivals scheduler, callVisitor ("+"), removal at the outside tile, the cap of 30 people
// without cameos, the decide cadence with the one MODE branch (03 4.4), and the park tools' hooks of S3 (02 8.3, 8.5 item 3).
// Ported from GV 1387-1399 (makeGnome: the record and its starting values), 4488-4503 (addVillager: the cap and the complementary-sex
// rule), 5689-5716 (updateGnomes: the 5696 cadence and its MODE branch only).
// Verdict: ADAPT. Changes: the record of 03 3.3 with ids for every link (03 P5); starting needs of 02 4.2 item 5 (hunger 0.2-0.5, energy
// 0.5-0.9, comfort 0.7, social 0.2-0.6); visit 0.25-0.5 day (tourist 0.25; staff never); the cap is 30 people, cameos excluded (GV
// POP_CAP 44), enforced in spawnVisitor and callVisitor; visitors appear on a gate's outside tile and step onto its first tile (02 4.2
// item 3) instead of a sea shore; the complementary rule re-rolls a single's sex and seeks once when the single seeks f or m and no
// unpaired single in the park is compatible (02 4.2 item 7; GV chose the sex directly); the arrivals scheduler of 02 4.2 is new (GV's
// strangers came a day after someone became single); the cadence calls the injected avatarDecide for the possessed actor (03 4.4).
// Dropped from the range: 1388-1398's age, stage, height, carry, swim, climb, float, rescue, indoors, home, mate, craft and animation
// fields; 4489's toast (callVisitor returns reason.park_full, the shell toasts it); 4493-4494 and 4498 (village position, shore, splash);
// 4497's g.called (write-only, review 16); 4500 (the inline feed sentence); 5690-5695 and 5697-5715 (dug, needs, act, building, ride,
// float, bend, hop, wary, tag, blink, splash: needs.ts, act.ts and move.ts own what is kept).
//
// Draw order on the sim stream (rng), so a replay meets the same numbers:
//   stepArrivals, when an arrival is due: the gate (1), the archetype (1); then the group: a tourist rolls alone or pair (1); a couple
//     draws its shared leaveAt (1); then each member's own draws below; last, the gap to the next arrival (1).
//   callVisitor: the gate (1, unless given), single 60 % (1), the archetype when not single (1); then the group as above (no gap).
//   spawnVisitor, per person: lookSeed (1), sex (1, unless fixed: a regular's, a couple member's, a given one, the gardener's m), seeks
//     (1, singles only and not a regular; a re-roll draws sex and seeks again), ageWord (1, for single, tourist, jogger, artist, busker,
//     dog walker; not a regular), the name (1, names.ts takeName; none for a regular, a given name or the gardener), hunger, energy,
//     social (3), leaveAt (1, unless fixed: a tourist's, staff's, a couple's (its one draw comes before the two members), a child's (the
//     parent's)), decideT (1). So an elder makes 8 draws, a generated single 10 (12 with the re-roll), a returning regular 6.
// lookSeed: the low 3 bits are the signature colour index (04 7.3; signatureOf); bit 3 a hat and bit 4 a purse for those whose
// archetype does not fix them; the renderer reads the rest (lookSeed >>> 5) for hair, coat and skin.
// S4 part B: loop.ts runs stepArrivals (phase 7) and stepVisitors (phase 8); brain.ts hands in decide, act and BUSY (setBrain), romance.ts
// its pair hooks (setPairHooks, S5), so this file imports neither; it registers `visitor.call` (03 5.1); store.ts saves the list and the
// timer. A new park empties the list without a draw. Beyond 03 3.3: `plan` (a routine's progress across an interruption) and the Job
// counters `step` and `left`. A `drawless` spawn makes no draw (a kiosk's vendor: 08 2.5 undo row 1).
// Park pace (owner 2026-10-14, register section 4): this file registers `park.pace` and keeps the park's pace with the arrivals timer
// (arrivalsState); a Calm park draws 02 4.2's 6-14 s gap, a Lively one LIVELY_GAP_MIN-MAX, one draw either way. A new park is calm.
import type { XY } from '../core/math.ts';
import { START_ABS, STEPS_PER_DAY, T, type Phase } from '../core/clock.ts';
import { chance, rnd, rng } from '../core/rng.ts';
import { nextVisitorId, type CreatureId, type GateId, type PairId, type PropId, type VisitorId } from '../core/ids.ts';
import { emit } from '../core/events.ts';
import { OK, fail, isPace, onResetCommands, registerHandler, type Pace, type Result } from '../core/commands.ts';
import { W, type WeatherKind } from '../core/weather.ts';
import { I, inB, propById, props } from '../world/grid.ts';
import { GATES, gateById } from '../world/park.ts';
import { getMode, getPlayer } from '../play/mode.ts';
import { GARDENER_NAME, regularArrived, regularDue, regularLeft, releaseName, resetNames, takeName, type RegularDef, type Seeks, type Sex } from './names.ts';
import { NO_TARGET, R_OPEN_NEAR, goTo, moveStep, openNear, spaceOut } from './move.ts';
import { stepNeeds } from './needs.ts';

export type { Prop, PropKind } from '../world/grid.ts'; // 03 3.6: the Prop type, re-exported here
export type { Seeks, Sex } from './names.ts';

/** The register's archetypes (3.4, ids without the space) plus `child` and `cameo` (03 3.3, A3). */
export type Archetype =
  | 'single' | 'couple' | 'family' | 'child' | 'elder' | 'tourist' | 'jogger' | 'artist' | 'busker' | 'dogwalker' | 'gardener' | 'vendor' | 'cameo';
export type AgeWord = 'young' | 'grown' | 'elder';
/** The ten kinds of register section 5; embarrass.ts (S5) owns the list. */
export type EmbKind = 'poop' | 'soaked' | 'trip' | 'snatched' | 'wasp' | 'drenched' | 'rival' | 'mime' | 'fog' | 'flock';
export type Job = {
  propId?: PropId; tile?: XY; pairId?: PairId; visitorId?: VisitorId; creatureId?: CreatureId; kind?: string;
  step?: number; // a loop's next corner (0-3)
  left?: number; // what is left: a loop's legs, a feeder's crumbs
};
export type Items = { hat: boolean; purse: boolean; baguette: boolean; iceCream: boolean };

/** 03 3.3. */
export type Visitor = {
  id: VisitorId; name: string; sex: Sex; archetype: Archetype; ageWord: AgeWord;
  seeks: Seeks; lookSeed: number;
  x: number; y: number; face: -1 | 1; st: string; t: number;
  path: XY[] | null; pi: number; ptx: number; pty: number; replanT: number; blocked: number; blockedList: number[];
  job: Job;
  hunger: number; energy: number; comfort: number; social: number;
  arrivedAt: number; leaveAt: number; gateIn: GateId; gateOut: GateId | null;
  pairId: PairId; coupleOf: VisitorId; parentOf: VisitorId; childOf: VisitorId;
  items: Items;
  embToday: number; embDay: number; pendingEmb: EmbKind | null; regularId: number; decideT: number;
  sitPropId: PropId; basket: number; shares: number; cdUntil: number; spawnedForPlayer: boolean;
  plan: number; // the routine's progress (see the file header); 0 at arrival
};

/* ---------- numbers (02 4.2, 06 1.4, 1.8, 5.1, 14.1, 15) ---------- */
export const CAP_PEOPLE = 30;
export const CAP_ARTISTS = 1;
export const CAP_AI_BUSKERS = 1;
export const CAP_DOGWALKERS = 2;
export const ARRIVAL_GAP_MIN = 6; // s
export const ARRIVAL_GAP_MAX = 14;
/** A Lively park's gap in s (register section 4, Park pace and Options): tuned on seed 101 to 07 S4.7 item 2's 16 and 24. */
export const LIVELY_GAP_MIN = 3;
export const LIVELY_GAP_MAX = 6;
export const VISIT_MIN = 0.25; // days
export const VISIT_MAX = 0.5;
export const VISIT_TOURIST = 0.25;
export const CALL_SINGLE = 0.6; // 06 1.8 CALL_SINGLE_PCT 60
export const TOURIST_PAIR = 0.4; // 06 5.1: alone 60 %, pair 40 %
export const DECIDE_MIN = 0.5; // s (GV 5696)
export const DECIDE_MAX = 1.3;
export const COMFORT_START = 0.7;
export const SIGNATURES = 8; // 04 7.3
/** "Never leaves" for staff, as a finite number of days so the record survives JSON (Infinity would save as null). */
export const NEVER = 1e9;

/** Population target by day phase (02 4.2 item 1, 06 1.3). */
export const PHASE_TARGET: Readonly<Record<Phase, number>> = {
  night: 3, dawn: 6, morning: 16, midday: 20, afternoon: 24, golden: 20, dusk: 14, evening: 9,
};
/** Arrival factor by the global weather kind (02 3.3, 06 14.1). */
export const WEATHER_ARRIVALS: Readonly<Record<WeatherKind, number>> = {
  clear: 1.0, fair: 1.0, cloudy: 0.9, breeze: 0.9, rain: 0.5, shower: 0.7, mist: 0.8, snow: 0.6,
};
/** Arrival factor by season, spring to winter (02 3.4, 06 15). */
export const SEASON_ARRIVALS: readonly number[] = [1.0, 1.1, 1.0, 0.7];
/** Archetype weights per arrival, in the order of 02 4.2 item 4 (sum 100). */
export const ARCHETYPE_WEIGHTS: ReadonlyArray<readonly [Archetype, number]> = [
  ['single', 30], ['couple', 12], ['family', 12], ['elder', 10], ['tourist', 12], ['jogger', 8], ['artist', 4], ['dogwalker', 8], ['busker', 4],
];
/** seeks for a single (02 4.2 item 7): f 45, m 45, any 10. */
export const SEEKS_WEIGHTS: ReadonlyArray<readonly [Seeks, number]> = [['f', 45], ['m', 45], ['any', 10]];

const AGE_ROLLED: ReadonlySet<Archetype> = new Set<Archetype>(['single', 'tourist', 'jogger', 'artist', 'busker', 'dogwalker']);
const HAT_ALWAYS: ReadonlySet<Archetype> = new Set<Archetype>(['elder', 'tourist', 'artist', 'vendor']); // 04 7.2: cap, sunhat, floppy hat
const STAFF: ReadonlySet<Archetype> = new Set<Archetype>(['gardener', 'vendor']);

/* ---------- state ---------- */
export const visitors: Visitor[] = [];
const index = new Map<VisitorId, Visitor>();
let arrivalT = 0; // s until the next arrival may come; 0 at a new park: the first comes on the first step
let pace: Pace = 'calm'; // the park's pace (the park.pace command); a new park and a save without one are calm
let avatarDecide: (v: Visitor) => void = () => {};

export function byId(id: VisitorId): Visitor | undefined {
  return index.get(id);
}

/** People in the park: everyone but cameos (03 3.11). */
export function people(): number {
  let n = 0;
  for (const v of visitors) if (v.archetype !== 'cameo') n++;
  return n;
}

/** The colour index of the scarf (04 7.3): the low 3 bits of lookSeed. */
export function signatureOf(lookSeed: number): number {
  return lookSeed % SIGNATURES;
}

/** The step count now, from the clock (entities do not import the conductor; T.abs is START_ABS + tick / STEPS_PER_DAY). */
export function nowTick(): number {
  return Math.round((T.abs - START_ABS) * STEPS_PER_DAY);
}

/** The pick of `table` for `u` in [0, total): one place per weight, in table order. */
function byWeight<K>(u: number, table: ReadonlyArray<readonly [K, number]>): K {
  let acc = 0;
  for (const [k, w] of table) {
    acc += w;
    if (u < acc) return k;
  }
  return (table[table.length - 1] as readonly [K, number])[0];
}

/** The gate for `u` in [0, 100) by the arrival weights of 02 2.4 (30, 30, 15, 15, 10). */
export function gateForRoll(u: number): GateId {
  return byWeight(u, GATES.map((g) => [g.id, g.weight] as const));
}

/** The archetype for `u` in [0, 100) by the weights of 02 4.2 item 4. */
export function archetypeForRoll(u: number): Archetype {
  return byWeight(u, ARCHETYPE_WEIGHTS);
}

/** How many visitors match `pred`. */
function countWhere(pred: (v: Visitor) => boolean): number {
  let n = 0;
  for (const v of visitors) if (pred(v)) n++;
  return n;
}

/** 02 4.2 item 4: a roll that hits a full archetype (1 artist, 1 AI busker, 2 dog walkers in the park) becomes a single. */
export function capArchetype(a: Archetype): Archetype {
  if (a === 'artist' && countWhere((v) => v.archetype === 'artist') >= CAP_ARTISTS) return 'single';
  if (a === 'busker' && countWhere((v) => v.archetype === 'busker' && !v.spawnedForPlayer) >= CAP_AI_BUSKERS) return 'single';
  if (a === 'dogwalker' && countWhere((v) => v.archetype === 'dogwalker') >= CAP_DOGWALKERS) return 'single';
  return a;
}

/** The population target: by phase, times the global weather and the season factors, rounded (02 4.2 item 1; Math.round, .5 up). */
export function targetPeople(phase: Phase, kind: WeatherKind, season: number): number {
  return Math.round(PHASE_TARGET[phase] * WEATHER_ARRIVALS[kind] * (SEASON_ARRIVALS[season] ?? 1));
}

/** The target now: the clock's phase and season and the global weather (arrivals ignore overrides, 02 3.5). */
export function currentTarget(): number {
  return targetPeople(T.phase, W.kind, T.season);
}

/** Mutually compatible by seeks (register 3.5): each seeks the other's sex or anyone. */
export function compatible(a: { sex: Sex; seeks: Seeks }, b: { sex: Sex; seeks: Seeks }): boolean {
  return (a.seeks === 'any' || a.seeks === b.sex) && (b.seeks === 'any' || b.seeks === a.sex);
}

/**
 * The complementary rule (02 4.2 item 7, GV addVillager 4490-4492): a single who seeks f or m re-rolls once when unpaired singles are in
 * the park and none of them is compatible. An empty park, or one with only paired singles, re-rolls nothing (no roll could help).
 */
export function needsReroll(sex: Sex, seeks: Seeks): boolean {
  if (seeks === 'any') return false;
  let any = false;
  for (const o of visitors) {
    if (o.archetype !== 'single' || o.pairId !== 0) continue;
    any = true;
    if (compatible({ sex, seeks }, o)) return false;
  }
  return any;
}

/* ---------- the factory (GV makeGnome 1387) ---------- */

export type SpawnOpts = {
  sex?: Sex; // fixed sex (a couple's members, a cameo)
  seeks?: Seeks;
  ageWord?: AgeWord;
  name?: string; // a fixed name (a cameo's): no draw
  regular?: RegularDef; // a returning regular: name, sex, seeks and ageWord from 06 6.2
  leaveAt?: number; // a fixed leaveAt in days: no draw
  signature?: number; // share this signature colour (a couple's second member, 04 7.3 item 5)
  spawnedForPlayer?: boolean; // summoned by an ability (c_musician's busker): not an AI busker
  at?: XY; // appear here, idle, instead of on the gate's outside tile (a vendor on its serving tile)
  drawless?: { lookSeed: number }; // no draw at all: this lookSeed, the middle of each starting need, decideT 0 (sex and name must be given)
};

function rollSex(): Sex {
  return rng() < 0.5 ? 'f' : 'm';
}
function rollSeeks(): Seeks {
  return byWeight(rng() * 100, SEEKS_WEIGHTS);
}

/**
 * Create a visitor of `arch` on `gate`'s outside tile, in state `arrive` and walking onto the gate's first tile (02 4.2 item 3), with the
 * starting values of 02 4.2 items 5-7. Null when the park already holds 30 people (cameos do not count and are never refused, 03 3.11).
 * The draws follow the order in the file header.
 */
export function spawnVisitor(arch: Archetype, gate: GateId, opts: SpawnOpts = {}): Visitor | null {
  if (arch !== 'cameo' && people() >= CAP_PEOPLE) return null;
  const g = gateById(gate);
  const still = opts.drawless;
  let lookSeed = still ? still.lookSeed >>> 0 : Math.floor(rng() * 4294967296);
  if (opts.signature !== undefined) lookSeed = lookSeed - (lookSeed % SIGNATURES) + (opts.signature % SIGNATURES);
  const reg = opts.regular;
  let sex: Sex = reg?.sex ?? opts.sex ?? (arch === 'gardener' ? 'm' : rollSex());
  let seeks: Seeks = reg?.seeks ?? opts.seeks ?? 'any';
  if (!reg && opts.seeks === undefined) {
    if (arch === 'single') {
      seeks = rollSeeks();
      if (opts.sex === undefined && needsReroll(sex, seeks)) {
        sex = rollSex();
        seeks = rollSeeks();
      }
    } else if (arch === 'couple') seeks = sex === 'f' ? 'm' : 'f';
  }
  const ageWord: AgeWord =
    reg?.ageWord ?? opts.ageWord ?? (AGE_ROLLED.has(arch) ? (chance(0.5) ? 'young' : 'grown') : arch === 'elder' ? 'elder' : arch === 'child' ? 'young' : 'grown');
  const name = reg?.name ?? opts.name ?? (arch === 'gardener' ? GARDENER_NAME : takeName(sex));
  const hunger = still ? 0.35 : rnd(0.2, 0.5);
  const energy = still ? 0.7 : rnd(0.5, 0.9);
  const social = still ? 0.4 : rnd(0.2, 0.6);
  const arrivedAt = T.abs;
  const leaveAt =
    opts.leaveAt ?? (STAFF.has(arch) ? NEVER : arch === 'tourist' ? arrivedAt + VISIT_TOURIST : arrivedAt + rnd(VISIT_MIN, VISIT_MAX));
  const decideT = still ? 0 : rnd(0, 0.6); // GV 1391: the first decisions are staggered
  const plain = arch !== 'child' && !STAFF.has(arch);
  const items: Items = {
    hat: HAT_ALWAYS.has(arch) || (plain && ((lookSeed >>> 3) & 1) === 1),
    purse: plain && ((lookSeed >>> 4) & 1) === 1,
    baguette: false,
    iceCream: false,
  };
  const at = opts.at ?? g.outside;
  const v: Visitor = {
    id: nextVisitorId(), name, sex, archetype: arch, ageWord, seeks, lookSeed,
    x: at.x, y: at.y, face: 1, st: opts.at ? 'idle' : 'arrive', t: 0,
    path: null, pi: 0, ptx: NO_TARGET, pty: NO_TARGET, replanT: 0, blocked: 0, blockedList: [],
    job: {},
    hunger, energy, comfort: COMFORT_START, social,
    arrivedAt, leaveAt, gateIn: gate, gateOut: null,
    pairId: 0, coupleOf: 0, parentOf: 0, childOf: 0,
    items,
    embToday: 0, embDay: 0, pendingEmb: null, regularId: reg?.regularId ?? 0, decideT,
    sitPropId: 0, basket: 0, shares: 0, cdUntil: 0, spawnedForPlayer: opts.spawnedForPlayer ?? false,
    plan: 0,
  };
  visitors.push(v);
  index.set(v.id, v);
  if (!opts.at) goTo(v, g.tiles[0].x, g.tiles[0].y); // one step onto the gate (02 2.4 "Done when")
  emit({ kind: 'arrive', tick: nowTick(), x: v.x, y: v.y, ids: [v.id], params: { regularId: v.regularId } });
  return v;
}

/**
 * Bring in one arrival of `arch` through `gate` (02 4.2, 06 5.1): a couple (one f, one m, linked by coupleOf, one shared leaveAt and one
 * signature colour), a family (a parent and a child, linked by parentOf and childOf, the child leaving with the parent), a tourist alone
 * or with a second tourist (40 %), or one person. A group of two with room for one comes as a single (a tourist comes alone); a single
 * is replaced by a regular who is due (02 4.5 item 3). Returns the people who came.
 */
export function arriveGroup(arch: Archetype, gate: GateId): Visitor[] {
  const room = CAP_PEOPLE - people();
  if (room <= 0) return [];
  let a = arch;
  if ((a === 'couple' || a === 'family') && room < 2) a = 'single';
  const out: Visitor[] = [];
  const add = (v: Visitor | null): Visitor | null => {
    if (v) out.push(v);
    return v;
  };
  switch (a) {
    case 'single': {
      const reg = regularDue(T.day, T.f);
      const v = add(spawnVisitor('single', gate, reg ? { regular: reg } : {}));
      if (v && reg) regularArrived(reg.regularId, v.id, T.day);
      break;
    }
    case 'couple': {
      const leaveAt = T.abs + rnd(VISIT_MIN, VISIT_MAX);
      const f = add(spawnVisitor('couple', gate, { sex: 'f', leaveAt }));
      const m = f && add(spawnVisitor('couple', gate, { sex: 'm', leaveAt, signature: signatureOf(f.lookSeed) }));
      if (f && m) {
        f.coupleOf = m.id;
        m.coupleOf = f.id;
        pairHooks.couple(f, m); // romance.ts: a Pair at stage 3 with affinity rnd(0.55, 0.70) (register 3.4)
      }
      break;
    }
    case 'family': {
      const p = add(spawnVisitor('family', gate));
      const c = p && add(spawnVisitor('child', gate, { leaveAt: p.leaveAt }));
      if (p && c) {
        p.parentOf = c.id;
        c.childOf = p.id;
      }
      break;
    }
    case 'tourist': {
      const two = chance(TOURIST_PAIR) && room >= 2;
      add(spawnVisitor('tourist', gate));
      if (two) add(spawnVisitor('tourist', gate));
      break;
    }
    default:
      add(spawnVisitor(a, gate));
  }
  return out;
}

/**
 * Phase 7 of a step (02 4.2 items 1-4, 03 6.3 item 1): while the people in the park are fewer than the target and fewer than 30, an
 * arrival comes the pace's gap after the last (ARRIVAL_GAP_MIN-MAX, 6 to 14 s, in a Calm park; LIVELY_GAP_MIN-MAX, 3 to 6 s, in a Lively
 * one; one draw either way); at the target nobody comes and the timer stays run out, so the next arrival comes as soon as there is room.
 */
export function stepArrivals(dt: number): void {
  if (arrivalT > 0) arrivalT = Math.max(0, arrivalT - dt);
  if (arrivalT > 0) return;
  const n = people();
  if (n >= currentTarget() || n >= CAP_PEOPLE) return;
  const gate = gateForRoll(rng() * 100);
  const arch = capArchetype(archetypeForRoll(rng() * 100));
  arriveGroup(arch, gate);
  arrivalT = pace === 'lively' ? rnd(LIVELY_GAP_MIN, LIVELY_GAP_MAX) : rnd(ARRIVAL_GAP_MIN, ARRIVAL_GAP_MAX);
}

/**
 * The "+" on the Visitors chip (02 12.2, GV addVillager 4488): one arrival now through `gate` or a gate by weight, a single 60 % of the
 * time, else by the archetype weights and caps; whatever the target. Refused with reason.park_full at 30 people (GV 4489).
 */
export function callVisitor(gate?: GateId | null): Result {
  if (people() >= CAP_PEOPLE) return fail('reason.park_full');
  const g = gate ?? gateForRoll(rng() * 100);
  const arch = chance(CALL_SINGLE) ? 'single' : capArchetype(archetypeForRoll(rng() * 100));
  return arriveGroup(arch, g).length > 0 ? OK : fail('reason.park_full');
}

/**
 * Take a visitor out of the park (02 4.5 item 1, 6.5): the name is free again, a regular schedules the return (two draws), every seat
 * that lists it is freed, and every link to the visitor drops to 0; romance.ts drops a Pair it is still in (setPairHooks).
 */
export function removeVisitor(id: VisitorId): void {
  const v = index.get(id);
  if (!v) return;
  pairHooks.removed(v);
  releaseName(v.name);
  if (v.regularId !== 0) regularLeft(v.regularId, T.day);
  // every seat drops the id, not only v.sitPropId's: an undo puts a removed or turned prop back with the sitters it had then
  for (const p of props) if (p.data.sitters?.includes(id)) p.data.sitters = p.data.sitters.filter((s) => s !== id);
  for (const o of visitors) {
    if (o.coupleOf === id) o.coupleOf = 0;
    if (o.parentOf === id) o.parentOf = 0;
    if (o.childOf === id) o.childOf = 0;
    if (o.job.visitorId === id) delete o.job.visitorId;
  }
  visitors.splice(visitors.indexOf(v), 1);
  index.delete(id);
  emit({ kind: 'leave', tick: nowTick(), x: v.x, y: v.y, ids: [id], params: { regularId: v.regularId } });
}

/** A leaving visitor on its gateOut's outside tile is removed (02 5.2 rung 3). True when it was. */
export function leaveIfOutside(v: Visitor): boolean {
  if (v.st !== 'goLeave' || v.gateOut === null) return false;
  const o = gateById(v.gateOut).outside;
  if (Math.round(v.x) !== o.x || Math.round(v.y) !== o.y) return false;
  removeVisitor(v.id);
  return true;
}

/* ---------- the decide cadence (03 4.4, GV 5696) ---------- */

/** romance.ts hands in its couple arrival and removal hooks at load (S5), so this file never imports it. */
export type PairHooks = { couple: (f: Visitor, m: Visitor) => void; removed: (v: Visitor) => void };
let pairHooks: PairHooks = { couple: () => {}, removed: () => {} };
export function setPairHooks(h: PairHooks): void {
  pairHooks = h;
}

/** play/avatar.ts (S7) hands in its decide at boot, so entities never import it (03 4.4). */
export function setAvatarDecide(fn: (v: Visitor) => void): void {
  avatarDecide = fn;
}

/**
 * The per-visitor cadence (GV 5696): when decideT runs out it is drawn again in [0.5, 1.3] s, and a visitor not in a `busy` state
 * decides: the possessed actor in avatar mode through avatarDecide, everyone else through `decide` (brain.ts). The one MODE read in
 * entities/ (03 4.4).
 */
export function decideCadence(v: Visitor, dt: number, decide: (v: Visitor) => void, busy: Readonly<Record<string, true>>): void {
  v.decideT -= dt;
  if (v.decideT > 0) return;
  v.decideT = rnd(DECIDE_MIN, DECIDE_MAX);
  if (busy[v.st]) return;
  if (v.id === getPlayer() && getMode() === 'avatar') avatarDecide(v);
  else decide(v);
}

/* ---------- the park tools' hooks (S3: 02 8.3, 8.4, 8.5 item 3) ---------- */

/**
 * A prop is going (`remove`, a tree tapped with the tree tool, or an undo): whoever sits on it stands up, and whoever was on an errand to
 * it drops the errand; both go idle and decide at the next cadence (02 8.3, "sitters stand").
 */
export function standUpFrom(propId: PropId): void {
  for (const v of visitors) {
    if (v.sitPropId !== propId && v.job.propId !== propId) continue;
    v.sitPropId = 0;
    v.job = {};
    v.st = 'idle';
    v.t = 0;
    v.path = null;
    v.pi = 0;
    v.decideT = 0;
  }
  const p = propById(propId);
  if (p?.data.sitters) p.data.sitters = [];
}

/** True while `v` sits on a prop that still stands and covers its tile (x, y): a seat is a blocked tile it may stay on. */
function seatedOn(v: Visitor, x: number, y: number): boolean {
  if (v.sitPropId === 0) return false;
  const p = propById(v.sitPropId);
  return !!p && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h;
}

/**
 * Tiles (indices) that a tool or an undo just made blocked: a visitor standing on one moves to the nearest open tile within 3 (GV openNear
 * 1559, two draws for the jitter) and replans its walk (02 8.5 item 3). A sitter on its own seat stays: undo.ts settle passes every
 * touched tile that is blocked after the change, so a turned bench (02 8.3 "tap an existing bench: rotate 90°") lists the tile it
 * already blocked. A pigeon or a dog on such a tile moves off it in its own step (creatures.ts).
 */
export function moveOffBlocked(tiles: readonly number[]): void {
  const set = new Set(tiles);
  for (const v of visitors) {
    const x = Math.round(v.x), y = Math.round(v.y);
    if (!inB(x, y) || !set.has(I(x, y)) || seatedOn(v, x, y)) continue;
    const o = openNear(v.x, v.y, R_OPEN_NEAR);
    if (!o) continue;
    v.x = o.x;
    v.y = o.y;
    if (v.path) goTo(v, v.ptx, v.pty, true);
  }
}

/** True when a visitor stands on one of these tiles (its rounded position): the bridge stamp and `remove` refuse (02 8.4). */
export function someoneOn(tiles: readonly XY[]): boolean {
  for (const v of visitors) {
    const x = Math.round(v.x), y = Math.round(v.y);
    for (const t of tiles) if (t.x === x && t.y === y) return true;
  }
  return false;
}

/* ---------- phase 8 (03 4.2): spaceOut, then per visitor needs, the cadence, act, moveStep ---------- */

/** What brain.ts hands in at load (setBrain): this file never imports brain.ts or act.ts, which import it. */
export type BrainFns = { decide: (v: Visitor) => void; act: (v: Visitor, dt: number) => void; busy: Readonly<Record<string, true>> };
let brain: BrainFns | null = null;
export function setBrain(fns: BrainFns): void {
  brain = fns;
}

/** A family parent stops while its child is further behind than this (tiles): the child walks at 2.6, the parent at 3.0 (assumption). */
export const PARENT_WAIT = 3.5;

/** True while `v` walks ahead of its child by more than PARENT_WAIT: the parent stands still for that step. */
function waitsForChild(v: Visitor): boolean {
  if (v.parentOf === 0 || !v.path) return false;
  const c = index.get(v.parentOf);
  return !!c && Math.hypot(c.x - v.x, c.y - v.y) > PARENT_WAIT;
}

/**
 * Phase 8 of a step (03 4.2, 6.3): spaceOut over everyone not seated and not serving (a seated reader, feeder or snacker keeps the seat:
 * 02 5.3 lists sit; a vendor stays at its counter: 02 4.3 "static"), then for each visitor in list order: stepNeeds, the decide cadence, act, moveStep (with wearAt), and removal on its gateOut's
 * outside tile. A visitor removed in the step (act's leave, a parent's child) is skipped from then on.
 */
const spacing: Visitor[] = []; // reused every step: no garbage per step (03 15.2)
const order: Visitor[] = [];
export function stepVisitors(dt: number): void {
  if (!brain) return;
  spacing.length = 0;
  order.length = 0;
  for (const v of visitors) {
    order.push(v);
    if (v.sitPropId === 0 && v.st !== 'serve') spacing.push(v);
  }
  spaceOut(spacing, dt);
  for (const v of order) {
    if (!index.has(v.id)) continue;
    stepNeeds(v, dt);
    decideCadence(v, dt, brain.decide, brain.busy);
    brain.act(v, dt);
    if (!index.has(v.id)) continue;
    if (!waitsForChild(v)) moveStep(v, dt);
    leaveIfOutside(v);
  }
}

/* ---------- the visitor.call command (03 5.1; 02 12.2) ---------- */

registerHandler('visitor.call', (c) => callVisitor(c.payload.gate));
/** park.pace: the gap from the next arrival on (the timer running now is kept); a payload that is no pace is reason.not_here. */
registerHandler('park.pace', (c) => (isPace(c.payload.pace) ? ((pace = c.payload.pace), OK) : fail('reason.not_here')));

/* ---------- state ---------- */

/**
 * Put a visitor record back under its own id (a removed kiosk's vendor, by the undo: staff.ts vendorReturn), in id order so the list is
 * as it was (the caller holds its name again: names.ts). False when the id is listed already.
 */
export function putVisitor(rec: Visitor): boolean {
  if (index.has(rec.id)) return false;
  const v = JSON.parse(JSON.stringify(rec)) as Visitor;
  let k = visitors.length;
  while (k > 0 && (visitors[k - 1] as Visitor).id > v.id) k--;
  visitors.splice(k, 0, v);
  index.set(v.id, v);
  return true;
}

/** A deep copy of the list for a snapshot, in list (id) order. */
export function visitorsState(): Visitor[] {
  return JSON.parse(JSON.stringify(visitors)) as Visitor[];
}

/** Replace the list (a restore); the names, the regulars and the timer come back through their own setters. */
export function setVisitorsState(list: readonly Visitor[]): void {
  visitors.length = 0;
  index.clear();
  for (const r of list) {
    const v = JSON.parse(JSON.stringify(r)) as Visitor;
    if (typeof v.plan !== 'number') v.plan = 0; // a record saved before the field existed
    visitors.push(v);
    index.set(v.id, v);
  }
}

export type ArrivalsState = { arrivalT: number; pace: Pace };
export function arrivalsState(): ArrivalsState {
  return { arrivalT, pace };
}
/** A restore: the timer, and the pace (calm when the save has none or no pace). */
export function setArrivalsState(s: { arrivalT: number; pace?: unknown }): void {
  arrivalT = s.arrivalT;
  pace = isPace(s.pace) ? s.pace : 'calm';
}

/**
 * A new park: nobody in the park, no name held, the regulars on their first visit table, the first arrival due at once, a calm pace. No
 * draw. A restore puts the saved list, names, timer and pace back instead (save/store.ts, after setLog).
 */
export function resetVisitors(): void {
  visitors.length = 0;
  index.clear();
  arrivalT = 0;
  pace = 'calm';
  resetNames();
}

onResetCommands(resetVisitors);
