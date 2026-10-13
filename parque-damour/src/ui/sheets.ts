// src/ui/sheets.ts
// The six sheets (Census, Romances, Progress, Events, Avatar picker, Options) plus the dev Sound check: open, close, mutual exclusion.
// Ported from GV 10743-10790 (open/close idiom, the `.on` class, the close buttons) and, in S4 part C, 10973-10992 (renderCensus,
// openCensus, closeCensus) with 12174 (a census row selects and follows). ADAPT: one function for every sheet; opening one closes the
// others, so Census and Events never show together (GV 10748, 10991); the census lists the people in the park (cameos are not people,
// 03 3.11) in arrival order with name · "archetype · doing" · partner (02 12.4, 04 5.6), the selected one's row in ink, and the summary
// "N in the park · k courting" and "room for M more" (06 16.10, through plural) where GV listed grown-ups, elders, children, babies and
// homes oldest first; it repaints every 1.2 s while open (GV censusT 10843) from hud.ts's frame call.
// Dropped from the range: GV's home, craft, chief and hamlet columns and the "you" mark (S7's avatar marks the row).
// TODO(S5): romances, evlog with goToEvent; TODO(S6): progress; TODO(S7): picker; TODO(S11): options.
import { CAP_PEOPLE, visitors, byId, type Visitor } from '../entities/visitor.ts';
import { $, layoutOverlays, SHEET_IDS, type SheetId } from './dom.ts';
import { plural, t } from './i18n.ts';
import { select, selectedVisitor } from './card.ts';

/** The census repaints this often while it is open (GV censusT 10843, 10991; 02 12.1). */
export const CENSUS_S = 1.2;
let censusT = 0;

export function sheetOpen(): SheetId | null {
  for (const id of SHEET_IDS) if (document.getElementById(id)?.classList.contains('on')) return id;
  return null;
}

export function closeSheets(): void {
  for (const id of SHEET_IDS) document.getElementById(id)?.classList.remove('on');
  layoutOverlays();
}

export function openSheet(id: SheetId): void {
  closeSheets();
  $(id).classList.add('on');
  renderSheet(id);
  layoutOverlays();
}

/** Open, or close when it is already open. */
export function toggleSheet(id: SheetId): void {
  if (sheetOpen() === id) closeSheets();
  else openSheet(id);
}

export function renderSheet(id: SheetId): void {
  if (id === 'census') renderCensus();
  // TODO(S5-S11): the other sheets; until then they show the placeholder paragraph from index.html.
}

/** Every frame with real seconds (hud.ts): the census repaints every 1.2 s while it is open. */
export function updateSheets(dtr: number): void {
  if (sheetOpen() !== 'census') {
    censusT = 0;
    return;
  }
  censusT -= dtr;
  if (censusT <= 0) renderCensus();
}

/** The one the census row names beside the person: a couple's other half, a child's parent or a parent's child; S5 adds the Pair. */
function partnerOf(v: Visitor): Visitor | undefined {
  // TODO(S5): a member of a Pair names the other member
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
    const p = partnerOf(v);
    if (p) row.append(el('small', t('sheet.census.partner', { b: p.name }), 'r'));
    rows.push(row);
  }
  list.replaceChildren(...rows);
  const n = rows.length;
  // two spans; shell.css puts the " · " between them, so no sentence is built here (03 P7)
  sum.replaceChildren(el('span', t('sheet.census.summary', { n, k: pairs.size })), el('span', plural('sheet.census.room', Math.max(0, CAP_PEOPLE - n))));
}

let wired = false;
export function initSheets(): void {
  if (wired) return;
  wired = true;
  for (const id of SHEET_IDS) {
    const x = document.querySelector<HTMLButtonElement>('#' + id + ' .x');
    x?.addEventListener('click', closeSheets);
  }
  // a census row selects and follows its person (02 12.4; GV 12174)
  document.getElementById('censusList')?.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement | null)?.closest<HTMLElement>('.row');
    const id = Number(row?.dataset.id ?? 0);
    if (!id || !byId(id)) return;
    select({ kind: 'visitor', id, tile: null });
    renderCensus();
  });
}
