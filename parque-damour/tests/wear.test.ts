// tests/wear.test.ts
// Locks 02 11.1 items 1-6 (desire paths and the gardener's paving search) / 08 2.2 / 07 S2.6 item 13 (GV 1674-1687, 3366-3395): wearAt,
// decayWear, findPavingRun, markPaved.
import { describe, it, expect, beforeEach } from 'vitest';
import { I, KIND, Kind, OCC, PAVEDAY, WATER, WEAR, WET, addProp, clearLayers } from '../src/world/grid.ts';
import { PAVE_MIN_RUN, WEAR_MAX, decayWear, findPavingRun, markPaved, wearAt } from '../src/world/wear.ts';
import { resetIds } from '../src/core/ids.ts';

const DT = 1 / 60;

/** A row of `n` tiles from (x0, y) worn to `w`. */
function line(x0: number, y: number, n: number, w: number): void {
  for (let k = 0; k < n; k++) WEAR[I(x0 + k, y)] = w;
}

beforeEach(() => {
  clearLayers();
  resetIds();
});

describe('world/wear desire paths (02 11.1; GV 1674-1687)', () => {
  it('wear grows 0.42 per sim second on a lawn tile under a walker, speeding up as it wears', () => {
    const v = { x: 10, y: 10 };
    for (let n = 0; n < 60; n++) wearAt(v, DT);
    expect(WEAR[I(10, 10)]).toBeGreaterThan(0.42);
    expect(WEAR[I(10, 10)]).toBeLessThan(0.55);
    const one = { x: 12, y: 12 };
    wearAt(one, 1);
    expect(WEAR[I(12, 12)]).toBeCloseTo(0.42, 5);
  });
  it('is capped at 4 and rounds a position to its tile', () => {
    for (let n = 0; n < 60 * 60; n++) wearAt({ x: 10.4, y: 9.6 }, DT);
    expect(WEAR[I(10, 10)]).toBe(WEAR_MAX);
    expect(WEAR[I(11, 10)]).toBe(0);
  });
  it('does not grow on gravel, flagstone, beds, mulch, water, wet lawn or off the park', () => {
    for (const k of [Kind.gravel, Kind.flagstone, Kind.bed, Kind.mulch, Kind.pond, Kind.canal]) {
      KIND[I(10, 10)] = k;
      wearAt({ x: 10, y: 10 }, 5);
      expect(WEAR[I(10, 10)], 'kind ' + k).toBe(0);
    }
    KIND[I(10, 10)] = Kind.lawn;
    WET[I(10, 10)] = 0.6;
    wearAt({ x: 10, y: 10 }, 5);
    expect(WEAR[I(10, 10)]).toBe(0);
    WET[I(10, 10)] = 0.5;
    wearAt({ x: 10, y: 10 }, 5);
    expect(WEAR[I(10, 10)]).toBeGreaterThan(0);
    expect(() => wearAt({ x: -3, y: 100 }, 1)).not.toThrow();
  });
  it('decays 0.9975 below 0.6 and 0.99945 above, once per call', () => {
    WEAR[5] = 0.5;
    WEAR[6] = 3;
    WEAR[7] = 0;
    decayWear();
    expect(WEAR[5]).toBeCloseTo(0.49875, 6);
    expect(WEAR[6]).toBeCloseTo(2.99835, 5);
    expect(WEAR[7]).toBe(0);
  });
});

describe('world/wear paving (02 11.1 items 4-6)', () => {
  it('a worn line of 5 tiles at 3 gives a run of 5 in walking order', () => {
    expect(PAVE_MIN_RUN).toBe(3);
    line(10, 10, 5, 3);
    const run = findPavingRun(1);
    expect(run).toHaveLength(5);
    expect(run?.map((t) => t.y)).toEqual([10, 10, 10, 10, 10]);
    const xs = run?.map((t) => t.x) ?? [];
    expect([...xs].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14]);
    expect(xs[0] === 10 || xs[0] === 14).toBe(true); // an end of the line, then straight along it
  });
  it('the seed needs 2.6 and the run needs 3 tiles: a line of 2, or a line worn only to 2.5, gives nothing', () => {
    line(10, 10, 2, 3);
    expect(findPavingRun(1)).toBeNull();
    clearLayers();
    line(10, 10, 5, 2.5);
    expect(findPavingRun(1)).toBeNull();
    clearLayers();
    line(10, 10, 1, 3);
    line(11, 10, 3, 1.7); // the neighbours need only more than 1.6
    expect(findPavingRun(1)).toHaveLength(4);
    clearLayers();
    line(10, 10, 1, 3);
    line(11, 10, 3, 1.55); // 1.6 itself reads back above 1.6 from a Float32Array
    expect(findPavingRun(1)).toBeNull();
  });
  it('follows at most 5 steps each way from the busiest tile', () => {
    line(5, 10, 21, 2);
    WEAR[I(15, 10)] = 3;
    expect(findPavingRun(1)).toHaveLength(11);
  });
  it('the busiest tile seeds the run, the first in row order on a tie', () => {
    line(10, 10, 5, 3);
    line(10, 20, 5, 3.5);
    expect(findPavingRun(1)?.[0]?.y).toBe(20);
    clearLayers();
    line(10, 10, 3, 3);
    line(10, 20, 3, 3);
    expect(findPavingRun(1)?.[0]?.y).toBe(10);
  });
  it('a tile within 2 of a fountain or a lamp never seeds a run, but a run may pass one (the exclusion is the seed\'s only)', () => {
    addProp({ kind: 'lamp', x: 12, y: 12, w: 1, h: 1, rot: 0, placedBy: 'gen' }); // within 2: x 10..14, y 10..14
    line(10, 10, 5, 3); // every tile within 2 of the lamp
    expect(findPavingRun(1)).toBeNull();
    WEAR[I(15, 10)] = 3; // one tile beyond the lamp's reach seeds it, and the run walks back past the lamp
    const run = findPavingRun(1);
    expect(run?.[0]).toEqual({ x: 15, y: 10 });
    expect(run?.map((t) => t.x)).toEqual([15, 14, 13, 12, 11, 10]);
    clearLayers();
    resetIds();
    addProp({ kind: 'fountain', x: 30, y: 30, w: 2, h: 2, rot: 0, placedBy: 'gen' });
    line(28, 30, 2, 3); // x 28, 29: within 2 of the fountain's x 30 edge
    expect(findPavingRun(1)).toBeNull();
    line(26, 30, 2, 3); // x 26, 27 are clear of it: the run seeds at 26 and follows up to the fountain's rim
    expect(findPavingRun(1)?.map((t) => t.x)).toEqual([26, 27, 28, 29]);
  });
  it('a bed, an occupied or a water tile is never part of a run', () => {
    line(10, 10, 4, 3);
    KIND[I(11, 10)] = Kind.bed;
    expect(findPavingRun(1)).toBeNull();
    clearLayers();
    line(10, 10, 4, 3);
    OCC[I(11, 10)] = 9;
    expect(findPavingRun(1)).toBeNull();
    clearLayers();
    line(10, 10, 4, 3);
    KIND[I(11, 10)] = Kind.pond;
    WATER[I(11, 10)] = 0.6;
    expect(findPavingRun(1)).toBeNull();
  });
  it('markPaved lays gravel, clears the wear and stamps the day; a tile paved today is not paved again', () => {
    line(10, 10, 4, 3);
    const run = findPavingRun(4);
    expect(run).toHaveLength(4);
    for (const t of run ?? []) markPaved(I(t.x, t.y), 4);
    expect(KIND[I(10, 10)]).toBe(Kind.gravel);
    expect(WEAR[I(10, 10)]).toBe(0);
    expect(PAVEDAY[I(10, 10)]).toBe(4);
    // the player lawns it over and it wears again the same day: the gardener leaves it until tomorrow
    for (let k = 0; k < 4; k++) {
      KIND[I(10 + k, 10)] = Kind.lawn;
      WEAR[I(10 + k, 10)] = 3;
    }
    expect(findPavingRun(4)).toBeNull();
    expect(findPavingRun(5)).toHaveLength(4);
  });
});
