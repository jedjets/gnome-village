// tests/items.test.ts
// Locks 04 7.2 (the purse and the baguette are drawn at rest) and 02 11.3 / 02 9.3 item snatches as built in S6 (register section 4 row "S6 art
// and S5 poses"): visitor.ts hands out the purse and the baguette from lookSeed bits with no rng() draw, to the archetypes whose back hand is free
// (a purse to women only), so that what Pompon takes is what the player saw on the visitor; the rig carries it in the back hand at rest and in
// the lap when seated; the florist (the c_bouquet cameo) wears her sunhat and apron and holds her bouquet until she has handed it over.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { newPark } from '../src/core/loop.ts';
import { rngN } from '../src/core/rng.ts';
import { drain, emit } from '../src/core/events.ts';
import { PALETTES } from '../src/render/ambient.ts';
import { removeVisitor, resetVisitors, spawnVisitor, type Archetype, type Visitor } from '../src/entities/visitor.ts';
import { lookOf, newLook } from '../src/render/figure-look.ts';
import { opts, solveH } from '../src/render/figure-rig.ts';
import { itemFor } from '../src/render/figures.ts';
import { drawVisitor, poseOf } from '../src/render/figures.ts';
import { penOf, recorder, stubPath2D } from './draw-stub.ts';

const P = PALETTES.A;
beforeAll(stubPath2D);
beforeEach(() => {
  newPark(101);
  resetVisitors();
});

/** Spawn n visitors of `arch` (and of `sex` if given), read what they carry, remove them again. */
function carried(arch: Archetype, n: number, sex?: 'f' | 'm'): Array<{ sex: string; purse: boolean; baguette: boolean; seed: number }> {
  const out: Array<{ sex: string; purse: boolean; baguette: boolean; seed: number }> = [];
  for (let k = 0; k < n; k++) {
    const v = spawnVisitor(arch, 'g_west', sex ? { sex, seeks: sex === 'f' ? 'm' : 'f' } : {}) as Visitor;
    out.push({ sex: v.sex, purse: v.items.purse, baguette: v.items.baguette, seed: v.lookSeed });
    removeVisitor(v.id);
  }
  return out;
}

describe('04 7.2 (S6): who arrives with a purse and who with a baguette, from lookSeed bits (no draw)', () => {
  it('a purse only on women of the free-handed archetypes, about half of them; never together with a baguette', () => {
    for (const arch of ['single', 'couple', 'elder', 'tourist', 'dogwalker'] as const) {
      const women = carried(arch, 160, 'f'), men = carried(arch, 160, 'm');
      const purses = women.filter((w) => w.purse).length;
      expect(purses, arch + ' women with a purse').toBeGreaterThan(40);
      expect(purses, arch + ' women with a purse').toBeLessThan(120);
      expect(men.some((m) => m.purse), arch + ' men never carry a purse').toBe(false);
      for (const w of [...women, ...men]) expect(w.purse && w.baguette).toBe(false);
      for (const w of women) expect(w.purse).toBe(((w.seed >>> 4) & 1) === 1);
    }
  });
  it('a baguette on one in four of the rest, and on a parent\'s arm; never on a child, the staff, a jogger, the artist, the busker or the cameo', () => {
    for (const arch of ['single', 'couple', 'elder', 'tourist', 'dogwalker', 'family'] as const) {
      const all = carried(arch, 240);
      const plain = all.filter((w) => !w.purse);
      const loaves = plain.filter((w) => w.baguette).length;
      expect(loaves / plain.length, arch + ' share of the baguette').toBeGreaterThan(0.12);
      expect(loaves / plain.length, arch + ' share of the baguette').toBeLessThan(0.4);
      for (const w of all) expect(w.baguette).toBe(!w.purse && ((w.seed >>> 5) & 3) === 0);
    }
    for (const arch of ['child', 'jogger', 'artist', 'busker', 'cameo'] as const) {
      for (const w of carried(arch, 60)) expect(w.purse || w.baguette, arch).toBe(false);
    }
    for (const arch of ['family'] as const) for (const w of carried(arch, 60)) expect(w.purse, arch + ' has no purse').toBe(false);
  });
  it('the flags cost no draw: a spawn makes the same draws whatever its seed bits say (tests/arrivals.test.ts locks the counts)', () => {
    const draws: number[] = [];
    for (let k = 0; k < 40; k++) {
      const n0 = rngN();
      const v = spawnVisitor('single', 'g_west', { sex: 'f', seeks: 'm' }) as Visitor;
      draws.push(rngN() - n0);
      removeVisitor(v.id);
    }
    expect(new Set(draws).size, 'one count of draws for a woman with a given sex and seeks').toBe(1);
  });
});

describe('04 7.2 (S6): the rig carries it, in the back hand at rest and in the lap when seated; itemFor reads it', () => {
  const vis = (o: Partial<Visitor>): Visitor =>
    ({ id: 3, sex: 'f', archetype: 'single', ageWord: 'grown', lookSeed: 11, st: 'idle', t: 0, path: null, sitPropId: 0, pairId: 0, coupleOf: 0, job: {},
      items: { hat: false, purse: false, baguette: false, iceCream: false }, ...o }) as unknown as Visitor;
  it('lookOf: bag is purse, baguette or none from the record\'s items', () => {
    expect(lookOf(vis({ items: { hat: false, purse: true, baguette: false, iceCream: false } }), P, 1, newLook()).bag).toBe('purse');
    expect(lookOf(vis({ items: { hat: false, purse: false, baguette: true, iceCream: false } }), P, 1, newLook()).bag).toBe('baguette');
    expect(lookOf(vis({}), P, 1, newLook()).bag).toBe('none');
  });
  it('solveH: a walking single holds it in the back hand; seated, in the lap; a parent\'s tote holds the loaf; Pompon\'s snatch empties the hand', () => {
    const skel = (bag: 'none' | 'purse' | 'baguette', state: 'idle' | 'walk' | 'sit', arche: 'single' | 'parent' = 'single') =>
      solveH({ ...newLook(), arche, sex: 'f', bag, top: P.crowdTop[0] as string, low: P.crowdLow[0] as string }, opts({ state, seatPx: state === 'sit' ? 5 : 0 }), 40);
    for (const state of ['idle', 'walk', 'sit'] as const) {
      expect(skel('purse', state).items.B, 'purse ' + state).toBe('purse');
      expect(skel('baguette', state).items.B, 'baguette ' + state).toBe('baguette');
      expect(skel('none', state).items.B, 'nothing ' + state).not.toBe('purse');
    }
    expect(skel('baguette', 'idle', 'parent').items.B).toBe('tote-bread');
    expect(skel('none', 'idle', 'parent').items.B).toBe('tote');
  });
  it('a visitor whose purse has been snatched is drawn without it (items.purse false: the look has no bag)', () => {
    const v = vis({ items: { hat: false, purse: true, baguette: false, iceCream: false } });
    const L = lookOf(v, P, 1, newLook());
    expect(L.bag).toBe('purse');
    v.items.purse = false;
    expect(lookOf(v, P, 1, L).bag).toBe('none');
    expect(itemFor(v)).not.toBe('purse');
  });
});

describe('04 7.4 a_florist (S6, florist 1: the basket seller): the cameo\'s look and her bouquet until it is handed over', () => {
  it('a cameo woman is the florist: a straw sunhat, a bun, a skirt, a basket, a bouquet in her hand; a bouquet event takes the bouquet from her', () => {
    const v = spawnVisitor('cameo', 'g_west', { sex: 'f', seeks: 'm' }) as Visitor;
    const L = lookOf(v, P, 1, newLook());
    expect(L.arche).toBe('florist');
    expect(L.hat).toBe('sunhat');
    expect(L.hatHex).toBe(P.straw);
    expect(L.hairStyle).toBe('bun');
    expect(L.lower).toBe('skirt');
    expect(L.carry).toBe('bouquet');
    const S = solveH(L, opts({ state: 'idle' }), 40);
    expect(S.items.B).toBe('basket');
    expect(S.items.F).toBe('bouquet');
    emit({ kind: 'bouquet', tick: 0, x: v.x, y: v.y, ids: [v.id, 0] });
    drain(0); // the frame's listeners (figure-look.ts watches `bouquet`)
    const after = lookOf(v, P, 1, newLook());
    expect(after.carry).toBe('none');
    expect(solveH(after, opts({ state: 'idle' }), 40).items.F).not.toBe('bouquet');
    const other = spawnVisitor('single', 'g_west', { sex: 'f', seeks: 'm' }) as Visitor;
    expect(lookOf(other, P, 1, newLook()).arche).not.toBe('florist');
  });
  it('she draws: the apron, the basket and the bouquet paint more than a plain single', () => {
    const v = spawnVisitor('cameo', 'g_west', { sex: 'f', seeks: 'm' }) as Visitor;
    const a = recorder(), b = recorder();
    drawVisitor({ pen: penOf(a), warm: 0 }, { x: 100, y: 200 }, lookOf(v, P, 1, newLook()), poseOf(v, 1, 3, opts()));
    const s = spawnVisitor('single', 'g_west', { sex: 'f', seeks: 'm' }) as Visitor;
    s.items = { hat: false, purse: false, baguette: false, iceCream: false };
    drawVisitor({ pen: penOf(b), warm: 0 }, { x: 100, y: 200 }, lookOf(s, P, 1, newLook()), poseOf(s, 1, 3, opts()));
    expect(a.total()).toBeGreaterThan(b.total());
  });
});
