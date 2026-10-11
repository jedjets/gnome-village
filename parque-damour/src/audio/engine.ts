// src/audio/engine.ts
// Ported from GV 6056–6120 (initAudio, makeIR, panOf, audibleGain, tone, gtone).
// Verdict: PORT. Changes: makeIR and the grain buffer draw from a private mulberry32(0xA0D10), never the global random call GV used at 6077 (05 1 item 6);
//   three buses cueBus 1.0 / ambBus 0.85 / musicBus 0.50 sit between the voices and master and tone() picks one by o.bus (05 7.1);
//   tone() accepts type triangle | sawtooth | square and `hold` now holds the peak (05 2.3 item 2; review note 12 §11 item 4);
//   gtone becomes toneAt and copies the caller's options (09 2.7 gotcha); mute is a hard cut on master then a 2 s suspend (05 7.3);
//   duck() per 05 5.7; grain() per 05 2.3 item 5 (the one noise path); the music has its own convolver on the same IR so that
//   stopMusic() silences dry and wet within 0.3 s (05 5.8 item 5, 6.5 item 4); screenOf has no SEAS term (flat ground).
// Dropped from the range: the dead `y === undefined` guard of panOf (6082).
// Real time: this module never reads the wall clock; AC.currentTime is the music clock (05 1 item 3).
import { clamp, clamp01 } from '../core/math.ts';
import { mulberry32 } from '../core/rng.ts';
import { view } from '../render/camera.ts';
import { screenOf } from '../render/project.ts';

export type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square';
export type BusName = 'cue' | 'amb' | 'music';

/** The options of 05 2.3 item 1, exactly. */
export interface ToneOpts {
  delay?: number;
  type?: Wave;
  to?: number;
  toAt?: number; // glide target reached at dur * toAt (default 0.92, GV 6097)
  gain?: number; // peak (default 0.08 as GV 6099; cues always pass one)
  att?: number; // attack seconds (default 0.045, GV 6101)
  hold?: number; // seconds at the peak after the attack
  pan?: number;
  dry?: boolean;
  wob?: number; // LFO Hz
  wobd?: number; // LFO depth as a fraction of freq (default 0.05, GV 6109)
  bus?: BusName;
}

export interface GrainOpts {
  f0: number;
  f1: number;
  gain: number;
  pan?: number;
  delay?: number;
  bus?: BusName;
}

/* ---------- the locked numbers of 05 2.2 and 7.1 (GV 6061–6070) ---------- */
export const MASTER_GAIN = 0.84;
export const MASTER_LP = 2100;
export const VERB_GAIN = 0.36;
export const VERB_LP = 1600;
export const IR_SEC = 2.2;
export const IR_DECAY = 2.8;
export const BUS_GAIN: Record<BusName, number> = { cue: 1.0, amb: 0.85, music: 0.5 };
export const MUSIC_VERB_SEND = 0.6; // 05 5.5 item 2
export const GRAIN_MAX = 0.12; // 05 2.3 item 5
const PRIVATE_SEED = 0xa0d10;
const FLOOR = 0.0001; // the envelope floor of GV 6100

let AC: AudioContext | null = null;
let master: GainNode | null = null;
let masterLP: BiquadFilterNode | null = null;
let outNode: AudioNode | null = null; // the compressor: the last node before destination
let verb: ConvolverNode | null = null;
let verbGain: GainNode | null = null;
let musicVerbGain: GainNode | null = null;
let buses: Record<BusName, GainNode> | null = null;
let ducks: Record<'amb' | 'music', GainNode> | null = null;
let musicOut: GainNode | null = null; // dry + music reverb, faded by startMusic / stopMusic
let grainBuf: AudioBuffer | null = null;
let audioOn = false;
let muted = false;
let suspendTimer = 0;
let musicLevel = BUS_GAIN.music;
const duckState: Record<'amb' | 'music', { db: number; until: number }> = {
  amb: { db: 0, until: 0 },
  music: { db: 0, until: 0 },
};

/** GV 6073–6080 with the private stream in place of the global random call at 6077 (05 1 item 6). */
function makeIR(ac: AudioContext, sec: number, decay: number, rnd: () => number): AudioBuffer {
  const n = Math.floor(ac.sampleRate * sec);
  const b = ac.createBuffer(2, n, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const w = (rnd() * 2 - 1) * Math.pow(1 - t, decay);
      lp = lp * 0.74 + w * 0.26;
      d[i] = lp * 0.9;
    }
  }
  return b;
}

/** The 0.12 s noise block every grain() reads (05 2.3 item 5). */
function makeGrainBuffer(ac: AudioContext, rnd: () => number): AudioBuffer {
  const n = Math.floor(ac.sampleRate * GRAIN_MAX);
  const b = ac.createBuffer(1, n, ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
  return b;
}

/** GV 6056–6072: the master chain, the reverb, then the three buses of 05 7.1. Idempotent. */
export function initAudio(): void {
  if (AC) return;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctx = w.AudioContext || w.webkitAudioContext;
  if (!Ctx) return;
  let ac: AudioContext;
  try {
    ac = new Ctx();
  } catch {
    return;
  }
  AC = ac;
  master = ac.createGain();
  master.gain.value = MASTER_GAIN;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = MASTER_LP;
  lp.Q.value = 0.3;
  const hs = ac.createBiquadFilter();
  hs.type = 'highshelf';
  hs.frequency.value = 1100;
  hs.gain.value = -6;
  const cp = ac.createDynamicsCompressor();
  cp.threshold.value = -24;
  cp.knee.value = 28;
  cp.ratio.value = 3.0;
  cp.attack.value = 0.03;
  cp.release.value = 0.45;
  master.connect(lp);
  lp.connect(hs);
  hs.connect(cp);
  cp.connect(ac.destination);
  masterLP = lp;
  outNode = cp;

  const rnd = mulberry32(PRIVATE_SEED);
  const ir = makeIR(ac, IR_SEC, IR_DECAY, rnd);
  grainBuf = makeGrainBuffer(ac, rnd);

  // the shared reverb of cues and ambience (GV 6067–6070)
  verb = ac.createConvolver();
  verb.buffer = ir;
  verbGain = ac.createGain();
  verbGain.gain.value = VERB_GAIN;
  const vlp = ac.createBiquadFilter();
  vlp.type = 'lowpass';
  vlp.frequency.value = VERB_LP;
  vlp.Q.value = 0.2;
  verb.connect(vlp);
  vlp.connect(verbGain);
  verbGain.connect(master);

  // the buses (05 7.1); amb and music carry a duck stage (05 5.7)
  const cueBus = ac.createGain();
  cueBus.gain.value = BUS_GAIN.cue;
  cueBus.connect(master);
  const ambBus = ac.createGain();
  ambBus.gain.value = BUS_GAIN.amb;
  const ambDuck = ac.createGain();
  ambBus.connect(ambDuck);
  ambDuck.connect(master);
  const musicBus = ac.createGain();
  musicBus.gain.value = BUS_GAIN.music;
  const musicDuck = ac.createGain();
  musicBus.connect(musicDuck);
  musicOut = ac.createGain();
  musicOut.gain.value = 0;
  musicDuck.connect(musicOut);
  musicOut.connect(master);
  // the music's own room: same IR, 0.6 send, the same 1600 Hz return at 0.36; closed with musicOut so Stop is silent in 0.3 s
  const mSend = ac.createGain();
  mSend.gain.value = MUSIC_VERB_SEND;
  const mVerb = ac.createConvolver();
  mVerb.buffer = ir;
  const mlp = ac.createBiquadFilter();
  mlp.type = 'lowpass';
  mlp.frequency.value = VERB_LP;
  mlp.Q.value = 0.2;
  musicVerbGain = ac.createGain();
  musicVerbGain.gain.value = VERB_GAIN;
  musicDuck.connect(mSend);
  mSend.connect(mVerb);
  mVerb.connect(mlp);
  mlp.connect(musicVerbGain);
  musicVerbGain.connect(musicOut);

  buses = { cue: cueBus, amb: ambBus, music: musicBus };
  ducks = { amb: ambDuck, music: musicDuck };
  audioOn = true;
}

/* ---------- state ---------- */
export function getAC(): AudioContext | null {
  return AC;
}
export function isOn(): boolean {
  return audioOn;
}
export function isMuted(): boolean {
  return muted;
}
export function ctxState(): AudioContextState | 'none' {
  return AC ? AC.state : 'none';
}
/** The bus node a voice built outside tone() connects to (music.ts, debug/motifs.ts). */
export function busOf(name: BusName): GainNode | null {
  return buses ? buses[name] : null;
}
/** The shared convolver input for a voice that wants the cue reverb (1:1 unless dry, GV 6105). */
export function verbIn(): AudioNode | null {
  return verb;
}
/** The master gain node (for the board's analyser) and the compressor output. */
export function masterNode(): AudioNode | null {
  return master;
}
export function outputNode(): AudioNode | null {
  return outNode;
}

/* ---------- GV 6081–6089 ---------- */
export function panOf(x: number, y: number): number {
  const p = screenOf(x, y, 0);
  return clamp((p.x - view.cw / 2) / (view.cw * 0.55), -1, 1);
}
export function audibleGain(x: number, y: number): number {
  const p = screenOf(x, y, 0);
  const dx = Math.abs(p.x - view.cw / 2) / (view.cw * 0.85);
  const dy = Math.abs(p.y - view.chh / 2) / (view.chh * 0.85);
  return clamp01(1 - Math.max(dx, dy));
}

/** The GV envelope (6099–6102): floor → peak over att, optional hold, → floor at dur. Shared by tone(), grain() and the music voices. */
export function envelope(g: AudioParam, t: number, vol: number, att: number, dur: number, hold = 0): void {
  const a = Math.min(att, Math.max(0.002, dur * 0.5));
  g.setValueAtTime(FLOOR, t);
  g.exponentialRampToValueAtTime(vol, t + a);
  if (hold > 0) g.setValueAtTime(vol, Math.min(t + a + hold, t + dur - 0.005));
  g.exponentialRampToValueAtTime(FLOOR, t + dur);
}

/** Pan a node into a bus (and the shared reverb unless dry). GV 6104–6106 with the bus of 05 7.1. */
export function connectVoice(src: AudioNode, bus: BusName, pan: number, dry: boolean): void {
  if (!AC || !buses) return;
  const dest = buses[bus];
  const p = AC.createStereoPanner ? AC.createStereoPanner() : null;
  const tail: AudioNode = p ? (p.pan.value = clamp(pan, -1, 1), src.connect(p), p) : src;
  tail.connect(dest);
  // the music carries its own room after the bus; cues and ambience go 1:1 into the shared one (GV 6105)
  if (verb && !dry && bus !== 'music') tail.connect(verb);
}

/** GV 6090–6113. */
export function tone(freq: number, dur: number, o: ToneOpts = {}): void {
  if (!audioOn || muted || !AC) return;
  const t = AC.currentTime + (o.delay ?? 0);
  const osc = AC.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t + dur * (o.toAt ?? 0.92));
  const g = AC.createGain();
  const vol = Math.max(0.0008, o.gain ?? 0.08);
  envelope(g.gain, t, vol, o.att ?? 0.045, dur, o.hold ?? 0);
  osc.connect(g);
  connectVoice(g, o.bus ?? 'cue', o.pan ?? 0, !!o.dry);
  if (o.wob) {
    const l = AC.createOscillator();
    l.frequency.value = o.wob;
    const lg = AC.createGain();
    lg.gain.value = freq * (o.wobd ?? 0.05);
    l.connect(lg);
    lg.connect(osc.frequency);
    l.start(t);
    l.stop(t + dur + 0.05);
  }
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** GV 6114–6119 (gtone) as 05 2.3 item 3: audibility first, the options copied, never mutated. */
export function toneAt(x: number, y: number, freq: number, dur: number, o: ToneOpts = {}): boolean {
  const a = audibleGain(x, y);
  if (a <= 0.02) return false;
  tone(freq, dur, { ...o, pan: panOf(x, y), gain: (o.gain ?? 0.08) * a });
  return true;
}

/** 05 2.3 item 5: one noise burst through a gliding bandpass, always dry, at most 0.12 s. */
export function grain(dur: number, o: GrainOpts): void {
  if (!audioOn || muted || !AC || !grainBuf) return;
  const d = Math.min(GRAIN_MAX, Math.max(0.005, dur));
  const t = AC.currentTime + (o.delay ?? 0);
  const src = AC.createBufferSource();
  src.buffer = grainBuf;
  const bp = AC.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(Math.max(30, o.f0), t);
  bp.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t + d);
  const g = AC.createGain();
  envelope(g.gain, t, Math.max(0.0008, o.gain), 0.004, d);
  src.connect(bp);
  bp.connect(g);
  connectVoice(g, o.bus ?? 'cue', o.pan ?? 0, true);
  src.start(t);
  src.stop(t + d + 0.01);
}

/* ---------- 05 5.7: ducks; the deepest current value wins, none stack ---------- */
export function duck(db: number, holdS: number, bus: 'music' | 'amb' = 'music'): void {
  if (!AC || !ducks) return;
  const now = AC.currentTime;
  const st = duckState[bus];
  if (now < st.until && db > st.db) return; // a shallower duck never lifts a deeper one
  st.db = db;
  st.until = now + holdS;
  const g = ducks[bus].gain;
  g.cancelScheduledValues(now);
  g.setTargetAtTime(Math.pow(10, db / 20), now, 0.03);
  g.setTargetAtTime(1, now + holdS, 0.25);
}
/** The current duck depth in dB (0 when none holds), for the harness. */
export function duckDb(bus: 'music' | 'amb' = 'music'): number {
  if (!AC) return 0;
  const st = duckState[bus];
  return AC.currentTime < st.until ? st.db : 0;
}

/* ---------- levels the board and the ambience may automate (05 2.2 item 4, 6.3) ---------- */
export function setVerb(g: number, tc = 0.05): void {
  if (!AC || !verbGain || !musicVerbGain) return;
  verbGain.gain.setTargetAtTime(g, AC.currentTime, tc);
  musicVerbGain.gain.setTargetAtTime(g, AC.currentTime, tc);
}
export function setMasterLowpass(hz: number, tc = 2): void {
  if (!AC || !masterLP) return;
  masterLP.frequency.setTargetAtTime(hz, AC.currentTime, tc);
}
/** The `level` knob: musicBus 0.50 by default (05 7.1). */
export function setMusicLevel(v: number): void {
  musicLevel = v;
  if (!AC || !buses) return;
  buses.music.gain.setTargetAtTime(v, AC.currentTime, 0.05);
}
export function getMusicLevel(): number {
  return musicLevel;
}
/** Fade the music output (dry and its room) to `target` over `secs`; startMusic and stopMusic use it (05 5.8 items 1 and 5). */
export function fadeMusic(target: number, secs: number): void {
  if (!AC || !musicOut) return;
  const now = AC.currentTime;
  const g = musicOut.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(target, now + Math.max(0.01, secs));
}

/* ---------- mute, suspend, resume (05 7.3; GV 12199) ---------- */
export function setMuted(m: boolean): void {
  muted = m;
  if (!AC || !master) return;
  const now = AC.currentTime;
  if (m) {
    master.gain.setTargetAtTime(FLOOR, now, 0.02);
    clearTimeout(suspendTimer);
    suspendTimer = window.setTimeout(() => {
      if (muted) suspend();
    }, 2000);
  } else {
    clearTimeout(suspendTimer);
    resume();
    master.gain.setTargetAtTime(MASTER_GAIN, now, 0.04);
  }
}
export function suspend(): void {
  if (AC && AC.state === 'running') void AC.suspend();
}
export function resume(): void {
  if (AC && AC.state !== 'running') void AC.resume();
}
