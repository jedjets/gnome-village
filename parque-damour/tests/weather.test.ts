// tests/weather.test.ts
// Locks register 3.2 / 02 3.3, 3.5, 2.2 / 06 14 / 03 6.2 / 08 2.1: the eight kinds, the per-season weights, the new-park state, the picks on
// the sim stream, the 2.6 s half-life, the overrides, and the WET layer.
import { describe, it, expect, beforeEach } from 'vitest';
import { genPark } from '../src/world/gen.ts';
import { WET, I } from '../src/world/grid.ts';
import { rngN, simState, seedSim, visState, seedVisual } from '../src/core/rng.ts';
import { syncClock, STEPS_PER_DAY } from '../src/core/clock.ts';
import {
  CAP_OVERRIDES, FIRST_CHANGE, OVERRIDE_TARGETS, WEATHER_KINDS, WEIGHTS, WK, W, addOverride, forceWeather, kindForRoll, overrides,
  removeOverride, stepWeather, stepWet, weatherAt,
} from '../src/core/weather.ts';

const DT = 1 / 60;

/** 40,000 steps of a park built from `seed`: the kind and the rain every 600th step. */
function trace(seed: number): string[] {
  genPark(seed);
  const out: string[] = [];
  for (let i = 0; i < 40000; i++) {
    stepWeather(DT, i + 1);
    if (i % 600 === 0) out.push(W.kind + ':' + W.rain.toFixed(6));
  }
  return out;
}

/** 600 forced picks under the clock's current season: the kinds that came up. */
function picks(): Set<string> {
  const seen = new Set<string>();
  for (let i = 0; i < 600; i++) {
    W.next = 0;
    stepWeather(DT, 1);
    seen.add(W.kind);
  }
  return seen;
}

beforeEach(() => {
  genPark(101);
  syncClock(0);
});

describe('core/weather kinds, targets and weights (02 3.3, 06 14)', () => {
  it('the eight kinds exist with exact ids', () => {
    expect(WEATHER_KINDS).toEqual(['clear', 'fair', 'cloudy', 'breeze', 'rain', 'shower', 'mist', 'snow']);
    expect(Object.keys(WK)).toEqual([...WEATHER_KINDS]);
  });
  it('targets and durations are 02 3.3 exactly', () => {
    expect(WK.rain).toMatchObject({ cloud: 0.92, rain: 0.8, mist: 0.22, wind: 0.5, snow: 0, durMin: 60, durMax: 160 });
    expect(WK.shower).toMatchObject({ cloud: 0.7, rain: 0.5, durMin: 30, durMax: 60 });
    expect(WK.snow).toMatchObject({ cloud: 0.86, snow: 0.8, mist: 0.3, wind: 0.36 });
    expect(WK.breeze.wind).toBe(0.86);
    expect(WK.clear).toMatchObject({ cloud: 0.1, wind: 0.18 });
  });
  it('every season row sums to 100 and snow is winter only', () => {
    expect(WEIGHTS).toHaveLength(4);
    for (const row of WEIGHTS) {
      expect(row).toHaveLength(8);
      expect(row.reduce((a, b) => a + b, 0)).toBe(100);
    }
    for (const s of [0, 1, 2]) expect(WEIGHTS[s]?.[7]).toBe(0);
    expect(WEIGHTS[3]?.[7]).toBe(20);
    expect(WEIGHTS[0]).toEqual([15, 25, 15, 15, 10, 15, 5, 0]);
    expect(WEIGHTS[3]).toEqual([15, 15, 25, 10, 5, 0, 10, 20]);
  });
  it('kindForRoll walks the cumulative weights and never picks a zero weight', () => {
    expect(kindForRoll(0, 0)).toBe('clear');
    expect(kindForRoll(14.99, 0)).toBe('clear');
    expect(kindForRoll(15, 0)).toBe('fair');
    expect(kindForRoll(99.99, 0)).toBe('mist');
    expect(kindForRoll(99.99, 1)).toBe('mist');
    expect(kindForRoll(99.99, 3)).toBe('snow');
    expect(kindForRoll(80, 3)).toBe('snow');
    expect(kindForRoll(79.99, 3)).toBe('mist');
    for (let s = 0; s < 3; s++) for (let u = 0; u < 100; u += 0.5) expect(kindForRoll(u, s)).not.toBe('snow');
    for (let u = 0; u < 100; u += 0.5) expect(kindForRoll(u, 3)).not.toBe('shower');
  });
});

describe('core/weather the machine (03 6.2)', () => {
  it('a new park starts fair with the first change in 40 s', () => {
    expect(W.kind).toBe('fair');
    expect(W.next).toBe(40);
    expect(FIRST_CHANGE).toBe(40);
    W.kind = 'snow';
    W.next = 3;
    genPark(5);
    expect(W.kind).toBe('fair');
    expect(W.next).toBe(40);
    expect(W.rain).toBe(0);
  });
  it('the pick uses the sim stream (kind, then duration: two draws) and leaves the visual stream alone', () => {
    W.next = DT / 2;
    seedSim(9);
    seedVisual(3);
    const vis = visState();
    stepWeather(DT, 1);
    expect(rngN()).toBe(2);
    expect(visState()).toBe(vis);
    const k = WK[W.kind];
    expect(W.next).toBeGreaterThanOrEqual(k.durMin - DT);
    expect(W.next).toBeLessThanOrEqual(k.durMax);
  });
  it('no pick before the countdown ends', () => {
    seedSim(9);
    const s = simState();
    for (let i = 0; i < 39 * 60; i++) stepWeather(DT, i + 1);
    expect(rngN()).toBe(0);
    expect(simState()).toBe(s);
    expect(W.kind).toBe('fair');
    for (let i = 0; i < 2 * 60; i++) stepWeather(DT, i + 1);
    expect(rngN()).toBe(2);
  });
  it('the same seed gives the same weather', () => {
    expect(trace(77)).toEqual(trace(77));
  });
  it('targets ease with a 2.6 s half-life: rain from 0 toward 0.80 reads 0.40 after 2.6 s', () => {
    W.kind = 'rain';
    W.next = 1e9;
    W.rain = 0;
    for (let i = 0; i < 156; i++) stepWeather(DT, i + 1); // 2.6 s
    expect(W.rain).toBeCloseTo(0.4, 2);
    for (let i = 0; i < 156; i++) stepWeather(DT, i + 1);
    expect(W.rain).toBeCloseTo(0.6, 2);
  });
  it('wet chases rain slowly up and very slowly down', () => {
    W.kind = 'rain';
    W.next = 1e9;
    for (let i = 0; i < 20 * 60; i++) stepWeather(DT, i + 1);
    const up = W.wet;
    expect(up).toBeGreaterThan(0.5);
    expect(up).toBeLessThan(W.rain);
    W.kind = 'clear';
    W.rain = 0;
    const w0 = W.wet;
    for (let i = 0; i < 10 * 60; i++) stepWeather(DT, i + 1);
    expect(W.wet).toBeGreaterThan(w0 * 0.9); // 150 s half-life: ten seconds barely moves it
  });
  it('forceWeather (debug.weather) sets the kind with a mean-length run and makes no draw', () => {
    seedSim(1);
    forceWeather('snow');
    expect(W.kind).toBe('snow');
    expect(W.next).toBe(110);
    forceWeather('shower');
    expect(W.next).toBe(45);
    expect(rngN()).toBe(0);
    stepWeather(DT, 1);
    expect(W.kind).toBe('shower'); // not re-picked on the next step
  });
  it('the season of the clock chooses the weights: winter picks snow and never shower, spring never snow', () => {
    syncClock(9 * STEPS_PER_DAY); // day 10: winter
    const winter = picks();
    expect(winter.has('snow')).toBe(true);
    expect(winter.has('shower')).toBe(false);
    syncClock(0);
    const spring = picks();
    expect(spring.has('snow')).toBe(false);
    expect(spring.has('shower')).toBe(true);
    expect(spring.size).toBe(7);
  });
});

describe('core/weather overrides (02 3.5, 06 14.3)', () => {
  it('weatherAt returns the override inside its square and the global weather outside', () => {
    W.rain = 0.1;
    const id = addOverride({ kind: 'raincloud', x: 10, y: 10, r: 2, until: 100, targets: OVERRIDE_TARGETS.raincloud });
    expect(id).toBeGreaterThan(0);
    expect(weatherAt(12, 12).rain).toBe(0.9);
    expect(weatherAt(8, 8).rain).toBe(0.9);
    expect(weatherAt(13, 10).rain).toBe(W.rain);
    expect(weatherAt(10, 13).rain).toBe(W.rain);
    expect(weatherAt(12, 12).kind).toBe('rain');
    expect(weatherAt(12, 12).cloud).toBe(W.cloud); // fields the override does not set stay global
    expect(weatherAt(13, 10).kind).toBe(W.kind);
  });
  it('the three castable overrides carry the targets of 06 14.3 and r 99 is the whole park', () => {
    expect(OVERRIDE_TARGETS.sunbeam).toEqual({ rain: 0, cloud: 0.1, light: 0.15 });
    expect(OVERRIDE_TARGETS.raincloud).toEqual({ rain: 0.9 });
    expect(OVERRIDE_TARGETS.fog).toEqual({ mist: 0.9 });
    addOverride({ kind: 'fog', x: 23, y: 23, r: 99, until: 100, targets: OVERRIDE_TARGETS.fog });
    expect(weatherAt(0, 0).mist).toBe(0.9);
    expect(weatherAt(47, 47).mist).toBe(0.9);
    addOverride({ kind: 'sunbeam', x: 5, y: 5, r: 3, until: 100, targets: OVERRIDE_TARGETS.sunbeam });
    expect(weatherAt(5, 5).light).toBe(0.15);
    expect(weatherAt(5, 5).rain).toBe(0);
    expect(weatherAt(9, 5).light).toBe(0);
  });
  it('at most 16 overrides: the 17th returns 0', () => {
    expect(CAP_OVERRIDES).toBe(16);
    for (let i = 0; i < 16; i++) expect(addOverride({ kind: 'fog', x: i, y: 0, r: 0, until: 9, targets: {} })).toBeGreaterThan(0);
    expect(addOverride({ kind: 'fog', x: 0, y: 0, r: 0, until: 9, targets: {} })).toBe(0);
    expect(overrides()).toHaveLength(16);
  });
  it('an override with until = tick + 60 holds through that tick and is gone at tick + 61', () => {
    W.next = 1e9;
    addOverride({ kind: 'raincloud', x: 1, y: 1, r: 1, until: 160, targets: { rain: 0.9 } });
    stepWeather(DT, 160);
    expect(overrides()).toHaveLength(1);
    stepWeather(DT, 161);
    expect(overrides()).toHaveLength(0);
  });
  it('removeOverride takes one out by id', () => {
    const a = addOverride({ kind: 'fog', x: 1, y: 1, r: 1, until: 9, targets: {} });
    const b = addOverride({ kind: 'fog', x: 2, y: 2, r: 1, until: 9, targets: {} });
    removeOverride(a);
    expect(overrides().map((o) => o.id)).toEqual([b]);
  });
});

describe('core/weather the WET layer (02 2.2)', () => {
  it('rises 0.2 per sim second while rain > 0.3 (clamped at 1) and falls 0.01 per second after', () => {
    const i = I(5, 5);
    W.rain = 0.8;
    for (let n = 0; n < 60; n++) stepWet(DT);
    expect(WET[i]).toBeCloseTo(0.2, 3);
    for (let n = 0; n < 4 * 60 - 1; n++) stepWet(DT);
    expect(WET[i]).toBeLessThan(1); // one step short of 5 s
    stepWet(DT); // 5 s in all (300 steps): the float32 sum 0.9999992 snaps to 1 (WET_SNAP)
    expect(WET[i]).toBe(1);
    W.rain = 0;
    for (let n = 0; n < 10 * 60; n++) stepWet(DT);
    expect(WET[i]).toBeCloseTo(0.9, 3);
    for (let n = 0; n < 200 * 60; n++) stepWet(DT);
    expect(WET[i]).toBe(0);
  });
  it('rain at 0.3 or less does not wet the ground', () => {
    W.rain = 0.3;
    for (let n = 0; n < 120; n++) stepWet(DT);
    expect(WET[I(5, 5)]).toBe(0);
  });
  it('inside a raincloud only its square gets wet, and 5 s of it reads exactly 1', () => {
    W.rain = 0;
    addOverride({ kind: 'raincloud', x: 10, y: 10, r: 2, until: 1e9, targets: { rain: 0.9 } });
    for (let n = 0; n < 60; n++) stepWet(DT);
    expect(WET[I(10, 10)]).toBeCloseTo(0.2, 3);
    expect(WET[I(12, 12)]).toBeCloseTo(0.2, 3);
    expect(WET[I(13, 10)]).toBe(0);
    expect(WET[I(30, 30)]).toBe(0);
    for (let n = 0; n < 4 * 60; n++) stepWet(DT);
    expect(WET[I(10, 10)]).toBe(1);
  });
});
