/**
 * QA gate: Raise/Lower must change packed height sum/max.
 * Mirrors src/world/isleGrid.ts + src/sim/terrainEdit.ts (soft-iso land).
 * Run from repo root: node scripts/verify-sculpt.mjs
 */

function hash2(ix, iy, seed) {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}
function smoothstep(t) {
  return t * t * (3 - 2 * t)
}
function valueNoise2D(x, y, seed) {
  const x0 = Math.floor(x),
    y0 = Math.floor(y)
  const fx = smoothstep(x - x0),
    fy = smoothstep(y - y0)
  const a = hash2(x0, y0, seed),
    b = hash2(x0 + 1, y0, seed)
  const c = hash2(x0, y0 + 1, seed),
    d = hash2(x0 + 1, y0 + 1, seed)
  return a + (b - a) * fx + (c + (d - c) * fx - (a + (b - a) * fx)) * fy
}
function fbm(x, y, seed, octaves = 4) {
  let amp = 0.5,
    freq = 1,
    sum = 0,
    norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x * freq, y * freq, seed + i * 1013)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}
function streamWobble(along, seed) {
  return (
    (fbm(along * 2.4 + 2, along * 0.8, seed + 91) - 0.5) * 0.7 +
    (fbm(along * 5.2, along * 1.9, seed + 203) - 0.5) * 0.3
  )
}
function streamDist(gx, gy, size, seed) {
  const cx = (size - 1) * 0.5,
    cy = (size - 1) * 0.5
  const nx = (gx - cx) / cx,
    ny = (gy - cy) / cy
  const along = (nx + ny) * 0.55
  const cross = (nx - ny) * 0.48 - streamWobble(along, seed)
  return Math.abs(cross) * cx
}

const SIZE = 48
function createIsle(seed = 0x6e0f1e) {
  const size = SIZE
  const heights = new Float32Array(size * size)
  const noiseSeed = seed >>> 0

  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const maxR = Math.min(cx, cy) * 0.92

  // Separated lobes/ridges — asymmetric rolling country (crests near rim for outline)
  const lobes = [
    { lx: -0.52, ly: -0.24, a: 0.88, s: 0.26 },
    { lx: 0.3, ly: -0.52, a: 0.82, s: 0.24 },
    { lx: 0.54, ly: 0.2, a: 0.86, s: 0.28 },
    { lx: 0.2, ly: 0.54, a: 0.74, s: 0.26 },
    { lx: -0.36, ly: 0.52, a: 0.8, s: 0.27 },
    { lx: -0.58, ly: 0.16, a: 0.62, s: 0.22 },
    { lx: 0.58, ly: -0.22, a: 0.58, s: 0.2 },
    { lx: -0.06, ly: -0.58, a: 0.56, s: 0.22 },
    // Secondary ridge knobs (rolling country, not just L/R split-dome)
    { lx: -0.3, ly: 0.04, a: 0.48, s: 0.19 },
    { lx: 0.34, ly: 0.24, a: 0.46, s: 0.18 },
  ]
  // Valleys / saddles between lobes (clear lows at Fit — ≥25 CSS px vs crests)
  const valleys = [
    { lx: 0.05, ly: 0.12, a: 0.42, s: 0.38 },
    { lx: -0.22, ly: -0.05, a: 0.32, s: 0.3 },
    { lx: 0.28, ly: -0.08, a: 0.3, s: 0.28 },
    { lx: -0.08, ly: 0.35, a: 0.28, s: 0.26 },
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
      const plateau = 0.12 + fbm(x * 0.035, y * 0.035, noiseSeed) * 0.06
      let hills = 0
      for (let li = 0; li < lobes.length; li++) {
        const L = lobes[li]
        const ox = dx - L.lx
        const oy = dy - L.ly
        const d2 = (ox * ox + oy * oy) / (L.s * L.s)
        hills += L.a * Math.exp(-d2 * 2.2)
      }
      let dips = 0
      for (let vi = 0; vi < valleys.length; vi++) {
        const V = valleys[vi]
        const ox = dx - V.lx
        const oy = dy - V.ly
        const d2 = (ox * ox + oy * oy) / (V.s * V.s)
        dips += V.a * Math.exp(-d2 * 1.55)
      }
      // Broad rolling undulation (centered so lows go down)
      const und =
        (fbm(x * 0.06 + 2.2, y * 0.06, noiseSeed + 5) - 0.5) * 0.58 +
        (fbm(x * 0.12, y * 0.12, noiseSeed + 17) - 0.5) * 0.26
      const meso = (fbm(x * 0.26, y * 0.26, noiseSeed + 31) - 0.5) * 0.12
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
      const bank = 5.2
      if (sd < bank && r < 0.78) {
        const carve =
          Math.pow(1 - sd / bank, 1.1) * (0.8 + 0.2 * (1 - smoothstep(r / 0.78)))
        // Strong fade near rim — loaf crust stays continuous
        const rimKeep = r > 0.55 ? Math.pow(smoothstep((0.78 - r) / 0.23), 1.4) : 1
        h -= carve * 0.68 * rimKeep
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
  const maxSlope = 0.4
  for (let pass = 0; pass < 1; pass++) {
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const dx = (x - cx) / maxR
        const dy = (y - cy) / maxR
        const r = Math.sqrt(dx * dx + dy * dy)
        const i = y * size + x
        const h0 = tmp[i]
        if (h0 <= 0.001) {
          heights[i] = 0
          continue
        }
        const rim = r > 0.78 ? smoothstep((r - 0.78) / 0.22) : 0
        const s =
          tmp[i] * (6 - rim) +
          tmp[i - 1] +
          tmp[i + 1] +
          tmp[i - size] +
          tmp[i + size]
        const w = 10 - rim
        let h = s / w
        for (const n of [tmp[i - 1], tmp[i + 1], tmp[i - size], tmp[i + size]]) {
          if (n <= 0.001) continue
          if (h - n > maxSlope) h = n + maxSlope
          if (n - h > maxSlope) h = n - maxSlope
        }
        heights[i] = Math.max(0, Math.min(1.05, h))
      }
    }
    tmp.set(heights)
  }

  return heights
}

function stats(heights) {
  let sum = 0,
    max = 0
  for (let i = 0; i < heights.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(heights[i] * 255)))
    sum += v
    if (v > max) max = v
  }
  return { sum, max }
}

function paint(heights, gx, gy, dir, radius = 11.5, strength = 0.34) {
  const r2 = radius * radius
  let changed = false
  for (
    let y = Math.max(0, Math.floor(gy - radius));
    y <= Math.min(SIZE - 1, Math.ceil(gy + radius));
    y++
  ) {
    for (
      let x = Math.max(0, Math.floor(gx - radius));
      x <= Math.min(SIZE - 1, Math.ceil(gx + radius));
      x++
    ) {
      const d2 = (x - gx) ** 2 + (y - gy) ** 2
      if (d2 > r2) continue
      const t = 1 - Math.sqrt(d2) / radius
      const s = t * t * (3 - 2 * t)
      const soft = s * s
      const before = heights[y * SIZE + x]
      if (before <= 0.001 && dir > 0) continue
      const next = Math.max(0, Math.min(1.25, before + dir * strength * soft))
      if (Math.abs(next - before) < 1e-7) continue
      heights[y * SIZE + x] = next
      changed = true
    }
  }
  return changed
}

const h = createIsle(0x6e0f1e)
const before = stats(h)
let bx = 0,
  by = 0,
  bh = 0
for (let y = 0; y < SIZE; y++)
  for (let x = 0; x < SIZE; x++) {
    const v = h[y * SIZE + x]
    if (v > bh) {
      bh = v
      bx = x
      by = y
    }
  }
console.log('crown', { bx, by, bh: +bh.toFixed(3) }, 'before', before)

let any = false
for (let i = 0; i < 8; i++) any = paint(h, bx, by, 1) || any
const afterRaise = stats(h)
console.log(
  'afterRaise',
  afterRaise,
  'dSum',
  afterRaise.sum - before.sum,
  'dMax',
  afterRaise.max - before.max,
)

if (!any || afterRaise.sum <= before.sum) {
  console.error('FAIL: Raise did not increase height sum')
  process.exit(1)
}
if (afterRaise.max <= before.max && before.max < 250) {
  console.error('FAIL: Raise did not increase max (and had headroom)')
  process.exit(1)
}

let ah = 0
for (let y = 0; y < SIZE; y++)
  for (let x = 0; x < SIZE; x++) {
    const v = h[y * SIZE + x]
    if (v > ah) ah = v
  }
const dPeak = ah - bh
console.log('peakDelta', { before: +bh.toFixed(3), after: +ah.toFixed(3), dPeak: +dPeak.toFixed(3) })
if (dPeak < 0.18) {
  console.error('FAIL: Raise peak delta too small for readable silhouette', dPeak)
  process.exit(1)
}
const approxCss = dPeak * 40
console.log('approxCrestCssPx', +approxCss.toFixed(1))
if (approxCss < 6) {
  console.error('FAIL: approx crest lift < 6 CSS px', approxCss)
  process.exit(1)
}

const mid = afterRaise
for (let i = 0; i < 14; i++) paint(h, bx, by, -1)
const afterLower = stats(h)
console.log('afterLower', afterLower, 'dSum', afterLower.sum - mid.sum)
if (afterLower.sum >= mid.sum) {
  console.error('FAIL: Lower did not decrease height sum')
  process.exit(1)
}

console.log('PASS: Raise/Lower mutate heightfield (sum/max)')
