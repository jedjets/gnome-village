/**
 * QA gate: Raise/Lower must change packed height sum/max.
 * Mirrors src/world/isleGrid.ts + src/sim/terrainEdit.ts (soft-iso 0.7.4).
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
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const fx = smoothstep(x - x0), fy = smoothstep(y - y0)
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed)
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed)
  return a + (b - a) * fx + (c + (d - c) * fx - (a + (b - a) * fx)) * fy
}
function fbm(x, y, seed, octaves = 4) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0
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
  const cx = (size - 1) * 0.5, cy = (size - 1) * 0.5
  const nx = (gx - cx) / cx, ny = (gy - cy) / cy
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
  const valleys = [
    { lx: 0.02, ly: 0.12, a: 0.36, s: 0.4 },
    { lx: -0.2, ly: -0.14, a: 0.28, s: 0.32 },
    { lx: 0.24, ly: -0.06, a: 0.26, s: 0.3 },
  ]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / maxR
      const dy = (y - cy) / maxR
      const rEll = Math.sqrt(dx * dx * 1.08 + dy * dy * 0.92)
      const rimWarp =
        (fbm(x * 0.07 + 1.7, y * 0.07, noiseSeed + 44) - 0.5) * 0.16 +
        (fbm(x * 0.16, y * 0.16, noiseSeed + 88) - 0.5) * 0.09 +
        (fbm(x * 0.28 + 3.1, y * 0.24, noiseSeed + 121) - 0.5) * 0.05
      const rr = rEll + rimWarp
      const r = rEll
      let mask = 1
      if (rr > 0.68) mask = smoothstep((1.05 - rr) / 0.37)
      if (rr > 1.05) mask = 0

      const plateau = 0.14 + fbm(x * 0.03, y * 0.03, noiseSeed) * 0.05
      let hills = 0
      for (const L of lobes) {
        const ox = dx - L.lx, oy = dy - L.ly
        hills += L.a * Math.exp(-(ox * ox + oy * oy) / (L.s * L.s) * 1.7)
      }
      let dips = 0
      for (const V of valleys) {
        const ox = dx - V.lx, oy = dy - V.ly
        dips += V.a * Math.exp(-(ox * ox + oy * oy) / (V.s * V.s) * 1.4)
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

      const sd = streamDist(x, y, size, noiseSeed)
      const bank = 2.95
      const wob = streamWobble(along, noiseSeed)
      const mouthGate = smoothstep((along - 0.28) / 0.42)
      if (sd < bank && r < 0.98) {
        const carve =
          Math.pow(1 - sd / bank, 1.4) * (0.78 + 0.22 * (1 - smoothstep(r / 0.9)))
        const rimKeep =
          mouthGate > 0.15
            ? Math.max(0.05, 1 - mouthGate * 1.05)
            : r > 0.64
              ? Math.pow(smoothstep((0.88 - r) / 0.24), 1.1)
              : 1
        h -= carve * (0.58 + mouthGate * 0.55) * Math.max(0.08, rimKeep)
        if (mouthGate > 0.35 && sd < bank * (1.15 + mouthGate * 1.4)) {
          const bay = Math.pow(1 - sd / (bank * (1.15 + mouthGate * 1.4)), 1.2) * mouthGate
          h -= bay * 0.55
        }
      }
      const branches = [
        { t0: -0.38, t1: 0.18, side: 0.2, w: 1.65, a: 0.5 },
        { t0: -0.05, t1: 0.52, side: -0.18, w: 1.5, a: 0.44 },
      ]
      for (const B of branches) {
        if (along < B.t0 || along > B.t1) continue
        const u = (along - B.t0) / (B.t1 - B.t0)
        const flare = Math.sin(u * Math.PI)
        const bd = Math.abs((dx - dy) * 0.48 - wob - B.side) * cx
        if (bd < B.w && r < 0.78) {
          const carveB = Math.pow(1 - bd / B.w, 1.35) * flare * B.a
          const rimKeepB = r > 0.58 ? Math.pow(smoothstep((0.8 - r) / 0.22), 1.15) : 1
          h -= carveB * rimKeepB
        }
      }
      h = Math.max(0, Math.min(1.1, h))
      if (rr > 1.05) h = 0
      else if (rr > 0.88) h *= smoothstep((1.05 - rr) / 0.17)
      const inMain = sd < bank * 1.1
      const inFork = Math.abs((dx - dy) * 0.48 - wob) * cx < 1.85
      const atMouth = mouthGate > 0.4 && inMain
      if (mask > 0.2 && rr <= 1.0 && !atMouth) {
        const floor = inMain || inFork ? 0.015 : r > 0.7 ? 0.06 + (r - 0.7) * 0.07 : 0.035
        if (h < floor) h = floor * (0.5 + 0.5 * mask)
      }
      if (atMouth && sd < bank * (0.85 + mouthGate) && rr > 0.72) {
        h = Math.min(h, Math.max(0, 0.06 * (1 - mouthGate)))
        if (mouthGate > 0.72 && sd < bank * 1.5) h = 0
      }
      heights[y * size + x] = h
    }
  }

  const tmp = new Float32Array(heights)
  const maxSlope = 0.32
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const dx = (x - cx) / maxR
        const dy = (y - cy) / maxR
        const r = Math.sqrt(dx * dx + dy * dy)
        const i = y * size + x
        if (tmp[i] <= 0.001) { heights[i] = 0; continue }
        const rim = r > 0.78 ? smoothstep((r - 0.78) / 0.22) : 0
        const s = tmp[i] * (6 - rim) + tmp[i - 1] + tmp[i + 1] + tmp[i - size] + tmp[i + size]
        let h = s / (10 - rim)
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
  let sum = 0, max = 0
  for (let i = 0; i < heights.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(heights[i] * 255)))
    sum += v
    if (v > max) max = v
  }
  return { sum, max }
}

function paint(heights, gx, gy, dir, radius = 12.5, strength = 0.48) {
  const r2 = radius * radius
  let changed = false
  for (let y = Math.max(0, Math.floor(gy - radius)); y <= Math.min(SIZE - 1, Math.ceil(gy + radius)); y++) {
    for (let x = Math.max(0, Math.floor(gx - radius)); x <= Math.min(SIZE - 1, Math.ceil(gx + radius)); x++) {
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
let bx = 0, by = 0, bh = 0
for (let y = 0; y < SIZE; y++)
  for (let x = 0; x < SIZE; x++) {
    const v = h[y * SIZE + x]
    if (v > bh) { bh = v; bx = x; by = y }
  }
console.log('crown', { bx, by, bh: +bh.toFixed(3) }, 'before', before)

// Mouth open check: SE rim cells along stream should hit near-zero
let mouthZeros = 0
let mouthSamples = 0
const cx = (SIZE - 1) * 0.5
for (let y = 0; y < SIZE; y++)
  for (let x = 0; x < SIZE; x++) {
    const dx = (x - cx) / (cx * 0.92)
    const dy = (y - cx) / (cx * 0.92)
    const along = (dx + dy) * 0.55
    const r = Math.hypot(dx, dy)
    if (along > 0.45 && r > 0.7 && streamDist(x, y, SIZE, 0x6e0f1e) < 3.5) {
      mouthSamples++
      if (h[y * SIZE + x] < 0.04) mouthZeros++
    }
  }
console.log('mouthOpen', { mouthSamples, mouthZeros })
if (mouthSamples > 5 && mouthZeros < 2) {
  console.error('FAIL: melt mouth does not open to sea (too few near-zero cells)')
  process.exit(1)
}

let any = false
for (let i = 0; i < 8; i++) any = paint(h, bx, by, 1) || any
const afterRaise = stats(h)
console.log('afterRaise', afterRaise, 'dSum', afterRaise.sum - before.sum, 'dMax', afterRaise.max - before.max)
if (!any || afterRaise.sum <= before.sum) {
  console.error('FAIL: Raise did not increase height sum')
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
  console.error('FAIL: Raise peak delta too small', dPeak)
  process.exit(1)
}
const approxCss = dPeak * 70 // HEIGHT_SCALE ~70
console.log('approxCrestCssPx', +approxCss.toFixed(1))
if (approxCss < 8) {
  console.error('FAIL: approx crest lift < 8 CSS px', approxCss)
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
console.log('PASS: Raise/Lower mutate heightfield; melt mouth opens')
