// tests/names.test.ts
// Locks 02 4.5 items 2-5 and 06 6 (names, the eight regulars, reservation, returns, memory) / 08 2.3 names.test.ts rows / 07 S4.8.
// GV 1365 freshName is the idea: one sim draw per name, no duplicate while a name is free (09 4 row 23).
import { describe, it, expect, beforeEach } from 'vitest';
import { newPark } from '../src/core/loop.ts';
import { rngN, seedSim } from '../src/core/rng.ts';
import {
  CAP_REGULARS_DAY, FIRST_VISIT, GARDENER_NAME, NAMES_F, NAMES_M, REGULARS, namesHeld, regularArrived, regularDue, regularLeft,
  regularsState, rememberPair, releaseName, resetNames, stepRegularReturns, takeName,
} from '../src/entities/names.ts';
import { people, removeVisitor, spawnVisitor, visitors } from '../src/entities/visitor.ts';

beforeEach(() => {
  newPark(101);
  resetNames();
});

describe('the eight regulars (02 4.5 item 2, 06 6.2)', () => {
  it('names, sex and seeks are exact and in order', () => {
    expect(REGULARS.map((r) => [r.regularId, r.name, r.sex, r.seeks])).toEqual([
      [1, 'Amélie', 'f', 'm'],
      [2, 'Juliette', 'f', 'm'],
      [3, 'Colette', 'f', 'any'],
      [4, 'Margot', 'f', 'm'],
      [5, 'Théo', 'm', 'f'],
      [6, 'Lucien', 'm', 'f'],
      [7, 'Baptiste', 'm', 'any'],
      [8, 'Rémi', 'm', 'f'],
    ]);
    expect(REGULARS.map((r) => r.ageWord)).toEqual(['young', 'young', 'grown', 'young', 'young', 'grown', 'young', 'grown']);
  });
  it('a regular arrives with their own name, sex, seeks and ageWord, as a single', () => {
    const theo = REGULARS[4];
    const v = spawnVisitor('single', 'g_north', { regular: theo });
    expect([v?.name, v?.sex, v?.seeks, v?.ageWord, v?.archetype, v?.regularId]).toEqual(['Théo', 'm', 'f', 'young', 'single', 5]);
    expect(namesHeld()).toEqual([]); // a regular's name is never taken from the lists
  });
});

describe('generated names (02 4.5 item 5, 06 6.1)', () => {
  it('40 French names per sex, no repeats, none a regular\'s or a fixed actor\'s', () => {
    expect(NAMES_F).toHaveLength(40);
    expect(NAMES_M).toHaveLength(40);
    const all = [...NAMES_F, ...NAMES_M];
    expect(new Set(all).size).toBe(80);
    for (const n of [...REGULARS.map((r) => r.name), GARDENER_NAME, 'Marguerite', 'Violette', 'Pierrot', 'Pompon']) expect(all).not.toContain(n);
    expect(NAMES_F[0]).toBe('Adèle');
    expect(NAMES_M[39]).toBe('Victor');
  });
  it('takeName costs exactly one sim draw (GV 1365)', () => {
    seedSim(7);
    const n0 = rngN();
    takeName('f');
    takeName('m');
    expect(rngN() - n0).toBe(2);
  });
  it('40 takes give 40 distinct names; the 41st reuses only a released name', () => {
    const got = Array.from({ length: 40 }, () => takeName('f'));
    expect(new Set(got).size).toBe(40);
    expect([...got].sort()).toEqual([...NAMES_F].sort());
    releaseName('Manon');
    expect(takeName('f')).toBe('Manon');
    // every name held: the list is reused from the start (06 6.1; impossible under the cap of 30)
    expect(takeName('f')).toBe('Adèle');
    expect(takeName('f')).toBe('Agathe');
  });
  it('no duplicate active names among 30 visitors, and a name comes back free when its holder leaves', () => {
    for (let k = 0; k < 40 && people() < 30; k++) spawnVisitor('single', 'g_south_w');
    expect(people()).toBe(30);
    const names = visitors.map((v) => v.name);
    expect(new Set(names).size).toBe(30);
    expect(namesHeld().sort()).toEqual([...names].sort());
  });
});

describe('regular returns (02 4.5 item 3, 06 1.8)', () => {
  it('the first visits follow the fixed table, three a day, sexes interleaved', () => {
    expect(FIRST_VISIT).toEqual([1, 5, 2, 6, 3, 7, 4, 8]);
    const due = regularsState().map((r) => [r.regularId, r.nextVisitDay, Math.round(r.arriveF * 100) / 100]);
    expect(due).toEqual([
      [1, 1, 0.3], [2, 1, 0.6], [3, 2, 0.45], [4, 3, 0.3], [5, 1, 0.45], [6, 2, 0.3], [7, 2, 0.6], [8, 3, 0.45],
    ]);
    expect(regularDue(1, 0.29)).toBeNull();
    expect(regularDue(1, 0.3)?.name).toBe('Amélie');
  });
  it('at most 3 regulars arrive per day; the earliest due comes first', () => {
    let id = 100;
    const day1: string[] = [];
    for (let k = 0; k < 6; k++) {
      const r = regularDue(1, 0.9);
      if (!r) break;
      day1.push(r.name);
      regularArrived(r.regularId, ++id, 1);
    }
    expect(day1).toEqual(['Amélie', 'Théo', 'Juliette']);
    expect(CAP_REGULARS_DAY).toBe(3);
    expect(regularDue(1, 0.9)).toBeNull();
    // a missed day carries over: on day 3 the day-2 regulars are due before the day-3 ones
    expect(regularDue(3, 0.3)?.name).toBe('Lucien');
  });
  it('a regular who leaves on day 1 returns on day 2 or 3 at an f in [0.30, 0.65], with two draws', () => {
    const days = new Set<number>();
    for (let s = 1; s <= 200; s++) {
      resetNames();
      seedSim(s);
      regularArrived(1, 50, 1);
      const n0 = rngN();
      regularLeft(1, 1);
      expect(rngN() - n0).toBe(2);
      const r = regularsState()[0];
      days.add(r?.nextVisitDay ?? 0);
      expect(r?.arriveF).toBeGreaterThanOrEqual(0.3);
      expect(r?.arriveF).toBeLessThan(0.65);
      expect(r?.visitorId).toBe(0);
    }
    expect([...days].sort()).toEqual([2, 3]);
  });
  it('a regular visitor who is removed schedules the return (visitor.ts removeVisitor)', () => {
    const v = spawnVisitor('single', 'g_west', { regular: REGULARS[0] });
    regularArrived(1, v?.id ?? 0, 1);
    expect(regularsState()[0]?.visitorId).toBe(v?.id);
    removeVisitor(v?.id ?? 0);
    expect(regularsState()[0]?.visitorId).toBe(0);
    expect([2, 3]).toContain(regularsState()[0]?.nextVisitDay);
  });
});

describe('regular memory (02 4.5 item 4, 6.3: -0.1 affinity a day apart)', () => {
  it('a remembered pair loses 0.1 a day while apart and nothing while both are in the park, floored at 0', () => {
    rememberPair(1, { partnerId: 5, affinity: 0.62, stage: 3, lastDay: 1 });
    rememberPair(5, { partnerId: 1, affinity: 0.62, stage: 3, lastDay: 1 });
    stepRegularReturns();
    expect(regularsState()[0]?.memory.affinity).toBeCloseTo(0.52, 10);
    expect(regularsState()[4]?.memory.affinity).toBeCloseTo(0.52, 10);
    regularArrived(1, 10, 2);
    regularArrived(5, 11, 2);
    stepRegularReturns();
    expect(regularsState()[0]?.memory.affinity).toBeCloseTo(0.52, 10);
    regularLeft(5, 2);
    for (let d = 0; d < 8; d++) stepRegularReturns();
    expect(regularsState()[0]?.memory.affinity).toBe(0);
    expect(regularsState()[1]?.memory.affinity).toBe(0); // no partner, untouched
  });
});
