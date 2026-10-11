// src/ui/intro.ts
// The intro: title, four paragraphs, Begin, Continue (when a park save exists), the EN / ES toggle (04 5.7).
// Ported from GV 12200-12217 (langs, paintIntro, Begin). ADAPT: text comes from t(); the toggle calls setLang.
// TODO(S3): Continue restores the save; TODO(S8): Begin unlocks audio.
import { $, applyDom } from './dom.ts';
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

export function showIntro(hasPark: boolean, onBegin: () => void, onContinue: () => void): void {
  const intro = $('intro');
  intro.classList.remove('gone');
  intro.style.display = '';
  $('bContinue').hidden = !hasPark;
  applyDom();
  paint();
  onLang(() => {
    applyDom();
    paint();
  });
  document.querySelectorAll<HTMLButtonElement>('#lang button').forEach((b) => {
    b.addEventListener('click', () => setLang((b.dataset.l as Lang) || 'en'));
  });
  $('begin').addEventListener('click', () => {
    hideIntro();
    onBegin();
  });
  $('bContinue').addEventListener('click', () => {
    hideIntro();
    onContinue();
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
