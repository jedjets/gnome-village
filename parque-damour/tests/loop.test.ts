// tests/loop.test.ts
// Locks 03 4.1, 4.2, 4.5 and 4.6 / 06 1.2 / 08 2.1 (GV 12082-12083): nsMax, the wall budget, the lite bits; the order of a step; the
// once-a-second wear decay; the paused frame (speed and park.new apply while paused, owner 2026-10-13); newPark. Step cost is measured
// by tools/perf.mjs (08 5), never here (08 1.3 item 3). The debug/perf tests are in tests/perf.test.ts.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PAUSED_KINDS, SIM_DT, SP, budgetMs, liteFor, newPark, nsMax, setSpeed, setTick, simulate, start, tick } from '../src/core/loop.ts';
import { OK, enqueue, log, pendingCount, registerHandler, replay } from '../src/core/commands.ts';
import { clearListeners, on, watch } from '../src/core/events.ts';
import { T, STEPS_PER_DAY } from '../src/core/clock.ts';
import { W } from '../src/core/weather.ts';
import { WEAR } from '../src/world/grid.ts';
import { parkSeed } from '../src/world/gen.ts';
import { restore, snapshot, stateHash } from '../src/save/store.ts';

beforeEach(() => {
  clearListeners();
  newPark(101);
  setSpeed(1);
});

describe('core/loop governor (03 4.1; GV 12082-12083)', () => {
  it('nsMax(speed) = clamp(ceil(speed * 2.2) + 4, 8, 48): 8 at 1x, 22 at 8x', () => {
    expect(nsMax(8)).toBe(22);
    expect(nsMax(1)).toBe(8);
    expect(nsMax(4)).toBe(13); // ceil(8.8) + 4
  });
  it('the wall budget is 26 ms above 6x, 13 above 3x, else 9', () => {
    expect([8, 7, 6, 4, 3, 1].map(budgetMs)).toEqual([26, 26, 13, 13, 9, 9]);
  });
  it('lite is 3 above 6x, else 1', () => {
    expect(liteFor(8)).toBe(3);
    expect(liteFor(7)).toBe(3);
    expect(liteFor(6)).toBe(1);
    expect(liteFor(1)).toBe(1);
  });
  it('SIM_DT is 1/60 and the dial is 0 to 8', () => {
    expect(SIM_DT).toBe(1 / 60);
    setSpeed(8);
    expect(T.speed).toBe(8);
    setSpeed(99);
    expect(T.speed).toBe(8);
    setSpeed(0);
    expect(T.speed).toBe(0);
    setSpeed(2.4);
    expect(T.speed).toBe(2);
    setSpeed(-3);
    expect(T.speed).toBe(0);
  });
});

describe('core/loop simulate (03 4.2)', () => {
  it('each step counts one tick and moves the clock from the integer tick', () => {
    for (let i = 0; i < 600; i++) simulate(SIM_DT, 1);
    expect(tick()).toBe(600);
    expect(T.abs).toBeCloseTo(0.3 + 600 / STEPS_PER_DAY, 12);
    expect(T.day).toBe(1);
  });
  it('lap times land in SP under the phase names of 03 4.2, in step order', () => {
    const before = Object.values(SP).reduce((a, b) => a + b, 0);
    for (let i = 0; i < 500; i++) simulate(SIM_DT, 1);
    expect(Object.values(SP).reduce((a, b) => a + b, 0)).toBeGreaterThan(before);
    expect(Object.keys(SP)).toEqual(['cmd', 'time', 'weather', 'day', 'abilities', 'arrivals', 'visitors', 'creatures', 'romance', 'wear', 'plan', 'charm']);
  });
  it('lite changes nothing the hash covers (03 4.5)', () => {
    for (let i = 0; i < 3000; i++) simulate(SIM_DT, 1);
    const a = stateHash();
    newPark(101);
    for (let i = 0; i < 3000; i++) simulate(SIM_DT, 3);
    expect(stateHash()).toBe(a);
  });
  it('commands apply before the clock: a speed command and the tick it names arrive together', () => {
    const order: string[] = [];
    on('applied', () => order.push('applied@' + tick()));
    on('newday', () => order.push('newday@' + tick()));
    setTick(15119);
    enqueue({ side: 'park', kind: 'speed', payload: { speed: 3 } });
    simulate(SIM_DT, 1);
    simulate(SIM_DT, 1);
    expect(order).toEqual(['applied@15120', 'newday@15120']);
  });
  it('wear decays once per sim second, on whole steps: tick 60 and not before', () => {
    WEAR[100] = 0.5;
    for (let i = 0; i < 59; i++) simulate(SIM_DT, 1);
    expect(WEAR[100]).toBe(0.5);
    simulate(SIM_DT, 1);
    expect(WEAR[100]).toBeCloseTo(0.49875, 6);
    for (let i = 0; i < 60; i++) simulate(SIM_DT, 1);
    expect(WEAR[100]).toBeCloseTo(0.5 * 0.9975 * 0.9975, 6);
  });
  it('the day turns with an event once and the weather machine runs on the sim stream', () => {
    let days = 0;
    on('newday', () => days++);
    for (let i = 0; i < 15200; i++) simulate(SIM_DT, 1);
    expect(days).toBe(1);
    expect(T.day).toBe(2);
    expect(W.kind).toBeDefined();
  });
});

describe('core/loop newPark and setTick', () => {
  it('newPark(seed) twice gives the same park; a different seed does not', () => {
    newPark(5);
    const a = stateHash();
    for (let i = 0; i < 100; i++) simulate(SIM_DT, 1);
    newPark(5);
    expect(stateHash()).toBe(a);
    newPark(6);
    expect(stateHash()).not.toBe(a);
    expect(tick()).toBe(0);
  });
  it('setTick sets the clock without events and drops what was queued', () => {
    let n = 0;
    on('newday', () => n++);
    enqueue({ side: 'park', kind: 'speed', payload: { speed: 5 } });
    setTick(20000);
    expect(T.day).toBe(2);
    expect(n).toBe(0);
    simulate(SIM_DT, 1);
    expect(T.speed).toBe(1); // the speed command did not survive
  });
});

/* The frame driver: requestAnimationFrame stubbed so a test runs frames by hand; loop.start() wires the frame once per module, so the
   callback it registered is kept here for every later test. */
let rafCb: FrameRequestCallback | null = null;
let rafTs = 1000;
function stubRaf(): void {
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => {
    rafCb = f;
    return 1;
  });
  start();
}
/** One frame 0.02 s after the last (one step at 1x). */
function frame(): void {
  rafTs += 20;
  rafCb?.(rafTs);
}

describe('core/loop the paused frame (03 4.6)', () => {
  it('the kinds a paused frame applies are speed and park.new (owner 2026-10-13)', () => {
    expect([...PAUSED_KINDS].sort()).toEqual(['park.new', 'speed']);
  });

  it('while paused only speed and park.new apply; the rest wait for the first step, so the live order equals the replay order', () => {
    // two order-dependent stand-ins for kinds later slices own: park first gives (0 + 1) * 3 = 3, cupid first gives 0 * 3 + 1 = 1
    registerHandler('visitor.call', () => {
      WEAR[0] = (WEAR[0] as number) + 1;
      return OK;
    });
    registerHandler('ability', () => {
      WEAR[0] = (WEAR[0] as number) * 3;
      return OK;
    });
    setSpeed(0);
    const snap = JSON.parse(JSON.stringify(snapshot())) as ReturnType<typeof snapshot>;
    try {
      stubRaf();
      frame();
      enqueue({ side: 'cupid', kind: 'ability', payload: { id: 'c_petals', target: { kind: 'park' } } });
      frame();
      enqueue({ side: 'park', kind: 'visitor.call', payload: { gate: null } });
      frame();
      expect(WEAR[0]).toBe(0); // nothing that changes the sim applied while paused
      enqueue({ side: 'park', kind: 'speed', payload: { speed: 1 } });
      frame();
      expect(T.speed).toBe(1); // the unpause applied in the paused frame
      expect(tick()).toBe(0);
      expect(WEAR[0]).toBe(0);
      frame();
      expect(tick()).toBe(1);
      expect(WEAR[0]).toBe(3); // park before cupid, as 03 5.2 sorts them
    } finally {
      vi.unstubAllGlobals();
    }
    const h = stateHash();
    const cmds = log().map((c) => ({ ...c }));
    expect(cmds.map((c) => c.kind)).toEqual(['speed', 'visitor.call', 'ability']);
    restore(snap);
    replay(cmds, 1);
    expect(stateHash()).toBe(h);
  });

  it('a New confirmed while paused gives the fresh park at once and stays paused; what was queued for the old park is dropped', () => {
    registerHandler('visitor.call', () => {
      WEAR[0] = (WEAR[0] as number) + 1;
      return OK;
    });
    newPark(5);
    const fresh = stateHash(); // seed 5 at tick 0, untouched
    newPark(101);
    for (let i = 0; i < 300; i++) simulate(SIM_DT, 1);
    setSpeed(0);
    const news: number[] = [];
    watch('applied', (e) => {
      if (e.params?.kind === 'park.new') news.push(tick());
    });
    try {
      stubRaf();
      frame();
      enqueue({ side: 'park', kind: 'visitor.call', payload: { gate: null } }); // for the old park: it waits, then New drops it
      enqueue({ side: 'park', kind: 'park.new', payload: { seed: 5 } });
      frame();
      expect(news).toEqual([0]); // applied in the paused frame, its event drained in the same frame (main.ts clears the key, the view)
      expect([tick(), parkSeed(), T.speed]).toEqual([0, 5, 0]); // the fresh park, still paused
      expect(stateHash()).toBe(fresh); // the visitor.call queued before New never reached the new park
      expect(pendingCount()).toBe(0);
      enqueue({ side: 'park', kind: 'visitor.call', payload: { gate: null } }); // for the new park: waits for the unpause
      frame();
      frame();
      expect([tick(), WEAR[0]]).toEqual([0, 0]);
      enqueue({ side: 'park', kind: 'speed', payload: { speed: 1 } });
      frame();
      expect([T.speed, tick()]).toEqual([1, 0]);
      frame();
      expect([tick(), WEAR[0]]).toEqual([1, 1]); // the first step applies it
      expect(log().map((c) => c.kind)).toEqual(['speed', 'visitor.call']); // park.new starts the log and is not in it
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
