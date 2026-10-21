// tests/avatar-pomeranian.test.ts
// Locks 02 10.5 / 07 S7.6 step 4 / 08 2.5 for a_pomeranian (split from tests/avatar.test.ts at the 600-line rule): the snatch and its refusals,
// pigeons, children, water and the lawn.
import { describe, it, expect, beforeEach } from 'vitest';
import { tick } from '../src/core/loop.ts';
import { avatarTap } from '../src/play/avatar.ts';
import { cooldownLeft } from '../src/play/abilities.ts';
import { creatures, spawnDog, type Creature } from '../src/entities/creatures.ts';
import { pompon } from '../src/entities/pomeranian.ts';
import { stateHash } from '../src/save/store.ts';
import { adult, child, pairAt, run, stay, SEC } from './abilities-world.ts';
import { enter, events, gravel, lawn, mp, setupAvatarWorld, tapPerson, tapTile } from './avatar-world.ts';

beforeEach(setupAvatarWorld);

describe('a_pomeranian (02 10.5)', () => {
  it('a hatless, bagless adult is reason.no_item; a walker\'s dog within 3 is reason.big_dog; three today reason.enough_today', () => {
    const a = adult(20, 20), b = adult(30, 30);
    enter('a_pomeranian');
    const h = stateHash();
    expect(tapPerson(a)).toBe('reason.no_item');
    Object.assign(a.items, { hat: true });
    Object.assign(b.items, { purse: true });
    const owner = adult(31, 30);
    expect(spawnDog(owner.id)).not.toBeNull();
    expect(tapPerson(b)).toBe('reason.big_dog');
    a.embToday = 3;
    expect(tapPerson(a)).toBe('reason.enough_today');
    expect(stateHash()).not.toBe(h); // (the items, the dog and the count were set up above, the refusals added nothing to it)
    const h2 = stateHash();
    expect(tapPerson(a)).toBe('reason.enough_today');
    expect(stateHash()).toBe(h2);
  });
  it('a snatch: snatching, the same run as m_pomeranian, +1 MP on a paired victim, the item comes back at the gate; panting for 60 s', () => {
    const { a, b } = pairAt(24, 24, 1);
    b.x = 30;
    stay(a, b);
    a.items = { hat: true, purse: false, baguette: false, iceCream: false };
    enter('a_pomeranian');
    const c = pompon() as Creature;
    run(8 * SEC);
    expect(c.st).toBe('wait');
    const mp0 = mp();
    const t0 = tick() + 1;
    expect(tapPerson(a)).toBe('avatar.status.snatching');
    expect(cooldownLeft('mischief', 'm_pomeranian', t0)).toBeCloseTo(60, 6);
    expect(c.st).toBe('snatch');
    expect(tapPerson(b)).toBe('reason.busy'); // a hold state
    run(25 * SEC);
    expect(events.some((e) => e.kind === 'snatch' && e.params?.item === 'hat')).toBe(true);
    expect(mp()).toBe(mp0 + 1);
    for (let k = 0; k < 60 && c.st !== 'wait'; k++) run(SEC);
    expect(a.items.hat).toBe(true); // dropped at the gate and the victim has it back
    expect(c.driven).toBe(true);
    expect(c.outside).toBe(false); // he stays in the park: shakeOff 1 s, then wait
    expect(c.st).toBe('wait');
    Object.assign(b.items, { hat: true });
    expect(tapPerson(b)).toBe('avatar.status.panting'); // within the 60 s of the m_pomeranian cooldown
  });
  it('pigeons: chase; a child: play, the child chases; water: paddle then shakeOff; the lawn: dig; any tile: walk', () => {
    enter('a_pomeranian');
    const c = pompon() as Creature;
    Object.assign(c, { x: 20, y: 20, st: 'wait', outside: false });
    const pg = creatures.find((o) => o.kind === 'pigeon') as Creature;
    Object.assign(pg, { x: 24, y: 20, st: 'peck', t: 9, z: 0 });
    expect(avatarTap({ x: 24, y: 20 }, { kind: 'creature', id: pg.id, tile: { x: 24, y: 20 } })).toBe('avatar.status.chasing');
    expect(c.st).toBe('chase');
    run(4 * SEC);
    expect(c.st).toBe('wait');
    expect(pg.st).toBe('scatter'); // he came within 3 (creatures.ts threats)
    const k = child(18, 20);
    Object.assign(c, { x: 20, y: 20 });
    expect(tapPerson(k)).toBe('avatar.status.playing');
    expect(c.st).toBe('play');
    expect(k.st).toBe('play');
    expect(k.job.creatureId).toBe(c.id);
    run(9 * SEC);
    expect(c.st).toBe('wait');
    expect(tapTile(33, 12)).toBe('avatar.status.paddling');
    run(25 * SEC);
    expect(['paddle', 'shakeOff', 'wait']).toContain(c.st);
    run(8 * SEC);
    expect(c.st).toBe('wait');
    const l = lawn();
    expect(tapTile(l.x, l.y)).toBe('avatar.status.digging');
    for (let k = 0; k < 90 && c.st !== 'dig'; k++) run(SEC);
    expect(c.st).toBe('dig');
    run(4 * SEC);
    expect(c.st).toBe('wait');
    expect(Math.hypot(c.x - l.x, c.y - l.y)).toBeLessThan(0.5);
    const g = gravel();
    expect(tapTile(g.x, g.y)).toBe('avatar.status.walking'); // a path tile: run there
    expect(c.st).toBe('walk');
  });
});
