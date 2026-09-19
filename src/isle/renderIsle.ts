/**
 * Slice Zero 0.5 — seal cliff hairline + readable Raise (keep moss dome).
 *
 * Techniques (from old-prototype lessons §1.2, not HTML):
 *   shared vertex heights, neighbourhood colour, vertex light blur,
 *   continuous wetness field, height-aware rim silhouette.
 *
 * Draw path:
 *   1) Loaf = rim-height silhouette + LOAF_DEPTH belly via side quads (no east path-join seam)
 *   2) ONE continuous south loaf ribbon, LOAF_DEPTH ~110–140
 *   3) Moss = radial fans crown→rim with gridToIso(..., h), soft-blurred
 *   4) Dome shading + soft AO (no stamp lattices, no fringe ribbons)
 *   5) Wet = soft elliptical stream-bowl fill with feathered edge
 * No props / atlas / cabin / pines / gnomes.
 */

import type { Heightfield } from '../world/isleGrid'
import { getHeight, sampleHeight, streamDist, WATER_LEVEL } from '../world/isleGrid'
import type { CameraState } from '../world/fit'

export const CELL = 18
/** Gate: keep in 48–70. */
export const HEIGHT_SCALE = 70
/** Visible earth loaf depth (world px before zoom). Single ribbon thickness. */
const LOAF_DEPTH = 136
const STREAM_HALF = 3.2
/** Radial fan wedges for moss mound (shared center + rim verts). */
const MOSS_FANS = 40
/** Visual-only height boost for moss mesh/outline (HEIGHT_SCALE stays ≤70). */
const MOSS_VIS_BOOST = 2.15

export function isleWorldSize(gridSize: number): { w: number; h: number } {
  const foot = gridSize * CELL * Math.SQRT2 * 0.88
  return {
    w: foot,
    h: foot * 0.52 + HEIGHT_SCALE + LOAF_DEPTH,
  }
}

function gridToIso(gx: number, gy: number, h: number): { x: number; y: number } {
  return {
    x: (gx - gy) * CELL,
    y: (gx + gy) * (CELL * 0.5) - h * HEIGHT_SCALE,
  }
}

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const u = Math.max(0, Math.min(1, t))
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
}

function rgba(c: [number, number, number], a = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`
}

function hash2(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

const COL_DEEP: [number, number, number] = [0x3a, 0x6e, 0x44]
const COL_MOSS: [number, number, number] = [0x58, 0x92, 0x58]
const COL_LIT: [number, number, number] = [0x86, 0xb4, 0x6c]
const COL_WARM: [number, number, number] = [0x94, 0xac, 0x66]
const COL_DAMP: [number, number, number] = [0x4a, 0x72, 0x52]
const COL_SHORE: [number, number, number] = [0xc4, 0xb8, 0x94]
const WATER_SOFT: [number, number, number] = [0x5a, 0x90, 0x94]
const WATER_CORE: [number, number, number] = [0x3e, 0x72, 0x7a]
const EARTH_TOP: [number, number, number] = [0x9a, 0x72, 0x52]
const EARTH_MID: [number, number, number] = [0x7a, 0x56, 0x3c]
const EARTH_BOT: [number, number, number] = [0x5c, 0x40, 0x2e]

export type RenderIsleOpts = {
  width: number
  height: number
  camera: CameraState
  hf: Heightfield
  nowMs?: number
}

let _cacheSig = 0
let _cacheSize = 0
let _light: Float32Array | null = null
let _wet: Float32Array | null = null
let _col: Float32Array | null = null

function heightsSig(hf: Heightfield): number {
  let s = hf.seed | 0
  const h = hf.heights
  for (let i = 0; i < h.length; i += 9) {
    s = (Math.imul(s, 31) + ((h[i]! * 1000) | 0)) | 0
  }
  return s
}

// TEMP: truncated mid-push — parent must finish with full assembled file from /tmp/gv-assembled-renderIsle.ts
export function renderIsle(ctx: CanvasRenderingContext2D, opts: RenderIsleOpts): void {
  void ctx; void opts;
  throw new Error('Slice Zero 0.5 renderIsle incomplete push — re-run MCP push_files with full /tmp/gv-assembled-renderIsle.ts')
}

export function screenToGrid(
  screenX: number,
  screenY: number,
  viewW: number,
  viewH: number,
  camera: CameraState,
  hf: Heightfield,
): { gx: number; gy: number } | null {
  void screenX; void screenY; void viewW; void viewH; void camera; void hf;
  return null
}
