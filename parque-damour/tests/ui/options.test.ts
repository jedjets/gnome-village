// @vitest-environment jsdom
// tests/ui/options.test.ts
// Locks the Options stage (register 3.9 row 3, 3.10 Sheets and section 4 "Park pace and Options", owner 2026-10-14 "1 Y 2 Y"; 02 12.4
// Options row; 03 10.1 #bOptions; 04 5.4 item 5, 5.6): row 3 ends with #bOptions, which has an accessible name and opens #options;
// Park pace Calm | Lively shows the park's pace pressed (or the one whose command waits: a tap while paused, Begin's profile pace in a
// park started paused), and a tap enqueues the logged `park.pace` command and writes settings.pace to the profile; the language, sound
// and speed rows mirror the one state each has (intro.ts chooseLang, #bMute, the dial); the seed; the dev rows only under body.dev; the
// sheet closes with its close button and Escape; Census and Options are exclusive (opening one closes the other). 08 2.9 lists its
// rows. jsdom, on index.html with shell.css.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { T } from '../../src/core/clock.ts';
import { SIM_DT, newPark, setSpeed, simulate } from '../../src/core/loop.ts';
import { applyNow, clearPending, log, pendingCount } from '../../src/core/commands.ts';
import { arrivalsState } from '../../src/entities/visitor.ts';
import { PROFILE_KEY, enqueueProfilePace, getProfile, loadProfile, profilePace, restore, setProfilePace, snapshot } from '../../src/save/store.ts';
import { $, applyDom, closeConfirm, confirmOpen, openConfirm } from '../../src/ui/dom.ts';
import { lang, setLang } from '../../src/ui/i18n.ts';
import { buildRail, syncSpeed } from '../../src/ui/rail.ts';
import { closeSheets, initSheets, openSheet, paceQueued, sheetOpen, shownPace, updateSheets } from '../../src/ui/sheets.ts';
import { en } from '../../src/ui/strings/en.ts';
import { es } from '../../src/ui/strings/es.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const perf = { on: false, calls: [] as boolean[] };

beforeAll(() => {
  const doc = new DOMParser().parseFromString(readFileSync(join(ROOT, 'index.html'), 'utf8'), 'text/html');
  document.body.innerHTML = doc.body.innerHTML; // the module script does not run from innerHTML
  const style = document.createElement('style');
  style.textContent = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
  document.head.appendChild(style);
  setLang('en');
  applyDom();
  initSheets({
    perfOn: () => perf.on,
    setPerf: (on) => {
      perf.on = on;
      perf.calls.push(on);
    },
  });
  buildRail({ onNew: () => undefined });
});

beforeEach(() => {
  localStorage.clear();
  loadProfile(); // a new player: no pace stored
  setLang('en');
  closeConfirm();
  closeSheets();
  newPark(101); // a new park is calm until a park.pace applies (entities/visitor.ts)
  clearPending();
  setSpeed(1);
  syncSpeed();
  document.body.classList.remove('dev');
  if ($('bMute').getAttribute('aria-pressed') === 'true') $('bMute').click();
});

const pressed = (k: string): boolean => document.querySelector(`#optionsList [data-k="${k}"]`)?.getAttribute('aria-pressed') === 'true';
const tap = (k: string): void => (document.querySelector(`#optionsList [data-k="${k}"]`) as HTMLElement).click();
const stored = (): Record<string, unknown> => JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}').settings ?? {};
const shown = (el: Element): boolean => getComputedStyle(el).display !== 'none';
const val = (): string | null | undefined => document.querySelector('#optionsList .val')?.textContent;

describe('register 3.9 row 3, 03 10.1, 04 5.4 item 5: #bOptions ends row 3 and opens the Options sheet', () => {
  it('is the last button of row 3, after New, with its label and an accessible name through t()', () => {
    const row3 = [...document.querySelectorAll<HTMLButtonElement>('#row3 button')];
    expect(row3.at(-1)?.id).toBe('bOptions');
    expect(row3.at(-2)?.id).toBe('bNew');
    const b = $('bOptions') as HTMLButtonElement;
    expect(b.type).toBe('button');
    expect(b.textContent).toBe(en['rail.options']);
    expect(b.getAttribute('aria-label')).toBe(en['aria.options']);
    expect(b.getAttribute('aria-controls')).toBe('options');
    expect(b.getAttribute('aria-expanded')).toBe('false'); // collapsed before the first tap
  });
  it('a tap opens #options (body.sheet, aria-expanded), a second tap closes it', () => {
    $('bOptions').click();
    expect(sheetOpen()).toBe('options');
    expect($('options').classList.contains('on')).toBe(true);
    expect(document.body.classList.contains('sheet')).toBe(true);
    expect($('bOptions').getAttribute('aria-expanded')).toBe('true');
    expect($('options').getAttribute('role')).toBe('dialog');
    expect($('options').getAttribute('aria-label')).toBe(en['aria.sheet_options']);
    $('bOptions').click();
    expect(sheetOpen()).toBeNull();
    expect($('bOptions').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('register section 4 "Park pace and Options", 02 4.2 item 2, 12.4: Park pace Calm | Lively', () => {
  it('shows the park\'s pace pressed with its one-line hint; a new park is calm until its profile pace applies', () => {
    openSheet('options');
    expect(arrivalsState().pace).toBe('calm');
    expect(pressed('pace:calm')).toBe(true);
    expect(pressed('pace:lively')).toBe(false);
    const row = document.querySelector('#optionsList [data-k="pace:calm"]')?.closest('.opt');
    expect(row?.querySelector('b')?.textContent).toBe(en['sheet.options.pace']);
    expect(row?.querySelector('small')?.textContent).toBe(en['sheet.options.pace.calm_hint']);
    expect(row?.querySelector('.grp')?.getAttribute('role')).toBe('group');
  });
  it('tapping Lively enqueues park.pace lively and writes settings.pace to the profile; the next step applies and logs it', () => {
    openSheet('options');
    expect(getProfile().settings.pace).toBeUndefined();
    tap('pace:lively');
    expect(pendingCount()).toBe(1);
    expect(stored().pace).toBe('lively');
    expect(getProfile().settings.pace).toBe('lively');
    expect(pressed('pace:lively')).toBe(true); // the tapped pace shows while its command waits (paused, 03 4.6)
    expect(arrivalsState().pace).toBe('calm'); // the UI wrote no sim state (hard rule 2)
    simulate(SIM_DT, 0);
    expect(arrivalsState().pace).toBe('lively');
    const c = log().filter((x) => x.kind === 'park.pace');
    expect(c.map((x) => [x.tick, x.side, x.payload])).toEqual([[1, 'park', { pace: 'lively' }]]);
    updateSheets(0);
    expect(pressed('pace:lively')).toBe(true);
    expect(document.querySelector('#optionsList [data-k="pace:lively"]')?.closest('.opt')?.querySelector('small')?.textContent).toBe(
      en['sheet.options.pace.lively_hint'],
    );
  });
  it('the pressed state follows the park: an applied park.pace, a restore and a new park move it', () => {
    openSheet('options');
    applyNow({ side: 'park', kind: 'park.pace', payload: { pace: 'lively' } });
    updateSheets(0);
    expect(pressed('pace:lively')).toBe(true);
    const save = snapshot();
    applyNow({ side: 'park', kind: 'park.pace', payload: { pace: 'calm' } });
    updateSheets(0);
    expect(pressed('pace:calm')).toBe(true);
    restore(save);
    updateSheets(0);
    expect(pressed('pace:lively')).toBe(true);
    newPark(102);
    updateSheets(0);
    expect(pressed('pace:calm')).toBe(true);
    expect(shownPace()).toBe('calm');
  });
  it('Begin\'s profile pace (main.ts beginPace) shows pressed in a park started paused, before its first step applies it', () => {
    // a new player: the profile says Lively; Begin's newPark is calm until the queued park.pace applies at tick 1
    enqueueProfilePace();
    paceQueued(profilePace());
    openSheet('options');
    expect(arrivalsState().pace).toBe('calm');
    expect(pressed('pace:lively')).toBe(true);
    tap('pace:lively'); // already shown: no second command
    expect(pendingCount()).toBe(1);
    simulate(SIM_DT, 0);
    expect(arrivalsState().pace).toBe('lively');
    updateSheets(0);
    expect(pressed('pace:lively')).toBe(true);
    // a player who chose Calm: Begin queues calm, the park is calm already, Calm stays pressed and the step changes nothing
    newPark(103);
    clearPending();
    setProfilePace('calm');
    enqueueProfilePace();
    paceQueued(profilePace());
    updateSheets(0);
    expect(pressed('pace:calm')).toBe(true);
    simulate(SIM_DT, 0);
    expect(arrivalsState().pace).toBe('calm');
  });
  it('tapping the pace already shown sends no command but still remembers it for new parks', () => {
    openSheet('options');
    tap('pace:calm');
    expect(pendingCount()).toBe(0);
    expect(stored().pace).toBe('calm');
  });
  it('a pace tapped and tapped back while paused leaves the park as it was; a New drops the wait', () => {
    openSheet('options');
    tap('pace:lively');
    tap('pace:calm'); // the park is calm: the lively command still waits, a calm one follows it
    expect(pressed('pace:calm')).toBe(true);
    simulate(SIM_DT, 0);
    expect(arrivalsState().pace).toBe('calm');
    tap('pace:lively');
    clearPending(); // what a New or a restore does to the queue
    updateSheets(0);
    expect(pressed('pace:calm')).toBe(true); // nothing waits any more: the park's own pace
    expect(stored().pace).toBe('lively'); // the preference stays
  });
});

describe('02 12.4, 04 5.6: Language, Sound and Speed mirror the one state each has; the seed', () => {
  it('ES switches the tables, <html lang> and the profile (intro.ts chooseLang); the sheet repaints in Spanish', () => {
    openSheet('options');
    expect(pressed('lang:en')).toBe(true);
    tap('lang:es');
    expect(lang()).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(stored().lang).toBe('es');
    expect(pressed('lang:es')).toBe(true);
    const names = [...document.querySelectorAll('#optionsList .opt > b')].map((b) => b.textContent);
    expect(names.slice(0, 4)).toEqual([es['sheet.options.pace'], es['sheet.options.language'], es['sheet.options.sound'], es['sheet.options.speed']]);
    expect(document.querySelector('#optionsList [data-k="pace:lively"]')?.textContent).toBe(es['sheet.options.pace.lively']);
    tap('lang:en');
    expect(lang()).toBe('en');
    expect(stored().lang).toBe('en');
  });
  it('Sound on | off is #bMute: Off presses it, and a press of #bMute shows in the sheet', () => {
    openSheet('options');
    expect(pressed('sound:on')).toBe(true);
    tap('sound:off');
    expect($('bMute').getAttribute('aria-pressed')).toBe('true');
    expect(pressed('sound:off')).toBe(true);
    tap('sound:off'); // already off: no second toggle
    expect($('bMute').getAttribute('aria-pressed')).toBe('true');
    $('bMute').click();
    updateSheets(0);
    expect(pressed('sound:on')).toBe(true);
  });
  it('Speed reads the dial (row 3 is the one control) and points to it; the summary names the park seed', () => {
    setSpeed(3);
    openSheet('options');
    expect(val()).toBe('3×');
    setSpeed(0);
    updateSheets(0);
    expect(val()).toBe(en['rail.pause']);
    expect(document.querySelector('#optionsList .val')?.closest('.opt')?.querySelector('small')?.textContent).toBe(en['sheet.options.speed_hint']);
    expect(T.speed).toBe(0); // reading it changed nothing
    expect($('optionsSum').textContent).toBe('Park seed 101');
  });
  it('the Sound check and perf rows show only under body.dev; perf goes through main.ts\'s hooks, the Sound check opens its sheet (S8)', () => {
    openSheet('options');
    const dev = [...document.querySelectorAll('#optionsList .dev')];
    expect(dev).toHaveLength(2);
    for (const r of dev) expect(shown(r)).toBe(false);
    document.body.classList.add('dev');
    for (const r of dev) expect(shown(r)).toBe(true);
    expect(pressed('perf:off')).toBe(true);
    tap('perf:on');
    expect(perf.calls.at(-1)).toBe(true);
    expect(pressed('perf:on')).toBe(true);
    tap('perf:off');
    expect(perf.on).toBe(false);
    tap('soundcheck');
    expect(sheetOpen()).toBe('snd'); // S8: the placeholder toast of the Options stage became the dev Sound check sheet (soundcheck.ts)
  });
});

describe('closing and exclusivity (02 12.4; GV 10748 pattern)', () => {
  it('the close button closes the sheet', () => {
    openSheet('options');
    ($('options').querySelector('.x') as HTMLButtonElement).click();
    expect(sheetOpen()).toBeNull();
    expect(document.body.classList.contains('sheet')).toBe(false);
  });
  it('Escape closes it and gives the focus back to Options', () => {
    $('bOptions').focus();
    $('bOptions').click();
    expect(sheetOpen()).toBe('options');
    (document.querySelector('#optionsList [data-k="pace:lively"]') as HTMLElement).focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(sheetOpen()).toBeNull();
    expect(document.activeElement).toBe($('bOptions'));
  });
  it('Escape with the New confirm open over the sheet answers only the confirm', () => {
    openSheet('options');
    const no = vi.fn();
    openConfirm('confirm.new_park', () => undefined, no);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(confirmOpen()).toBe(false);
    expect(no).toHaveBeenCalledTimes(1);
    expect(sheetOpen()).toBe('options');
  });
  it('Census and Options are exclusive: opening one closes the other', () => {
    openSheet('census');
    $('bOptions').click();
    expect(sheetOpen()).toBe('options');
    expect($('census').classList.contains('on')).toBe(false);
    openSheet('census');
    expect($('options').classList.contains('on')).toBe(false);
    expect([...document.querySelectorAll('div.sheet.on')].map((s) => s.id)).toEqual(['census']);
  });
  it('a repaint keeps the focus on the control that had it', () => {
    openSheet('options');
    const b = document.querySelector('#optionsList [data-k="sound:off"]') as HTMLElement;
    b.focus();
    b.click();
    expect((document.activeElement as HTMLElement).dataset.k).toBe('sound:off');
  });
});
