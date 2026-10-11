// src/ui/dom.ts
// DOM helpers: $, the toast, overlay stacking from the measured rail height, body classes, data-t filling.
// Ported from GV 10684-10699 ($, toast, layoutOverlays) and 10866 (esc). PORT; sheet ids are Parque's (03 10.3).
// TODO(S3): the confirm dialog; TODO(S11): aria-live audit.
import { t, type Params } from './i18n.ts';

export const SHEET_IDS = ['census', 'romances', 'progress', 'evlog', 'picker', 'options', 'snd'] as const;
export type SheetId = (typeof SHEET_IDS)[number];

export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error('missing #' + id);
  return el;
}

let toastT = 0;

/** Show a translated line for `secs` seconds (3.4 s default, 6 s for avatar hints). */
export function toast(key: string, params?: Params, secs = 3.4): void {
  const el = $('hint');
  el.textContent = t(key, params);
  el.classList.add('on');
  toastT = secs;
  layoutOverlays();
}

/** Called every frame with real seconds (hud.ts). */
export function ageToast(dtr: number): void {
  if (toastT <= 0) return;
  toastT -= dtr;
  if (toastT <= 0) $('hint').classList.remove('on');
}

export function anySheetOpen(): boolean {
  return SHEET_IDS.some((id) => document.getElementById(id)?.classList.contains('on'));
}

/** The overlays stack from the rail up: card and sheets at rail height + 8, the toast above the card (GV 10689-10699). */
export function layoutOverlays(): void {
  const rail = document.getElementById('rail');
  if (!rail) return;
  const base = Math.round(rail.getBoundingClientRect().height) + 8;
  for (const id of ['card', ...SHEET_IDS]) {
    const el = document.getElementById(id);
    if (el) el.style.bottom = base + 'px';
  }
  document.body.classList.toggle('sheet', anySheetOpen());
  let top = base + 4;
  const card = document.getElementById('card');
  if (card && card.classList.contains('on')) top = base + Math.round(card.getBoundingClientRect().height) + 10;
  const h = document.getElementById('hint');
  if (h) h.style.bottom = top + 'px';
}

export function setBodyClass(cls: 'avatar' | 'photo' | 'sheet' | 'dev', on: boolean): void {
  document.body.classList.toggle(cls, on);
}

/** Fill every data-t (text) and data-t-aria (aria-label) element from the string table. */
export function applyDom(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
    el.textContent = t(el.dataset.t as string);
  });
  root.querySelectorAll<HTMLElement>('[data-t-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.tAria as string));
  });
}
