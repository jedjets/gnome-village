// src/ui/card.ts
// The single card, the pair card, the avatar strip; selection and follow (register 3.10, 02 12.3, 04 5.5).
// Ported from GV 10809-10838 (relText, updateCard), 10867-10874 (selectGnome, clearSel). Verdict: ADAPT. Changes: the card's lines are
// keys through t() (card.sub with the archetype and age words, the relationship line, the doing line `doing.<st>`, 06 16.8, 16.9) where
// GV built English sentences; the bars are Mood (comfort), Rested (energy) and Full (1 - hunger), each in its token and `--ember` below its
// low mark (04 5.5 item 1: 0.3, 0.25, 0.3), where GV had Full, Rested and Warm with its own colours (10826-10829); the selection is a
// pickAt Hit (03 8.2) holding a visitor's id, never the record (03 P5); select zooms in to at least 1.8 (GV 10869 set 1.8 below 1.7)
// about the figure, so it stays under the finger while the follow eases it into the clear band (camera.ts followStep); any other hit
// clears the selection and the follow (03 8.2 item 4; GV tapSelect 11249). The card hides under body.sheet (shell.css, GV 226).
// Dropped from the range: GV's craft, chief, hamlet and age-in-days sub line, the swimming, climbing, riding and carrying suffixes of the
// doing line, the critter card (selectCrit 10875: Parque has no creature card), the "Following" toast.
// TODO(S5): the Heart bar with the next gate's tick, "courting B · stage" and the pair card with Pin (02 12.3 items 2, 3); TODO(S7):
// the avatar strip with " · you" and its doing lines (02 12.3 item 4).
import { clamp01 } from '../core/math.ts';
import { byId, type Visitor } from '../entities/visitor.ts';
import { cam, clampCam, follow } from '../render/camera.ts';
import { screenInto, type Hit } from '../render/project.ts';
import { SEAT_E } from '../render/people.ts';
import { propById } from '../world/grid.ts';
import { $, layoutOverlays } from './dom.ts';
import { gender, t } from './i18n.ts';

/** select zooms in to at least this (GV selectGnome 10869: "near enough to see what they do"). */
export const ZOOM_SELECT = 1.8;
/** The bars' low marks: below these a bar turns --ember (04 5.5 item 1). */
export const LOW_MOOD = 0.3;
export const LOW_RESTED = 0.25;
export const LOW_FULL = 0.3;

const NONE: Hit = { kind: 'none', id: 0, tile: null };
let sel: Hit = NONE;

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
  zoomOn(v);
  follow({ kind: 'visitor', id: v.id });
  $('card').classList.add('on');
  updateCard();
  layoutOverlays();
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
  // TODO(S5): "courting B · stage" (card.rel.courting) for a member of a Pair, "married here" (card.rel.alumni)
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

function bar(need: 'mood' | 'rest' | 'full', value: number, low: boolean): void {
  const b = document.querySelector<HTMLElement>(`#cBars .bar[data-need="${need}"]`);
  const u = b?.querySelector<HTMLElement>('u');
  if (!b || !u) return;
  u.style.width = Math.round(clamp01(value) * 100) + '%';
  b.classList.toggle('low', low);
}

/** Fill the card from the selected visitor (GV updateCard 10818, every 0.35 s from hud.ts); one who has left clears the selection. */
export function updateCard(): void {
  if (sel.kind !== 'visitor') return;
  const v = byId(sel.id);
  if (!v) {
    clearSel();
    return;
  }
  $('cName').textContent = v.name;
  $('cSub').textContent = t('card.sub', { archetype: '@archetype.' + v.archetype, age: '@age.' + v.ageWord });
  const rel = relText(v), r = $('cRel');
  r.textContent = rel;
  r.hidden = !rel;
  bar('mood', v.comfort, v.comfort < LOW_MOOD);
  bar('rest', v.energy, v.energy < LOW_RESTED);
  bar('full', 1 - v.hunger, 1 - v.hunger < LOW_FULL);
  $('cDo').textContent = t('doing.' + v.st);
}
