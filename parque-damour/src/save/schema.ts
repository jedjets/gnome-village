// src/save/schema.ts
// Versioned save types: ProfileV1 and ParkSaveV1 (03 3.9-3.10), SCHEMA_VERSION = 1. Types only.
// NEW (GV has no save, review section 11).
// S2 fills ParkSaveV1 for everything the engine owns. The record lists that later slices own (visitors S4, pairs S5, creatures S4, effects S6,
// regulars and alumni S4, feed S3) are typed as SaveRec until their slice replaces the type; the engine saves them as empty lists.
// TODO(S3): ProfileV1 points, tiers, unlocks (cp, mp, tierC, tierM, unlocked, parksPlayed, updatedAt).
import type { Command } from '../core/commands.ts';
import type { IdsState, Side } from '../core/ids.ts';
import type { Override, WeatherKind } from '../core/weather.ts';
import type { Prop } from '../world/grid.ts';
import type { IceState } from '../world/water.ts';
import type { AvatarId, Mode } from '../play/mode.ts';

export const SCHEMA_VERSION = 1;

export type Lang = 'en' | 'es';

export type ProfileV1 = {
  v: 1;
  settings: { lang: Lang; muted: boolean; speed: number };
  stylePick: string | null;
  musicPick: string | null;
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
};
