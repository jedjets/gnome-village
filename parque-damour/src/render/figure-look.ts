// src/render/figure-look.ts
// A visitor's look in the Tailored rig, from its lookSeed alone (04 7.1 rule 8): sex from the record; skin, hair, cut, lower garment, top,
// lower colour and hat colour picked by lookSeed exactly as the crowd palette page does (scratch/s4-crowd-options.ts seeded() and dressed():
// pick(seed, k, n) = hash(seed, k) mod n with k 2 skin, 3 hair, 4 cut, 5 lower, 6 top, 7 lower colour, 9 hat colour) from the crowd palette
// A Parisian chic (register section 4, Crowd palette, 2026-10-13; ambient.ts crowd*); the archetype signifiers of 04 7.2 (hats, the child's
// balloon or ice cream, the couple's matching scarf); and the two rules of the pick: a single never wears a top within SIG_NEAR (CIEDE2000)
// of its own signature colour (ALLOWED_TOPS, precomputed per signature, re-rolled from lookSeed, no colour maths per frame), and a couple's
// scarf takes one of the two crowd hues by the lead member's lookSeed, never the colour of either member's top, and keeps it (and its top)
// after the lead has left (PAIRS). Never a Breton under a beret (the matchmaker's and the mime's look, 04 7.4). The page's wardrobe()
// spread its 24 tops evenly for the owner; in the game lookSeed alone picks, as the page says.
// NEW (S4 rig stage): no GV range; GV coloured gnomes by village (hatFor, GV 4284), which Parque does not have.
import { CROWD_BRETON, type Palette } from './ambient.ts';
import type { Arche, HairStyle, Hat, Item, Lower, RigLook } from './figure-rig.ts';
import { byId, signatureOf, type Archetype, type Visitor } from '../entities/visitor.ts';
import { watch } from '../core/events.ts';

/** The crowd page's hash (scratch/s4-crowd-options.ts): a 32-bit mix of a lookSeed and a slot number k. */
export function hash(n: number, k: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 0x27d4eb2f, 0xc2b2ae35);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  return (x ^ (x >>> 15)) >>> 0;
}
export const pick = (seed: number, k: number, n: number): number => hash(seed, k) % n;

/** Below this CIEDE2000 distance a top counts as close to a signature colour (assumption: the documents give no number; 04 7.3). */
export const SIG_NEAR = 20;
/**
 * The tops (indices into crowdTop) a single of each signature (indices into signature) may wear: every top at least SIG_NEAR from it.
 * Precomputed from the palette A hexes (tests/rig.test.ts recomputes the distances): mustard drops camel and trench, pink and lavender
 * the grey marl, orange camel and trench, dusk navy, black and burgundy; red, blue and green keep all ten.
 */
export const ALLOWED_TOPS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [0, 2, 3, 4, 5, 6, 7, 9],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [0, 1, 2, 3, 4, 5, 7, 8, 9],
  [0, 1, 2, 3, 4, 5, 7, 8, 9],
  [0, 2, 3, 4, 5, 6, 7, 9],
  [1, 2, 5, 6, 7, 8, 9],
];

const ARCHE: Readonly<Record<Archetype, Arche>> = {
  single: 'single', couple: 'couple', family: 'parent', child: 'child', elder: 'elder', tourist: 'tourist', jogger: 'jogger',
  artist: 'artist', busker: 'busker', dogwalker: 'walker', gardener: 'gardener', vendor: 'vendor', cameo: 'plain',
};
const CUTS: Readonly<Record<'f' | 'm', readonly HairStyle[]>> = { f: ['bob', 'bun', 'curls', 'bob'], m: ['short', 'crop', 'slick', 'curls'] };
const LOWERS: Readonly<Record<'f' | 'm', readonly Lower[]>> = { f: ['skirt', 'trousers', 'cropped', 'skirt'], m: ['trousers', 'trousers', 'cropped'] };

/** The hat an archetype wears when it has one (04 7.2): a cap, a sunhat, the artist's floppy hat; else a beret (f) or a flat cap (m). */
function hatKind(a: Archetype, sex: 'f' | 'm'): Hat {
  switch (a) {
    case 'child':
    case 'gardener':
      return 'none';
    case 'jogger':
      return 'headband';
    case 'elder':
    case 'vendor':
    case 'busker':
      return 'cap';
    case 'tourist':
      return 'sunhat';
    case 'artist':
      return 'floppy';
    default:
      return sex === 'f' ? 'beret' : 'cap';
  }
}

/** The top a visitor wears, by its lookSeed and the rules of the pick (a single's signature, a couple's scarf, no Breton under a beret). */
export function topOf(seed: number, arche: Archetype, sex: 'f' | 'm', pair: string, partnerTop: number, P: Palette): number {
  const n = P.crowdTop.length;
  // a beret from arrival (spawnVisitor: bit 3 of lookSeed gives a plain visitor a hat), so a stolen hat never changes the top
  const beret = hatKind(arche, sex) === 'beret' && ((seed >>> 3) & 1) === 1;
  const ok = (i: number): boolean => !(beret && i === CROWD_BRETON);
  let top = pick(seed, 6, n);
  if (arche === 'single') {
    const allowed = ALLOWED_TOPS[signatureOf(seed)] ?? [];
    if (allowed.includes(top) && ok(top)) return top;
    const start = pick(seed, 16, allowed.length);
    for (let k = 0; k < allowed.length; k++) {
      const i = allowed[(start + k) % allowed.length] as number;
      if (ok(i)) return i;
    }
    return top;
  }
  const bad = (i: number): boolean =>
    !ok(i) || (pair !== '' && (P.crowdTop[i] === pair || (i === CROWD_BRETON && P.crowdStripe === pair))) || i === partnerTop;
  for (let k = 0; k < n && bad(top); k++) top = (top + 3) % n; // the page's own re-roll: three along
  return top;
}

/** A couple member's scarf hue (an index into crowdPair) and its lead partner's top (into crowdTop, -1 for the lead itself). */
type PairLook = { seed: number; hue: number; partnerTop: number };
/**
 * The couple members' pair looks, remembered by visitor id while both members are in the park: removeVisitor sets the partner's
 * coupleOf to 0 as soon as one member reaches its outside tile, and the one still walking to the gate must keep its scarf and its top
 * (04 7.2 couple row, 7.3 rule 5: the couple shares one hue). Swept of ids that have left; checked against lookSeed, so a reused id
 * never takes another visitor's look. Render state only, never saved: a member reloaded after its lead left reads its own seed.
 */
const PAIRS = new Map<number, PairLook>();
const PR: PairLook = { seed: 0, hue: 0, partnerTop: -1 };

/** The couple's matching scarf hue (crowdPair) by the lead (lower id) member's lookSeed, and the lead's top for the other member. */
function pairOf(v: Visitor, P: Palette): PairLook | null {
  if (v.archetype !== 'couple') return null;
  const o = v.coupleOf ? byId(v.coupleOf) : undefined;
  if (!o) {
    const m = PAIRS.get(v.id);
    if (m && m.seed === v.lookSeed) return m; // the partner has left: the look it had beside them
    PR.seed = v.lookSeed;
    PR.hue = pick(v.lookSeed, 10, P.crowdPair.length);
    PR.partnerTop = -1;
    return PR;
  }
  const lead = o.id < v.id ? o : v;
  const hue = pick(lead.lookSeed, 10, P.crowdPair.length);
  const partnerTop = lead === o ? topOf(o.lookSeed, o.archetype, o.sex, P.crowdPair[hue] as string, -1, P) : -1;
  let m = PAIRS.get(v.id);
  if (!m) {
    if (PAIRS.size >= 64) for (const id of PAIRS.keys()) if (!byId(id)) PAIRS.delete(id);
    m = { seed: 0, hue: 0, partnerTop: -1 };
    PAIRS.set(v.id, m);
  }
  m.seed = v.lookSeed;
  m.hue = hue;
  m.partnerTop = partnerTop;
  return m;
}

/** The walker's dog by its walker's lookSeed (register section 4, Figure rig: both dogs, one per dog walker by seed). */
export const breedOf = (walkerSeed: number): 'terrier' | 'poodle' => (pick(walkerSeed, 13, 2) === 0 ? 'terrier' : 'poodle');

/** The free hand's item that a visitor carries (03 7.6 item 4 itemFor, the carried part): a child's ice cream, else its balloon. */
export function carryOf(v: Visitor): Item {
  if (v.items.iceCream) return 'icecream';
  return v.archetype === 'child' ? 'balloon' : 'none';
}

/**
 * The flower seller's look (04 7.4 a_florist, 06 6.3 Violette; the `c_bouquet` cameo; register section 4, "S6 art and S5 poses": florist 1,
 * the basket seller): a straw sunhat, her bun, a skirt and the green apron, the bouquet in her hand until she hands it over. Her hair, skin,
 * top and skirt colours stay what her lookSeed gave her.
 */
function florist(v: Visitor, P: Palette, out: RigLook): void {
  out.arche = 'florist';
  out.hat = 'sunhat';
  out.hatHex = P.straw;
  out.hairStyle = 'bun';
  out.lower = 'skirt';
  out.carry = HANDED.get(v.id) === v.lookSeed ? 'none' : 'bouquet';
}
/** The cameos whose bouquet has been handed over (the sim's `bouquet` event), by id and lookSeed: render state only, swept of ids that left. */
const HANDED = new Map<number, number>();
watch('bouquet', (ev) => {
  if (HANDED.size > 32) for (const id of HANDED.keys()) if (!byId(id)) HANDED.delete(id);
  const c = byId(ev.ids?.[0] ?? 0);
  if (c) HANDED.set(c.id, c.lookSeed);
});

/** The look of a visitor, written into `out` (no allocation), with its scale (figures.ts figureScale) handed in. */
export function lookOf(v: Visitor, P: Palette, scale: number, out: RigLook): RigLook {
  const seed = v.lookSeed, sex = v.sex, a = v.archetype;
  out.seed = seed;
  out.sex = sex;
  out.arche = ARCHE[a];
  out.skin = pick(seed, 2, P.skin.length);
  out.hair = a === 'elder' || v.ageWord === 'elder' ? -1 : pick(seed, 3, 5); // the five hair tones of the page; elders grey (04 7.2)
  const cuts = CUTS[sex], lowers = LOWERS[sex];
  out.hairStyle = a === 'elder' ? 'elder' : (cuts[pick(seed, 4, cuts.length)] as HairStyle);
  out.lower = a === 'jogger' || a === 'tourist' ? 'shorts' : (lowers[pick(seed, 5, lowers.length)] as Lower);
  out.sig = a === 'single' ? signatureOf(seed) : -1;
  out.hat = v.items.hat || a === 'jogger' ? hatKind(a, sex) : 'none';
  out.hatHex = out.hat === 'sunhat' || a === 'vendor' ? P.paper : (P.crowdHat[pick(seed, 9, P.crowdHat.length)] as string);
  const pr = pairOf(v, P);
  const hue = pr ? (P.crowdPair[pr.hue] as string) : '';
  const top = topOf(seed, a, sex, hue, pr ? pr.partnerTop : -1, P);
  out.top = P.crowdTop[top] as string;
  out.stripe = top === CROWD_BRETON ? P.crowdStripe : '';
  out.low = P.crowdLow[pick(seed, 7, P.crowdLow.length)] as string;
  out.pairScarf = hue;
  out.carry = carryOf(v);
  out.bag = v.items.purse ? 'purse' : v.items.baguette ? 'baguette' : 'none';
  if (a === 'cameo' && sex === 'f') florist(v, P, out);
  out.balloon = pick(seed, 11, 2) === 0 ? P.rose : P.sky;
  out.long = false;
  out.scale = scale;
  return out;
}

/** A fresh RigLook to write into. */
export const newLook = (): RigLook => ({
  seed: 0, sex: 'f', arche: 'plain', skin: 0, hair: 0, hairStyle: 'short', sig: -1, hat: 'none', hatHex: '', lower: 'trousers', top: '',
  low: '', stripe: '', pairScarf: '', carry: 'none', bag: 'none', balloon: '', long: false, scale: 1,
});
