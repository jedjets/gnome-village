// tests/limiter.test.ts
// Locks 05 2.4 items 1-3 and 08 2.8 rows 1-2 (GV aOK 6131-6137 with the 1-8 clamp): the gap scales with speed, soft gaps by
// 1 + 0.45 (speed - 1), unscaled gaps not at all, and an inaudible cue never stamps a gap (the audibility-before-gate fix).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { T } from '../src/core/clock.ts';
import { CTR, cam, centreOn, setViewport } from '../src/render/camera.ts';
import { auditLog, clearLog, dryCalls, setDryRun, setMuted } from '../src/audio/engine.ts';
import { gate, gapMs, setNow, resetGaps, lastStamp, canPass, stamp } from '../src/audio/limiter.ts';
import { CUES, CUE_IDS, admit, cue, VOICE_GATE_MS } from '../src/audio/cues.ts';

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

  it('the five cue-bed cues of S1 are in the registry of S8 as heard: gains at or below 0.060, gaps at or above 60 ms, positioned thresh 0.02', () => {
    const FIVE = ['laugh', 'kiss', 'gasp', 'fireworks', 'splat'] as const;
    for (const id of FIVE) expect(CUE_IDS).toContain(id); // S8 filled the 38 rows around them (cues.test.ts holds the whole registry)
    for (const id of FIVE) {
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

describe('cue(): on and muted, audibility, the gate, then play (05 2.4 items 3 to 5; review section 8)', () => {
  const rows = (): Array<[string, boolean, string]> => auditLog().map((r) => [r.id, r.played, r.why]);
  beforeEach(() => {
    resetGaps();
    setNow(10_000);
    T.speed = 1;
    setViewport(390, 844, 1);
    cam.z = 1.3;
    centreOn(CTR, CTR);
    setMuted(false);
    setDryRun(true);
    clearLog();
    dryCalls(true);
  });
  afterEach(() => {
    setDryRun(false);
    setMuted(false);
  });

  it('an off-screen cue never takes the slot of an on-screen one of the same kind', () => {
    expect(cue('splat', 500, 500)).toBe(false); // far outside the 0.85 window: a = 0
    expect(lastStamp('splat')).toBeUndefined();
    expect(cue('splat', CTR, CTR)).toBe(true);
    expect(lastStamp('splat')).toBe(10_000);
    setNow(10_100);
    expect(cue('splat', 500, 500)).toBe(false); // still inaudible: the stamp stays where the audible one put it
    expect(lastStamp('splat')).toBe(10_000);
    expect(rows()).toEqual([['splat', false, 'inaudible'], ['splat', true, 'ok'], ['splat', false, 'inaudible']]);
  });

  it('muted: nothing is stamped and nothing sounds; unmuted it plays at once', () => {
    setMuted(true);
    expect(cue('place', CTR, CTR)).toBe(false);
    expect(lastStamp('place')).toBeUndefined();
    expect(dryCalls().tone).toBe(0);
    expect(rows()).toEqual([['place', false, 'muted']]);
    setMuted(false);
    expect(cue('place', CTR, CTR)).toBe(true);
    expect(dryCalls().tone).toBe(2);
  });

  it('the floor of happily, parted and the foghorn keeps them audible off screen (GV 6189); an unpositioned cue skips the audibility step', () => {
    expect(cue('happily', 500, 500)).toBe(true);
    expect(auditLog().at(-1)?.a).toBe(0.4);
    expect(cue('foghorn', 24, -4)).toBe(true);
    expect(auditLog().at(-1)?.a).toBeGreaterThanOrEqual(0.6);
    expect(cue('ui_tap', NaN, NaN)).toBe(true);
    expect(auditLog().at(-1)?.a).toBe(1);
  });

  it('the foghorn keeps 20 s at 8x (unscaled); a hard 450 ms gap is 3.6 s at 8x and a soft 4000 ms one 16.6 s', () => {
    T.speed = 8;
    expect(cue('foghorn', 24, -4)).toBe(true);
    setNow(10_000 + 19_999);
    expect(cue('foghorn', 24, -4)).toBe(false);
    setNow(10_000 + 20_000);
    expect(cue('foghorn', 24, -4)).toBe(true);
    expect(cue('bench_creak', CTR, CTR)).toBe(true);
    setNow(10_000 + 20_000 + 3_599);
    expect(cue('bench_creak', CTR, CTR)).toBe(false);
    setNow(10_000 + 20_000 + 3_600);
    expect(cue('bench_creak', CTR, CTR)).toBe(true);
    expect(cue('happily', CTR, CTR)).toBe(true);
    setNow(10_000 + 20_000 + 3_600 + 16_599);
    expect(cue('happily', CTR, CTR)).toBe(false);
    setNow(10_000 + 20_000 + 3_600 + 16_600);
    expect(cue('happily', CTR, CTR)).toBe(true);
  });

  it('two lovers speak in turn: an actor cue keys by actor and also passes the shared 110 ms voice gate', () => {
    expect(cue('laugh', CTR, CTR, { actor: 1 })).toBe(true);
    setNow(10_050);
    expect(cue('gasp', CTR, CTR, { actor: 2 })).toBe(false);
    expect(lastStamp('gasp:2')).toBeUndefined();
    setNow(10_000 + VOICE_GATE_MS);
    expect(cue('gasp', CTR, CTR, { actor: 2 })).toBe(true);
    setNow(10_000 + 2 * VOICE_GATE_MS);
    expect(cue('laugh', CTR, CTR)).toBe(true); // no actor: the kind scope, no voice gate (05 2.4 item 4)
    expect(lastStamp('laugh')).toBe(10_000 + 2 * VOICE_GATE_MS);
  });

  it('footsteps are a patter: each walker keeps 70 ms, the kind gate keeps the crowd to one a gap, and a step never takes the voice slot', () => {
    expect(cue('step_gravel', CTR, CTR, { actor: 1 })).toBe(true);
    expect(cue('step_gravel', CTR, CTR, { actor: 2 })).toBe(false); // the kind gate, same instant
    expect(lastStamp('voice')).toBeUndefined();
    setNow(10_070);
    expect(cue('step_gravel', CTR, CTR, { actor: 2 })).toBe(true);
    expect(cue('laugh', CTR, CTR, { actor: 3 })).toBe(true); // a step before it did not close the voice gate
    T.speed = 8;
    setNow(10_070 + 559);
    expect(cue('step_gravel', CTR, CTR, { actor: 1 })).toBe(false); // the kind gate: the last step of anyone was at 10 070, 560 ms at 8x
    setNow(10_070 + 560);
    expect(cue('step_gravel', CTR, CTR, { actor: 1 })).toBe(true); // and actor 1's own 560 ms since 10 000 are long over
    expect(cue('step_gravel', CTR, CTR, { actor: 4 })).toBe(false); // the crowd: one per 560 ms
  });

  it('a row with no gap (fountain, plip) is never gated and never stamps', () => {
    for (let i = 0; i < 5; i++) expect(cue('fountain', CTR, CTR)).toBe(true);
    expect(lastStamp('fountain')).toBeUndefined();
    expect(cue('hush', NaN, NaN)).toBe(true);
  });
});
