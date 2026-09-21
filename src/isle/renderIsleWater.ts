import type { Heightfield } from '../world/isleGrid'
import { sampleHeight, streamWobble } from '../world/isleGrid'
import {
  gridToIso,
  lerp3,
  rgba,
  WATER_SHALLOW,
  WATER_MID,
  WATER_DEEP,
  COL_SHORE,
  COL_MOSS,
  COL_DAMP,
  STREAM_HALF,
} from './renderIsleCore'
import type { Pt } from './renderIsleDraw'
import { chaikinClosed, pathFromPts } from './renderIsleDraw'

/**
 * Water as corner wetness field + marching-squares cell fills (ribbon sheet),
 * plus a parametric centerline bank cushion (Chaikin-smoothed).
 *
 * Critical: do NOT close an angular hull around all wet cells — that turns a
 * winding stream into a convex pond blob. Banks follow the centerline ribbon;
 * body is the union of MS wet polys (near-opaque, lightly fattened).
 */

const WET_THRESH = 0.48
const WATER_SURF = 0.1
const CHAIKIN_PASSES = 2
const DENSIFY_STEP = 1.2
const LOOP_LOWPASS = 3

type XY = { x: number; y: number }

export function drawStreamWater(
  ctx: CanvasRenderingContext2D,
  hf: Heightfield,
  wet: Float32Array,
  vertH: Float32Array,
  nv: number,
  cx: number,
  cy: number,
  nowMs?: number,
): void {
  const size = nv - 1
  const softWet = new Float32Array(wet)
  boxBlurField(softWet, nv, 1)

  const waterPolys: XY[][] = []

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i00 = y * nv + x
      const i10 = y * nv + (x + 1)
      const i11 = (y + 1) * nv + (x + 1)
      const i01 = (y + 1) * nv + x
      const w00 = softWet[i00]!
      const w10 = softWet[i10]!
      const w11 = softWet[i11]!
      const w01 = softWet[i01]!
      if (w00 < WET_THRESH && w10 < WET_THRESH && w11 < WET_THRESH && w01 < WET_THRESH) {
        continue
      }

      const surf = (h: number) => Math.min(h, WATER_SURF + 0.05)
      const p00 = gridToIso(x - cx, y - cy, surf(vertH[i00]!))
      const p10 = gridToIso(x + 1 - cx, y - cy, surf(vertH[i10]!))
      const p11 = gridToIso(x + 1 - cx, y + 1 - cy, surf(vertH[i11]!))
      const p01 = gridToIso(x - cx, y + 1 - cy, surf(vertH[i01]!))

      const corners: { w: number; p: XY }[] = [
        { w: w00, p: p00 },
        { w: w10, p: p10 },
        { w: w11, p: p11 },
        { w: w01, p: p01 },
      ]
      const poly = msCellPoly(corners, WET_THRESH)
      if (poly.length < 3) continue
      waterPolys.push(poly)
    }
  }

  if (waterPolys.length === 0) return

  // Crafted bank ribbon from stream centerline (winding — not convex hull)
  const ribbon = buildStreamRibbon(hf, vertH, nv, cx, cy, hf.seed)
  let loop: Pt[] | null = null
  if (ribbon && ribbon.length >= 8) {
    loop = chaikinClosed(ribbon, CHAIKIN_PASSES)
    loop = densifyClosed(loop, DENSIFY_STEP)
    loop = lowpassClosed(loop, LOOP_LOWPASS)
    loop = lowpassClosed(loop, 2)
  }

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // --- Soft living banks under the sheet ---
  if (loop && loop.length >= 6) {
    ctx.beginPath()
    pathFromPts(ctx, expandClosed(loop, 3.2), 0)
    ctx.fillStyle = rgba(lerp3(COL_MOSS, COL_DAMP, 0.4), 0.32)
    ctx.fill()

    ctx.beginPath()
    pathFromPts(ctx, expandClosed(loop, 2.4), 0)
    ctx.fillStyle = rgba(lerp3(COL_DAMP, COL_SHORE, 0.55), 0.55)
    ctx.fill()

    ctx.beginPath()
    pathFromPts(ctx, expandClosed(loop, 1.5), 0)
    ctx.fillStyle = rgba(COL_SHORE, 0.92)
    ctx.fill()

    ctx.beginPath()
    pathFromPts(ctx, expandClosed(loop, 0.7), 0)
    ctx.fillStyle = rgba(lerp3(COL_SHORE, WATER_SHALLOW, 0.4), 0.95)
    ctx.fill()
  }

  // --- Water body: MS cell sheet (ribbon-shaped, near-opaque) ---
  const fillCore = lerp3(WATER_SHALLOW, WATER_MID, 0.2)
  const fillDeep = lerp3(WATER_SHALLOW, WATER_MID, 0.5)
  for (const poly of waterPolys) {
    const fat = fattenPoly(poly, 0.55)
    ctx.beginPath()
    ctx.moveTo(fat[0]!.x, fat[0]!.y)
    for (let i = 1; i < fat.length; i++) ctx.lineTo(fat[i]!.x, fat[i]!.y)
    ctx.closePath()
    ctx.fillStyle = rgba(fillCore, 0.98)
    ctx.fill()
  }

  // Soft mid wash along ribbon (not a filled hull)
  if (loop && loop.length >= 6) {
    const mid = expandClosed(loop, -0.8)
    ctx.beginPath()
    pathFromPts(ctx, mid, 0)
    ctx.fillStyle = rgba(fillDeep, 0.45)
    ctx.fill()

    const core = expandClosed(loop, -1.8)
    ctx.beginPath()
    pathFromPts(ctx, core, 0)
    ctx.fillStyle = rgba(lerp3(fillDeep, WATER_DEEP, 0.2), 0.35)
    ctx.fill()

    // Soft bank washes — wide + low alpha (never knife/stair seal)
    ctx.beginPath()
    pathFromPts(ctx, loop, 0)
    for (const [w, a, col] of [
      [9, 0.12, lerp3(COL_SHORE, WATER_SHALLOW, 0.28)],
      [5.5, 0.14, lerp3(COL_SHORE, WATER_SHALLOW, 0.45)],
      [3, 0.1, lerp3(fillCore, COL_SHORE, 0.3)],
    ] as const) {
      ctx.strokeStyle = rgba(col, a)
      ctx.lineWidth = w
      ctx.stroke()
    }
  }

  if (nowMs != null && Number.isFinite(nowMs) && loop && loop.length >= 6) {
    let sx = 0
    let sy = 0
    for (const p of loop) {
      sx += p.x
      sy += p.y
    }
    const mx = sx / loop.length
    const my = sy / loop.length
    const shimmer = 0.02 + 0.01 * Math.sin(nowMs * 0.002)
    const g = ctx.createRadialGradient(mx - 4, my - 5, 0, mx, my, 22)
    g.addColorStop(0, `rgba(175, 215, 210, ${shimmer})`)
    g.addColorStop(1, 'rgba(175, 215, 210, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    pathFromPts(ctx, expandClosed(loop, -1.6), 0)
    ctx.fill()
  }

  ctx.restore()
}

function buildStreamRibbon(
  hf: Heightfield,
  vertH: Float32Array,
  nv: number,
  cx: number,
  cy: number,
  seed: number,
): Pt[] | null {
  const samples: { gx: number; gy: number; half: number; h: number }[] = []
  const n = 100
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    // Extend past SE rim so melt opens into bay / sea (not a closed pond)
    const along = -0.68 + t * 1.55
    const wobble = streamWobble(along, seed)
    const sum = along / 0.55
    const diff = wobble / 0.48
    const nx = (sum + diff) * 0.5
    const ny = (sum - diff) * 0.5
    const gx = cx + nx * cx
    const gy = cy + ny * cy
    const r = Math.hypot(nx, ny)
    const mouthGate = Math.max(0, Math.min(1, (along - 0.12) / 0.5))
    if (r > 0.98) continue
    // Inland: need land under ribbon; at mouth allow near-ocean samples
    const h = sampleVertH(vertH, nv, gx + 0.5, gy + 0.5)
    const landH = sampleHeight(hf, gx, gy)
    if (mouthGate < 0.35) {
      if (h < 0.02) continue
      if (landH < 0.01) continue
    } else if (landH < 0.001 && r < 0.78) {
      continue
    }
    const midBoost = Math.exp(-along * along * 2.6) * 0.1
    // Keep width at mouth (bay flare) instead of fading to a closed tip
    const rimFade =
      mouthGate > 0.25
        ? 0.55 + mouthGate * 0.7
        : r > 0.55
          ? Math.max(0.25, 1 - (r - 0.55) / 0.35)
          : 1
    const half =
      (STREAM_HALF * 0.34 + midBoost + mouthGate * 0.55) * rimFade
    if (half < 0.22) continue
    samples.push({
      gx,
      gy,
      half,
      h: Math.max(WATER_SURF, Math.min(h, WATER_SURF + 0.05)),
    })
  }
  if (samples.length < 8) return null

  for (let pass = 0; pass < 4; pass++) {
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
    const pL = gridToIso(
      s.gx + px * s.half - cx,
      s.gy + py * s.half - cy,
      Math.min(hL, WATER_SURF + 0.06),
    )
    const pR = gridToIso(
      s.gx - px * s.half - cx,
      s.gy - py * s.half - cy,
      Math.min(hR, WATER_SURF + 0.06),
    )
    left.push({ x: pL.x, y: pL.y, h: hL, gx: s.gx, gy: s.gy })
    right.push({ x: pR.x, y: pR.y, h: hR, gx: s.gx, gy: s.gy })
  }
  return [...left, ...right.reverse()]
}

function msCellPoly(corners: { w: number; p: XY }[], T: number): XY[] {
  const out: XY[] = []
  for (let k = 0; k < 4; k++) {
    const a = corners[k]!
    const b = corners[(k + 1) & 3]!
    const ina = a.w >= T
    const inb = b.w >= T
    if (ina) out.push({ x: a.p.x, y: a.p.y })
    if (ina !== inb) {
      const t = (T - a.w) / (b.w - a.w + 1e-9)
      out.push({
        x: a.p.x + (b.p.x - a.p.x) * t,
        y: a.p.y + (b.p.y - a.p.y) * t,
      })
    }
  }
  return out
}

function fattenPoly(pts: XY[], amount: number): XY[] {
  if (pts.length < 3 || amount < 1e-6) return pts
  let cx = 0
  let cy = 0
  for (const p of pts) {
    cx += p.x
    cy += p.y
  }
  cx /= pts.length
  cy /= pts.length
  return pts.map((p) => {
    const dx = p.x - cx
    const dy = p.y - cy
    const len = Math.hypot(dx, dy) || 1
    return { x: p.x + (dx / len) * amount, y: p.y + (dy / len) * amount }
  })
}

function boxBlurField(buf: Float32Array, nv: number, passes: number): void {
  const tmp = new Float32Array(nv * nv)
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < nv; y++) {
      for (let x = 0; x < nv; x++) {
        let s = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            const yy = y + dy
            if (xx < 0 || yy < 0 || xx >= nv || yy >= nv) continue
            s += buf[yy * nv + xx]!
            n++
          }
        }
        tmp[y * nv + x] = s / n
      }
    }
    buf.set(tmp)
  }
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

function lowpassClosed(pts: Pt[], radius: number): Pt[] {
  if (pts.length < 6 || radius < 1) return pts
  const m = pts.length
  const out: Pt[] = []
  for (let i = 0; i < m; i++) {
    let sx = 0
    let sy = 0
    let sh = 0
    let sgx = 0
    let sgy = 0
    let w = 0
    for (let d = -radius; d <= radius; d++) {
      const tw = radius + 1 - Math.abs(d)
      const p = pts[(i + d + m * 4) % m]!
      sx += p.x * tw
      sy += p.y * tw
      sh += p.h * tw
      sgx += p.gx * tw
      sgy += p.gy * tw
      w += tw
    }
    out.push({ x: sx / w, y: sy / w, h: sh / w, gx: sgx / w, gy: sgy / w })
  }
  return out
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
