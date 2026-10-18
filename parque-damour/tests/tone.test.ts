// tests/tone.test.ts
// Locks register 3.14 and section 5, 02 6.4 and 02 13 (tone: T1, T2, T3, T5, T6, T9 and the Do-not on reaction lengths) and the 07
// S5.7 item 3 done-whens (08 2.4 tone.test.ts rows): the ten kinds, children refused, the cap of 3 a day, the 15 % backfire, the costs.
import { describe, it, expect, beforeEach } from 'vitest';
import { SIM_DT, newPark, simulate } from '../src/core/loop.ts';
import { STEPS_PER_DAY, T } from '../src/core/clock.ts';
import { clearListeners, on, type GameEvent } from '../src/core/events.ts';
import { arriveGroup, spawnVisitor, type Visitor } from '../src/entities/visitor.ts';
import { REACTION } from '../src/entities/brain.ts';
import { pairs, tryForm, type Pair } from '../src/entities/romance.ts';
import { BACKFIRE_T, EMB_KINDS, canTarget, embCost, land } from '../src/entities/embarrass.ts';
import { ensureGardener } from '../src/entities/staff.ts';
import { visitors } from '../src/entities/visitor.ts';
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
