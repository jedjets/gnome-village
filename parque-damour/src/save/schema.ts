// src/save/schema.ts
// Versioned save types: ProfileV1 and ParkSaveV1 (03 3.9-3.10), SCHEMA_VERSION = 1. Types only.
// NEW (GV has no save, review section 11).
// S2 fills ParkSaveV1 for everything the engine owns. The record lists that later slices own (visitors S4, pairs S5, creatures S4, effects S6,
// regulars and alumni S4, feed S3) are typed as SaveRec until their slice replaces the type; the engine saves them as empty lists.
// S3 part B: ProfileV1 gains the fields of 03 3.9 (points, tiers, unlocks, parks played, the write serial); ParkSaveV1 gains `treeTurn`,
// the park tools' tree cycle (02 8.3), sim state that 03 3.10 does not list (a deviation of S3 part B: without it a reload or a replay
// from a snapshot could plant the next tree as another species). It is saved, not hashed: 03 11 lists what the hash covers.
import type { Command } from '../core/commands.ts';
import type { IdsState, Side } from '../core/ids.ts';
import type { Override, WeatherKind } from '../core/weather.ts';
import type { Prop } from '../world/grid.ts';
import type { IceState } from '../world/water.ts';
import type { AvatarId, Mode } from '../play/mode.ts';

export const SCHEMA_VERSION = 1;

export type Lang = 'en' | 'es';
/** A tier on either ladder: T0 = 0, T1 = 8, T2 = 20, T3 = 40, T4 = 70 cumulative points (register 3.6). */
export type Tier = 0 | 1 | 2 | 3 | 4;

/** parque:profile-v1 (register 3.11, 03 3.9): what persists across parks. */
export type ProfileV1 = {
  v: 1;
  cp: number; // Cupid Points, cumulative
  mp: number; // Mischief Points, cumulative
  tierC: Tier;
  tierM: Tier;
  unlocked: string[]; // ability and avatar ids already announced, so the "Unlocked" toast fires once per id (03 3.9)
  settings: { lang: Lang; muted: boolean; speed: number }; // speed is the dial 1-8; the pause is never stored (03 4.6)
  stylePick: string | null; // written only by the Style Board's Choose (04 4.4); the game draws A whatever it holds
  musicPick: string | null; // written only by the Music Board's Choose (05 6.5 item 1); the game never reads it
  parksPlayed: number; // parks begun with New (03 11)
  updatedAt: number; // the write serial: one more on every profile write (save/ reads no wall clock, AGENTS hard rule 3)
};

/** A saved record the engine does not own yet: an id and plain JSON fields. */
export type SaveRec = { id: number } & Record<string, unknown>;

/** The nine saved tile layers as base64 of their raw little-endian bytes (03 3.2). */
export type LayersSave = {
  KIND: string;
  WEAR: string;
  OCC: string;
  WATER: string;
  ICE: string;
  WET: string;
  PETALS: string;
  BEDC: string;
  PAVEDAY: string;
};

export type WeatherSave = {
  kind: WeatherKind;
  next: number;
  cloud: number;
  rain: number;
  mist: number;
  snow: number;
  wind: number;
  windP: number;
  wet: number;
  overrides: Override[];
  ice: IceState; // 03 3.10: the ice timers, so a restore thaws and freezes on the same step an uninterrupted run does
};

export type ParkSaveV1 = {
  v: 1;
  seed: number;
  tick: number;
  rng: { sim: number; simN: number; vis: number };
  weather: WeatherSave;
  layers: LayersSave;
  ids: IdsState;
  props: Prop[];
  visitors: SaveRec[];
  pairs: SaveRec[];
  creatures: SaveRec[];
  effects: SaveRec[];
  sides: { cooldowns: Record<Side, Record<string, number>>; charges: Record<Side, Record<string, number>> };
  regulars: Array<Record<string, unknown>>;
  alumni: Array<Record<string, unknown>>;
  pinnedPair: number;
  paving: { runsToday: number; day: number };
  mode: { mode: Mode; player: number; avatar: AvatarId | null };
  tally: { day: number; cp: number; mp: number };
  feed: Array<Record<string, unknown>>; // last 40
  log: Command[]; // last 600
  treeTurn: number; // the species the tree tool plants next: 0 plane, 1 chestnut, 2 lime (02 8.3; play/tools.ts nextSpecies)
};
