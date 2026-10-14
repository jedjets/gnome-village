// src/world/charm.ts
// The charm field: a base array rebuilt on a prop epoch, dynamic sources at query time, {total, player} capped 6 (03 6.7).
// NEW (nothing in GV). S2 holds the API with an empty field: every tile reads 0 and no source is stamped, so the loop can already call
// rebuildCharm on the dirty flag (03 4.2 phase 13).
// TODO(S5): stamp the static sources (bed, fountain, bandstand, lit lamp, river view), the dynamic ones (busker, petals, sunbeam) and the
// pair bonuses; fill the arrays CB_TOTAL, CB_PLAYER and CB_MASK of 03 6.7.
import type { EffectId } from '../core/ids.ts';
import type { Prop } from './grid.ts';

export const CHARM_CAP = 6;

export type CharmSource = { kind: string; x: number; y: number; r: number; amount: number; player: boolean; until: number };
export type CharmValue = { total: number; player: number };

const ZERO: CharmValue = { total: 0, player: 0 };
let dirty = true;

export function charmAt(_x: number, _y: number, _pairId = 0): CharmValue {
  return { ...ZERO };
}
export function markCharmDirty(): void {
  dirty = true;
}
export function charmDirty(): boolean {
  return dirty;
}
export function rebuildCharm(_props: readonly Prop[], _lampsLit: boolean): void {
  dirty = false;
}
export function addSource(_s: CharmSource): EffectId {
  return 0;
}
export function removeSource(_id: EffectId): void {
  /* S5 */
}
export function setPairCharm(_pairId: number, _kind: string, _until: number): void {
  /* S5 */
}
export function clearPairCharm(_pairId: number, _kind: string): void {
  /* S5 */
}
