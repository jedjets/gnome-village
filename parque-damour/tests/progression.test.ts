// tests/progression.test.ts
// Locks register 3.6 and 02 7 (Cupid Points and Mischief Points, the tiers 0, 8, 20, 40, 70, the unlock table, the day tally), 03 2.6 and
// 08 2.5 progression.test.ts rows, 07 S6.7 item 3: a stage completed with charmAt(mid).player >= 2 gives +1 CP and without gives 0; a
// landed embarrassment on a paired victim +1 MP, a backfire 0; Happily +5 CP, Parted +5 MP; crossing 8 points unlocks exactly the T1 rows
// of 02 7.4 and announces them once; the points survive park.new and a profile reload.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SIM_DT, newPark, setSpeed, simulate } from '../src/core/loop.ts';
import { DAYLEN, STEPS_PER_DAY, T } from '../src/core/clock.ts';
import { applyNow } from '../src/core/commands.ts';
import { clearListeners, drain, on, type GameEvent } from '../src/core/events.ts';
import { I, KIND, Kind, addProp, props } from '../src/world/grid.ts';
import { rebuildCharm, charmAt } from '../src/world/charm.ts';
import { ABILITIES } from '../src/play/abilities.ts';
import {
  CONTRIB_CHARM, TIERS, UNLOCKS, award, bindProgression, dayTally, isUnlocked, nextUnlock, points, progressState, resetProgress, setProgress, stepProgression,
  tier, tierFor, unlockOf,
} from '../src/play/progression.ts';
import { setArrivalsState, spawnVisitor, type Visitor } from '../src/entities/visitor.ts';
import { part, tryForm, midOf, type Pair } from '../src/entities/romance.ts';
import { completeStage } from '../src/entities/romance-stages.ts';
import { land } from '../src/entities/embarrass.ts';
import { PROFILE_KEY, clearAll, getProfile, loadProfile, savePark } from '../src/save/store.ts';
import { clearFeed, feedEntries, initFeed } from '../src/ui/feed.ts';
import { MemStorage, install } from './mem-storage.ts';

let mem: MemStorage;

beforeEach(() => {
  clearListeners();
  bindProgression();
  mem = new MemStorage();
  install(mem);
  clearAll();
  newPark(1);
  setSpeed(1);
  resetProgress();
  rebuildCharm(props, T.lamps); // the base field of this park (genPark only marks it dirty; a step would rebuild it)
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

function single(x: number, y: number, sex: 'f' | 'm'): Visitor {
  const v = spawnVisitor('single', 'g_west', { sex, seeks: sex === 'f' ? 'm' : 'f' }) as Visitor;
  Object.assign(v, { x, y, path: null, st: 'idle', t: 0, hunger: 0.3, energy: 0.8, comfort: 0.7, leaveAt: T.abs + 0.9 });
  return v;
}
/** A pair at stage 2 on open lawn, the partner `d` tiles off. */
function pairAt(x: number, y: number, d: number): { p: Pair; a: Visitor; b: Visitor } {
  const a = single(x, y, 'f'), b = single(x + 1, y, 'm');
  const p = tryForm(a, b, true) as Pair;
  p.stage = 1;
  for (const v of [a, b]) Object.assign(v, { st: 'idle', job: {}, path: null });
  b.x = a.x + d;
  return { p, a, b };
}
/** Complete stage `k` for the pair now, as romance-stages.ts does at the end of a stage. */
function complete(p: Pair, k: number): void {
  p.doing = k;
  completeStage(p);
}

describe('Cupid Points need a contribution (register 3.6; 02 7.1 item 2)', () => {
  it('a stage completed with charmAt(midpoint).player >= 2 gives +1 CP; with player 1 and no Cupid action in 60 s, 0', () => {
    const { p } = pairAt(10, 20, 2);
    const m = midOf(p);
    expect(charmAt(m.x, m.y).player).toBe(0);
    complete(p, 2);
    expect(points().cp).toBe(0); // no contribution: the stage completed, no point
    addProp({ kind: 'fountain', x: Math.round(m.x) - 1, y: Math.round(m.y) + 3, w: 2, h: 2, rot: 0, placedBy: 'player' });
    rebuildCharm(props, T.lamps);
    expect(charmAt(m.x, m.y).player).toBe(CONTRIB_CHARM); // a fountain the player placed: +2 within 5
    complete(p, 3);
    expect(points().cp).toBe(1);
    props.length = 0;
    KIND[I(Math.round(m.x), Math.round(m.y) + 1)] = Kind.bed; // a bed the player painted: +1 only
    rebuildCharm(props, T.lamps);
    expect(charmAt(m.x, m.y).player).toBe(1);
    complete(p, 4);
    expect(points().cp).toBe(1);
  });
  it('a Cupid action within the last 60 s counts (59 s: +1, 61 s: +0), and the pair\'s own lastCupidAt is what is read', () => {
    const { p } = pairAt(10, 20, 2);
    p.lastCupidAt = T.abs - 59 / DAYLEN;
    complete(p, 2);
    expect(points().cp).toBe(1);
    p.lastCupidAt = T.abs - 61 / DAYLEN;
    complete(p, 3);
    expect(points().cp).toBe(1);
    p.lastCupidAt = -1; // never
    complete(p, 4);
    expect(points().cp).toBe(1);
  });
  it('Happily is +5 CP with no attribution at all', () => {
    const { p } = pairAt(10, 20, 2);
    expect(charmAt(midOf(p).x, midOf(p).y).player).toBe(0);
    complete(p, 7); // Proposal: the stage gives nothing here, Happily gives 5
    expect(points().cp).toBe(5);
    expect(dayTally()).toEqual({ cp: 5, mp: 0 });
  });
});

describe('Mischief Points need a paired victim and a landing (register 3.6; 02 7.2)', () => {
  it('+1 MP for a landing on a member of a Pair, 0 on an unpaired single', () => {
    const { a } = pairAt(10, 20, 6);
    const lone = single(30, 30, 'f');
    expect(land('poop', a.id, 'mischief')).toEqual({ ok: true, backfire: false });
    expect(points().mp).toBe(1);
    expect(land('poop', lone.id, 'mischief')).toEqual({ ok: true, backfire: false });
    expect(points().mp).toBe(1);
  });
  it('a backfire gives 0 and a refusal gives 0; every landed one gives exactly 1', () => {
    const { a } = pairAt(10, 20, 2); // the partner within 4: the 15 % roll applies
    let landed = 0, backfired = 0;
    on('embarrassed', () => landed++);
    on('backfired', () => backfired++);
    for (let k = 0; k < 60 && backfired < 2; k++) {
      a.embToday = 0;
      Object.assign(a, { st: 'idle', pendingEmb: null });
      land('poop', a.id, 'mischief');
    }
    expect(backfired).toBeGreaterThanOrEqual(1);
    expect(points().mp).toBe(landed);
    a.embToday = 3;
    const before = points().mp;
    expect(land('poop', a.id, 'mischief').ok).toBe(false);
    expect(points().mp).toBe(before);
  });
  it('staff score nothing (02 6.4 rule 3)', () => {
    const g = spawnVisitor('gardener', 'g_west', {}) as Visitor;
    expect(land('poop', g.id, 'mischief').ok).toBe(true);
    expect(points().mp).toBe(0);
  });
  it('Parted is +5 MP', () => {
    const { p } = pairAt(10, 20, 6);
    part(p);
    expect(points().mp).toBe(5);
    expect(dayTally()).toEqual({ cp: 0, mp: 5 });
  });
});

describe('the tiers and the unlock table (register 3.6; 02 7.3, 7.4)', () => {
  it('TIERS is 0, 8, 20, 40, 70, and each ladder reaches its tier at its threshold, apart from the other', () => {
    expect([...TIERS]).toEqual([0, 8, 20, 40, 70]);
    expect([0, 7, 8, 19, 20, 39, 40, 69, 70, 500].map(tierFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    award('cupid', 7);
    expect([tier('cupid'), tier('mischief')]).toEqual([0, 0]);
    award('cupid', 1);
    expect([tier('cupid'), tier('mischief')]).toEqual([1, 0]);
    award('mischief', 20);
    expect([tier('cupid'), tier('mischief')]).toEqual([1, 2]);
  });
  it('the table holds the 19 abilities and the 6 avatars once, with the tiers of the registry', () => {
    const ids = (['cupid', 'mischief'] as const).flatMap((s) => UNLOCKS[s].flatMap((r) => [...r.abilities, ...(r.avatar ? [r.avatar] : [])]));
    expect(ids).toHaveLength(25);
    expect(new Set(ids).size).toBe(25);
    for (const a of ABILITIES) expect(unlockOf(a.id), a.id).toEqual({ side: a.side, tier: a.tier });
    expect(['a_pigeon', 'a_pomeranian', 'a_mime', 'a_florist', 'a_busker', 'a_matchmaker'].map((id) => unlockOf(id))).toEqual([
      { side: 'mischief', tier: 0 }, { side: 'mischief', tier: 1 }, { side: 'mischief', tier: 3 },
      { side: 'cupid', tier: 1 }, { side: 'cupid', tier: 2 }, { side: 'cupid', tier: 3 },
    ]);
    expect(unlockOf('c_nothing')).toBeNull();
    expect(isUnlocked('c_nothing')).toBe(false);
  });
  it('crossing 8 CP announces exactly c_musician, c_sunbeam and a_florist, 8 MP exactly m_peel, m_pomeranian and a_pomeranian, once', () => {
    const seen: GameEvent[] = [];
    on('unlock', (e) => seen.push(e));
    expect(isUnlocked('c_petals')).toBe(true);
    expect(isUnlocked('c_musician')).toBe(false);
    award('cupid', 7);
    expect(seen).toHaveLength(0);
    award('cupid', 1);
    expect(seen.map((e) => e.params?.id)).toEqual(['c_musician', 'c_sunbeam', 'a_florist']);
    expect(seen[0]?.params).toMatchObject({ side: '@hud.cupid', tier: 1, item: '@ability.c_musician.name', toast: 'toast.unlocked', feed: 'feed.unlock' });
    expect(seen[2]?.params?.item).toBe('@avatar.a_florist.name');
    expect(isUnlocked('c_musician') && isUnlocked('a_florist')).toBe(true);
    expect(isUnlocked('m_peel')).toBe(false);
    award('cupid', 5);
    expect(seen).toHaveLength(3);
    award('mischief', 8);
    expect(seen.slice(3).map((e) => e.params?.id)).toEqual(['m_peel', 'm_pomeranian', 'a_pomeranian']);
  });
  it('one big award announces every row it crosses, in order; T4 holds the last two of each side', () => {
    const seen: string[] = [];
    on('unlock', (e) => seen.push(String(e.params?.id)));
    award('cupid', 70);
    expect(seen).toEqual(['c_musician', 'c_sunbeam', 'a_florist', 'c_umbrella', 'c_lamplight', 'a_busker', 'c_picnic', 'c_rowboat', 'a_matchmaker', 'c_fireworks']);
    expect(nextUnlock('cupid')).toBeNull();
  });
  it('nextUnlock names the next row and the points still to earn', () => {
    expect(nextUnlock('cupid')).toEqual({ tier: 1, points: 8, left: 8, ids: ['c_musician', 'c_sunbeam', 'a_florist'] });
    award('cupid', 3);
    expect(nextUnlock('cupid')?.left).toBe(5);
    award('mischief', 20);
    expect(nextUnlock('mischief')).toEqual({ tier: 3, points: 40, left: 20, ids: ['m_rival', 'm_mime', 'a_mime'] });
  });
});

describe('points persist across parks and a profile reload; each unlock toasts once (08 2.5; register 3.6, 3.11)', () => {
  it('park.new keeps the points and starts the park\'s tally over', () => {
    award('cupid', 9);
    award('mischief', 4);
    expect(dayTally()).toEqual({ cp: 9, mp: 4 });
    expect(applyNow({ side: 'park', kind: 'park.new', payload: { seed: 5 } }).ok).toBe(true);
    expect(points()).toEqual({ cp: 9, mp: 4 });
    expect(dayTally()).toEqual({ cp: 0, mp: 0 });
    expect(isUnlocked('c_musician')).toBe(true);
  });
  it('the day tally goes to the feed at the new day and starts over; the points stay', () => {
    setArrivalsState({ arrivalT: 1e9, pace: 'calm' }); // nobody comes: no pair earns a point of its own
    award('cupid', 2);
    award('mischief', 1);
    const lines: GameEvent[] = [];
    on('step', (e) => {
      if (e.params?.tally === 'feed.tally') lines.push(e);
    });
    for (let s = 0, n = STEPS_PER_DAY - Math.round((T.abs - 0.3) * STEPS_PER_DAY) + 2; s < n; s++) simulate(SIM_DT, 1);
    expect(T.day).toBe(2);
    expect(lines.map((e) => [e.params?.cp, e.params?.mp])).toEqual([[2, 1]]);
    expect(dayTally()).toEqual({ cp: 0, mp: 0 });
    expect(points()).toEqual({ cp: 2, mp: 1 });
    stepProgression();
    expect(lines.at(-1)?.params).toMatchObject({ cp: 0, mp: 0 });
  });
  it('a new day with points earned puts exactly one feed.tally line in the feed, not the sim\'s and the stub\'s (one line, 02 7.3)', () => {
    setArrivalsState({ arrivalT: 1e9, pace: 'calm' });
    clearListeners();
    initFeed();
    clearFeed();
    award('cupid', 3);
    award('mischief', 1);
    for (let s = 0, n = STEPS_PER_DAY - Math.round((T.abs - 0.3) * STEPS_PER_DAY) + 2; s < n; s++) simulate(SIM_DT, 1);
    drain(0);
    expect(T.day).toBe(2);
    expect(feedEntries().filter((e) => e.key === 'feed.tally')).toHaveLength(1);
  });
  it('a profile written with the park holds cp, mp, the tiers and the announced ids, and a reload gives them back and announces nothing again', () => {
    award('cupid', 9);
    award('mischief', 21);
    expect(savePark()).toBe(true);
    const stored = JSON.parse(mem.map.get(PROFILE_KEY) as string) as Record<string, unknown>;
    expect(stored).toEqual({
      v: 1, cp: 9, mp: 21, tierC: 1, tierM: 2,
      unlocked: ['c_musician', 'c_sunbeam', 'a_florist', 'm_peel', 'm_pomeranian', 'a_pomeranian', 'm_wasp', 'm_raincloud'],
      settings: { lang: 'en', muted: false, speed: 1 }, stylePick: null, musicPick: null, parksPlayed: 0, updatedAt: 1,
    }); // the profile JSON of the S6 hand-back
    resetProgress();
    expect(points()).toEqual({ cp: 0, mp: 0 });
    expect(loadProfile()).toMatchObject({ cp: 9, mp: 21 });
    expect(points()).toEqual({ cp: 9, mp: 21 });
    expect(getProfile().tierM).toBe(2);
    const seen: GameEvent[] = [];
    on('unlock', (e) => seen.push(e));
    setProgress({ cp: 7, mp: 21, unlocked: progressState().unlocked }); // behind the tier again (a profile edited back), the ids still announced
    award('cupid', 1);
    expect(seen).toHaveLength(0); // reaching 8 a second time announces nothing
    award('cupid', 12);
    expect(seen.map((e) => e.params?.id)).toEqual(['c_umbrella', 'c_lamplight', 'a_busker']); // 20: a new row
  });
  it('clearAll puts the points back to nothing', () => {
    award('cupid', 30);
    clearAll();
    expect(points()).toEqual({ cp: 0, mp: 0 });
    expect(progressState().unlocked).toEqual([]);
  });
  it('a stored profile with nonsense in its points reads as none', () => {
    setProgress({ cp: 'many', mp: -3, unlocked: [4, 'c_musician'] });
    expect(points()).toEqual({ cp: 0, mp: 0 });
    expect(progressState().unlocked).toEqual(['c_musician']);
  });
});
