// src/entities/move.ts
// Walking along a path at the speeds of 02 5.4; arrival radii; replan cooldown; crowd separation in screen space at zoom 1.
// Ported from GV 1569-1598 (goTo, openNear), 1600-1673 (moveGnome), 5593-5621 (nudge, spaceOut) in S4. PORT.
// TODO(S4): fills this file; S0 holds only the header and a placeholder export.

export const SLICE = 'S4' as const;
