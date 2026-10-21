// tests/avatar.test.ts
// Locks 07 S7.6 steps 1-5, 8, 9 and S7.7 item 2 (08 2.5 avatar rows) for the three avatars of S7, a_pigeon, a_pomeranian and a_florist (the cascades are in avatar-pigeon, avatar-pomeranian and avatar-florist .test.ts since the split at the 600-line rule):
// entering sets MODE and PLAYER to a live actor and spawns one only when absent; a locked avatar and S10's three are refused; a tool in
// avatar mode is reason.not_in_avatar; each cascade (02 10.4, 10.5, 10.7) returns its status key and refusals, and a refusal changes nothing
// (the hash is the same: a rejected command is not logged, so a replay skips it); a stale hit falls through to the tile steps; the
// actions score as the abilities they stand for (the swoop's poop +1 MP on a paired victim, the bouquet +0.05 and `lastCupidAt`, the
// petals' c_petals cast, the snatch's); leaving returns the actor to the AI (the florist's leaveAt is finite again); the avatar is never a
// Pair member; a snapshot in avatar mode restores to the same hash.
import { describe, it, expect, beforeEach } from 'vitest';
import { PAUSED_KINDS, SIM_DT, newPark, setSpeed, simulate, tick } from '../src/core/loop.ts';
import { AVATAR_SIDE, applyNow, applyPending, enqueue, log, pendingCount, replay, type Hit } from '../src/core/commands.ts';
import { T } from '../src/core/clock.ts';
import { getAvatar, getMode, getPlayer, setMode, PLAYER_HOLD, type AvatarId } from '../src/play/mode.ts';
import { AVATARS, avatarTap, avatarById } from '../src/play/avatar.ts';
import { setProgress } from '../src/play/progression.ts';
import { canUndo } from '../src/play/undo.ts';
import { creatureById, creatures, resetCreatures, thePomeranian, type Creature } from '../src/entities/creatures.ts';
import { NEVER, removeVisitor, visitors } from '../src/entities/visitor.ts';
import { pompon } from '../src/entities/pomeranian.ts';
import { restore, snapshot, stateHash } from '../src/save/store.ts';
import { adult, child, run, stay, SEC } from './abilities-world.ts';
import { cmdTap, enter, events, floristActor, lawn, leave, pigeonActor, rejected, setupAvatarWorld, tapPerson, tapTile } from './avatar-world.ts';

beforeEach(setupAvatarWorld);

describe('the six avatars of register 3.8 (07 S7.6 step 2; 02 10.2)', () => {
  it('AVATARS holds the six ids with their side, tier, speed and three hint keys; only the three of S7 are playable', () => {
    expect(AVATARS.map((a) => a.id)).toEqual(['a_pigeon', 'a_pomeranian', 'a_mime', 'a_florist', 'a_busker', 'a_matchmaker']);
    expect(AVATARS.map((a) => [a.side, a.tier])).toEqual([['mischief', 0], ['mischief', 1], ['mischief', 3], ['cupid', 1], ['cupid', 2], ['cupid', 3]]);
    expect(AVATARS.map((a) => a.speed)).toEqual([6.0, 4.5, 3.0, 3.0, 3.0, 3.0]);
    expect(AVATARS.filter((a) => a.playable).map((a) => a.id)).toEqual(['a_pigeon', 'a_pomeranian', 'a_florist']);
    expect(avatarById('a_florist')?.spawn).toBe('g_south_w');
    expect(avatarById('a_matchmaker')?.spawn).toBe('g_north');
    for (const a of AVATARS) {
      expect(a.side).toBe(AVATAR_SIDE[a.id]);
      expect(a.hints).toEqual([`avatar.${a.id}.hint1`, `avatar.${a.id}.hint2`, `avatar.${a.id}.hint3`]);
    }
  });
  it('PLAYER_HOLD is the column of 02 10.2', () => {
    const keys = (id: AvatarId): string[] => Object.keys(PLAYER_HOLD[id]);
    expect(keys('a_pigeon')).toEqual(['swoop', 'poop', 'startled']);
    expect(keys('a_pomeranian')).toEqual(['snatch', 'carry', 'shakeOff']);
    expect(keys('a_florist')).toEqual(['hand', 'pick', 'scatter']);
    expect(keys('a_mime')).toEqual(['wall', 'mimicStart']);
    expect(keys('a_busker')).toEqual(['setUp', 'pack']);
    expect(keys('a_matchmaker')).toEqual(['lead', 'encourage', 'buy']);
  });
});

describe('entering (07 S7.7 item 2; 08 2.5)', () => {
  it('each of the three sets MODE avatar and PLAYER to a live actor, and spawns one only when absent', () => {
    // the pigeon: an existing one is taken, none is made; with none in the park one comes from the north edge
    const n = creatures.filter((c) => c.kind === 'pigeon').length;
    expect(n).toBe(6);
    expect(enter('a_pigeon').ok).toBe(true);
    expect([getMode(), getAvatar()]).toEqual(['avatar', 'a_pigeon']);
    expect(creatureById(getPlayer())?.kind).toBe('pigeon');
    expect(creatureById(getPlayer())?.driven).toBe(true);
    expect(creatures.filter((c) => c.kind === 'pigeon')).toHaveLength(n);
    leave();
    resetCreatures();
    thePomeranian();
    expect(enter('a_pigeon').ok).toBe(true);
    expect(creatures.filter((c) => c.kind === 'pigeon')).toHaveLength(1);
    expect(creatureById(getPlayer())?.kind).toBe('pigeon');
    leave();
    // Pompon: the record that always exists, brought in through the gate he waits at
    const total = creatures.length;
    expect(thePomeranian().outside).toBe(true);
    expect(enter('a_pomeranian').ok).toBe(true);
    expect(creatures).toHaveLength(total);
    expect(creatureById(getPlayer())?.kind).toBe('pomeranian');
    expect(pompon()?.outside).toBe(false);
    leave();
    // the flower seller: a new visitor at g_south_w with a basket of 3, never counted as a person; the second time she is found, not made again
    const before = visitors.length;
    expect(enter('a_florist').ok).toBe(true);
    const v = floristActor();
    expect(visitors).toHaveLength(before + 1);
    expect([v.archetype, v.name, v.sex, v.basket, v.spawnedForPlayer, v.gateIn]).toEqual(['cameo', 'Violette', 'f', 3, true, 'g_south_w']);
    expect(v.leaveAt).toBe(NEVER); // +Infinity in 07 S7.5, stored as the documented JSON-safe sentinel
    const id = v.id;
    leave();
    expect(enter('a_florist').ok).toBe(true);
    expect(getPlayer()).toBe(id);
    expect(visitors).toHaveLength(before + 1);
  });
  it('a locked avatar is reason.locked and S10\'s three are reason.not_here once unlocked; nothing changes', () => {
    setProgress({ cp: 0, mp: 0 });
    const h = stateHash();
    expect(enter('a_florist')).toEqual({ ok: false, reason: 'reason.locked' });
    expect(enter('a_pomeranian')).toEqual({ ok: false, reason: 'reason.locked' });
    expect(stateHash()).toBe(h); // a refusal changes nothing
    expect(enter('a_pigeon').ok).toBe(true); // tier 0
    leave();
    setProgress({ cp: 70, mp: 70 });
    for (const id of ['a_mime', 'a_busker', 'a_matchmaker'] as const) expect(enter(id)).toEqual({ ok: false, reason: 'reason.not_here' });
    expect(getMode()).toBe('creator');
    expect(rejected).toEqual(['reason.locked', 'reason.locked', 'reason.not_here', 'reason.not_here', 'reason.not_here']);
  });
  it('entering while already an avatar is reason.wrong_mode; the wrong side is reason.wrong_side', () => {
    expect(enter('a_pigeon').ok).toBe(true);
    expect(enter('a_pomeranian')).toEqual({ ok: false, reason: 'reason.wrong_mode' });
    leave();
    expect(applyNow({ side: 'cupid', kind: 'avatar.enter', payload: { avatar: 'a_pigeon' } })).toEqual({ ok: false, reason: 'reason.wrong_side' });
  });
  it('a tool, an undo and an ability in avatar mode are reason.not_in_avatar, and the undo stack is cleared on entering', () => {
    expect(applyNow({ side: 'park', kind: 'tool', payload: { tool: 'bench', at: { x: 5, y: 40 } } }).ok).toBe(true);
    expect(canUndo()).toBe(true);
    expect(enter('a_pigeon').ok).toBe(true);
    expect(canUndo()).toBe(false);
    expect(applyNow({ side: 'park', kind: 'tool', payload: { tool: 'bench', at: { x: 7, y: 40 } } })).toEqual({ ok: false, reason: 'reason.not_in_avatar' });
    expect(applyNow({ side: 'park', kind: 'undo', payload: {} })).toEqual({ ok: false, reason: 'reason.not_in_avatar' });
    expect(applyNow({ side: 'mischief', kind: 'ability', payload: { id: 'm_pigeon', target: { kind: 'park' } } })).toEqual({ ok: false, reason: 'reason.not_in_avatar' });
    expect(canUndo()).toBe(false);
  });
  it('entering emits a mode event for the shell (the actor, the avatar, its name, the first hint), and logs the command', () => {
    expect(enter('a_florist').ok).toBe(true);
    const e = events.find((x) => x.kind === 'mode');
    expect(e?.params).toMatchObject({ mode: 'avatar', avatar: 'a_florist', name: 'Violette', hint: '@avatar.a_florist.hint1' });
    expect(e?.ids).toEqual([getPlayer()]);
    expect(log().map((c) => c.kind)).toEqual(['avatar.enter']);
  });
});

describe('leaving (register row 14; 02 10.1 item 4)', () => {
  it('the mode is creator and PLAYER 0; the pigeon is the AI\'s again and decides on its next step', () => {
    (creatures.find((o) => o.kind === 'pigeon') as Creature).st = 'walk'; // the first pigeon is the one taken
    enter('a_pigeon');
    const c = pigeonActor();
    run(2);
    expect(c.st).toBe('wait'); // the player's pigeon waits for its tap
    expect(leave().ok).toBe(true);
    expect([getMode(), getPlayer(), getAvatar()]).toEqual(['creator', 0, null]);
    expect(c.driven).toBeUndefined();
    run(2);
    expect(c.st).not.toBe('wait');
    expect(events.find((x) => x.kind === 'mode' && x.params?.mode === 'creator')?.params).toMatchObject({ toast: 'avatar.goes_on', name: '@avatar.a_pigeon.name' });
  });
  it('the florist\'s leaveAt becomes finite and she decides on her next cadence; Pompon goes home through his gate', () => {
    enter('a_florist');
    const v = floristActor();
    Object.assign(v, { x: 20, y: 20, st: 'idle', t: 0, path: null });
    expect(v.leaveAt).toBe(NEVER);
    leave();
    expect(v.leaveAt).toBeLessThan(NEVER);
    expect(v.leaveAt).toBeGreaterThan(T.abs + 0.24);
    expect(v.leaveAt).toBeLessThan(T.abs + 0.51); // a fresh visit, 0.25-0.5 day (register 3.4)
    expect(v.decideT).toBe(0);
    run(3);
    expect(v.st).toBe('wander'); // the AI decided: rung 8, a walk round the green
    enter('a_pomeranian');
    Object.assign(thePomeranian(), { x: 20, y: 20, st: 'wait' });
    leave();
    expect(pompon()?.driven).toBeUndefined();
    run(60 * 30);
    expect(pompon()?.outside).toBe(true); // out by the nearest gate, waiting there as after any run
    expect(pompon()?.st).toBe('idle');
  });
  it('a florist let go while sitting stands up; a possessed actor that is gone sends the next tap back to creator mode', () => {
    enter('a_florist');
    const v = floristActor();
    Object.assign(v, { x: 20, y: 20, st: 'sit', t: 500 });
    leave();
    expect(v.t).toBe(0);
    enter('a_florist');
    removeVisitor(getPlayer()); // gone (removed from the park by anything)
    expect(cmdTap(10, 10).ok).toBe(true);
    expect(getMode()).toBe('creator');
  });
});

describe('the cascade\'s order and the stale hit (02 10.3; 03 5.2 item 4)', () => {
  it('a hit whose id is gone, or whose person stands far from the tapped tile, falls through to the tile step', () => {
    enter('a_pigeon');
    expect(avatarTap({ x: 10, y: 10 }, { kind: 'visitor', id: 9999, tile: { x: 10, y: 10 } })).toBe('avatar.status.flying');
    const a = adult(30, 30);
    expect(avatarTap({ x: 10, y: 10 }, { kind: 'visitor', id: a.id, tile: { x: 10, y: 10 } })).toBe('avatar.status.flying'); // 28 tiles away
    expect(avatarTap({ x: 30, y: 31 }, { kind: 'visitor', id: a.id, tile: { x: 30, y: 31 } })).toBe('avatar.status.swooping'); // 1 tile: within 1.2
    leave();
    enter('a_florist');
    const l = lawn();
    expect(avatarTap(l, { kind: 'visitor', id: 9999, tile: l })).toBe('avatar.status.petals'); // a lawn tile, the tile step
    expect(avatarTap(l, { kind: 'prop', id: 4242, tile: l })).toBe('avatar.status.petals');
    expect(avatarTap(l, undefined as unknown as Hit)).toBe('avatar.status.petals'); // a missing hit is none
  });
  it('a held state answers busy before anything else, the pigeon\'s startled answers reason.startled; the actor is not touched', () => {
    enter('a_pigeon');
    const c = pigeonActor();
    const a = adult(20, 20);
    for (const st of Object.keys(PLAYER_HOLD.a_pigeon)) {
      c.st = st;
      const h = stateHash();
      expect(tapPerson(a)).toBe(st === 'startled' ? 'reason.startled' : 'reason.busy');
      expect(stateHash()).toBe(h);
    }
    leave();
    enter('a_florist');
    const v = floristActor();
    for (const st of [...Object.keys(PLAYER_HOLD.a_florist), 'wipe', 'laugh']) {
      v.st = st;
      expect(tapTile(10, 10), st).toBe('reason.busy');
    }
  });
  it('an avatar.tap command with a status is applied and logged, emits avatarStatus; with a refusal it is rejected and not logged', () => {
    enter('a_pigeon');
    expect(cmdTap(12, 12).ok).toBe(true);
    const s = events.find((x) => x.kind === 'avatarStatus');
    expect(s?.params).toMatchObject({ status: 'avatar.status.flying', what: '@avatar.status.flying', name: '@avatar.a_pigeon.name', avatar: 'a_pigeon' });
    const c = child(20, 20);
    expect(cmdTap(20, 20, { kind: 'visitor', id: c.id, tile: { x: 20, y: 20 } })).toEqual({ ok: false, reason: 'reason.not_children' });
    expect(log().map((x) => x.kind)).toEqual(['avatar.enter', 'avatar.tap']);
    expect(cmdTap(-3, 5)).toEqual({ ok: false, reason: 'reason.outside' });
    expect(rejected).toEqual(['reason.not_children', 'reason.outside']);
  });
});


describe('a snapshot in avatar mode (the mode block, 03 3.10; 08 2.6)', () => {
  it('restores to the same hash with the florist and the pigeon possessed; a save whose actor is gone restores in creator mode', () => {
    enter('a_florist');
    const v = floristActor();
    Object.assign(v, { x: 22, y: 26, st: 'idle', t: 0, path: null });
    tapTile(10, 40);
    run(2 * SEC);
    const snap = JSON.parse(JSON.stringify(snapshot())) as ReturnType<typeof snapshot>;
    expect(snap.mode).toEqual({ mode: 'avatar', player: v.id, avatar: 'a_florist' });
    expect(snap.visitors.find((q) => q.id === v.id)?.leaveAt).toBe(NEVER); // JSON-safe: no null
    const h = stateHash();
    newPark(9);
    restore(snap);
    expect(stateHash()).toBe(h);
    expect([getMode(), getPlayer(), getAvatar()]).toEqual(['avatar', v.id, 'a_florist']);
    leave();
    enter('a_pigeon');
    tapTile(10, 40);
    run(SEC);
    const snap2 = JSON.parse(JSON.stringify(snapshot())) as ReturnType<typeof snapshot>;
    const h2 = stateHash();
    newPark(9);
    restore(snap2);
    expect(stateHash()).toBe(h2);
    expect(creatureById(getPlayer())?.driven).toBe(true);
    const bad = JSON.parse(JSON.stringify(snap2)) as ReturnType<typeof snapshot>;
    bad.creatures = bad.creatures.filter((c) => c.id !== snap2.mode.player);
    restore(bad);
    expect([getMode(), getPlayer()]).toEqual(['creator', 0]);
  });
  it('the sim never reads the wall clock for any of it: two runs of the same commands give the same hash', () => {
    const play = (): number => {
      newPark(5);
      setProgress({ cp: 70, mp: 70 });
      setMode('creator');
      const a = adult(20, 20);
      stay(a);
      enter('a_pigeon');
      tapPerson(a);
      run(6 * SEC);
      cmdTap(30, 30);
      run(3 * SEC);
      leave();
      run(SEC);
      return stateHash();
    };
    expect(play()).toBe(play());
    expect(simulate).toBeDefined();
    expect(SIM_DT).toBeGreaterThan(0);
  });
});

describe('the avatar commands on a paused park (03 4.6, 5.2; owner 2026-10-22)', () => {
  const json = (): ReturnType<typeof snapshot> => JSON.parse(JSON.stringify(snapshot())) as ReturnType<typeof snapshot>;
  /** One paused frame (the paused kinds apply), then the unpause and the first step. */
  const pausedThenStep = (): void => {
    applyPending(tick() + 1, PAUSED_KINDS);
    setSpeed(1);
    simulate(SIM_DT, 1);
  };

  it('Be someone and Creator apply in the paused frame: the mode, the actor and the toast event at once, at the same tick, the log in order', () => {
    setSpeed(0);
    const t0 = tick();
    enqueue({ side: 'mischief', kind: 'avatar.enter', payload: { avatar: 'a_pigeon' } });
    applyPending(t0 + 1, PAUSED_KINDS);
    expect([getMode(), getAvatar(), tick(), pendingCount()]).toEqual(['avatar', 'a_pigeon', t0, 0]);
    expect(pigeonActor().driven).toBe(true);
    expect(events.filter((e) => e.kind === 'mode').map((e) => e.params?.mode)).toEqual(['avatar']);
    enqueue({ side: 'mischief', kind: 'avatar.leave', payload: {} });
    applyPending(t0 + 1, PAUSED_KINDS);
    expect([getMode(), getPlayer(), tick()]).toEqual(['creator', 0, t0]);
    expect(events.filter((e) => e.kind === 'mode').map((e) => e.params?.toast ?? e.params?.mode)).toEqual(['avatar', 'avatar.goes_on']);
    expect(log().map((c) => c.kind)).toEqual(['avatar.enter', 'avatar.leave']);
    expect(rejected).toEqual([]);
  });
  it('the rules still hold while paused: a locked avatar is reason.locked, a second enter reason.wrong_mode, a wrong-side leave reason.wrong_side', () => {
    setSpeed(0);
    setProgress({ cp: 0, mp: 0 });
    enqueue({ side: 'mischief', kind: 'avatar.enter', payload: { avatar: 'a_pomeranian' } });
    applyPending(tick() + 1, PAUSED_KINDS);
    expect(getMode()).toBe('creator');
    enqueue({ side: 'mischief', kind: 'avatar.enter', payload: { avatar: 'a_pigeon' } });
    enqueue({ side: 'mischief', kind: 'avatar.enter', payload: { avatar: 'a_pigeon' } });
    applyPending(tick() + 1, PAUSED_KINDS);
    expect(getMode()).toBe('avatar');
    enqueue({ side: 'cupid', kind: 'avatar.leave', payload: {} });
    applyPending(tick() + 1, PAUSED_KINDS);
    expect(getMode()).toBe('avatar');
    expect(rejected).toEqual(['reason.locked', 'reason.wrong_mode', 'reason.wrong_side']);
    expect(log().map((c) => c.kind)).toEqual(['avatar.enter']);
  });
  it('an avatar.tap and a tool wait for the first step: the tap lands after the paused enter, the tool is refused as not_in_avatar', () => {
    setSpeed(0);
    enqueue({ side: 'park', kind: 'tool', payload: { tool: 'lamp', at: { x: 5, y: 5 } } });
    enqueue({ side: 'mischief', kind: 'avatar.enter', payload: { avatar: 'a_pigeon' } });
    const to = lawn();
    enqueue({ side: 'mischief', kind: 'avatar.tap', payload: { tile: to, hit: { kind: 'tile', id: 0, tile: to } } });
    applyPending(tick() + 1, PAUSED_KINDS);
    expect(pendingCount()).toBe(2); // the tool and the tap
    expect(pigeonActor().st).not.toBe('fly');
    setSpeed(1);
    simulate(SIM_DT, 1);
    expect(pendingCount()).toBe(0);
    expect(rejected).toEqual(['reason.not_in_avatar']);
    expect(log().map((c) => c.kind)).toEqual(['avatar.enter', 'avatar.tap']);
  });
  it('they sort ahead of a visitor.call queued before them, so the replay draws the same numbers (florist in, then out)', () => {
    for (const [side, kind, payload] of [
      ['cupid', 'avatar.enter', { avatar: 'a_florist' }],
      ['cupid', 'avatar.leave', {}],
    ] as const) {
      setSpeed(0);
      const snap = json(), n = log().length;
      enqueue({ side: 'park', kind: 'visitor.call', payload: { gate: null } }); // park sorts before cupid, and was queued first
      enqueue({ side, kind, payload } as Parameters<typeof enqueue>[0]);
      pausedThenStep();
      expect(log().slice(n).map((c) => c.kind)).toEqual([kind, 'visitor.call']);
      const h = stateHash(), cmds = log().slice(n).map((c) => ({ ...c }));
      const t1 = tick();
      restore(snap);
      setSpeed(1);
      replay(cmds, t1);
      expect(stateHash(), kind).toBe(h);
      // restore() dropped the avatar session the live run built; play the live order again to carry on from it
      setSpeed(0);
      enqueue({ side, kind, payload } as Parameters<typeof enqueue>[0]);
      applyPending(tick() + 1, PAUSED_KINDS);
    }
  });
  it('paused frames apply in seq order, so a Pompon enter and leave then a florist enter in three frames replay to the same hash (03 4.6, 5.2)', () => {
    setSpeed(0);
    const snap = json(), n = log().length;
    for (const [side, kind, payload] of [
      ['mischief', 'avatar.enter', { avatar: 'a_pomeranian' }], // mischief sorts after cupid by side, so a side sort in the replay would put the florist first
      ['mischief', 'avatar.leave', {}],
      ['cupid', 'avatar.enter', { avatar: 'a_florist' }],
      ['park', 'speed', { speed: 1 }],
    ] as const) {
      enqueue({ side, kind, payload } as Parameters<typeof enqueue>[0]);
      applyPending(tick() + 1, PAUSED_KINDS); // one paused frame each: the player taps Pompon, Creator, Violette one after the other
    }
    for (let i = 0; i < 120; i++) simulate(SIM_DT, 1);
    expect(rejected).toEqual([]);
    expect(log().slice(n).map((c) => `${c.kind}:${c.side}`)).toEqual(['avatar.enter:mischief', 'avatar.leave:mischief', 'avatar.enter:cupid', 'speed:park']);
    const h = stateHash(), cmds = log().slice(n).map((c) => ({ ...c }));
    const t1 = tick();
    restore(snap);
    setSpeed(0);
    replay(cmds, t1);
    expect(rejected).toEqual([]);
    expect([getMode(), getAvatar()]).toEqual(['avatar', 'a_florist']);
    expect(stateHash()).toBe(h);
  });
});
