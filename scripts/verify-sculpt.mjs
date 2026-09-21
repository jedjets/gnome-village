/**
 * QA gate: Raise/Lower must change packed height sum/max; melt mouth opens.
 * Soft-iso 0.7.6 — mirrors src/world/isleGrid.ts createSeededIsle (look craft).
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

const MELT_BRANCHES = [
  { t0: -0.55, t1: -0.05, side: 0.15, w: 1.25, a: 0.5 },
  { t0: -0.32, t1: 0.2, side: -0.13, w: 1.15, a: 0.46 },
  { t0: -0.02, t1: 0.5, side: 0.22, w: 1.2, a: 0.48 },
  { t0: 0.12, t1: 0.58, side: -0.2, w: 1.05, a: 0.42 },
  { t0: -0.18, t1: 0.28, side: 0.34, w: 0.95, a: 0.36 },
  { t0: 0.28, t1: 0.68, side: 0.08, w: 1.0, a: 0.34 },
]
const MELT_SHORE_CUTS = [
  { ang: -0.85, len: 0.22, w: 0.55, a: 0.22 },
  { ang: -0.2, len: 0.2, w: 0.5, a: 0.2 },
  { ang: 0.55, len: 0.24, w: 0.58, a: 0.22 },
  { ang: 1.15, len: 0.18, w: 0.48, a: 0.18 },
  { ang: 1.7, len: 0.2, w: 0.52, a: 0.2 },
]

const SIZE = 48
function createIsle(seed = 0x6e0f1e) {
  const size = SIZE
  const heights = new Float32Array(size * size)
  const noiseSeed = seed >>> 0
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const maxR = Math.min(cx, cy) * 0.92

  const peaks = [
    { lx: -0.12, ly: -0.18, a: 0.72, s: 0.38 },
    { lx: 0.22, ly: 0.08, a: 0.58, s: 0.34 },
    { lx: -0.34, ly: 0.2, a: 0.48, s: 0.28 },
    { lx: 0.08, ly: -0.38, a: 0.44, s: 0.26 },
    { lx: 0.36, ly: -0.2, a: 0.4, s: 0.24 },
    { lx: -0.28, ly: -0.36, a: 0.36, s: 0.22 },
    { lx: 0.18, ly: 0.36, a: 0.34, s: 0.26 },
    { lx: -0.02, ly: 0.14, a: 0.28, s: 0.3 },
  ]
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
      const rEll = Math.sqrt(dx * dx * 1.0 + dy * dy * 1.06)
      const rimWarp =
        (fbm(x * 0.055 + 1.7, y * 0.055, noiseSeed + 44) - 0.5) * 0.14 +
        (fbm(x * 0.12, y * 0.12, noiseSeed + 88) - 0.5) * 0.08 +
        (fbm(x * 0.22 + 3.1, y * 0.2, noiseSeed + 121) - 0.5) * 0.05
      const rr = rEll + rimWarp
      const r = rEll
      let mask = 1
      if (rr > 0.62) mask = smoothstep((1.02 - rr) / 0.4)
      if (rr > 1.02) mask = 0

      const plateau = 0.4 + fbm(x * 0.025, y * 0.025, noiseSeed) * 0.06
      let hills = 0
      for (const L of peaks) {
        const ox = dx - L.lx, oy = dy - L.ly
        hills += L.a * Math.exp(-(ox * ox + oy * oy) / (L.s * L.s) * 1.55)
      }
      let dips = 0
      for (const V of valleys) {
        const ox = dx - V.lx, oy = dy - V.ly
        dips += V.a * Math.exp(-(ox * ox + oy * oy) / (V.s * V.s) * 1.35)
      }
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

      const sd = streamDist(x, y, size, noiseSeed)
      const bank = 1.95
      const wob = streamWobble(along, noiseSeed)
      const mouthGate = smoothstep((along - 0.22) / 0.48)
      if (sd < bank && r < 0.98) {
        const carve =
          Math.pow(1 - sd / bank, 1.55) * (0.72 + 0.2 * (1 - smoothstep(r / 0.88)))
        const rimKeep =
          mouthGate > 0.15
            ? Math.max(0.08, 1 - mouthGate * 0.95)
            : r > 0.68
              ? Math.pow(smoothstep((0.9 - r) / 0.22), 1.1)
              : 1
        h -= carve * (0.42 + mouthGate * 0.28) * Math.max(0.08, rimKeep)
        if (mouthGate > 0.35 && sd < bank * (1.1 + mouthGate * 0.9)) {
          const bay = Math.pow(1 - sd / (bank * (1.1 + mouthGate * 0.9)), 1.25) * mouthGate
          h -= bay * (0.35 + mouthGate * 0.25)
        }
      }
      for (const B of MELT_BRANCHES) {
        if (along < B.t0 || along > B.t1) continue
        const u = (along - B.t0) / (B.t1 - B.t0)
        const flare = Math.sin(u * Math.PI)
        const bd = Math.abs((dx - dy) * 0.48 - wob - B.side) * cx
        if (bd < B.w && r < 0.82) {
          const carveB = Math.pow(1 - bd / B.w, 1.45) * flare * B.a
          const rimKeepB = r > 0.62 ? Math.pow(smoothstep((0.84 - r) / 0.22), 1.1) : 1
          h -= carveB * rimKeepB
        }
      }
      const ang = Math.atan2(dy, dx)
      for (const C of MELT_SHORE_CUTS) {
        let dang = ang - C.ang
        while (dang > Math.PI) dang -= Math.PI * 2
        while (dang < -Math.PI) dang += Math.PI * 2
        const lateral = Math.abs(dang) * Math.max(0.4, r) * maxR
        const inward = 1 - r
        if (inward < 0.12 || inward > C.len + 0.06) continue
        if (lateral > C.w) continue
        if (r < 0.55 || r > 0.92) continue
        const alongCut = Math.sin(Math.PI * Math.min(1, (inward - 0.1) / Math.max(0.05, C.len - 0.05)))
        const carveC = Math.pow(1 - lateral / C.w, 1.5) * alongCut * C.a * 0.55
        const rimFloor = 0.05 + (r - 0.55) * 0.06
        h = Math.max(rimFloor, h - carveC)
      }

      h = Math.max(0, Math.min(1.1, h))
      if (rr > 1.02) h = 0
      else if (rr > 0.86) h *= smoothstep((1.02 - rr) / 0.16)

      const inMain = sd < bank * 1.05
      let inFork = false
      for (const B of MELT_BRANCHES) {
        if (along < B.t0 || along > B.t1) continue
        if (Math.abs((dx - dy) * 0.48 - wob - B.side) * cx < B.w * 1.05) inFork = true
      }
      const atMouth = mouthGate > 0.55 && inMain && rr > 0.78
      if (mask > 0.15 && rr <= 1.0) {
        if (atMouth) {
          if (sd < bank * (0.85 + mouthGate * 0.35)) {
            h = Math.min(h, Math.max(0, 0.02 * (1 - mouthGate)))
            if (mouthGate > 0.8 && sd < bank * 0.9 && rr > 0.86) h = 0
          }
        } else if (inMain || inFork) {
          const bed = 0.045 + 0.02 * (1 - mouthGate)
          if (h < bed) h = bed
          if (h > 0.1 && sd < bank * 0.55) h = Math.min(h, 0.09)
        } else {
          const floor = r > 0.72 ? 0.08 + (r - 0.72) * 0.08 : 0.05
          if (h < floor) h = floor * (0.55 + 0.45 * mask)
        }
      }
      heights[y * size + x] = h
    }
  }

  const tmp = new Float32Array(heights)
  const maxSlope = 0.3
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const dx = (x - cx) / maxR
        const dy = (y - cy) / maxR
        const r = Math.sqrt(dx * dx * 1.0 + dy * dy * 1.06)
        const i = y * size + x
        if (tmp[i] <= 0.001) { heights[i] = 0; continue }
        const alongB = (dx + dy) * 0.55
        const mouthB = smoothstep((alongB - 0.22) / 0.48)
        const sdB = streamDist(x, y, size, noiseSeed)
        if (mouthB > 0.6 && sdB < 2.8 && r > 0.66) {
          heights[i] = Math.min(tmp[i], 0.018)
          if (mouthB > 0.75 && sdB < 3.2) heights[i] = 0
          continue
        }
        const rim = r > 0.78 ? smoothstep((r - 0.78) / 0.2) : 0
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

let mouthZeros = 0, mouthSamples = 0
const cx = (SIZE - 1) * 0.5
for (let y = 0; y < SIZE; y++)
  for (let x = 0; x < SIZE; x++) {
    const dx = (x - cx) / (cx * 0.92)
    const dy = (y - cx) / (cx * 0.92)
    const along = (dx + dy) * 0.55
    const r = Math.hypot(dx, dy)
    if (along > 0.5 && r > 0.78 && streamDist(x, y, SIZE, 0x6e0f1e) < 2.0) {
      mouthSamples++
      if (h[y * SIZE + x] < 0.05) mouthZeros++
    }
  }
console.log('mouthOpen', { mouthSamples, mouthZeros })
if (mouthSamples > 2 && mouthZeros < 1) {
  console.error('FAIL: melt mouth does not open to sea')
  process.exit(1)
}

let any = false
for (let i = 0; i < 8; i++) any = paint(h, bx, by, 1) || any
const afterRaise = stats(h)
console.log('afterRaise', afterRaise, 'dSum', afterRaise.sum - before.sum)
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
const approxCss = dPeak * 70
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
