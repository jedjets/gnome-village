// tests/save-profile.test.ts
// Locks 08 2.6 row 6 and 03 11 Failure handling for the store as a page has it on its first call (one `warn` per call, naming what
// failed first, before the profile is in memory), and the owner's answer of 2026-10-13: after a failed profile read (the storage threw,
// or the text did not parse or migrate) the in-memory defaults stand in but no call writes parque:profile-v1 until a later read
// succeeds, so a passing read error never overwrites the stored Cupid and Mischief points; the park key is still written; one `warn`.
// Split out of tests/save.test.ts (AGENTS rule 9: about 600 lines a file); the MemStorage of tests/mem-storage.ts stands in for the
// browser's storage.
// Park pace (owner 2026-10-14, "1 Y 2 Y"; register section 4 "Park pace and Options"): the profile remembers the pace the player prefers
// for new parks (settings.pace), Lively for a new player and for a profile from before the field; enqueueProfilePace sends it to a new
// park as a logged park.pace command (after a Begin or a New), and a Continue keeps the saved park's own pace.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SIM_DT, newPark, setSpeed, simulate, tick } from '../src/core/loop.ts';
import { enqueue, log, pendingCount } from '../src/core/commands.ts';
import { clearListeners, type GameEvent } from '../src/core/events.ts';
import { setMode } from '../src/play/mode.ts';
import { arrivalsState } from '../src/entities/visitor.ts';
import { defaultProfile } from '../src/save/migrate.ts';
import {
  PACE_DEFAULT, PARK_KEY, PROFILE_KEY, clearAll, enqueueProfilePace, getProfile, loadPark, loadProfile, profilePace, restore, savePark,
  saveProfile, setProfilePace, snapshot, stateHash,
} from '../src/save/store.ts';
import type { ParkSaveV1 } from '../src/save/schema.ts';
import { MemStorage, install, installBlocked } from './mem-storage.ts';

let mem: MemStorage;

beforeEach(() => {
  clearListeners();
  mem = new MemStorage();
  install(mem);
  clearAll();
  newPark(101);
  setMode('creator');
  setSpeed(1);
  mem.writes = [];
});

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

/**
 * The store as a page has it on its first call: fresh modules, the profile not read yet (main.ts reads only hasPark before the first
 * autosave). Its own events module carries the warns.
 */
async function freshStore(): Promise<{ store: typeof import('../src/save/store.ts'); freshWarns: Array<GameEvent['params']> }> {
  vi.resetModules();
  const events = await import('../src/core/events.ts');
  const loop = await import('../src/core/loop.ts');
  const store = await import('../src/save/store.ts');
  const freshWarns: Array<GameEvent['params']> = [];
  events.on('warn', (e) => freshWarns.push(e.params));
  loop.newPark(101);
  return { store, freshWarns };
}
const warnOf = (op: 'read' | 'write' | 'remove', key: string): { what: string; key: string } => ({ what: 'save.' + op, key });

describe('one warn per call before the profile is in memory (08 2.6 row 6; 07 S3 step 9: a failure emits one warn)', () => {
  it('a storage that refuses every access: each call on a fresh page emits exactly one warn, naming what failed first', async () => {
    type Store = typeof import('../src/save/store.ts');
    const calls: Array<[string, (st: Store) => unknown, object]> = [
      ['savePark', (st) => st.savePark(), warnOf('write', PARK_KEY)], // the profile read failed first; the park write is what matters
      ['saveBeforeNew', (st) => st.saveBeforeNew(), warnOf('write', PARK_KEY)],
      ['stepAutosave', (st) => st.stepAutosave(30 * Math.round(1 / SIM_DT)), warnOf('write', PARK_KEY)],
      ['clearPark', (st) => st.clearPark(), warnOf('remove', PARK_KEY)],
      // the profile's own writers: the read failed first, so the profile is held back and not written (owner 2026-10-13)
      ['saveProfile', (st) => st.saveProfile(), warnOf('read', PROFILE_KEY)],
      ['setStylePick', (st) => st.setStylePick('A'), warnOf('read', PROFILE_KEY)],
      ['setMusicPick', (st) => st.setMusicPick('B'), warnOf('read', PROFILE_KEY)],
      ['setProfilePace', (st) => st.setProfilePace('calm'), warnOf('read', PROFILE_KEY)],
      ['getProfile', (st) => st.getProfile(), warnOf('read', PROFILE_KEY)],
      ['loadProfile', (st) => st.loadProfile(), warnOf('read', PROFILE_KEY)],
      ['loadPark', (st) => st.loadPark(), warnOf('read', PARK_KEY)],
      ['clearAll', (st) => st.clearAll(), warnOf('remove', PARK_KEY)],
    ];
    for (const [name, call, first] of calls) {
      const { store, freshWarns } = await freshStore();
      installBlocked();
      expect(() => call(store), name).not.toThrow();
      expect([name, freshWarns]).toEqual([name, [first]]);
      expect(store.getProfile().cp).toBe(0); // the defaults stand in for the profile it could not read
    }
    const { store, freshWarns } = await freshStore();
    installBlocked();
    expect(store.hasPark()).toBe(false); // the intro's question stays quiet
    expect(freshWarns).toEqual([]);
  });

  it('a damaged profile key on a fresh page: savePark writes the park key only, with one save.parse warn; the damaged key stays', async () => {
    mem.map.set(PROFILE_KEY, '{"v":1,"cp":');
    const { store, freshWarns } = await freshStore();
    expect(store.savePark()).toBe(true);
    expect(freshWarns).toEqual([{ what: 'save.parse', key: PROFILE_KEY }]);
    expect(mem.writes).toEqual([PARK_KEY]); // the defaults never replace it (owner 2026-10-13: no profile write after a failed read)
    expect(mem.map.get(PROFILE_KEY)).toBe('{"v":1,"cp":');
    expect(store.getProfile().cp).toBe(0); // the defaults stand in, in memory
    expect(store.savePark()).toBe(true); // in memory now: no second warn, still no profile write
    expect(freshWarns).toHaveLength(1);
    expect(mem.writes).toEqual([PARK_KEY, PARK_KEY]);
  });
});

/** A stored profile with points: what a passing read error must never overwrite. */
function storeProfileWithPoints(): string {
  getProfile().cp = 12;
  getProfile().mp = 7;
  getProfile().parksPlayed = 3;
  expect(saveProfile()).toBe(true);
  return mem.map.get(PROFILE_KEY) as string;
}

describe('a failed profile read holds the profile key back until a later read succeeds (owner 2026-10-13; 03 11 Failure handling)', () => {
  it('the storage throws on the read: the park key is written, the stored points are not overwritten; one warn; a later read lifts the hold', async () => {
    const stored = storeProfileWithPoints();
    const { store, freshWarns } = await freshStore();
    mem.writes = [];
    mem.failGet = true; // a passing error: the read throws, the writes would land
    expect(store.savePark()).toBe(true);
    expect(freshWarns).toEqual([{ what: 'save.read', key: PROFILE_KEY }]);
    expect(store.getProfile().cp).toBe(0); // the defaults stand in, in memory
    mem.failGet = false; // the storage is back, but no read has succeeded since
    expect(store.savePark()).toBe(true);
    expect(store.stepAutosave(30 * Math.round(1 / SIM_DT))).toBe(true);
    expect(store.saveProfile()).toBe(false);
    expect(store.clearPark()).toBe(true); // the park key goes; parksPlayed is not written over the stored 3
    store.setStylePick('A');
    store.setProfilePace('calm');
    expect(mem.writes).toEqual([PARK_KEY, PARK_KEY, PARK_KEY]);
    expect(mem.map.get(PROFILE_KEY)).toBe(stored);
    expect(freshWarns).toHaveLength(1); // one warn, from the read that failed
    // a later read succeeds: the stored points come back and the profile is written again
    expect(store.loadProfile()).toMatchObject({ cp: 12, mp: 7, parksPlayed: 3 });
    expect(store.savePark()).toBe(true);
    expect(mem.writes.slice(3).sort()).toEqual([PARK_KEY, PROFILE_KEY]);
    expect(JSON.parse(mem.map.get(PROFILE_KEY) ?? '{}')).toMatchObject({ cp: 12, mp: 7, parksPlayed: 3 });
    expect(freshWarns).toHaveLength(1);
  });

  it('the text does not parse or migrate: loadProfile warns once, then no call writes the profile key; the park key still is', async () => {
    for (const bad of ['{"v":1,"cp":', JSON.stringify({ v: 99, cp: 12, mp: 7 })]) {
      mem.map.set(PROFILE_KEY, bad);
      const { store, freshWarns } = await freshStore();
      mem.writes = [];
      expect(store.loadProfile().cp, bad).toBe(0);
      expect(freshWarns, bad).toEqual([{ what: 'save.parse', key: PROFILE_KEY }]);
      expect(store.saveProfile(), bad).toBe(false);
      expect(store.savePark(), bad).toBe(true);
      expect(store.clearPark(), bad).toBe(true);
      store.setMusicPick('B');
      expect(mem.writes, bad).toEqual([PARK_KEY]);
      expect(mem.map.get(PROFILE_KEY), bad).toBe(bad);
      expect(freshWarns, bad).toHaveLength(1);
      // clearAll removes the key: nothing is left to protect, so the profile is written again
      expect(store.clearAll(), bad).toBe(true);
      expect(store.saveProfile(), bad).toBe(true);
      expect(JSON.parse(mem.map.get(PROFILE_KEY) ?? '{}'), bad).toMatchObject({ v: 1, cp: 0 });
    }
  });
});

describe('the pace a new park gets (register section 4, Park pace and Options; owner 2026-10-14 "1 Y 2 Y"; 03 3.9, 11)', () => {
  it('a new profile and an older profile without the field read Lively; a stored pace is remembered; anything else reads Lively', () => {
    expect(PACE_DEFAULT).toBe('lively');
    expect(defaultProfile().settings.pace).toBeUndefined(); // a new profile has none: it reads the default
    expect(profilePace()).toBe('lively');
    for (const old of [
      { v: 1, cp: 4, settings: { lang: 'es', muted: false, speed: 3 } }, // v1, written before the field
      { lang: 'es', muted: true, speed: 2 }, // v0: flat settings
      { v: 1, settings: { lang: 'en', muted: false, speed: 1, pace: 'fast' } }, // a value that is no pace
    ]) {
      mem.map.set(PROFILE_KEY, JSON.stringify(old));
      expect(loadProfile().settings.pace, JSON.stringify(old)).toBeUndefined();
      expect(profilePace(), JSON.stringify(old)).toBe('lively');
    }
    setProfilePace('calm'); // the Options sheet: kept in memory and written
    expect(profilePace()).toBe('calm');
    expect(JSON.parse(mem.map.get(PROFILE_KEY) ?? '{}').settings).toMatchObject({ lang: 'en', pace: 'calm' });
    expect(savePark()).toBe(true); // the autosave writes the profile with it
    expect(loadProfile().settings.pace).toBe('calm'); // a later page remembers it
    expect(profilePace()).toBe('calm');
    setProfilePace('lively');
    expect(loadProfile().settings.pace).toBe('lively');
  });

  it('enqueueProfilePace after a Begin: the profile\'s pace is a logged park.pace at the new park\'s first step', () => {
    for (const pace of ['lively', 'calm'] as const) {
      setProfilePace(pace);
      newPark(101); // Begin: the shell's newPark, then its one call
      enqueueProfilePace();
      expect([pendingCount(), arrivalsState().pace]).toEqual([1, 'calm']);
      simulate(SIM_DT, 0);
      expect([tick(), arrivalsState().pace]).toEqual([1, pace]);
      expect(log().map((c) => [c.tick, c.kind, c.payload])).toEqual([[1, 'park.pace', { pace }]]);
    }
  });

  it('enqueueProfilePace right after a New: the pace survives the park.new and applies at the new park\'s first step', () => {
    setProfilePace('lively');
    for (let k = 0; k < 120; k++) simulate(SIM_DT, 0);
    enqueue({ side: 'park', kind: 'park.new', payload: { seed: 7 } }); // New's Yes, then the shell's one call
    enqueueProfilePace();
    simulate(SIM_DT, 0);
    expect([tick(), arrivalsState().pace]).toEqual([0, 'calm']);
    simulate(SIM_DT, 0);
    expect([tick(), arrivalsState().pace]).toEqual([1, 'lively']);
    expect(log().map((c) => [c.tick, c.kind])).toEqual([[1, 'park.pace']]);
    const viaNew = stateHash();
    newPark(7); // a Begin on the same seed with the same call reaches the same park at tick 1
    enqueueProfilePace();
    simulate(SIM_DT, 0);
    expect(stateHash()).toBe(viaNew);
  });

  it('Continue keeps the saved park\'s own pace, whatever the profile prefers', () => {
    setProfilePace('lively');
    for (let k = 0; k < 60; k++) simulate(SIM_DT, 0); // a calm park (no pace command)
    expect(savePark()).toBe(true);
    const h = stateHash();
    newPark(5);
    restore(loadPark() as ParkSaveV1); // Continue: restore, no command
    expect([arrivalsState().pace, stateHash(), pendingCount()]).toEqual(['calm', h, 0]);
    expect(snapshot().pace).toBe('calm');
  });
});
