// src/save/schema.ts
// Versioned save types: ProfileV1 and ParkSaveV1 (03 3.9-3.10), SCHEMA_VERSION = 1. Types only.
// NEW (GV has no save, review section 11).
// S2 fills ParkSaveV1 for everything the engine owns. The record lists that later slices own (visitors S4, pairs S5, creatures S4, effects S6,
// regulars and alumni S4, feed S3) are typed as SaveRec until their slice replaces the type; the engine saves them as empty lists.
// S3 part B: ProfileV1 gains the fields of 03 3.9 (points, tiers, unlocks, parks played, the write serial); ParkSaveV1 gains `treeTurn`,
// the park tools' tree cycle (02 8.3; without it a reload or a replay from a snapshot could plant the next tree as another species).
// It is saved, not hashed: 03 3.10 lists it and 03 11 what the hash covers (docs synced with the owner's answers of 2026-10-13).
// S4 part B: `visitors` are Visitor records (03 3.3, plus `plan`), `creatures` Creature records (03 3.5), `regulars` the regulars' visit
// table and memory (names.ts RegularState: 03 3.10's RegularMemory with the return day and f beside it), `paving` gains the pending run
// and the tile reached (`run`, `at`), and `sched` (new, optional) holds what the schedulers count between steps: the arrivals timer, the
// names held, the regulars arrived today, the pigeon gatherings announced. Without them a restored park would not reach the same hash
// (08 3.2 run 6). A save written before part B has none of them and restores to the empty values.
// Park pace (owner 2026-10-14, register section 4 "Park pace and Options"): ParkSaveV1 gains `pace` (optional: a save without one is
// calm, so every park saved before keeps its arrivals) and ProfileV1's settings gain `pace`, the pace the player prefers for new parks
// (optional: a profile without one, new or older, reads Lively, store.ts profilePace). No schema version change: an absent field reads
// its default, as every profile field does (migrate.ts profileFrom).
import type { Command, Pace } from '../core/commands.ts';
import type { IdsState, Side } from '../core/ids.ts';
import type { Override, WeatherKind } from '../core/weather.ts';
import type { Prop } from '../world/grid.ts';
import type { IceState } from '../world/water.ts';
import type { AvatarId, Mode } from '../play/mode.ts';
import type { XY } from '../core/math.ts';
import type { Visitor } from '../entities/visitor.ts';
import type { Creature } from '../entities/creatures.ts';
import type { RegularState } from '../entities/names.ts';
import type { Alumni, Pair } from '../entities/romance.ts';

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
  settings: { lang: Lang; muted: boolean; speed: number; pace?: Pace }; // speed is the dial 1-8, never the pause (03 4.6); pace: Lively if absent
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
  visitors: Visitor[];
  pairs: Pair[];
  creatures: Creature[];
  effects: SaveRec[];
  sides: { cooldowns: Record<Side, Record<string, number>>; charges: Record<Side, Record<string, number>> };
  regulars: RegularState[];
  alumni: Alumni[];
  pinnedPair: number;
  paving: { runsToday: number; day: number; run?: XY[]; at?: number };
  sched?: SchedSave;
  mode: { mode: Mode; player: number; avatar: AvatarId | null };
  tally: { day: number; cp: number; mp: number };
  feed: Array<Record<string, unknown>>; // last 40
  log: Command[]; // last 600
  treeTurn: number; // the species the tree tool plants next: 0 plane, 1 chestnut, 2 lime (02 8.3; play/tools.ts nextSpecies)
  pace?: Pace; // the park's pace (visitor.ts, the park.pace command); calm when absent. Saved and hashed (store.ts stateHash)
};

/** The schedulers' counters between steps (S4 part B): saved and hashed so a round trip lands on the same hash (08 3.2 run 6). */
export type SchedSave = {
  arrivalT: number; // s until the next arrival may come (visitor.ts)
  held: string[]; // the generated names in use (names.ts)
  arrivedDay: number; // the day arrivedToday counts (names.ts)
  arrivedToday: number; // regulars arrived that day, at most 3 (02 4.5 item 3)
  gathered: number[]; // crumbs props whose gathering was announced (creatures.ts)
  rolled?: number[]; // S5: the two ids of every encounter that rolled today, flat (romance.ts, 02 6.1 item 5)
  alumniDay?: number; // S5: the day the alumni return was last rolled (romance.ts alumniRoll)
};
