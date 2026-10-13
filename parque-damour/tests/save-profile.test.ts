// tests/save-profile.test.ts
// Locks 08 2.6 row 6 and 03 11 Failure handling for the store as a page has it on its first call (one `warn` per call, naming what
// failed first, before the profile is in memory), and the owner's answer of 2026-10-13: after a failed profile read (the storage threw,
// or the text did not parse or migrate) the in-memory defaults stand in but no call writes parque:profile-v1 until a later read
// succeeds, so a passing read error never overwrites the stored Cupid and Mischief points; the park key is still written; one `warn`.
// Split out of tests/save.test.ts (AGENTS rule 9: about 600 lines a file); the MemStorage of tests/mem-storage.ts stands in for the
// browser's storage.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SIM_DT, newPark, setSpeed } from '../src/core/loop.ts';
import { clearListeners, type GameEvent } from '../src/core/events.ts';
import { setMode } from '../src/play/mode.ts';
import { PARK_KEY, PROFILE_KEY, clearAll, getProfile, saveProfile } from '../src/save/store.ts';
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
