import type { Heightfield } from '../world/isleGrid'
import { sampleHeight } from '../world/isleGrid'
import { gridToIso } from './renderIsleCore'

export type Pt = { x: number; y: number; h: number; gx: number; gy: number }

/** Land silhouette for soft loaf sides (radial rim walk + Chaikin). */
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
      if (sampleHeight(hf, cx + dx * mid, cy + dy * mid) > 0.04) lo = mid
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
  return chaikinClosed(pts, 2)
}

export function chaikinClosed(pts: Pt[], passes: number): Pt[] {
  let cur = pts
  for (let pass = 0; pass < passes; pass++) {
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

export function pathFromPts(ctx: CanvasRenderingContext2D, pts: Pt[], yOfs = 0): void {
  if (pts.length < 3) return
  ctx.moveTo(pts[0]!.x, pts[0]!.y + yOfs)
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i]!.x, pts[i]!.y + yOfs)
  }
  ctx.closePath()
}
