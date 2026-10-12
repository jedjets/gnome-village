// src/ui/hud.ts
// The four chips on a 0.35 s cadence, the toast ageing, the body data-day the screenshot script polls (register 3.10, 03 10).
// The clock chip: the weather dot, the phase word, Day N and the season; a single tap opens Events after 400 ms, a double tap under
// 380 ms calls the hook main.ts hands in (the dev perf overlay, 03 8.3).
// Ported from GV 10839-10866 (updateHUD) and 12181 (the clock chip's single and double tap). ADAPT: phase, day and season words through
// t(); the dot's colour is ambient.WCOLD by W.kind (GV WCOLD 10774, 10850), ringed in --glass-line; the tap clock reads each event's own
// timeStamp (GV read the wall clock); the hook keeps ui/ free of debug/ (03 2.1).
// TODO(S4): the visitor count and "+"; TODO(S5): the Romance chip; TODO(S6): the Points chip; TODO(S7): body.avatar from the `mode` event.
import { T, SEASON_KEYS } from '../core/clock.ts';
import { W } from '../core/weather.ts';
import { WCOLD } from '../render/ambient.ts';
import { $, ageToast, layoutOverlays } from './dom.ts';
import { t, onLang } from './i18n.ts';
import { toggleSheet } from './sheets.ts';

/** What main.ts hands the HUD: the clock chip's double tap (the perf overlay under body.dev). */
export type HudHooks = { onClockDoubleTap?: () => void };

/** A single tap waits this long for a second one; two taps closer than DOUBLE_MS are a double tap (GV 12181). */
export const SINGLE_MS = 400;
export const DOUBLE_MS = 380;

let hudT = 0;

function paint(): void {
  $('wdot').style.background = WCOLD[W.kind];
  $('tPhase').textContent = t('hud.phase.' + T.phase);
  $('tDay').textContent = t('hud.day', { n: T.day, season: '@hud.season.' + SEASON_KEYS[T.season] });
  $('tPop').textContent = t('hud.visitors', { n: 0 });
  $('tRom').textContent = t('hud.romance.none');
  $('tCP').textContent = '0';
  $('tMP').textContent = '0';
  document.body.dataset.day = String(T.day);
}

export function initHud(h: HudHooks = {}): void {
  let lastTap = -1e9, timer = 0;
  $('hudClock').addEventListener('click', (e) => {
    window.clearTimeout(timer);
    if (e.timeStamp - lastTap < DOUBLE_MS) {
      lastTap = -1e9;
      h.onClockDoubleTap?.();
      return;
    }
    lastTap = e.timeStamp;
    timer = window.setTimeout(() => toggleSheet('evlog'), SINGLE_MS);
  });
  $('hudVisitors').addEventListener('click', () => toggleSheet('census'));
  $('hudRomance').addEventListener('click', () => toggleSheet('romances'));
  $('hudPoints').addEventListener('click', () => toggleSheet('progress'));
  // a hairline ring in the glass's own line token, so the pale fair and snow dots read on the glass chip (no new colour, 04 4.5)
  $('wdot').style.boxShadow = '0 0 0 1px var(--glass-line)';
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
