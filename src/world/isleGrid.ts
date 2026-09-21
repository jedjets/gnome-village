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
 * Soft-iso village land: rolling multi-lobe country + open melt bay.
 * Shared-vertex relief that *reads* at Fit — NOT a flat cookie / thick loaf.
 * Peak ~0.9–1.1; HEIGHT_SCALE mid (~70) + LOAF_DEPTH thin (~12) = flush roll-in-sea.
 */
export function createSeededIsle(seed = 0x6e0f1e): Heightfield {
  const size = GRID_SIZE
  const heights = new Float32Array(size * size)
  const noiseSeed = seed >>> 0

  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const maxR = Math.min(cx, cy) * 0.92

  // Separated lobes — gentle peaks/valleys (old snowy-oval family), not flat disc
  const lobes = [
    { lx: -0.46, ly: -0.3, a: 0.92, s: 0.3 },
    { lx: 0.4, ly: -0.42, a: 0.86, s: 0.28 },
    { lx: 0.48, ly: 0.3, a: 0.9, s: 0.32 },
    { lx: -0.1, ly: 0.5, a: 0.8, s: 0.3 },
    { lx: -0.52, ly: 0.24, a: 0.84, s: 0.28 },
    { lx: 0.14, ly: -0.06, a: 0.5, s: 0.26 },
    { lx: -0.26, ly: 0.1, a: 0.46, s: 0.22 },
    { lx: 0.32, ly: 0.14, a: 0.44, s: 0.2 },
  ]
  // Soft valleys / saddles between lobes
  const valleys = [
    { lx: 0.02, ly: 0.12, a: 0.36, s: 0.4 },
    { lx: -0.2, ly: -0.14, a: 0.28, s: 0.32 },
    { lx: 0.24, ly: -0.06, a: 0.26, s: 0.3 },
  ]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / maxR
      const dy = (y - cy) / maxR
      // Mild ellipse + multi-freq warp → irregular coast (not cookie disc)
      const rEll = Math.sqrt(dx * dx * 1.08 + dy * dy * 0.92)
      const rimWarp =
        (fbm(x * 0.07 + 1.7, y * 0.07, noiseSeed + 44) - 0.5) * 0.16 +
        (fbm(x * 0.16, y * 0.16, noiseSeed + 88) - 0.5) * 0.09 +
        (fbm(x * 0.28 + 3.1, y * 0.24, noiseSeed + 121) - 0.5) * 0.05
      const rr = rEll + rimWarp
      const r = rEll
      let mask = 1
      if (rr > 0.68) {
        mask = smoothstep((1.05 - rr) / 0.37)
      }
      if (rr > 1.05) mask = 0

      const plateau = 0.14 + fbm(x * 0.03, y * 0.03, noiseSeed) * 0.05
      let hills = 0
      for (let li = 0; li < lobes.length; li++) {
        const L = lobes[li]!
        const ox = dx - L.lx
        const oy = dy - L.ly
        const d2 = (ox * ox + oy * oy) / (L.s * L.s)
        hills += L.a * Math.exp(-d2 * 1.7)
      }
      let dips = 0
      for (let vi = 0; vi < valleys.length; vi++) {
        const V = valleys[vi]!
        const ox = dx - V.lx
        const oy = dy - V.ly
        const d2 = (ox * ox + oy * oy) / (V.s * V.s)
        dips += V.a * Math.exp(-d2 * 1.4)
      }
      const und =
        (fbm(x * 0.05 + 2.2, y * 0.05, noiseSeed + 5) - 0.5) * 0.52 +
        (fbm(x * 0.1, y * 0.1, noiseSeed + 17) - 0.5) * 0.24
      const meso = (fbm(x * 0.2, y * 0.2, noiseSeed + 31) - 0.5) * 0.1
      const along = (dx + dy) * 0.55
      const cross = (dx - dy) * 0.48
      const bankRidge =
        Math.abs(cross) > 0.08
          ? Math.exp(-Math.pow((Math.abs(cross) - 0.22) / 0.18, 2)) * 0.2 *
            (0.5 + 0.5 * fbm(along * 3.1, 0.4, noiseSeed + 77))
          : 0

      let h = (plateau + hills - dips + und + meso + bankRidge) * mask

      // Main melt trench — opens to sea as a SE bay inlet (not a closed pond)
      const sd = streamDist(x, y, size, noiseSeed)
      const bank = 2.95
      const wob = streamWobble(along, noiseSeed)
      // Mouth toward +along (SE) — carve through rim into bay (start earlier)
      const mouthGate = smoothstep((along - 0.12) / 0.5) // 0 inland → 1 at SE rim
      if (sd < bank && r < 0.99) {
        const carve =
          Math.pow(1 - sd / bank, 1.35) * (0.78 + 0.22 * (1 - smoothstep(r / 0.9)))
        // Keep pale land rim elsewhere; at mouth allow full carve through
        const rimKeep =
          mouthGate > 0.1
            ? Math.max(0.02, 1 - mouthGate * 1.15)
            : r > 0.64
              ? Math.pow(smoothstep((0.88 - r) / 0.24), 1.1)
              : 1
        h -= carve * (0.58 + mouthGate * 0.65) * Math.max(0.05, rimKeep)
        // Bay flare: wide funnel at SE outlet so channel clearly meets ocean
        if (mouthGate > 0.2 && sd < bank * (1.25 + mouthGate * 2.2)) {
          const bay =
            Math.pow(1 - sd / (bank * (1.25 + mouthGate * 2.2)), 1.1) * mouthGate
          h -= bay * (0.65 + mouthGate * 0.35)
        }
      }

      // 1–2 subtle melt forks (not a fat ribbon maze)
      const branches = [
        { t0: -0.38, t1: 0.18, side: 0.2, w: 1.65, a: 0.5 },
        { t0: -0.05, t1: 0.52, side: -0.18, w: 1.5, a: 0.44 },
      ]
      for (let bi = 0; bi < branches.length; bi++) {
        const B = branches[bi]!
        if (along < B.t0 || along > B.t1) continue
        const u = (along - B.t0) / (B.t1 - B.t0)
        const flare = Math.sin(u * Math.PI)
        const bCross = (dx - dy) * 0.48 - wob
        const bd = Math.abs(bCross - B.side) * cx
        if (bd < B.w && r < 0.78) {
          const carveB = Math.pow(1 - bd / B.w, 1.35) * flare * B.a
          const rimKeepB = r > 0.58 ? Math.pow(smoothstep((0.8 - r) / 0.22), 1.15) : 1
          h -= carveB * rimKeepB
        }
      }

      h = Math.max(0, Math.min(1.1, h))
      if (rr > 1.05) h = 0
      else if (rr > 0.88) h *= smoothstep((1.05 - rr) / 0.17)

      // Floor — channel/mouth may sit at ocean zero; other land keeps soft floor
      const inMain = sd < bank * 1.1
      const inFork = Math.abs((dx - dy) * 0.48 - wob) * cx < 1.85
      const atMouth = mouthGate > 0.28 && inMain
      if (mask > 0.2 && rr <= 1.0 && !atMouth) {
        const floor = inMain || inFork
          ? 0.015
          : r > 0.7
            ? 0.06 + (r - 0.7) * 0.07
            : 0.035
        if (h < floor) h = floor * (0.5 + 0.5 * mask)
      }
      // Force open bay: zero heights where trench meets ocean (silhouette notch)
      if (atMouth && sd < bank * (1.0 + mouthGate * 1.8) && rr > 0.62) {
        h = Math.min(h, Math.max(0, 0.05 * (1 - mouthGate)))
        if (mouthGate > 0.55 && sd < bank * (1.3 + mouthGate * 1.6)) h = 0
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
        // Keep bay mouth open — don't let blur pull land into the notch
        const alongB = (dx + dy) * 0.55
        const mouthB = smoothstep((alongB - 0.12) / 0.5)
        const sdB = streamDist(x, y, size, noiseSeed)
        if (mouthB > 0.55 && sdB < 4.5 && r > 0.6) {
          heights[i] = Math.min(h0, 0.02)
          if (mouthB > 0.7 && sdB < 5.5) heights[i] = 0
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

/**
 * Distance to nearest meltwater channel (main stream + branches).
 * Used by wetness so carved side channels fill, not only the fat centerline.
 */
export function meltChannelDist(gx: number, gy: number, size: number, seed: number): number {
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const nx = (gx - cx) / cx
  const ny = (gy - cy) / cy
  const along = (nx + ny) * 0.55
  const wobble = streamWobble(along, seed)
  const cross = (nx - ny) * 0.48 - wobble
  let best = Math.abs(cross) * cx
  // Bay mouth flare — wetness widens toward SE sea inlet
  const mouthGate = Math.max(0, Math.min(1, (along - 0.12) / 0.5))
  if (mouthGate > 0.2) {
    best = best / (1 + mouthGate * 1.35)
  }
  const branches = [
    { t0: -0.38, t1: 0.18, side: 0.2 },
    { t0: -0.05, t1: 0.52, side: -0.18 },
  ]
  for (let i = 0; i < branches.length; i++) {
    const B = branches[i]!
    if (along < B.t0 - 0.04 || along > B.t1 + 0.04) continue
    const bd = Math.abs(cross - B.side) * cx
    if (bd < best) best = bd
  }
  return best
}

/** Soft waterline — stream beds sit under this; land above stays turf. */
export const WATER_LEVEL = 0.11

export function isWaterHeight(h: number): boolean {
  return h > 0.001 && h <= WATER_LEVEL
}
