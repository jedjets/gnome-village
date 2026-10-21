// tests/avatar-pigeon.test.ts
// Locks 02 10.4 / 07 S7.6 step 3 / 08 2.5 for a_pigeon (split from tests/avatar.test.ts at the 600-line rule): the swoop and its +1 MP, the
// shared 25 s cooldown, the refusals, crumbs, perches and water.
import { describe, it, expect, beforeEach } from 'vitest';
import { tick } from '../src/core/loop.ts';
import { props } from '../src/world/grid.ts';
import { avatarTap } from '../src/play/avatar.ts';
import { cooldownLeft } from '../src/play/abilities.ts';
import { dropCrumbs, spawnDog } from '../src/entities/creatures.ts';
import { stateHash } from '../src/save/store.ts';
import { adult, child, pairAt, run, stay, SEC } from './abilities-world.ts';
import { enter, events, mp, pigeonActor, setupAvatarWorld, tapPerson, tapTile } from './avatar-world.ts';

beforeEach(setupAvatarWorld);

describe('a_pigeon (02 10.4)', () => {
  it('a tap on an adult returns avatar.status.swooping and the poop lands with +1 MP when the victim is paired', () => {
    const { p, a, b } = pairAt(20, 20, 1);
    b.x = 26; // 6 tiles apart: no backfire is possible (4)
    stay(a, b);
    enter('a_pigeon');
    const mp0 = mp();
    expect(tapPerson(a)).toBe('avatar.status.swooping');
    expect(pigeonActor().st).toBe('swoop');
    run(5 * SEC);
    const emb = events.filter((e) => e.kind === 'embarrassed');
    expect(emb).toHaveLength(1);
    expect(emb[0]?.params).toMatchObject({ kind: 'poop', source: 'mischief', score: 1 });
    expect(mp()).toBe(mp0 + 1);
    expect(a.embToday).toBe(1);
    expect(p.affinity).toBeLessThan(0.4); // the cost of 02 6.4 came off
    // the player's pigeon stays where it landed: poop, then startled, then wait
    expect(['poop', 'startled', 'wait']).toContain(pigeonActor().st);
    run(3 * SEC);
    expect(pigeonActor().st).toBe('wait');
    expect(pigeonActor().z).toBeLessThan(0.1);
  });
  it('a lone adult costs nothing but still gets the poop; the points are the paired victim\'s only (02 7.2)', () => {
    const a = adult(20, 20);
    stay(a);
    enter('a_pigeon');
    const mp0 = mp();
    expect(tapPerson(a)).toBe('avatar.status.swooping');
    run(5 * SEC);
    expect(a.embToday).toBe(1);
    expect(mp()).toBe(mp0);
  });
  it('the 25 s cooldown of m_pigeon is shared: ruffled until it ends, and the cooldown is the ability\'s', () => {
    const a = adult(20, 20), b = adult(22, 20);
    stay(a, b);
    enter('a_pigeon');
    const t0 = tick() + 1;
    expect(tapPerson(a)).toBe('avatar.status.swooping');
    expect(cooldownLeft('mischief', 'm_pigeon', t0)).toBeCloseTo(25, 6);
    run(6 * SEC);
    expect(pigeonActor().st).toBe('wait');
    const h = stateHash();
    expect(tapPerson(b)).toBe('avatar.status.ruffled');
    expect(stateHash()).toBe(h); // nothing was ordered
    run(20 * SEC);
    expect(tapPerson(b)).toBe('avatar.status.swooping');
  });
  it('refusals: a child, three embarrassments today, a dog within 2 tiles; each changes nothing', () => {
    const c = child(20, 20), a = adult(24, 20), b = adult(14, 14);
    enter('a_pigeon');
    const p = pigeonActor();
    Object.assign(p, { x: 20, y: 24, z: 0, st: 'wait', t: 0 }); // t 0: waiting, with no startle's peace left (creatures-threats.ts inStartleGrace)
    let h = stateHash();
    expect(tapPerson(c)).toBe('reason.not_children');
    expect(stateHash()).toBe(h);
    a.embToday = 3;
    h = stateHash();
    expect(tapPerson(a)).toBe('reason.enough_today');
    expect(stateHash()).toBe(h);
    const owner = adult(20, 25);
    expect(spawnDog(owner.id)).not.toBeNull();
    h = stateHash();
    expect(tapPerson(b)).toBe('reason.startled'); // the walker\'s dog is a tile from the pigeon
    expect(tapTile(10, 10)).toBe('reason.startled');
    expect(stateHash()).toBe(h);
  });
  it('crumbs: peck; a lamp or bench: perch; a water tile: drink 3 s at its edge; any tile: fly', () => {
    enter('a_pigeon');
    const p = pigeonActor();
    Object.assign(p, { x: 20, y: 20, z: 0, st: 'wait', perchPropId: 0 });
    const crumbs = props.find((q) => q.kind === 'crumbs');
    expect(crumbs).toBeUndefined();
    const lamp = props.find((q) => q.kind === 'lamp');
    expect(lamp).toBeDefined();
    if (!lamp) return;
    expect(avatarTap({ x: lamp.x, y: lamp.y }, { kind: 'prop', id: lamp.id, tile: { x: lamp.x, y: lamp.y } })).toBe('avatar.status.perching');
    run(6 * SEC);
    expect(p.st).toBe('perch');
    expect(p.perchPropId).toBe(lamp.id);
    run(40 * SEC);
    expect(p.st).toBe('perch'); // until the next tap, not for 8-20 s
    expect(tapTile(33, 12)).toBe('avatar.status.drinking'); // the pond
    expect(p.st).toBe('flyDrink');
    for (let k = 0; k < 600 && p.st === 'flyDrink'; k++) run(1);
    expect(p.st).toBe('drink');
    run(2 * SEC);
    expect(p.st).toBe('drink');
    run(2 * SEC);
    expect(p.st).toBe('wait');
    expect(tapTile(20, 30)).toBe('avatar.status.flying');
    run(6 * SEC);
    expect(p.st).toBe('wait');
    expect(Math.hypot(p.x - 20, p.y - 30)).toBeLessThan(0.6);
    // crumbs dropped for it are pecked once, for 4 s
    const owner = adult(26, 20);
    stay(owner);
    dropCrumbs(24, 22, owner.id);
    const cr = props.find((q) => q.kind === 'crumbs');
    expect(cr).toBeDefined();
    if (!cr) return;
    cr.data.stock = 2;
    expect(avatarTap({ x: 24, y: 22 }, { kind: 'prop', id: cr.id, tile: { x: 24, y: 22 } })).toBe('avatar.status.pecking');
    run(3 * SEC);
    expect(p.st).toBe('peck');
    run(3 * SEC);
    expect(p.st).toBe('wait'); // one peck, not the whole handful
    expect(cr.data.stock).toBe(1);
  });
});
