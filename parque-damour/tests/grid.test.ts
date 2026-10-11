// tests/grid.test.ts
// Locks register 3.1 and 03 3.2: N, NC, I, inB, the kinds, the layers; and the S0 starter park's fixed skeleton (02 2.5).
import { describe, it, expect } from 'vitest';
import { N, S, NC, I, inB, Kind, KIND, WATER, BEDC, BLOCK, rebuildBlock, layersState } from '../src/world/grid.ts';
import { genPark } from '../src/world/gen.ts';
import { rngN } from '../src/core/rng.ts';
import { GATES, isBoundary, isGateTile, nearestGate, APRON } from '../src/world/park.ts';

describe('world/grid constants (register 3.1)', () => {
  it('N 48, S 1, NC 2304, I(x, y) = y * N + x', () => {
    expect(N).toBe(48);
    expect(S).toBe(1);
    expect(NC).toBe(2304);
    expect(I(0, 0)).toBe(0);
    expect(I(47, 0)).toBe(47);
    expect(I(0, 1)).toBe(48);
    expect(I(47, 47)).toBe(NC - 1);
  });
  it('inB is the half-open square', () => {
    expect(inB(0, 0)).toBe(true);
    expect(inB(47, 47)).toBe(true);
    expect(inB(-1, 0)).toBe(false);
    expect(inB(0, 48)).toBe(false);
  });
  it('the kinds are spelled and numbered as 03 3.2', () => {
    expect(Kind).toEqual({ lawn: 0, gravel: 1, flagstone: 2, bed: 3, mulch: 4, pond: 5, canal: 6 });
  });
  it('every layer has NC entries', () => {
    const s = layersState();
    for (const arr of Object.values(s)) expect(arr.length).toBe(NC);
  });
});

describe('world/park gates (02 2.4)', () => {
  it('five gates with the fixed tiles and weights', () => {
    expect(GATES.map((g) => g.id)).toEqual(['g_south_w', 'g_south_e', 'g_west', 'g_east', 'g_north']);
    expect(GATES.map((g) => g.weight)).toEqual([30, 30, 15, 15, 10]);
    expect(isGateTile(12, 47)).toBe('g_south_w');
    expect(isGateTile(0, 24)).toBe('g_west');
    expect(isGateTile(5, 5)).toBeNull();
    expect(nearestGate(24, 2).id).toBe('g_north');
    expect(nearestGate(24, 2, 'g_north').id).not.toBe('g_north');
  });
  it('boundary and apron', () => {
    expect(APRON).toBe(8);
    expect(isBoundary(0, 10)).toBe(true);
    expect(isBoundary(47, 47)).toBe(true);
    expect(isBoundary(1, 1)).toBe(false);
    expect(isBoundary(-1, 0)).toBe(false);
  });
});

describe('world/gen starter park (02 2.5, S0 subset)', () => {
  it('the same seed gives the same park and the same draw count', () => {
    genPark(42);
    const a = KIND.slice(), na = rngN();
    genPark(42);
    expect(KIND).toEqual(a);
    expect(rngN()).toBe(na);
    expect(na).toBeGreaterThan(0);
  });
  it('seeds differ somewhere (the pond position or the bed order)', () => {
    const seen = new Set<string>();
    for (let s = 1; s <= 12; s++) {
      genPark(s);
      seen.add(KIND.join(','));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
  it('the fixed skeleton: loops, spokes, flagstone ring, beds, gates on gravel, lawn elsewhere', () => {
    genPark(7);
    expect(KIND[I(17, 23)]).toBe(Kind.gravel); // inner loop west side
    expect(KIND[I(30, 23)]).toBe(Kind.gravel); // inner loop east side
    expect(KIND[I(9, 23)]).toBe(Kind.gravel); // outer loop west side
    expect(KIND[I(23, 38)]).toBe(Kind.gravel); // outer loop south side
    expect(KIND[I(12, 42)]).toBe(Kind.gravel); // south-west spoke
    expect(KIND[I(23, 4)]).toBe(Kind.gravel); // north spoke
    expect(KIND[I(3, 23)]).toBe(Kind.gravel); // west spoke
    expect(KIND[I(23, 23)]).toBe(Kind.flagstone); // fountain ring
    expect(KIND[I(19, 19)]).toBe(Kind.bed);
    expect(KIND[I(28, 28)]).toBe(Kind.bed);
    expect(BEDC[I(19, 19)]).not.toBe(BEDC[I(27, 27)]);
    for (const g of GATES) for (const t of g.tiles) expect(KIND[I(t.x, t.y)]).toBe(Kind.gravel);
    expect(KIND[I(5, 5)]).toBe(Kind.lawn);
    expect(KIND[I(44, 44)]).toBe(Kind.lawn);
  });
  it('the pond is 16 tiles of WATER 0.6 inside the box (30,8)-(37,13), never on the outer loop', () => {
    for (let s = 1; s <= 8; s++) {
      genPark(s);
      let n = 0;
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++)
          if (KIND[I(x, y)] === Kind.pond) {
            n++;
            expect(WATER[I(x, y)]).toBeCloseTo(0.6, 6);
            expect(x).toBeGreaterThanOrEqual(30);
            expect(x).toBeLessThanOrEqual(36);
            expect(y).toBeGreaterThanOrEqual(11);
          }
      expect(n).toBe(16);
    }
  });
  it('BLOCK marks beds and water, not lawn or gravel', () => {
    genPark(3);
    rebuildBlock();
    expect(BLOCK[I(19, 19)]).toBe(1);
    expect(BLOCK[I(5, 5)]).toBe(0);
    expect(BLOCK[I(17, 23)]).toBe(0);
  });
});
