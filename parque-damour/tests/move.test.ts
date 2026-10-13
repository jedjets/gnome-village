// tests/move.test.ts
// Locks 02 5.4 (speeds, arrival 0.7, waypoint 0.44, replan 0.6 s, give up after 6 blocked steps, openNear within 3, spaceOut 10 x 8 px
// at zoom 1 except NO_SPACE), 02 5.5 (blocked targets 60 s, at most 8), 02 11.1 item 1 (wear while moving), 03 6.3 item 5 and A5
// (spaceOut in world units, no camera) / 08 2.3 move.test.ts rows; and the S3 hooks that need visitor records (02 8.3 "sitters stand",
// 02 8.5 item 3). GV 1511-1673 and 5586-5621 are the port.
import { describe, it, expect, beforeEach } from 'vitest';
import { SIM_DT, newPark, setTick } from '../src/core/loop.ts';
import { STEPS_PER_DAY, T } from '../src/core/clock.ts';
import { resetIds } from '../src/core/ids.ts';
import { rngN } from '../src/core/rng.ts';
import { applyNow } from '../src/core/commands.ts';
import { I, KIND, Kind, WEAR, addProp, clearLayers, BLOCK, markBlockDirty, props, rebuildBlock, removeProp, type Prop } from '../src/world/grid.ts';
import { PFSTAT } from '../src/entities/astar.ts';
import {
  BLOCKED_MEMORY_T, CAP_BLOCKED_MEMORY, GIVE_UP_STEPS, ISO_TH, ISO_TW, NO_SPACE, R_ARRIVE, R_OPEN_NEAR, R_WAYPOINT, REPLAN_T, SEP_RX, SEP_RY,
  SPD_ADULT, SPD_CHASE, SPD_CHILD, SPD_ELDER, SPD_JOGGER, SPD_PAIR, blockTarget, blockedFor, goTo, moveStep, nudge, openNear, spaceOut,
} from '../src/entities/move.ts';
import { moveOffBlocked, removeVisitor, someoneOn, spawnVisitor, standUpFrom, visitors, type Archetype, type Visitor } from '../src/entities/visitor.ts';
import '../src/play/tools.ts'; // registers the `tool` handler (S3)

/** An empty all-lawn park: no props, every tile open. */
function bare(): void {
  clearLayers();
  resetIds();
  rebuildBlock();
}
function hedge(x: number, y: number): void {
  addProp({ kind: 'hedge', x, y, w: 1, h: 1, rot: 0, placedBy: 'player' });
  rebuildBlock();
}
/** A visitor of `arch` standing at (x, y) with no errand. */
function at(arch: Archetype, x: number, y: number): Visitor {
  const v = spawnVisitor(arch, 'g_north') as Visitor;
  v.x = x;
  v.y = y;
  v.path = null;
  v.st = 'wander';
  return v;
}
/** The 10 x 8 px ellipse measure of two visitors' offset at zoom 1, camera angle 0 (GV 5605-5607). */
function sepMeasure(a: Visitor, b: Visitor): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const sx = (dx - dy) * (ISO_TW / 2), sy = (dx + dy) * (ISO_TH / 2);
  return (sx * sx) / (SEP_RX * SEP_RX) + (sy * sy) / (SEP_RY * SEP_RY);
}

beforeEach(() => {
  newPark(101);
});

describe('speeds (02 5.4, 06 1.5; 08 2.3 "over 10 s on open lawn")', () => {
  it('adult 30, child 26, elder 20, jogger 50, a strolling pair 24, a chase 40 tiles in 10 s (+- 0.5)', () => {
    expect([SPD_ADULT, SPD_CHILD, SPD_ELDER, SPD_JOGGER, SPD_PAIR, SPD_CHASE]).toEqual([3.0, 2.6, 2.0, 5.0, 2.4, 4.0]);
    const cases: Array<[string, (v: Visitor) => void, number]> = [
      ['single', () => {}, 30],
      ['child', () => {}, 26],
      ['elder', () => {}, 20],
      ['jogger', () => {}, 50],
      ['single', (v) => { v.st = 'stroll'; v.pairId = 1; }, 24],
      ['couple', (v) => { v.st = 'strollLoop'; v.coupleOf = 99; }, 24],
      ['single', (v) => { v.st = 'chase'; }, 40],
      ['gardener', () => {}, 30],
    ];
    for (const [arch, set, want] of cases) {
      bare();
      const v = at(arch as Archetype, 1, 1);
      set(v);
      expect(goTo(v, 46, 46)).toBe(true);
      for (let k = 0; k < 600; k++) moveStep(v, SIM_DT);
      expect(Math.hypot(v.x - 1, v.y - 1), arch + ' ' + v.st).toBeCloseTo(want, 0);
      expect(Math.abs(Math.hypot(v.x - 1, v.y - 1) - want)).toBeLessThan(0.5);
    }
  });
  it('wears the lawn it walks on and faces the way it goes on screen (+1 east, -1 west)', () => {
    bare();
    const v = at('single', 5, 10);
    goTo(v, 20, 10);
    for (let k = 0; k < 120; k++) moveStep(v, SIM_DT);
    expect(WEAR[I(8, 10)]).toBeGreaterThan(0);
    expect(v.face).toBe(1);
    goTo(v, 2, 10);
    for (let k = 0; k < 10; k++) moveStep(v, SIM_DT);
    expect(v.face).toBe(-1);
  });
});

describe('arrival, waypoints and route reuse (02 5.4; GV 1569-1621)', () => {
  it('the walker stops within 0.7 of the target and its path clears', () => {
    expect([R_ARRIVE, R_WAYPOINT, REPLAN_T, GIVE_UP_STEPS]).toEqual([0.7, 0.44, 0.6, 6]);
    bare();
    const v = at('single', 3, 3);
    goTo(v, 15.3, 9.8);
    expect(v.path?.at(-1)).toEqual({ x: 15.3, y: 9.8 }); // the last waypoint is the exact target
    let k = 0;
    while (v.path && k++ < 2000) moveStep(v, SIM_DT);
    expect(v.path).toBeNull();
    expect(Math.hypot(v.x - 15.3, v.y - 9.8)).toBeLessThan(R_ARRIVE);
    expect(moveStep(v, SIM_DT)).toBe(false);
  });
  it('a new target on the walk\'s target tile keeps the route and becomes its end; another tile or a force replans', () => {
    bare();
    const v = at('single', 3, 3);
    goTo(v, 30, 30);
    const c0 = PFSTAT.calls;
    expect(goTo(v, 30.4, 29.7)).toBe(true);
    expect(PFSTAT.calls).toBe(c0);
    expect([v.ptx, v.pty]).toEqual([30.4, 29.7]);
    expect(v.path?.at(-1)).toEqual({ x: 30.4, y: 29.7 }); // the walk ends on the new target, not the old one
    goTo(v, 30, 30, true);
    expect(PFSTAT.calls).toBe(c0 + 1);
    goTo(v, 30.5, 29.6); // within GV's 1.2 tiles, but on tile (31, 30): a new route
    expect(PFSTAT.calls).toBe(c0 + 2);
    expect(v.path?.at(-1)).toEqual({ x: 30.5, y: 29.6 });
    goTo(v, 33, 30);
    expect(PFSTAT.calls).toBe(c0 + 3);
  });
  it('sent on mid-walk to a target 1 to 2 tiles from the first, the walker stops within 0.7 of the new one (GV 1572 kept it in g.tx)', () => {
    for (const [nx, ny] of [[21.1, 10.9], [20.3, 9.8], [18.9, 11.2]] as const) {
      bare();
      const v = at('single', 3, 3);
      goTo(v, 20, 10);
      for (let k = 0; k < 60; k++) moveStep(v, SIM_DT);
      expect(goTo(v, nx, ny)).toBe(true);
      let k = 0;
      while (v.path && k++ < 2000) moveStep(v, SIM_DT);
      expect(v.path).toBeNull();
      expect(Math.hypot(v.x - nx, v.y - ny), `${nx},${ny}`).toBeLessThan(R_ARRIVE);
    }
  });
});

describe('blocked steps, replans and giving up (02 5.4, 5.5; GV 1511-1524, 1610-1635)', () => {
  it('a blocked step replans no sooner than 0.6 s after the last replan; the 7th blocked step gives up and remembers the target', () => {
    bare();
    const v = at('single', 10, 10);
    goTo(v, 30, 10);
    // the world changes under the plan, and again after every replan: one hedge, moved onto the new route's next tile each time
    let wall = addProp({ kind: 'hedge', x: 11, y: 10, w: 1, h: 1, rot: 0, placedBy: 'player' }).id;
    rebuildBlock();
    let calls = PFSTAT.calls;
    const replans: number[] = [];
    let gaveUp = -1;
    for (let step = 0; step < 1200; step++) {
      moveStep(v, SIM_DT);
      if (PFSTAT.calls !== calls) {
        calls = PFSTAT.calls;
        replans.push(step);
        const next = v.path?.[v.pi];
        expect(next, 'a replan finds a way round one hedge').toBeDefined();
        removeProp(wall);
        wall = addProp({ kind: 'hedge', x: next?.x ?? 0, y: next?.y ?? 0, w: 1, h: 1, rot: 0, placedBy: 'player' }).id;
        rebuildBlock();
      }
      if (v.path === null) {
        gaveUp = step;
        break;
      }
    }
    expect(replans).toHaveLength(GIVE_UP_STEPS);
    for (let k = 1; k < replans.length; k++) expect((replans[k] as number) - (replans[k - 1] as number)).toBeGreaterThanOrEqual(Math.round(REPLAN_T * 60));
    expect(gaveUp).toBeGreaterThan(replans.at(-1) as number);
    expect(v.st).toBe('idle');
    expect(v.blocked).toBe(0);
    expect(blockedFor(v, 30, 10)).toBe(true);
    expect(blockedFor(v, 32, 12)).toBe(true); // within 3.2 tiles (GV 1.6*S)
    expect(blockedFor(v, 34, 10)).toBe(false);
    expect(Math.round(v.x)).toBe(10); // never got out of its tile
  });
  it('a target walled off: the walker goes as near as it can, then gives up', () => {
    bare();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) hedge(30 + dx, 30 + dy);
    const v = at('single', 20, 30);
    expect(goTo(v, 30, 30)).toBe(false); // partial
    let k = 0;
    while (v.path && k++ < 3000) moveStep(v, SIM_DT);
    expect(v.path).toBeNull();
    expect(v.st).toBe('idle');
    expect(Math.round(v.x)).toBe(28);
    expect(blockedFor(v, 30, 30)).toBe(true);
  });
  it('a reachable target the budget cut short: goTo says partial, the walker replans at the path\'s end and arrives (02 5.5)', () => {
    bare();
    for (let x = 0; x < 47; x++) KIND[I(x, 24)] = Kind.bed; // a wall across the park, open only at x 47
    markBlockDirty();
    rebuildBlock();
    const v = at('single', 0, 47);
    expect(goTo(v, 0, 0)).toBe(false); // partial: the 2600 nodes ran out on the long way round (astar.test.ts pins it)
    expect(PFSTAT.last).toBe(2600);
    let k = 0;
    while (v.path && k++ < 6000) moveStep(v, SIM_DT);
    expect(v.path).toBeNull();
    expect(Math.hypot(v.x, v.y)).toBeLessThan(R_ARRIVE);
    expect(v.st).toBe('wander'); // not given up
    expect(blockedFor(v, 0, 0)).toBe(false);
  });
  it('a target is remembered 60 s; at most 8 are kept', () => {
    expect([BLOCKED_MEMORY_T, CAP_BLOCKED_MEMORY]).toEqual([60, 8]);
    const v = at('single', 10, 10);
    setTick(1000);
    for (let k = 0; k < 10; k++) blockTarget(v, k * 4, 0);
    expect(v.blockedList).toHaveLength(24);
    expect(blockedFor(v, 0, 0)).toBe(false); // the oldest two fell off
    expect(blockedFor(v, 8, 0)).toBe(true);
    setTick(1000 + 59 * 60);
    expect(blockedFor(v, 36, 0)).toBe(true);
    setTick(1000 + 61 * 60);
    expect(blockedFor(v, 36, 0)).toBe(false);
    expect(v.blockedList).toHaveLength(0);
    expect(T.abs).toBeGreaterThan(0.3);
  });
});

describe('openNear (02 5.4: an occupied target snaps to the nearest free tile within 3; GV 1559)', () => {
  it('a free tile is kept as it is; a hedge tile moves to the first open tile of ring 1, jittered by at most 0.3', () => {
    expect(R_OPEN_NEAR).toBe(3);
    bare();
    expect(openNear(12.2, 7.9)).toEqual({ x: 12.2, y: 7.9 });
    hedge(12, 8);
    const o = openNear(12, 8) as { x: number; y: number };
    expect(Math.max(Math.abs(Math.round(o.x) - 12), Math.abs(Math.round(o.y) - 8))).toBe(1);
    expect(Math.abs(o.x - Math.round(o.x))).toBeLessThanOrEqual(0.3);
    expect(Math.abs(o.y - Math.round(o.y))).toBeLessThanOrEqual(0.3);
    expect(BLOCK[I(Math.round(o.x), Math.round(o.y))]).toBe(0);
  });
  it('nothing open within 3: null', () => {
    bare();
    for (let y = 17; y <= 23; y++) for (let x = 17; x <= 23; x++) addProp({ kind: 'hedge', x, y, w: 1, h: 1, rot: 0, placedBy: 'player' });
    rebuildBlock();
    expect(openNear(20, 20)).toBeNull();
    expect(openNear(20, 20, 4)).not.toBeNull();
  });
});

describe('spaceOut (02 5.4, 03 6.3 item 5, A5; GV 5592-5621)', () => {
  it('two idle visitors on one spot part across the screen until the 10 x 8 px ellipse is clear, by TW/2 and TH/2 alone', () => {
    bare();
    const a = at('single', 20, 20), b = at('single', 20.05, 20.05);
    a.st = b.st = 'idle';
    const along0 = a.x + a.y + b.x + b.y;
    for (let k = 0; k < 600; k++) spaceOut(visitors, SIM_DT);
    expect(sepMeasure(a, b)).toBeGreaterThanOrEqual(1);
    expect(sepMeasure(a, b)).toBeLessThan(1.3); // eased just clear, not flung
    expect(a.x + a.y + b.x + b.y).toBeCloseTo(along0, 6); // pushed along x - y only: sideways on the screen
  });
  it('NO_SPACE states are left alone', () => {
    expect(Object.keys(NO_SPACE)).toEqual(expect.arrayContaining(['sit', 'chat', 'picnic', 'kiss', 'proposal', 'boat', 'shelter', 'chess', 'wipe', 'laugh']));
    bare();
    const a = at('single', 20, 20), b = at('single', 20.05, 20.05);
    a.st = 'sit';
    b.st = 'idle';
    for (let k = 0; k < 120; k++) spaceOut(visitors, SIM_DT);
    expect([a.x, a.y, b.x, b.y]).toEqual([20, 20, 20.05, 20.05]);
  });
  it('nudge never pushes into a blocked tile or off the park', () => {
    bare();
    hedge(11, 10);
    const v = at('single', 10.45, 10);
    expect(nudge(v, 0.1, 0)).toBe(false);
    expect(v.x).toBe(10.45);
    const e = at('single', 0.4, 10);
    expect(nudge(e, -0.2, 0)).toBe(true); // still on the boundary tile (x rounds to 0)
    expect(nudge(e, -0.8, 0)).toBe(false); // x -0.6 rounds to -1: off the park
    expect(e.x).toBeCloseTo(0.2, 10);
  });
});

describe('the park tools\' hooks that need visitor records (02 8.3 "sitters stand", 8.4 someone on it, 8.5 item 3)', () => {
  it('standUpFrom: the bench\'s sitters and walkers to it go idle and drop it; others are untouched', () => {
    const bench = props.find((p) => p.kind === 'bench');
    const id = bench?.id ?? 0;
    const s = at('single', bench?.x ?? 0, (bench?.y ?? 0) + 1), w = at('elder', 5, 5), o = at('single', 6, 6);
    s.st = 'sit';
    s.sitPropId = id;
    s.job = { propId: id };
    if (bench) bench.data.sitters = [s.id];
    w.st = 'goSit';
    w.job = { propId: id };
    goTo(w, bench?.x ?? 0, bench?.y ?? 0);
    o.st = 'read';
    standUpFrom(id);
    expect([s.st, s.sitPropId, s.job]).toEqual(['idle', 0, {}]);
    expect([w.st, w.job, w.path]).toEqual(['idle', {}, null]);
    expect(o.st).toBe('read');
    expect(bench?.data.sitters).toEqual([]);
  });
  it('remove on a bench stands its sitter up (the tool calls standUpFrom)', () => {
    const bench = props.find((p) => p.kind === 'bench');
    const s = at('single', 31, 25);
    s.st = 'sit';
    s.sitPropId = bench?.id ?? 0;
    expect(applyNow({ side: 'park', kind: 'tool', payload: { tool: 'remove', at: { x: bench?.x ?? 0, y: bench?.y ?? 0 } } })).toEqual({ ok: true });
    expect([s.st, s.sitPropId]).toEqual(['idle', 0]);
  });
  it('moveOffBlocked: a visitor on a tile that became blocked moves to an open tile beside it and replans', () => {
    bare();
    const v = at('single', 10, 10), u = at('single', 15, 15);
    goTo(v, 20, 10);
    hedge(10, 10);
    moveOffBlocked([I(10, 10)]);
    const tx = Math.round(v.x), ty = Math.round(v.y);
    expect(Math.max(Math.abs(tx - 10), Math.abs(ty - 10))).toBe(1);
    expect(BLOCK[I(tx, ty)]).toBe(0);
    expect(v.path?.at(-1)).toEqual({ x: 20, y: 10 });
    expect([u.x, u.y]).toEqual([15, 15]);
  });
  it('turning an occupied bench, or undoing the turn, leaves its sitter seated where it is with no draw (02 8.3, 8.5 item 3)', () => {
    const bench = props.find((p) => p.kind === 'bench') as Prop;
    const rot0 = bench.rot;
    const s = at('single', bench.x + 0.2, bench.y);
    s.st = 'sit';
    s.sitPropId = bench.id;
    bench.data.sitters = [s.id];
    const n0 = rngN();
    expect(applyNow({ side: 'park', kind: 'tool', payload: { tool: 'bench', at: { x: bench.x, y: bench.y } } })).toEqual({ ok: true });
    expect(bench.rot).toBe((rot0 + 1) % 4);
    expect([s.x, s.y, s.st, s.sitPropId, bench.data.sitters]).toEqual([bench.x + 0.2, bench.y, 'sit', bench.id, [s.id]]);
    expect(applyNow({ side: 'park', kind: 'undo', payload: {} })).toEqual({ ok: true });
    expect(bench.rot).toBe(rot0);
    expect([s.x, s.y, s.st, s.sitPropId]).toEqual([bench.x + 0.2, bench.y, 'sit', bench.id]);
    expect(rngN() - n0).toBe(0);
    // only its own seat keeps a sitter: one whose seat is elsewhere still moves off a tile that became blocked
    const w = at('single', 10, 10);
    w.sitPropId = bench.id;
    hedge(10, 10);
    moveOffBlocked([I(10, 10)]);
    expect(BLOCK[I(Math.round(w.x), Math.round(w.y))]).toBe(0);
  });
  it('a visitor who leaves is dropped from every seat that lists it, not only its sitPropId (an undo restores a prop with its sitters)', () => {
    const benches = props.filter((p) => p.kind === 'bench');
    const s = at('single', 5, 5), o = at('single', 6, 6);
    for (const b of benches) b.data.sitters = [s.id, o.id]; // listed though s sits nowhere (sitPropId 0)
    removeVisitor(s.id);
    for (const b of benches) expect(b.data.sitters).toEqual([o.id]);
  });
  it('someoneOn: true for a visitor whose rounded tile is listed', () => {
    const v = at('single', 7.4, 8.6);
    expect(someoneOn([{ x: 7, y: 9 }])).toBe(true);
    expect(someoneOn([{ x: 8, y: 9 }, { x: 7, y: 8 }])).toBe(false);
    v.x = 7.6;
    expect(someoneOn([{ x: 8, y: 9 }])).toBe(true);
    expect(STEPS_PER_DAY).toBe(21600);
  });
});
