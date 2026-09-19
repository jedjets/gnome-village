/**
 * Seeded continuous heightfield for the Slice 1 isle.
 * Soft mound + multi-octave noise — never an empty flat plane.
 */

export const GRID_SIZE = 48

export type Heightfield = {
  size: number
  /** Row-major heights in [0, 1] */
  heights: Float32Array
  seed: number
}

function hash2(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smoothstep(x - x0)
  const fy = smoothstep(y - y0)
  const a = hash2(x0, y0, seed)
  const b = hash2(x0 + 1, y0, seed)
  const c = hash2(x0, y0 + 1, seed)
  const d = hash2(x0 + 1, y0 + 1, seed)
  const ab = a + (b - a) * fx
  const cd = c + (d - c) * fx
  return ab + (cd - ab) * fy
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x * freq, y * freq, seed + i * 1013)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

export function createSeededIsle(seed = 0x6e0f1e): Heightfield {
  const size = GRID_SIZE
  const heights = new Float32Array(size * size)
  const noiseSeed = seed >>> 0

  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const maxR = Math.min(cx, cy) * 0.92

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / maxR
      const dy = (y - cy) / maxR
      const r = Math.sqrt(dx * dx + dy * dy)
      const island = Math.max(0, 1 - r * r)
      const mound = Math.pow(island, 1.15)
      const n =
        fbm(x * 0.085, y * 0.085, noiseSeed) * 0.55 +
        fbm(x * 0.22, y * 0.22, noiseSeed + 7) * 0.25
      let h = mound * (0.35 + n * 0.65)
      h = Math.max(0, Math.min(1, h))
      if (r > 0.98) h = 0
      else if (r > 0.88) h *= smoothstep((0.98 - r) / 0.1)
      heights[y * size + x] = h
    }
  }

  return { size, heights, seed: noiseSeed }
}

export function getHeight(hf: Heightfield, x: number, y: number): number {
  const { size, heights } = hf
  if (x < 0 || y < 0 || x >= size || y >= size) return 0
  return heights[y * size + x]!
}

export function setHeight(hf: Heightfield, x: number, y: number, h: number): void {
  const { size, heights } = hf
  if (x < 0 || y < 0 || x >= size || y >= size) return
  heights[y * size + x] = Math.max(0, Math.min(1, h))
}

export function sampleHeight(hf: Heightfield, gx: number, gy: number): number {
  const x0 = Math.floor(gx)
  const y0 = Math.floor(gy)
  const fx = gx - x0
  const fy = gy - y0
  const h00 = getHeight(hf, x0, y0)
  const h10 = getHeight(hf, x0 + 1, y0)
  const h01 = getHeight(hf, x0, y0 + 1)
  const h11 = getHeight(hf, x0 + 1, y0 + 1)
  const a = h00 + (h10 - h00) * fx
  const b = h01 + (h11 - h01) * fx
  return a + (b - a) * fy
}

export function cloneHeights(hf: Heightfield): Float32Array {
  return new Float32Array(hf.heights)
}

export function applyHeights(hf: Heightfield, data: ArrayLike<number>): void {
  const n = Math.min(hf.heights.length, data.length)
  for (let i = 0; i < n; i++) {
    hf.heights[i] = Math.max(0, Math.min(1, data[i]!))
  }
}
