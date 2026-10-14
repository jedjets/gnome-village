// tests/pick.test.ts
// Locks 03 8.2 and 08 2.9 (pick.test.ts row; 07 S2.7 item 6): pickAt's priority people > creatures > props > tile, the radii of GV
// 11234-11240 (34 px people after a 4 px bias at the head 8z above the feet; 30 px creatures at pigeon 3, dog 6, pomeranian 5 px x z),
// props by OCC, then a passable prop, then the 0.75-tile box of GV 5658 beside a multi-tile footprint; and the fountain at all four angles.
// S4 part C: 07 S4.7 item 7 (pickAt on a figure's head point returns its id at zoom 1.3 and 2.4, all four turns) over the live lists
// of render/people.ts, a sitter picked at its seat's height, and the pomeranian waiting outside never picked. The painter order of the
// same module beside props.ts (03 7.2 item 2, 03 16 risk 8): a pair on a bench after the bench, and a pair at a cafe table between its
// far chair and its top, then the near chair, at all four turns.
import { describe, it, expect, beforeAll } from 'vitest';
import { genPark } from '../src/world/gen.ts';
import { I, KIND, Kind, N, OCC, addProp, props, type Prop } from '../src/world/grid.ts';
import { CTR, cam, centreOn, screenToWorld, setAngle, setViewport } from '../src/render/camera.ts';
import { PICK_CREATURE_HEAD, pickAt, screenOf, screenToTile, type PickCreature, type PickPerson } from '../src/render/project.ts';
import { anchorOf, peopleDrawables, pickCreatures, pickPeople, type Anchor } from '../src/render/people.ts';
import { propDrawables } from '../src/render/props.ts';
import { depthOf, sortByDepth, type Drawable } from '../src/render/order.ts';
import { FH, headRise } from '../src/render/figures.ts';
import { resetVisitors, spawnVisitor, type Archetype, type Visitor } from '../src/entities/visitor.ts';
import { resetCreatures, spawnPigeonAt, thePomeranian } from '../src/entities/creatures.ts';
import { seatPos } from '../src/entities/staff.ts';

const QUARTERS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

function view(ang: number, z = 1.3, x = CTR, y = CTR): void {
  setViewport(390, 844, 2);
  setAngle(ang);
  cam.angT = ang;
  cam.z = z;
  centreOn(x, y);
}
const one = (kind: Prop['kind']): Prop => props.find((p) => p.kind === kind) as Prop;
/** Chebyshev distance from tile (x, y) to the nearest prop footprint. */
function clearance(x: number, y: number): number {
  let m = Infinity;
  for (const p of props) {
    const dx = Math.max(p.x - x, 0, x - (p.x + p.w - 1)), dy = Math.max(p.y - y, 0, y - (p.y + p.h - 1));
    m = Math.min(m, Math.max(dx, dy));
  }
  return m;
}
/** The first w x h lawn block, all tiles free, at least 3 tiles from any prop and 5 from the boundary. */
function freeLawn(w: number, h: number): { x: number; y: number } {
  for (let y = 5; y < N - 5 - h; y++)
    for (let x = 5; x < N - 5 - w; x++) {
      let ok = true;
      for (let j = 0; j < h && ok; j++)
        for (let i = 0; i < w && ok; i++) ok = KIND[I(x + i, y + j)] === Kind.lawn && OCC[I(x + i, y + j)] === 0 && clearance(x + i, y + j) >= 3;
      if (ok) return { x, y };
    }
  throw new Error('no free lawn');
}

let fountain: Prop, bench: Prop, bridge: Prop, picnic: Prop, basket: Prop, lawn: { x: number; y: number };

beforeAll(() => {
  genPark(101);
  fountain = one('fountain');
  bench = one('bench');
  bridge = one('bridge');
  const at = freeLawn(2, 2);
  picnic = addProp({ kind: 'picnic', x: at.x, y: at.y, w: 2, h: 2, rot: 0, placedBy: 'player' });
  basket = addProp({ kind: 'basket', x: at.x + 1, y: at.y + 1, w: 1, h: 1, rot: 0, placedBy: 'sim' });
  lawn = freeLawn(1, 1);
});

describe('pickAt priority people > creatures > props > tile (03 8.2; 08 2.9)', () => {
  it('a figure over a bench: the visitor; the bench alone: the prop; lawn: the tile; off canvas: none (all four angles)', () => {
    expect(bench).toMatchObject({ x: 31, y: 24, passable: false });
    for (const a of QUARTERS) {
      view(a, 1.3, bench.x, bench.y);
      const s = screenOf(bench.x, bench.y);
      const sitter: PickPerson[] = [{ id: 12, x: bench.x, y: bench.y }];
      expect(pickAt(s.x, s.y, sitter)).toEqual({ kind: 'visitor', id: 12, tile: { x: bench.x, y: bench.y } });
      expect(pickAt(s.x, s.y)).toEqual({ kind: 'prop', id: bench.id, tile: { x: bench.x, y: bench.y } });
      view(a, 1.3, lawn.x, lawn.y);
      const l = screenOf(lawn.x, lawn.y);
      expect(pickAt(l.x, l.y)).toEqual({ kind: 'tile', id: 0, tile: lawn });
      for (const [x, y] of [[-1, 300], [100, -0.5], [390, 300], [100, 844]] as const) expect(pickAt(x, y, sitter)).toEqual({ kind: 'none', id: 0, tile: null });
    }
  });
  it('creatures come after people and before props', () => {
    for (const a of QUARTERS) {
      view(a, 1.3, bench.x, bench.y);
      const s = screenOf(bench.x, bench.y);
      const pigeon: PickCreature[] = [{ id: 4, kind: 'pigeon', x: bench.x, y: bench.y, z: 0 }];
      const person: PickPerson[] = [{ id: 9, x: bench.x, y: bench.y }];
      expect(pickAt(s.x, s.y, [], pigeon)).toMatchObject({ kind: 'creature', id: 4 });
      expect(pickAt(s.x, s.y, person, pigeon)).toMatchObject({ kind: 'visitor', id: 9 });
      // a person 25 px to the side still beats the pigeon right under the finger: priority, not distance, between the two lists
      const w = screenToWorld(s.x + 25, s.y);
      const off: PickPerson[] = [{ id: 9, x: w.x, y: w.y }];
      expect(pickAt(s.x, s.y - 3 * cam.z, off, pigeon)).toMatchObject({ kind: 'visitor', id: 9 });
      expect(pickAt(s.x, s.y - 3 * cam.z, [], pigeon)).toMatchObject({ kind: 'creature', id: 4 });
    }
  });
  it('the radii: a person within 34 px after the 4 px bias of its head (8z up); a creature within 30 px of its head', () => {
    view(0, 1.3, lawn.x, lawn.y);
    const z = cam.z;
    const v: PickPerson[] = [{ id: 1, x: lawn.x, y: lawn.y }];
    const f = screenOf(lawn.x, lawn.y);
    const head = { x: f.x, y: f.y - 8 * z };
    expect(pickAt(head.x + 37.9, head.y, v).kind).toBe('visitor');
    expect(pickAt(head.x + 38.1, head.y, v).kind).toBe('tile');
    expect(pickAt(head.x, head.y - 37.9, v).kind).toBe('visitor');
    for (const kind of ['pigeon', 'dog', 'pomeranian'] as const) {
      const c: PickCreature[] = [{ id: 2, kind, x: lawn.x, y: lawn.y, z: 0 }];
      const hy = f.y - PICK_CREATURE_HEAD[kind] * z;
      expect(pickAt(f.x + 29.9, hy, [], c).kind).toBe('creature');
      expect(pickAt(f.x + 30.1, hy, [], c).kind).toBe('tile');
    }
    expect(PICK_CREATURE_HEAD).toEqual({ pigeon: 3, dog: 6, pomeranian: 5 });
  });
  it('the nearest wins inside each list', () => {
    view(Math.PI / 2, 1.3, lawn.x, lawn.y);
    const f = screenOf(lawn.x, lawn.y);
    const people: PickPerson[] = [
      { id: 5, x: lawn.x, y: lawn.y },
      { id: 6, x: lawn.x + 1, y: lawn.y },
    ];
    const g = screenOf(lawn.x + 1, lawn.y);
    const tap = { x: f.x + (g.x - f.x) * 0.7, y: f.y + (g.y - f.y) * 0.7 - 8 * cam.z };
    expect(pickAt(tap.x, tap.y, people).id).toBe(6);
    const birds: PickCreature[] = [
      { id: 8, kind: 'dog', x: lawn.x + 1, y: lawn.y, z: 0 },
      { id: 7, kind: 'dog', x: lawn.x, y: lawn.y, z: 0 },
    ];
    expect(pickAt(f.x, f.y - 6 * cam.z, [], birds).id).toBe(7);
  });
  it('a flying pigeon is picked where it is drawn, at its flight height, not at its ground point', () => {
    view(Math.PI, 1.3, lawn.x, lawn.y);
    const c: PickCreature[] = [{ id: 3, kind: 'pigeon', x: lawn.x, y: lawn.y, z: 2 }];
    const air = screenOf(lawn.x, lawn.y, 2);
    expect(pickAt(air.x, air.y - 3 * cam.z, [], c)).toMatchObject({ kind: 'creature', id: 3 });
    const ground = screenOf(lawn.x, lawn.y);
    expect(pickAt(ground.x, ground.y, [], c)).toMatchObject({ kind: 'tile', tile: lawn });
    const dog: PickCreature[] = [{ id: 4, kind: 'dog', x: lawn.x, y: lawn.y, z: 2 }]; // only a pigeon flies
    expect(pickAt(ground.x, ground.y - 6 * cam.z, [], dog)).toMatchObject({ kind: 'creature', id: 4 });
  });
});

describe('the fountain at all four angles (07 S2.7 item 6; 08 2.9)', () => {
  it('a tap on its centre, on each footprint tile and in the 0.75-tile box beside it returns its id, at zoom 0.30, 1.3 and 2.4', () => {
    expect(fountain).toMatchObject({ x: 23, y: 23, w: 2, h: 2 });
    for (const a of QUARTERS) {
      for (const z of [0.3, 1.3, 2.4]) {
        view(a, z);
        const c = screenOf(23.5, 23.5);
        const hit = pickAt(c.x, c.y);
        expect(hit.kind).toBe('prop');
        expect(hit.id).toBe(fountain.id);
        for (const [x, y] of [[23, 23], [24, 23], [23, 24], [24, 24]] as const) {
          const s = screenOf(x, y);
          expect(pickAt(s.x, s.y)).toEqual({ kind: 'prop', id: fountain.id, tile: { x, y } });
        }
        // beside the footprint: 0.6 tile out of the edge tiles' centres is in the box, 0.8 is the flagstone tile
        for (const [x, y] of [[24.6, 23.5], [22.4, 24], [23.2, 24.7], [24, 22.35]] as const) {
          const s = screenOf(x, y);
          expect(pickAt(s.x, s.y), `${x},${y}`).toMatchObject({ kind: 'prop', id: fountain.id });
        }
        const out = screenOf(24.8, 23.3);
        expect(pickAt(out.x, out.y)).toEqual({ kind: 'tile', id: 0, tile: { x: 25, y: 23 } });
      }
    }
  });
});

describe('props: OCC, then the smallest passable prop, then the footprint box (03 8.2 item 3)', () => {
  it('a basket on a picnic blanket is the basket; the rest of the blanket is the picnic; beside it, the box takes the blanket', () => {
    for (const a of QUARTERS) {
      view(a, 1.3, picnic.x + 0.5, picnic.y + 0.5);
      const b = screenOf(basket.x, basket.y);
      expect(pickAt(b.x, b.y)).toEqual({ kind: 'prop', id: basket.id, tile: { x: basket.x, y: basket.y } });
      const p = screenOf(picnic.x, picnic.y);
      expect(pickAt(p.x, p.y)).toEqual({ kind: 'prop', id: picnic.id, tile: { x: picnic.x, y: picnic.y } });
      const side = screenOf(picnic.x - 0.65, picnic.y + 0.6);
      expect(pickAt(side.x, side.y)).toEqual({ kind: 'prop', id: picnic.id, tile: { x: picnic.x - 1, y: picnic.y + 1 } });
      const far = screenOf(picnic.x - 0.8, picnic.y + 0.6);
      expect(pickAt(far.x, far.y).kind).toBe('tile');
    }
  });
  it('the bridge over the pond neck is picked on its water tiles', () => {
    view(0, 1.3, 34, 11.5);
    for (const [x, y] of [[34, 11], [34, 12]] as const) {
      const s = screenOf(x, y);
      expect(pickAt(s.x, s.y)).toEqual({ kind: 'prop', id: bridge.id, tile: { x, y } });
    }
  });
  it('the apron is none when clear of every footprint box, though screenToTile with allowApron sees it', () => {
    view(0, 0.3);
    const s = screenOf(23.3, -4);
    expect(s.x).toBeGreaterThan(0);
    expect(s.y).toBeGreaterThan(0);
    expect(pickAt(s.x, s.y)).toEqual({ kind: 'none', id: 0, tile: null });
    expect(screenToTile(s.x, s.y, true)).toEqual({ x: 23, y: -4 });
  });
});

/** A visitor of `arch` standing still on (x, y); spawnVisitor draws on the sim stream as a real arrival does. */
function put(arch: Archetype, x: number, y: number): Visitor {
  const v = spawnVisitor(arch, 'g_north') as Visitor;
  v.x = x;
  v.y = y;
  v.path = null;
  v.st = 'idle';
  return v;
}
/** The centre of the head as drawFigure draws it: the anchor (a sitter on its seat) less headRise (0.82 h, the crouch taken off). */
function headPoint(v: Visitor): { x: number; y: number } {
  const a: Anchor = anchorOf(v, { x: 0, y: 0, gx: 0, gy: 0, h: 0, e: 0, sit: false });
  return { x: a.x, y: a.y - headRise(a.h, a.sit) };
}

describe('07 S4.7 item 7: pickAt on a figure\'s head point returns its id (03 8.2 item 1; render/people.ts lists)', () => {
  it('a grown single, a child at 0.65 and an elder at 0.95 standing, and a single sitting on a bench, at zoom 1.3 and 2.4, every turn', () => {
    resetVisitors();
    resetCreatures();
    const single = put('single', lawn.x, lawn.y);
    const child = put('child', lawn.x, lawn.y - 6);
    const elder = put('elder', lawn.x - 6, lawn.y);
    const sitter = put('single', 0, 0);
    const at = seatPos(bench, 0);
    sitter.x = at.x;
    sitter.y = at.y;
    sitter.sitPropId = bench.id;
    sitter.st = 'sit';
    expect(pickPeople().map((p) => p.id)).toEqual([single.id, child.id, elder.id, sitter.id]);
    expect(pickPeople().find((p) => p.id === sitter.id)?.e).toBe(0.2); // the bench's seat (props-park.ts drawBench seatE)
    for (const a of QUARTERS) {
      for (const z of [1.3, 2.4]) {
        for (const v of [single, child, elder, sitter]) {
          view(a, z, v.x, v.y);
          const h = headPoint(v);
          expect(h.y, `${v.archetype} head above its feet`).toBeLessThan(screenOf(v.x, v.y).y - 0.4 * FH * z * 0.65);
          const hit = pickAt(h.x, h.y, pickPeople(), pickCreatures());
          expect(hit, `${v.archetype}${v.sitPropId ? ' sitting' : ''} at turn ${a.toFixed(2)}, zoom ${z}`).toMatchObject({ kind: 'visitor', id: v.id });
        }
        // the seated single beats its bench, whose OCC tile the tap is also over (people before props)
        view(a, z, bench.x, bench.y);
        const s = screenOf(at.x, at.y, 0.2);
        expect(pickAt(s.x, s.y - 4 * z, pickPeople(), pickCreatures())).toMatchObject({ kind: 'visitor', id: sitter.id });
      }
    }
    resetVisitors();
  });

  it('pickCreatures lists the creatures in the park; the pomeranian waiting outside the gate is never picked', () => {
    resetVisitors();
    resetCreatures();
    const pom = thePomeranian();
    const bird = spawnPigeonAt(lawn.x, lawn.y);
    expect(pom.outside).toBe(true);
    expect(pickCreatures().map((c) => c.id)).toEqual([bird?.id]);
    for (const a of QUARTERS) {
      view(a, 1.3, pom.x, pom.y);
      const s = screenOf(pom.x, pom.y);
      expect(pickAt(s.x, s.y - 5 * cam.z, pickPeople(), pickCreatures()).kind).not.toBe('creature');
    }
    resetCreatures();
  });
});

/** The painted order of a frame's props and people (draw.ts phase 6), as labels: a prop drawable `prop<id>.<part>`, a visitor its id. */
function painted(): string[] {
  const list: Drawable[] = [...propDrawables(), ...peopleDrawables()];
  sortByDepth(list);
  return list.map((d) => (d.kind === 'prop' ? `prop${d.id}.${(d as Drawable & { part?: number }).part ?? 0}` : String(d.id)));
}
/** Seat `v` on seat k of prop p, as act.ts does on arrival. */
function seat(v: Visitor, p: Prop, k: number): void {
  const at = seatPos(p, k);
  v.x = at.x;
  v.y = at.y;
  v.sitPropId = p.id;
  v.st = 'sit';
}

describe('03 7.2 item 2 and 03 16 risk 8: a pair on a seat paints right against it at all four turns (render/people.ts, props.ts)', () => {
  it('a pair on a bench paints after the bench, never behind it', () => {
    resetVisitors();
    resetCreatures();
    const a = put('couple', 0, 0), b = put('couple', 0, 0);
    seat(a, bench, 0);
    seat(b, bench, 1);
    for (const ang of QUARTERS) {
      view(ang, 2.4, bench.x, bench.y);
      const o = painted();
      const k = o.indexOf(`prop${bench.id}.0`);
      expect(k, `turn ${ang.toFixed(2)}`).toBeGreaterThanOrEqual(0);
      expect(o.indexOf(String(a.id)), `turn ${ang.toFixed(2)}`).toBeGreaterThan(k);
      expect(o.indexOf(String(b.id)), `turn ${ang.toFixed(2)}`).toBeGreaterThan(k);
    }
    resetVisitors();
  });
  it('a pair at a cafe table: the far chair, its sitter, the top with the near chair, then the near sitter (the top covers the far lap)', () => {
    resetVisitors();
    resetCreatures();
    const table = one('table');
    expect(table).toMatchObject({ x: 16, y: 44, w: 1, h: 1 });
    const a = put('elder', 0, 0), b = put('elder', 0, 0);
    seat(a, table, 0);
    seat(b, table, 1);
    for (const ang of QUARTERS) {
      view(ang, 2.4, table.x, table.y);
      const [far, near] = depthOf(a.x, a.y) < depthOf(b.x, b.y) ? [a, b] : [b, a];
      const o = painted().filter((l) => l.startsWith(`prop${table.id}.`) || l === String(a.id) || l === String(b.id));
      expect(o, `turn ${ang.toFixed(2)}`).toEqual([`prop${table.id}.1`, String(far.id), `prop${table.id}.2`, String(near.id)]);
    }
    resetVisitors();
  });
});
