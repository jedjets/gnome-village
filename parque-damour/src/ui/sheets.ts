// src/ui/sheets.ts
// The six sheets (Census, Romances, Progress, Events, Avatar picker, Options) plus the dev Sound check: open, close, mutual exclusion.
// Ported from GV 10743-10790 (open/close idiom, the `.on` class, the close buttons). ADAPT: one function for every sheet.
// TODO(S4): renderSheet('census'); TODO(S5): romances, evlog with goToEvent; TODO(S6): progress; TODO(S7): picker; TODO(S11): options.
import { $, layoutOverlays, SHEET_IDS, type SheetId } from './dom.ts';

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

export function renderSheet(_id: SheetId): void {
  // TODO(S4-S11): per-sheet rendering; S0 shows the placeholder paragraph from index.html.
}

export function initSheets(): void {
  for (const id of SHEET_IDS) {
    const x = document.querySelector<HTMLButtonElement>('#' + id + ' .x');
    x?.addEventListener('click', closeSheets);
  }
}
