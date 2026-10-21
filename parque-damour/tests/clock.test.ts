// tests/clock.test.ts
// Locks register 3.2 and 02 3.1-3.2: DAYLEN, SEASON_DAYS, the eight bands, the light table, lamps, the start.
import { describe, it, expect, beforeEach } from 'vitest';
import { DAYLEN, SEASON_DAYS, START_ABS, STEPS_PER_DAY, T, phaseOf, lightOf, lampsAt, seasonOf, stepClock, syncClock, isNewDay } from '../src/core/clock.ts';
import { clearListeners, on, type GameEvent } from '../src/core/events.ts';


describe('core/clock constants (register 3.2)', () => {
  it('DAYLEN 360, SEASON_DAYS 3, start at f 0.30', () => {
    expect(DAYLEN).toBe(360);
    expect(SEASON_DAYS).toBe(3);
    expect(START_ABS).toBe(0.3);
  });
});

describe('phaseOf: the eight bands of register 3.2', () => {
  const cases: Array<[number, string]> = [
    [0, 'night'], [0.19, 'night'], [0.2, 'dawn'], [0.279, 'dawn'], [0.28, 'morning'], [0.3, 'morning'],
    [0.449, 'morning'], [0.45, 'midday'], [0.58, 'afternoon'], [0.72, 'golden'], [0.79, 'golden'],
    [0.8, 'dusk'], [0.869, 'dusk'], [0.87, 'evening'], [0.999, 'evening'],
  ];
  for (const [f, phase] of cases) it(`f ${f} is ${phase}`, () => expect(phaseOf(f)).toBe(phase));
});

const near = (f: number, v: number): void => expect(lightOf(f)).toBeCloseTo(v, 6);

describe('lightOf: the piecewise-linear table of 02 3.2', () => {
  it('night is flat 0.06', () => {
    near(0, 0.06);
    near(0.1, 0.06);
  });
  it('dawn climbs 0.06 to 0.75', () => {
    near(0.2, 0.06);
    near(0.24, 0.405);
  });
  it('morning reaches 1.00 at midday', () => {
    near(0.28, 0.75);
    near(0.45, 1.0);
    near(0.5, 1.0);
  });
  it('golden hour falls 0.88 to 0.62, dusk to 0.22, evening to 0.06', () => {
    near(0.72, 0.88);
    near(0.76, 0.75);
    near(0.8, 0.62);
    near(0.835, 0.42);
    near(0.87, 0.22);
    near(0.999, 0.06 + (0.22 - 0.06) * (1 - 0.999) / 0.13);
  });
});

describe('lamps and seasons', () => {
  it('lamps are lit from dusk to dawn: f >= 0.80 or f < 0.28', () => {
    expect(lampsAt(0.8)).toBe(true);
    expect(lampsAt(0.799)).toBe(false);
    expect(lampsAt(0.279)).toBe(true);
    expect(lampsAt(0.28)).toBe(false);
  });
  it('season is floor((day - 1) / 3) mod 4', () => {
    expect(seasonOf(1)).toBe(0);
    expect(seasonOf(3)).toBe(0);
    expect(seasonOf(4)).toBe(1);
    expect(seasonOf(12)).toBe(3);
    expect(seasonOf(13)).toBe(0);
  });
});

describe('stepClock from the integer tick (03 6.1)', () => {
  it('tick 0 is spring day 1, morning, f 0.30', () => {
    stepClock(0);
    expect(T.abs).toBeCloseTo(0.3, 9);
    expect(T.day).toBe(1);
    expect(T.season).toBe(0);
    expect(T.phase).toBe('morning');
    expect(T.lamps).toBe(false);
    expect(isNewDay()).toBe(false);
  });
  it('a day is 21600 steps; the day changes once and isNewDay fires on that step only', () => {
    stepClock(15119); // (1 - 0.30) * 21600 - 1: the last step of day 1
    expect(T.day).toBe(1);
    stepClock(15120);
    expect(T.day).toBe(2);
    expect(isNewDay()).toBe(true);
    stepClock(15121);
    expect(T.day).toBe(2);
    expect(isNewDay()).toBe(false);
    stepClock(15120 + STEPS_PER_DAY - 1);
    expect(T.day).toBe(2);
    stepClock(15120 + STEPS_PER_DAY);
    expect(T.day).toBe(3);
  });
  it('three days on is summer; twelve days on wraps to spring', () => {
    stepClock(3 * STEPS_PER_DAY);
    expect(T.day).toBe(4);
    expect(T.season).toBe(1);
    stepClock(12 * STEPS_PER_DAY);
    expect(T.day).toBe(13);
    expect(T.season).toBe(0);
    expect(T.f).toBeCloseTo(0.3, 9);
  });
});

describe('newday and season events (03 6.1 item 2; 08 2.1)', () => {
  const seen: GameEvent[] = [];
  beforeEach(() => {
    clearListeners();
    seen.length = 0;
    on('newday', (e) => seen.push(e));
    on('season', (e) => seen.push(e));
    syncClock(0);
  });

  it('STEPS_PER_DAY is 60 * DAYLEN', () => {
    expect(STEPS_PER_DAY).toBe(21600);
  });
  it('the day turns where abs crosses a whole number: step 15,120 (0.7 of a day after the 0.30 start), not 21,600', () => {
    syncClock(15119);
    stepClock(15120);
    expect(seen.map((e) => e.kind)).toEqual(['newday']);
    expect(seen[0]?.params).toEqual({ day: 2 });
    expect(isNewDay()).toBe(true);
    stepClock(15121);
    expect(seen).toHaveLength(1);
    expect(isNewDay()).toBe(false);
  });
  it('day 3 to day 4 emits one newday and one season (summer), in that order', () => {
    const turn = 58320; // (3 - 0.30) * 21600: the first step of day 4
    syncClock(turn - 1);
    expect(T.day).toBe(3);
    stepClock(turn);
    expect(T.day).toBe(4);
    expect(seen.map((e) => e.kind)).toEqual(['newday', 'season']);
    expect(seen[1]?.params).toEqual({ season: 'summer' });
  });
  it('a day inside a season emits no season event; every day emits one newday over a year', () => {
    for (let t = 1; t <= 12 * STEPS_PER_DAY; t += 60) stepClock(t); // every 60th step is enough to see each change
    expect(seen.filter((e) => e.kind === 'newday')).toHaveLength(12);
    expect(seen.filter((e) => e.kind === 'season').map((e) => e.params?.season)).toEqual(['summer', 'autumn', 'winter', 'spring']);
  });
  it('lampsLit fires once, on the step where f reaches 0.80 (tick 10,800), and not when the lamps go out at 0.28', () => {
    const lit: GameEvent[] = [];
    on('lampsLit', (e) => lit.push(e));
    syncClock(10799);
    expect(T.lamps).toBe(false);
    stepClock(10800);
    expect(T.lamps).toBe(true);
    expect(lit.map((e) => e.tick)).toEqual([10800]);
    stepClock(10801);
    for (let t = 10860; t <= 10800 + STEPS_PER_DAY; t += 60) stepClock(t); // through the night, the morning switch-off and the next dusk
    expect(lit.map((e) => e.tick)).toEqual([10800, 10800 + STEPS_PER_DAY]);
  });
  it('syncClock sets T without emitting (a new park, a restore)', () => {
    syncClock(3 * STEPS_PER_DAY);
    expect(T.day).toBe(4);
    expect(T.season).toBe(1);
    expect(seen).toHaveLength(0);
    expect(isNewDay()).toBe(false);
    syncClock(0);
    expect(T.day).toBe(1);
    expect(T.f).toBeCloseTo(0.3, 9);
  });
});
