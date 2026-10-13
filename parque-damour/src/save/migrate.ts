// src/save/migrate.ts
// migrateProfile(raw) and migratePark(raw): parse, lift an older version one function per step, then check the v1 shape, so restore()
// never meets a value it cannot take (03 2.10, 11). NEW (GV has no save, review section 11).
// Never throws: text that is not JSON, a version this build does not know, a missing or mistyped park field all give null (08 2.6 migrate
// rows); store.ts then reports no park (the intro shows Begin without Continue) or uses the default profile, with one `warn` (03 11).
// A profile is lenient field by field (a bad or missing field takes its default), because S1's boards wrote parque:profile-v1 before the
// points existed; a park is strict, because a half-right park would break the sim.
// Version 0 is the unversioned draft that the placeholders lift (03 11 Migration): no `v` (or v 0). A v0 profile holds its settings flat
// at the top level (lang, muted, speed) and no points; a v0 park holds seed, tick, rng, the weather without the ice timers, the layers it
// has (a layer it lacks is all zero), the id counters without propReserved, and the props; nothing else. Each later version adds one
// function here and one fixture under tests/fixtures/.
import { PROP_ID_MAX } from '../core/ids.ts';
import { AVATAR_SIDE } from '../core/commands.ts';
import { WEATHER_KINDS } from '../core/weather.ts';
import { BEDC, ICE, KIND, KIND_KEYS, OCC, PAVEDAY, PETALS, WATER, WEAR, WET } from '../world/grid.ts';
import { SCHEMA_VERSION, type ParkSaveV1, type ProfileV1, type Tier } from './schema.ts';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo = -Infinity, hi = Infinity): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isStr = (v: unknown): v is string => typeof v === 'string';
const INT32_MIN = -0x80000000;
const UINT32_MAX = 0xffffffff;

/** JSON text or an already parsed value; undefined when the text is not JSON. */
function parse(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/* ---------- the profile (03 3.9) ---------- */

const PICKS: readonly string[] = ['A', 'B', 'C'];

/** A profile nobody has played yet (08 2.6 migrate row 3): no points, tier 0 on both ladders, English, sound on, the dial at 1. */
export function defaultProfile(): ProfileV1 {
  return {
    v: 1,
    cp: 0,
    mp: 0,
    tierC: 0,
    tierM: 0,
    unlocked: [],
    settings: { lang: 'en', muted: false, speed: 1 },
    stylePick: null,
    musicPick: null,
    parksPlayed: 0,
    updatedAt: 0,
  };
}

/** v0 to v1 (placeholder): the flat settings move under `settings`; the points, tiers and counters start at their defaults. */
export function profileV0toV1(o: Obj): Obj {
  const settings = isObj(o.settings) ? o.settings : { lang: o.lang, muted: o.muted, speed: o.speed };
  return { v: 1, settings, stylePick: o.stylePick, musicPick: o.musicPick };
}

/** The v1 profile with every field checked: a field that is missing or of the wrong type takes its default. */
function profileFrom(o: Obj): ProfileV1 {
  const p = defaultProfile();
  if (isNum(o.cp) && o.cp >= 0) p.cp = o.cp;
  if (isNum(o.mp) && o.mp >= 0) p.mp = o.mp;
  if (isInt(o.tierC, 0, 4)) p.tierC = o.tierC as Tier;
  if (isInt(o.tierM, 0, 4)) p.tierM = o.tierM as Tier;
  if (Array.isArray(o.unlocked)) p.unlocked = o.unlocked.filter(isStr);
  const s = isObj(o.settings) ? o.settings : {};
  if (s.lang === 'en' || s.lang === 'es') p.settings.lang = s.lang;
  if (typeof s.muted === 'boolean') p.settings.muted = s.muted;
  if (isInt(s.speed, 1, 8)) p.settings.speed = s.speed;
  if (isStr(o.stylePick) && PICKS.includes(o.stylePick)) p.stylePick = o.stylePick;
  if (isStr(o.musicPick) && PICKS.includes(o.musicPick)) p.musicPick = o.musicPick;
  if (isInt(o.parksPlayed, 0)) p.parksPlayed = o.parksPlayed;
  if (isInt(o.updatedAt, 0)) p.updatedAt = o.updatedAt;
  return p;
}

/** parque:profile-v1 as text or as parsed JSON, brought to v1; null for anything that is not a profile (never throws). */
export function migrateProfile(raw: unknown): ProfileV1 | null {
  try {
    const o = parse(raw);
    if (!isObj(o)) return null;
    if (o.v === undefined || o.v === 0) return profileFrom(profileV0toV1(o));
    if (o.v === SCHEMA_VERSION) return profileFrom(o);
    return null;
  } catch {
    return null;
  }
}

/* ---------- the park (03 3.10) ---------- */

const LAYER_NAMES = ['KIND', 'WEAR', 'OCC', 'WATER', 'ICE', 'WET', 'PETALS', 'BEDC', 'PAVEDAY'] as const;
type LayerName = (typeof LAYER_NAMES)[number];
/** The byte length of each saved layer (03 3.2): NC elements of its type. */
const LAYER_BYTES: Readonly<Record<LayerName, number>> = {
  KIND: KIND.byteLength,
  WEAR: WEAR.byteLength,
  OCC: OCC.byteLength,
  WATER: WATER.byteLength,
  ICE: ICE.byteLength,
  WET: WET.byteLength,
  PETALS: PETALS.byteLength,
  BEDC: BEDC.byteLength,
  PAVEDAY: PAVEDAY.byteLength,
};
const AVATAR_IDS: readonly string[] = Object.keys(AVATAR_SIDE);
const SIDES = ['park', 'cupid', 'mischief'] as const;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** `n` zero bytes as base64 (a layer a v0 park lacks). */
function zeros64(n: number): string {
  const tail = n % 3;
  return 'A'.repeat(Math.floor(n / 3) * 4) + (tail === 1 ? 'AA==' : tail === 2 ? 'AAA=' : '');
}

/** The bytes of a base64 layer, or null when the text is not base64 of exactly `bytes` bytes. */
function bytesOf64(text: unknown, bytes: number): Uint8Array | null {
  if (!isStr(text) || text.length % 4 !== 0 || !B64.test(text)) return null;
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  if ((text.length / 4) * 3 - pad !== bytes) return null;
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The player's trees standing, mod 3: the tree cycle as far as a park without one can tell (play/tools.ts derivedSpecies). */
function treeTurnOf(props: unknown): number {
  let n = 0;
  if (Array.isArray(props)) for (const p of props) if (isObj(p) && p.kind === 'tree' && p.placedBy === 'player') n++;
  return n % 3;
}

/** v0 to v1 (placeholder): the fields v1 added take what a new park would hold; a missing layer is all zero. */
export function parkV0toV1(o: Obj): Obj {
  const layers: Obj = isObj(o.layers) ? { ...o.layers } : {};
  for (const k of LAYER_NAMES) if (layers[k] === undefined) layers[k] = zeros64(LAYER_BYTES[k]);
  const w: Obj = isObj(o.weather) ? { ...o.weather } : {};
  if (w.overrides === undefined) w.overrides = [];
  if (w.ice === undefined) w.ice = { on: 0, snowT: 0, dryT: 0 };
  const ids: Obj = isObj(o.ids) ? { ...o.ids } : {};
  if (ids.propFree === undefined) ids.propFree = [];
  if (ids.propReserved === undefined) ids.propReserved = [];
  return {
    v: 1,
    seed: o.seed,
    tick: o.tick,
    rng: o.rng,
    weather: w,
    layers,
    ids,
    props: o.props,
    visitors: [],
    pairs: [],
    creatures: [],
    effects: [],
    sides: { cooldowns: { park: {}, cupid: {}, mischief: {} }, charges: { park: {}, cupid: {}, mischief: {} } },
    regulars: [],
    alumni: [],
    pinnedPair: 0,
    paving: { runsToday: 0, day: 0 },
    mode: { mode: 'creator', player: 0, avatar: null },
    tally: { day: 1, cp: 0, mp: 0 },
    feed: [],
    log: [],
    treeTurn: treeTurnOf(o.props),
  };
}

const allNum = (o: unknown, keys: readonly string[]): boolean => isObj(o) && keys.every((k) => isNum(o[k]));
const listOf = (v: unknown, each: (x: unknown) => boolean): boolean => Array.isArray(v) && v.every(each);
const isRec = (x: unknown): boolean => isObj(x) && isInt(x.id, 1);
const numMap = (v: unknown): boolean => isObj(v) && Object.values(v).every(isNum);
const perSide = (v: unknown): boolean => isObj(v) && SIDES.every((s) => numMap(v[s]));

function weatherOk(w: unknown): boolean {
  if (!isObj(w) || !isStr(w.kind) || !(WEATHER_KINDS as readonly string[]).includes(w.kind)) return false;
  if (!allNum(w, ['next', 'cloud', 'rain', 'mist', 'snow', 'wind', 'windP', 'wet'])) return false;
  const ice = w.ice;
  if (!isObj(ice) || (ice.on !== 0 && ice.on !== 1) || !isNum(ice.snowT) || !isNum(ice.dryT)) return false;
  return listOf(w.overrides, (o) => isObj(o) && isInt(o.id, 1) && isStr(o.kind) && allNum(o, ['x', 'y', 'r', 'until']) && isObj(o.targets));
}

function idsOk(ids: unknown): ids is { prop: number; propFree: number[]; propReserved: number[] } {
  if (!isObj(ids) || !['visitor', 'pair', 'creature', 'effect'].every((k) => isInt(ids[k], 0))) return false;
  if (!isInt(ids.prop, 0, PROP_ID_MAX)) return false;
  const inRange = (x: unknown): boolean => isInt(x, 1, ids.prop as number);
  return listOf(ids.propFree, inRange) && listOf(ids.propReserved, inRange);
}

function propOk(p: unknown): boolean {
  return (
    isObj(p) && isInt(p.id, 1, PROP_ID_MAX) && isStr(p.kind) && isInt(p.x) && isInt(p.y) && isInt(p.w, 1) && isInt(p.h, 1) &&
    isInt(p.rot, 0, 3) && (p.placedBy === 'gen' || p.placedBy === 'player' || p.placedBy === 'sim') && typeof p.passable === 'boolean' &&
    isNum(p.untilTick) && isObj(p.data)
  );
}

/**
 * The layers decode to their lengths, the tile values are in range, and the ids agree with the props: each prop id is unique, handed
 * out (at most ids.prop) and neither free nor reserved, and OCC names only listed props that block (03 3.1, 3.2).
 */
function worldOk(layers: Obj, ids: { prop: number; propFree: number[]; propReserved: number[] }, props: Obj[]): boolean {
  const bytes = {} as Record<LayerName, Uint8Array>;
  for (const k of LAYER_NAMES) {
    const b = bytesOf64(layers[k], LAYER_BYTES[k]);
    if (!b) return false;
    bytes[k] = b;
  }
  if (bytes.KIND.some((v) => v >= KIND_KEYS.length) || bytes.ICE.some((v) => v > 1) || bytes.BEDC.some((v) => v > 3)) return false;
  const idle = new Set([...ids.propFree, ...ids.propReserved]);
  const blocking = new Set<number>();
  const seen = new Set<number>();
  for (const p of props) {
    const id = p.id as number;
    if (seen.has(id) || id > ids.prop || idle.has(id)) return false;
    seen.add(id);
    if (!p.passable) blocking.add(id);
  }
  const occ = bytes.OCC;
  for (let i = 0; i < occ.length; i += 2) {
    const id = (occ[i] as number) | ((occ[i + 1] as number) << 8); // little-endian (03 3.2)
    if (id !== 0 && !blocking.has(id)) return false;
  }
  return true;
}

/** A v1 park with every field restore() reads checked; null on the first one that is missing, mistyped or out of range. */
function checkPark(o: Obj): ParkSaveV1 | null {
  if (o.v !== SCHEMA_VERSION || !isInt(o.seed, 0, UINT32_MAX) || !isInt(o.tick, 0)) return null;
  const rng = o.rng;
  if (!isObj(rng) || !isInt(rng.sim, INT32_MIN, UINT32_MAX) || !isInt(rng.simN, 0) || !isInt(rng.vis, INT32_MIN, UINT32_MAX)) return null;
  if (!weatherOk(o.weather) || !isObj(o.layers) || !idsOk(o.ids) || !listOf(o.props, propOk)) return null;
  if (!worldOk(o.layers, o.ids, o.props as Obj[])) return null;
  for (const k of ['visitors', 'pairs', 'creatures', 'effects']) if (!listOf(o[k], isRec)) return null;
  const sides = o.sides;
  if (!isObj(sides) || !perSide(sides.cooldowns) || !perSide(sides.charges)) return null;
  if (!listOf(o.regulars, isObj) || !listOf(o.alumni, isObj) || !listOf(o.feed, isObj) || !isInt(o.pinnedPair, 0)) return null;
  if (!allNum(o.paving, ['runsToday', 'day']) || !allNum(o.tally, ['day', 'cp', 'mp'])) return null;
  const m = o.mode;
  if (!isObj(m) || (m.mode !== 'creator' && m.mode !== 'avatar') || !isInt(m.player, 0)) return null;
  if (m.avatar !== null && !(isStr(m.avatar) && AVATAR_IDS.includes(m.avatar))) return null;
  const cmdOk = (c: unknown): boolean => isObj(c) && isInt(c.tick, 0) && isInt(c.seq, 0) && isStr(c.side) && isStr(c.kind) && isObj(c.payload);
  if (!listOf(o.log, cmdOk) || !isInt(o.treeTurn, 0, 2)) return null;
  return o as unknown as ParkSaveV1;
}

/** parque:park-v1 as text or as parsed JSON, brought to v1 and checked; null for anything restore() could not take (never throws). */
export function migratePark(raw: unknown): ParkSaveV1 | null {
  try {
    const o = parse(raw);
    if (!isObj(o)) return null;
    if (o.v === undefined || o.v === 0) return checkPark(parkV0toV1(o));
    return checkPark(o);
  } catch {
    return null;
  }
}
