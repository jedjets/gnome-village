// src/render/props.ts
// One drawProp per prop kind; the tree sprite cache keyed by species, zoom bucket, season, phase, light, snow (03 7.7).
// Ported from GV 6837-6944 (trees, bushes, flowers), 7978 (drawLantern), 9540 (drawProp), 6782-6835 (sprite cache) in S2. ADAPT.
// TODO(S2): fills this file; S0 holds only the header and a placeholder export.

export const SLICE = 'S2' as const;
