// tests/save.test.ts
// Locks the park and profile save of register 3.11 and 03 sections 3.10, 11 and 17 A24: the two parque: keys and no other, JSON with the
// layers as base64, the round trip that keeps the state hash, what the snapshot leaves out, the size, the autosave at 30 sim seconds,
// every localStorage failure caught with one `warn` event, MODE and PLAYER restored, the derived caches rebuilt on a restore, New.
// 08 2.6 save.test.ts rows (each `it` named as the row), plus the store contract of 07 S3 step 9. The store on a fresh page (one warn
// per call before the profile is in memory) and the hold after a failed profile read are in tests/save-profile.test.ts.
// Node has no localStorage: tests/mem-storage.ts's MemStorage stands in for it, installed on globalThis by each test (never in src/).
// Park pace (owner 2026-10-14, register section 4 "Park pace and Options"): the park's pace is saved as `pace`, round-trips and is hashed
// when it is not calm; a save without one (every park saved before) restores as calm with the hash it always had.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SIM_DT, newPark, setSpeed, simulate, tick } from '../src/core/loop.ts';
import { T } from '../src/core/clock.ts';
import { applyNow, enqueue, log, type CommandInput, type Result, type ToolPayload } from '../src/core/commands.ts';
import { clearListeners, on, type GameEvent } from '../src/core/events.ts';
import { rngN } from '../src/core/rng.ts';
import { idsState } from '../src/core/ids.ts';
import { BEDC, BLOCK, I, ICE, KIND, Kind, N, NC, OCC, PAVEDAY, PETALS, WATER, WEAR, WET, propById, props } from '../src/world/grid.ts';
import { waterBodies } from '../src/world/water.ts';
import { getAvatar, getMode, getPlayer, setMode } from '../src/play/mode.ts';
import { ghost, nextSpecies, propAt, type ToolId } from '../src/play/tools.ts';
import { UNDO_DEPTH, canUndo, clearUndo, depth } from '../src/play/undo.ts';
import { cam } from '../src/render/camera.ts';
import { addPart, clearParticles, particles } from '../src/render/effects.ts';
import {
  AUTOSAVE_S, PARK_KEY, PROFILE_KEY, clearAll, clearPark, getProfile, hasPark, loadPark, loadProfile, resetAutosave, restore,
  saveBeforeNew, savePark, saveProfile, snapshot, stateHash, stepAutosave, worldHash,
} from '../src/save/store.ts';
import { migratePark } from '../src/save/migrate.ts';
import { arrivalsState } from '../src/entities/visitor.ts';
import type { ParkSaveV1 } from '../src/save/schema.ts';
import { MemStorage, install, installBlocked } from './mem-storage.ts';

let mem: MemStorage;
let warns: GameEvent[];

const tool = (payload: ToolPayload): Result => applyNow({ side: 'park', kind: 'tool', payload });
const at = (x: number, y: number): { x: number; y: number } => ({ x, y });
const clone = (s: ParkSaveV1): ParkSaveV1 => JSON.parse(JSON.stringify(s)) as ParkSaveV1;
/** A layer's raw bytes. */
const bytes = (a: ArrayBufferView): number[] => Array.from(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
function steps(n: number): void {
  for (let k = 0; k < n; k++) simulate(SIM_DT, 1);
}

beforeEach(() => {
  clearListeners();
  mem = new MemStorage();
  install(mem);
  clearAll();
  warns = [];
  on('warn', (e) => warns.push(e));
  newPark(101);
  setMode('creator');
  setSpeed(1);
  mem.writes = [];
});

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

/** A park with history: tools (a removal among them, so an id is reserved), a weather change, a tree planted then removed. */
function playSome(): void {
  steps(120);
  expect(tool({ tool: 'bench', at: at(5, 5) }).ok).toBe(true);
  expect(tool({ tool: 'path', at: at(4, 9), size: 2, stroke: 1 }).ok).toBe(true);
  expect(tool({ tool: 'tree', at: at(9, 2) }).ok).toBe(true); // fells starter tree 17: its id is reserved while the entry stands
  expect(tool({ tool: 'tree', at: at(7, 40) }).ok).toBe(true); // a plane (prop 29): the cycle moves on to chestnut
  expect(tool({ tool: 'remove', at: at(7, 40) }).ok).toBe(true); // the tree goes (29 reserved); the cycle stays at chestnut (02 8.3)
  enqueue({ side: 'park', kind: 'debug.weather', payload: { kind: 'rain' } });
  steps(600);
}

describe('the save round trip (08 2.6 rows 1 and 7; register 3.11; 03 11)', () => {
  // 08 2.6: h = stateHash(); restore(JSON.parse(JSON.stringify(snapshot()))); stateHash() === h after 1000 more ticks on both paths
  it('the round trip keeps the hash', () => {
    playSome();
    expect(idsState().propReserved).toEqual([17, 29]); // the felled starter tree and the planted one removed: both held for the undo
    expect(nextSpecies()).toBe(1); // what a count of the player's trees standing (0) would not give
    const h = stateHash();
    const s = clone(snapshot());
    const plant: CommandInput = { side: 'park', kind: 'tool', payload: { tool: 'tree', at: at(3, 40) } };
    enqueue(plant); // both paths plant a tree in their first step: the saved tree cycle decides its species
    steps(1000);
    const live = { hash: stateHash(), rngN: rngN(), tick: tick(), world: worldHash(), species: propAt(3, 40)?.data.species };
    restore(s);
    expect(stateHash()).toBe(h);
    expect(canUndo()).toBe(false); // the undo stack is not saved: a restore empties it (register 3.11; owner 2026-10-13)
    enqueue(plant);
    steps(1000);
    expect({ hash: stateHash(), rngN: rngN(), tick: tick(), world: worldHash(), species: propAt(3, 40)?.data.species }).toEqual(live);
    expect(live.species).toBe(1); // chestnut
  });

  it('the same round trip through localStorage: savePark, loadPark, restore', () => {
    playSome();
    const h = stateHash();
    expect(savePark()).toBe(true); // a write changes no sim state
    expect(stateHash()).toBe(h);
    steps(1000);
    const live = { hash: stateHash(), rngN: rngN() };
    newPark(5);
    expect(stateHash()).not.toBe(h);
    const s = loadPark();
    expect(s).not.toBeNull();
    restore(s as ParkSaveV1);
    expect(stateHash()).toBe(h);
    steps(1000);
    expect({ hash: stateHash(), rngN: rngN() }).toEqual(live);
    expect(warns).toEqual([]);
  });

  it('mode and player are restored', () => {
    setMode('avatar', 'a_pigeon', 7);
    const s = clone(snapshot());
    expect(savePark()).toBe(true);
    newPark(5);
    expect([getMode(), getPlayer(), getAvatar()]).toEqual(['creator', 0, null]);
    restore(s);
    expect([getMode(), getPlayer(), getAvatar()]).toEqual(['avatar', 7, 'a_pigeon']);
    newPark(5);
    restore(loadPark() as ParkSaveV1);
    expect([getMode(), getPlayer(), getAvatar()]).toEqual(['avatar', 7, 'a_pigeon']);
  });
});

const setPace = (pace: 'calm' | 'lively'): void => void expect(applyNow({ side: 'park', kind: 'park.pace', payload: { pace } }).ok).toBe(true);

describe('the park\'s pace in the save (register section 4, Park pace and Options; 03 3.10, 11; 08 2.6)', () => {
  it('the pace round-trips and is hashed: a Lively park restores Lively with its hash, through JSON and through localStorage', () => {
    steps(60);
    const calm = stateHash();
    expect(snapshot().pace).toBe('calm');
    setPace('lively');
    const h = stateHash();
    expect(h).not.toBe(calm); // the hash covers the pace (03 11)
    const s = clone(snapshot());
    expect(s.pace).toBe('lively');
    expect(savePark()).toBe(true);
    steps(1200);
    const live = { hash: stateHash(), rngN: rngN(), arrivals: arrivalsState() };
    newPark(5);
    expect(arrivalsState().pace).toBe('calm');
    restore(s);
    expect([arrivalsState().pace, stateHash()]).toEqual(['lively', h]);
    steps(1200);
    expect({ hash: stateHash(), rngN: rngN(), arrivals: arrivalsState() }).toEqual(live);
    newPark(5);
    restore(loadPark() as ParkSaveV1);
    expect([arrivalsState().pace, stateHash()]).toEqual(['lively', h]);
  });

  it('a save without a pace (every park saved before it existed) loads as calm, with the hash a calm park has', () => {
    steps(60);
    const h = stateHash(); // calm
    const s = clone(snapshot());
    delete s.pace;
    setPace('lively');
    restore(s);
    expect([arrivalsState().pace, stateHash()]).toEqual(['calm', h]);
    mem.map.set(PARK_KEY, JSON.stringify(s)); // the same through the key, past migratePark
    setPace('lively');
    restore(loadPark() as ParkSaveV1);
    expect([arrivalsState().pace, stateHash()]).toEqual(['calm', h]);
    setPace('lively');
    restore({ ...s, pace: 'fast' as unknown as 'calm' }); // anything that is no pace reads calm as well
    expect(arrivalsState().pace).toBe('calm');
  });
});

describe('what a snapshot holds (08 2.6 rows 2 to 5; 03 3.2, 3.10, 11; register 3.3)', () => {
  it('no object reference in a saved field', () => {
    playSome();
    const bad: string[] = [];
    const walk = (v: unknown, path: string, key: string): void => {
      if (key.endsWith('Id') && typeof v !== 'number') bad.push(path + ' is an id but not a number');
      if (key.endsWith('Ids') && !(Array.isArray(v) && v.every((x) => typeof x === 'number'))) bad.push(path + ' is not a list of ids');
      if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) bad.push(path + ' is not a finite number');
        return;
      }
      if (Array.isArray(v)) {
        v.forEach((x, i) => walk(x, `${path}[${i}]`, ''));
        return;
      }
      if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
        for (const [k, x] of Object.entries(v)) walk(x, path + '.' + k, k);
        return;
      }
      bad.push(path + ' is a ' + (typeof v === 'object' ? Object.prototype.toString.call(v) : typeof v));
    };
    const s = snapshot();
    walk(s, 'park', '');
    expect(bad).toEqual([]);
    const kiosk = s.props.find((p) => p.kind === 'kiosk');
    expect(kiosk?.data.tableIds?.length).toBeGreaterThan(0); // the walk met a list of ids
    expect(JSON.parse(JSON.stringify(s))).toStrictEqual(s); // nothing JSON would drop or change
  });

  it('typed arrays survive as base64', () => {
    playSome();
    for (let i = 0; i < NC; i++) {
      WEAR[i] = ((i * 37) % 401) / 100.3; // float32 values with every mantissa bit in use
      WET[i] = (i % 97) / 96;
      PETALS[i] = ((i * 13) % 17) / 16;
      PAVEDAY[i] = (i % 600) - 300; // negative days too: an Int16 round trip
      ICE[i] = i % 2;
      if (KIND[i] === Kind.bed) BEDC[i] = i % 4;
    }
    WATER[I(40, 40)] = 0.6;
    const LAYERS = { KIND, WEAR, OCC, WATER, ICE, WET, PETALS, BEDC, PAVEDAY };
    const before = Object.fromEntries(Object.entries(LAYERS).map(([k, a]) => [k, bytes(a)]));
    const s = clone(snapshot());
    for (const [k, a] of Object.entries(LAYERS)) {
      const text = s.layers[k as keyof typeof s.layers];
      expect(text).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(Buffer.from(text, 'base64').length).toBe(a.byteLength);
    }
    newPark(5);
    restore(s);
    for (const [k, a] of Object.entries(LAYERS)) expect([k, bytes(a)]).toEqual([k, before[k]]);
    expect(savePark()).toBe(true);
    newPark(5);
    restore(loadPark() as ParkSaveV1);
    for (const [k, a] of Object.entries(LAYERS)) expect([k, bytes(a)]).toEqual([k, before[k]]);
  });

  it('the excluded things are excluded', () => {
    const s = snapshot();
    expect(Object.keys(s).sort()).toEqual(
      ['alumni', 'creatures', 'effects', 'feed', 'ids', 'layers', 'log', 'mode', 'pace', 'paving', 'pairs', 'pinnedPair', 'props', 'regulars',
        'rng', 'sched', 'seed', 'sides', 'tally', 'tick', 'treeTurn', 'v', 'visitors', 'weather'].sort(),
    );
    const banned = /^(undo|stack|cam|camera|selection|selected|armed|tool|toast|particles|parts|speed)$/i;
    const found: string[] = [];
    const walk = (v: unknown, path: string): void => {
      if (v === null || typeof v !== 'object') return;
      for (const [k, x] of Object.entries(v)) {
        if (path === 'park' && k === 'log') continue; // the commands are saved as they were sent (a `tool` payload, a `speed` command)
        if (banned.test(k)) found.push(path + '.' + k);
        walk(x, path + '.' + k);
      }
    };
    walk(s, 'park');
    expect(found).toEqual([]);
    // the same park with an undo entry, another dial, the camera moved and particles alive saves to the same text
    expect(tool({ tool: 'lamp', at: at(5, 5) }).ok).toBe(true);
    clearParticles();
    const plain = JSON.stringify(snapshot());
    expect(depth()).toBe(1);
    setSpeed(7);
    cam.ox += 50;
    cam.z = 2.2;
    addPart({ k: 'heart', x: 5, y: 5, z: 0.8, vx: 0, vy: 0, vz: 1, l: 1, m: 1, ph: 0 });
    expect([T.speed, particles().length]).toEqual([7, 1]);
    const busy = JSON.stringify(snapshot());
    clearUndo(); // a placement reserves no id, so the ids state stays as it was
    expect(JSON.stringify(snapshot())).toBe(busy);
    expect(busy).toBe(plain);
    clearParticles();
  });

  // 08 2.6: the starter park with 100 extra props and 30 visitors serialises under 1,048,576 bytes; the 600-entry log included
  it('size under 1 MB', () => {
    const before = props.length;
    const kinds: ToolId[] = ['lamp', 'bench', 'tree'];
    let placed = 0;
    for (let y = 1; y < N - 1 && placed < 100; y += 2)
      for (let x = 1; x < N - 1 && placed < 100; x += 2) {
        const t = kinds[placed % 3] as 'lamp' | 'bench' | 'tree';
        if (propAt(x, y) || !ghost(t, at(x, y)).ok) continue;
        expect(tool({ tool: t, at: at(x, y) }).ok).toBe(true);
        placed++;
      }
    expect(props.length - before).toBe(100);
    // 500 more real commands for a full log: a size-3 brush painted back and forth where nothing stands
    let c = at(0, 0);
    for (let y = 6; y < N - 6 && c.x === 0; y++)
      for (let x = 6; x < N - 6 && c.x === 0; x++) if (ghost('path', at(x, y), { size: 3 }).tiles.length === 13) c = at(x, y);
    expect(c.x).toBeGreaterThan(0);
    for (let k = 0; k < 500; k++) {
      const r = tool({ tool: k % 2 === 0 ? 'path' : 'lawn', at: c, size: 3, stroke: 100 + k });
      expect(r.ok).toBe(true);
    }
    expect(log()).toHaveLength(600);
    const s = snapshot();
    // 30 records of the 03 3.3 shape (with S4's `plan`) and a 40-tile path each stand in for a full park's people (entities/visitor.ts)
    for (let id = 1; id <= 30; id++)
      s.visitors.push({
        id, name: 'Amélie-Joséphine ' + id, sex: id % 2 ? 'f' : 'm', archetype: 'single', ageWord: 'grown', seeks: 'any', lookSeed: 123456789 + id,
        x: 12.345678901234 + id, y: 30.987654321 - id / 7, face: 1, st: 'walk', t: 1.2345678901,
        path: Array.from({ length: 40 }, (_, k) => ({ x: (id + k) % N, y: (id * 3 + k) % N })), pi: 3, ptx: 14, pty: 29,
        replanT: 0.6, blocked: 0, blockedList: [1, 2, 3, 4, 5, 6, 7, 8],
        job: { propId: 4, tile: { x: 3, y: 4 }, pairId: 2, visitorId: 9, creatureId: 0, kind: 'sit' },
        hunger: 0.123456789, energy: 0.87654321, comfort: 0.5555555, social: 0.33333333,
        arrivedAt: 1.3333333, leaveAt: 1.7777777, gateIn: 'g_south_w', gateOut: null, pairId: id, coupleOf: 0, parentOf: 0, childOf: 0,
        items: { hat: true, purse: false, baguette: true, iceCream: false }, embToday: 1, embDay: 2, pendingEmb: null, regularId: 0,
        decideT: 0.98765, sitPropId: 4, basket: 0, shares: 0, cdUntil: 1234, spawnedForPlayer: false, plan: 2,
      });
    const text = JSON.stringify(s);
    expect(new TextEncoder().encode(text).length).toBeLessThan(1_048_576);
    expect(migratePark(text)?.visitors).toHaveLength(30); // the save format takes them as they are
    expect(savePark()).toBe(true);
    expect(new TextEncoder().encode(mem.map.get(PARK_KEY) ?? '').length).toBeLessThan(1_048_576);
  });
});

describe('keys, autosave and failures (08 2.6 row 6; register 3.11; 03 11; AGENTS 5 item 8)', () => {
  // 08 2.6: savePark() writes parque:park-v1 and parque:profile-v1; stepAutosave writes at 30 sim s and not at 29; a thrown localStorage
  // error is caught and emits one warn
  it('keys and autosave triggers', () => {
    expect([PARK_KEY, PROFILE_KEY]).toEqual(['parque:park-v1', 'parque:profile-v1']);
    expect(savePark()).toBe(true);
    expect([...mem.writes].sort()).toEqual([PARK_KEY, PROFILE_KEY]);
    expect([...mem.map.keys()].sort()).toEqual([PARK_KEY, PROFILE_KEY]);
    expect(JSON.parse(mem.map.get(PARK_KEY) ?? '{}').v).toBe(1);
    expect(JSON.parse(mem.map.get(PROFILE_KEY) ?? '{}').v).toBe(1);

    expect(AUTOSAVE_S).toBe(30);
    const perSecond = Math.round(1 / SIM_DT);
    resetAutosave();
    mem.writes = [];
    expect(stepAutosave(29 * perSecond)).toBe(false); // 29 sim seconds: nothing yet
    expect(mem.writes).toEqual([]);
    expect(stepAutosave(perSecond - 1)).toBe(false); // one step short of 30
    expect(mem.writes).toEqual([]);
    expect(stepAutosave(1)).toBe(true); // 30 sim seconds
    expect([...mem.writes].sort()).toEqual([PARK_KEY, PROFILE_KEY]);
    // frame by frame at 8x (nsMax 22 steps): the write comes on the frame that crosses 1800 steps, and the count starts over
    mem.writes = [];
    let frames = 0;
    while (mem.writes.length === 0 && frames < 200) {
      stepAutosave(22);
      frames++;
    }
    expect(frames).toBe(Math.ceil((30 * perSecond) / 22)); // 82 frames, 1804 steps
    for (let k = 0; k < 100; k++) expect(stepAutosave(0)).toBe(false); // paused: no sim time passes
    expect(mem.writes).toHaveLength(2);

    mem.failSet = true;
    expect(() => savePark()).not.toThrow();
    expect(warns).toHaveLength(1);
    expect(savePark()).toBe(false);
    expect(warns).toHaveLength(2);
    expect(warns[0]?.params).toEqual({ what: 'save.write', key: PARK_KEY });
    expect(() => stepAutosave(30 * perSecond)).not.toThrow();
    expect(warns).toHaveLength(3);
  });

  it('a storage that refuses every access never throws: one warn per call, and the profile falls back to its defaults', () => {
    playSome();
    expect(savePark()).toBe(true);
    installBlocked();
    // saveProfile before loadProfile: after the failed read the profile is held back and a write says nothing more (owner 2026-10-13)
    const calls: Array<[string, () => unknown]> = [
      ['savePark', savePark], ['saveBeforeNew', saveBeforeNew], ['loadPark', loadPark], ['saveProfile', saveProfile],
      ['loadProfile', loadProfile], ['clearPark', clearPark], ['clearAll', clearAll],
    ];
    for (const [name, fn] of calls) {
      warns = [];
      expect(fn, name).not.toThrow();
      expect([name, warns.length]).toEqual([name, 1]);
    }
    loadProfile(); // the read fails: the profile is held back
    warns = [];
    expect(saveProfile()).toBe(false); // nothing written, and the read already said why: no second warn
    expect(warns).toEqual([]);
    expect(() => hasPark()).not.toThrow();
    expect(hasPark()).toBe(false);
    expect(loadPark()).toBeNull();
    expect(loadProfile()).toEqual(getProfile());
    expect(getProfile().cp).toBe(0);
    install(mem);
    mem.failGet = true;
    warns = [];
    expect(loadPark()).toBeNull();
    expect(warns).toHaveLength(1);
    mem.failGet = false;
    mem.failRemove = true;
    warns = [];
    expect(clearPark()).toBe(false);
    expect(warns).toHaveLength(1);
    expect(loadPark()).not.toBeNull(); // the key is still there
  });

  it('savePark copies the dial into the profile, never the pause (03 4.6)', () => {
    setSpeed(5);
    savePark();
    expect(getProfile().settings.speed).toBe(5);
    expect(JSON.parse(mem.map.get(PROFILE_KEY) ?? '{}').settings.speed).toBe(5);
    setSpeed(0);
    savePark();
    expect(getProfile().settings.speed).toBe(5);
    setSpeed(1);
  });

  it('the profile write serial (updatedAt) moves on with each write that lands', () => {
    const n = getProfile().updatedAt;
    expect(saveProfile()).toBe(true);
    expect(savePark()).toBe(true);
    expect(getProfile().updatedAt).toBe(n + 2);
    expect(JSON.parse(mem.map.get(PROFILE_KEY) ?? '{}').updatedAt).toBe(n + 2);
    mem.failSet = true;
    expect(saveProfile()).toBe(false);
    expect(getProfile().updatedAt).toBe(n + 2);
  });
});

describe('Continue and New (03 11; 03 17 A24)', () => {
  it('loadPark gives null with no save; a damaged save is refused with one warn and Continue is not offered', () => {
    expect(loadPark()).toBeNull();
    expect(hasPark()).toBe(false);
    expect(warns).toEqual([]);
    mem.map.set(PARK_KEY, '{"v":1,"seed":');
    expect(hasPark()).toBe(false);
    expect(loadPark()).toBeNull();
    expect(warns).toHaveLength(1);
    expect(warns[0]?.params).toEqual({ what: 'save.parse', key: PARK_KEY });
    expect(savePark()).toBe(true); // the next write replaces the damaged key
    expect(hasPark()).toBe(true);
  });

  it('saveBeforeNew writes the park as it stands; clearPark removes the key and counts one more park played', () => {
    expect(tool({ tool: 'bench', at: at(5, 5) }).ok).toBe(true);
    const h = stateHash();
    expect(saveBeforeNew()).toBe(true);
    newPark(5);
    restore(loadPark() as ParkSaveV1);
    expect(stateHash()).toBe(h);
    const played = getProfile().parksPlayed;
    expect(clearPark()).toBe(true);
    expect(mem.map.has(PARK_KEY)).toBe(false);
    expect(hasPark()).toBe(false);
    expect(JSON.parse(mem.map.get(PROFILE_KEY) ?? '{}').parksPlayed).toBe(played + 1);
    expect(warns).toEqual([]);
  });

  it('clearAll removes both keys and puts the in-memory profile back to its defaults', () => {
    getProfile().cp = 12;
    expect(savePark()).toBe(true);
    expect(clearAll()).toBe(true);
    expect(mem.map.size).toBe(0);
    expect(getProfile().cp).toBe(0);
  });
});

type Probe = { hash: number; world: number; ids: ReturnType<typeof idsState>; tick: number };
const probe = (): Probe => ({ hash: stateHash(), world: worldHash(), ids: idsState(), tick: tick() });
/** One path of twoPaths: the probes, whether each tool entry applied, and the undo depth at the first probe. */
type PathRun = { at9: Probe; at11: Probe; ok: boolean[]; depth9: number };

/**
 * A removal (the tree tool fells starter tree 17: its id is reserved while the entry stands), a round trip through JSON, then the same
 * 11 tool entries on the live path and on the restored one: 10 benches and a lamp, with ticks between. Probes after 9 entries (the
 * felling's entry still on the live stack) and after 11 (it fell off the live stack at the tenth, which released id 17 there).
 */
function twoPaths(): { live: PathRun; restored: PathRun; h: number; hRestored: number } {
  steps(60);
  expect(tool({ tool: 'tree', at: at(9, 2) }).ok).toBe(true);
  expect([idsState().propReserved, depth()]).toEqual([[17], 1]);
  const h = stateHash();
  const s = clone(snapshot());
  const spots: Array<{ x: number; y: number }> = [];
  for (let y = 20; y < 46 && spots.length < 11; y += 2)
    for (let x = 4; x < 44 && spots.length < 11; x += 3) if (!propAt(x, y) && ghost('bench', at(x, y)).ok) spots.push(at(x, y));
  const path = (): PathRun => {
    const ok: boolean[] = [];
    for (let k = 0; k < 9; k++) ok.push(tool({ tool: 'bench', at: spots[k] as { x: number; y: number } }).ok);
    steps(100);
    const at9 = probe(), depth9 = depth();
    ok.push(tool({ tool: 'bench', at: spots[9] as { x: number; y: number } }).ok);
    ok.push(tool({ tool: 'lamp', at: spots[10] as { x: number; y: number } }).ok);
    steps(500);
    return { at9, at11: probe(), ok, depth9 };
  };
  const live = path();
  restore(s);
  const hRestored = stateHash();
  return { live, restored: path(), h, hRestored };
}

describe('a restore leaves every derived cache consistent (07 S3 step 9; 03 3.1, 3.2; 08 3.2 run 6)', () => {
  it('BLOCK, the water bodies, the props by id, the ids, the undo stack and the tree cycle', () => {
    expect(tool({ tool: 'pond', at: at(6, 30), size: 3, stroke: 1 }).ok).toBe(true);
    expect(tool({ tool: 'bench', at: at(12, 30) }).ok).toBe(true);
    expect(tool({ tool: 'tree', at: at(9, 2) }).ok).toBe(true); // a fell: id 17 reserved
    expect(tool({ tool: 'tree', at: at(14, 30) }).ok).toBe(true);
    expect(tool({ tool: 'remove', at: at(14, 30) }).ok).toBe(true);
    const s = clone(snapshot());
    const ids = idsState(), cycle = nextSpecies();
    newPark(5); // another world: BLOCK, the bodies and the props all change
    restore(s);
    const expected = new Uint8Array(NC);
    for (let i = 0; i < NC; i++) expected[i] = KIND[i] === Kind.bed || KIND[i] === Kind.pond || KIND[i] === Kind.canal || OCC[i] !== 0 ? 1 : 0;
    for (const p of props) if (p.kind === 'bridge') for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) expected[I(x, y)] = 0;
    expect(Array.from(BLOCK)).toEqual(Array.from(expected)); // rebuilt by the restore itself, before any tool runs
    expect(BLOCK[I(12, 30)]).toBe(1);
    let water = 0;
    for (let i = 0; i < NC; i++) if (KIND[i] === Kind.pond || KIND[i] === Kind.canal) water++;
    expect(waterBodies().reduce((n, b) => n + b.size, 0)).toBe(water);
    for (const p of props) expect(propById(p.id)).toBe(p);
    for (let i = 0; i < NC; i++) if (OCC[i] !== 0) expect(propById(OCC[i] as number)?.passable).toBe(false);
    expect(idsState()).toEqual(ids);
    expect([canUndo(), depth()]).toEqual([false, 0]);
    expect(nextSpecies()).toBe(cycle);
    expect(tool({ tool: 'lamp', at: at(20, 4) }).ok).toBe(true); // the tools work on the restored world
  });

  it('after a restore, the paths agree while the entry that reserved an id would still be on the live stack (08 2.6 row 1)', () => {
    const r = twoPaths();
    expect(r.hRestored).toBe(r.h);
    expect(r.live.ok).toEqual(Array(11).fill(true));
    expect(r.restored.ok).toEqual(r.live.ok);
    expect(r.restored.at9).toEqual(r.live.at9);
    expect(r.live.at9.ids.propReserved).toEqual([17]);
    // the felling's entry and nine more fill the live stack, so the tenth pushes it off there; the restored stack holds only the nine
    expect([r.live.depth9, r.restored.depth9]).toEqual([UNDO_DEPTH, UNDO_DEPTH - 1]);
  });

  // KNOWN LIMITATION, kept by the owner on 2026-10-13 (Slice 3 hand-back question 10, answered "N"; 03 section 17 open points): the
  // restore empties the undo stack (register 3.11; owner 2026-10-13) but keeps the ids the snapshot holds reserved, as the round trip's
  // hash needs (08 2.6 row 1). No entry on the restored path will ever release them, while the live path releases each when its entry
  // leaves the stack (03 5.6 item 3: 10 more entries, or a clearUndo such as S7's avatar.enter). From then on the two paths hand out
  // different PropIds and their state hashes part; the player sees no difference (the same props in the same places, only their ids
  // differ). Making them agree would need reservations that end only at park.new, or the release schedule saved with the ids (03 3.10
  // excludes the undo stack); the owner declined both. `it.fails` pins the gap as kept: should the paths ever agree this test fails, and
  // the owner's decision is to be revisited before it becomes a plain `it`.
  it.fails('after a restore, 11 more tool entries on both paths give the same stateHash, worldHash and ids (known limitation, owner 2026-10-13)', () => {
    const r = twoPaths();
    expect(r.restored.at11).toEqual(r.live.at11);
  });
});
