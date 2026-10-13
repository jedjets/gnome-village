// src/entities/visitor.ts
// The Visitor record, factory, arrivals scheduler, stepVisitors, removal at a gate, caps; the one MODE branch at the decide cadence (03 2.5, 4.4).
// Ported from GV 1387-1399 (factory), 5689-5716 (updateGnomes), 4472-4504 (newcomer) in S4. ADAPT.
// TODO(S4): fills this file; S0 holds only the header and a placeholder export.
// S3 adds the hooks the park tools and their undo call (02 8.3 remove and bridge rows, 02 8.5 item 3, 03 5.6 item 3): no-ops until S4.
import type { XY } from '../core/math.ts';
import type { PropId } from '../core/ids.ts';

export const SLICE = 'S4' as const;

/** A prop is going (`remove`, a tree tapped with the tree tool, or an undo): whoever sits on it stands up (02 8.3, "sitters stand"). */
export function standUpFrom(_propId: PropId): void {
  // TODO(S4): every visitor with sitPropId === propId stands up (and drops the prop from its job).
}

/** Tiles (indices) that a tool or an undo just made blocked: a visitor standing on one moves to the nearest open tile (GV openNear 1559). */
export function moveOffBlocked(_tiles: readonly number[]): void {
  // TODO(S4): openNear(x, y, R_OPEN_NEAR) for every visitor and creature on one of these tiles (02 8.5 item 3).
}

/** True when someone stands on one of these tiles: the bridge stamp and `remove` refuse with `reason.someone_on_it` (02 8.4). */
export function someoneOn(_tiles: readonly XY[]): boolean {
  return false; // TODO(S4): a visitor (or a dog) whose rounded tile is one of these.
}
