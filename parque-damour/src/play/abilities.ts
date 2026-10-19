// src/play/abilities.ts
// The registry of 19 abilities (9 Cupid, 10 Mischief) with tier, cooldown, charges, target type; per-side cooldowns; validation; the effect list (02 section 9).
// Ported from GV 5840-5989 (ghost {ok, msg} validation shape), 2386 (P cap idea) in S6 and S10. NEW.
// S6 (07 S6.6): all 19 ids of register 3.8 are here with their columns; only the eight of tier 0 and 1 have a handler (abilities-cupid.ts:
// c_petals, c_bouquet, c_musician, c_sunbeam; abilities-mischief.ts: m_pigeon, m_sprinkler, m_peel, m_pomeranian). The other eleven answer
// `reason.not_here` until S10, after the unlock check and the target check, so a locked one still says when it opens.
// canCast validates and spends nothing: the id exists and is the side's own, it is unlocked (progression.ts), it is not cooling down or out
// of charges, there are fewer than 64 effects (03 3.11), the target is of the ability's type (a child under the tap is `reason.not_children`
// whatever the ability, 02 9.1 item 5), then the ability's own "fails when" (02 9.2-9.3). cast runs canCast again and only then starts the
// cooldown (in ticks: `sides.cooldowns[side][id]` is the tick it is ready, so 8x and 1x count the same 60 steps a second; charges are the
// uses left today, reset at f 0), adds the Effect (03 3.8) and calls the handler's start; Cupid casts stamp `pair.lastCupidAt` on every pair
// within 6 tiles of the target or targeted (02 9.1 item 7; progression.ts reads it). Mischief casts score through embarrass.land.
// An Effect is a timeline: `startTick` (the tick the command applied), `until` (the first tick it is gone), `phase` and a numeric `data`
// bag the handler keeps, everything saved and hashed, so a restore carries on mid-timeline. stepAbilities (phase 6 of a step, 03 4.2) fades
// the petals and steps each effect in creation order; a handler's step returns true when its effect is over and its end cleans up.
// The command: `ability` is registered here; commands.ts has already checked the side and the mode (03 5.3). Nothing here reads the camera,
// the DOM or the wall clock; UI arming, the ghost and the tap routing are the UI's.
import { T } from '../core/clock.ts';
import { emit } from '../core/events.ts';
import { OK, fail, onResetCommands, registerHandler, type AbilityId, type ReasonKey, type Result, type Target } from '../core/commands.ts';
import { nextEffectId, type EffectId, type PairId, type PropId, type Side } from '../core/ids.ts';
import { I, KIND, Kind, inB, props, removeProp } from '../world/grid.ts';
import { byId, nowTick, type Visitor } from '../entities/visitor.ts';
import { midOf, pairById, pairOf, pairs, type Pair } from '../entities/romance.ts';
import { isUnlocked, type Tier } from './progression.ts';
import { CUPID_HANDLERS, petalsDirty, stepPetals } from './abilities-cupid.ts';
import { MISCHIEF_HANDLERS } from './abilities-mischief.ts';

export type { AbilityId };
export type AbilitySide = 'cupid' | 'mischief';
export type TargetType = 'tile' | 'area' | 'visitor' | 'pair' | 'park';

/** One row of register 3.8 / 06 11.1. `area` is the half-width of the square an `area` target covers (3 x 3 is 1); `cooldown` is sim seconds. */
export type AbilityDef = {
  id: AbilityId; side: AbilitySide; tier: Tier; cooldown: number; charges: number | null; target: TargetType; area: number;
  nameKey: string; hintKey: string;
};

const def = (id: AbilityId, side: AbilitySide, tier: Tier, cooldown: number, charges: number | null, target: TargetType, area = 0): AbilityDef => ({
  id, side, tier, cooldown, charges, target, area, nameKey: 'ability.' + id + '.name', hintKey: 'ability.' + id + '.hint',
});

export const ABILITIES: readonly AbilityDef[] = [
  def('c_petals', 'cupid', 0, 30, null, 'area', 1),
  def('c_bouquet', 'cupid', 0, 60, null, 'pair'),
  def('c_musician', 'cupid', 1, 120, null, 'tile'),
  def('c_sunbeam', 'cupid', 1, 90, null, 'area', 3),
  def('c_umbrella', 'cupid', 2, 90, null, 'pair'),
  def('c_lamplight', 'cupid', 2, 60, null, 'tile'),
  def('c_picnic', 'cupid', 3, 180, null, 'tile'),
  def('c_rowboat', 'cupid', 3, 240, null, 'tile'),
  def('c_fireworks', 'cupid', 4, 360, 1, 'park'),
  def('m_pigeon', 'mischief', 0, 25, null, 'visitor'),
  def('m_sprinkler', 'mischief', 0, 45, null, 'tile'),
  def('m_peel', 'mischief', 1, 40, null, 'tile'),
  def('m_pomeranian', 'mischief', 1, 60, null, 'visitor'),
  def('m_wasp', 'mischief', 2, 60, null, 'pair'),
  def('m_raincloud', 'mischief', 2, 90, null, 'area', 2),
  def('m_rival', 'mischief', 3, 150, null, 'pair'),
  def('m_mime', 'mischief', 3, 120, null, 'tile'),
  def('m_fog', 'mischief', 4, 240, null, 'park'),
  def('m_flock', 'mischief', 4, 180, 1, 'area', 3),
];

const BY_ID = new Map<string, AbilityDef>(ABILITIES.map((a) => [a.id, a]));
export function abilityById(id: string): AbilityDef | undefined {
  return BY_ID.get(id);
}

export const CAP_EFFECTS = 64; // 03 3.11
export const STEPS_PER_SEC = 60;
export const R_CUPID = 6; // a Cupid cast reaches the pairs within this many tiles of the target (02 9.1 item 7)

/** 03 3.8. `until` is the first tick the effect is gone; `data` is the handler's numeric scratch (everything here is saved and hashed). */
export type Effect = {
  id: EffectId; ability: AbilityId; side: Side; x: number; y: number; r: number; startTick: number; until: number;
  phase: number; pairId: PairId; targetId: number; actorId: number; propId: PropId; overrideId: EffectId; data: Record<string, number>;
};

/** What a Target resolved to: the tile (an `area` or `tile`), the visitor tapped, the pair they are in or that was targeted. */
export type Resolved = { x: number; y: number; visitor: Visitor | null; pair: Pair | null };

/** A tier 0/1 ability's rules: its "fails when", the first step, each later step (true when over) and the cleanup. */
export type Handler = {
  check: (r: Resolved, at: number) => Result;
  start: (e: Effect, r: Resolved) => void;
  step: (e: Effect, now: number) => boolean;
  end?: (e: Effect) => void;
};
const HANDLERS: Readonly<Partial<Record<AbilityId, Handler>>> = { ...CUPID_HANDLERS, ...MISCHIEF_HANDLERS };

/* ---------- state: cooldowns, charges, effects (saved and hashed, 03 3.10) ---------- */

export type SidesState = { cooldowns: Record<Side, Record<string, number>>; charges: Record<Side, Record<string, number>> };
const emptySides = (): SidesState => ({ cooldowns: { park: {}, cupid: {}, mischief: {} }, charges: { park: {}, cupid: {}, mischief: {} } });
let sides: SidesState = emptySides();
export const effects: Effect[] = [];

/** The tick a command enqueued now would apply at (enqueue stamps tick + 1, and the clock is one step behind during phase 2). */
export function commandTick(): number {
  return nowTick() + 1;
}

/** Seconds until `id` is ready on `side` (0 when it is); `at` is the tick asked about. */
export function cooldownLeft(side: Side, id: string, at = commandTick()): number {
  const ready = sides.cooldowns[side][id] ?? 0;
  return ready > at ? (ready - at) / STEPS_PER_SEC : 0;
}
/** Uses left today of a limited ability; Infinity for one without charges. */
export function chargesLeft(side: Side, id: string): number {
  const d = BY_ID.get(id);
  if (!d || d.charges === null) return Infinity;
  return sides.charges[side][id] ?? d.charges;
}
/** New day (f 0): every charge is back (03 4.2 phase 5). */
export function resetCharges(): void {
  sides.charges = { park: {}, cupid: {}, mischief: {} };
}

/* ---------- validation ---------- */

function resolve(d: AbilityDef, t: Target): Resolved | ReasonKey {
  const none: Resolved = { x: 23.5, y: 23.5, visitor: null, pair: null };
  switch (d.target) {
    case 'park':
      return t.kind === 'park' ? none : 'reason.not_here';
    case 'tile':
    case 'area': {
      if (t.kind === 'tile') {
        const x = Math.round(t.x), y = Math.round(t.y);
        return inB(x, y) ? { x, y, visitor: null, pair: null } : 'reason.outside';
      }
      if (t.kind !== 'visitor') return 'reason.not_here';
      const v = byId(t.id); // a person under the tap with a ground ability armed: a child is refused, an adult is their tile
      if (!v) return 'reason.not_here';
      if (v.archetype === 'child') return 'reason.not_children';
      return { x: Math.round(v.x), y: Math.round(v.y), visitor: v, pair: null };
    }
    case 'visitor': {
      if (t.kind !== 'visitor') return 'reason.not_here';
      const v = byId(t.id);
      if (!v) return 'reason.not_here';
      return v.archetype === 'child' ? 'reason.not_children' : { x: v.x, y: v.y, visitor: v, pair: pairOf(v) ?? null };
    }
    case 'pair': {
      let v: Visitor | undefined;
      let p: Pair | undefined;
      if (t.kind === 'visitor') {
        v = byId(t.id);
        if (!v) return 'reason.not_here';
        if (v.archetype === 'child') return 'reason.not_children';
        p = pairOf(v);
      } else if (t.kind === 'pair') p = pairById(t.id);
      else return 'reason.not_here';
      if (!p) return 'reason.not_courting';
      const m = midOf(p);
      return { x: m.x, y: m.y, visitor: v ?? null, pair: p };
    }
  }
}

/**
 * Can `side` cast `id` at `target` now (or at tick `at`)? Spends nothing. The order is 03 6.5 item 1: unlocked, cooldown, charges, the
 * effect cap, target type (a child under the tap is refused here, for the eleven of S10 as well: 02 13 T3), the ability's own "fails
 * when"; an ability without a handler (S10) is `reason.not_here` once it is unlocked and has a good target.
 */
export function canCast(side: Side, id: AbilityId, target: Target, at = commandTick()): Result {
  const d = BY_ID.get(id);
  if (!d) return fail('reason.not_here');
  if (!target || typeof target !== 'object') return fail('reason.not_here'); // a command with no target at all (a malformed payload) is refused, never thrown
  if (d.side !== side) return fail('reason.wrong_side');
  if (!isUnlocked(id)) return fail('reason.locked');
  if ((sides.cooldowns[side][id] ?? 0) > at) return fail('reason.cooldown');
  if (chargesLeft(side, id) <= 0) return fail('reason.no_charges');
  if (effects.length >= CAP_EFFECTS) return fail('reason.too_many_effects');
  const r = resolve(d, target);
  if (typeof r === 'string') return fail(r);
  const h = HANDLERS[id];
  return h ? h.check(r, at) : fail('reason.not_here'); // S10's: unlocked, a good target, and no rules yet
}

/** Every pair within 6 tiles of (x, y), and the pair `direct`, now has a Cupid action behind it (02 9.1 item 7). */
function markCupid(x: number, y: number, direct: PairId): void {
  for (const p of pairs) {
    const m = midOf(p);
    if (p.id === direct || Math.hypot(m.x - x, m.y - y) <= R_CUPID) p.lastCupidAt = T.abs;
  }
}

/** The word for the place (x, y) is by, for the feed line of c_petals (06 16.11 `spot.*`): the fountain, the bandstand, the bridge, the pond, else path or lawn. */
function spotWord(x: number, y: number): string {
  const gap = (p: { x: number; y: number; w: number; h: number }): number => Math.max(p.x - x, x - (p.x + p.w - 1), p.y - y, y - (p.y + p.h - 1), 0);
  if (props.some((p) => p.kind === 'fountain' && gap(p) <= 5)) return 'fountain';
  if (props.some((p) => p.kind === 'bandstand' && gap(p) <= 4)) return 'bandstand';
  if (props.some((p) => p.kind === 'bridge' && gap(p) <= 1)) return 'bridge';
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (inB(x + dx, y + dy) && KIND[I(x + dx, y + dy)] === Kind.pond) return 'pond';
  const k = KIND[I(x, y)];
  return k === Kind.gravel || k === Kind.flagstone ? 'path' : 'lawn';
}

/**
 * Cast `id`: validate again, start the cooldown (and spend a charge), add the Effect, run the handler's start, stamp the Cupid pairs and
 * emit `cast` (the feed line, `feed.cast.<id>`, and the cue). `at` is the command's own tick.
 */
export function cast(side: Side, id: AbilityId, target: Target, at = commandTick()): Result {
  const ok = canCast(side, id, target, at);
  if (!ok.ok) return ok;
  const d = abilityById(id) as AbilityDef;
  const h = HANDLERS[id] as Handler;
  const r = resolve(d, target) as Resolved;
  sides.cooldowns[side][id] = at + Math.round(d.cooldown * STEPS_PER_SEC);
  if (d.charges !== null) sides.charges[side][id] = chargesLeft(side, id) - 1;
  const e: Effect = {
    id: nextEffectId(), ability: id, side, x: r.x, y: r.y, r: d.area, startTick: at, until: at, phase: 0,
    pairId: r.pair?.id ?? 0, targetId: r.visitor?.id ?? 0, actorId: 0, propId: 0, overrideId: 0, data: {},
  };
  effects.push(e);
  h.start(e, r);
  if (side === 'cupid') markCupid(r.x, r.y, r.pair?.id ?? 0);
  const who = byId(e.targetId) ?? r.visitor; // the person the line names: the one tapped, or the pair's member the handler chose
  const a = r.pair ? byId(r.pair.a) : undefined, b = r.pair ? byId(r.pair.b) : undefined;
  emit({
    kind: 'cast', tick: at, x: r.x, y: r.y, ids: [e.id, who?.id ?? 0],
    params: {
      id, side, feed: 'feed.cast.' + id, ...(who ? { name: who.name } : {}), ...(a && b ? { a: a.name, b: b.name } : {}),
      ...(id === 'c_petals' ? { spot: '@spot.' + spotWord(r.x, r.y) } : {}),
    },
  });
  return OK;
}

/** Phase 6 of a step (03 4.2): the petals fade, then each effect's timeline in creation order; a finished one is cleaned up and goes. */
export function stepAbilities(dt: number): void {
  stepPetals(dt);
  const now = nowTick();
  for (let k = 0; k < effects.length; k++) {
    const e = effects[k] as Effect;
    const h = HANDLERS[e.ability];
    if (h && !h.step(e, now)) continue;
    h?.end?.(e);
    effects.splice(k--, 1);
  }
  sweepOrphanProps();
}

/**
 * A sprinkler or a banana peel lives as long as its effect (02 1.2 P2: the sim owns what it places). The `remove` tool can take one
 * (its effect ends with it) and an undo can put it back under the same id; with no effect behind it, it would stay for good. Such a prop
 * is swept at once, so an ability prop is not undoable.
 */
function sweepOrphanProps(): void {
  let orphans: PropId[] | null = null;
  for (const p of props) {
    if (p.placedBy !== 'sim' || (p.kind !== 'sprinkler' && p.kind !== 'peel')) continue;
    if (effects.some((e) => e.propId === p.id)) continue;
    (orphans ??= []).push(p.id);
  }
  if (orphans) for (const id of orphans) removeProp(id);
}

/* ---------- state for the snapshot ---------- */

export function effectsState(): Effect[] {
  return JSON.parse(JSON.stringify(effects)) as Effect[];
}
export function sidesState(): SidesState {
  return JSON.parse(JSON.stringify(sides)) as SidesState;
}
/** A restore: the saved effects, cooldowns and charges (a save without them has none); the petals may still be fading, so the pass looks. */
export function setAbilitiesState(e: readonly Effect[] | undefined, s: Partial<SidesState> | undefined): void {
  effects.length = 0;
  for (const x of e ?? []) effects.push(JSON.parse(JSON.stringify(x)) as Effect);
  sides = emptySides();
  for (const k of ['park', 'cupid', 'mischief'] as const) {
    Object.assign(sides.cooldowns[k], s?.cooldowns?.[k] ?? {});
    Object.assign(sides.charges[k], s?.charges?.[k] ?? {});
  }
  petalsDirty();
}
/** A new park: no effect, every ability ready, every charge back. */
export function resetAbilities(): void {
  setAbilitiesState([], undefined);
}
onResetCommands(resetAbilities);

registerHandler('ability', (c) => cast(c.side, c.payload.id, c.payload.target, c.tick));
