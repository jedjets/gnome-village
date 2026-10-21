// @vitest-environment jsdom
// tests/musicState.test.ts
// S8 part B, 08 2.8 and 05 8.2 item 4: the clock rule of 05 5.4 item 1 (register 3.13), the state table of 05 5.6 for both motifs (first match wins, the
// row each motif takes), the tempo slew of 5.6 rule 1, what the music reads from the simulation once per bar (the featured pair's ring of 16 compared
// with the sample 30 sim s back, the parted and happily endings counted in bars, c_fireworks, a busker, the avatar mode: 5.6 rules 4 to 6; 07 S8.6
// step 8), the variant and tempo changes at the conductor (a Parted ending mid-phrase turns the variant at the next phrase start, never before; 120
// to 96 and 84 to 66 in 3 bars; C keeps its loop bar; the flourish entry), and over tests/audio-fake.ts the crossfade of 5.4 item 4 on the real graph
// (the motif gains, the music room, and musicBus untouched by the switch). The conductor runs under the engine's dry run on a fake context clock.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DAYLEN, T } from '../src/core/clock.ts';
import { clearListeners, drain, emit } from '../src/core/events.ts';
import { rngN, seedVisual } from '../src/core/rng.ts';
import { effects, type Effect } from '../src/play/abilities.ts';
import { setMode } from '../src/play/mode.ts';
import { pairs, type Pair } from '../src/entities/romance.ts';
import { spawnVisitor, visitors } from '../src/entities/visitor.ts';
import { CTR, cam, centreOn, setViewport } from '../src/render/camera.ts';
import { newPark } from '../src/core/loop.ts';
import { audibleGain, panOf, setDryRun } from '../src/audio/engine.ts';
import {
  BASE_BPM, DENSITY_DEFAULT, HAPPILY_BARS, PARTED_BARS, RING, ROWS, TEMPO_STEP, affinityDelta, bindMusicState, busScale, fixedRow, musicMemory,
  readMusicInput, resetMusicState, resolveState, rowOf, slewBpm, tempoTarget, type MusicInput,
} from '../src/audio/music-state.ts';
import { DAY_FROM, DAY_TO, MUSIC_PICK, musicLog, noteLog, startMusic, stopMusic, updateMusic, wantedMotif, clearMusicLog } from '../src/audio/music.ts';
import { installFakeAudio, type FakeAudio } from './audio-fake.ts';

const base: MusicInput = { stage: 0, affinityDelta: 0, parted: false, happily: false, fireworks: false, night: false, busker: null, avatar: false };

describe('the clock rule: C while f is in [0.20, 0.80), B otherwise (register 3.13; 05 5.4 item 1, 8.2 item 4)', () => {
  it('wantedMotif is C at f 0.20, 0.50, 0.79 and 0.799999 and B at 0.80, 0.90, 0.00, 0.19 and 0.199999', () => {
    for (const f of [0.2, 0.5, 0.79, 0.799999]) expect(wantedMotif(f)).toBe('C');
    for (const f of [0.8, 0.9, 0, 0.19, 0.199999]) expect(wantedMotif(f)).toBe('B');
  });
  it('the hours are two named constants beside MUSIC_PICK = { day: C, night: B } (ADVISED: the owner may change them)', () => {
    expect([DAY_FROM, DAY_TO]).toEqual([0.2, 0.8]);
    expect(MUSIC_PICK).toEqual({ day: 'C', night: 'B' });
  });
});

describe('the state table, first match wins (05 5.6, 8.2 item 4)', () => {
  it('picks flourish over parted over happily over night over rising over stroll', () => {
    const rising = { stage: 3, affinityDelta: 0.01 };
    expect(resolveState({ ...base })).toBe('stroll');
    expect(resolveState({ ...base, ...rising })).toBe('rising');
    expect(resolveState({ ...base, stage: 2, affinityDelta: 0.01 })).toBe('stroll'); // stage 3 or more
    expect(resolveState({ ...base, stage: 5, affinityDelta: 0 })).toBe('stroll'); // and affinity now above affinity 30 s ago
    expect(resolveState({ ...base, stage: 5, affinityDelta: -0.01 })).toBe('stroll');
    expect(resolveState({ ...base, ...rising, night: true })).toBe('night');
    expect(resolveState({ ...base, ...rising, night: true, happily: true })).toBe('happily');
    expect(resolveState({ ...base, ...rising, night: true, happily: true, parted: true })).toBe('parted');
    expect(resolveState({ ...base, ...rising, night: true, happily: true, parted: true, fireworks: true })).toBe('flourish');
  });
  it('night matches exactly when wantedMotif(f) is B, not by the light', () => {
    for (const f of [0, 0.1, 0.19, 0.2, 0.5, 0.79, 0.8, 0.95]) {
      expect(resolveState({ ...base, night: wantedMotif(f) === 'B' })).toBe(wantedMotif(f) === 'B' ? 'night' : 'stroll');
    }
  });
  it('holds the table: variant, tempo factor and density of each row for each motif', () => {
    expect(ROWS.flourish).toEqual({ B: { variant: 'rising', tempo: 1.08, density: 1.0 }, C: { variant: 'rising', tempo: 1.08, density: 1.0 } });
    expect(ROWS.parted).toEqual({ B: { variant: 'parted', tempo: 1.0, density: 0.5 }, C: { variant: 'parted', tempo: 1.0, density: 0.5 } });
    expect(ROWS.happily).toEqual({ B: { variant: 'rising', tempo: 1.04, density: 1.0 }, C: { variant: 'rising', tempo: 1.04, density: 1.0 } });
    expect(ROWS.night).toEqual({ B: { variant: 'rising', tempo: 1.0, density: 0.8 } }); // B only
    expect(ROWS.rising).toEqual({ C: { variant: 'rising', tempo: 1.0, density: 0.7 } }); // C only
    expect(ROWS.stroll).toEqual({ C: { variant: 'rising', tempo: 0.95, density: 0.6 } });
    expect(BASE_BPM).toEqual({ B: { rising: 84, parted: 66 }, C: { rising: 120, parted: 96 } });
    expect(DENSITY_DEFAULT).toEqual({ B: 0.8, C: 0.7 });
  });
  it('the tempos the table gives: night 84, rising 120, stroll 114, parted 66 and 96, flourish and happily scale the base', () => {
    const bpm = (m: 'B' | 'C', i: MusicInput): number => {
      const { row } = rowOf(m, i);
      return tempoTarget(m, row.variant, 1, row.tempo);
    };
    expect(bpm('B', { ...base, night: true })).toBeCloseTo(84, 9);
    expect(bpm('C', { ...base, stage: 4, affinityDelta: 1 })).toBeCloseTo(120, 9);
    expect(bpm('C', { ...base })).toBeCloseTo(114, 9);
    expect(bpm('B', { ...base, parted: true })).toBeCloseTo(66, 9);
    expect(bpm('C', { ...base, parted: true })).toBeCloseTo(96, 9);
    expect(bpm('B', { ...base, fireworks: true })).toBeCloseTo(90.72, 9);
    expect(bpm('C', { ...base, happily: true })).toBeCloseTo(124.8, 9);
  });
  it('every state gives each motif a row: while the clock wants the other motif the playing one takes its own (B under rising or stroll takes night; C under night takes rising or stroll)', () => {
    expect(rowOf('B', { ...base })).toMatchObject({ state: 'night', row: { variant: 'rising', tempo: 1.0, density: 0.8 } }); // clock wants C, B still plays
    expect(rowOf('B', { ...base, stage: 4, affinityDelta: 1 }).state).toBe('night');
    expect(rowOf('C', { ...base, night: true })).toMatchObject({ state: 'stroll', row: { tempo: 0.95, density: 0.6 } }); // clock wants B, C still plays
    expect(rowOf('C', { ...base, night: true, stage: 3, affinityDelta: 0.2 }).state).toBe('rising');
    for (const state of ['flourish', 'parted', 'happily'] as const) {
      const i = { ...base, fireworks: state === 'flourish', parted: state === 'parted', happily: state === 'happily' };
      expect(rowOf('B', i).state).toBe(state);
      expect(rowOf('C', { ...i, night: true }).state).toBe(state);
    }
  });
  it('the board and the Sound check play fixed rows: parted for both, rising as B night or C rising (6.3 defaults)', () => {
    expect(fixedRow('B', 'rising')).toEqual(ROWS.night.B);
    expect(fixedRow('C', 'rising')).toEqual(ROWS.rising.C);
    expect(fixedRow('B', 'parted')).toEqual(ROWS.parted.B);
    expect(fixedRow('C', 'parted')).toEqual(ROWS.parted.C);
  });
});

describe('tempo moves at most 8 BPM a bar and stays inside 0.8 to 1.2 times the variant base (05 5.6 rule 1)', () => {
  const glide = (from: number, to: number): number[] => {
    const out = [from];
    while (out[out.length - 1] !== to) {
      const n = slewBpm(out[out.length - 1] as number, to);
      expect(Math.abs(n - (out[out.length - 1] as number))).toBeLessThanOrEqual(TEMPO_STEP);
      out.push(n);
    }
    return out;
  };
  it("C's fall from 120 to 96 takes 3 bars, and so does B's from 84 to 66 (and the rise back)", () => {
    expect(TEMPO_STEP).toBe(8);
    expect(glide(120, 96)).toEqual([120, 112, 104, 96]);
    expect(glide(84, 66)).toEqual([84, 76, 68, 66]);
    expect(glide(96, 120)).toEqual([96, 104, 112, 120]);
    expect(glide(66, 84)).toEqual([66, 74, 82, 84]);
    expect(slewBpm(100, 101)).toBe(101);
  });
  it('the target is base x knob x factor clamped to 0.8 to 1.2 of the variant base', () => {
    expect(tempoTarget('C', 'rising', 1, 1)).toBe(120);
    expect(tempoTarget('C', 'rising', 1.2, 1.08)).toBeCloseTo(144, 9); // 1.296 is held at 1.2
    expect(tempoTarget('C', 'rising', 0.8, 0.95)).toBeCloseTo(96, 9); // 0.76 is held at 0.8
    expect(tempoTarget('B', 'parted', 1.2, 1.0)).toBeCloseTo(79.2, 9);
    expect(tempoTarget('B', 'parted', 0.8, 1.0)).toBeCloseTo(52.8, 9);
  });
  it('musicBus is scaled x0.8 in the avatar mode and x(0.7 + 0.3a) by an audible busker (5.6 rules 5 and 6)', () => {
    expect(busScale(base)).toBe(1);
    expect(busScale({ ...base, avatar: true })).toBeCloseTo(0.8, 9);
    expect(busScale({ ...base, busker: { pan: -0.4, a: 1 } })).toBeCloseTo(1, 9);
    expect(busScale({ ...base, busker: { pan: 0.2, a: 0.05 } })).toBeCloseTo(0.715, 9);
    expect(busScale({ ...base, avatar: true, busker: { pan: 0, a: 0.5 } })).toBeCloseTo(0.8 * 0.85, 9);
  });
});

/** A featured pair at `stage` with `aff`; the visitors it names are not needed by the music. */
function pairAt(stage: number, aff: number): Pair {
  const p = { id: 1, a: 0, b: 0, stage, affinity: aff, formedDay: 1 } as unknown as Pair;
  pairs.length = 0;
  pairs.push(p);
  return p;
}
const setSimSeconds = (s: number): void => {
  T.abs = s / DAYLEN;
};

beforeEach(() => {
  clearListeners();
  bindMusicState();
  resetMusicState();
  pairs.length = 0;
  effects.length = 0;
  visitors.length = 0;
  setMode('creator');
  setSimSeconds(0);
  Object.assign(T, { f: 0.3, speed: 1 });
  setViewport(390, 844, 1);
  cam.z = 1.3;
  centreOn(CTR, CTR);
});
afterEach(() => {
  setMode('creator');
  pairs.length = 0;
  effects.length = 0;
  visitors.length = 0;
});

describe('what the music reads once per bar, read only (05 5.6 rules 4 to 6; 07 S8.6 step 8)', () => {
  it('no featured pair: stage 0 and no affinity move; the sim stream and the pair are untouched', () => {
    const before = rngN();
    expect(readMusicInput(false)).toMatchObject({ stage: 0, affinityDelta: 0, parted: false, happily: false, fireworks: false, busker: null, avatar: false });
    expect(musicMemory().ring).toHaveLength(0);
    expect(rngN()).toBe(before);
  });
  it('samples (T.abs, affinity) of the featured pair into a ring of 16 and compares with the sample nearest 30 sim s back', () => {
    const p = pairAt(4, 0.4);
    expect(readMusicInput(false).affinityDelta).toBe(0); // one sample: nothing older
    setSimSeconds(10);
    p.affinity = 0.5;
    readMusicInput(false);
    setSimSeconds(20);
    p.affinity = 0.7;
    readMusicInput(false);
    setSimSeconds(40);
    p.affinity = 0.65;
    // 30 s before 40 s is 10 s: that sample (0.5) is the nearest, not the oldest (0.4) and not the newest
    expect(readMusicInput(false).affinityDelta).toBeCloseTo(0.15, 9);
    setSimSeconds(41);
    p.affinity = 0.3; // 30 s before 41 s is 11 s: still the sample at 10 s
    const r = readMusicInput(false);
    expect(r.affinityDelta).toBeCloseTo(-0.2, 9);
    expect(resolveState(r)).toBe('stroll'); // falling affinity is not rising
    expect(affinityDelta([], 1, 5, 0.5)).toBe(0);
  });
  it('the ring holds 16 samples and the comparison keeps to the featured pair', () => {
    const p = pairAt(3, 0.1);
    for (let i = 0; i < 20; i++) {
      setSimSeconds(i * 2);
      p.affinity = 0.1 + i * 0.01;
      readMusicInput(false);
    }
    expect(RING).toBe(16);
    expect(musicMemory().ring).toHaveLength(16);
    expect(musicMemory().ring[0]?.t).toBe(8); // samples 4 to 19 stay
    const delta = readMusicInput(false).affinityDelta; // now = 38 s: the sample 8 s back is at 8
    expect(delta).toBeGreaterThan(0);
    p.id = 2; // another pair is featured: its own history starts empty
    expect(readMusicInput(false).affinityDelta).toBe(0);
  });
  it('a Parted ending counts for the next 24 bars and a Happily ending for the next 8, from the events', () => {
    expect(PARTED_BARS).toBe(24);
    expect(HAPPILY_BARS).toBe(8);
    for (let i = 0; i < 3; i++) readMusicInput(false);
    emit({ kind: 'parted', tick: 1 });
    emit({ kind: 'happily', tick: 1 });
    drain(0);
    const seen: Array<[boolean, boolean]> = [];
    for (let i = 0; i < 26; i++) {
      const r = readMusicInput(false);
      seen.push([r.parted, r.happily]);
    }
    expect(seen.filter(([p]) => p)).toHaveLength(24);
    expect(seen.slice(0, 24).every(([p]) => p)).toBe(true);
    expect(seen[24]?.[0]).toBe(false);
    expect(seen.filter(([, h]) => h)).toHaveLength(8);
    expect(seen[7]?.[1]).toBe(true);
    expect(seen[8]?.[1]).toBe(false);
  });
  it('c_fireworks active is the flourish; a new park forgets the endings and the ring', () => {
    expect(readMusicInput(false).fireworks).toBe(false);
    effects.push({ id: 1, ability: 'c_fireworks' } as unknown as Effect);
    expect(readMusicInput(false).fireworks).toBe(true);
    effects.length = 0;
    pairAt(4, 0.5);
    emit({ kind: 'parted', tick: 1 });
    drain(0);
    expect(readMusicInput(false).parted).toBe(true);
    resetMusicState();
    expect(readMusicInput(false).parted).toBe(false);
    expect(musicMemory().ring).toHaveLength(1);
  });
  it('a busker in state play with audibleGain of 0.05 or more steers the pan; one that cannot be heard does not; the avatar mode is read', () => {
    newPark(101);
    const v = spawnVisitor('busker', 'g_north', { sex: 'm', name: 'B' }) as { x: number; y: number; st: string };
    v.x = CTR;
    v.y = CTR;
    v.st = 'walk';
    expect(readMusicInput(false).busker).toBeNull(); // not playing
    v.st = 'play';
    const near = readMusicInput(false).busker;
    expect(near?.a).toBeGreaterThan(0.9);
    expect(near?.pan).toBeCloseTo(0, 1);
    // a tile to the right of the view where the gain has fallen to between 0.05 and 0.6
    let x = CTR;
    while (audibleGain(x, CTR) > 0.6) x += 0.5;
    v.x = x;
    const far = readMusicInput(false).busker;
    expect(far?.a).toBeGreaterThanOrEqual(0.05);
    expect(far?.a).toBeLessThanOrEqual(0.6);
    expect(far?.pan).toBe(panOf(x, CTR));
    expect(far?.pan).toBeGreaterThan(0);
    v.x = CTR + 80; // off the view altogether: below 0.05
    expect(readMusicInput(false).busker).toBeNull();
    expect(readMusicInput(false).avatar).toBe(false);
    setMode('avatar', 'a_pigeon');
    expect(readMusicInput(false).avatar).toBe(true);
  });
});

/* ====================================================================================================================
   The conductor on the fake context clock of the dry run
   ==================================================================================================================== */
const frames = (sec: number, each?: () => void): void => {
  for (let i = 0; i < Math.round(sec * 60); i++) {
    each?.();
    updateMusic(1 / 60);
  }
};
const bars = (motif: 'B' | 'C') => musicLog().filter((r) => r.kind === 'bar' && r.motif === motif);
const barRow = (motif: 'B' | 'C', n: number) => bars(motif).find((r) => r.bar === n);
/** Run until the bar `n` of `motif` has been built. */
const until = (motif: 'B' | 'C', n: number, each?: () => void): void => {
  for (let i = 0; i < 60 * 600 && !barRow(motif, n); i++) {
    each?.();
    updateMusic(1 / 60);
  }
  expect(barRow(motif, n)).toBeDefined();
};
/** A pair whose affinity climbs, so the state is `rising` from the second bar on (the ring compares with a sample 30 s back). */
function climbing(): () => void {
  const p = pairAt(4, 0.5);
  return () => {
    p.affinity += 0.0005;
    T.abs += 1 / (60 * DAYLEN);
  };
}

describe('the conductor: the variant changes at a phrase start, the tempo by 8 BPM a bar, C keeps its loop bar (05 5.6 rules 1 and 2)', () => {
  beforeEach(() => {
    setDryRun(true);
    stopMusic();
    clearMusicLog();
    seedVisual(101);
  });
  afterEach(() => {
    stopMusic();
    setDryRun(false);
  });

  it('C rising at 120: a Parted event mid-phrase turns the variant at the next phrase start, not before, and the tempo falls 8 a bar to 96 in 3 bars', () => {
    const climb = climbing();
    T.f = 0.5;
    startMusic();
    until('C', 4, climb);
    expect(barRow('C', 4)).toMatchObject({ state: 'rising', variant: 'rising', bpm: 120 });
    emit({ kind: 'parted', tick: 1 });
    drain(0);
    until('C', 9, climb);
    const row = (n: number) => barRow('C', n);
    expect(row(5)).toMatchObject({ state: 'parted', variant: 'rising', bpm: 120, density: 0.5 }); // bar 5 is mid-phrase: density now, variant not yet
    expect(row(6)).toMatchObject({ variant: 'parted', bpm: 112 }); // the phrase start
    expect(row(7)).toMatchObject({ variant: 'parted', bpm: 104 });
    expect(row(8)).toMatchObject({ variant: 'parted', bpm: 96 });
    expect(row(9)).toMatchObject({ variant: 'parted', bpm: 96 });
    // C keeps its place in the 8-bar loop: bar 6 is Dm6 Bb7 (parted), root D2 = 38 on beat 1; before the change bar 4 was Bb6 over its F2... in rising
    const t6 = (row(6) as { t: number }).t;
    const bass6 = noteLog().filter((n) => n.layer === 'bass' && n.t === t6);
    expect(bass6.map((n) => n.midi)).toEqual([38]);
    const bpmOK = bars('C').every((r) => r.bpm >= 0.8 * 96 - 1e-9 && r.bpm <= 1.2 * 120 + 1e-9);
    expect(bpmOK).toBe(true);
    // the steps never exceed 8 and the loop bar counts on without a seam
    const list = bars('C');
    for (let i = 1; i < list.length; i++) {
      expect(Math.abs((list[i] as { bpm: number }).bpm - (list[i - 1] as { bpm: number }).bpm)).toBeLessThanOrEqual(8 + 1e-9);
      expect((list[i] as { bar: number }).bar).toBe((list[i - 1] as { bar: number }).bar + 1);
    }
  });

  it('after 24 bars the Parted state ends: C rises back to 120 in 3 bars from the next phrase start', () => {
    const climb = climbing();
    T.f = 0.5;
    startMusic();
    until('C', 4, climb);
    emit({ kind: 'parted', tick: 1 });
    drain(0);
    until('C', 36, climb);
    const parted = bars('C').filter((r) => r.state === 'parted');
    expect(parted).toHaveLength(24);
    expect(parted.map((r) => r.bar)).toEqual(Array.from({ length: 24 }, (_, i) => 5 + i));
    const row = (n: number) => barRow('C', n);
    expect(row(29)).toMatchObject({ state: 'rising', variant: 'parted', bpm: 96 }); // state back, variant waits for the phrase start
    expect(row(30)).toMatchObject({ variant: 'rising', bpm: 104 });
    expect(row(31)).toMatchObject({ bpm: 112 });
    expect(row(32)).toMatchObject({ bpm: 120 });
  });

  it('B at night: 84 BPM, a Parted event falls to 66 in 3 bars from the next phrase start (4 bars of 3 beats)', () => {
    T.f = 0.9;
    startMusic();
    until('B', 4);
    expect(barRow('B', 4)).toMatchObject({ state: 'night', variant: 'rising', bpm: 84, density: 0.8 });
    emit({ kind: 'parted', tick: 1 });
    drain(0);
    until('B', 11);
    for (const n of [5, 6, 7]) expect(barRow('B', n)).toMatchObject({ state: 'parted', variant: 'rising', bpm: 84, density: 0.5 });
    expect(barRow('B', 8)).toMatchObject({ variant: 'parted', bpm: 76 });
    expect(barRow('B', 9)).toMatchObject({ variant: 'parted', bpm: 68 });
    expect(barRow('B', 10)).toMatchObject({ variant: 'parted', bpm: 66 });
    // the parted left hand: A3 E4 C5 together on beat 1 only
    const t8 = (barRow('B', 8) as { t: number }).t;
    expect(noteLog().filter((n) => n.layer === 'lh' && n.t >= t8 && n.t < t8 + 2).map((n) => [n.t === t8, n.midi])).toEqual([[true, 57], [true, 64], [true, 72]]);
  });

  it('Happily lasts 8 bars at x1.04 with every note on; the Sound check and the board play a fixed variant that no state changes', () => {
    const climb = climbing();
    T.f = 0.5;
    startMusic();
    until('C', 4, climb);
    emit({ kind: 'happily', tick: 1 });
    drain(0);
    until('C', 16, climb);
    const happy = bars('C').filter((r) => r.state === 'happily');
    expect(happy).toHaveLength(8);
    expect(happy.every((r) => r.density === 1)).toBe(true);
    expect(happy.at(-1)?.bpm).toBeCloseTo(124.8, 9);
    stopMusic();
    clearMusicLog();
    emit({ kind: 'parted', tick: 1 });
    drain(0);
    startMusic({ motif: 'C', variant: 'rising' });
    frames(20);
    expect(bars('C').every((r) => r.state === 'fixed' && r.variant === 'rising' && r.bpm === 120)).toBe(true); // 6.3 defaults, no state, no clock rule
  });

  it('the flourish entry: B plays GV\'s phrase at the first phrase start after it, C sings the swung-quaver run D5 to D6 in place of the sung bar', () => {
    T.f = 0.9;
    startMusic();
    until('B', 4);
    effects.push({ id: 1, ability: 'c_fireworks' } as unknown as Effect);
    until('B', 9);
    expect(barRow('B', 5)).toMatchObject({ state: 'flourish', density: 1 });
    expect(barRow('B', 5)?.bpm).toBeCloseTo(90.72, 9); // 84 x 1.08 in one step of less than 8
    const t8 = (barRow('B', 8) as { t: number }).t;
    const mel8 = noteLog().filter((n) => n.layer === 'mel' && n.t >= t8 && n.t < (barRow('B', 9) as { t: number }).t);
    expect(mel8.map((n) => n.midi)).toEqual([72, 76, 79]); // GV's phrase, bar 1 (the first phrase after the entry)
    stopMusic();
    effects.length = 0;
    clearMusicLog();
    T.f = 0.5;
    startMusic();
    until('C', 2);
    effects.push({ id: 1, ability: 'c_fireworks' } as unknown as Effect);
    until('C', 5);
    const t4 = (barRow('C', 4) as { t: number }).t;
    const run = noteLog().filter((n) => n.layer === 'clar' && n.t >= t4 && n.t < (barRow('C', 5) as { t: number }).t);
    expect(run.map((n) => n.midi)).toEqual([74, 76, 77, 79, 81, 82, 84, 86]);
    expect(barRow('C', 4)).toMatchObject({ state: 'flourish', variant: 'rising' });
    // the entry is used once: the next sung bar (bar 6) is planned again, not the run
    until('C', 7);
    const t6 = (barRow('C', 6) as { t: number }).t;
    const sung6 = noteLog().filter((n) => n.layer === 'clar' && n.t >= t6 && n.t < (barRow('C', 7) as { t: number }).t).map((n) => n.midi);
    expect(sung6).not.toEqual([74, 76, 77, 79, 81, 82, 84, 86]);
  });
});

/* ====================================================================================================================
   The crossfade on the real graph code over the stand-in AudioContext (05 5.4 item 4)
   ==================================================================================================================== */
describe('the crossfade lasts 2 s and touches only the motif gains and the music room (05 5.4 items 4, 6 and 7)', () => {
  type Rec = Array<[string, ...number[]]>;
  let fake: FakeAudio;
  let M: typeof import('../src/audio/music.ts');
  let E: typeof import('../src/audio/engine.ts');
  let clock: typeof import('../src/core/clock.ts');
  let ctx: { currentTime: number };
  let outs: Record<'B' | 'C', Rec>;
  let bus: Rec;
  /** Wrap an AudioParam-bearing node so its gain calls are kept. */
  const spy = (node: { gain: unknown }): Rec => {
    const rec: Rec = [];
    const g = node.gain as Record<string, (...a: number[]) => void>;
    node.gain = new Proxy(g, {
      get(t, k: string) {
        if (['setValueAtTime', 'linearRampToValueAtTime', 'cancelScheduledValues', 'setTargetAtTime'].includes(k)) {
          return (...a: number[]) => {
            rec.push([k, ...a]);
            return t[k]?.(...a);
          };
        }
        return t[k];
      },
    });
    return rec;
  };
  const run = (sec: number): void => {
    for (let i = 0; i < Math.round(sec * 60); i++) {
      ctx.currentTime += 1 / 60;
      M.updateMusic(1 / 60);
    }
  };
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    fake = installFakeAudio();
    E = await import('../src/audio/engine.ts');
    M = await import('../src/audio/music.ts');
    clock = await import('../src/core/clock.ts');
    const rng = await import('../src/core/rng.ts');
    rng.seedVisual(101);
    E.initAudio();
    ctx = fake.ctx() as unknown as { currentTime: number };
    ctx.currentTime = 0;
    bus = spy(E.busOf('music') as unknown as { gain: unknown });
    // every GainNode the music makes after this point is a motif gain: B's first, then C's (startMusic makes both)
    const ac = fake.ctx() as unknown as { createGain: () => { gain: unknown } };
    const make = ac.createGain;
    const made: Rec[] = [];
    ac.createGain = () => {
      const n = make();
      if (made.length < 2) made.push(spy(n));
      return n;
    };
    outs = { get B() { return made[0] as Rec; }, get C() { return made[1] as Rec; } };
    clock.T.f = 0.79;
    clock.T.abs = 0.79;
  });
  afterEach(() => {
    M.stopMusic();
    fake.uninstall();
    vi.useRealTimers();
  });

  it('a new park starts C at once: its gain is 1, the other 0, no crossfade, the music room at C\'s 0.30', () => {
    M.startMusic();
    run(0.5);
    expect(M.musicState()).toMatchObject({ motif: 'C', xfade: null, playing: true });
    expect(outs.C.some((c) => c[0] === 'setValueAtTime' && c[1] === 1)).toBe(true);
    expect(outs.B.some((c) => c[0] === 'setValueAtTime' && c[1] === 0)).toBe(true);
    expect(outs.C.some((c) => c[0] === 'linearRampToValueAtTime')).toBe(false);
    expect(fake.made.osc).toBeGreaterThan(0);
    const room = fake.calls.filter((c) => c.node === 'gain.gain' && c.call === 'setValueAtTime' && c.args[0] === 0.3);
    expect(room.length).toBeGreaterThan(0);
  });

  it('at a switch the incoming gain ramps 0 to 1 and the outgoing 1 to 0 over [T, T + 2 s], the room 0.30 to 0.45, musicBus untouched; no outgoing note after T + 2 s', () => {
    M.startMusic();
    run(1);
    const busBefore = bus.length;
    const callsBefore = fake.calls.length;
    clock.T.f = 0.81; // dusk: the clock now wants B
    run(10);
    const sw = M.musicLog().find((r) => r.kind === 'switch');
    expect(sw).toBeDefined();
    const T0 = (sw as { t: number }).t;
    expect(M.musicState().motif).toBe('B');
    // the motif gains: hold, then a linear ramp whose end is T + 2
    const ramp = (rec: Rec): Rec[number] | undefined => rec.find((c) => c[0] === 'linearRampToValueAtTime');
    expect(ramp(outs.B)).toEqual(['linearRampToValueAtTime', 1, T0 + 2]);
    expect(ramp(outs.C)).toEqual(['linearRampToValueAtTime', 0, T0 + 2]);
    expect(outs.B.filter((c) => c[0] === 'setValueAtTime').map((c) => c.slice(1))).toContainEqual([0, T0]);
    expect(outs.C.filter((c) => c[0] === 'setValueAtTime').map((c) => c.slice(1))).toContainEqual([1, T0]);
    // the music room return: 0.30 at T, 0.45 at T + 2, on the room's own gain
    const roomRamp = fake.calls.slice(callsBefore).find((c) => c.node === 'gain.gain' && c.call === 'linearRampToValueAtTime' && c.args[0] === 0.45);
    expect(roomRamp?.args[1]).toBe(T0 + 2);
    expect(fake.calls.slice(callsBefore).some((c) => c.node === 'gain.gain' && c.call === 'setValueAtTime' && c.args[0] === 0.3 && c.args[1] === T0)).toBe(true);
    // musicBus itself: no call at all because of the switch
    expect(bus).toHaveLength(busBefore);
    // C plays on until T + 2 s and not after
    const cNotes = M.noteLog().filter((n) => n.motif === 'C');
    expect(Math.max(...cNotes.map((n) => n.t))).toBeLessThan(T0 + 2);
    const bNotes = M.noteLog().filter((n) => n.motif === 'B');
    expect(Math.min(...bNotes.map((n) => n.t))).toBe(T0);
  });

  it('the avatar mode scales musicBus x0.8 and an audible busker x(0.7 + 0.3a), each eased by a 0.33 s time constant', async () => {
    const mode = await import('../src/play/mode.ts');
    M.startMusic();
    run(0.2);
    mode.setMode('avatar', 'a_pigeon');
    run(4);
    const set = bus.filter((c) => c[0] === 'setTargetAtTime');
    expect(set.at(-1)?.[1]).toBeCloseTo(0.4, 9);
    expect(set.at(-1)?.[3]).toBeCloseTo(0.33, 9);
    mode.setMode('creator');
    run(4);
    expect(bus.filter((c) => c[0] === 'setTargetAtTime').at(-1)?.[1]).toBeCloseTo(0.5, 9);
  });
});
