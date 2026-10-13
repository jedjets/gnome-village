// src/ui/feed.ts
// The one-line feed with the 14 s fade; the event list of 40 {key, params, abs, x, y, ids} rendered through t() at display time (03 2.9).
// Ported from GV 10700-10742 (feed, feedEv, logEv, ageFeed). Verdict: PORT. Changes: an entry is a string key and its params, never a
// sentence (03 P7), so the line and the list repaint in the other language (06 16.11: "rendered at display time"); the subject is the
// event's own ids and place (GV guessed it from the names in the text, nameIn 10709, or the stepping actor, logActor 10708); the line and
// the list dedupe a repeat of the newest entry as GV (10722, 10725: same key and params refresh its time, place and age); the lines come
// from the sim's events, read by frame listeners: a `step` or `peck` event whose params name a `feed` key (the gardener gravelling a
// worn track, staff.ts paveStarted; a gathering of pigeons, creatures.ts; events.ts has no feed kind) and a regular's `arrive`
// (feed.regular_return with the regular's name, names.ts regularDef). Every arrival of a regular is announced: the eight are the park's
// habitués from the start (02 4.5 item 2), so their first visit reads as a return as well.
// Dropped from the range: feedAll (10702, 10718: the harness's 400-line text log; the harness reads feedEntries), nameIn and logActor,
// evNote (10742: S5's Events sheet), todName (hud.ts writes the phase word), the inline HTML escaping (textContent).
// TODO(S5): a tap on the line opens Events and flies to the event (GV 12176, goToEvent 10751); the stage, embarrassment, cast, unlock,
// tally and season lines (02 12.5 item 2). The park save's `feed` (register 3.11) is store.ts's to fill from feedState().
import { START_ABS, STEPS_PER_DAY } from '../core/clock.ts';
import { watch, type GameEvent } from '../core/events.ts';
import { clamp01 } from '../core/math.ts';
import { regularDef } from '../entities/names.ts';
import { onLang, t, type Params } from './i18n.ts';

export type FeedEntry = { key: string; params: Params; abs: number; x: number; y: number; ids: number[] };

/** The list keeps the newest 40 (GV feedEv 10723); the line fades over 14 s (GV ageFeed 10737: opacity 1.3 - age / 14). */
export const FEED_CAP = 40;
export const FEED_FADE_S = 14;

let entries: FeedEntry[] = []; // newest first
let line: { e: FeedEntry; age: number } | null = null;

function sameParams(a: Params, b: Params): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

/** Write the line's text and opacity into #feed (one `.ev` row, GV v9.15 "one slim line"); a dead line takes `.on` off. */
function paint(): void {
  const el = typeof document === 'undefined' ? null : document.getElementById('feed');
  if (!el) return;
  if (!line) {
    el.replaceChildren();
    el.classList.remove('on');
    return;
  }
  let row = el.firstElementChild as HTMLElement | null;
  if (!row) {
    row = document.createElement('div');
    row.className = 'ev';
    el.append(row);
  }
  row.textContent = t(line.e.key, line.e.params);
  row.style.opacity = String(Math.round(clamp01(1.3 - line.age / FEED_FADE_S) * 100) / 100);
  el.classList.toggle('on', line.age < FEED_FADE_S);
}

/** Add an entry (GV logEv 10717): a repeat of the newest refreshes it; the line shows it from full opacity. */
export function pushFeed(ev: FeedEntry): void {
  const e0 = entries[0];
  if (e0 && e0.key === ev.key && sameParams(e0.params, ev.params)) {
    e0.abs = ev.abs;
    e0.x = ev.x;
    e0.y = ev.y;
    e0.ids = ev.ids.slice();
  } else {
    entries.unshift({ ...ev, params: { ...ev.params }, ids: ev.ids.slice() });
    if (entries.length > FEED_CAP) entries.length = FEED_CAP;
  }
  line = { e: entries[0] as FeedEntry, age: 0 };
  paint();
}

/** Every frame with real seconds (hud.ts, GV updateHUD 10842): the line fades out over 14 s (its opacity only; the text stays). */
export function ageFeed(dtr: number): void {
  if (!line || line.age >= FEED_FADE_S) return;
  line.age += dtr;
  const el = typeof document === 'undefined' ? null : document.getElementById('feed');
  const row = el?.firstElementChild as HTMLElement | null | undefined;
  if (!el || !row) return;
  const o = String(Math.round(clamp01(1.3 - line.age / FEED_FADE_S) * 100) / 100);
  if (row.style.opacity !== o) row.style.opacity = o;
  if (line.age >= FEED_FADE_S) el.classList.remove('on');
}

/** The list, newest first (S5's Events sheet; the harness). */
export function feedEntries(): readonly FeedEntry[] {
  return entries;
}

/** A copy for the park save (register 3.11). */
export function feedState(): FeedEntry[] {
  return entries.map((e) => ({ ...e, params: { ...e.params }, ids: e.ids.slice() }));
}

/** Put a saved list back (newest first, at most 40); no line shows until the next entry. */
export function setFeedState(s: readonly FeedEntry[]): void {
  entries = s.slice(0, FEED_CAP).map((e) => ({ ...e, params: { ...e.params }, ids: e.ids.slice() }));
  line = null;
  paint();
}

/** A new park: the old park's lines go (GV newIsland 12106 cleared feedEv and feed). */
export function clearFeed(): void {
  setFeedState([]);
}

function absOf(ev: GameEvent): number {
  return START_ABS + ev.tick / STEPS_PER_DAY;
}

/** A `step` or `peck` that carries a feed key in its params (the gardener's and the pigeons' lines, S4 part B). */
function fromParams(ev: GameEvent): void {
  const key = ev.params?.feed;
  if (typeof key !== 'string' || !key.startsWith('feed.')) return;
  pushFeed({ key, params: {}, abs: absOf(ev), x: ev.x ?? 0, y: ev.y ?? 0, ids: ev.ids ?? [] });
}

/** A regular came in through a gate: "{name} is back" (06 16.11 feed.regular_return). */
function fromArrive(ev: GameEvent): void {
  const rid = ev.params?.regularId;
  if (typeof rid !== 'number' || rid === 0) return;
  const def = regularDef(rid);
  if (!def) return;
  pushFeed({ key: 'feed.regular_return', params: { name: def.name }, abs: absOf(ev), x: ev.x ?? 0, y: ev.y ?? 0, ids: ev.ids ?? [] });
}

let wired = false;
/** Register the frame listeners once (main.ts at Begin or Continue) and repaint the line on a language change. */
export function initFeed(): void {
  if (wired) return;
  wired = true;
  watch('step', fromParams);
  watch('peck', fromParams);
  watch('arrive', fromArrive);
  onLang(paint);
}
