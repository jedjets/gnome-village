// src/audio/music-state.ts
// The state input of the game music (05 5.6; 07 S8.6 step 8): what music.ts reads from the simulation once per bar, the first-match table,
// the row each motif takes from it, the tempo slew and the busker and avatar scales of musicBus. A leaf of music.ts (it imports nothing from it).
// Read only (hard rule 2): the featured pair (stage and affinity, a ring of 16 compared with the sample nearest 30 sim s back), the
// `parted` and `happily` events (counted in bars), `c_fireworks` in the effects, a busker in state `play` with audibleGain >= 0.05, and
// getMode(). Nothing here writes the simulation or calls rng() (05 1 item 5); the state never starts, stops or switches a motif (5.6 rule 3).
// NEW.
import { DAYLEN, T } from '../core/clock.ts';
import { watch, type EventFn, type EventKind } from '../core/events.ts';
import { featured } from '../entities/romance.ts';
import { visitors } from '../entities/visitor.ts';
import { effects } from '../play/abilities.ts';
import { getMode } from '../play/mode.ts';
import { audibleGain, panOf } from './engine.ts';

export type Variant = 'rising' | 'parted';
export type MotifId = 'B' | 'C';
export type StateName = 'flourish' | 'parted' | 'happily' | 'night' | 'rising' | 'stroll';

/* ---------- numbers of 05 5.6 ---------- */
export const PARTED_BARS = 24; // a Parted ending counts for this many bars
export const HAPPILY_BARS = 8;
export const RING = 16; // (T.abs, affinity) samples, one per bar
export const RISING_BACK_S = 30; // sim seconds: the sample nearest this far back is the one affinity is compared with
export const TEMPO_STEP = 8; // BPM per bar, at most
export const TEMPO_BAND = { lo: 0.8, hi: 1.2 } as const; // times the variant's base tempo (the `tempo` knob range)
export const BUSKER_MIN_A = 0.05; // audibleGain from which a busker steers the melody's pan
export const AVATAR_BUS = 0.8; // musicBus x 0.8 in the avatar mode (05 5.6 rule 6; open point 3)
export const BASE_BPM: Record<MotifId, Record<Variant, number>> = { B: { rising: 84, parted: 66 }, C: { rising: 120, parted: 96 } };
/** The density knob's default per motif (6.3 columns B and C): the knob scales the table's density by value / default. */
export const DENSITY_DEFAULT: Record<MotifId, number> = { B: 0.8, C: 0.7 };

/** What music.ts reads once per bar. */
export interface MusicInput {
  stage: number; // the featured pair's stage, 0 with no pair
  affinityDelta: number; // its affinity now minus the sample nearest 30 sim s back, 0 with no history
  parted: boolean; // a Parted ending in the last 24 bars
  happily: boolean; // a Happily ending in the last 8 bars
  fireworks: boolean; // c_fireworks active
  night: boolean; // the clock rule wants B (wantedMotif(f) === 'B'), not the light
  busker: { pan: number; a: number } | null; // the loudest audible busker in state `play`
  avatar: boolean; // getMode() === 'avatar'
}

/** First match wins (05 5.6). */
export function resolveState(i: MusicInput): StateName {
  if (i.fireworks) return 'flourish';
  if (i.parted) return 'parted';
  if (i.happily) return 'happily';
  if (i.night) return 'night';
  if (i.stage >= 3 && i.affinityDelta > 0) return 'rising';
  return 'stroll';
}

/** One row of the table for one motif: the variant, the tempo factor and the density (05 5.6). */
export interface Row { variant: Variant; tempo: number; density: number }
const row = (variant: Variant, tempo: number, density: number): Row => ({ variant, tempo, density });
/** The table by state; a motif the row does not name has no entry (`night` is B's, `rising` and `stroll` are C's). */
export const ROWS: Record<StateName, Partial<Record<MotifId, Row>>> = {
  flourish: { B: row('rising', 1.08, 1.0), C: row('rising', 1.08, 1.0) },
  parted: { B: row('parted', 1.0, 0.5), C: row('parted', 1.0, 0.5) },
  happily: { B: row('rising', 1.04, 1.0), C: row('rising', 1.04, 1.0) },
  night: { B: row('rising', 1.0, 0.8) },
  rising: { C: row('rising', 1.0, 0.7) },
  stroll: { C: row('rising', 0.95, 0.6) },
};

/**
 * The row that applies to the motif now playing. While the clock wants the other motif the playing one waits for its phrase start (5.4
 * item 3) and the table's name for the other motif is read as the playing one's own: B under `rising` or `stroll` takes the `night` row
 * (B rising, 1.0, 0.8), C under `night` takes the row it would have without the night test. A state never switches a motif.
 */
export function rowOf(motif: MotifId, i: MusicInput): { state: StateName; row: Row } {
  let s = resolveState(i);
  if (!ROWS[s][motif]) s = motif === 'B' ? 'night' : resolveState({ ...i, night: false });
  return { state: s, row: ROWS[s][motif] as Row };
}
/** The board's and the Sound check's fixed rows (05 6.3 defaults): `parted` is the parted row, `rising` B's night row and C's rising row. */
export function fixedRow(motif: MotifId, variant: Variant): Row {
  return (variant === 'parted' ? ROWS.parted[motif] : motif === 'B' ? ROWS.night.B : ROWS.rising.C) as Row;
}

/** bpm = base x tempo knob x state factor (5.1 item 5), inside 0.8 to 1.2 x the variant's base tempo (5.6 rule 1). */
export function tempoTarget(motif: MotifId, variant: Variant, knob: number, factor: number): number {
  const base = BASE_BPM[motif][variant];
  return Math.max(base * TEMPO_BAND.lo, Math.min(base * TEMPO_BAND.hi, base * knob * factor));
}
/** One bar's tempo move: at most 8 BPM towards the target (5.6 rule 1). */
export function slewBpm(cur: number, target: number): number {
  const d = target - cur;
  return Math.abs(d) <= TEMPO_STEP ? target : cur + Math.sign(d) * TEMPO_STEP;
}
/** musicBus scale: x0.8 in the avatar mode, x(0.7 + 0.3a) with an audible busker (5.6 rules 5 and 6). */
export function busScale(i: MusicInput): number {
  return (i.avatar ? AVATAR_BUS : 1) * (i.busker ? 0.7 + 0.3 * i.busker.a : 1);
}

/* ---------- reading the simulation ---------- */
export interface EventBus { watch(kind: EventKind, fn: EventFn): void }
type Sample = { t: number; a: number; id: number };
let ring: Sample[] = [];
let bars = 0; // reads so far: one per bar of the lead motif
let partedAt = -Infinity;
let happilyAt = -Infinity;

/** The two events the state counts. Called once by the first startMusic(); the handlers only note the bar count, so a second call is harmless. */
export function bindMusicState(bus: EventBus = { watch }): void {
  bus.watch('parted', () => { partedAt = bars; });
  bus.watch('happily', () => { happilyAt = bars; });
}
/** A new park: the ring and the endings belong to the old one. */
export function resetMusicState(): void {
  ring = [];
  bars = 0;
  partedAt = happilyAt = -Infinity;
}
export function musicMemory(): { ring: readonly Sample[]; bars: number; partedAt: number; happilyAt: number } {
  return { ring, bars, partedAt, happilyAt };
}

/** The affinity of pair `id` now minus the sample nearest `RISING_BACK_S` back in the ring (0 when the ring holds nothing older). */
export function affinityDelta(samples: readonly Sample[], id: number, nowS: number, aff: number): number {
  let best: Sample | null = null;
  for (const s of samples) if (s.id === id && (!best || Math.abs(s.t - (nowS - RISING_BACK_S)) < Math.abs(best.t - (nowS - RISING_BACK_S)))) best = s;
  return best ? aff - best.a : 0;
}

/** Read the simulation once, for one bar of the lead motif. `night` is the clock rule's answer (wantedMotif(f) === 'B'). */
export function readMusicInput(night: boolean): MusicInput {
  bars++;
  const p = featured();
  let stage = 0, delta = 0;
  if (p) {
    stage = p.stage;
    const nowS = T.abs * DAYLEN;
    ring.push({ t: nowS, a: p.affinity, id: p.id });
    if (ring.length > RING) ring.shift();
    delta = affinityDelta(ring, p.id, nowS, p.affinity);
  }
  let busker: MusicInput['busker'] = null;
  for (const v of visitors) {
    if (v.archetype !== 'busker' || v.st !== 'play') continue;
    const a = audibleGain(v.x, v.y);
    if (a >= BUSKER_MIN_A && (!busker || a > busker.a)) busker = { pan: panOf(v.x, v.y), a };
  }
  return {
    stage,
    affinityDelta: delta,
    parted: bars - partedAt <= PARTED_BARS,
    happily: bars - happilyAt <= HAPPILY_BARS,
    fireworks: effects.some((e) => e.ability === 'c_fireworks'),
    night,
    busker,
    avatar: getMode() === 'avatar',
  };
}
