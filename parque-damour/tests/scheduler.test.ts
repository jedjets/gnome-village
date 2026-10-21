// tests/scheduler.test.ts
// Locks 05 4 (the ambience scheduler: songbird windows, owl, pigeons, fountains as point sources, the café, the boulevard, rain, fireworks,
// crickets and the snow hush, mist and the foghorn, bells), 05 4.13 (what the park sounds like at f 0.50 and at f 0.05 in summer), 05 1 items 2,
// 3, 5 and 6 and 05 8.2 item 5 (08 2.8): updateAmbience and updateBirds driven by a fake frame clock (the dt they are handed, the limiter's
// stamp set by hand) and a fake audibleGain (setAmbienceEnv), the decisions read from the log of 05 8.3, and the dry run of 05 8.3: a 3-day run
// at 8x with sound on ends with rngN and the state hash of the silent run and 200 rows in the log (that test sits in cues.test.ts, which binds the
// cues to the bus). No AudioContext, no device.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { T } from '../src/core/clock.ts';
import { SIM_DT, newPark, simulate } from '../src/core/loop.ts';
import { clearListeners } from '../src/core/events.ts';
import { rngN, seedVisual } from '../src/core/rng.ts';
import { W } from '../src/core/weather.ts';
import { ICE, I, props } from '../src/world/grid.ts';
import { effects, type Effect } from '../src/play/abilities.ts';
import { spawnVisitor, visitors } from '../src/entities/visitor.ts';
import { pairs, type Pair } from '../src/entities/romance.ts';
import { CTR, cam, centreOn, setViewport } from '../src/render/camera.ts';
import {
  AMB_GRAINS_PER_S, clearLog, dryCalls, dryNotes, grain, mixState, setDryRun, setLogSink, setMuted, type LogRow,
} from '../src/audio/engine.ts';
import { resetGaps, setNow } from '../src/audio/limiter.ts';
import { resetCueSources } from '../src/audio/cues-bind.ts';
import { BELLS, BURSTS, ambienceTimers, burst, centre, resetAmbience, setAmbienceEnv, updateAmbience } from '../src/audio/ambience.ts';
import { CHORUS, VESPERS, VOICE_NAMES, birdTimers, resetBirds, singFrom, songChance, updateBirds } from '../src/audio/birds.ts';
import '../src/play/tools.ts';

let ms = 0;
const HZ = 30;
/** Every decision since the last clr(): the ring of 200 of 05 8.3 forgets a 600 s run's first rows, so a test counts from the sink. */
let rows: LogRow[] = [];
const clr = (): void => {
  clearLog();
  rows = [];
};

/** Run `sec` real seconds of frames at 30 Hz: the limiter's stamp, then the ambience and the songbirds, as main.ts does (03 4.1 item 8). */
function run(sec: number, hz = HZ): void {
  const n = Math.round(sec * hz);
  for (let i = 0; i < n; i++) {
    ms += 1000 / hz;
    setNow(ms);
    updateAmbience(1 / hz);
    updateBirds(1 / hz);
  }
}
const ids = (): string[] => rows.filter((r) => r.played).map((r) => r.id);
const count = (id: string): number => rows.filter((r) => r.played && r.id === id).length;

/** The sky and weather of a fixture; the clock chip's season index: 0 spring, 1 summer, 2 autumn, 3 winter. */
function sky(f: number, light: number, season: 0 | 1 | 2 | 3 = 0, w: Partial<typeof W> = {}): void {
  Object.assign(T, { f, abs: f, light, season, speed: 1 });
  Object.assign(W, { rain: 0, snow: 0, mist: 0.04, kind: 'clear' }, w);
}

beforeEach(() => {
  clearListeners();
  newPark(101);
  for (let i = 0; i < 900; i++) simulate(SIM_DT, 0); // the pigeons are up and about
  seedVisual(7);
  setViewport(390, 844, 1);
  cam.z = 1.3;
  centreOn(CTR, CTR);
  setMuted(false);
  setDryRun(true);
  clr();
  dryCalls(true);
  resetGaps();
  resetAmbience();
  resetBirds();
  resetCueSources();
  setAmbienceEnv(null);
  effects.length = 0;
  pairs.length = 0;
  setLogSink((r) => rows.push(r));
  ms = 100_000;
  setNow(ms);
  sky(0.5, 1);
});
afterEach(() => {
  setDryRun(false);
  setLogSink(null);
  setAmbienceEnv(null);
  effects.length = 0;
  pairs.length = 0;
  sky(0.3, 0.75);
});

describe('05 4.13: what the park sounds like (08 2.8, 05 8.2 item 5)', () => {
  it('at f 0.50, clear, 1x, 30 real seconds hold songbird, fountain and pigeon decisions and nothing else', () => {
    const before = rngN();
    run(30);
    const kinds = new Set(ids().map((id) => (id.startsWith('bird:') ? 'bird' : id)));
    expect([...kinds].sort()).toEqual(['bird', 'coo', 'fountain']);
    expect(count('fountain')).toBeGreaterThan(60); // 3.5 a second at 1.3 zoom
    expect(rngN()).toBe(before); // the sim stream never moves (05 1 item 6)
  });

  it('at f 0.05 in summer it holds crickets, at most one owl and no songbird', () => {
    sky(0.05, 0.06, 1);
    seedVisual(3); // the owl is a 25 % roll every 11 to 26 s: in 30 s this stream rolls it once or twice and never twice yes
    run(30);
    const kinds = new Set(ids().map((id) => (id.startsWith('bird:') ? 'bird' : id)));
    expect(kinds.has('cricket')).toBe(true);
    expect(kinds.has('bird')).toBe(false);
    expect(count('owl')).toBeLessThanOrEqual(1);
    for (const k of kinds) expect(['cricket', 'owl', 'fountain', 'coo']).toContain(k);
  });

  it('crickets keep out of winter, rain and snow; the owl only in the dark', () => {
    sky(0.05, 0.06, 3);
    run(30);
    expect(count('cricket')).toBe(0);
    sky(0.05, 0.06, 1, { rain: 0.5 });
    run(30);
    expect(count('cricket')).toBe(0);
    sky(0.5, 1, 1);
    clr();
    run(60);
    expect(count('cricket')).toBe(0);
    expect(count('owl')).toBe(0);
  });
});

describe('05 4.2: the songbirds', () => {
  /** The interval drawn when a song fires: the first frame after the countdown rose. */
  function nextInterval(f: number, light: number): number {
    sky(f, light);
    let prev = birdTimers().song;
    for (let i = 0; i < 4000; i++) {
      ms += 1000 / HZ;
      setNow(ms);
      updateBirds(1 / HZ);
      const cur = birdTimers().song;
      if (cur > prev) return cur;
      prev = cur;
    }
    return NaN;
  }
  it('the windows: chorus [0.20, 0.32), vespers [0.76, 0.87), day otherwise by light, night 20 to 40 s', () => {
    expect([CHORUS, VESPERS]).toEqual([[0.2, 0.32], [0.76, 0.87]]);
    for (let k = 0; k < 6; k++) {
      resetBirds();
      expect(nextInterval(0.25, 0.49)).toBeGreaterThanOrEqual(0.9);
      resetBirds();
      expect(nextInterval(0.25, 0.49)).toBeLessThanOrEqual(2.2);
      resetBirds();
      const v = nextInterval(0.8, 0.62);
      expect(v).toBeGreaterThanOrEqual(1.6);
      expect(v).toBeLessThanOrEqual(3.4);
      resetBirds();
      const d = nextInterval(0.5, 1);
      expect(d).toBeGreaterThanOrEqual(2.2);
      expect(d).toBeLessThanOrEqual(5.0);
      resetBirds();
      const n = nextInterval(0.05, 0.06);
      expect(n).toBeGreaterThanOrEqual(20);
      expect(n).toBeLessThanOrEqual(40);
    }
  });

  it('the chance of a song: rain, snow, mist and winter thin it (GV 6296 plus the mist factor)', () => {
    sky(0.5, 1, 0, { rain: 0, snow: 0, mist: 0 });
    expect(songChance()).toBe(1);
    sky(0.5, 1, 0, { rain: 0.8, snow: 0, mist: 0 });
    expect(songChance()).toBeCloseTo(0.44, 12);
    sky(0.5, 1, 0, { rain: 0, snow: 0.8, mist: 0 });
    expect(songChance()).toBeCloseTo(0.52, 12);
    sky(0.5, 1, 0, { rain: 0, snow: 0, mist: 0.78 });
    expect(songChance()).toBeCloseTo(0.688, 12);
    sky(0.5, 1, 3, { rain: 0, snow: 0, mist: 0 });
    expect(songChance()).toBeCloseTo(0.55, 12);
    sky(0.5, 1, 3, { rain: 0.8, snow: 0.8, mist: 0.78 });
    expect(songChance()).toBeCloseTo(0.44 * 0.52 * 0.688 * 0.55, 12);
  });

  it('there are six voices by name; a song is sung from a tree prop near the view, and the next tree may answer', () => {
    expect(VOICE_NAMES).toEqual(['robin', 'warbler', 'thrush', 'chiffchaff', 'blackbird', 'wren']);
    expect(props.some((p) => p.kind === 'tree')).toBe(true);
    run(120);
    const songs = rows.filter((r) => r.played && r.id.startsWith('bird:'));
    expect(songs.length).toBeGreaterThan(10);
    const trees = new Set(props.filter((p) => p.kind === 'tree').map((p) => p.x + ',' + p.y));
    // a perch is a tree tile; the answering tree is 'at' a tree up to 3 tiles off (GV 6306), so only the first song of a pair is pinned
    expect(songs.some((r) => trees.has(r.x + ',' + r.y))).toBe(true);
    const names = new Set(songs.map((r) => r.id.slice(5)));
    for (const n of names) expect(VOICE_NAMES as readonly string[]).toContain(n);
  });

  it('while a pair is at stage 5 or more the interval is x0.8 and the blackbird is picked twice as often (review 15 J59)', () => {
    const share = (romantic: boolean): number => {
      clr();
      let black = 0;
      const N = 3000;
      for (let i = 0; i < N; i++) {
        singFrom(CTR, CTR, false, romantic);
        if (rows.at(-1)?.id === 'bird:blackbird') black++;
      }
      return black / N;
    };
    seedVisual(11);
    const base = share(false), love = share(true);
    expect(base).toBeGreaterThan(0.14);
    expect(base).toBeLessThan(0.19); // 1 in 6
    expect(love).toBeGreaterThan(0.25);
    expect(love).toBeLessThan(0.32); // 2 in 7
    pairs.push({ id: 1, a: 0, b: 0, stage: 5 } as unknown as Pair);
    resetBirds();
    const iv = ((): number => {
      sky(0.25, 0.49);
      let prev = birdTimers().song;
      for (let i = 0; i < 4000; i++) {
        ms += 1000 / HZ;
        setNow(ms);
        updateBirds(1 / HZ);
        const cur = birdTimers().song;
        if (cur > prev) return cur;
        prev = cur;
      }
      return NaN;
    })();
    expect(iv).toBeGreaterThanOrEqual(0.9 * 0.8);
    expect(iv).toBeLessThanOrEqual(2.2 * 0.8);
  });
});

describe('05 4.5 to 4.11: the layers', () => {
  it('a fountain is a point source: 1.5 + 2a burbles a second (at most 4), none off screen, none on ice', () => {
    run(10);
    const near = count('fountain');
    expect(near).toBeGreaterThanOrEqual(33);
    expect(near).toBeLessThanOrEqual(36); // a ~ 1 at the centre, 3.5 per second
    clr();
    setAmbienceEnv({ audible: () => 0.04 }); // under 0.05: not a source
    run(10);
    expect(count('fountain')).toBe(0);
    setAmbienceEnv({ audible: () => 0 });
    clr();
    run(5);
    expect(count('fountain')).toBe(0);
    setAmbienceEnv(null);
    const f = props.find((p) => p.kind === 'fountain');
    expect(f).toBeTruthy();
    if (f) ICE[I(f.x, f.y)] = 1;
    clr();
    run(5);
    expect(count('fountain')).toBe(0); // frozen
    if (f) ICE[I(f.x, f.y)] = 0;
  });

  it('rain: nine plips a second times the rain, only above 0.25; harder (x0.7) on gravel, an octave down under the awning', () => {
    sky(0.5, 1, 0, { rain: 0.1 });
    run(10);
    expect(count('plip')).toBe(0);
    sky(0.5, 1, 0, { rain: 0.8 });
    clr();
    run(10);
    expect(count('plip')).toBeGreaterThanOrEqual(70);
    expect(count('plip')).toBeLessThanOrEqual(76); // 7.2 a second (plus the awning's extra when the view is under the kiosk's: not here)
    const pans = rows.filter((r) => r.id === 'plip').length;
    expect(pans).toBeGreaterThan(0);
    // the glide: the view's tile decides (the gravel ring of the fountain is 0.7, lawn 0.8)
    dryNotes(true);
    setAmbienceEnv({ view: () => ({ x: 23, y: 21 }) });
    sky(0.5, 1, 0, { rain: 0.8 });
    run(1);
    const hard = dryNotes().filter((n) => n.dur === 0.07 && n.to !== undefined).map((n) => (n.to as number) / n.f); // the plip (0.07 s)
    expect(hard.length).toBeGreaterThan(0);
    for (const r of hard) expect([0.7, 0.8].some((g) => Math.abs(r - g) < 1e-9)).toBe(true);
    // under a kiosk's awning a second plip, an octave down at 0.6
    const k = props.find((p) => p.kind === 'kiosk');
    expect(k).toBeTruthy();
    dryNotes(true);
    clr();
    centreOn(k?.x ?? CTR, k?.y ?? CTR); // cue() hears the tile through the real audibleGain: look at the kiosk
    setAmbienceEnv({ view: () => ({ x: k?.x ?? 0, y: k?.y ?? 0 }), audible: () => 1 });
    run(1);
    const notes = dryNotes().filter((n) => n.bus === 'amb' && n.gain < 0.0032 * 0.7 && n.delay > 0 && n.delay < 0.03);
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.f).toBeLessThan(840 * 0.5 + 1e-9); // 420 to 840 Hz, halved
      expect(n.gain).toBeCloseTo(0.0032 * 0.6, 3);
    }
    centreOn(CTR, CTR);
  });

  it('the snow hush and the mist mix ease the master lowpass and the shared return; hush wins; clear gives them back', () => {
    expect(mixState()).toEqual({ lowpass: 2100, verb: 0.36 });
    sky(0.5, 1, 3, { snow: 0.8 });
    run(0.1);
    expect(mixState()).toEqual({ lowpass: 1500, verb: 0.46 });
    expect(rows.some((r) => r.id === 'hush')).toBe(true);
    sky(0.5, 1, 3, { snow: 0.8, mist: 0.9 });
    run(0.1);
    expect(mixState()).toEqual({ lowpass: 1500, verb: 0.46 });
    sky(0.5, 1, 0, { snow: 0.4, mist: 0.9 });
    run(0.1);
    expect(mixState()).toEqual({ lowpass: 1700, verb: 0.36 });
    sky(0.5, 1, 0, { snow: 0, mist: 0.3 });
    run(0.1);
    expect(mixState()).toEqual({ lowpass: 2100, verb: 0.36 });
  });

  it('the foghorn: mist above 0.6, every 20 to 40 s with a 35 % chance, once per 20 s at any speed', () => {
    sky(0.5, 1, 0, { mist: 0.5 });
    run(120);
    expect(count('foghorn')).toBe(0);
    sky(0.5, 1, 0, { mist: 0.9 });
    T.speed = 8;
    clr();
    run(600);
    const horns = rows.filter((r) => r.id === 'foghorn');
    expect(horns.length).toBeGreaterThan(0);
    const ts = horns.filter((r) => r.played).map((r) => r.t);
    for (let i = 1; i < ts.length; i++) expect((ts[i] as number) - (ts[i - 1] as number)).toBeGreaterThanOrEqual(20_000);
  });

  it('the boulevard: a car every 7 to 15 s while the view is at y 36 or more by day, never from the north or at night', () => {
    setAmbienceEnv({ view: () => ({ x: 24, y: 30 }) });
    run(60);
    expect(count('car')).toBe(0);
    setAmbienceEnv({ view: () => ({ x: 24, y: 40 }) });
    sky(0.5, 1);
    clr();
    run(60);
    const cars = rows.filter((r) => r.id === 'car');
    expect(cars.length).toBeGreaterThanOrEqual(3);
    expect(cars.length).toBeLessThanOrEqual(9);
    sky(0.95, 0.1);
    clr();
    run(60);
    expect(count('car')).toBe(0);
    // the car is one pass of 1.6 s with a pan sweep and an octave up
    sky(0.5, 1);
    dryNotes(true);
    burst('boulevard');
    const car = dryNotes().filter((n) => n.dur === 1.6);
    expect(car.map((n) => n.f)).toEqual([90, 180]);
    expect(car.every((n) => n.bus === 'amb' && n.pan === -0.8)).toBe(true);
  });

  it('fireworks: a launch every 1.2 to 2.0 real seconds while c_fireworks is up, none after', () => {
    run(10);
    expect(count('fireworks')).toBe(0);
    effects.push({ id: 1, ability: 'c_fireworks' } as unknown as Effect);
    clr();
    run(30);
    const n = rows.filter((r) => r.id === 'fireworks' && r.why !== 'inaudible').length;
    expect(n).toBeGreaterThanOrEqual(30 / 2.0 - 1);
    expect(n).toBeLessThanOrEqual(30 / 1.2 + 1);
    effects.length = 0;
    clr();
    run(10);
    expect(count('fireworks')).toBe(0);
  });

  it('the café: a clink or a far murmur every 4 to 9 s while someone eats at a kiosk with a vendor, silence when idle', () => {
    const k = props.find((p) => p.kind === 'kiosk');
    expect(k).toBeTruthy();
    if (!k) return;
    k.data.vendorId = 999;
    run(60);
    expect(count('clink') + count('murmur')).toBe(0);
    const v = spawnVisitor('single', 'g_north', { sex: 'f', name: 'E' });
    Object.assign(v as object, { st: 'eat', job: { propId: k.id } });
    centreOn(k.x, k.y); // the kiosk is at the south edge of the park: look at it
    clr();
    run(60);
    const n = count('clink') + count('murmur');
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(16);
    const murmur = rows.find((r) => r.id === 'murmur');
    expect(murmur).toBeTruthy();
    visitors.pop();
    k.data.vendorId = undefined;
    centreOn(CTR, CTR);
  });

  it('the pigeons coo every 4 to 9 s at 40 %; fog doubles the interval; the owl 25 % every 11 to 26 s only in the dark', () => {
    run(300);
    const coos = count('coo');
    expect(coos).toBeGreaterThanOrEqual(3); // 300 / 6.5 * 0.4 = 18 rolls, each needs a pigeon on the ground within the view
    expect(coos).toBeLessThanOrEqual(30);
    sky(0.5, 1, 0, { mist: 0.9 });
    clr();
    run(300);
    expect(count('coo')).toBeLessThanOrEqual(coos);
    sky(0.05, 0.06, 3);
    clr();
    run(600);
    expect(count('owl')).toBeGreaterThan(5); // 600 / 18.5 * 0.25 = 8
    expect(count('owl')).toBeLessThan(14);
  });
});

describe('05 4.12: the bells', () => {
  const cross = (a: number, b: number): void => {
    sky(a, 0.9);
    ms += 100;
    setNow(ms);
    updateAmbience(0.05);
    sky(b, 0.9);
    ms += 100;
    setNow(ms);
    updateAmbience(0.05);
  };
  const strokes = (): number => dryNotes().filter((n) => n.f === 196 && n.dur === 2.6).length; // one 196 Hz tone of 2.6 s starts every stroke
  it('rings when f crosses one of the six daytime boundaries: three strokes, six at 0.45, none at night or dawn', () => {
    expect(BELLS).toEqual([0.28, 0.45, 0.58, 0.72, 0.8, 0.87]);
    for (const b of BELLS) {
      dryCalls(true);
      clr();
      resetAmbience();
      ms += 30_000;
      cross(b - 0.001, b + 0.001);
      expect(count('bells'), String(b)).toBe(1);
      expect(strokes(), String(b)).toBe(b === 0.45 ? 6 : 3);
    }
    for (const night of [0.2, 0.999]) {
      dryCalls(true);
      clr();
      resetAmbience();
      ms += 30_000;
      cross(night - 0.001, night + 0.001);
      if (night === 0.999) {
        // 0.999 -> 1.0 wraps to 0.0: a jump, no peal
      }
      expect(count('bells')).toBe(0);
    }
    clr();
    resetAmbience();
    ms += 30_000;
    cross(0.999, 0.001); // midnight
    expect(count('bells')).toBe(0);
  });

  it('the strokes are 1.1 s apart with GV\'s bell recipe on the ambience bus, pan -0.6; the whole peal keeps a 20 s real gap even at 8x', () => {
    dryNotes(true);
    dryCalls(true);
    ms += 30_000;
    cross(0.279, 0.281);
    const notes = dryNotes();
    expect(notes.map((n) => n.f)).toEqual([196, 392, 523, 196, 392, 523, 196, 392, 523]);
    expect(notes.map((n) => +n.delay.toFixed(1))).toEqual([0, 0, 0, 1.1, 1.1, 1.1, 2.2, 2.2, 2.2]);
    expect(notes.every((n) => n.pan === -0.6 && n.bus === 'amb')).toBe(true);
    expect(notes.filter((n) => n.f === 196)[0]).toMatchObject({ dur: 2.6, gain: 0.012 });
    // 8x: the next boundary 19 s later is skipped, one 20 s later rings
    T.speed = 8;
    clr();
    ms += 19_000 - 200;
    cross(0.449, 0.451);
    expect(rows.find((r) => r.id === 'bells')?.why).toBe('gated');
    clr();
    ms += 1_000;
    cross(0.579, 0.581);
    expect(count('bells')).toBe(1);
  });

  it('a jump of the clock (a restore, a New) and a muted frame ring nothing', () => {
    cross(0.2, 0.9);
    expect(count('bells')).toBe(0);
    setMuted(true);
    sky(0.279, 0.9);
    updateAmbience(0.05);
    sky(0.281, 0.9);
    updateAmbience(0.05);
    setMuted(false);
    ms += 30_000;
    sky(0.2812, 0.9);
    setNow(ms);
    updateAmbience(0.05);
    expect(count('bells')).toBe(0);
  });
});

describe('05 1 items 2 and 3, 4.1: real time, never a continuous noise', () => {
  it('the sequence of decisions is the same at 1x, 8x and paused (the scheduler counts real seconds)', () => {
    const sig = (speed: number): string => {
      newPark(101);
      seedVisual(5);
      sky(0.5, 1);
      T.speed = speed;
      resetAmbience();
      resetBirds();
      resetGaps();
      clr();
      ms = 200_000;
      run(40);
      return rows.map((r) => r.id + (r.played ? '+' : '-')).join(' ');
    };
    const a = sig(1);
    expect(sig(8)).toBe(a);
    expect(sig(0)).toBe(a);
    expect(a.length).toBeGreaterThan(100);
  });

  it('one frame is at most 0.05 s however long the stall (the timers fall by 0.05)', () => {
    run(1);
    const t0 = ambienceTimers().pigeon ?? 0;
    updateAmbience(10);
    expect(t0 - (ambienceTimers().pigeon ?? 0)).toBeLessThanOrEqual(0.05 + 1e-9);
    const b0 = birdTimers().song;
    updateBirds(10);
    expect(b0 - birdTimers().song).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it('grain() is the one noise path: at most 0.12 s, and the ambience calls it at most 6 times per real second', () => {
    setNow(500_000);
    dryCalls(true);
    for (let i = 0; i < 20; i++) grain(0.2, { f0: 900, f1: 400, gain: 0.01, bus: 'amb' });
    expect(dryCalls().grain).toBe(AMB_GRAINS_PER_S);
    expect(dryNotes().every((n) => n.dur <= 0.12)).toBe(true);
    setNow(501_001);
    grain(0.05, { f0: 900, f1: 400, gain: 0.01, bus: 'amb' });
    expect(dryCalls().grain).toBe(AMB_GRAINS_PER_S + 1);
    for (let i = 0; i < 20; i++) grain(0.05, { f0: 900, f1: 400, gain: 0.01 }); // a cue's grains (the flutter, the step) are the gates' business
    expect(dryCalls().grain).toBe(AMB_GRAINS_PER_S + 21);
  });

  it('every note of every ambience layer is a short enveloped event: none longer than the 2.6 s of a bell, no grain from the ambience', () => {
    sky(0.5, 1, 1, { rain: 0.8 });
    run(60);
    for (const b of BURSTS) burst(b);
    sky(0.05, 0.06, 1);
    run(60);
    const notes = dryNotes();
    expect(notes.length).toBeGreaterThan(50);
    expect(notes.every((n) => n.dur <= 2.6)).toBe(true);
    expect(dryCalls().grain).toBe(0);
  });

  it('a muted frame does nothing at all and drops what was waiting', () => {
    run(2);
    setMuted(true);
    clr();
    dryCalls(true);
    run(10);
    expect(rows).toHaveLength(0);
    expect(dryCalls()).toEqual({ tone: 0, grain: 0 });
  });

  it('the centre is the featured pair\'s midpoint when it is audible (0.2 or more), else the tile under the view', () => {
    expect(centre()).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    const view = centre();
    const a = spawnVisitor('single', 'g_north', { sex: 'f', name: 'P' }) as { id: number; x: number; y: number };
    const b = spawnVisitor('single', 'g_north', { sex: 'm', name: 'Q' }) as { id: number; x: number; y: number };
    Object.assign(a, { x: CTR, y: CTR });
    Object.assign(b, { x: CTR + 2, y: CTR });
    pairs.push({ id: 1, a: a.id, b: b.id, stage: 2 } as unknown as Pair);
    expect(centre()).toEqual({ x: CTR + 1, y: CTR });
    setAmbienceEnv({ audible: () => 0.1 });
    expect(centre()).not.toEqual({ x: CTR + 1, y: CTR });
    setAmbienceEnv(null);
    expect(view).toBeTruthy();
    visitors.splice(visitors.indexOf(visitors.find((v) => v.id === a.id) as never), 1);
    visitors.splice(visitors.indexOf(visitors.find((v) => v.id === b.id) as never), 1);
  });
});

describe('src/audio obeys the rules of 05 1 (hard rules 1 to 3)', () => {
  const dir = join(import.meta.dirname, '..', 'src', 'audio');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  const text = (f: string): string => readFileSync(join(dir, f), 'utf8');
  it('no wall clock and no unseeded random number; no import from debug/', () => {
    for (const f of files) {
      expect(text(f), f).not.toMatch(/Math\.random|performance\.now|Date\.now/);
      expect(text(f), f).not.toMatch(/from '\.\.\/debug\//);
    }
  });
  it('no file is over about 600 lines; the sim\'s own random stream is never called (rng, rnd, rint, chance, pick)', () => {
    for (const f of files) {
      expect(text(f).split('\n').length, f).toBeLessThan(600);
      expect(text(f), f).not.toMatch(/import \{[^}]*\b(rng|rnd|rint|chance|pick|seedSim)\b[^}]*\} from '\.\.\/core\/rng\.ts'/);
    }
  });
  it('nothing in src/audio assigns to the simulation: no import of a setter from the sim layers except events', () => {
    for (const f of files) {
      const src = text(f);
      expect(src, f).not.toMatch(/import \{[^}]*\b(enqueue|applyNow|setTick|setSpeed|simulate)\b[^}]*\} from/);
    }
  });
});
