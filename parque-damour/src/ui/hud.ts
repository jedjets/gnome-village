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
// S6 (07 S6.6 step 8; 02 7.4, 12.2; 04 5.2 item 6): the Points chip shows the profile's Cupid and Mischief Points (progression.points) and
// flashes the number that gained to --ink for FLASH_MS (shell.css `.flash`); an `unlock` event toasts "Unlocked: Musician (Cupid T1)"
// through t() once per tier crossed (the first item of the row: the feed line, feed.ts, names each one); a refusal that needs a number
// (the seconds of a cooldown, the tier of a locked ability) gets it from ability-strip.refusalParams, since `rejected` carries none.
// S7 (07 S7.6 steps 6-7; 02 10.1, 03 8.2 item 1; 04 5.4 item 6): body.avatar follows the sim's `mode` event (applyMode; boot calls it too, so a
// Continue that restored the avatar mode shows it): the class, the rail's hint chips, button and disarming (rail.syncMode), the strip, the zoom to
// 1.5 and the follow (card.syncAvatar); entering toasts "Playing as Pigeon. Tap someone: swoop" for 6 s (GV 11259, TOAST_LONG_S), leaving
// `avatar.goes_on`. The `avatarStatus` event of a tap is toasted "Pigeon: swooping" (`avatar.says`), `walking` and `flying` silent (GV 11276-11277;
// 02 10.1 item 6); a refused `avatar.tap` is "Pigeon: busy" (`avatar.busy`, the hold check) or "Pigeon: <the reason>" (what GV's `msg` was), with the
// florist's cooldown seconds and a victim's name filled in from what the shell last tapped (noteAvatarTap, which main.ts calls). An avatar
// command refused as `reason.wrong_mode` (the mode already as asked, e.g. a tap queued behind Creator while paused) toasts nothing.
import { T, SEASON_KEYS } from '../core/clock.ts';
import { enqueue } from '../core/commands.ts';
import { watch, type GameEvent } from '../core/events.ts';
import { W } from '../core/weather.ts';
import { byId, people } from '../entities/visitor.ts';
import { STAGE_IDS, featured, shownStage } from '../entities/romance.ts';
import { cooldownLeft } from '../play/abilities.ts';
import { getAvatar, getMode } from '../play/mode.ts';
import { points } from '../play/progression.ts';
import type { Hit } from '../render/project.ts';
import { WCOLD } from '../render/ambient.ts';
import { $, TOAST_LONG_S, ageToast, layoutOverlays, setBodyClass, toast } from './dom.ts';
import { plural, t, onLang, type Params } from './i18n.ts';
import { renderCensus, sheetOpen, toggleSheet, updateSheets } from './sheets.ts';
import { actorName, syncAvatar, updateCard } from './card.ts';
import { syncMode } from './rail.ts';
import { ageFeed } from './feed.ts';
import { refusalParams } from './ability-strip.ts';

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
  pointsChip();
  document.body.dataset.day = String(T.day);
}

/** The Points chip's flash lasts this long (04 5.2 item 6). */
export const FLASH_MS = 300;
/** The points the chip last showed (-1: none yet, so a Continue with points flashes nothing), and the flash timers. */
const shownPts = { cp: -1, mp: -1 };
const flashT = { cp: 0, mp: 0 };

/** Cupid n | Mischief m (02 12.2): the number that gained flashes to --ink. */
function pointsChip(): void {
  const p = points();
  for (const k of ['cp', 'mp'] as const) {
    const el = $(k === 'cp' ? 'tCP' : 'tMP');
    el.textContent = String(p[k]);
    if (shownPts[k] >= 0 && p[k] > shownPts[k]) {
      el.classList.add('flash');
      window.clearTimeout(flashT[k]);
      flashT[k] = window.setTimeout(() => el.classList.remove('flash'), FLASH_MS);
    }
    shownPts[k] = p[k];
  }
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

/* ---------- the avatar mode (02 10.1; 03 10.2) ---------- */

/** What the shell last tapped for the avatar (its hit), to give a refusal's words the person and the cooldown they are about. */
let lastHit: Hit | null = null;
export function noteAvatarTap(hit: Hit | null): void {
  lastHit = hit;
}

/**
 * Bring the shell in line with the sim's mode (the `mode` event, and boot): body.avatar, the rail (hint chips, the button, nothing armed), the
 * strip, the zoom and the follow; then the event's toast: the 6 s intro on entering, `avatar.goes_on` on leaving (a New carries none).
 */
export function applyMode(ev: GameEvent | null = null): void {
  const on = getMode() === 'avatar' && getAvatar() !== null;
  setBodyClass('avatar', on);
  syncMode();
  syncAvatar();
  const p = ev?.params;
  if (!p) return;
  if (p.mode === 'avatar') {
    if (on) toast('avatar.intro', { name: String(p.name ?? ''), hint: String(p.hint ?? '') }, TOAST_LONG_S);
  } else if (typeof p.toast === 'string') toast(p.toast, { name: String(p.name ?? '') });
}

/** The words a refusal of an `avatar.tap` needs: the seconds the florist waits (the bouquet's or the petals' cooldown), the victim's name. */
function refusalWords(r: string): Params | undefined {
  if (r === 'reason.cooldown') return { s: Math.max(1, Math.ceil(cooldownLeft('cupid', lastHit?.kind === 'visitor' ? 'c_bouquet' : 'c_petals') - 1e-9)) };
  if (r === 'reason.enough_today') {
    const v = lastHit?.kind === 'visitor' ? byId(lastHit.id) : undefined;
    return v ? { name: v.name } : undefined;
  }
  return undefined;
}

/** A refused tap of the avatar: busy is "Pigeon: busy", any other reason "Pigeon: not the children" (GV toasted every message after the name). */
function avatarRefused(r: string): void {
  const name = actorName();
  if (r === 'reason.busy') toast('avatar.busy', { name });
  else toast('avatar.says', { name, what: t(r, refusalWords(r)) });
}

/** The frame listeners for the command results (03 5.4); registered once. */
let watching = false;
function watchResults(): void {
  if (watching) return;
  watching = true;
  watch('rejected', (ev) => {
    const r = ev.params?.reason;
    if (typeof r !== 'string' || !r.startsWith('reason.')) return;
    const kind = String(ev.params?.kind ?? '');
    // an avatar command that finds the mode already as asked (a second Be someone or Creator or tap queued behind the first while the park is
    // paused, 03 4.6) says nothing: the `mode` event has already toasted the answer, and "not in this mode" would replace it
    if (r === 'reason.wrong_mode' && kind.startsWith('avatar.')) return;
    if (kind === 'avatar.tap') avatarRefused(r);
    else toast(r, refusalParams(r));
  });
  watch('mode', (ev) => applyMode(ev));
  watch('avatarStatus', (ev) => {
    const p = ev.params, s = String(p?.status ?? '');
    if (!p || s === 'avatar.status.walking' || s === 'avatar.status.flying') return; // silent (02 10.1 item 6)
    toast('avatar.says', { name: String(p.name ?? ''), what: String(p.what ?? '@' + s) });
  });
  // a tier reached: one toast per ladder and tier (the row's items arrive in one step; the first is named, the feed line names each)
  let lastUnlock = '';
  watch('unlock', (ev) => {
    const p = ev.params;
    if (!p) return;
    const k = [p.side, p.tier, ev.tick].join('|');
    if (k === lastUnlock) return;
    lastUnlock = k;
    toast(String(p.toast ?? 'toast.unlocked'), { item: p.item ?? '', side: p.side ?? '', tier: p.tier ?? 0 });
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
  applyMode(); // a Continue that restored the avatar mode shows it, silently
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
