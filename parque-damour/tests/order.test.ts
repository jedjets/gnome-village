// tests/order.test.ts
// Locks 03 7.2 and 08 2.9 (order.test.ts row): the counting sort by depth in 1/64-tile buckets (GV 6365-6373), stable, ties by lower id
// on every call; apron and far-bank depths below zero; a multi-tile prop at the largest depth of its footprint.
import { describe, it, expect } from 'vitest';
import { DEPTH_BUCKETS, sortByDepth, depthOf, footprintDepth, type Drawable } from '../src/render/order.ts';
import { setAngle } from '../src/render/camera.ts';
import { mulberry32 } from '../src/core/rng.ts';

function mk(id: number, depth: number, kind = 't'): Drawable {
  return { depth, kind, id, x: 0, y: 0, z: 0, draw: () => undefined };
}
const bucket = (d: number): number => Math.floor(d * 64);

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

describe('stable ties (03 7.2 item 5; 08 2.9: equal depth sorts by lower id first, on every call)', () => {
  it('a pair on one bench: equal depths come out lower id first on every call and every input order', () => {
    const r = mulberry32(11);
    for (let call = 0; call < 20; call++) {
      const items = [mk(42, 30.5), mk(7, 30.5), mk(3, 30.5), mk(19, 12.25), mk(8, 30.5), mk(1, 47.75)];
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [items[i], items[j]] = [items[j] as Drawable, items[i] as Drawable];
      }
      sortByDepth(items);
      expect(items.map((d) => d.id)).toEqual([19, 3, 7, 8, 42, 1]);
    }
  });
  it('the bucket is 1/64 tile: one bucket apart, depth wins over id; inside one bucket, id wins over depth', () => {
    expect(DEPTH_BUCKETS).toBe(64);
    const a = [mk(1, 10 + 1 / 64), mk(2, 10)];
    sortByDepth(a);
    expect(a.map((d) => d.id)).toEqual([2, 1]);
    const b = [mk(2, 10.001), mk(1, 10.01)]; // both in bucket 640
    sortByDepth(b);
    expect(b.map((d) => d.id)).toEqual([1, 2]);
    const c = [mk(2, -0.01), mk(1, -0.001)]; // both in bucket -1, below zero
    sortByDepth(c);
    expect(c.map((d) => d.id)).toEqual([1, 2]);
  });
  it('equal ids of different kinds keep their input order (the sort is stable)', () => {
    const items = [mk(5, 20, 'prop'), mk(5, 20, 'visitor'), mk(5, 20, 'particle'), mk(4, 20, 'creature')];
    sortByDepth(items);
    expect(items.map((d) => d.kind)).toEqual(['creature', 'prop', 'visitor', 'particle']);
  });
  it('480 drawables (the caps of 03 7.2 item 3) over the far bank to the near apron: buckets ascend, ids ascend inside each', () => {
    const r = mulberry32(480);
    const items: Drawable[] = [];
    for (let i = 0; i < 480; i++) items.push(mk(1 + Math.floor(r() * 300), -40 + Math.floor(r() * 180 * 8) / 8));
    for (let call = 0; call < 3; call++) {
      sortByDepth(items);
      for (let i = 1; i < items.length; i++) {
        const p = items[i - 1] as Drawable, q = items[i] as Drawable;
        expect(bucket(p.depth)).toBeLessThanOrEqual(bucket(q.depth));
        if (bucket(p.depth) === bucket(q.depth)) expect(p.id).toBeLessThanOrEqual(q.id);
      }
      items.reverse();
    }
  });
  it('a NaN or -Infinity depth paints first, +Infinity last; one item or none is a no-op', () => {
    const items = [mk(1, 5), mk(2, Infinity), mk(3, NaN), mk(4, -Infinity), mk(5, -3)];
    sortByDepth(items);
    expect(items.map((d) => d.id)).toEqual([3, 4, 5, 1, 2]);
    const one = [mk(9, 1)];
    sortByDepth(one);
    expect(one.map((d) => d.id)).toEqual([9]);
    sortByDepth([]);
  });
});

describe('depth of a footprint (03 7.2 item 2)', () => {
  it('the 2 x 2 fountain at (23, 23) sits at depth 48 at every quarter turn: its nearest tile', () => {
    for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      setAngle(a);
      expect(footprintDepth(23, 23, 2, 2)).toBeCloseTo(48, 9);
    }
  });
  it('is the largest tile depth of the footprint at any angle; a 1 x 1 prop is its own tile', () => {
    for (const a of [0.3, 2.2, 5.0]) {
      setAngle(a);
      let m = -Infinity;
      for (let y = 10; y < 13; y++) for (let x = 30; x < 33; x++) m = Math.max(m, depthOf(x, y));
      expect(footprintDepth(30, 10, 3, 3)).toBeCloseTo(m, 9);
      expect(footprintDepth(7, 9, 1, 1)).toBeCloseTo(depthOf(7, 9), 12);
    }
  });
});
