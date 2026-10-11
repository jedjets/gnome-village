// tests/melody.test.ts
// Locks 05 5.4 (the melody planner) and 5.6 (the state table) per 05 8.2 items 3 and 4: with vrng seeded, planPhrase() is
// reproducible; every beat-1 note is a chord tone; no two leaps the same way; bar 16 is the tonic held 3 beats; range 67-86;
// the state priority; tempo steps of at most 8 BPM per bar. No AudioContext: planning is separate from scheduling.
import { describe, it, expect } from 'vitest';
import { mulberry32, seedVisual } from '../src/core/rng.ts';
import {
  planPhrase, planRun, CHORDS, isChordTone, TONIC, MEL_LO, MEL_HI, PASSING_PC, scalePitches, resolveState, stepTempo, STATES,
  TEMPO_STEP, type Key, type PhrasePlan, type Note,
} from '../src/audio/music.ts';

type Loop = PhrasePlan[];

/** Plan `loops` consecutive 16-bar loops the way the scheduler chains them (prevLast, prevDelta, the tie from loop 2 on). */
function planLoops(key: Key, density: number, loops: number, rand?: () => number): Loop[] {
  const out: Loop[] = [];
  let prev: PhrasePlan | null = null;
  for (let l = 0; l < loops; l++) {
    const loop: Loop = [];
    for (let ph = 0; ph < 4; ph++) {
      const p = planPhrase(
        { key, phrase: ph, prevLast: prev?.last ?? null, prevDelta: prev?.lastDelta ?? 0, tied: !(l === 0 && ph === 0), density },
        rand,
      );
      loop.push(p);
      prev = p;
    }
    out.push(loop);
  }
  return out;
}

function degreeOf(scale: number[], midi: number): number {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < scale.length; i++) {
    const d = Math.abs((scale[i] as number) - midi);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 7919);

describe('music planPhrase (05 5.4; 08 2.8 row melody; 05 8.2 item 3)', () => {
  it('is reproducible under a seeded vrng: the same seed plans the same loops', () => {
    seedVisual(11);
    const a = planLoops('G', 0.85, 2);
    seedVisual(11);
    const b = planLoops('G', 0.85, 2);
    expect(b).toEqual(a);
    seedVisual(12);
    const c = planLoops('G', 0.85, 2);
    expect(c).not.toEqual(a);
  });

  it('is reproducible with an explicit stream too (same seed, same phrase)', () => {
    const a = planPhrase({ key: 'G', phrase: 0, prevLast: null, tied: false, density: 0.85 }, mulberry32(5));
    const b = planPhrase({ key: 'G', phrase: 0, prevLast: null, tied: false, density: 0.85 }, mulberry32(5));
    expect(b).toEqual(a);
  });

  it('a phrase is 4 bars of 3 beats; a tied first bar starts on beat 2 with [1,1] or [2]', () => {
    for (const seed of SEEDS) {
      for (const key of ['G', 'Em'] as Key[]) {
        const loops = planLoops(key, 0.85, 2, mulberry32(seed));
        for (const [l, loop] of loops.entries()) {
          for (const [ph, p] of loop.entries()) {
            for (let b = 0; b < 4; b++) {
              const bar = p.notes.filter((n) => n.bar === b);
              const first = bar[0] as Note;
              const tied = l > 0 && ph === 0 && b === 0;
              expect(first.beat, `seed ${seed} ${key} loop ${l} phrase ${ph} bar ${b}`).toBe(tied ? 1 : 0);
              const sum = bar.reduce((s, n) => s + n.dur, 0);
              expect(sum, `seed ${seed} bar ${b}`).toBe(tied ? 2 : 3);
              if (tied) expect(bar.map((n) => n.dur)).toSatisfy((d: number[]) => JSON.stringify(d) === '[1,1]' || JSON.stringify(d) === '[2]');
            }
          }
        }
      }
    }
  });

  it('every beat-1 note of bars 1-15 is a chord tone of its bar (5.4 item 5); bar 16 is the tonic', () => {
    for (const seed of SEEDS) {
      for (const key of ['G', 'Em'] as Key[]) {
        const loops = planLoops(key, 1.0, 2, mulberry32(seed));
        for (const loop of loops) {
          for (const p of loop) {
            for (const n of p.notes) {
              if (n.beat !== 0) continue;
              const gb = p.phrase * 4 + n.bar;
              if (gb === 15) continue;
              expect(isChordTone(n.midi, CHORDS[key][gb] as string), `seed ${seed} ${key} bar ${gb + 1} note ${n.midi}`).toBe(true);
            }
          }
        }
      }
    }
  });

  it('bar 16 is the tonic (G5 or G4; E5 in minor) held 3 beats and tied into bar 1 (5.4 item 3)', () => {
    for (const seed of SEEDS) {
      for (const key of ['G', 'Em'] as Key[]) {
        const loops = planLoops(key, 0.6, 2, mulberry32(seed));
        for (const loop of loops) {
          const last = loop[3] as PhrasePlan;
          const bar16 = last.notes.filter((n) => n.bar === 3);
          expect(bar16.length).toBe(1);
          const n = bar16[0] as Note;
          expect(n.beat).toBe(0);
          expect(n.dur).toBe(3);
          expect(n.tie).toBe(true);
          expect(n.rest).toBe(false);
          expect(TONIC[key]).toContain(n.midi);
        }
      }
    }
  });

  it('never two leaps the same way, within a phrase and across phrase and loop seams (5.4 item 4)', () => {
    for (const seed of SEEDS) {
      for (const key of ['G', 'Em'] as Key[]) {
        const scale = scalePitches(key);
        const loops = planLoops(key, 1.0, 3, mulberry32(seed));
        const seq: number[] = [];
        for (const loop of loops) for (const p of loop) for (const n of p.notes) seq.push(n.midi);
        for (let i = 2; i < seq.length; i++) {
          const d1 = degreeOf(scale, seq[i - 1] as number) - degreeOf(scale, seq[i - 2] as number);
          const d2 = degreeOf(scale, seq[i] as number) - degreeOf(scale, seq[i - 1] as number);
          const twoLeaps = Math.abs(d1) >= 2 && Math.abs(d2) >= 2 && Math.sign(d1) === Math.sign(d2);
          expect(twoLeaps, `seed ${seed} ${key} at note ${i}: ${seq[i - 2]} ${seq[i - 1]} ${seq[i]}`).toBe(false);
        }
      }
    }
  });

  it('stays inside G4-D6 (67-86) and never starts or ends a phrase on C or F# (5.4 items 1 and 3)', () => {
    for (const seed of SEEDS) {
      for (const key of ['G', 'Em'] as Key[]) {
        for (const loop of planLoops(key, 0.5, 2, mulberry32(seed))) {
          for (const p of loop) {
            for (const n of p.notes) {
              expect(n.midi).toBeGreaterThanOrEqual(MEL_LO);
              expect(n.midi).toBeLessThanOrEqual(MEL_HI);
              if (n.grace !== null) expect(n.grace).toBeGreaterThan(n.midi);
            }
            const first = p.notes[0] as Note, last = p.notes[p.notes.length - 1] as Note;
            expect(PASSING_PC[key], `${key} phrase start ${first.midi}`).not.toContain(first.midi % 12);
            expect(PASSING_PC[key], `${key} phrase end ${last.midi}`).not.toContain(last.midi % 12);
            expect(Math.abs(last.midi - p.last)).toBe(0);
          }
        }
      }
    }
  });

  it('a phrase starts within a fifth of the previous phrase\'s last note (5.4 item 2)', () => {
    for (const seed of SEEDS) {
      const loops = planLoops('G', 0.85, 2, mulberry32(seed));
      let prev: PhrasePlan | null = null;
      for (const loop of loops) {
        for (const p of loop) {
          if (prev) expect(Math.abs((p.notes[0] as Note).midi - prev.last), `seed ${seed}`).toBeLessThanOrEqual(7);
          prev = p;
        }
      }
    }
  });

  it('density: 1.0 gives no rests; 0.3 rests only off beat 1 and never in a cadence bar (5.4 item 7)', () => {
    let rests = 0;
    for (const seed of SEEDS) {
      for (const p of planLoops('G', 1.0, 1, mulberry32(seed))[0] as Loop) for (const n of p.notes) expect(n.rest).toBe(false);
      for (const p of planLoops('G', 0.3, 1, mulberry32(seed))[0] as Loop) {
        for (const n of p.notes) {
          if (!n.rest) continue;
          rests++;
          expect(n.beat).not.toBe(0);
          expect(n.bar).not.toBe(3);
        }
      }
    }
    expect(rests).toBeGreaterThan(50);
  });

  it('ornaments: vibrato on every note of a beat or more, none on half-beat notes; a grace is the upper scale neighbour (5.4 item 6)', () => {
    for (const seed of SEEDS) {
      for (const p of planLoops('G', 1.0, 1, mulberry32(seed))[0] as Loop) {
        for (const n of p.notes) {
          expect(n.vib).toBe(n.dur >= 1);
          if (n.dur < 2) expect(n.grace).toBeNull();
          if (n.grace !== null) {
            const scale = scalePitches('G');
            expect(scale).toContain(n.grace);
            expect(n.grace).toBeGreaterThan(n.midi);
            expect(scale.some((m) => m > n.midi && m < (n.grace as number))).toBe(false); // the next scale pitch up, no further
          }
        }
      }
    }
  });

  it('planRun (flourish entry) climbs by step to D6 and holds it; phrase 4 keeps the tonic cadence', () => {
    const run = planRun({ key: 'G', phrase: 1, prevLast: 71, tied: false, density: 1 }, mulberry32(3));
    const seq = run.notes.map((n) => n.midi);
    for (let i = 1; i < seq.length; i++) expect((seq[i] as number) >= (seq[i - 1] as number)).toBe(true);
    expect(seq[seq.length - 1]).toBe(MEL_HI);
    expect(run.notes.reduce((s, n) => s + n.dur, 0)).toBe(12);
    const p4 = planRun({ key: 'G', phrase: 3, prevLast: 71, tied: false, density: 1 }, mulberry32(3));
    expect(TONIC.G).toContain((p4.notes[p4.notes.length - 1] as Note).midi);
  });
});

describe('music state table (05 5.6; 05 8.2 item 4)', () => {
  const base = { featuredStage: 0, affinityDelta: 0, light: 1, parted: false, happily: false, fireworks: false, buskerPan: null };
  it('picks flourish over parted over happily over night over rising over stroll', () => {
    expect(resolveState({ ...base })).toBe('stroll');
    expect(resolveState({ ...base, featuredStage: 3, affinityDelta: 0.01 })).toBe('rising');
    expect(resolveState({ ...base, featuredStage: 2, affinityDelta: 0.01 })).toBe('stroll');
    expect(resolveState({ ...base, featuredStage: 5, affinityDelta: 0 })).toBe('stroll');
    expect(resolveState({ ...base, featuredStage: 3, affinityDelta: 0.01, light: 0.21 })).toBe('night');
    expect(resolveState({ ...base, light: 0.1, happily: true })).toBe('happily');
    expect(resolveState({ ...base, happily: true, parted: true })).toBe('parted');
    expect(resolveState({ ...base, parted: true, fireworks: true })).toBe('flourish');
  });
  it('holds the tempos, keys, densities and lowpasses of the table', () => {
    expect(STATES.flourish).toMatchObject({ tempo: 176, key: 'G', density: 1.0, lowpass: 2400 });
    expect(STATES.parted).toMatchObject({ tempo: 120, key: 'Em', chords: false, counter: 'none', bassBeat1Only: true, density: 0.45, lowpass: 1500 });
    expect(STATES.happily).toMatchObject({ tempo: 168, key: 'G', counter: 'even', density: 1.0, lowpass: 2200 });
    expect(STATES.night).toMatchObject({ tempo: 140, key: 'G', chords: false, density: 0.55, lowpass: 1500 });
    expect(STATES.rising).toMatchObject({ tempo: 164, key: 'G', counter: 'even', density: 0.85, lowpass: 1900 });
    expect(STATES.stroll).toMatchObject({ tempo: 156, key: 'G', counter: 'none', density: 0.7, lowpass: 1900 });
  });
  it('tempo moves by at most 8 BPM per bar: 120 to 176 takes 7 bars, and stays inside 120-176', () => {
    expect(TEMPO_STEP).toBe(8);
    let t = 120, bars = 0;
    while (t !== 176) {
      const n = stepTempo(t, 176);
      expect(Math.abs(n - t)).toBeLessThanOrEqual(8);
      t = n;
      bars++;
    }
    expect(bars).toBe(7);
    expect(stepTempo(176, 120)).toBe(168);
    expect(stepTempo(124, 120)).toBe(120);
    expect(stepTempo(160, 300)).toBe(168);
    expect(stepTempo(121, 50)).toBe(120);
  });
});
