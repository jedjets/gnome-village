// src/ui/card.ts
// The single card, the pair card, the avatar strip; selection and follow (register 3.10, 02 12.3, 04 5.5).
// Ported from GV 10809-10838 (relText, updateCard), 10867-10874 (selectGnome, clearSel). Verdict: ADAPT. Changes: the card's lines are
// keys through t() (card.sub with the archetype and age words, the relationship line, the doing line `doing.<st>`, 06 16.8, 16.9) where
// GV built English sentences; the bars are Mood (comfort), Rested (energy) and Full (1 - hunger), each in its token and `--ember` below its
// low mark (04 5.5 item 1: 0.3, 0.25, 0.3), where GV had Full, Rested and Warm with its own colours (10826-10829); the selection is a
// pickAt Hit (03 8.2) holding a visitor's id, never the record (03 P5); select zooms in to at least 1.8 (GV 10869 set 1.8 below 1.7)
// about the figure, so it stays under the finger while the follow eases it into the clear band (camera.ts followStep); any other hit
// clears the selection and the follow (03 8.2 item 4; GV tapSelect 11249). The card hides under body.sheet (shell.css, GV 226).
// Arming any tool but the hand ends the selection (GV setTool 11070; 07 S3.6 step 7): rail.ts's setTool ends the follow, and initCard
// listens on the Park strip for the rest, since rail.ts may not import this module (rail -> sheets -> card) and is S3's file.
// Dropped from the range: GV's craft, chief, hamlet and age-in-days sub line, the swimming, climbing, riding and carrying suffixes of the
// doing line, the critter card (selectCrit 10875: Parque has no creature card), the "Following" toast.
// S5 (02 12.3 items 2-3; 04 5.5 items 1-2): a member of a Pair is shown on the pair card first: both names (each a button to that
// person's single card) with the heart glyph between them in --berry, the stage chip "Bench · 3 of 7", the shared Heart bar full width
// with a 1 px ink tick at the next stage's gate, both doing lines (once when they read the same), and the Pin toggle (the featured pair, romance.ts setPin: UI state per
// client, 02 14.3). The single card of a paired member adds the Heart bar with the same tick and the relationship line "courting B ·
// Stage" ("with B" for a couple, "married here" for an alumni couple), which switches back to the pair card when tapped.
// TODO(S7): the avatar strip with " · you" and its doing lines (02 12.3 item 4).
import { clamp01 } from '../core/math.ts';
import { byId, type Visitor } from '../entities/visitor.ts';
import { cam, clampCam, follow } from '../render/camera.ts';
import { screenInto, type Hit } from '../render/project.ts';
import { SEAT_E } from '../render/people.ts';
import { propById } from '../world/grid.ts';
import { $, layoutOverlays } from './dom.ts';
import { gender, t } from './i18n.ts';
import { pairById, pinnedPair, setPin, shownStage, STAGE_IDS, type Pair } from '../entities/romance.ts';
import { GATES } from '../entities/romance-stages.ts';

/** select zooms in to at least this (GV selectGnome 10869: "near enough to see what they do"). */
export const ZOOM_SELECT = 1.8;
/** The bars' low marks: below these a bar turns --ember (04 5.5 item 1). */
export const LOW_MOOD = 0.3;
export const LOW_RESTED = 0.25;
export const LOW_FULL = 0.3;

const NONE: Hit = { kind: 'none', id: 0, tile: null };
let sel: Hit = NONE;
/** The pair card shows for a paired member until a name on it is tapped (02 12.3 item 3); a new selection starts on it. */
let pairView = true;

/** What is selected: a visitor's Hit, or none. */
export function selected(): Hit {
  return sel;
}
/** The selected visitor's id, 0 for none (draw.ts's ring, the census's highlighted row). */
export function selectedVisitor(): number {
  return sel.kind === 'visitor' ? sel.id : 0;
}

const S0 = { x: 0, y: 0 }, S1 = { x: 0, y: 0 };

/** Zoom to ZOOM_SELECT about the visitor's drawn point, so it does not jump on screen (the follow then eases it into place). */
function zoomOn(v: Visitor): void {
  if (cam.z >= ZOOM_SELECT) return;
  const seat = v.sitPropId ? propById(v.sitPropId) : undefined;
  const e = seat ? (SEAT_E[seat.kind] ?? 0) : 0;
  screenInto(v.x, v.y, e, S0);
  cam.z = ZOOM_SELECT;
  screenInto(v.x, v.y, e, S1);
  cam.ox += S0.x - S1.x;
  cam.oy += S0.y - S1.y;
  clampCam();
}

/**
 * A tap with the hand (03 8.2 item 4) or a census row (02 12.4): a visitor is selected and followed, the camera zoomed in to at least
 * 1.8, the card shown (GV selectGnome 10867); anything else clears the selection and the follow (GV tapSelect 11249).
 */
export function select(hit: Hit): void {
  const v = hit.kind === 'visitor' ? byId(hit.id) : undefined;
  if (!v) {
    clearSel();
    follow(null);
    return;
  }
  sel = { kind: 'visitor', id: v.id, tile: hit.tile };
  pairView = true;
  zoomOn(v);
  follow({ kind: 'visitor', id: v.id });
  $('card').classList.add('on');
  updateCard();
  layoutOverlays();
}

/**
 * Once at boot (main.ts): a click on a Park strip pill other than the hand clears the selection (GV setTool 11070: `clearSel()` beside
 * `cam.follow = null`). The listener sits on #tools, which rail.ts refills but never replaces, and runs after the pill's own setTool.
 */
export function initCard(): void {
  $('tools').addEventListener('click', (e) => {
    const pill = e.target instanceof Element ? e.target.closest<HTMLElement>('.tool') : null;
    if (pill && pill.dataset.id !== 'hand') clearSel();
  });
  // a name on the pair card opens that person's single card; the relationship line of a paired single goes back (02 12.3 item 3)
  $('cName').addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-id]') : null;
    const id = Number(b?.dataset.id ?? 0);
    if (!id || !byId(id)) return;
    sel = { kind: 'visitor', id, tile: null };
    pairView = false;
    follow({ kind: 'visitor', id });
    updateCard();
  });
  $('cRel').addEventListener('click', () => {
    const v = byId(sel.id);
    if (!v || v.pairId === 0) return;
    pairView = true;
    updateCard();
  });
  $('cPin').addEventListener('click', () => {
    const v = byId(sel.id);
    if (!v || v.pairId === 0) return;
    setPin(pinnedPair() === v.pairId ? 0 : v.pairId);
    updateCard();
  });
}

/** Nothing selected; the card goes (GV clearSel 10874: the follow is the caller's). */
export function clearSel(): void {
  sel = NONE;
  const c = document.getElementById('card');
  if (c) c.classList.remove('on');
  layoutOverlays();
}

/** The relationship line (02 12.3 item 2; GV relText 10809), or '' for none. */
export function relText(v: Visitor): string {
  const p = pairById(v.pairId);
  if (p) {
    const o = byId(v.id === p.a ? p.b : p.a);
    if (p.alumniId) return t('card.rel.alumni');
    if (v.archetype === 'couple' && o) return t('card.rel.with', { b: o.name });
    if (o) return t('card.rel.courting', { b: o.name, stage: '@stage.' + STAGE_IDS[shownStage(p)] });
  }
  const partner = v.coupleOf ? byId(v.coupleOf) : undefined;
  if (partner) return t('card.rel.with', { b: partner.name });
  switch (v.archetype) {
    case 'single':
      return gender('card.rel.single', v.sex);
    case 'family':
      return t('card.rel.family');
    case 'child': {
      const p = v.childOf ? byId(v.childOf) : undefined;
      return p ? t('card.rel.child', { parent: p.name }) : t('card.rel.visiting');
    }
    case 'gardener':
    case 'vendor':
      return t('card.rel.staff');
    default:
      return t('card.rel.visiting');
  }
}

function bar(need: 'mood' | 'rest' | 'full' | 'heart', value: number, low: boolean, show = true): HTMLElement | null {
  const b = document.querySelector<HTMLElement>(`#cBars .bar[data-need="${need}"]`);
  const u = b?.querySelector<HTMLElement>('u');
  if (!b || !u) return null;
  b.hidden = !show;
  u.style.width = Math.round(clamp01(value) * 100) + '%';
  b.classList.toggle('low', low);
  return b;
}

/** The Heart bar with the 1 px ink tick at the next stage's gate (04 5.5 item 1); no tick after the Proposal. */
function heartBar(p: Pair | undefined): void {
  const b = bar('heart', p?.affinity ?? 0, false, !!p);
  const i = b?.querySelector<HTMLElement>('i');
  if (!b || !i) return;
  let tick = i.querySelector<HTMLElement>('b.tick');
  if (!tick) {
    tick = document.createElement('b');
    tick.className = 'tick';
    i.append(tick);
  }
  const g = p && p.stage < 7 ? (GATES[p.stage + 1] as number) : 0;
  tick.hidden = !g;
  tick.style.left = Math.round(g * 100) + '%';
}

/** The second doing line of the pair card (created once beside #cDo). */
function doing2(): HTMLElement {
  let d = document.getElementById('cDo2');
  if (!d) {
    d = document.createElement('div');
    d.id = 'cDo2';
    d.className = 'doing';
    $('cDo').after(d);
  }
  return d;
}

function nameButton(v: Visitor): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'nm';
  b.dataset.id = String(v.id);
  b.textContent = v.name;
  return b;
}

/** The pair card (02 12.3 item 3; 04 5.5 item 2). */
function pairCard(p: Pair, a: Visitor, b: Visitor): void {
  const h = $('cName'), heart = document.createElement('i');
  heart.className = 'hrt';
  heart.textContent = '\u2665';
  heart.setAttribute('aria-hidden', 'true');
  h.replaceChildren(nameButton(a), heart, nameButton(b));
  h.setAttribute('aria-label', t('card.pair.title', { a: a.name, b: b.name }));
  const k = shownStage(p);
  $('cSub').textContent = t('card.pair.stage', { stage: '@stage.' + STAGE_IDS[k], n: k });
  $('cSub').classList.add('chipline');
  $('cRel').hidden = true;
  for (const n of ['mood', 'rest', 'full'] as const) bar(n, 0, false, false);
  heartBar(p);
  $('cDo').textContent = t('doing.' + a.st);
  const d2 = doing2(), second = t('doing.' + b.st);
  d2.hidden = second === $('cDo').textContent; // both in one state (sitting together): the line once (S6, the s5 pair-card shot showed it twice)
  d2.textContent = second;
  const pin = $('cPin'), on = pinnedPair() === p.id;
  pin.hidden = false;
  pin.className = 'pin gb';
  pin.textContent = t(on ? 'card.unpin' : 'card.pin');
  pin.setAttribute('aria-pressed', on ? 'true' : 'false');
  $('card').classList.add('pair');
}

/** Fill the card from the selected visitor (GV updateCard 10818, every 0.35 s from hud.ts); one who has left clears the selection. */
export function updateCard(): void {
  if (sel.kind !== 'visitor') return;
  const v = byId(sel.id);
  if (!v) {
    clearSel();
    return;
  }
  const p = pairById(v.pairId), a = p ? byId(p.a) : undefined, b = p ? byId(p.b) : undefined;
  if (p && a && b && pairView) {
    pairCard(p, a, b);
    return;
  }
  $('card').classList.remove('pair');
  $('cSub').classList.remove('chipline');
  $('cName').textContent = v.name;
  $('cName').removeAttribute('aria-label');
  $('cSub').textContent = t('card.sub', { archetype: '@archetype.' + v.archetype, age: '@age.' + v.ageWord });
  const rel = relText(v), r = $('cRel');
  r.textContent = rel;
  r.hidden = !rel;
  r.classList.toggle('link', !!p);
  bar('mood', v.comfort, v.comfort < LOW_MOOD);
  bar('rest', v.energy, v.energy < LOW_RESTED);
  bar('full', 1 - v.hunger, 1 - v.hunger < LOW_FULL);
  heartBar(p); // the Heart bar for a paired single (02 12.3 item 2)
  $('cDo').textContent = t('doing.' + v.st);
  const d2 = document.getElementById('cDo2');
  if (d2) d2.hidden = true;
  $('cPin').hidden = true;
}
