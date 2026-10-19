// src/ui/progress.ts
// The Progress sheet: the two ladders with their tier ticks, the points and the next unlock of each, and the unlock table (register 3.10;
// 02 7.3-7.4, 12.4; 04 5.6; 07 S6.6 step 9). NEW (GV has no progression).
// Each ladder is "Cupid Points" (or Mischief) with "n points · Tk" at the right, a horizontal bar on the scale 0 to TIERS[4] = 70 in
// --berry (Cupid) or --ember (Mischief) with a hairline tick at each of 8, 20, 40 and 70 and the number under it, and under it "Next:
// Umbrella at 20" (the first ability of the next row, 06 16.10) or "Everything unlocked" at T4. Below, the table of 02 7.4 as one row
// per tier and ladder: the tier, the abilities of the row (an avatar after them as "Avatar: Pigeon"), the points that open it; a row
// the ladder has not reached is in --stone. The summary line is the day's per-park tally, "Today: Cupid n · Mischief m" (feed.tally).
// Every word is a key through t(); the bars and ticks are layout, so they carry aria-hidden and the text says the same. sheets.ts opens
// the sheet and repaints it when progressKey() changes (a point gained, the language), checked from hud.ts's frame call.
import { TIERS, UNLOCKS, dayTally, nextUnlock, points, tier, type Ladder } from '../play/progression.ts';
import { lang, t } from './i18n.ts';

const LADDERS: readonly Ladder[] = ['cupid', 'mischief'];
/** The scale's end: the T4 threshold (02 7.3). */
const TOP = TIERS[4];
let painted = '';

/** Everything the sheet shows, so the frame call repaints only on a change. */
export function progressKey(): string {
  const p = points(), d = dayTally();
  return [lang(), p.cp, p.mp, d.cp, d.mp].join('|');
}
export function progressPainted(): string {
  return painted;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

const pct = (n: number): string => Math.round((Math.min(n, TOP) / TOP) * 1000) / 10 + '%';

/** One ladder: its name and points, the bar with the four tier ticks, the numbers under them, the next unlock. */
function ladder(side: Ladder, n: number): HTMLElement {
  const box = el('div', '', 'ladder ' + side);
  const head = el('div', '', 'lh');
  head.append(el('b', t('sheet.progress.' + side)), el('span', t('sheet.progress.points', { n, tier: tier(side) })));
  const bar = el('div', '', 'lbar');
  bar.setAttribute('aria-hidden', 'true');
  const track = el('i', ''), fill = el('u', '');
  fill.style.width = pct(n);
  track.append(fill);
  bar.append(track);
  const nums = el('div', '', 'ltk');
  nums.setAttribute('aria-hidden', 'true');
  for (const th of TIERS.slice(1)) {
    const tk = el('b', '', 'tk');
    tk.style.left = pct(th);
    bar.append(tk);
    const num = el('span', String(th), th === TOP ? 'end' : '');
    num.style.left = pct(th);
    nums.append(num);
  }
  const nx = nextUnlock(side);
  const next = nx ? t('sheet.progress.next', { item: '@ability.' + nx.ids[0] + '.name', n: nx.points }) : t('sheet.progress.done');
  box.append(head, bar, nums, el('small', next, 'nx'));
  return box;
}

/** The unlock table of one ladder (02 7.4): a row per tier, the ones not yet reached in --stone. */
function table(side: Ladder): HTMLElement {
  const box = el('div', '', 'utab ' + side);
  box.append(el('small', t('rail.' + side), 'uh'));
  for (const row of UNLOCKS[side]) {
    const r = el('div', '', tier(side) < row.tier ? 'urow locked' : 'urow');
    const items = el('span', '', 'its');
    for (const id of row.abilities) items.append(el('span', t('ability.' + id + '.name')));
    if (row.avatar) items.append(el('span', t('sheet.progress.avatar', { name: '@avatar.' + row.avatar + '.name' }), 'av'));
    r.append(el('b', t('rail.tier', { tier: row.tier })), items, el('small', String(TIERS[row.tier])));
    box.append(r);
  }
  return box;
}

/** Paint the sheet (sheets.ts renderSheet). */
export function renderProgress(): void {
  const list = document.getElementById('progressList'), sum = document.getElementById('progressSum');
  if (!list || !sum) return;
  painted = progressKey();
  const p = points();
  list.replaceChildren(
    ...LADDERS.map((s) => ladder(s, s === 'cupid' ? p.cp : p.mp)),
    el('h5', t('sheet.progress.unlocks'), 'ut'),
    ...LADDERS.map(table),
  );
  sum.textContent = t('feed.tally', dayTally());
}
