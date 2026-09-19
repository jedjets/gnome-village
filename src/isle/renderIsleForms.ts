import { LOAF_DEPTH, lerp3, rgba, EARTH_TOP, EARTH_MID, EARTH_BOT } from './renderIsleCore'
import { chaikinClosed, type Pt } from './renderIsleDraw'

type XY = { x: number; y: number }

/**
 * Soft loaf earth sides from land silhouette — prototype family, no needles.
 * Green outline keeps the sharp rolling sil; loaf ribbon is angle-resampled +
 * low-pass filtered so HEIGHT comb fringe / brown needle spurs cannot form.
 */
export function drawLoafFromSilhouette(ctx: CanvasRenderingContext2D, sil: Pt[]): void {
  if (sil.length < 4) return

  const top = prepLoafRibbon(sil)
  const n = top.length
  if (n < 4) return

  let minX = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of top) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const midX = (minX + maxX) * 0.5
  const halfW = Math.max(8, (maxX - minX) * 0.5)
  const scaleX = 1 + 2.2 / halfW
  const rim: XY[] = top.map((p) => ({
    x: midX + (p.x - midX) * scaleX,
    y: p.y,
  }))
  const bulgeBot = 1.02
  const g = ctx.createLinearGradient(0, maxY - 8, 0, maxY + LOAF_DEPTH)
  g.addColorStop(0, rgba(EARTH_TOP, 1))
  g.addColorStop(0.2, rgba(EARTH_TOP, 1))
  g.addColorStop(0.5, rgba(EARTH_MID, 1))
  g.addColorStop(0.82, rgba(EARTH_BOT, 1))
  g.addColorStop(1, rgba(lerp3(EARTH_BOT, [40, 28, 20], 0.28), 1))

  ctx.beginPath()
  ctx.moveTo(rim[0]!.x, rim[0]!.y)
  for (let i = 1; i < n; i++) ctx.lineTo(rim[i]!.x, rim[i]!.y)
  for (let i = n - 1; i >= 0; i--) {
    const p = rim[i]!
    const x = midX + (p.x - midX) * bulgeBot
    ctx.lineTo(x, p.y + LOAF_DEPTH)
  }
  ctx.closePath()
  ctx.fillStyle = g
  ctx.fill()

  ctx.strokeStyle = rgba(EARTH_MID, 1)
  ctx.lineWidth = 7
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.miterLimit = 1.4
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(rim[0]!.x, rim[0]!.y)
  for (let i = 1; i < n; i++) ctx.lineTo(rim[i]!.x, rim[i]!.y)
  ctx.closePath()
  ctx.strokeStyle = 'rgba(42, 30, 22, 0.34)'
  ctx.lineWidth = 6
  ctx.lineJoin = 'round'
  ctx.stroke()
}

/**
 * Angle-resample + low-pass radius/Y, then Chaikin + slope limit.
 * Guarantees no single-vertex X/Y spikes on loaf sides.
 */
function prepLoafRibbon(sil: Pt[]): XY[] {
  let cx = 0
  let cy = 0
  for (const p of sil) {
    cx += p.x
    cy += p.y
  }
  cx /= sil.length
  cy /= sil.length

  // Sample sil into polar bins (uniform angle) — kills comb fringe at tips
  const bins = 96
  const rad = new Float64Array(bins)
  const yv = new Float64Array(bins)
  const wts = new Float64Array(bins)
  for (const p of sil) {
    let ang = Math.atan2(p.y - cy, p.x - cx)
    if (ang < 0) ang += Math.PI * 2
    const bi = Math.min(bins - 1, Math.floor((ang / (Math.PI * 2)) * bins))
    const r = Math.hypot(p.x - cx, p.y - cy)
    // Prefer outer envelope in each bin (no inward needles)
    if (wts[bi]! < 1e-6 || r > rad[bi]!) {
      rad[bi] = r
      yv[bi] = p.y
      wts[bi] = 1
    }
  }
  // Fill empty bins from neighbors
  for (let i = 0; i < bins; i++) {
    if (wts[i]! > 0) continue
    for (let d = 1; d < bins; d++) {
      const a = (i - d + bins) % bins
      const b = (i + d) % bins
      if (wts[a]! > 0) {
        rad[i] = rad[a]!
        yv[i] = yv[a]!
        wts[i] = 1
        break
      }
      if (wts[b]! > 0) {
        rad[i] = rad[b]!
        yv[i] = yv[b]!
        wts[i] = 1
        break
      }
    }
  }

  // Circular low-pass on radius + Y (strong near E/W tips)
  const radS = circularLowpass(rad, 5)
  const yS = circularLowpass(yv, 5)
  // Extra tip flatten: soften bins near ang=π (west) and ang=0 (east)
  for (let i = 0; i < bins; i++) {
    const ang = ((i + 0.5) / bins) * Math.PI * 2
    const tip =
      Math.pow(Math.max(0, Math.cos(ang)), 2) * 0.55 + // east
      Math.pow(Math.max(0, -Math.cos(ang)), 2) * 0.55 // west
    if (tip < 0.05) continue
    let rAvg = 0
    let yAvg = 0
    let w = 0
    const win = 7
    for (let d = -win; d <= win; d++) {
      const j = (i + d + bins) % bins
      const tw = win + 1 - Math.abs(d)
      rAvg += radS[j]! * tw
      yAvg += yS[j]! * tw
      w += tw
    }
    radS[i] = radS[i]! * (1 - tip) + (rAvg / w) * tip
    yS[i] = yS[i]! * (1 - tip) + (yAvg / w) * tip
  }

  let pts: XY[] = []
  for (let i = 0; i < bins; i++) {
    const ang = ((i + 0.5) / bins) * Math.PI * 2
    const r = radS[i]!
    // Reconstruct x from polar; blend Y from polar and filtered y
    const x = cx + Math.cos(ang) * r
    const yPolar = cy + Math.sin(ang) * r
    const y = yPolar * 0.35 + yS[i]! * 0.65
    pts.push({ x, y })
  }

  pts = slopeLimitY(pts, 3.2)
  const asPt: Pt[] = pts.map((p) => ({ x: p.x, y: p.y, h: 0, gx: 0, gy: 0 }))
  pts = chaikinClosed(asPt, 2).map((p) => ({ x: p.x, y: p.y }))
  pts = slopeLimitY(pts, 2.6)
  pts = killVertexSpikes(pts)

  if (pts.length < 8) {
    return sil.map((p) => ({ x: p.x, y: p.y }))
  }
  return pts
}

function circularLowpass(arr: Float64Array, radius: number): Float64Array {
  const n = arr.length
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    let w = 0
    for (let d = -radius; d <= radius; d++) {
      const tw = radius + 1 - Math.abs(d)
      s += arr[(i + d + n * 4) % n]! * tw
      w += tw
    }
    out[i] = s / w
  }
  return out
}

function killVertexSpikes(pts: XY[]): XY[] {
  const n = pts.length
  if (n < 5) return pts
  const out: XY[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n]!
    const p = pts[i]!
    const b = pts[(i + 1) % n]!
    const midX = (a.x + b.x) * 0.5
    const midY = (a.y + b.y) * 0.5
    let x = p.x
    let y = p.y
    if (Math.abs(p.x - midX) > 2.2 && Math.abs(a.x - b.x) < 14) {
      x = midX * 0.8 + p.x * 0.2
    }
    if (Math.abs(p.y - midY) > 3 && Math.abs(a.y - b.y) < 16) {
      y = midY * 0.85 + p.y * 0.15
    }
    out[i] = { x, y }
  }
  return out
}

function slopeLimitY(pts: XY[], maxStep: number): XY[] {
  const n = pts.length
  if (n < 3 || maxStep <= 0) return pts
  const out: XY[] = pts.map((p) => ({ x: p.x, y: p.y }))
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < n; i++) {
      const a = out[i]!
      const b = out[(i + 1) % n]!
      const dy = b.y - a.y
      if (Math.abs(dy) > maxStep) {
        const s = maxStep * Math.sign(dy)
        const excess = dy - s
        b.y -= excess * 0.55
        a.y += excess * 0.45
      }
    }
    for (let i = n - 1; i >= 0; i--) {
      const a = out[i]!
      const b = out[(i - 1 + n) % n]!
      const dy = b.y - a.y
      if (Math.abs(dy) > maxStep) {
        const s = maxStep * Math.sign(dy)
        const excess = dy - s
        b.y -= excess * 0.55
        a.y += excess * 0.45
      }
    }
  }
  return out
}
