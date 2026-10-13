// @vitest-environment jsdom
// tests/ui/intro.test.ts
// Locks 04 5.7 and register 3.11, 3.12 (Continue only with a saved park; the language persists in the profile and sets <html lang>) and
// 02 12.5 item 4 with 07 S3.6 item 11 (Begin with a park present asks the New confirm first). 08 2.9 intro.test.ts row. jsdom.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { showIntro } from '../../src/ui/intro.ts';
import { $ } from '../../src/ui/dom.ts';
import { lang, setLang } from '../../src/ui/i18n.ts';
import { PROFILE_KEY, getProfile, loadProfile } from '../../src/save/store.ts';
import { en } from '../../src/ui/strings/en.ts';
import { es } from '../../src/ui/strings/es.ts';

const ROOT = join(import.meta.dirname, '..', '..');

beforeAll(() => {
  const doc = new DOMParser().parseFromString(readFileSync(join(ROOT, 'index.html'), 'utf8'), 'text/html');
  document.body.innerHTML = doc.body.innerHTML; // the module script does not run from innerHTML
});

beforeEach(() => {
  localStorage.clear();
  loadProfile(); // the defaults: English
  setLang('en');
  $('confirm').hidden = true;
});

describe('04 5.7, 03 11: Continue only with a save (08 2.9)', () => {
  it('showIntro(false) hides #bContinue; showIntro(true) shows it', () => {
    expect(Object.keys(en).length).toBeGreaterThan(0);
    showIntro(false, () => {}, () => {});
    expect($('bContinue').hidden).toBe(true);
    expect($('begin').hidden).toBe(false);
    showIntro(true, () => {}, () => {});
    expect($('bContinue').hidden).toBe(false);
    expect($('bContinue').textContent).toBe(en['intro.continue']);
    expect($('iP').children).toHaveLength(4);
  });
  it('Continue calls onContinue; Begin without a save calls onBegin at once', () => {
    const begin = vi.fn(), cont = vi.fn();
    showIntro(true, begin, cont);
    $('bContinue').click();
    expect(cont).toHaveBeenCalledTimes(1);
    expect(begin).not.toHaveBeenCalled();
    showIntro(false, begin, cont);
    $('begin').click();
    expect(begin).toHaveBeenCalledTimes(1);
    expect($('confirm').hidden).toBe(true);
  });
  it('Begin with a save asks "Start a new park?" first: No keeps the intro, Yes begins (02 12.5 item 4)', () => {
    const begin = vi.fn();
    showIntro(true, begin, () => {});
    $('begin').click();
    expect(begin).not.toHaveBeenCalled();
    expect($('confirm').hidden).toBe(false);
    expect($('confirmText').textContent).toBe(en['confirm.new_park']);
    $('confirmNo').click();
    expect(begin).not.toHaveBeenCalled();
    expect($('intro').classList.contains('gone')).toBe(false);
    $('begin').click();
    $('confirmYes').click();
    expect(begin).toHaveBeenCalledTimes(1);
    expect($('intro').classList.contains('gone')).toBe(true);
  });
});

describe('register 3.12: the language persists (08 2.9)', () => {
  it('tapping ES sets <html lang="es"> and profile().settings.lang === "es", written to parque:profile-v1', () => {
    showIntro(false, () => {}, () => {});
    const esButton = document.querySelector<HTMLButtonElement>('#lang button[data-l="es"]') as HTMLButtonElement;
    esButton.click();
    expect(document.documentElement.lang).toBe('es');
    expect(lang()).toBe('es');
    expect(getProfile().settings.lang).toBe('es');
    expect(JSON.parse(localStorage.getItem(PROFILE_KEY) as string).settings.lang).toBe('es');
    expect(esButton.getAttribute('aria-pressed')).toBe('true');
    expect($('begin').textContent).toBe(es['intro.begin']);
    expect($('iP').children[0]?.textContent).toBe(es['intro.p1']);
    document.querySelector<HTMLButtonElement>('#lang button[data-l="en"]')?.click();
    expect(document.documentElement.lang).toBe('en');
    expect(getProfile().settings.lang).toBe('en');
  });
});
