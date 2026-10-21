// tests/gen.test.ts
// Locks 02 2.5 / 08 2.2 / 07 S2.6 item 11: the starter park's fixed skeleton, what the seed varies (pond outline, bed colours, trees), the
// twelve trees and their spacing, the bridge over the neck, and the prop list in world/grid.ts (ids, OCC, BLOCK). S6 (owner 2026-10-19,
// register section 4 "Starter picnic spots"): the two 2 x 2 picnic blankets and how much of the loops they bring within the Picnic
// stage's 10 tiles (02 6.2 stage 5).
import { describe, it, expect } from 'vitest';
import { genPark, parkSeed, PICNICS, POND_MIN } from '../src/world/gen.ts';
import {
  BEDC, BLOCK, I, KIND, Kind, N, NC, OCC, WATER, addProp, props, propById, propsState, rebuildBlock, removeProp, setPropsState, clearLayers, markBlockDirty,
  type Prop,
} from '../src/world/grid.ts';
import { findCrossing, waterBodies } from '../src/world/water.ts';
import { GATES } from '../src/world/park.ts';
import { rngN } from '../src/core/rng.ts';
import { nextPropId, resetIds } from '../src/core/ids.ts';
import { stateHash } from '../src/save/store.ts';

const kindsOf = (kind: Prop['kind']): Prop[] => props.filter((p) => p.kind === kind);
const ring = (x: number, y: number): number => Math.floor(Math.max(Math.abs(x - 23.5), Math.abs(y - 23.5)));
const cheb = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

describe('world/gen fixed skeleton (02 2.5)', () => {
  it('is the same for every seed: fountain, loops, kiosk, benches, lamps, beds', () => {
    for (const seed of [1, 2, 101, 4000000000]) {
      genPark(seed);
      const f = kindsOf('fountain');
      expect(f).toHaveLength(1);
      expect(f[0]).toMatchObject({ x: 23, y: 23, w: 2, h: 2, placedBy: 'gen' });
      for (const [x, y] of [[23, 23], [24, 23], [23, 24], [24, 24]] as const) expect(OCC[I(x, y)]).toBe(f[0]?.id);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const onLoop = [5, 6, 13, 14].includes(ring(x, y));
          if (onLoop) expect(KIND[I(x, y)], `loop tile ${x},${y}`).toBe(Kind.gravel);
        }
      expect(kindsOf('kiosk')[0]).toMatchObject({ x: 14, y: 44, w: 2, h: 2 });
      expect(kindsOf('table').map((p) => [p.x, p.y])).toEqual([[16, 44], [16, 45]]);
      expect(kindsOf('bench')).toHaveLength(6);
      expect(kindsOf('lamp').map((p) => [p.x, p.y])).toEqual([[24, 16], [23, 31], [24, 11], [23, 36]]);
      for (const [bx, by] of [[19, 19], [27, 27]] as const)
        for (let y = by; y < by + 2; y++) for (let x = bx; x < bx + 2; x++) expect(KIND[I(x, y)]).toBe(Kind.bed);
      expect(KIND.reduce((n, k) => n + (k === Kind.bed ? 1 : 0), 0)).toBe(8);
    }
  });

  it('S6: two 2 x 2 picnic blankets on lawn at (14,21) and (34,24), passable, clear of every path, prop, bed and the pond (register section 4)', () => {
    expect(PICNICS).toEqual([[14, 21], [34, 24]]);
    for (const seed of [1, 2, 101, 4000000000]) {
      genPark(seed);
      const pk = kindsOf('picnic');
      expect(pk.map((p) => [p.x, p.y])).toEqual([[14, 21], [34, 24]]);
      for (const p of pk) {
        expect(p).toMatchObject({ w: 2, h: 2, placedBy: 'gen', passable: true });
        for (let y = p.y - 1; y <= p.y + 2; y++)
          for (let x = p.x - 1; x <= p.x + 2; x++) {
            const inside = x >= p.x && x < p.x + 2 && y >= p.y && y < p.y + 2;
            expect(KIND[I(x, y)], `tile ${x},${y} beside the blanket at ${p.x},${p.y}`).toBe(Kind.lawn);
            expect(WATER[I(x, y)]).toBe(0);
            if (inside) expect(OCC[I(x, y)]).toBe(0); // a blanket is walked over
            else expect(OCC[I(x, y)], `a prop touches the blanket at ${p.x},${p.y}`).toBe(0);
          }
      }
      for (const o of props) // one clear tile between a blanket and any other footprint (the trees keep their own 3-tile rule)
        if (o.kind !== 'picnic')
          for (const p of pk) {
            const gapX = Math.max(o.x - (p.x + 1), p.x - (o.x + o.w - 1), 0), gapY = Math.max(o.y - (p.y + 1), p.y - (o.y + o.h - 1), 0);
            expect(Math.max(gapX, gapY), `${o.kind} at ${o.x},${o.y} against the blanket at ${p.x},${p.y}`).toBeGreaterThanOrEqual(2);
          }
    }
  });

  it('S6: with the kiosk tables the blankets put a spot within 10 tiles (picnicFor) of 82 % of the inner loop and 47 % of the outer loop (kiosk alone: 0 % and 14 %)', () => {
    genPark(1);
    const spots = props.filter((p) => p.kind === 'picnic' || p.kind === 'table');
    const kiosk = spots.filter((p) => p.kind === 'table');
    const share = (rings: number[], list: Prop[]): number => {
      let all = 0, near = 0;
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++)
          if (rings.includes(ring(x, y))) {
            all++;
            if (list.some((p) => Math.hypot(p.x - x, p.y - y) <= 10)) near++;
          }
      return near / all;
    };
    expect(share([5, 6], kiosk)).toBe(0);
    expect(share([13, 14], kiosk)).toBeGreaterThan(0.13);
    expect(share([13, 14], kiosk)).toBeLessThan(0.15);
    expect(share([5, 6], spots)).toBeGreaterThan(0.8);
    expect(share([13, 14], spots)).toBeGreaterThan(0.45);
  });

  it('five spokes of gravel from the gates to the nearest loop, gates on gravel, lawn elsewhere', () => {
    genPark(7);
    for (const g of GATES) for (const t of g.tiles) expect(KIND[I(t.x, t.y)]).toBe(Kind.gravel);
    expect(KIND[I(12, 42)]).toBe(Kind.gravel); // south-west spoke
    expect(KIND[I(12, 39)]).toBe(Kind.gravel);
    expect(KIND[I(11, 42)]).toBe(Kind.lawn); // a spoke is 1 wide
    expect(KIND[I(34, 42)]).toBe(Kind.gravel); // south-east spoke
    expect(KIND[I(3, 23)]).toBe(Kind.gravel); // west
    expect(KIND[I(44, 23)]).toBe(Kind.gravel); // east
    expect(KIND[I(23, 4)]).toBe(Kind.gravel); // north
    expect(KIND[I(5, 5)]).toBe(Kind.lawn);
    expect(KIND[I(44, 44)]).toBe(Kind.lawn);
  });

  it('flagstone around the fountain and around the kiosk, with the serving tile south of its south-west tile', () => {
    genPark(3);
    for (let y = 22; y <= 25; y++) for (let x = 22; x <= 25; x++) expect(KIND[I(x, y)]).toBe(Kind.flagstone);
    expect(KIND[I(14, 46)]).toBe(Kind.flagstone);
    expect(OCC[I(14, 46)]).toBe(0);
    expect(OCC[I(14, 44)]).toBe(kindsOf('kiosk')[0]?.id);
    expect(kindsOf('kiosk')[0]?.data.tableIds).toEqual(kindsOf('table').map((p) => p.id));
  });

  it('six benches on the lawn ring just outside the inner loop, each facing the fountain', () => {
    genPark(11);
    const benches = kindsOf('bench');
    expect(benches).toHaveLength(6);
    const angles: number[] = [];
    for (const b of benches) {
      expect(ring(b.x, b.y)).toBe(7);
      expect(KIND[I(b.x, b.y)]).toBe(Kind.lawn);
      const dx = 23.5 - b.x, dy = 23.5 - b.y;
      const want = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
      expect(b.rot).toBe(want);
      angles.push(((Math.atan2(b.y - 23.5, b.x - 23.5) * 180) / Math.PI + 360) % 360);
    }
    // 0, 60, 120, 180, 240, 300 degrees from the fountain, give or take the tile grid
    angles.sort((a, b) => a - b);
    [0, 60, 120, 180, 240, 300].forEach((target, k) => expect(Math.abs((angles[k] as number) - target)).toBeLessThan(6));
  });
});

describe('world/gen what the seed varies (02 2.5)', () => {
  it('seeds 1 and 2 differ only on pond tiles, bed colours and tree tiles', () => {
    genPark(1);
    const kind1 = KIND.slice(), bedc1 = BEDC.slice(), occ1 = OCC.slice();
    const props1 = propsState().filter((p) => p.kind !== 'tree');
    genPark(2);
    const props2 = propsState().filter((p) => p.kind !== 'tree');
    expect(props2).toEqual(props1); // every prop but the trees, ids included
    let pond = 0, treeTiles = 0;
    for (let i = 0; i < NC; i++) {
      if (kind1[i] !== KIND[i]) {
        pond++;
        const x = i % N, y = (i / N) | 0;
        expect(x >= 30 && x <= 36 && y >= 11 && y <= 13, `kind differs at ${x},${y}`).toBe(true);
      }
      if (occ1[i] !== OCC[i]) treeTiles++;
    }
    expect(pond + treeTiles).toBeGreaterThan(0);
    let bedDiff = 0;
    for (let i = 0; i < NC; i++) if (bedc1[i] !== BEDC[i]) bedDiff++;
    expect(bedDiff === 0 || bedDiff === 8).toBe(true);
  });

  it('across seeds the pond outline, the bed order and the trees all vary', () => {
    const ponds = new Set<string>(), beds = new Set<number>(), trees = new Set<string>();
    for (let s = 1; s <= 24; s++) {
      genPark(s);
      ponds.add(KIND.join(''));
      beds.add(BEDC[I(19, 19)] as number);
      trees.add(kindsOf('tree').map((t) => t.x + ',' + t.y).join(';'));
    }
    expect(ponds.size).toBeGreaterThan(3);
    expect(beds).toEqual(new Set([0, 1]));
    expect(trees.size).toBe(24);
  });

  it('the same seed gives the same park, the same draw count and the same hash', () => {
    genPark(42);
    const h = stateHash(), n = rngN();
    expect(n).toBeGreaterThan(0);
    genPark(7);
    genPark(42);
    expect(stateHash()).toBe(h);
    expect(rngN()).toBe(n);
    expect(parkSeed()).toBe(42);
  });
});

describe('world/gen the pond and the bridge (02 2.5)', () => {
  it('a pond of 14 to 20 tiles in x 30-36, y 11-13, one body, the neck always water', () => {
    for (let s = 1; s <= 40; s++) {
      genPark(s);
      const bodies = waterBodies();
      expect(bodies, 'seed ' + s).toHaveLength(1);
      const body = bodies[0];
      expect(body?.size).toBeGreaterThanOrEqual(POND_MIN);
      expect(body?.size).toBeLessThanOrEqual(20);
      for (const i of body?.tiles ?? []) {
        const x = i % N, y = (i / N) | 0;
        expect(x >= 30 && x <= 36 && y >= 11 && y <= 13).toBe(true);
        expect(WATER[i]).toBeCloseTo(0.6, 6);
        expect(KIND[i]).toBe(Kind.pond);
      }
      for (const [x, y] of [[34, 11], [34, 12], [33, 11], [33, 12], [35, 11], [35, 12]] as const) expect(KIND[I(x, y)]).toBe(Kind.pond);
      expect(KIND[I(34, 13)]).toBe(Kind.lawn); // the bridge lands here
      expect(KIND[I(34, 10)]).toBe(Kind.gravel); // and here, on the outer loop
    }
  });

  it('a passable bridge spans the neck north to south with span 2, and findCrossing finds the same span', () => {
    genPark(101);
    const b = kindsOf('bridge');
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ x: 34, y: 11, w: 1, h: 2, passable: true, placedBy: 'gen', data: { span: 2, dir: 0 } });
    expect(OCC[I(34, 11)]).toBe(0);
    expect(OCC[I(34, 12)]).toBe(0);
    rebuildBlock();
    expect(BLOCK[I(34, 11)]).toBe(0); // the bridge opens the water under it
    expect(BLOCK[I(34, 12)]).toBe(0);
    expect(BLOCK[I(33, 11)]).toBe(1);
    const c = findCrossing(34, 11);
    expect(c).toMatchObject({ dir: 0, x: 34, y: 11, span: 2 });
  });
});

describe('world/gen twelve trees (02 2.5)', () => {
  it('twelve trees, four of each species, on lawn, at least 3 tiles from any path or prop, at least 4 apart', () => {
    for (let s = 1; s <= 30; s++) {
      genPark(s);
      const trees = kindsOf('tree');
      expect(trees, 'seed ' + s).toHaveLength(12);
      expect([0, 1, 2].map((sp) => trees.filter((t) => t.data.species === sp).length)).toEqual([4, 4, 4]);
      for (const t of trees) {
        expect(KIND[I(t.x, t.y)]).toBe(Kind.lawn);
        expect(t.x >= 1 && t.x <= 46 && t.y >= 1 && t.y <= 46).toBe(true);
        expect(OCC[I(t.x, t.y)]).toBe(t.id);
        for (let y = 0; y < N; y++)
          for (let x = 0; x < N; x++) {
            const k = KIND[I(x, y)];
            if ((k === Kind.gravel || k === Kind.flagstone) && cheb(t.x, t.y, x, y) < 3) throw new Error(`seed ${s}: tree ${t.x},${t.y} is ${cheb(t.x, t.y, x, y)} from a path at ${x},${y}`);
          }
        for (const p of props) if (p.kind !== 'tree' && cheb(t.x, t.y, p.x + (p.w - 1) / 2, p.y + (p.h - 1) / 2) < 3) throw new Error(`seed ${s}: tree ${t.x},${t.y} touches ${p.kind}`);
        for (const o of trees) if (o !== t) expect(cheb(t.x, t.y, o.x, o.y)).toBeGreaterThanOrEqual(4);
      }
    }
  });
});

describe('world/grid props (03 3.6, 2.3)', () => {
  it('genPark numbers its props from 1 with no gaps and no repeats, and resets the allocator each time', () => {
    genPark(5);
    expect(props.map((p) => p.id)).toEqual(Array.from({ length: props.length }, (_, i) => i + 1));
    expect(props).toHaveLength(1 + 6 + 1 + 2 + 4 + 2 + 1 + 12); // fountain, benches, kiosk, tables, lamps, picnic blankets (S6), bridge, trees
    genPark(5);
    expect(props.map((p) => p.id)[0]).toBe(1);
  });

  it('addProp writes its id into OCC for a blocking prop only; removeProp clears it and frees the id', () => {
    clearLayers();
    resetIds();
    const bench = addProp({ kind: 'bench', x: 10, y: 10, w: 1, h: 1, rot: 0, placedBy: 'player' });
    const picnic = addProp({ kind: 'picnic', x: 20, y: 20, w: 2, h: 2, rot: 0, placedBy: 'player' });
    expect(bench).toMatchObject({ id: 1, passable: false, untilTick: 0, data: {} });
    expect(picnic).toMatchObject({ id: 2, passable: true });
    expect(OCC[I(10, 10)]).toBe(1);
    expect(OCC[I(20, 20)]).toBe(0);
    expect(propById(1)).toBe(bench);
    markBlockDirty();
    rebuildBlock();
    expect(BLOCK[I(10, 10)]).toBe(1);
    expect(BLOCK[I(20, 20)]).toBe(0);
    expect(removeProp(1)).toBe(bench);
    expect(OCC[I(10, 10)]).toBe(0);
    expect(propById(1)).toBeUndefined();
    expect(removeProp(1)).toBeUndefined();
    expect(nextPropId()).toBe(1); // the freed id comes back first
  });

  it('a 2 x 2 prop fills four OCC tiles and the list round-trips through JSON', () => {
    genPark(9);
    const before = propsState();
    const json = JSON.parse(JSON.stringify(before)) as Prop[];
    setPropsState([]);
    expect(props).toHaveLength(0);
    setPropsState(json);
    expect(propsState()).toEqual(before);
    expect(propById(1)?.kind).toBe('fountain');
  });

  it('every OCC tile belongs to a listed blocking prop and every blocking prop fills its footprint', () => {
    genPark(13);
    for (let i = 0; i < NC; i++) {
      const o = OCC[i] as number;
      if (o !== 0) expect(propById(o)?.passable).toBe(false);
    }
    for (const p of props)
      if (!p.passable) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) expect(OCC[I(x, y)]).toBe(p.id);
  });
});
