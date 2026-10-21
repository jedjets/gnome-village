// src/world/charm.ts
// The charm field: a base array rebuilt on a prop epoch, dynamic sources at query time, {total, player} capped 6 (03 6.7; 02 6.3; 06 9).
// NEW (nothing in GV). S2 held the API with an empty field; S5 fills it.
// Static sources, stamped by rebuildCharm into CB_TOTAL and CB_PLAYER with one mask bit per kind (CB_MASK, CB_PMASK), so each kind counts
// once per tile however many of it reach the tile (two beds within 3 still give +1): a bed tile +1 within Chebyshev 3; a fountain +2
// within 5 of its footprint; a bandstand +2 within 4; a lit lamp +1 within 3 (stamped only while the lamps are lit: loop.ts marks the
// field dirty when T.lamps flips); the river view +1 on every tile with y <= 5 (never player charm). The player arrays get the same stamps
// from props with placedBy 'player' only, and from bed tiles outside the starter park's two fixed bed clusters (02 2.5: (19,19)-(20,20)
// and (27,27)-(28,28)): the grid keeps no owner per bed tile, so a bed elsewhere was painted by the player (assumption S5-A1).
// Dynamic sources at query time (03 6.7 item 4): the live sources the entities hand in (setLiveSources: an AI busker playing, +3 within 8,
// player when summoned by c_musician), the sources abilities add (addSource, S6 and S10), PETALS > 0.2 on the tile (+2, always player),
// inside a c_sunbeam override (+1, always player) and the pair bonuses from setPairCharm (umbrella +2 while the rain there is above 0.3,
// boat +4, fireworks +4; always player) when charmAt is called with a pairId. Each source kind counts once.
import type { EffectId } from '../core/ids.ts';
import { T } from '../core/clock.ts';
import { overrides, weatherAt } from '../core/weather.ts';
import { I, KIND, Kind, N, NC, PETALS, inB, type Prop } from './grid.ts';

export const CHARM_CAP = 6;
/** Source strengths and reaches (register 3.5; 02 6.3; 06 9). */
export const CHARM = {
  bed: [1, 3], fountain: [2, 5], bandstand: [2, 4], lamp: [1, 3], busker: [3, 8], petals: [2, 0], sunbeam: [1, 0], river: [1, 5],
  umbrella: [2, 0], boat: [4, 0], fireworks: [4, 0],
} as const;
/** Petals count on a tile above this (02 6.3). */
export const PETALS_MIN = 0.2;
/** The umbrella counts as charm only while the rain at the pair is above this (02 6.3). */
export const UMBRELLA_RAIN = 0.3;

export type CharmKind = keyof typeof CHARM;
export type CharmSource = { kind: string; x: number; y: number; r: number; amount: number; player: boolean; until: number };
export type CharmValue = { total: number; player: number };

const BIT = { bed: 1, fountain: 2, bandstand: 4, river: 8, lamp: 16 } as const;
const STATIC: ReadonlyArray<readonly [number, number]> = [[BIT.bed, 1], [BIT.fountain, 2], [BIT.bandstand, 2], [BIT.river, 1], [BIT.lamp, 1]];
export const CB_TOTAL = new Float32Array(NC);
export const CB_PLAYER = new Float32Array(NC);
export const CB_MASK = new Uint8Array(NC);
export const CB_PMASK = new Uint8Array(NC);

/** The starter park's bed clusters (02 2.5), the only gen beds: a bed tile outside them is the player's (assumption S5-A1). */
const GEN_BEDS: ReadonlyArray<readonly [number, number]> = [[19, 19], [27, 27]];
function genBed(x: number, y: number): boolean {
  return GEN_BEDS.some(([bx, by]) => x >= bx && x < bx + 2 && y >= by && y < by + 2);
}

let dirty = true;
let added: Array<CharmSource & { id: EffectId }> = [];
let nextSrc = 1;
const pairBonus = new Map<number, Map<string, number>>(); // pairId -> kind -> until (T.abs)
let live: (out: CharmSource[]) => void = () => {};
const LIVE: CharmSource[] = [];

export function markCharmDirty(): void {
  dirty = true;
}
export function charmDirty(): boolean {
  return dirty;
}

/** Stamp bit `bit` on every tile within Chebyshev `r` of the footprint (x, y, w, h); `player` stamps the player mask too. */
function stamp(x: number, y: number, w: number, h: number, r: number, bit: number, player: boolean): void {
  for (let ty = Math.max(0, y - r); ty <= Math.min(N - 1, y + h - 1 + r); ty++)
    for (let tx = Math.max(0, x - r); tx <= Math.min(N - 1, x + w - 1 + r); tx++) {
      const i = I(tx, ty);
      CB_MASK[i] = (CB_MASK[i] as number) | bit;
      if (player) CB_PMASK[i] = (CB_PMASK[i] as number) | bit;
    }
}

/** The base field from the props, the bed tiles and the river (03 6.7 items 1-3). Finished inside the step that dirtied it (phase 13). */
export function rebuildCharm(list: readonly Prop[], lampsLit: boolean): void {
  CB_MASK.fill(0);
  CB_PMASK.fill(0);
  for (let i = 0; i < NC; i++) {
    const x = i % N, y = (i / N) | 0;
    if (KIND[i] === Kind.bed) stamp(x, y, 1, 1, CHARM.bed[1], BIT.bed, !genBed(x, y));
    if (y <= CHARM.river[1]) CB_MASK[i] = (CB_MASK[i] as number) | BIT.river;
  }
  for (const p of list) {
    const pl = p.placedBy === 'player';
    if (p.kind === 'fountain') stamp(p.x, p.y, p.w, p.h, CHARM.fountain[1], BIT.fountain, pl);
    else if (p.kind === 'bandstand') stamp(p.x, p.y, p.w, p.h, CHARM.bandstand[1], BIT.bandstand, pl);
    else if (p.kind === 'lamp' && lampsLit) stamp(p.x, p.y, p.w, p.h, CHARM.lamp[1], BIT.lamp, pl);
  }
  for (let i = 0; i < NC; i++) {
    let t = 0, q = 0;
    for (const [bit, v] of STATIC) {
      if ((CB_MASK[i] as number) & bit) t += v;
      if ((CB_PMASK[i] as number) & bit) q += v;
    }
    CB_TOTAL[i] = t;
    CB_PLAYER[i] = q;
  }
  dirty = false;
}

/** entities/romance.ts hands in the live sources at load (an AI busker playing): world/ may not import entities/ (03 2.1). */
export function setLiveSources(fn: (out: CharmSource[]) => void): void {
  live = fn;
}

/** A dynamic source an ability adds (S6, S10); its id removes it. Ends by itself at `until` (T.abs). */
export function addSource(s: CharmSource): EffectId {
  const id = nextSrc++;
  added.push({ ...s, id });
  return id;
}
export function removeSource(id: EffectId): void {
  added = added.filter((s) => s.id !== id);
}
/** A pair bonus (umbrella, boat, fireworks) for `pairId` until T.abs `until` (02 6.3). */
export function setPairCharm(pairId: number, kind: string, until: number): void {
  let m = pairBonus.get(pairId);
  if (!m) pairBonus.set(pairId, (m = new Map()));
  m.set(kind, until);
}
export function clearPairCharm(pairId: number, kind: string): void {
  pairBonus.get(pairId)?.delete(kind);
}
/** Every pair bonus goes (a new park, a restore: romance.ts sets the saved ones again). */
export function clearCharmSources(): void {
  pairBonus.clear();
  added = [];
}

/**
 * The charm at tile (x, y) (rounded), for the pair `pairId` when given: the base field plus the dynamic sources, each kind once, both
 * numbers capped at 6 (03 6.7 item 5).
 */
export function charmAt(x: number, y: number, pairId = 0): CharmValue {
  const tx = Math.round(x), ty = Math.round(y);
  if (!inB(tx, ty)) return { total: 0, player: 0 };
  const i = I(tx, ty);
  let total = CB_TOTAL[i] as number, player = CB_PLAYER[i] as number;
  const seen = new Set<string>(), seenP = new Set<string>();
  const add = (kind: string, amount: number, pl: boolean): void => {
    if (!seen.has(kind)) {
      seen.add(kind);
      total += amount;
    }
    if (pl && !seenP.has(kind)) {
      seenP.add(kind);
      player += amount;
    }
  };
  LIVE.length = 0;
  live(LIVE);
  for (const s of [...LIVE, ...added]) {
    if (s.until > 0 && s.until < T.abs) continue;
    if (Math.max(Math.abs(s.x - tx), Math.abs(s.y - ty)) <= s.r) add(s.kind, s.amount, s.player);
  }
  if ((PETALS[i] as number) > PETALS_MIN) add('petals', CHARM.petals[0], true);
  for (const o of overrides()) if (o.kind === 'sunbeam' && Math.abs(tx - o.x) <= o.r && Math.abs(ty - o.y) <= o.r) add('sunbeam', CHARM.sunbeam[0], true);
  const m = pairId ? pairBonus.get(pairId) : undefined;
  if (m)
    for (const [kind, until] of m) {
      if (until < T.abs) continue;
      if (kind === 'umbrella' && weatherAt(tx, ty).rain <= UMBRELLA_RAIN) continue;
      const amount = kind === 'umbrella' ? CHARM.umbrella[0] : kind === 'boat' ? CHARM.boat[0] : kind === 'fireworks' ? CHARM.fireworks[0] : 0;
      add(kind, amount, true);
    }
  return { total: Math.min(CHARM_CAP, total), player: Math.min(CHARM_CAP, player) };
}
