// tests/avatar.test.ts
// Locks 07 S7.6 steps 1-5, 8, 9 and S7.7 item 2 (08 2.5 avatar rows) for the three avatars of S7, a_pigeon, a_pomeranian and a_florist:
// entering sets MODE and PLAYER to a live actor and spawns one only when absent; a locked avatar and S10's three are refused; a tool in
// avatar mode is reason.not_in_avatar; each cascade (02 10.4, 10.5, 10.7) returns its status key and refusals, and a refusal changes nothing
// (the hash is the same: a rejected command is not logged, so a replay skips it); a stale hit falls through to the tile steps; the
// actions score as the abilities they stand for (the swoop's poop +1 MP on a paired victim, the bouquet +0.05 and `lastCupidAt`, the
// petals' c_petals cast, the snatch's); leaving returns the actor to the AI (the florist's leaveAt is finite again); the avatar is never a
// Pair member; a snapshot in avatar mode restores to the same hash.
import { describe, it, expect, beforeEach } from 'vitest';
import { newPark, simulate, SIM_DT, tick } from '../src/core/loop.ts';
import { AVATAR_SIDE, applyNow, log, type Hit } from '../src/core/commands.ts';
import { clearListeners, on, type GameEvent } from '../src/core/events.ts';
import { T } from '../src/core/clock.ts';
import { I, KIND, Kind, OCC, PETALS, props } from '../src/world/grid.ts';
import { getAvatar, getMode, getPlayer, setMode, PLAYER_HOLD, type AvatarId } from '../src/play/mode.ts';
import { AVATARS, avatarTap, avatarById } from '../src/play/avatar.ts';
import { effects, cooldownLeft } from '../src/play/abilities.ts';
import { points, setProgress } from '../src/play/progression.ts';
import { canUndo } from '../src/play/undo.ts';
import { creatureById, creatures, dropCrumbs, resetCreatures, spawnDog, thePomeranian, type Creature } from '../src/entities/creatures.ts';
import { byId, NEVER, removeVisitor, visitors, type Visitor } from '../src/entities/visitor.ts';
import { land } from '../src/entities/embarrass.ts';
import { pairOf, pairs } from '../src/entities/romance.ts';
import { pompon } from '../src/entities/pomeranian.ts';
import { restore, snapshot, stateHash } from '../src/save/store.ts';
import { adult, child, pairAt, run, stay, unlockAll, world, SEC } from './abilities-world.ts';

const enter = (id: AvatarId) => applyNow({ side: AVATAR_SIDE[id], kind: 'avatar.enter', payload: { avatar: id } });
const leave = () => applyNow({ side: AVATAR_SIDE[getAvatar() ?? 'a_pigeon'], kind: 'avatar.leave', payload: {} });
const tileHit = (x: number, y: number): Hit => ({ kind: 'tile', id: 0, tile: { x, y } });
/** A tap on a person: the tile under them and the hit the UI would have resolved. */
const onPerson = (v: Visitor): [{ x: number; y: number }, Hit] => {
  const t = { x: Math.round(v.x), y: Math.round(v.y) };
  return [t, { kind: 'visitor', id: v.id, tile: t }];
};
const tapPerson = (v: Visitor) => avatarTap(...onPerson(v));
const tapTile = (x: number, y: number) => avatarTap({ x, y }, tileHit(x, y));
const cmdTap = (x: number, y: number, hit?: Hit) =>
  applyNow({ side: AVATAR_SIDE[getAvatar() ?? 'a_pigeon'], kind: 'avatar.tap', payload: { tile: { x, y }, hit: hit ?? tileHit(x, y) } });
const bedTile = (): { x: number; y: number } => {
  for (let i = 0; i < KIND.length; i++) if (KIND[i] === Kind.bed) return { x: i % 48, y: Math.floor(i / 48) };
  throw new Error('no bed in the starter park');
};
const gravel = (): { x: number; y: number } => {
  for (let i = 0; i < KIND.length; i++) if (KIND[i] === Kind.gravel && OCC[i] === 0) return { x: i % 48, y: Math.floor(i / 48) };
  throw new Error('no gravel');
};
const lawn = (): { x: number; y: number } => {
  for (let i = 24 * 48 + 30; i < KIND.length; i++) if (KIND[i] === Kind.lawn && OCC[i] === 0) return { x: i % 48, y: Math.floor(i / 48) };
  throw new Error('no lawn');
};
const mp = (): number => points().mp;
const pigeonActor = (): Creature => creatureById(getPlayer()) as Creature;
const floristActor = (): Visitor => byId(getPlayer()) as Visitor;
let rejected: string[] = [];
let events: GameEvent[] = [];

beforeEach(() => {
  clearListeners();
  world();
  unlockAll();
  rejected = [];
  events = [];
  on('rejected', (e) => rejected.push(String(e.params?.reason)));
  for (const k of ['avatarStatus', 'mode', 'bouquet', 'cast', 'embarrassed', 'snatch'] as const) on(k, (e) => events.push(e));
});

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

describe('a_pigeon (02 10.4)', () => {
  it('a tap on an adult returns avatar.status.swooping and the poop lands with +1 MP when the victim is paired', () => {
    const { p, a, b } = pairAt(20, 20, 1);
    b.x = 26; // 6 tiles apart: no backfire is possible (4)
    stay(a, b);
    enter('a_pigeon');
    const mp0 = mp();
    expect(tapPerson(a)).toBe('avatar.status.swooping');
    expect(pigeonActor().st).toBe('swoop');
    run(5 * SEC);
    const emb = events.filter((e) => e.kind === 'embarrassed');
    expect(emb).toHaveLength(1);
    expect(emb[0]?.params).toMatchObject({ kind: 'poop', source: 'mischief', score: 1 });
    expect(mp()).toBe(mp0 + 1);
    expect(a.embToday).toBe(1);
    expect(p.affinity).toBeLessThan(0.4); // the cost of 02 6.4 came off
    // the player's pigeon stays where it landed: poop, then startled, then wait
    expect(['poop', 'startled', 'wait']).toContain(pigeonActor().st);
    run(3 * SEC);
    expect(pigeonActor().st).toBe('wait');
    expect(pigeonActor().z).toBeLessThan(0.1);
  });
  it('a lone adult costs nothing but still gets the poop; the points are the paired victim\'s only (02 7.2)', () => {
    const a = adult(20, 20);
    stay(a);
    enter('a_pigeon');
    const mp0 = mp();
    expect(tapPerson(a)).toBe('avatar.status.swooping');
    run(5 * SEC);
    expect(a.embToday).toBe(1);
    expect(mp()).toBe(mp0);
  });
  it('the 25 s cooldown of m_pigeon is shared: ruffled until it ends, and the cooldown is the ability\'s', () => {
    const a = adult(20, 20), b = adult(22, 20);
    stay(a, b);
    enter('a_pigeon');
    const t0 = tick() + 1;
    expect(tapPerson(a)).toBe('avatar.status.swooping');
    expect(cooldownLeft('mischief', 'm_pigeon', t0)).toBeCloseTo(25, 6);
    run(6 * SEC);
    expect(pigeonActor().st).toBe('wait');
    const h = stateHash();
    expect(tapPerson(b)).toBe('avatar.status.ruffled');
    expect(stateHash()).toBe(h); // nothing was ordered
    run(20 * SEC);
    expect(tapPerson(b)).toBe('avatar.status.swooping');
  });
  it('refusals: a child, three embarrassments today, a dog within 2 tiles; each changes nothing', () => {
    const c = child(20, 20), a = adult(24, 20), b = adult(14, 14);
    enter('a_pigeon');
    const p = pigeonActor();
    Object.assign(p, { x: 20, y: 24, z: 0, st: 'wait', t: 0 }); // t 0: waiting, with no startle's peace left (creatures-threats.ts inStartleGrace)
    let h = stateHash();
    expect(tapPerson(c)).toBe('reason.not_children');
    expect(stateHash()).toBe(h);
    a.embToday = 3;
    h = stateHash();
    expect(tapPerson(a)).toBe('reason.enough_today');
    expect(stateHash()).toBe(h);
    const owner = adult(20, 25);
    expect(spawnDog(owner.id)).not.toBeNull();
    h = stateHash();
    expect(tapPerson(b)).toBe('reason.startled'); // the walker\'s dog is a tile from the pigeon
    expect(tapTile(10, 10)).toBe('reason.startled');
    expect(stateHash()).toBe(h);
  });
  it('crumbs: peck; a lamp or bench: perch; a water tile: drink 3 s at its edge; any tile: fly', () => {
    enter('a_pigeon');
    const p = pigeonActor();
    Object.assign(p, { x: 20, y: 20, z: 0, st: 'wait', perchPropId: 0 });
    const crumbs = props.find((q) => q.kind === 'crumbs');
    expect(crumbs).toBeUndefined();
    const lamp = props.find((q) => q.kind === 'lamp');
    expect(lamp).toBeDefined();
    if (!lamp) return;
    expect(avatarTap({ x: lamp.x, y: lamp.y }, { kind: 'prop', id: lamp.id, tile: { x: lamp.x, y: lamp.y } })).toBe('avatar.status.perching');
    run(6 * SEC);
    expect(p.st).toBe('perch');
    expect(p.perchPropId).toBe(lamp.id);
    run(40 * SEC);
    expect(p.st).toBe('perch'); // until the next tap, not for 8-20 s
    expect(tapTile(33, 12)).toBe('avatar.status.drinking'); // the pond
    expect(p.st).toBe('flyDrink');
    for (let k = 0; k < 600 && p.st === 'flyDrink'; k++) run(1);
    expect(p.st).toBe('drink');
    run(2 * SEC);
    expect(p.st).toBe('drink');
    run(2 * SEC);
    expect(p.st).toBe('wait');
    expect(tapTile(20, 30)).toBe('avatar.status.flying');
    run(6 * SEC);
    expect(p.st).toBe('wait');
    expect(Math.hypot(p.x - 20, p.y - 30)).toBeLessThan(0.6);
    // crumbs dropped for it are pecked once, for 4 s
    const owner = adult(26, 20);
    stay(owner);
    dropCrumbs(24, 22, owner.id);
    const cr = props.find((q) => q.kind === 'crumbs');
    expect(cr).toBeDefined();
    if (!cr) return;
    cr.data.stock = 2;
    expect(avatarTap({ x: 24, y: 22 }, { kind: 'prop', id: cr.id, tile: { x: 24, y: 22 } })).toBe('avatar.status.pecking');
    run(3 * SEC);
    expect(p.st).toBe('peck');
    run(3 * SEC);
    expect(p.st).toBe('wait'); // one peck, not the whole handful
    expect(cr.data.stock).toBe(1);
  });
});

describe('a_pomeranian (02 10.5)', () => {
  it('a hatless, bagless adult is reason.no_item; a walker\'s dog within 3 is reason.big_dog; three today reason.enough_today', () => {
    const a = adult(20, 20), b = adult(30, 30);
    enter('a_pomeranian');
    const h = stateHash();
    expect(tapPerson(a)).toBe('reason.no_item');
    Object.assign(a.items, { hat: true });
    Object.assign(b.items, { purse: true });
    const owner = adult(31, 30);
    expect(spawnDog(owner.id)).not.toBeNull();
    expect(tapPerson(b)).toBe('reason.big_dog');
    a.embToday = 3;
    expect(tapPerson(a)).toBe('reason.enough_today');
    expect(stateHash()).not.toBe(h); // (the items, the dog and the count were set up above, the refusals added nothing to it)
    const h2 = stateHash();
    expect(tapPerson(a)).toBe('reason.enough_today');
    expect(stateHash()).toBe(h2);
  });
  it('a snatch: snatching, the same run as m_pomeranian, +1 MP on a paired victim, the item comes back at the gate; panting for 60 s', () => {
    const { a, b } = pairAt(24, 24, 1);
    b.x = 30;
    stay(a, b);
    a.items = { hat: true, purse: false, baguette: false, iceCream: false };
    enter('a_pomeranian');
    const c = pompon() as Creature;
    run(8 * SEC);
    expect(c.st).toBe('wait');
    const mp0 = mp();
    const t0 = tick() + 1;
    expect(tapPerson(a)).toBe('avatar.status.snatching');
    expect(cooldownLeft('mischief', 'm_pomeranian', t0)).toBeCloseTo(60, 6);
    expect(c.st).toBe('snatch');
    expect(tapPerson(b)).toBe('reason.busy'); // a hold state
    run(25 * SEC);
    expect(events.some((e) => e.kind === 'snatch' && e.params?.item === 'hat')).toBe(true);
    expect(mp()).toBe(mp0 + 1);
    for (let k = 0; k < 60 && c.st !== 'wait'; k++) run(SEC);
    expect(a.items.hat).toBe(true); // dropped at the gate and the victim has it back
    expect(c.driven).toBe(true);
    expect(c.outside).toBe(false); // he stays in the park: shakeOff 1 s, then wait
    expect(c.st).toBe('wait');
    Object.assign(b.items, { hat: true });
    expect(tapPerson(b)).toBe('avatar.status.panting'); // within the 60 s of the m_pomeranian cooldown
  });
  it('pigeons: chase; a child: play, the child chases; water: paddle then shakeOff; the lawn: dig; any tile: walk', () => {
    enter('a_pomeranian');
    const c = pompon() as Creature;
    Object.assign(c, { x: 20, y: 20, st: 'wait', outside: false });
    const pg = creatures.find((o) => o.kind === 'pigeon') as Creature;
    Object.assign(pg, { x: 24, y: 20, st: 'peck', t: 9, z: 0 });
    expect(avatarTap({ x: 24, y: 20 }, { kind: 'creature', id: pg.id, tile: { x: 24, y: 20 } })).toBe('avatar.status.chasing');
    expect(c.st).toBe('chase');
    run(4 * SEC);
    expect(c.st).toBe('wait');
    expect(pg.st).toBe('scatter'); // he came within 3 (creatures.ts threats)
    const k = child(18, 20);
    Object.assign(c, { x: 20, y: 20 });
    expect(tapPerson(k)).toBe('avatar.status.playing');
    expect(c.st).toBe('play');
    expect(k.st).toBe('play');
    expect(k.job.creatureId).toBe(c.id);
    run(9 * SEC);
    expect(c.st).toBe('wait');
    expect(tapTile(33, 12)).toBe('avatar.status.paddling');
    run(25 * SEC);
    expect(['paddle', 'shakeOff', 'wait']).toContain(c.st);
    run(8 * SEC);
    expect(c.st).toBe('wait');
    const l = lawn();
    expect(tapTile(l.x, l.y)).toBe('avatar.status.digging');
    for (let k = 0; k < 90 && c.st !== 'dig'; k++) run(SEC);
    expect(c.st).toBe('dig');
    run(4 * SEC);
    expect(c.st).toBe('wait');
    expect(Math.hypot(c.x - l.x, c.y - l.y)).toBeLessThan(0.5);
    const g = gravel();
    expect(tapTile(g.x, g.y)).toBe('avatar.status.walking'); // a path tile: run there
    expect(c.st).toBe('walk');
  });
});

describe('a_florist (02 10.7)', () => {
  it('refusals: an empty basket is reason.basket_empty, an unpaired person reason.not_courting, a child reason.not_children; each changes nothing', () => {
    const { a, b } = pairAt(20, 20, 1);
    b.x = 26;
    const lone = adult(30, 30), c = child(34, 30);
    enter('a_florist');
    const v = floristActor();
    Object.assign(v, { x: 22, y: 26, st: 'idle', t: 0, path: null });
    let h = stateHash();
    expect(tapPerson(lone)).toBe('reason.not_courting');
    expect(tapPerson(c)).toBe('reason.not_children');
    expect(stateHash()).toBe(h);
    v.basket = 0;
    h = stateHash();
    expect(tapPerson(a)).toBe('reason.basket_empty');
    expect(stateHash()).toBe(h);
    v.basket = 3;
    a.st = 'wipe'; // a member in a reaction: c_bouquet's own check says busy
    expect(tapPerson(b)).toBe('reason.busy');
  });
  it('a bouquet: bouquet, a walk to them (hold), basket -1, affinity +0.05, lastCupidAt, the 60 s cooldown of c_bouquet', () => {
    const { p, a, b } = pairAt(20, 20, 2);
    stay(a, b);
    enter('a_florist');
    const v = floristActor();
    Object.assign(v, { x: 20, y: 26, st: 'idle', t: 0, path: null });
    const aff0 = p.affinity;
    expect(p.lastCupidAt).toBe(-1);
    const t0 = tick() + 1;
    expect(tapPerson(a)).toBe('avatar.status.bouquet');
    expect(v.st).toBe('hand');
    expect(tapTile(10, 10)).toBe('reason.busy'); // the hold
    run(10 * SEC);
    expect(events.filter((e) => e.kind === 'bouquet')).toHaveLength(1);
    expect(v.basket).toBe(2);
    expect(p.affinity).toBeGreaterThan(aff0 + 0.045); // +0.05, and the little the minutes of charm conversion add
    expect(p.affinity).toBeLessThan(aff0 + 0.07);
    expect(p.lastCupidAt).toBeGreaterThanOrEqual(0);
    expect(cooldownLeft('cupid', 'c_bouquet', t0 + 10 * SEC)).toBeGreaterThan(40);
    expect(v.st).not.toBe('hand');
    expect(tapPerson(b)).toBe('reason.cooldown');
  });
  it('a flowerbed: pick 4 s and the basket is 3; a bench: sit until the next tap; the lawn: petals as c_petals, 30 s', () => {
    enter('a_florist');
    const v = floristActor();
    Object.assign(v, { x: 22, y: 26, st: 'idle', t: 0, path: null, basket: 0 });
    const bed = bedTile();
    expect(tapTile(bed.x, bed.y)).toBe('avatar.status.picking');
    expect(v.st).toBe('goPick');
    run(40 * SEC);
    expect(v.basket).toBe(3);
    expect(v.st).not.toBe('pick');
    // the bench
    const bench = props.find((q) => q.kind === 'bench');
    expect(bench).toBeDefined();
    if (bench) {
      expect(avatarTap({ x: bench.x, y: bench.y }, { kind: 'prop', id: bench.id, tile: { x: bench.x, y: bench.y } })).toBe('avatar.status.resting');
      run(60 * SEC);
      expect(v.st).toBe('sit'); // not 90 s, not when rested: until she is told otherwise
    }
    // the lawn
    const l = lawn();
    expect(tapTile(l.x, l.y)).toBe('avatar.status.petals');
    expect(v.st).toBe('goScatter');
    expect(effects).toHaveLength(0);
    for (let k = 0; k < 90 && effects.length === 0; k++) run(SEC);
    expect(effects.filter((e) => e.ability === 'c_petals')).toHaveLength(1); // cast at the moment she scatters
    expect(v.st).toBe('scatter');
    expect(PETALS[I(l.x, l.y)] as number).toBeGreaterThan(0.2);
    expect(events.some((e) => e.kind === 'cast' && e.params?.id === 'c_petals')).toBe(true);
    expect(tapTile(l.x + 1, l.y)).toBe('reason.busy'); // the 2 s of scatter are a hold
    run(3 * SEC);
    expect(tapTile(l.x + 1, l.y)).toBe('reason.cooldown'); // c_petals' 30 s, shared
  });
  it('a tile she cannot scatter on (a bench, the water) is a walk; the hold of scatter and pick answers busy', () => {
    enter('a_florist');
    const v = floristActor();
    Object.assign(v, { x: 22, y: 26, st: 'idle', t: 0, path: null });
    expect(tapTile(33, 12)).toBe('avatar.status.walking');
    expect(v.st).toBe('wander');
    v.st = 'scatter';
    expect(tapTile(33, 12)).toBe('reason.busy');
    v.st = 'pick';
    expect(tapTile(33, 12)).toBe('reason.busy');
  });
  it('she can be a victim: a poop lands, the pigeon\'s victim reacts under avatarDecide; never a Pair member', () => {
    enter('a_florist');
    const v = floristActor();
    Object.assign(v, { x: 22, y: 26, st: 'idle', t: 0, path: null });
    const mp0 = mp();
    expect(land('poop', v.id, 'mischief').ok).toBe(true);
    run(2 * SEC);
    expect(v.st).toBe('wipe'); // the possessed actor reacted: the decide cadence ran avatarDecide, which took rung 1
    expect(pairOf(v)).toBeUndefined();
    expect(pairs.some((q) => q.a === v.id || q.b === v.id)).toBe(false);
    expect(mp()).toBe(mp0); // no pair: no point, and none against herself
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
