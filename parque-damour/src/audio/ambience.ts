// src/audio/ambience.ts
// The ambience scheduler of 05 section 4: owl, pigeons, fountains as point sources, the café, the boulevard beyond the south railings,
// rain on gravel, fireworks pacing, crickets, the snow hush and the mist mix, the foghorn, the bells at the six phase boundaries.
// (The songbirds are birds.ts, called beside this file each frame, 03 4.1 item 8.)
// Ported from GV 6270-6329 (sfxCricket 6271, burble 6274, plip 6278, the timers and gates of updateAudio 6292-6329). ADAPT.
// Rules changed (09 2.7; 05 4): the village centre becomes centre() (the featured pair's midpoint when it is audible, else the tile under the
// view); the water scan, the fire pops and the stream are dropped (no flow, no fire); the fountains are the `fountain` props, each a point
// source with its own accumulator; the owl keeps GV's recipe at gain 0.020 WITH distance (review note 12 section 11 item 2) and the dove became
// the `coo` cue; every note of a layer that is a cue goes through cues.cue(), so audibility comes before the gap; the reply timers and the
// bell strokes are real-time countdowns and scheduled notes, never setTimeout. GV's silence on pause is not ported: this runs every frame
// whether the sim is paused or not (05 4.1 item 1). GV's rain threshold (W.rain > 0.25, 6315) is kept; 05 4.8 states only the rate.
// Lines dropped from the range: 6282-6291 (scanWater), 6279 (firePop), 6309-6313 (the stream), 6316-6317 (fire).
// Real time: updateAmbience(dtr) is handed real seconds by the frame; every timer is a countdown in them, held in module state and reset
// by resetAmbience() (on initAudio and on New). Nothing here draws from the sim stream or writes the simulation: it reads T, W, the props,
// the creatures, the visitors and the effects, and the visual stream `vrng` is the only source of chance (05 1 items 5 and 6).
import { T } from '../core/clock.ts';
import { vchance, vrng, vrnd, vrint } from '../core/rng.ts';
import { W } from '../core/weather.ts';
import type { XY } from '../core/math.ts';
import { KIND, ICE, I, Kind, props, type Prop } from '../world/grid.ts';
import { creatures } from '../entities/creatures.ts';
import { visitors } from '../entities/visitor.ts';
import { featured, midOf } from '../entities/romance.ts';
import { effects } from '../play/abilities.ts';
import { cam, viewCentreTile } from '../render/camera.ts';
import { MASTER_LP, VERB_GAIN, audibleGain, easeMix, isMuted, isOn, logPush, panOf, stalled, tone } from './engine.ts';
import { gate } from './limiter.ts';
import { cue } from './cues.ts';

/** What the scheduler asks of the world: audibility and the view's tile. A test swaps them (05 8.2 item 5: a fake audibleGain). */
export interface AmbEnv {
  audible(x: number, y: number): number;
  view(): XY;
}
const real: AmbEnv = { audible: audibleGain, view: viewCentreTile };
let env: AmbEnv = real;
export function setAmbienceEnv(e: Partial<AmbEnv> | null): void {
  env = e ? { ...real, ...e } : real;
}

/** Day fractions at which the church rings: the daytime phase boundaries of 02 3.2 (05 4.12); six strokes at 0.45, three elsewhere. */
export const BELLS: readonly number[] = [0.28, 0.45, 0.58, 0.72, 0.8, 0.87];
export const BELL_NOON = 0.45;
const SOUTH_Y = 36; // viewCentreTile().y from which the boulevard is heard (05 4.7)
const FOG_XY = { x: 24, y: -4 } as const; // the foghorn's fixed place (05 3.2 row 23)

const tm = { owl: 0, pigeon: 0, cricket: 0, fog: 0, car: 0, firework: 0 };
let rainAcc = 0;
let prevF = -1;
let mixState = 'clear';
const fountainAcc = new Map<number, number>();
const kioskT = new Map<number, number>();
const pending: Array<{ t: number; fn: () => void }> = [];

/** Every timer is reset on initAudio() and on New (05 4.1 item 3). */
export function resetAmbience(): void {
  tm.owl = tm.pigeon = tm.cricket = tm.fog = tm.car = tm.firework = 0;
  rainAcc = 0;
  prevF = -1;
  mixState = 'clear';
  fountainAcc.clear();
  kioskT.clear();
  pending.length = 0;
}
/** The countdowns, for the harness (05 8.3). */
export function ambienceTimers(): Record<string, number> {
  return { ...tm, rain: rainAcc, pending: pending.length };
}

/** Run `fn` after `sec` real seconds of the frame clock (the stagger of the lamp hums, the Happily bursts). Dropped on mute. */
export function later(sec: number, fn: () => void): void {
  pending.push({ t: sec, fn });
}

/** 05 4.1 item 2: the featured pair's midpoint when it is audible (at least 0.2), else the tile under the view. */
export function centre(): XY {
  const p = featured();
  if (p) {
    const m = midOf(p);
    if (env.audible(m.x, m.y) >= 0.2) return m;
  }
  return env.view();
}

const isKind = (p: Prop, k: Prop['kind']): boolean => p.kind === k;
const cx = (p: Prop): number => p.x + (p.w - 1) / 2;
const cy = (p: Prop): number => p.y + (p.h - 1) / 2;

/* ---------- the layers ---------- */

/** 05 4.3: GV sfxOwl 6198-6202 at gain 0.020 with the distance applied. */
function owlAt(x: number, y: number): boolean {
  const a = env.audible(x, y);
  if (a < 0.02) {
    logPush('owl', x, y, a, false, 'inaudible');
    return false;
  }
  logPush('owl', x, y, a, true, 'ok');
  const pan = panOf(x, y);
  tone(262, 0.7, { gain: 0.02 * a, pan, att: 0.14, to: 233, bus: 'amb' });
  tone(233, 0.85, { gain: 0.0169 * a, pan, delay: 0.55, att: 0.16, bus: 'amb' });
  return true;
}
function owl(dt: number): void {
  tm.owl -= dt;
  if (tm.owl > 0) return;
  tm.owl = vrnd(11, 26);
  if (T.light >= 0.18 || !vchance(0.25)) return;
  const far = props.find((p) => isKind(p, 'tree') && p.y < 0); // the far bank: none inside the park, kept as written
  if (far) owlAt(far.x, far.y);
  else {
    const c = centre();
    owlAt(c.x + vrnd(-6, 6), c.y + vrnd(-6, 6));
  }
}

/** 05 4.4. */
function pigeons(dt: number): void {
  tm.pigeon -= dt;
  if (tm.pigeon > 0) return;
  tm.pigeon = vrnd(4, 9) * (W.mist > 0.6 ? 2 : 1);
  if (!vchance(0.4)) return;
  const live = creatures.filter((c) => c.kind === 'pigeon' && !c.outside && (c.st === 'walk' || c.st === 'peck' || c.st === 'perch'));
  let best: (typeof live)[number] | null = null, ba = 0;
  for (let k = 0; k < 8 && live.length; k++) {
    const c = live[(vrng() * live.length) | 0] as (typeof live)[number];
    const a = env.audible(c.x, c.y);
    if (a > ba) { ba = a; best = c; }
  }
  if (best && ba >= 0.1) cue('coo', best.x, best.y);
}

/** A fountain with ice on any of its tiles is silent (05 4.5). */
function iced(p: Prop): boolean {
  for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) if (ICE[I(p.x + dx, p.y + dy)]) return true;
  return false;
}

/** 05 4.5: each fountain with audibility >= 0.05 is a point source; GV 6311-6313 shape. A fountain on ice is silent. */
function fountains(dt: number): void {
  const zoom = Math.min(1, Math.max(0, cam.z / 0.9));
  for (const p of props) {
    const boat = p.kind === 'rowboat';
    if (p.kind !== 'fountain' && !boat) continue;
    const x = cx(p), y = cy(p), a = env.audible(x, y);
    if (a < 0.05) continue;
    if (!boat && iced(p)) continue;
    let acc = (fountainAcc.get(p.id) ?? 0) + dt * Math.min(4, Math.max(1, 1.5 + 2 * a)) * zoom;
    while (acc >= 1) {
      acc -= 1;
      cue('fountain', x, y, boat ? { vol: 0.5 } : {});
    }
    fountainAcc.set(p.id, acc);
  }
}

/** Is anyone eating at this kiosk or at one of its tables (05 4.6)? */
function eating(k: Prop): boolean {
  const tables = k.data.tableIds ?? [];
  return visitors.some((v) => (v.st === 'eat' && v.job.propId === k.id) || (tables.length > 0 && tables.includes(v.sitPropId)));
}
function cafes(dt: number): void {
  for (const k of props) {
    if (k.kind !== 'kiosk' || !k.data.vendorId) continue;
    let t = (kioskT.get(k.id) ?? 0) - dt;
    if (t <= 0) {
      t = vrnd(4, 9);
      if (eating(k)) {
        const ids = k.data.tableIds ?? [];
        const table = ids.length ? props.find((p) => p.id === ids[(vrng() * ids.length) | 0]) : undefined;
        const x = table ? cx(table) : cx(k), y = table ? cy(table) : cy(k);
        if (vchance(0.5)) cue('clink', x, y);
        else cue('murmur', x, y, { vol: 0.6, voice: vchance(0.5) ? 'f' : 'm' }); // a far murmur: no actor, so no voice gate
      }
    }
    kioskT.set(k.id, t);
  }
}

/** 05 4.7: a passing car, a pan sweep over its 1.6 s, an octave up for phones; sometimes a bicycle bell after it. */
function car(): void {
  logPush('car', FOG_XY.x, 50, 1, true, 'ok');
  const o = { att: 0.5, pan: -0.8, panTo: 0.8, bus: 'amb' as const };
  tone(90, 1.6, { ...o, to: 60, gain: 0.01 });
  tone(180, 1.6, { ...o, to: 120, gain: 0.01 * 0.4 });
}
function boulevard(dt: number): void {
  tm.car -= dt;
  if (tm.car > 0) return;
  tm.car = vrnd(7, 15);
  if (env.view().y < SOUTH_Y || T.light <= 0.22) return;
  car();
  if (vchance(0.15)) cue('bell_bike', 24, 51, { delay: 0.4 });
}

/** 05 4.8: one plip per unit of rain x 9 per second; harder on gravel and flagstone; an octave down under an awning. */
function plipHere(): void {
  const c = env.view(), k = KIND[I(c.x, c.y)];
  const hard = k === Kind.gravel || k === Kind.flagstone ? 1 : 0;
  cue('plip', c.x, c.y, { pan: vrnd(-0.8, 0.8), n: hard });
  const under = props.some((p) => p.kind === 'kiosk' && Math.max(p.x - c.x, 0, c.x - (p.x + p.w - 1)) <= 2 && Math.max(p.y - c.y, 0, c.y - (p.y + p.h - 1)) <= 2);
  if (under) cue('plip', c.x, c.y, { pan: vrnd(-0.8, 0.8), n: hard, pitch: 0.5, vol: 0.6, delay: 0.02 });
}
function rain(dt: number): void {
  if (W.rain <= 0.25) return;
  rainAcc += dt * W.rain * 9;
  while (rainAcc >= 1) {
    rainAcc -= 1;
    plipHere();
  }
}

/** 05 4.9: a launch every 1.2 to 2.0 real seconds at the fountain (or the park centre) while c_fireworks is up. */
function fireworkSpot(): XY {
  const f = props.find((p) => isKind(p, 'fountain'));
  return f ? { x: cx(f), y: cy(f) } : { x: 23.5, y: 23.5 };
}
function fireworks(dt: number): void {
  if (!effects.some((e) => e.ability === 'c_fireworks')) return;
  tm.firework -= dt;
  if (tm.firework > 0) return;
  tm.firework = vrnd(1.2, 2.0);
  const s = fireworkSpot();
  cue('fireworks', s.x, s.y);
}
/** Happily plays three launches at d = 0, 0.9, 1.7 s at the pair (05 4.9). */
export function fireworksBurst(x: number, y: number): void {
  cue('fireworks', x, y);
  later(0.9, () => cue('fireworks', x, y));
  later(1.7, () => cue('fireworks', x, y));
}

/** 05 4.10: GV sfxCricket 6271-6274 at centre() +- 8 tiles, dry. */
function cricketAt(x: number, y: number): void {
  logPush('cricket', x, y, 1, true, 'ok');
  const pan = panOf(x, y), n = 6 + vrint(0, 5), b = 1180 + vrng() * 160;
  for (let i = 0; i < n; i++) tone(b, 0.045, { gain: 0.0055, pan, att: 0.012, delay: i * 0.085, dry: true, bus: 'amb' });
}
function crickets(dt: number): void {
  tm.cricket -= dt;
  if (tm.cricket > 0) return;
  tm.cricket = vrnd(2.5, 6);
  if (T.light >= 0.2 || (T.season !== 1 && T.season !== 2) || W.rain >= 0.3 || W.snow >= 0.3) return;
  const c = centre();
  cricketAt(c.x + vrnd(-8, 8), c.y + vrnd(-8, 8));
}

/** 05 4.11: with mist above 0.6, every 20 to 40 s a 35 % chance of the foghorn. */
function fog(dt: number): void {
  if (W.mist <= 0.6) return;
  tm.fog -= dt;
  if (tm.fog > 0) return;
  tm.fog = vrnd(20, 40);
  if (vchance(0.35)) cue('foghorn', FOG_XY.x, FOG_XY.y);
}

/** 05 4.10 and 4.11: the master lowpass and the shared return follow the weather (hush wins over mist); eased, never jumped. */
function mix(): void {
  const s = W.snow > 0.5 ? 'hush' : W.mist > 0.6 ? 'mist' : 'clear';
  if (s !== mixState) {
    mixState = s;
    logPush(s === 'hush' ? 'hush' : 'mix:' + s, NaN, NaN, 1, true, 'ok');
  }
  easeMix(s === 'hush' ? 1500 : s === 'mist' ? 1700 : MASTER_LP, s === 'hush' ? 0.46 : VERB_GAIN);
}

/** 05 4.12: three strokes 1.1 s apart (six at 0.45), the stroke of GV's bells-in-the-distance recipe, all on the ambience bus. */
export function ring(strokes: number): void {
  logPush('bells', NaN, NaN, 1, true, 'ok');
  for (let i = 0; i < strokes; i++) {
    const delay = i * 1.1, o = { delay, pan: -0.6, bus: 'amb' as const };
    tone(196, 2.6, { ...o, att: 0.008, gain: 0.012 });
    tone(392, 2.0, { ...o, att: 0.008, gain: 0.005 });
    tone(523, 0.9, { ...o, gain: 0.003 });
  }
}
function bells(): void {
  const f = T.f;
  const was = prevF;
  prevF = f;
  if (was < 0 || Math.abs(f - was) > 0.1) return; // the first frame, a restore, a wrap: no peal for a jump
  for (const b of BELLS) {
    if (was < b && f >= b) {
      if (gate('bells', 20000, false, true)) ring(b === BELL_NOON ? 6 : 3);
      else logPush('bells', NaN, NaN, 1, false, 'gated');
    }
  }
}

/** 05 3.2 row 31: when the lamps come on (or c_lamplight), up to six hum, 0.3 to 1.5 s after one another. */
export function humLamps(): void {
  const lamps = props.filter((p) => p.kind === 'lamp').map((p) => ({ p, a: env.audible(p.x, p.y) })).filter((l) => l.a >= 0.02);
  lamps.sort((m, n) => n.a - m.a);
  let d = 0;
  for (const l of lamps.slice(0, 6)) {
    d += vrnd(0.3, 1.5);
    later(d, () => cue('lamp_hum', l.p.x, l.p.y));
  }
}

/** The Sound check's bursts (05 2.6 item 2), at the view's tile so audibility is near 1. */
export const BURSTS = ['fountain', 'rain', 'crickets', 'owl', 'bells', 'boulevard'] as const;
export type Burst = (typeof BURSTS)[number];
export function burst(name: Burst): void {
  const c = env.view();
  if (name === 'fountain') for (let i = 0; i < 6; i++) cue('fountain', c.x, c.y, { delay: i * 0.12 });
  else if (name === 'rain') for (let i = 0; i < 10; i++) cue('plip', c.x, c.y, { pan: vrnd(-0.8, 0.8), delay: i * 0.1 });
  else if (name === 'crickets') cricketAt(c.x, c.y);
  else if (name === 'owl') owlAt(c.x, c.y);
  else if (name === 'bells') ring(3);
  else {
    car();
    cue('bell_bike', 24, 51, { delay: 0.4 });
  }
}

/** Once per frame, real seconds (capped at 0.05): the later() queue, the mix, the bells, then every layer in 05 4's order. */
export function updateAmbience(dtr: number): void {
  if (!isOn()) return;
  if (isMuted() || stalled()) {
    prevF = T.f; // no peal for a crossing slept through (muted, or the context frozen: stalled())
    pending.length = 0;
    return;
  }
  const dt = Math.min(dtr, 0.05);
  for (let i = pending.length - 1; i >= 0; i--) {
    const q = pending[i] as (typeof pending)[number];
    q.t -= dt;
    if (q.t > 0) continue;
    pending.splice(i, 1);
    q.fn();
  }
  mix();
  bells();
  owl(dt);
  pigeons(dt);
  fountains(dt);
  cafes(dt);
  boulevard(dt);
  rain(dt);
  fireworks(dt);
  crickets(dt);
  fog(dt);
}
