// tests/melody.test.ts
// Locks 05 5.4 (the melody planner) and 5.6 (the state table) per 05 8.2 items 3 and 4: with vrng seeded, planPhrase() is
// reproducible; every beat-1 note is a chord tone; no two leaps the same way; bar 16 is the tonic held 3 beats; range 67-86;
// the state priority; tempo steps of at most 8 BPM per bar. No AudioContext: planning is separate from scheduling.
import { describe, it, expect } from 'vitest';
import { mulberry32, seedVisual, visState } from '../src/core/rng.ts';
import { B_START, B_TONICS, GV_PHRASE, PENT_C, planBarB, planPhraseB } from '../src/audio/motif-b.ts';
import { CLAR_HI, CLAR_LO, FLOURISH_RUN, SWING_BARS, SWING_CHORDS, cStart, planBarC, type CNote, type CState } from '../src/audio/motif-c.ts';
import type { Variant } from '../src/audio/music-state.ts';
import {
  planPhrase, planRun, CHORDS, isChordTone, TONIC, MEL_LO, MEL_HI, PASSING_PC, scalePitches, resolveState, stepTempo, STATES,
  TEMPO_STEP, type Key, type PhrasePlan, type Note,
} from '../src/debug/motifs.ts'; // S8: the waltz is motif A in its new home (07 S8.6 step 6); the blocks below are unchanged

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

/* ====================================================================================================================
   S8 part B: the planners of the two motifs the game plays (08 2.8; 05 8.2 item 3). The numbers they lock are 05 5.2 (B), 5.3 (C) and the
   flourish entry of 5.6; the golden checksums were taken from the committed board code of the Music Gate (commit 5bbc5f3) with seed 101 and
   102, which the moved planners reproduce note for note (every note, time, length and gain of the four variants over 60 s).
   ==================================================================================================================== */
const VARIANTS: Variant[] = ['rising', 'parted'];
/** The golden checksums (seeds 101 and 102) of the gate code. */
const GOLD = { b101: 533129, b102: 551144, c101: 50448, c102: 292448 };
/** An order-sensitive checksum of a list of integers. */
const crc = (xs: number[]): number => xs.reduce((s, x, i) => (s + x * (i + 1)) % 1000003, 0);

/** n phrases of B per variant, chained as the game does (the first rising phrase is GV's, 5.2 item 5). */
function planB(n: number, rand?: () => number): number[][] {
  const out: number[][] = [];
  for (const v of VARIANTS) {
    let prev = B_START[v];
    for (let i = 0; i < n; i++) {
      const p = planPhraseB(prev, v, v === 'rising' && i === 0, rand);
      out.push(p);
      prev = p[p.length - 1] as number;
    }
  }
  return out;
}
/** n bars of C per variant, chained through the state a bar leaves (the clarinet's last note, the bass's last note). */
function planC(n: number, rand?: () => number): CNote[][] {
  const out: CNote[][] = [];
  for (const v of VARIANTS) {
    let st: CState = cStart(v);
    for (let bar = 0; bar < n; bar++) {
      const r = planBarC(bar, v, st, v === 'rising' ? 0.7 : 0.5, false, rand);
      st = r.state;
      out.push(r.notes);
    }
  }
  return out;
}
const cSum = (bars: CNote[][]): number =>
  crc(bars.flat().map((n) => n.midi * 7 + Math.round(n.beat * 3) + Math.round(n.dur * 100) + (n.voice === 'clar' ? 1 : n.voice === 'bass' ? 2 : 3)));

describe('motif B planner: reproducible under a seeded vrng (08 2.8; 05 5.2 item 6, 8.2 item 3)', () => {
  it('8 phrases in rising then 8 in parted: seed 101 twice is equal, seed 102 differs', () => {
    seedVisual(101);
    const a = planB(8);
    seedVisual(101);
    expect(planB(8)).toEqual(a);
    seedVisual(102);
    expect(planB(8)).not.toEqual(a);
  });
  it('holds the draws and their order: golden checksums of the gate code at seeds 101 and 102', () => {
    seedVisual(101);
    expect(crc(planB(8).flat())).toBe(GOLD.b101);
    seedVisual(102);
    expect(crc(planB(8).flat())).toBe(GOLD.b102);
  });
  it('a given stream plans the same and never touches vrng', () => {
    seedVisual(5);
    const before = visState();
    const a = planB(4, mulberry32(7));
    expect(visState()).toBe(before);
    expect(planB(4, mulberry32(7))).toEqual(a);
  });
  it("the first phrase after B starts in rising is GV's, MIDI 72 76 79 81 79 76 74 72 74 76 79 84 (5.2 item 5)", () => {
    expect(GV_PHRASE).toEqual([72, 76, 79, 81, 79, 76, 74, 72, 74, 76, 79, 84]);
    expect(planPhraseB(72, 'rising', true, () => 0.5)).toEqual(GV_PHRASE);
    seedVisual(101);
    expect(planB(1)[0]).toEqual(GV_PHRASE);
  });
  it('every phrase has 12 notes inside PENT_C and ends on a tonic: C5 or C6 in rising, A5 or A6 in parted (5.2 items 6 and 7)', () => {
    for (const v of VARIANTS) {
      let prev = B_START[v];
      for (let seed = 1; seed <= 200; seed++) {
        const p = planPhraseB(prev, v, false, mulberry32(seed));
        expect(p).toHaveLength(12);
        for (const m of p) expect(PENT_C).toContain(m);
        expect(B_TONICS[v]).toContain(p[11]);
        prev = p[11] as number;
      }
    }
    expect(B_TONICS).toEqual({ rising: [72, 84], parted: [81, 93] });
    expect([Math.min(...PENT_C), Math.max(...PENT_C)]).toEqual([72, 93]);
  });
  it('moves by one position or two (a step or a third of the pentatonic), a clamped move may stay (5.2 item 6b)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const p = planPhraseB(PENT_C[4] as number, 'rising', false, mulberry32(seed));
      let prev = PENT_C.indexOf(PENT_C[4] as number);
      for (const m of p.slice(0, 11)) {
        const i = PENT_C.indexOf(m);
        expect(Math.abs(i - prev)).toBeLessThanOrEqual(2);
        prev = i;
      }
    }
    const down = planPhraseB(93, 'rising', false, mulberry32(3)); // from the top of the set the first move cannot go up
    expect(PENT_C.indexOf(down[0] as number)).toBeLessThan(9);
    expect(planPhraseB(100, 'parted', false, () => 0.5)[0]).toBeDefined(); // a note not in the set starts at position 0
  });
});

describe('motif B bar: the left hand and the melody notes of a bar (05 5.2 items 3 and 4)', () => {
  const phrase = GV_PHRASE;
  it('rising: C4 at bass on beat 1, G4 and E5 at chords on beats 2 and 3', () => {
    const lh = planBarB(phrase, 0, 'rising', 1, () => 0).filter((n) => n.layer === 'lh');
    expect(lh).toEqual([
      { beat: 0, midi: 60, gain: 'bass', layer: 'lh' }, { beat: 1, midi: 67, gain: 'chords', layer: 'lh' }, { beat: 2, midi: 76, gain: 'chords', layer: 'lh' },
    ]);
  });
  it('parted: A3 at bass with E4 and C5 at chords, all three on beat 1 only', () => {
    const lh = planBarB(phrase, 0, 'parted', 1, () => 0).filter((n) => n.layer === 'lh');
    expect(lh.map((n) => [n.beat, n.midi, n.gain])).toEqual([[0, 57, 'bass'], [0, 64, 'chords'], [0, 72, 'chords']]);
  });
  it('note k of the phrase plays on beat k mod 3 of bar floor(k / 3); beat 1 always plays, beats 2 and 3 with probability density', () => {
    for (let bar = 0; bar < 4; bar++) {
      const all = planBarB(phrase, bar, 'rising', 1, () => 0.99).filter((n) => n.layer === 'mel');
      expect(all.map((n) => [n.beat, n.midi])).toEqual([0, 1, 2].map((b) => [b, phrase[bar * 3 + b]]));
      const some = planBarB(phrase, bar, 'rising', 0.8, () => 0.81).filter((n) => n.layer === 'mel');
      expect(some.map((n) => n.beat)).toEqual([0]); // a draw above the density leaves the optional notes out
      expect(planBarB(phrase, bar, 'rising', 0.8, () => 0.8).filter((n) => n.layer === 'mel')).toHaveLength(3); // at the density they play
    }
    expect(planBarB(phrase, 0, 'rising', 0.5, () => 0.99).filter((n) => n.gain === 'melody')).toHaveLength(1);
  });
});

describe('motif C planner: reproducible under a seeded vrng (08 2.8; 05 5.3 item 6, 8.2 item 3)', () => {
  it('16 bars in rising then 16 in parted: seed 101 twice is equal, seed 102 differs', () => {
    seedVisual(101);
    const a = planC(16);
    seedVisual(101);
    expect(planC(16)).toEqual(a);
    seedVisual(102);
    expect(planC(16)).not.toEqual(a);
  });
  it('holds the draws and their order: golden checksums of the gate code at seeds 101 and 102', () => {
    seedVisual(101);
    expect(cSum(planC(16))).toBe(GOLD.c101);
    seedVisual(102);
    expect(cSum(planC(16))).toBe(GOLD.c102);
  });
  it('a given stream plans the same and never touches vrng', () => {
    seedVisual(5);
    const before = visState();
    const a = planC(8, mulberry32(9));
    expect(visState()).toBe(before);
    expect(planC(8, mulberry32(9))).toEqual(a);
  });
  /** The chord sounding at beat `b` of bar `bar` (a bar with two chords changes on beat 3). */
  const chordAt = (v: Variant, bar: number, b: number): string => {
    const segs = (SWING_BARS[v][bar % 8] as string).split(' ');
    return segs[Math.min(segs.length - 1, Math.floor(b / (4 / segs.length)))] as string;
  };
  it('every melody note lies in 65-86; outside the flourish run every sung note on beats 1 and 3 is a tone of its chord; every answer bar is one note (5.3 item 6)', () => {
    for (const v of VARIANTS) {
      let st: CState = cStart(v);
      for (let seed = 1; seed <= 200; seed++) {
        const sung = planBarC(0, v, st, 0.7, false, mulberry32(seed));
        const answer = planBarC(1, v, sung.state, 0.7, false, mulberry32(seed + 1000));
        for (const n of sung.notes.filter((x) => x.voice === 'clar')) {
          expect(n.midi).toBeGreaterThanOrEqual(CLAR_LO);
          expect(n.midi).toBeLessThanOrEqual(CLAR_HI);
          if (n.beat === 0 || n.beat === 2) {
            const pcs = SWING_CHORDS[chordAt(v, 0, n.beat)] as readonly number[];
            expect(pcs).toContain(n.midi % 12);
          }
        }
        const a = answer.notes.filter((x) => x.voice === 'clar');
        expect(a).toHaveLength(1);
        expect(a[0]).toMatchObject({ beat: 0, dur: 1.5 });
        expect((SWING_CHORDS[chordAt(v, 1, 0)] as readonly number[])).toContain((a[0] as CNote).midi % 12);
        st = answer.state;
      }
    }
  });
  it('the flourish run sings D5 E5 F5 G5 A5 B♭5 C6 D6 as swung quavers in place of the sung bar, drawing nothing; an answer bar ignores it (5.6)', () => {
    expect(FLOURISH_RUN).toEqual([74, 76, 77, 79, 81, 82, 84, 86]);
    const boom = (): number => {
      throw new Error('the run must not draw');
    };
    const r = planBarC(0, 'rising', cStart('rising'), 1, true, boom);
    const clar = r.notes.filter((n) => n.voice === 'clar');
    expect(clar.map((n) => n.midi)).toEqual([...FLOURISH_RUN]);
    expect(clar.map((n) => [Math.floor(n.beat), +(n.beat % 1).toFixed(3), n.dur])).toEqual(
      [0, 1, 2, 3].flatMap((b) => [[b, 0, 0.62], [b, 0.667, 0.3]]),
    );
    expect(r.state.prevMel).toBe(86);
    expect(planBarC(1, 'rising', r.state, 1, true, () => 0.99).notes.filter((n) => n.voice === 'clar')).toHaveLength(1);
  });
  it('the walking bass: root, third, fifth, a semitone approach (rising); beats 1 and 3 (parted); 0.85 beat each (5.3 item 4)', () => {
    const bass = (v: Variant, bar: number, prev: number): CNote[] =>
      planBarC(bar, v, { prevMel: 72, prevBass: prev }, 1, false, () => 0.99).notes.filter((n) => n.voice === 'bass');
    expect(bass('rising', 0, 41).map((n) => [n.beat, n.midi, n.dur])).toEqual([[0, 41, 0.85], [1, 45, 0.85], [2, 48, 0.85], [3, 42, 0.85]]); // F2 A2 C3, then F#2 under G2
    // a two-chord bar: each chord's root and the approach to the next root, 2 beats each (Gm7: G2 then C#... the semitone under C2 is B1)
    expect(bass('rising', 1, 42).map((n) => [n.beat, n.midi])).toEqual([[0, 43], [1, 37], [2, 36], [3, 40]]);
    expect(bass('parted', 0, 38).map((n) => [n.beat, n.midi])).toEqual([[0, 38], [2, 45]]); // D2 and its fifth A2
    expect(bass('parted', 1, 45).map((n) => [n.beat, n.midi])).toEqual([[0, 40], [2, 45]]); // Em7b5 A7: each chord's root
  });
  it('the comp: the third, fifth and sixth or seventh above the root in octave 4 on beats 2 and 4 (rising only), 0.15 s (5.3 item 5)', () => {
    const comp = (v: Variant, bar: number): CNote[] => planBarC(bar, v, cStart(v), 1, false, () => 0.99).notes.filter((n) => n.voice === 'comp');
    expect(comp('rising', 0).map((n) => [n.beat, n.midi, n.dur])).toEqual([[1, 69, 0.15], [1, 72, 0.15], [1, 74, 0.15], [3, 69, 0.15], [3, 72, 0.15], [3, 74, 0.15]]); // F6 over F4
    expect(comp('rising', 1).map((n) => [n.beat, n.midi])).toEqual([[1, 70], [1, 74], [1, 77], [3, 64], [3, 67], [3, 70]]); // Gm7 then C7: the root is not played
    expect(comp('parted', 0)).toEqual([]);
  });
});
