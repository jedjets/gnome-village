// tests/creatures.test.ts
// Locks 02 11.2 (pigeons: 6 at a new park, +1 every 90 s to 12; walk, peck, perch, fly, scatter 3 tiles over 3 s from a jogger within 2,
// a dog or the pomeranian within 3, a child's chase within 1; crumbs attract at most 5 within 10 and vanish at stock 0 or after 60 s; a
// gathering of 3 is announced once), 02 11.3 (a dog on a lead 1 tile behind its walker; the pomeranian's record waits outside), 03 3.5
// (the Creature record) / 08 2.3 creatures.test.ts rows / 07 S4.6 step 9. The fog's perch (m_fog) is S6's; perchAll is tested here.
// S4 part B review fix: crumbs that went leave their PropId free (03 3.1), and crumbs dropped elsewhere can take it; the pigeons that were
// going to the old crumbs neither peck the new ones from where they are nor fill their 5.
import { describe, it, expect, beforeEach } from 'vitest';
import { SIM_DT, newPark, setTick, simulate } from '../src/core/loop.ts';
import { T } from '../src/core/clock.ts';
import { clearListeners, on, type GameEvent } from '../src/core/events.ts';
import { props, type Prop } from '../src/world/grid.ts';
import { gateById } from '../src/world/park.ts';
import {
  CAP_PIGEONS_PER_CRUMBS, CRUMBS_LIFE_STEPS, GATHERING_N, PIGEONS_START, R_CRUMBS_ATTRACT, SCATTER_D, SCATTER_T, count, creatures, dropCrumbs, perchAll,
  resetCreatures, spawnDog, spawnPigeonAt, stepCreatures, thePomeranian, type Creature,
} from '../src/entities/creatures.ts';
import { removeVisitor, spawnVisitor, type Visitor } from '../src/entities/visitor.ts';

beforeEach(() => {
  clearListeners();
  newPark(101);
});

const steps = (s: number): void => {
  for (let k = 0; k < Math.round(s * 60); k++) simulate(SIM_DT, 0);
};
/** A pigeon on the ground at exactly (x, y), pecking for a while. */
function pigeonAt(x: number, y: number): Creature {
  const c = spawnPigeonAt(x, y) as Creature;
  Object.assign(c, { x, y, z: 0, st: 'peck', t: 30, targetId: 0, perchPropId: 0 });
  return c;
}
function personAt(arch: 'jogger' | 'child' | 'dogwalker' | 'single', x: number, y: number): Visitor {
  const v = spawnVisitor(arch, 'g_west') as Visitor;
  Object.assign(v, { x, y, path: null, st: 'idle', t: 0 });
  return v;
}

describe('pigeons at a new park and the top-up (02 11.2 item 1; 08 2.3)', () => {
  it('6 at a new park; 7 at 90 s; 12 at 540 s; still 12 at 630 s', () => {
    expect(PIGEONS_START).toBe(6);
    expect(count('pigeon')).toBe(6);
    steps(90);
    expect(count('pigeon')).toBe(7);
    steps(540 - 90);
    expect(count('pigeon')).toBe(12);
    steps(90);
    expect(count('pigeon')).toBe(12);
  }, 60_000);
  it('the pomeranian\'s record exists and waits outside the south-west gate (02 11.3 item 2; S6 brings it in)', () => {
    const p = thePomeranian();
    const o = gateById('g_south_w').outside;
    expect([p.kind, p.outside, p.x, p.y]).toEqual(['pomeranian', true, o.x, o.y]);
    expect(creatures.filter((c) => c.kind === 'pomeranian')).toHaveLength(1);
  });
});

describe('scatter (02 11.2 item 5; 06 1.6, 1.8)', () => {
  beforeEach(() => resetCreatures());
  it('a jogger within 2 scatters a pigeon on the ground: 3 s, 3 tiles away; at 2.5 it stays', () => {
    const near = pigeonAt(10, 30), far = pigeonAt(20, 30);
    personAt('jogger', 11.5, 30);
    personAt('jogger', 22.5, 30);
    stepCreatures(SIM_DT);
    expect([near.st, near.t, far.st]).toEqual(['scatter', SCATTER_T, 'peck']);
    for (let k = 0; k < SCATTER_T * 60; k++) stepCreatures(SIM_DT);
    expect(Math.hypot(near.x - 10, near.y - 30)).toBeCloseTo(SCATTER_D, 1);
    expect(near.x).toBeLessThan(10); // away from the jogger
  });
  it('a dog within 3, the pomeranian within 3 (when in the park), a chasing child within 1', () => {
    const a = pigeonAt(10, 20), b = pigeonAt(10, 30), c = pigeonAt(30, 30), d = pigeonAt(40, 10);
    const w = personAt('dogwalker', 12, 21);
    spawnDog(w.id); // beside its walker, 2.2 tiles from a
    const pom = thePomeranian();
    Object.assign(pom, { outside: false, x: 12.8, y: 30 });
    const kid = personAt('child', 30.8, 30);
    kid.st = 'play';
    kid.job = { creatureId: c.id };
    const idle = personAt('child', 40.5, 10); // a child not chasing does not scatter them
    void idle;
    stepCreatures(SIM_DT);
    expect([a.st, b.st, c.st, d.st]).toEqual(['scatter', 'scatter', 'scatter', 'peck']);
  });
  it('perchAll (the fog, S6) perches every pigeon until it ends', () => {
    pigeonAt(10, 20);
    pigeonAt(12, 20);
    perchAll(T.abs + 1);
    expect(creatures.every((c) => c.st === 'perch')).toBe(true);
    for (let k = 0; k < 60; k++) stepCreatures(SIM_DT);
    expect(creatures.every((c) => c.st === 'perch')).toBe(true);
  });
});

describe('crumbs (02 11.2 items 3-4; 06 1.8)', () => {
  beforeEach(() => resetCreatures());
  it('crumbs attract at most 5 of 8 pigeons within 10; 3 at them is a gathering, announced once', () => {
    dropCrumbs(10, 30, 0);
    const cr = props.find((p) => p.kind === 'crumbs');
    expect(cr).toBeDefined();
    if (cr) cr.data.stock = 3;
    const ps = Array.from({ length: 8 }, (_, k) => pigeonAt(6 + k, 34));
    for (const p of ps) p.t = 0; // they decide at once
    const feed: GameEvent[] = [];
    on('peck', (e) => e.params?.feed && feed.push(e));
    let most = 0;
    for (let k = 0; k < 6 * 60; k++) {
      stepCreatures(SIM_DT);
      most = Math.max(most, creatures.filter((c) => c.targetId === cr?.id).length);
    }
    expect(most).toBe(CAP_PIGEONS_PER_CRUMBS);
    expect(GATHERING_N).toBe(3);
    expect(feed.map((e) => e.params?.feed)).toEqual(['feed.pigeons']);
  });
  it('a crumb is pecked in 4 s; stock 1 pecked once: the prop is gone', () => {
    dropCrumbs(10, 30, 0);
    const cr = props.find((p) => p.kind === 'crumbs');
    if (cr) cr.data.stock = 1;
    const p = pigeonAt(9.5, 30);
    p.t = 0;
    for (let k = 0; k < 9 * 60; k++) stepCreatures(SIM_DT);
    expect(props.some((q) => q.kind === 'crumbs')).toBe(false);
  });
  it('crumbs that went leave their PropId to crumbs dropped elsewhere: the pigeons bound for the old ones do not peck or fill the new ones', () => {
    dropCrumbs(20, 30, 0);
    const old = props.find((p) => p.kind === 'crumbs') as Prop;
    const bound = Array.from({ length: CAP_PIGEONS_PER_CRUMBS }, (_, k) => {
      const c = pigeonAt(18 + k, 33);
      return Object.assign(c, { st: 'walk', targetId: old.id, tx: old.x + 0.1, ty: old.y + 0.1 });
    });
    old.untilTick = 1; // their 60 s are up at step 1: that step takes them away (02 11.2 item 3)
    setTick(1);
    stepCreatures(SIM_DT);
    expect(props.includes(old)).toBe(false);
    dropCrumbs(5, 40, 0);
    const fresh = props.find((p) => p.kind === 'crumbs') as Prop;
    expect(fresh.id).toBe(old.id); // the recycled PropId (03 3.1)
    fresh.data.stock = 3;
    const near = pigeonAt(6, 41);
    near.t = 0; // decides at once
    for (let k = 0; k < 8 * 60; k++) stepCreatures(SIM_DT);
    for (const c of bound) expect(Math.hypot(c.x - fresh.x, c.y - fresh.y)).toBeGreaterThan(R_CRUMBS_ATTRACT); // still over by (20, 30)
    expect(near.targetId).toBe(fresh.id); // the five bound for the old crumbs did not fill the new ones' 5
    expect(Math.hypot(near.x - fresh.x, near.y - fresh.y)).toBeLessThan(1);
    expect(fresh.data.stock).toBe(2); // one peck in 8 s, the newcomer's: none from 15 tiles away
  });
  it('untouched crumbs are gone after 60 s', () => {
    dropCrumbs(10, 30, 0);
    expect(CRUMBS_LIFE_STEPS).toBe(3600);
    steps(59);
    expect(props.some((q) => q.kind === 'crumbs' && q.x === 10 && q.y === 30)).toBe(true);
    steps(1.5);
    expect(props.some((q) => q.kind === 'crumbs' && q.x === 10 && q.y === 30)).toBe(false);
  }, 30_000);
});

describe('dogs on leads (02 11.3; 03 6.6; GV dogStep 1863)', () => {
  it('a walker\'s dog follows 1 tile behind and leaves with the walker', () => {
    resetCreatures();
    const w = personAt('dogwalker', 20, 33);
    const d = spawnDog(w.id) as Creature;
    w.x = 24; // the walker moves east
    for (let k = 0; k < 120; k++) stepCreatures(SIM_DT);
    const lead = Math.hypot(d.x - w.x, d.y - w.y);
    expect(lead).toBeGreaterThan(0.85); // it stops within 0.1 of the point 1 tile behind
    expect(lead).toBeLessThan(1.15);
    expect(d.x).toBeLessThan(w.x);
    removeVisitor(w.id);
    stepCreatures(SIM_DT);
    expect(creatures.includes(d)).toBe(false);
  });
  it('a dog walker arriving gets its dog in the same step', () => {
    resetCreatures();
    personAt('dogwalker', 20, 33);
    stepCreatures(SIM_DT);
    expect(count('dog')).toBe(1);
  });
});
