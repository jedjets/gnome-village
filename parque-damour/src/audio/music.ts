// src/audio/music.ts
// The game music (05 section 5): motifs B Music-box lullaby and C Café swing, picked at the Music Gate on 2026-10-12 (register row 25, 3.13, 4);
// motif A, the musette waltz, is retired and lives in the board's motifs file for music-board.html only (05 5.9). This file holds the Motif interface
// of 05 6.2, BarSeq (the look-ahead sequencer), the shared voice(), the two motifs' voices and knobs (makeB with TINE_MAKEUP, makeC), the clock
// rule (wantedMotif), and the conductor: which motif plays, the phrase-start switch with its 2 s crossfade, the state read once per bar, the
// start, the look-ahead update and the stop (05 5.1 to 5.8). The planners and tables are the leaf modules motif-b.ts, motif-c.ts; the state
// table and the simulation reads are music-state.ts; the switch arithmetic is music-switch.ts. Imports nothing from the debug layer.
// Moved from the board's motifs file (commit 5bbc5f3, what the owner heard) with no number of 05 5.2, 5.3 or 5.5 changed. Ported from GV 6195–6196
// (sfxTune) as the only example of a scheduled phrase. NEW.
// Real time: every time here is AC.currentTime (the "two clocks" look-ahead, 05 5.8 item 2); the speed dial never reaches this file. Randomness is
// vrng only. The music reads the simulation and writes nothing to it (05 1 item 5). Under the engine's dry run (no AudioContext) the conductor
// runs on a fake context clock that updateMusic(dt) advances, and no node is made (08 2.8 note 14); the notes are kept in noteLog().
import { clamp } from '../core/math.ts';
import { T } from '../core/clock.ts';
import { busOf, duckDb, envelope, fadeMusic, getAC, getMusicLevel, isDryRun, isMuted, isOn, rampMusicRoom, setMusicLevel, setVerb, stalled } from './engine.ts';
import { TINE_GAIN, B_START, planBarB, planPhraseB } from './motif-b.ts';
import { CLAR_GAIN, COMP_S, cStart, planBarC, type CState } from './motif-c.ts';
import {
  BASE_BPM, DENSITY_DEFAULT, bindMusicState, busScale, fixedRow, readMusicInput, resetMusicState, rowOf, slewBpm, tempoTarget,
  type MotifId, type MusicInput, type StateName, type Variant,
} from './music-state.ts';
import { PHRASE_BARS, isPhraseStart, rampPlan, shouldSwitch, startXfade, type Ramp, type Xfade } from './music-switch.ts';

export type { MotifId, StateName, Variant };
export type MotifLetter = 'A' | 'B' | 'C';
/** Music Gate passed 2026-10-12 (register section 4): the owner keeps B and C; A, the waltz, is retired. Default use: C by day, B from dusk to dawn. */
export const MUSIC_PICK = { day: 'C', night: 'B' } as const satisfies Record<'day' | 'night', MotifLetter>;
/** The motif the game plays at the start of a new park (f = 0.30 is day). */
export const DEFAULT_MOTIF: MotifLetter = MUSIC_PICK.day;
/** The hours of the clock rule (05 5.4 item 1; register 3.13): C while f is in [DAY_FROM, DAY_TO), B otherwise. ADVISED, the owner may change them (05 9 open point 1). */
export const DAY_FROM = 0.2;
export const DAY_TO = 0.8;
export function wantedMotif(f: number): MotifId {
  return f >= DAY_FROM && f < DAY_TO ? MUSIC_PICK.day : MUSIC_PICK.night;
}

/** 05 5.1 item 3. */
export function freqOf(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
export const LOOKAHEAD = 0.35; // s (5.8 item 2)
const LATE_S = 0.4; // a note this far past its time (after a mute or a stall) is dropped, not played in a burst
/**
 * Voice-stage makeup of the gate mix (register section 4; 05 5.5 item 5, 7.2 item 3): every music voice's envelope peak is its recipe gain x
 * 4.5, the knobs and musicBus keep their recipe meaning. Measured at the gate: B rising -19.9 dBFS, C rising -19.5 dBFS at master.
 */
export const MUSIC_MAKEUP = 4.5;
/** Every B voice carries this on top of MUSIC_MAKEUP: a tine's exponential decay leaves it at ~0.17 of its peak in RMS (05 5.5 item 5). */
export const TINE_MAKEUP = 2;

/* ---------- 05 6.2 and 6.3: the Motif interface and the nine knobs ---------- */
export type Knob = { min: number; max: number; value: number };
/** 05 6.2; `update()` is the per-frame scheduler tick the board calls, `variant()` what is playing (null when stopped). */
export interface Motif {
  id: MotifLetter;
  name: string;
  play(variant: Variant): void;
  stop(): void;
  knobs: Record<string, Knob>;
  set(knob: string, v: number): void;
  update(): void;
  variant(): Variant | null;
}
const KNOB_RANGE: Record<string, [number, number]> = {
  tempo: [0.8, 1.2], detune: [0, 20], brightness: [1200, 3200], reverb: [0, 0.6], density: [0.3, 1.0],
  bass: [0, 0.06], chords: [0, 0.03], vibrato: [0, 1], level: [0.2, 0.8],
};
function knobs(defaults: Record<string, number>): Record<string, Knob> {
  const out: Record<string, Knob> = {};
  for (const k of Object.keys(KNOB_RANGE)) {
    const r = KNOB_RANGE[k] as [number, number];
    out[k] = { min: r[0], max: r[1], value: defaults[k] as number };
  }
  return out;
}
const kv = (ks: Record<string, Knob>, k: string): number => (ks[k] as Knob).value;

/* ---------- BarSeq: a bar-by-bar look-ahead sequencer (05 5.1 item 4, 5.8 item 2) ---------- */
type Ev = { t: number; fn: (t: number) => void };
type Bar = { events: Ev[]; len: number };
/** `build(bar, t0)` returns one bar's events at absolute context times and its length; update(now) plays what starts inside the look-ahead. */
export class BarSeq {
  bar = -1; // counted from the start: B's phrase bar is bar mod 4, C's loop bar is bar mod 8
  barStart = 0;
  len = 1;
  private events: Ev[] = [];
  private on = false;
  private limit = Infinity;
  private readonly build: (bar: number, t0: number) => Bar;
  constructor(build: (bar: number, t0: number) => Bar) {
    this.build = build;
  }
  /** Begin with bar 0 at the absolute time `t0`. */
  start(t0: number): void {
    this.on = true;
    this.limit = Infinity;
    this.bar = -1;
    this.barStart = t0;
    this.next(true);
  }
  stop(): void {
    this.on = false;
    this.events = [];
  }
  active(): boolean {
    return this.on;
  }
  /** After a mute (05 7.3 item 3): drop what is left of the bar in progress and build on to the next bar start at or after `now`. */
  resumeAt(now: number): void {
    this.events = [];
    while (this.on && this.barStart + this.len <= now) this.next(false);
    this.events = [];
  }
  /** No bar that would start at or after `t` is built and no note at or after it plays (the outgoing motif of a switch, 05 5.4 item 4b). */
  endAt(t: number): void {
    this.limit = t;
    this.events = this.events.filter((e) => e.t < t);
  }
  private next(first: boolean): void {
    if (!first) this.barStart += this.len;
    if (this.barStart >= this.limit) {
      this.stop();
      return;
    }
    this.bar++;
    const b = this.build(this.bar, this.barStart);
    this.events = b.events.filter((e) => e.t < this.limit).sort((x, y) => x.t - y.t);
    this.len = b.len;
  }
  update(now: number): void {
    if (!this.on) return;
    const horizon = now + LOOKAHEAD;
    // after a stall (a mute that kept the clock running, a hidden tab without suspend) skip the bars that are already over
    while (this.on && this.events.length === 0 && this.barStart + this.len < now - 0.5) {
      if (now - (this.barStart + this.len) > 60) this.barStart += Math.floor((now - this.barStart) / this.len - 1) * this.len; // hours: jump, then walk
      this.next(false);
      this.events = [];
    }
    for (let guard = 0; this.on && guard < 8; guard++) {
      while (this.events.length && (this.events[0] as Ev).t < horizon) {
        const ev = this.events.shift() as Ev;
        if (ev.t >= now - LATE_S) ev.fn(Math.max(ev.t, now));
      }
      if (this.events.length === 0 && this.barStart + this.len - 0.1 < horizon) this.next(false);
      else break;
    }
  }
}

/* ---------- 05 5.5: the shared voice ---------- */
type Part = { mul: number; amp: number; type: OscillatorType; detune?: number; decay?: number };
type Vib = { hz: number; pct: number; from: number; to: number };
type Layer = 'lh' | 'mel' | 'clar' | 'bass' | 'comp';
interface VoiceSpec { att: number; hold: number; lp: number; pan: number; parts: readonly Part[]; vib?: Vib }
/** What the scheduler handed to voice(), kept in a ring: the proxy for "heard" (peak is the envelope's, after the makeups). */
export interface NoteRec { t: number; motif: MotifId; layer: Layer; midi: number; dur: number; peak: number; pan: number }
const NOTES = 256;
const noteRing: NoteRec[] = [];
export function noteLog(): readonly NoteRec[] {
  return noteRing;
}

/** A motif's own gain into musicBus (05 5.4 item 4c), made on first use. */
interface Gm extends Motif {
  id: MotifId;
  out: GainNode | null;
  seq: BarSeq;
  last: BarParams | null; // what the last built bar was driven with
  begin(t0: number): void;
  halt(): void;
}
function outOf(g: Gm): GainNode | null {
  const AC = getAC(), bus = busOf('music');
  if (!AC || !bus) return null;
  if (!g.out) {
    g.out = AC.createGain();
    g.out.connect(bus);
  }
  return g.out;
}
/**
 * Additive voice: partials (one oscillator each through its own gain) into one enveloped gain, a lowpass Q 0.7, a StereoPanner at `pan`, the
 * motif's own gain, musicBus (dry: the music has its own room, 05 5.5 item 2). `gain` is the recipe's value; MUSIC_MAKEUP applies here.
 */
function voice(g: Gm, layer: Layer, midi: number, t: number, dur: number, gain: number, s: VoiceSpec): void {
  if (noteRing.length >= NOTES) noteRing.shift();
  noteRing.push({ t, motif: g.id, layer, midi, dur, peak: gain * MUSIC_MAKEUP, pan: s.pan });
  const AC = getAC(), out = outOf(g);
  if (!AC || !out || gain <= 0) return;
  const amp = AC.createGain();
  envelope(amp.gain, t, gain * MUSIC_MAKEUP, s.att, dur, s.hold);
  const flt = AC.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = s.lp;
  flt.Q.value = 0.7;
  amp.connect(flt);
  const pn = AC.createStereoPanner ? AC.createStereoPanner() : null;
  if (pn) {
    pn.pan.value = clamp(s.pan, -1, 1);
    flt.connect(pn);
    pn.connect(out);
  } else flt.connect(out);
  const f = freqOf(midi);
  const oscs: OscillatorNode[] = [];
  for (const p of s.parts) {
    const o = AC.createOscillator();
    o.type = p.type;
    o.frequency.value = f * p.mul;
    if (p.detune) o.detune.value = p.detune;
    const pg = AC.createGain();
    if (p.decay) envelope(pg.gain, t, p.amp, 0.004, p.decay); // a partial with its own, shorter decay (the tine's clang)
    else pg.gain.value = p.amp;
    o.connect(pg);
    pg.connect(amp);
    oscs.push(o);
  }
  if (s.vib && s.vib.pct > 0) {
    const lfo = AC.createOscillator();
    lfo.frequency.value = s.vib.hz;
    const depth = AC.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.setValueAtTime(0, t + s.vib.from);
    depth.gain.linearRampToValueAtTime(1200 * Math.log2(1 + s.vib.pct / 100), t + s.vib.to);
    lfo.connect(depth);
    for (const o of oscs) depth.connect(o.detune);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  for (const o of oscs) { o.start(t); o.stop(t + dur + 0.05); }
}

/** What the conductor hands a motif at the top of each bar (05 5.1 item 5, 5.6). */
interface BarParams { variant: Variant; bpm: number; density: number; pan: number; flourish: boolean; state: StateName | 'fixed' }

/* ====================================================================================================================
   B · Music-box lullaby (05 5.2, 5.5 item 3): a tine = sine + a sine at x2.76 x0.25 decaying in 0.25 s, 0.9 s whatever the beat (GV 6196).
   ==================================================================================================================== */
const TINE_PARTS = (cents: number): Part[] => {
  const p: Part[] = [{ mul: 1, amp: 1, type: 'sine' }, { mul: 2.76, amp: 0.25, type: 'sine', decay: 0.25 }];
  if (cents > 0) p.push({ mul: 1, amp: 0.5, type: 'sine', detune: cents }); // the detune knob: a second tine, chorused
  return p;
};
function makeB(): Gm {
  const ks = knobs({ tempo: 1.0, detune: 0, brightness: 2600, reverb: 0.45, density: 0.8, bass: 0.016, chords: 0.012, vibrato: 0, level: 0.5 });
  let phrase: number[] = [];
  let phraseN = 0;
  const g: Gm = {
    id: 'B', name: 'Music-box lullaby', knobs: ks, out: null, last: null,
    seq: new BarSeq((bar, t0) => {
      const p = driveFor('B', bar, t0);
      const beat = 60 / p.bpm;
      if (bar % PHRASE_BARS.B === 0 || phrase.length === 0) {
        const gv = (p.variant === 'rising' && phraseN === 0) || p.flourish; // GV's own phrase opens B and a flourish (5.2 item 5)
        phrase = planPhraseB(phrase[phrase.length - 1] ?? B_START[p.variant], p.variant, gv);
        phraseN++;
      }
      const gains = { bass: kv(ks, 'bass'), chords: kv(ks, 'chords'), melody: TINE_GAIN };
      const vib = kv(ks, 'vibrato');
      const events: Ev[] = planBarB(phrase, bar % PHRASE_BARS.B, p.variant, p.density).map((n) => ({
        t: t0 + n.beat * beat,
        fn: (t: number) => voice(g, n.layer, n.midi, t, 0.9, gains[n.gain] * TINE_MAKEUP, {
          att: 0.008, hold: 0, lp: kv(ks, 'brightness'), pan: n.layer === 'mel' ? p.pan : 0, parts: TINE_PARTS(kv(ks, 'detune')),
          vib: vib > 0 ? { hz: 5, pct: vib, from: 0.1, to: 0.3 } : undefined,
        }),
      }));
      return { events, len: 3 * beat };
    }),
    set: (k, v) => setKnob(ks, k, v),
    play: (v) => previewMusic('B', v),
    stop: () => {
      if (g.seq.active()) stopMusic();
    },
    update: () => updateMusic(0),
    variant: () => (g.seq.active() ? (g.last?.variant ?? null) : null),
    begin(t0) {
      phrase = [];
      phraseN = 0;
      g.last = null;
      g.seq.start(t0);
    },
    halt() {
      g.seq.stop();
      g.last = null;
    },
  };
  return g;
}

/* ====================================================================================================================
   C · Café swing (05 5.3, 5.5 item 4): clarinet (sine + triangle x0.3 + sine at 3f x0.08), walking bass (triangle), comp (triangles).
   ==================================================================================================================== */
function makeC(): Gm {
  const ks = knobs({ tempo: 1.0, detune: 0, brightness: 1800, reverb: 0.3, density: 0.7, bass: 0.03, chords: 0.01, vibrato: 0.5, level: 0.5 });
  let st: CState | null = null;
  const g: Gm = {
    id: 'C', name: 'Café swing', knobs: ks, out: null, last: null,
    seq: new BarSeq((bar, t0) => {
      const p = driveFor('C', bar, t0);
      const beat = 60 / p.bpm;
      st ??= cStart(p.variant);
      const r = planBarC(bar, p.variant, st, p.density, p.flourish && bar % PHRASE_BARS.C === 0);
      st = r.state;
      const events: Ev[] = r.notes.map((n) => ({
        t: t0 + n.beat * beat,
        fn: (t: number) => {
          if (n.voice === 'clar') {
            const dur = n.dur * beat;
            voice(g, 'clar', n.midi, t, dur, CLAR_GAIN, {
              att: 0.02, hold: Math.max(0, dur - 0.1), lp: kv(ks, 'brightness'), pan: p.pan,
              parts: [{ mul: 1, amp: 1, type: 'sine' }, { mul: 1, amp: 0.3, type: 'triangle', detune: kv(ks, 'detune') }, { mul: 3, amp: 0.08, type: 'sine' }],
              vib: { hz: 6, pct: kv(ks, 'vibrato'), from: 0.2, to: 0.4 },
            });
          } else if (n.voice === 'bass') {
            const dur = n.dur * beat;
            voice(g, 'bass', n.midi, t, dur, kv(ks, 'bass'), { att: 0.01, hold: dur * 0.3, lp: 500, pan: 0, parts: [{ mul: 1, amp: 1, type: 'triangle' }] });
          } else {
            voice(g, 'comp', n.midi, t, COMP_S, kv(ks, 'chords'), { att: 0.005, hold: 0, lp: 1200, pan: 0, parts: [{ mul: 1, amp: 1, type: 'triangle' }] });
          }
        },
      }));
      return { events, len: 4 * beat };
    }),
    set: (k, v) => setKnob(ks, k, v),
    play: (v) => previewMusic('C', v),
    stop: () => {
      if (g.seq.active()) stopMusic();
    },
    update: () => updateMusic(0),
    variant: () => (g.seq.active() ? (g.last?.variant ?? null) : null),
    begin(t0) {
      st = null;
      g.last = null;
      g.seq.start(t0);
    },
    halt() {
      g.seq.stop();
      g.last = null;
    },
  };
  return g;
}

/** The board's knobs: `reverb` also sets the shared return as built at the gate (05 6.3); `level` sets musicBus. The game never calls this. */
function setKnob(ks: Record<string, Knob>, k: string, v: number): void {
  const kn = ks[k];
  if (!kn) return;
  kn.value = clamp(v, kn.min, kn.max);
  if (k === 'reverb') setVerb(kn.value);
  if (k === 'level') setMusicLevel(kn.value);
}

const motifs: Record<MotifId, Gm> = { B: makeB(), C: makeC() };
const IDS: readonly MotifId[] = ['B', 'C'];
/** B and C as the board plays them (05 6.5 item 3e): the game's own. */
export const MOTIFS: Record<MotifId, Motif> = motifs;

/* ====================================================================================================================
   The conductor (05 5.4, 5.6, 5.8)
   ==================================================================================================================== */
/** One row of the decision log (the proxy for "heard": the switch, its ramps and the bars between, in context seconds). */
export interface MusicRow {
  t: number; kind: 'start' | 'bar' | 'switch' | 'ramp' | 'halt' | 'stop'; motif: MotifId; variant: Variant | null; bar: number; bpm: number;
  state: string; target?: 'gain' | 'room'; from?: number; to?: number; t1?: number; other?: MotifId; fixed?: boolean; density?: number; pan?: number;
}
const LOG_ROWS = 200;
const log: MusicRow[] = [];
function row(kind: MusicRow['kind'], motif: MotifId, t: number, o: Partial<MusicRow> = {}): void {
  const p = motifs[motif].last;
  if (log.length >= LOG_ROWS) log.shift();
  log.push({ t, kind, motif, variant: p?.variant ?? null, bar: motifs[motif].seq.bar, bpm: p?.bpm ?? 0, state: p?.state ?? '', ...o });
}
export function musicLog(): readonly MusicRow[] {
  return log;
}
export function clearMusicLog(): void {
  log.length = 0;
  noteRing.length = 0;
}

let playing: MotifId | null = null; // the lead: the motif whose bars read the state and the clock; during a switch, the incoming one
let xf: Xfade | null = null;
let fixed: Variant | null = null; // the board's and the Sound check's fixed variant: no state, no clock rule
let vnow = 0; // the fake context clock of the dry run
let fadeAt: { t: number; s: number } | null = null; // the game's fade-in begins when the first bar does (05 5.8 item 1)
let pendingFlourish = false;
let lastState: StateName | null = null;
let panCur = 0;
let busTarget = NaN;
let bound = false;
let gapped = false; // a muted frame went by: the sequencers rejoin at the next bar
let snap: { t0: number; want: MotifId; inp: MusicInput } | null = null;
const PAN_K = 1 - Math.exp(-2); // the busker pan eases with a 1 s time constant, once per bar of about 2 s (5.6 rule 5)

function clock(): number | null {
  const AC = getAC();
  return AC ? AC.currentTime : isDryRun() ? vnow : null;
}

/** musicBus x the avatar and busker scales, eased over about 1 s; a switch never calls this with a new value (05 5.4 item 7). */
function easeBus(target: number): void {
  if (target === busTarget) return;
  busTarget = target;
  const AC = getAC(), b = busOf('music');
  if (AC && b) b.gain.setTargetAtTime(target, AC.currentTime, 0.33);
}

/** The state of one bar of a game motif: read once per bar of the lead (05 5.6), applied as the bar is built. */
function readBar(id: MotifId, g: Gm, bar: number, t0: number): BarParams {
  if (!snap || snap.t0 !== t0) {
    const want = wantedMotif(T.f);
    snap = { t0, want, inp: readMusicInput(want === 'B') };
    panCur += ((snap.inp.busker?.pan ?? 0) - panCur) * PAN_K;
    easeBus(getMusicLevel() * busScale(snap.inp));
  }
  const { want, inp } = snap;
  const { state, row: r } = rowOf(id, inp);
  if (state === 'flourish' && lastState !== 'flourish') pendingFlourish = true; // entered: the next phrase start plays GV's phrase / the run
  lastState = state;
  if (shouldSwitch(id, want, bar, xf !== null)) beginSwitch(id, want, t0); // one switch at a time (5.4 item 6)
  const phraseStart = isPhraseStart(id, bar);
  const prev = g.last;
  const variant = !prev || phraseStart ? r.variant : prev.variant; // the variant changes only at a phrase start (5.6 rule 2)
  const target = tempoTarget(id, variant, kv(g.knobs, 'tempo'), r.tempo);
  const bpm = prev ? slewBpm(prev.bpm, target) : target; // at most 8 BPM a bar; the incoming motif starts at its own tempo
  const flourish = pendingFlourish && phraseStart;
  if (flourish) pendingFlourish = false;
  return { variant, bpm, density: Math.min(1, r.density * (kv(g.knobs, 'density') / DENSITY_DEFAULT[id])), pan: panCur, flourish, state };
}

/** Called by a motif's bar build (hoisted: the motifs are made before the conductor's state). */
function driveFor(id: MotifId, bar: number, t0: number): BarParams {
  const g = motifs[id];
  let p: BarParams;
  if (fixed) {
    const v = fixed;
    p = { variant: v, bpm: BASE_BPM[id][v] * kv(g.knobs, 'tempo'), density: Math.min(1, fixedRow(id, v).density * (kv(g.knobs, 'density') / DENSITY_DEFAULT[id])), pan: 0, flourish: false, state: 'fixed' };
  } else if (xf && id === xf.from && g.last) p = { ...g.last, flourish: false }; // the outgoing keeps what it had until T + 2 s
  else p = readBar(id, g, bar, t0);
  g.last = p;
  row('bar', id, t0, { bar, bpm: p.bpm, variant: p.variant, state: p.state, density: p.density, pan: p.pan });
  return p;
}

function applyRamp(r: Ramp, now: number): void {
  const AC = getAC();
  if (r.target === 'room') rampMusicRoom(r.from, r.to, r.t0, r.t1);
  else if (AC) {
    const n = outOf(motifs[r.motif]);
    if (n) {
      n.gain.cancelScheduledValues(now);
      n.gain.setValueAtTime(r.from, now);
      n.gain.setValueAtTime(r.from, r.t0);
      n.gain.linearRampToValueAtTime(r.to, r.t1);
    }
  }
  row('ramp', r.motif, r.t0, { target: r.target, from: r.from, to: r.to, t1: r.t1 });
}

/** At T = `t`, the start of the playing motif's phrase: the incoming starts its first bar, the outgoing runs on until T + 2 s (05 5.4 item 4). */
function beginSwitch(from: MotifId, to: MotifId, t: number): void {
  const now = clock() ?? t;
  const x = startXfade(from, to, t);
  xf = x;
  playing = to;
  motifs[from].seq.endAt(x.end);
  row('switch', from, t, { other: to });
  for (const r of rampPlan(x, kv(motifs[from].knobs, 'reverb'), kv(motifs[to].knobs, 'reverb'))) applyRamp(r, now);
  motifs[to].begin(t); // builds its first bar now, reading the snapshot of this bar
}

function haltAll(): void {
  for (const id of IDS) motifs[id].halt();
  playing = null;
  xf = null;
  fadeAt = null;
}

export interface StartOpts { motif?: MotifId; variant?: Variant; delayS?: number; fadeS?: number }
/**
 * Start the music (05 5.8 item 1): the wanted motif (wantedMotif(T.f)) at once, no crossfade; the game passes delayS 1.5 (the first bar starts 1.5 s
 * after the Begin or Continue tap) and its output fades 0 to 1 over 4 s from there. `variant` fixes the variant and ignores the state and the
 * clock rule (the board's Play buttons and the Sound check: fadeS 0.6). Nothing happens when the music already plays or no context exists.
 */
export function startMusic(o: StartOpts = {}): void {
  if (!getAC() && isDryRun() && playing === null) vnow = 0; // each start of the dry run has a fresh fake clock
  const now = clock();
  if (now === null || !isOn() || playing !== null) return;
  if (!bound) {
    bound = true;
    bindMusicState();
  }
  const id = o.motif ?? wantedMotif(T.f);
  const g = motifs[id];
  const t0 = now + (o.delayS ?? 0.08);
  fixed = o.variant ?? null;
  snap = null;
  pendingFlourish = false;
  lastState = null;
  panCur = 0;
  busTarget = NaN;
  playing = id;
  gapped = false;
  for (const m of IDS) {
    const n = outOf(motifs[m]);
    if (n) {
      n.gain.cancelScheduledValues(now);
      n.gain.setValueAtTime(m === id ? 1 : 0, now);
    }
  }
  const room = kv(g.knobs, 'reverb');
  rampMusicRoom(room, room, now, now);
  if (fixed) {
    setMusicLevel(kv(g.knobs, 'level'));
    fadeMusic(1, o.fadeS ?? 0.6);
  } else fadeAt = { t: t0, s: o.fadeS ?? 4 };
  row('start', id, t0, { fixed: fixed !== null });
  g.begin(t0);
}

/** The board's Play and the Sound check's buttons: motif `id` in a fixed variant, whatever played before stopped at once. */
export function previewMusic(id: MotifId, variant: Variant): void {
  if (playing !== null) {
    haltAll();
    fixed = null;
  }
  startMusic({ motif: id, variant, fadeS: 0.6 });
}

/** A new park: stop, forget the old park's endings and the log, and start again for its clock (05 5.8 item 5: stopMusic is used by New). */
export function restartMusic(delayS = 1.5): void {
  stopMusic();
  resetMusicState();
  clearMusicLog();
  startMusic({ delayS });
}

/** Fade the music out over 0.3 s and stop scheduling (05 5.8 item 5). */
export function stopMusic(): void {
  if (playing === null) return;
  const t = clock() ?? 0;
  row('stop', playing, t);
  haltAll();
  fixed = null;
  busTarget = NaN;
  fadeMusic(0, 0.3);
}

export function isPlaying(): boolean {
  return playing !== null;
}

/**
 * Every frame (05 5.8 item 2): schedule every note that starts inside the look-ahead, for both motifs while they cross. `dt` (real seconds) only
 * moves the fake clock of the dry run. Music keeps playing while the game is paused; a muted frame schedules nothing and the bars that went by
 * are skipped, so the music returns at the next bar (05 7.3 item 3).
 */
export function updateMusic(dt = 0): void {
  if (playing === null) return;
  if (!getAC()) {
    if (!isDryRun()) return;
    vnow += Math.min(0.05, Math.max(0, dt));
  }
  const now = clock();
  if (now === null || stalled()) return;
  if (isMuted()) {
    gapped = true;
    return;
  }
  if (gapped) {
    gapped = false;
    for (const id of IDS) motifs[id].seq.resumeAt(now); // the music returns at the next bar (05 7.3 item 3)
  }
  if (fadeAt && now >= fadeAt.t - 0.02) {
    fadeMusic(1, fadeAt.s);
    fadeAt = null;
  }
  if (xf && now >= xf.end) {
    row('halt', xf.from, now);
    motifs[xf.from].halt();
    xf = null;
  }
  for (const id of IDS) motifs[id].seq.update(now);
}

/** For the harness and the board readout (05 8.3). */
export function musicState(): {
  motif: MotifId | null; variant: Variant | null; state: string; bar: number; tempo: number; duck: number; level: number; playing: boolean;
  fixed: boolean; xfade: Xfade | null;
} {
  const g = playing ? motifs[playing] : null;
  return {
    motif: playing, variant: g?.last?.variant ?? null, state: g?.last?.state ?? 'stopped', bar: g ? g.seq.bar + 1 : 0, tempo: g?.last?.bpm ?? 0,
    duck: duckDb('music'), level: getMusicLevel(), playing: playing !== null, fixed: fixed !== null, xfade: xf ? { ...xf } : null,
  };
}
