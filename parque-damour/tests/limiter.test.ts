// tests/limiter.test.ts
// Locks 05 2.4 items 1-3 and 08 2.8 rows 1-2 (GV aOK 6131-6137 with the 1-8 clamp): the gap scales with speed, soft gaps by
// 1 + 0.45 (speed - 1), unscaled gaps not at all, and an inaudible cue never stamps a gap (the audibility-before-gate fix).
import { describe, it, expect, beforeEach } from 'vitest';
import { T } from '../src/core/clock.ts';
import { gate, gapMs, setNow, resetGaps, lastStamp, canPass, stamp } from '../src/audio/limiter.ts';
import { CUES, CUE_IDS, admit, VOICE_GATE_MS } from '../src/audio/cues.ts';

describe('audio/limiter gate (05 2.4 items 1-2; GV 6131-6137)', () => {
  beforeEach(() => {
    resetGaps();
    setNow(0);
    T.speed = 1;
  });

  it('the first call always passes and stamps now', () => {
    setNow(1234);
    expect(gate('x', 100, false)).toBe(true);
    expect(lastStamp('x')).toBe(1234);
  });

  it('at 8x a hard 100 ms gap refuses until 800 ms', () => {
    T.speed = 8;
    expect(gapMs(100, false)).toBe(800);
    setNow(1000);
    expect(gate('x', 100, false)).toBe(true);
    setNow(1799);
    expect(gate('x', 100, false)).toBe(false);
    expect(lastStamp('x')).toBe(1000);
    setNow(1800);
    expect(gate('x', 100, false)).toBe(true);
  });

  it('at 8x a soft 100 ms gap refuses until 415 ms (1 + 7 x 0.45)', () => {
    T.speed = 8;
    expect(gapMs(100, true)).toBeCloseTo(415, 9);
    setNow(1000);
    expect(gate('x', 100, true)).toBe(true);
    setNow(1414);
    expect(gate('x', 100, true)).toBe(false);
    setNow(1415);
    expect(gate('x', 100, true)).toBe(true);
  });

  it('unscaled keeps 100 ms at 8x; paused counts as 1x; the clamp caps at 8 and floors at 1', () => {
    T.speed = 8;
    expect(gapMs(100, false, true)).toBe(100);
    T.speed = 0;
    expect(gapMs(100, false)).toBe(100);
    expect(gapMs(100, true)).toBe(100);
    T.speed = 20;
    expect(gapMs(100, false)).toBe(800);
  });

  it('keys are independent; canPass does not stamp, stamp does', () => {
    setNow(500);
    expect(gate('a', 100)).toBe(true);
    expect(gate('b', 100)).toBe(true);
    setNow(550);
    expect(canPass('a', 100)).toBe(false);
    expect(lastStamp('c')).toBeUndefined();
    expect(canPass('c', 100)).toBe(true);
    expect(lastStamp('c')).toBeUndefined();
    stamp('c');
    expect(lastStamp('c')).toBe(550);
  });
});

describe('audio/cues admit: audibility before the gate (05 2.4 item 3, review section 8)', () => {
  beforeEach(() => {
    resetGaps();
    setNow(0);
    T.speed = 1;
  });

  it('a cue with a below thresh (0.02) leaves the gap unchanged, then an audible one stamps it', () => {
    setNow(5000);
    expect(admit(CUES.laugh, 0.01)).toBe(false);
    expect(lastStamp('laugh')).toBeUndefined();
    expect(admit(CUES.laugh, 0.019)).toBe(false);
    expect(lastStamp('laugh')).toBeUndefined();
    expect(admit(CUES.laugh, 0.5)).toBe(true);
    expect(lastStamp('laugh')).toBe(5000);
    setNow(5400);
    expect(admit(CUES.laugh, 0.5)).toBe(false); // 450 ms soft at 1x
    setNow(5450);
    expect(admit(CUES.laugh, 0.5)).toBe(true);
  });

  it('an inaudible cue inside a gap does not refresh the stamp of an audible one', () => {
    setNow(100);
    expect(admit(CUES.splat, 1)).toBe(true);
    setNow(250);
    expect(admit(CUES.splat, 0)).toBe(false);
    expect(lastStamp('splat')).toBe(100);
    setNow(400);
    expect(admit(CUES.splat, 1)).toBe(true); // 300 ms hard gap, measured from 100 not 250
  });

  it('actor scope keys by actor and shares the 110 ms voice gate (05 2.4 item 4)', () => {
    setNow(1000);
    expect(admit(CUES.laugh, 1, { actor: 7 })).toBe(true);
    expect(lastStamp('laugh:7')).toBe(1000);
    expect(lastStamp('voice')).toBe(1000);
    expect(lastStamp('laugh')).toBeUndefined();
    setNow(1050);
    expect(admit(CUES.gasp, 1, { actor: 8 })).toBe(false); // the voice gate: two lovers never speak at once
    expect(lastStamp('gasp:8')).toBeUndefined();
    setNow(1000 + VOICE_GATE_MS);
    expect(admit(CUES.gasp, 1, { actor: 8 })).toBe(true);
    expect(admit(CUES.laugh, 1, { actor: 9 })).toBe(false); // voice just stamped by the gasp
    setNow(1000 + 2 * VOICE_GATE_MS);
    expect(admit(CUES.laugh, 1, { actor: 9 })).toBe(true);
  });

  it('the five cue-bed cues of S1: ids, gains at or below 0.060, gaps at or above 60 ms, positioned thresh 0.02', () => {
    expect(CUE_IDS).toEqual(['laugh', 'kiss', 'gasp', 'fireworks', 'splat']);
    for (const id of CUE_IDS) {
      const d = CUES[id];
      expect(d.id).toBe(id);
      expect(d.gain, id).toBeLessThanOrEqual(0.06);
      expect(d.gain, id).toBeGreaterThanOrEqual(0.003);
      expect(d.gap, id).toBeGreaterThanOrEqual(60);
      expect(d.thresh, id).toBe(0.02);
    }
    expect([CUES.laugh.gain, CUES.kiss.gain, CUES.gasp.gain, CUES.fireworks.gain, CUES.splat.gain]).toEqual([0.022, 0.018, 0.026, 0.04, 0.03]);
    expect([CUES.laugh.gap, CUES.kiss.gap, CUES.gasp.gap, CUES.fireworks.gap, CUES.splat.gap]).toEqual([450, 2000, 500, 350, 300]);
    expect([CUES.laugh.soft, CUES.kiss.soft, CUES.gasp.soft, CUES.fireworks.soft, CUES.splat.soft]).toEqual([true, true, true, false, false]);
    expect([CUES.laugh.scope, CUES.kiss.scope, CUES.gasp.scope, CUES.fireworks.scope, CUES.splat.scope]).toEqual(['actor', 'kind', 'actor', 'kind', 'kind']);
    expect(CUES.laugh.duck).toEqual({ db: -6, hold: 0.6 });
    expect(CUES.fireworks.duck).toEqual({ db: -3, hold: 0.3 });
    expect(CUES.splat.duck).toBeUndefined();
  });
});
