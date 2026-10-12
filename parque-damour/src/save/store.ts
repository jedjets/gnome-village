// src/save/store.ts
// Keys parque:profile-v1 and parque:park-v1; serialise, parse, autosave, the in-memory profile, the state hash (03 section 11).
// Nothing ported: GV has no save (review section 11). NEW.
// S1: the in-memory profile with loadProfile/saveProfile and the stylePick and musicPick writers the boards need (04 4.4 item 2).
// S2: snapshot, restore, stateHash and worldHash over the engine's state, in memory only (no localStorage for the park yet).
// TODO(S3): loadPark, savePark, clearPark, stepAutosave, points, tiers, unlocks; the profile's cp and mp join the state hash (03 11);
// the feed (ui/feed.ts, which this layer cannot import) is wired into the snapshot.
import { FNV_SEED, fnvStep } from '../core/math.ts';
import { rngN, setSimState, setVisState, simState, visState } from '../core/rng.ts';
import { idsState, setIdsState } from '../core/ids.ts';
import { W, markWetUnknown, overridesState, setOverridesState } from '../core/weather.ts';
import { log, setLog } from '../core/commands.ts';
import { setTick, tick } from '../core/loop.ts';
import { getAvatar, getMode, getPlayer, setMode } from '../play/mode.ts';
import {
  BEDC, ICE, KIND, NC, OCC, PAVEDAY, PETALS, WATER, WEAR, WET, props, propsState, setLayersState, setPropsState,
  type LayersState, type Prop,
} from '../world/grid.ts';
import { parkSeed, setParkSeed } from '../world/gen.ts';
import { iceState, setIceState } from '../world/water.ts';
import { markCharmDirty } from '../world/charm.ts';
import { SCHEMA_VERSION, type LayersSave, type ParkSaveV1, type ProfileV1, type WeatherSave } from './schema.ts';

export const PROFILE_KEY = 'parque:profile-v1';
export const PARK_KEY = 'parque:park-v1';

function freshProfile(): ProfileV1 {
  return { v: 1, settings: { lang: 'en', muted: false, speed: 1 }, stylePick: null, musicPick: null };
}

let profile: ProfileV1 | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Read parque:profile-v1 (a fresh profile when absent or unreadable); fields the file lacks take their defaults. */
export function loadProfile(): ProfileV1 {
  const base = freshProfile();
  const s = storage();
  if (!s) return base;
  try {
    const raw = s.getItem(PROFILE_KEY);
    if (!raw) return base;
    const o = JSON.parse(raw) as Partial<ProfileV1>;
    if (o.settings) base.settings = { ...base.settings, ...o.settings };
    if (typeof o.stylePick === 'string') base.stylePick = o.stylePick;
    if (typeof o.musicPick === 'string') base.musicPick = o.musicPick;
    return base;
  } catch {
    return base;
  }
}

/** The in-memory profile, loaded once on first use. */
export function getProfile(): ProfileV1 {
  if (!profile) profile = loadProfile();
  return profile;
}

/** Write the in-memory profile to parque:profile-v1; silently a no-op without storage. */
export function saveProfile(): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(PROFILE_KEY, JSON.stringify(getProfile()));
  } catch {
    /* quota or private mode: the profile lives in memory until the next try */
  }
}

/** The Style Gate pick: 'A' | 'B' | 'C' (04 4.4 item 2). */
export function setStylePick(pick: string): void {
  getProfile().stylePick = pick;
  saveProfile();
}

/** The Music Gate pick: 'A' | 'B' | 'C' (05 6.4). */
export function setMusicPick(pick: string): void {
  getProfile().musicPick = pick;
  saveProfile();
}

/** True when a park save exists; the intro shows Continue on it. */
export function hasPark(): boolean {
  const s = storage();
  try {
    return s !== null && s.getItem(PARK_KEY) !== null;
  } catch {
    return false;
  }
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
  };
}

/** Put the park back as a snapshot left it (silently: no events). Throws on a snapshot of another version or with a damaged layer. */
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
  setLog(s.log);
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
