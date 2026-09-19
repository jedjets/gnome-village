/**
 * Seeded continuous heightfield — undulating moss mound + carved living stream.
 * Soft terrace rings give height-true beveled shelves (not painted ellipses).
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

/** Stream centerline wobble (must match streamDist / streamCenterline). */
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
 * Soft meandering centerline in grid space (same field as streamDist).
 * Returns points ordered along the channel — never a jagged hash polyline.
 */
export function streamCenterline(
  size: number,
  seed: number,
  steps = 64,
): { gx: number; gy: number }[] {
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const pts: { gx: number; gy: number }[] = []
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    const along = (u - 0.5) * 1.62
    const wobble = streamWobble(along, seed)
    // Invert streamDist: along = (nx+ny)*0.55, cross=0 => (nx-ny)*0.48 = wobble
    const sum = along / 0.55
    const diff = wobble / 0.48
    const nx = (sum + diff) * 0.5
    const ny = (sum - diff) * 0.5
    const gx = cx + nx * cx
    const gy = cy + ny * cy
    const r = Math.hypot(gx - cx, gy - cy) / (Math.min(cx, cy) * 0.92)
    if (r > 0.94) continue
    pts.push({ gx, gy })
  }
  // Chaikin-ish smooth — kill zigzag knife look
  if (pts.length < 4) return pts
  let cur = pts
  for (let pass = 0; pass < 3; pass++) {
    const next: { gx: number; gy: number }[] = [cur[0]!]
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i]!
      const b = cur[i + 1]!
      next.push({
        gx: a.gx * 0.75 + b.gx * 0.25,
        gy: a.gy * 0.75 + b.gy * 0.25,
      })
      next.push({
        gx: a.gx * 0.25 + b.gx * 0.75,
        gy: a.gy * 0.25 + b.gy * 0.75,
      })
    }
    next.push(cur[cur.length - 1]!)
    cur = next
  }
  return cur
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

      // Soft dome — steeper near rim so cliffs read at Fit
      const island = Math.max(0, 1 - Math.pow(Math.min(1, r), 1.45))
      const mound = Math.pow(island, 0.72)

      // Macro hills (visible at Fit) + meso undulation
      const macro =
        fbm(x * 0.04, y * 0.04, noiseSeed) * 0.62 +
        fbm(x * 0.085 + 4, y * 0.085, noiseSeed + 3) * 0.35
      const meso = fbm(x * 0.15, y * 0.15, noiseSeed + 11) * 0.22

      // Peak ~0.70 so Raise has headroom to poke a visible hill (QA blocker).
      let h = mound * (0.38 + macro * 0.55 + meso * 0.85)

      // Soft terrace rings → rounded beveled shelves (height-true, gradual)
      if (r > 0.48 && r < 0.98) {
        const t0 = smoothstep((r - 0.48) / 0.2)
        const t1 = smoothstep((r - 0.66) / 0.16)
        const t2 = smoothstep((r - 0.8) / 0.12)
        h -= t0 * 0.05 + t1 * 0.07 + t2 * 0.1
      }

      // Living stream bowl
      const sd = streamDist(x, y, size, noiseSeed)
      const bank = 4.0
      if (sd < bank && r < 0.86) {
        const carve = Math.pow(1 - sd / bank, 1.15) * (1 - smoothstep(r / 0.86))
        h -= carve * 0.72
      }

      h = Math.max(0, Math.min(0.72, h))
      if (r > 1.0) h = 0
      else if (r > 0.92) h *= smoothstep((1.0 - r) / 0.08)

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

export const WATER_LEVEL = 0.18

export function isWaterHeight(h: number): boolean {
  return h > 0.001 && h <= WATER_LEVEL
}
