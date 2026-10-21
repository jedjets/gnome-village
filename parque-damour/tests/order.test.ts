// tests/order.test.ts
// Locks 03 7.2 and 08 2.9 (order.test.ts row): the counting sort by depth in 1/64-tile buckets (GV 6365-6373), stable, ties by lower id
// on every call; apron and far-bank depths below zero; a multi-tile prop at the largest depth of its footprint; and the kiosk's back and
// front halves against its vendor at the counter (03 7.2 item 2, the bandstand's back-and-front idiom) at all four quarter turns.
import { describe, it, expect } from 'vitest';
import { DEPTH_BUCKETS, sortByDepth, depthOf, footprintDepth, type Drawable } from '../src/render/order.ts';
import { cam, centreOn, setAngle, setViewport } from '../src/render/camera.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { genPark } from '../src/world/gen.ts';
import { props, type Prop } from '../src/world/grid.ts';
import { propDrawables } from '../src/render/props.ts';
import { KIOSK, drawKiosk, kioskBackDepth, kioskFrontDepth } from '../src/render/props-park.ts';
import { STYLES, type Pen } from '../src/render/ambient.ts';
import { peopleDrawables } from '../src/render/people.ts';
import { byId, resetVisitors, spawnVisitor, type Visitor } from '../src/entities/visitor.ts';
import { resetCreatures } from '../src/entities/creatures.ts';
import { ensureVendors, vendorFor } from '../src/entities/staff.ts';

/** A plain iso projection for counting fills (any projection draws the same polygons). */
const flatProj = (x: number, y: number, e = 0): { x: number; y: number } => ({ x: (x - y) * 13, y: (x + y) * 6.5 - e * 26 });

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

describe('03 7.2 item 2: the kiosk paints in two halves round its vendor at the counter (props.ts propDrawables, props-park.ts kioskBackDepth)', () => {
  it('turn 0 and 3 the vendor after both halves, turn 1 before both, turn 2 between: over the awning turned away, under body and roof', () => {
    genPark(101);
    resetVisitors();
    resetCreatures();
    ensureVendors();
    const k = props.find((p) => p.kind === 'kiosk') as Prop;
    expect(k).toMatchObject({ x: 14, y: 44, w: 2, h: 2, rot: 0 });
    const v = byId(vendorFor(k.id)) as Visitor;
    expect(v).toMatchObject({ archetype: 'vendor', x: 14.3, y: 45.75 }); // the counter: the serving tile (14, 46) + (0.3, -0.25)
    // a passer-by two tiles past the counter, behind the awning's far rim at turn 2
    const w = spawnVisitor('single', 'g_north') as Visitor;
    Object.assign(w, { x: 14, y: 47, path: null, st: 'idle' });
    const want = [
      ['k1', 'k2', 'v'], // turn 0: the counter faces the camera, the vendor in front of the whole kiosk
      ['v', 'k1', 'k2'], // turn 1: the vendor behind the kiosk and its awning's far rim, the awning edge across the apron (s4-table-1)
      ['k1', 'v', 'k2'], // turn 2: the vendor beside the far side, in front of the far rim: over the awning edge, under body and roof
      ['k1', 'k2', 'v'], // turn 3
    ];
    // each quarter turn and 0.03 rad either side of it (a pinch twist rests at any angle, 04 1 Rotation; the S4 fixes review)
    for (const [t, q] of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].entries()) for (const off of [-0.03, 0, 0.03]) {
      const ang = q + off, at = `turn ${t} ${off >= 0 ? '+' : ''}${off}`;
      setViewport(390, 844, 2);
      setAngle(ang);
      cam.angT = ang;
      cam.z = 2.4;
      centreOn(16, 44); // the s4-table shots' view
      const list: Drawable[] = [...propDrawables(), ...peopleDrawables()];
      sortByDepth(list);
      const label = (d: Drawable): string => {
        if (d.kind === 'prop' && d.id === k.id) return 'k' + String((d as Drawable & { part?: number }).part);
        return d.kind !== 'visitor' ? '' : d.id === v.id ? 'v' : d.id === w.id ? 'w' : '';
      };
      const o = list.map(label).filter((l) => l !== '');
      expect(o.filter((l) => l !== 'w'), at).toEqual(want[t]);
      // the back half sorts at the awning's far rim: sqrt 2 x the outer apothem (0.98 cos 22.5 deg) before the kiosk's centre; the front
      // half at the centre, not the deepest footprint tile (that one sat 0.05 behind the vendor at turn 0: a 2 degree twist put him under it)
      expect(kioskBackDepth(k.x, k.y), at).toBeCloseTo(depthOf(14.5, 44.5) - Math.SQRT2 * 0.98 * Math.cos(Math.PI / 8), 9);
      expect(kioskFrontDepth(k.x, k.y), at).toBe(depthOf(14.5, 44.5));
      const k2 = list.find((d) => d.kind === 'prop' && d.id === k.id && (d as Drawable & { part?: number }).part === 2) as Drawable;
      expect(k2.depth, at).toBe(kioskFrontDepth(k.x, k.y));
      if (t === 2) expect(o, `${at}: one behind the far rim paints under both halves`).toEqual(['w', 'k1', 'v', 'k2']);
    }
    resetVisitors();
  });

  it('the back half holds the awning faces turned away and the one within 6 degrees of edge-on, on both sides of each quarter turn', () => {
    // the awning is 3 faces of KIOSK.stripes / 3 stripes, each stripe a face and a valance: 2 x per fills a face, counted in part 1 alone
    let fills = 0;
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, key) => (key === 'createLinearGradient' ? () => ({ addColorStop: () => undefined }) : key === 'fill' ? () => void fills++ : () => undefined),
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    const pen: Pen = { ctx, spec: STYLES.A, z: 2.4 };
    const per = Math.max(1, Math.round(KIOSK.stripes / 3));
    // the starter kiosk serves south (rot 0): its awning is faces SE, S and SW. Turn 0: SW edge-on, SE and S to the viewer; turn 1: SE
    // edge-on, S and SW away; turn 2: SW edge-on (the vendor's side, s4-table-2), SE and S away; turn 3: SE edge-on, S and SW to the viewer
    const back = [1, 3, 3, 1];
    for (const [t, q] of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].entries()) for (const off of [-0.1, -0.03, 0, 0.03, 0.1]) {
      setAngle(q + off);
      fills = 0;
      drawKiosk(pen, flatProj, 14, 44, 0, false, 1);
      expect(fills / (2 * per), `turn ${t} ${off >= 0 ? '+' : ''}${off}: awning faces in the back half`).toBe(back[t]);
    }
    setAngle(0);
  });
});
