// tests/clock.test.ts
// Locks register 3.2 and 02 3.1-3.2: DAYLEN, SEASON_DAYS, the eight bands, the light table, lamps, the start.
import { describe, it, expect } from 'vitest';
import { DAYLEN, SEASON_DAYS, START_ABS, T, phaseOf, lightOf, lampsAt, seasonOf, stepClock, isNewDay } from '../src/core/clock.ts';

const STEPS_PER_DAY = 60 * DAYLEN;

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
    stepClock(0.7 * STEPS_PER_DAY - 1);
    expect(T.day).toBe(1);
    stepClock(0.7 * STEPS_PER_DAY);
    expect(T.day).toBe(2);
    expect(isNewDay()).toBe(true);
    stepClock(0.7 * STEPS_PER_DAY + 1);
    expect(T.day).toBe(2);
    expect(isNewDay()).toBe(false);
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
