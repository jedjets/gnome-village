// tests/pairing.test.ts
// Locks register section 4 "Who can pair" (owner 2026-10-20: "Make sure only men and woman can date no woman woman or man man.") and
// register 3.3, 3.4, 3.5, 02 4.1, 4.2 item 7, 4.5 item 2, 6.1 item 4 and 10.9 as amended: every Pair is one woman and one man, by every
// path that makes one (tryForm, formStep, the couple archetype, the returning alumni, the matchmaker's introduce, a restore).
// The 200-seed, 3-day sweep on both paces is tests/picnic.test.ts's recorded scan (its seventh column counts same-sex Pairs; the first
// seeds are run again there, PD_SCAN=1 runs all 400) and every determinism fixture counts its own Pairs (tests/determinism.test.ts);
// the sweep below is the cheap live one.
import { describe, it, expect, beforeEach } from 'vitest';
import { SIM_DT, newPark, setSpeed, simulate } from '../src/core/loop.ts';
import { STEPS_PER_DAY, syncClock } from '../src/core/clock.ts';
import { applyNow } from '../src/core/commands.ts';
import { clearListeners, on } from '../src/core/events.ts';
import { rngN } from '../src/core/rng.ts';
import { clearLayers, markBlockDirty, props, rebuildBlock } from '../src/world/grid.ts';
import { restore, snapshot, stateHash } from '../src/save/store.ts';
import { REGULARS, opposite } from '../src/entities/names.ts';
import {
  arriveGroup, byId, compatible, removeVisitor, spawnVisitor, visitors, type Archetype, type Seeks, type Sex, type Visitor,
} from '../src/entities/visitor.ts';
import { alumniRoll, alumniState, formStep, pairs, pinnedPair, setRomanceState, tryForm, type Alumni, type Pair } from '../src/entities/romance.ts';

const SEXES: readonly Sex[] = ['f', 'm'];
const SEEKS: readonly Seeks[] = ['f', 'm', 'any'];

/** A single at (x, y), idle, its visit far from over; `seeks` forced when given (a test's way to try to get a same-sex pair through). */
function single(x: number, y: number, sex: Sex, seeks?: Seeks): Visitor {
  const v = spawnVisitor('single', 'g_west', { sex, ...(seeks ? { seeks } : {}) }) as Visitor;
  Object.assign(v, { x, y, path: null, st: 'idle', t: 0, hunger: 0.3, energy: 0.8, comfort: 0.7, leaveAt: 1e6 });
  return v;
}

/** A blank lawn park, so the line of sight is the test's own. */
function blank(): void {
  clearLayers();
  props.length = 0;
  markBlockDirty();
  rebuildBlock();
}

/** An alumni entry of two people of the given sexes. */
const mk = (id: number, sa: Sex, sb: Sex): Alumni => ({
  id, a: { name: 'Une ' + id, sex: sa, lookSeed: 1, ageWord: 'grown' }, b: { name: 'Autre ' + id, sex: sb, lookSeed: 2, ageWord: 'grown' }, day: 1, inPark: [],
});

/** A blank park with one woman and one man paired, a lone woman, and the save of it. */
function parkWithPair(): { snap: ReturnType<typeof snapshot>; hash: number; pair: Pair; lone: Visitor } {
  blank();
  const a = single(10, 20, 'f'), b = single(13, 20, 'm');
  const pair = tryForm(a, b, true) as Pair;
  const lone = single(30, 30, 'f');
  return { snap: JSON.parse(JSON.stringify(snapshot())) as ReturnType<typeof snapshot>, hash: stateHash(), pair, lone };
}

function empty(): void {
  visitors.length = 0;
  pairs.length = 0;
}

const sexOf = (id: number): Sex | undefined => byId(id)?.sex;
const mixed = (p: Pair): boolean => sexOf(p.a) !== undefined && sexOf(p.b) !== undefined && sexOf(p.a) !== sexOf(p.b);
const sameSex = (p: Pair): boolean => sexOf(p.a) !== undefined && sexOf(p.a) === sexOf(p.b);

beforeEach(() => {
  clearListeners();
  newPark(1);
  setSpeed(1);
});

describe('compatible and tryForm: the sexes must differ (register 3.5; 02 6.1 item 4)', () => {
  it('the table: of the 36 sex and seeks combinations only f seeking m with m seeking f is compatible', () => {
    let ok = 0;
    for (const sa of SEXES)
      for (const sb of SEXES)
        for (const ka of SEEKS)
          for (const kb of SEEKS) {
            const c = compatible({ sex: sa, seeks: ka }, { sex: sb, seeks: kb });
            if (c) {
              ok++;
              expect(sa !== sb && ka === sb && kb === sa).toBe(true);
            }
          }
    expect(ok).toBe(2); // (f, m, m, f) and (m, f, f, m)
  });

  it('tryForm refuses two women and two men even when both seeks are forced to match, with the roll skipped or not', () => {
    blank();
    for (const [sex, seeks] of [['f', 'f'], ['m', 'm'], ['f', 'any'], ['m', 'any']] as const) {
      empty();
      const a = single(10, 20, sex, seeks), b = single(13, 20, sex, seeks); // 3 tiles apart on bare lawn, both idle
      const n0 = rngN();
      expect(tryForm(a, b, true), sex + ' seeks ' + seeks).toBeNull();
      expect(tryForm(a, b), sex + ' seeks ' + seeks + ' with the roll').toBeNull();
      expect(rngN()).toBe(n0); // refused before any roll
      expect([a.pairId, b.pairId, pairs.length]).toEqual([0, 0, 0]);
    }
    empty();
    const w = single(10, 20, 'f', 'm'), x = single(13, 20, 'm', 'f');
    expect(tryForm(w, x, true)).not.toBeNull(); // the same two places, a woman and a man
  });

  it('a woman who seeks a woman and a man who seeks a man cannot get a Pair with each other either (the seeks alone would not do)', () => {
    blank();
    const a = single(10, 20, 'f', 'm'), b = single(13, 20, 'm', 'm'); // she seeks him, he seeks men: not mutual
    expect(tryForm(a, b, true)).toBeNull();
    b.seeks = 'f';
    expect(tryForm(a, b, true)).not.toBeNull();
  });

  it('formStep, the decide ladder\'s check, finds no partner among eight women but pairs the one man with one of them', () => {
    blank();
    const women = Array.from({ length: 8 }, (_, k) => single(10 + (k % 4), 20 + Math.floor(k / 4), 'f'));
    for (const w of women) expect(formStep(w)).toBe(false);
    expect(pairs).toHaveLength(0);
    const man = single(11, 22, 'm');
    let formed = false;
    for (let day = 0; day < 40 && !formed; day++) formed = formStep(man); // the once-a-day 50 % roll, so a few tries
    expect(formed).toBe(true);
    expect(pairs).toHaveLength(1);
    expect(mixed(pairs[0] as Pair)).toBe(true);
  });

  it('a matchmaker\'s introduce skips the roll but not the sexes: of 2x2 sexes only the mixed ones pair, and a crowd pairs f with m only', () => {
    blank();
    for (const sa of SEXES)
      for (const sb of SEXES) {
        empty();
        const a = single(10, 20, sa), b = single(13, 20, sb);
        expect(tryForm(a, b, true) !== null, sa + ' with ' + sb).toBe(sa !== sb);
      }
    empty();
    const crowd = Array.from({ length: 12 }, (_, k) => single(8 + (k % 4), 18 + Math.floor(k / 4), k % 3 === 0 ? 'm' : 'f')); // 4 men, 8 women
    for (const a of crowd) {
      if (a.pairId !== 0) continue;
      // the lead's choice: the nearest unpaired single it is compatible with, then the introduction (no roll)
      const near = crowd.filter((o) => o !== a && o.pairId === 0 && compatible(a, o)).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0];
      if (near) expect(tryForm(a, near, true)).not.toBeNull();
    }
    expect(pairs).toHaveLength(4); // all four men found a woman; four women are left over
    for (const p of pairs) expect(mixed(p)).toBe(true);
    const left = crowd.filter((v) => v.pairId === 0);
    expect(left.map((v) => v.sex)).toEqual(['f', 'f', 'f', 'f']);
    for (const a of left) for (const o of left) if (a !== o) expect(tryForm(a, o, true)).toBeNull(); // nobody to introduce them to
  });
});

describe('what the factory makes (register 3.4; 02 4.1, 4.2 item 7)', () => {
  it('nobody the factory makes seeks "any" or their own sex, of any archetype, whatever the draws', () => {
    const arch: Archetype[] = ['single', 'couple', 'family', 'child', 'elder', 'tourist', 'jogger', 'artist', 'busker', 'dogwalker', 'gardener', 'vendor', 'cameo'];
    for (let seed = 1; seed <= 4; seed++) {
      newPark(seed);
      for (let k = 0; k < 130; k++) {
        const v = spawnVisitor(arch[k % arch.length] as Archetype, 'g_south_w') as Visitor;
        expect(v.seeks).toBe(opposite(v.sex));
        if (k % 3 === 2) removeVisitor(v.id);
        if (visitors.length >= 25) empty();
      }
    }
  });

  it('every singles\' arrival through the scheduler\'s own path seeks the opposite sex, and the eight regulars do too', () => {
    for (let k = 0; k < 300; k++) {
      empty();
      const [v] = arriveGroup('single', 'g_west') as [Visitor];
      expect(['f', 'm']).toContain(v.seeks);
      expect(v.seeks).toBe(opposite(v.sex));
    }
    for (const r of REGULARS) {
      empty();
      const v = spawnVisitor('single', 'g_west', { regular: r }) as Visitor;
      expect([v.name, v.sex, v.seeks]).toEqual([r.name, r.sex, opposite(r.sex)]);
    }
  });

  it('every couple arrival is one woman and one man, each seeking the other, and their Pair joins exactly those two', () => {
    for (let k = 0; k < 300; k++) {
      empty();
      const got = arriveGroup('couple', k % 2 === 0 ? 'g_west' : 'g_north');
      expect(got).toHaveLength(2);
      const [f, m] = got as [Visitor, Visitor];
      expect([f.sex, f.seeks, m.sex, m.seeks]).toEqual(['f', 'm', 'm', 'f']);
      expect(pairs).toHaveLength(1);
      const p = pairs[0] as Pair;
      expect([p.a, p.b].sort()).toEqual([f.id, m.id].sort());
      expect(mixed(p)).toBe(true);
    }
  });

  it('a returning alumni couple arrives as one woman and one man, each seeking the other', () => {
    const al: Alumni = { id: 1, a: { name: 'Amandine', sex: 'f', lookSeed: 77, ageWord: 'grown' }, b: { name: 'Bruno', sex: 'm', lookSeed: 99, ageWord: 'grown' }, day: 1, inPark: [] };
    syncClock(Math.round(0.2 * STEPS_PER_DAY)); // f 0.50
    let got: Pair | undefined;
    for (let k = 0; k < 80 && !got; k++) {
      setRomanceState([], [al], { rolled: [], alumniDay: 0 }, 0);
      alumniRoll();
      got = pairs[0];
    }
    expect(got).toBeDefined();
    const p = got as Pair;
    expect(mixed(p)).toBe(true);
    expect([byId(p.a)?.seeks, byId(p.b)?.seeks]).toEqual([opposite(byId(p.a)?.sex ?? 'f'), opposite(byId(p.b)?.sex ?? 'f')]);
    expect(alumniState()[0]?.inPark).toEqual([p.a, p.b]);
  });

  it('an alumni couple of two women (or two men) from an old save never comes back, in 300 tries at f 0.50; a woman and a man still do', () => {
    syncClock(Math.round(0.2 * STEPS_PER_DAY));
    for (const bad of [mk(1, 'f', 'f'), mk(2, 'm', 'm')]) {
      let came = 0;
      for (let k = 0; k < 300; k++) {
        empty();
        setRomanceState([], [bad], { rolled: [], alumniDay: 0 }, 0);
        alumniRoll();
        came += pairs.length + visitors.filter((v) => v.archetype === 'couple').length;
      }
      expect(came).toBe(0);
    }
    let back = 0;
    for (let k = 0; k < 300; k++) {
      empty();
      setRomanceState([], [mk(3, 'f', 'm')], { rolled: [], alumniDay: 0 }, 0);
      alumniRoll();
      back += pairs.length;
    }
    expect(back).toBeGreaterThan(30); // 20 % of 300
  });
});

describe('a restore (register section 4 "Who can pair", 2026-10-20: an old save is normalised, never refused; 03 section 11 persistence)', () => {
  it('an old save whose people seek "any" or their own sex restores as the opposite sex\'s value, and the park hashes as before', () => {
    const { snap, hash } = parkWithPair();
    const old = JSON.parse(JSON.stringify(snap)) as typeof snap;
    old.visitors.forEach((v, k) => (v.seeks = k === 0 ? 'any' : v.sex));
    expect(old.visitors.some((v) => v.seeks === 'any')).toBe(true);
    expect(() => restore(old)).not.toThrow();
    expect(visitors.every((v) => v.seeks === opposite(v.sex))).toBe(true);
    expect(stateHash()).toBe(hash); // the same park as the one saved with the right seeks
    expect(pairs).toHaveLength(1);
  });

  it('a saved Pair of two women is forgotten on restore: both stand up unpaired and idle, the pin goes, nothing throws', () => {
    const { snap, pair } = parkWithPair();
    const old = JSON.parse(JSON.stringify(snap)) as typeof snap;
    const man = old.visitors.find((v) => (v.id === pair.a || v.id === pair.b) && v.sex === 'm');
    if (!man) throw new Error('no man in the pair');
    man.sex = 'f'; // the old save's second member was a woman
    old.pinnedPair = pair.id;
    expect(() => restore(old)).not.toThrow();
    expect(pairs).toHaveLength(0);
    for (const id of [pair.a, pair.b]) {
      const v = byId(id) as Visitor;
      expect([v.pairId, v.st, v.job]).toEqual([0, 'idle', {}]);
      expect(v.seeks).toBe('m');
    }
    expect(pinnedPair()).toBe(0);
  });

  it('a saved Pair of a woman and a man survives the same restore untouched', () => {
    const { snap, pair } = parkWithPair();
    restore(JSON.parse(JSON.stringify(snap)) as typeof snap);
    expect(pairs.map((p) => p.id)).toEqual([pair.id]);
    expect(byId(pair.a)?.pairId).toBe(pair.id);
  });

  it('a saved alumni couple of two women is dropped on restore, a woman and a man is kept', () => {
    const { snap } = parkWithPair();
    const old = JSON.parse(JSON.stringify(snap)) as typeof snap;
    old.alumni = [mk(1, 'f', 'f'), mk(2, 'f', 'm')];
    restore(old);
    expect(alumniState().map((x) => x.id)).toEqual([2]);
  });
});

describe('a whole park (register section 4 "Who can pair"; the cheap live sweep, the 200-seed one is the recorded scan in picnic.test.ts)', () => {
  it('seeds 1 to 8, Calm and Lively, one sim day: every Pair formed, a couple\'s included, is one woman and one man', () => {
    let formed = 0, bad = 0;
    for (let seed = 1; seed <= 8; seed++)
      for (const pace of ['calm', 'lively'] as const) {
        clearListeners();
        newPark(seed);
        setSpeed(1);
        applyNow({ side: 'park', kind: 'park.pace', payload: { pace } });
        on('formed', (e) => {
          formed++;
          const a = byId(e.ids?.[0] ?? 0), b = byId(e.ids?.[1] ?? 0);
          if (!a || !b || a.sex === b.sex) bad++;
        });
        for (let s = 0; s < STEPS_PER_DAY; s++) {
          simulate(SIM_DT, 1);
          if (s % 900 === 0) for (const p of pairs) if (sameSex(p)) bad++; // and no one lives in a same-sex Pair at any moment
        }
      }
    expect(formed).toBeGreaterThan(30);
    expect(bad).toBe(0);
  }, 120_000);
});
