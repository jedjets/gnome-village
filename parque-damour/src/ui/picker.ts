// src/ui/picker.ts
// The Avatar picker (02 10.1 item 1, 12.4; 04 5.6; 07 S7.6 step 7): the sheet "Be someone" opens, six cards in a 2 x 3 grid in the order of
// AVATARS. A card is a button with a 3 px side stripe (--berry Cupid, --ember Mischief), a 40 x 40 drawn portrait, the avatar's name,
// "Cupid · T3" and its lock state: a locked one (its tier not reached) is dimmed and shows the lock glyph with "Locked · Cupid T1", a tap
// toasts "Unlocks at Cupid T1" (as a locked pill does) and sends nothing; the three S10 avatars (a_mime, a_busker, a_matchmaker) are dimmed
// "Coming soon" whatever their tier, a tap says so; an unlocked playable one sends the logged `avatar.enter` command on its own side
// (03 5.1; the sim applies it at the next step, the shell hears the `mode` event, hud.ts).
// NEW (GV had no picker). The portraits are Claude's pick on the owner's delegation ("make your own judgement calls on style", 2026-10-20;
// register section 4 row "Avatar picker and player ring"): drawn on the card's own canvas, once per paint, with the primitives of the picked
// style (palette A, the Tailored rig): the pigeon in its walking pose (render/creatures.ts drawPigeonState), Pompon at rest (drawPompon), the
// flower seller of the S6 cameo with her basket and her bouquet (the rig's `florist` archetype through figure-look.ts lookOf, at zoom 1.9, a
// little under 04 5.6's 2.2 so her sunhat and her feet both fit the 40 px) and, for the three avatars S10 builds, a plain bust in `zinc` with the one mark that names each (the mime's beret and stripes, the
// busker's flat cap and accordion, the matchmaker's beret, ponytail and baguette). They are drawn in full daylight (computeAmbientAt) and the
// day's light is put back at once, so a night sky never dims a card (the next frame's computeAmbient would do it anyway).
import { AVATAR_SIDE, enqueue } from '../core/commands.ts';
import type { Visitor } from '../entities/visitor.ts';
import { AVATARS, type AvatarDef } from '../play/avatar.ts';
import type { AvatarId } from '../play/mode.ts';
import { isUnlocked } from '../play/progression.ts';
import { computeAmbient, computeAmbientAt, style } from '../render/ambient.ts';
import { view } from '../render/camera.ts';
import { drawPigeonState, drawPompon } from '../render/creatures.ts';
import { lookOf, newLook } from '../render/figure-look.ts';
import { opts, P2, type Ink } from '../render/figure-rig.ts';
import { drawVisitor } from '../render/figures.ts';
import { toast } from './dom.ts';
import { lang, t } from './i18n.ts';

/** The portrait's side in CSS px (04 5.6: 40 x 40) and the rig's zoom on it (04 5.6 says 2.2; 1.9 keeps the whole figure, hat to shoes, in the square). */
export const PORTRAIT_PX = 40;
export const PORTRAIT_Z = 1.9;
/** The flower seller's lookSeed in her portrait: one fixed person (her bun, her skin and her green apron do not change with the park). */
const FLORIST_SEED = 4242;

/** The ink the primitives draw with on the portrait's canvas: the style's pen at the portrait zoom, no lamp warmth. */
function inkOn(g: CanvasRenderingContext2D): Ink {
  return { pen: { ctx: g, spec: style(), z: PORTRAIT_Z }, warm: 0 };
}

/** The pigeon at rest, the picked walking pose (the bob frozen at 0.15, as the park's idle pigeon). */
function pigeon(g: CanvasRenderingContext2D): void {
  drawPigeonState(inkOn(g), P2(21, 30), 1, 'walk', 0.15, 17);
}

/** Pompon standing, no dust and nothing in his mouth. */
function pomeranian(g: CanvasRenderingContext2D): void {
  const P = style().palette;
  drawPompon(inkOn(g), P2(20, 33), 1, false, 0, null, P.crowdHat[2] as string, 18);
}

/** The flower seller: the cameo's look (a straw sunhat, a bun, the green apron, the basket on her arm, the bouquet in her hand) standing at 2.2. */
function florist(g: CanvasRenderingContext2D): void {
  const v = {
    id: 0, lookSeed: FLORIST_SEED, sex: 'f', archetype: 'cameo', ageWord: 'grown', pairId: 0, coupleOf: 0,
    items: { hat: false, purse: false, baguette: false, iceCream: false },
  } as unknown as Visitor;
  const look = lookOf(v, style().palette, 1, newLook());
  drawVisitor(inkOn(g), P2(PORTRAIT_PX / 2, 43), look, opts({ face: 1, state: 'idle' }));
}

/** A bust in `zinc`: the head and the shoulders, which each S10 avatar's mark is drawn on. */
function bust(g: CanvasRenderingContext2D): void {
  const P = style().palette;
  g.fillStyle = P.zinc;
  g.beginPath();
  g.arc(20, 17, 7, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(5, 41);
  g.quadraticCurveTo(5, 28, 20, 28);
  g.quadraticCurveTo(35, 28, 35, 41);
  g.closePath();
  g.fill();
}

/** A hat or a mark on the bust: `fill` colour, drawn as an ellipse of radii (rx, ry) at (x, y) turned by `rot`. */
function oval(g: CanvasRenderingContext2D, fill: string, x: number, y: number, rx: number, ry: number, rot = 0): void {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  g.fill();
}

/** The mime: a beret tipped on the head and two stripes across the chest, in the paper of the card. */
function mime(g: CanvasRenderingContext2D): void {
  const P = style().palette;
  bust(g);
  g.save();
  g.beginPath();
  g.moveTo(5, 41);
  g.quadraticCurveTo(5, 28, 20, 28);
  g.quadraticCurveTo(35, 28, 35, 41);
  g.closePath();
  g.clip();
  g.fillStyle = P.paper;
  g.fillRect(0, 32, 40, 1.8);
  g.fillRect(0, 36.5, 40, 1.8);
  g.restore();
  oval(g, P.ink, 21.5, 10.5, 9, 3.8, -0.18);
  oval(g, P.ink, 24.5, 6.6, 1.6, 1.6);
}

/** The busker: a flat cap with its peak and an accordion held across the chest, folds in paper. */
function busker(g: CanvasRenderingContext2D): void {
  const P = style().palette;
  bust(g);
  g.fillStyle = P.ink;
  g.beginPath();
  g.ellipse(20, 12.5, 8, 5, 0, Math.PI, 0);
  g.fill();
  g.fillRect(19, 12, 12, 2.2);
  g.fillStyle = P.ink;
  g.beginPath();
  g.roundRect(8, 30, 24, 10, 2.5);
  g.fill();
  g.strokeStyle = P.paper;
  g.lineWidth = 1.2;
  for (let x = 13; x <= 27; x += 4.6) {
    g.beginPath();
    g.moveTo(x, 31.5);
    g.lineTo(x, 38.5);
    g.stroke();
  }
}

/** The matchmaker: a beret, a ponytail with its ribbon and a baguette carried across, slashes in paper. */
function matchmaker(g: CanvasRenderingContext2D): void {
  const P = style().palette;
  oval(g, P.zinc, 30.5, 21, 3, 6.5, 0.5);
  bust(g);
  oval(g, P.ink, 20, 10.8, 9, 3.6, 0.1);
  oval(g, P.paper, 29, 17, 1.6, 1.6);
  g.strokeStyle = P.ink;
  g.lineWidth = 4.4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(9, 39);
  g.lineTo(33, 31);
  g.stroke();
  g.strokeStyle = P.paper;
  g.lineWidth = 1;
  for (const k of [0.3, 0.5, 0.7]) {
    const x = 9 + 24 * k, y = 39 - 8 * k;
    g.beginPath();
    g.moveTo(x - 0.8, y - 2.2);
    g.lineTo(x + 0.8, y + 2.2);
    g.stroke();
  }
}

const PORTRAITS: Readonly<Record<AvatarId, (g: CanvasRenderingContext2D) => void>> = {
  a_pigeon: pigeon, a_pomeranian: pomeranian, a_florist: florist, a_mime: mime, a_busker: busker, a_matchmaker: matchmaker,
};

/** Draw avatar `id`'s portrait on `cv` (40 x 40 CSS px at the screen's pixel ratio); nothing when the canvas has no 2d context. */
export function drawPortrait(cv: HTMLCanvasElement, id: AvatarId): void {
  const g = cv.getContext('2d');
  if (!g) return;
  const d = view.dpr || 1;
  cv.width = Math.round(PORTRAIT_PX * d);
  cv.height = Math.round(PORTRAIT_PX * d);
  g.setTransform(d, 0, 0, d, 0, 0);
  g.clearRect(0, 0, PORTRAIT_PX, PORTRAIT_PX);
  g.save();
  g.beginPath();
  g.rect(0, 0, PORTRAIT_PX, PORTRAIT_PX);
  g.clip();
  PORTRAITS[id](g);
  g.restore();
}

/* ---------- the sheet ---------- */

/** The padlock of a locked card: an inline SVG in currentColor (04 12 item 12), 11 px. */
const LOCK =
  '<svg viewBox="0 0 11 11" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="2" y="5" width="7" height="5" rx="1.2"/><path d="M3.6 5 V3.6 A1.9 1.9 0 0 1 7.4 3.6 V5"/></svg>';

function line(tag: 'b' | 'small', text: string, cls = ''): HTMLElement {
  const e = document.createElement(tag);
  e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

/** One card: the portrait, the name, "Mischief · T1", and the lock or "Coming soon" line. */
function card(d: AvatarDef): HTMLButtonElement {
  const open = isUnlocked(d.id), soon = !d.playable, locked = !open && !soon;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pk' + (soon ? ' soon' : locked ? ' locked' : '');
  b.dataset.id = d.id;
  b.dataset.side = d.side;
  b.setAttribute('aria-disabled', open && d.playable ? 'false' : 'true');
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  drawPortrait(cv, d.id);
  const tx = document.createElement('span');
  tx.className = 'tx';
  const side = '@rail.' + d.side;
  tx.append(line('b', t('avatar.' + d.id + '.name')));
  if (locked) {
    // the lock glyph and "Locked · Mischief T1" say the side and the tier, so the "Mischief · T1" line is not repeated
    tx.append(line('small', t('sheet.picker.locked', { side, tier: d.tier }), 'st'));
    b.insertAdjacentHTML('beforeend', LOCK); // the glyph sits in the card's top right corner (CSS), so the words keep their whole line
  } else {
    tx.append(line('small', t('avatar.side_tier', { side, tier: d.tier })));
    if (soon) tx.append(line('small', t('rail.soon'), 'st'));
  }
  b.append(cv, tx);
  return b;
}

let painted = '';

/** Everything the sheet shows, so the frame call repaints only on a change: the language, the pixel ratio, and which tiers are reached. */
export function pickerKey(): string {
  return [lang(), view.dpr, ...AVATARS.map((a) => (isUnlocked(a.id) ? 1 : 0))].join('|');
}
export function pickerPainted(): string {
  return painted;
}

/** Paint the six cards (in full daylight) and the summary line. */
export function renderPicker(): void {
  const list = document.getElementById('pickerList'), sum = document.getElementById('pickerSum');
  if (!list || !sum) return;
  painted = pickerKey();
  sum.textContent = t('sheet.picker.sum');
  computeAmbientAt(0.5, 1); // the portraits in daylight, whatever the hour
  const cards = AVATARS.map(card);
  computeAmbient(); // the park's own light again
  list.replaceChildren(...cards);
}

/**
 * A tap on a card: an unlocked, playable avatar sends `avatar.enter` and returns true (the sheet closes); a locked one toasts its tier, an
 * S10 one "Coming soon", and both return false. The command applies at the next step (a paused park applies it on the unpause, 03 4.6).
 */
export function chooseAvatar(id: string): boolean {
  const d = AVATARS.find((a) => a.id === id);
  if (!d) return false;
  if (!d.playable) {
    toast('rail.soon');
    return false;
  }
  if (!isUnlocked(d.id)) {
    toast('rail.locked_at', { side: '@rail.' + d.side, tier: d.tier });
    return false;
  }
  enqueue({ side: AVATAR_SIDE[d.id], kind: 'avatar.enter', payload: { avatar: d.id } });
  return true;
}
