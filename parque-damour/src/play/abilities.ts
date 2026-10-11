// src/play/abilities.ts
// The registry of 19 abilities (9 Cupid, 10 Mischief) with tier, cooldown, charges, target type; per-side cooldowns; validation; the effect list (02 section 9).
// Ported from GV 5840-5989 (ghost {ok, msg} validation shape), 2386 (P cap idea) in S6 and S10. NEW.
// TODO(S6): fills this file; S0 holds only the header and a placeholder export.

export const SLICE = 'S6' as const;
