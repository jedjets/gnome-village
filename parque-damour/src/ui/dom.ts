// src/ui/dom.ts
// DOM helpers: $, the toast, overlay stacking from the measured rail height, body classes, data-t filling, the confirm dialog.
// Ported from GV 10684-10699 ($, toast, layoutOverlays) and 10866 (esc). PORT; sheet ids are Parque's (03 10.3).
// Changes: the toast takes a string key and its params (03 P7); layoutOverlays stacks the card and the six sheets plus the dev sound
// check (GV: card, gbar, snd, bld, census, evlog), because Parque's ghost bar is the rail's row 2 and so inside the measured rail; the
// confirm dialog is new (GV 12169 asked nothing on New; register row 21, 02 12.5 item 4): #confirm with aria-modal, focus on Yes, Tab
// kept inside, Escape and No close it, a tap on the dimmed page outside the card is No, focus goes back where it was.
// TODO(S11): aria-live audit.
import { t, type Params } from './i18n.ts';

export const SHEET_IDS = ['census', 'romances', 'progress', 'evlog', 'picker', 'options', 'snd'] as const;
export type SheetId = (typeof SHEET_IDS)[number];

export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error('missing #' + id);
  return el;
}

/** Toast lengths in seconds (02 12.5 item 3; GV toast 10685 and the avatar hint 11259). */
export const TOAST_S = 3.4;
export const TOAST_LONG_S = 6;

let toastT = 0;

/** Show a translated line for `secs` seconds (3.4 s default, 6 s for avatar hints). */
export function toast(key: string, params?: Params, secs = TOAST_S): void {
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

/** True while a toast is showing (the flow check of 07 S3.7 item 6 counts them). */
export function toastOn(): boolean {
  return toastT > 0;
}

export function anySheetOpen(): boolean {
  return SHEET_IDS.some((id) => document.getElementById(id)?.classList.contains('on'));
}

/**
 * The overlays stack from the rail up (03 10.3; GV 10689-10699): the rail's height is measured once per call, the card and every sheet
 * sit at that height + 8 px, body.sheet follows the sheets, and the toast sits 10 px above the card when the card is on (4 px above
 * the rail otherwise). Called by toast, updateHud every 0.35 s, on resize and 220 ms after orientationchange.
 */
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

/* ---------- the confirm dialog (03 10.1 #confirm; 02 12.5 item 4) ---------- */

type Pending = { yes: () => void; no?: () => void; back: HTMLElement | null };
let pending: Pending | null = null;
let wired = false;

export function confirmOpen(): boolean {
  return pending !== null;
}

/** Close the dialog without an answer's action; focus goes back to the control that opened it. */
export function closeConfirm(): void {
  const p = pending;
  pending = null;
  const box = document.getElementById('confirm');
  if (box) box.hidden = true;
  p?.back?.focus?.();
}

function answer(yes: boolean): void {
  const p = pending;
  if (!p) return;
  closeConfirm();
  if (yes) p.yes();
  else p.no?.();
}

function wire(): void {
  if (wired) return;
  wired = true;
  $('confirmYes').addEventListener('click', () => answer(true));
  $('confirmNo').addEventListener('click', () => answer(false));
  // a tap on the dimmed page around the card is No (the card itself stops nothing: its own taps land on its children)
  $('confirm').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) answer(false);
  });
  document.addEventListener('keydown', (e) => {
    if (!pending) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      answer(false);
    } else if (e.key === 'Tab') {
      // aria-modal: focus stays on the two answers
      const yes = $('confirmYes'), no = $('confirmNo');
      e.preventDefault();
      (document.activeElement === yes ? no : yes).focus();
    }
  });
}

/**
 * Ask a yes or no question (the text is the string key `key`): #confirm shows with focus on Yes; Yes runs `onYes`, No, Escape or a tap
 * outside the card run `onNo` (when given). A second call while open replaces the question.
 */
export function openConfirm(key: string, onYes: () => void, onNo?: () => void): void {
  wire();
  const active = document.activeElement;
  pending = { yes: onYes, no: onNo, back: pending?.back ?? (active instanceof HTMLElement && active !== document.body ? active : null) };
  applyDom($('confirm')); // Yes, No and the dialog's label in the current language
  $('confirmText').textContent = t(key);
  $('confirm').hidden = false;
  $('confirmYes').focus();
}
