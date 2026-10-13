// @vitest-environment jsdom
// tests/ui/card.test.ts
// Locks S4 part C's shell (07 S4.6 steps 14-16): the single card of 02 12.3 items 1, 2 and 5 and 04 5.5 item 1 (select and follow at a
// zoom of at least 1.8, GV selectGnome 10867; the name, "archetype · age", the relationship line, the bars Mood, Rested and Full in their
// tokens and --ember below 0.3, 0.25, 0.3, the doing line t('doing.' + st); any other hit clears it); the Visitors chip of 02 12.2 (the
// count through plural, "+" enqueues visitor.call and stops the click, GV 12171); the Census of 02 12.4 (a row per person, the summary
// with plural, a row tap selects, the 1.2 s repaint while open, Census and Events exclusive, GV 10748); the feed of 02 12.5 items 1-2
// (one line, a 14 s fade, 40 entries, the lines S4 announces); and 07 S3.6 step 7 (GV setTool 11070): a tool other than the hand ends
// the selection as well as the follow. 08 lists no row for these files; they are added here. jsdom, index.html.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIM_DT, newPark, simulate } from '../../src/core/loop.ts';
import { clearPending, log, pendingCount } from '../../src/core/commands.ts';
import { drain, emit } from '../../src/core/events.ts';
import { CAP_PEOPLE, people, removeVisitor, resetVisitors, spawnVisitor, visitors, type Visitor } from '../../src/entities/visitor.ts';
import { cam, followed } from '../../src/render/camera.ts';
import { $ } from '../../src/ui/dom.ts';
import { setLang } from '../../src/ui/i18n.ts';
import { LOW_MOOD, LOW_RESTED, ZOOM_SELECT, clearSel, initCard, select, selectedVisitor, updateCard } from '../../src/ui/card.ts';
import { CENSUS_S, closeSheets, initSheets, openSheet, sheetOpen, updateSheets } from '../../src/ui/sheets.ts';
import { initHud, updateHud } from '../../src/ui/hud.ts';
import { FEED_CAP, FEED_FADE_S, ageFeed, clearFeed, feedEntries, initFeed, pushFeed } from '../../src/ui/feed.ts';
import { activeTool, buildRail, setTool } from '../../src/ui/rail.ts';
import { en } from '../../src/ui/strings/en.ts';

const ROOT = join(import.meta.dirname, '..', '..');

beforeAll(() => {
  const doc = new DOMParser().parseFromString(readFileSync(join(ROOT, 'index.html'), 'utf8'), 'text/html');
  document.body.innerHTML = doc.body.innerHTML; // the module script does not run from innerHTML
  const style = document.createElement('style');
  style.textContent = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
  document.head.appendChild(style);
  setLang('en');
  initSheets();
  initHud();
  initFeed();
  buildRail({ onNew: () => undefined });
  initCard();
});

beforeEach(() => {
  newPark(101);
  clearPending();
  clearSel();
  closeSheets();
  clearFeed();
  resetVisitors();
  cam.z = 1.3;
});

/** A visitor of `arch` standing on (x, y) with these needs. */
function put(arch: Visitor['archetype'], x: number, y: number, needs: Partial<Visitor> = {}): Visitor {
  const v = spawnVisitor(arch, 'g_north') as Visitor;
  Object.assign(v, { x, y, path: null, st: 'idle' }, needs);
  return v;
}
const pill = (id: string): HTMLButtonElement => document.querySelector(`#tools .tool[data-id="${id}"]`) as HTMLButtonElement;
const bar = (need: string): HTMLElement => document.querySelector(`#cBars .bar[data-need="${need}"]`) as HTMLElement;
const width = (need: string): string => (bar(need).querySelector('u') as HTMLElement).style.width;

describe('02 12.3 items 1, 2, 5 and 04 5.5 item 1: the single card (GV selectGnome 10867, updateCard 10818)', () => {
  it('a visitor hit selects and follows at zoom 1.8 or more and fills the card; Heart and Pin stay hidden until S5', () => {
    const v = put('single', 20, 30, { comfort: 0.62, energy: 0.81, hunger: 0.35, ageWord: 'young', sex: 'f' });
    select({ kind: 'visitor', id: v.id, tile: { x: 20, y: 30 } });
    expect(selectedVisitor()).toBe(v.id);
    expect(followed()).toEqual({ kind: 'visitor', id: v.id });
    expect(cam.z).toBeGreaterThanOrEqual(ZOOM_SELECT);
    expect($('card').classList.contains('on')).toBe(true);
    expect($('cName').textContent).toBe(v.name);
    expect($('cSub').textContent).toBe('single · young');
    expect($('cRel').textContent).toBe(en['card.rel.single.f']);
    expect($('cRel').hidden).toBe(false);
    expect([width('mood'), width('rest'), width('full')]).toEqual(['62%', '81%', '65%']);
    for (const n of ['mood', 'rest', 'full']) expect(bar(n).classList.contains('low'), n).toBe(false);
    expect(bar('heart').hidden).toBe(true);
    expect($('cPin').hidden).toBe(true);
    expect($('cDo').textContent).toBe(en['doing.idle']);
  });
  it('a zoom already past 1.8 is kept; the bars turn low below 0.3, 0.25 and 0.3 (Full is 1 - hunger); the doing line follows st', () => {
    cam.z = 2.4;
    const v = put('elder', 20, 30, { comfort: LOW_MOOD - 0.01, energy: LOW_RESTED - 0.01, hunger: 0.75 });
    select({ kind: 'visitor', id: v.id, tile: null });
    expect(cam.z).toBe(2.4);
    expect($('cSub').textContent).toBe('elder · elder');
    expect($('cRel').textContent).toBe(en['card.rel.visiting']);
    for (const n of ['mood', 'rest', 'full']) expect(bar(n).classList.contains('low'), n).toBe(true);
    v.st = 'feed';
    v.comfort = 0.3;
    updateCard();
    expect(bar('mood').classList.contains('low')).toBe(false);
    expect($('cDo').textContent).toBe(en['doing.feed']);
  });
  it('the relationship line: a couple with the other half, the parent with the children, the child with the parent, staff work here', () => {
    const a = put('couple', 20, 30), b = put('couple', 21, 30);
    a.coupleOf = b.id;
    b.coupleOf = a.id;
    const p = put('family', 22, 30), c = put('child', 23, 30);
    p.parentOf = c.id;
    c.childOf = p.id;
    const g = put('gardener', 24, 30);
    const want: Array<[Visitor, string]> = [
      [a, 'with ' + b.name], [p, en['card.rel.family'] as string], [c, 'with ' + p.name], [g, en['card.rel.staff'] as string],
    ];
    for (const [v, line] of want) {
      select({ kind: 'visitor', id: v.id, tile: null });
      expect($('cRel').textContent, v.archetype).toBe(line);
    }
  });
  it('a tile, a prop, a creature or none clears the card and the follow; a visitor who leaves clears it on the next refresh', () => {
    const v = put('single', 20, 30);
    for (const hit of [{ kind: 'tile', id: 0, tile: { x: 5, y: 5 } }, { kind: 'prop', id: 3, tile: null }, { kind: 'creature', id: 1, tile: null }, { kind: 'none', id: 0, tile: null }] as const) {
      select({ kind: 'visitor', id: v.id, tile: null });
      select(hit);
      expect(selectedVisitor(), hit.kind).toBe(0);
      expect(followed(), hit.kind).toBeNull();
      expect($('card').classList.contains('on')).toBe(false);
    }
    select({ kind: 'visitor', id: v.id, tile: null });
    removeVisitor(v.id);
    updateCard();
    expect(selectedVisitor()).toBe(0);
    expect($('card').classList.contains('on')).toBe(false);
  });
  it('the card hides while a sheet is open (body.sheet, GV CSS 226)', () => {
    const v = put('single', 20, 30);
    select({ kind: 'visitor', id: v.id, tile: null });
    openSheet('census');
    expect(document.body.classList.contains('sheet')).toBe(true);
    expect(getComputedStyle($('card')).opacity).toBe('0');
    expect(getComputedStyle(document.body).display).not.toBe('none'); // body.sheet must not match a sheet's own rule
    closeSheets();
    expect(document.body.classList.contains('sheet')).toBe(false);
  });
});

describe('07 S3.6 step 7 (GV setTool 11070): a tool other than the hand ends the selection, the card, the ring and the follow', () => {
  it('the Hand pill keeps the selection; Path, Bench and Remove each clear it (a real click on the Park strip)', () => {
    const v = put('single', 20, 30);
    select({ kind: 'visitor', id: v.id, tile: null });
    pill('hand').click();
    expect(selectedVisitor()).toBe(v.id);
    expect($('card').classList.contains('on')).toBe(true);
    for (const id of ['path', 'bench', 'remove']) {
      setTool('hand');
      select({ kind: 'visitor', id: v.id, tile: null });
      pill(id).click();
      expect(activeTool(), id).toBe(id);
      expect(selectedVisitor(), id).toBe(0);
      expect(followed(), id).toBeNull();
      expect($('card').classList.contains('on'), id).toBe(false);
    }
    setTool('hand');
  });
});

describe('02 12.2: the Visitors chip and its "+" (GV 12171)', () => {
  it('the chip counts the people through plural; "+" enqueues visitor.call and the click goes no further', () => {
    put('single', 20, 30);
    updateHud(0.4);
    expect($('tPop').textContent).toBe('1 visitor');
    put('elder', 21, 30);
    updateHud(0.4);
    expect($('tPop').textContent).toBe('2 visitors');
    let bubbled = 0;
    $('hudVisitorsWrap').addEventListener('click', () => bubbled++);
    const n0 = pendingCount(), people0 = people();
    $('bAdd').click();
    expect(bubbled).toBe(0);
    expect(sheetOpen()).toBeNull(); // the census chip never saw it
    expect(pendingCount()).toBe(n0 + 1);
    simulate(SIM_DT, 0);
    expect(log().at(-1)).toMatchObject({ side: 'park', kind: 'visitor.call', payload: { gate: null } });
    expect(people()).toBeGreaterThan(people0);
    $('hudVisitors').click();
    expect(sheetOpen()).toBe('census');
  });
});

describe('02 12.4: the Census (GV renderCensus 10973)', () => {
  it('a row per person (name, "archetype · doing", the partner) and "N in the park · k courting" with "room for M more" by plural', () => {
    const a = put('couple', 20, 30), b = put('couple', 21, 30);
    a.coupleOf = b.id;
    b.coupleOf = a.id;
    put('jogger', 22, 30, { st: 'strollLoop' });
    openSheet('census');
    const rows = [...document.querySelectorAll<HTMLElement>('#censusList .row')];
    expect(rows.map((r) => r.querySelector('b')?.textContent)).toEqual(visitors.map((v) => v.name));
    expect(rows[2]?.querySelector('small')?.textContent).toBe('jogger · ' + en['doing.strollLoop']);
    expect(rows[0]?.querySelector('small.r')?.textContent).toBe('with ' + b.name);
    expect(rows[2]?.querySelector('small.r')).toBeNull();
    const parts = [...document.querySelectorAll('#censusSum span')].map((s) => s.textContent);
    expect(parts).toEqual(['3 in the park · 0 courting', 'room for 27 more']);
    while (people() < CAP_PEOPLE - 1) put('elder', 10, 10);
    openSheet('census');
    expect(document.querySelectorAll('#censusSum span')[1]?.textContent).toBe('room for 1 more');
  });
  it('a row tap selects and follows that person and marks the row; the sheet repaints every 1.2 s while open', () => {
    const a = put('single', 20, 30), b = put('single', 25, 30);
    openSheet('census');
    document.querySelector<HTMLElement>(`#censusList .row[data-id="${b.id}"] small`)?.click();
    expect(selectedVisitor()).toBe(b.id);
    expect(followed()).toEqual({ kind: 'visitor', id: b.id });
    expect(document.querySelector(`#censusList .row[data-id="${b.id}"]`)?.classList.contains('sel')).toBe(true);
    expect(document.querySelector(`#censusList .row[data-id="${a.id}"]`)?.classList.contains('sel')).toBe(false);
    a.st = 'read';
    const text = (): string | null | undefined => document.querySelector(`#censusList .row[data-id="${a.id}"] small`)?.textContent;
    updateSheets(CENSUS_S - 0.1); // the row tap repainted; the next repaint comes 1.2 s later
    expect(text()).toBe('single · ' + en['doing.idle']);
    updateSheets(0.2);
    expect(text()).toBe('single · ' + en['doing.read']);
  });
  it('Census and Events are mutually exclusive (GV 10748, 10991)', () => {
    openSheet('census');
    openSheet('evlog');
    expect($('census').classList.contains('on')).toBe(false);
    expect(sheetOpen()).toBe('evlog');
    openSheet('census');
    expect($('evlog').classList.contains('on')).toBe(false);
  });
});

describe('02 12.5 items 1-2: the feed line and the 40 entries (GV logEv 10717, ageFeed 10732)', () => {
  const at = { abs: 0.4, x: 3, y: 4, ids: [7] };
  it('one line through t(); a repeat of the newest refreshes it; 40 kept, newest first; the line fades out over 14 s', () => {
    pushFeed({ key: 'feed.gardener', params: {}, ...at });
    expect($('feed').classList.contains('on')).toBe(true);
    expect($('feed').querySelectorAll('.ev')).toHaveLength(1);
    expect($('feed').textContent).toBe(en['feed.gardener']);
    pushFeed({ key: 'feed.gardener', params: {}, ...at, abs: 0.5 });
    expect(feedEntries()).toHaveLength(1);
    expect(feedEntries()[0]?.abs).toBe(0.5);
    for (let k = 0; k < FEED_CAP + 5; k++) pushFeed({ key: 'feed.regular_return', params: { name: 'N' + k }, ...at });
    expect(feedEntries()).toHaveLength(FEED_CAP);
    expect(feedEntries()[0]?.params.name).toBe('N' + (FEED_CAP + 4));
    expect($('feed').textContent).toBe('N' + (FEED_CAP + 4) + ' is back');
    ageFeed(4);
    expect(($('feed').firstElementChild as HTMLElement).style.opacity).toBe('1');
    ageFeed(FEED_FADE_S - 4 - 0.1);
    expect($('feed').classList.contains('on')).toBe(true);
    ageFeed(0.2);
    expect($('feed').classList.contains('on')).toBe(false);
  });
  it('the lines S4 announces: the gardener gravelling and a gathering of pigeons (a feed key on the event), a regular coming in', () => {
    emit({ kind: 'step', tick: 600, x: 9, y: 9, params: { surface: 'gravel', feed: 'feed.gardener' } });
    emit({ kind: 'step', tick: 601, x: 9, y: 9, params: { surface: 'gravel' } }); // a plain step is no line
    emit({ kind: 'peck', tick: 602, x: 19, y: 30, ids: [3], params: { feed: 'feed.pigeons' } });
    emit({ kind: 'arrive', tick: 603, x: 23, y: -1, ids: [5], params: { regularId: 1 } });
    emit({ kind: 'arrive', tick: 604, x: 23, y: -1, ids: [6], params: { regularId: 0 } }); // a passer-by is no line
    drain(0);
    expect(feedEntries().map((e) => e.key)).toEqual(['feed.regular_return', 'feed.pigeons', 'feed.gardener']);
    expect(feedEntries()[0]).toMatchObject({ params: { name: 'Amélie' }, x: 23, y: -1, ids: [5] });
    expect(feedEntries()[2]?.abs).toBeCloseTo(0.3 + 600 / 21600, 9);
    expect($('feed').textContent).toBe('Amélie is back');
    setLang('es');
    expect($('feed').textContent).toBe('Amélie ha vuelto'); // rendered at display time (06 16.11)
    setLang('en');
  });
});
