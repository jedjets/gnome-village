// @vitest-environment jsdom
// tests/ui/strip.test.ts
// Locks the avatar strip's three bars (owner 2026-10-22, "continue" to the S7 follow-ups; 04 5.5 item 3; 02 12.3 item 4): the pigeon and
// Pompon show Mood, Rested and Full; the flower seller shows Mood and Rested from her needs and her basket's blooms (of 3) in place of Full.
// A creature has no needs in the sim (02 10.3 item 6), so creatureBars reads: Mood 1, 0.25 while startled, 0.5 while shaking off water;
// Rested the cooldown of its own action run backwards (the pigeon's 25 s `ruffled`, Pompon's 60 s `panting`); Full 1 (it never hungers).
// jsdom, index.html with shell.css; the bars' look is checked in `npm run shot -- s7`.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIM_DT, newPark, simulate } from '../../src/core/loop.ts';
import { AVATAR_SIDE, applyNow, clearPending } from '../../src/core/commands.ts';
import { drain } from '../../src/core/events.ts';
import { getPlayer, setMode, type AvatarId } from '../../src/play/mode.ts';
import { startCooldown } from '../../src/play/abilities.ts';
import { resetProgress, setProgress } from '../../src/play/progression.ts';
import { creatureById } from '../../src/entities/creatures.ts';
import { BASKET } from '../../src/entities/act-romance.ts';
import { byId, resetVisitors, setArrivalsState, spawnVisitor, type Visitor } from '../../src/entities/visitor.ts';
import { cam } from '../../src/render/camera.ts';
import { $, applyDom } from '../../src/ui/dom.ts';
import { setLang } from '../../src/ui/i18n.ts';
import { LOW_MOOD, clearSel, creatureBars, initCard, select } from '../../src/ui/card.ts';
import { closeSheets, initSheets } from '../../src/ui/sheets.ts';
import { applyMode, initHud, updateHud } from '../../src/ui/hud.ts';
import { buildRail } from '../../src/ui/rail.ts';
import { en } from '../../src/ui/strings/en.ts';
import { es } from '../../src/ui/strings/es.ts';

const ROOT = join(import.meta.dirname, '..', '..');

beforeAll(() => {
  const doc = new DOMParser().parseFromString(readFileSync(join(ROOT, 'index.html'), 'utf8'), 'text/html');
  document.body.innerHTML = doc.body.innerHTML;
  const style = document.createElement('style');
  style.textContent = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
  document.head.appendChild(style);
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
  setLang('en');
  initSheets();
  initHud();
  buildRail({ onNew: () => undefined });
  initCard();
});

beforeEach(() => {
  newPark(101);
  setArrivalsState({ arrivalT: 1e9, pace: 'calm' });
  resetProgress();
  resetVisitors();
  clearPending();
  setLang('en');
  setMode('creator');
  closeSheets();
  clearSel();
  applyMode();
  cam.z = 1.0;
});

/** Be someone, at once (a paused frame would do the same): the mode event reaches the shell and the strip is painted. */
function enter(a: AvatarId): void {
  expect(applyNow({ side: AVATAR_SIDE[a], kind: 'avatar.enter', payload: { avatar: a } }).ok).toBe(true);
  drain(0);
  updateHud(0.4);
}
const run = (s: number): void => {
  for (let i = 0; i < s * 60; i++) simulate(SIM_DT, 0);
};
const bar = (need: string): HTMLElement => document.querySelector(`#cBars .bar[data-need="${need}"]`) as HTMLElement;
const width = (need: string): string => (bar(need).querySelector('u') as HTMLElement).style.width;
const label = (need: string): string => bar(need).querySelector('span')?.textContent ?? '';
const shown = (el: HTMLElement): boolean => getComputedStyle(el).display !== 'none';
const barsOn = (): string[] => [...document.querySelectorAll<HTMLElement>('#cBars .bar')].filter((b) => shown(b)).map((b) => b.dataset.need as string);

describe('the avatar strip shows three bars (04 5.5 item 3)', () => {
  it('the pigeon: Mood, Rested and Full, all at 100 % when nothing runs; the Heart bar and the others stay out of the strip', () => {
    enter('a_pigeon');
    expect(shown($('card')) && $('card').classList.contains('on')).toBe(true);
    expect(shown($('cBars'))).toBe(true);
    expect(barsOn()).toEqual(['mood', 'rest', 'full']);
    expect([label('mood'), label('rest'), label('full')]).toEqual(['Mood', 'Rested', 'Full']);
    expect([width('mood'), width('rest'), width('full')]).toEqual(['100%', '100%', '100%']);
    for (const n of ['mood', 'rest', 'full']) expect(bar(n).classList.contains('low'), n).toBe(false);
    expect($('cRel').hidden).toBe(true);
    expect($('cPin').hidden).toBe(true);
  });
  it('the pigeon: Rested is the swoop\'s 25 s wait run backwards (empty and --ember at once, half at 12.5 s, full at 25 s); startled dips Mood to 25 %', () => {
    enter('a_pigeon');
    const c = creatureById(getPlayer());
    expect(c).toBeDefined();
    startCooldown('mischief', 'm_pigeon');
    updateHud(0.4);
    expect(width('rest')).toBe('0%');
    expect(bar('rest').classList.contains('low')).toBe(true);
    run(12.5);
    updateHud(0.4);
    expect(width('rest')).toBe('50%');
    expect(bar('rest').classList.contains('low')).toBe(false);
    run(12.5);
    updateHud(0.4);
    expect(width('rest')).toBe('100%');
    if (c) c.st = 'startled';
    updateHud(0.4);
    expect(width('mood')).toBe('25%');
    expect(bar('mood').classList.contains('low')).toBe(true); // 0.25 is under the 0.3 mark
    expect(LOW_MOOD).toBe(0.3);
    expect(width('full')).toBe('100%'); // it never hungers
  });
  it('Pompon: the same three, Rested the 60 s of panting, Mood 50 % while he shakes off the water; creatureBars is a plain function of the state', () => {
    setProgress({ cp: 0, mp: 8 });
    enter('a_pomeranian');
    expect([label('mood'), label('rest'), label('full')]).toEqual(['Mood', 'Rested', 'Full']);
    const c = creatureById(getPlayer());
    if (!c) throw new Error('no Pompon');
    expect(creatureBars(c, 'a_pomeranian')).toEqual({ mood: 1, rest: 1, full: 1 });
    startCooldown('mischief', 'm_pomeranian');
    run(15);
    c.st = 'shakeOff';
    updateHud(0.4);
    expect([width('mood'), width('rest'), width('full')]).toEqual(['50%', '25%', '100%']);
    expect(bar('rest').classList.contains('low')).toBe(false); // 0.25 is not under the 0.25 mark
    run(30);
    expect(creatureBars(c, 'a_pomeranian').rest).toBeCloseTo(0.75, 5);
    run(15);
    expect(creatureBars(c, 'a_pomeranian').rest).toBe(1);
  });
  it('the flower seller: Mood and Rested are her needs, the third bar is her basket of 3 blooms, labelled Blooms; an empty basket is --ember', () => {
    setProgress({ cp: 8, mp: 0 });
    enter('a_florist');
    const f = byId(getPlayer()) as Visitor;
    expect(f.basket).toBe(BASKET);
    f.comfort = 0.62;
    f.energy = 0.81;
    updateHud(0.4);
    expect(barsOn()).toEqual(['mood', 'rest', 'full']);
    expect([label('mood'), label('rest'), label('full')]).toEqual(['Mood', 'Rested', 'Blooms']);
    expect([width('mood'), width('rest'), width('full')]).toEqual(['62%', '81%', '100%']);
    expect(bar('full').getAttribute('aria-label')).toBe('Basket: 3 of 3 blooms');
    f.basket = 1;
    updateHud(0.4);
    expect(width('full')).toBe('33%');
    expect(bar('full').classList.contains('low')).toBe(false);
    expect(bar('full').getAttribute('aria-label')).toBe('Basket: 1 of 3 blooms');
    f.basket = 0;
    updateHud(0.4);
    expect(width('full')).toBe('0%');
    expect(bar('full').classList.contains('low')).toBe(true);
    setLang('es');
    applyDom(); // what a language tap does (intro.ts chooseLang): the span's key is the Blooms one
    updateHud(0.4);
    expect([label('mood'), label('rest'), label('full')]).toEqual([es['card.bar.mood'], es['card.bar.rested'], 'Flores']);
    expect(bar('full').getAttribute('aria-label')).toBe('Cesta: 0 de 3 flores');
  });
  it('after the strip the single card says Full again, and the Blooms label does not leak; the strip hides its bars in Creator', () => {
    setProgress({ cp: 8, mp: 0 });
    enter('a_florist');
    expect(label('full')).toBe('Blooms');
    applyNow({ side: 'cupid', kind: 'avatar.leave', payload: {} });
    drain(0);
    updateHud(0.4);
    expect($('card').classList.contains('on')).toBe(false);
    const v = spawnVisitor('single', 'g_north') as Visitor;
    Object.assign(v, { x: 20, y: 30, path: null, st: 'idle', comfort: 0.5, energy: 0.5, hunger: 0.5 });
    select({ kind: 'visitor', id: v.id, tile: { x: 20, y: 30 } });
    expect(label('full')).toBe('Full');
    expect(bar('full').getAttribute('data-need')).toBe('full');
    expect(width('full')).toBe('50%');
    expect(en['card.bar.full']).toBe('Full');
  });
  it('shell.css: in the strip the bars sit side by side on one line in the card\'s width, labels on one line, the Heart bar never shows', () => {
    const css = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
    expect(css).toMatch(/body\.avatar #card \.bars\{display:flex;flex-basis:100%;gap:10px/);
    expect(css).toMatch(/body\.avatar #card \.bar\{flex:1 1 0;min-width:0;grid-template-columns:auto 1fr/);
    expect(css).toMatch(/body\.avatar #card \.bar span\{white-space:nowrap\}/);
    enter('a_pigeon');
    expect(bar('heart').hidden).toBe(true);
  });
});
