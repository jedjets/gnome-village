import type { Heightfield } from '../world/isleGrid'
import { sampleHeight, streamDist, WATER_LEVEL } from '../world/isleGrid'
import type { CameraState } from '../world/fit'

export const CELL = 18
/** Gate: soft loaf 80–110. Readable rolling relief at Fit — not needles. */
export const HEIGHT_SCALE = 92
/** Visible earth loaf depth (world px before zoom). Soft ribbon. */
export const LOAF_DEPTH = 88
export const STREAM_HALF = 2.6

export function isleWorldSize(gridSize: number): { w: number; h: number } {
  // Match measured loaf silhouette width (~grid * CELL * √2 * 0.88)
  const foot = gridSize * CELL * Math.SQRT2 * 0.88
  return {
    w: foot,
    h: foot * 0.42 + HEIGHT_SCALE * 0.9 + LOAF_DEPTH * 0.75,
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

export const COL_DEEP: [number, number, number] = [0x3e, 0x72, 0x48]
export const COL_MOSS: [number, number, number] = [0x5c, 0x96, 0x58]
export const COL_LIT: [number, number, number] = [0x8a, 0xb8, 0x6e]
export const COL_WARM: [number, number, number] = [0x9a, 0xb0, 0x68]
export const COL_DAMP: [number, number, number] = [0x4a, 0x78, 0x54]
export const COL_SHORE: [number, number, number] = [0xd0, 0xc2, 0x98]
export const COL_SAND: [number, number, number] = [0xc8, 0xb8, 0x88]
export const WATER_SHALLOW: [number, number, number] = [0x7a, 0xba, 0xbe]
export const WATER_MID: [number, number, number] = [0x5a, 0x9c, 0xa4]
export const WATER_DEEP: [number, number, number] = [0x36, 0x72, 0x82]
export const EARTH_TOP: [number, number, number] = [0xa8, 0x7c, 0x58]
export const EARTH_MID: [number, number, number] = [0x82, 0x5c, 0x40]
export const EARTH_BOT: [number, number, number] = [0x5e, 0x42, 0x30]

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
let _vertH: Float32Array | null = null

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

/** Soft-iso fields on shared vertices (continuous ground + shoreline). */
export function ensureFields(hf: Heightfield): {
  light: Float32Array
  wet: Float32Array
  col: Float32Array
  vertH: Float32Array
  nv: number
} {
  const size = hf.size
  const nv = size + 1
  const sig = heightsSig(hf)
  if (_light && _wet && _col && _vertH && _cacheSig === sig && _cacheSize === size) {
    return { light: _light, wet: _wet, col: _col, vertH: _vertH, nv }
  }

  const light = new Float32Array(nv * nv)
  const wet = new Float32Array(nv * nv)
  const col = new Float32Array(nv * nv * 3)
  const vertH = new Float32Array(nv * nv)
  const seed = hf.seed

  for (let y = 0; y < nv; y++) {
    for (let x = 0; x < nv; x++) {
      const gx = x - 0.5
      const gy = y - 0.5
      const hC = sampleHeight(hf, gx, gy)
      vertH[y * nv + x] = hC

      const hN = sampleHeight(hf, gx, gy - 1)
      const hS = sampleHeight(hf, gx, gy + 1)
      const hE = sampleHeight(hf, gx + 1, gy)
      const hW = sampleHeight(hf, gx - 1, gy)

      // Vertex slope + soft valley AO (prototype family). Blur (≥2) shares light.
      let L = 0.84 + (hW - hE) * 0.22 + (hN - hS) * 0.14 + hC * 0.08
      const meanN = (hN + hS + hE + hW) * 0.25
      L += Math.max(0, hC - meanN) * 0.18 // crest lift
      L -= Math.max(0, meanN - hC) * 0.22 // valley AO
      light[y * nv + x] = Math.max(0.68, Math.min(1.12, L))

      if (hC <= 0.001) {
        wet[y * nv + x] = 0
      } else {
        const sd = streamDist(gx, gy, size, seed)
        // Stream ribbon only — do NOT flood lows across the whole loaf
        const stream = Math.max(0, 1 - sd / STREAM_HALF)
        const streamGate = stream * stream // sharp falloff away from centerline
        const depthNudge =
          streamGate > 0.05 && hC < WATER_LEVEL + 0.12
            ? (WATER_LEVEL + 0.12 - hC) * 0.9 * streamGate
            : 0
        wet[y * nv + x] = Math.min(1.15, streamGate * 1.05 + depthNudge)
      }

      let acc0 = 0
      let acc1 = 0
      let acc2 = 0
      let wsum = 0
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const dist = Math.hypot(dx, dy)
          if (dist > 3.15) continue
          const w = dist < 0.1 ? 5 : 1 / (1 + dist * 0.85)
          const h = sampleHeight(hf, gx + dx, gy + dy)
          if (h <= 0.001) continue
          const sdN = streamDist(gx + dx, gy + dy, size, seed)
          const nearBank = sdN < STREAM_HALF * 2.2 && h < 0.4
          let c: [number, number, number]
          if (nearBank) {
            // Soft damp hint only — soft wet mask owns beige bank (no mesh stair)
            const dampT = Math.min(1, Math.max(0, 1 - sdN / (STREAM_HALF * 2.2)))
            const base =
              h < 0.28
                ? lerp3(COL_MOSS, COL_LIT, h / 0.28)
                : lerp3(COL_MOSS, COL_LIT, Math.min(1, (h - 0.28) / 0.22))
            c = lerp3(base, COL_SHORE, dampT * 0.22)
          } else if (h < 0.22) {
            c = lerp3(COL_DEEP, COL_MOSS, h / 0.22)
          } else if (h < 0.42) {
            c = lerp3(COL_MOSS, COL_LIT, (h - 0.22) / 0.2)
          } else {
            c = lerp3(COL_LIT, COL_WARM, Math.min(1, (h - 0.42) / 0.3))
          }
          const g = hash2((x + dx) >> 2, (y + dy) >> 2, seed + 17)
          if (g > 0.62) c = lerp3(c, COL_LIT, 0.1)
          if (g < 0.28) c = lerp3(c, COL_DEEP, 0.12)
          acc0 += c[0] * w
          acc1 += c[1] * w
          acc2 += c[2] * w
          wsum += w
        }
      }
      const i = (y * nv + x) * 3
      if (wsum < 1e-6) {
        col[i] = COL_MOSS[0]
        col[i + 1] = COL_MOSS[1]
        col[i + 2] = COL_MOSS[2]
      } else {
        col[i] = acc0 / wsum
        col[i + 1] = acc1 / wsum
        col[i + 2] = acc2 / wsum
      }
    }
  }

  // Soften draw heights slightly so erosion/sculpt ripples don't facet every cell
  boxBlurInPlace(vertH, nv, 1)
  // Zero ocean stays zero (blur can leak tiny heights)
  for (let i = 0; i < nv * nv; i++) {
    if (vertH[i]! < 0.004) vertH[i] = 0
  }

  // Extra light blur passes — neighbouring faces share shade across slopes
  boxBlurInPlace(light, nv, 4)
  boxBlurInPlace(wet, nv, 1)
  const ch = new Float32Array(nv * nv)
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < nv * nv; i++) ch[i] = col[i * 3 + c]!
    boxBlurInPlace(ch, nv, 4)
    for (let i = 0; i < nv * nv; i++) col[i * 3 + c] = ch[i]!
  }

  _light = light
  _wet = wet
  _col = col
  _vertH = vertH
  _cacheSig = sig
  _cacheSize = size
  return { light, wet, col, vertH, nv }
}
