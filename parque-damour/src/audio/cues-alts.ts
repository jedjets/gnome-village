// src/audio/cues-alts.ts
// The two alternative recipes each for the `kiss` and `splat` cues (05 3.2 rows 8 and 15; 07 S8.6 step 13; register row 26: sound is
// presented as options before it is settled). NEW. Both are on the Sound check as dev buttons (kiss A, kiss B, splat A, splat B) and the
// registry's cues play the PICK below. Nobody could listen where this was built (no audio device): the pick rests on the 05 recipes, the
// picked voices (Storybook paper and sparkle, the music-box tine of motif B, the café clarinet of motif C) and measured proxies (peak gain
// at the cue's row, the spectral content a phone speaker reproduces, 05 7.5), so it is Claude's, on the owner's delegation, and the
// owner is to listen (register section 4, row "Cue recipes kiss and splat").
//   kiss A  the 05 3.2 recipe as the gate's cue bed played it: a 784 Hz dry blip, then a 1046 -> 880 Hz sine shimmer falling 0.3 s.
//   kiss B  a music-box kiss: two tines in motif B's own voice (C6 then E6, both in the C pentatonic of motif B, a sine plus the
//           inharmonic 2.76 x partial at 0.25 that decays in 0.25 s, attack 0.008, the same shape as 05 5.5 item 3), the second 0.14 s later.
//   splat A the 05 3.2 recipe as heard at the gate: a 170 -> 60 Hz thump and a 0.04 s grain 1100 -> 500 Hz (the thump is under what a
//           phone speaker plays, 05 7.5 item 1; the grain carries it).
//   splat B a cartoon "bloop": a sine glide 523 -> 196 Hz over 0.14 s (C5 to G3) with its octave-up partial at 0.3 and a short wet grain
//           at half the level, so it reads on a phone (86 % of its energy in 300 to 3400 Hz against A's 1 %, measured offline through the
//           master chain's lowpass and shelf) and still is comic, never alarming (05 1 item 8).
// Real time: nothing here times anything; the gates and the ducks are cue()'s.
import { audibleGain, duck, grain, isMuted, isOn, logPush, panOf, tone } from './engine.ts';

export type Alt = 'A' | 'B';
export type AltCue = 'kiss' | 'splat';
export type AltPlay = (g: number, pan: number, x: number, y: number) => void;

/** The rows' peak gains (05 3.2), shared with the registry so the alternatives sit at the same level. */
export const ALT_GAIN: Record<AltCue, number> = { kiss: 0.018, splat: 0.03 };

/** Claude's pick, on the owner's delegation (register section 4, row "Cue recipes kiss and splat"); the owner has not yet listened. */
export const ALT_PICK: Record<AltCue, Alt> = { kiss: 'B', splat: 'B' };

/** One motif-B tine: the fundamental and the inharmonic clang at 0.25 that dies in 0.25 s (05 5.5 item 3). */
function tine(f: number, delay: number, g: number, pan: number): void {
  tone(f, 0.7, { att: 0.008, delay, gain: g, pan });
  tone(f * 2.76, 0.25, { att: 0.004, delay, gain: g * 0.25, pan });
}

const KISS: Record<Alt, AltPlay> = {
  A(g, pan) {
    tone(784, 0.08, { att: 0.005, gain: g, pan, dry: true });
    tone(1046, 0.3, { to: 880, delay: 0.1, att: 0.02, gain: g, pan });
  },
  B(g, pan) {
    tine(1047, 0, g, pan); // C6
    tine(1319, 0.14, g * 0.9, pan); // E6
  },
};

const SPLAT: Record<Alt, AltPlay> = {
  A(g, pan) {
    tone(170, 0.1, { to: 60, att: 0.004, gain: g, pan });
    grain(0.04, { f0: 1100, f1: 500, delay: 0.01, gain: g * 0.6, pan });
  },
  B(g, pan) {
    tone(523, 0.14, { to: 196, toAt: 0.8, att: 0.004, gain: g, pan });
    tone(1046, 0.14, { to: 392, toAt: 0.8, att: 0.004, gain: g * 0.3, pan }); // the octave partial of 05 7.5 item 1
    grain(0.04, { f0: 900, f1: 350, delay: 0.02, gain: g * 0.5, pan });
  },
};

export const ALTS: Record<AltCue, Record<Alt, AltPlay>> = { kiss: KISS, splat: SPLAT };

/** What the registry's `kiss` and `splat` play: the pick. */
export const KISS_PLAY: AltPlay = (g, pan, x, y) => KISS[ALT_PICK.kiss](g, pan, x, y);
export const SPLAT_PLAY: AltPlay = (g, pan, x, y) => SPLAT[ALT_PICK.splat](g, pan, x, y);

/** The Sound check's button (and the harness): one alternative, at a tile or unpositioned (NaN), with the kiss's duck. */
export function playAlt(id: AltCue, alt: Alt, x: number, y: number): boolean {
  if (!isOn() || isMuted()) return false;
  const positioned = Number.isFinite(x) && Number.isFinite(y);
  const a = positioned ? audibleGain(x, y) : 1;
  if (positioned && a < 0.02) return false;
  if (id === 'kiss') duck(-6, 0.6, 'music');
  ALTS[id][alt](ALT_GAIN[id] * a, positioned ? panOf(x, y) : 0, x, y);
  logPush(id + ' ' + alt, x, y, a, true, 'ok');
  return true;
}
