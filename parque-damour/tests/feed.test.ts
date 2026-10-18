// tests/feed.test.ts
// Locks 07 S5.8 feed.test.ts: the feed cap of 40 (03 3.11, GV feedEv 10723) and nested key resolution after a language switch (03 12
// item 6; 08 2.7 "nested keys resolve after a language switch"); and the romance lines of 02 12.5 item 2 from the sim's events (07 S5.6
// step 9): pair formed, a stage, Happily, Parted, an embarrassment landed and backfired, each with its params; stage and item as `@` keys.
import { describe, it, expect, beforeEach } from 'vitest';
import { SIM_DT, newPark, simulate } from '../src/core/loop.ts';
import { T } from '../src/core/clock.ts';
import { clearListeners, drain, emit } from '../src/core/events.ts';
import { FEED_CAP, clearFeed, feedEntries, initFeed, pushFeed } from '../src/ui/feed.ts';
import { setLang, t } from '../src/ui/i18n.ts';
import { spawnVisitor, type Visitor } from '../src/entities/visitor.ts';
import { tryForm, type Pair } from '../src/entities/romance.ts';
import { completeStage, startStage } from '../src/entities/romance-stages.ts';
import { land } from '../src/entities/embarrass.ts';

function single(x: number, y: number, sex: 'f' | 'm'): Visitor {
  const v = spawnVisitor('single', 'g_west', { sex, seeks: sex === 'f' ? 'm' : 'f' }) as Visitor;
  Object.assign(v, { x, y, path: null, st: 'idle', t: 0, comfort: 0.7, leaveAt: T.abs + 0.4 });
  return v;
}

beforeEach(() => {
  newPark(3);
  clearFeed();
  setLang('en');
});

describe('the feed list (03 3.11; GV feedEv 10723)', () => {
  it('keeps the newest 40, newest first', () => {
    for (let k = 0; k < 55; k++) pushFeed({ key: 'feed.regular_return', params: { name: 'N' + k }, abs: 0.3, x: 0, y: 0, ids: [] });
    expect(feedEntries()).toHaveLength(FEED_CAP);
    expect(feedEntries()[0]?.params.name).toBe('N54');
    expect(feedEntries()[39]?.params.name).toBe('N15');
  });
  it('a stored { key, params } with a nested @ key renders the ES word after setLang(es) (03 12 item 6)', () => {
    pushFeed({ key: 'hud.romance.pair', params: { a: 'Amélie', b: 'Théo', stage: '@stage.bench' }, abs: 0.3, x: 0, y: 0, ids: [] });
    const e = feedEntries()[0];
    if (!e) throw new Error('no entry');
    expect(t(e.key, e.params)).toBe('Amélie & Théo · Bench');
    setLang('es');
    expect(t(e.key, e.params)).toBe('Amélie & Théo · Banco');
  });
});

describe('the romance lines (02 12.5 item 2; 07 S5.6 step 9)', () => {
  it('pair formed, a stage, Parted, an embarrassment landed and backfired: one line each, rendered at display time', () => {
    clearListeners();
    initFeed(); // the frame listeners (once per module)
    const a = single(20, 30, 'f'), b = single(21, 30, 'm');
    const p = tryForm(a, b, true) as Pair;
    drain(0);
    expect(feedEntries()[0]?.key).toBe('feed.pair.formed');
    expect(t(feedEntries()[0]?.key ?? '', feedEntries()[0]?.params)).toBe(`${a.name} and ${b.name} noticed each other`);
    p.stage = 1;
    startStage(p, 2, false);
    completeStage(p);
    drain(0);
    expect(feedEntries()[0]?.key).toBe('feed.stage.chat');
    b.x = 26; // beyond 4: no backfire roll
    land('snatched', a.id, 'mischief');
    drain(0);
    const emb = feedEntries()[0];
    expect(emb?.key).toBe('feed.emb.snatched');
    expect(emb?.params.item).toMatch(/^@item\./); // the item is a nested key
    setLang('es');
    expect(t(emb?.key ?? '', emb?.params)).toContain(a.name);
    expect(t(emb?.key ?? '', emb?.params)).not.toContain('@');
    setLang('en');
    emit({ kind: 'backfired', tick: 1, x: 1, y: 1, ids: [a.id, b.id], params: { feed: 'feed.emb.backfire.mime', a: a.name, b: b.name, kind: 'mime' } });
    drain(0);
    expect(feedEntries()[0]?.key).toBe('feed.emb.backfire.mime');
    expect(feedEntries()[0]?.params.kind).toBeUndefined(); // the sim's meta is not kept
    p.affinity = 0.1;
    simulate(SIM_DT, 1); // Parted (affinity below 0.20 at stage 2)
    drain(0);
    expect(feedEntries().some((e) => e.key === 'feed.parted')).toBe(true);
  });
});
