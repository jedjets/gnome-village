// src/entities/act.ts
// The state machine: every st string, its timer, what happens when it ends; reaction states and backfire scenes.
// Ported from GV 4968-5516 (goX -> X (timer) -> idle idiom), 4548-4556 in S4. ADAPT.
// TODO(S4): fills this file; S0 holds only the header and a placeholder export.

export const SLICE = 'S4' as const;
