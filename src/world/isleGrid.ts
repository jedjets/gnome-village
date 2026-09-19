/**
 * Seeded continuous heightfield — soft loaf mound + gentle stream bowl.
 * Soft rim feather + slope clamp so cliffs read as loaf, not saw-teeth.
 * Amplitude tuned so mound volume reads at Fit with HEIGHT_SCALE 48–70
 * (≥25 CSS px peak-vs-rim relief at phone Fit when mesh is height-displaced).
 */

export const GRID_SIZE = 48

export type Heightfield = {
  size: number
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

/** Stream centerline wobble (must match streamDist). */
export function streamWobble(along: number, seed: number): number {
  return (
    (fbm(along * 2.4 + 2, along * 0.8, seed + 91) - 0.5) * 0.7 +
    (fbm(along * 5.2, along * 1.9, seed + 203) - 0.5) * 0.3
  )
}

/** Distance to winding stream centerline (grid units). */
export function streamDist(gx: number, gy: number, size: number, seed: number): number {
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const nx = (gx - cx) / cx
  const ny = (gy - cy) / cy
  const along = (nx + ny) * 0.55
  const wobble = streamWobble(along, seed)
  const cross = (nx - ny) * 0.48 - wobble
  return Math.abs(cross) * cx
}

export function createSeededIsle(seed = 0x6e0f1e): Heightfield {
  const size = GRID_SIZE
  const heights = new Float32Array(size * size)
  const noiseSeed = seed >>> 0

  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const maxR = Math.min(cx, cy) * 0.88

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / maxR
      const dy = (y - cy) / maxR
      const r = Math.sqrt(dx * dx + dy * dy)

      // Tall soft dome — crown high, rim low so height-displaced moss reads as mound
      // pow(island, 0.48) keeps body plump; outer falloff steepens rim vs peak
      const island = Math.max(0, 1 - Math.pow(Math.min(1, r), 1.35))
      const mound = Math.pow(island, 0.48)

      const macro =
        fbm(x * 0.04, y * 0.04, noiseSeed) * 0.45 +
        fbm(x * 0.085 + 4, y * 0.085, noiseSeed + 3) * 0.25
      const meso = fbm(x * 0.13, y * 0.13, noiseSeed + 11) * 0.1

      // Peak ~0.95 — clear dome relief; Raise still has headroom to 1.0
      let h = mound * (0.82 + macro * 0.38 + meso * 0.22)

      // Drop shoulders toward rim (amplify peak-vs-rim without cliffs)
      if (r > 0.42) {
        const shoulder = smoothstep((r - 0.42) / 0.5)
        h *= 1 - shoulder * 0.38
      }

      // Soft stream bowl — continuous valley for wetness field
      const sd = streamDist(x, y, size, noiseSeed)
      const bank = 4.2
      if (sd < bank && r < 0.82) {
        const carve = Math.pow(1 - sd / bank, 1.2) * (1 - smoothstep(r / 0.82))
        h -= carve * 0.38
      }

      h = Math.max(0, Math.min(0.97, h))
      // Soft feather at outer ring — kill cliff-wall silhouette, keep loaf body
      if (r > 1.0) h = 0
      else if (r > 0.82) h *= smoothstep((1.0 - r) / 0.18)

      heights[y * size + x] = h
    }
  }

  // Light rim blur + gentle slope clamp — preserve mound peak volume
  const tmp = new Float32Array(heights)
  const maxSlope = 0.16
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const dx = (x - cx) / maxR
        const dy = (y - cy) / maxR
        const r = Math.sqrt(dx * dx + dy * dy)
        const i = y * size + x
        const h0 = tmp[i]!
        if (h0 <= 0.001) {
          heights[i] = 0
          continue
        }
        // Blur mostly at rim; keep crown coherent
        const rim = r > 0.65 ? smoothstep((r - 0.65) / 0.3) : 0
        const s =
          tmp[i]! * (5 - rim * 1.2) +
          tmp[i - 1]! +
          tmp[i + 1]! +
          tmp[i - size]! +
          tmp[i + size]!
        const w = 9 - rim * 1.2
        let h = s / w
        for (const n of [tmp[i - 1]!, tmp[i + 1]!, tmp[i - size]!, tmp[i + size]!]) {
          if (n <= 0.001) continue
          if (h - n > maxSlope) h = n + maxSlope
          if (n - h > maxSlope) h = n - maxSlope
        }
        heights[i] = Math.max(0, Math.min(0.97, h))
      }
    }
    tmp.set(heights)
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
  heights[y * size + x] = Math.max(0, Math.min(1.25, h))
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
    hf.heights[i] = Math.max(0, Math.min(1.25, data[i]!))
  }
}

export const WATER_LEVEL = 0.18

export function isWaterHeight(h: number): boolean {
  return h > 0.001 && h <= WATER_LEVEL
}
