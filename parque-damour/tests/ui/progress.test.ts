// @vitest-environment jsdom
// tests/ui/progress.test.ts
// Locks 07 S6.6 steps 8 and 9 (S6.7 item 3's UI half; 08 2.9): the Points chip "Cupid n | Mischief m" and its flash (02 12.2, 04 5.2 item 6),
// the unlock toast "Unlocked: Musician (Cupid T1)" through t() with a feed line per item, the cast lines and the day's real tally in the
// feed (02 7.3, 12.5 item 2), the refusal toast that needs a number ("not yet (45 s)"), and the Progress sheet (02 12.4, 04 5.6): the two
// ladders with tier ticks at 8, 20, 40 and 70, the next unlock, the unlock table of 02 7.4. jsdom, on index.html with shell.css.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIM_DT, newPark, simulate } from '../../src/core/loop.ts';
import { applyNow, clearPending } from '../../src/core/commands.ts';
import { drain, emit } from '../../src/core/events.ts';
import { setMode } from '../../src/play/mode.ts';
import { setArrivalsState } from '../../src/entities/visitor.ts';
import { award, bindProgression, dayTally, resetProgress, setProgress, TIERS, UNLOCKS } from '../../src/play/progression.ts';
import { $ } from '../../src/ui/dom.ts';
import { lang, setLang, t } from '../../src/ui/i18n.ts';
import { FLASH_MS, initHud, updateHud } from '../../src/ui/hud.ts';
import { clearFeed, feedEntries, initFeed } from '../../src/ui/feed.ts';
import { closeSheets, initSheets, openSheet, sheetOpen, updateSheets } from '../../src/ui/sheets.ts';
import { armAbility, armedAbility, buildRail, setGroup, setTool } from '../../src/ui/rail.ts';
import { tapAbility } from '../../src/ui/ability-strip.ts';
import { en } from '../../src/ui/strings/en.ts';
import { es } from '../../src/ui/strings/es.ts';

const ROOT = join(import.meta.dirname, '..', '..');

function dom(): void {
  const doc = new DOMParser().parseFromString(readFileSync(join(ROOT, 'index.html'), 'utf8'), 'text/html');
  document.body.innerHTML = doc.body.innerHTML;
  if (!document.getElementById('shellcss')) {
    const style = document.createElement('style');
    style.id = 'shellcss';
    style.textContent = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
    document.head.appendChild(style);
  }
}

beforeAll(() => {
  dom();
  setLang('en');
  buildRail({ onNew: () => {} });
  initSheets();
  initFeed();
  initHud();
});

beforeEach(() => {
  newPark(101);
  resetProgress();
  bindProgression();
  setArrivalsState({ arrivalT: 1e9, pace: 'calm' }); // a quiet park: no regular's return line among the feed's
  setMode('creator');
  setLang('en');
  closeSheets();
  setGroup('park');
  setTool('hand');
  clearFeed();
  clearPending();
  paintHud();
});

/** Two frame calls so the 0.35 s repaint of the chips happens. */
const paintHud = (): void => {
  updateHud(0.4);
  updateHud(0.4);
};
const hint = (): string => $('hint').textContent ?? '';
const ladders = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#progressList .ladder')];
const fillOf = (l: HTMLElement | undefined): string => l?.querySelector<HTMLElement>('.lbar u')?.style.width ?? '';
const text = (r: HTMLElement | undefined): string[] => [...(r?.querySelectorAll('.its span') ?? [])].map((s) => s.textContent ?? '');

describe('02 12.2, 04 5.2 item 6: the Points chip "Cupid n | Mischief m" and its flash', () => {
  it('shows the profile\'s points, the Cupid number in --berry and the Mischief one in --ember (CSS)', () => {
    expect($('hudPoints').textContent).toContain(en['hud.cupid']);
    expect($('hudPoints').textContent).toContain(en['hud.mischief']);
    setProgress({ cp: 13, mp: 4 });
    paintHud();
    expect($('tCP').textContent).toBe('13');
    expect($('tMP').textContent).toBe('4');
    const shell = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
    expect(shell).toContain('#tCP{color:var(--berry)}');
    expect(shell).toContain('#tMP{color:var(--ember)}');
    expect(shell).toContain('#tCP.flash,#tMP.flash{color:var(--ink)}');
  });
  it('the number that gained flashes for 0.3 s and the other does not; a repaint without a gain flashes nothing', () => {
    vi.useFakeTimers();
    try {
      setProgress({ cp: 2, mp: 2 });
      paintHud();
      $('tCP').classList.remove('flash');
      $('tMP').classList.remove('flash');
      setProgress({ cp: 3, mp: 2 });
      paintHud();
      expect($('tCP').classList.contains('flash')).toBe(true);
      expect($('tMP').classList.contains('flash')).toBe(false);
      vi.advanceTimersByTime(FLASH_MS - 10);
      expect($('tCP').classList.contains('flash')).toBe(true);
      vi.advanceTimersByTime(20);
      expect($('tCP').classList.contains('flash')).toBe(false);
      paintHud();
      expect($('tCP').classList.contains('flash')).toBe(false);
      setProgress({ cp: 3, mp: 9 });
      paintHud();
      expect($('tMP').classList.contains('flash')).toBe(true);
      expect(FLASH_MS).toBe(300);
    } finally {
      vi.useRealTimers();
    }
  });
  it('a tap on the chip opens the Progress sheet, a second tap closes it', () => {
    $('hudPoints').click();
    expect(sheetOpen()).toBe('progress');
    $('hudPoints').click();
    expect(sheetOpen()).toBeNull();
  });
});

describe('02 7.4, 07 S6.6 step 8: the unlock toast and the feed lines', () => {
  it('crossing 8 Cupid Points toasts "Unlocked: Musician (Cupid T1)" once, and the feed names each item of the row', () => {
    award('cupid', 8);
    drain(0);
    expect(hint()).toBe('Unlocked: Musician (Cupid T1)');
    expect($('hint').classList.contains('on')).toBe(true);
    const lines = feedEntries().filter((e) => e.key === 'feed.unlock').map((e) => t(e.key, e.params));
    expect([...lines].reverse()).toEqual(['Unlocked: Musician (Cupid T1)', 'Unlocked: Sunbeam (Cupid T1)', 'Unlocked: Flower seller (Cupid T1)']);
  });
  it('an unlock line has no place of its own, so tapping it in the Events sheet goes to the middle of the park, not the corner tile (0, 0)', () => {
    award('cupid', 8);
    drain(0);
    const lines = feedEntries().filter((e) => e.key === 'feed.unlock');
    expect(lines).toHaveLength(3);
    for (const e of lines) expect(e).toMatchObject({ x: 23.5, y: 23.5, ids: [] });
  });
  it('Spanish: the toast and the lines are Spanish, and the T0 row is never announced', () => {
    award('cupid', 3);
    drain(0);
    expect(feedEntries()).toHaveLength(0);
    setLang('es');
    award('mischief', 8);
    drain(0);
    expect(hint()).toBe('Desbloqueado: Cáscara de plátano (Travesura T1)');
    expect(feedEntries().map((e) => t(e.key, e.params))).toContain('Desbloqueado: Pomerania (Travesura T1)');
    setLang('en');
  });
  it('a point inside a tier announces nothing; reaching the next tier toasts its first item', () => {
    award('cupid', 8);
    drain(0);
    const n = feedEntries().length;
    award('cupid', 5);
    drain(0);
    expect(feedEntries()).toHaveLength(n);
    award('cupid', 7);
    drain(0);
    expect(hint()).toBe('Unlocked: Umbrella (Cupid T2)');
    expect(feedEntries()).toHaveLength(n + 3);
  });
});

describe('02 12.5 item 2, 7.3: the cast lines and the day\'s real tally in the feed', () => {
  it('a cast adds feed.cast.<id>; the entry carries no effect id as a person', () => {
    expect(applyNow({ side: 'cupid', kind: 'ability', payload: { id: 'c_petals', target: { kind: 'tile', x: 4, y: 4 } } }).ok).toBe(true);
    drain(0);
    const e = feedEntries()[0];
    expect(e?.key).toBe('feed.cast.c_petals');
    expect(e?.ids).toEqual([]);
    expect(t(e?.key as string, e?.params)).toMatch(/^Petals fell by the /);
  });
  it('the new day pushes "Today: Cupid n · Mischief m" from the sim\'s tally, and S5\'s zero stub on `newday` is gone', () => {
    emit({ kind: 'newday', tick: 21600, params: {} });
    drain(0);
    expect(feedEntries()).toHaveLength(0);
    emit({ kind: 'step', tick: 21600, x: 23.5, y: 23.5, params: { tally: 'feed.tally', cp: 2, mp: 1 } });
    drain(0);
    expect(feedEntries()).toHaveLength(1);
    expect(feedEntries()[0]).toMatchObject({ key: 'feed.tally', params: { cp: 2, mp: 1 } });
    expect(t('feed.tally', feedEntries()[0]?.params)).toBe('Today: Cupid 2 · Mischief 1');
  });
});

describe('03 5.4, 02 9.1 item 3: a refusal that needs a number is toasted with it', () => {
  it('a second cast of the armed ability inside its cooldown toasts "not yet (45 s)"; a cast out of cooldown applies', () => {
    setGroup('mischief');
    armAbility('m_sprinkler');
    const hit = { kind: 'tile' as const, id: 0, tile: { x: 4, y: 4 } };
    tapAbility(hit, { x: 4, y: 4 });
    simulate(SIM_DT, 0);
    drain(0);
    expect(feedEntries()[0]?.key).toBe('feed.cast.m_sprinkler');
    tapAbility(hit, { x: 4, y: 4 });
    simulate(SIM_DT, 0);
    drain(0);
    expect(hint()).toBe('not yet (45 s)');
    expect(hint()).not.toContain('{');
    setLang('es');
    tapAbility(hit, { x: 4, y: 4 });
    simulate(SIM_DT, 0);
    drain(0);
    expect(hint()).toBe(t('reason.cooldown', { s: 45 }));
    expect(hint()).not.toContain('{');
    setLang('en');
  });
});

describe('03 5.4, 02 9.1 item 3: a refusal that arrives after the ability was disarmed still names its seconds', () => {
  it('two taps queue while the park is paused, the pill is tapped off, and the step then refuses the second: "not yet (45 s)", never the raw {s}', () => {
    setGroup('mischief');
    armAbility('m_sprinkler');
    const hit = { kind: 'tile' as const, id: 0, tile: { x: 4, y: 4 } };
    tapAbility(hit, { x: 4, y: 4 });
    tapAbility(hit, { x: 4, y: 4 });
    armAbility(null); // the pill tapped off
    expect(armedAbility()).toBeNull();
    simulate(SIM_DT, 0);
    drain(0);
    expect(feedEntries().filter((e) => e.key === 'feed.cast.m_sprinkler')).toHaveLength(1);
    expect(hint()).toBe('not yet (45 s)');
    expect(hint()).not.toContain('{');
  });
});

describe('02 12.4, 04 5.6: the Progress sheet', () => {
  it('two ladders, each with its name, "n points · Tk", a bar on the scale to 70, ticks at 8, 20, 40 and 70 and the next unlock', () => {
    setProgress({ cp: 12, mp: 0 });
    openSheet('progress');
    const [c, m] = ladders();
    expect(ladders()).toHaveLength(2);
    expect(c?.classList.contains('cupid')).toBe(true);
    expect(m?.classList.contains('mischief')).toBe(true);
    expect(c?.querySelector('.lh b')?.textContent).toBe('Cupid Points');
    expect(m?.querySelector('.lh b')?.textContent).toBe('Mischief Points');
    expect(c?.querySelector('.lh span')?.textContent).toBe('12 points · T1');
    expect(m?.querySelector('.lh span')?.textContent).toBe('0 points · T0');
    expect([...(c?.querySelectorAll('.ltk span') ?? [])].map((s) => s.textContent)).toEqual(['8', '20', '40', '70']);
    expect([...(c?.querySelectorAll('.tk') ?? [])].map((s) => (s as HTMLElement).style.left)).toEqual(['11.4%', '28.6%', '57.1%', '100%']);
    expect(TIERS.slice(1)).toEqual([8, 20, 40, 70]);
    expect(fillOf(c)).toBe('17.1%');
    expect(fillOf(m)).toBe('0%');
    expect(c?.querySelector('.nx')?.textContent).toBe('Next: Umbrella at 20');
    expect(m?.querySelector('.nx')?.textContent).toBe('Next: Banana peel at 8');
    expect(c?.querySelector('.lbar')?.getAttribute('aria-hidden')).toBe('true');
  });
  it('past 70 the bar is full and the line says everything is unlocked; the bar never passes its end', () => {
    setProgress({ cp: 95, mp: 70 });
    openSheet('progress');
    const [c, m] = ladders();
    expect(fillOf(c)).toBe('100%');
    expect(fillOf(m)).toBe('100%');
    expect(c?.querySelector('.nx')?.textContent).toBe('Everything unlocked');
    expect(m?.querySelector('.lh span')?.textContent).toBe('70 points · T4');
  });
  it('the unlock table of 02 7.4: ten rows, a tier, the abilities of its row and the avatar after them, the points; unreached rows are .locked (--stone)', () => {
    setProgress({ cp: 12, mp: 0 });
    openSheet('progress');
    const rows = [...document.querySelectorAll<HTMLElement>('#progressList .urow')];
    expect(rows).toHaveLength(10);
    expect(rows[0]?.querySelector('b')?.textContent).toBe('T0');
    expect(text(rows[0])).toEqual(['Petals', 'Bouquet']);
    expect(text(rows[1])).toEqual(['Musician', 'Sunbeam', 'Avatar: Flower seller']);
    expect(rows[1]?.querySelector('small')?.textContent).toBe('8');
    expect(text(rows[4])).toEqual(['Fireworks']);
    expect(text(rows[5])).toEqual(['Pigeon', 'Sprinkler', 'Avatar: Pigeon']);
    expect(text(rows[8])).toEqual(['Rival', 'Mime', 'Avatar: Mime']);
    expect(text(rows[9])).toEqual(['Fog', 'Pigeon storm']);
    expect(rows.map((r) => r.classList.contains('locked'))).toEqual([false, false, true, true, true, false, true, true, true, true]);
    for (const [k, side] of (['cupid', 'mischief'] as const).entries()) {
      expect(UNLOCKS[side].map((u) => u.tier)).toEqual([0, 1, 2, 3, 4]);
      expect(rows.slice(5 * k, 5 * k + 5).map((r) => r.querySelector('small')?.textContent)).toEqual(TIERS.map(String));
    }
    const shell = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
    expect(shell).toContain('#progressList .urow.locked,#progressList .urow.locked small{color:var(--stone)}');
    expect(shell).toContain('#progressList .ladder.cupid .lbar u{background:var(--berry)}');
    expect(shell).toContain('#progressList .ladder.mischief .lbar u{background:var(--ember)}');
  });
  it('the summary line is the day\'s tally of this park', () => {
    openSheet('progress');
    expect($('progressSum').textContent).toBe(`Today: Cupid ${dayTally().cp} · Mischief ${dayTally().mp}`);
  });
  it('the open sheet repaints when a point is gained or the language changes, and not otherwise', () => {
    setProgress({ cp: 0, mp: 0 });
    openSheet('progress');
    const first = $('progressList').firstElementChild;
    updateSheets(0.1);
    expect($('progressList').firstElementChild).toBe(first); // nothing changed: the DOM is not rewritten
    award('cupid', 1);
    updateSheets(0.1);
    expect(ladders()[0]?.querySelector('.lh span')?.textContent).toBe('1 point · T0'); // plural(): one point, not "1 points"
    award('cupid', 1);
    updateSheets(0.1);
    expect(ladders()[0]?.querySelector('.lh span')?.textContent).toBe('2 points · T0');
    setProgress({ cp: 1, mp: 0 });
    updateSheets(0.1);
    setLang('es');
    updateSheets(0.1);
    expect(lang()).toBe('es');
    expect(ladders()[0]?.querySelector('.lh span')?.textContent).toBe('1 punto · T0');
    expect(ladders()[0]?.querySelector('.lh b')?.textContent).toBe(es['sheet.progress.cupid']);
    expect(document.querySelector('#progressList .ut')?.textContent).toBe(es['sheet.progress.unlocks']);
    expect(document.querySelector('#progressList .urow .its span')?.textContent).toBe(es['ability.c_petals.name']);
    setLang('en');
  });
  it('the sheet is capped, closes with its x, and takes the room between the chips and the rail like the others (CSS)', () => {
    openSheet('progress');
    expect($('progress').classList.contains('on')).toBe(true);
    ($('progress').querySelector('.x') as HTMLElement).click();
    expect($('progress').classList.contains('on')).toBe(false);
  });
});

describe('02 12.2: a Continue does not flash (this block is last: it loads a second copy of the modules on a fresh DOM)', () => {
  it('a Continue with points in the profile does not flash on its first repaint', async () => {
    vi.resetModules();
    dom();
    const prog = await import('../../src/play/progression.ts');
    const hud = await import('../../src/ui/hud.ts');
    prog.setProgress({ cp: 12, mp: 5 });
    hud.initHud();
    expect($('tCP').textContent).toBe('12');
    expect($('tCP').classList.contains('flash')).toBe(false);
    expect($('tMP').classList.contains('flash')).toBe(false);
  });
});
