// tests/avatar-creatures.test.ts
// Locks the creature side of the possessed pigeon and Pompon (07 S7.5, 02 10.4 and 10.5; 03 2.5 creatures.ts, creatures-threats.ts,
// pomeranian.ts; 08 2.3): the states `driven` adds (`wait`, `poop`, `startled`, `flyDrink`, `drink`), the 2-tile startle radius of the
// player's pigeon against the AI pigeon's 3-tile scatter, and the flag that is absent when nobody possesses the animal, so that a park
// without avatars saves and hashes as before. The cascades that give the orders are tests/avatar.test.ts.
import { describe, it, expect, beforeEach } from 'vitest';
import { AVATAR_SIDE, applyNow } from '../src/core/commands.ts';
import { R_SCATTER_DOG, R_STARTLE, STARTLE_GRACE, gatherThreats, inStartleGrace, threatTo } from '../src/entities/creatures-threats.ts';
import { STARTLED_T, creatureById, creatures, creaturesState, spawnDog, spawnPigeonAt, type Creature } from '../src/entities/creatures.ts';
import { getPlayer } from '../src/play/mode.ts';
import { avatarTap } from '../src/play/avatar.ts';
import { adult, run, stay, unlockAll, world, SEC } from './abilities-world.ts';

const enterPigeon = () => applyNow({ side: AVATAR_SIDE.a_pigeon, kind: 'avatar.enter', payload: { avatar: 'a_pigeon' } });

/** A dog that has settled one tile behind its resting owner; returns it. */
function settledDog(): Creature {
  const owner = adult(30, 26);
  stay(owner);
  const dog = spawnDog(owner.id) as Creature;
  run(3 * SEC);
  return dog;
}
const at = (c: Creature, x: number, y: number): void => void Object.assign(c, { x, y, z: 0, tx: x, ty: y });

beforeEach(() => {
  world();
  unlockAll();
});

describe('creatures-threats.ts: the cap on every trigger radius (02 10.4: the player\'s pigeon minds a dog within 2 tiles, the AI\'s scatters at 3)', () => {
  it('threatTo finds a dog at 2.5 tiles without a cap and not with the startle cap; a dog at 1.5 is found by both', () => {
    const dog = settledDog();
    const pigeon = spawnPigeonAt(10, 10) as Creature;
    gatherThreats(creatures);
    at(pigeon, dog.x + R_SCATTER_DOG - 0.5, dog.y);
    expect(threatTo(pigeon)).not.toBeNull();
    expect(threatTo(pigeon, R_STARTLE)).toBeNull();
    at(pigeon, dog.x + R_STARTLE - 0.5, dog.y);
    expect(threatTo(pigeon, R_STARTLE)).not.toBeNull();
    expect(threatTo(pigeon)).not.toBeNull();
    at(pigeon, dog.x + R_SCATTER_DOG + 0.5, dog.y);
    expect(threatTo(pigeon)).toBeNull();
  });
});

function possess(): Creature {
  expect(enterPigeon().ok).toBe(true);
  const p = creatureById(getPlayer()) as Creature;
  expect(p.driven).toBe(true);
  return p;
}

describe('the possessed pigeon on the ground (creatures.ts, 02 10.4)', () => {
  it('a dog at 2.5 tiles does not startle it (the AI pigeon would scatter); at 1.5 it is startled for 2 s, in place, then waits again', () => {
    const dog = settledDog();
    const p = possess();
    at(p, dog.x + 2.5, dog.y);
    Object.assign(p, { st: 'wait', t: 0 });
    run(SEC / 2);
    expect(p.st).toBe('wait'); // 2.5 away: left alone
    at(p, dog.x + 1.5, dog.y);
    Object.assign(p, { st: 'wait', t: 0 });
    run(1);
    expect(p.st).toBe('startled');
    expect(p.t).toBeGreaterThan(STARTLED_T - 0.1);
    expect(Math.hypot(p.x - (dog.x + 1.5), p.y - dog.y)).toBeLessThan(0.5); // it flutters in place: its order is lost, it is not thrown 3 tiles away
    run(Math.ceil((STARTLED_T + 0.5) * SEC));
    expect(['wait', 'startled']).toContain(p.st); // the dog is still near, so it can be startled again; it never scatters
    expect(p.st).not.toBe('scatter');
  });

  it('a dog that stays does not lock it for good (S7 review of 02 10.4 "startled 2 s"): 3 s of peace follow the startle, in which it takes an order and flies off', () => {
    const dog = settledDog();
    const p = possess();
    at(p, dog.x + 1.5, dog.y);
    Object.assign(p, { st: 'wait', t: 0 });
    run(SEC / 2);
    expect(p.st).toBe('startled');
    expect(avatarTap({ x: 10, y: 10 }, { kind: 'tile', id: 0, tile: { x: 10, y: 10 } })).toBe('reason.startled'); // startled: orders refused
    run(Math.ceil((STARTLED_T + 0.1) * SEC));
    expect(p.st).toBe('wait');
    expect(inStartleGrace(p)).toBe(true);
    expect(Math.hypot(p.x - dog.x, p.y - dog.y)).toBeLessThanOrEqual(R_STARTLE); // the dog is still within 2 tiles
    expect(avatarTap({ x: 10, y: 10 }, { kind: 'tile', id: 0, tile: { x: 10, y: 10 } })).toBe('avatar.status.flying');
    run(6 * SEC);
    expect(Math.hypot(p.x - 10, p.y - 10)).toBeLessThan(0.6);
    expect(p.st).toBe('wait'); // landed far from the dog, not startled
  });

  it('left alone beside the dog, the grace runs out after STARTLE_GRACE (3 s) and it is startled again; a bird that was never startled has no grace', () => {
    const dog = settledDog();
    const p = possess();
    at(p, dog.x + 1.5, dog.y);
    Object.assign(p, { st: 'wait', t: 0 });
    expect(inStartleGrace(p)).toBe(false);
    run(SEC / 2);
    expect(p.st).toBe('startled');
    run(Math.ceil((STARTLED_T + 0.1) * SEC)); // 2.6 s in: waiting, 2.5 s of the 3 left
    expect(p.st).toBe('wait');
    expect(p.t).toBeGreaterThan(STARTLE_GRACE - 0.7);
    run(2 * SEC);
    expect(p.st).toBe('wait'); // still in peace
    run(1 * SEC);
    expect(p.st).toBe('startled'); // the grace is over and the dog is still within 2 tiles
    expect(STARTLE_GRACE).toBe(3);
  });

  it('an AI pigeon at 2.5 tiles from the same dog scatters (the contrast)', () => {
    const dog = settledDog();
    const ai = creatures.find((o) => o.kind === 'pigeon') as Creature;
    at(ai, dog.x + 2.5, dog.y);
    Object.assign(ai, { st: 'walk', t: 5 });
    run(1);
    expect(ai.st).toBe('scatter');
  });

  it('the flag and the destination are absent from every creature in a park nobody possesses, and from the pigeon again after leaving', () => {
    expect(creaturesState().some((c) => 'driven' in c || 'dest' in c)).toBe(false);
    const p = possess();
    expect(creaturesState().filter((c) => c.driven).map((c) => c.id)).toEqual([p.id]);
    applyNow({ side: AVATAR_SIDE.a_pigeon, kind: 'avatar.leave', payload: {} });
    expect(creaturesState().some((c) => 'driven' in c || 'dest' in c)).toBe(false);
    run(2 * SEC);
    expect(p.st).not.toBe('wait'); // the AI decides on its next step
  });
});
