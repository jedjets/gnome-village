// src/core/commands.ts
// The Command union {tick, side, kind, payload}, enqueue, applyPending, applyCommand with rejection reasons, the log, replay (03 section 5).
// NEW (GV applies from the UI directly, review section 4).
// TODO(S2): fills this file; S0 holds only the header and a placeholder export.

export const SLICE = 'S2' as const;
