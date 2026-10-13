// tests/needs.test.ts
// Locks 02 4.4 and 06 7 (the four needs, their rates per sim day, the comfort target) / 08 2.3 needs.test.ts rows / 07 S4.6 step 5.
// GV 5552-5581 is the shape (per-day rates, the eased warmth at 5579).
import { describe, it, expect, beforeEach } from 'vitest';
import { SIM_DT, newPark, setTick } from '../src/core/loop.ts';
import { STEPS_PER_DAY, T } from '../src/core/clock.ts';
import { OVERRIDE_TARGETS, W, addOverride, type WeatherKind } from '../src/core/weather.ts';
import { props } from '../src/world/grid.ts';
import { spawnVisitor, type Visitor } from '../src/entities/visitor.ts';
import { COMFORT_EASE, ENERGY_AWAKE_DAY, ENERGY_BENCH_DAY, HUNGER_DAY, SOCIAL_DAY, comfortTarget, stepNeeds } from '../src/entities/needs.ts';

/** The tick of day `day` at day fraction `f` (a new park starts at f 0.30 of day 1). */
const tickAt = (day: number, f: number): number => Math.round((day - 1 + f - 0.3) * STEPS_PER_DAY);

/** Global weather of `kind` with the given amounts and nothing else. */
function weather(kind: WeatherKind, o: { rain?: number; snow?: number; mist?: number } = {}): void {
  W.kind = kind;
  W.rain = o.rain ?? 0;
  W.snow = o.snow ?? 0;
  W.mist = o.mist ?? 0;
}

let v: Visitor;
beforeEach(() => {
  newPark(101);
  setTick(tickAt(1, 0.5)); // spring day 1, midday
  weather('fair');
  v = spawnVisitor('single', 'g_north') as Visitor;
  v.x = 5;
  v.y = 5; // open lawn, more than 3 tiles from every lamp
  v.st = 'idle';
  v.path = null;
});

const day = (fn: () => void): void => {
  for (let k = 0; k < STEPS_PER_DAY; k++) fn();
};

describe('need rates per sim day (02 4.4, 06 7; 08 2.3)', () => {
  it('hunger rises 0.5 a day', () => {
    expect(HUNGER_DAY).toBe(0.5);
    v.hunger = 0.2;
    day(() => stepNeeds(v, SIM_DT));
    expect(v.hunger).toBeCloseTo(0.7, 3);
  });
  it('energy falls 0.6 a day awake and rises 0.4 a day on a bench, clamped to 1', () => {
    expect([ENERGY_AWAKE_DAY, ENERGY_BENCH_DAY]).toEqual([0.6, 0.4]);
    v.energy = 0.9;
    day(() => stepNeeds(v, SIM_DT));
    expect(v.energy).toBeCloseTo(0.3, 3);
    const bench = props.find((p) => p.kind === 'bench');
    v.sitPropId = bench?.id ?? 0;
    day(() => stepNeeds(v, SIM_DT));
    expect(v.energy).toBeCloseTo(0.7, 3);
    day(() => stepNeeds(v, SIM_DT));
    expect(v.energy).toBe(1);
  });
  it('social rises 0.3 a day for an unpaired single, stays put while paired, and only singles have it', () => {
    expect(SOCIAL_DAY).toBe(0.3);
    v.social = 0.2;
    day(() => stepNeeds(v, SIM_DT));
    expect(v.social).toBeCloseTo(0.5, 3);
    v.pairId = 1;
    v.social = 0;
    day(() => stepNeeds(v, SIM_DT));
    expect(v.social).toBe(0);
    const e = spawnVisitor('elder', 'g_north') as Visitor;
    const s0 = e.social;
    for (let k = 0; k < 600; k++) stepNeeds(e, SIM_DT);
    expect(e.social).toBe(s0);
  });
  it('comfort eases toward the target at 0.2 a second: 0.2 to a target of 0.7 reads 0.29 after 1 s (GV 5579)', () => {
    expect(COMFORT_EASE).toBe(0.2);
    expect(comfortTarget(v)).toBeCloseTo(0.7, 10);
    v.comfort = 0.2;
    for (let k = 0; k < 60; k++) stepNeeds(v, SIM_DT);
    expect(v.comfort).toBeCloseTo(0.7 - 0.5 * Math.pow(1 - 0.2 / 60, 60), 6);
    expect(v.comfort).toBeCloseTo(0.29, 2);
  });
});

describe('the comfort target (02 4.4 formula, 3.3 weather term, 3.4 season term, 3.5 sunbeam; 06 7)', () => {
  it('a fair day with no mist and no lamp: 0.70; clear adds its +0.05 weather term: 0.75', () => {
    expect(comfortTarget(v)).toBeCloseTo(0.7, 10);
    weather('clear');
    expect(comfortTarget(v)).toBeCloseTo(0.75, 10);
    weather('cloudy');
    expect(comfortTarget(v)).toBeCloseTo(0.65, 10);
  });
  it('rain 0.8: 0.42; mist 0.78: 0.622; snow 0.8 in winter: clamped toward 0', () => {
    weather('rain', { rain: 0.8 });
    expect(comfortTarget(v)).toBeCloseTo(0.42, 10);
    weather('mist', { mist: 0.78 });
    expect(comfortTarget(v)).toBeCloseTo(0.622, 10);
    setTick(tickAt(10, 0.5)); // winter, midday
    expect(T.season).toBe(3);
    weather('snow', { snow: 0.8 });
    expect(comfortTarget(v)).toBeCloseTo(0.7 - 0.3 * 0.8 - 0.15 - 0.3, 10);
    setTick(tickAt(10, 0.1)); // winter night, no lamp near
    expect(comfortTarget(v)).toBe(0);
  });
  it('at night: -0.15 without a lamp within 3 tiles (0.55), +0.15 with one (0.85)', () => {
    setTick(tickAt(2, 0.1));
    expect(T.lamps).toBe(true);
    expect(comfortTarget(v)).toBeCloseTo(0.55, 10);
    v.x = 24;
    v.y = 14; // 2 tiles from the lamp at (24, 16), 3 from (24, 11)
    expect(comfortTarget(v)).toBeCloseTo(0.85, 10);
    v.x = 20;
    v.y = 20; // 4 from (24, 16): none within 3
    expect(comfortTarget(v)).toBeCloseTo(0.55, 10);
    setTick(tickAt(2, 0.5));
    v.x = 24;
    v.y = 14;
    expect(comfortTarget(v)).toBeCloseTo(0.7, 10); // by day the lamps count for nothing
  });
  it('inside a sunbeam: +0.10; the summer midday -0.05; winter -0.15', () => {
    addOverride({ kind: 'sunbeam', x: 6, y: 6, r: 3, until: 1e9, targets: OVERRIDE_TARGETS.sunbeam });
    expect(comfortTarget(v)).toBeCloseTo(0.8, 10);
    v.x = 10; // 4 from the beam's centre: outside its 7 x 7 square
    expect(comfortTarget(v)).toBeCloseTo(0.7, 10);
    setTick(tickAt(4, 0.5)); // summer midday
    expect([T.season, T.phase]).toEqual([1, 'midday']);
    expect(comfortTarget(v)).toBeCloseTo(0.65, 10);
    setTick(tickAt(4, 0.65)); // summer afternoon
    expect(comfortTarget(v)).toBeCloseTo(0.7, 10);
    setTick(tickAt(11, 0.65)); // winter afternoon
    expect(comfortTarget(v)).toBeCloseTo(0.55, 10);
  });
  it('rain lowers nothing in a SHELTERED state: sheltering, or eating at a kiosk (not a bench snack)', () => {
    weather('rain', { rain: 0.8 });
    v.st = 'shelter';
    expect(comfortTarget(v)).toBeCloseTo(0.7, 10);
    v.st = 'eat';
    v.job = { propId: props.find((p) => p.kind === 'kiosk')?.id ?? 0 };
    expect(comfortTarget(v)).toBeCloseTo(0.7, 10);
    v.job = { propId: props.find((p) => p.kind === 'bench')?.id ?? 0 };
    expect(comfortTarget(v)).toBeCloseTo(0.42, 10);
  });
});
