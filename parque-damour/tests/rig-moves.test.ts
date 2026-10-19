// tests/rig-moves.test.ts
// Locks 04 9.2 and 9.3 as built in S6 (register section 4 row "S6 art and S5 poses", picked by Claude on the owner's delegation, 2026-10-20):
// the single-figure poses of render/figure-moves.ts, from a visitor's state and its reaction clock: Notice 2 (the shy glance), Bench 2 (head on
// the shoulder, toward the partner's side of the screen), huff 1 (arms folded, her foot taps once a second), laugh 1 (a bob at 2 Hz), the poop
// wipe (the hat off in her hand 1.4 to 2.95 s, the dollop to 3 s), the soaked shake (6 Hz, +-0.25 rad, wet clothes), the trip's plop and grin
// (a poof from 0.3 to 1.5 s, standing at 3 s, never flat) and the snatched chase (arms up). Also: the lengths equal brain.ts's REACTION, a figure
// with a move draws through drawVisitor, and the tone rule that nothing in these poses is more than a sit.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { newPark } from '../src/core/loop.ts';
import { PALETTES } from '../src/render/ambient.ts';
import { REACTION } from '../src/entities/brain.ts';
import { HUFF_T, resetRomance, tryForm } from '../src/entities/romance.ts';
import { SNATCH_HUFF_T } from '../src/entities/act-romance.ts';
import { BACKFIRE_T } from '../src/entities/embarrass.ts';
import { resetVisitors, spawnVisitor, type Visitor } from '../src/entities/visitor.ts';
import { cam } from '../src/render/camera.ts';
import { FH, opts, type RigLook } from '../src/render/figure-rig.ts';
import { newLook } from '../src/render/figure-look.ts';
import { CHASE_T, HUFF_PARTED_T, HUFF_SNATCHED_T, SHAKE_T, STUMBLE_T, WIPE_T, moveOf, wetLook, type Move } from '../src/render/figure-moves.ts';
import { drawVisitor, poseOf } from '../src/render/figures.ts';
import { penOf, recorder, stubPath2D } from './draw-stub.ts';

const P = PALETTES.A;
beforeAll(stubPath2D);
beforeEach(() => {
  newPark(101);
  resetVisitors();
  resetRomance();
  cam.ang = 0;
});

/** A visitor record with only what moveOf reads. */
function vis(o: Partial<Visitor>): Visitor {
  return {
    id: 7, sex: 'f', archetype: 'single', ageWord: 'grown', lookSeed: 3, st: 'idle', t: 0, path: null, sitPropId: 0, pairId: 0, coupleOf: 0, job: {},
    items: { hat: true, purse: false, baguette: false, iceCream: false }, ...o,
  } as unknown as Visitor;
}
/** The move of a visitor whose reaction has run `el` seconds of its `len`. */
function at(st: string, len: number, el: number, o: Partial<Visitor> = {}): Move {
  const m = moveOf(vis({ st, t: len - el, ...o }), 1, 5, 1.2);
  expect(m, st).not.toBeNull();
  return { ...(m as Move) };
}

describe('04 9.3 and 02 6.4: the reaction lengths the poses run over are the sim\'s own (brain.ts REACTION, romance.ts HUFF_T)', () => {
  it('wipe 4, shake 3, stumble 3, chase 8; the Parted huff 6 s, the snatched huff 3 s; every state has a clock the sim counts down', () => {
    expect(REACTION.poop).toEqual(['wipe', WIPE_T]);
    expect(REACTION.soaked).toEqual(['shake', SHAKE_T]);
    expect(REACTION.trip).toEqual(['stumble', STUMBLE_T]);
    expect(REACTION.snatched).toEqual(['chase', CHASE_T]);
    expect(HUFF_PARTED_T).toBe(HUFF_T);
    expect(HUFF_SNATCHED_T).toBe(SNATCH_HUFF_T);
    expect([WIPE_T, SHAKE_T, STUMBLE_T, CHASE_T, HUFF_PARTED_T, HUFF_SNATCHED_T]).toEqual([4, 3, 3, 8, 6, 3]);
    expect(BACKFIRE_T.poop).toBeGreaterThan(0); // the laugh's own clock is the backfire's
  });
});

describe('04 9.2 Notice 2 and Bench 2 (S6): the shy glance by sex, the head on the shoulder toward the partner', () => {
  it('notice: he stops mid-step (feet apart), she stands hands clasped; a walker (a path) is not posed; other states have no move', () => {
    const him = moveOf(vis({ st: 'notice', sex: 'm' }), 1, 0, 0) as Move;
    expect(him.kind).toBe('notice');
    expect(him.pose.footF?.x).toBeGreaterThan(0.1);
    expect(him.pose.footB?.x).toBeLessThan(-0.1);
    expect(him.pose.tilt).toBeCloseTo(0.2, 9); // the head turned toward her
    const her = moveOf(vis({ st: 'notice', sex: 'f' }), 1, 0, 0) as Move;
    expect(her.pose.footF).toBeUndefined(); // she stands
    expect(her.pose.tilt).toBeCloseTo(0.16, 9);
    expect(moveOf(vis({ st: 'notice', sex: 'f', path: [{ x: 1, y: 1 }] }), 1, 0, 0)).toBeNull();
    for (const st of ['idle', 'wander', 'sit', 'kiss', 'eat', 'photo']) expect(moveOf(vis({ st }), 1, 0, 0), st).toBeNull();
  });
  it('bench: he sits up; she leans 0.2 rad and tips her head 0.25 toward her partner, on the side he is on, at every turn and either facing', () => {
    const a = spawnVisitor('single', 'g_west', { sex: 'f', seeks: 'm' }) as Visitor, b = spawnVisitor('single', 'g_west', { sex: 'm', seeks: 'f' }) as Visitor;
    Object.assign(a, { x: 20, y: 20, st: 'idle', path: null });
    Object.assign(b, { x: 21, y: 20, st: 'idle', path: null });
    expect(tryForm(a, b, true)).toBeTruthy();
    Object.assign(a, { st: 'bench', sitPropId: 4 });
    Object.assign(b, { st: 'bench', sitPropId: 4 });
    const lean = (v: Visitor, face: 1 | -1): { lean: number; tilt: number } => {
      const m = moveOf(v, face, 3, 0) as Move;
      expect(m.kind).toBe('bench');
      return { lean: m.pose.lean ?? 0, tilt: m.pose.tilt ?? 0 };
    };
    for (const face of [1, -1] as const) {
      cam.ang = 0;
      const e = lean(a, face); // he is east of her: ahead on screen for a figure facing +1
      expect(Math.abs(e.lean)).toBeCloseTo(0.2, 9);
      expect(Math.abs(e.tilt)).toBeCloseTo(0.25, 9);
      expect(Math.sign(e.lean)).toBe(Math.sign(e.tilt));
      expect(Math.sign(e.lean)).toBe(face);
      b.x = 19; // he moves to her west: the other side
      expect(Math.sign(lean(a, face).lean)).toBe(-face);
      b.x = 21;
    }
    cam.ang = Math.PI; // the park turned half a turn: east is now the left of the screen
    expect(Math.sign(lean(a, 1).lean)).toBe(-1);
    cam.ang = 0;
    const him = moveOf(b, 1, 3, 0) as Move;
    expect(Math.abs(him.pose.lean ?? 0)).toBeLessThan(0.05); // he sits up
    expect(moveOf(vis({ st: 'bench', sex: 'f', sitPropId: 0 }), 1, 0, 0)).toBeNull(); // not yet on the bench
  });
});

describe('04 9.3 huff 1 and laugh 1 (S6): arms folded with a foot tap, heads back with a bob', () => {
  it('huff: the chin up and the arms folded; her foot taps at 1 Hz, his does not after a Parting, and a snatched owner\'s does', () => {
    const lifted = (v: Visitor, t: number): number => (moveOf(v, 1, t, 0) as Move).pose.toeF ?? 0;
    const her = vis({ st: 'huff', sex: 'f', job: { kind: 'parted' } }), him = vis({ st: 'huff', sex: 'm', job: { kind: 'parted' } }), robbed = vis({ st: 'huff', sex: 'm', job: { kind: 'snatched' } });
    const m = moveOf(her, 1, 0.25, 0) as Move;
    expect(m.kind).toBe('huff');
    expect(m.pose.tilt).toBeLessThan(0);
    expect('x' in (m.pose.armF as object)).toBe(true); // an arm in the body frame: folded across
    expect(lifted(her, 0.25)).toBeLessThan(0); // the toe up on the tap
    expect(lifted(her, 0.75)).toBe(0); // down between
    expect(lifted(her, 1.25)).toBe(lifted(her, 0.25)); // once a second
    expect(lifted(him, 0.25)).toBe(0);
    expect(lifted(robbed, 0.25)).toBeLessThan(0);
  });
  it('laugh: the head back 0.15 rad, mirrored by him, bobbing up at 2 Hz and never below the standing line', () => {
    for (const sex of ['f', 'm'] as const) {
      const bobs: number[] = [];
      for (let k = 0; k < 8; k++) {
        const m = moveOf(vis({ st: 'laugh', sex }), 1, k * 0.0625, 0) as Move;
        expect(m.pose.tilt).toBeCloseTo(-0.15, 9);
        bobs.push(m.pose.bob ?? 0);
      }
      expect(Math.max(...bobs)).toBeLessThanOrEqual(0);
      expect(Math.min(...bobs)).toBeGreaterThanOrEqual(-0.016 - 1e-9);
      expect(new Set(bobs.map((b) => b.toFixed(6))).size).toBeGreaterThan(2); // it moves
      expect((moveOf(vis({ st: 'laugh', sex }), 1, 0.5, 0) as Move).pose.bob).toBeCloseTo(0, 9); // one bob per half second
    }
  });
});

describe('04 9.3 rows poop, soaked, trip, snatched (S6): the timelines over the reaction clock', () => {
  it('wipe: the dollop 1 until 3 s then shrinking to 0 at 4 s; with a hat it comes off from 1.4 to 2.95 s and goes back on; without one it never does', () => {
    const hatOff = (el: number, hat = true): boolean => at('wipe', WIPE_T, el, { items: { hat, purse: false, baguette: false, iceCream: false } }).hatOff;
    for (const el of [0, 0.5, 1.0, 1.39]) expect(hatOff(el), 'hat on at ' + el).toBe(false);
    for (const el of [1.4, 1.8, 2.5, 2.9, 2.94]) expect(hatOff(el), 'hat off at ' + el).toBe(true);
    for (const el of [2.96, 3.2, 3.9, 4]) expect(hatOff(el), 'hat back on at ' + el).toBe(false);
    for (let el = 0; el <= 4; el += 0.1) expect(hatOff(el, false), 'no hat at ' + el).toBe(false);
    expect(at('wipe', WIPE_T, 1).splat).toBe(1);
    expect(at('wipe', WIPE_T, 2.99).splat).toBe(1);
    expect(at('wipe', WIPE_T, 3.5).splat).toBeCloseTo(0.5, 9);
    expect(at('wipe', WIPE_T, 4).splat).toBe(0);
    const reach = at('wipe', WIPE_T, 1.6).pose.armB as { y: number };
    expect(reach.y).toBeLessThan(0); // the back hand up at her hair
    expect(at('wipe', WIPE_T, 0).hatHand).toBe(true);
  });
  it('shake: wet, arms out, +-0.25 rad at 6 Hz; the wet look is the clothes 0.3 toward the water', () => {
    let lo = 0, hi = 0;
    for (let k = 0; k < 120; k++) {
      const m = moveOf(vis({ st: 'shake', t: 1.5 }), 1, k / 120, 0) as Move;
      lo = Math.min(lo, m.shake);
      hi = Math.max(hi, m.shake);
      expect(Math.abs(m.shake)).toBeLessThanOrEqual(0.25 + 1e-9);
      expect(m.wet).toBe(true);
    }
    expect(hi).toBeGreaterThan(0.24);
    expect(lo).toBeLessThan(-0.24);
    const a = moveOf(vis({ st: 'shake', t: 1 }), 1, 0.04167, 0) as Move, b = moveOf(vis({ st: 'shake', t: 1 }), 1, 0.04167 + 1 / 6, 0) as Move;
    expect(a.shake).toBeCloseTo(b.shake, 6); // the period is a sixth of a second
    const dry: RigLook = { ...newLook(), top: P.crowdTop[2] as string, low: P.crowdLow[1] as string }, out = newLook();
    const wet = wetLook(dry, P, out);
    expect(wet).toBe(out);
    expect(wet.top).not.toBe(dry.top);
    expect(wet.low).not.toBe(dry.low);
    expect(dry.top).toBe(P.crowdTop[2]); // the dry look is left alone
  });
  it('trip: down by 0.9 s, up by 2.3, standing at 3; a poof from 0.3 to 1.5 s only; never flat and never more than a sit', () => {
    for (let el = 0; el <= 3.0001; el += 0.05) {
      const m = at('stumble', STUMBLE_T, Math.min(el, 3));
      expect(m.pose.crouch ?? 0, 'crouch at ' + el.toFixed(2)).toBeLessThanOrEqual(0.34 + 1e-9);
      expect(Math.abs(m.pose.lean ?? 0), 'lean at ' + el.toFixed(2)).toBeLessThanOrEqual(0.25 + 1e-9);
      if (Math.abs(el - 0.3) < 0.011 || Math.abs(el - 1.5) < 0.011) continue; // the two edges, where a sum of floats may fall either side
      const inPoof = el > 0.3 && el < 1.5;
      expect(m.poof >= 0, 'poof at ' + el.toFixed(2)).toBe(inPoof);
      if (inPoof) expect(m.poof).toBeLessThanOrEqual(1);
    }
    expect(at('stumble', STUMBLE_T, 1.2).pose.crouch).toBeCloseTo(0.34, 9); // sitting on the path
    expect(at('stumble', STUMBLE_T, 3).pose.crouch ?? 0).toBeCloseTo(0, 9); // upright again
    expect(at('stumble', STUMBLE_T, 3).pose.lean ?? 0).toBeLessThan(0.06);
  });
  it('chase: both arms up 1.3 rad, running with the walk phase', () => {
    const a = { ...(moveOf(vis({ st: 'chase', t: 5 }), 1, 0, 0.4) as Move) }, b = { ...(moveOf(vis({ st: 'chase', t: 5 }), 1, 0, 2.2) as Move) }; // moveOf's record is shared
    expect(a.kind).toBe('chase');
    expect((a.pose.armF as { a: number }).a).toBeCloseTo(1.3, 9);
    expect((a.pose.armB as { a: number }).a).toBeCloseTo(1.3, 9);
    expect(a.pose.footF?.x).not.toBe(b.pose.footF?.x); // the legs follow the phase
  });
});

describe('04 7.1 and 9.3: a figure with a move draws through drawVisitor (the rig, the wet clothes, the bare head, the extras)', () => {
  const look = (): RigLook => ({ ...newLook(), arche: 'single', sex: 'f', hairStyle: 'short', hat: 'beret', hatHex: P.crowdTop[3] as string, top: P.crowdTop[0] as string, low: P.crowdLow[0] as string });
  const draw = (v: Visitor, z = 2.4): { rec: ReturnType<typeof recorder>; S: unknown; move: Move | null } => {
    const rec = recorder();
    const o = poseOf(v, 1, 5, opts());
    const S = drawVisitor({ pen: penOf(rec, z), warm: 0 }, { x: 100, y: 200 }, look(), o);
    return { rec, S, move: o.move };
  };
  it('poseOf sets the move from the state; every one of the eight draws a skeleton and paints', () => {
    const cases: Array<[string, Partial<Visitor>]> = [
      ['notice', {}], ['bench', { sitPropId: 4 }], ['huff', { job: { kind: 'parted' } }], ['laugh', {}], ['wipe', { t: 1.5 }], ['shake', { t: 1.5 }],
      ['stumble', { t: 1.9 }], ['chase', { t: 3 }],
    ];
    for (const [st, o] of cases) {
      const { rec, S, move } = draw(vis({ st, ...o }));
      expect(move?.kind, st).toBe(st === 'wipe' ? 'wipe' : st);
      expect(S, st).not.toBeNull();
      expect(rec.total(), st).toBeGreaterThan(20);
    }
    expect(draw(vis({ st: 'idle' })).move).toBeNull();
  });
  it('the hat off paints more than the hat on (the hat in the hand), the shake and the poof paint extras, a speck of a figure paints nothing', () => {
    const on = draw(vis({ st: 'wipe', t: WIPE_T - 1 })).rec.total(), off = draw(vis({ st: 'wipe', t: WIPE_T - 2 })).rec.total();
    expect(off).toBeGreaterThan(on - 1); // the hat is drawn in the hand in place of on the head, plus the dollop on it
    const poof = draw(vis({ st: 'stumble', t: STUMBLE_T - 1 })).rec.total(), after = draw(vis({ st: 'stumble', t: STUMBLE_T - 2.9 })).rec.total();
    expect(poof).toBeGreaterThan(after);
    expect(draw(vis({ st: 'shake', t: 1 })).rec.calls.ellipse).toBeGreaterThan(draw(vis({ st: 'laugh' })).rec.calls.ellipse ?? 0);
    const tiny = draw(vis({ st: 'huff' }), 0.1);
    expect(tiny.S).toBeNull();
    expect(tiny.rec.total()).toBe(0);
    expect(FH * 0.1).toBeLessThan(6);
  });
});
