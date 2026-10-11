// src/world/grid.ts
// World constants and the per-tile typed-array layers (register 3.1, 03 3.2).
// Ported from GV 567-568 (N, NC) and 612-673 (the layer arrays). ADAPT: one scale (S = 1), flat ground (E all zero), park kinds.
// TODO(S2): layersState/setLayersState used by save/store.ts snapshot; BLOCK also considers passable props.

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

let blockDirty = true;

export function markBlockDirty(): void {
  blockDirty = true;
}

/** Beds, water and occupied tiles block walking (02 2.3). */
export function rebuildBlock(): void {
  if (!blockDirty) return;
  blockDirty = false;
  for (let i = 0; i < NC; i++) {
    const k = KIND[i];
    BLOCK[i] = k === Kind.bed || k === Kind.pond || k === Kind.canal || OCC[i] !== 0 ? 1 : 0;
  }
}

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
  blockDirty = true;
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
  blockDirty = true;
}
