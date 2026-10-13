// src/entities/needs.ts
// The four needs and their rates per sim day, and the comfort target of 02 4.4 / 06 7; reads weatherAt, the lamps and the clock.
// Ported from GV 5552-5581 (needs: the per-day rates d = dt / DAYLEN, clamp01, the warmth target eased with
// `w += clamp(target - w, -1, 1) * k * dt` at 5579).
// Verdict: ADAPT. Changes: hunger +0.5/day, energy -0.6/day awake and +0.4/day sitting on a bench (both per sim day: GV regenerated
// per second asleep, 09 4 row 12), social +0.3/day for a single not in a Pair, comfort eased at 0.2/s (GV warmth 0.22/s) toward the
// target of 02 4.4: 0.7, +0.15 with a lamp within 3 at night (the lamps' hours, f >= 0.80 or f < 0.28, when every lamp is lit), -0.15
// at night with none, -0.35 rain, -0.30 snow, -0.10 mist (weatherAt at the visitor), +0.10 inside a sunbeam, the season term (summer
// -0.05 at midday, winter -0.15) and the weather term of the global kind (clear +0.05, cloudy -0.05, snow -0.30), clamped to 0-1; in a
// SHELTERED state rain lowers nothing (02 5.3). This module never reads MODE or PLAYER (03 1, Do not 3).
// Dropped from the range: 5554-5562 (age, stages, setOff), 5564-5566 (sleep, baby, child and cold hunger factors), 5568 (the sleep
// regeneration per second), 5570-5578 (the light, rain, snow, cold, swim, fire, indoors and huddle warmth terms), 5580 (the baby auto-eat).
import { clamp, clamp01, cheb } from '../core/math.ts';
import { DAYLEN, T } from '../core/clock.ts';
import { W, overrides, weatherAt, type WeatherKind } from '../core/weather.ts';
import { propById, props } from '../world/grid.ts';
import type { Visitor } from './visitor.ts';

export const HUNGER_DAY = 0.5; // 06 7
export const ENERGY_AWAKE_DAY = 0.6;
export const ENERGY_BENCH_DAY = 0.4;
export const SOCIAL_DAY = 0.3;
export const COMFORT_EASE = 0.2; // per second (GV 5579 idiom)
export const COMFORT_BASE = 0.7;
export const LAMP_NEAR = 3; // tiles, Chebyshev
export const LAMP_NIGHT = 0.15; // + with a lamp within 3 at night, - without
export const RAIN_K = 0.35;
export const SNOW_K = 0.3;
export const MIST_K = 0.1;
export const SUNBEAM_K = 0.1;
/** The weather term of 02 3.3 / 06 14.1 by the global kind; rain, shower and mist act through the formula only. */
export const WEATHER_TERM: Readonly<Record<WeatherKind, number>> = { clear: 0.05, fair: 0, cloudy: -0.05, breeze: 0, rain: 0, shower: 0, mist: 0, snow: -0.3 };

/** States in which rain lowers no comfort (02 5.3 SHELTERED: shelter, and eat at a kiosk). brain.ts re-exports the set (03 2.5). */
export const SHELTERED: Readonly<Record<string, true>> = { shelter: true, eat: true };

/** True while `v` sits on a bench (energy rises instead of falling, 02 4.4). */
function onBench(v: Visitor): boolean {
  return v.sitPropId !== 0 && propById(v.sitPropId)?.kind === 'bench';
}

/** True when rain does not reach `v` (02 5.3): sheltering, or eating at a kiosk's serving tile (a bench snack is not sheltered). */
function sheltered(v: Visitor): boolean {
  if (!SHELTERED[v.st]) return false;
  if (v.st !== 'eat') return true;
  return propById(v.job.propId ?? 0)?.kind === 'kiosk';
}

/** The season term of 02 3.4 / 06 15: summer -0.05 at midday, winter -0.15, else 0. */
export function seasonTerm(season: number, phase: string): number {
  if (season === 1) return phase === 'midday' ? -0.05 : 0;
  return season === 3 ? -0.15 : 0;
}

/** A lamp prop within 3 tiles of tile (x, y). At night every lamp is lit (T.lamps), so a lamp near is a lit lamp near. */
function lampNear(x: number, y: number): boolean {
  for (const p of props) if (p.kind === 'lamp' && cheb(x, y, p.x, p.y) <= LAMP_NEAR) return true;
  return false;
}

/** Inside a c_sunbeam override's square (02 3.5). */
function inSunbeam(x: number, y: number): boolean {
  for (const o of overrides()) if (o.kind === 'sunbeam' && Math.abs(x - o.x) <= o.r && Math.abs(y - o.y) <= o.r) return true;
  return false;
}

/** The comfort target at the visitor's tile now (02 4.4, 06 7), clamped to 0-1. */
export function comfortTarget(v: Visitor): number {
  const x = Math.round(v.x), y = Math.round(v.y);
  const w = weatherAt(x, y);
  let t = COMFORT_BASE;
  if (T.lamps) t += lampNear(x, y) ? LAMP_NIGHT : -LAMP_NIGHT;
  if (!sheltered(v)) t -= RAIN_K * w.rain;
  t -= SNOW_K * w.snow + MIST_K * w.mist;
  if (inSunbeam(x, y)) t += SUNBEAM_K;
  t += seasonTerm(T.season, T.phase) + WEATHER_TERM[W.kind];
  return clamp01(t);
}

/** One step of the four needs for `dt` sim seconds (03 4.2 phase 8). */
export function stepNeeds(v: Visitor, dt: number): void {
  const d = dt / DAYLEN;
  v.hunger = clamp01(v.hunger + HUNGER_DAY * d);
  v.energy = clamp01(v.energy + (onBench(v) ? ENERGY_BENCH_DAY : -ENERGY_AWAKE_DAY) * d);
  if (v.archetype === 'single' && v.pairId === 0) v.social = clamp01(v.social + SOCIAL_DAY * d); // stays as Chat left it while paired
  const target = comfortTarget(v);
  v.comfort = clamp01(v.comfort + clamp(target - v.comfort, -1, 1) * COMFORT_EASE * dt);
}
