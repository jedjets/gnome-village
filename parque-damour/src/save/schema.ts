// src/save/schema.ts
// Versioned save types: ProfileV1 and ParkSaveV1 (03 3.9-3.10), SCHEMA_VERSION = 1. Types only.
// NEW (GV has no save, review section 11).
// TODO(S2): the full ParkSaveV1 (clock, weather, layers as base64, props, visitors, pairs, creatures, feed, mode); TODO(S3): ProfileV1 points, tiers, unlocks.

export const SCHEMA_VERSION = 1;

export type Lang = 'en' | 'es';

export type ProfileV1 = {
  v: 1;
  settings: { lang: Lang; muted: boolean; speed: number };
  stylePick: string | null;
  musicPick: string | null;
};

export type ParkSaveV1 = {
  v: 1;
  seed: number;
  tick: number;
};
