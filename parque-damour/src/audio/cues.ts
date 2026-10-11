// src/audio/cues.ts
// The cue vocabulary of 05 section 3: each cue is two or three tone() or grain() calls behind one real-time gate.
// Ported from GV 6139–6207 (the shape of a cue: sfxGiggle 6163, sfxBuilt 6188–6191 as the recipe patterns). NEW.
// Verdict: ADAPT. Changes: the order inside cue() is (a) on/muted, (b) audibility against def.thresh, (c) gate, (d) play
//   (05 2.4 item 3; GV aOK ran first and an off-screen cue ate the gap, review §8); `voice` scales a voice-like cue ×1.19 (f) or
//   ×0.84 (m) (05 2.5); actor-scoped cues also pass the shared 'voice' gate of 110 ms (05 2.4 item 4); ducks per 05 5.7.
// S1 holds only the five cue-bed cues laugh, kiss, gasp, fireworks, splat (07 S1.5); S8 fills the 38 rows of 05 3.2 and bindCues.
// Dropped from the range: sfxThud, sfxRumble, sfxFall, sfxCrash, sfxBurner (05 2.1 last row).
import { vrnd } from '../core/rng.ts';
import { audibleGain, duck, grain, isMuted, isOn, panOf, tone } from './engine.ts';
import { canPass, stamp } from './limiter.ts';

export type CueId = 'laugh' | 'kiss' | 'gasp' | 'fireworks' | 'splat'; // S8: every id of 05 3.2, in its order

export interface CueParams {
  actor?: number;
  voice?: 'f' | 'm';
  n?: number;
}

export interface CueDef {
  id: CueId;
  gain: number; // the row's peak before `a`
  gap: number; // real ms (05 2.4)
  soft: boolean;
  unscaled?: boolean;
  scope: 'kind' | 'actor';
  thresh: number; // 0.02 positioned, 0 unpositioned (05 2.5)
  duck?: { db: number; hold: number; amb?: boolean }; // 05 5.7
  play(x: number, y: number, a: number, pan: number, p: CueParams): void;
}

export const VOICE_GATE_MS = 110; // 05 2.4 item 4
const VOICE_SCALE = { f: 1.19, m: 0.84 } as const; // 05 2.5

function vf(p: CueParams): number {
  return p.voice ? VOICE_SCALE[p.voice] : 1;
}

/** The five cue-bed cues of 05 3.2, rows 5, 8, 7, 24 and 15, recipe by recipe. */
export const CUES: Record<CueId, CueDef> = {
  laugh: {
    id: 'laugh', gain: 0.022, gap: 450, soft: true, scope: 'actor', thresh: 0.02, duck: { db: -6, hold: 0.6 },
    play(_x, _y, a, pan, p) {
      const g = 0.022 * a, v = vf(p);
      tone(523 * v, 0.1, { to: 659 * v, att: 0.02, gain: g, pan });
      tone(622 * v, 0.12, { to: 784 * v, delay: 0.12, gain: g, pan });
      tone(587 * v, 0.14, { to: 740 * v, delay: 0.25, gain: g, pan });
    },
  },
  kiss: {
    id: 'kiss', gain: 0.018, gap: 2000, soft: true, scope: 'kind', thresh: 0.02, duck: { db: -6, hold: 0.6 },
    play(_x, _y, a, pan) {
      const g = 0.018 * a;
      tone(784, 0.08, { att: 0.005, gain: g, pan, dry: true });
      tone(1046, 0.3, { to: 880, delay: 0.1, att: 0.02, gain: g, pan });
    },
  },
  gasp: {
    id: 'gasp', gain: 0.026, gap: 500, soft: true, scope: 'actor', thresh: 0.02, duck: { db: -6, hold: 0.6 },
    play(_x, _y, a, pan, p) {
      const g = 0.026 * a, v = vf(p);
      tone(330 * v, 0.12, { to: 523 * v, att: 0.02, gain: g, pan });
      tone(494 * v, 0.25, { delay: 0.13, att: 0.03, gain: g, pan });
    },
  },
  fireworks: {
    id: 'fireworks', gain: 0.04, gap: 350, soft: false, scope: 'kind', thresh: 0.02, duck: { db: -3, hold: 0.3 },
    play(_x, _y, a) {
      const g = 0.04 * a, pan = vrnd(-0.5, 0.5); // the row's own ±0.5 pan (visual RNG)
      tone(220, 0.5, { to: 880, att: 0.3, gain: g * 0.5, pan }); // launch
      tone(70, 0.45, { to: 40, delay: 0.55, att: 0.005, gain: g, pan }); // burst
      for (let i = 0; i < 3; i++) grain(0.06, { f0: 1500, f1: 400, delay: 0.55 + i * 0.07, gain: g * 0.6, pan });
    },
  },
  splat: {
    id: 'splat', gain: 0.03, gap: 300, soft: false, scope: 'kind', thresh: 0.02,
    play(_x, _y, a, pan) {
      const g = 0.03 * a;
      tone(170, 0.1, { to: 60, att: 0.004, gain: g, pan });
      grain(0.04, { f0: 1100, f1: 500, delay: 0.01, gain: g * 0.6, pan });
    },
  },
};

export const CUE_IDS = Object.keys(CUES) as CueId[];

/** Steps (b) and (c) of 05 2.4 item 3 for a given audibility: false without stamping when inaudible or gated. */
export function admit(def: CueDef, a: number, p: CueParams = {}): boolean {
  if (a < def.thresh) return false;
  const actor = def.scope === 'actor' && p.actor ? p.actor : 0;
  const key = actor ? def.id + ':' + actor : def.id;
  if (!canPass(key, def.gap, def.soft, def.unscaled)) return false;
  if (actor && !canPass('voice', VOICE_GATE_MS, false)) return false;
  stamp(key);
  if (actor) stamp('voice');
  return true;
}

/** Play a cue at a tile: true when a note was scheduled (05 2.5). Pass NaN for x and y to play it unpositioned (pan 0, a 1). */
export function cue(id: CueId, x: number, y: number, p: CueParams = {}): boolean {
  if (!isOn() || isMuted()) return false; // (a) nothing stamped
  const def = CUES[id];
  const positioned = Number.isFinite(x) && Number.isFinite(y);
  const a = positioned ? audibleGain(x, y) : 1; // (b)
  if (!admit(def, a, p)) return false; // (b) and (c)
  if (def.duck) {
    duck(def.duck.db, def.duck.hold, 'music');
    if (def.duck.amb) duck(def.duck.db, def.duck.hold, 'amb');
  }
  def.play(x, y, a, positioned ? panOf(x, y) : 0, p); // (d)
  return true;
}
