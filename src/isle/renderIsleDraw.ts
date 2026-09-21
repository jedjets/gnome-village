import type { Heightfield } from '../world/isleGrid'
import { sampleHeight } from '../world/isleGrid'
import { HEIGHT_SCALE, gridToIso } from './renderIsleCore'

export type Pt = { x: number; y: number; h: number; gx: number; gy: number }

/**
 * Height-displaced soft-iso land outline.
 * Footprint on land rim; silhouette height exaggerated from max-along-ray so
 * crest↔valley reads ≥25 CSS px at Fit — ridges push the green outline up.
 */
export function buildSilhouette(hf: Heightfield, cx: number, cy: number, n = 144): Pt[] {
  const maxR = Math.min(cx, cy) * 1.08
  const pts: Pt[] = []
  const ang0 = Math.PI * 0.5
  const step = 0.22

  // First pass: gather rim + maxH
  type Raw = { dx: number; dy: number; rimR: number; maxH: number }
  const raw: Raw[] = []
  for (let i = 0; i < n; i++) {
    const ang = ang0 + (i / n) * Math.PI * 2
    const dx = Math.cos(ang)
    const dy = Math.sin(ang)
    let lo = 0
    let hi = maxR
    for (let k = 0; k < 16; k++) {
      const mid = (lo + hi) * 0.5
      if (sampleHeight(hf, cx + dx * mid, cy + dy * mid) > 0.04) lo = mid
      else hi = mid
    }
    const rimR = lo
    if (rimR < 0.5) continue
    let maxH = 0
    for (let r = Math.max(0.4, rimR * 0.28); r <= rimR; r += step) {
      const ht = sampleHeight(hf, cx + dx * r, cy + dy * r)
      if (ht > maxH) maxH = ht
    }
    raw.push({ dx, dy, rimR, maxH })
  }

  // Normalize outline heights so crest↔valley spans ~full loaf relief
  let hLo = Infinity
  let hHi = -Infinity
  for (const r of raw) {
    hLo = Math.min(hLo, r.maxH)
    hHi = Math.max(hHi, r.maxH)
  }
  const hSpan = Math.max(0.2, hHi - hLo)

  for (const r of raw) {
    const t = Math.max(0, Math.min(1, (r.maxH - hLo) / hSpan))
    // Crest ease — gentle peaks/valleys on outline (not cookie, not cliff-cake)
    const te = t * t * (3 - 2 * t)
    const hSil = 0.08 + te * 0.72
    const inset = Math.min(0.07, Math.max(0, (hSil - 0.35) * 0.06))
    const useR = r.rimR * (1 - inset) + 0.15
    const gx = cx + r.dx * useR
    const gy = cy + r.dy * useR
    // Prefer true rim height so outline sits IN the sea like old HTML
    const hRim = Math.max(0.06, Math.min(hSil, sampleHeight(hf, gx, gy) * 0.5 + hSil * 0.5))
    const iso = gridToIso(gx - cx, gy - cy, hRim)
    const meanH = 0.4
    iso.y -= (hSil - meanH) * HEIGHT_SCALE * 0.16
    pts.push({ x: iso.x, y: iso.y, h: hRim, gx, gy })
  }
  // Extra Chaikin + circular low-pass — kill N-shore saw / stair teeth at Fit
  let out = chaikinClosed(pts, 2)
  out = circularLowpassPts(out, 2)
  out = chaikinClosed(out, 1)
  return out
}

/** Mild circular blur on closed outline (world px). */
function circularLowpassPts(pts: Pt[], radius: number): Pt[] {
  const n = pts.length
  if (n < 6 || radius < 1) return pts
  const out: Pt[] = new Array(n)
  for (let i = 0; i < n; i++) {
    let sx = 0
    let sy = 0
    let sh = 0
    let sgx = 0
    let sgy = 0
    let w = 0
    for (let d = -radius; d <= radius; d++) {
      const tw = radius + 1 - Math.abs(d)
      const p = pts[(i + d + n * 4) % n]!
      sx += p.x * tw
      sy += p.y * tw
      sh += p.h * tw
      sgx += p.gx * tw
      sgy += p.gy * tw
      w += tw
    }
    out[i] = { x: sx / w, y: sy / w, h: sh / w, gx: sgx / w, gy: sgy / w }
  }
  return out
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
