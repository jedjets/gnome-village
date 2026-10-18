// src/ui/hud.ts
// The four chips on a 0.35 s cadence, the toast ageing, the body data-day the screenshot script polls (register 3.10, 03 10).
// The clock chip: the weather dot, the phase word, Day N and the season; a single tap opens Events after 400 ms, a double tap under
// 380 ms calls the hook main.ts hands in (the dev perf overlay, 03 8.3).
// Ported from GV 10839-10866 (updateHUD) and 12181 (the clock chip's single and double tap). ADAPT: phase, day and season words through
// t(); the dot's colour is ambient.WCOLD by W.kind (GV WCOLD 10774, 10850), ringed in --glass-line; the tap clock reads each event's own
// timeStamp (GV read the wall clock); the hook keeps ui/ free of debug/ (03 2.1).
// S3: the shell's toasts of the command results (03 5.4: applyCommand never toasts): a `rejected` event toasts t(reason) (02 12.5 item 3,
// GV pbPlace's refusal toasts), an applied `undo` toasts toast.undone (GV undoStroke 11114).
// S4 part C: the Visitors chip shows the people in the park (cameos are not people, 03 3.11) through plural(); its "+" enqueues the
// `visitor.call` command (02 12.2; GV addVillager 12171), which a park of 30 refuses with reason.park_full and so the toast "The park is
// full"; the "+" stops the click's propagation as GV's did (it is #hudVisitors's sibling, 03 10.1, so the census chip never sees it
// either way) and repaints an open census; the frame call ages the feed line (GV 10842) and repaints an open census every 1.2 s
// (sheets.ts), and the 0.35 s repaint refreshes the card (GV 10860).
// S5: the Romance chip names the featured pair, "A & B · Stage" (romance.ts featured: the pin, else the highest stage), or "No one
// courting yet" (06 16.3), and pulses once when the featured pair's stage changes (02 12.2).
// TODO(S6): the Points chip; TODO(S7): body.avatar from the `mode` event.
import { T, SEASON_KEYS } from '../core/clock.ts';
import { enqueue } from '../core/commands.ts';
import { watch } from '../core/events.ts';
import { W } from '../core/weather.ts';
import { byId, people } from '../entities/visitor.ts';
import { STAGE_IDS, featured, shownStage } from '../entities/romance.ts';
import { WCOLD } from '../render/ambient.ts';
import { $, ageToast, layoutOverlays, toast } from './dom.ts';
import { plural, t, onLang } from './i18n.ts';
import { renderCensus, sheetOpen, toggleSheet, updateSheets } from './sheets.ts';
import { updateCard } from './card.ts';
import { ageFeed } from './feed.ts';

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
  $('tPop').textContent = plural('hud.visitors', people());
  romanceChip();
  $('tCP').textContent = '0';
  $('tMP').textContent = '0';
  document.body.dataset.day = String(T.day);
}

/** The featured pair and stage the chip last showed, for the pulse on a stage change (02 12.2). */
let shownRom = { id: 0, stage: 0 };
/** The pulse lasts this long (04 9.1 card show, 0.18 s each way). */
export const PULSE_MS = 600;
let pulseT = 0;

function romanceChip(): void {
  const p = featured(), a = p ? byId(p.a) : undefined, b = p ? byId(p.b) : undefined;
  const el = $('tRom');
  if (!p || !a || !b) {
    el.textContent = t('hud.romance.none');
    shownRom = { id: 0, stage: 0 };
    return;
  }
  const k = shownStage(p);
  el.textContent = t('hud.romance.pair', { a: a.name, b: b.name, stage: '@stage.' + STAGE_IDS[k] });
  if (shownRom.id === p.id && shownRom.stage !== k) {
    const chip = $('hudRomance');
    chip.classList.remove('pulse');
    void chip.offsetWidth; // restart the animation
    chip.classList.add('pulse');
    window.clearTimeout(pulseT);
    pulseT = window.setTimeout(() => chip.classList.remove('pulse'), PULSE_MS);
  }
  shownRom = { id: p.id, stage: k };
}

/** The frame listeners for the command results (03 5.4); registered once. */
let watching = false;
function watchResults(): void {
  if (watching) return;
  watching = true;
  watch('rejected', (ev) => {
    const r = ev.params?.reason;
    if (typeof r === 'string' && r.startsWith('reason.')) toast(r);
  });
  watch('applied', (ev) => {
    if (ev.params?.kind === 'undo') toast('toast.undone');
  });
}

export function initHud(h: HudHooks = {}): void {
  watchResults();
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
  // "+" calls a visitor now (02 12.2): the command applies on the next step (while paused, on the unpause: owner 2026-10-13)
  $('bAdd').addEventListener('click', (e) => {
    e.stopPropagation(); // GV 12171
    enqueue({ side: 'park', kind: 'visitor.call', payload: { gate: null } });
    if (sheetOpen() === 'census') renderCensus();
  });
  onLang(paint);
  paint();
  layoutOverlays();
}

/** Every frame with real seconds; the chips repaint every 0.35 s (GV 10846). */
export function updateHud(dtr: number): void {
  ageToast(dtr);
  ageFeed(dtr);
  updateSheets(dtr);
  hudT -= dtr;
  if (hudT > 0) return;
  hudT = 0.35;
  paint();
  updateCard();
  layoutOverlays();
}
