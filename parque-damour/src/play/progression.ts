// src/play/progression.ts
// CP and MP, TIERS = [0, 8, 20, 40, 70], unlock checks, the day tally; subscribes to stage, happily, embarrassed, parted events (02 section 7).
// NEW (GV has none, review section 10).
// Rules (register 3.6; 02 7.1-7.4): +1 CP for each stage a pair completes where the player contributed (at the tick it completes,
// charmAt(midpoint).player >= 2, or a Cupid action reached the pair within the last 60 s: pair.lastCupidAt, set by abilities.ts); +5 CP
// per Happily whatever the charm; +1 MP per embarrassment landed on a member of a Pair (the `score` the `embarrassed` event carries: 0 for
// anyone else, staff included; a backfire is a `backfired` event and gives none); +5 MP per Parted. Both ladders use TIERS on their
// cumulative points; crossing a tier announces each ability and avatar of that row once (`unlock` events, each id kept in `unlocked`, the
// profile's list, so a reload never announces it again); the T0 row is there from the start and is never announced.
// The points live here, in memory, and persist through the profile: save/store.ts reads them with progressState when it writes the profile
// and puts them back with setProgress when it reads one (this layer may not import save/, 03 2.1), so they survive `park.new` and a
// reload. The per-park tally (`{ day, cp, mp }`, saved and hashed with the park) counts the points of the day; at each new day the sim
// emits the day's tally (a `step` event, params `tally: 'feed.tally'`, `cp`, `mp`) and starts it over (phase 5 of the step, 03 4.2).
// Events: the sim listeners are registered by bindProgression, at load and again by anything that cleared the bus (a test); a duplicate
// registration is harmless, since each event object is handled once. Nothing here reads MODE, the DOM or the wall clock.
import { DAYLEN, T } from '../core/clock.ts';
import { emit, on, type GameEvent } from '../core/events.ts';
import { onResetCommands, type AbilityId } from '../core/commands.ts';
import { charmAt } from '../world/charm.ts';
import { midOf, pairById, type Pair } from '../entities/romance.ts';
import { nowTick } from '../entities/visitor.ts';
import type { AvatarId } from './mode.ts';

export type Tier = 0 | 1 | 2 | 3 | 4;
/** The two ladders: Cupid Points and Mischief Points. */
export type Ladder = 'cupid' | 'mischief';

export const TIERS = [0, 8, 20, 40, 70] as const;
export const CP_STAGE = 1;
export const CP_HAPPILY = 5;
export const MP_EMB = 1;
export const MP_PARTED = 5;
/** `charmAt(midpoint).player` at or above this counts as the player's contribution (06 1.7 CONTRIB_CHARM). */
export const CONTRIB_CHARM = 2;
/** A Cupid action within this many sim seconds of a stage's completion counts as a contribution (02 7.1 item 2). */
export const CUPID_WINDOW_S = 60;

/** One row of the unlock table (02 7.4 / 06 13): the abilities of a tier and the avatar it opens, if any. */
export type UnlockRow = { tier: Tier; abilities: readonly AbilityId[]; avatar: AvatarId | null };
export const UNLOCKS: Readonly<Record<Ladder, readonly UnlockRow[]>> = {
  cupid: [
    { tier: 0, abilities: ['c_petals', 'c_bouquet'], avatar: null },
    { tier: 1, abilities: ['c_musician', 'c_sunbeam'], avatar: 'a_florist' },
    { tier: 2, abilities: ['c_umbrella', 'c_lamplight'], avatar: 'a_busker' },
    { tier: 3, abilities: ['c_picnic', 'c_rowboat'], avatar: 'a_matchmaker' },
    { tier: 4, abilities: ['c_fireworks'], avatar: null },
  ],
  mischief: [
    { tier: 0, abilities: ['m_pigeon', 'm_sprinkler'], avatar: 'a_pigeon' },
    { tier: 1, abilities: ['m_peel', 'm_pomeranian'], avatar: 'a_pomeranian' },
    { tier: 2, abilities: ['m_wasp', 'm_raincloud'], avatar: null },
    { tier: 3, abilities: ['m_rival', 'm_mime'], avatar: 'a_mime' },
    { tier: 4, abilities: ['m_fog', 'm_flock'], avatar: null },
  ],
};

export type Tally = { day: number; cp: number; mp: number };
export type UnlockInfo = { tier: Tier; points: number; left: number; ids: readonly string[] };

let cp = 0;
let mp = 0;
let unlocked: string[] = [];
let tally: Tally = { day: 1, cp: 0, mp: 0 };

/* ---------- reading ---------- */

export function points(): { cp: number; mp: number } {
  return { cp, mp };
}

/** The tier a ladder at `n` points has reached: the highest threshold of TIERS not above `n`. */
export function tierFor(n: number): Tier {
  let t: Tier = 0;
  for (let k = 1; k < TIERS.length; k++) if (n >= (TIERS[k] as number)) t = k as Tier;
  return t;
}

export function tier(side: Ladder): Tier {
  return tierFor(side === 'cupid' ? cp : mp);
}

function rowOf(id: string): { side: Ladder; row: UnlockRow } | null {
  for (const side of ['cupid', 'mischief'] as const)
    for (const row of UNLOCKS[side]) if (row.avatar === id || (row.abilities as readonly string[]).includes(id)) return { side, row };
  return null;
}

/** The ladder and tier an ability or avatar belongs to (02 7.4), or null for an id that is neither. */
export function unlockOf(id: string): { side: Ladder; tier: Tier } | null {
  const r = rowOf(id);
  return r ? { side: r.side, tier: r.row.tier } : null;
}

/** True when the ability or avatar `id` is open: its ladder has reached its tier. An unknown id is not. */
export function isUnlocked(id: string): boolean {
  const r = rowOf(id);
  return !!r && tier(r.side) >= r.row.tier;
}

/** What the next tier of a ladder opens and how far away it is (the Progress sheet); null at T4. */
export function nextUnlock(side: Ladder): UnlockInfo | null {
  const t = tier(side);
  if (t >= 4) return null;
  const row = UNLOCKS[side][t + 1] as UnlockRow;
  const need = TIERS[t + 1] as number;
  return { tier: row.tier, points: need, left: need - (side === 'cupid' ? cp : mp), ids: row.avatar ? [...row.abilities, row.avatar] : [...row.abilities] };
}

/** The day's points in this park (a copy). */
export function dayTally(): { cp: number; mp: number } {
  return { cp: tally.cp, mp: tally.mp };
}

/* ---------- awarding ---------- */

function announce(side: Ladder, row: UnlockRow): void {
  const ids: string[] = row.avatar ? [...row.abilities, row.avatar] : [...row.abilities];
  for (const id of ids) {
    if (unlocked.includes(id)) continue;
    unlocked.push(id);
    const isAvatar = id === row.avatar;
    emit({
      kind: 'unlock', tick: nowTick(),
      params: { id, side: '@hud.' + side, tier: row.tier, item: '@' + (isAvatar ? 'avatar.' : 'ability.') + id + '.name', toast: 'toast.unlocked', feed: 'feed.unlock' },
    });
  }
}

/** Add `n` points to a ladder (and to the day's tally); each tier crossed announces its row. Also the avatars' scoring (S7). */
export function award(side: Ladder, n: number): void {
  if (!(n > 0)) return;
  const before = tier(side);
  if (side === 'cupid') {
    cp += n;
    tally.cp += n;
  } else {
    mp += n;
    tally.mp += n;
  }
  for (let t = before + 1; t <= tier(side); t++) announce(side, UNLOCKS[side][t] as UnlockRow);
}

/** Did the player contribute to the stage `p` just completed (02 7.1 item 2)? */
export function contributed(p: Pair): boolean {
  const m = midOf(p);
  if (charmAt(m.x, m.y, p.id).player >= CONTRIB_CHARM) return true;
  return p.lastCupidAt >= 0 && (T.abs - p.lastCupidAt) * DAYLEN <= CUPID_WINDOW_S + 1e-6;
}

/**
 * Phase 5 on a new day (03 4.2): the finished day's tally is emitted for the feed's `feed.tally` line, and the count starts over.
 * The param is `tally`, which ui/feed.ts reads for the one "Today: Cupid n · Mischief m" line (the zero stub on `newday` is gone), so
 * no `feed` param is needed; tests/progression.test.ts guards the single line.
 */
export function stepProgression(): void {
  emit({ kind: 'step', tick: nowTick(), x: 23.5, y: 23.5, params: { tally: 'feed.tally', cp: tally.cp, mp: tally.mp } });
  tally = { day: T.day, cp: 0, mp: 0 };
}

/* ---------- the event listeners ---------- */

const handled = new WeakSet<GameEvent>();
function once(fn: (ev: GameEvent) => void): (ev: GameEvent) => void {
  return (ev) => {
    if (handled.has(ev)) return;
    handled.add(ev);
    fn(ev);
  };
}

/** Register the sim listeners; called at load. A test that cleared the bus (clearListeners) calls it again; a duplicate is harmless. */
export function bindProgression(): void {
  on('stage', once((ev) => {
    const p = pairById(ev.ids?.[2] ?? 0);
    if (p && contributed(p)) award('cupid', CP_STAGE);
  }));
  on('happily', once(() => award('cupid', CP_HAPPILY)));
  on('parted', once(() => award('mischief', MP_PARTED)));
  on('embarrassed', once((ev) => {
    const score = ev.params?.score;
    if (ev.params?.source === 'mischief' && typeof score === 'number' && score > 0) award('mischief', score * MP_EMB);
  }));
}

/* ---------- state: the profile's points, the park's tally ---------- */

/** What the profile keeps (save/store.ts writes it with the park): the points, and the ids already announced. */
export function progressState(): { cp: number; mp: number; unlocked: string[] } {
  return { cp, mp, unlocked: unlocked.slice() };
}

/** A profile was read (or cleared): its points and announced ids replace the ones in memory. Anything that is not a number or a string goes. */
export function setProgress(s: { cp?: unknown; mp?: unknown; unlocked?: unknown }): void {
  cp = typeof s.cp === 'number' && s.cp >= 0 ? s.cp : 0;
  mp = typeof s.mp === 'number' && s.mp >= 0 ? s.mp : 0;
  unlocked = Array.isArray(s.unlocked) ? s.unlocked.filter((x): x is string => typeof x === 'string') : [];
}

/** The park's tally for the snapshot (a copy). */
export function tallyState(): Tally {
  return { ...tally };
}

/** A restore: the saved tally, or an empty one for day `day` when the save has none. */
export function setTallyState(s: Partial<Tally> | undefined, day = 1): void {
  tally = {
    day: typeof s?.day === 'number' ? s.day : day,
    cp: typeof s?.cp === 'number' ? s.cp : 0,
    mp: typeof s?.mp === 'number' ? s.mp : 0,
  };
}

/** Tests and the dev harness: no points, nothing announced, an empty tally. */
export function resetProgress(): void {
  setProgress({});
  tally = { day: 1, cp: 0, mp: 0 };
}

onResetCommands(() => {
  tally = { day: 1, cp: 0, mp: 0 }; // a new park counts its own points; the profile's stay (register 3.6)
});
bindProgression();
