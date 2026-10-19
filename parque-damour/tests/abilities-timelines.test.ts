// tests/abilities-timelines.test.ts
// Locks the eight timelines of 02 9.2-9.3 (07 S6.7 item 2 and S6.8; 08 2.5 abilities.test.ts rows): the petals, the sunbeam, the bouquet,
// the musician, the pigeon, the sprinkler, the peel and Pompon, and a snapshot in the middle of them. Split from abilities.test.ts at the
// 600-line rule; the shared scenes are in tests/abilities-world.ts.
import { describe, it, expect, beforeEach } from 'vitest';
import { SIM_DT } from '../src/core/loop.ts';
import { T } from '../src/core/clock.ts';
import { W, overrides, weatherAt } from '../src/core/weather.ts';
import { on, type GameEvent } from '../src/core/events.ts';
import { rngN } from '../src/core/rng.ts';
import { I, OCC, PETALS, WET, addProp, props, rebuildBlock, markBlockDirty } from '../src/world/grid.ts';
import { charmAt } from '../src/world/charm.ts';
import { canCast, cast, commandTick, cooldownLeft, effects, stepAbilities } from '../src/play/abilities.ts';
import { nowTick, people, removeVisitor, spawnVisitor, visitors, type Visitor } from '../src/entities/visitor.ts';
import { creatures } from '../src/entities/creatures.ts';
import { pompon } from '../src/entities/pomeranian.ts';
import { stateHash, restore, snapshot } from '../src/save/store.ts';
import { SEC, world, unlockAll, run, adult, child, pairAt, stay, tileT, reasonOf } from './abilities-world.ts';

beforeEach(world);

describe('c_petals (02 9.2): PETALS on 9 tiles, charm +2 for exactly 20 s, then the layer fades at 1/40 a second', () => {
  it('PETALS = 1 on the 3x3 at once, charm +2 (player) on each, nothing on the tile beside', () => {
    expect(cast('cupid', 'c_petals', tileT(6, 12)).ok).toBe(true);
    for (let y = 11; y <= 13; y++) for (let x = 5; x <= 7; x++) {
      expect(PETALS[I(x, y)]).toBe(1);
      expect(charmAt(x, y)).toEqual({ total: 2, player: 2 });
    }
    expect(PETALS[I(8, 12)]).toBe(0);
    expect(effects).toHaveLength(1);
  });
  it('the charm lasts the 1,200 ticks of 20 s and not one more; the effect removes itself and the layer fades from 0.19 at 1/40 per s', () => {
    cast('cupid', 'c_petals', tileT(6, 12), nowTick() + 1);
    run(1200); // steps 1 to 1200: t 0 to 1199
    expect(charmAt(6, 12).player).toBe(2);
    expect(effects).toHaveLength(1);
    run(1); // t 1200
    expect(effects).toHaveLength(0);
    expect(charmAt(6, 12)).toEqual({ total: 0, player: 0 });
    const p0 = PETALS[I(6, 12)] as number;
    expect(p0).toBeLessThanOrEqual(0.19);
    expect(p0).toBeGreaterThan(0.18);
    run(SEC);
    expect(p0 - (PETALS[I(6, 12)] as number)).toBeCloseTo(1 / 40, 4);
    run(10 * SEC);
    expect(PETALS[I(6, 12)]).toBe(0);
  });
  it('a pond centre is reason.on_water; the 9 tiles are clipped at the park\'s edge', () => {
    expect(reasonOf(canCast('cupid', 'c_petals', tileT(31, 12)))).toBe('reason.on_water');
    expect(cast('cupid', 'c_petals', tileT(0, 0)).ok).toBe(true);
    expect(PETALS[I(0, 0)]).toBe(1);
    expect(PETALS[I(1, 1)]).toBe(1);
  });
});

describe('c_sunbeam (02 9.2, 3.5): an override of r 3 for 60 s: rain 0, cloud 0.1, light +0.15', () => {
  it('adds the override, which holds for 3,600 ticks, and the effect removes it', () => {
    unlockAll();
    W.rain = 0.8;
    const t0 = nowTick() + 1;
    expect(cast('cupid', 'c_sunbeam', tileT(24, 8), t0).ok).toBe(true);
    expect(overrides()).toHaveLength(1);
    const o = overrides()[0];
    expect([o?.kind, o?.x, o?.y, o?.r]).toEqual(['sunbeam', 24, 8, 3]);
    expect(weatherAt(26, 10)).toMatchObject({ rain: 0, cloud: 0.1, light: 0.15 });
    expect(weatherAt(28, 8).rain).toBeGreaterThan(0); // outside the 7x7
    expect(charmAt(24, 8).player).toBe(1); // charm +1 inside
    run(3600); // steps 1 to 3600
    expect(overrides()).toHaveLength(1);
    run(1);
    expect(overrides()).toHaveLength(0);
    expect(effects).toHaveLength(0);
  });
});

describe('c_bouquet (02 9.2): Violette comes, hands the bouquet, affinity +0.05, and vanishes about 7 s later', () => {
  it('a cameo appears 3 tiles off, walks to the member, hands at 3 s (affinity +0.05, bouquet event), leaves; people() never counts her', () => {
    const { p, a, b } = pairAt(10, 20, 2);
    stay(a, b);
    const aff = p.affinity, n = people();
    const seen: GameEvent[] = [];
    on('bouquet', (e) => seen.push(e));
    expect(cast('cupid', 'c_bouquet', { kind: 'pair', id: p.id }, nowTick() + 1).ok).toBe(true);
    const cam = visitors.find((v) => v.archetype === 'cameo') as Visitor;
    expect(cam.name).toBe('Violette');
    expect(Math.max(Math.abs(cam.x - 11), Math.abs(cam.y - 20))).toBeGreaterThanOrEqual(3);
    expect(people()).toBe(n);
    run(2 * SEC);
    expect(p.affinity).toBe(aff);
    run(SEC + 30);
    expect(seen).toHaveLength(1);
    expect(p.affinity).toBeCloseTo(aff + 0.05, 10);
    expect(Math.hypot(cam.x - a.x, cam.y - a.y)).toBeLessThan(2);
    run(5 * SEC);
    expect(visitors.some((v) => v.archetype === 'cameo')).toBe(false); // vanished
    expect(effects).toHaveLength(0);
    expect(p.affinity).toBeCloseTo(aff + 0.05, 10); // once
  });
  it('a member in a reaction is reason.busy; a pair more than 4 tiles apart is reason.apart', () => {
    const { p, a, b } = pairAt(10, 20, 1);
    a.st = 'wipe';
    expect(reasonOf(canCast('cupid', 'c_bouquet', { kind: 'pair', id: p.id }))).toBe('reason.busy');
    a.st = 'idle';
    b.x = a.x + 6;
    expect(reasonOf(canCast('cupid', 'c_bouquet', { kind: 'pair', id: p.id }))).toBe('reason.apart');
  });
  it('the tapped member is the one she walks to', () => {
    const { p, b } = pairAt(10, 20, 3);
    cast('cupid', 'c_bouquet', { kind: 'visitor', id: b.id }, nowTick() + 1);
    expect(effects[0]?.targetId).toBe(b.id);
    expect(effects[0]?.pairId).toBe(p.id);
  });
});

describe('c_musician (02 9.2): a busker walks in, plays 90 s, charm +3 within 8, and leaves', () => {
  it('spawns a summoned busker, who plays at the tile for 90 s with +3 player charm within 8, then leaves; the effect ends with it', () => {
    unlockAll();
    expect(cast('cupid', 'c_musician', tileT(24, 40), nowTick() + 1).ok).toBe(true);
    const b = visitors.find((v) => v.archetype === 'busker') as Visitor;
    expect(b.spawnedForPlayer).toBe(true);
    expect(b.st).toBe('wander');
    let playing = -1;
    for (let s = 0; s < 40 * SEC && playing < 0; s++) {
      run(1);
      if (b.st === 'play') playing = s;
    }
    expect(playing).toBeGreaterThan(0);
    expect(Math.hypot(b.x - 24, b.y - 40)).toBeLessThan(1);
    expect(charmAt(24, 36)).toMatchObject({ player: 3 }); // +3 within 8 ... and 2 for the kiosk? no: the far side of the park
    expect(charmAt(24, 30).player).toBe(0); // 10 tiles away
    run(88 * SEC);
    expect(b.st).toBe('play');
    run(4 * SEC);
    expect(b.st).not.toBe('play'); // 90 s are over: it leaves (act.ts playStep)
    run(2 * SEC);
    expect(effects).toHaveLength(0);
  });
  it('a blocked tile is reason.not_here, an AI busker playing within 8 is reason.busker_near, a full park is reason.park_full', () => {
    unlockAll();
    expect(reasonOf(canCast('cupid', 'c_musician', tileT(31, 12)))).toBe('reason.not_here'); // pond
    expect(reasonOf(canCast('cupid', 'c_musician', tileT(23, 23)))).toBe('reason.not_here'); // the fountain
    const ai = spawnVisitor('busker', 'g_west', {}) as Visitor;
    Object.assign(ai, { x: 22, y: 40, st: 'play', t: 60 });
    expect(reasonOf(canCast('cupid', 'c_musician', tileT(24, 40)))).toBe('reason.busker_near');
    removeVisitor(ai.id);
    for (let k = 0; k < 30; k++) adult(2 + (k % 10), 2 + Math.floor(k / 10));
    expect(people()).toBeGreaterThanOrEqual(30);
    expect(reasonOf(canCast('cupid', 'c_musician', tileT(24, 40)))).toBe('reason.park_full');
  });
  it('rain above 0.6 sends the busker to the nearest shelter within 6 (the bandstand ring or a kiosk awning)', () => {
    unlockAll();
    addProp({ kind: 'bandstand', x: 3, y: 20, w: 3, h: 3, rot: 0, placedBy: 'player' });
    markBlockDirty();
    rebuildBlock();
    W.rain = 0.9;
    cast('cupid', 'c_musician', tileT(9, 21), nowTick() + 1);
    const e = effects[0];
    expect(Math.max(Math.abs((e?.x ?? 0) - 4), Math.abs((e?.y ?? 0) - 21))).toBeLessThanOrEqual(3);
    expect(e?.x === 9 && e?.y === 21).toBe(false);
  });
});

describe('m_pigeon (02 9.3): the nearest pigeon swoops at 6.0 and the poop lands', () => {
  it('a pigeon flies at the target, the poop lands (wipe), and the pigeon flies off; the pigeon stays one of the park\'s', () => {
    const v = adult(24, 12);
    const n = creatures.filter((c) => c.kind === 'pigeon').length;
    const seen: GameEvent[] = [];
    on('embarrassed', (e) => seen.push(e));
    expect(cast('mischief', 'm_pigeon', { kind: 'visitor', id: v.id }, nowTick() + 1).ok).toBe(true);
    const c = creatures.find((x) => x.st === 'swoop');
    expect(c).toBeDefined();
    expect(c?.ownerId).toBe(v.id);
    let t = 0;
    while (creatures.some((x) => x.st === 'swoop') && t < 20 * SEC) {
      run(1);
      t++;
    }
    expect(t).toBeLessThan(10 * SEC);
    expect(seen.map((e) => e.params?.kind)).toEqual(['poop']);
    expect(['wipe', 'idle']).toContain(v.st);
    expect(v.embToday).toBe(1);
    expect(creatures.filter((x) => x.kind === 'pigeon')).toHaveLength(n);
    run(SEC);
    expect(effects).toHaveLength(0);
  });
  it('the pigeon comes from the nearest: the one closest to the target is chosen; with fog it waits 2 s longer', () => {
    const v = adult(10, 10);
    const ps = creatures.filter((c) => c.kind === 'pigeon');
    ps.forEach((c, i) => Object.assign(c, { x: 40 - i, y: 40 }));
    Object.assign(ps[3] as object, { x: 11, y: 11, st: 'peck' });
    cast('mischief', 'm_pigeon', { kind: 'visitor', id: v.id }, nowTick() + 1);
    expect(creatures.filter((c) => c.st === 'swoop').map((c) => c.id)).toEqual([ps[3]?.id]);
    expect(creatures.find((c) => c.st === 'swoop')?.t).toBe(0);
    effects.length = 0;
    W.mist = 0.8;
    const w = adult(30, 10);
    cast('mischief', 'm_pigeon', { kind: 'visitor', id: w.id }, commandTick() + 2000); // the cooldown of the first is over
    expect(creatures.filter((c) => c.st === 'swoop' && c.ownerId === w.id)[0]?.t).toBe(2);
  });
  it('a target who has had enough today is reason.enough_today and nothing is spent', () => {
    const v = adult(20, 20);
    v.embToday = 3;
    expect(reasonOf(canCast('mischief', 'm_pigeon', { kind: 'visitor', id: v.id }))).toBe('reason.enough_today');
    expect(cooldownLeft('mischief', 'm_pigeon')).toBe(0);
  });
  it('the landing scores for a paired victim: one MP through the embarrassed event', () => {
    const { a, b } = pairAt(24, 12, 4);
    b.x = a.x + 4.5; // a pair, and the partner just beyond the 4 tiles of the backfire (02 6.4)
    stay(a);
    Object.assign(b, { st: 'eat', t: 600, path: null }); // busy eating: the follower of S5-A8 does not walk over, so no backfire roll
    const score: number[] = [];
    on('embarrassed', (e) => score.push(Number(e.params?.score)));
    cast('mischief', 'm_pigeon', { kind: 'visitor', id: a.id }, nowTick() + 1);
    run(10 * SEC);
    expect(score).toEqual([1]); // landed on a member of a Pair, the partner 5 tiles away (no backfire): progression.ts awards 1 MP for it
  });
});

describe('m_sprinkler (02 9.3): a prop for 10 s; everyone in the 3x3 is soaked once, children skipped; WET = 1', () => {
  it('pops up on lawn, soaks the adults in and walking into the 3x3 once each, skips a child, sinks at 10 s', () => {
    const inside = adult(5, 30), walker = adult(9, 30), kid = child(6, 31);
    const seen: GameEvent[] = [];
    on('embarrassed', (e) => seen.push(e));
    expect(cast('mischief', 'm_sprinkler', tileT(5, 30), nowTick() + 1).ok).toBe(true);
    const sp = props.find((p) => p.kind === 'sprinkler');
    expect(sp).toBeDefined();
    expect(OCC[I(5, 30)]).toBe(sp?.id);
    for (const [x, y] of [[4, 29], [5, 30], [6, 31]] as const) expect(WET[I(x, y)]).toBe(1);
    expect(WET[I(8, 30)]).toBe(0);
    run(2);
    expect(seen.map((e) => [e.params?.kind, e.ids?.[0]])).toEqual([['soaked', inside.id]]);
    expect(kid.embToday).toBe(0);
    walker.path = [{ x: 6, y: 30 }]; // walks in later
    walker.x = 6.4;
    walker.y = 30;
    run(SEC);
    expect(seen.map((e) => e.ids?.[0])).toEqual([inside.id, walker.id]);
    run(SEC * 3);
    expect(seen).toHaveLength(2); // once each, however long they stand there
    run(7 * SEC);
    expect(props.some((p) => p.kind === 'sprinkler')).toBe(false); // sank
    expect(OCC[I(5, 30)]).toBe(0);
    expect(effects).toHaveLength(0);
  });
  it('a path tile is reason.lawn_only, a tree tile reason.taken', () => {
    expect(reasonOf(canCast('mischief', 'm_sprinkler', tileT(17, 24)))).toBe('reason.lawn_only');
    const tree = props.find((p) => p.kind === 'tree');
    expect(reasonOf(canCast('mischief', 'm_sprinkler', tileT(tree?.x ?? 0, tree?.y ?? 0)))).toBe('reason.taken');
  });
});

describe('m_peel (02 9.3): a passable prop for 120 s; the first adult non-staff walker trips; the peel goes', () => {
  it('the prop is passable; a child, a cameo and a gardener walking over it do not trip; an adult walker does, and the peel vanishes', () => {
    unlockAll();
    expect(cast('mischief', 'm_peel', tileT(17, 24), nowTick() + 1).ok).toBe(true);
    const peel = props.find((p) => p.kind === 'peel');
    expect(peel).toMatchObject({ passable: true, x: 17, y: 24, placedBy: 'sim' });
    expect(OCC[I(17, 24)]).toBe(0);
    const seen: GameEvent[] = [];
    on('embarrassed', (e) => seen.push(e));
    const kid = child(17, 24);
    kid.path = [{ x: 18, y: 24 }];
    const gardener = visitors.find((v) => v.archetype === 'gardener') ?? spawnVisitor('gardener', 'g_west', {}) as Visitor;
    Object.assign(gardener, { x: 17, y: 24, path: [{ x: 18, y: 24 }] });
    run(2);
    expect(seen).toHaveLength(0);
    expect(props.some((p) => p.kind === 'peel')).toBe(true);
    gardener.path = null;
    kid.x = 3;
    const walker = adult(17.2, 24);
    walker.path = [{ x: 18, y: 24 }];
    run(1);
    expect(seen.map((e) => [e.params?.kind, e.ids?.[0]])).toEqual([['trip', walker.id]]);
    expect(props.some((p) => p.kind === 'peel')).toBe(false);
    run(1);
    expect(effects).toHaveLength(0);
    expect(walker.embToday).toBe(1);
  });
  it('the peel lives 120 s and goes untouched; a second peel on the tile is reason.peel_here', () => {
    unlockAll();
    const t0 = nowTick() + 1;
    cast('mischief', 'm_peel', tileT(17, 24), t0);
    expect(reasonOf(canCast('mischief', 'm_peel', tileT(17, 24), t0 + 4000))).toBe('reason.peel_here');
    run(120 * SEC); // steps 1 to 7200
    expect(props.some((p) => p.kind === 'peel')).toBe(true);
    run(1);
    expect(props.some((p) => p.kind === 'peel')).toBe(false);
    expect(effects).toHaveLength(0);
  });
  it('snow or ice is reason.slippery ("the ground is slippery enough")', () => {
    unlockAll();
    W.snow = 0.8;
    expect(reasonOf(canCast('mischief', 'm_peel', tileT(17, 24)))).toBe('reason.slippery');
    W.snow = 0;
    expect(canCast('mischief', 'm_peel', tileT(17, 24)).ok).toBe(true);
  });
});

describe('m_pomeranian (02 9.3, 11.3): Pompon enters, snatches, runs to a gate, the victim chases 8 s, the item comes back, he waits outside 60 s', () => {
  it('the whole run: snatched, the item out of the victim\'s hands and back at the gate within 10 s, a chase of 8 s, Pompon outside and waiting', () => {
    unlockAll();
    const v = adult(30, 20);
    v.items.hat = true;
    v.items.purse = true;
    const seen: GameEvent[] = [];
    on('embarrassed', (e) => seen.push(e));
    on('snatch', (e) => seen.push(e));
    expect(cast('mischief', 'm_pomeranian', { kind: 'visitor', id: v.id }, nowTick() + 1).ok).toBe(true);
    const c = pompon() as NonNullable<ReturnType<typeof pompon>>;
    expect(c.outside).toBe(false);
    expect(c.st).toBe('run');
    let snatched = -1, back = -1;
    for (let s = 1; s <= 40 * SEC && back < 0; s++) {
      run(1);
      if (snatched < 0 && c.st === 'carry') snatched = s;
      if (snatched >= 0 && c.carry === null) back = s;
    }
    expect(snatched).toBeGreaterThan(0);
    expect(back - snatched).toBeLessThan(10 * SEC); // dropped within 10 s (02 13 T4)
    expect(seen.find((e) => e.kind === 'embarrassed')?.params).toMatchObject({ kind: 'snatched', item: '@item.hat' });
    expect(v.items).toEqual({ hat: true, purse: true, baguette: false, iceCream: false }); // restored on pickup
    expect(c.outside).toBe(true);
    expect(Math.round(c.cdUntil * 1e6)).toBeGreaterThan(Math.round(T.abs * 1e6));
    expect(pompon()?.st).toBe('idle');
  });
  it('the victim\'s chase lasts 8 s at 4.0 and ends in the 3 s huff', () => {
    unlockAll();
    const v = adult(30, 20);
    v.items.hat = true;
    cast('mischief', 'm_pomeranian', { kind: 'visitor', id: v.id }, nowTick() + 1);
    const states: string[] = [];
    for (let s = 0; s < 16 * SEC; s++) {
      run(1);
      if (states.at(-1) !== v.st) states.push(v.st);
    }
    expect(states).toContain('chase');
    expect(states.indexOf('huff')).toBeGreaterThan(states.indexOf('chase'));
    expect(states.at(-1)).toBe('idle'); // ends standing
  });
  it('no item is reason.no_item, a walker\'s dog within 3 is reason.dog_saw_it, a Pompon who is out is reason.busy', () => {
    unlockAll();
    const v = adult(30, 20);
    expect(reasonOf(canCast('mischief', 'm_pomeranian', { kind: 'visitor', id: v.id }))).toBe('reason.no_item');
    v.items.baguette = true;
    expect(canCast('mischief', 'm_pomeranian', { kind: 'visitor', id: v.id }).ok).toBe(true);
    creatures.push({ id: 777, kind: 'dog', x: 31, y: 21, z: 0, face: 1, st: 'walk', t: 0, tx: 31, ty: 21, ownerId: 0, targetId: 0, perchPropId: 0, carry: null, cdUntil: 0, outside: false });
    expect(reasonOf(canCast('mischief', 'm_pomeranian', { kind: 'visitor', id: v.id }))).toBe('reason.dog_saw_it');
    creatures.pop();
    cast('mischief', 'm_pomeranian', { kind: 'visitor', id: v.id }, nowTick() + 1);
    const w = adult(10, 10);
    w.items.hat = true;
    expect(reasonOf(canCast('mischief', 'm_pomeranian', { kind: 'visitor', id: w.id }, nowTick() + 100000))).toBe('reason.busy');
  });
});

/* ---------- the timelines survive a save ---------- */

describe('a snapshot in the middle of the timelines restores to the same hash (08 3.2 run 6)', () => {
  it('petals, a sunbeam, a sprinkler, a pigeon on the wing and Pompon on his run: save, restore, keep going, same hash', () => {
    unlockAll();
    const v = adult(24, 12), w = adult(30, 20);
    w.items.hat = true;
    const t0 = nowTick() + 1;
    cast('cupid', 'c_petals', tileT(5, 5), t0);
    cast('cupid', 'c_sunbeam', tileT(24, 8), t0);
    cast('mischief', 'm_sprinkler', tileT(5, 30), t0);
    cast('mischief', 'm_pigeon', { kind: 'visitor', id: v.id }, t0);
    cast('mischief', 'm_pomeranian', { kind: 'visitor', id: w.id }, t0);
    run(150);
    expect(effects.length).toBeGreaterThanOrEqual(4);
    const snap = JSON.parse(JSON.stringify(snapshot())) as ReturnType<typeof snapshot>;
    expect(snap.effects.length).toBe(effects.length);
    run(900);
    const h = stateHash(), n = rngN();
    restore(snap);
    expect(effects.length).toBe(snap.effects.length);
    run(900);
    expect(stateHash()).toBe(h);
    expect(rngN()).toBe(n);
    stepAbilities(SIM_DT); // an empty step on a restored list changes nothing it should not
  });
  it('the cooldowns and charges are in the snapshot and the hash', () => {
    const h0 = stateHash();
    cast('cupid', 'c_petals', tileT(5, 5), nowTick() + 1);
    const snap = JSON.parse(JSON.stringify(snapshot())) as ReturnType<typeof snapshot>;
    expect(snap.sides.cooldowns.cupid.c_petals).toBe(nowTick() + 1 + 30 * SEC);
    expect(stateHash()).not.toBe(h0);
  });
});

