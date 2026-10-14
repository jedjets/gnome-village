// src/core/weather.ts
// Global weather state machine (kinds clear, fair, cloudy, breeze, rain, shower, mist, snow), the castable overrides, and the per-tile WET pass.
// Ported from GV 829-881 (WK, W, updateWeather). ADAPT: the register's eight kinds (GV has storm and no shower); the per-season weight table and
// the durations of 02 3.3 / 06 14 instead of GV's uniform pick lists (848-851); no storm front, spate, tookBridge, flash or rumble (839-865);
// first change at 40 s (845); picks on the sim stream (852); `wet` chases rain with half-lives 4 s up and 150 s down (879-880).
// Dropped from the range: 839-845 (STORM_LEAD, front, stormT), 857-865 (the storm branch and spate).
// WET sits in this file because 07 S2.6 item 5 and 03 3.2 put it here, so this core file imports world/grid.ts for the WET layer, one of
// the two named exceptions of 03 2.1 (L0 row); everything else here is core-only. Overrides are data: S9 draws them, S10 casts them.
import { clamp01 } from './math.ts';
import { rnd, rng } from './rng.ts';
import { T } from './clock.ts';
import { nextEffectId, type EffectId } from './ids.ts';
import { N, NC, WET } from '../world/grid.ts';

export type WeatherKind = 'clear' | 'fair' | 'cloudy' | 'breeze' | 'rain' | 'shower' | 'mist' | 'snow';
export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'fair', 'cloudy', 'breeze', 'rain', 'shower', 'mist', 'snow'];

type Target = { cloud: number; rain: number; mist: number; snow: number; wind: number; durMin: number; durMax: number };

/** Targets and durations in sim seconds, copied from 02 3.3 / 06 14.1. */
export const WK: Readonly<Record<WeatherKind, Target>> = {
  clear: { cloud: 0.1, rain: 0, mist: 0, snow: 0, wind: 0.18, durMin: 60, durMax: 160 },
  fair: { cloud: 0.34, rain: 0, mist: 0.04, snow: 0, wind: 0.3, durMin: 60, durMax: 160 },
  cloudy: { cloud: 0.74, rain: 0, mist: 0.1, snow: 0, wind: 0.42, durMin: 60, durMax: 160 },
  breeze: { cloud: 0.28, rain: 0, mist: 0.02, snow: 0, wind: 0.86, durMin: 60, durMax: 160 },
  rain: { cloud: 0.92, rain: 0.8, mist: 0.22, snow: 0, wind: 0.5, durMin: 60, durMax: 160 },
  shower: { cloud: 0.7, rain: 0.5, mist: 0.1, snow: 0, wind: 0.4, durMin: 30, durMax: 60 },
  mist: { cloud: 0.5, rain: 0, mist: 0.78, snow: 0, wind: 0.1, durMin: 60, durMax: 160 },
  snow: { cloud: 0.86, rain: 0, mist: 0.3, snow: 0.8, wind: 0.36, durMin: 60, durMax: 160 },
};

/** Percent weights per season, in the order of WEATHER_KINDS (02 3.3 / 06 14.2); each row sums to 100 and snow is winter only. */
export const WEIGHTS: readonly (readonly number[])[] = [
  [15, 25, 15, 15, 10, 15, 5, 0], // spring
  [35, 30, 10, 10, 3, 10, 2, 0], // summer
  [10, 20, 25, 20, 12, 8, 5, 0], // autumn
  [15, 15, 25, 10, 5, 0, 10, 20], // winter
];

export const FIRST_CHANGE = 40; // sim seconds after a new park (GV 845)
export const CAP_OVERRIDES = 16; // 03 3.11
export const WET_RISE = 0.2; // per sim second while rain > WET_RAIN_MIN (02 2.2)
export const WET_FALL = 0.01;
export const WET_RAIN_MIN = 0.3;
/** A rise that lands within this of 1 is 1: a float32 sum of 300 steps of 0.2/60 stops at 0.9999992, and 5 s of rain must read exactly 1. */
export const WET_SNAP = 1e-6;

export const W: {
  kind: WeatherKind;
  next: number;
  cloud: number;
  rain: number;
  mist: number;
  snow: number;
  wind: number;
  windP: number;
  drift: number;
  wet: number;
} = { kind: 'fair', next: FIRST_CHANGE, cloud: 0.34, rain: 0, mist: 0.04, snow: 0, wind: 0.3, windP: 0, drift: 0, wet: 0 };

/* ---------- overrides (02 3.5, 06 14.3) ---------- */

export type OverrideKind = 'sunbeam' | 'raincloud' | 'fog';
export type OverrideTargets = { cloud?: number; rain?: number; mist?: number; snow?: number; wind?: number; light?: number };
/** `until` is the last tick on which the override still holds: it is gone at until + 1. */
export type Override = { id: EffectId; kind: OverrideKind; x: number; y: number; r: number; until: number; targets: OverrideTargets };

/** The targets each ability's override carries (06 14.3); `light` is an addition to the day's light. */
export const OVERRIDE_TARGETS: Readonly<Record<OverrideKind, OverrideTargets>> = {
  sunbeam: { rain: 0, cloud: 0.1, light: 0.15 },
  raincloud: { rain: 0.9 },
  fog: { mist: 0.9 },
};
const OVERRIDE_AS: Readonly<Record<OverrideKind, WeatherKind>> = { sunbeam: 'clear', raincloud: 'rain', fog: 'mist' };

let list: Override[] = [];

/** Add an override; returns its id, or 0 when 16 are already active (03 3.11). */
export function addOverride(o: Omit<Override, 'id'>): EffectId {
  if (list.length >= CAP_OVERRIDES) return 0;
  const id = nextEffectId();
  list.push({ id, kind: o.kind, x: o.x, y: o.y, r: o.r, until: o.until, targets: { ...o.targets } });
  return id;
}
export function removeOverride(id: EffectId): void {
  list = list.filter((o) => o.id !== id);
}
export function overrides(): readonly Override[] {
  return list;
}
export function overridesState(): Override[] {
  return JSON.parse(JSON.stringify(list)) as Override[];
}
export function setOverridesState(s: readonly Override[]): void {
  list = JSON.parse(JSON.stringify(s)) as Override[];
}

function inside(o: Override, x: number, y: number): boolean {
  return Math.abs(x - o.x) <= o.r && Math.abs(y - o.y) <= o.r;
}

/** The weather at a tile: the override's targets inside its square (r 99 is the whole park), else the global values. */
export function weatherAt(x: number, y: number): Readonly<{ kind: WeatherKind; cloud: number; rain: number; mist: number; snow: number; wind: number; light: number }> {
  const w = { kind: W.kind, cloud: W.cloud, rain: W.rain, mist: W.mist, snow: W.snow, wind: W.wind, light: 0 };
  for (const o of list) {
    if (!inside(o, x, y)) continue;
    const t = o.targets;
    w.kind = OVERRIDE_AS[o.kind];
    if (t.cloud !== undefined) w.cloud = t.cloud;
    if (t.rain !== undefined) w.rain = t.rain;
    if (t.mist !== undefined) w.mist = t.mist;
    if (t.snow !== undefined) w.snow = t.snow;
    if (t.wind !== undefined) w.wind = t.wind;
    if (t.light !== undefined) w.light = t.light;
  }
  return w;
}

/** The rain at a tile without allocating (the WET pass runs it for every tile). */
function rainAt(x: number, y: number): number {
  let r = W.rain;
  for (const o of list) if (inside(o, x, y) && o.targets.rain !== undefined) r = o.targets.rain;
  return r;
}

/* ---------- the machine ---------- */

/** A new park: fair, the first change in 40 s, nothing cast. */
export function resetWeather(): void {
  const k = WK.fair;
  W.kind = 'fair';
  W.next = FIRST_CHANGE;
  W.cloud = k.cloud;
  W.rain = k.rain;
  W.mist = k.mist;
  W.snow = k.snow;
  W.wind = k.wind;
  W.windP = 0;
  W.drift = 0;
  W.wet = 0;
  list = [];
  wetAny = false;
}

/** The kind for `u` in [0, 100) under the season's weights; a zero weight is never picked. */
export function kindForRoll(u: number, season: number): WeatherKind {
  const row = WEIGHTS[season] ?? WEIGHTS[0] ?? [];
  let acc = 0;
  for (let i = 0; i < WEATHER_KINDS.length; i++) {
    acc += row[i] ?? 0;
    if (u < acc) return WEATHER_KINDS[i] as WeatherKind;
  }
  return 'fair';
}

/** Pick the next kind and its duration: two draws on the sim stream, kind first (GV 852-853). */
function pickNext(): void {
  W.kind = kindForRoll(rng() * 100, T.season);
  const k = WK[W.kind];
  W.next = rnd(k.durMin, k.durMax);
}

/** `debug.weather` (03 5.1): set the kind now and give it a mean-length run. No draw is made, so the stream is left as it was. */
export function forceWeather(kind: WeatherKind): void {
  const k = WK[kind];
  W.kind = kind;
  W.next = (k.durMin + k.durMax) / 2;
}

/** Phase 4 of a step (03 4.2): the countdown, eased targets, gusts, the wet look, override expiry. */
export function stepWeather(dt: number, tick: number): void {
  W.next -= dt;
  if (W.next <= 0) pickNext();
  const k = WK[W.kind];
  const rs = 1 - Math.pow(0.5, dt / 2.6);
  const rw = 1 - Math.pow(0.06, dt);
  W.cloud += (k.cloud - W.cloud) * rs;
  W.rain += (k.rain - W.rain) * rs;
  W.mist += (k.mist - W.mist) * rs;
  W.snow += (k.snow - W.snow) * rs;
  W.windP += dt * 0.21;
  const gust = 0.55 + 0.45 * Math.sin(W.windP * 0.7) * Math.sin(W.windP * 0.23 + 1.3);
  W.wind += (k.wind * gust - W.wind) * rw * 0.6;
  W.drift += W.wind * dt * 22;
  const up = W.rain > W.wet;
  W.wet += (W.rain - W.wet) * (1 - Math.pow(0.5, dt / (up ? 4 : 150)));
  if (list.some((o) => o.until < tick)) list = list.filter((o) => o.until >= tick);
}

/* ---------- the WET tile layer (02 2.2) ---------- */

let wetAny = false;

/** After a restore: assume some tile may be wet, so the fall pass runs until it finds none. */
export function markWetUnknown(): void {
  wetAny = true;
}

/** Each tile gains 0.2 per sim second while the rain there is above 0.3, else loses 0.01, clamped to 0-1 (a rise snaps to 1 within WET_SNAP). */
export function stepWet(dt: number): void {
  const rise = WET_RISE * dt;
  const fall = WET_FALL * dt;
  if (list.length === 0) {
    if (W.rain > WET_RAIN_MIN) {
      wetAny = true;
      for (let i = 0; i < NC; i++) {
        const v = (WET[i] as number) + rise;
        WET[i] = v >= 1 - WET_SNAP ? 1 : v;
      }
    } else if (wetAny) {
      let any = false;
      for (let i = 0; i < NC; i++) {
        const v = WET[i] as number;
        if (v > 0) {
          const n = v - fall;
          WET[i] = n > 0 ? n : 0;
          if (n > 0) any = true;
        }
      }
      wetAny = any;
    }
    return;
  }
  wetAny = true;
  for (let i = 0; i < NC; i++) {
    const v = WET[i] as number;
    if (rainAt(i % N, (i / N) | 0) > WET_RAIN_MIN) {
      const n = v + rise;
      WET[i] = n >= 1 - WET_SNAP ? 1 : n;
    } else WET[i] = clamp01(v - fall);
  }
}
