// src/entities/romance.ts
// Pairs, the seven stages, prerequisites, affinity, charm conversion, decay, endings, the featured pair (02 section 6).
// Ported from GV 4338 and 5483-5491 (the court rendezvous shape only) in S5. NEW.
// TODO(S5): fills this file; S0 holds only the header and a placeholder export. S4 part B adds the rung-6 call of the decide ladder.

export const SLICE = 'S5' as const;

/**
 * Rung 6 of the decide ladder (02 5.2): when `v` is in a Pair whose next stage is ready (prerequisites, the affinity gate, retryT run out,
 * both members in CAN_INTERRUPT states with comfort >= 0.35), the lower id starts the stage for both and this returns true. S4 has no
 * pairs yet: it returns false and the ladder goes on to the routine (rung 7).
 */
export function romanceStep(_v: { id: number; pairId: number }): boolean {
  return false; // TODO(S5): nextStageReady(pair) && startStage(pair) (03 2.5 romance.ts API)
}
