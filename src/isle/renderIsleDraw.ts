import type { Heightfield } from '../world/isleGrid'
import { sampleHeight } from '../world/isleGrid'
import {
  MOSS_VIS_BOOST,
  gridToIso, lerp3, rgba,
  COL_DAMP, COL_SHORE, WATER_SOFT, WATER_CORE,
} from './renderIsleCore'
export type Pt = { x: number; y: number; h: number; gx: number; gy: number }
export function buildSilhouette(hf: Heightfield, cx: number, cy: number, n = 96): Pt[] {
  const maxR = Math.min(cx, cy) * 1.05
  const pts: Pt[] = []
  const ang0 = Math.PI * 0.5
  for (let i = 0; i < n; i++) {
    const ang = ang0 + (i / n) * Math.PI * 2
    const dx = Math.cos(ang)
    const dy = Math.sin(ang)
    let lo = 0
    let hi = maxR
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) * 0.5
      const gx = cx + dx * mid
      const gy = cy + dy * mid
      if (sampleHeight(hf, gx, gy) > 0.04) lo = mid
      else hi = mid
    }
    const r = lo
    const pad = 0.35
    const gxRim = cx + dx * (r + pad)
    const gyRim = cy + dy * (r + pad)
    const gxIn = cx + dx * Math.max(0.5, r * 0.92)
    const gyIn = cy + dy * Math.max(0.5, r * 0.92)
    const ht = Math.max(0.06, sampleHeight(hf, gxIn, gyIn))
    const iso = gridToIso(gxRim - cx, gyRim - cy, ht)
    pts.push({ x: iso.x, y: iso.y, h: ht, gx: gxRim, gy: gyRim })
  }
  let cur = pts
  for (let pass = 0; pass < 2; pass++) {
    const next: Pt[] = []
    const m = cur.length
    for (let i = 0; i < m; i++) {
      const a = cur[i]!
      const b = cur[(i + 1) % m]!
      next.push({
        x: a.x * 0.75 + b.x * 0.25,
        y: a.y * 0.75 + b.y * 0.25,
        h: a.h * 0.75 + b.h * 0.25,
        gx: a.gx * 0.75 + b.gx * 0.25,
        gy: a.gy * 0.75 + b.gy * 0.25,
      })
      next.push({
        x: a.x * 0.25 + b.x * 0.75,
        y: a.y * 0.25 + b.y * 0.75,
        h: a.h * 0.25 + b.h * 0.75,
        gx: a.gx * 0.25 + b.gx * 0.75,
        gy: a.gy * 0.25 + b.gy * 0.75,
      })
    }
    cur = next
  }
  return cur
}
export function buildMossOutline(hf: Heightfield, cx: number, cy: number, n = 72): Pt[] {
  const maxR = Math.min(cx, cy) * 1.02
  const pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2
    const dx = Math.cos(ang)
    const dy = Math.sin(ang)
    let lo = 0
    let hi = maxR
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) * 0.5
      if (sampleHeight(hf, cx + dx * mid, cy + dy * mid) > 0.035) lo = mid
      else hi = mid
    }
    const rEdge = lo
    const gxRim = cx + dx * rEdge
    const gyRim = cy + dy * rEdge
    const hRim = Math.max(0.05, sampleHeight(hf, cx + dx * rEdge * 0.88, cy + dy * rEdge * 0.88))
    let maxH = hRim
    for (let s = 0; s <= 14; s++) {
      const rr = rEdge * (s / 14)
      maxH = Math.max(maxH, sampleHeight(hf, cx + dx * rr, cy + dy * rr))
    }
    const facing = Math.max(0, -(dx + dy) / Math.SQRT2)
    const lift = Math.min(1.35, 0.55 + facing * 1.05)
    const htBase = hRim + (maxH - hRim) * lift
    const boost = 1 + (MOSS_VIS_BOOST - 1) * facing
    const ht = htBase * boost
    const iso = gridToIso(gxRim - cx, gyRim - cy, ht)
    const relief = Math.max(0, maxH - hRim)
    const crown = sampleHeight(hf, cx, cy)
    const yLift = facing * facing * (36 + relief * 160 + Math.max(0, crown - hRim) * 70)
    const southDrop = (1 - facing) * (1 - facing) * 22
    pts.push({ x: iso.x, y: iso.y - yLift + southDrop, h: htBase, gx: gxRim, gy: gyRim })
  }
  let cur = pts
  for (let pass = 0; pass < 2; pass++) {
    const next: Pt[] = []
    const m = cur.length
    for (let i = 0; i < m; i++) {
      const a = cur[i]!
      const b = cur[(i + 1) % m]!
      next.push({
        x: a.x * 0.75 + b.x * 0.25,
        y: a.y * 0.75 + b.y * 0.25,
        h: a.h * 0.75 + b.h * 0.25,
        gx: a.gx * 0.75 + b.gx * 0.25,
        gy: a.gy * 0.75 + b.gy * 0.25,
      })
      next.push({
        x: a.x * 0.25 + b.x * 0.75,
        y: a.y * 0.25 + b.y * 0.75,
        h: a.h * 0.25 + b.h * 0.75,
        gx: a.gx * 0.25 + b.gx * 0.75,
        gy: a.gy * 0.25 + b.gy * 0.75,
      })
    }
    cur = next
  }
  return cur
}
export function drawSoftWetShore(
  ctx: CanvasRenderingContext2D,
  hf: Heightfield,
  wet: Float32Array,
  nv: number,
  cx: number,
  cy: number,
): void {
  let wSum = 0
  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let y = 0; y < nv; y++) {
    for (let x = 0; x < nv; x++) {
      const W = wet[y * nv + x]!
      if (W < 0.2) continue
      const gx = x - 0.5
      const gy = y - 0.5
      const ht = sampleHeight(hf, gx, gy)
      if (ht <= 0.03) continue
      const iso = gridToIso(gx - cx, gy - cy, ht)
      const w = W * W
      wSum += w
      sx += iso.x * w
      sy += iso.y * w
      sxx += iso.x * iso.x * w
      syy += iso.y * iso.y * w
      sxy += iso.x * iso.y * w
    }
  }
  if (wSum < 1e-3) return
  const mx = sx / wSum
  const my = sy / wSum
  const cxx = Math.max(0, sxx / wSum - mx * mx)
  const cyy = Math.max(0, syy / wSum - my * my)
  const cxy = sxy / wSum - mx * my
  const trace = cxx + cyy
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - (cxx * cyy - cxy * cxy)))
  const l1 = Math.max(trace * 0.5 + disc, 4)
  const l2 = Math.max(trace * 0.5 - disc, 4)
  const rx = Math.sqrt(l1) * 2.35
  const ry = Math.sqrt(l2) * 2.35
  const angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy)
  ctx.save()
  ctx.translate(mx, my)
  ctx.rotate(angle)
  ctx.scale(rx, Math.max(ry, rx * 0.28))
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  g.addColorStop(0, rgba(WATER_CORE, 0.86))
  g.addColorStop(0.4, rgba(WATER_SOFT, 0.78))
  g.addColorStop(0.72, rgba(lerp3(WATER_SOFT, COL_DAMP, 0.4), 0.42))
  g.addColorStop(0.9, rgba(lerp3(WATER_SOFT, COL_SHORE, 0.35), 0.14))
  g.addColorStop(1, rgba(WATER_SOFT, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
export function pathFromPts(ctx: CanvasRenderingContext2D, pts: Pt[], yOfs = 0): void {
  if (pts.length < 3) return
  ctx.moveTo(pts[0]!.x, pts[0]!.y + yOfs)
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i]!.x, pts[i]!.y + yOfs)
  }
  ctx.closePath()
}
