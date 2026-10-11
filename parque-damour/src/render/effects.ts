// src/render/effects.ts
// Particles (cap 220) on the visual stream, screen-space rain and snow, fog wash, lamp halos, fireworks; subscribes to fx events (03 7.8).
// Ported from GV 2386-2408 (P, spawners, updateParts), 8609 (drawPart), 10062-10105 (drawWeather), 8820-8847 (ambientFx) in S2 and S9. PORT.
// TODO(S2): fills this file; S0 holds only the header and a placeholder export.

export const SLICE = 'S2' as const;
