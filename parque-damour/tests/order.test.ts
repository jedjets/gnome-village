// tests/order.test.ts
// Locks 03 7.2: the counting sort by depth in 1/64-tile buckets, stable, ties by id.
import { describe, it, expect } from 'vitest';
import { sortByDepth, depthOf, type Drawable } from '../src/render/order.ts';
import { setAngle } from '../src/render/camera.ts';

function mk(id: number, depth: number): Drawable {
  return { depth, kind: 't', id, x: 0, y: 0, z: 0, draw: () => undefined };
}

describe('render/order sortByDepth (GV 6367-6373)', () => {
  it('sorts by depth, including apron depths below zero', () => {
    let s = 17;
    const next = (): number => {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      return s / 4294967296;
    };
    const items: Drawable[] = [];
    for (let i = 0; i < 400; i++) items.push(mk(i, -20 + next() * 130));
    sortByDepth(items);
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1] as Drawable, b = items[i] as Drawable;
      expect(Math.floor(a.depth * 64)).toBeLessThanOrEqual(Math.floor(b.depth * 64));
    }
  });
  it('ties inside one bucket paint the lower id first, whatever the input order', () => {
    const items = [mk(9, 10.001), mk(2, 10.003), mk(5, 10.002), mk(1, 3), mk(7, 10.0)];
    sortByDepth(items);
    expect(items.map((d) => d.id)).toEqual([1, 2, 5, 7, 9]);
  });
  it('depthOf is rx + ry after the rotation', () => {
    setAngle(0);
    expect(depthOf(3, 4)).toBeCloseTo(7, 9);
    setAngle(Math.PI / 2);
    expect(depthOf(23.5, 23.5)).toBeCloseTo(47, 9);
  });
});
