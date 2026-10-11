// src/core/events.ts
// The event bus: emit delivers at once to sim listeners (on) and queues for frame listeners (watch); drain(lite) after the frame's steps (03 2.3).
// NEW (GV logEv 10717 is the nearest thing).
// TODO(S2): fills this file; S0 holds only the header and a placeholder export.

export const SLICE = 'S2' as const;
