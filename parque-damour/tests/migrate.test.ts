// tests/migrate.test.ts
// Locks save/migrate.ts: one function per schema version step (03 11 Migration), garbage refused and never thrown (03 11 Failure
// handling), the profile defaults (03 3.9; 08 2.6). 08 2.6 migrate.test.ts rows (each `it` named as the row).
// The v0 fixture (tests/fixtures/park-v0.json) is the unversioned draft that parkV0toV1 lifts: no `v`; seed 7 at tick 600; the sim
// stream at state 123456789 after 0 draws; fair weather without ice timers or overrides; only the OCC layer (a layer v0 lacks is all
// zero: every tile lawn, nothing worn, wet or frozen); the id counters without propReserved; one bench, prop 1, at (5, 5) facing east.
// The v0 profile is inline below: its settings flat at the top level, no points.
// Node has no localStorage: MemStorage stands in for it where loadProfile runs (never in src/).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIM_DT, newPark, simulate, tick } from '../src/core/loop.ts';
import { applyNow } from '../src/core/commands.ts';
import { clearListeners, on, type GameEvent } from '../src/core/events.ts';
import { rngN, simState } from '../src/core/rng.ts';
import { idsState } from '../src/core/ids.ts';
import { W } from '../src/core/weather.ts';
import { BLOCK, I, ICE, KIND, NC, OCC, PAVEDAY, WATER, WEAR, propById, props } from '../src/world/grid.ts';
import { getMode, setMode } from '../src/play/mode.ts';
import { nextSpecies, propAt } from '../src/play/tools.ts';
import { iceState } from '../src/world/water.ts';
import { PROFILE_KEY, clearAll, getProfile, loadProfile, restore, snapshot, stateHash } from '../src/save/store.ts';
import { defaultProfile, migratePark, migrateProfile, parkV0toV1, profileV0toV1 } from '../src/save/migrate.ts';
import type { ParkSaveV1 } from '../src/save/schema.ts';

const FIXTURE_TEXT = readFileSync(join(import.meta.dirname, 'fixtures', 'park-v0.json'), 'utf8');
const V0_PROFILE = { lang: 'es', muted: true, speed: 4, stylePick: 'A' };

class MemStorage {
  map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

let mem: MemStorage;
let warns: GameEvent[];

beforeEach(() => {
  clearListeners();
  mem = new MemStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: mem, configurable: true, writable: true });
  clearAll();
  warns = [];
  on('warn', (e) => warns.push(e));
  newPark(101);
  setMode('creator');
});

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('version 0 lifts to version 1 (03 11 Migration; 08 2.6 migrate row 1)', () => {
  it('a v0 fixture migrates', () => {
    const fromText = migratePark(FIXTURE_TEXT);
    const fromObject = migratePark(JSON.parse(FIXTURE_TEXT));
    expect(fromText?.v).toBe(1);
    expect(fromObject).toEqual(fromText);
    const s = fromText as ParkSaveV1;
    expect(() => restore(s)).not.toThrow();
    // what the fixture holds
    expect([tick(), simState(), rngN()]).toEqual([600, 123456789, 0]);
    expect([W.kind, W.next, W.windP]).toEqual(['fair', 30, 2.1]);
    const bench = propById(1);
    expect([bench?.kind, bench?.x, bench?.y, bench?.rot, props.length]).toEqual(['bench', 5, 5, 1, 1]);
    expect(OCC[I(5, 5)]).toBe(1);
    // what v1 added, at the values a new park holds
    expect(iceState()).toEqual({ on: 0, snowT: 0, dryT: 0 });
    expect(idsState()).toEqual({ visitor: 0, pair: 0, creature: 0, prop: 1, effect: 0, propFree: [], propReserved: [] });
    expect([getMode(), s.log, s.feed, s.visitors, nextSpecies()]).toEqual(['creator', [], [], [], 0]);
    // the layers v0 lacked are all zero, and the derived BLOCK follows the bench
    for (const L of [KIND, WEAR, WATER, ICE, PAVEDAY]) expect(L.every((v) => v === 0)).toBe(true);
    for (let i = 0; i < NC; i++) expect(BLOCK[i]).toBe(i === I(5, 5) ? 1 : 0);
    // the migrated park round-trips and runs, and the tools work on it (the next PropId is 2)
    const h = stateHash();
    restore(JSON.parse(JSON.stringify(snapshot())) as ParkSaveV1);
    expect(stateHash()).toBe(h);
    for (let k = 0; k < 1000; k++) simulate(SIM_DT, 1);
    expect(tick()).toBe(1600);
    expect(applyNow({ side: 'park', kind: 'tool', payload: { tool: 'lamp', at: { x: 9, y: 9 } } }).ok).toBe(true);
    expect(propAt(9, 9)?.id).toBe(2);

    const p = migrateProfile(V0_PROFILE);
    expect(p).toEqual({ ...defaultProfile(), settings: { lang: 'es', muted: true, speed: 4 }, stylePick: 'A' });
    expect(migrateProfile(JSON.stringify(V0_PROFILE))).toEqual(p);
    expect(p?.v).toBe(1);
  });

  it('the placeholders fill what v1 added and leave what v0 had', () => {
    const v0 = JSON.parse(FIXTURE_TEXT) as Record<string, unknown>;
    const up = parkV0toV1(v0);
    expect(up.v).toBe(1);
    expect([up.seed, up.tick, up.props]).toEqual([v0.seed, v0.tick, v0.props]);
    expect(Object.keys(up.layers as object).sort()).toEqual(['BEDC', 'ICE', 'KIND', 'OCC', 'PAVEDAY', 'PETALS', 'WATER', 'WEAR', 'WET']);
    expect((up.layers as Record<string, string>).OCC).toBe((v0.layers as Record<string, string>).OCC);
    expect(profileV0toV1(V0_PROFILE)).toEqual({ v: 1, settings: { lang: 'es', muted: true, speed: 4 }, stylePick: 'A', musicPick: undefined });
    expect(migratePark({ ...v0, v: 0 })).toEqual(migratePark(v0)); // v 0 written out is the same version
  });

  it('a v1 save passes as it is: the starter park, written and read back', () => {
    const s = snapshot();
    expect(migratePark(JSON.stringify(s))).toEqual(JSON.parse(JSON.stringify(s)));
  });
});

describe('garbage is refused, never thrown (03 11 Failure handling; 08 2.6 migrate row 2)', () => {
  it('garbage is refused, not thrown', () => {
    const garbage: unknown[] = ['{bad', { v: 99 }, null, undefined, 42, 'null', '[]', [], '', 'true', { v: '1' }, { v: 2 }];
    for (const g of garbage) {
      expect(() => migratePark(g)).not.toThrow();
      expect(migratePark(g)).toBeNull();
      expect(() => migrateProfile(g)).not.toThrow();
      expect(migrateProfile(g)).toBeNull();
    }
  });

  it('a v1 park with one field wrong is refused whole, so restore never meets it', () => {
    const good = JSON.parse(JSON.stringify(snapshot())) as Record<string, unknown>;
    expect(migratePark(good)).not.toBeNull();
    const layers = good.layers as Record<string, string>;
    const props0 = good.props as Array<Record<string, unknown>>;
    const occBench = props0.find((p) => p.kind === 'bench')?.id as number;
    const occ = new Uint16Array(Uint8Array.from(Buffer.from(layers.OCC as string, 'base64')).buffer); // a copy: Buffer may share a pool
    const freeOcc = new Uint16Array(occ);
    freeOcc[occ.indexOf(occBench)] = 999; // OCC names a prop that is not listed
    const bad: Array<[string, Record<string, unknown>]> = [
      ['a layer cut short', { ...good, layers: { ...layers, WEAR: (layers.WEAR as string).slice(0, -4) } }],
      ['a layer that is not base64', { ...good, layers: { ...layers, KIND: '!'.repeat((layers.KIND as string).length) } }],
      ['a layer missing', { ...good, layers: { ...layers, PETALS: undefined } }],
      ['a tile kind past canal', { ...good, layers: { ...layers, KIND: Buffer.alloc(NC, 9).toString('base64') } }],
      ['OCC names an unlisted prop', { ...good, layers: { ...layers, OCC: Buffer.from(freeOcc.buffer).toString('base64') } }],
      ['two props with one id', { ...good, props: [...props0, { ...props0[0] }] }],
      ['a live prop id on the free list', { ...good, ids: { ...(good.ids as object), propFree: [occBench] } }],
      ['a tick that is not whole', { ...good, tick: 10.5 }],
      ['an unknown weather kind', { ...good, weather: { ...(good.weather as object), kind: 'hail' } }],
      ['a NaN in the weather', { ...good, weather: { ...(good.weather as object), cloud: null } }],
      ['no ice timers', { ...good, weather: { ...(good.weather as object), ice: undefined } }],
      ['an unknown mode', { ...good, mode: { mode: 'ghost', player: 0, avatar: null } }],
      ['an unknown avatar', { ...good, mode: { mode: 'avatar', player: 3, avatar: 'a_dragon' } }],
      ['a command without a tick', { ...good, log: [{ seq: 1, side: 'park', kind: 'undo', payload: {} }] }],
      ['a tree cycle of 3', { ...good, treeTurn: 3 }],
      ['no props list', { ...good, props: undefined }],
      ['a visitor without an id', { ...good, visitors: [{ name: 'x' }] }],
    ];
    for (const [why, o] of bad) {
      expect(() => migratePark(o), why).not.toThrow();
      expect([why, migratePark(o)]).toEqual([why, null]);
      expect([why, migratePark(JSON.stringify(o))]).toEqual([why, null]);
    }
  });
});

describe('the profile (03 3.9; 08 2.6 migrate row 3)', () => {
  it('the profile falls back to defaults', () => {
    const p = loadProfile();
    expect({
      cp: p.cp, mp: p.mp, tierC: p.tierC, tierM: p.tierM, lang: p.settings.lang, speed: p.settings.speed, muted: p.settings.muted,
      stylePick: p.stylePick, musicPick: p.musicPick,
    }).toEqual({ cp: 0, mp: 0, tierC: 0, tierM: 0, lang: 'en', speed: 1, muted: false, stylePick: null, musicPick: null });
    expect(p).toEqual(defaultProfile());
    expect(getProfile()).toBe(p); // the in-memory profile the game edits
    expect(warns).toEqual([]); // a missing profile is not a failure
    mem.map.set(PROFILE_KEY, '{not json');
    expect(loadProfile()).toEqual(defaultProfile());
    expect(warns).toHaveLength(1);
    mem.map.set(PROFILE_KEY, JSON.stringify({ v: 7, cp: 50 }));
    expect(loadProfile()).toEqual(defaultProfile());
    expect(warns).toHaveLength(2);
  });

  it('a v1 profile keeps its fields and fills the missing ones (the S1 boards wrote one before the points existed)', () => {
    mem.map.set(PROFILE_KEY, JSON.stringify({ v: 1, settings: { lang: 'es', muted: true, speed: 3 }, stylePick: 'A', musicPick: 'C' }));
    expect(loadProfile()).toEqual({ ...defaultProfile(), settings: { lang: 'es', muted: true, speed: 3 }, stylePick: 'A', musicPick: 'C' });
    const full = {
      v: 1, cp: 21, mp: 9, tierC: 2, tierM: 1, unlocked: ['c_musician', 'a_pomeranian'], settings: { lang: 'en', muted: false, speed: 8 },
      stylePick: 'B', musicPick: null, parksPlayed: 4, updatedAt: 77,
    };
    expect(migrateProfile(JSON.stringify(full))).toEqual(full);
    // a field of the wrong type or out of range takes its default; the rest stay
    const odd = { ...full, cp: -3, tierC: 5, unlocked: ['c_petals', 4], settings: { lang: 'fr', muted: 'yes', speed: 0 }, stylePick: 'Z' };
    expect(migrateProfile(odd)).toEqual({
      ...full, cp: 0, tierC: 0, unlocked: ['c_petals'], settings: { lang: 'en', muted: false, speed: 1 }, stylePick: null,
    });
    expect(warns).toEqual([]);
  });
});
