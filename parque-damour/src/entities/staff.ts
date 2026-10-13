// src/entities/staff.ts
// The staff of 02 4.3 (the gardener and the vendors), the gardener's paving job (02 11.1 items 4-6), and the facility index of the 1.2 s
// planning tick (03 4.3 item 1: benches, tables, picnic spots, kiosks, shelter tiles, the two path loops, viewpoints, family lawn spots).
// NEW. GV 3393-3395 (the paving plan inside planEmergent) for the idea only: a worn run becomes a job for one walker who lays it piece by
// piece (GV LAY_T 4554 idiom, 1.3 s per tile here).
// The gardener enters at g_west 10 s (600 steps) after a new park and never leaves (02 4.2 item 8). The paving search runs every 60 s
// (3600 steps, every 50th planning tick) and keeps a pending run for the gardener, at most 3 a day (06 1.4 CAP_PAVING_RUNS_DAY); the
// gardener's routine (brain.ts) walks to it and act.ts lays it (layPaved). A vendor appears on its kiosk's serving tile when the kiosk is
// placed (vendorArrive, from the kiosk tool) or, for a kiosk without one (the starter kiosk, a kiosk placed while the park was full), at
// the next planning tick (ensureVendors); it vanishes with the kiosk (vendorLeave). A vendor's spawn draws nothing (a name and a look
// from the kiosk id, the starting needs at their middles), so a kiosk tool command and its undo leave the sim stream where it was, and the
// undo of a placement hands the vendor's VisitorId back by stepping the visitor counter back while it is still the last id handed out
// (ids.ts does the same for a minted PropId); VisitorIds are never recycled (03 3.1), so a removed vendor's record comes back under its
// own id when the removal is undone (vendorReturn). Together these make 08 2.5 "every tool undoes to the same hash" hold for the kiosk.
// The facility index is a pure function of the props and the tile layers, rebuilt whenever the world version moved (grid.ts), so a
// restored park and an uninterrupted one read the same index; the planning tick refreshes it as 03 4.3 orders. Free seats are read at
// query time from each prop's `sitters` (saved with the props).
import type { XY } from '../core/math.ts';
import { fnv1a } from '../core/math.ts';
import { DAYLEN, T } from '../core/clock.ts';
import { emit } from '../core/events.ts';
import { idsState, setIdsState, type PropId, type VisitorId } from '../core/ids.ts';
import { BLOCK, I, KIND, Kind, N, NC, inB, propById, props, rebuildBlock, worldVersion, type Prop } from '../world/grid.ts';
import { nearestGate } from '../world/park.ts';
import { findPavingRun } from '../world/wear.ts';
import { NAMES_F, NAMES_M, namesHeld, namesState, setNamesState, type Sex } from './names.ts';
import { CAP_PEOPLE, byId, nowTick, people, putVisitor, removeVisitor, spawnVisitor, visitors, type Visitor } from './visitor.ts';

/* ---------- numbers (02 4.2 item 8, 4.3, 11.1; 06 1.4, 1.8) ---------- */
export const GARDENER_ENTER_STEPS = 600; // 10 s after a new park (06 1.8 GARDENER_ENTER_T)
export const PAVE_STEPS = 3600; // the paving search every 60 s (06 1.8 PAVE_T)
export const CAP_PAVING_RUNS_DAY = 3;
export const LAY_T = 1.3; // s per gravel tile (GV LAY_T 4554)
export const TIDY_T = 6; // s at a bed
export const TIDY_EVERY = 120; // s between tidies

/* ---------- prop geometry ---------- */

/** The tile a kiosk serves from: the one south of its south-west tile (play/tools.ts servingTile, 02 8.3; kiosks are placed serving south). */
export function servingTile(k: Pick<Prop, 'x' | 'y' | 'h'>): XY {
  return { x: k.x, y: k.y + k.h };
}

function open(x: number, y: number): boolean {
  return inB(x, y) && BLOCK[I(x, y)] === 0;
}

/** The tile in front of a bench: the way it faces (rot 0 north, 1 east, 2 south, 3 west; grid.ts Prop). */
function frontOf(p: Prop): XY {
  const d = [[0, -1], [1, 0], [0, 1], [-1, 0]][p.rot] as [number, number];
  return { x: p.x + d[0], y: p.y + d[1] };
}

/**
 * Where a walker stands to use a prop: a bench's front tile, a kiosk's serving tile, else the first open tile of the ring around its
 * footprint (row order); null when the prop is walled in. A passable prop (a picnic blanket) is walked onto: its own north-west tile.
 */
export function approachOf(p: Prop): XY | null {
  rebuildBlock();
  if (p.passable && open(p.x, p.y)) return { x: p.x, y: p.y };
  const first = p.kind === 'bench' ? frontOf(p) : p.kind === 'kiosk' ? servingTile(p) : null;
  if (first && open(first.x, first.y)) return first;
  for (let y = p.y - 1; y <= p.y + p.h; y++)
    for (let x = p.x - 1; x <= p.x + p.w; x++) {
      if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) continue;
      if (open(x, y)) return { x, y };
    }
  return null;
}

/** The two seats of a bench, a table or a blanket: across a bench's width, either side of a table, side by side on a blanket. */
export function seatPos(p: Prop, k: number): XY {
  const s = k === 0 ? -1 : 1;
  if (p.kind === 'bench') return p.rot % 2 === 0 ? { x: p.x + 0.22 * s, y: p.y } : { x: p.x, y: p.y + 0.22 * s };
  if (p.kind === 'table') return { x: p.x + 0.3 * s, y: p.y };
  return { x: p.x + (p.w - 1) / 2 + 0.35 * s, y: p.y + (p.h - 1) / 2 };
}

/** Seats a prop has (06 4: bench, table and picnic 2). */
export const SEATS = 2;

/** Seats not taken or promised: a walker on its way holds its seat in `sitters` (first come, first served: 02 6.6 item 3). */
export function freeSeats(p: Prop): number {
  return SEATS - (p.data.sitters?.length ?? 0);
}

/* ---------- the facility index (03 4.3 item 1) ---------- */

/** The middle of the gen loops (02 2.5): a loop tile has floor(max(|x - 23.5|, |y - 23.5|)) in {5, 6} (inner) or {13, 14} (outer). */
export function ringOf(x: number, y: number): number {
  return Math.floor(Math.max(Math.abs(x - 23.5), Math.abs(y - 23.5)));
}
/** The corners a stroller walks round, inner loop then outer loop, on the ring's inside lane (02 2.5, 4.3 single item 1). */
export const LOOP_CORNERS: readonly (readonly XY[])[] = [
  [{ x: 18, y: 18 }, { x: 29, y: 18 }, { x: 29, y: 29 }, { x: 18, y: 29 }],
  [{ x: 10, y: 10 }, { x: 37, y: 10 }, { x: 37, y: 37 }, { x: 10, y: 37 }],
];
const LOOP_RINGS: readonly (readonly [number, number])[] = [[5, 6], [13, 14]];
/** A loop counts while it keeps at least this many gravel tiles (register 3.5 Stroll: a loop of >= 12 path tiles). */
export const LOOP_MIN_TILES = 12;
/** A family plays on lawn at least this far (Chebyshev) from any path tile (06 1.6 R_FAMILY_LAWN). */
export const R_FAMILY_LAWN = 4;

export type Facilities = {
  benches: Prop[]; tables: Prop[]; picnics: Prop[]; kiosks: Prop[]; fountains: Prop[]; bandstands: Prop[];
  shelter: number[]; // kiosk awning tiles, the ring round a bandstand, tiles next to a tree (02 5.2 rung 2)
  bedNear: number[]; // open tiles beside a bed (the gardener's tidy)
  lawnSpots: number[]; // open lawn at least 4 from any path (family play)
  pondEdge: number[]; // open tiles beside open pond water
  viewFountain: number[]; viewBandstand: number[]; viewNorth: number[]; // viewpoints (02 2.6): near a fountain, a bandstand, y <= 3
  junctions: number[]; // outer-loop tiles a gravel spoke joins (a busker's spot without a bandstand)
  loops: readonly [boolean, boolean]; // inner, outer: still a loop of >= 12 gravel tiles
};

let fac: Facilities | null = null;
let facVersion = -1;

function isPath(i: number): boolean {
  const k = KIND[i];
  return k === Kind.gravel || k === Kind.flagstone;
}

/** Every tile within Chebyshev `r` of the footprint of `p` but not on it, open, in row order. */
function ringTiles(p: Prop, r0: number, r1: number, out: Uint8Array): void {
  for (let y = p.y - r1; y < p.y + p.h + r1; y++)
    for (let x = p.x - r1; x < p.x + p.w + r1; x++) {
      if (!inB(x, y)) continue;
      const d = Math.max(p.x - x, x - (p.x + p.w - 1), p.y - y, y - (p.y + p.h - 1));
      if (d >= r0 && d <= r1 && BLOCK[I(x, y)] === 0) out[I(x, y)] = 1;
    }
}

function listOf(mark: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < NC; i++) if (mark[i]) out.push(i);
  return out;
}

type TileLists = Pick<Facilities, 'bedNear' | 'lawnSpots' | 'pondEdge' | 'viewNorth' | 'junctions' | 'loops'>;
let tiles: TileLists | null = null;
let tilesKey = -1;

/** FNV-1a over KIND and BLOCK, four bytes at a time: the tile lists below depend on nothing else. */
function tileKey(): number {
  const k = new Uint32Array(KIND.buffer, KIND.byteOffset, NC >> 2);
  const b = new Uint32Array(BLOCK.buffer, BLOCK.byteOffset, NC >> 2);
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < k.length; i++) h = Math.imul(h ^ (k[i] as number), 16777619) ^ Math.imul(b[i] as number, 2246822519);
  return h >>> 0;
}

/** The lists that read only the tile layers: rebuilt when KIND or BLOCK changed, not when a passable prop (crumbs) came or went. */
function buildTiles(): TileLists {
  const f: TileLists = { bedNear: [], lawnSpots: [], pondEdge: [], viewNorth: [], junctions: [], loops: [false, false] };
  const nearPath = new Uint8Array(NC);
  for (let i = 0; i < NC; i++) {
    if (!isPath(i)) continue;
    const x = i % N, y = (i / N) | 0, r = R_FAMILY_LAWN - 1;
    for (let yy = Math.max(0, y - r); yy <= Math.min(N - 1, y + r); yy++)
      for (let xx = Math.max(0, x - r); xx <= Math.min(N - 1, x + r); xx++) nearPath[yy * N + xx] = 1;
  }
  const loopN = [0, 0];
  for (let i = 0; i < NC; i++) {
    const x = i % N, y = (i / N) | 0, k = KIND[i];
    const ring = ringOf(x, y);
    if (k === Kind.gravel)
      LOOP_RINGS.forEach(([a, b], l) => {
        if (ring === a || ring === b) loopN[l] = (loopN[l] as number) + 1;
      });
    if (BLOCK[i] === 1) continue;
    if (k === Kind.lawn && !nearPath[i]) f.lawnSpots.push(i);
    if (y >= 1 && y <= 3) f.viewNorth.push(i);
    let bed = false, pond = false, spoke = false;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx, kj = KIND[j];
      if (kj === Kind.bed) bed = true;
      if (kj === Kind.pond && BLOCK[j] === 1) pond = true;
      if (kj === Kind.gravel && ringOf(nx, ny) >= 15) spoke = true;
    }
    if (bed) f.bedNear.push(i);
    if (pond && k !== Kind.pond && k !== Kind.canal) f.pondEdge.push(i);
    if (spoke && k === Kind.gravel && (ring === 13 || ring === 14)) f.junctions.push(i);
  }
  f.loops = [loopN[0] as number >= LOOP_MIN_TILES, loopN[1] as number >= LOOP_MIN_TILES];
  return f;
}

function by(k: string): Prop[] {
  return props.filter((p) => p.kind === k);
}

function buildFacilities(): Facilities {
  rebuildBlock();
  const key = tileKey();
  if (!tiles || key !== tilesKey) {
    tiles = buildTiles();
    tilesKey = key;
  }
  const f: Facilities = {
    benches: by('bench'), tables: by('table'), picnics: props.filter((p) => p.kind === 'picnic' || p.kind === 'basket'), kiosks: by('kiosk'),
    fountains: by('fountain'), bandstands: by('bandstand'),
    shelter: [], viewFountain: [], viewBandstand: [], ...tiles,
  };
  const m = new Uint8Array(NC);
  for (const k of f.kiosks)
    for (let x = k.x; x < k.x + k.w; x++) if (open(x, k.y + k.h)) m[I(x, k.y + k.h)] = 1; // the awning over the serving side
  for (const b of f.bandstands) ringTiles(b, 1, 1, m);
  for (const t of by('tree')) ringTiles(t, 1, 1, m);
  f.shelter = listOf(m);
  m.fill(0);
  for (const fo of f.fountains) ringTiles(fo, 2, 3, m);
  f.viewFountain = listOf(m);
  m.fill(0);
  for (const b of f.bandstands) ringTiles(b, 1, 3, m);
  f.viewBandstand = listOf(m);
  return f;
}

/** The facility index, rebuilt when the world changed since the last build (a pure function of the props and the layers). */
export function facilities(): Facilities {
  const v = worldVersion();
  if (!fac || facVersion !== v) {
    fac = buildFacilities();
    facVersion = worldVersion();
  }
  return fac;
}

/** Tile index to its centre. */
export function tileXY(i: number): XY {
  return { x: i % N, y: (i / N) | 0 };
}

/** The tile of `list` nearest to (x, y) within `r` (Euclidean), the first in list order on a tie; -1 when none. */
export function nearestTile(list: readonly number[], x: number, y: number, r = Infinity): number {
  let best = -1, bd = r * r;
  for (const i of list) {
    const dx = (i % N) - x, dy = ((i / N) | 0) - y, d = dx * dx + dy * dy;
    if (d <= bd && (best < 0 || d < bd)) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/* ---------- the vendors (02 4.2 item 8, 4.3 vendor) ---------- */

/** A removed kiosk's vendor as the undo entry keeps it (03 5.6 item 2 `vendorRemoved`): a copy of its record. */
export type VendorRecord = Visitor;

/** The kiosk's vendor's id, or 0 when it has none in the park. */
export function vendorFor(kioskId: PropId): VisitorId {
  const id = propById(kioskId)?.data.vendorId ?? 0;
  return id !== 0 && byId(id) ? id : 0;
}

/** Hold a generated name for a visitor made without the draw of names.ts takeName (06 6.1: a name in use is not given twice). */
function holdName(name: string): void {
  const s = namesState();
  s.held.push(name);
  setNamesState(s);
}

/** A vendor's name without a draw: a free name of `sex` picked by the kiosk id (06 6.3 "vendor: generated"). */
function vendorName(sex: Sex, kioskId: PropId): string {
  const list = sex === 'f' ? NAMES_F : NAMES_M;
  const held = namesHeld();
  const free = list.filter((n) => !held.includes(n));
  const pool = free.length > 0 ? free : list;
  return pool[(kioskId * 7) % pool.length] as string;
}

/**
 * A vendor on the kiosk's serving tile, serving (02 4.3 vendor), or null when the park holds 30 people or the prop is not a kiosk.
 * Draws nothing: the sex by the kiosk id's parity (06 5.1 50/50), the name by vendorName, the look from the kiosk id and its own id.
 */
export function spawnVendor(kioskId: PropId): Visitor | null {
  const k = propById(kioskId);
  if (!k || k.kind !== 'kiosk' || people() >= CAP_PEOPLE) return null;
  const sex: Sex = kioskId % 2 === 1 ? 'f' : 'm';
  const name = vendorName(sex, kioskId);
  const st = servingTile(k);
  const lookSeed = fnv1a('vendor ' + kioskId + ' ' + (idsState().visitor + 1));
  const v = spawnVisitor('vendor', nearestGate(st.x, st.y).id, { sex, name, at: { x: st.x + 0.3, y: st.y - 0.25 }, drawless: { lookSeed } });
  if (!v) return null;
  holdName(name);
  v.st = 'serve';
  v.job = { propId: kioskId };
  k.data.vendorId = v.id;
  return v;
}

/** Every kiosk without a vendor in the park gets one (03 4.3 item 3: one per kiosk). */
export function ensureVendors(): void {
  for (const k of props) if (k.kind === 'kiosk' && vendorFor(k.id) === 0) spawnVendor(k.id);
}

/** A kiosk was placed (the `kiosk` tool): its vendor arrives (02 8.3 "spawns a vendor"). */
export function vendorArrive(kioskId: PropId): void {
  if (vendorFor(kioskId) === 0) spawnVendor(kioskId);
}

/**
 * A kiosk is going: its vendor leaves the park. Returns a copy of the record for the undo entry (03 5.6 item 2), or null when the kiosk
 * had none. `handBack` (the undo of the kiosk's placement): the vendor's VisitorId goes back too when nobody was given a later one.
 */
export function vendorLeave(kioskId: PropId, handBack = false): VendorRecord | null {
  const id = vendorFor(kioskId);
  const v = id ? byId(id) : undefined;
  if (!v) return null;
  const rec = JSON.parse(JSON.stringify(v)) as Visitor;
  removeVisitor(v.id);
  if (handBack) {
    const s = idsState();
    if (s.visitor === rec.id) setIdsState({ ...s, visitor: s.visitor - 1 });
  }
  return rec;
}

/** The undo put a removed kiosk back: its vendor returns as it was, under its own id (03 5.6 item 3). Nothing when it had none. */
export function vendorReturn(kioskId: PropId, rec: VendorRecord | null): void {
  const k = propById(kioskId);
  if (!rec || !k || !putVisitor(rec)) return;
  holdName(rec.name);
  k.data.vendorId = rec.id;
}

/* ---------- the gardener and the paving job (02 4.2 item 8, 11.1 items 4-6) ---------- */

export function gardener(): Visitor | undefined {
  for (const v of visitors) if (v.archetype === 'gardener') return v;
  return undefined;
}

/** Phase 7 (03 4.2): from 10 s after a new park, a gardener in the park; he enters at g_west and never leaves (02 4.2 item 8). */
export function ensureGardener(tick: number): void {
  if (tick < GARDENER_ENTER_STEPS || gardener()) return;
  const g = spawnVisitor('gardener', 'g_west');
  if (g) g.plan = T.abs + TIDY_EVERY / DAYLEN; // his first tidy is due 120 s after he comes in
}

/** The day's paving tally, and the run waiting for the gardener or being laid (`at` is the next tile). Saved and hashed (03 3.10). */
export type PavingState = { runsToday: number; day: number; run: XY[]; at: number };
let pav: PavingState = { runsToday: 0, day: 0, run: [], at: 0 };

/**
 * The planning tick's staff item (03 4.3 item 2): every 60 s, with a gardener in the park and no run pending, the paving search
 * (wear.ts findPavingRun) and, when it finds a run of 3 or more, the gardener's next job; at most 3 a day (02 11.1 items 4-5).
 */
export function stepStaffPlanning(tick: number): void {
  if (tick % PAVE_STEPS !== 0 || !gardener()) return;
  if (pav.day !== T.day) {
    pav.day = T.day;
    pav.runsToday = 0;
  }
  if (pav.run.length > 0 || pav.runsToday >= CAP_PAVING_RUNS_DAY) return;
  const run = findPavingRun(T.day);
  if (!run) return;
  pav.run = run;
  pav.at = 0;
  pav.runsToday++;
}

/** The next tile of the pending run, or null when none is pending. */
export function paveNext(): XY | null {
  return pav.run[pav.at] ?? null;
}

/** The gardener is done with the run's next tile (laid, or skipped because it is no longer lawn); the run ends after its last tile. */
export function paveAdvance(): void {
  pav.at++;
  if (pav.at >= pav.run.length) {
    pav.run = [];
    pav.at = 0;
  }
}

/** The first tile of a run is being laid: the feed line (02 11.1 item 5) rides on a gravel `step` (05 3.2 cue 1; events.ts has no feed kind). */
export function paveStarted(x: number, y: number): boolean {
  if (pav.at !== 0) return false;
  emit({ kind: 'step', tick: nowTick(), x, y, params: { surface: 'gravel', feed: 'feed.gardener' } });
  return true;
}

export function pavingState(): PavingState {
  return { runsToday: pav.runsToday, day: pav.day, run: pav.run.map((t) => ({ x: t.x, y: t.y })), at: pav.at };
}
export function setPavingState(s: Partial<PavingState> & { runsToday: number; day: number }): void {
  pav = { runsToday: s.runsToday, day: s.day, run: (s.run ?? []).map((t) => ({ x: t.x, y: t.y })), at: s.at ?? 0 };
}

/** A new park: no run, no tally; the index is rebuilt on its next use. */
export function resetStaff(): void {
  pav = { runsToday: 0, day: 0, run: [], at: 0 };
  fac = null;
  tiles = null;
}
