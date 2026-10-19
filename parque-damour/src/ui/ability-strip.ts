// src/ui/ability-strip.ts
// The Cupid and Mischief strips of the rail, arming, row 2's cooldown chip and the target of an armed ability's tap (register 3.9,
// 02 9.1, 03 8.2 item 2 and 10.4, 04 5.4 items 2 to 4).
// NEW (GV has no abilities; the pill is GV's .tool, 11048-11061, as rail.ts builds the Park strip).
// The strip is ABILITIES (play/abilities.ts) filtered by side, in table order: an open ability is a pill with a flat swatch in the side's
// accent (--berry for Cupid, --ember for Mischief: a colour chip, no icon is drawn for it yet) and its name; a locked one is the same
// pill at opacity 0.45 with the tier badge "T2" in the swatch's place, and a tap on it toasts t('rail.locked_at', { side, tier }) and
// nothing else. The eleven abilities of S10 have no rules yet (abilities.ts answers them reason.not_here), so they stay dimmed (`.soon`)
// even once their tier is reached, and a tap says "Coming soon": S10 raises PLAYABLE_TIER to 4.
// Arming (02 9.1 item 1): a tap on an open pill arms it (aria-pressed, ink), its hint is toasted, a second tap on it disarms, and a tap
// on another pill moves the arming; it stays armed across camera moves and casts, and ends with the group switch, a Park tool or the
// avatar mode. A `park` ability (no target) fires at the tap on its pill and arms nothing. The next tap on the world is routed here by
// main.ts (03 8.2 item 2): tapAbility resolves the target by the ability's type, enqueues the logged `ability` command (side, id,
// target; the sim validates again, hard rule 2) and keeps the ability armed; an `area` ability also marks the square it covers on the
// ground (render/ghost.ts setAimMark, alpha 0.25 in the side's accent, 03 7.8 item 3).
// Row 2 (04 5.4 item 4): #cdChip, a glass chip with the armed ability's name, an SVG ring that empties over the cooldown (stroke
// --berry or --ember by CSS), the seconds left in tabular numerals (or "Ready"), and "left/max" for an ability with charges; the cooldown
// is read from play/abilities.ts in sim seconds, so it holds still while the park is paused and runs at the dial's speed. Written only
// when what it shows changes. With nothing armed the chip stays, as "Pick an ability" with no ring, so row 2 keeps its height and the
// pills do not jump when one is armed (the Park group's row 2 always holds Undo); it is hidden only while the Park strip shows.
import { enqueue, type AbilityId, type Target } from '../core/commands.ts';
import type { XY } from '../core/math.ts';
import { ABILITIES, abilityById, chargesLeft, cooldownLeft, type AbilityDef, type AbilitySide } from '../play/abilities.ts';
import { isUnlocked, tier } from '../play/progression.ts';
import { byId } from '../entities/visitor.ts';
import type { Hit } from '../render/project.ts';
import { clearAimMark, setAimMark } from '../render/ghost.ts';
import { $, layoutOverlays, toast } from './dom.ts';
import { lang, t, type Params } from './i18n.ts';

/** The highest tier whose abilities have rules (S6: tiers 0 and 1, the eight of 07 S6.6 step 3); S10 raises this to 4. */
export const PLAYABLE_TIER = 1;
/** The ring: radius 9 in a 22 x 22 box, so its length is the dash array. */
const RING_C = 2 * Math.PI * 9;
const SVG_NS = 'http://www.w3.org/2000/svg';

let armed: AbilityId | null = null;
/** The strip on screen: null while the Park strip shows. */
let shown: AbilitySide | null = null;
let builtKey = '';
let chipKey = '';

export function armedAbility(): AbilityId | null {
  return armed;
}

const playable = (d: AbilityDef): boolean => d.tier <= PLAYABLE_TIER;

/** One pill: the swatch (or the tier badge of a locked one) over the name. */
function pill(d: AbilityDef): HTMLButtonElement {
  const open = isUnlocked(d.id) && playable(d);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tool ' + d.side + (open ? '' : ' locked') + (!open && isUnlocked(d.id) ? ' soon' : '');
  b.dataset.id = d.id;
  b.setAttribute('aria-pressed', d.id === armed ? 'true' : 'false');
  if (!open) b.setAttribute('aria-disabled', 'true');
  const mark = document.createElement('span');
  if (open) mark.className = 'sw';
  else {
    mark.className = 'tier';
    mark.textContent = t('rail.tier', { tier: d.tier });
  }
  const lb = document.createElement('span');
  lb.className = 'lb';
  lb.textContent = t(d.nameKey);
  b.append(mark, lb);
  b.addEventListener('click', () => onPill(d));
  return b;
}

function stripKey(): string {
  return [tier('cupid'), tier('mischief'), lang()].join('|');
}

/** Fill `wrap` with the strip of `side` (the scroll kept when the strip is rebuilt in place). */
export function buildAbilityStrip(wrap: HTMLElement, side: AbilitySide, keepScroll = false): void {
  shown = side;
  const x = keepScroll ? wrap.scrollLeft : 0;
  wrap.replaceChildren(...ABILITIES.filter((d) => d.side === side).map(pill));
  wrap.scrollLeft = x;
  builtKey = stripKey();
  wrap.dispatchEvent(new Event('scroll')); // the edge masks
  paintChip();
}

/** The Park strip is back (or the avatar mode starts): no ability strip, nothing armed, no chip. */
export function endAbilityStrip(): void {
  shown = null;
  setArmed(null);
  paintChip();
}

/** Arm `id` (or disarm with null): the pill pressed, the aim mark and the chip follow. */
export function setArmed(id: AbilityId | null): void {
  if (armed === id) return;
  armed = id;
  document.querySelectorAll<HTMLElement>('#tools .tool.cupid, #tools .tool.mischief').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.id === id ? 'true' : 'false');
  });
  if (id === null) clearAimMark();
  paintChip();
}

function onPill(d: AbilityDef): void {
  if (!isUnlocked(d.id)) {
    toast('rail.locked_at', { side: '@rail.' + d.side, tier: d.tier });
    return;
  }
  if (!playable(d)) {
    toast('rail.soon');
    return;
  }
  if (d.target === 'park') {
    setArmed(null); // no target to wait for: it fires now (02 9.1 item 2)
    enqueue({ side: d.side, kind: 'ability', payload: { id: d.id, target: { kind: 'park' } } });
    return;
  }
  setArmed(armed === d.id ? null : d.id);
  if (armed !== null) toast(d.hintKey);
}

/* ---------- the tap on the world (03 8.2 item 2) ---------- */

/**
 * The target of a tap for an ability of `d`'s type, or null when the tap is not one. `visitor` and `pair` take the person under the tap
 * (the sim finds their Pair, and answers an unpaired one "they are not courting"); `tile` and `area` take the tile, or the person
 * standing there, so that a child under the tap is refused by the sim whatever the ability (02 9.1 item 5); `park` needs no tap.
 */
export function abilityTarget(d: AbilityDef, hit: Hit, tile: XY | null): Target | null {
  switch (d.target) {
    case 'park':
      return { kind: 'park' };
    case 'visitor':
    case 'pair':
      return hit.kind === 'visitor' ? { kind: 'visitor', id: hit.id } : null;
    case 'tile':
    case 'area':
      if (hit.kind === 'visitor') return { kind: 'visitor', id: hit.id };
      return tile ? { kind: 'tile', x: tile.x, y: tile.y } : null;
  }
}

/** The tile an `area` target is centred on (the sim rounds a visitor's position, abilities.ts resolve). */
function centreOf(target: Target): XY | null {
  if (target.kind === 'tile') return { x: Math.round(target.x), y: Math.round(target.y) };
  if (target.kind === 'visitor') {
    const v = byId(target.id);
    return v ? { x: Math.round(v.x), y: Math.round(v.y) } : null;
  }
  return null;
}

/**
 * A tap on the world with an ability armed: enqueue the `ability` command at the resolved target and keep the ability armed. A tap that
 * is no target for its type toasts the ability's hint and sends nothing. Returns false when nothing is armed.
 */
export function tapAbility(hit: Hit, tile: XY | null): boolean {
  const d = armed ? abilityById(armed) : undefined;
  if (!d) return false;
  const target = abilityTarget(d, hit, tile);
  if (!target) {
    toast(d.hintKey);
    return true;
  }
  if (d.target === 'area') {
    const c = centreOf(target);
    if (c) setAimMark(c.x, c.y, d.area, d.side);
  }
  enqueue({ side: d.side, kind: 'ability', payload: { id: d.id, target } });
  return true;
}

/** The parameters of a refusal toast the `rejected` event does not carry: the seconds left of the armed ability, or its tier (hud.ts). */
export function refusalParams(reason: string): Params | undefined {
  const d = armed ? abilityById(armed) : undefined;
  if (!d) return undefined;
  if (reason === 'reason.cooldown') return { s: Math.max(1, Math.ceil(cooldownLeft(d.side, d.id) - 1e-9)) };
  if (reason === 'reason.locked') return { side: '@rail.' + d.side, tier: d.tier };
  return undefined;
}

/* ---------- row 2: the cooldown chip (04 5.4 item 4) ---------- */

type ChipParts = { arc: SVGCircleElement; nm: HTMLElement; cd: HTMLElement; ch: HTMLElement };
const IDLE_KEY = 'idle';
let parts: ChipParts | null = null;

function ensureChip(el: HTMLElement): ChipParts {
  if (parts && parts.nm.parentElement === el) return parts;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 22 22');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const ring = (cls: string): SVGCircleElement => {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', '11');
    c.setAttribute('cy', '11');
    c.setAttribute('r', '9');
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke-width', '3');
    return c;
  };
  const arc = ring('arc');
  arc.setAttribute('stroke-dasharray', String(RING_C));
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('transform', 'rotate(-90 11 11)');
  svg.append(ring('trk'), arc);
  const nm = document.createElement('span'), cd = document.createElement('b'), ch = document.createElement('span');
  nm.className = 'nm';
  cd.className = 'cd';
  ch.className = 'ch';
  el.replaceChildren(svg, nm, cd, ch);
  parts = { arc, nm, cd, ch };
  return parts;
}

/** Row 2's chip for the armed ability, "Pick an ability" with nothing armed, hidden with the Park strip. Writes only on a change. */
export function paintChip(): void {
  const el = $('cdChip');
  const d = armed ? abilityById(armed) : undefined;
  if (!d) {
    if (shown === null) {
      if (!el.hidden) {
        el.hidden = true;
        layoutOverlays();
      }
      chipKey = '';
      return;
    }
    const key = [IDLE_KEY, shown, lang()].join('|');
    if (key === chipKey && !el.hidden) return;
    chipKey = key;
    const p = ensureChip(el);
    el.className = 'chip idle ' + shown;
    p.nm.textContent = t('rail.pick');
    p.cd.textContent = '';
    p.ch.hidden = true;
    if (el.hidden) {
      el.hidden = false;
      layoutOverlays();
    }
    return;
  }
  const left = cooldownLeft(d.side, d.id);
  const secs = Math.ceil(left - 1e-9);
  const frac = d.cooldown > 0 ? Math.min(1, left / d.cooldown) : 0;
  const uses = d.charges === null ? -1 : chargesLeft(d.side, d.id);
  const key = [d.id, secs, Math.round(frac * 200), uses, lang()].join('|');
  if (key === chipKey && !el.hidden) return;
  chipKey = key;
  const p = ensureChip(el);
  el.className = 'chip ' + d.side;
  p.arc.setAttribute('stroke-dashoffset', String(RING_C * (1 - frac)));
  p.nm.textContent = t(d.nameKey);
  p.cd.textContent = left > 0 ? t('rail.cooldown', { s: secs }) : uses === 0 ? '' : t('rail.ready');
  p.ch.textContent = uses < 0 ? '' : t('rail.charges', { left: uses, max: d.charges as number });
  p.ch.hidden = uses < 0;
  if (el.hidden) {
    el.hidden = false;
    layoutOverlays();
  }
}

/** Every frame (rail.ts updateRail): a tier reached or a language change rebuilds the strip in place, then the chip repaints. */
export function updateAbilityStrip(): void {
  if (shown !== null && stripKey() !== builtKey) buildAbilityStrip($('tools'), shown, true);
  paintChip();
}
