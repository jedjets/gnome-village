// tests/commands.test.ts
// Locks register 2.9 / 03 5 / 02 14 / 08 2.1: enqueue stamps tick + 1 and a rising seq; commands apply in (tick, side, seq) order; a future
// tick waits; the log keeps 600; a rejected command is not logged; the side and mode rules of 03 5.3; replay. Also core/ids (03 2.3, 3.1).
import { describe, it, expect, beforeEach } from 'vitest';
import { SIM_DT, newPark, setSpeed, setTick, simulate, tick } from '../src/core/loop.ts';
import {
  LOG_CAP, OK, applyCommand, applyNow, applyPending, enqueue, fail, log, pendingCount, registerHandler, replay, resetCommands, type Command,
} from '../src/core/commands.ts';
import { clearListeners, drain, watch, type GameEvent } from '../src/core/events.ts';
import { T } from '../src/core/clock.ts';
import { W } from '../src/core/weather.ts';
import { getMode, getPlayer, setMode } from '../src/play/mode.ts';
import { stateHash, restore, snapshot } from '../src/save/store.ts';
import {
  PROP_ID_MAX, freePropId, idsState, nextCreatureId, nextEffectId, nextPairId, nextPropId, nextVisitorId, reclaimPropId, releasePropId, resetIds,
  setIdsState,
} from '../src/core/ids.ts';

const applied: string[] = [];
let rejected: GameEvent[] = [];

/** Handlers for the kinds S2 leaves unapplied, so the ordering and rule tests have something to call. */
function install(): void {
  registerHandler('tool', (c) => (applied.push('tool:' + c.seq), OK));
  registerHandler('ability', (c) => (applied.push('ability:' + c.side + ':' + c.seq), OK));
  registerHandler('avatar.enter', () => OK);
  registerHandler('undo', () => fail('reason.nothing_to_undo'));
}
/** A command as a buggy or hostile caller could build it: the types are not checked. */
const bad = (c: unknown): Command => ({ tick: 1, seq: 1, ...(c as object) }) as Command;
const tool = (x = 0): Parameters<typeof enqueue>[0] => ({ side: 'park', kind: 'tool', payload: { tool: 'bed', at: { x, y: 0 } } });

beforeEach(() => {
  clearListeners();
  setMode('creator');
  newPark(1);
  setSpeed(1);
  applied.length = 0;
  rejected = [];
  watch('rejected', (e) => rejected.push(e));
  install();
});

describe('core/commands enqueue and applyPending (03 5.2)', () => {
  it('enqueue stamps tick + 1 and a seq that rises by 1', () => {
    setTick(10);
    const a = enqueue(tool());
    const b = enqueue(tool());
    expect(a.tick).toBe(11);
    expect(b.tick).toBe(11);
    expect(b.seq).toBe(a.seq + 1);
    expect(pendingCount()).toBe(2);
  });
  it('applyPending orders by tick, then side park < cupid < mischief, then seq', () => {
    const m = enqueue({ side: 'mischief', kind: 'ability', payload: { id: 'm_pigeon', target: { kind: 'park' } } });
    const c = enqueue({ side: 'cupid', kind: 'ability', payload: { id: 'c_petals', target: { kind: 'park' } } });
    const p = enqueue(tool());
    const p2 = enqueue(tool(1));
    applyPending(1);
    expect(applied).toEqual(['tool:' + p.seq, 'tool:' + p2.seq, 'ability:cupid:' + c.seq, 'ability:mischief:' + m.seq]);
    expect(pendingCount()).toBe(0);
  });
  it('with a kind filter only that kind applies; the others stay queued in order (the paused frame, 03 4.6)', () => {
    const c = enqueue({ side: 'cupid', kind: 'ability', payload: { id: 'c_petals', target: { kind: 'park' } } });
    const p = enqueue(tool());
    enqueue({ side: 'park', kind: 'speed', payload: { speed: 3 } });
    applyPending(1, 'speed');
    expect(T.speed).toBe(3);
    expect(applied).toEqual([]);
    expect(pendingCount()).toBe(2);
    applyPending(1);
    expect(applied).toEqual(['tool:' + p.seq, 'ability:cupid:' + c.seq]);
  });
  it('a command for a future tick waits, and is applied at its own tick', () => {
    setTick(10);
    enqueue(tool()); // tick 11
    applyPending(10);
    expect(applied).toEqual([]);
    applyPending(11);
    expect(applied).toHaveLength(1);
  });
  it('simulate applies a command in the step after it was enqueued, before the clock moves', () => {
    enqueue({ side: 'park', kind: 'debug.weather', payload: { kind: 'snow' } });
    expect(W.kind).toBe('fair');
    simulate(SIM_DT, 0);
    expect(tick()).toBe(1);
    expect(W.kind).toBe('snow');
  });
  it('a park.new in a batch drops the commands queued behind it (they belonged to the old park)', () => {
    enqueue({ side: 'park', kind: 'park.new', payload: { seed: 5 } });
    enqueue(tool());
    simulate(SIM_DT, 0);
    expect(applied).toEqual([]);
    expect(tick()).toBe(0);
    expect(pendingCount()).toBe(0);
  });
});

describe('core/commands the log and rejection (03 5.2 item 3, 5.4)', () => {
  it('the log keeps the last 600: 650 applied commands leave the 51st first', () => {
    expect(LOG_CAP).toBe(600);
    for (let i = 0; i < 650; i++) applyNow(tool(i));
    expect(log()).toHaveLength(600);
    const first = log()[0];
    expect(first?.kind === 'tool' && 'at' in first.payload ? first.payload.at.x : -1).toBe(50);
  });
  it('a command no module applies is rejected reason.not_here, not logged, and emits one rejected event', () => {
    const r = applyNow({ side: 'park', kind: 'visitor.call', payload: { gate: null } });
    expect(r).toEqual({ ok: false, reason: 'reason.not_here' });
    expect(log()).toHaveLength(0);
    drain(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.params).toMatchObject({ reason: 'reason.not_here', side: 'park', kind: 'visitor.call' });
  });
  it('a handler that refuses is rejected with its reason and not logged', () => {
    const r = applyNow({ side: 'park', kind: 'undo', payload: {} });
    expect(r).toEqual({ ok: false, reason: 'reason.nothing_to_undo' });
    expect(log()).toHaveLength(0);
    drain(0);
    expect(rejected).toHaveLength(1);
  });
  it('an applied command emits applied', () => {
    const seen: GameEvent[] = [];
    watch('applied', (e) => seen.push(e));
    applyNow(tool());
    drain(0);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.params).toMatchObject({ kind: 'tool', side: 'park' });
  });
});

describe('core/commands side and mode rules (03 5.3)', () => {
  it('a tool from cupid and an ability from the other side are wrong_side and not logged', () => {
    expect(applyCommand(bad({ side: 'cupid', kind: 'tool', payload: { tool: 'bed', at: { x: 0, y: 0 } } }))).toEqual({ ok: false, reason: 'reason.wrong_side' });
    expect(applyCommand(bad({ side: 'mischief', kind: 'ability', payload: { id: 'c_petals', target: { kind: 'park' } } }))).toEqual({ ok: false, reason: 'reason.wrong_side' });
    expect(applyCommand(bad({ side: 'cupid', kind: 'ability', payload: { id: 'm_pigeon', target: { kind: 'park' } } }))).toEqual({ ok: false, reason: 'reason.wrong_side' });
    expect(applyCommand(bad({ side: 'cupid', kind: 'speed', payload: { speed: 2 } }))).toEqual({ ok: false, reason: 'reason.wrong_side' });
    expect(log()).toHaveLength(0);
    expect(applied).toEqual([]);
  });
  it('avatar.tap and avatar.leave in creator mode are wrong_mode', () => {
    const tap = applyCommand(bad({ side: 'mischief', kind: 'avatar.tap', payload: { tile: { x: 1, y: 1 }, hit: { kind: 'tile', id: 0, tile: { x: 1, y: 1 } } } }));
    expect(tap).toEqual({ ok: false, reason: 'reason.wrong_mode' });
    expect(applyCommand(bad({ side: 'mischief', kind: 'avatar.leave', payload: {} }))).toEqual({ ok: false, reason: 'reason.wrong_mode' });
    expect(log()).toHaveLength(0);
  });
  it('avatar.enter needs the avatar\'s own side, and not while already an avatar', () => {
    expect(applyCommand(bad({ side: 'cupid', kind: 'avatar.enter', payload: { avatar: 'a_pigeon' } }))).toEqual({ ok: false, reason: 'reason.wrong_side' });
    expect(applyCommand(bad({ side: 'mischief', kind: 'avatar.enter', payload: { avatar: 'a_pigeon' } })).ok).toBe(true);
    setMode('avatar', 'a_pigeon', 7);
    expect(applyCommand(bad({ side: 'mischief', kind: 'avatar.enter', payload: { avatar: 'a_pomeranian' } }))).toEqual({ ok: false, reason: 'reason.wrong_mode' });
  });
  it('in avatar mode tool, undo and ability are not_in_avatar, and speed still applies', () => {
    setMode('avatar', 'a_pigeon', 7);
    expect(applyCommand(bad({ side: 'park', kind: 'tool', payload: { tool: 'bed', at: { x: 0, y: 0 } } }))).toEqual({ ok: false, reason: 'reason.not_in_avatar' });
    expect(applyCommand(bad({ side: 'park', kind: 'undo', payload: {} }))).toEqual({ ok: false, reason: 'reason.not_in_avatar' });
    expect(applyCommand(bad({ side: 'mischief', kind: 'ability', payload: { id: 'm_pigeon', target: { kind: 'park' } } }))).toEqual({ ok: false, reason: 'reason.not_in_avatar' });
    expect(applyCommand(bad({ side: 'park', kind: 'speed', payload: { speed: 4 } })).ok).toBe(true);
    expect(T.speed).toBe(4);
    // and the possessed avatar's side may leave
    registerHandler('avatar.leave', () => OK);
    expect(applyCommand(bad({ side: 'mischief', kind: 'avatar.leave', payload: {} })).ok).toBe(true);
    expect(applyCommand(bad({ side: 'cupid', kind: 'avatar.leave', payload: {} }))).toEqual({ ok: false, reason: 'reason.wrong_side' });
  });
});

describe('core/commands the S2 kinds', () => {
  it('speed sets the dial and pause', () => {
    expect(applyNow({ side: 'park', kind: 'speed', payload: { speed: 8 } }).ok).toBe(true);
    expect(T.speed).toBe(8);
    applyNow({ side: 'park', kind: 'speed', payload: { speed: 0 } });
    expect(T.speed).toBe(0);
  });
  it('debug.weather sets the kind (DEV builds and tests only)', () => {
    expect(applyNow({ side: 'park', kind: 'debug.weather', payload: { kind: 'mist' } }).ok).toBe(true);
    expect(W.kind).toBe('mist');
  });
  it('park.new rebuilds the park, empties the log, returns to tick 0 and to creator mode', () => {
    for (let i = 0; i < 100; i++) simulate(SIM_DT, 0);
    applyNow(tool());
    expect(log()).toHaveLength(1);
    const h = stateHash();
    setMode('avatar', 'a_pigeon', 7); // park.new is allowed in avatar mode (03 5.3); the new park must not inherit it
    applyNow({ side: 'park', kind: 'park.new', payload: { seed: 9 } });
    expect(getMode()).toBe('creator');
    expect(getPlayer()).toBe(0);
    expect(tick()).toBe(0);
    expect(log()).toHaveLength(0);
    const viaCommand = stateHash();
    expect(viaCommand).not.toBe(h);
    newPark(9);
    expect(stateHash()).toBe(viaCommand);
  });
});

describe('core/commands replay (03 5.2 item 5, 5.5)', () => {
  it('a snapshot, 1000 ticks with 6 commands, then restore and replay of the log give the same hash', () => {
    const snap = JSON.parse(JSON.stringify(snapshot())) as ReturnType<typeof snapshot>;
    const kinds = ['rain', 'clear', 'mist', 'shower', 'cloudy', 'snow'] as const;
    for (let step = 1; step <= 1000; step++) {
      if (step % 150 === 0) enqueue({ side: 'park', kind: 'debug.weather', payload: { kind: kinds[step / 150 - 1] ?? 'fair' } });
      simulate(SIM_DT, 0);
    }
    expect(log()).toHaveLength(6);
    const a = stateHash();
    const cmds = log().map((c) => ({ ...c }));
    restore(snap);
    expect(tick()).toBe(0);
    expect(log()).toHaveLength(0);
    replay(cmds, 1000);
    expect(tick()).toBe(1000);
    expect(stateHash()).toBe(a);
    expect(log()).toHaveLength(6);
  });
  it('replay with an upToTick already passed only queues the commands, to be applied at their own ticks', () => {
    const c: Command = { tick: 5, seq: 1, side: 'park', kind: 'debug.weather', payload: { kind: 'snow' } };
    replay([c], 0);
    expect(tick()).toBe(0);
    expect(pendingCount()).toBe(1);
    for (let i = 0; i < 4; i++) simulate(SIM_DT, 0);
    expect(W.kind).toBe('fair');
    simulate(SIM_DT, 0);
    expect(W.kind).toBe('snow');
  });
  it('resetCommands empties the queue, the log and the sequence', () => {
    applyNow(tool());
    enqueue(tool());
    resetCommands();
    expect(log()).toHaveLength(0);
    expect(pendingCount()).toBe(0);
    expect(enqueue(tool()).seq).toBe(1);
  });
});

describe('core/ids (03 2.3, 3.1)', () => {
  beforeEach(() => resetIds());

  it('every counter starts at 1, one allocator per type', () => {
    expect([nextVisitorId(), nextVisitorId()]).toEqual([1, 2]);
    expect(nextPairId()).toBe(1);
    expect(nextCreatureId()).toBe(1);
    expect(nextEffectId()).toBe(1);
    expect(nextPropId()).toBe(1);
  });
  it('a freed PropId is handed out again before a fresh one, oldest freed first', () => {
    for (let i = 0; i < 5; i++) nextPropId();
    freePropId(4);
    freePropId(2);
    freePropId(2); // already free: ignored
    freePropId(0);
    freePropId(99); // never handed out: ignored
    expect(nextPropId()).toBe(4);
    expect(nextPropId()).toBe(2);
    expect(nextPropId()).toBe(6);
  });
  it('an id freed for an undo entry is reserved: never handed out until released, and reclaimable by the undo (03 5.6 item 3)', () => {
    for (let i = 0; i < 4; i++) nextPropId();
    freePropId(2, true);
    freePropId(3);
    freePropId(2); // already reserved: ignored
    expect(nextPropId()).toBe(3);
    expect(nextPropId()).toBe(5); // 2 is held for the undo entry
    expect(reclaimPropId(2)).toBe(true); // the undo re-adds the prop under id 2
    expect(reclaimPropId(2)).toBe(false);
    freePropId(4, true);
    releasePropId(4); // its undo entry fell off the stack
    expect(nextPropId()).toBe(4);
    expect(nextPropId()).toBe(6);
  });
  it('PropIds fit OCC: the 65536th live id throws', () => {
    expect(PROP_ID_MAX).toBe(65535);
    for (let i = 0; i < PROP_ID_MAX; i++) nextPropId();
    expect(() => nextPropId()).toThrow();
    freePropId(123);
    expect(nextPropId()).toBe(123);
  });
  it('the state round-trips through JSON and resumes the sequence', () => {
    nextVisitorId();
    nextPropId();
    nextPropId();
    nextPropId();
    freePropId(1);
    freePropId(3, true);
    const s = JSON.parse(JSON.stringify(idsState())) as ReturnType<typeof idsState>;
    resetIds();
    expect(nextPropId()).toBe(1);
    setIdsState(s);
    expect(nextPropId()).toBe(1);
    expect(nextPropId()).toBe(4); // 3 is still reserved after the round trip
    releasePropId(3);
    expect(nextPropId()).toBe(3);
    expect(nextVisitorId()).toBe(2);
  });
});
