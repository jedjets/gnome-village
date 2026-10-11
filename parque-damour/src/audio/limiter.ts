// src/audio/limiter.ts
// aOK(kind, baseMs, soft): the per-kind real-time gap scaled by T.speed (03 9.2).
// Ported from GV 6130-6137 in S8. PORT.
// TODO(S8): fills this file; S0 holds only the header and a placeholder export.

export const SLICE = 'S8' as const;
