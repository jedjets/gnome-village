// tests/arrivals.test.ts
// Locks 02 4.2 (the arrivals scheduler: targets by phase, weather and season factors, the 6-14 s gap, gate weights, archetype weights and
// caps, starting needs, leaveAt, the complementary-sex re-roll of GV addVillager 4488-4503), 02 4.3 couple and family, 02 4.5 item 3
// (a due regular replaces a generated single), 02 12.2 ("+": single 60 %), 03 4.4 (the decide cadence and its one MODE branch) and the
// draw order the visitor.ts header documents / 08 2.3 arrivals.test.ts rows that need no running loop / 07 S4.6 step 1.
// Part A drives the scheduler directly (stepArrivals with the clock held); the seeded-day rows (16 +- 3 by f 0.45, the gardener, one
// vendor per kiosk) run in part B once the loop calls it.
import { describe, it, expect, beforeEach } from 'vitest';
import { SIM_DT, newPark, setTick } from '../src/core/loop.ts';
import { STEPS_PER_DAY, T } from '../src/core/clock.ts';
import { mulberry32, rngN, seedSim } from '../src/core/rng.ts';
import { W } from '../src/core/weather.ts';
import { GATES } from '../src/world/park.ts';
import { setMode } from '../src/play/mode.ts';
import { REGULARS } from '../src/entities/names.ts';
import {
  ARCHETYPE_WEIGHTS, ARRIVAL_GAP_MAX, ARRIVAL_GAP_MIN, CALL_SINGLE, NEVER, PHASE_TARGET, SEASON_ARRIVALS, WEATHER_ARRIVALS, arriveGroup,
  arrivalsState, archetypeForRoll, callVisitor, capArchetype, compatible, currentTarget, decideCadence, gateForRoll, needsReroll, people,
  removeVisitor, setAvatarDecide, signatureOf, spawnVisitor, stepArrivals, targetPeople, visitors, type Visitor,
} from '../src/entities/visitor.ts';

const tickAt = (day: number, f: number): number => Math.round((day - 1 + f - 0.3) * STEPS_PER_DAY);

beforeEach(() => {
  newPark(101);
});

describe('targets (02 4.2 item 1; 06 1.3, 14.1, 15)', () => {
  it('by phase: night 3, dawn 6, morning 16, midday 20, afternoon 24, golden 20, dusk 14, evening 9', () => {
    expect(PHASE_TARGET).toEqual({ night: 3, dawn: 6, morning: 16, midday: 20, afternoon: 24, golden: 20, dusk: 14, evening: 9 });
    expect(WEATHER_ARRIVALS).toEqual({ clear: 1.0, fair: 1.0, cloudy: 0.9, breeze: 0.9, rain: 0.5, shower: 0.7, mist: 0.8, snow: 0.6 });
    expect(SEASON_ARRIVALS).toEqual([1.0, 1.1, 1.0, 0.7]);
  });
  it('times the weather and season factors, rounded', () => {
    expect(targetPeople('morning', 'fair', 0)).toBe(16);
    expect(targetPeople('morning', 'rain', 0)).toBe(8);
    expect(targetPeople('afternoon', 'clear', 1)).toBe(26); // 26.4
    expect(targetPeople('midday', 'cloudy', 3)).toBe(13); // 12.6
    expect(targetPeople('afternoon', 'snow', 3)).toBe(10); // 10.08
    expect(targetPeople('night', 'rain', 0)).toBe(2); // 1.5 rounds up
    let most = 0;
    for (const ph of Object.keys(PHASE_TARGET) as Array<keyof typeof PHASE_TARGET>)
      for (const k of Object.keys(WEATHER_ARRIVALS) as Array<keyof typeof WEATHER_ARRIVALS>)
        for (let s = 0; s < 4; s++) most = Math.max(most, targetPeople(ph, k, s));
    expect(most).toBe(26); // the scheduler alone never asks for more than 26; the cap is 30
  });
  it('the current target reads the clock\'s phase and season and the global weather', () => {
    setTick(tickAt(1, 0.5));
    W.kind = 'shower';
    expect(currentTarget()).toBe(14);
    setTick(tickAt(5, 0.65));
    W.kind = 'fair';
    expect([T.phase, T.season, currentTarget()]).toEqual(['afternoon', 1, 26]);
  });
});

describe('the gap and the target (02 4.2 item 2; 08 2.3 "consecutive arrival ticks differ by 360 to 840 steps")', () => {
  it('arrivals come 6 to 14 s apart while below the target, the first at once, and stop at the target', () => {
    expect([ARRIVAL_GAP_MIN, ARRIVAL_GAP_MAX]).toEqual([6, 14]);
    setTick(tickAt(1, 0.5)); // midday: target 20
    W.kind = 'fair';
    const at: number[] = [];
    let n = 0;
    for (let step = 1; step <= 20 * 60 * 30; step++) {
      stepArrivals(SIM_DT);
      if (people() !== n) {
        expect(people()).toBeGreaterThan(n);
        n = people();
        at.push(step);
      }
    }
    expect(at[0]).toBe(1);
    for (let k = 1; k < at.length; k++) {
      const gap = (at[k] as number) - (at[k - 1] as number);
      expect(gap).toBeGreaterThanOrEqual(360);
      expect(gap).toBeLessThanOrEqual(840);
    }
    expect(people()).toBeGreaterThanOrEqual(20);
    expect(people()).toBeLessThanOrEqual(21); // a couple or a family may come at 19
    expect(arrivalsState().arrivalT).toBe(0); // run out: the next comes as soon as there is room
    removeVisitor(visitors[0]?.id ?? 0);
    if (people() < 20) {
      stepArrivals(SIM_DT);
      expect(people()).toBeGreaterThanOrEqual(20);
    }
  });
  it('an arrival draws the gate, then the archetype, then the group, then the gap', () => {
    setTick(tickAt(1, 0.5));
    seedSim(55);
    const n0 = rngN();
    stepArrivals(SIM_DT);
    const g = visitors.length;
    expect(g).toBeGreaterThan(0);
    expect(rngN() - n0).toBeGreaterThanOrEqual(2 + 8 + 1);
    const t = arrivalsState().arrivalT;
    expect(t).toBeGreaterThanOrEqual(6);
    expect(t).toBeLessThan(14);
  });
});

describe('gate and archetype weights, archetype caps (02 2.4, 4.2 items 3-4; 06 5.1)', () => {
  it('gates by 30, 30, 15, 15, 10', () => {
    expect(GATES.map((g) => [g.id, g.weight])).toEqual([['g_south_w', 30], ['g_south_e', 30], ['g_west', 15], ['g_east', 15], ['g_north', 10]]);
    expect([0, 29.99, 30, 59.99, 60, 74.99, 75, 89.99, 90, 99.99].map(gateForRoll)).toEqual([
      'g_south_w', 'g_south_w', 'g_south_e', 'g_south_e', 'g_west', 'g_west', 'g_east', 'g_east', 'g_north', 'g_north',
    ]);
    const r = mulberry32(9);
    const count: Record<string, number> = {};
    for (let k = 0; k < 20000; k++) {
      const g = gateForRoll(r() * 100);
      count[g] = (count[g] ?? 0) + 1;
    }
    for (const g of GATES) expect(Math.abs((count[g.id] ?? 0) / 20000 - g.weight / 100), g.id).toBeLessThan(0.015);
  });
  it('archetypes by single 30, couple 12, family 12, elder 10, tourist 12, jogger 8, artist 4, dog walker 8, busker 4', () => {
    expect(ARCHETYPE_WEIGHTS).toEqual([
      ['single', 30], ['couple', 12], ['family', 12], ['elder', 10], ['tourist', 12], ['jogger', 8], ['artist', 4], ['dogwalker', 8], ['busker', 4],
    ]);
    expect([0, 29.9, 30, 42, 54, 64, 76, 84, 88, 96, 99.9].map(archetypeForRoll)).toEqual([
      'single', 'single', 'couple', 'family', 'elder', 'tourist', 'jogger', 'artist', 'dogwalker', 'busker', 'busker',
    ]);
  });
  it('at most 1 artist, 1 AI busker and 2 dog walkers: a roll that hits a full archetype becomes a single', () => {
    expect(capArchetype('artist')).toBe('artist');
    spawnVisitor('artist', 'g_west');
    expect(capArchetype('artist')).toBe('single');
    spawnVisitor('busker', 'g_west', { spawnedForPlayer: true }); // summoned by c_musician: not an AI busker
    expect(capArchetype('busker')).toBe('busker');
    spawnVisitor('busker', 'g_west');
    expect(capArchetype('busker')).toBe('single');
    spawnVisitor('dogwalker', 'g_west');
    expect(capArchetype('dogwalker')).toBe('dogwalker');
    spawnVisitor('dogwalker', 'g_west');
    expect(capArchetype('dogwalker')).toBe('single');
    expect(capArchetype('elder')).toBe('elder');
  });
});

describe('the visitor record at arrival (02 4.2 items 3, 5-6; 4.5 item 6; 03 3.3)', () => {
  it('appears on the gate\'s outside tile in state arrive, one step from its gate tile, with the starting needs and leaveAt', () => {
    setTick(tickAt(1, 0.5));
    for (const g of GATES) {
      const v = spawnVisitor('single', g.id) as Visitor;
      expect([v.x, v.y]).toEqual([g.outside.x, g.outside.y]);
      expect([v.st, v.gateIn, v.gateOut]).toEqual(['arrive', g.id, null]);
      expect(v.path?.[0]).toEqual(g.tiles[0]);
      expect(v.hunger).toBeGreaterThanOrEqual(0.2);
      expect(v.hunger).toBeLessThan(0.5);
      expect(v.energy).toBeGreaterThanOrEqual(0.5);
      expect(v.energy).toBeLessThan(0.9);
      expect(v.comfort).toBe(0.7);
      expect(v.social).toBeGreaterThanOrEqual(0.2);
      expect(v.social).toBeLessThan(0.6);
      expect(v.leaveAt - v.arrivedAt).toBeGreaterThanOrEqual(0.25);
      expect(v.leaveAt - v.arrivedAt).toBeLessThan(0.5);
      expect(v.arrivedAt).toBe(T.abs);
      expect([v.pairId, v.coupleOf, v.parentOf, v.childOf, v.regularId, v.sitPropId]).toEqual([0, 0, 0, 0, 0, 0]);
      expect(Number.isInteger(v.lookSeed)).toBe(true);
    }
  });
  it('ageWord by archetype; a tourist stays 0.25 day; staff never leave', () => {
    const ages = new Set<string>();
    for (let k = 0; k < 20; k++) ages.add((spawnVisitor('jogger', 'g_west') as Visitor).ageWord);
    expect([...ages].sort()).toEqual(['grown', 'young']);
    expect(spawnVisitor('elder', 'g_west')?.ageWord).toBe('elder');
    expect(spawnVisitor('child', 'g_west')?.ageWord).toBe('young');
    expect(spawnVisitor('family', 'g_west')?.ageWord).toBe('grown');
    const t = spawnVisitor('tourist', 'g_west') as Visitor;
    expect(t.leaveAt - t.arrivedAt).toBeCloseTo(0.25, 12);
    expect(t.items.hat).toBe(true); // the sunhat (04 7.2)
    const g = spawnVisitor('gardener', 'g_west') as Visitor;
    expect([g.name, g.sex, g.ageWord, g.leaveAt]).toEqual(['Gustave', 'm', 'grown', NEVER]);
  });
  it('the draws per person follow the documented order: an elder 8, a single 10 (12 with the re-roll)', () => {
    seedSim(3);
    let n0 = rngN();
    spawnVisitor('elder', 'g_west');
    expect(rngN() - n0).toBe(8); // lookSeed, sex, name, hunger, energy, social, leaveAt, decideT
    n0 = rngN();
    spawnVisitor('single', 'g_west'); // the park holds no single yet: no re-roll
    expect(rngN() - n0).toBe(10); // + seeks, ageWord
  });
  it('a couple: one f and one m, linked, one signature colour, one leaveAt, one gate; a family: parent and child, linked', () => {
    const [f, m] = arriveGroup('couple', 'g_east') as [Visitor, Visitor];
    expect([f.archetype, f.sex, f.seeks, m.archetype, m.sex, m.seeks]).toEqual(['couple', 'f', 'm', 'couple', 'm', 'f']);
    expect([f.coupleOf, m.coupleOf]).toEqual([m.id, f.id]);
    expect(signatureOf(f.lookSeed)).toBe(signatureOf(m.lookSeed));
    expect(f.lookSeed).not.toBe(m.lookSeed);
    expect(f.leaveAt).toBe(m.leaveAt);
    expect([f.ageWord, m.ageWord, f.gateIn, m.gateIn]).toEqual(['grown', 'grown', 'g_east', 'g_east']);
    const [p, c] = arriveGroup('family', 'g_north') as [Visitor, Visitor];
    expect([p.archetype, c.archetype, p.parentOf, c.childOf, c.leaveAt]).toEqual(['family', 'child', c.id, p.id, p.leaveAt]);
    expect([c.items.hat, c.items.purse, c.items.iceCream]).toEqual([false, false, false]);
    removeVisitor(c.id);
    expect(p.parentOf).toBe(0);
  });
  it('a tourist brings a second tourist 40 % of the time', () => {
    let pairs = 0;
    for (let k = 0; k < 400; k++) {
      const g = arriveGroup('tourist', 'g_west');
      if (g.length === 2) pairs++;
      for (const v of g) removeVisitor(v.id);
    }
    expect(pairs / 400).toBeGreaterThan(0.33);
    expect(pairs / 400).toBeLessThan(0.47);
  });
});

describe('the complementary-sex re-roll (02 4.2 item 7; GV addVillager 4488-4503)', () => {
  it('needsReroll: only for a single seeking f or m when unpaired singles are present and none is compatible', () => {
    expect(compatible({ sex: 'f', seeks: 'm' }, { sex: 'm', seeks: 'f' })).toBe(true);
    expect(compatible({ sex: 'f', seeks: 'm' }, { sex: 'm', seeks: 'm' })).toBe(false);
    expect(compatible({ sex: 'f', seeks: 'any' }, { sex: 'f', seeks: 'any' })).toBe(true);
    expect(needsReroll('f', 'm')).toBe(false); // an empty park: no roll could help
    const theo = spawnVisitor('single', 'g_west', { regular: REGULARS[4] }) as Visitor; // m seeks f
    expect(needsReroll('f', 'm')).toBe(false);
    expect(needsReroll('f', 'f')).toBe(true);
    expect(needsReroll('m', 'f')).toBe(true);
    expect(needsReroll('m', 'any')).toBe(false);
    theo.pairId = 7; // a paired single is no candidate
    expect(needsReroll('m', 'f')).toBe(false);
  });
  it('with one waiting single (m seeking f) about 46 % of new singles suit him, not the 27.5 % of a plain roll', () => {
    spawnVisitor('single', 'g_west', { regular: REGULARS[4] });
    let suit = 0, rerolls = 0;
    for (let k = 0; k < 600; k++) {
      const n0 = rngN();
      const v = spawnVisitor('single', 'g_south_w') as Visitor;
      if (rngN() - n0 === 12) rerolls++;
      if (v.sex === 'f' && v.seeks !== 'f') suit++;
      removeVisitor(v.id);
    }
    expect(suit / 600).toBeGreaterThan(0.4); // 0.275 + 0.675 x 0.275 = 0.46
    expect(suit / 600).toBeLessThan(0.53);
    expect(rerolls / 600).toBeGreaterThan(0.6); // 0.675
    expect(rerolls / 600).toBeLessThan(0.75);
  });
});

describe('the "+" call and the regulars (02 12.2; 4.5 item 3)', () => {
  it('callVisitor brings one arrival now, a single about 72 % of the time (60 % plus 40 % x 30), through the given gate', () => {
    expect(CALL_SINGLE).toBe(0.6);
    setTick(tickAt(1, 0.1)); // night: the regulars are not due yet, and the target is 3
    let singles = 0;
    for (let k = 0; k < 500; k++) {
      expect(callVisitor('g_east')).toEqual({ ok: true });
      const first = visitors[0] as Visitor;
      expect(first.gateIn).toBe('g_east');
      if (first.archetype === 'single') singles++;
      while (visitors.length) removeVisitor((visitors[0] as Visitor).id);
    }
    expect(singles / 500).toBeGreaterThan(0.66);
    expect(singles / 500).toBeLessThan(0.78);
  });
  it('a due regular takes the place of the next generated single, three a day at most', () => {
    setTick(tickAt(1, 0.5)); // Juliette's first visit is at f 0.60: not yet
    expect(arriveGroup('single', 'g_north')[0]?.name).toBe('Amélie');
    expect(arriveGroup('single', 'g_north')[0]?.name).toBe('Théo');
    expect(REGULARS.map((r) => r.name)).not.toContain(arriveGroup('single', 'g_north')[0]?.name);
    newPark(101);
    setTick(tickAt(1, 0.65));
    const names = [0, 1, 2, 3].map(() => arriveGroup('single', 'g_north')[0]?.name);
    expect(names.slice(0, 3)).toEqual(['Amélie', 'Théo', 'Juliette']);
    expect(REGULARS.map((r) => r.name)).not.toContain(names[3]);
    expect(visitors.slice(0, 3).map((v) => v.regularId)).toEqual([1, 5, 2]);
    expect(arriveGroup('elder', 'g_north')[0]?.regularId).toBe(0); // only a single is replaced
  });
});

describe('the decide cadence and its one MODE branch (03 4.4; GV 5696)', () => {
  it('decideT is drawn again in [0.5, 1.3] s; a busy visitor does not decide; the possessed actor in avatar mode runs avatarDecide', () => {
    const v = spawnVisitor('single', 'g_west') as Visitor;
    const o = spawnVisitor('single', 'g_west') as Visitor;
    const calls: string[] = [];
    const decide = (x: Visitor): void => void calls.push('decide ' + x.id);
    setAvatarDecide((x) => void calls.push('avatar ' + x.id));
    const busy = { eat: true } as const;
    for (let k = 0; k < 1000; k++) {
      v.decideT = 0;
      decideCadence(v, SIM_DT, decide, busy);
      expect(v.decideT).toBeGreaterThanOrEqual(0.5);
      expect(v.decideT).toBeLessThan(1.3);
    }
    expect(calls).toHaveLength(1000);
    calls.length = 0;
    v.st = 'eat';
    v.decideT = 0;
    decideCadence(v, SIM_DT, decide, busy);
    expect(calls).toEqual([]);
    v.st = 'idle';
    setMode('avatar', 'a_matchmaker', v.id);
    v.decideT = 0;
    o.decideT = 0;
    decideCadence(v, SIM_DT, decide, busy);
    decideCadence(o, SIM_DT, decide, busy);
    expect(calls).toEqual(['avatar ' + v.id, 'decide ' + o.id]);
    setMode('creator');
    setAvatarDecide(() => {});
  });
});
