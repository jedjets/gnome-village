// src/audio/cues.ts
// The cue vocabulary of 05 section 3: each cue is two or three tone() or grain() calls behind one real-time gate.
// Ported from GV 6139-6207 (the shape of a cue: sfxGiggle 6163, sfxCreak 6162, sfxMurmur 6165, sfxBuilt 6188-6191, sfxYip 6192,
// sfxLeave 6197, sfxDove 6203-6207 as recipes). NEW. Dropped from the range: sfxThud, sfxRumble, sfxFall, sfxCrash, sfxBurner (05 2.1 last row).
// Verdict: ADAPT. Changes: the order inside cue() is (a) on/muted, (b) audibility against def.thresh, (c) gate, (d) play (05 2.4 item 3;
//   GV aOK ran first and an off-screen cue ate the gap, review section 8); `voice` scales a voice-like cue x1.19 (f) or x0.84 (m)
//   (05 2.5); actor-scoped cues also pass the shared 'voice' gate of 110 ms, footsteps excepted (05 2.4 item 4, 3.3 item 6); ducks per 05 5.7.
// S8 part A: the registry holds exactly the 38 rows of 05 3.2 in its order, each with recipe, gap, soft flag, scope and threshold. The
//   recipes follow the table's notation (3.1). Positioned cues are heard from their tile (audibleGain, panOf); `floor` is GV's
//   max(0.4, a) of sfxBuilt (6189), so happily, parted and the foghorn are always at least that loud. A gap of 0 means the row has
//   none (fountain and plip are paced by the ambience, hush has no tone). Cues of the ambience sit on the `amb` bus (05 7.1), so the
//   mime's duck makes its hole in them too. Deviations from the table (07 0.3 item 5): bench_creak, step_lawn, slip and sprinkler carry the
//   octave-up partial that 05 7.5 item 1 asks of everything under 200 Hz (gain x0.3), which 3.2 does not list.
//   The kiss and splat recipes are picked in cues-alts.ts (05 section 3.2 rows 8 and 15, two alternatives each, 07 S8.6 step 13).
// Real time: gaps are the limiter's rAF stamps (05 2.4 item 1); this file never reads the clock and never writes the simulation.
import { vrnd } from '../core/rng.ts';
import { audibleGain, duck, grain, holdMix, isMuted, isOn, logPush, panOf, shifted, stalled, tone } from './engine.ts';
import { canPass, stamp } from './limiter.ts';
import { ALT_GAIN, KISS_PLAY, SPLAT_PLAY } from './cues-alts.ts';

export type CueId =
  | 'step_gravel' | 'step_lawn' | 'bench_creak' | 'murmur' | 'laugh' | 'sigh' | 'gasp' | 'kiss' | 'ring' | 'happily'
  | 'parted' | 'bouquet' | 'coo' | 'flutter' | 'splat' | 'yap' | 'snatch' | 'wasp' | 'sprinkler' | 'slip'
  | 'mime' | 'rival_hmm' | 'foghorn' | 'fireworks' | 'clink' | 'bell_bike' | 'gate_hinge' | 'fountain' | 'plip' | 'hush'
  | 'lamp_hum' | 'petals' | 'sunbeam' | 'ready' | 'unlock' | 'ui_tap' | 'place' | 'refuse';

/**
 * What a trigger hands a cue. `voice` pitches voice-like cues (f x1.19, m x0.84); `child` is the child's laugh (f x1.3, 05 3.3 item 3);
 * `pan` replaces the pan the tile would give (plip, 05 4.8); `vol` multiplies the audibility (the far murmur x0.6, the rowboat's x0.5);
 * `pitch` multiplies a cue's frequencies (the pomeranian's yap x1.25); `delay` starts every note that much later; `n` is a cue's own count.
 */
export interface CueParams {
  actor?: number;
  voice?: 'f' | 'm';
  child?: boolean;
  n?: number;
  pan?: number;
  vol?: number;
  pitch?: number;
  delay?: number;
}

export interface CueDef {
  id: CueId;
  gain: number; // the row's peak before `a`
  gap: number; // real ms (05 2.4); 0 = none
  soft: boolean;
  unscaled?: boolean;
  scope: 'kind' | 'actor';
  thresh: number; // 0.02 positioned, 0 unpositioned (05 2.5)
  floor?: number; // a = max(floor, a) before the threshold test (GV 6189)
  duck?: { db: number; hold: number; amb?: boolean }; // 05 5.7
  play(x: number, y: number, a: number, pan: number, p: CueParams): void;
}

export const VOICE_GATE_MS = 110; // 05 2.4 item 4
export const STEP_STRIDE = 0.55; // tiles of travel per footstep (05 9 item 1)
const VOICE_SCALE = { f: 1.19, m: 0.84 } as const; // 05 2.5
const CHILD_SCALE = 1.3; // 05 3.3 item 3
const PHONE = 0.3; // the octave-up partial of 05 7.5 item 1
const DUCK6 = { db: -6, hold: 0.6 } as const;

function vf(p: CueParams): number {
  return p.child ? CHILD_SCALE : p.voice ? VOICE_SCALE[p.voice] : 1;
}

/** The 38 rows of 05 3.2, in order. Gains are the table's; every recipe multiplies its notes by `a` through g. */
export const CUES: Record<CueId, CueDef> = {
  step_gravel: {
    id: 'step_gravel', gain: 0.012, gap: 70, soft: false, scope: 'actor', thresh: 0.02,
    play(_x, _y, a, pan) {
      const g = 0.012 * a;
      grain(0.05, { f0: 900, f1: 400, gain: g, pan });
      grain(0.04, { f0: 700, f1: 350, delay: 0.03, gain: g * 0.6, pan });
    },
  },
  step_lawn: {
    id: 'step_lawn', gain: 0.008, gap: 70, soft: false, scope: 'actor', thresh: 0.02,
    play(_x, _y, a, pan) {
      const g = 0.008 * a;
      tone(150, 0.09, { to: 95, att: 0.01, gain: g, pan });
      tone(300, 0.09, { to: 190, att: 0.01, gain: g * PHONE, pan }); // 05 7.5 item 1
    },
  },
  bench_creak: {
    id: 'bench_creak', gain: 0.012, gap: 450, soft: false, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      const g = 0.012 * a; // GV 6162
      tone(118, 0.7, { to: 72, att: 0.12, gain: g, pan, wob: 7, wobd: 0.03 });
      tone(86, 0.5, { to: 60, delay: 0.35, att: 0.1, gain: g * 0.7, pan });
      tone(236, 0.7, { to: 144, att: 0.12, gain: g * PHONE, pan, wob: 7, wobd: 0.03 }); // 05 7.5 item 1
    },
  },
  murmur: {
    id: 'murmur', gain: 0.017, gap: 700, soft: true, scope: 'actor', thresh: 0.02,
    play(_x, _y, a, pan, p) {
      const g = 0.017 * a; // GV 6165: the base is the voice (190 m, 260 f), +-10 %
      const b = (p.voice === 'm' ? 190 : 260) * vrnd(0.9, 1.1);
      [1, 1.12, 0.94, 1.06].forEach((m, i) => tone(b * m, 0.42, { to: b * m * 0.97, att: 0.1, delay: i * 0.38, gain: g, pan, wob: 4, wobd: 0.02 }));
    },
  },
  laugh: {
    id: 'laugh', gain: 0.022, gap: 450, soft: true, scope: 'actor', thresh: 0.02, duck: DUCK6,
    play(_x, _y, a, pan, p) {
      const g = 0.022 * a, v = vf(p); // GV 6163
      tone(523 * v, 0.1, { to: 659 * v, att: 0.02, gain: g, pan });
      tone(622 * v, 0.12, { to: 784 * v, delay: 0.12, gain: g, pan });
      tone(587 * v, 0.14, { to: 740 * v, delay: 0.25, gain: g, pan });
    },
  },
  sigh: {
    id: 'sigh', gain: 0.02, gap: 600, soft: true, scope: 'actor', thresh: 0.02,
    play(_x, _y, a, pan, p) {
      const v = vf(p);
      tone(392 * v, 0.55, { to: 294 * v, att: 0.14, gain: 0.02 * a, pan, wob: 4, wobd: 0.02 });
    },
  },
  gasp: {
    id: 'gasp', gain: 0.026, gap: 500, soft: true, scope: 'actor', thresh: 0.02, duck: DUCK6,
    play(_x, _y, a, pan, p) {
      const g = 0.026 * a, v = vf(p);
      tone(330 * v, 0.12, { to: 523 * v, att: 0.02, gain: g, pan });
      tone(494 * v, 0.25, { delay: 0.13, att: 0.03, gain: g, pan });
    },
  },
  kiss: {
    id: 'kiss', gain: ALT_GAIN.kiss, gap: 2000, soft: true, scope: 'kind', thresh: 0.02, duck: DUCK6,
    play: (x, y, a, pan) => KISS_PLAY(ALT_GAIN.kiss * a, pan, x, y),
  },
  ring: {
    id: 'ring', gain: 0.02, gap: 3000, soft: true, scope: 'kind', thresh: 0.02, duck: DUCK6,
    play(_x, _y, a, pan) {
      const g = 0.02 * a;
      tone(1568, 1.2, { type: 'triangle', att: 0.005, gain: g, pan, wob: 6, wobd: 0.004 });
      tone(2349, 0.9, { type: 'triangle', delay: 0.02, gain: g * 0.4, pan });
    },
  },
  happily: {
    id: 'happily', gain: 0.03, gap: 4000, soft: true, scope: 'kind', thresh: 0.02, floor: 0.4, duck: DUCK6,
    play(_x, _y, a, pan) {
      const g = 0.03 * a; // GV sfxBuilt 6188-6191: a chord arpeggiated, the floor keeps it at 40 %
      [392, 494, 587, 784].forEach((f, i) => tone(f, 1.4, { delay: i * 0.12, att: 0.06, gain: g, pan }));
      tone(988, 0.9, { delay: 0.6, gain: g * 0.6, pan });
    },
  },
  parted: {
    id: 'parted', gain: 0.028, gap: 4000, soft: true, scope: 'kind', thresh: 0.02, floor: 0.4, duck: DUCK6,
    play(_x, _y, a, pan) {
      const g = 0.028 * a; // GV sfxLeave 6197 pattern: two falling notes
      tone(294, 0.7, { to: 277, att: 0.1, gain: g, pan });
      tone(247, 1.2, { delay: 0.55, att: 0.14, gain: g, pan, wob: 3, wobd: 0.015 });
    },
  },
  bouquet: {
    id: 'bouquet', gain: 0.018, gap: 900, soft: true, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      const g = 0.018 * a;
      tone(659, 0.18, { att: 0.02, gain: g, pan });
      tone(880, 0.35, { delay: 0.16, att: 0.03, gain: g, pan });
    },
  },
  coo: {
    id: 'coo', gain: 0.016, gap: 900, soft: false, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      const g = 0.016 * a; // GV 6203-6207
      tone(330, 0.45, { to: 294, att: 0.12, gain: g, pan, bus: 'amb' });
      tone(294, 0.75, { delay: 0.34, att: 0.14, gain: g, pan, wob: 3.4, wobd: 0.02, bus: 'amb' });
    },
  },
  flutter: {
    id: 'flutter', gain: 0.014, gap: 180, soft: false, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      for (let i = 0; i < 6; i++) grain(0.03, { f0: 500, f1: 300, delay: i * 0.055, gain: 0.014 * a * (1 - (0.6 * i) / 5), pan });
    },
  },
  splat: {
    id: 'splat', gain: ALT_GAIN.splat, gap: 300, soft: false, scope: 'kind', thresh: 0.02,
    play: (x, y, a, pan) => SPLAT_PLAY(ALT_GAIN.splat * a, pan, x, y),
  },
  yap: {
    id: 'yap', gain: 0.02, gap: 900, soft: false, scope: 'actor', thresh: 0.02,
    play(_x, _y, a, pan, p) {
      const g = 0.02 * a, k = p.pitch ?? 1; // GV sfxYip 6192
      tone(640 * k, 0.09, { to: 920 * k, att: 0.01, gain: g, pan });
      tone(720 * k, 0.08, { to: 1000 * k, delay: 0.14, att: 0.01, gain: g, pan });
    },
  },
  snatch: {
    id: 'snatch', gain: 0.024, gap: 600, soft: false, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      const g = 0.024 * a;
      grain(0.08, { f0: 700, f1: 250, gain: g, pan });
      tone(196, 0.12, { to: 262, delay: 0.06, att: 0.01, gain: g * 0.8, pan }); // the "hey"
    },
  },
  wasp: {
    id: 'wasp', gain: 0.01, gap: 400, soft: false, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      const g = 0.01 * a;
      tone(220, 0.45, { att: 0.03, gain: g, pan, wob: 28, wobd: 0.08 });
      tone(440, 0.45, { type: 'triangle', gain: g * 0.3, pan });
    },
  },
  sprinkler: {
    id: 'sprinkler', gain: 0.012, gap: 900, soft: false, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      const g = 0.012 * a;
      for (let i = 0; i < 6; i++) grain(0.03, { f0: 1800, f1: 900, delay: i * 0.09, gain: g * 0.7, pan });
      tone(90, 0.3, { to: 70, att: 0.05, gain: g, pan });
      tone(180, 0.3, { to: 140, att: 0.05, gain: g * PHONE, pan }); // 05 7.5 item 1
    },
  },
  slip: {
    id: 'slip', gain: 0.03, gap: 450, soft: false, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      const g = 0.03 * a;
      tone(523, 0.18, { to: 262, att: 0.01, gain: g, pan });
      tone(98, 0.12, { to: 70, delay: 0.2, att: 0.01, gain: g, pan });
      tone(196, 0.12, { to: 140, delay: 0.2, att: 0.01, gain: g * PHONE, pan }); // 05 7.5 item 1
    },
  },
  mime: {
    id: 'mime', gain: 0.012, gap: 1200, soft: true, scope: 'kind', thresh: 0.02, duck: { db: -18, hold: 0.6, amb: true },
    play(_x, _y, a, pan) {
      // no tone first: the ducks of cue() open the hole (05 5.7); then the small triangle blip once the hole is open
      tone(880, 0.05, { type: 'triangle', delay: 0.6, att: 0.004, gain: 0.012 * a, pan, dry: true });
    },
  },
  rival_hmm: {
    id: 'rival_hmm', gain: 0.018, gap: 1500, soft: true, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan, p) {
      const g = 0.018 * a, v = vf(p);
      tone(196 * v, 0.5, { to: 208 * v, att: 0.12, gain: g, pan, wob: 5, wobd: 0.02 });
      tone(233 * v, 0.3, { delay: 0.45, gain: g * 0.8, pan }); // "hmm?"
    },
  },
  foghorn: {
    id: 'foghorn', gain: 0.022, gap: 20000, soft: false, unscaled: true, scope: 'kind', thresh: 0.02, floor: 0.6,
    play(_x, _y, a, pan) {
      const g = 0.022 * a;
      tone(65, 1.8, { to: 62, att: 0.5, gain: g, pan, bus: 'amb' });
      tone(130, 1.6, { delay: 0.05, gain: g * 0.4, pan, bus: 'amb' }); // 05 7.5 item 1
    },
  },
  fireworks: {
    id: 'fireworks', gain: 0.04, gap: 350, soft: false, scope: 'kind', thresh: 0.02, duck: { db: -3, hold: 0.3 },
    play(_x, _y, a) {
      const g = 0.04 * a, pan = vrnd(-0.5, 0.5); // the row's own +-0.5 pan (visual RNG)
      tone(220, 0.5, { to: 880, att: 0.3, gain: g * 0.5, pan }); // launch
      tone(70, 0.45, { to: 40, delay: 0.55, att: 0.005, gain: g, pan }); // burst
      for (let i = 0; i < 3; i++) grain(0.06, { f0: 1500, f1: 400, delay: 0.55 + i * 0.07, gain: g * 0.6, pan });
    },
  },
  clink: {
    id: 'clink', gain: 0.01, gap: 700, soft: false, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      const g = 0.01 * a;
      tone(2637, 0.12, { type: 'triangle', att: 0.003, gain: g, pan, dry: true, bus: 'amb' });
      tone(3520, 0.08, { type: 'triangle', delay: 0.02, gain: g * 0.5, pan, bus: 'amb' });
    },
  },
  bell_bike: {
    id: 'bell_bike', gain: 0.012, gap: 6000, soft: false, scope: 'kind', thresh: 0.02,
    play(_x, _y, a) {
      const g = 0.012 * a; // the pass sweeps -0.7 to 0.7 over the two rings (05 3.2 row 26)
      tone(2093, 0.25, { type: 'triangle', att: 0.004, gain: g, pan: -0.7, panTo: 0, wob: 9, wobd: 0.008, bus: 'amb' });
      tone(2093, 0.25, { type: 'triangle', delay: 0.18, att: 0.004, gain: g * 0.8, pan: 0, panTo: 0.7, wob: 9, wobd: 0.008, bus: 'amb' });
    },
  },
  gate_hinge: {
    id: 'gate_hinge', gain: 0.01, gap: 1200, soft: false, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      const g = 0.01 * a;
      tone(392, 0.35, { type: 'triangle', to: 330, att: 0.15, gain: g, pan, wob: 6, wobd: 0.03 });
      tone(294, 0.2, { delay: 0.3, gain: g * 0.6, pan });
    },
  },
  fountain: {
    id: 'fountain', gain: 0.0045, gap: 0, soft: false, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      const f = vrnd(300, 700); // GV burble 6275-6278 (the table's pitch range)
      tone(f, vrnd(0.1, 0.18), { to: f * vrnd(0.72, 0.92), toAt: 0.9, att: 0.03, gain: 0.0045 * a, pan, bus: 'amb' });
    },
  },
  plip: {
    id: 'plip', gain: 0.0032, gap: 0, soft: false, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan, p) {
      const f = vrnd(420, 840) * (p.pitch ?? 1); // GV plip 6278; n = 1 on gravel or flagstone: the harder patter (05 4.8)
      tone(f, 0.07, { to: f * (p.n === 1 ? 0.7 : 0.8), att: 0.012, gain: 0.0032 * a, pan, bus: 'amb' });
    },
  },
  hush: {
    id: 'hush', gain: 0, gap: 0, soft: false, scope: 'kind', thresh: 0,
    play() {
      holdMix(1500, 0.46, 3); // no tone: the master lowpass and the shared reverb ease, then the weather's mix takes over (05 4.10)
    },
  },
  lamp_hum: {
    id: 'lamp_hum', gain: 0.01, gap: 3000, soft: false, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      const g = 0.01 * a;
      tone(200, 1.0, { att: 0.4, gain: g, pan, wob: 0.8, wobd: 0.01, bus: 'amb' });
      tone(400, 1.0, { gain: g * 0.25, pan, bus: 'amb' }); // 05 7.5 item 1
    },
  },
  petals: {
    id: 'petals', gain: 0.012, gap: 1500, soft: true, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      [1568, 1760, 2093, 2349, 2637].forEach((f, i) => tone(f, 0.35, { type: 'triangle', att: 0.01, delay: i * 0.07, gain: 0.012 * a * (1 - 0.125 * i), pan }));
    },
  },
  sunbeam: {
    id: 'sunbeam', gain: 0.014, gap: 3000, soft: true, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      for (const f of [262, 330, 392]) tone(f, 2.2, { type: 'triangle', att: 0.9, gain: 0.014 * a, pan, wob: 5, wobd: 0.004 }); // a swell
    },
  },
  ready: {
    id: 'ready', gain: 0.014, gap: 500, soft: false, scope: 'kind', thresh: 0,
    play(_x, _y, a) {
      const g = 0.014 * a;
      tone(1319, 0.12, { type: 'triangle', att: 0.004, gain: g, dry: true });
      tone(1760, 0.1, { type: 'triangle', delay: 0.09, gain: g * 0.8 });
    },
  },
  unlock: {
    id: 'unlock', gain: 0.03, gap: 4000, soft: true, scope: 'kind', thresh: 0, duck: DUCK6,
    play(_x, _y, a) {
      const g = 0.03 * a;
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.9, { type: 'triangle', delay: i * 0.14, att: 0.02, gain: g }));
      tone(1319, 1.3, { type: 'triangle', delay: 0.56, gain: g });
    },
  },
  ui_tap: {
    id: 'ui_tap', gain: 0.01, gap: 60, soft: false, scope: 'kind', thresh: 0,
    play(_x, _y, a) {
      tone(1047, 0.045, { type: 'triangle', att: 0.003, gain: 0.01 * a, dry: true });
    },
  },
  place: {
    id: 'place', gain: 0.022, gap: 120, soft: false, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      const g = 0.022 * a; // GV sfxTap 6141
      tone(262, 0.16, { to: 196, att: 0.02, gain: g, pan });
      tone(392, 0.12, { delay: 0.05, gain: g * 0.5, pan });
    },
  },
  refuse: {
    id: 'refuse', gain: 0.016, gap: 400, soft: false, scope: 'kind', thresh: 0,
    play(_x, _y, a) {
      const g = 0.016 * a;
      tone(330, 0.18, { to: 294, att: 0.03, gain: g });
      tone(277, 0.25, { delay: 0.16, gain: g * 0.8 });
    },
  },
};

export const CUE_IDS = Object.keys(CUES) as CueId[];

/** Steps (b) and (c) of 05 2.4 item 3 for a given audibility: false without stamping when inaudible or gated. */
export function admit(def: CueDef, a: number, p: CueParams = {}): boolean {
  if (a < def.thresh) return false;
  if (def.gap <= 0) return true; // paced by the ambience: no gap to keep
  const steps = def.id === 'step_gravel' || def.id === 'step_lawn'; // a patter, never a rattle: the kind gate, not the voice gate (05 3.3 item 6)
  const actor = def.scope === 'actor' && p.actor ? p.actor : 0;
  const key = actor ? def.id + ':' + actor : def.id;
  if (!canPass(key, def.gap, def.soft, def.unscaled)) return false;
  if (steps && actor && !canPass(def.id, def.gap, def.soft, def.unscaled)) return false;
  if (actor && !steps && !canPass('voice', VOICE_GATE_MS, false)) return false;
  stamp(key);
  if (steps && actor) stamp(def.id);
  if (actor && !steps) stamp('voice');
  return true;
}

/** Play a cue at a tile: true when a note was scheduled (05 2.5). Pass NaN for x and y to play it unpositioned (pan 0, a 1). */
export function cue(id: CueId, x: number, y: number, p: CueParams = {}): boolean {
  if (!isOn()) return false;
  if (isMuted()) {
    logPush(id, x, y, 0, false, 'muted'); // (a) nothing stamped
    return false;
  }
  if (stalled()) {
    logPush(id, x, y, 0, false, 'stalled'); // (a) a suspended or interrupted context hears nothing: no gap is stamped for it
    return false;
  }
  const def = CUES[id];
  const positioned = Number.isFinite(x) && Number.isFinite(y);
  let a = positioned ? audibleGain(x, y) : 1; // (b)
  if (def.floor) a = Math.max(def.floor, a);
  if (a < def.thresh) {
    logPush(id, x, y, a, false, 'inaudible');
    return false;
  }
  if (!admit(def, a, p)) {
    logPush(id, x, y, a, false, 'gated'); // (c)
    return false;
  }
  logPush(id, x, y, a, true, 'ok');
  if (def.duck) {
    duck(def.duck.db, def.duck.hold, 'music');
    if (def.duck.amb) duck(def.duck.db, def.duck.hold, 'amb');
  }
  const pan = p.pan ?? (positioned ? panOf(x, y) : 0);
  const aPlay = a * (p.vol ?? 1);
  if (p.delay) shifted(p.delay, () => def.play(x, y, aPlay, pan, p));
  else def.play(x, y, aPlay, pan, p); // (d)
  return true;
}
