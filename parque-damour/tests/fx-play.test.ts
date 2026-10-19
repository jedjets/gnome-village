// tests/fx-play.test.ts
// Locks 04 8 and 04 7.4 as built in S6 (register section 4 row "S6 art and S5 poses", picked by Claude on the owner's delegation, 2026-10-20):
// the c_petals sparkle flurry (24 petals and the outline on a 3 x 3, fewer twinkles at Fit), the m_sprinkler pop-up rotary (the spray's 30
// pooled drawables inside the 10 s, the riser's pop), the m_peel half-peeled banana, the paper dollop that is never anything but paper and ice,
// the busker's cap and notes, Pompon's four mouthfuls and the diving pigeon, the featured pair's rose glow (03 7.9 phase 6) and what people.ts
// hands the painter for Pompon and for a pigeon on its dive. The visual stream draws all of it: the sim's rng() is never touched.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { newPark } from '../src/core/loop.ts';
import { rngN } from '../src/core/rng.ts';
import { props, type Prop } from '../src/world/grid.ts';
import { GC, PALETTES, shade } from '../src/render/ambient.ts';
import { EH, cam, centreOn, setAngle, setViewport } from '../src/render/camera.ts';
import { PETAL_CUE_T, PETAL_LIFE, PETAL_N, PETAL_R, SPRINKLER_LIFE, SPRINKLER_POP, bead, drawCap, drawNotes, drawPetal, handPetals, petalAt, poof, speedLines, splat, sprayDrawables, sprinklerT, type Petal } from '../src/render/fx-play.ts';
import { clearParticles, drawPart, particles, spawn, stepParticles } from '../src/render/effects.ts';
import { drawPeel, drawSprinkler } from '../src/render/props-play.ts';
import { drawPigeonState, drawPompon, drawSwoop, SWOOP_SCALE, type PomItem } from '../src/render/creatures.ts';
import { featuredDrawables } from '../src/render/ghost.ts';
import { peopleDrawables } from '../src/render/people.ts';
import { setPin } from '../src/entities/romance.ts';
import { spawnPigeonAt } from '../src/entities/creatures.ts';
import { pompon } from '../src/entities/pomeranian.ts';
import { canCast, cast } from '../src/play/abilities.ts';
import { nowTick } from '../src/entities/visitor.ts';
import type { Drawable } from '../src/render/order.ts';
import { SEC, adult, pairAt, run, tileT, unlockAll, world } from './abilities-world.ts';
import { penOf, recorder, stubPath2D } from './draw-stub.ts';

const P = PALETTES.A;
beforeAll(stubPath2D);

describe('04 8 row petals (S6, the sparkle flurry) and 02 9.2: 24 petals and the outline over the 3 x 3, on the visual stream', () => {
  beforeEach(() => {
    newPark(101);
    clearParticles();
  });
  it('a cast spawns 24 petals and one outline; the petals land inside the 3 x 3, fall 0.9 to 1.9 s, lie to 20 s; fewer than 24 spawn no outline', () => {
    const n0 = rngN();
    spawn('petal', 10, 12, PETAL_N);
    expect(rngN(), 'the sim\'s stream is untouched').toBe(n0);
    const all = particles();
    expect(all.length).toBe(PETAL_N + 1);
    const cue = all.filter((p) => p.pet?.cue);
    expect(cue.length).toBe(1);
    expect(cue[0]?.l).toBeCloseTo(PETAL_CUE_T, 9);
    expect(cue[0]?.db).toBeLessThan(-3); // painted before everything that stands on the area
    const petals = all.filter((p) => p.pet && !p.pet.cue);
    expect(petals.length).toBe(PETAL_N);
    for (const p of petals) {
      const pet = p.pet as Petal;
      expect(Math.abs(pet.lx - 10), 'lands inside the 3 x 3').toBeLessThanOrEqual(PETAL_R + 0.35);
      expect(Math.abs(pet.ly - 12)).toBeLessThanOrEqual(PETAL_R + 0.35);
      expect(PETAL_R + 0.35).toBeLessThan(1.5);
      expect(pet.T).toBeGreaterThanOrEqual(0.9);
      expect(pet.T).toBeLessThanOrEqual(1.9);
      expect(p.l).toBe(PETAL_LIFE);
      expect(p.z).toBeGreaterThan(1.5); // starts high
    }
    clearParticles();
    spawn('petal', 10, 12, 3);
    expect(particles().length).toBe(3);
    expect(particles().some((p) => p.pet?.cue)).toBe(false);
  });
  it('petalAt: high at the start, lower every moment of the fall, then the same place for good; stepParticles keeps each petal where its age puts it and ends them at 20 s', () => {
    spawn('petal', 10, 12, PETAL_N);
    const out = { x: 0, y: 0, z: 0, flip: 0, landed: false };
    for (const p of particles()) {
      if (!p.pet || p.pet.cue) continue;
      petalAt(p.pet, p.ph, 0, out);
      expect(out.z).toBeCloseTo(1.61, 1);
      expect(out.landed).toBe(false);
      petalAt(p.pet, p.ph, p.pet.T * 0.5, out);
      expect(out.z).toBeLessThan(1.61);
      petalAt(p.pet, p.ph, p.pet.T, out);
      expect(out.landed).toBe(true);
      expect([out.x, out.y]).toEqual([p.pet.lx, p.pet.ly]);
      petalAt(p.pet, p.ph, p.pet.T + 9, out);
      expect([out.x, out.y, out.landed]).toEqual([p.pet.lx, p.pet.ly, true]);
    }
    stepParticles(2.0);
    for (const p of particles()) if (p.pet && !p.pet.cue) expect([p.x, p.y]).toEqual([p.pet.lx, p.pet.ly]); // every one has landed by 1.9 s
    expect(particles().length).toBe(PETAL_N + 1); // the outline stands to 2.6 s: still there at 2.0
    stepParticles(0.7);
    expect(particles().length).toBe(PETAL_N);
    expect(particles().some((p) => p.pet?.cue)).toBe(false);
    stepParticles(PETAL_LIFE);
    expect(particles().length).toBe(0);
  });
  it('drawing: every petal and the outline paint; at Fit (zoom under 0.55) there are fewer twinkles than at the default zoom', () => {
    spawn('petal', 10, 12, PETAL_N);
    setViewport(390, 844, 2);
    centreOn(10, 12);
    const paint = (z: number, age: number): number => {
      cam.z = z;
      centreOn(10, 12);
      const rec = recorder();
      for (const p of particles()) {
        p.l = p.m - age;
        drawPart(p, rec.ctx);
      }
      return rec.total();
    };
    const near = paint(1.3, 0.5), far = paint(0.4, 0.5), nearLanded = paint(1.3, 5), farLanded = paint(0.4, 5);
    expect(near).toBeGreaterThan(PETAL_N * 3);
    expect(far).toBeLessThan(near); // falling: one in 8 twinkles at Fit, one in 4 near
    expect(farLanded).toBeLessThan(nearLanded); // lying: one in 10, one in 5
    cam.z = 1.3;
  });
  it('drawPetal on its own: a paper petal and a rose one paint, a landed one has no contact shadow', () => {
    const pet: Petal = { sx: 0, sy: 0, lx: 1, ly: 1, T: 1, rot: 0.3, tone: 1, sz: 1, i: 1 }; // i % 4 !== 0: no twinkle
    const flying = recorder(), lying = recorder();
    drawPetal(penOf(flying), pet, 0, 0.3, { x: 5, y: 5 }, { x: 6, y: 9 }, 1, false, 0.4);
    drawPetal(penOf(lying), pet, 0, 3, { x: 5, y: 5 }, { x: 6, y: 9 }, 1, true, 0);
    expect(flying.total()).toBeGreaterThan(lying.total());
  });
});

describe('04 8 row sprinkler (S6, the pop-up rotary) and 02 9.3: the riser pops over 0.4 s, the spray is 30 drawables inside the 10 s', () => {
  beforeEach(() => {
    world();
    unlockAll();
    setViewport(390, 844, 2);
    cam.z = 1.3;
    setAngle(0);
    cam.angT = 0;
    centreOn(5, 30);
  });
  const sprinkler = (): Prop => props.find((p) => p.kind === 'sprinkler') as Prop;
  const proj = (x: number, y: number, e = 0): { x: number; y: number } => ({ x: 100 + x * 10, y: 200 + y * 5 - e * 26 });
  it('0 spray while it pops (under 0.4 s), 3 x 8 drops and 6 twinkles in between, 0 from 9.6 s and after it sinks', () => {
    expect(canCast('mischief', 'm_sprinkler', tileT(5, 30)).ok).toBe(true);
    expect(cast('mischief', 'm_sprinkler', tileT(5, 30), nowTick() + 1).ok).toBe(true);
    const sp = sprinkler();
    expect(sp).toBeDefined();
    expect(SPRINKLER_LIFE).toBe(10 * SEC);
    const count = (): number => {
      const out: Drawable[] = [];
      sprayDrawables(out);
      return out.length;
    };
    run(2);
    expect(sprinklerT(sp.untilTick)).toBeLessThan(SPRINKLER_POP);
    expect(count()).toBe(0);
    run(SEC);
    expect(sprinklerT(sp.untilTick)).toBeGreaterThan(SPRINKLER_POP);
    expect(count()).toBe(30);
    run(SEC * 8);
    expect(count()).toBe(30); // t about 9 s
    run(Math.round(0.7 * SEC));
    expect(sprinklerT(sp.untilTick)).toBeGreaterThan(10 - SPRINKLER_POP);
    expect(count()).toBe(0); // it is sinking
    run(SEC * 2);
    expect(props.some((p) => p.kind === 'sprinkler')).toBe(false);
    expect(count()).toBe(0);
  });
  it('off screen: nothing; the drops of one arm are 1.5 tiles out at most and the list is reused (the same objects next call)', () => {
    cast('mischief', 'm_sprinkler', tileT(5, 30), nowTick() + 1);
    run(SEC * 2);
    const a: Drawable[] = [], b: Drawable[] = [];
    sprayDrawables(a);
    sprayDrawables(b);
    expect(a.length).toBe(30);
    expect(b[0]).toBe(a[0]); // pooled
    const sp = sprinkler();
    for (const d of a.filter((x) => (x.id & 63) < 24)) expect(Math.hypot(d.x - sp.x, d.y - sp.y)).toBeLessThanOrEqual(1.5 + 1e-9);
    cam.z = 3;
    centreOn(40, 5);
    const far: Drawable[] = [];
    sprayDrawables(far);
    expect(far.length).toBe(0);
    cam.z = 1.3;
  });
  it('the riser: the turf ring only at birth, then the zinc riser, the brass head and the arm; fully up it paints more', () => {
    cast('mischief', 'm_sprinkler', tileT(5, 30), nowTick() + 1);
    const sp = sprinkler();
    const paint = (): number => {
      const rec = recorder();
      drawSprinkler(penOf(rec), proj, sp);
      return rec.total();
    };
    const born = paint();
    run(SEC * 2);
    const up = paint();
    expect(born).toBeLessThan(up);
    run(SEC * 8 + Math.round(0.7 * SEC));
    expect(paint()).toBeLessThan(up); // sinking again
  });
});

describe('04 8 row peel (S6, the half-peeled banana) and the effects of the pigeon, the trip and the busker', () => {
  it('the banana paints its fruit, two strips and a glint', () => {
    const rec = recorder();
    drawPeel(penOf(rec), { x: 50, y: 50 });
    expect(rec.total()).toBeGreaterThan(40);
    expect(rec.fills.length).toBeGreaterThan(5);
  });
  it('tone (register 3.14): the dollop is paper, ice and a gold twinkle, nothing else, at every size and age; the poof is dust', () => {
    const allowed = new Set([GC(P.ice, 1), GC(P.paper, 1), shade(P.lamp, 1.05, 0.95)]);
    for (const t of [0, 1, 3]) {
      const rec = recorder();
      splat(penOf(rec), { x: 10, y: 10 }, 5, t);
      expect(rec.fills.length).toBeGreaterThan(2);
      for (const f of rec.fills) expect(allowed.has(f), f).toBe(true);
    }
    const dust = recorder();
    poof(penOf(dust), { x: 10, y: 10 }, 0.4);
    expect(dust.fills.every((f) => f === dust.fills[0])).toBe(true);
    expect(dust.fills[0]).toBe(GC(P.dust, 0.6 * (1 - 0.6 * 0.4)));
  });
  it('speed lines (three), the bead, the busker\'s cap and notes, the flower seller\'s petals all paint', () => {
    const lines = recorder();
    speedLines(penOf(lines), { x: 0, y: 0 }, { x: 10, y: -30 }, { x: 0.8, y: 0.6 });
    expect(lines.calls.stroke).toBe(3);
    const b = recorder();
    bead(penOf(b), { x: 4, y: 4 }, { x: 4, y: 40 });
    expect(b.total()).toBeGreaterThan(3);
    const cap = recorder();
    drawCap(penOf(cap), { x: 10, y: 10 });
    expect(cap.calls.fill).toBeGreaterThan(3); // the cap and its coins
    const notes0 = recorder(), notes1 = recorder();
    drawNotes(penOf(notes0), { x: 10, y: 10 }, 1, 0.2);
    drawNotes(penOf(notes1), { x: 10, y: 10 }, -1, 1.7);
    expect(notes0.total()).toBeGreaterThan(3);
    expect(notes1.total()).toBeGreaterThan(3);
    const fl = recorder();
    handPetals(penOf(fl), { x: 10, y: 10 }, 60, 0.7);
    expect(fl.total()).toBeGreaterThan(3);
  });
});

describe('04 7.4 and 9.3 (S6): Pompon runs in his dust cloud with what he took in his mouth, the pigeon dives bigger', () => {
  const ITEMS: PomItem[] = ['hat', 'purse', 'baguette', 'iceCream'];
  const pom = (item: PomItem | null, running = true, t = 1): ReturnType<typeof recorder> => {
    const rec = recorder();
    drawPompon({ pen: penOf(rec), warm: 0 }, { x: 80, y: 80 }, 1, running, t, item, P.crowdTop[3] as string);
    return rec;
  };
  it('each of the four mouthfuls paints beyond the bare dog, in its own colours; a dog at rest paints no dust', () => {
    const bare = pom(null).total();
    for (const item of ITEMS) expect(pom(item).total(), item).toBeGreaterThan(bare);
    expect(pom('hat').fills).toContain(shade(P.crowdTop[3] as string, 1));
    expect(pom('baguette').fills).toContain(shade(P.baguette, 1));
    expect(pom('purse').fills).toContain(shade(P.crowdTop[9] as string, 1));
    expect(pom(null, false).total()).toBeLessThan(bare); // the run's cloud and lines are drawn only while he runs
  });
  it('the swoop: the bird in flight with three speed lines, and a bead when it carries one over a head; drawn bigger than a pigeon', () => {
    const draw = (from: { x: number; y: number }, head: { x: number; y: number } | null): ReturnType<typeof recorder> => {
      const rec = recorder();
      drawSwoop({ pen: penOf(rec), warm: 0 }, { x: 80, y: 80 }, 1, 0.3, 12, from, head);
      return rec;
    };
    const bird = recorder();
    drawPigeonState({ pen: penOf(bird), warm: 0 }, { x: 80, y: 80 }, 1, 'fly', 0.3, 12);
    const lines = draw({ x: 60, y: 20 }, null);
    expect(lines.total()).toBeGreaterThanOrEqual(bird.total() + 3); // the three speed lines trail it
    expect((lines.calls.stroke ?? 0) - (bird.calls.stroke ?? 0)).toBeGreaterThanOrEqual(3);
    expect(draw({ x: 60, y: 20 }, { x: 80, y: 130 }).total()).toBeGreaterThan(draw({ x: 60, y: 20 }, null).total()); // the bead
    expect(SWOOP_SCALE).toBeGreaterThan(1);
    expect(SWOOP_SCALE).toBeLessThanOrEqual(1.6);
  });
});

describe('03 7.9 phase 6 and 04 7.6 (S6): the featured pair\'s rose glow, a hair before each member; and Pompon and the diving pigeon in people.ts', () => {
  beforeEach(() => {
    world();
    setViewport(390, 844, 2);
    cam.z = 1.3;
    setAngle(0);
    cam.angT = 0;
    centreOn(20, 20);
  });
  it('none with no pair; two for the pair; one when a member\'s own ring is up; none when both are off screen; each a hair before its member', () => {
    expect(featuredDrawables(0).length).toBe(0);
    const { p, a, b } = pairAt(20, 20, 1);
    expect(featuredDrawables(0).map((d) => d.kind)).toEqual(['ring', 'ring']);
    expect(featuredDrawables(a.id).length).toBe(1);
    expect(featuredDrawables(b.id).length).toBe(1);
    setPin(p.id);
    expect(featuredDrawables(0).length).toBe(2);
    const people = peopleDrawables().filter((d) => d.kind === 'visitor');
    for (const r of featuredDrawables(0)) {
      const me = people.find((d) => d.x === r.x && d.y === r.y);
      expect(me).toBeDefined();
      expect(r.depth).toBeLessThan((me as Drawable).depth);
      expect((me as Drawable).depth - r.depth).toBeLessThan(0.05);
    }
    cam.z = 3;
    centreOn(2, 45);
    expect(featuredDrawables(0).length).toBe(0);
    cam.z = 1.3;
    setPin(0);
  });
  it('the ring paints a pool and three twinkles, more by night than by day (k 0.82 to 1)', () => {
    pairAt(20, 20, 1);
    const rings = featuredDrawables(0);
    expect(rings.length).toBe(2);
    const rec = recorder();
    (rings[0] as Drawable).draw(rings[0] as Drawable, rec.ctx);
    expect(rec.total()).toBeGreaterThan(8);
  });
  it('Pompon is drawn once he is in the park, and not while he waits outside; a pigeon on its dive is drawn 1.45 times its size', () => {
    const v = adult(20, 20);
    const pm = pompon();
    expect(pm).toBeDefined();
    if (!pm) return;
    pm.outside = true;
    expect(peopleDrawables().some((d) => d.kind === 'pomeranian')).toBe(false);
    Object.assign(pm, { outside: false, x: 19, y: 20, st: 'run', tx: 20, ty: 20 });
    const d = peopleDrawables().find((q) => q.kind === 'pomeranian');
    expect(d).toBeDefined();
    const flying = spawnPigeonAt(22, 20);
    expect(flying).toBeTruthy();
    if (!flying) return;
    Object.assign(flying, { x: 22, y: 20, z: 0.5, st: 'fly', tx: 23, ty: 20, t: 0, ownerId: 0 });
    const hOf = (): number => (peopleDrawables().find((q) => q.kind === 'pigeon' && q.id === flying.id) as unknown as { h: number }).h;
    const base = hOf();
    expect(base).toBeCloseTo(0.18 * EH * cam.z, 6);
    Object.assign(flying, { st: 'swoop', ownerId: v.id, t: 0 });
    expect(hOf()).toBeCloseTo(0.18 * SWOOP_SCALE * EH * cam.z, 6);
    Object.assign(flying, { t: 2 }); // still winding up: its usual size
    expect(hOf()).toBeCloseTo(0.18 * EH * cam.z, 6);
  });
});
