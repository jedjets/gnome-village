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

/** Side-branch descriptors — shared by carve + wetness (village creek network). */
export const MELT_BRANCHES = [
  { t0: -0.55, t1: -0.05, side: 0.15, w: 1.25, a: 0.5 },
  { t0: -0.32, t1: 0.2, side: -0.13, w: 1.15, a: 0.46 },
  { t0: -0.02, t1: 0.5, side: 0.22, w: 1.2, a: 0.48 },
  { t0: 0.12, t1: 0.58, side: -0.2, w: 1.05, a: 0.42 },
  { t0: -0.18, t1: 0.28, side: 0.34, w: 0.95, a: 0.36 },
  { t0: 0.28, t1: 0.68, side: 0.08, w: 1.0, a: 0.34 },
] as const

/** Short shore-cut melt fingers (old-HTML density into the rim). */
export const MELT_SHORE_CUTS = [
  // Shallow scoops only — living wet lip, never silhouette notches
  { ang: -0.85, len: 0.22, w: 0.55, a: 0.22 },
  { ang: -0.2, len: 0.2, w: 0.5, a: 0.2 },
  { ang: 0.55, len: 0.24, w: 0.58, a: 0.22 },
  { ang: 1.15, len: 0.18, w: 0.48, a: 0.18 },
  { ang: 1.7, len: 0.2, w: 0.52, a: 0.2 },
] as const

/**
 * Soft-iso village land: snowy-oval family + thin multi-channel melt.
 * Shared-vertex relief that *reads* at Fit — NOT twin-bean cookie / thick loaf.
 * Peak ~0.9–1.1; HEIGHT_SCALE mid (~70) + LOAF_DEPTH thin (~12) = flush roll-in-sea.
 */
export function createSeededIsle(seed = 0x6e0f1e): Heightfield {
  const size = GRID_SIZE
  const heights = new Float32Array(size * size)
  const noiseSeed = seed >>> 0

  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const maxR = Math.min(cx, cy) * 0.92

  // Irregular peaks on ONE soft oval — not two equal bean lobes
  const peaks = [
    { lx: -0.08, ly: -0.12, a: 0.82, s: 0.42 }, // primary crest (oval family)
    { lx: 0.28, ly: 0.18, a: 0.42, s: 0.28 }, // SE spur (lower)
    { lx: -0.36, ly: 0.16, a: 0.38, s: 0.26 }, // W shoulder
    { lx: 0.12, ly: -0.36, a: 0.4, s: 0.24 }, // N spur
    { lx: 0.34, ly: -0.14, a: 0.32, s: 0.22 }, // NE knoll
    { lx: -0.3, ly: -0.32, a: 0.3, s: 0.2 }, // NW knoll
    { lx: 0.06, ly: 0.34, a: 0.28, s: 0.28 }, // S rise
    { lx: 0.02, ly: 0.04, a: 0.48, s: 0.4 }, // mid fill — kills bean gap
  ]
  // Soft valleys / hollows (stream can follow) — not bean separator
  const valleys = [
    { lx: 0.06, ly: 0.02, a: 0.22, s: 0.36 },
    { lx: -0.18, ly: 0.06, a: 0.18, s: 0.28 },
    { lx: 0.2, ly: -0.12, a: 0.16, s: 0.26 },
    { lx: -0.06, ly: 0.28, a: 0.14, s: 0.24 },
  ]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / maxR
      const dy = (y - cy) / maxR
      // Soft snowy oval + multi-freq coast warp (living rim, not cookie)
      const rEll = Math.sqrt(dx * dx * 1.0 + dy * dy * 1.06)
      const rimWarp =
        (fbm(x * 0.055 + 1.7, y * 0.055, noiseSeed + 44) - 0.5) * 0.14 +
        (fbm(x * 0.12, y * 0.12, noiseSeed + 88) - 0.5) * 0.08 +
        (fbm(x * 0.22 + 3.1, y * 0.2, noiseSeed + 121) - 0.5) * 0.05
      const rr = rEll + rimWarp
      const r = rEll
      let mask = 1
      if (rr > 0.62) {
        mask = smoothstep((1.02 - rr) / 0.4)
      }
      if (rr > 1.02) mask = 0

      // Continuous oval plateau — land stays one mass (anti twin-bean)
      const plateau = 0.46 + fbm(x * 0.025, y * 0.025, noiseSeed) * 0.05
      let hills = 0
      for (let li = 0; li < peaks.length; li++) {
        const L = peaks[li]!
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
      // Stronger irregular roll (peaks/valleys) — craft, not sterile dome
      const und =
        (fbm(x * 0.045 + 2.2, y * 0.045, noiseSeed + 5) - 0.5) * 0.58 +
        (fbm(x * 0.09, y * 0.09, noiseSeed + 17) - 0.5) * 0.3
      const meso = (fbm(x * 0.18, y * 0.18, noiseSeed + 31) - 0.5) * 0.14
      const micro = (fbm(x * 0.34, y * 0.34, noiseSeed + 55) - 0.5) * 0.06
      const along = (dx + dy) * 0.55
      const cross = (dx - dy) * 0.48
      const bankRidge =
        Math.abs(cross) > 0.06
          ? Math.exp(-Math.pow((Math.abs(cross) - 0.18) / 0.16, 2)) * 0.14 *
            (0.5 + 0.5 * fbm(along * 3.1, 0.4, noiseSeed + 77))
          : 0

      let h = (plateau + hills - dips + und + meso + micro + bankRidge) * mask

      // Main melt trench — village creek scale (NOT fat bay ribbon)
      const sd = streamDist(x, y, size, noiseSeed)
      const bank = 1.45
      const wob = streamWobble(along, noiseSeed)
      const mouthGate = smoothstep((along - 0.22) / 0.48) // later, milder mouth
      if (sd < bank && r < 0.98) {
        const carve =
          Math.pow(1 - sd / bank, 1.4) * (0.78 + 0.18 * (1 - smoothstep(r / 0.88)))
        const rimKeep =
          mouthGate > 0.15
            ? Math.max(0.1, 1 - mouthGate * 0.85)
            : r > 0.7
              ? Math.pow(smoothstep((0.92 - r) / 0.22), 1.05)
              : 1
        h -= carve * (0.36 + mouthGate * 0.22) * Math.max(0.15, rimKeep)
        // Mild mouth flare at rim only — not inland fat bay
        if (mouthGate > 0.5 && r > 0.7 && sd < bank * (1.0 + mouthGate * 0.45)) {
          const bay =
            Math.pow(1 - sd / (bank * (1.0 + mouthGate * 0.45)), 1.35) * mouthGate
          h -= bay * (0.2 + mouthGate * 0.15)
        }
      }

      // Multi-channel forks (old-HTML melt density look)
      for (let bi = 0; bi < MELT_BRANCHES.length; bi++) {
        const B = MELT_BRANCHES[bi]!
        if (along < B.t0 || along > B.t1) continue
        const u = (along - B.t0) / (B.t1 - B.t0)
        const flare = Math.sin(u * Math.PI)
        const bCross = (dx - dy) * 0.48 - wob
        const bd = Math.abs(bCross - B.side) * cx
        if (bd < B.w && r < 0.8) {
          const carveB = Math.pow(1 - bd / B.w, 1.35) * flare * (B.a + 0.12)
          const rimKeepB = r > 0.65 ? Math.pow(smoothstep((0.86 - r) / 0.2), 1.15) : 1
          h -= carveB * rimKeepB
          // Ensure fork beds sit under waterline so wetness fills
          if (carveB * rimKeepB > 0.08) {
            h = Math.min(h, 0.075)
          }
        }
      }

      // Shore-cut melt fingers — shallow wet scoops near rim (NO silhouette V-notches)
      const ang = Math.atan2(dy, dx)
      for (let ci = 0; ci < MELT_SHORE_CUTS.length; ci++) {
        const C = MELT_SHORE_CUTS[ci]!
        let dang = ang - C.ang
        while (dang > Math.PI) dang -= Math.PI * 2
        while (dang < -Math.PI) dang += Math.PI * 2
        const lateral = Math.abs(dang) * Math.max(0.4, r) * maxR
        const inward = 1 - r
        if (inward < 0.12 || inward > C.len + 0.06) continue
        if (lateral > C.w) continue
        if (r < 0.55 || r > 0.92) continue
        const alongCut = Math.sin(Math.PI * Math.min(1, (inward - 0.1) / Math.max(0.05, C.len - 0.05)))
        const carveC =
          Math.pow(1 - lateral / C.w, 1.5) * alongCut * C.a * 0.55
        // Keep pale rim continuous — never carve rim to ocean zero
        const rimFloor = 0.05 + (r - 0.55) * 0.06
        h = Math.max(rimFloor, h - carveC)
      }

      h = Math.max(0, Math.min(1.1, h))
      if (rr > 1.02) h = 0
      else if (rr > 0.86) h *= smoothstep((1.02 - rr) / 0.16)

      // Floor — inland creek beds stay ABOVE ocean zero (anti twin-bean split)
      const inMain = sd < bank * 1.05
      let inFork = false
      for (let bi = 0; bi < MELT_BRANCHES.length; bi++) {
        const B = MELT_BRANCHES[bi]!
        if (along < B.t0 || along > B.t1) continue
        const bCross = (dx - dy) * 0.48 - wob
        if (Math.abs(bCross - B.side) * cx < B.w * 1.05) inFork = true
      }
      // Mouth only at SE rim — inland channel never punched to void
      const atMouth = mouthGate > 0.55 && inMain && rr > 0.78
      if (mask > 0.15 && rr <= 1.0) {
        if (atMouth) {
          // Narrow open into sea at rim only
          if (sd < bank * (0.85 + mouthGate * 0.35)) {
            h = Math.min(h, Math.max(0, 0.02 * (1 - mouthGate)))
            if (mouthGate > 0.8 && sd < bank * 0.9 && rr > 0.86) h = 0
          }
        } else if (inMain || inFork) {
          // Wet bed under waterline, land mass stays connected (no twin-bean split)
          const bed = 0.05 + 0.015 * (1 - mouthGate)
          if (h < bed) h = bed
          if (sd < bank * 0.65) h = Math.min(h, 0.08)
        } else {
          const floor = r > 0.72 ? 0.08 + (r - 0.72) * 0.08 : 0.05
          if (h < floor) h = floor * (0.55 + 0.45 * mask)
        }
      }

      heights[y * size + x] = h
    }
  }

  // Very light blur — preserve multi-hill relief (do not pancake)
  const tmp = new Float32Array(heights)
  const maxSlope = 0.3
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const dx = (x - cx) / maxR
        const dy = (y - cy) / maxR
        const r = Math.sqrt(dx * dx * 1.0 + dy * dy * 1.06)
        const i = y * size + x
        const h0 = tmp[i]!
        if (h0 <= 0.001) {
          heights[i] = 0
          continue
        }
        const alongB = (dx + dy) * 0.55
        const mouthB = smoothstep((alongB - 0.22) / 0.48)
        const sdB = streamDist(x, y, size, noiseSeed)
        if (mouthB > 0.7 && sdB < 2.2 && r > 0.8) {
          heights[i] = Math.min(h0, 0.02)
          if (mouthB > 0.85 && sdB < 1.8 && r > 0.88) heights[i] = 0
          continue
        }
        const rim = r > 0.78 ? smoothstep((r - 0.78) / 0.2) : 0
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
 * Distance to nearest meltwater channel (main + forks + shore cuts).
 * Used by wetness so carved side channels fill at creek scale.
 */
export function meltChannelDist(gx: number, gy: number, size: number, seed: number): number {
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const maxR = Math.min(cx, cy) * 0.92
  const nx = (gx - cx) / cx
  const ny = (gy - cy) / cy
  const dx = (gx - cx) / maxR
  const dy = (gy - cy) / maxR
  const along = (nx + ny) * 0.55
  const wobble = streamWobble(along, seed)
  const cross = (nx - ny) * 0.48 - wobble
  let best = Math.abs(cross) * cx
  // Mild mouth widen — not fat bay
  const mouthGate = Math.max(0, Math.min(1, (along - 0.22) / 0.48))
  if (mouthGate > 0.3) {
    best = best / (1 + mouthGate * 0.55)
  }
  for (let i = 0; i < MELT_BRANCHES.length; i++) {
    const B = MELT_BRANCHES[i]!
    if (along < B.t0 - 0.04 || along > B.t1 + 0.04) continue
    const bd = Math.abs(cross - B.side) * cx
    if (bd < best) best = bd
  }
  // Shore-cut fingers
  const r = Math.sqrt(dx * dx * 1.0 + dy * dy * 1.06)
  const ang = Math.atan2(dy, dx)
  for (let i = 0; i < MELT_SHORE_CUTS.length; i++) {
    const C = MELT_SHORE_CUTS[i]!
    let dang = ang - C.ang
    while (dang > Math.PI) dang -= Math.PI * 2
    while (dang < -Math.PI) dang += Math.PI * 2
    const lateral = Math.abs(dang) * Math.max(0.35, r) * maxR
    const inward = 1 - r
    if (inward < 0.05 || inward > C.len + 0.15) continue
    if (r < 0.45) continue
    if (lateral < best) best = lateral
  }
  return best
}

/** Soft waterline — stream beds sit under this; land above stays turf. */
export const WATER_LEVEL = 0.11

export function isWaterHeight(h: number): boolean {
  return h > 0.001 && h <= WATER_LEVEL
}
