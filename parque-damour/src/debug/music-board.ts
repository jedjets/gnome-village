// src/debug/music-board.ts
// The Music Gate board (05 section 6): three motifs on the real engine, nine knobs each, both variants, the cue bed, Choose.
// Third Vite entry; never imported by main.ts (05 6.1 item 2). NEW. Since S8 part B (05 6.5 item 3e) it plays A, the retired waltz, from
// src/debug/motifs.ts and B and C from src/audio/music.ts: the game's own motifs, in a fixed variant (no state, no clock rule).
// window.__PDAUDIO (rms, peak on an AnalyserNode at master) is installed in DEV or under #debug so tools/audio-smoke.mjs can measure.
import { vrng } from '../core/rng.ts';
import { setViewport } from '../render/camera.ts';
import {
  busOf, ctxState, getAC, initAudio, masterNode, outputNode, resume, isOn,
} from '../audio/engine.ts';
import { setNow } from '../audio/limiter.ts';
import { cue, CUE_IDS, type CueId } from '../audio/cues.ts';
import { MOTIFS, musicState, updateMusic, type Motif, type Variant } from '../audio/music.ts';
import { MOTIF_A, waltzPlaying, waltzState } from './motifs.ts';
import { getProfile, setMusicPick } from '../save/store.ts';
import { $, ageToast, toast } from '../ui/dom.ts';
import { t } from '../ui/i18n.ts';

type Letter = 'A' | 'B' | 'C';
const LETTERS: Letter[] = ['A', 'B', 'C'];
type KnobName = 'tempo' | 'detune' | 'brightness' | 'reverb' | 'density' | 'bass' | 'chords' | 'vibrato' | 'level';
const KNOBS: KnobName[] = ['tempo', 'detune', 'brightness', 'reverb', 'density', 'bass', 'chords', 'vibrato', 'level'];
const STEP: Record<KnobName, number> = { tempo: 0.01, detune: 0.5, brightness: 10, reverb: 0.01, density: 0.01, bass: 0.001, chords: 0.0005, vibrato: 0.01, level: 0.01 };
const NAME_KEY: Record<Letter, string> = { A: 'gate.motif_name.A', B: 'gate.motif_name.B', C: 'gate.motif_name.C' };
const HEAD_KEY: Record<Letter, string> = { A: 'gate.motif.A', B: 'gate.motif.B', C: 'gate.motif.C' };

const motifs: Record<Letter, Motif> = { A: MOTIF_A, B: MOTIFS.B, C: MOTIFS.C };

let selected: Letter = 'A';
const readouts: Partial<Record<Letter, HTMLPreElement>> = {};
const outputs: Partial<Record<Letter, Record<string, HTMLOutputElement>>> = {};
const playBtns: Partial<Record<Letter, Record<Variant, HTMLButtonElement>>> = {};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function enable(): void {
  initAudio();
  resume();
  const b = document.getElementById('banner');
  if (b) b.hidden = true;
  installHook();
}

function stopAll(): void {
  for (const L of LETTERS) motifs[L].stop();
  refreshPressed();
}

function play(L: Letter, v: Variant): void {
  enable();
  for (const o of LETTERS) if (o !== L) motifs[o].stop(); // one context, one musicBus (6.4 item 3)
  motifs[L].play(v);
  refreshPressed();
  updateReadout(L);
}

function refreshPressed(): void {
  for (const L of LETTERS) {
    const v = motifs[L].variant();
    const pb = playBtns[L];
    if (!pb) continue;
    pb.rising.setAttribute('aria-pressed', String(v === 'rising'));
    pb.parted.setAttribute('aria-pressed', String(v === 'parted'));
  }
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}

function updateReadout(L: Letter): void {
  const m = motifs[L];
  const knobs: Record<string, number> = {};
  for (const k of KNOBS) {
    knobs[k] = Math.round((m.knobs[k]?.value ?? 0) * 10000) / 10000;
    const out = outputs[L]?.[k];
    if (out) out.value = fmt(knobs[k] as number);
  }
  const data: Record<string, unknown> = { motif: L, variant: m.variant(), knobs };
  if (L === 'A') data.state = waltzState();
  else if (m.variant()) data.state = musicState();
  const pre = readouts[L];
  if (pre) pre.textContent = JSON.stringify(data, null, 1);
}

function knobRow(L: Letter, k: KnobName): HTMLElement {
  const m = motifs[L];
  const kn = m.knobs[k] as { min: number; max: number; value: number };
  const row = el('label', 'knob');
  const name = el('code', undefined, k); // knob ids are code identifiers, like cue ids (05 9 item 12)
  const input = el('input');
  input.type = 'range';
  input.min = String(kn.min);
  input.max = String(kn.max);
  input.step = String(STEP[k]);
  input.value = String(kn.value);
  input.setAttribute('aria-label', k);
  const out = el('output', undefined, fmt(kn.value));
  input.addEventListener('input', () => {
    m.set(k, parseFloat(input.value));
    updateReadout(L);
  });
  (outputs[L] ??= {})[k] = out;
  row.append(name, input, out);
  return row;
}

function panel(L: Letter): HTMLElement {
  const p = el('section', 'panel' + (L === selected ? ' sel' : ''));
  p.id = 'panel-' + L;
  p.append(el('h2', undefined, t(HEAD_KEY[L])));
  const cap = el('p', 'cap');
  cap.append(t('gate.caption.' + L + '.1'), el('br'), t('gate.caption.' + L + '.2'));
  p.append(cap);
  const btns = el('div', 'btns');
  const mk = (id: string, label: string, fn: () => void): HTMLButtonElement => {
    const b = el('button', 'gb glass', label);
    b.id = id;
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  const rising = mk('play-' + L + '-rising', t('gate.play_rising'), () => play(L, 'rising'));
  const parted = mk('play-' + L + '-parted', t('gate.play_parted'), () => play(L, 'parted'));
  const stop = mk('stop-' + L, t('gate.stop'), () => { motifs[L].stop(); refreshPressed(); updateReadout(L); });
  rising.setAttribute('aria-pressed', 'false');
  parted.setAttribute('aria-pressed', 'false');
  playBtns[L] = { rising, parted };
  btns.append(rising, parted, stop);
  p.append(btns);
  for (const k of KNOBS) p.append(knobRow(L, k));
  const pre = el('pre');
  pre.id = 'readout-' + L;
  readouts[L] = pre;
  p.append(pre);
  const choose = el('button', 'choose', t('gate.choose', { letter: L }));
  choose.id = 'choose-' + L;
  choose.type = 'button';
  choose.setAttribute('aria-pressed', String(getProfile().musicPick === L));
  choose.addEventListener('click', () => {
    setMusicPick(L);
    for (const o of LETTERS) document.getElementById('choose-' + o)?.setAttribute('aria-pressed', String(o === L));
    toast('gate.picked.music', { name: '@' + NAME_KEY[L] });
  });
  p.append(choose);
  updateReadout(L);
  return p;
}

function select(L: Letter): void {
  selected = L;
  for (const o of LETTERS) {
    document.getElementById('panel-' + o)?.classList.toggle('sel', o === L);
    document.querySelector('#switch [data-l="' + o + '"]')?.setAttribute('aria-pressed', String(o === L));
  }
}

function build(): void {
  document.title = t('gate.music.title');
  $('title').textContent = t('gate.music.title');
  const banner = $('banner');
  banner.textContent = '';
  banner.append(el('span', undefined, t('gate.enable_sound')));
  banner.addEventListener('pointerdown', enable, { once: true });
  const sw = $('switch');
  for (const L of LETTERS) {
    const b = el('button', 'gb', L);
    b.type = 'button';
    b.dataset.l = L;
    b.setAttribute('aria-pressed', String(L === selected));
    b.addEventListener('click', () => select(L));
    sw.append(b);
  }
  const stopAllBtn = $('stopAll');
  stopAllBtn.textContent = t('gate.stop_all');
  stopAllBtn.addEventListener('click', stopAll);
  const panels = $('panels');
  for (const L of LETTERS) panels.append(panel(L));
  $('cuebedTitle').textContent = t('gate.cue_bed');
  const row = $('cuebedRow');
  for (const id of CUE_IDS) {
    const b = el('button', 'gb glass', id);
    b.id = 'cue-' + id;
    b.type = 'button';
    b.addEventListener('click', () => {
      enable();
      cue(id as CueId, NaN, NaN, { voice: vrng() < 0.5 ? 'f' : 'm' }); // unpositioned: pan 0, a 1 (6.4 item 4)
    });
    row.append(b);
  }
  fitView();
  window.addEventListener('resize', fitView, { passive: true });
}

/** panOf and audibleGain read the viewport (GV 6082–6087); the board has no canvas, so the window is the view. */
function fitView(): void {
  setViewport(window.innerWidth, window.innerHeight, 1);
}

/* ---------- the measuring hook (tools/audio-smoke.mjs) ---------- */
type Hook = {
  rms(): number; cueRms(): number; peak(): number; peakHold(): number; outPeakHold(): number; resetPeak(): void;
  state(): { ctx: AudioContextState | 'none'; on: boolean; music: ReturnType<typeof musicState>; waltz: ReturnType<typeof waltzState>; playing: Record<Letter, Variant | null> };
};
let hookTick: (() => void) | null = null;
function installHook(): void {
  if (hookTick) return;
  if (!(import.meta.env.DEV || /debug/.test(location.hash))) return;
  const AC = getAC(), m = masterNode(), cb = busOf('cue'), out = outputNode();
  if (!AC || !m || !cb || !out) return;
  const an = AC.createAnalyser();
  an.fftSize = 8192;
  m.connect(an);
  const can = AC.createAnalyser();
  can.fftSize = 8192;
  cb.connect(can);
  const oan = AC.createAnalyser(); // the compressor output: what reaches the speaker (05 7.2: under -10 dBFS)
  oan.fftSize = 8192;
  out.connect(oan);
  const buf = new Float32Array(an.fftSize);
  let hold = 0;
  let outHold = 0;
  const read = (a: AnalyserNode): { rms: number; peak: number } => {
    a.getFloatTimeDomainData(buf);
    let s = 0, pk = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i] as number;
      s += v * v;
      if (Math.abs(v) > pk) pk = Math.abs(v);
    }
    return { rms: Math.sqrt(s / buf.length), peak: pk };
  };
  hookTick = () => { hold = Math.max(hold, read(an).peak); outHold = Math.max(outHold, read(oan).peak); };
  const hook: Hook = {
    rms: () => read(an).rms,
    cueRms: () => read(can).rms,
    peak: () => read(an).peak,
    peakHold: () => hold,
    outPeakHold: () => outHold,
    resetPeak: () => { hold = 0; outHold = 0; },
    state: () => ({
      ctx: ctxState(), on: isOn(), music: musicState(), waltz: waltzState(),
      playing: { A: motifs.A.variant(), B: motifs.B.variant(), C: motifs.C.variant() },
    }),
  };
  Object.defineProperty(window, '__PDAUDIO', { value: hook, configurable: true });
}

let last = 0;
function frame(ts: number): void {
  requestAnimationFrame(frame);
  const dtr = last ? Math.min(0.05, (ts - last) / 1000) : 0;
  last = ts;
  setNow(ts); // the limiter's real-time stamp (05 2.4 item 1); S8 hands it the loop's frame time
  updateMusic(dtr); // B and C, the game's scheduler
  MOTIF_A.update();
  if (hookTick) hookTick();
  ageToast(dtr);
  if (waltzPlaying()) updateReadout('A');
}

build();
requestAnimationFrame(frame);
