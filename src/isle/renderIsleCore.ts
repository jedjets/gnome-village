import type { Heightfield } from '../world/isleGrid'
import { sampleHeight, streamDist, WATER_LEVEL } from '../world/isleGrid'
import type { CameraState } from '../world/fit'
export const CELL = 18
/** Gate: keep in 48–70. */
export const HEIGHT_SCALE = 70
/** Visible earth loaf depth (world px before zoom). Single ribbon thickness. */
export const LOAF_DEPTH = 136
export const STREAM_HALF = 3.2
/** Radial fan wedges for moss mound (shared center + rim verts). */
export const MOSS_FANS = 40
/** Visual-only height boost for moss mesh/outline (HEIGHT_SCALE stays ≤70). */
export const MOSS_VIS_BOOST = 2.15

export function isleWorldSize(gridSize: number): { w: number; h: number } {
  const foot = gridSize * CELL * Math.SQRT2 * 0.88
  return {
    w: foot,
    h: foot * 0.52 + HEIGHT_SCALE + LOAF_DEPTH,
  }
}

export function gridToIso(gx: number, gy: number, h: number): { x: number; y: number } {
  return {
    x: (gx - gy) * CELL,
    y: (gx + gy) * (CELL * 0.5) - h * HEIGHT_SCALE,
  }
}

export function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const u = Math.max(0, Math.min(1, t))
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
}

export function rgba(c: [number, number, number], a = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`
}

export function hash2(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

export const COL_DEEP: [number, number, number] = [0x3a, 0x6e, 0x44]
export const COL_MOSS: [number, number, number] = [0x58, 0x92, 0x58]
export const COL_LIT: [number, number, number] = [0x86, 0xb4, 0x6c]
export const COL_WARM: [number, number, number] = [0x94, 0xac, 0x66]
export const COL_DAMP: [number, number, number] = [0x4a, 0x72, 0x52]
export const COL_SHORE: [number, number, number] = [0xc4, 0xb8, 0x94]
export const WATER_SOFT: [number, number, number] = [0x5a, 0x90, 0x94]
export const WATER_CORE: [number, number, number] = [0x3e, 0x72, 0x7a]
export const EARTH_TOP: [number, number, number] = [0x9a, 0x72, 0x52]
export const EARTH_MID: [number, number, number] = [0x7a, 0x56, 0x3c]
export const EARTH_BOT: [number, number, number] = [0x5c, 0x40, 0x2e]

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

export function heightsSig(hf: Heightfield): number {
  let s = hf.seed | 0
  const h = hf.heights
  for (let i = 0; i < h.length; i += 9) {
    s = (Math.imul(s, 31) + ((h[i]! * 1000) | 0)) | 0
  }
  return s
}

export function boxBlurInPlace(buf: Float32Array, nv: number, passes: number): void {
  const tmp = new Float32Array(nv * nv)
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < nv; y++) {
      for (let x = 0; x < nv; x++) {
        let s = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            const yy = y + dy
            if (xx < 0 || yy < 0 || xx >= nv || yy >= nv) continue
            s += buf[yy * nv + xx]!
            n++
          }
        }
        tmp[y * nv + x] = s / n
      }
    }
    buf.set(tmp)
  }
}

export function ensureFields(hf: Heightfield): {
  light: Float32Array
  wet: Float32Array
  col: Float32Array
  nv: number
} {
  const size = hf.size
  const nv = size + 1
  const sig = heightsSig(hf)
  if (_light && _wet && _col && _cacheSig === sig && _cacheSize === size) {
    return { light: _light, wet: _wet, col: _col, nv }
  }

  const light = new Float32Array(nv * nv)
  const wet = new Float32Array(nv * nv)
  const col = new Float32Array(nv * nv * 3)
  const seed = hf.seed

  for (let y = 0; y < nv; y++) {
    for (let x = 0; x < nv; x++) {
      const gx = x - 0.5
      const gy = y - 0.5
      const hC = sampleHeight(hf, gx, gy)
      const hN = sampleHeight(hf, gx, gy - 1)
      const hS = sampleHeight(hf, gx, gy + 1)
      const hE = sampleHeight(hf, gx + 1, gy)
      const hW = sampleHeight(hf, gx - 1, gy)
      // Dome lighting: crown lit, sides darker, soft valley AO
      let L = 0.7 + hC * 0.48 + (hN - hS) * 0.1 + (hW - hE) * 0.07
      L += Math.max(0, hC - (hN + hS + hE + hW) * 0.25) * 0.28
      L -= Math.max(0, (hN + hS + hE + hW) * 0.25 - hC) * 0.32
      light[y * nv + x] = L

      if (hC <= 0.001) {
        wet[y * nv + x] = 0
      } else {
        const sd = streamDist(gx, gy, size, seed)
        const stream = Math.max(0, 1 - sd / STREAM_HALF)
        const bowl = hC <= WATER_LEVEL ? Math.max(0, 1 - hC / WATER_LEVEL) * 0.85 : 0
        // Soft crown suppress — keep continuous ribbon, leave moss shoulders green
        const crownFade = hC > 0.55 ? Math.max(0.25, 1 - (hC - 0.55) / 0.45) : 1
        wet[y * nv + x] = Math.min(1, Math.max(stream * 0.95, bowl) * crownFade)
      }

      let acc: [number, number, number] = [0, 0, 0]
      let wsum = 0
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const dist = Math.hypot(dx, dy)
          if (dist > 2.2) continue
          const w = dist < 0.1 ? 4 : 1 / (1 + dist)
          const h = sampleHeight(hf, gx + dx, gy + dy)
          if (h <= 0.001) continue
          let c: [number, number, number]
          if (h < 0.28) c = lerp3(COL_DEEP, COL_MOSS, h / 0.28)
          else if (h < 0.55) c = lerp3(COL_MOSS, COL_LIT, (h - 0.28) / 0.27)
          else c = lerp3(COL_LIT, COL_WARM, (h - 0.55) / 0.45)
          const g = hash2((x + dx) >> 2, (y + dy) >> 2, seed + 17)
          if (g > 0.65) c = lerp3(c, COL_LIT, 0.12)
          if (g < 0.28) c = lerp3(c, COL_DEEP, 0.14)
          acc[0] += c[0] * w
          acc[1] += c[1] * w
          acc[2] += c[2] * w
          wsum += w
        }
      }
      const i = (y * nv + x) * 3
      if (wsum < 1e-6) {
        col[i] = COL_MOSS[0]
        col[i + 1] = COL_MOSS[1]
        col[i + 2] = COL_MOSS[2]
      } else {
        col[i] = acc[0] / wsum
        col[i + 1] = acc[1] / wsum
        col[i + 2] = acc[2] / wsum
      }
    }
  }

  boxBlurInPlace(light, nv, 6)
  boxBlurInPlace(wet, nv, 4)
  const ch = new Float32Array(nv * nv)
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < nv * nv; i++) ch[i] = col[i * 3 + c]!
    boxBlurInPlace(ch, nv, 4)
    for (let i = 0; i < nv * nv; i++) col[i * 3 + c] = ch[i]!
  }

  _light = light
  _wet = wet
  _col = col
  _cacheSig = sig
  _cacheSize = size
  return { light, wet, col, nv }
}
