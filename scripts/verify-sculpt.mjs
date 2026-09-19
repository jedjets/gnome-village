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
  const heights = new Float32Array(SIZE * SIZE)
  const cx = (SIZE - 1) * 0.5,
    cy = (SIZE - 1) * 0.5
  const maxR = Math.min(cx, cy) * 0.92
  const lobes = [
    { lx: -0.34, ly: -0.2, a: 0.52, s: 0.5 },
    { lx: 0.3, ly: -0.36, a: 0.46, s: 0.44 },
    { lx: 0.2, ly: 0.4, a: 0.5, s: 0.48 },
    { lx: -0.24, ly: 0.3, a: 0.4, s: 0.42 },
    { lx: 0.04, ly: -0.04, a: 0.22, s: 0.65 },
  ]
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (x - cx) / maxR,
        dy = (y - cy) / maxR
      const r = Math.sqrt(dx * dx + dy * dy)
      const rimWarp = (fbm(x * 0.09 + 1.7, y * 0.09, seed + 44) - 0.5) * 0.12
      const rr = r + rimWarp
      const island = Math.max(0, 1 - Math.pow(Math.min(1.05, rr), 1.35))
      const mask = Math.pow(island, 0.55)
      const plateau = 0.34 + fbm(x * 0.04, y * 0.04, seed) * 0.1
      let hills = 0
      for (const L of lobes) {
        const ox = dx - L.lx,
          oy = dy - L.ly
        const d2 = (ox * ox + oy * oy) / (L.s * L.s)
        hills += L.a * Math.exp(-d2 * 1.65)
      }
      const und =
        (fbm(x * 0.07 + 2.2, y * 0.07, seed + 5) - 0.42) * 0.34 +
        (fbm(x * 0.14, y * 0.14, seed + 17) - 0.5) * 0.14
      const meso = (fbm(x * 0.22, y * 0.22, seed + 31) - 0.5) * 0.06
      let h = (plateau + hills + und + meso) * mask
      const sd = streamDist(x, y, SIZE, seed)
      const bank = 4.2
      if (sd < bank && r < 0.9) {
        const carve =
          Math.pow(1 - sd / bank, 1.25) * (0.6 + 0.4 * (1 - smoothstep(r / 0.9)))
        h -= carve * 0.38
      }
      h = Math.max(0, Math.min(1.08, h))
      if (rr > 1.02) h = 0
      else if (rr > 0.82) h *= smoothstep((1.02 - rr) / 0.2)
      heights[y * SIZE + x] = h
    }
  }
  const tmp = new Float32Array(heights)
  const maxSlope = 0.22
  for (let pass = 0; pass < 1; pass++) {
    for (let y = 1; y < SIZE - 1; y++) {
      for (let x = 1; x < SIZE - 1; x++) {
        const dx = (x - cx) / maxR,
          dy = (y - cy) / maxR
        const r = Math.sqrt(dx * dx + dy * dy)
        const i = y * SIZE + x
        if (tmp[i] <= 0.001) {
          heights[i] = 0
          continue
        }
        const rim = r > 0.72 ? smoothstep((r - 0.72) / 0.26) : 0
        let s =
          tmp[i] * (5 - rim) + tmp[i - 1] + tmp[i + 1] + tmp[i - SIZE] + tmp[i + SIZE]
        let h = s / (9 - rim)
        for (const n of [tmp[i - 1], tmp[i + 1], tmp[i - SIZE], tmp[i + SIZE]]) {
          if (n <= 0.001) continue
          if (h - n > maxSlope) h = n + maxSlope
          if (n - h > maxSlope) h = n - maxSlope
        }
        heights[i] = Math.max(0, Math.min(1.08, h))
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

function paint(heights, gx, gy, dir, radius = 10.5, strength = 0.28) {
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
