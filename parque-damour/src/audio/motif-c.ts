// src/audio/motif-c.ts
// Motif C, the café swing (05 5.3): the chord tables, the scales, the walking bass, the comp and the clarinet's sung and answer bars. Pure:
// no AudioContext, no engine; the voices and the scheduling are music.ts's. Moved from the board's motifs file (makeC, commit 5bbc5f3: exactly
// what the owner heard at the Music Gate) with no number changed; the bar planner now takes a random source (default vrng) and returns the
// bar's notes in beats, the draws in the same order. NEW.
import { vrng } from '../core/rng.ts';
import type { Variant } from './music-state.ts';

/** Chord symbol to pitch classes root, third, fifth, (sixth or seventh); C = 0 (05 5.3 item 3). */
export const SWING_CHORDS: Record<string, readonly number[]> = {
  F6: [5, 9, 0, 2], Gm7: [7, 10, 2, 5], C7: [0, 4, 7, 10], Bb6: [10, 2, 5, 7], Bbm6: [10, 1, 5, 7], D7: [2, 6, 9, 0],
  Dm6: [2, 5, 9, 11], Em7b5: [4, 7, 10, 2], A7: [9, 1, 4, 7], Gm6: [7, 10, 2, 4], Bb7: [10, 2, 5, 8],
};
/** The 8-bar loops by variant (a bar with two chords changes chord on beat 3); the two tables run in parallel, so `bar mod 8` is kept. */
export const SWING_BARS: Record<Variant, readonly string[]> = {
  rising: ['F6', 'Gm7 C7', 'F6', 'Gm7 C7', 'Bb6', 'Bbm6', 'F6 D7', 'Gm7 C7'],
  parted: ['Dm6', 'Em7b5 A7', 'Dm6', 'Em7b5 A7', 'Gm6', 'Gm6', 'Dm6 Bb7', 'Em7b5 A7'],
};
/** F major in `rising`, D natural minor in `parted` (pitch classes). */
export const SWING_SCALE: Record<Variant, readonly number[]> = { rising: [5, 7, 9, 10, 0, 2, 4], parted: [2, 4, 5, 7, 9, 10, 0] };
export const CLAR_GAIN = 0.034;
export const CLAR_LO = 65; // F4
export const CLAR_HI = 86; // D6
export const C_BARS = 2; // one phrase = a sung bar and its answer (5.1 item 6)
export const LOOP_BARS = 8;
export const COMP_S = 0.15; // a comp note lasts this many seconds (5.5 item 4c)
/** The flourish entry's swung-quaver run in place of a planned sung bar (05 5.6): D5 E5 F5 G5 A5 B♭5 C6 D6. */
export const FLOURISH_RUN: readonly number[] = [74, 76, 77, 79, 81, 82, 84, 86];

/** One note of a bar. `beat` is from the bar start; `dur` is in beats for the clarinet and the bass, in seconds for the comp (COMP_S). */
export interface CNote { voice: 'clar' | 'bass' | 'comp'; beat: number; midi: number; dur: number }
/** What a bar leaves for the next: the clarinet's last note and the bass's (the bass approach reads it). */
export interface CState { prevMel: number; prevBass: number }
/** The first reference notes (5.3 items 4d and 6d): C5 and F2 in `rising`, A4 and D2 in `parted`. */
export function cStart(v: Variant): CState {
  return { prevMel: v === 'parted' ? 69 : 72, prevBass: v === 'parted' ? 38 : 41 };
}

const segs = (bar: number, v: Variant): string[] => (SWING_BARS[v][bar % LOOP_BARS] as string).split(' ');
function scaleOf(v: Variant): number[] {
  const out: number[] = [];
  for (let m = CLAR_LO; m <= CLAR_HI; m++) if (SWING_SCALE[v].includes(m % 12)) out.push(m);
  return out;
}
const SCALES: Record<Variant, number[]> = { rising: scaleOf('rising'), parted: scaleOf('parted') };
export function chordTones(chord: string, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if ((SWING_CHORDS[chord] as readonly number[]).includes(m % 12)) out.push(m);
  return out;
}
function nearestOf(cands: number[], to: number): number {
  let best = cands[0] as number;
  for (const c of cands) if (Math.abs(c - to) < Math.abs(best - to)) best = c;
  return best;
}
/** The lowest MIDI note at or above `lo` whose pitch class is the chord's root. */
export function rootIn(chord: string, lo: number): number {
  const r = (SWING_CHORDS[chord] as readonly number[])[0] as number;
  let m = lo;
  while (m % 12 !== r) m++;
  return m;
}
const upFrom = (pcs: readonly number[], root: number, i: number): number => root + ((((pcs[i] as number) - (pcs[0] as number)) % 12) + 12) % 12;

/**
 * One bar of motif C (5.3): the walking bass (`rising`: root, third, fifth, approach; a two-chord bar: root and approach for each chord;
 * `parted`: beats 1 and 3 only), the comp on beats 2 and 4 (`rising` only) and the clarinet. A sung bar (even `bar`) draws per beat a breath
 * (15 %) or a move of 1 step (60 %), 2 (25 %) or 3 or 4 (15 %), up on beats 1 and 2 and down on 3 and 4 with 60 % chance, snapped to a chord
 * tone on beats 1 and 3, as two swung quavers (50 %) or a crotchet (35 %), the left-out ones with probability 1 - density; an answer bar (odd)
 * is one note of 1.5 beats. `run` puts the flourish run in place of the sung bar and draws nothing for it. Returns the notes and the state
 * the next bar starts from; it writes nothing else.
 */
export function planBarC(bar: number, v: Variant, st: CState, density: number, run = false, rand: () => number = vrng): { notes: CNote[]; state: CState } {
  let { prevMel, prevBass } = st;
  const notes: CNote[] = [];
  const chords = segs(bar, v);
  const nextChords = segs(bar + 1, v);
  const segBeats = 4 / chords.length;
  // walking bass (rising: every crotchet; parted: beats 1 and 3)
  for (let s = 0; s < chords.length; s++) {
    const chord = chords[s] as string;
    const nextRoot = rootIn(s + 1 < chords.length ? (chords[s + 1] as string) : (nextChords[0] as string), 36);
    const root = rootIn(chord, 36);
    const pcs = SWING_CHORDS[chord] as readonly number[];
    const third = upFrom(pcs, root, 1);
    const fifth = upFrom(pcs, root, 2);
    const approach = nextRoot + (nextRoot >= prevBass ? -1 : 1);
    const walk = segBeats === 4 ? [root, third, fifth, approach] : [root, approach];
    for (let b = 0; b < segBeats; b++) {
      const beatIx = s * segBeats + b;
      if (v === 'parted' && beatIx % 2 === 1) continue;
      const midi = v === 'parted' ? (b === 0 ? root : fifth) : (walk[b] as number);
      prevBass = midi;
      notes.push({ voice: 'bass', beat: beatIx, midi, dur: 0.85 });
    }
  }
  // comp on 2 and 4 (rising only): the chord's third, fifth and sixth or seventh above its root in octave 4
  if (v === 'rising') {
    for (const b of [1, 3]) {
      const chord = chords[Math.min(chords.length - 1, Math.floor(b / segBeats))] as string;
      const root = rootIn(chord, 60);
      const pcs = SWING_CHORDS[chord] as readonly number[];
      for (const i of [1, 2, 3]) notes.push({ voice: 'comp', beat: b, midi: upFrom(pcs, root, i), dur: COMP_S });
    }
  }
  // clarinet: bar 1 of each pair sings in swung quavers, bar 2 answers with one note and rests
  const scale = SCALES[v];
  const step = (from: number, arc: number): number => {
    let i = scale.indexOf(from);
    if (i < 0) i = Math.max(0, scale.findIndex((m) => m >= from));
    const r = rand();
    const size = r < 0.6 ? 1 : r < 0.85 ? 2 : 3 + Math.floor(rand() * 2);
    const dir = rand() < 0.6 ? arc : -arc;
    let j = i + dir * size;
    if (j < 0 || j >= scale.length) j = i - dir * size;
    return scale[Math.max(0, Math.min(scale.length - 1, j))] as number;
  };
  if (bar % C_BARS === 0) {
    if (run) {
      for (let b = 0; b < 4; b++) {
        notes.push({ voice: 'clar', beat: b, midi: FLOURISH_RUN[2 * b] as number, dur: 0.62 });
        notes.push({ voice: 'clar', beat: b + 2 / 3, midi: FLOURISH_RUN[2 * b + 1] as number, dur: 0.3 }); // the swung second quaver
      }
      prevMel = FLOURISH_RUN[FLOURISH_RUN.length - 1] as number;
    } else {
      for (let b = 0; b < 4; b++) {
        const chord = chords[Math.min(chords.length - 1, Math.floor(b / segBeats))] as string;
        const r = rand();
        const arc = b < 2 ? 1 : -1;
        if (r >= 0.85) continue; // a breath
        let m1 = step(prevMel, arc);
        if (b % 2 === 0) m1 = nearestOf(chordTones(chord, CLAR_LO, CLAR_HI), m1);
        prevMel = m1;
        if (r < 0.5) {
          const m2 = step(m1, arc);
          prevMel = m2;
          const rest2 = rand() > density;
          notes.push({ voice: 'clar', beat: b, midi: m1, dur: 0.62 });
          if (!rest2) notes.push({ voice: 'clar', beat: b + 2 / 3, midi: m2, dur: 0.3 });
        } else {
          if (b > 0 && rand() > density) continue;
          notes.push({ voice: 'clar', beat: b, midi: m1, dur: 0.92 });
        }
      }
    }
  } else {
    const m = nearestOf(chordTones(chords[0] as string, CLAR_LO, CLAR_HI), prevMel);
    prevMel = m;
    notes.push({ voice: 'clar', beat: 0, midi: m, dur: 1.5 });
  }
  return { notes, state: { prevMel, prevBass } };
}
