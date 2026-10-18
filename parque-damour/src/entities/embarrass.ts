// src/entities/embarrass.ts
// Landing an embarrassment: refusals (a child, the cap of 3 a day, rival on someone not courting), the 15 % backfire, the cost table, the
// comfort drop, the reaction (brain.ts rung 1 starts it from pendingEmb), the `embarrassed` and `backfired` events; exactly the ten kinds
// of register section 5 (02 6.4, 13; 06 10).
// Ported from GV 4640 (jostle: the creator never hurts anyone) and 4658-4701 (the mishap transition framework: a mishap lands on a
// walker, interrupts what it was doing, plays a short state and leaves it standing). ADAPT: Parque's ten kinds, their costs by stage
// (base x 1.0 at stages 1-2, x 1.25 at 3-4, x 1.5 at 5-7, capped at 0.15), comfort -0.3, embToday on the victim and on the pair, the
// backfire rolled on the sim stream only when the victim is in a Pair and the partner is within 4 tiles (then both laugh for the kind's
// scene, affinity +0.04, no comfort lost, no embToday, no score); a 4th landing in a day, a child and rival on a single are refused before
// anything is spent. Staff can be targets and score 0 (02 6.4 rule 3; their reaction is capped at 4 s, 04 9.3, in brain.ts rung 1).
// No ability triggers it yet (S6, S7): the harness exposes land (07 S5.6 step 5). Points are S6's: the events carry `score`.
import { DAYLEN, T } from '../core/clock.ts';
import { chance } from '../core/rng.ts';
import { emit, type Params } from '../core/events.ts';
import { clamp01 } from '../core/math.ts';
import type { ReasonKey } from '../core/commands.ts';
import type { Side, VisitorId } from '../core/ids.ts';
import { setPairCharm } from '../world/charm.ts';
import { release } from './act.ts';
import { byId, nowTick, visitors, type EmbKind, type Visitor } from './visitor.ts';
import { pairOf, pairs, partnerOf } from './romance.ts';
import { interruptStage } from './romance-stages.ts';

/** The ten kinds, in register section 5's order (02 13 T2: no other kind exists). */
export const EMB_KINDS = ['poop', 'soaked', 'trip', 'snatched', 'wasp', 'drenched', 'rival', 'mime', 'fog', 'flock'] as const;
/** Base affinity cost of each kind (02 6.4, 06 10). */
export const EMB_BASE: Readonly<Record<EmbKind, number>> = {
  poop: 0.08, soaked: 0.07, trip: 0.06, snatched: 0.08, wasp: 0.09, drenched: 0.07, rival: 0.1, mime: 0.06, fog: 0.06, flock: 0.09,
};
/** The backfire scene's length in s (02 6.4): the rival "laughed off at once" gets 2 s (assumption S5-A9). */
export const BACKFIRE_T: Readonly<Record<EmbKind, number>> = {
  poop: 4, soaked: 4, trip: 4, snatched: 8, wasp: 4, drenched: 5, rival: 2, mime: 4, fog: 4, flock: 5,
};
export const EMB_COST_CAP = 0.15;
export const EMB_COMFORT = 0.3;
export const EMB_CAP_DAY = 3;
export const BACKFIRE = 0.15;
export const BACKFIRE_AFF = 0.04;
export const R_BACKFIRE = 4; // the partner within this (tiles)
export const DRENCHED_UMBRELLA_S = 30; // the shared newspaper counts as umbrella charm (02 6.4)

export type LandResult = { ok: true; backfire: boolean } | { ok: false; reason: ReasonKey; params?: Params };

/** The stage factor of 02 6.4: stages 1-2 x 1.0, 3-4 x 1.25, 5-7 x 1.5. */
export function stageFactor(stage: number): number {
  return stage >= 5 ? 1.5 : stage >= 3 ? 1.25 : 1;
}
/** base x factor, capped at 0.15 (02 6.4). */
export function embCost(kind: EmbKind, stage: number): number {
  return Math.min(EMB_COST_CAP, EMB_BASE[kind] * stageFactor(stage));
}

/** Who may be a target now (02 6.4 rules 2-3, 13 T3, T5): never a child; never a 4th time in a day. */
export function canTarget(v: Visitor): LandResult {
  if (v.archetype === 'child') return { ok: false, reason: 'reason.not_children' };
  if (v.embToday >= EMB_CAP_DAY) return { ok: false, reason: 'reason.enough_today', params: { name: v.name } };
  return { ok: true, backfire: false };
}

function itemOf(v: Visitor): string {
  const it = v.items;
  return it.hat ? 'hat' : it.purse ? 'purse' : it.baguette ? 'baguette' : it.iceCream ? 'iceCream' : 'hat';
}

/**
 * Land `kind` on visitor `victim` for `source` (02 6.4; 03 2.5 embarrass.ts). Refusals spend nothing. A backfire (15 %, the partner
 * within 4) sends both into the laugh; a landing sets pendingEmb for rung 1, which starts the reaction at the next decision (the visitor
 * is stood up now and decides at once).
 */
export function land(kind: EmbKind, victim: VisitorId, source: Side): LandResult {
  const v = byId(victim);
  if (!v) return { ok: false, reason: 'reason.not_here' };
  const c = canTarget(v);
  if (!c.ok) return c;
  const p = pairOf(v);
  if (kind === 'rival' && !p) return { ok: false, reason: 'reason.not_courting' };
  const o = p ? partnerOf(p, v) : undefined;
  const at = { tick: nowTick(), x: v.x, y: v.y };
  if (p && o && Math.hypot(o.x - v.x, o.y - v.y) <= R_BACKFIRE && chance(BACKFIRE)) {
    p.affinity = clamp01(p.affinity + BACKFIRE_AFF);
    interruptStage(p, 0);
    for (const w of [v, o]) {
      release(w);
      w.st = 'laugh';
      w.t = BACKFIRE_T[kind];
      w.path = null;
      w.job = { kind };
    }
    if (kind === 'drenched') {
      p.umbrellaUntil = T.abs + DRENCHED_UMBRELLA_S / DAYLEN;
      setPairCharm(p.id, 'umbrella', p.umbrellaUntil);
    }
    emit({ kind: 'backfired', ...at, ids: [v.id, o.id, p.id], params: { feed: 'feed.emb.backfire.' + kind, kind, source, a: v.name, b: o.name } });
    emit({ kind: 'laugh', ...at, ids: [v.id, o.id] });
    return { ok: true, backfire: true };
  }
  v.comfort = clamp01(v.comfort - EMB_COMFORT);
  v.embToday++;
  v.embDay = T.day;
  if (p) {
    p.embToday++;
    p.embDay = T.day;
    p.affinity = clamp01(p.affinity - embCost(kind, p.stage));
    interruptStage(p);
  }
  release(v);
  v.st = 'idle';
  v.t = 0;
  v.job = {};
  v.path = null;
  v.pendingEmb = kind;
  v.decideT = 0;
  const staff = v.archetype === 'gardener' || v.archetype === 'vendor';
  emit({
    kind: 'embarrassed', ...at, ids: p ? [v.id, o?.id ?? 0, p.id] : [v.id],
    params: { feed: 'feed.emb.' + kind, kind, source, landed: 1, score: p && !staff ? 1 : 0, name: v.name, a: v.name, b: o?.name ?? v.name, item: '@item.' + itemOf(v) },
  });
  return { ok: true, backfire: false };
}

/** The day reset (03 4.2 phase 5; 02 13 T5): every count of the day goes back to 0 at f = 0. */
export function resetDay(): void {
  for (const v of visitors) v.embToday = 0;
  for (const p of pairs) p.embToday = 0;
}
