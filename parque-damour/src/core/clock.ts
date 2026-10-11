// src/core/clock.ts
// The park clock T: absolute day count, day fraction f, day, season, light, phase, lamps (register 3.2, 02 3.1-3.2).
// Ported from GV 814-828 (T, updateTime). ADAPT: abs is recomputed from the integer tick (no float drift, 03 6.1);
// light is the piecewise-linear table of 02 3.2, not GV's cosine; cold, thaw and ds are dropped (03 6.1 item 3).
// TODO(S2): emit 'newday' and 'season' through core/events.ts (03 6.1 item 2).

export const DAYLEN = 360; // sim seconds per day at 1x
export const SEASON_DAYS = 3;
export const START_ABS = 0.3; // a new park starts in the morning of spring day 1
const STEPS_PER_DAY = 60 * DAYLEN; // 21600 fixed steps of 1/60 s

export type Phase = 'night' | 'dawn' | 'morning' | 'midday' | 'afternoon' | 'golden' | 'dusk' | 'evening';
export type Season = 0 | 1 | 2 | 3;
export const SEASON_KEYS = ['spring', 'summer', 'autumn', 'winter'] as const;

/** The eight day bands of register 3.2 with the light at each band's start and end (02 3.2). */
type Band = { phase: Phase; from: number; to: number; l0: number; l1: number };
export const BANDS: readonly Band[] = [
  { phase: 'night', from: 0.0, to: 0.2, l0: 0.06, l1: 0.06 },
  { phase: 'dawn', from: 0.2, to: 0.28, l0: 0.06, l1: 0.75 },
  { phase: 'morning', from: 0.28, to: 0.45, l0: 0.75, l1: 1.0 },
  { phase: 'midday', from: 0.45, to: 0.58, l0: 1.0, l1: 1.0 },
  { phase: 'afternoon', from: 0.58, to: 0.72, l0: 1.0, l1: 0.88 },
  { phase: 'golden', from: 0.72, to: 0.8, l0: 0.88, l1: 0.62 },
  { phase: 'dusk', from: 0.8, to: 0.87, l0: 0.62, l1: 0.22 },
  { phase: 'evening', from: 0.87, to: 1.0, l0: 0.22, l1: 0.06 },
];

export const T: {
  abs: number;
  f: number;
  day: number;
  season: Season;
  light: number;
  speed: number;
  phase: Phase;
  lamps: boolean;
} = { abs: START_ABS, f: START_ABS, day: 1, season: 0, light: 0, speed: 1, phase: 'morning', lamps: false };

let newDay = false;

/** f into [0, 1) without touching values already there (1.2 % 1 is not 0.2 in floating point). */
function wrap(f: number): number {
  return f >= 0 && f < 1 ? f : ((f % 1) + 1) % 1;
}

function bandOf(f: number): Band {
  const ff = wrap(f);
  for (const b of BANDS) if (ff < b.to) return b;
  return BANDS[BANDS.length - 1] as Band;
}

export function phaseOf(f: number): Phase {
  return bandOf(f).phase;
}

/** Light 0..1 by linear interpolation inside the band (02 3.2). */
export function lightOf(f: number): number {
  const b = bandOf(f);
  const ff = wrap(f);
  const t = (ff - b.from) / (b.to - b.from);
  return b.l0 + (b.l1 - b.l0) * t;
}

export function lampsAt(f: number): boolean {
  return f >= 0.8 || f < 0.28;
}

export function seasonOf(day: number): Season {
  return (Math.floor((day - 1) / SEASON_DAYS) % 4) as Season;
}

/** Recompute T from the integer step count (03 4.2 phase 3). */
export function stepClock(tick: number): void {
  const prevDay = T.day;
  T.abs = START_ABS + tick / STEPS_PER_DAY;
  T.f = T.abs % 1;
  T.day = Math.floor(T.abs) + 1;
  T.season = seasonOf(T.day);
  T.phase = phaseOf(T.f);
  T.light = lightOf(T.f);
  T.lamps = lampsAt(T.f);
  newDay = tick > 0 && T.day !== prevDay;
}

/** True only on the step where the day changed. */
export function isNewDay(): boolean {
  return newDay;
}

T.light = lightOf(T.f);
T.lamps = lampsAt(T.f);
