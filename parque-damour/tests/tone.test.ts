// tests/tone.test.ts
// Locks register 3.14 and section 5, 02 6.4 and 02 13 (tone: T1, T2, T3, T5, T6, T9 and the Do-not on reaction lengths) and the 07
// S5.7 item 3 done-whens (08 2.4 tone.test.ts rows): the ten kinds, children refused, the cap of 3 a day, the 15 % backfire, the costs.
import { describe, it, expect, beforeEach } from 'vitest';
import { SIM_DT, newPark, simulate } from '../src/core/loop.ts';
import { ABILITIES, canCast, cast, commandTick } from '../src/play/abilities.ts';
import { bindProgression, resetProgress, setProgress } from '../src/play/progression.ts';
import { setArrivalsState } from '../src/entities/visitor.ts';
import { pompon } from '../src/entities/pomeranian.ts';
import { STEPS_PER_DAY, T } from '../src/core/clock.ts';
import { clearListeners, on, type GameEvent } from '../src/core/events.ts';
import { arriveGroup, spawnVisitor, type Visitor } from '../src/entities/visitor.ts';
import { REACTION } from '../src/entities/brain.ts';
import { pairs, tryForm, type Pair } from '../src/entities/romance.ts';
import { BACKFIRE_T, EMB_KINDS, canTarget, embCost, land } from '../src/entities/embarrass.ts';
import { ensureGardener } from '../src/entities/staff.ts';
import { visitors } from '../src/entities/visitor.ts';
import { AVATAR_SIDE, applyNow } from '../src/core/commands.ts';
import { avatarTap } from '../src/play/avatar.ts';
import { getPlayer } from '../src/play/mode.ts';
import { creatureById } from '../src/entities/creatures.ts';
import { en } from '../src/ui/strings/en.ts';
import { es } from '../src/ui/strings/es.ts';

function single(x: number, y: number, sex: 'f' | 'm'): Visitor {
  const v = spawnVisitor('single', 'g_west', { sex, seeks: sex === 'f' ? 'm' : 'f' }) as Visitor;
  Object.assign(v, { x, y, path: null, st: 'idle', t: 0, comfort: 0.7, leaveAt: T.abs + 0.4 });
  return v;
}
function pairAt(d: number, stage: Pair['stage']): { p: Pair; a: Visitor; b: Visitor } {
  const a = single(30, 30, 'f'), b = single(31, 30, 'm');
  const p = tryForm(a, b, true) as Pair;
  p.stage = stage;
  p.affinity = 0.6;
  b.x = a.x + d;
  return { p, a, b };
}

beforeEach(() => {
  clearListeners();
  newPark(7);
});

describe('the ten kinds (register section 5; 02 13 T2)', () => {
  it('EMB_KINDS equals the ten kinds in order', () => {
    expect([...EMB_KINDS]).toEqual(['poop', 'soaked', 'trip', 'snatched', 'wasp', 'drenched', 'rival', 'mime', 'fog', 'flock']);
    expect(Object.keys(REACTION).sort()).toEqual([...EMB_KINDS].sort());
    expect(Object.keys(BACKFIRE_T).sort()).toEqual([...EMB_KINDS].sort());
  });
});

describe('children are never targets (02 13 T3)', () => {
  it('land on a child returns reason.not_children for every kind, and its embToday stays 0', () => {
    const [, c] = arriveGroup('family', 'g_west') as [Visitor, Visitor];
    expect(c.archetype).toBe('child');
    expect(canTarget(c).ok).toBe(false);
    for (const k of EMB_KINDS) expect(land(k, c.id, 'mischief')).toEqual({ ok: false, reason: 'reason.not_children' });
    expect(c.embToday).toBe(0);
  });
});

describe('the cost table (02 6.4; 06 10)', () => {
  it('base x stage factor, capped at 0.15', () => {
    expect(embCost('poop', 2)).toBeCloseTo(0.08, 12);
    expect(embCost('poop', 4)).toBeCloseTo(0.1, 12);
    expect(embCost('poop', 6)).toBeCloseTo(0.12, 12);
    expect(embCost('rival', 7)).toBe(0.15);
    expect(embCost('soaked', 3)).toBeCloseTo(0.0875, 12);
    expect(embCost('wasp', 5)).toBeCloseTo(0.135, 12);
  });
  it('a landing: comfort -0.3, embToday +1 on the victim and the pair, affinity minus the cost, a reaction next', () => {
    const { p, a } = pairAt(6, 4);
    land('poop', a.id, 'mischief');
    expect(a.comfort).toBeCloseTo(0.4, 10);
    expect([a.embToday, p.embToday]).toEqual([1, 1]);
    expect(p.affinity).toBeCloseTo(0.5, 10);
    expect(a.pendingEmb).toBe('poop');
    simulate(SIM_DT, 1);
    expect(a.st).toBe('wipe'); // rung 1 starts the reaction at the next decision (this step), and act counts it down
    expect(a.t).toBeCloseTo(4 - SIM_DT, 10);
  });
});

describe('at most 3 a day (02 6.4 rule 2; 02 13 T5)', () => {
  it('the 4th landing returns reason.enough_today and spends nothing; the count resets at f = 0', () => {
    const v = single(10, 30, 'm');
    for (let k = 0; k < 3; k++) expect(land('trip', v.id, 'mischief')).toEqual({ ok: true, backfire: false });
    const c = v.comfort;
    expect(land('trip', v.id, 'mischief')).toEqual({ ok: false, reason: 'reason.enough_today', params: { name: v.name } });
    expect([v.embToday, v.comfort]).toEqual([3, c]);
    v.leaveAt = 99;
    v.comfort = 0.7;
    const toDay2 = Math.round((1 - T.f) * STEPS_PER_DAY) + 1;
    for (let s = 0; s < toDay2; s++) simulate(SIM_DT, 1);
    expect(T.day).toBe(2);
    expect(v.embToday).toBe(0);
  });
});

describe('the 15 % backfire (register 3.5; 02 13 T6)', () => {
  it('400 landings with the partner 2 tiles away backfire 40 to 80 times; at 6 tiles never', () => {
    let near = 0, far = 0;
    const { p, a, b } = pairAt(2, 3);
    for (let k = 0; k < 400; k++) {
      Object.assign(a, { embToday: 0, x: 30, y: 30 });
      Object.assign(b, { x: 32, y: 30 });
      p.embToday = 0;
      p.affinity = 0.6;
      const r = land('poop', a.id, 'mischief');
      if (r.ok && r.backfire) near++;
    }
    for (let k = 0; k < 400; k++) {
      Object.assign(a, { embToday: 0, x: 30, y: 30 });
      Object.assign(b, { x: 36, y: 30 });
      p.embToday = 0;
      const r = land('poop', a.id, 'mischief');
      if (r.ok && r.backfire) far++;
    }
    expect(near).toBeGreaterThanOrEqual(40);
    expect(near).toBeLessThanOrEqual(80);
    expect(far).toBe(0);
    expect(pairs).toContain(p);
  });

  it('a backfire: affinity +0.04, no comfort lost, no embToday, no `embarrassed` event; both laugh', () => {
    const ev: GameEvent[] = [];
    on('embarrassed', (e) => ev.push(e));
    const { p, a, b } = pairAt(2, 3);
    let k = 0;
    for (; k < 100; k++) {
      Object.assign(a, { embToday: 0, comfort: 0.7 });
      p.embToday = 0;
      p.affinity = 0.6;
      ev.length = 0;
      const r = land('mime', a.id, 'mischief');
      if (r.ok && r.backfire) break;
    }
    expect(k).toBeLessThan(100);
    expect(p.affinity).toBeCloseTo(0.64, 10);
    expect([a.comfort, a.embToday, p.embToday, ev.length]).toEqual([0.7, 0, 0, 0]);
    expect([a.st, b.st, a.t]).toEqual(['laugh', 'laugh', 4]);
  });
});

describe('staff and couples (02 6.4 rule 3; 02 13 T9)', () => {
  it('a gardener plays the reaction (at most 4 s) and scores 0; a couple member costs the couple and scores 1', () => {
    const ev: GameEvent[] = [];
    on('embarrassed', (e) => ev.push(e));
    ensureGardener(600);
    const g = visitors.find((v) => v.archetype === 'gardener') as Visitor;
    expect(land('rival', g.id, 'mischief')).toEqual({ ok: false, reason: 'reason.not_courting' }); // rival lands only on a pair member
    expect(land('poop', g.id, 'mischief').ok).toBe(true);
    expect(ev[0]?.params?.score).toBe(0);
    simulate(SIM_DT, 1);
    expect(g.st).toBe('wipe');
    expect(g.t).toBeLessThanOrEqual(4);
    const [f, m] = arriveGroup('couple', 'g_west') as [Visitor, Visitor];
    m.x = f.x + 6;
    const p = pairs.find((q) => q.id === f.pairId) as Pair;
    const aff = p.affinity;
    land('poop', f.id, 'mischief');
    expect(p.affinity).toBeCloseTo(aff - 0.1, 10); // stage 3: 0.08 x 1.25
    expect(ev[1]?.params?.score).toBe(1);
  });
  it('rival on someone not courting has no effect: ok false, reason.not_courting', () => {
    const v = single(10, 30, 'f');
    expect(land('rival', v.id, 'mischief')).toEqual({ ok: false, reason: 'reason.not_courting' });
    expect([v.embToday, v.comfort]).toEqual([0, 0.7]);
  });
});

describe('reaction lengths and words (02 13 Do-not, T1)', () => {
  it('no reaction longer than 8 s except distracted 30 and lost 60; no backfire scene longer than 8 s', () => {
    for (const [st, t] of Object.values(REACTION)) {
      if (st === 'distracted') expect(t).toBe(30);
      else if (st === 'lost') expect(t).toBe(60);
      else expect(t).toBeLessThanOrEqual(8);
    }
    for (const t of Object.values(BACKFIRE_T)) expect(t).toBeLessThanOrEqual(8);
  });
  it('no value in en or es contains hurt, injured, hospital, blood, dead or died (nor their ES words)', () => {
    const bad = /hurt|injur|hospital|blood|\bdead\b|\bdied\b|herid|sangre|muert|lesion/i;
    for (const [k, v] of [...Object.entries(en), ...Object.entries(es)]) expect(bad.test(v), k + ': ' + v).toBe(false);
  });
});

describe('the abilities keep the tone rules (S6; 02 13 T3, T4; 07 S6.8)', () => {
  const child = (x: number, y: number): Visitor => {
    const c = spawnVisitor('child', 'g_west', {}) as Visitor;
    Object.assign(c, { x, y, path: null, st: 'idle', t: 0, leaveAt: T.abs + 0.9 });
    return c;
  };
  beforeEach(() => {
    bindProgression();
    resetProgress();
    setProgress({ cp: 70, mp: 70 });
    setArrivalsState({ arrivalT: 1e9, pace: 'calm' });
  });
  it('no ability can target a child: all 19 answer reason.not_children to a child under the tap, and spend nothing', () => {
    const c = child(20, 20);
    for (const a of ABILITIES) {
      if (a.target === 'park') continue; // nobody is tapped
      const r = canCast(a.side, a.id, { kind: 'visitor', id: c.id });
      expect(r, a.id).toEqual({ ok: false, reason: 'reason.not_children' });
      expect(cast(a.side, a.id, { kind: 'visitor', id: c.id }), a.id).toEqual(r);
    }
    expect(c.embToday).toBe(0);
  });
  it('m_sprinkler skips children inside: an adult beside is soaked once, the child keeps embToday 0', () => {
    const adult = single(5, 30, 'f');
    const kid = child(6, 30);
    const seen: GameEvent[] = [];
    on('embarrassed', (e) => seen.push(e));
    expect(cast('mischief', 'm_sprinkler', { kind: 'tile', x: 5, y: 30 }, commandTick()).ok).toBe(true);
    for (let s = 0; s < 600; s++) simulate(SIM_DT, 1);
    expect(seen.map((e) => e.ids?.[0])).toEqual([adult.id]);
    expect([kid.embToday, kid.pendingEmb]).toEqual([0, null]); // not soaked: no landing, nothing waiting to play
    expect(kid.st).not.toBe('shake');
  });
  it('a peel never trips a child walking over it', () => {
    const kid = child(17, 24);
    kid.path = [{ x: 18, y: 24 }];
    cast('mischief', 'm_peel', { kind: 'tile', x: 17, y: 24 }, commandTick());
    simulate(SIM_DT, 1);
    expect(kid.embToday).toBe(0);
  });
  it('a snatched item comes back: the victim has what they had within 10 s of Pompon\'s snatch (T4)', () => {
    const v = single(30, 20, 'f');
    Object.assign(v.items, { hat: true, purse: true });
    const before = { ...v.items };
    const seen: GameEvent[] = [];
    on('snatch', (e) => seen.push(e));
    cast('mischief', 'm_pomeranian', { kind: 'visitor', id: v.id }, commandTick());
    let took = -1, gave = -1;
    for (let s = 1; s <= 60 * 60 && gave < 0; s++) {
      simulate(SIM_DT, 1);
      if (took < 0 && !v.items.hat) took = s;
      if (took >= 0 && v.items.hat) gave = s;
    }
    expect(took).toBeGreaterThan(0);
    expect(gave - took).toBeLessThan(10 * 60);
    expect(v.items).toEqual(before);
    expect(seen.map((e) => e.params?.drop ?? 0)).toEqual([0, 1]);
    expect(pompon()?.outside).toBe(true);
  });
  it('the 4th landing of the day is refused before any effect, by the abilities too (T5): m_pigeon on a person with embToday 3', () => {
    const v = single(20, 20, 'f');
    v.embToday = 3;
    expect(canCast('mischief', 'm_pigeon', { kind: 'visitor', id: v.id })).toEqual({ ok: false, reason: 'reason.enough_today' });
  });
});

describe('the avatars keep the tone rules (S7; 02 13 T3, T4, T5, T9; 02 10.4, 10.5, 10.7, 10.10)', () => {
  const kid = (x: number, y: number): Visitor => {
    const c = spawnVisitor('child', 'g_west', {}) as Visitor;
    Object.assign(c, { x, y, path: null, st: 'idle', t: 0, leaveAt: T.abs + 0.9 });
    return c;
  };
  const tap = (v: Visitor) => avatarTap({ x: Math.round(v.x), y: Math.round(v.y) }, { kind: 'visitor', id: v.id, tile: { x: Math.round(v.x), y: Math.round(v.y) } });
  const enter = (a: 'a_pigeon' | 'a_pomeranian' | 'a_florist') => expect(applyNow({ side: AVATAR_SIDE[a], kind: 'avatar.enter', payload: { avatar: a } }).ok).toBe(true);
  beforeEach(() => {
    bindProgression();
    resetProgress();
    setProgress({ cp: 70, mp: 70 });
    setArrivalsState({ arrivalT: 1e9, pace: 'calm' });
  });
  it('no avatar targets a child: the pigeon and the florist refuse with reason.not_children, the pomeranian only plays with it; embToday stays 0 and the items stay', () => {
    const c = kid(20, 20);
    c.items.iceCream = true;
    enter('a_pigeon');
    expect(tap(c)).toBe('reason.not_children');
    applyNow({ side: 'mischief', kind: 'avatar.leave', payload: {} });
    enter('a_florist');
    expect(tap(c)).toBe('reason.not_children');
    applyNow({ side: 'cupid', kind: 'avatar.leave', payload: {} });
    enter('a_pomeranian');
    expect(tap(c)).toBe('avatar.status.playing'); // a game, never a snatch (the ice cream stays)
    for (let s = 0; s < 60 * 12; s++) simulate(SIM_DT, 1);
    expect([c.embToday, c.pendingEmb, c.items.iceCream]).toEqual([0, null, true]);
  });
  it('the 4th landing of the day is refused by the avatars too (T5): the pigeon and the pomeranian answer reason.enough_today', () => {
    const v = single(20, 20, 'f');
    v.embToday = 3;
    v.items.hat = true;
    enter('a_pigeon');
    expect(tap(v)).toBe('reason.enough_today');
    applyNow({ side: 'mischief', kind: 'avatar.leave', payload: {} });
    enter('a_pomeranian');
    expect(tap(v)).toBe('reason.enough_today');
    expect(v.embToday).toBe(3);
  });
  it('staff are not the pigeon\'s or the pomeranian\'s targets (they fall through to the tile steps): a gardener is flown past, not pooped on', () => {
    const gard = spawnVisitor('gardener', 'g_west', {}) as Visitor;
    Object.assign(gard, { x: 20, y: 20, path: null, st: 'idle', t: 0 });
    gard.items.hat = true;
    enter('a_pigeon');
    expect(tap(gard)).toBe('avatar.status.flying');
    expect(gard.embToday).toBe(0);
    applyNow({ side: 'mischief', kind: 'avatar.leave', payload: {} });
    enter('a_pomeranian');
    expect(tap(gard)).toBe('avatar.status.walking');
  });
  it('the pomeranian\'s snatch gives it back within 10 s of the take (T4), as m_pomeranian\'s does, and Pompon stays in the park', () => {
    const v = single(30, 20, 'f');
    Object.assign(v.items, { hat: true, purse: true });
    const before = { ...v.items };
    enter('a_pomeranian');
    const c = creatureById(getPlayer());
    for (let s = 0; s < 60 * 8; s++) simulate(SIM_DT, 1);
    expect(c?.st).toBe('wait');
    expect(tap(v)).toBe('avatar.status.snatching');
    let took = -1, gave = -1;
    for (let s = 1; s <= 60 * 90 && gave < 0; s++) {
      simulate(SIM_DT, 1);
      if (took < 0 && !v.items.hat) took = s;
      if (took >= 0 && v.items.hat) gave = s;
    }
    expect(took).toBeGreaterThan(0);
    expect(gave - took).toBeLessThan(10 * 60);
    expect(v.items).toEqual(before);
    expect(c?.outside).toBe(false);
  });
  it('the florist only ever raises affinity: a bouquet costs the pair nothing, and a person in a reaction is not handed one', () => {
    const { p, a, b } = pairAt(1, 3);
    const aff = p.affinity;
    enter('a_florist');
    const f = visitors.find((x) => x.spawnedForPlayer) as Visitor;
    Object.assign(f, { x: a.x, y: a.y + 3, st: 'idle', t: 0, path: null });
    expect(tap(a)).toBe('avatar.status.bouquet');
    for (let s = 0; s < 60 * 10; s++) simulate(SIM_DT, 1);
    expect(p.affinity).toBeGreaterThanOrEqual(aff);
    expect([a.embToday, b.embToday]).toEqual([0, 0]);
  });
});
