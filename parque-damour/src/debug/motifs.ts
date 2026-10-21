// src/debug/motifs.ts
// Motif A, the retired musette waltz (05 5.9), for music-board.html and tests/melody.test.ts only: the 16-bar loops, the oom-pah-pah bass, the
// phrase planner on vrng, the accordion voice, the state table of the Music Gate and the look-ahead scheduler, wrapped as a `Motif` with id 'A'
// (05 6.2). Moved here from src/audio/music.ts at Slice 8 (05 6.5 item 3b) with no number changed; the names tests/melody.test.ts imports are
// kept. The game never plays it and src/main.ts never imports this file (05 6.1 item 2); do not retune or extend it (05 5.9).
// Ported from GV 6195–6196 (sfxTune, a 12-note pentatonic box) as the only example of a scheduled phrase. NEW.
// Planning (planPhrase, planRun, resolveState, stepTempo) is pure and runs without an AudioContext; scheduling reads AC.currentTime only through
// engine.ts. Nothing here reads the sim RNG, T.speed or the wall clock (05 1 items 3 and 6). The state comes from the stub `musicInput` the board sets.
import { vrng } from '../core/rng.ts';
import {
  busOf, connectVoice, duckDb, envelope, fadeMusic, getAC, getMusicLevel, isMuted, isOn, setMusicLevel, setVerb,
} from '../audio/engine.ts';
import { LOOKAHEAD, MUSIC_MAKEUP, freqOf, type Motif, type Variant } from '../audio/music.ts';

export type { Knob, Motif, Variant } from '../audio/music.ts';
export type Key = 'G' | 'Em';
export type StateName = 'flourish' | 'parted' | 'happily' | 'night' | 'rising' | 'stroll';

/** What the waltz reads once per bar: the Music Gate's state table. A stub the board sets; the game's state input is src/audio/music-state.ts. */
export interface MusicInput {
  featuredStage: number;
  affinityDelta: number; // affinity now minus affinity 30 sim s ago
  light: number; // T.light
  parted: boolean; // a Parted ending in the last 24 bars
  happily: boolean; // a Happily ending in the last 8 bars
  fireworks: boolean; // c_fireworks active
  buskerPan: number | null; // panOf(busker) while one plays audibly, else null
}
export const musicInput: MusicInput = {
  featuredStage: 0, affinityDelta: 0, light: 1, parted: false, happily: false, fireworks: false, buskerPan: null,
};

/* ---------- 5.1 form ---------- */
export const BASE_TEMPO = 164;
export const TEMPO_MIN = 120;
export const TEMPO_MAX = 176;
export const TEMPO_STEP = 8; // BPM per bar, at most (5.6)
export const MEL_LO = 67; // G4
export const MEL_HI = 86; // D6
function midiOf(pc: number, octave: number): number {
  return 12 * (octave + 1) + pc;
}

/* ---------- 5.2 chord loops ---------- */
export const CHORDS: Record<Key, readonly string[]> = {
  G: ['G', 'G', 'D7', 'D7', 'D7', 'D7', 'G', 'G', 'G', 'G7', 'C', 'C', 'G', 'D7', 'G', 'D7'],
  Em: ['Em', 'Em', 'B7', 'B7', 'B7', 'B7', 'Em', 'Em', 'Em', 'E7', 'Am', 'Am', 'Em', 'B7', 'Em', 'B7'],
};
/** Pitch classes root, third, fifth (, seventh). */
export const CHORD_TONES: Record<string, readonly number[]> = {
  G: [7, 11, 2], D7: [2, 6, 9, 0], G7: [7, 11, 2, 5], C: [0, 4, 7],
  Em: [4, 7, 11], B7: [11, 3, 6, 9], E7: [4, 8, 11, 2], Am: [9, 0, 4],
};
const SCALE_PC: Record<Key, readonly number[]> = { G: [7, 9, 11, 0, 2, 4, 6], Em: [4, 6, 7, 9, 11, 0, 2] };
/** C and F# in G (5.4 item 1); the same two non-pentatonic tones in E minor. May not start or end a phrase. */
export const PASSING_PC: Record<Key, readonly number[]> = { G: [0, 6], Em: [6, 0] };
export const TONIC: Record<Key, readonly number[]> = { G: [79, 67], Em: [76] }; // G5, G4; E5 (5.4 item 3)

/** The diatonic pitches of a key inside the melody range, ascending. */
export function scalePitches(key: Key, lo = MEL_LO, hi = MEL_HI): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (SCALE_PC[key].includes(m % 12)) out.push(m);
  return out;
}
export function chordPitches(chord: string, lo = MEL_LO, hi = MEL_HI): number[] {
  const pcs = CHORD_TONES[chord] ?? [];
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes(m % 12)) out.push(m);
  return out;
}
export function isChordTone(midi: number, chord: string): boolean {
  return (CHORD_TONES[chord] ?? []).includes(((midi % 12) + 12) % 12);
}
function nearest(cands: readonly number[], to: number, prefer = 0): number {
  let best = cands[0] ?? to, bd = Infinity;
  for (const c of cands) {
    const d = Math.abs(c - to) - (Math.sign(c - to) === prefer ? 0.01 : 0);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function nearestIndex(arr: readonly number[], v: number): number {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs((arr[i] as number) - v);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
function pickWeighted<T>(rand: () => number, items: readonly T[], weights: readonly number[]): T {
  let s = 0;
  for (const w of weights) s += w;
  let r = rand() * s;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i] as number;
    if (r < 0) return items[i] as T;
  }
  return items[items.length - 1] as T;
}

/* ---------- 5.4 the melody planner (pure) ---------- */
export interface Note {
  bar: number; // 0–3 inside the phrase
  beat: number; // 0-based, may be fractional
  dur: number; // beats
  midi: number;
  rest: boolean;
  vib: boolean; // vibrato (never on half-beat notes)
  grace: number | null; // upper scale neighbour, 60 ms, ×0.7 (5.4 item 6)
  tie: boolean; // bar 16: held through beat 1 of the next loop (5.4 item 3)
}
export interface PhrasePlan { key: Key; phrase: number; notes: Note[]; last: number; lastDelta: number }
export interface PlanCtx {
  key: Key;
  phrase: number; // 0–3 of the loop
  prevLast: number | null; // the previous phrase's last note
  prevDelta?: number; // the interval (scale degrees) into that note, so a leap there is still answered by a step
  tied: boolean; // true when bar 1 of this loop receives the tie (every loop after the first)
  density: number; // 0.3–1 (5.4 item 7)
}
const PATTERNS: readonly (readonly number[])[] = [[1, 1, 1], [2, 1], [1, 2], [3], [1, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]];
const PATTERN_W = [30, 20, 15, 10, 15, 10];
const LEAP = 2; // scale degrees: a third or more

/**
 * One 4-bar phrase by the rules of 5.4 items 1 to 7. `rand` is vrng in the game; a seeded stream in tests.
 * Intervals are chosen in scale degrees; a step intent fitted to a chord stays within one degree, so a realised leap only ever
 * follows a leap intent, and a leap intent is only allowed after a non-leap: two leaps never run the same way (item 4).
 * Bar 15 walks toward the bar-16 tonic by step, so the cadence leap, when there is one, follows a step.
 */
export function planPhrase(ctx: PlanCtx, rand: () => number = vrng): PhrasePlan {
  const { key } = ctx;
  const scale = scalePitches(key);
  const passing = PASSING_PC[key];
  const deg = (m: number): number => nearestIndex(scale, m);
  const nonPassing = (chord: string): number[] => chordPitches(chord).filter((m) => !passing.includes(m % 12));
  /** A chord tone within one degree of `from`, in the wanted direction when one exists (never widens a step into a leap). */
  const fitStep = (from: number, want: number, cands: number[]): number => {
    const i0 = deg(from);
    const near = cands.filter((c) => Math.abs(deg(c) - i0) <= 1);
    const inDir = near.filter((c) => want !== 0 && Math.sign(deg(c) - i0) === want);
    if (inDir.length) return inDir[0] as number;
    const same = near.filter((c) => deg(c) === i0);
    if (same.length) return same[0] as number;
    if (near.length) return near[0] as number;
    // no chord tone within a degree: the nearest one in the wanted direction, so a step after a leap never widens the same way
    const ahead = cands.filter((c) => want !== 0 && Math.sign(c - from) === want);
    return ahead.length ? nearest(ahead, from, want) : nearest(cands, from, want);
  };
  const notes: Note[] = [];
  let prev: number | null = null;
  let prevDelta = 0;
  let target: number | null = null; // the bar-16 tonic, chosen before bar 15
  for (let b = 0; b < 4; b++) {
    const gb = ctx.phrase * 4 + b;
    const chord = CHORDS[key][gb] as string;
    const arc = b < 2 ? 1 : -1; // rising in bars 1–2, falling in 3–4 (item 4)
    if (ctx.phrase === 3 && b === 2) target = nearest(TONIC[key], prev ?? ctx.prevLast ?? (TONIC[key][0] as number));
    let beat = 0;
    let pattern: readonly number[];
    if (gb === 15) pattern = [3];
    else if (b === 3) pattern = pickWeighted(rand, [[2, 1], [3]], [20, 10]); // the cadence
    else if (gb === 0 && ctx.tied) { pattern = pickWeighted(rand, [[1, 1], [2]], [1, 1]); beat = 1; }
    else pattern = pickWeighted(rand, PATTERNS, PATTERN_W);
    const cadence = b === 3;
    for (let k = 0; k < pattern.length; k++) {
      let dur = pattern[k] as number;
      const onBeat1 = beat === 0;
      const lastOfPhrase = cadence && k === pattern.length - 1;
      let midi: number;
      if (gb === 15) {
        midi = target ?? nearest(TONIC[key], prev ?? (TONIC[key][0] as number));
        if (prev !== null) prevDelta = deg(midi) - deg(prev);
      } else if (prev === null) {
        // the phrase start: a non-passing chord tone within a fifth of the last note, answering a leap with a step (items 1, 2, 4)
        let cands = nonPassing(chord);
        const ref = ctx.prevLast;
        if (ref !== null) {
          const inFifth = cands.filter((m) => Math.abs(m - ref) <= 7);
          if (inFifth.length) cands = inFifth;
          const i0 = deg(ref), pd = ctx.prevDelta ?? 0;
          if (Math.abs(pd) >= LEAP) {
            const steps = cands.filter((c) => Math.abs(deg(c) - i0) <= 1);
            const opp = steps.filter((c) => Math.sign(deg(c) - i0) !== Math.sign(pd));
            const notSame = cands.filter((c) => !(Math.abs(deg(c) - i0) >= LEAP && Math.sign(deg(c) - i0) === Math.sign(pd)));
            cands = opp.length ? opp : steps.length ? steps : notSame.length ? notSame : cands;
          }
        }
        midi = cands.length ? (cands[Math.floor(rand() * cands.length)] as number) : (TONIC[key][0] as number);
        if (ref !== null) prevDelta = deg(midi) - deg(ref);
      } else {
        const from = prev;
        const i0 = deg(from);
        let delta: number;
        if (Math.abs(prevDelta) >= LEAP) delta = -Math.sign(prevDelta); // a leap is answered by a step the other way
        else if (target !== null) {
          const d = deg(target) - i0;
          delta = d === 0 ? (rand() < 0.5 ? 1 : -1) : Math.sign(d); // bar 15: walk to the tonic by step
        } else {
          const r = rand();
          const size = r < 0.7 ? 1 : r < 0.9 ? 2 : 3 + Math.floor(rand() * 3);
          const dir = rand() < 0.6 ? arc : -arc;
          delta = dir * size;
        }
        let i1 = i0 + delta;
        if (i1 < 0 || i1 >= scale.length) i1 = i0 - delta; // reflect off the range
        i1 = Math.max(0, Math.min(scale.length - 1, i1));
        midi = scale[i1] as number;
        if (onBeat1 || lastOfPhrase) {
          const cands = lastOfPhrase ? nonPassing(chord) : chordPitches(chord);
          midi = Math.abs(delta) <= 1 ? fitStep(from, delta, cands) : nearest(cands, midi, Math.sign(delta));
        }
        prevDelta = deg(midi) - i0;
      }
      // bar 15 approaching the tonic: a first note that had to leap (no chord tone within a degree, e.g. D6 in E minor) must be
      // followed by a step before the bar-16 jump, so a single-note bar becomes [2, 1]
      if (target !== null && gb !== 15 && k === 0 && pattern.length === 1 && Math.abs(prevDelta) >= LEAP) {
        pattern = [2, 1];
        dur = 2;
      }
      const rest = !onBeat1 && !cadence && rand() > ctx.density;
      const vib = dur >= 1;
      let grace: number | null = null;
      if (dur >= 2 && rand() < 0.25) grace = scale.find((m) => m > midi) ?? null; // the upper scale neighbour, none above D6
      notes.push({ bar: b, beat, dur, midi, rest, vib, grace, tie: gb === 15 });
      prev = midi;
      beat += dur;
    }
  }
  const lastNote = notes[notes.length - 1] as Note;
  return { key, phrase: ctx.phrase, notes, last: lastNote.midi, lastDelta: prevDelta };
}

/** The flourish entry: a 4-bar scale run up to D6 (5.6), one step a beat, then D6 held. Phrase 4 keeps its cadence rule. */
export function planRun(ctx: PlanCtx, rand: () => number = vrng): PhrasePlan {
  if (ctx.phrase === 3) return planPhrase(ctx, rand);
  const { key } = ctx;
  const scale = scalePitches(key);
  const chord = CHORDS[key][ctx.phrase * 4] as string;
  const cands = chordPitches(chord).filter((m) => !PASSING_PC[key].includes(m % 12) && m <= 76);
  const ref = ctx.prevLast ?? 71;
  let midi = nearest(cands, ref);
  const notes: Note[] = [];
  let pos = ctx.phrase === 0 && ctx.tied ? 1 : 0;
  let i = nearestIndex(scale, midi);
  while (pos < 12 && midi < MEL_HI) {
    notes.push({ bar: Math.floor(pos / 3), beat: pos % 3, dur: 1, midi, rest: false, vib: true, grace: null, tie: false });
    i = Math.min(scale.length - 1, i + 1);
    midi = scale[i] as number;
    pos += 1;
  }
  if (pos < 12) notes.push({ bar: Math.floor(pos / 3), beat: pos % 3, dur: 12 - pos, midi: MEL_HI, rest: false, vib: true, grace: null, tie: false });
  return { key, phrase: ctx.phrase, notes, last: (notes[notes.length - 1] as Note).midi, lastDelta: 1 };
}

/* ---------- 5.6 the state table ---------- */
export interface StateRow {
  tempo: number; key: Key; bass: boolean; bassBeat1Only: boolean; chords: boolean; melody: boolean;
  counter: 'none' | 'even' | 'all'; density: number; lowpass: number;
}
export const STATES: Record<StateName, StateRow> = {
  flourish: { tempo: 176, key: 'G', bass: true, bassBeat1Only: false, chords: true, melody: true, counter: 'all', density: 1.0, lowpass: 2400 },
  parted: { tempo: 120, key: 'Em', bass: true, bassBeat1Only: true, chords: false, melody: true, counter: 'none', density: 0.45, lowpass: 1500 },
  happily: { tempo: 168, key: 'G', bass: true, bassBeat1Only: false, chords: true, melody: true, counter: 'even', density: 1.0, lowpass: 2200 },
  night: { tempo: 140, key: 'G', bass: true, bassBeat1Only: true, chords: false, melody: true, counter: 'none', density: 0.55, lowpass: 1500 },
  rising: { tempo: 164, key: 'G', bass: true, bassBeat1Only: false, chords: true, melody: true, counter: 'even', density: 0.85, lowpass: 1900 },
  stroll: { tempo: 156, key: 'G', bass: true, bassBeat1Only: false, chords: true, melody: true, counter: 'none', density: 0.7, lowpass: 1900 },
};
/** First match wins (5.6). */
export function resolveState(s: MusicInput): StateName {
  if (s.fireworks) return 'flourish';
  if (s.parted) return 'parted';
  if (s.happily) return 'happily';
  if (s.light < 0.22) return 'night';
  if (s.featuredStage >= 3 && s.affinityDelta > 0) return 'rising';
  return 'stroll';
}
/** One bar's tempo move: at most 8 BPM, inside 120–176. */
export function stepTempo(cur: number, target: number): number {
  const t = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, target));
  const d = t - cur;
  return Math.abs(d) <= TEMPO_STEP ? t : cur + Math.sign(d) * TEMPO_STEP;
}

/* ---------- 6.3 knobs (defaults of column A) ---------- */
export type KnobName = 'tempo' | 'detune' | 'brightness' | 'reverb' | 'density' | 'bass' | 'chords' | 'vibrato' | 'level';
export const MUSIC_KNOBS: Record<KnobName, { min: number; max: number; value: number }> = {
  tempo: { min: 0.8, max: 1.2, value: 1.0 },
  detune: { min: 0, max: 20, value: 7 },
  brightness: { min: 1200, max: 3200, value: 1900 },
  reverb: { min: 0, max: 0.6, value: 0.36 },
  density: { min: 0.3, max: 1.0, value: 0.85 },
  bass: { min: 0, max: 0.06, value: 0.034 },
  chords: { min: 0, max: 0.03, value: 0.012 },
  vibrato: { min: 0, max: 1, value: 0.3 },
  level: { min: 0.2, max: 0.8, value: 0.5 },
};
const KNOB_DEFAULT = { brightness: 1900, density: 0.85 };
export function setMusicKnob(k: KnobName, v: number): void {
  const kn = MUSIC_KNOBS[k];
  kn.value = Math.max(kn.min, Math.min(kn.max, v));
  if (k === 'reverb') setVerb(kn.value);
  if (k === 'level') setMusicLevel(kn.value);
}
const MELODY_GAIN = 0.04; // 5.5 item 5
const COUNTER_GAIN = 0.02;

/* ---------- 5.5 the voices ---------- */
/** The accordion reed: two sawtooths ±detune cents, a piccolo an octave up ×0.35, the held GV envelope, a lowpass, vibrato. */
function reed(midi: number, t: number, dur: number, gain: number, vib: boolean, pan: number, lp: number): void {
  const AC = getAC(), bus = busOf('music');
  if (!AC || !bus) return;
  const f = freqOf(midi);
  const g = AC.createGain();
  envelope(g.gain, t, gain, 0.03, dur, dur - 0.08 - 0.03);
  const flt = AC.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = lp;
  flt.Q.value = 0.7;
  g.connect(flt);
  connectVoice(flt, 'music', pan, true);
  const cents = MUSIC_KNOBS.detune.value;
  const oscs: OscillatorNode[] = [];
  for (const [mul, det, amp] of [[1, -cents, 1], [1, cents, 1], [2, 0, 0.35]] as const) {
    const o = AC.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f * mul;
    o.detune.value = det;
    if (amp === 1) o.connect(g);
    else {
      const ag = AC.createGain();
      ag.gain.value = amp;
      o.connect(ag);
      ag.connect(g);
    }
    oscs.push(o);
  }
  if (vib && MUSIC_KNOBS.vibrato.value > 0) {
    const lfo = AC.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = AC.createGain();
    const centsDepth = 1200 * Math.log2(1 + MUSIC_KNOBS.vibrato.value / 100);
    depth.gain.setValueAtTime(0, t);
    depth.gain.setValueAtTime(0, t + 0.15);
    depth.gain.linearRampToValueAtTime(centsDepth, t + 0.35);
    lfo.connect(depth);
    for (const o of oscs) depth.connect(o.detune);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  for (const o of oscs) { o.start(t); o.stop(t + dur + 0.05); }
}
/** Chord (sawtooth, lowpass 1400) and bass (triangle, lowpass 600) voices of 5.3 and 5.5 item 4. */
function filtered(type: OscillatorType, f: number, t: number, dur: number, gain: number, att: number, lp: number): void {
  const AC = getAC();
  if (!AC || gain <= 0) return;
  const o = AC.createOscillator();
  o.type = type;
  o.frequency.value = f;
  const g = AC.createGain();
  envelope(g.gain, t, gain, att, dur);
  const flt = AC.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = lp;
  o.connect(g);
  g.connect(flt);
  connectVoice(flt, 'music', 0, true);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/* ---------- 5.8 the scheduler ---------- */
type Ev = { t: number; fn: (t: number) => void };
let playing = false;
let barStart = 0;
let bar = 0; // 0–15
let tempo = STATES.stroll.tempo;
let key: Key = 'G';
let stateName: StateName = 'stroll';
let lpCur = 1900;
let panCur = 0;
let firstLoop = true;
let plan: PhrasePlan | null = null;
let prevPlan: PhrasePlan | null = null;
let events: Ev[] = [];
let barsPlayed = 0;
let runPending = false; // a flourish entry plans its scale run at the next phrase boundary (5.6)

function barLen(): number {
  return (60 / tempo) * 3;
}
function effectiveDensity(row: StateRow): number {
  return Math.min(1, row.density * (MUSIC_KNOBS.density.value / KNOB_DEFAULT.density));
}
function brightnessScale(): number {
  return MUSIC_KNOBS.brightness.value / KNOB_DEFAULT.brightness;
}

/** Enter the next bar: read the state once (5.6), step the tempo, change the key at a phrase boundary, plan, build the events. */
function advanceBar(): void {
  if (barsPlayed > 0) {
    barStart += barLen();
    bar = (bar + 1) % 16;
    if (bar === 0) firstLoop = false;
  }
  barsPlayed++;
  const s = resolveState(musicInput);
  if (s !== stateName && s === 'flourish') runPending = true;
  stateName = s;
  const row = STATES[s];
  tempo = stepTempo(tempo, row.tempo * MUSIC_KNOBS.tempo.value);
  const atPhrase = bar % 4 === 0;
  if (atPhrase && row.key !== key) key = row.key;
  const lpTarget = row.lowpass * brightnessScale();
  const k = 1 - Math.exp(-barLen() / 1); // the 1 s time constant, applied per bar
  lpCur += (lpTarget - lpCur) * k;
  const panTarget = musicInput.buskerPan ?? 0;
  panCur += (panTarget - panCur) * k;
  if (atPhrase) {
    prevPlan = plan;
    const ctx: PlanCtx = {
      key, phrase: bar / 4, prevLast: plan?.last ?? null, prevDelta: plan?.lastDelta ?? 0,
      tied: !(firstLoop && bar === 0), density: effectiveDensity(row),
    };
    plan = runPending ? planRun(ctx) : planPhrase(ctx);
    runPending = false;
  }
  buildBar(row);
}

function buildBar(row: StateRow): void {
  const beat = 60 / tempo;
  const b0 = barStart;
  const chord = CHORDS[key][bar] as string;
  const tones = CHORD_TONES[chord] as readonly number[];
  const lp = lpCur;
  events = [];
  if (row.bass) {
    const even = (bar + 1) % 2 === 0;
    const f = freqOf(even ? midiOf(tones[2] as number, 3) : midiOf(tones[0] as number, 2));
    const g = MUSIC_KNOBS.bass.value * MUSIC_MAKEUP;
    events.push({ t: b0, fn: (t) => { filtered('triangle', f, t, 0.55 * beat, g, 0.01, 600); filtered('triangle', f * 2, t, 0.55 * beat, g * 0.4, 0.01, 600); } });
  }
  if (row.chords && !row.bassBeat1Only) {
    const root = midiOf(tones[0] as number, 4);
    const third = root + ((((tones[1] as number) - (tones[0] as number)) % 12) + 12) % 12;
    const fifth = root + ((((tones[2] as number) - (tones[0] as number)) % 12) + 12) % 12;
    const g = MUSIC_KNOBS.chords.value * MUSIC_MAKEUP;
    for (const k of [1, 2]) {
      events.push({ t: b0 + k * beat, fn: (t) => { for (const m of [root, third, fifth]) filtered('sawtooth', freqOf(m), t, 0.42 * beat, g, 0.012, 1400 * brightnessScale()); } });
    }
  }
  const pb = bar % 4;
  if (row.melody && plan) {
    for (const n of plan.notes) {
      if (n.bar !== pb || n.rest) continue;
      const t = b0 + n.beat * beat;
      const dur = n.dur * beat + (n.tie ? 60 / stepTempo(tempo, row.tempo * MUSIC_KNOBS.tempo.value) : 0);
      const midi = n.midi, vib = n.vib, grace = n.grace, pan = panCur;
      const mg = MELODY_GAIN * MUSIC_MAKEUP;
      if (grace !== null) events.push({ t: t - 0.06, fn: (tt) => reed(grace, tt, 0.06, mg * 0.7, false, pan, lp) });
      events.push({ t, fn: (tt) => reed(midi, tt, dur, mg, vib, pan, lp) });
    }
  }
  const phraseIx = Math.floor(bar / 4);
  const counter = row.counter === 'all' || (row.counter === 'even' && phraseIx % 2 === 1);
  if (counter && prevPlan) {
    const scale = scalePitches(key, MEL_LO - 12, MEL_HI);
    for (const n of prevPlan.notes) {
      if (n.bar !== pb || n.rest) continue;
      const i = nearestIndex(scale, n.midi) - 5; // a diatonic sixth below (5.4 item 8)
      const midi = scale[Math.max(0, i)] as number;
      const t = b0 + n.beat * beat, dur = n.dur * beat + (n.tie ? beat : 0), pan = panCur;
      events.push({ t, fn: (tt) => reed(midi, tt, dur, COUNTER_GAIN * MUSIC_MAKEUP, false, pan, lp) });
    }
  }
  events.sort((a, b) => a.t - b.t);
}

/** Begin at the next moment; the output fades in over `fadeS` (the board passes 0.6 s). */
export function startWaltz(fadeS = 0.6): void {
  const AC = getAC();
  if (!AC || !isOn() || playing) return;
  playing = true;
  firstLoop = true;
  barsPlayed = 0;
  bar = 0;
  plan = null;
  prevPlan = null;
  stateName = resolveState(musicInput);
  runPending = stateName === 'flourish';
  tempo = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, STATES[stateName].tempo * MUSIC_KNOBS.tempo.value));
  key = STATES[stateName].key;
  lpCur = STATES[stateName].lowpass * brightnessScale();
  barStart = AC.currentTime + 0.08;
  setVerb(MUSIC_KNOBS.reverb.value);
  setMusicLevel(MUSIC_KNOBS.level.value);
  fadeMusic(1, fadeS);
  advanceBar();
}

/** Fade the music out over 0.3 s and stop scheduling (5.8 item 5). */
export function stopWaltz(): void {
  if (!playing) return;
  playing = false;
  events = [];
  fadeMusic(0, 0.3);
}

export function waltzPlaying(): boolean {
  return playing;
}

/** Every frame: schedule what starts inside the look-ahead window, move on to the next bar when this one is spent (5.8 item 2). */
export function updateWaltz(): void {
  const AC = getAC();
  if (!playing || !AC || isMuted()) return;
  const now = AC.currentTime;
  const horizon = now + LOOKAHEAD;
  // after a stall (a hidden tab without suspend) skip the bars that are already over instead of racing through them
  while (events.length === 0 && barStart + barLen() < now - 0.5) {
    advanceBar();
    events = [];
  }
  for (let guard = 0; guard < 8; guard++) {
    while (events.length && (events[0] as Ev).t < horizon) {
      const ev = events.shift() as Ev;
      ev.fn(Math.max(ev.t, now));
    }
    if (events.length === 0 && barStart + barLen() - 0.1 < horizon) advanceBar();
    else break;
  }
}

/** For the board readout and tools/audio-smoke.mjs (05 8.3). */
export function waltzState(): { state: StateName; bar: number; tempo: number; key: Key; duck: number; level: number; playing: boolean } {
  return { state: stateName, bar: bar + 1, tempo, key, duck: duckDb('music'), level: getMusicLevel(), playing };
}

/* ---------- the Motif of 05 6.2 for the board (the waltz's Play rising is its state `rising`, Play parted its state `parted`) ---------- */
export const MOTIF_A: Motif = {
  id: 'A',
  name: 'Musette waltz',
  knobs: MUSIC_KNOBS,
  set: (k, v) => setMusicKnob(k as KnobName, v),
  play(v: Variant) {
    musicInput.featuredStage = v === 'rising' ? 3 : 0;
    musicInput.affinityDelta = v === 'rising' ? 0.01 : 0;
    musicInput.parted = v === 'parted';
    musicInput.happily = false;
    musicInput.fireworks = false;
    musicInput.light = 1;
    musicInput.buskerPan = null;
    if (!playing) startWaltz(0.6); // a variant change while playing is a live state change
  },
  stop: stopWaltz,
  update: updateWaltz,
  variant: () => (playing ? (musicInput.parted ? 'parted' : 'rising') : null),
};
