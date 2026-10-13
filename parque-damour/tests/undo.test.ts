// tests/undo.test.ts
// Locks the undo of the park tools: register 3.7 (10 deep, park tools only, command based), 02 8.5, 03 5.6 (inverse records grouped by
// stroke, removed props back under their old ids, logged, cleared by a new park), 03 3.1 and 2.3 ids.ts (reserved ids), register 3.11
// (never saved, so a restore empties it; owner 2026-10-13), 03 5.5 item 2 (a replay from a snapshot reproduces only the undos of entries
// recorded after it; an undo of an earlier entry is reason.nothing_to_undo; owner 2026-10-13), 02 8.3 (an undone tree hands its species
// back). 08 2.5 undo.test.ts rows.
import { describe, it, expect, beforeEach } from 'vitest';
import { SIM_DT, newPark, simulate, tick } from '../src/core/loop.ts';
import { T } from '../src/core/clock.ts';
import { W } from '../src/core/weather.ts';
import { applyNow, enqueue, log, replay, type Command, type CommandInput, type Result, type ToolPayload } from '../src/core/commands.ts';
import { clearListeners, on, type GameEvent } from '../src/core/events.ts';
import { rngN } from '../src/core/rng.ts';
import { idsState } from '../src/core/ids.ts';
import { restore, snapshot, stateHash, worldHash } from '../src/save/store.ts';
import type { ParkSaveV1 } from '../src/save/schema.ts';
import { I, KIND, Kind, OCC, propById, props, removeProp } from '../src/world/grid.ts';
import { setMode } from '../src/play/mode.ts';
import { nextSpecies, propAt } from '../src/play/tools.ts';
import { UNDO_DEPTH, canUndo, clearUndo, depth } from '../src/play/undo.ts';
import { byId, spawnVisitor, visitors, type Visitor } from '../src/entities/visitor.ts';
import { vendorFor } from '../src/entities/staff.ts';

const tool = (payload: ToolPayload): Result => applyNow({ side: 'park', kind: 'tool', payload });
const undo = (): Result => applyNow({ side: 'park', kind: 'undo', payload: {} });
const reasonOf = (r: Result): string => (r.ok ? 'ok' : r.reason);
const at = (x: number, y: number): { x: number; y: number } => ({ x, y });

beforeEach(() => {
  clearListeners();
  newPark(101);
  setMode('creator');
});

/** Every tool, and every repeat tap, on the starter park of seed 101 (02 2.5); `setup` runs before the hash is taken. */
const CASES: Array<{ name: string; setup?: ToolPayload; cmd: ToolPayload }> = [
  { name: 'path', cmd: { tool: 'path', at: at(31, 14), size: 3, stroke: 1 } },
  { name: 'lawn', cmd: { tool: 'lawn', at: at(20, 10), size: 2, stroke: 2 } },
  { name: 'lawn over a bed', cmd: { tool: 'lawn', at: at(19, 19), size: 1, stroke: 3 } },
  { name: 'bed', cmd: { tool: 'bed', at: at(5, 5) } },
  { name: 'bed colour', setup: { tool: 'bed', at: at(5, 5) }, cmd: { tool: 'bed', at: at(5, 5) } },
  { name: 'hedge', cmd: { tool: 'hedge', tiles: [at(1, 5), at(14, 5)] } },
  { name: 'tree', cmd: { tool: 'tree', at: at(5, 5) } },
  { name: 'tree removed', cmd: { tool: 'tree', at: at(9, 2) } },
  { name: 'pond', cmd: { tool: 'pond', at: at(5, 5), size: 3, stroke: 4 } },
  { name: 'canal', cmd: { tool: 'canal', tiles: [at(5, 5), at(5, 12)] } },
  { name: 'bridge', cmd: { tool: 'bridge', at: at(31, 12) } },
  { name: 'bench', cmd: { tool: 'bench', at: at(5, 5) } },
  { name: 'bench turned', cmd: { tool: 'bench', at: at(31, 24) } },
  { name: 'picnic', cmd: { tool: 'picnic', at: at(5, 5) } },
  { name: 'lamp', cmd: { tool: 'lamp', at: at(5, 5) } },
  { name: 'fountain', cmd: { tool: 'fountain', at: at(3, 3) } },
  { name: 'kiosk', cmd: { tool: 'kiosk', at: at(3, 3) } },
  { name: 'bandstand', cmd: { tool: 'bandstand', at: at(3, 3) } },
  { name: 'remove a bench', cmd: { tool: 'remove', at: at(31, 24) } },
  { name: 'remove the kiosk', cmd: { tool: 'remove', at: at(15, 45) } },
  { name: 'remove a table', cmd: { tool: 'remove', at: at(16, 45) } },
  { name: 'remove the bridge', cmd: { tool: 'remove', at: at(34, 11) } },
];

describe('every tool undoes to the same hash (03 5.6 item 3; 08 2.5 undo row 1)', () => {
  it('stateHash and worldHash before the command equal them after the undo, ids included', () => {
    for (const c of CASES) {
      newPark(101);
      if (c.setup) expect(reasonOf(tool(c.setup)), c.name).toBe('ok');
      const h0 = stateHash(), w0 = worldHash(), ids0 = JSON.stringify(idsState()), n0 = props.length;
      expect(reasonOf(tool(c.cmd)), c.name).toBe('ok');
      expect(worldHash(), c.name).not.toBe(w0);
      expect(reasonOf(undo()), c.name).toBe('ok');
      expect(stateHash(), c.name).toBe(h0);
      expect(worldHash(), c.name).toBe(w0);
      expect(JSON.stringify(idsState()), c.name).toBe(ids0);
      expect(props.length, c.name).toBe(n0);
    }
  });

  it('a placement that took a recycled id hands it back to the head of the free queue', () => {
    removeProp(2); // a starter bench: id 2 joins the free queue
    const ids0 = idsState();
    expect(ids0.propFree).toEqual([2]);
    const h0 = stateHash();
    tool({ tool: 'lamp', at: at(5, 5) });
    expect(propAt(5, 5)?.id).toBe(2);
    expect(idsState().propFree).toEqual([]);
    undo();
    expect(idsState()).toEqual(ids0);
    expect(stateHash()).toBe(h0);
  });

  it('an undone planting hands its species back to the tree cycle; an undone felling leaves the cycle alone (02 8.3 tree row)', () => {
    tool({ tool: 'tree', at: at(3, 5) });
    tool({ tool: 'tree', at: at(5, 5) });
    expect([propAt(3, 5)?.data.species, propAt(5, 5)?.data.species, nextSpecies()]).toEqual([0, 1, 2]);
    undo(); // the chestnut goes: the next tree is a chestnut again
    expect(nextSpecies()).toBe(1);
    tool({ tool: 'tree', at: at(7, 5) });
    expect(propAt(7, 5)?.data.species).toBe(1);
    tool({ tool: 'tree', at: at(3, 5) }); // fell the plane
    expect(nextSpecies()).toBe(2);
    undo(); // the plane stands again; the cycle did not move either way
    expect([propAt(3, 5)?.data.species, nextSpecies()]).toEqual([0, 2]);
  });

  it('a stack of commands undoes back to the park it started from', () => {
    const h0 = stateHash();
    tool({ tool: 'kiosk', at: at(3, 3) });
    tool({ tool: 'remove', at: at(5, 4) }); // one of its tables
    tool({ tool: 'tree', at: at(8, 8) });
    tool({ tool: 'tree', at: at(8, 8) }); // and it goes again
    tool({ tool: 'remove', at: at(15, 44) }); // the starter kiosk and its tables
    tool({ tool: 'path', at: at(9, 9), size: 1, stroke: 5 }); // not a valid path tile (the loop's gravel): rejected, no entry
    expect(depth()).toBe(5);
    for (let k = 0; k < 5; k++) expect(reasonOf(undo())).toBe('ok');
    expect(stateHash()).toBe(h0);
  });
});

describe('ten deep (register 3.7; 06 1.4 UNDO_DEPTH; GV beginStroke 11091)', () => {
  it('11 strokes then 11 undos: the 11th is reason.nothing_to_undo and the first stroke stays', () => {
    expect(UNDO_DEPTH).toBe(10);
    for (let k = 0; k < 11; k++) expect(reasonOf(tool({ tool: 'path', at: at(2 + k, 3), size: 1, stroke: k + 1 }))).toBe('ok');
    expect(depth()).toBe(10);
    for (let k = 0; k < 10; k++) expect(reasonOf(undo())).toBe('ok');
    expect(reasonOf(undo())).toBe('reason.nothing_to_undo');
    expect(KIND[I(2, 3)]).toBe(Kind.gravel); // the first stroke fell off the bottom
    for (let k = 1; k < 11; k++) expect(KIND[I(2 + k, 3)]).toBe(Kind.lawn);
  });

  it('an id reserved by a removal is held while its entry is on the stack, then freed when it falls off', () => {
    tool({ tool: 'tree', at: at(9, 2) }); // removes starter tree id 17
    expect(idsState().propReserved).toEqual([17]);
    for (let k = 0; k < 9; k++) tool({ tool: 'lamp', at: at(2 + k, 6) });
    expect(props.some((p) => p.id === 17)).toBe(false); // never handed out while reserved
    expect(idsState().propReserved).toEqual([17]);
    tool({ tool: 'lamp', at: at(2, 8) }); // the 11th entry: the removal leaves the stack
    expect(idsState().propReserved).toEqual([]);
    expect(idsState().propFree).toEqual([17]);
  });
});

describe('a stroke is one entry (03 5.6 item 2; GV beginStroke 11091)', () => {
  it('7 brush commands with one stroke id undo in one undo', () => {
    const w0 = worldHash();
    for (let k = 0; k < 7; k++) expect(reasonOf(tool({ tool: 'path', at: at(2 + k, 4), size: 2, stroke: 42 }))).toBe('ok');
    expect(depth()).toBe(1);
    expect(reasonOf(undo())).toBe('ok');
    expect(worldHash()).toBe(w0);
    expect(canUndo()).toBe(false);
  });

  it('another stroke id, or any other tool between, starts a new entry', () => {
    tool({ tool: 'path', at: at(2, 4), size: 1, stroke: 1 });
    tool({ tool: 'path', at: at(3, 4), size: 1, stroke: 1 });
    tool({ tool: 'path', at: at(4, 4), size: 1, stroke: 2 });
    tool({ tool: 'bench', at: at(6, 6) });
    tool({ tool: 'path', at: at(5, 4), size: 1, stroke: 2 });
    expect(depth()).toBe(4);
  });
});

describe('undo restores ids and vendors (03 5.6 item 3)', () => {
  it('a removed kiosk comes back with its old PropId and its tables, and OCC matches', () => {
    const k = propById(8);
    expect(k?.kind).toBe('kiosk');
    const occ = [I(14, 44), I(15, 45), I(16, 44), I(16, 45)].map((i) => OCC[i]);
    expect(occ).toEqual([8, 8, 9, 10]);
    tool({ tool: 'remove', at: at(14, 44) });
    expect([propById(8), propById(9), propById(10)]).toEqual([undefined, undefined, undefined]);
    expect(idsState().propReserved).toEqual([8, 9, 10]);
    undo();
    expect([propById(8)?.kind, propById(9)?.kind, propById(10)?.kind]).toEqual(['kiosk', 'table', 'table']);
    expect(propById(8)?.data.tableIds).toEqual([9, 10]);
    expect([I(14, 44), I(15, 45), I(16, 44), I(16, 45)].map((i) => OCC[i])).toEqual(occ);
    expect(idsState().propReserved).toEqual([]);
  });

  it('the kiosk\'s vendor comes back with the kiosk: the same record under its own VisitorId, and the hash as before the removal (S4)', () => {
    tool({ tool: 'kiosk', at: at(3, 3) });
    const k = propAt(3, 3);
    const v = visitors.find((o) => o.archetype === 'vendor') as Visitor;
    const rec = JSON.stringify(v);
    const h0 = stateHash();
    tool({ tool: 'remove', at: at(3, 3) });
    expect(byId(v.id)).toBeUndefined();
    undo();
    expect(JSON.stringify(byId(v.id))).toBe(rec);
    expect([propById(k?.id ?? 0)?.data.vendorId, vendorFor(k?.id ?? 0)]).toEqual([v.id, v.id]);
    expect(stateHash()).toBe(h0);
  });

  it('the undo of a kiosk placement hands its vendor\'s VisitorId back: the next visitor gets it again (S4; 08 2.5 undo row 1)', () => {
    const id0 = idsState().visitor;
    const n0 = rngN();
    tool({ tool: 'kiosk', at: at(3, 3) });
    expect(idsState().visitor).toBe(id0 + 1);
    expect(rngN()).toBe(n0); // the vendor's spawn draws nothing
    undo();
    expect([idsState().visitor, visitors.length, rngN()]).toEqual([id0, 0, n0]);
    expect((spawnVisitor('elder', 'g_west') as Visitor).id).toBe(id0 + 1);
  });

  it('a visitor on a tile the undo made occupied moves to the nearest open tile within 3 (02 8.5 item 3; GV openNear 1559)', () => {
    tool({ tool: 'remove', at: at(31, 24) }); // a starter bench
    const v = spawnVisitor('single', 'g_east') as Visitor;
    v.x = 31;
    v.y = 24;
    v.path = null;
    undo(); // the bench is back on (31, 24)
    expect(propAt(31, 24)?.kind).toBe('bench');
    const [x, y] = [Math.round(v.x), Math.round(v.y)];
    expect([x, y]).not.toEqual([31, 24]);
    expect(Math.max(Math.abs(x - 31), Math.abs(y - 24))).toBeLessThanOrEqual(3);
    expect(OCC[I(x, y)]).toBe(0);
  });
});

describe('undo is logged and cleared (03 5.6 items 4 and 5; 02 8.5 item 4; register 3.11)', () => {
  it('log() holds the undo command; an empty stack is reason.nothing_to_undo with a `rejected` event', () => {
    tool({ tool: 'lamp', at: at(5, 5) });
    undo();
    expect(log().map((c) => c.kind)).toEqual(['tool', 'undo']);
    const seen: GameEvent[] = [];
    on('rejected', (e) => seen.push(e));
    expect(reasonOf(undo())).toBe('reason.nothing_to_undo');
    expect(seen.map((e) => e.params?.reason)).toEqual(['reason.nothing_to_undo']);
    expect(log()).toHaveLength(2);
  });

  it('park.new (the command and newPark) gives canUndo() === false', () => {
    tool({ tool: 'lamp', at: at(5, 5) });
    expect(canUndo()).toBe(true);
    expect(applyNow({ side: 'park', kind: 'park.new', payload: { seed: 7 } }).ok).toBe(true);
    expect(canUndo()).toBe(false);
    tool({ tool: 'lamp', at: at(5, 5) });
    newPark(101);
    expect([canUndo(), depth()]).toEqual([false, 0]);
  });

  it('clearUndo empties the stack and frees the ids its entries reserved', () => {
    tool({ tool: 'tree', at: at(9, 2) });
    clearUndo();
    expect(canUndo()).toBe(false);
    expect(idsState().propReserved).toEqual([]);
    expect(idsState().propFree).toEqual([17]);
  });

  it('in avatar mode undo is reason.not_in_avatar (03 5.3)', () => {
    tool({ tool: 'lamp', at: at(5, 5) });
    setMode('avatar', 'a_pigeon', 1);
    expect(reasonOf(undo())).toBe('reason.not_in_avatar');
    setMode('creator');
    expect(depth()).toBe(1);
  });

  it.todo('avatar.enter gives canUndo() === false (needs the avatar command: S7 play/avatar.ts calls clearUndo; 07 S7)');
});

const snap = (): ParkSaveV1 => JSON.parse(JSON.stringify(snapshot())) as ParkSaveV1;

describe('a restore empties the undo stack (register 3.11 "undo-irrelevant"; 03 3.10; owner 2026-10-13: a load clears the history)', () => {
  it('an entry recorded before the restore never reverts the restored world, even where a PropId was handed out again', () => {
    tool({ tool: 'lamp', at: at(5, 5) });
    const lampId = propAt(5, 5)?.id;
    const s = snap();
    undo();
    tool({ tool: 'bench', at: at(7, 7) });
    expect(propAt(7, 7)?.id).toBe(lampId); // the lamp's id went back to the counter and on to the bench
    restore(s);
    expect([canUndo(), depth()]).toEqual([false, 0]);
    expect(reasonOf(undo())).toBe('reason.nothing_to_undo');
    expect([propAt(5, 5)?.kind, propAt(5, 5)?.id]).toEqual(['lamp', lampId]); // the stale bench entry did not remove it
  });

  it('the ids the snapshot holds reserved stay reserved, so the round trip keeps the state hash (08 2.6 row 1)', () => {
    tool({ tool: 'tree', at: at(9, 2) }); // fells starter tree 17: its id is reserved
    const h = stateHash();
    restore(snap());
    expect(depth()).toBe(0);
    expect(idsState().propReserved).toEqual([17]);
    expect(stateHash()).toBe(h);
  });

  it('the tree cycle after a restore is the restored player trees mod 3 (part B saves the cycle itself)', () => {
    tool({ tool: 'tree', at: at(3, 5) });
    tool({ tool: 'tree', at: at(5, 5) });
    const s = snap();
    tool({ tool: 'tree', at: at(7, 5) });
    expect(nextSpecies()).toBe(0);
    restore(s);
    expect(nextSpecies()).toBe(2);
  });
});

/** Enqueue `c` (applied in the next step), then run `n` steps. */
function then(c: CommandInput | null, n: number): void {
  if (c) enqueue(c);
  for (let k = 0; k < n; k++) simulate(SIM_DT, 1);
}
const toolCmd = (payload: ToolPayload): CommandInput => ({ side: 'park', kind: 'tool', payload });
const undoCmd: CommandInput = { side: 'park', kind: 'undo', payload: {} };

describe('a replay from a snapshot reproduces only the undos of entries recorded after it (03 5.5 item 2, 5.6 item 4; 08 3.2 run 5)', () => {
  it('tools and an undo logged after the snapshot replay to the same hash, with no rejection', () => {
    then(null, 50);
    const s = snap();
    then(toolCmd({ tool: 'bench', at: at(5, 5) }), 20);
    then(toolCmd({ tool: 'path', at: at(3, 8), size: 2, stroke: 9 }), 6);
    then(toolCmd({ tool: 'path', at: at(4, 8), size: 2, stroke: 9 }), 20);
    then(undoCmd, 20); // takes the stroke back, not the bench
    const h1 = stateHash(), t1 = tick();
    const after: Command[] = log().filter((c) => c.tick > s.tick).map((c) => ({ ...c }));
    expect(after.map((c) => c.kind)).toEqual(['tool', 'tool', 'tool', 'undo']);
    const rejected: string[] = [];
    on('rejected', (e) => rejected.push(String(e.params?.reason)));
    restore(s);
    replay(after, t1);
    expect(rejected).toEqual([]);
    expect(stateHash()).toBe(h1);
    expect([propAt(5, 5)?.kind, KIND[I(3, 8)]]).toEqual(['bench', Kind.lawn]);
  });

  it('an undo of an entry recorded before the snapshot is reason.nothing_to_undo in the replay and removes nothing (owner 2026-10-13)', () => {
    then(toolCmd({ tool: 'bench', at: at(5, 5) }), 50);
    const s = snap();
    then(undoCmd, 20); // live, it takes the bench back
    expect(propAt(5, 5)).toBeUndefined();
    const after: Command[] = log().filter((c) => c.tick > s.tick).map((c) => ({ ...c }));
    const rejected: string[] = [];
    on('rejected', (e) => rejected.push(String(e.params?.reason)));
    restore(s);
    replay(after, s.tick + 20);
    expect(rejected).toEqual(['reason.nothing_to_undo']); // the stack is not in the snapshot (03 3.10), so the replay cannot reach it
    expect(propAt(5, 5)?.kind).toBe('bench');
  });
});

describe('undo never touches the rest (02 8.5 item 3)', () => {
  it('the tick, the clock, the weather and the sim stream are unchanged by an undo', () => {
    tool({ tool: 'pond', at: at(5, 5), size: 3, stroke: 1 });
    const before = { tick: tick(), abs: T.abs, day: T.day, f: T.f, w: JSON.stringify(W), n: rngN() };
    undo();
    expect({ tick: tick(), abs: T.abs, day: T.day, f: T.f, w: JSON.stringify(W), n: rngN() }).toEqual(before);
  });

  it.todo('a Parted pair is unchanged by an undo (needs pairs: S5 entities/romance.ts; 07 S5)');
  it.todo('an ability cooldown is unchanged by an undo (needs abilities: S6 play/abilities.ts; 07 S6)');
});
