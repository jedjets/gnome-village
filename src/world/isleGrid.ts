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
 * Soft-iso village land: rolling multi-lobe country + stream in a low path.
 * Shared-vertex relief that *reads* at Fit — NOT a single central dome/pancake.
 * Peak ~0.95–1.18; HEIGHT_SCALE loaf ~80–110 for ≥25 CSS px crest↔valley at Fit.
 */
export function createSeededIsle(seed = 0x6e0f1e): Heightfield {
  const size = GRID_SIZE
  const heights = new Float32Array(size * size)
  const noiseSeed = seed >>> 0

  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const maxR = Math.min(cx, cy) * 0.92

  // Separated lobes/ridges — asymmetric rolling country (crests near rim for outline)
  // Soft loaf mounds — gentle crests, separated enough to read at Fit
  const lobes = [
    { lx: -0.42, ly: -0.28, a: 0.78, s: 0.32 },
    { lx: 0.36, ly: -0.38, a: 0.72, s: 0.3 },
    { lx: 0.44, ly: 0.28, a: 0.76, s: 0.34 },
    { lx: -0.08, ly: 0.46, a: 0.68, s: 0.32 },
    { lx: -0.48, ly: 0.22, a: 0.7, s: 0.3 },
    { lx: 0.12, ly: -0.08, a: 0.42, s: 0.28 }, // gentle central saddle mound
    { lx: -0.22, ly: 0.08, a: 0.38, s: 0.24 },
    { lx: 0.3, ly: 0.12, a: 0.36, s: 0.22 },
  ]
  // Soft valleys — stream path is carved separately; these are saddles only
  const valleys = [
    { lx: 0.02, ly: 0.1, a: 0.28, s: 0.4 },
    { lx: -0.18, ly: -0.12, a: 0.2, s: 0.32 },
    { lx: 0.22, ly: -0.05, a: 0.18, s: 0.3 },
  ]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / maxR
      const dy = (y - cy) / maxR
      const r = Math.sqrt(dx * dx + dy * dy)

      // Flat-ish interior mask — rim only (avoids radial multiply-dome)
      const rimWarp =
        (fbm(x * 0.09 + 1.7, y * 0.09, noiseSeed + 44) - 0.5) * 0.1
      const rr = r + rimWarp
      // Near-1 across interior; soft fall only past ~0.72
      let mask = 1
      if (rr > 0.72) {
        mask = smoothstep((1.02 - rr) / 0.3)
      }
      if (rr > 1.02) mask = 0

      // Low plateau floor so lobes + valleys dominate the silhouette
      const plateau = 0.18 + fbm(x * 0.03, y * 0.03, noiseSeed) * 0.05
      let hills = 0
      for (let li = 0; li < lobes.length; li++) {
        const L = lobes[li]!
        const ox = dx - L.lx
        const oy = dy - L.ly
        const d2 = (ox * ox + oy * oy) / (L.s * L.s)
        hills += L.a * Math.exp(-d2 * 1.55)
      }
      let dips = 0
      for (let vi = 0; vi < valleys.length; vi++) {
        const V = valleys[vi]!
        const ox = dx - V.lx
        const oy = dy - V.ly
        const d2 = (ox * ox + oy * oy) / (V.s * V.s)
        dips += V.a * Math.exp(-d2 * 1.35)
      }
      // Broad rolling undulation (centered so lows go down)
      const und =
        (fbm(x * 0.055 + 2.2, y * 0.055, noiseSeed + 5) - 0.5) * 0.42 +
        (fbm(x * 0.11, y * 0.11, noiseSeed + 17) - 0.5) * 0.18
      const meso = (fbm(x * 0.22, y * 0.22, noiseSeed + 31) - 0.5) * 0.08
      // Soft ridge along stream-perpendicular so banks rise into hills
      const along = (dx + dy) * 0.55
      const cross = (dx - dy) * 0.48
      const bankRidge =
        Math.abs(cross) > 0.08
          ? Math.exp(-Math.pow((Math.abs(cross) - 0.22) / 0.18, 2)) * 0.18 *
            (0.5 + 0.5 * fbm(along * 3.1, 0.4, noiseSeed + 77))
          : 0

      let h = (plateau + hills - dips + und + meso + bankRidge) * mask

      // Winding stream valley — deep low path between lobes; never notch the loaf rim
      const sd = streamDist(x, y, size, noiseSeed)
      const bank = 4.0
      if (sd < bank && r < 0.78) {
        const carve =
          Math.pow(1 - sd / bank, 1.25) * (0.75 + 0.25 * (1 - smoothstep(r / 0.78)))
        // Strong fade near rim — loaf crust stays continuous
        const rimKeep = r > 0.55 ? Math.pow(smoothstep((0.78 - r) / 0.23), 1.4) : 1
        h -= carve * 0.42 * rimKeep
      }

      h = Math.max(0, Math.min(1.05, h))
      if (rr > 1.02) h = 0
      else if (rr > 0.86) h *= smoothstep((1.02 - rr) / 0.16)
      // Soft land floor — allow valley relief near rim to read in silhouette
      if (mask > 0.25 && rr <= 0.98) {
        const floor = r > 0.7 ? 0.08 + (r - 0.7) * 0.1 : 0.03
        if (h < floor) h = floor * (0.5 + 0.5 * mask)
      }

      heights[y * size + x] = h
    }
  }

  // Very light blur — preserve multi-hill relief (do not pancake)
  const tmp = new Float32Array(heights)
  const maxSlope = 0.32
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
        const rim = r > 0.78 ? smoothstep((r - 0.78) / 0.22) : 0
        const s =
          tmp[i]! * (6 - rim) +
          tmp[i - 1]! +
          tmp[i + 1]! +
          tmp[i - size]! +
          tmp[i + size]!
        const w = 10 - rim
        let h = s / w
        for (const n of [tmp[i - 1]!, tmp[i + 1]!, tmp[i - size]!, tmp[i + size]!]) {
          if (n <= 0.001) continue
          if (h - n > maxSlope) h = n + maxSlope
          if (n - h > maxSlope) h = n - maxSlope
        }
        heights[i] = Math.max(0, Math.min(1.05, h))
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
export const WATER_LEVEL = 0.11

export function isWaterHeight(h: number): boolean {
  return h > 0.001 && h <= WATER_LEVEL
}
