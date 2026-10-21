// tests/avatar-edges.test.ts
// Locks three edges of the avatar cascades found in the S7 review (07 S7.6 steps 2 and 4, 02 10.4 step 4 and 5, 10.5, 03 5.3):
// a tap on water far from any shore sends the pigeon to the nearest shore, never onto the water (where creatures.ts could not lift it off
// again), and a tap on blocked ground with no open tile near is reason.not_here; Pompon can be possessed again at once after the player let
// go (the AI is walking him home), and only an errand of m_pomeranian is reason.busy.
import { describe, it, expect, beforeEach } from 'vitest';
import { AVATAR_SIDE, applyNow } from '../src/core/commands.ts';
import { clearListeners } from '../src/core/events.ts';
import { BLOCK, I, KIND, Kind, WATER, markBlockDirty } from '../src/world/grid.ts';
import { getAvatar, getPlayer } from '../src/play/mode.ts';
import { avatarTap } from '../src/play/avatar.ts';
import { isWaterTile, waterEdge } from '../src/play/avatar-pick.ts';
import { creatureById, thePomeranian, type Creature } from '../src/entities/creatures.ts';
import { stateHash } from '../src/save/store.ts';
import { run, unlockAll, world, SEC } from './abilities-world.ts';

type AvatarId = 'a_pigeon' | 'a_pomeranian' | 'a_florist';
const enter = (id: AvatarId) => applyNow({ side: AVATAR_SIDE[id], kind: 'avatar.enter', payload: { avatar: id } });
const leave = () => applyNow({ side: AVATAR_SIDE[getAvatar() ?? 'a_pigeon'], kind: 'avatar.leave', payload: {} });
const tap = (x: number, y: number) => avatarTap({ x, y }, { kind: 'tile', id: 0, tile: { x, y } });
const actor = (): Creature => creatureById(getPlayer()) as Creature;
const isOpen = (x: number, y: number): boolean => BLOCK[I(Math.round(x), Math.round(y))] === 0;

/** A w x h block of `kind` (a test fixture, not a tool); water gets its depth, every other kind clears it. */
function block(x0: number, y0: number, w: number, h: number, kind: Kind): void {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      KIND[I(x, y)] = kind;
      WATER[I(x, y)] = kind === Kind.pond ? 0.6 : 0;
    }
  markBlockDirty();
}

beforeEach(() => {
  clearListeners();
  world();
  unlockAll();
});

describe('02 10.4 step 4 and 5 (S7 review): the possessed pigeon never lands on water or a blocked tile', () => {
  it('a tap in the middle of a 12 x 12 pond, far from every shore: it flies to the nearest shore and drinks there, and is free again after the player lets go', () => {
    block(28, 28, 12, 12, Kind.pond);
    expect(enter('a_pigeon').ok).toBe(true);
    const p = actor();
    Object.assign(p, { x: 20, y: 20, z: 0, tx: 20, ty: 20, st: 'wait' });
    expect(isWaterTile(33, 33)).toBe(true);
    const edge = waterEdge(33, 33);
    expect(edge, 'a shore exists however far the tapped tile is from it').not.toBeNull();
    expect(Math.hypot((edge?.x ?? 0) - 33, (edge?.y ?? 0) - 33)).toBeGreaterThan(4); // beyond the 4 tiles the search used to cover
    expect(isOpen(edge?.x ?? 0, edge?.y ?? 0)).toBe(true);
    expect(tap(33, 33)).toBe('avatar.status.drinking');
    for (let k = 0; k < 30 && p.st === 'flyDrink'; k++) run(SEC);
    expect(p.st).toBe('drink');
    expect(isOpen(p.x, p.y), 'it stands on open ground').toBe(true);
    expect(isWaterTile(Math.round(p.x), Math.round(p.y))).toBe(false);
    run(4 * SEC);
    expect(p.st).toBe('wait');
    expect(leave().ok).toBe(true);
    run(60 * SEC);
    expect(p.driven).toBeUndefined();
    expect(isOpen(p.x, p.y), 'the AI moves it on from an open tile').toBe(true);
    expect(p.st).not.toBe('wait');
  });

  it('a tap on blocked ground with no open tile within 12 tiles each way is reason.not_here and changes nothing; closer, it lands on the nearest open tile', () => {
    block(6, 6, 36, 36, Kind.bed);
    expect(enter('a_pigeon').ok).toBe(true);
    const p = actor();
    Object.assign(p, { x: 3, y: 3, z: 0, tx: 3, ty: 3, st: 'wait' });
    const h = stateHash();
    expect(tap(24, 28)).toBe('reason.not_here'); // 13 tiles from the edge of the bed and 16 from the one bridge tile left open
    expect(stateHash()).toBe(h);
    expect(tap(10, 24)).toBe('avatar.status.flying'); // 4 tiles from open ground
    run(8 * SEC);
    expect(isOpen(p.x, p.y)).toBe(true);
    expect(Math.hypot(p.x - 5, p.y - 24)).toBeLessThan(2);
  });
});

describe('03 5.3 and 02 10.5 (S7 review): Pompon can be possessed again at once; only an errand of m_pomeranian is busy', () => {
  it('after the player lets him go in the park (the AI walks him home), the next avatar.enter takes him where he stands, driven, waiting, for the same player', () => {
    expect(enter('a_pomeranian').ok).toBe(true);
    const c = actor();
    expect(c.kind).toBe('pomeranian');
    run(8 * SEC); // in through the gate
    expect(tap(20, 30)).toBe('avatar.status.walking');
    run(2 * SEC);
    expect(leave().ok).toBe(true);
    expect(c.outside).toBe(false);
    expect(c.driven).toBeUndefined();
    run(SEC); // the AI is taking him home: he is in the park, not on an errand
    expect(c.outside).toBe(false);
    const at = { x: c.x, y: c.y };
    expect(enter('a_pomeranian').ok).toBe(true);
    expect(getPlayer()).toBe(c.id);
    expect(c.driven).toBe(true);
    expect(c.st).toBe('wait');
    expect(c.outside).toBe(false);
    expect([c.x, c.y]).toEqual([at.x, at.y]);
    expect(c.dest).toBeUndefined();
    run(2 * SEC);
    expect([c.x, c.y], 'he waits for the tap').toEqual([at.x, at.y]);
  });

  it('on an errand of m_pomeranian (run, snatch, carry, home) the answer is reason.busy and nothing changes', () => {
    const pom = thePomeranian();
    for (const st of ['run', 'snatch', 'carry', 'home']) {
      Object.assign(pom, { outside: false, st, x: 20, y: 20 });
      delete pom.driven;
      const h = stateHash();
      expect(enter('a_pomeranian')).toEqual({ ok: false, reason: 'reason.busy' });
      expect(stateHash()).toBe(h);
      expect(pom.driven).toBeUndefined();
    }
  });
});

describe('07 S7.7 item 2 (the gate): a stale hit id in avatar.tap falls through to walking (02 10.3 item 4; 03 5.2 item 4)', () => {
  it('on a path tile the pomeranian and the flower seller get avatar.status.walking when the tapped visitor id is gone', () => {
    let g = { x: -1, y: -1 };
    for (let i = 0; i < KIND.length && g.x < 0; i++) if (KIND[i] === Kind.gravel && BLOCK[i] === 0) g = { x: i % 48, y: Math.floor(i / 48) };
    expect(g.x).toBeGreaterThanOrEqual(0);
    for (const id of ['a_pomeranian', 'a_florist'] as const) {
      expect(enter(id).ok).toBe(true);
      expect(avatarTap(g, { kind: 'visitor', id: 99999, tile: g })).toBe('avatar.status.walking');
      expect(leave().ok).toBe(true);
    }
  });
});
