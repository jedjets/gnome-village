// src/render/water.ts
// Pond and canal outlines as cached paths rebuilt on a water epoch, fill, rim, ice, ripples (03 2.7).
// Ported from GV 9034-9177 (buildWV, waterPath), 9260 (strokeBanks), 9981 (ripples) in S2. ADAPT.
// TODO(S2): fills this file; S0 holds only the header and a placeholder export.

export const SLICE = 'S2' as const;
