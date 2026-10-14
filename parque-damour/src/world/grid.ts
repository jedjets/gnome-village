// src/world/grid.ts
// World constants, the per-tile typed-array layers (register 3.1, 03 3.2) and the prop list that stands on them (03 3.6).
// Ported from GV 567-568 (N, NC) and 612-673 (the layer arrays). ADAPT: one scale (S = 1), flat ground (E all zero), park kinds.
// The Prop type and the `props` list live here because world/gen.ts (L1) places props and entities/ (L2) may only import downward;
// entities/visitor.ts re-exports the type in S4 (03 3.6). Apron props (railing, gate, facade, quay) are never in this list (park.ts).
// S3: the park tools and their undo remove a prop with its id reserved or kept, and put one back under its old id (03 5.6 item 3);
// they rebuild BLOCK at once after a change (rebuildBlock below covers every tile a tool touched, so no per-tile variant is needed).
import { freePropId, nextPropId, type PropId, type VisitorId, type PairId } from '../core/ids.ts';

export const N = 48;
export const S = 1;
export const NC = N * N; // 2304

export function I(x: number, y: number): number {
  return y * N + x;
}
export function inB(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < N && y < N;
}

/** Tile kinds, spelled as register 3.1. (A const object, not an enum: the build strips types only.) */
export const Kind = {
  lawn: 0,
  gravel: 1,
  flagstone: 2,
  bed: 3,
  mulch: 4,
  pond: 5,
  canal: 6,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];
export const KIND_KEYS = ['lawn', 'gravel', 'flagstone', 'bed', 'mulch', 'pond', 'canal'] as const;

export const KIND = new Uint8Array(NC); // Kind
export const WEAR = new Float32Array(NC); // 0-4 desire paths
export const OCC = new Uint16Array(NC); // 0 or PropId of a non-passable prop
export const WATER = new Float32Array(NC); // 0 or 0.6
export const ICE = new Uint8Array(NC); // 0/1
export const WET = new Float32Array(NC); // 0-1 puddles
export const PETALS = new Float32Array(NC); // 0-1
export const BEDC = new Uint8Array(NC); // 0 rose, 1 lavender, 2 marigold, 3 white
export const PAVEDAY = new Int16Array(NC); // day the gardener last paved, 0 never
export const E = new Float32Array(NC); // ground height: always 0 in v1
export const BLOCK = new Uint8Array(NC); // derived: 1 blocked for walking

/** Bumped whenever KIND, OCC or the props change, so a cache (the water bodies, the charm field) knows to rebuild. */
let version = 1;
let blockDirty = true;

export function worldVersion(): number {
  return version;
}

export function markBlockDirty(): void {
  blockDirty = true;
  version++;
}

/* ---------- props (03 3.6) ---------- */

export type PropKind =
  | 'bench' | 'lamp' | 'fountain' | 'kiosk' | 'table' | 'bandstand' | 'picnic' | 'bridge' | 'hedge' | 'tree' | 'easel' | 'crumbs'
  | 'peel' | 'sprinkler' | 'basket' | 'rowboat' | 'umbrella' | 'railing' | 'gate' | 'facade' | 'quay';

export type PropData = {
  species?: 0 | 1 | 2; // tree: 0 plane, 1 chestnut, 2 lime
  stock?: number;
  sitters?: VisitorId[];
  vendorId?: VisitorId;
  tableIds?: PropId[];
  ownerId?: number;
  litUntil?: number;
  span?: number; // bridge: water tiles spanned
  dir?: 0 | 1; // bridge: 0 north-south, 1 east-west
  pairId?: PairId;
};

/**
 * x, y is the north-west tile; w, h the footprint in tiles. `rot` is quarter turns clockwise on the map (+x east, +y south) from
 * facing north: 0 north, 1 east, 2 south, 3 west. A bench faces `rot`; a kiosk serves on `rot` (0 serves south, by 06 section 3).
 */
export type Prop = {
  id: PropId;
  kind: PropKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: 0 | 1 | 2 | 3;
  placedBy: 'gen' | 'player' | 'sim';
  passable: boolean;
  untilTick: number; // 0 = permanent
  data: PropData;
};
export type NewProp = Omit<Prop, 'id' | 'data' | 'untilTick' | 'passable'> & { data?: PropData; untilTick?: number; passable?: boolean };

/** Passable by 06 section 4: the picnic blanket, crumbs, a banana peel and a bridge. */
const PASSABLE: ReadonlySet<PropKind> = new Set<PropKind>(['picnic', 'crumbs', 'peel', 'bridge', 'basket', 'umbrella', 'rowboat']);

export const props: Prop[] = [];
const byId = new Map<PropId, Prop>();

export function propById(id: PropId): Prop | undefined {
  return byId.get(id);
}

/** List a prop and write its id into OCC on every footprint tile when it blocks walking. */
function listProp(p: Prop): void {
  props.push(p);
  byId.set(p.id, p);
  if (!p.passable)
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (inB(x, y)) OCC[I(x, y)] = p.id;
  markBlockDirty();
}

/** Place a prop: allocate its id, list it, and write the id into OCC on every footprint tile when it blocks walking. */
export function addProp(spec: NewProp): Prop {
  const p: Prop = {
    id: nextPropId(),
    kind: spec.kind,
    x: spec.x,
    y: spec.y,
    w: spec.w,
    h: spec.h,
    rot: spec.rot,
    placedBy: spec.placedBy,
    passable: spec.passable ?? PASSABLE.has(spec.kind),
    untilTick: spec.untilTick ?? 0,
    data: spec.data ?? {},
  };
  listProp(p);
  return p;
}

/**
 * Put a removed prop back under its own id (the undo of a removal, 03 5.6 item 3). The caller has reclaimed the id (ids.ts
 * reclaimPropId); a prop whose id is listed already is refused (false), so two props never share an id.
 */
export function putProp(p: Prop): boolean {
  if (byId.has(p.id)) return false;
  listProp(JSON.parse(JSON.stringify(p)) as Prop);
  return true;
}

/**
 * Remove a prop: clear its OCC tiles and give its id back as `id` says: 'free' to the free queue, 'reserve' to be held for the undo entry
 * that can put it back (a park tool, ids.ts freePropId with reserve), 'keep' when the caller hands it back itself (the undo of a
 * placement, ids.ts unallocPropId). Returns the prop, or undefined when no such id is listed.
 */
export function removeProp(id: PropId, idTo: 'free' | 'reserve' | 'keep' = 'free'): Prop | undefined {
  const p = byId.get(id);
  if (!p) return undefined;
  props.splice(props.indexOf(p), 1);
  byId.delete(id);
  for (let y = p.y; y < p.y + p.h; y++)
    for (let x = p.x; x < p.x + p.w; x++) if (inB(x, y) && OCC[I(x, y)] === id) OCC[I(x, y)] = 0;
  if (idTo !== 'keep') freePropId(id, idTo === 'reserve');
  markBlockDirty();
  return p;
}

/** A deep copy of the list for a snapshot. */
export function propsState(): Prop[] {
  return JSON.parse(JSON.stringify(props)) as Prop[];
}

/** Replace the list (a restore). OCC comes back with the layers, not from here; the ids come back with the ids state. */
export function setPropsState(list: readonly Prop[]): void {
  props.length = 0;
  byId.clear();
  for (const p of list) {
    const c = JSON.parse(JSON.stringify(p)) as Prop;
    props.push(c);
    byId.set(c.id, c);
  }
  markBlockDirty();
}

/**
 * Beds, water and occupied tiles block walking; a bridge opens the water under it (02 2.3). Rebuilt whole (2,304 tiles plus the bridges)
 * when KIND, OCC or a prop changed: gen, the park tools and the undo call it after their change (03 3.2).
 */
export function rebuildBlock(): void {
  if (!blockDirty) return;
  blockDirty = false;
  for (let i = 0; i < NC; i++) {
    const k = KIND[i];
    BLOCK[i] = k === Kind.bed || k === Kind.pond || k === Kind.canal || OCC[i] !== 0 ? 1 : 0;
  }
  for (const p of props)
    if (p.kind === 'bridge')
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (inB(x, y)) BLOCK[I(x, y)] = 0;
}

/** A new park: every layer and the prop list back to empty (gen.ts resets the id counters with it). */
export function clearLayers(): void {
  KIND.fill(0);
  WEAR.fill(0);
  OCC.fill(0);
  WATER.fill(0);
  ICE.fill(0);
  WET.fill(0);
  PETALS.fill(0);
  BEDC.fill(0);
  PAVEDAY.fill(0);
  E.fill(0);
  props.length = 0;
  byId.clear();
  markBlockDirty();
}

export type LayersState = {
  KIND: Uint8Array;
  WEAR: Float32Array;
  OCC: Uint16Array;
  WATER: Float32Array;
  ICE: Uint8Array;
  WET: Float32Array;
  PETALS: Float32Array;
  BEDC: Uint8Array;
  PAVEDAY: Int16Array;
};

export function layersState(): LayersState {
  return {
    KIND: KIND.slice(),
    WEAR: WEAR.slice(),
    OCC: OCC.slice(),
    WATER: WATER.slice(),
    ICE: ICE.slice(),
    WET: WET.slice(),
    PETALS: PETALS.slice(),
    BEDC: BEDC.slice(),
    PAVEDAY: PAVEDAY.slice(),
  };
}

export function setLayersState(s: LayersState): void {
  KIND.set(s.KIND);
  WEAR.set(s.WEAR);
  OCC.set(s.OCC);
  WATER.set(s.WATER);
  ICE.set(s.ICE);
  WET.set(s.WET);
  PETALS.set(s.PETALS);
  BEDC.set(s.BEDC);
  PAVEDAY.set(s.PAVEDAY);
  markBlockDirty();
}
