// tests/perf.test.ts
// Locks 03 13 / 08 2.9 (GV 12056-12069): debug/perf's EMA with k = 0.08, the one-second peaks, the quality step-down after 180 slow
// frames past the 4 s warm-up (never up, floor 2), and the #perf overlay text.
import { describe, it, expect, beforeEach } from 'vitest';
import { FT, SLOW_FRAMES, ftNote, perfText, qualityLevel, resetPerf, setPerfCounts } from '../src/debug/perf.ts';

/** One slow frame (draw 23 ms) at a time past the 4 s warm-up. */
const frame = (i: number): void => ftNote(2, 23, 25, 5000 + i);

describe('debug/perf (GV 12056-12069)', () => {
  beforeEach(() => {
    resetPerf();
    setPerfCounts(() => ({ people: 3, creatures: 2, props: 27, zoom: 1.3 }));
  });

  it('smooths with k = 0.08 and keeps the worst of the last second', () => {
    ftNote(10, 20, 30, 100);
    expect(FT.sim).toBeCloseTo(0.8, 6);
    expect(FT.draw).toBeCloseTo(1.6, 6);
    expect(FT.frame).toBeCloseTo(2.4, 6);
    ftNote(5, 5, 10, 200);
    expect(FT.wSim).toBe(10);
    expect(FT.wDraw).toBe(20);
    ftNote(1, 1, 2, 1500); // a new second: the window restarts, the previous second's frame count is kept
    expect(FT.wSim).toBe(1);
    expect(FT.fps).toBe(2);
  });
  it('steps the quality down after 180 slow frames and never up', () => {
    FT.draw = 23;
    for (let i = 0; i < SLOW_FRAMES - 1; i++) frame(i);
    expect(qualityLevel()).toBe(0);
    frame(SLOW_FRAMES);
    expect(qualityLevel()).toBe(1);
    for (let i = 0; i < SLOW_FRAMES; i++) frame(i);
    expect(qualityLevel()).toBe(2);
    FT.draw = 8;
    for (let i = 0; i < 1000; i++) ftNote(2, 8, 10, 9000 + i);
    expect(qualityLevel()).toBe(2);
    FT.draw = 23;
    for (let i = 0; i < 2 * SLOW_FRAMES; i++) frame(i);
    expect(qualityLevel()).toBe(2); // 2 is the floor
  });
  it('a slow frame run is broken by one fast frame, and the first 4 s never count', () => {
    FT.draw = 23;
    for (let i = 0; i < 170; i++) ftNote(2, 23, 25, 5000 + i);
    FT.draw = 10;
    ftNote(2, 10, 12, 6000);
    FT.draw = 23;
    for (let i = 0; i < 170; i++) ftNote(2, 23, 25, 7000 + i);
    expect(qualityLevel()).toBe(0);
    resetPerf();
    FT.draw = 23;
    for (let i = 0; i < 400; i++) ftNote(2, 23, 25, 1000 + i);
    expect(qualityLevel()).toBe(0);
  });
  it('the overlay text names frame, sim, draw, the counts and the level', () => {
    const t = perfText();
    expect(t).toContain('frame ');
    expect(t).toContain('sim ');
    expect(t).toContain('draw ');
    expect(t).toContain('3 people · 2 creatures · 27 props · zoom 1.30 · quality 0');
  });
});
