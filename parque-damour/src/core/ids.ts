// src/core/ids.ts
// One allocator per record type: counters start at 1, 0 is none; PropId is recycled through a free list so it fits OCC (03 2.3).
// NEW (GV holds object references, review section 11).
// TODO(S2): fills this file; S0 holds only the header and a placeholder export.

export const SLICE = 'S2' as const;
