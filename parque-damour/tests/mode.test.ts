// tests/mode.test.ts
// Locks register 3.9 and rows 12-14, 03 2.6 (mode.ts), 03 4.4, 07 S7.6 steps 1 and 8, 08 2.5 (mode rows): MODE and PLAYER are one variable each
// and the simulation has one branch on them; park.new forces creator mode and discards the actor spawned for the player (GV 12107); the
// mode block is saved, restored and hashed.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { newPark } from '../src/core/loop.ts';
import { AVATAR_SIDE, applyNow, enqueue } from '../src/core/commands.ts';
import { clearListeners, on, type GameEvent } from '../src/core/events.ts';
import { AVATAR_IDS, PLAYER_HOLD, getAvatar, getMode, getPlayer, setMode } from '../src/play/mode.ts';
import { creatureById, creatures } from '../src/entities/creatures.ts';
import { byId, visitors } from '../src/entities/visitor.ts';
import { restore, snapshot, stateHash } from '../src/save/store.ts';
import { run, unlockAll, world } from './abilities-world.ts';

const SRC = join(import.meta.dirname, '..', 'src');
const read = (rel: string): string => readFileSync(join(SRC, rel), 'utf8');
const ts = (dir: string): string[] => readdirSync(join(SRC, dir)).filter((f) => f.endsWith('.ts')).map((f) => dir + '/' + f);

describe('one variable, one branch (register 3.9; 03 4.4; 08 2.5)', () => {
  it('MODE and PLAYER are read by the decide cadence of visitor.ts and nowhere else in entities/', () => {
    const readers = ts('entities').filter((f) => /\bgetMode\b|\bgetPlayer\b|\bgetAvatar\b|\bsetMode\b/.test(read(f)));
    expect(readers).toEqual(['entities/visitor.ts']);
    const src = read('entities/visitor.ts');
    expect(src.match(/getMode\(\)/g)).toHaveLength(1);
    expect(src.match(/getPlayer\(\)/g)).toHaveLength(1);
    expect(src).toMatch(/v\.id === getPlayer\(\) && getMode\(\) === 'avatar'\) avatarDecide\(v\)/);
    // the possessed creatures carry a flag on their record instead: no second read in creatures.ts or pomeranian.ts
    expect(read('entities/creatures.ts')).not.toMatch(/play\/mode/);
    expect(read('entities/pomeranian.ts')).not.toMatch(/play\/mode/);
  });
  it('romance.ts, needs.ts and weather.ts import nothing from play/mode.ts (02 14 item 7); the sim files that do are the named ones', () => {
    for (const f of ['entities/romance.ts', 'entities/romance-stages.ts', 'entities/needs.ts', 'core/weather.ts', 'world/charm.ts', 'entities/embarrass.ts']) {
      expect(read(f), f).not.toMatch(/play\/mode/);
    }
    const importers = [...ts('core'), ...ts('world'), ...ts('entities')].filter((f) => /from '\.\.\/play\/mode\.ts'/.test(read(f))).sort();
    expect(importers).toEqual(['core/commands.ts', 'core/loop.ts', 'entities/visitor.ts']); // 03 2.1: commands.ts for the mode rules, loop.ts for new park
  });
  it('setMode keeps one variable each: creator clears the avatar and PLAYER, avatar sets both', () => {
    setMode('avatar', 'a_florist', 17);
    expect([getMode(), getAvatar(), getPlayer()]).toEqual(['avatar', 'a_florist', 17]);
    setMode('creator', 'a_pigeon', 99);
    expect([getMode(), getAvatar(), getPlayer()]).toEqual(['creator', null, 0]);
  });
  it('PLAYER_HOLD names six avatars and the ids list is the picker\'s order', () => {
    expect(AVATAR_IDS).toEqual(['a_pigeon', 'a_pomeranian', 'a_mime', 'a_florist', 'a_busker', 'a_matchmaker']);
    expect(Object.keys(PLAYER_HOLD).sort()).toEqual([...AVATAR_IDS].sort());
  });
});

describe('park.new forces creator mode (07 S7.6 step 8; GV 12107)', () => {
  let events: GameEvent[] = [];
  beforeEach(() => {
    clearListeners();
    world();
    unlockAll();
    events = [];
    on('mode', (e) => events.push(e));
  });
  it('in avatar mode a park.new gives creator, PLAYER 0, and the actor spawned for the player is gone with the old park', () => {
    expect(applyNow({ side: 'cupid', kind: 'avatar.enter', payload: { avatar: 'a_florist' } }).ok).toBe(true);
    const id = getPlayer();
    expect(byId(id)?.spawnedForPlayer).toBe(true);
    expect(applyNow({ side: 'park', kind: 'park.new', payload: { seed: 7 } }).ok).toBe(true);
    expect([getMode(), getPlayer(), getAvatar()]).toEqual(['creator', 0, null]);
    expect(visitors.some((v) => v.spawnedForPlayer)).toBe(false);
    expect(byId(id)).toBeUndefined();
    expect(events.map((e) => e.params?.mode)).toEqual(['avatar', 'creator']); // the shell hears both
  });
  it('a possessed pigeon or Pompon is the old park\'s too: the new park\'s creatures are free', () => {
    applyNow({ side: 'mischief', kind: 'avatar.enter', payload: { avatar: 'a_pigeon' } });
    const id = getPlayer();
    expect(creatureById(id)?.driven).toBe(true);
    applyNow({ side: 'park', kind: 'park.new', payload: { seed: 8 } });
    expect(creatures.some((c) => c.driven)).toBe(false);
    expect(getMode()).toBe('creator');
    applyNow({ side: 'mischief', kind: 'avatar.enter', payload: { avatar: 'a_pomeranian' } });
    expect(creatures.filter((c) => c.driven)).toHaveLength(1);
    newPark(9);
    expect(creatures.some((c) => c.driven)).toBe(false);
  });
  it('a park.new applied while paused or queued behind commands still ends in creator mode', () => {
    applyNow({ side: 'mischief', kind: 'avatar.enter', payload: { avatar: 'a_pigeon' } });
    enqueue({ side: 'park', kind: 'park.new', payload: { seed: 3 } });
    run(1);
    expect(getMode()).toBe('creator');
    expect(creatures.some((c) => c.driven)).toBe(false);
  });
});

describe('the mode block is saved and restored (03 3.10; register 3.11)', () => {
  beforeEach(() => {
    clearListeners();
    world();
    unlockAll();
  });
  it('the snapshot holds mode, player and avatar; a restore sets them again and the hash agrees; the block is in the hash', () => {
    const base = stateHash();
    applyNow({ side: AVATAR_SIDE.a_florist, kind: 'avatar.enter', payload: { avatar: 'a_florist' } });
    const id = getPlayer();
    run(30);
    const snap = JSON.parse(JSON.stringify(snapshot())) as ReturnType<typeof snapshot>;
    expect(snap.mode).toEqual({ mode: 'avatar', player: id, avatar: 'a_florist' });
    const h = stateHash();
    expect(h).not.toBe(base);
    newPark(2);
    expect(getMode()).toBe('creator');
    restore(snap);
    expect([getMode(), getPlayer(), getAvatar()]).toEqual(['avatar', id, 'a_florist']);
    expect(stateHash()).toBe(h);
    setMode('creator'); // MODE and PLAYER alone change the hash (03 11: `mode` is a hashed part)
    expect(stateHash()).not.toBe(h);
  });
});
