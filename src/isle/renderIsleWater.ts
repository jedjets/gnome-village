import type { Heightfield } from '../world/isleGrid'
import { sampleHeight, streamWobble } from '../world/isleGrid'
import {
  gridToIso,
  lerp3,
  rgba,
  WATER_SHALLOW,
  WATER_MID,
  COL_SHORE,
  COL_MOSS,
  STREAM_HALF,
} from './renderIsleCore'
import type { Pt } from './renderIsleDraw'
import { chaikinClosed, pathFromPts } from './renderIsleDraw'

const WATER_SURF = 0.12
const CHAIKIN_PASSES = 8

/**
 * Crafted winding stream ribbon with soft living banks.
 * Prototype lesson: continuous shoreline craft — NOT Gaussian wet-mask blob,
 * NOT MS saw-tooth, NOT cyan knife stroke.
 *
 * Readable water body (near-opaque core) + beige soft bank band that follows
 * the winding centerline.
 */
export function drawStreamWater(
  ctx: CanvasRenderingContext2D,
  hf: Heightfield,
  _wet: Float32Array,
  vertH: Float32Array,
  nv: number,
  cx: number,
  cy: number,
  nowMs?: number,
): void {
  const seed = hf.seed
  const ribbon = buildStreamRibbon(hf, vertH, nv, cx, cy, seed)
  if (!ribbon || ribbon.length < 8) return

  let loop = densifyClosed(ribbon, 1.2)
  loop = chaikinClosed(loop, CHAIKIN_PASSES)
  if (loop.length < 6) return

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // --- Soft living banks: readable beige shore ribbon (craft, not Gaussian flood) ---
  ctx.beginPath()
  pathFromPts(ctx, expandClosed(loop, 5.5), 0)
  ctx.fillStyle = rgba(lerp3(COL_MOSS, COL_SHORE, 0.55), 0.4)
  ctx.fill()

  // Opaque-ish shore cushion — the crafted bank
  ctx.beginPath()
  pathFromPts(ctx, expandClosed(loop, 3.6), 0)
  ctx.fillStyle = rgba(COL_SHORE, 0.95)
  ctx.fill()

  ctx.beginPath()
  pathFromPts(ctx, expandClosed(loop, 2.0), 0)
  ctx.fillStyle = rgba(lerp3(COL_SHORE, WATER_SHALLOW, 0.35), 0.95)
  ctx.fill()

  // --- Water body: near-opaque readable core, soft edge owned by banks ---
  const water = expandClosed(loop, -0.6)
  const fill = lerp3(WATER_SHALLOW, WATER_MID, 0.28)
  const edgeLite = lerp3(COL_SHORE, WATER_SHALLOW, 0.42)

  // Soft edge ladder (narrow — keeps ribbon readable, not a pond blob)
  for (const [inset, a, mix] of [
    [0.0, 0.7, 0.28],
    [0.8, 0.85, 0.14],
    [1.8, 0.95, 0.04],
    [3.0, 1.0, 0.0],
  ] as const) {
    ctx.beginPath()
    pathFromPts(ctx, expandClosed(water, -inset), 0)
    ctx.fillStyle = rgba(lerp3(fill, edgeLite, mix), a)
    ctx.fill()
  }

  // Soft midtone bank strokes — living edge, never cyan knife / dark teal
  ctx.beginPath()
  pathFromPts(ctx, water, 0)
  for (const [w, a, col] of [
    [7, 0.22, lerp3(COL_SHORE, WATER_SHALLOW, 0.35)],
    [4.5, 0.28, lerp3(COL_SHORE, WATER_SHALLOW, 0.5)],
    [2.5, 0.2, lerp3(fill, COL_SHORE, 0.3)],
  ] as const) {
    ctx.strokeStyle = rgba(col, a)
    ctx.lineWidth = w
    ctx.stroke()
  }

  if (nowMs != null && Number.isFinite(nowMs)) {
    let sx = 0
    let sy = 0
    for (const p of water) {
      sx += p.x
      sy += p.y
    }
    const mx = sx / water.length
    const my = sy / water.length
    const shimmer = 0.025 + 0.014 * Math.sin(nowMs * 0.002)
    const g = ctx.createRadialGradient(mx - 5, my - 6, 0, mx, my, 28)
    g.addColorStop(0, `rgba(170, 210, 205, ${shimmer})`)
    g.addColorStop(1, 'rgba(170, 210, 205, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    pathFromPts(ctx, expandClosed(water, -2.5), 0)
    ctx.fill()
  }

  ctx.restore()
}

/**
 * Parametric winding ribbon from stream centerline.
 * Mild mid-island widen (lagoon hint) but stays a ribbon, not a round pond.
 */
function buildStreamRibbon(
  hf: Heightfield,
  vertH: Float32Array,
  nv: number,
  cx: number,
  cy: number,
  seed: number,
): Pt[] | null {
  const samples: { gx: number; gy: number; half: number; h: number }[] = []
  const n = 64
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const along = -0.78 + t * 1.56
    const wobble = streamWobble(along, seed)
    const sum = along / 0.55
    const diff = wobble / 0.48
    const nx = (sum + diff) * 0.5
    const ny = (sum - diff) * 0.5
    const gx = cx + nx * cx
    const gy = cy + ny * cy
    const r = Math.hypot(nx, ny)
    if (r > 0.76) continue
    const h = sampleVertH(vertH, nv, gx + 0.5, gy + 0.5)
    if (h < 0.02) continue
    if (sampleHeight(hf, gx, gy) < 0.01) continue
    // Ribbon half-width: modest mid widen, fade at rim
    const midBoost = Math.exp(-along * along * 3.4) * 0.75
    const rimFade = r > 0.52 ? Math.max(0, 1 - (r - 0.52) / 0.24) : 1
    if (rimFade < 0.18) continue
    const half = (STREAM_HALF * 0.42 + midBoost) * rimFade
    if (half < 0.55) continue
    samples.push({ gx, gy, half, h: Math.max(WATER_SURF, Math.min(h, WATER_SURF + 0.06)) })
  }
  if (samples.length < 8) return null

  for (let pass = 0; pass < 3; pass++) {
    const next = samples.map((s) => s.half)
    for (let i = 1; i < samples.length - 1; i++) {
      next[i] =
        samples[i - 1]!.half * 0.25 + samples[i]!.half * 0.5 + samples[i + 1]!.half * 0.25
    }
    for (let i = 0; i < samples.length; i++) samples[i]!.half = next[i]!
  }

  const left: Pt[] = []
  const right: Pt[] = []
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!
    const prev = samples[Math.max(0, i - 1)]!
    const next = samples[Math.min(samples.length - 1, i + 1)]!
    let tx = next.gx - prev.gx
    let ty = next.gy - prev.gy
    const tl = Math.hypot(tx, ty) || 1
    tx /= tl
    ty /= tl
    const px = -ty
    const py = tx
    const hL = Math.max(
      WATER_SURF,
      sampleVertH(vertH, nv, s.gx + px * s.half + 0.5, s.gy + py * s.half + 0.5),
    )
    const hR = Math.max(
      WATER_SURF,
      sampleVertH(vertH, nv, s.gx - px * s.half + 0.5, s.gy - py * s.half + 0.5),
    )
    const pL = gridToIso(s.gx + px * s.half - cx, s.gy + py * s.half - cy, Math.min(hL, WATER_SURF + 0.08))
    const pR = gridToIso(s.gx - px * s.half - cx, s.gy - py * s.half - cy, Math.min(hR, WATER_SURF + 0.08))
    left.push({ x: pL.x, y: pL.y, h: hL, gx: s.gx, gy: s.gy })
    right.push({ x: pR.x, y: pR.y, h: hR, gx: s.gx, gy: s.gy })
  }

  return [...left, ...right.reverse()]
}

function sampleVertH(vertH: Float32Array, nv: number, gx: number, gy: number): number {
  const x = Math.max(0, Math.min(nv - 1, gx))
  const y = Math.max(0, Math.min(nv - 1, gy))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(nv - 1, x0 + 1)
  const y1 = Math.min(nv - 1, y0 + 1)
  const tx = x - x0
  const ty = y - y0
  return (
    vertH[y0 * nv + x0]! * (1 - tx) * (1 - ty) +
    vertH[y0 * nv + x1]! * tx * (1 - ty) +
    vertH[y1 * nv + x0]! * (1 - tx) * ty +
    vertH[y1 * nv + x1]! * tx * ty
  )
}

function densifyClosed(pts: Pt[], maxStep: number): Pt[] {
  if (pts.length < 3) return pts
  const out: Pt[] = []
  const m = pts.length
  for (let i = 0; i < m; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % m]!
    out.push(a)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len <= maxStep) continue
    const n = Math.ceil(len / maxStep)
    for (let k = 1; k < n; k++) {
      const t = k / n
      out.push({
        x: a.x + dx * t,
        y: a.y + dy * t,
        h: a.h + (b.h - a.h) * t,
        gx: a.gx + (b.gx - a.gx) * t,
        gy: a.gy + (b.gy - a.gy) * t,
      })
    }
  }
  return out
}

function expandClosed(pts: Pt[], amount: number): Pt[] {
  if (pts.length < 3 || Math.abs(amount) < 1e-6) return pts
  const m = pts.length
  let area = 0
  for (let i = 0; i < m; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % m]!
    area += a.x * b.y - b.x * a.y
  }
  const sign = area >= 0 ? 1 : -1
  const out: Pt[] = []
  for (let i = 0; i < m; i++) {
    const prev = pts[(i - 1 + m) % m]!
    const cur = pts[i]!
    const next = pts[(i + 1) % m]!
    const e1x = cur.x - prev.x
    const e1y = cur.y - prev.y
    const e2x = next.x - cur.x
    const e2y = next.y - cur.y
    const l1 = Math.hypot(e1x, e1y) || 1
    const l2 = Math.hypot(e2x, e2y) || 1
    let nx = sign * (e1y / l1 + e2y / l2)
    let ny = sign * -(e1x / l1 + e2x / l2)
    const nl = Math.hypot(nx, ny) || 1
    nx /= nl
    ny /= nl
    out.push({
      x: cur.x + nx * amount,
      y: cur.y + ny * amount,
      h: cur.h,
      gx: cur.gx,
      gy: cur.gy,
    })
  }
  return out
}
