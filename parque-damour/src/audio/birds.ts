// src/audio/birds.ts
// Ported from GV 6212-6269 (noteRun, the six VOICES, singFrom, aTreeNearView) and 6292-6308 (the songbird half of updateAudio: the
// dawn and dusk windows, the interval, the weather chance, the reply). PORT.
// Rules changed (05 4.2; 09 2.7): the trees are the `tree` props of the park, not GV's `trees` (a Prop has x, y and an id); the windows
// are the chorus [0.20, 0.32) and the vespers [0.76, 0.87) of the day fraction f (GV read 0.20-0.36 and 0.66-0.81); the song chance
// gains the mist factor 0.4 and the interval x0.8 with `blackbird` twice as often while the featured pair is at stage 5 or more (review
// 15 J59); the reply is a countdown on this module's own real-time timer, not GV's setTimeout (review note 12 section 11 item 9); `sing`
// goes out on the event bus with the tree and the song's length, so render/effects.ts may perch a decorative bird (GV landBird 2293); the
// voices sit on the `amb` bus (05 7.1). `singFrom` with `far` still skips the audibility test, as GV did (09 2.7).
// A park with no tree sings from the centre (05 4.2 "none -> centre()"; GV needed trees.length). Lines dropped from the range: 6264 (the -0.18 for a tree that already holds a perched bird: Parque has no bird list), 6304 (landBird).
// Real time: updateBirds(dtr) counts real seconds, paused or not (05 4.1 item 1, 03 4.1 item 8). Visual RNG only (05 1 item 6).
import { T } from '../core/clock.ts';
import { vchance, vrng, vrnd, vrint } from '../core/rng.ts';
import { emit } from '../core/events.ts';
import { tick } from '../core/loop.ts';
import { W } from '../core/weather.ts';
import { props, type Prop } from '../world/grid.ts';
import { featured } from '../entities/romance.ts';
import { view } from '../render/camera.ts';
import { screenOf } from '../render/project.ts';
import { audibleGain, isMuted, isOn, logPush, panOf, tone } from './engine.ts';
import { centre } from './ambience.ts';

type Note = { f: number; d: number; g?: number; a?: number; to?: number; w?: number; wd?: number; gap?: number };

/** GV 6212-6219: a phrase of glided sine notes, returns its length in seconds. */
function noteRun(notes: Note[], pan: number, vol: number): number {
  let t = 0;
  for (const n of notes) {
    tone(n.f, n.d, { gain: vol * (n.g ?? 1), pan, att: n.a ?? 0.028, to: n.to ?? n.f * 1.02, toAt: 0.85, delay: t, wob: n.w, wobd: n.wd, bus: 'amb' });
    t += n.d + (n.gap ?? 0.07);
  }
  return t;
}

type Voice = (pan: number, vol: number) => number;

/** GV 6220-6250, verbatim in its numbers: the six voices, in GV's order. */
const VOICES: Voice[] = [
  function robin(pan, vol) { // wandering thirds, a little sad
    const b = 700 + vrng() * 180, n = 3 + vrint(0, 2), notes: Note[] = [];
    for (let i = 0; i < n; i++) {
      const up = i % 2 === 0, f = b * (up ? 1 : 0.84) * (1 + vrng() * 0.05);
      notes.push({ f, d: 0.13 + vrng() * 0.06, to: f * (up ? 0.94 : 1.06), gap: 0.06 + vrng() * 0.05 });
    }
    return noteRun(notes, pan, vol);
  },
  function warbler(pan, vol) { // a quick bright trill
    const b = 880 + vrng() * 240, n = 5 + vrint(0, 3), notes: Note[] = [];
    for (let i = 0; i < n; i++) {
      const f = b * (1 + 0.18 * Math.sin((i / (n - 1)) * Math.PI));
      notes.push({ f, d: 0.07, to: f * 0.97, gap: 0.035, a: 0.018 });
    }
    return noteRun(notes, pan, vol * 0.85);
  },
  function thrush(pan, vol) { // "tu-wee", said twice or three times
    const b = 500 + vrng() * 120, reps = 2 + vrint(0, 1), notes: Note[] = [];
    for (let r = 0; r < reps; r++) {
      notes.push({ f: b, d: 0.11, to: b * 1.03, gap: 0.03 });
      notes.push({ f: b * 1.42, d: 0.2, to: b * 1.6, gap: 0.28, a: 0.035 });
    }
    return noteRun(notes, pan, vol);
  },
  function chiffchaff(pan, vol) { // two notes, back and forth
    const hi = 800 + vrng() * 90, lo = hi * 0.86, n = 4 + vrint(0, 2), notes: Note[] = [];
    for (let i = 0; i < n; i++) {
      const f = i % 2 ? lo : hi;
      notes.push({ f, d: 0.1, to: f * 0.98, gap: 0.09 });
    }
    return noteRun(notes, pan, vol * 0.9);
  },
  function blackbird(pan, vol) { // slow and fluty, the soothing one
    const b = 460 + vrng() * 140, n = 3 + vrint(0, 1), notes: Note[] = [];
    for (let i = 0; i < n; i++) {
      const f = b * ([1, 1.25, 1.12, 1.5][i % 4] as number) * (1 + vrng() * 0.03);
      notes.push({ f, d: 0.22 + vrng() * 0.1, to: f * (vchance(0.5) ? 1.08 : 0.93), gap: 0.1, a: 0.05, w: 5.5, wd: 0.012 });
    }
    return noteRun(notes, pan, vol * 1.05);
  },
  function wren(pan, vol) { // a tumbling little run
    const b = 760 + vrng() * 160, n = 6 + vrint(0, 3), notes: Note[] = [];
    for (let i = 0; i < n; i++) {
      const f = b * (1.22 - (0.32 * i) / (n - 1)) * (1 + (i % 2) * 0.06);
      notes.push({ f, d: 0.06 + vrng() * 0.02, to: f * 0.95, gap: 0.03, a: 0.016 });
    }
    return noteRun(notes, pan, vol * 0.8);
  },
];

export const VOICE_NAMES = ['robin', 'warbler', 'thrush', 'chiffchaff', 'blackbird', 'wren'] as const;
export type VoiceName = (typeof VOICE_NAMES)[number];
const BLACKBIRD = 4;

/** One voice by index at a pan and a volume (the Sound check's bird buttons: pan 0, volume 0.024 as GV's SND_CUES). */
export function singVoice(i: number, pan: number, vol: number): number {
  const v = VOICES[i];
  if (!v) return 0;
  logPush('bird:' + VOICE_NAMES[i], NaN, NaN, 1, true, 'ok');
  return v(pan, vol);
}

/** GV 6251-6257 with the romance colour of 05 4.2: while a pair is at stage 5 or more `blackbird` is picked twice as often. */
export function singFrom(x: number, y: number, far: boolean, romantic = false): number {
  const a = audibleGain(x, y);
  if (a < 0.05 && !far) {
    logPush('bird', x, y, a, false, 'inaudible');
    return 0;
  }
  const pan = panOf(x, y) * (far ? 0.7 : 1);
  const vol = (far ? 0.011 : 0.024) * (far ? 1 : 0.55 + 0.45 * a);
  let i = (vrng() * (romantic ? VOICES.length + 1 : VOICES.length)) | 0;
  if (i >= VOICES.length) i = BLACKBIRD;
  logPush('bird:' + VOICE_NAMES[i], x, y, a, true, 'ok');
  return (VOICES[i] as Voice)(pan, vol);
}

/** GV 6258-6269: a tree on screen, preferring the middle (24 samples). The trees are the `tree` props. */
export function aTreeNearView(): Prop | null {
  let n = 0;
  for (const p of props) if (p.kind === 'tree') n++;
  if (!n) return null;
  let best: Prop | null = null, bd = 1e9;
  for (let k = 0; k < 24; k++) {
    let pick = (vrng() * n) | 0, t: Prop | undefined;
    for (const p of props) if (p.kind === 'tree' && pick-- === 0) { t = p; break; }
    if (!t) continue;
    const p = screenOf(t.x, t.y, 0);
    const d = Math.hypot((p.x - view.cw / 2) / view.cw, (p.y - view.chh / 2) / view.chh) + vrng() * 0.25;
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

/* ---------- the schedule: GV 6295-6307, windows of 05 4.2 ---------- */
export const CHORUS: readonly [number, number] = [0.2, 0.32];
export const VESPERS: readonly [number, number] = [0.76, 0.87];
let birdT = 0;
const replies: Array<{ t: number; x: number; y: number; far: boolean }> = [];

/** The chance that a song happens (GV 6296 plus the mist factor of 05 4.2). */
export function songChance(): number {
  return (1 - 0.7 * W.rain) * (1 - 0.6 * W.snow) * (1 - 0.4 * W.mist) * (T.season === 3 ? 0.55 : 1);
}

export function resetBirds(): void {
  birdT = 0;
  replies.length = 0;
}
export function birdTimers(): { song: number; replies: number } {
  return { song: birdT, replies: replies.length };
}

/** Every frame with real seconds (capped at 0.05 by the caller): the songbirds. */
export function updateBirds(dtr: number): void {
  if (!isOn() || isMuted()) return;
  const dt = Math.min(dtr, 0.05);
  const romantic = (featured()?.stage ?? 0) >= 5;
  for (let i = replies.length - 1; i >= 0; i--) {
    const r = replies[i] as (typeof replies)[number];
    r.t -= dt;
    if (r.t > 0) continue;
    replies.splice(i, 1);
    singFrom(r.x + vrnd(-3, 3), r.y + vrnd(-3, 3), r.far, romantic);
  }
  birdT -= dt;
  if (birdT > 0) return;
  const f = T.f, day = T.light > 0.22;
  const chorus = f >= CHORUS[0] && f < CHORUS[1], vespers = f >= VESPERS[0] && f < VESPERS[1];
  birdT = !day ? vrnd(20, 40) : chorus ? vrnd(0.9, 2.2) : vespers ? vrnd(1.6, 3.4) : vrnd(2.2, 5.0);
  if (romantic) birdT *= 0.8;
  if (!day) return;
  const t = aTreeNearView();
  if (!vchance(songChance())) return;
  const at = t ?? centre();
  const len = singFrom(at.x, at.y, false, romantic);
  if (t) emit({ kind: 'sing', tick: tick(), x: t.x, y: t.y, ids: [t.id], params: { len: Math.round(len * 100) / 100 } });
  if (vchance(chorus ? 0.6 : 0.35)) {
    const far = vchance(0.5), t2 = aTreeNearView() ?? at;
    replies.push({ t: len + 0.4 + vrng() * 0.9, x: t2.x, y: t2.y, far });
  }
}
