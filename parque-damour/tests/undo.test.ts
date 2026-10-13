// tests/undo.test.ts
// Locks the undo of the park tools: register 3.7 (10 deep, park tools only, command based), 02 8.5, 03 5.6 (inverse records grouped by
// stroke, removed props back under their old ids, logged, cleared by a new park), 03 3.1 and 2.3 ids.ts (reserved ids), register 3.11
// (never saved). 08 2.5 undo.test.ts rows.
import { describe, it, expect, beforeEach } from 'vitest';
import { newPark, tick } from '../src/core/loop.ts';
import { T } from '../src/core/clock.ts';
import { W } from '../src/core/weather.ts';
import { applyNow, log, type Result, type ToolPayload } from '../src/core/commands.ts';
import { clearListeners, on, type GameEvent } from '../src/core/events.ts';
import { rngN } from '../src/core/rng.ts';
import { idsState } from '../src/core/ids.ts';
import { stateHash, worldHash } from '../src/save/store.ts';
import { I, KIND, Kind, OCC, propById, props, removeProp } from '../src/world/grid.ts';
import { setMode } from '../src/play/mode.ts';
import { propAt } from '../src/play/tools.ts';
import { UNDO_DEPTH, canUndo, clearUndo, depth } from '../src/play/undo.ts';

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

  it.todo('the kiosk\'s vendor comes back with the kiosk (needs staff: S4 entities/staff.ts vendorReturn; 07 S4)');
  it.todo('a visitor on a tile the undo made water or occupied moves to the nearest open tile (needs visitors: S4 entities/visitor.ts moveOffBlocked, GV openNear 1559; 07 S4)');
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
