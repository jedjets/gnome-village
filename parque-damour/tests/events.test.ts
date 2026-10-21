// tests/events.test.ts
// Locks 03 2.3 and 4.5 / 08 2.1: `on` listeners run inside emit, `watch` listeners only at drain, and the lite bits drop only fx and cue
// events emitted after the first 8 steps of a frame.
import { describe, it, expect, beforeEach } from 'vitest';
import { LITE_FREE_STEPS, QUEUE_CAP, clearEvents, clearListeners, drain, emit, markStep, on, queued, watch, type GameEvent } from '../src/core/events.ts';

beforeEach(() => {
  clearListeners();
  clearEvents();
});

function run(lite: number): Record<string, number> {
  const seen: Record<string, number> = { fx: 0, cue: 0, stage: 0 };
  for (const k of ['fx', 'cue', 'stage'] as const) watch(k, () => (seen[k] = (seen[k] ?? 0) + 1));
  for (let step = 0; step < 20; step++) {
    emit({ kind: 'fx', tick: step });
    emit({ kind: 'cue', tick: step });
    emit({ kind: 'stage', tick: step });
    markStep();
  }
  drain(lite);
  return seen;
}

describe('core/events: on and watch (03 2.3)', () => {
  it('an on listener runs at once inside emit; a watch listener runs only at drain, in emission order', () => {
    const sim: number[] = [];
    const frame: number[] = [];
    on('stage', (e) => sim.push(e.tick));
    watch('stage', (e) => frame.push(e.tick));
    emit({ kind: 'stage', tick: 1 });
    emit({ kind: 'stage', tick: 2 });
    expect(sim).toEqual([1, 2]);
    expect(frame).toEqual([]);
    drain(0);
    expect(frame).toEqual([1, 2]);
    drain(0);
    expect(frame).toEqual([1, 2]); // delivered once
  });

  it('a kind nobody watches is not queued, and a listener sees the payload it was emitted with', () => {
    emit({ kind: 'laugh', tick: 1 });
    expect(queued()).toBe(0);
    let got: GameEvent | null = null;
    watch('chat', (e) => (got = e));
    emit({ kind: 'chat', tick: 9, x: 3, y: 4, params: { a: 'Amélie' }, ids: [7, 8] });
    expect(queued()).toBe(1);
    drain(0);
    expect(got).toEqual({ kind: 'chat', tick: 9, x: 3, y: 4, params: { a: 'Amélie' }, ids: [7, 8] });
  });

  it('clearEvents drops the queue but keeps the listeners', () => {
    let n = 0;
    watch('step', () => n++);
    emit({ kind: 'step', tick: 1 });
    clearEvents();
    drain(0);
    expect(n).toBe(0);
    emit({ kind: 'step', tick: 2 });
    drain(0);
    expect(n).toBe(1);
  });
});

describe('core/events: lite bits (03 4.5)', () => {
  it('the first 8 steps of a frame always deliver', () => {
    expect(LITE_FREE_STEPS).toBe(8);
  });
  it('lite 0 drops nothing', () => {
    expect(run(0)).toEqual({ fx: 20, cue: 20, stage: 20 });
  });
  it('bit 1 drops fx beyond 8 steps; bit 2 drops cue beyond 8 steps; stage is never dropped', () => {
    expect(run(1)).toEqual({ fx: 8, cue: 20, stage: 20 });
    clearListeners();
    expect(run(2)).toEqual({ fx: 20, cue: 8, stage: 20 });
    clearListeners();
    expect(run(3)).toEqual({ fx: 8, cue: 8, stage: 20 });
  });
  it('drain starts the next frame at step 0 again', () => {
    run(3);
    const seen: number[] = [];
    watch('fx', (e) => seen.push(e.tick));
    for (let step = 0; step < 10; step++) {
      emit({ kind: 'fx', tick: step });
      markStep();
    }
    drain(1);
    expect(seen).toHaveLength(8);
  });
});

describe('core/events: the queue is bounded', () => {
  it('a caller that never drains keeps at most QUEUE_CAP events, the newest', () => {
    watch('step', () => undefined);
    for (let i = 0; i < QUEUE_CAP + 50; i++) emit({ kind: 'step', tick: i });
    expect(queued()).toBe(QUEUE_CAP);
    const ticks: number[] = [];
    watch('step', (e) => ticks.push(e.tick));
    drain(0);
    expect(ticks).toHaveLength(QUEUE_CAP);
    expect(ticks[0]).toBe(50);
    expect(ticks[QUEUE_CAP - 1]).toBe(QUEUE_CAP + 49);
  });
});
