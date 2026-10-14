// @vitest-environment jsdom
// tests/ui/overlays.test.ts
// Locks 03 10.3 (layoutOverlays, PORT of GV 10689-10699), 02 12.5 item 3 (the toast's 3.4 s) and the New confirm of 03 10.1 and 02 12.5
// item 4 (#confirm with aria-modal, focus on Yes, Escape and No close it). 08 2.9 overlays.test.ts row. Runs under jsdom on index.html.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { $, SHEET_IDS, ageToast, closeConfirm, confirmOpen, layoutOverlays, openConfirm, toast, toastOn } from '../../src/ui/dom.ts';
import { setLang } from '../../src/ui/i18n.ts';
import { en } from '../../src/ui/strings/en.ts';

const ROOT = join(import.meta.dirname, '..', '..');

beforeAll(() => {
  const doc = new DOMParser().parseFromString(readFileSync(join(ROOT, 'index.html'), 'utf8'), 'text/html');
  document.body.innerHTML = doc.body.innerHTML; // the module script does not run from innerHTML
  setLang('en');
});

function rect(height: number): DOMRect {
  return { x: 0, y: 0, width: 390, height, top: 0, left: 0, right: 390, bottom: height, toJSON: () => ({}) } as DOMRect;
}

describe('03 10.3: layoutOverlays stacks from the rail height (GV 10689; 08 2.9)', () => {
  it('with #rail 120 px high, #card and every sheet get bottom: 128px; #hint sits above an open card', () => {
    expect(Object.keys(en).length).toBeGreaterThan(0);
    vi.spyOn($('rail'), 'getBoundingClientRect').mockReturnValue(rect(120));
    vi.spyOn($('card'), 'getBoundingClientRect').mockReturnValue(rect(90));
    $('card').classList.remove('on');
    layoutOverlays();
    expect($('card').style.bottom).toBe('128px');
    for (const id of SHEET_IDS) expect($(id).style.bottom, id).toBe('128px');
    expect($('hint').style.bottom).toBe('132px'); // no card: 4 px above the rail's stack line
    $('card').classList.add('on');
    layoutOverlays();
    expect($('hint').style.bottom).toBe(128 + 90 + 10 + 'px'); // 10 px above the open card
    $('card').classList.remove('on');
  });
  it('body.sheet follows an open sheet', () => {
    $('census').classList.add('on');
    layoutOverlays();
    expect(document.body.classList.contains('sheet')).toBe(true);
    $('census').classList.remove('on');
    layoutOverlays();
    expect(document.body.classList.contains('sheet')).toBe(false);
  });
});

describe('02 12.5 item 3: the toast shows a key through t() for 3.4 s (GV toast 10685)', () => {
  it('toast writes the translated line, stacks the overlays, and goes after 3.4 s of real time', () => {
    toast('toast.undone');
    expect($('hint').textContent).toBe(en['toast.undone']);
    expect($('hint').classList.contains('on')).toBe(true);
    expect(toastOn()).toBe(true);
    ageToast(3.3);
    expect($('hint').classList.contains('on')).toBe(true);
    ageToast(0.11);
    expect($('hint').classList.contains('on')).toBe(false);
    expect(toastOn()).toBe(false);
  });
});

describe('03 10.1 #confirm, 02 12.5 item 4: the New confirm', () => {
  it('opens as a modal dialog with the question and focus on Yes; Yes answers once and closes', () => {
    const yes = vi.fn(), no = vi.fn();
    expect($('confirm').hidden).toBe(true);
    openConfirm('confirm.new_park', yes, no);
    expect(confirmOpen()).toBe(true);
    expect($('confirm').hidden).toBe(false);
    expect($('confirm').getAttribute('role')).toBe('dialog');
    expect($('confirm').getAttribute('aria-modal')).toBe('true');
    expect($('confirmText').textContent).toBe(en['confirm.new_park']);
    expect($('confirmYes').textContent).toBe(en['confirm.yes']);
    expect($('confirmNo').textContent).toBe(en['confirm.no']);
    expect(document.activeElement).toBe($('confirmYes'));
    $('confirmYes').click();
    expect(yes).toHaveBeenCalledTimes(1);
    expect(no).not.toHaveBeenCalled();
    expect($('confirm').hidden).toBe(true);
    expect(confirmOpen()).toBe(false);
  });
  it('No and Escape close it without the Yes action', () => {
    const yes = vi.fn(), no = vi.fn();
    openConfirm('confirm.new_park', yes, no);
    $('confirmNo').click();
    expect(no).toHaveBeenCalledTimes(1);
    expect($('confirm').hidden).toBe(true);
    openConfirm('confirm.new_park', yes, no);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(no).toHaveBeenCalledTimes(2);
    expect(yes).not.toHaveBeenCalled();
    expect($('confirm').hidden).toBe(true);
  });
  it('focus goes back to the control that opened it; closeConfirm runs neither answer', () => {
    const yes = vi.fn(), no = vi.fn();
    $('bNew').focus();
    openConfirm('confirm.new_park', yes, no);
    expect(document.activeElement).toBe($('confirmYes'));
    closeConfirm();
    expect(document.activeElement).toBe($('bNew'));
    expect(yes).not.toHaveBeenCalled();
    expect(no).not.toHaveBeenCalled();
  });
});
