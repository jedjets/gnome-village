// tests/bench-lean.test.ts
// Locks the far-zoom floor of the Bench 2 lean (S7 follow-up 1, owner 2026-10-22 "the bench lean strengthened at Fit"; 04 9.2 row Bench;
// render/figure-moves.ts benchLeanAt and benchMove, people.ts): at Fit a figure is 6.6 px tall, so her 0.2 rad lean moved her head 0.6 px and a
// pair on a bench read as two upright figures. Her head now keeps BENCH_LEAN_PX (0.8) of lean toward him at any height; he, who sits up, leans
// BENCH_LEAN_HIM_PX (0.3) toward her at Fit, fading to nothing by 16 px of height (zoom 0.73). From 10 px of height up (zoom 0.45) her move is
// the one moveOf made, the very same object, so 1.3 and 2.4 draw as before (tests/ pixel check: shots/s7-bench-13 and -24 equal their pre-floor images).
import { describe, it, expect, beforeEach } from 'vitest';
import { newPark } from '../src/core/loop.ts';
import { HUFF_T, resetRomance, tryForm } from '../src/entities/romance.ts';
import { resetVisitors, spawnVisitor, type Visitor } from '../src/entities/visitor.ts';
import { cam } from '../src/render/camera.ts';
import { FH } from '../src/render/figure-rig.ts';
import { skel } from '../src/render/figure-pose.ts';
import { BENCH_LEAN_HIM_PX, BENCH_LEAN_PX, benchLeanAt, benchMove, moveOf, type Move } from '../src/render/figure-moves.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

beforeEach(() => {
  newPark(101);
  resetVisitors();
  resetRomance();
  cam.ang = 0;
});

/** A pair seated on the bench, her facing 1 and him east of her: [her move, his move]. */
function pair(): [Move, Move] {
  const a = spawnVisitor('single', 'g_west', { sex: 'f', seeks: 'm' }) as Visitor, b = spawnVisitor('single', 'g_west', { sex: 'm', seeks: 'f' }) as Visitor;
  Object.assign(a, { x: 20, y: 20, st: 'idle', path: null });
  Object.assign(b, { x: 21, y: 20, st: 'idle', path: null });
  expect(tryForm(a, b, true)).toBeTruthy();
  Object.assign(a, { st: 'bench', sitPropId: 4 });
  Object.assign(b, { st: 'bench', sitPropId: 4 });
  return [{ ...(moveOf(a, 1, 3, 0) as Move) }, { ...(moveOf(b, 1, 3, 0) as Move) }];
}
/** How far (px) the head sits to the side of where it would with no lean, at drawn height h. */
const shift = (m: Move, h: number): number => Math.abs(skel(h, m.pose).head.x - skel(h, { ...m.pose, lean: 0 }).head.x);
const hAt = (z: number): number => FH * z;

describe('moveOf says which way each leans and who she is (the floor needs both)', () => {
  it('k is +1 for her with him ahead, her flag set, his lean 0.02; both leave k at 0 for any other kind of move', () => {
    const [her, him] = pair();
    expect([her.kind, her.k, her.her, him.kind, him.her]).toEqual(['bench', 1, true, 'bench', false]);
    expect(Math.abs(her.pose.lean ?? 0)).toBeCloseTo(0.2, 9);
    expect(Math.abs(him.pose.lean ?? 0)).toBeCloseTo(0.02, 9);
    const w = moveOf(spawnVisitor('single', 'g_west', { sex: 'f' }) as Visitor, 1, 0, 0);
    expect(w).toBeNull();
    expect(HUFF_T).toBeGreaterThan(0);
  });
});

describe('her lean: the head keeps BENCH_LEAN_PX of shift at every height, and the move is untouched from 10 px of height up', () => {
  it('Fit (0.3, 6.6 px): the head moves 0.8 px toward him; 0.4 to 0.8: still 0.8 until her own lean takes over; the natural 0.2 rad gives 0.6 px at Fit', () => {
    const [her] = pair();
    expect(shift(her, hAt(0.3))).toBeLessThan(0.7); // what it was: two upright figures
    for (const z of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
      const m = benchMove(her, hAt(z));
      expect(shift(m, hAt(z)), `zoom ${z}`).toBeGreaterThanOrEqual(BENCH_LEAN_PX - 0.03);
      expect(Math.sign(m.pose.lean ?? 0), `zoom ${z}`).toBe(her.k);
    }
    expect(Math.abs(benchLeanAt(her, hAt(0.3)))).toBeGreaterThan(0.25);
    expect(Math.abs(benchLeanAt(her, hAt(0.3)))).toBeLessThan(0.35); // about 16 degrees, not the 35 of the first try (the two heads on top of each other)
  });
  it('1.3 and 2.4 (and 0.6, 0.9, 1.0, 1.8, 3.4): benchMove returns the very move moveOf made, so the drawing is the one of before', () => {
    const [her, him] = pair();
    for (const z of [0.9, 1.0, 1.3, 1.8, 2.4, 3.4]) {
      expect(benchMove(her, hAt(z)), `her ${z}`).toBe(her);
      expect(benchMove(him, hAt(z)), `him ${z}`).toBe(him);
      expect(benchMove(her, hAt(z) * 0.95), `an elder ${z}`).toBe(her); // 0.95 h
    }
  });
  it('no step on the way: her lean never rises as the figure grows (Fit is 6.6 px), and no two heights 0.1 px apart differ by more than 0.02 rad', () => {
    const [her] = pair();
    let prev = Math.abs(benchLeanAt(her, 6));
    for (let h = 6.1; h <= 40; h += 0.1) {
      const l = Math.abs(benchLeanAt(her, h));
      expect(l, `h ${h}`).toBeLessThanOrEqual(prev + 1e-9);
      expect(prev - l, `h ${h}`).toBeLessThan(0.02);
      prev = l;
    }
    expect(prev).toBeCloseTo(0.2, 9);
  });
});

describe('his lean: a small lean toward her at Fit that is gone by 16 px of height', () => {
  it('Fit: 0.3 px toward her; 11 px: less; 16 px up: his own 0.02 rad, the same move; never away from her at Fit', () => {
    const [her, him] = pair();
    const fit = benchMove(him, hAt(0.3));
    expect(shift(fit, hAt(0.3))).toBeGreaterThanOrEqual(BENCH_LEAN_HIM_PX - 0.02);
    expect(Math.sign(fit.pose.lean ?? 0)).toBe(him.k);
    expect(him.k).toBe(-her.k); // each toward the other
    expect(Math.abs(benchLeanAt(him, 12))).toBeLessThan(Math.abs(benchLeanAt(him, hAt(0.3))));
    expect(benchMove(him, 16)).toBe(him);
    expect(benchMove(him, 11)).not.toBe(him); // on the ramp
    expect(Math.abs(benchLeanAt(him, 11))).toBeGreaterThan(0.025); // more than his own 0.02 and the floor's hair
    expect(Math.abs(benchLeanAt(him, 11))).toBeLessThan(Math.abs(benchLeanAt(him, 10)));
    expect(benchMove(him, 14)).toBe(him); // the ramp's tail is under the hair: his own lean
    expect(shift(benchMove(him, hAt(0.3)), hAt(0.3))).toBeLessThan(shift(benchMove(her, hAt(0.3)), hAt(0.3))); // she still leans further than he
  });
});

describe('every other move is left alone, and people.ts applies the floor and keeps the bench pose under 12 px', () => {
  it('benchMove returns any other kind of move as it is; the move\'s tilt, expression and arms ride along', () => {
    const [her] = pair();
    const notice = { ...her, kind: 'notice' as const };
    expect(benchMove(notice, 6.6)).toBe(notice);
    const m = benchMove(her, 6.6);
    expect(m.pose.tilt).toBe(her.pose.tilt);
    expect(m.pose.expr).toBe('bench');
    expect(m.kind).toBe('bench');
  });
  it('people.ts: prepare() floors the move at the figure\'s height, figureSprite keeps a bench move under 12 px and keys its sprite on the lean', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'src', 'render', 'people.ts'), 'utf8');
    expect(src).toMatch(/if \(POSE\.move\) POSE\.move = benchMove\(POSE\.move, pd\.h\)/);
    expect(src).toMatch(/if \(POSE\.move\?\.kind !== 'bench'\) POSE\.move = null/);
    expect(src).toMatch(/'\|bn' \+ Math\.round\(\(POSE\.move\.pose\.lean \?\? 0\) \* 100\)/);
  });
});
