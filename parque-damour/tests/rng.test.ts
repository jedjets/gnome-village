// tests/rng.test.ts
// Locks register 2.9 and 03 2.3: two mulberry32 streams, a draw counter, restorable state (GV 583-598).
import { describe, it, expect } from 'vitest';
import { seedSim, seedVisual, rng, vrng, rngN, simState, setSimState, rint, pick, chance, mulberry32 } from '../src/core/rng.ts';

describe('core/rng (register 2.9, GV 583-598)', () => {
  it('the same seed gives the same 1000 draws', () => {
    seedSim(12345);
    const a = Array.from({ length: 1000 }, () => rng());
    seedSim(12345);
    const b = Array.from({ length: 1000 }, () => rng());
    expect(b).toEqual(a);
    expect(a.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('a different seed gives a different sequence', () => {
    seedSim(1);
    const a = Array.from({ length: 20 }, () => rng());
    seedSim(2);
    const b = Array.from({ length: 20 }, () => rng());
    expect(b).not.toEqual(a);
  });

  it('mulberry32 matches GV bit for bit (regression fixture)', () => {
    const r = mulberry32(1);
    expect([r(), r(), r()].map((v) => v.toFixed(12))).toEqual(MULBERRY_1);
    seedSim(12345);
    expect([rng(), rng(), rng()].map((v) => v.toFixed(12))).toEqual(MULBERRY_12345);
  });

  it('rngN counts sim draws only; the visual stream moves neither rngN nor the sim sequence', () => {
    seedSim(7);
    seedVisual(7);
    expect(rngN()).toBe(0);
    const a = [rng(), rng(), rng()];
    expect(rngN()).toBe(3);
    seedSim(7);
    seedVisual(99);
    vrng();
    vrng();
    const b = [rng(), vrng(), rng(), vrng(), rng()].filter((_, i) => i % 2 === 0);
    expect(b).toEqual(a);
    expect(rngN()).toBe(3);
  });

  it('the visual stream is itself deterministic from its seed', () => {
    seedVisual(42);
    const a = [vrng(), vrng(), vrng()];
    seedVisual(42);
    expect([vrng(), vrng(), vrng()]).toEqual(a);
  });

  it('simState and setSimState restore the stream mid-sequence, with the counter', () => {
    seedSim(2024);
    rng();
    rng();
    const s = simState(), n = rngN();
    const next = [rng(), rng()];
    setSimState(s, n);
    expect(rngN()).toBe(n);
    expect([rng(), rng()]).toEqual(next);
  });

  it('rint stays inside its bounds, pick returns a member, chance(0) and chance(1) are certain', () => {
    seedSim(3);
    for (let i = 0; i < 500; i++) {
      const v = rint(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(arr).toContain(pick(arr));
    expect(chance(0)).toBe(false);
    expect(chance(1)).toBe(true);
  });
});

// first three draws of GV's mulberry32 for seeds 1 and 12345 (computed from GV 588-589)
const MULBERRY_1 = ['0.627073940588', '0.002735721180', '0.527447039960'];
const MULBERRY_12345 = ['0.979728267761', '0.306752264500', '0.484205421526'];
