/**
 * QA gate: Raise/Lower must change packed height sum/max.
 * Run from repo root: node scripts/verify-sculpt.mjs
 */

function hash2(ix, iy, seed) {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}
function smoothstep(t) { return t * t * (3 - 2 * t) }
function valueNoise2D(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const fx = smoothstep(x - x0), fy = smoothstep(y - y0)
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed)
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed)
  return a + (b - a) * fx + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy
}
function fbm(x, y, seed, octaves = 4) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x * freq, y * freq, seed + i * 1013)
    norm += amp; amp *= 0.5; freq *= 2
  }
  return sum / norm
}
function streamWobble(along, seed) {
  return (fbm(along * 2.4 + 2, along * 0.8, seed + 91) - 0.5) * 0.7 +
    (fbm(along * 5.2, along * 1.9, seed + 203) - 0.5) * 0.3
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
  const heights = new Float32Array(SIZE * SIZE)
  const cx = (SIZE - 1) * 0.5, cy = (SIZE - 1) * 0.5
  const maxR = Math.min(cx, cy) * 0.88
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (x - cx) / maxR, dy = (y - cy) / maxR
      const r = Math.sqrt(dx * dx + dy * dy)
      const island = Math.max(0, 1 - Math.pow(Math.min(1, r), 1.45))
      const mound = Math.pow(island, 0.72)
      const macro = fbm(x * 0.04, y * 0.04, seed) * 0.62 + fbm(x * 0.085 + 4, y * 0.085, seed + 3) * 0.35
      const meso = fbm(x * 0.15, y * 0.15, seed + 11) * 0.22
      let h = mound * (0.38 + macro * 0.55 + meso * 0.85)
      if (r > 0.48 && r < 0.98) {
        const t0 = smoothstep((r - 0.48) / 0.2)
        const t1 = smoothstep((r - 0.66) / 0.16)
        const t2 = smoothstep((r - 0.8) / 0.12)
        h -= t0 * 0.05 + t1 * 0.07 + t2 * 0.1
      }
      const sd = streamDist(x, y, SIZE, seed)
      if (sd < 4 && r < 0.86) {
        const carve = Math.pow(1 - sd / 4, 1.15) * (1 - smoothstep(r / 0.86))
        h -= carve * 0.72
      }
      h = Math.max(0, Math.min(0.72, h))
      if (r > 1) h = 0
      else if (r > 0.92) h *= smoothstep((1 - r) / 0.08)
      heights[y * SIZE + x] = h
    }
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

function paint(heights, gx, gy, dir, radius = 6.5, strength = 0.145) {
  const r2 = radius * radius
  let changed = false
  for (let y = Math.max(0, Math.floor(gy - radius)); y <= Math.min(SIZE - 1, Math.ceil(gy + radius)); y++) {
    for (let x = Math.max(0, Math.floor(gx - radius)); x <= Math.min(SIZE - 1, Math.ceil(gx + radius)); x++) {
      const d2 = (x - gx) ** 2 + (y - gy) ** 2
      if (d2 > r2) continue
      const falloff = 1 - Math.sqrt(d2) / radius
      const soft = falloff * falloff * (0.35 + 0.65 * falloff)
      const before = heights[y * SIZE + x]
      if (before <= 0.001 && dir > 0) continue
      const next = Math.max(0, Math.min(1, before + dir * strength * soft))
      if (Math.abs(next - before) < 1e-7) continue
      heights[y * SIZE + x] = next
      changed = true
    }
  }
  return changed
}

const h = createIsle(0x6e0f1e)
const before = stats(h)
// crown
let bx = 0, by = 0, bh = 0
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
  const v = h[y * SIZE + x]
  if (v > bh) { bh = v; bx = x; by = y }
}
console.log('crown', { bx, by, bh: +bh.toFixed(3) }, 'before', before)

let any = false
for (let i = 0; i < 10; i++) any = paint(h, bx, by, 1) || any
const afterRaise = stats(h)
console.log('afterRaise', afterRaise, 'dSum', afterRaise.sum - before.sum, 'dMax', afterRaise.max - before.max)

if (!any || afterRaise.sum <= before.sum) {
  console.error('FAIL: Raise did not increase height sum')
  process.exit(1)
}
if (afterRaise.max <= before.max && before.max < 250) {
  console.error('FAIL: Raise did not increase max (and had headroom)')
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
