// src/debug/motifs.ts
// Motifs B (music-box lullaby) and C (café swing) of the Music Gate, exactly per 05 6.2, each with the nine knobs of 6.3 and both
// variants, on the real engine (engine.ts buses, envelope, reverb). Imported only by debug/music-board.ts, never by main.ts (05 6.1).
// Ported from GV 6195–6196 (sfxTune: the 12-note pentatonic box seeds motif B). NEW.
// Randomness: vrng only (05 1 item 6). Scheduling: the same look-ahead pattern as audio/music.ts 5.8 on AC.currentTime.
import { vrng } from '../core/rng.ts';
import { busOf, connectVoice, envelope, fadeMusic, getAC, isMuted, isOn, setMusicLevel, setVerb } from '../audio/engine.ts';
import { freqOf, LOOKAHEAD } from '../audio/music.ts';

export type Variant = 'rising' | 'parted';
export type Knob = { min: number; max: number; value: number };
/** 05 6.2; `update()` is the per-frame scheduler tick the board calls, `variant()` what is playing (null when stopped). */
export interface Motif {
  id: 'A' | 'B' | 'C';
  name: string;
  play(variant: Variant): void;
  stop(): void;
  knobs: Record<string, Knob>;
  set(knob: string, v: number): void;
  update(): void;
  variant(): Variant | null;
}

type Ev = { t: number; fn: (t: number) => void };
type Bar = { events: Ev[]; len: number };

/** A bar-by-bar look-ahead scheduler (05 5.8 item 2): `build` returns one bar's events at absolute times and its length. */
class BarSeq {
  private events: Ev[] = [];
  private barStart = 0;
  private len = 1;
  private on = false;
  bar = -1;
  private readonly build: (bar: number, t0: number) => Bar;
  constructor(build: (bar: number, t0: number) => Bar) {
    this.build = build;
  }
  start(): void {
    const AC = getAC();
    if (!AC) return;
    this.on = true;
    this.bar = -1;
    this.barStart = AC.currentTime + 0.08;
    this.next(true);
  }
  stop(): void {
    this.on = false;
    this.events = [];
  }
  active(): boolean {
    return this.on;
  }
  private next(first: boolean): void {
    if (!first) this.barStart += this.len;
    this.bar++;
    const b = this.build(this.bar, this.barStart);
    this.events = b.events.sort((x, y) => x.t - y.t);
    this.len = b.len;
  }
  update(): void {
    const AC = getAC();
    if (!this.on || !AC || isMuted()) return;
    const now = AC.currentTime, horizon = now + LOOKAHEAD;
    while (this.events.length === 0 && this.barStart + this.len < now - 0.5) { this.next(false); this.events = []; }
    for (let guard = 0; guard < 8; guard++) {
      while (this.events.length && (this.events[0] as Ev).t < horizon) {
        const ev = this.events.shift() as Ev;
        ev.fn(Math.max(ev.t, now));
      }
      if (this.events.length === 0 && this.barStart + this.len - 0.1 < horizon) this.next(false);
      else break;
    }
  }
}

/* ---------- voices ---------- */
type Partial = { mul: number; amp: number; type: OscillatorType; detune?: number; decay?: number };
type Vib = { hz: number; pct: number; from: number; to: number };
/** Additive voice: partials into one enveloped gain, a lowpass, the music bus (dry: the music has its own room). */
function voice(f: number, t: number, dur: number, gain: number, att: number, hold: number, lp: number, pan: number, parts: readonly Partial[], vib?: Vib): void {
  const AC = getAC();
  if (!AC || !busOf('music') || gain <= 0) return;
  const g = AC.createGain();
  envelope(g.gain, t, gain, att, dur, hold);
  const flt = AC.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = lp;
  flt.Q.value = 0.7;
  g.connect(flt);
  connectVoice(flt, 'music', pan, true);
  const oscs: OscillatorNode[] = [];
  for (const p of parts) {
    const o = AC.createOscillator();
    o.type = p.type;
    o.frequency.value = f * p.mul;
    if (p.detune) o.detune.value = p.detune;
    const pg = AC.createGain();
    if (p.decay) envelope(pg.gain, t, p.amp, 0.004, p.decay); // a partial with its own, shorter decay (the tine's clang)
    else pg.gain.value = p.amp;
    o.connect(pg);
    pg.connect(g);
    oscs.push(o);
  }
  if (vib && vib.pct > 0) {
    const lfo = AC.createOscillator();
    lfo.frequency.value = vib.hz;
    const depth = AC.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.setValueAtTime(0, t + vib.from);
    depth.gain.linearRampToValueAtTime(1200 * Math.log2(1 + vib.pct / 100), t + vib.to);
    lfo.connect(depth);
    for (const o of oscs) depth.connect(o.detune);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  for (const o of oscs) { o.start(t); o.stop(t + dur + 0.05); }
}

function knobs(defaults: Record<string, number>): Record<string, Knob> {
  const range: Record<string, [number, number]> = {
    tempo: [0.8, 1.2], detune: [0, 20], brightness: [1200, 3200], reverb: [0, 0.6], density: [0.3, 1.0],
    bass: [0, 0.06], chords: [0, 0.03], vibrato: [0, 1], level: [0.2, 0.8],
  };
  const out: Record<string, Knob> = {};
  for (const k of Object.keys(range)) {
    const r = range[k] as [number, number];
    out[k] = { min: r[0], max: r[1], value: defaults[k] as number };
  }
  return out;
}
function setKnob(ks: Record<string, Knob>, k: string, v: number): void {
  const kn = ks[k];
  if (!kn) return;
  kn.value = Math.max(kn.min, Math.min(kn.max, v));
  if (k === 'reverb') setVerb(kn.value);
  if (k === 'level') setMusicLevel(kn.value);
}
function begin(ks: Record<string, Knob>): boolean {
  if (!getAC() || !isOn()) return false;
  setVerb((ks.reverb as Knob).value);
  setMusicLevel((ks.level as Knob).value);
  fadeMusic(1, 0.6);
  return true;
}

/* ====================================================================================================================
   B · Music-box lullaby (05 6.2 row B): kin of GV sfxTune 6195–6196.
   3/4 at 84 BPM, C major pentatonic over octaves 5–6; a tine = sine att 0.008 + a sine at ×2.76 ×0.25 decaying in 0.25 s,
   0.9 s long whatever the beat (GV 6196); left hand C4 G4 E5 on the three beats; 12-note phrases drawn like GV's phrase
   by step and third, cadence on C; gains 0.016 as GV. Parted: A minor pentatonic, 66 BPM, left hand on beat 1 only, density 0.5.
   ==================================================================================================================== */
const PENT_C = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93]; // C D E G A over octaves 5–6 (A minor pentatonic shares the set)
const GV_PHRASE = [72, 76, 79, 81, 79, 76, 74, 72, 74, 76, 79, 84]; // GV 6196: 523 659 784 880 784 659 587 523 587 659 784 1047
const TINE_GAIN = 0.016; // 05 6.2: "gains 0.016 as GV"
/** GV played sfxTune straight into master at a ~ 1; here a tine passes the 0.50 musicBus and the GV envelope's exponential decay
 *  leaves it at ~0.17 of its peak in RMS, so at 0.016 the box measured 0.001 rms against the waltz's 0.007 (tools/audio-smoke.mjs,
 *  round 1). ×3 peak-matches the box to the waltz on the board; every B voice carries it, the knob values keep the GV meaning. */
const TINE_MAKEUP = 3;
const TINE_PARTS = (cents: number): Partial[] => {
  const p: Partial[] = [{ mul: 1, amp: 1, type: 'sine' }, { mul: 2.76, amp: 0.25, type: 'sine', decay: 0.25 }];
  if (cents > 0) p.push({ mul: 1, amp: 0.5, type: 'sine', detune: cents }); // the detune knob: a second tine, chorused
  return p;
};

function makeB(): Motif {
  const ks = knobs({ tempo: 1.0, detune: 0, brightness: 2600, reverb: 0.45, density: 0.8, bass: 0.016, chords: 0.012, vibrato: 0, level: 0.5 });
  let variant: Variant | null = null;
  let phrase: number[] = [];
  let phraseN = 0;
  const tonic = (): number[] => (variant === 'parted' ? [81, 93, 69] : [72, 84]);
  /** 12 notes by step and third over the pentatonic, an arc up then down, cadence on the tonic (GV's phrase is phrase 1 when rising). */
  function planPhrase(prevLast: number): number[] {
    if (variant === 'rising' && phraseN === 0) return GV_PHRASE.slice();
    const out: number[] = [];
    let i = PENT_C.indexOf(prevLast);
    if (i < 0) i = 0;
    for (let k = 0; k < 12; k++) {
      if (k === 11) {
        const t = tonic().filter((m) => PENT_C.includes(m));
        let best = t[0] as number;
        for (const m of t) if (Math.abs(m - (PENT_C[i] as number)) < Math.abs(best - (PENT_C[i] as number))) best = m;
        out.push(best);
        break;
      }
      const size = vrng() < 0.65 ? 1 : 2;
      const arc = k < 6 ? 1 : -1;
      const dir = vrng() < 0.6 ? arc : -arc;
      let j = i + dir * size;
      if (j < 0 || j >= PENT_C.length) j = i - dir * size;
      i = Math.max(0, Math.min(PENT_C.length - 1, j));
      out.push(PENT_C[i] as number);
    }
    return out;
  }
  function tine(midi: number, t: number, gain: number): void {
    const vib = (ks.vibrato as Knob).value;
    voice(freqOf(midi), t, 0.9, gain * TINE_MAKEUP, 0.008, 0, (ks.brightness as Knob).value, 0, TINE_PARTS((ks.detune as Knob).value),
      vib > 0 ? { hz: 5, pct: vib, from: 0.1, to: 0.3 } : undefined);
  }
  const seq = new BarSeq((bar, t0) => {
    const bpm = (variant === 'parted' ? 66 : 84) * (ks.tempo as Knob).value;
    const beat = 60 / bpm;
    const ev: Ev[] = [];
    const bass = (ks.bass as Knob).value, ch = (ks.chords as Knob).value;
    if (variant === 'parted') {
      ev.push({ t: t0, fn: (t) => { tine(57, t, bass); tine(64, t, ch); tine(72, t, ch); } }); // A3 E4 C5, beat 1 only
    } else {
      ev.push({ t: t0, fn: (t) => tine(60, t, bass) }); // C4
      ev.push({ t: t0 + beat, fn: (t) => tine(67, t, ch) }); // G4
      ev.push({ t: t0 + 2 * beat, fn: (t) => tine(76, t, ch) }); // E5
    }
    if (bar % 4 === 0) {
      phrase = planPhrase(phrase[phrase.length - 1] ?? (variant === 'parted' ? 81 : 72));
      phraseN++;
    }
    const base = variant === 'parted' ? 0.5 : 0.8;
    const density = Math.min(1, base * ((ks.density as Knob).value / 0.8));
    for (let b = 0; b < 3; b++) {
      const midi = phrase[(bar % 4) * 3 + b] as number;
      if (b > 0 && vrng() > density) continue;
      ev.push({ t: t0 + b * beat, fn: (t) => tine(midi, t, TINE_GAIN) });
    }
    return { events: ev, len: 3 * beat };
  });
  return {
    id: 'B', name: 'Music-box lullaby', knobs: ks,
    set: (k, v) => setKnob(ks, k, v),
    play(v) {
      if (!begin(ks)) return;
      variant = v;
      phrase = [];
      phraseN = 0;
      seq.start();
    },
    stop() {
      if (!seq.active()) return;
      seq.stop();
      variant = null;
      fadeMusic(0, 0.3);
    },
    update: () => seq.update(),
    variant: () => variant,
  };
}

/* ====================================================================================================================
   C · Café swing (05 6.2 row C): 4/4 at 120 BPM, swing 2:1 on quavers, key F; chords per bar F6 · Gm7 C7 · F6 · Gm7 C7 ·
   B♭6 · B♭m6 · F6 D7 · Gm7 C7; walking bass on crotchets (triangle, lowpass 500: root, third, fifth, chromatic approach);
   "guitar" comp on 2 and 4 (three triangles, lowpass 1200, 0.15 s); clarinet melody (sine + triangle ×0.3 + sine ×3 ×0.08,
   vibrato 6 Hz 0.5 % from 0.2 s), phrases of 2 bars with a rest in bar 2. Parted: D minor table, 96 BPM, bass on 1 and 3,
   no comp, density 0.5.
   ==================================================================================================================== */
/** Chord symbol → pitch classes root, third, fifth, (sixth or seventh). */
const SWING_CHORDS: Record<string, readonly number[]> = {
  F6: [5, 9, 0, 2], Gm7: [7, 10, 2, 5], C7: [0, 4, 7, 10], Bb6: [10, 2, 5, 7], Bbm6: [10, 1, 5, 7], D7: [2, 6, 9, 0],
  Dm6: [2, 5, 9, 11], Em7b5: [4, 7, 10, 2], A7: [9, 1, 4, 7], Gm6: [7, 10, 2, 4], Bb7: [10, 2, 5, 8],
};
const SWING_BARS: Record<Variant, readonly string[]> = {
  rising: ['F6', 'Gm7 C7', 'F6', 'Gm7 C7', 'Bb6', 'Bbm6', 'F6 D7', 'Gm7 C7'],
  parted: ['Dm6', 'Em7b5 A7', 'Dm6', 'Em7b5 A7', 'Gm6', 'Gm6', 'Dm6 Bb7', 'Em7b5 A7'],
};
const SWING_SCALE: Record<Variant, readonly number[]> = { rising: [5, 7, 9, 10, 0, 2, 4], parted: [2, 4, 5, 7, 9, 10, 0] };
const SWING_BPM: Record<Variant, number> = { rising: 120, parted: 96 };
const CLAR_GAIN = 0.034;
const CLAR_LO = 65, CLAR_HI = 86;
function chordTones(chord: string, lo: number, hi: number): number[] {
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
function rootIn(chord: string, lo: number): number {
  const r = (SWING_CHORDS[chord] as readonly number[])[0] as number;
  let m = lo;
  while (m % 12 !== r) m++;
  return m;
}

function makeC(): Motif {
  const ks = knobs({ tempo: 1.0, detune: 0, brightness: 1800, reverb: 0.3, density: 0.7, bass: 0.03, chords: 0.01, vibrato: 0.5, level: 0.5 });
  let variant: Variant | null = null;
  let prevMel = 72;
  let prevBass = 41;
  const segs = (bar: number, v: Variant): string[] => (SWING_BARS[v][bar % 8] as string).split(' ');
  const scaleOf = (v: Variant): number[] => {
    const out: number[] = [];
    for (let m = CLAR_LO; m <= CLAR_HI; m++) if (SWING_SCALE[v].includes(m % 12)) out.push(m);
    return out;
  };
  function clarinet(midi: number, t: number, dur: number): void {
    const parts: Partial[] = [
      { mul: 1, amp: 1, type: 'sine' },
      { mul: 1, amp: 0.3, type: 'triangle', detune: (ks.detune as Knob).value },
      { mul: 3, amp: 0.08, type: 'sine' },
    ];
    voice(freqOf(midi), t, dur, CLAR_GAIN, 0.02, Math.max(0, dur - 0.1), (ks.brightness as Knob).value, 0, parts,
      { hz: 6, pct: (ks.vibrato as Knob).value, from: 0.2, to: 0.4 });
  }
  function bassNote(midi: number, t: number, dur: number): void {
    voice(freqOf(midi), t, dur, (ks.bass as Knob).value, 0.01, dur * 0.3, 500, 0, [{ mul: 1, amp: 1, type: 'triangle' }]);
  }
  function comp(chord: string, t: number): void {
    const root = rootIn(chord, 60);
    const pcs = SWING_CHORDS[chord] as readonly number[];
    const notes = [1, 2, 3].map((i) => root + ((((pcs[i] as number) - (pcs[0] as number)) % 12) + 12) % 12);
    for (const m of notes) voice(freqOf(m), t, 0.15, (ks.chords as Knob).value, 0.005, 0, 1200, 0, [{ mul: 1, amp: 1, type: 'triangle' }]);
  }
  const seq = new BarSeq((bar, t0) => {
    const v = variant ?? 'rising';
    const beat = 60 / (SWING_BPM[v] * (ks.tempo as Knob).value);
    const ev: Ev[] = [];
    const chords = segs(bar, v);
    const nextChords = segs(bar + 1, v);
    const segBeats = 4 / chords.length;
    // walking bass (rising: every crotchet; parted: beats 1 and 3)
    for (let s = 0; s < chords.length; s++) {
      const chord = chords[s] as string;
      const nextRoot = rootIn(s + 1 < chords.length ? (chords[s + 1] as string) : (nextChords[0] as string), 36);
      const root = rootIn(chord, 36);
      const pcs = SWING_CHORDS[chord] as readonly number[];
      const third = root + ((((pcs[1] as number) - (pcs[0] as number)) % 12) + 12) % 12;
      const fifth = root + ((((pcs[2] as number) - (pcs[0] as number)) % 12) + 12) % 12;
      const approach = nextRoot + (nextRoot >= prevBass ? -1 : 1);
      const walk = segBeats === 4 ? [root, third, fifth, approach] : [root, approach];
      for (let b = 0; b < segBeats; b++) {
        const beatIx = s * segBeats + b;
        if (v === 'parted' && beatIx % 2 === 1) continue;
        const midi = v === 'parted' ? (b === 0 ? root : fifth) : (walk[b] as number);
        prevBass = midi;
        ev.push({ t: t0 + beatIx * beat, fn: (t) => bassNote(midi, t, beat * 0.85) });
      }
    }
    // comp on 2 and 4 (rising only)
    if (v === 'rising') {
      for (const b of [1, 3]) {
        const chord = chords[Math.min(chords.length - 1, Math.floor(b / segBeats))] as string;
        ev.push({ t: t0 + b * beat, fn: (t) => comp(chord, t) });
      }
    }
    // clarinet: bar 1 of each pair sings in swung quavers, bar 2 answers with one note and rests
    const scale = scaleOf(v);
    const base = v === 'parted' ? 0.5 : 0.7;
    const density = Math.min(1, base * ((ks.density as Knob).value / 0.7));
    const step = (from: number, arc: number): number => {
      let i = scale.indexOf(from);
      if (i < 0) i = Math.max(0, scale.findIndex((m) => m >= from));
      const r = vrng();
      const size = r < 0.6 ? 1 : r < 0.85 ? 2 : 3 + Math.floor(vrng() * 2);
      const dir = vrng() < 0.6 ? arc : -arc;
      let j = i + dir * size;
      if (j < 0 || j >= scale.length) j = i - dir * size;
      return scale[Math.max(0, Math.min(scale.length - 1, j))] as number;
    };
    if (bar % 2 === 0) {
      for (let b = 0; b < 4; b++) {
        const chord = chords[Math.min(chords.length - 1, Math.floor(b / segBeats))] as string;
        const r = vrng();
        const arc = b < 2 ? 1 : -1;
        if (r >= 0.85) continue; // a breath
        let m1 = step(prevMel, arc);
        if (b % 2 === 0) m1 = nearestOf(chordTones(chord, CLAR_LO, CLAR_HI), m1);
        prevMel = m1;
        if (r < 0.5) {
          const m2 = step(m1, arc);
          prevMel = m2;
          const rest2 = vrng() > density;
          ev.push({ t: t0 + b * beat, fn: (t) => clarinet(m1, t, beat * 0.62) });
          if (!rest2) ev.push({ t: t0 + (b + 2 / 3) * beat, fn: (t) => clarinet(m2, t, beat * 0.3) }); // the swung second quaver
        } else {
          if (b > 0 && vrng() > density) continue;
          ev.push({ t: t0 + b * beat, fn: (t) => clarinet(m1, t, beat * 0.92) });
        }
      }
    } else {
      const m = nearestOf(chordTones(chords[0] as string, CLAR_LO, CLAR_HI), prevMel);
      prevMel = m;
      ev.push({ t: t0, fn: (t) => clarinet(m, t, beat * 1.5) });
    }
    return { events: ev, len: 4 * beat };
  });
  return {
    id: 'C', name: 'Café swing', knobs: ks,
    set: (k, v) => setKnob(ks, k, v),
    play(v) {
      if (!begin(ks)) return;
      variant = v;
      prevMel = v === 'parted' ? 69 : 72;
      prevBass = v === 'parted' ? 38 : 41;
      seq.start();
    },
    stop() {
      if (!seq.active()) return;
      seq.stop();
      variant = null;
      fadeMusic(0, 0.3);
    },
    update: () => seq.update(),
    variant: () => variant,
  };
}

export const MOTIFS: Record<'B' | 'C', Motif> = { B: makeB(), C: makeC() };
