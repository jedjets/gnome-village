// tests/abilities.test.ts
// Locks register 3.8 (the 19 abilities), 02 9.1-9.3 (common rules and the eight timelines of tier 0 and 1), 03 5.3-5.4 (side, mode and
// refusal keys), 03 6.5 and 08 2.5 abilities.test.ts rows, 07 S6.7 item 2 and S6.8: each of the eight ids succeeds once through a command,
// then answers reason.cooldown until its cooldown has elapsed in sim seconds (the same 60 ticks a second at 1x and at 8x); a child, lawn
// for a peel, an unpaired bouquet, a locked id and the eleven S10 ids are refused and spend nothing. The eight timelines of 02 9.2-9.3 are in
// tests/abilities-timelines.test.ts (split at the 600-line rule; the shared scenes are in tests/abilities-world.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { SIM_DT, setSpeed, simulate, tick } from '../src/core/loop.ts';
import { T, STEPS_PER_DAY } from '../src/core/clock.ts';
import { enqueue, type AbilityId, type Target } from '../src/core/commands.ts';
import { rngN } from '../src/core/rng.ts';
import { props } from '../src/world/grid.ts';
import { setMode } from '../src/play/mode.ts';
import { ABILITIES, abilityById, canCast, cast, chargesLeft, commandTick, cooldownLeft, effects, resetCharges, setAbilitiesState, sidesState } from '../src/play/abilities.ts';
import { setProgress, unlockOf } from '../src/play/progression.ts';
import { removeVisitor, visitors } from '../src/entities/visitor.ts';
import { en } from '../src/ui/strings/en.ts';

import { SEC, world, unlockAll, run, adult, child, pairAt, tileT, sideOf, reasonOf, outcomes } from './abilities-world.ts';

beforeEach(world);

/* ---------- the registry ---------- */

describe('the 19 abilities with the register\'s columns (register 3.8; 06 11.1)', () => {
  const ROWS: Array<[AbilityId, string, number, number, number | null, string]> = [
    ['c_petals', 'cupid', 0, 30, null, 'area'], ['c_bouquet', 'cupid', 0, 60, null, 'pair'], ['c_musician', 'cupid', 1, 120, null, 'tile'],
    ['c_sunbeam', 'cupid', 1, 90, null, 'area'], ['c_umbrella', 'cupid', 2, 90, null, 'pair'], ['c_lamplight', 'cupid', 2, 60, null, 'tile'],
    ['c_picnic', 'cupid', 3, 180, null, 'tile'], ['c_rowboat', 'cupid', 3, 240, null, 'tile'], ['c_fireworks', 'cupid', 4, 360, 1, 'park'],
    ['m_pigeon', 'mischief', 0, 25, null, 'visitor'], ['m_sprinkler', 'mischief', 0, 45, null, 'tile'], ['m_peel', 'mischief', 1, 40, null, 'tile'],
    ['m_pomeranian', 'mischief', 1, 60, null, 'visitor'], ['m_wasp', 'mischief', 2, 60, null, 'pair'], ['m_raincloud', 'mischief', 2, 90, null, 'area'],
    ['m_rival', 'mischief', 3, 150, null, 'pair'], ['m_mime', 'mischief', 3, 120, null, 'tile'], ['m_fog', 'mischief', 4, 240, null, 'park'],
    ['m_flock', 'mischief', 4, 180, 1, 'area'],
  ];
  it('ids, sides, tiers, cooldowns, charges and target types equal the register, in its order', () => {
    expect(ABILITIES.map((a) => [a.id, a.side, a.tier, a.cooldown, a.charges, a.target])).toEqual(ROWS);
    expect(ABILITIES.filter((a) => a.id.startsWith('c_'))).toHaveLength(9);
    expect(ABILITIES.filter((a) => a.id.startsWith('m_'))).toHaveLength(10);
    expect(ABILITIES.filter((a) => a.charges !== null).map((a) => a.id)).toEqual(['c_fireworks', 'm_flock']);
  });
  it('the area squares are 3x3, 7x7, 5x5 and 7x7, and each tier agrees with the unlock table of 02 7.4', () => {
    expect(ABILITIES.filter((a) => a.area > 0).map((a) => [a.id, 2 * a.area + 1])).toEqual([['c_petals', 3], ['c_sunbeam', 7], ['m_raincloud', 5], ['m_flock', 7]]);
    for (const a of ABILITIES) expect(unlockOf(a.id), a.id).toEqual({ side: a.side, tier: a.tier });
  });
  it('every ability has its name and hint in the English table', () => {
    for (const a of ABILITIES) {
      expect(en[a.nameKey], a.id).toBeTruthy();
      expect(en[a.hintKey], a.id).toBeTruthy();
    }
    expect(abilityById('m_peel')?.nameKey).toBe('ability.m_peel.name');
  });
});

/* ---------- the common rules ---------- */

/** A scene in which `id` can be cast, and its target. */
function scene(id: AbilityId): Target {
  switch (id) {
    case 'c_petals':
      return tileT(6, 12);
    case 'c_bouquet':
      return { kind: 'pair', id: pairAt(10, 20).p.id };
    case 'c_musician':
      return tileT(24, 40);
    case 'c_sunbeam':
      return tileT(24, 8);
    case 'm_pigeon':
    case 'm_pomeranian': {
      const v = adult(40, 30);
      v.items.hat = true;
      return { kind: 'visitor', id: v.id };
    }
    case 'm_sprinkler':
      return tileT(5, 30);
    case 'm_peel':
      return tileT(17, 24);
    default:
      throw new Error('no scene for ' + id);
  }
}
const EIGHT: AbilityId[] = ['c_petals', 'c_bouquet', 'c_musician', 'c_sunbeam', 'm_pigeon', 'm_sprinkler', 'm_peel', 'm_pomeranian'];
/** The abilities whose second cast, once the cooldown is over, is allowed again in the scene (the others may meet their own rules: a busker playing, Pompon waiting). */
const AGAIN: AbilityId[] = ['c_petals', 'c_sunbeam', 'm_pigeon', 'm_sprinkler'];

describe('each of the eight succeeds once, then reason.cooldown until the cooldown has elapsed in sim seconds (07 S6.7 item 2; 02 9.1 item 4)', () => {
  for (const speed of [1, 8]) {
    for (const id of EIGHT) {
      it(`${id} at ${speed}x: ok, cooldown for ${abilityById(id)?.cooldown} s of 60 ticks, then not a cooldown`, () => {
        unlockAll();
        setSpeed(speed);
        const target = scene(id);
        const got = outcomes();
        enqueue({ side: sideOf(id), kind: 'ability', payload: { id, target } });
        simulate(SIM_DT, speed === 8 ? 3 : 1); // lite 3 at 8x, the dial's own: it changes no value (03 4.5)
        expect(got).toEqual(['ok']);
        const cd = (abilityById(id)?.cooldown ?? 0) * SEC;
        const applied = tick(); // the command's tick: the cooldown counts from it
        run(1);
        enqueue({ side: sideOf(id), kind: 'ability', payload: { id, target } });
        simulate(SIM_DT, 1);
        expect(got.at(-1)).toBe('reason.cooldown'); // at once
        expect(cooldownLeft(sideOf(id), id, tick() + 1)).toBeCloseTo((applied + cd - (tick() + 1)) / SEC, 6);
        run(applied + cd - 2 - tick());
        enqueue({ side: sideOf(id), kind: 'ability', payload: { id, target } }); // applies at applied + cd - 1: the last tick of the cooldown
        simulate(SIM_DT, 1);
        expect(got.at(-1)).toBe('reason.cooldown');
        expect(tick()).toBe(applied + cd - 1);
        enqueue({ side: sideOf(id), kind: 'ability', payload: { id, target } }); // applies at applied + cd: ready
        const n0 = got.length;
        simulate(SIM_DT, 1);
        expect(got.length).toBe(n0 + 1);
        if (AGAIN.includes(id)) expect(got.at(-1)).toBe('ok');
        else expect(got.at(-1)).not.toBe('reason.cooldown');
      });
    }
  }
});

describe('refusals spend nothing (02 9.1 items 3 and 5; 03 5.4: "do not spend a cooldown or a charge before validation passes")', () => {
  function untouched(side: 'cupid' | 'mischief', id: AbilityId, target: Target, why: string): void {
    const before = JSON.stringify(sidesState()), n = effects.length, draws = rngN(), vs = visitors.length, ps = props.length;
    const r = canCast(side, id, target);
    expect(reasonOf(r), id).toBe(why);
    expect(reasonOf(cast(side, id, target)), id).toBe(why);
    expect(JSON.stringify(sidesState())).toBe(before);
    expect([effects.length, rngN(), visitors.length, props.length]).toEqual([n, draws, vs, ps]);
  }
  it('m_pigeon on a child: reason.not_children, nothing spent', () => {
    unlockAll();
    const c = child(20, 20);
    untouched('mischief', 'm_pigeon', { kind: 'visitor', id: c.id }, 'reason.not_children');
  });
  it('every ability answers a child under the tap with reason.not_children before anything else (02 9.1 item 5)', () => {
    unlockAll();
    const c = child(20, 20);
    for (const a of ABILITIES) {
      if (a.target === 'park') continue; // nobody is tapped
      expect(reasonOf(canCast(a.side, a.id, { kind: 'visitor', id: c.id })), a.id).toBe('reason.not_children');
    }
  });
  it('m_peel on lawn: reason.not_here; on a path it is castable', () => {
    unlockAll();
    untouched('mischief', 'm_peel', tileT(5, 5), 'reason.not_here');
    expect(canCast('mischief', 'm_peel', tileT(17, 24)).ok).toBe(true);
  });
  it('c_bouquet on an unpaired visitor: reason.not_courting; on a pair that is gone too', () => {
    const v = adult(20, 20);
    untouched('cupid', 'c_bouquet', { kind: 'visitor', id: v.id }, 'reason.not_courting');
    untouched('cupid', 'c_bouquet', { kind: 'pair', id: 99 }, 'reason.not_courting');
  });
  it('a locked id: reason.locked on a fresh profile, for the T1 abilities of both sides', () => {
    const v = adult(20, 20);
    v.items.hat = true;
    untouched('cupid', 'c_musician', tileT(24, 40), 'reason.locked');
    untouched('cupid', 'c_sunbeam', tileT(24, 8), 'reason.locked');
    untouched('mischief', 'm_peel', tileT(17, 24), 'reason.locked');
    untouched('mischief', 'm_pomeranian', { kind: 'visitor', id: v.id }, 'reason.locked');
    expect(canCast('cupid', 'c_petals', tileT(5, 5)).ok).toBe(true); // tier 0 is open from the start
    setProgress({ cp: 8, mp: 0 });
    expect(canCast('cupid', 'c_musician', tileT(24, 40)).ok).toBe(true);
    expect(reasonOf(canCast('mischief', 'm_peel', tileT(17, 24)))).toBe('reason.locked'); // the ladders are apart
  });
  it('the eleven ids of S10 answer reason.not_here once unlocked, and reason.locked before (the lock says when it opens)', () => {
    const S10 = ABILITIES.filter((a) => !EIGHT.includes(a.id));
    expect(S10).toHaveLength(11);
    for (const a of S10.filter((x) => x.tier > 0)) expect(reasonOf(canCast(a.side, a.id, { kind: 'park' })), a.id).toBe('reason.locked');
    unlockAll();
    for (const a of S10) untouched(a.side, a.id, { kind: 'park' }, 'reason.not_here');
  });
  it('an unknown id and the wrong side are refused', () => {
    unlockAll();
    expect(reasonOf(canCast('mischief', 'c_petals', tileT(5, 5)))).toBe('reason.wrong_side');
    expect(reasonOf(canCast('cupid', 'x_nothing' as AbilityId, tileT(5, 5)))).toBe('reason.not_here');
    const got = outcomes();
    enqueue({ side: 'mischief', kind: 'ability', payload: { id: 'c_petals', target: tileT(5, 5) } });
    enqueue({ side: 'cupid', kind: 'ability', payload: { id: 7 as unknown as AbilityId, target: tileT(5, 5) } });
    run(1);
    expect(got).toEqual(['reason.not_here', 'reason.wrong_side']); // cupid's command runs first (tick, side, seq)
  });
  it('a target outside the park is reason.outside; a target of the wrong kind is reason.not_here', () => {
    expect(reasonOf(canCast('cupid', 'c_petals', tileT(-3, 5)))).toBe('reason.outside');
    expect(reasonOf(canCast('cupid', 'c_petals', { kind: 'park' }))).toBe('reason.not_here');
    expect(reasonOf(canCast('mischief', 'm_pigeon', tileT(5, 5)))).toBe('reason.not_here');
    expect(reasonOf(canCast('mischief', 'm_pigeon', { kind: 'visitor', id: 4040 }))).toBe('reason.not_here');
  });
  it('a command with no target (or a target that is not an object) is rejected reason.not_here inside apply, never thrown, and spends nothing (02 9.1 item 3)', () => {
    unlockAll();
    const got = outcomes();
    const bad = (side: 'cupid' | 'mischief', id: AbilityId, target?: unknown): void => {
      enqueue({ side, kind: 'ability', payload: { id, ...(target === undefined ? {} : { target }) } as unknown as { id: AbilityId; target: Target } });
    };
    bad('cupid', 'c_petals'); // no target key at all
    bad('cupid', 'c_sunbeam', null);
    bad('mischief', 'm_peel', 'tile');
    bad('mischief', 'm_pigeon', 7);
    const before = JSON.stringify(sidesState()), n = effects.length, draws = rngN();
    expect(() => run(1)).not.toThrow();
    expect(got).toEqual(['reason.not_here', 'reason.not_here', 'reason.not_here', 'reason.not_here']);
    expect(JSON.stringify(sidesState())).toBe(before);
    expect([effects.length, rngN()]).toEqual([n, draws]);
  });
  it('in avatar mode every ability command is rejected reason.not_in_avatar (03 5.3)', () => {
    const got = outcomes();
    setMode('avatar', 'a_pigeon', 1);
    enqueue({ side: 'cupid', kind: 'ability', payload: { id: 'c_petals', target: tileT(5, 5) } });
    run(1);
    expect(got).toEqual(['reason.not_in_avatar']);
    expect(effects).toHaveLength(0);
  });
  it('the 65th effect is reason.too_many_effects, and a finished effect makes room', () => {
    const dummy = (i: number) => ({ id: 900 + i, ability: 'c_sunbeam' as AbilityId, side: 'cupid' as const, x: 1, y: 1, r: 0, startTick: 0, until: 1e9, phase: 0, pairId: 0, targetId: 0, actorId: 0, propId: 0, overrideId: 0, data: {} });
    setAbilitiesState(Array.from({ length: 64 }, (_, i) => dummy(i)), undefined);
    untouched('cupid', 'c_petals', tileT(5, 5), 'reason.too_many_effects');
    setAbilitiesState(Array.from({ length: 63 }, (_, i) => dummy(i)), undefined);
    expect(canCast('cupid', 'c_petals', tileT(5, 5)).ok).toBe(true);
  });
  it('validation happens again inside apply: a target that left between enqueue and apply is rejected and spends nothing', () => {
    unlockAll();
    const v = adult(20, 20);
    const got = outcomes();
    enqueue({ side: 'mischief', kind: 'ability', payload: { id: 'm_pigeon', target: { kind: 'visitor', id: v.id } } });
    removeVisitor(v.id); // gone before the step applies it
    const before = JSON.stringify(sidesState());
    run(1);
    expect(got).toEqual(['reason.not_here']);
    expect(JSON.stringify(sidesState())).toBe(before);
  });
});

describe('charges reset at f 0 (02 9.1 item 4)', () => {
  it('a limited ability spends a charge and the new day gives it back; one without charges has Infinity', () => {
    expect(chargesLeft('cupid', 'c_fireworks')).toBe(1);
    expect(chargesLeft('cupid', 'c_petals')).toBe(Infinity);
    setAbilitiesState([], { cooldowns: { park: {}, cupid: {}, mischief: {} }, charges: { park: {}, cupid: { c_fireworks: 0 }, mischief: {} } });
    expect(chargesLeft('cupid', 'c_fireworks')).toBe(0);
    resetCharges();
    expect(chargesLeft('cupid', 'c_fireworks')).toBe(1);
  });
  it('the day reset of a step (03 4.2 phase 5) restores the charges', () => {
    setAbilitiesState([], { cooldowns: { park: {}, cupid: {}, mischief: {} }, charges: { park: {}, cupid: {}, mischief: { m_flock: 0 } } });
    run(STEPS_PER_DAY - Math.round((T.abs - 0.3) * STEPS_PER_DAY) + 2); // across the first f = 0
    expect(T.day).toBe(2);
    expect(chargesLeft('mischief', 'm_flock')).toBe(1);
  });
});

describe('Cupid casts stamp lastCupidAt within 6 tiles of the target or on the targeted pair (02 9.1 item 7)', () => {
  it('a pair 5 tiles from a c_petals centre is stamped, one at 7 tiles is not', () => {
    const near = pairAt(10, 20), far = pairAt(10, 29);
    expect(near.p.lastCupidAt).toBe(-1);
    expect(cast('cupid', 'c_petals', tileT(15, 20), commandTick()).ok).toBe(true);
    expect(near.p.lastCupidAt).toBe(T.abs);
    expect(far.p.lastCupidAt).toBe(-1); // 10 tiles away
    const edge = pairAt(10, 27);
    expect(cast('cupid', 'c_sunbeam', tileT(10, 20), commandTick()).ok).toBe(false); // locked: nothing is stamped by a refusal
    expect(edge.p.lastCupidAt).toBe(-1);
  });
  it('c_bouquet stamps its own pair; a Mischief cast stamps nobody', () => {
    unlockAll();
    const { p, a } = pairAt(30, 30);
    cast('mischief', 'm_sprinkler', tileT(31, 31), commandTick());
    expect(p.lastCupidAt).toBe(-1);
    expect(cast('cupid', 'c_bouquet', { kind: 'visitor', id: a.id }, commandTick()).ok).toBe(true);
    expect(p.lastCupidAt).toBe(T.abs);
  });
});

/* ---------- the timelines ---------- */

