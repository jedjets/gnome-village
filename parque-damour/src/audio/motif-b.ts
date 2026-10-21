// src/audio/motif-b.ts
// Motif B, the music-box lullaby (05 5.2): the pitch set, the two left hands and the planners. Pure: no AudioContext, no engine; the voices
// and the scheduling are music.ts's. Moved from the board's motifs file (makeB, commit 5bbc5f3: exactly what the owner heard at the Music Gate)
// with no number changed; the phrase planner and the bar planner now take a random source (default vrng), the draws in the same order.
// Ported from GV 6195–6196 (sfxTune: the 12-note pentatonic box seeds motif B; GV's phrase is phrase 1 when `rising`). NEW.
import { vrng } from '../core/rng.ts';
import type { Variant } from './music-state.ts';

/** C D E G A over octaves 5 and 6 (A minor pentatonic shares the set); the melody never leaves 72–93 (05 5.2 items 2 and 7). */
export const PENT_C: readonly number[] = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93];
/** GV 6196: 523 659 784 880 784 659 587 523 587 659 784 1047 Hz. */
export const GV_PHRASE: readonly number[] = [72, 76, 79, 81, 79, 76, 74, 72, 74, 76, 79, 84];
export const TINE_GAIN = 0.016; // 05 5.2 item 4: "gains 0.016 as GV"
export const B_BARS = 4; // one phrase = 4 bars of 3 beats (5.1 item 6)
export const PHRASE_LEN = 12;
/** The tonics a phrase may end on (5.2 item 6c): C5 or C6 in `rising`, A5 or A6 in `parted`. */
export const B_TONICS: Record<Variant, readonly number[]> = { rising: [72, 84], parted: [81, 93] };
/** Where a first phrase starts (5.2 item 6a): C5 in `rising`, A5 in `parted`. */
export const B_START: Record<Variant, number> = { rising: 72, parted: 81 };

/**
 * One 12-note phrase (5.2 item 6): from the position of `prevLast` in PENT_C (0 if it is not in the set), 11 moves of one position (65 %)
 * or two (35 %), up in notes 1 to 6 and down in 7 to 11 with 60 % chance, otherwise the other way; a move that would leave the set goes the
 * other way and the result is clamped; note 12 is the tonic nearest note 11. `gv` returns GV's own phrase (the first phrase after B starts
 * in `rising`, and the first phrase after a flourish entry, 5.2 item 5). Draws: size, then direction, for each of the 11 moves.
 */
export function planPhraseB(prevLast: number, variant: Variant, gv: boolean, rand: () => number = vrng): number[] {
  if (gv) return GV_PHRASE.slice();
  const out: number[] = [];
  let i = PENT_C.indexOf(prevLast);
  if (i < 0) i = 0;
  for (let k = 0; k < PHRASE_LEN; k++) {
    if (k === PHRASE_LEN - 1) {
      const t = B_TONICS[variant];
      let best = t[0] as number;
      for (const m of t) if (Math.abs(m - (PENT_C[i] as number)) < Math.abs(best - (PENT_C[i] as number))) best = m;
      out.push(best);
      break;
    }
    const size = rand() < 0.65 ? 1 : 2;
    const arc = k < 6 ? 1 : -1;
    const dir = rand() < 0.6 ? arc : -arc;
    let j = i + dir * size;
    if (j < 0 || j >= PENT_C.length) j = i - dir * size;
    i = Math.max(0, Math.min(PENT_C.length - 1, j));
    out.push(PENT_C[i] as number);
  }
  return out;
}

/** One note of a bar: `beat` 0 to 2 from the bar start; `gain` names the knob (bass, chords) or the melody's TINE_GAIN. */
export interface BNote { beat: number; midi: number; gain: 'bass' | 'chords' | 'melody'; layer: 'lh' | 'mel' }

/**
 * One bar (5.2 items 3 and 4): the left hand, then the phrase's three melody notes for this bar. `rising`: C4 at `bass` on beat 1, G4 and E5
 * at `chords` on beats 2 and 3; `parted`: A3 at `bass` with E4 and C5 at `chords`, together on beat 1 only. Melody note `k` plays on beat
 * `k mod 3` of phrase bar `floor(k / 3)`; beat 1 always plays, a note on beat 2 or 3 is left out with probability 1 - density (one draw each).
 */
export function planBarB(phrase: readonly number[], barInPhrase: number, variant: Variant, density: number, rand: () => number = vrng): BNote[] {
  const out: BNote[] = [];
  if (variant === 'parted') {
    out.push({ beat: 0, midi: 57, gain: 'bass', layer: 'lh' }, { beat: 0, midi: 64, gain: 'chords', layer: 'lh' }, { beat: 0, midi: 72, gain: 'chords', layer: 'lh' });
  } else {
    out.push({ beat: 0, midi: 60, gain: 'bass', layer: 'lh' }, { beat: 1, midi: 67, gain: 'chords', layer: 'lh' }, { beat: 2, midi: 76, gain: 'chords', layer: 'lh' });
  }
  for (let b = 0; b < 3; b++) {
    const midi = phrase[barInPhrase * 3 + b] as number;
    if (b > 0 && rand() > density) continue;
    out.push({ beat: b, midi, gain: 'melody', layer: 'mel' });
  }
  return out;
}
