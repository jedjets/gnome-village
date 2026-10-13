// tests/park.test.ts
// Locks register 3.1 / 02 2.3-2.4 / 08 2.2 / 03 7.4: the five gates, the boundary predicates, nearestGate, and the backdrop specification
// (the quay, the river, the pavement, the railing pieces, the street trees and lamps, the facade blocks, the skyline). Also the empty
// charm API (03 6.7, S2 stub).
import { describe, it, expect } from 'vitest';
import { N, inB } from '../src/world/grid.ts';
import {
  APRON, BACKDROP, GATES, SKYLINE, bandRects, facadeBlocks, gateById, isBoundary, isGateTile, nearestGate, railPieces, streetLamps, streetTrees,
} from '../src/world/park.ts';
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

describe('world/park backdrop (register 3.1 the boulevard, 03 7.4)', () => {
  it('the bands: quay at y -1, river -2 to -8; on E, S, W rings 1-2 tree pavement, 3-4 road, 5 far pavement, 6-7 facades; 8 deep', () => {
    expect(BACKDROP).toMatchObject({ quayY: -1, riverFrom: -2, riverTo: -8, treePavement: [1, 2], road: [3, 4], farPavement: 5 });
    expect(BACKDROP).toMatchObject({ facadesFrom: 6, facadesTo: 7, treeLine: 1.5, treeStep: 2, gateClear: 2, lampLine: 2.2, lampStep: 4 });
    expect(BACKDROP).toMatchObject({ facadeAlong: 3, facadeDepth: 2, facadeHeight: 6, railHeight: 0.5, farBankFrom: -9 });
    expect(BACKDROP.facadesTo + 1).toBe(APRON); // ring 8, the back pavement behind the blocks, is the apron's edge
    expect(-BACKDROP.riverTo).toBe(APRON);
    // the rings follow each other with no gap
    expect(BACKDROP.treePavement[1] + 1).toBe(BACKDROP.road[0]);
    expect(BACKDROP.road[1] + 1).toBe(BACKDROP.farPavement);
    expect(BACKDROP.farPavement + 1).toBe(BACKDROP.facadesFrom);
  });
  it('a band is an L round the two southern corners: west, south with both corner squares, east, up to the quay', () => {
    expect(bandRects(2, 4)).toEqual([
      [-4.5, -0.5, -2.5, 49.5],
      [-4.5, 49.5, 51.5, 51.5],
      [49.5, -0.5, 51.5, 49.5],
    ]);
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
  it('a street tree every 2 tiles 1.5 beyond the boundary, on both southern corners, none within 2 tiles of a gate: 64 in all', () => {
    const t = streetTrees();
    expect(t).toHaveLength(64);
    expect(new Set(t.map((q) => q.id)).size).toBe(64);
    const bySide = (s: string): number => t.filter((q) => q.side === s).length;
    expect([bySide('south'), bySide('east'), bySide('west'), bySide('north')]).toEqual([20, 22, 22, 0]);
    expect(t.some((q) => q.x === -1.5 && q.y === 48.5)).toBe(true);
    expect(t.some((q) => q.x === 48.5 && q.y === 48.5)).toBe(true);
    for (const q of t) {
      if (q.side === 'south') expect(q.y).toBe(48.5);
      if (q.side === 'east') expect(q.x).toBe(48.5);
      if (q.side === 'west') expect(q.x).toBe(-1.5);
      expect(Math.min(q.x, q.y)).toBeGreaterThanOrEqual(-1.5); // never past the quay's edge, never in the river
      expect(q.x > -0.5 && q.x < 47.5 && q.y > -0.5 && q.y < 47.5).toBe(false); // never on the park
      expect(((q.side === 'south' ? q.x : q.y) + 1.5) % 2).toBe(0); // on the 2-tile step from the corners
      for (const g of GATES) {
        if (g.side !== q.side) continue;
        const c = q.side === 'south' ? (g.tiles[0].x + g.tiles[1].x) / 2 : (g.tiles[0].y + g.tiles[1].y) / 2;
        expect(Math.abs((q.side === 'south' ? q.x : q.y) - c)).toBeGreaterThan(2);
      }
    }
    // each gate's outside tile is on the tree pavement (ring 1), and no tree stands on it
    for (const g of GATES.filter((o) => o.side !== 'north')) {
      const ring = Math.max(-g.outside.x, -g.outside.y, g.outside.x - 47, g.outside.y - 47);
      expect(ring).toBe(1);
      for (const q of t) expect(Math.abs(q.x - g.outside.x) < 1 && Math.abs(q.y - g.outside.y) < 1).toBe(false);
    }
  });
  it('the facade blocks stand in rings 6-7 (3 along x 2 deep, 2 x 2 on the corners and the ends), 6.0 EH high, and at y -10 to -9 beyond the river', () => {
    const f = facadeBlocks();
    expect(f.filter((b) => !b.far)).toHaveLength(22 + 18 + 18);
    expect(f.filter((b) => b.far)).toHaveLength(21);
    for (const b of f) {
      expect([[2, 3], [2, 2]]).toContainEqual([b.w, b.h].sort());
      expect(b.height).toBe(6);
      expect(b.x0).toBeGreaterThanOrEqual(-APRON);
      expect(b.x0 + b.w - 1).toBeLessThanOrEqual(N + APRON - 1);
      if (b.side === 'east') expect([b.x0, b.x0 + b.w - 1]).toEqual([N - 1 + 6, N - 1 + 7]);
      if (b.side === 'west') expect([b.x0, b.x0 + b.w - 1]).toEqual([-7, -6]);
      if (b.side === 'south') expect([b.y0, b.y0 + b.h - 1]).toEqual([N - 1 + 6, N - 1 + 7]);
      if (b.side === 'north') expect([b.y0, b.y0 + b.h - 1]).toEqual([-10, -9]);
      expect(b.far).toBe(b.side === 'north');
    }
    // the south row runs corner to corner (x -7 .. 54), the east and west rows from the quay (y 0) to the corner squares (y 52)
    const span = (side: string, k: 'x0' | 'y0', w: 'w' | 'h'): [number, number] => {
      const r = f.filter((b) => b.side === side);
      return [Math.min(...r.map((b) => b[k])), Math.max(...r.map((b) => b[k] + b[w] - 1))];
    };
    expect(span('south', 'x0', 'w')).toEqual([-7, 54]);
    expect(span('east', 'y0', 'h')).toEqual([0, 52]);
    expect(span('west', 'y0', 'h')).toEqual([0, 52]);
  });
  it('no two facade blocks overlap, and none stands on the park, the tree pavement, the road, the far pavement, the quay or the river', () => {
    const taken = new Set<string>();
    for (const b of facadeBlocks())
      for (let y = b.y0; y < b.y0 + b.h; y++)
        for (let x = b.x0; x < b.x0 + b.w; x++) {
          const key = x + ',' + y;
          expect(taken.has(key), 'overlap at ' + key).toBe(false);
          taken.add(key);
          expect(inB(x, y)).toBe(false);
          const ring = Math.max(-x, x - (N - 1), y - (N - 1)); // the ring of a tile beside the park on E, S or W
          if (y >= 0) expect(ring === 6 || ring === 7, 'ring of ' + key).toBe(true);
          expect(y >= -8 && y <= -1).toBe(false); // the river and the quay
        }
  });
});

/** A lamp's place along its street: x on the south, y on the east and west. */
const along = (l: { side: string; x: number; y: number }): number => (l.side === 'south' ? l.x : l.y);
/** A point as a string to 1e-6, for comparing sets of float positions. */
const key = (x: number, y: number): string => x.toFixed(6) + ',' + y.toFixed(6);

describe('world/park street lamps (register 3.1 and section 4 row Street lamps, 2026-10-13; 03 7.4 item 4; 04 6.4)', () => {
  it('the knobs: the kerb line 2.2 beyond the boundary tiles\' centres, one lamp every 4 tiles; the base stays on the pavement', () => {
    expect(BACKDROP).toMatchObject({ lampLine: 2.2, lampStep: 4 });
    expect(BACKDROP.lampLine + 0.15).toBeLessThan(BACKDROP.treePavement[1] + 0.5); // the base disc (0.3 wide) inside the kerb edge at 2.5
  });
  it('32 lamps with ids 1..32: 10 on each street and one on each southern corner\'s kerb diagonal', () => {
    const L = streetLamps();
    expect(L).toHaveLength(32);
    expect(L.map((l) => l.id)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
    const bySide = (s: string): number => L.filter((l) => l.side === s).length;
    expect([bySide('south'), bySide('east'), bySide('west'), bySide('north')]).toEqual([12, 10, 10, 0]);
    const corners = L.filter((l) => Math.abs(l.y - 49.2) < 1e-9 && (Math.abs(l.x + 2.2) < 1e-9 || Math.abs(l.x - 49.2) < 1e-9));
    expect(corners.map((l) => l.side)).toEqual(['south', 'south']);
  });
  it('every lamp stands on the kerb line: x = -2.2 on the west, 49.2 on the east, y = 49.2 on the south (corners included)', () => {
    for (const l of streetLamps()) {
      if (l.side === 'west') expect(l.x).toBeCloseTo(-2.2, 12);
      if (l.side === 'east') expect(l.x).toBeCloseTo(49.2, 12);
      if (l.side === 'south') expect(l.y).toBeCloseTo(49.2, 12);
      expect(l.x > -0.5 && l.x < 47.5 && l.y > -0.5 && l.y < 47.5).toBe(false); // never on the park
      expect(Math.min(l.x, l.y)).toBeGreaterThan(-2.5); // on the tree pavement, inside the kerb, short of the quay
      expect(Math.max(l.x, l.y)).toBeLessThan(49.5);
      expect(l.y).toBeGreaterThan(0.5); // by the quay the last lamp stands between the last two trees
    }
  });
  it('along each street, midway between two places of the trees\' 2-tile step, in every second gap: 4 tiles apart but at the gates', () => {
    for (const side of ['south', 'west', 'east']) {
      const row = streetLamps().filter((l) => l.side === side && (side !== 'south' || (l.x > -2 && l.x < 49)));
      for (const l of row) expect(((along(l) + 1.5) % 4 + 4) % 4).toBe(3); // 1.5, 5.5 ... 45.5: the second gap from each corner tree
      const a = row.map(along).sort((p, q) => p - q);
      for (let k = 1; k < a.length; k++) expect([4, 8, 12]).toContain((a[k] as number) - (a[k - 1] as number)); // 8 and 12 across a gate
    }
  });
  it('none within 2 tiles of a gate\'s centre along its street', () => {
    for (const l of streetLamps())
      for (const g of GATES) {
        if (g.side !== l.side) continue;
        const c = l.side === 'south' ? (g.tiles[0].x + g.tiles[1].x) / 2 : (g.tiles[0].y + g.tiles[1].y) / 2;
        expect(Math.abs(along(l) - c)).toBeGreaterThan(2);
      }
  });
  it('none closer than 0.9 tiles to any street tree (the corner lamps clear their corner tree by 0.99)', () => {
    let min = Infinity;
    for (const l of streetLamps()) for (const t of streetTrees()) min = Math.min(min, Math.hypot(l.x - t.x, l.y - t.y));
    expect(min).toBeGreaterThanOrEqual(0.9);
    expect(min).toBeCloseTo(0.7 * Math.SQRT2, 9);
  });
  it('the east row mirrors the west row under x -> 47 - x, and the whole set is mirror-symmetric', () => {
    const L = streetLamps();
    const west = L.filter((l) => l.side === 'west').map((l) => key(47 - l.x, l.y)).sort();
    const east = L.filter((l) => l.side === 'east').map((l) => key(l.x, l.y)).sort();
    expect(west).toEqual(east);
    expect(L.map((l) => key(47 - l.x, l.y)).sort()).toEqual(L.map((l) => key(l.x, l.y)).sort());
  });
  it('fixed: the same list on every call (cached, no seed)', () => {
    expect(streetLamps()).toBe(streetLamps());
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
