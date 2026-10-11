// src/play/avatar.ts
// Per-avatar actor lookup or spawn, avatarDecide, the six tap cascades returning a status key (02 10.4-10.9).
// Ported from GV 5632-5688 (playerArrive, playerDecide, playerTap), 11270-11279 (playerCommand) in S7. ADAPT.
// TODO(S7): fills this file; S0 holds only the header and a placeholder export.

export const SLICE = 'S7' as const;
