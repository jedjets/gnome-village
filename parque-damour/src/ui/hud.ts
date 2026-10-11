// src/ui/hud.ts
// The four chips on a 0.35 s cadence, the toast ageing, the body data-day the screenshot script polls (register 3.10, 03 10).
// Ported from GV 10839-10866 (updateHUD) and 12181 (the clock chip tap). ADAPT: phase, day and season words through t().
// TODO(S2): weather dot colour; TODO(S4): the visitor count and "+"; TODO(S5): the Romance chip; TODO(S6): the Points chip; TODO(S7): body.avatar from the `mode` event.
import { T, SEASON_KEYS } from '../core/clock.ts';
import { $, ageToast, layoutOverlays } from './dom.ts';
import { t, onLang } from './i18n.ts';
import { toggleSheet } from './sheets.ts';

let hudT = 0;

function paint(): void {
  $('tPhase').textContent = t('hud.phase.' + T.phase);
  $('tDay').textContent = t('hud.day', { n: T.day, season: '@hud.season.' + SEASON_KEYS[T.season] });
  $('tPop').textContent = t('hud.visitors', { n: 0 });
  $('tRom').textContent = t('hud.romance.none');
  $('tCP').textContent = '0';
  $('tMP').textContent = '0';
  document.body.dataset.day = String(T.day);
}

export function initHud(): void {
  $('hudClock').addEventListener('click', () => toggleSheet('evlog'));
  $('hudVisitors').addEventListener('click', () => toggleSheet('census'));
  $('hudRomance').addEventListener('click', () => toggleSheet('romances'));
  $('hudPoints').addEventListener('click', () => toggleSheet('progress'));
  ($('bAdd') as HTMLButtonElement).disabled = true; // TODO(S4): visitor.call; a sibling of #hudVisitors, so no bubbling to the census
  onLang(paint);
  paint();
  layoutOverlays();
}

/** Every frame with real seconds; the chips repaint every 0.35 s (GV 10846). */
export function updateHud(dtr: number): void {
  ageToast(dtr);
  hudT -= dtr;
  if (hudT > 0) return;
  hudT = 0.35;
  paint();
  layoutOverlays();
}
