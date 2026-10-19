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
// S5: the romance lines (pair formed, each stage, Happily, renewed vows, Parted, leaving together or alone, an alumni return, each
// embarrassment landed or backfired) from the sim events that carry a feed key, with nested `@` keys for the stage and the item (03 12
// item 6), and the day tally stub; the park save keeps the list through store.ts setFeedIO (main.ts wires feedState and setFeedState);
// a tap on the line opens Events (sheets.ts, GV 12176).
// S6 (02 7.3, 12.5 item 2): the cast lines (`cast`, feed.cast.<id>; the event's ids are the effect's and then the person's, and effect ids
// are a counter of their own, so only the person goes into the entry), the unlock lines (`unlock`, one per ability or avatar of a row)
// and the day's real tally, "Today: Cupid n · Mischief m", from progression.ts's `step` event at each new day, which replaces S5's stub
// (a zero line on `newday`). TODO(S9): the season lines.
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
  entries = s
    .filter((e) => typeof e?.key === 'string')
    .slice(0, FEED_CAP)
    .map((e) => ({ ...e, params: { ...e.params }, ids: Array.isArray(e.ids) ? e.ids.slice() : [] }));
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

/** The params a line keeps: the names, the stage and the item (nested `@` keys stay keys, 03 12 item 6); the sim's meta goes. */
/** The middle of the park, (N - 1) / 2: the place of a line whose event has none (the unlock, the day's tally). */
const PARK_CENTRE = 23.5;
const META: ReadonlySet<string> = new Set(['feed', 'couple', 'ending', 'kind', 'source', 'landed', 'score', 'surface', 'regularId', 'toast', 'tally']);
function lineParams(p: Params | undefined): Params {
  const out: Params = {};
  if (p) for (const k of Object.keys(p)) if (!META.has(k)) out[k] = p[k] as string | number;
  return out;
}

/**
 * An event that carries a feed key in its params: the gardener's and the pigeons' lines (`step`, `peck`, S4 part B) and, since S5, a
 * pair formed, a stage completed, Happily, renewed vows, Parted, leaving together or alone (`step`), an alumni couple's return, an
 * embarrassment landed or backfired (02 12.5 item 2).
 */
function fromParams(ev: GameEvent): void {
  const key = ev.params?.feed;
  if (typeof key !== 'string' || !key.startsWith('feed.')) return;
  const ids = ev.kind === 'cast' ? (ev.ids ?? []).slice(1).filter((id) => id !== 0) : (ev.ids ?? []);
  // an event with no place (the unlock) points at the park's centre, as the day's tally does, not at the corner tile (0, 0)
  pushFeed({ key, params: lineParams(ev.params), abs: absOf(ev), x: ev.x ?? PARK_CENTRE, y: ev.y ?? PARK_CENTRE, ids });
}

/** The finished day's per-park points at each new day (02 7.3; progression.ts stepProgression): "Today: Cupid n · Mischief m". */
function fromTally(ev: GameEvent): void {
  const key = ev.params?.tally;
  if (typeof key !== 'string' || !key.startsWith('feed.')) return;
  pushFeed({ key, params: { cp: Number(ev.params?.cp ?? 0), mp: Number(ev.params?.mp ?? 0) }, abs: absOf(ev), x: PARK_CENTRE, y: PARK_CENTRE, ids: [] });
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
  for (const k of ['step', 'peck', 'formed', 'stage', 'happily', 'parted', 'embarrassed', 'backfired', 'cast', 'unlock'] as const) watch(k, fromParams);
  watch('step', fromTally);
  watch('arrive', fromArrive);
  onLang(paint);
}
