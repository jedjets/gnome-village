// src/ui/sheets.ts
// The six sheets (Census, Romances, Progress, Events, Avatar picker, Options) plus the dev Sound check: open, close, mutual exclusion.
// Ported from GV 10743-10790 (open/close idiom, the `.on` class, the close buttons) and, in S4 part C, 10973-10992 (renderCensus,
// openCensus, closeCensus) with 12174 (a census row selects and follows). ADAPT: one function for every sheet; opening one closes the
// others, so Census and Events never show together (GV 10748, 10991); the census lists the people in the park (cameos are not people,
// 03 3.11) in arrival order with name · "archetype · doing" · partner (02 12.4, 04 5.6), the selected one's row in ink, and the summary
// "N in the park · k courting" and "room for M more" (06 16.10, through plural) where GV listed grown-ups, elders, children, babies and
// homes oldest first; it repaints every 1.2 s while open (GV censusT 10843) from hud.ts's frame call.
// Dropped from the range: GV's home, craft, chief and hamlet columns and the "you" mark (S7's avatar marks the row).
// Options (register 3.10 and section 4 "Park pace and Options", owner 2026-10-14 "1 Y 2 Y"; 02 12.4; 04 5.6): NEW, GV had no options
// sheet. Rail row 3's Options (#bOptions, rail.ts) opens it. The summary names the park seed; the rows: Park pace Calm | Lively (the
// park's pace pressed, read from entities/visitor.ts; a tap enqueues the logged `park.pace` command and writes settings.pace to the
// profile, store.setProfilePace, so new parks get it; a pace tapped while paused, or Begin's profile pace in a park started paused
// (main.ts calls paceQueued), shows pressed while its command waits, 03 4.6), with the pressed pace's one-line hint; Language EN | ES
// (intro.ts chooseLang: the tables, <html lang>, the profile); Sound on | off, a mirror of #bMute (its aria-pressed is the one state;
// a tap presses #bMute); Speed, a read-out of the dial with a pointer to row 3 (the dial is the one control); under body.dev only
// (03 10.2, CSS), the Sound check (a toast until S8 builds its sheet) and the perf overlay on | off through the hooks main.ts hands in
// (ui/ may not import debug/, 03 2.1). Every string through t(). The open sheet repaints when what it shows changes (checked every
// frame from hud.ts) or the language changes. Escape and the close button close any sheet; focus goes back to the control that opened
// it (a tap that gave no focus leaves none to go back to).
// S5 (02 12.4; 04 5.6): the Romances sheet, pairs by stage descending (the shown stage, then the featured order): "A & B", the stage
// chip, the affinity bar, "n today" embarrassments and a Pin per row (romance.ts setPin), the footer "Today: Happily n · Parted m"
// counted from the day's happily and parted events; a row selects the pair (the pair card). The Events sheet (GV renderEvLog 10743):
// the feed's last 40, newest first, "Day N · phase" over each line; a row, or a tap on the feed line (GV 12176), flies there
// (goToEvent, GV 10751): a visitor still in the park is selected and followed with the card; otherwise the camera follows the place
// and the 5.2 s focus pin stands over it (render/ghost.ts setFocusMark).
// TODO(S6): progress; TODO(S7): picker; TODO(S8): the Sound check sheet.
import { T, phaseOf } from '../core/clock.ts';
import { watch } from '../core/events.ts';
import { enqueue, pendingCount, type Pace } from '../core/commands.ts';
import { CAP_PEOPLE, arrivalsState, visitors, byId, type Visitor } from '../entities/visitor.ts';
import { parkSeed } from '../world/gen.ts';
import { getProfile, setProfilePace } from '../save/store.ts';
import { $, confirmOpen, layoutOverlays, toast, SHEET_IDS, type SheetId } from './dom.ts';
import { lang, onLang, plural, t } from './i18n.ts';
import { chooseLang } from './intro.ts';
import { select, selectedVisitor } from './card.ts';
import { feedEntries, type FeedEntry } from './feed.ts';
import { STAGE_IDS, pairById, pairs, partnerOf, pinnedPair, setPin, shownStage, type Pair } from '../entities/romance.ts';
import { cam, clampCam, follow } from '../render/camera.ts';
import { setFocusMark } from '../render/ghost.ts';

/** What main.ts hands the sheets: the dev perf overlay's state and switch (debug/perf.ts, which ui/ may not import, 03 2.1). */
export type SheetHooks = { perfOn?: () => boolean; setPerf?: (on: boolean) => void };
let hooks: SheetHooks = {};

/** The census repaints this often while it is open (GV censusT 10843, 10991; 02 12.1). */
export const CENSUS_S = 1.2;
let censusT = 0;

export function sheetOpen(): SheetId | null {
  for (const id of SHEET_IDS) if (document.getElementById(id)?.classList.contains('on')) return id;
  return null;
}

/**
 * The control that opened the sheet on screen; focus goes back to it when the sheet closes with focus inside. A tap that gives no
 * focus (a phone's touch) leaves none, so focus never jumps to the opener of an earlier sheet.
 */
let opener: HTMLElement | null = null;

/** aria-expanded on the controls that name a sheet in aria-controls (#bOptions). */
function syncExpanded(): void {
  document.querySelectorAll<HTMLElement>('[aria-controls]').forEach((b) => {
    const id = b.getAttribute('aria-controls');
    if (!id || !(SHEET_IDS as readonly string[]).includes(id)) return;
    b.setAttribute('aria-expanded', document.getElementById(id)?.classList.contains('on') ? 'true' : 'false');
  });
}

export function closeSheets(): void {
  const a = document.activeElement;
  const inside = a instanceof HTMLElement && a.closest('div.sheet') !== null;
  for (const id of SHEET_IDS) document.getElementById(id)?.classList.remove('on');
  if (inside && opener?.isConnected) opener.focus();
  syncExpanded();
  layoutOverlays();
}

export function openSheet(id: SheetId): void {
  const a = document.activeElement;
  if (!(a instanceof HTMLElement && a.closest('div.sheet') !== null)) opener = a instanceof HTMLElement && a !== document.body ? a : null;
  closeSheets();
  $(id).classList.add('on');
  renderSheet(id);
  syncExpanded();
  layoutOverlays();
}

/** Open, or close when it is already open. */
export function toggleSheet(id: SheetId): void {
  if (sheetOpen() === id) closeSheets();
  else openSheet(id);
}

export function renderSheet(id: SheetId): void {
  if (id === 'census') renderCensus();
  else if (id === 'options') renderOptions();
  else if (id === 'romances') renderRomances();
  else if (id === 'evlog') renderEvents();
  // TODO(S6-S8): the other sheets; until then they show the placeholder paragraph from index.html.
}

/** Every frame with real seconds (hud.ts): the census repaints every 1.2 s while it is open. */
export function updateSheets(dtr: number): void {
  const open = sheetOpen();
  if (open === 'options' && optionsKey() !== paintedKey) renderOptions(); // a pace applied, a New, the dial, #bMute, the language
  if (open === 'romances' && romancesKey() !== romKey) renderRomances(); // a stage, a bar, a pin, a pair come or gone
  if (open === 'evlog' && feedEntries()[0] !== evTop) renderEvents();
  if (open !== 'census') {
    censusT = 0;
    return;
  }
  censusT -= dtr;
  if (censusT <= 0) renderCensus();
}

/** The one the census row names beside the person: a couple's other half, a child's parent or a parent's child; S5 adds the Pair. */
function partnerOfV(v: Visitor): Visitor | undefined {
  const p = pairById(v.pairId);
  if (p) return partnerOf(p, v);
  const id = v.coupleOf || v.childOf || v.parentOf;
  return id ? byId(id) : undefined;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

/** The census (02 12.4; GV renderCensus 10973): one row button per person, then the summary line. */
export function renderCensus(): void {
  const list = document.getElementById('censusList'), sum = document.getElementById('censusSum');
  if (!list || !sum) return;
  censusT = CENSUS_S; // the next repaint 1.2 s after this one (GV openCensus 10991 set censusT = 1.2)
  const sel = selectedVisitor();
  const pairs = new Set<number>();
  const rows: HTMLElement[] = [];
  for (const v of visitors) {
    if (v.archetype === 'cameo') continue;
    if (v.pairId !== 0) pairs.add(v.pairId);
    const row = el('button', '', v.id === sel ? 'row sel' : 'row');
    row.type = 'button';
    row.dataset.id = String(v.id);
    row.append(el('b', v.name), el('small', t('sheet.census.row', { archetype: '@archetype.' + v.archetype, doing: '@doing.' + v.st })));
    const p = partnerOfV(v);
    if (p) row.append(el('small', t('sheet.census.partner', { b: p.name }), 'r'));
    rows.push(row);
  }
  list.replaceChildren(...rows);
  const n = rows.length;
  // two spans; shell.css puts the " · " between them, so no sentence is built here (03 P7)
  sum.replaceChildren(el('span', t('sheet.census.summary', { n, k: pairs.size })), el('span', plural('sheet.census.room', Math.max(0, CAP_PEOPLE - n))));
}

/* ---------- Romances (02 12.4; 04 5.6) ---------- */

/** Today's endings, counted from the frame events (UI state: a reload starts the day's count again). */
let today = { day: 0, h: 0, p: 0 };
function countEnding(kind: 'h' | 'p', tick: number): void {
  const day = Math.floor(0.3 + tick / 21600) + 1;
  if (today.day !== day) today = { day, h: 0, p: 0 };
  today[kind]++;
}
let romKey = '';
function sortedPairs(): Pair[] {
  return pairs.slice().sort((x, y) => shownStage(y) - shownStage(x) || x.formedDay - y.formedDay || x.id - y.id);
}
function romancesKey(): string {
  return [lang(), pinnedPair(), T.day, today.h, today.p, ...sortedPairs().map((p) => `${p.id}:${shownStage(p)}:${Math.round(p.affinity * 100)}:${p.embToday}`)].join('|');
}

/** One row per pair (04 5.6): "A & B" in Fraunces, the stage chip, the affinity bar, "n today", Pin; the footer is the sum line. */
export function renderRomances(): void {
  const list = document.getElementById('romancesList'), sum = document.getElementById('romancesSum');
  if (!list || !sum) return;
  romKey = romancesKey();
  if (today.day !== T.day) today = { day: T.day, h: 0, p: 0 };
  const rows: HTMLElement[] = [];
  for (const p of sortedPairs()) {
    const a = byId(p.a), b = byId(p.b);
    if (!a || !b) continue;
    const row = el('div', '', 'row rom');
    row.dataset.pair = String(p.id);
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    const k = shownStage(p);
    const bar = el('i', '', 'abar');
    const u = el('u', '');
    u.style.width = Math.round(p.affinity * 100) + '%';
    bar.append(u);
    const pin = el('button', t(pinnedPair() === p.id ? 'card.unpin' : 'card.pin'), 'gb pin');
    pin.type = 'button';
    pin.dataset.pin = String(p.id);
    pin.setAttribute('aria-pressed', pinnedPair() === p.id ? 'true' : 'false');
    row.append(
      el('b', t('card.pair.title', { a: a.name, b: b.name })),
      pin,
      el('small', t('stage.of', { stage: '@stage.' + STAGE_IDS[k], n: k }), 'stg'),
      bar,
      el('small', t('card.pair.emb', { n: p.embToday }), 'r'),
    );
    rows.push(row);
  }
  if (rows.length === 0) rows.push(el('div', t('sheet.romances.empty'), 'sum'));
  list.replaceChildren(...rows);
  sum.textContent = t('sheet.romances.today', { h: today.h, p: today.p });
}

/* ---------- Events (02 12.4; GV renderEvLog 10743, goToEvent 10751) ---------- */

let evTop: FeedEntry | undefined;
let evSel: FeedEntry | null = null;

/** The last 40 lines, newest first, "Day N · phase" over each (04 5.6). */
export function renderEvents(): void {
  const list = document.getElementById('evList');
  if (!list) return;
  const es = feedEntries();
  evTop = es[0];
  if (es.length === 0) {
    list.replaceChildren(el('div', t('sheet.events.empty'), 'sum'));
    return;
  }
  list.replaceChildren(
    ...es.map((e, k) => {
      const row = el('button', '', e === evSel ? 'row ev sel' : 'row ev');
      row.type = 'button';
      row.dataset.k = String(k);
      const day = Math.floor(e.abs) + 1, f = e.abs - Math.floor(e.abs);
      row.append(el('small', t('sheet.events.when', { n: day, phase: '@hud.phase.' + phaseOf(f) })), el('span', t(e.key, e.params)));
      return row;
    }),
  );
}

/**
 * Fly to an event (GV goToEvent 10751): its first id, a visitor still in the park, is selected and followed with the card; otherwise the
 * camera follows the place and the focus pin stands over it for 5.2 s (GV drawFocusMark 10764).
 */
export function goToEvent(e: FeedEntry | undefined): void {
  if (!e) return;
  evSel = e;
  const v = byId(e.ids[0] ?? 0);
  if (v) select({ kind: 'visitor', id: v.id, tile: null });
  else {
    select({ kind: 'none', id: 0, tile: null });
    follow({ kind: 'point', x: e.x, y: e.y });
    if (cam.z < 1.3) cam.z = 1.5;
    clampCam();
    setFocusMark(e.x, e.y);
  }
  if (sheetOpen() === 'evlog') renderEvents();
}

/* ---------- Options (register 3.10, section 4 "Park pace and Options"; 02 12.4; 04 5.6) ---------- */

const PACE_HINT: Readonly<Record<Pace, string>> = { calm: 'sheet.options.pace.calm_hint', lively: 'sheet.options.pace.lively_hint' };

/**
 * A pace whose `park.pace` command waits for a step (tapped while paused, 03 4.6, or Begin's profile pace in a park started paused);
 * null once nothing waits or the park has it.
 */
let waiting: Pace | null = null;
let paintedKey = '';

/** The pace the Options sheet shows pressed: the park's (entities/visitor.ts), or the one whose command waits for a step. */
export function shownPace(): Pace {
  const park = arrivalsState().pace;
  if (waiting !== null && (pendingCount() === 0 || waiting === park)) waiting = null; // applied, or dropped by a New or a restore
  return waiting ?? park;
}

/**
 * The shell queued `p` as a `park.pace` command for the park on screen (main.ts, right after Begin's store.enqueueProfilePace): the
 * sheet shows it pressed until the step that applies it, which a park started paused (`#halt`) has not run yet.
 */
export function paceQueued(p: Pace): void {
  waiting = p;
}

/**
 * Park pace tapped (owner 2026-10-14): a pace other than the one shown is sent as the logged `park.pace` command (it applies at the
 * next step, so replays stay exact); either way the profile remembers it for every new park (store.setProfilePace).
 */
export function choosePace(p: Pace): void {
  if (shownPace() !== p) {
    enqueue({ side: 'park', kind: 'park.pace', payload: { pace: p } });
    waiting = p;
  }
  if (getProfile().settings.pace !== p) setProfilePace(p);
  renderOptions();
}

/** #bMute's state is the one sound state (rail.ts); the sheet mirrors it. */
function muted(): boolean {
  return document.getElementById('bMute')?.getAttribute('aria-pressed') === 'true';
}

/** Everything the sheet shows, so the frame call repaints only on a change. */
function optionsKey(): string {
  return [shownPace(), lang(), muted(), T.speed, parkSeed(), hooks.perfOn?.() ?? false].join('|');
}

type Choice = { k: string; label: string; on: boolean };

/** The segmented switch of Park | Cupid | Mischief (.grp of .gb with aria-pressed), named by its row's label. */
function seg(name: string, choices: Choice[]): HTMLElement {
  const g = el('div', '', 'grp');
  g.setAttribute('role', 'group');
  g.setAttribute('aria-label', name);
  for (const c of choices) {
    const b = el('button', c.label, 'gb');
    b.type = 'button';
    b.dataset.k = c.k;
    b.setAttribute('aria-pressed', c.on ? 'true' : 'false');
    g.appendChild(b);
  }
  return g;
}

/** One row: the setting's name, its control, and a one-line hint under both. */
function opt(name: string, control: HTMLElement, hint = '', cls = ''): HTMLElement {
  const row = el('div', '', cls ? 'opt ' + cls : 'opt');
  row.append(el('b', name), control);
  if (hint) row.append(el('small', hint));
  return row;
}

/** Paint the Options sheet; a control that held the focus keeps it (a repaint replaces the buttons). */
export function renderOptions(): void {
  const list = document.getElementById('optionsList'), sum = document.getElementById('optionsSum');
  if (!list || !sum) return;
  paintedKey = optionsKey();
  const a = document.activeElement;
  const focusK = a instanceof HTMLElement && list.contains(a) ? a.dataset.k : undefined;
  const pace = shownPace(), l = lang(), m = muted(), perf = hooks.perfOn?.() ?? false;
  const soundCheck = el('button', '', 'row dev');
  soundCheck.type = 'button';
  soundCheck.dataset.k = 'soundcheck';
  soundCheck.append(el('b', t('sheet.options.sound_check')));
  list.replaceChildren(
    opt(t('sheet.options.pace'), seg(t('sheet.options.pace'), [
      { k: 'pace:calm', label: t('sheet.options.pace.calm'), on: pace === 'calm' },
      { k: 'pace:lively', label: t('sheet.options.pace.lively'), on: pace === 'lively' },
    ]), t(PACE_HINT[pace])),
    opt(t('sheet.options.language'), seg(t('sheet.options.language'), [
      { k: 'lang:en', label: t('sheet.options.lang_en'), on: l === 'en' },
      { k: 'lang:es', label: t('sheet.options.lang_es'), on: l === 'es' },
    ])),
    opt(t('sheet.options.sound'), seg(t('sheet.options.sound'), [
      { k: 'sound:on', label: t('sheet.options.on'), on: !m },
      { k: 'sound:off', label: t('sheet.options.off'), on: m },
    ])),
    opt(t('sheet.options.speed'), el('span', T.speed > 0 ? t('rail.speed', { n: T.speed }) : t('rail.pause'), 'val'), t('sheet.options.speed_hint')),
    soundCheck,
    opt(t('sheet.options.perf'), seg(t('sheet.options.perf'), [
      { k: 'perf:on', label: t('sheet.options.on'), on: perf },
      { k: 'perf:off', label: t('sheet.options.off'), on: !perf },
    ]), '', 'dev'),
  );
  sum.textContent = t('sheet.options.seed', { seed: String(parkSeed()) });
  if (focusK) list.querySelector<HTMLElement>(`[data-k="${focusK}"]`)?.focus();
}

/** A tap on an Options control, by its data-k. */
function onOption(k: string): void {
  const [what, v] = k.split(':');
  if (what === 'pace' && (v === 'calm' || v === 'lively')) choosePace(v);
  else if (what === 'lang' && (v === 'en' || v === 'es')) chooseLang(v); // onLang repaints the sheet
  else if (what === 'sound') {
    if (muted() === (v === 'on')) $('bMute').click(); // the rail's own toggle: one sound state
    renderOptions();
  } else if (what === 'perf') {
    hooks.setPerf?.(v === 'on');
    renderOptions();
  } else if (what === 'soundcheck') toast('toast.sound_check_later'); // TODO(S8): open the #snd sheet once it has its rows
}

let wired = false;
export function initSheets(h: SheetHooks = {}): void {
  hooks = h;
  if (wired) return;
  wired = true;
  for (const id of SHEET_IDS) {
    const x = document.querySelector<HTMLButtonElement>('#' + id + ' .x');
    x?.addEventListener('click', closeSheets);
  }
  // Escape closes an open sheet; an open confirm takes the key first (dom.ts marks it handled)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || confirmOpen() || sheetOpen() === null) return;
    e.preventDefault();
    closeSheets();
  });
  // a census row selects and follows its person (02 12.4; GV 12174)
  document.getElementById('censusList')?.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement | null)?.closest<HTMLElement>('.row');
    const id = Number(row?.dataset.id ?? 0);
    if (!id || !byId(id)) return;
    select({ kind: 'visitor', id, tile: null });
    renderCensus();
  });
  // a Romances row selects the pair (the pair card, 02 12.4); its Pin features it (02 6.6)
  document.getElementById('romancesList')?.addEventListener('click', (e) => {
    const t0 = e.target as HTMLElement | null;
    const pin = t0?.closest<HTMLElement>('[data-pin]');
    if (pin) {
      const id = Number(pin.dataset.pin);
      setPin(pinnedPair() === id ? 0 : id);
      renderRomances();
      return;
    }
    const p = pairById(Number(t0?.closest<HTMLElement>('[data-pair]')?.dataset.pair ?? 0));
    if (!p) return;
    closeSheets();
    select({ kind: 'visitor', id: p.a, tile: null });
  });
  // an Events row flies to its event; the feed line opens Events and flies to the newest, or closes it (GV 12176-12178)
  document.getElementById('evList')?.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement | null)?.closest<HTMLElement>('.row');
    if (row?.dataset.k !== undefined) goToEvent(feedEntries()[Number(row.dataset.k)]);
  });
  document.getElementById('feed')?.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement | null)?.closest('.ev')) return;
    if (sheetOpen() === 'evlog') {
      closeSheets();
      return;
    }
    openSheet('evlog');
    goToEvent(feedEntries()[0]);
  });
  watch('happily', (e) => countEnding('h', e.tick));
  watch('parted', (e) => countEnding('p', e.tick));
  document.getElementById('optionsList')?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-k]');
    if (b?.dataset.k) onOption(b.dataset.k);
  });
  onLang(() => {
    if (sheetOpen() === 'options') renderOptions();
  });
}
