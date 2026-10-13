// tests/rig-scene.test.ts
// The S4 rig review over the live records (register section 4, rows Figure rig and Crowd palette; 04 7.2 couple row, 7.3 rule 5, 7.4 perch;
// 03 7.2 item 2, 03 16 risk 8): a couple member keeps its scarf hue and its top after its lead partner has left the park (removeVisitor
// sets the partner's coupleOf to 0 at the outside tile, while the other member still walks to the gate), and a pigeon perched on a bench's
// back rail paints after the bench and before both sitters while the bench faces the camera, after both while its back does, at every turn.
import { describe, it, expect, beforeAll } from 'vitest';
import { genPark } from '../src/world/gen.ts';
import { props, type Prop } from '../src/world/grid.ts';
import { cam, centreOn, setAngle, setViewport } from '../src/render/camera.ts';
import { screenOf } from '../src/render/project.ts';
import { peopleDrawables } from '../src/render/people.ts';
import { propDrawables } from '../src/render/props.ts';
import { sortByDepth, type Drawable } from '../src/render/order.ts';
import { PALETTES } from '../src/render/ambient.ts';
import { lookOf, newLook } from '../src/render/figure-look.ts';
import { removeVisitor, resetVisitors, spawnVisitor, type Archetype, type Visitor } from '../src/entities/visitor.ts';
import { resetCreatures, spawnPigeonAt } from '../src/entities/creatures.ts';
import { seatPos } from '../src/entities/staff.ts';
import { mulberry32 } from '../src/core/rng.ts';

const P = PALETTES.A;
const QUARTERS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

function put(arch: Archetype, x: number, y: number): Visitor {
  const v = spawnVisitor(arch, 'g_north') as Visitor;
  v.x = x;
  v.y = y;
  v.path = null;
  v.st = 'idle';
  return v;
}

let bench: Prop;
beforeAll(() => {
  genPark(101);
  bench = props.find((p) => p.kind === 'bench') as Prop;
});

describe('04 7.2 couple row, 7.3 rule 5: a couple member keeps its look after its lead partner leaves (figure-look.ts PAIRS)', () => {
  it('over 300 lookSeed pairs the remaining member\'s scarf hue and top are unchanged when the lead (lower id) is removed', () => {
    const r = mulberry32(2026);
    let differs = 0;
    for (let k = 0; k < 300; k++) {
      resetVisitors();
      resetCreatures();
      const lead = put('couple', 20, 20), other = put('couple', 21, 20);
      expect(lead.id).toBeLessThan(other.id);
      lead.sex = 'f';
      other.sex = 'm';
      lead.lookSeed = Math.floor(r() * 4294967296);
      other.lookSeed = Math.floor(r() * 4294967296);
      lead.coupleOf = other.id;
      other.coupleOf = lead.id;
      const before = lookOf(other, P, 1, newLook());
      const leadLook = lookOf(lead, P, 1, newLook());
      expect(before.pairScarf, 'one hue for the pair').toBe(leadLook.pairScarf);
      // what the other member would wear if it read its own seed alone: the change the memo prevents
      other.coupleOf = 0;
      const alone = lookOf({ ...other, id: other.id + 100000 } as Visitor, P, 1, newLook());
      other.coupleOf = lead.id;
      if (alone.pairScarf !== before.pairScarf || alone.top !== before.top) differs++;
      removeVisitor(lead.id);
      expect(other.coupleOf).toBe(0);
      const after = lookOf(other, P, 1, newLook());
      expect(after.pairScarf, 'seed pair ' + k).toBe(before.pairScarf);
      expect(after.top, 'seed pair ' + k).toBe(before.top);
      expect(after.stripe, 'seed pair ' + k).toBe(before.stripe);
    }
    expect(differs).toBeGreaterThan(50); // the case is common: without the memo about half the pairs would change
    resetVisitors();
  });
});

describe('04 7.4 perch, 03 7.2 item 2, 03 16 risk 8: a pigeon on a bench\'s back rail against the bench and its two sitters', () => {
  it('after the bench; before both sitters while the bench faces the camera, after both while its back does (every turn)', () => {
    resetVisitors();
    resetCreatures();
    const a = put('single', 0, 0), b = put('single', 0, 0);
    [a, b].forEach((v, k) => {
      const at = seatPos(bench, k);
      v.x = at.x;
      v.y = at.y;
      v.sitPropId = bench.id;
      v.st = 'sit';
    });
    const pg = spawnPigeonAt(bench.x, bench.y);
    expect(pg).toBeTruthy();
    if (!pg) return;
    pg.st = 'perch';
    pg.perchPropId = bench.id;
    pg.z = 0.45;
    const q = (Math.PI / 2) * ((bench.rot + 2) % 4), fx = -Math.sin(q), fy = Math.cos(q); // the bench's front, local +v
    let facing = 0, backing = 0;
    for (const ang of QUARTERS) {
      setViewport(390, 844, 2);
      setAngle(ang);
      cam.angT = ang;
      cam.z = 2.4;
      centreOn(bench.x, bench.y);
      const list: Drawable[] = [...propDrawables(), ...peopleDrawables()];
      sortByDepth(list);
      const at = (kind: string, id: number): number => list.findIndex((d) => d.kind === kind && d.id === id);
      const kb = list.findIndex((d) => d.kind === 'prop' && d.id === bench.id);
      const ka = at('visitor', a.id), kb2 = at('visitor', b.id), kp = at('pigeon', pg.id);
      expect(Math.min(kb, ka, kb2, kp), `turn ${ang.toFixed(2)}`).toBeGreaterThanOrEqual(0);
      expect(kp, `turn ${ang.toFixed(2)}: after the bench`).toBeGreaterThan(kb);
      const frontNear = screenOf(bench.x + fx * 0.2, bench.y + fy * 0.2).y >= screenOf(bench.x - fx * 0.2, bench.y - fy * 0.2).y;
      if (frontNear) {
        facing++;
        expect(kp, `turn ${ang.toFixed(2)}: the rail behind the sitters`).toBeLessThan(Math.min(ka, kb2));
      } else {
        backing++;
        expect(kp, `turn ${ang.toFixed(2)}: the rail in front of the sitters`).toBeGreaterThan(Math.max(ka, kb2));
      }
    }
    expect(facing).toBe(2);
    expect(backing).toBe(2);
    resetVisitors();
    resetCreatures();
  });
});
