// src/save/store.ts
// Keys parque:profile-v1 and parque:park-v1; serialise, parse, autosave, the in-memory profile, the state hash (03 section 11).
// Nothing ported: GV has no save (review section 11). NEW.
// S1: the in-memory profile with loadProfile/saveProfile and the stylePick and musicPick writers the boards need (04 4.4 item 2).
// S2: snapshot, restore, stateHash and worldHash over the engine's state.
// S3 part B: the two keys and nothing else (AGENTS 5 item 8); JSON with the layers as base64 and numbers unrounded; savePark writes the
// park and the profile together; loadPark gives the migrated save or null; clearPark for New; saveBeforeNew, the extra park write on
// park.new (03 17 A24); stepAutosave counts sim time from the frame's step count and writes at 30 sim seconds. Every localStorage access
// is inside try/catch and nothing throws; a public call emits at most one `warn` event, however many of its accesses failed (a write path
// reads a profile not yet in memory quietly and reports through warnFirst). This layer reads no DOM and no wall clock and adds no listener:
// main.ts (part C) wires visibilitychange and pagehide to savePark, Continue to restore(loadPark()), New to saveBeforeNew and clearPark.
// The undo stack is never saved; a restore empties it (play/undo.ts onRestoreCommands; owner 2026-10-13). The ids the snapshot holds
// reserved stay reserved, so the round trip keeps the hash; no entry on the restored path releases them, so the paths part once the live
// path would (an open question for the owner: save.test.ts pins it with it.fails).
// TODO(S5): the feed (ui/feed.ts, which this layer cannot import) joins the snapshot through a hook; the profile's cp and mp join the
// state hash (03 11) in the slice that first awards points, which re-records the det fixtures (S3 must keep them: 07 S3.7 item 1).
import { FNV_SEED, fnvStep } from '../core/math.ts';
import { rngN, setSimState, setVisState, simState, visState } from '../core/rng.ts';
import { idsState, setIdsState } from '../core/ids.ts';
import { T } from '../core/clock.ts';
import { emit } from '../core/events.ts';
import { W, markWetUnknown, overridesState, setOverridesState } from '../core/weather.ts';
import { log, setLog } from '../core/commands.ts';
import { SIM_DT, setTick, tick } from '../core/loop.ts';
import { getAvatar, getMode, getPlayer, setMode } from '../play/mode.ts';
import { nextSpecies, setNextSpecies } from '../play/tools.ts';
import {
  BEDC, ICE, KIND, NC, OCC, PAVEDAY, PETALS, WATER, WEAR, WET, props, propsState, rebuildBlock, setLayersState, setPropsState,
  type LayersState, type Prop,
} from '../world/grid.ts';
import { parkSeed, setParkSeed } from '../world/gen.ts';
import { iceState, setIceState } from '../world/water.ts';
import { markCharmDirty } from '../world/charm.ts';
import { defaultProfile, migratePark, migrateProfile } from './migrate.ts';
import { SCHEMA_VERSION, type LayersSave, type ParkSaveV1, type ProfileV1, type WeatherSave } from './schema.ts';

export const PROFILE_KEY = 'parque:profile-v1';
export const PARK_KEY = 'parque:park-v1';
/** Autosave every 30 sim seconds (register 3.11). */
export const AUTOSAVE_S = 30;
/** The same in fixed steps (1800): the count stays whole, so no float sum of 1/60 drifts below 30 (loop.ts wear does the same). */
const AUTOSAVE_STEPS = Math.round(AUTOSAVE_S / SIM_DT);

/* ---------- localStorage, every access caught (03 11 Failure handling) ---------- */

type Op = 'read' | 'write' | 'remove' | 'parse';

/** One `warn` event for a failed save operation: what failed and on which key (a log line for the dev console, not a player string). */
function warn(op: Op, key: string): void {
  emit({ kind: 'warn', tick: tick(), params: { what: 'save.' + op, key } });
}

/** The page's localStorage, or undefined when the host has none. Reading the global itself can throw (blocked site data): callers catch. */
function ls(): Storage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage;
}

/** The text under `key` (null when absent or when there is no storage); ok false when the storage threw. */
function read(key: string): { ok: boolean; text: string | null } {
  try {
    const s = ls();
    return { ok: true, text: s ? s.getItem(key) : null };
  } catch {
    return { ok: false, text: null };
  }
}

/** Write `text` under `key`; false when there is no storage or it threw (quota, private mode). */
function write(key: string, text: string): boolean {
  try {
    const s = ls();
    if (!s) return false;
    s.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

/** Remove `key`; true when it is gone (or there is no storage to hold it), false when the storage threw. */
function remove(key: string): boolean {
  try {
    ls()?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/* ---------- the profile (03 3.9) ---------- */

let prof: ProfileV1 | null = null;

/**
 * Read parque:profile-v1 into the in-memory profile: the migrated profile, or the defaults of 08 2.6 (no points, tier 0, English, sound
 * on, the dial at 1) when it is absent, unreadable or not a profile. Emits nothing: returns the operation that failed ('read' or 'parse'),
 * or null, for the caller to report, so that one public call emits at most one `warn` (08 2.6 row 6).
 */
function readProfile(): Op | null {
  const r = read(PROFILE_KEY);
  let p: ProfileV1 | null = null;
  let failed: Op | null = null;
  if (!r.ok) failed = 'read';
  else if (r.text !== null) {
    p = migrateProfile(r.text);
    if (!p) failed = 'parse';
  }
  prof = p ?? defaultProfile();
  return failed;
}

/** Read parque:profile-v1 into the in-memory profile and return it (readProfile); one `warn` when it was unreadable or not a profile. */
export function loadProfile(): ProfileV1 {
  const failed = readProfile();
  if (failed) warn(failed, PROFILE_KEY);
  return prof as ProfileV1;
}

/** The in-memory profile the game edits, loaded once on first use (03 2.10 `profile()`). */
export function getProfile(): ProfileV1 {
  return prof ?? loadProfile();
}

/**
 * The in-memory profile for a call that writes: loaded quietly when it is not in memory yet, with the read that failed (or null) handed
 * back, so the call reports one `warn` for all its accesses (warnFirst).
 */
function profileToWrite(): { p: ProfileV1; failed: Op | null } {
  const failed = prof ? null : readProfile();
  return { p: prof as ProfileV1, failed };
}

/** Write profile `p`; its write serial (`updatedAt`) moves on only when the write lands. */
function writeProfile(p: ProfileV1): boolean {
  if (!write(PROFILE_KEY, JSON.stringify({ ...p, updatedAt: p.updatedAt + 1 }))) return false;
  p.updatedAt++;
  return true;
}

/** The one `warn` of a public call: the first failure of `fails` ([the operation that failed or null, its key], most important first). */
function warnFirst(...fails: Array<[Op | null, string]>): void {
  const f = fails.find(([op]) => op !== null);
  if (f) warn(f[0] as Op, f[1]);
}

/**
 * Write the in-memory profile to parque:profile-v1; false (and one `warn`) when it did not land. A profile not yet in memory is read
 * first; when that read fails the defaults are written, with one `warn` for the read if the write landed. Never throws.
 */
export function saveProfile(): boolean {
  const { p, failed } = profileToWrite();
  const ok = writeProfile(p);
  warnFirst([ok ? null : 'write', PROFILE_KEY], [failed, PROFILE_KEY]);
  return ok;
}

/** The Style Gate pick: 'A' | 'B' | 'C' (04 4.4 item 2). At most one `warn`, as saveProfile. */
export function setStylePick(pick: string): void {
  const { p, failed } = profileToWrite();
  p.stylePick = pick;
  warnFirst([writeProfile(p) ? null : 'write', PROFILE_KEY], [failed, PROFILE_KEY]);
}

/** The Music Gate pick: 'A' | 'B' | 'C' (05 6.4). At most one `warn`, as saveProfile. */
export function setMusicPick(pick: string): void {
  const { p, failed } = profileToWrite();
  p.musicPick = pick;
  warnFirst([writeProfile(p) ? null : 'write', PROFILE_KEY], [failed, PROFILE_KEY]);
}

/* ---------- the park key (register 3.11, 03 11) ---------- */

let autoSteps = 0;

function readPark(loud: boolean): ParkSaveV1 | null {
  const r = read(PARK_KEY);
  if (!r.ok) {
    if (loud) warn('read', PARK_KEY);
    return null;
  }
  if (r.text === null) return null;
  const s = migratePark(r.text);
  if (!s && loud) warn('parse', PARK_KEY);
  return s;
}

/**
 * The saved park, migrated to the current version (migrate.ts), or null when there is none or it cannot be read, parsed or migrated
 * (one `warn` for the last three; the key is left as it is, and the next write replaces it). Continue is restore(loadPark()) (03 11).
 */
export function loadPark(): ParkSaveV1 | null {
  return readPark(true);
}

/** True when loadPark() would give a park: the intro shows Continue on it (03 11: a damaged save shows Begin without Continue). */
export function hasPark(): boolean {
  return readPark(false) !== null;
}

/**
 * The autosave (register 3.11): the park and the profile together, the dial (never the pause) copied into the profile's settings first
 * (03 4.6). Restarts the 30-second count. Returns true when both keys were written; on a failure false. Whatever failed, one call emits
 * at most one `warn`, naming the first failure of: the park write, the profile write, the profile read (a profile not yet in memory is
 * read here, quietly). Never throws.
 */
export function savePark(): boolean {
  autoSteps = 0;
  let text: string;
  try {
    text = JSON.stringify(snapshot());
  } catch {
    warn('write', PARK_KEY);
    return false;
  }
  const { p, failed } = profileToWrite();
  if (T.speed > 0) p.settings.speed = T.speed;
  const okPark = write(PARK_KEY, text);
  const okProfile = writeProfile(p);
  warnFirst([okPark ? null : 'write', PARK_KEY], [okProfile ? null : 'write', PROFILE_KEY], [failed, PROFILE_KEY]);
  return okPark && okProfile;
}

/**
 * The extra park write on park.new (03 17 A24): main.ts calls it after the player confirms New and before clearPark, so the key never
 * holds a half-written park whatever happens to the steps that follow. Returns what savePark returns.
 */
export function saveBeforeNew(): boolean {
  return savePark();
}

/**
 * New (03 11): the park key goes and the profile counts one more park played (written at once). Returns false when the storage threw;
 * at most one `warn` per call, as savePark. Never throws.
 */
export function clearPark(): boolean {
  autoSteps = 0;
  const { p, failed } = profileToWrite();
  const okPark = remove(PARK_KEY);
  p.parksPlayed++;
  const okProfile = writeProfile(p);
  warnFirst([okPark ? null : 'remove', PARK_KEY], [okProfile ? null : 'write', PROFILE_KEY], [failed, PROFILE_KEY]);
  return okPark && okProfile;
}

/** Both keys gone and the in-memory profile back to its defaults (the harness clearAll, 03 13). False (one `warn`) on a failure. */
export function clearAll(): boolean {
  autoSteps = 0;
  prof = defaultProfile();
  const okPark = remove(PARK_KEY);
  const okProfile = remove(PROFILE_KEY);
  warnFirst([okPark ? null : 'remove', PARK_KEY], [okProfile ? null : 'remove', PROFILE_KEY]);
  return okPark && okProfile;
}

/**
 * Count the `ns` steps a frame ran (ns x SIM_DT sim seconds; none while paused) and write the park and the profile once 30 sim seconds
 * have passed since the last write (register 3.11). Returns true on the call that wrote.
 */
export function stepAutosave(ns: number): boolean {
  if (!(ns > 0)) return false;
  autoSteps += Math.floor(ns);
  if (autoSteps < AUTOSAVE_STEPS) return false;
  savePark();
  return true;
}

/** Start the 30-second count over (a Continue or a new park: the first autosave comes 30 sim seconds later). */
export function resetAutosave(): void {
  autoSteps = 0;
}

/* ---------- the park snapshot, restore and state hash (03 3.10, 11) ---------- */

const LAYER_NAMES = ['KIND', 'WEAR', 'OCC', 'WATER', 'ICE', 'WET', 'PETALS', 'BEDC', 'PAVEDAY'] as const;
const LAYERS = { KIND, WEAR, OCC, WATER, ICE, WET, PETALS, BEDC, PAVEDAY };

function bytesOf(a: ArrayBufferView): Uint8Array {
  if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) throw new Error('layers are saved little-endian; this host is not');
  return new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
}

function toBase64(a: ArrayBufferView): string {
  const u8 = bytesOf(a);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64<T extends ArrayBufferView>(text: string, into: T): T {
  const bin = atob(text);
  const u8 = bytesOf(into);
  if (bin.length !== u8.length) throw new Error('a saved layer has the wrong length');
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return into;
}

function layersSave(): LayersSave {
  const out = {} as Record<string, string>;
  for (const k of LAYER_NAMES) out[k] = toBase64(LAYERS[k]);
  return out as LayersSave;
}

function layersFrom(s: LayersSave): LayersState {
  return {
    KIND: fromBase64(s.KIND, new Uint8Array(NC)),
    WEAR: fromBase64(s.WEAR, new Float32Array(NC)),
    OCC: fromBase64(s.OCC, new Uint16Array(NC)),
    WATER: fromBase64(s.WATER, new Float32Array(NC)),
    ICE: fromBase64(s.ICE, new Uint8Array(NC)),
    WET: fromBase64(s.WET, new Float32Array(NC)),
    PETALS: fromBase64(s.PETALS, new Float32Array(NC)),
    BEDC: fromBase64(s.BEDC, new Uint8Array(NC)),
    PAVEDAY: fromBase64(s.PAVEDAY, new Int16Array(NC)),
  };
}

function weatherBlock(): WeatherSave {
  return {
    kind: W.kind, next: W.next, cloud: W.cloud, rain: W.rain, mist: W.mist, snow: W.snow, wind: W.wind, windP: W.windP, wet: W.wet,
    overrides: overridesState(), ice: iceState(),
  };
}

/** What the engine owns beyond the layers; the lists the later slices fill are empty until then. */
function lists(): Pick<ParkSaveV1, 'visitors' | 'pairs' | 'creatures' | 'effects' | 'sides' | 'regulars' | 'alumni' | 'pinnedPair' | 'paving' | 'mode' | 'tally' | 'feed'> {
  return {
    visitors: [], pairs: [], creatures: [], effects: [],
    sides: { cooldowns: { park: {}, cupid: {}, mischief: {} }, charges: { park: {}, cupid: {}, mischief: {} } },
    regulars: [], alumni: [], pinnedPair: 0, paving: { runsToday: 0, day: 0 },
    mode: { mode: getMode(), player: getPlayer(), avatar: getAvatar() },
    tally: { day: 1, cp: 0, mp: 0 },
    feed: [],
  };
}

/** The whole park as plain JSON: typed arrays as base64, no object references. */
export function snapshot(): ParkSaveV1 {
  return {
    v: SCHEMA_VERSION as 1,
    seed: parkSeed(),
    tick: tick(),
    rng: { sim: simState(), simN: rngN(), vis: visState() },
    weather: weatherBlock(),
    layers: layersSave(),
    ids: idsState(),
    props: propsState(),
    ...lists(),
    log: log().map((c) => ({ ...c })),
    treeTurn: nextSpecies(),
  };
}

/**
 * Put the park back as a snapshot left it, silently (no events; the queued commands and events go with the old timeline). MODE and PLAYER
 * come back with it; every derived cache follows: BLOCK is rebuilt at once, the water bodies and the render caches see a new world version
 * (markBlockDirty), the charm field is marked dirty, the id counters, free list and reservations are the snapshot's, the undo stack is
 * emptied (setLog's restore hooks: never saved, register 3.11) and the tree cycle is the snapshot's. The ids reserved for the emptied
 * entries stay reserved for good (open question in the file header). Throws on a snapshot of another version or with a damaged layer,
 * before anything changes: loadPark() only hands over saves migrate.ts checked.
 */
export function restore(s: ParkSaveV1): void {
  if (s.v !== SCHEMA_VERSION) throw new Error('unknown park save version ' + String(s.v));
  const layers = layersFrom(s.layers); // decode first: a damaged save throws before anything is changed
  setParkSeed(s.seed);
  setIdsState(s.ids);
  setLayersState(layers);
  setPropsState(s.props);
  const w = s.weather;
  W.kind = w.kind;
  W.next = w.next;
  W.cloud = w.cloud;
  W.rain = w.rain;
  W.mist = w.mist;
  W.snow = w.snow;
  W.wind = w.wind;
  W.windP = w.windP;
  W.wet = w.wet;
  W.drift = 0; // visual only, not saved
  setOverridesState(w.overrides);
  setIceState(w.ice);
  markWetUnknown();
  setSimState(s.rng.sim, s.rng.simN);
  setVisState(s.rng.vis);
  setMode(s.mode.mode, s.mode.avatar ?? undefined, s.mode.player);
  setTick(s.tick);
  setLog(s.log); // runs the restore hooks: undo.ts empties its stack, tools.ts derives a tree cycle ...
  if (typeof s.treeTurn === 'number') setNextSpecies(s.treeTurn); // ... which the saved one replaces
  rebuildBlock();
  markCharmDirty();
}

/** Key-sorted JSON, so two equal records hash alike whatever order their fields were written in. */
function canon(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map((x) => (x === undefined ? 'null' : canon(x))).join(',') + ']';
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const parts: string[] = [];
    for (const k of Object.keys(o).sort()) if (o[k] !== undefined) parts.push(JSON.stringify(k) + ':' + canon(o[k]));
    return '{' + parts.join(',') + '}';
  }
  return JSON.stringify(v) ?? 'null';
}

function byId<T extends { id: number }>(list: readonly T[]): T[] {
  return list.slice().sort((a, b) => a.id - b.id);
}

class Hasher {
  h = FNV_SEED | 0;
  part(tag: string, data: string | Uint8Array): void {
    this.h = fnvStep(this.h, tag + ':');
    this.h = fnvStep(this.h, data);
    this.h = fnvStep(this.h, ';');
  }
  layersAndProps(): void {
    for (const k of LAYER_NAMES) this.part(k, bytesOf(LAYERS[k]));
    this.part('props', canon(byId<Prop>(props)));
  }
  get value(): number {
    return this.h >>> 0;
  }
}

/**
 * FNV-1a over tick, the sim stream's state and draw count, the full weather block with the ice timers, the id counters and free lists,
 * the paving tally, the nine layers' bytes and the canonical JSON of the props and the rest of the engine's lists, each sorted by id
 * (03 11). Not hashed: the seed, the feed, the log, the pinned pair, the visual stream, T.speed.
 */
export function stateHash(): number {
  const hs = new Hasher();
  hs.part('tick', String(tick()));
  hs.part('sim', String(simState()));
  hs.part('simN', String(rngN()));
  hs.part('weather', canon(weatherBlock()));
  hs.part('ids', canon(idsState()));
  const l = lists();
  hs.part('paving', canon(l.paving));
  hs.layersAndProps();
  hs.part('visitors', canon(byId(l.visitors)));
  hs.part('pairs', canon(byId(l.pairs)));
  hs.part('creatures', canon(byId(l.creatures)));
  hs.part('effects', canon(byId(l.effects)));
  hs.part('sides', canon(l.sides));
  hs.part('regulars', canon(l.regulars));
  hs.part('alumni', canon(l.alumni));
  hs.part('tally', canon(l.tally));
  hs.part('mode', canon(l.mode));
  return hs.value;
}

/** FNV-1a over the nine layers and the props only: what a tool test needs (07 S2.6 item 14). */
export function worldHash(): number {
  const hs = new Hasher();
  hs.layersAndProps();
  return hs.value;
}
