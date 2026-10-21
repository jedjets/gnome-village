// @vitest-environment jsdom
// tests/ui/soundcheck.test.ts
// Locks 05 2.6 and 07 S8.6 steps 11 and 13 (08 2.8): the Sound check sheet #snd is reached from the Options sheet's dev row, holds one button
// per cue id of 05 3.2 in table order, the two recipes each of kiss and splat, the ambience bursts, the six bird voices and the five music
// buttons; every press unlocks the context and plays at the view's tile (the dry run and the harness log of 05 8.3 record it), toasts
// "Sound is muted" when muted, and the music buttons call the hooks main.ts hands in (a toast when there are none). jsdom, on index.html.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newPark } from '../../src/core/loop.ts';
import { clearListeners } from '../../src/core/events.ts';
import { seedVisual } from '../../src/core/rng.ts';
import { CTR, cam, centreOn, setViewport } from '../../src/render/camera.ts';
import { auditLog, clearLog, dryCalls, setDryRun, setMuted } from '../../src/audio/engine.ts';
import { resetGaps, setNow } from '../../src/audio/limiter.ts';
import { CUE_IDS } from '../../src/audio/cues.ts';
import { resetAmbience } from '../../src/audio/ambience.ts';
import { $, applyDom } from '../../src/ui/dom.ts';
import { setLang } from '../../src/ui/i18n.ts';
import { buildRail } from '../../src/ui/rail.ts';
import { closeSheets, initSheets, openSheet, sheetOpen } from '../../src/ui/sheets.ts';
import { en } from '../../src/ui/strings/en.ts';
import { es } from '../../src/ui/strings/es.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const music: Array<string> = [];
let hooked = true;

beforeAll(() => {
  const doc = new DOMParser().parseFromString(readFileSync(join(ROOT, 'index.html'), 'utf8'), 'text/html');
  document.body.innerHTML = doc.body.innerHTML;
  const style = document.createElement('style');
  style.textContent = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
  document.head.appendChild(style);
  setLang('en');
  applyDom();
  initSheets({
    music: () => (hooked ? { play: (m, v) => music.push(m + ' ' + v), stop: () => music.push('stop') } : undefined),
  });
  buildRail({ onNew: () => undefined });
});

beforeEach(() => {
  clearListeners();
  newPark(101);
  seedVisual(7);
  setViewport(390, 844, 1);
  cam.z = 1.3;
  centreOn(CTR, CTR);
  setLang('en');
  setMuted(false);
  setDryRun(true);
  resetGaps();
  resetAmbience();
  clearLog();
  dryCalls(true);
  music.length = 0;
  hooked = true;
  setNow(1000);
  document.body.classList.add('dev');
  closeSheets();
});
afterEach(() => {
  setDryRun(false);
  setMuted(false);
  document.body.classList.remove('dev');
});

const btn = (k: string): HTMLElement => document.querySelector(`#sndRow [data-k="${k}"]`) as HTMLElement;
const labels = (): string[] => [...document.querySelectorAll('#sndRow button')].map((b) => b.textContent ?? '');
const open = (): void => {
  $('bOptions').click();
  (document.querySelector('#optionsList [data-k="soundcheck"]') as HTMLElement).click();
};

describe('the Sound check sheet (05 2.6)', () => {
  it('is reached from the Options sheet under the dev flag and replaces it', () => {
    open();
    expect(sheetOpen()).toBe('snd');
    expect($('snd').getAttribute('role')).toBe('dialog');
    expect($('snd').querySelector('h4')?.textContent).toBe(en['sheet.sound.title']);
    ($('snd').querySelector('.x') as HTMLElement).click();
    expect(sheetOpen()).toBeNull();
  });

  it('has one button per cue id in table order, then the two recipes of kiss and splat, the six bursts, the six birds and the five music buttons', () => {
    open();
    const l = labels();
    expect(l.slice(0, 38)).toEqual(CUE_IDS);
    expect(l.slice(38)).toEqual([
      'kiss A', 'kiss B', 'splat A', 'splat B',
      'fountain ×6', 'rain ×10', 'crickets', 'owl', 'bells', 'boulevard',
      'robin', 'warbler', 'thrush', 'chiffchaff', 'blackbird', 'wren',
      'B rising', 'B parted', 'C rising', 'C parted', en['sheet.sound.stop_music'],
    ]);
    expect(l).toHaveLength(59);
    const heads = [...document.querySelectorAll('#sndRow .snd-h')].map((h) => h.textContent);
    expect(heads).toEqual([en['sheet.sound.cues'], en['sheet.sound.alts'], en['sheet.sound.ambience'], en['sheet.sound.birds'], en['sheet.sound.music']]);
  });

  it('the headings follow the language; the ids stay code identifiers', () => {
    setLang('es');
    open();
    expect(document.querySelector('#sndRow .snd-h')?.textContent).toBe(es['sheet.sound.cues']);
    expect(labels()[0]).toBe('step_gravel');
    setLang('en');
  });

  it('a press of every cue button plays that cue, logged (05 2.6 item 4)', () => {
    open();
    for (const id of CUE_IDS) {
      setNow(1000 + 1);
      btn('cue:' + id).click();
    }
    const played = new Set(auditLog().filter((r) => r.played).map((r) => r.id));
    for (const id of CUE_IDS) expect(played.has(id), id).toBe(true);
    expect(dryCalls().tone + dryCalls().grain).toBeGreaterThan(80);
  });

  it('the recipe buttons, the bursts and the birds sound too', () => {
    open();
    for (const k of ['alt:kiss:A', 'alt:kiss:B', 'alt:splat:A', 'alt:splat:B']) btn(k).click();
    expect(auditLog().map((r) => r.id)).toEqual(['kiss A', 'kiss B', 'splat A', 'splat B']);
    clearLog();
    dryCalls(true);
    for (const b of ['fountain', 'rain', 'crickets', 'owl', 'bells', 'boulevard']) {
      btn('amb:' + b).click();
      expect(dryCalls().tone, b).toBeGreaterThan(0);
      dryCalls(true);
    }
    for (let i = 0; i < 6; i++) {
      btn('bird:' + i).click();
      expect(dryCalls().tone, 'bird ' + i).toBeGreaterThan(2);
      dryCalls(true);
    }
  });

  it('muted: a press toasts "Sound is muted" and plays nothing', () => {
    setMuted(true);
    open();
    btn('cue:laugh').click();
    expect($('hint').textContent).toBe(en['sheet.sound.muted']);
    expect(dryCalls()).toEqual({ tone: 0, grain: 0 });
    expect(auditLog().filter((r) => r.played)).toHaveLength(0);
  });

  it('the five music buttons call the hooks; without hooks they toast that they need the dev build', () => {
    open();
    for (const k of ['mus:B:rising', 'mus:B:parted', 'mus:C:rising', 'mus:C:parted', 'mus:stop']) btn(k).click();
    expect(music).toEqual(['B rising', 'B parted', 'C rising', 'C parted', 'stop']);
    hooked = false;
    btn('mus:B:rising').click();
    expect($('hint').textContent).toBe(en['toast.sound_music_dev']);
    expect(music).toHaveLength(5);
  });

  it('opens again from Options after closing (the sheets are exclusive)', () => {
    openSheet('options');
    (document.querySelector('#optionsList [data-k="soundcheck"]') as HTMLElement).click();
    expect(sheetOpen()).toBe('snd');
    expect($('options').classList.contains('on')).toBe(false);
  });
});
