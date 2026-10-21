// tests/avatar-florist.test.ts
// Locks 02 10.7 / 07 S7.6 step 5 / 08 2.5 for a_florist (split from tests/avatar.test.ts at the 600-line rule): the bouquet, the flowerbed,
// the bench, the petals, and the florist as a victim.
import { describe, it, expect, beforeEach } from 'vitest';
import { tick } from '../src/core/loop.ts';
import { I, PETALS, props } from '../src/world/grid.ts';
import { avatarTap } from '../src/play/avatar.ts';
import { effects, cooldownLeft } from '../src/play/abilities.ts';
import { land } from '../src/entities/embarrass.ts';
import { pairOf, pairs } from '../src/entities/romance.ts';
import { stateHash } from '../src/save/store.ts';
import { adult, child, pairAt, run, stay, SEC } from './abilities-world.ts';
import { bedTile, enter, events, floristActor, lawn, mp, setupAvatarWorld, tapPerson, tapTile } from './avatar-world.ts';

beforeEach(setupAvatarWorld);

describe('a_florist (02 10.7)', () => {
  it('refusals: an empty basket is reason.basket_empty, an unpaired person reason.not_courting, a child reason.not_children; each changes nothing', () => {
    const { a, b } = pairAt(20, 20, 1);
    b.x = 26;
    const lone = adult(30, 30), c = child(34, 30);
    enter('a_florist');
    const v = floristActor();
    Object.assign(v, { x: 22, y: 26, st: 'idle', t: 0, path: null });
    let h = stateHash();
    expect(tapPerson(lone)).toBe('reason.not_courting');
    expect(tapPerson(c)).toBe('reason.not_children');
    expect(stateHash()).toBe(h);
    v.basket = 0;
    h = stateHash();
    expect(tapPerson(a)).toBe('reason.basket_empty');
    expect(stateHash()).toBe(h);
    v.basket = 3;
    a.st = 'wipe'; // a member in a reaction: c_bouquet's own check says busy
    expect(tapPerson(b)).toBe('reason.busy');
  });
  it('a bouquet: bouquet, a walk to them (hold), basket -1, affinity +0.05, lastCupidAt, the 60 s cooldown of c_bouquet', () => {
    const { p, a, b } = pairAt(20, 20, 2);
    stay(a, b);
    enter('a_florist');
    const v = floristActor();
    Object.assign(v, { x: 20, y: 26, st: 'idle', t: 0, path: null });
    const aff0 = p.affinity;
    expect(p.lastCupidAt).toBe(-1);
    const t0 = tick() + 1;
    expect(tapPerson(a)).toBe('avatar.status.bouquet');
    expect(v.st).toBe('hand');
    expect(tapTile(10, 10)).toBe('reason.busy'); // the hold
    run(10 * SEC);
    expect(events.filter((e) => e.kind === 'bouquet')).toHaveLength(1);
    expect(v.basket).toBe(2);
    expect(p.affinity).toBeGreaterThan(aff0 + 0.045); // +0.05, and the little the minutes of charm conversion add
    expect(p.affinity).toBeLessThan(aff0 + 0.07);
    expect(p.lastCupidAt).toBeGreaterThanOrEqual(0);
    expect(cooldownLeft('cupid', 'c_bouquet', t0 + 10 * SEC)).toBeGreaterThan(40);
    expect(v.st).not.toBe('hand');
    expect(tapPerson(b)).toBe('reason.cooldown');
  });
  it('a flowerbed: pick 4 s and the basket is 3; a bench: sit until the next tap; the lawn: petals as c_petals, 30 s', () => {
    enter('a_florist');
    const v = floristActor();
    Object.assign(v, { x: 22, y: 26, st: 'idle', t: 0, path: null, basket: 0 });
    const bed = bedTile();
    expect(tapTile(bed.x, bed.y)).toBe('avatar.status.picking');
    expect(v.st).toBe('goPick');
    run(40 * SEC);
    expect(v.basket).toBe(3);
    expect(v.st).not.toBe('pick');
    // the bench
    const bench = props.find((q) => q.kind === 'bench');
    expect(bench).toBeDefined();
    if (bench) {
      expect(avatarTap({ x: bench.x, y: bench.y }, { kind: 'prop', id: bench.id, tile: { x: bench.x, y: bench.y } })).toBe('avatar.status.resting');
      run(60 * SEC);
      expect(v.st).toBe('sit'); // not 90 s, not when rested: until she is told otherwise
    }
    // the lawn
    const l = lawn();
    expect(tapTile(l.x, l.y)).toBe('avatar.status.petals');
    expect(v.st).toBe('goScatter');
    expect(effects).toHaveLength(0);
    for (let k = 0; k < 90 && effects.length === 0; k++) run(SEC);
    expect(effects.filter((e) => e.ability === 'c_petals')).toHaveLength(1); // cast at the moment she scatters
    expect(v.st).toBe('scatter');
    expect(PETALS[I(l.x, l.y)] as number).toBeGreaterThan(0.2);
    expect(events.some((e) => e.kind === 'cast' && e.params?.id === 'c_petals')).toBe(true);
    expect(tapTile(l.x + 1, l.y)).toBe('reason.busy'); // the 2 s of scatter are a hold
    run(3 * SEC);
    expect(tapTile(l.x + 1, l.y)).toBe('reason.cooldown'); // c_petals' 30 s, shared
  });
  it('a tile she cannot scatter on (a bench, the water) is a walk; the hold of scatter and pick answers busy', () => {
    enter('a_florist');
    const v = floristActor();
    Object.assign(v, { x: 22, y: 26, st: 'idle', t: 0, path: null });
    expect(tapTile(33, 12)).toBe('avatar.status.walking');
    expect(v.st).toBe('wander');
    v.st = 'scatter';
    expect(tapTile(33, 12)).toBe('reason.busy');
    v.st = 'pick';
    expect(tapTile(33, 12)).toBe('reason.busy');
  });
  it('she can be a victim: a poop lands, the pigeon\'s victim reacts under avatarDecide; never a Pair member', () => {
    enter('a_florist');
    const v = floristActor();
    Object.assign(v, { x: 22, y: 26, st: 'idle', t: 0, path: null });
    const mp0 = mp();
    expect(land('poop', v.id, 'mischief').ok).toBe(true);
    run(2 * SEC);
    expect(v.st).toBe('wipe'); // the possessed actor reacted: the decide cadence ran avatarDecide, which took rung 1
    expect(pairOf(v)).toBeUndefined();
    expect(pairs.some((q) => q.a === v.id || q.b === v.id)).toBe(false);
    expect(mp()).toBe(mp0); // no pair: no point, and none against herself
  });
});
