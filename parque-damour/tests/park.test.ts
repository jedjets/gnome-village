// tests/park.test.ts
// Locks register 3.1 / 02 2.3-2.4 / 08 2.2 / 03 7.4: the five gates, the boundary predicates, nearestGate, and the backdrop specification
// (the quay, the river, the pavement, the railing pieces, the facade blocks, the skyline). Also the empty charm API (03 6.7, S2 stub).
import { describe, it, expect } from 'vitest';
import { N, inB } from '../src/world/grid.ts';
import { APRON, BACKDROP, GATES, SKYLINE, facadeBlocks, gateById, isBoundary, isGateTile, nearestGate, railPieces } from '../src/world/park.ts';
import { addSource, charmAt, charmDirty, markCharmDirty, rebuildCharm } from '../src/world/charm.ts';

describe('world/park gates (02 2.4)', () => {
  it('the five gates have the design\'s ids, tiles, outside tiles and weights exactly', () => {
    expect(GATES.map((g) => [g.id, g.side, g.tiles.map((t) => [t.x, t.y]), [g.outside.x, g.outside.y], g.weight])).toEqual([
      ['g_south_w', 'south', [[12, 47], [13, 47]], [12, 48], 30],
      ['g_south_e', 'south', [[34, 47], [35, 47]], [34, 48], 30],
      ['g_west', 'west', [[0, 23], [0, 24]], [-1, 23], 15],
      ['g_east', 'east', [[47, 23], [47, 24]], [48, 23], 15],
      ['g_north', 'north', [[23, 0], [24, 0]], [23, -1], 10],
    ]);
    expect(gateById('g_west').side).toBe('west');
    expect(() => gateById('g_nowhere' as never)).toThrow();
  });
  it('isGateTile names the gate of a tile', () => {
    expect(isGateTile(12, 47)).toBe('g_south_w');
    expect(isGateTile(13, 47)).toBe('g_south_w');
    expect(isGateTile(12, 46)).toBeNull();
    expect(isGateTile(47, 24)).toBe('g_east');
    expect(isGateTile(24, 0)).toBe('g_north');
  });
  it('each outside tile is one step beyond its first gate tile', () => {
    for (const g of GATES) {
      const t = g.tiles[0];
      expect(Math.abs(t.x - g.outside.x) + Math.abs(t.y - g.outside.y)).toBe(1);
      expect(inB(g.outside.x, g.outside.y)).toBe(false);
    }
  });
});

describe('world/park bounds (02 2.1, 2.3)', () => {
  it('inB is the half-open square and the apron is 8', () => {
    expect(inB(-1, 0)).toBe(false);
    expect(inB(47, 47)).toBe(true);
    expect(inB(48, 47)).toBe(false);
    expect(APRON).toBe(8);
  });
  it('isBoundary is the outer ring of the 48 x 48 park', () => {
    expect(isBoundary(0, 5)).toBe(true);
    expect(isBoundary(1, 5)).toBe(false);
    expect(isBoundary(5, 47)).toBe(true);
    expect(isBoundary(-1, 5)).toBe(false);
    let n = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (isBoundary(x, y)) n++;
    expect(n).toBe(4 * 47);
  });
  it('nearestGate honours exclude', () => {
    expect(['g_south_w', 'g_south_e']).toContain(nearestGate(23, 46).id);
    const first = nearestGate(23, 46).id;
    expect(nearestGate(23, 46, first).id).not.toBe(first);
    expect(nearestGate(24, 2).id).toBe('g_north');
    expect(nearestGate(2, 24).id).toBe('g_west');
    expect(nearestGate(45, 22).id).toBe('g_east');
  });
});

describe('world/park backdrop (register 3.1, 03 7.4)', () => {
  it('the bands: quay at y -1, river -2 to -8, pavement 1 tile, facades 2 to 8 tiles out; facades 6.0 EH, railings 0.5 EH (04 6.4)', () => {
    expect(BACKDROP).toMatchObject({ quayY: -1, riverFrom: -2, riverTo: -8, pavement: 1, facadesFrom: 2, facadesTo: 8 });
    expect(BACKDROP).toMatchObject({ facadeAlong: 3, facadeDepth: 2, facadeHeight: 6, railHeight: 0.5, farBankFrom: -9 });
    expect(BACKDROP.facadesTo).toBe(APRON);
    expect(-BACKDROP.riverTo).toBe(APRON);
  });
  it('the Eiffel Tower stands to the north-west at 2.2 times the facade height', () => {
    expect(SKYLINE.towerAngle).toBeCloseTo(Math.atan2(-1, -1), 12);
    expect(SKYLINE.towerScale).toBe(2.2);
  });
  it('one railing piece per boundary tile along each edge except the gate tiles: 182 in all', () => {
    const rails = railPieces();
    expect(rails).toHaveLength(48 * 4 - 10);
    expect(new Set(rails.map((r) => r.id)).size).toBe(rails.length);
    const bySide = (s: string): number => rails.filter((r) => r.side === s).length;
    expect([bySide('north'), bySide('south'), bySide('west'), bySide('east')]).toEqual([46, 44, 46, 46]);
    for (const r of rails) {
      expect(isBoundary(r.x, r.y)).toBe(true);
      expect(isGateTile(r.x, r.y)).toBeNull();
      if (r.side === 'north') expect(r.y).toBe(0);
      if (r.side === 'south') expect(r.y).toBe(47);
      if (r.side === 'west') expect(r.x).toBe(0);
      if (r.side === 'east') expect(r.x).toBe(47);
    }
  });
  it('the facade blocks are 3 along x 2 deep and 6.0 EH high, 2 tiles beyond the railings on E, S and W and at y -10 to -9 beyond the river', () => {
    const f = facadeBlocks();
    expect(f.filter((b) => !b.far)).toHaveLength(16 + 16 + 21);
    expect(f.filter((b) => b.far)).toHaveLength(21);
    for (const b of f) {
      expect([b.w, b.h].sort()).toEqual([2, 3]);
      expect(b.height).toBe(6);
      expect(b.x0).toBeGreaterThanOrEqual(-APRON - 2);
      expect(b.x0 + b.w - 1).toBeLessThanOrEqual(N + APRON - 1);
      if (b.side === 'east') expect(b.x0).toBe(N - 1 + 2);
      if (b.side === 'west') expect(b.x0 + b.w - 1).toBe(-2);
      if (b.side === 'south') expect(b.y0).toBe(N - 1 + 2);
      if (b.side === 'north') expect([b.y0, b.y0 + b.h - 1]).toEqual([-10, -9]);
      expect(b.far).toBe(b.side === 'north');
    }
  });
  it('no two facade blocks overlap, and none stands on the park, the pavement, the quay or the river', () => {
    const taken = new Set<string>();
    for (const b of facadeBlocks())
      for (let y = b.y0; y < b.y0 + b.h; y++)
        for (let x = b.x0; x < b.x0 + b.w; x++) {
          const key = x + ',' + y;
          expect(taken.has(key), 'overlap at ' + key).toBe(false);
          taken.add(key);
          expect(inB(x, y)).toBe(false);
          const pavement = (x === N && y >= -1 && y <= N) || (x === -1 && y >= -1 && y <= N) || (y === N && x >= -1 && x <= N);
          expect(pavement).toBe(false); // the pavement, 1 tile outside the railings, stays clear
          expect(y >= -8 && y <= -1).toBe(false); // the river and the quay
        }
  });
});

describe('world/charm the empty field API (S2)', () => {
  it('every tile reads zero and the dirty flag clears on a rebuild', () => {
    expect(charmAt(23, 23)).toEqual({ total: 0, player: 0 });
    expect(charmAt(23, 23, 4)).toEqual({ total: 0, player: 0 });
    markCharmDirty();
    expect(charmDirty()).toBe(true);
    rebuildCharm([], false);
    expect(charmDirty()).toBe(false);
    expect(addSource({ kind: 'busker', x: 1, y: 1, r: 8, amount: 3, player: true, until: 10 })).toBe(0);
  });
});
