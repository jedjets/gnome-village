// src/ui/intro.ts
// The intro: title, four paragraphs, Begin, Continue (when a park save exists), the EN / ES toggle (04 5.7).
// Ported from GV 12200-12217 (langs, paintIntro, Begin). ADAPT: text comes from t(); the toggle calls setLang, which sets <html lang>,
// and keeps the choice in the profile (register 3.12: settings.lang, written at once); Continue shows only when main.ts found a park
// (loadPark() returned one, 03 11); Begin with a park present asks the New confirm first (02 12.5 item 4, 07 S3.6 item 11), because
// beginning loses the saved park; main.ts clears the key and starts the park.
// TODO(S8): Begin unlocks audio.
import { getProfile, saveProfile } from '../save/store.ts';
import { $, applyDom, openConfirm } from './dom.ts';
import { t, setLang, lang, onLang, type Lang } from './i18n.ts';

function paint(): void {
  const iP = $('iP');
  iP.replaceChildren();
  for (const n of [1, 2, 3, 4]) {
    const p = document.createElement('p');
    p.textContent = t('intro.p' + n);
    iP.appendChild(p);
  }
  document.querySelectorAll<HTMLButtonElement>('#lang button').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.l === lang() ? 'true' : 'false');
  });
}

/** The language toggle: the tables, <html lang> (i18n.setLang) and profile.settings.lang, written now (register 3.12). */
export function chooseLang(l: Lang): void {
  setLang(l);
  const p = getProfile();
  if (p.settings.lang !== l) {
    p.settings.lang = l;
    saveProfile();
  }
}

let wired = false;
let hasSave = false;
let begin: () => void = () => {};
let resume: () => void = () => {};

/** Begin, past the confirm when there was one. */
function go(): void {
  hideIntro();
  begin();
}

/**
 * Show the intro. `hasPark`: a saved park was found, so Continue shows and Begin asks the confirm before `onBegin`. Calling it again
 * (a test, a later return to the intro) replaces the callbacks; the listeners are wired once.
 */
export function showIntro(hasPark: boolean, onBegin: () => void, onContinue: () => void): void {
  hasSave = hasPark;
  begin = onBegin;
  resume = onContinue;
  const intro = $('intro');
  intro.classList.remove('gone');
  intro.style.display = '';
  $('bContinue').hidden = !hasPark;
  applyDom();
  paint();
  if (wired) return;
  wired = true;
  onLang(() => {
    applyDom();
    paint();
  });
  document.querySelectorAll<HTMLButtonElement>('#lang button').forEach((b) => {
    b.addEventListener('click', () => chooseLang((b.dataset.l as Lang) || 'en'));
  });
  $('begin').addEventListener('click', () => {
    if (hasSave) openConfirm('confirm.new_park', go); // No keeps the intro, Continue still offered
    else go();
  });
  $('bContinue').addEventListener('click', () => {
    hideIntro();
    resume();
  });
}

/** Fade the intro out and take it out of the way after the 0.5 s transition (GV 12215-12216). */
export function hideIntro(): void {
  const intro = $('intro');
  intro.classList.add('gone');
  setTimeout(() => {
    intro.style.display = 'none';
  }, 600);
}
