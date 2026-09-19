/**
 * Seeded soft-iso heightfield — rolling village land + winding stream valley.
 * NOT a moss dome / crater bowl. Shared vertex heights drive the renderer.
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

/**
 * Soft-iso village land: rolling plateau with hills + valleys + stream.
 * Shared-vertex relief that *reads* at Fit — not a flat pancake disc / single dome.
 * Peak ~0.85–1.05; interior spread large enough for loaf silhouette undulation.
 */
export function createSeededIsle(seed = 0x6e0f1e): Heightfield {
  const size = GRID_SIZE
  const heights = new Float32Array(size * size)
  const noiseSeed = seed >>> 0

  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const maxR = Math.min(cx, cy) * 0.92

  // Fixed lobe centers (grid-ish) so every seed still rolls, not one radial mound
  const lobes = [
    { lx: -0.34, ly: -0.2, a: 0.52, s: 0.5 },
    { lx: 0.3, ly: -0.36, a: 0.46, s: 0.44 },
    { lx: 0.2, ly: 0.4, a: 0.5, s: 0.48 },
    { lx: -0.24, ly: 0.3, a: 0.4, s: 0.42 },
    { lx: 0.04, ly: -0.04, a: 0.22, s: 0.65 },
  ]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / maxR
      const dy = (y - cy) / maxR
      const r = Math.sqrt(dx * dx + dy * dy)

      // Soft island mask — plump body, irregular feathered rim
      const rimWarp =
        (fbm(x * 0.09 + 1.7, y * 0.09, noiseSeed + 44) - 0.5) * 0.12
      const rr = r + rimWarp
      const island = Math.max(0, 1 - Math.pow(Math.min(1.05, rr), 1.35))
      const mask = Math.pow(island, 0.55)

      // Plateau floor + rolling lobes (additive hills, not multiply-dome)
      const plateau = 0.34 + fbm(x * 0.04, y * 0.04, noiseSeed) * 0.1
      let hills = 0
      for (let li = 0; li < lobes.length; li++) {
        const L = lobes[li]!
        const ox = dx - L.lx
        const oy = dy - L.ly
        const d2 = (ox * ox + oy * oy) / (L.s * L.s)
        hills += L.a * Math.exp(-d2 * 1.65)
      }
      // Broad undulation so valleys sit between lobes
      const und =
        (fbm(x * 0.07 + 2.2, y * 0.07, noiseSeed + 5) - 0.42) * 0.42 +
        (fbm(x * 0.14, y * 0.14, noiseSeed + 17) - 0.5) * 0.14
      const meso = (fbm(x * 0.22, y * 0.22, noiseSeed + 31) - 0.5) * 0.06

      let h = (plateau + hills + und + meso) * mask

      // Winding stream valley — living bank ribbon, not a crater wet bowl
      const sd = streamDist(x, y, size, noiseSeed)
      const bank = 4.2
      if (sd < bank && r < 0.9) {
        const carve =
          Math.pow(1 - sd / bank, 1.25) * (0.6 + 0.4 * (1 - smoothstep(r / 0.9)))
        h -= carve * 0.38
      }

      h = Math.max(0, Math.min(1.08, h))
      if (rr > 1.02) h = 0
      else if (rr > 0.82) h *= smoothstep((1.02 - rr) / 0.2)

      heights[y * size + x] = h
    }
  }

  // Light blur — keep relief; allow readable slopes (not pancake clamp)
  const tmp = new Float32Array(heights)
  const maxSlope = 0.22
  for (let pass = 0; pass < 1; pass++) {
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
        const rim = r > 0.72 ? smoothstep((r - 0.72) / 0.26) : 0
        const s =
          tmp[i]! * (5 - rim) +
          tmp[i - 1]! +
          tmp[i + 1]! +
          tmp[i - size]! +
          tmp[i + size]!
        const w = 9 - rim
        let h = s / w
        for (const n of [tmp[i - 1]!, tmp[i + 1]!, tmp[i - size]!, tmp[i + size]!]) {
          if (n <= 0.001) continue
          if (h - n > maxSlope) h = n + maxSlope
          if (n - h > maxSlope) h = n - maxSlope
        }
        heights[i] = Math.max(0, Math.min(1.08, h))
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

/** Soft waterline — stream beds sit under this; land above stays turf. */
export const WATER_LEVEL = 0.14

export function isWaterHeight(h: number): boolean {
  return h > 0.001 && h <= WATER_LEVEL
}
