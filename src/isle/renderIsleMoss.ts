import type { Heightfield } from '../world/isleGrid'
import { sampleHeight } from '../world/isleGrid'
import {
  MOSS_FANS, MOSS_VIS_BOOST,
  gridToIso, rgba,
} from './renderIsleCore'
import type { Pt } from './renderIsleDraw'
type FanVert = {
  x: number
  y: number
  h: number
  gx: number
  gy: number
  rgb: [number, number, number]
  L: number
}
export function drawMossMound(
  ctx: CanvasRenderingContext2D,
  hf: Heightfield,
  light: Float32Array,
  col: Float32Array,
  wet: Float32Array,
  nv: number,
  cx: number,
  cy: number,
  mossSil: Pt[],
): void {
  const peakH = Math.max(0.2, sampleHeight(hf, cx, cy))
  const crownH = peakH * MOSS_VIS_BOOST
  const centerIso = gridToIso(0, 0, crownH)
  const n = MOSS_FANS
  const maxR = Math.min(cx, cy) * 1.0
  const rim: FanVert[] = []
  const midRing: FanVert[] = []
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2
    const dx = Math.cos(ang)
    const dy = Math.sin(ang)
    let lo = 0
    let hi = maxR
    for (let k = 0; k < 12; k++) {
      const mid = (lo + hi) * 0.5
      if (sampleHeight(hf, cx + dx * mid, cy + dy * mid) > 0.04) lo = mid
      else hi = mid
    }
    const r = Math.max(0.8, lo * 0.98)
    const gxR = cx + dx * r
    const gyR = cy + dy * r
    const gxShoulder = cx + dx * r * 0.78
    const gyShoulder = cy + dy * r * 0.78
    const hRim = Math.max(
      0.03,
      sampleHeight(hf, gxShoulder, gyShoulder) * 0.22 + sampleHeight(hf, gxR, gyR) * 0.15,
    )
    const isoR = gridToIso(gxR - cx, gyR - cy, hRim)
    const xiR = Math.max(0, Math.min(nv - 1, Math.round(gxR + 0.5)))
    const yiR = Math.max(0, Math.min(nv - 1, Math.round(gyR + 0.5)))
    const ciR = (yiR * nv + xiR) * 3
    rim.push({
      x: isoR.x,
      y: isoR.y,
      h: hRim,
      gx: gxR,
      gy: gyR,
      rgb: [col[ciR]!, col[ciR + 1]!, col[ciR + 2]!],
      L: light[yiR * nv + xiR]!,
    })
    const rr = r * 0.48
    const gxM = cx + dx * rr
    const gyM = cy + dy * rr
    let hM = sampleHeight(hf, gxM, gyM)
    hM = Math.max(hM, peakH * 0.62) * MOSS_VIS_BOOST
    const isoM = gridToIso(gxM - cx, gyM - cy, hM)
    const xiM = Math.max(0, Math.min(nv - 1, Math.round(gxM + 0.5)))
    const yiM = Math.max(0, Math.min(nv - 1, Math.round(gyM + 0.5)))
    const ciM = (yiM * nv + xiM) * 3
    midRing.push({
      x: isoM.x,
      y: isoM.y,
      h: hM,
      gx: gxM,
      gy: gyM,
      rgb: [col[ciM]!, col[ciM + 1]!, col[ciM + 2]!],
      L: light[yiM * nv + xiM]!,
    })
  }
  const xiC = Math.max(0, Math.min(nv - 1, Math.round(cx + 0.5)))
  const yiC = Math.max(0, Math.min(nv - 1, Math.round(cy + 0.5)))
  const cCol: [number, number, number] = [
    col[(yiC * nv + xiC) * 3]!,
    col[(yiC * nv + xiC) * 3 + 1]!,
    col[(yiC * nv + xiC) * 3 + 2]!,
  ]
  const cL = light[yiC * nv + xiC]! * 1.12
  let minX = centerIso.x
  let maxX = centerIso.x
  let minY = centerIso.y
  let maxY = centerIso.y
  for (const p of rim) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  for (const p of mossSil) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const pad = 32
  const ow = Math.ceil(maxX - minX + pad * 2)
  const oh = Math.ceil(maxY - minY + pad * 2)
  if (ow < 4 || oh < 4) return
  const off = document.createElement('canvas')
  off.width = Math.max(1, ow)
  off.height = Math.max(1, oh)
  const octx = off.getContext('2d')
  if (!octx) return
  octx.translate(-minX + pad, -minY + pad)
  octx.imageSmoothingEnabled = true
  octx.imageSmoothingQuality = 'high'
  const shade = (rgb: [number, number, number], L: number, wetAmt: number): string => {
    let r = rgb[0] * L
    let g = rgb[1] * L
    let b = rgb[2] * L
    if (wetAmt > 0.15) {
      const ao = 1 - wetAmt * 0.22
      r *= ao
      g *= ao
      b *= ao * 0.98
    }
    return rgba([r, g, b], 1)
  }
  for (let i = 0; i < n; i++) {
    const a = midRing[i]!
    const b = midRing[(i + 1) % n]!
    octx.beginPath()
    octx.moveTo(centerIso.x, centerIso.y)
    octx.lineTo(a.x, a.y)
    octx.lineTo(b.x, b.y)
    octx.closePath()
    const gfill = octx.createLinearGradient(
      centerIso.x,
      centerIso.y,
      (a.x + b.x) * 0.5,
      (a.y + b.y) * 0.5,
    )
    gfill.addColorStop(0, shade(cCol, cL, 0))
    gfill.addColorStop(1, shade(a.rgb, a.L * 0.96, 0))
    octx.fillStyle = gfill
    octx.fill()
  }
  for (let i = 0; i < n; i++) {
    const a = midRing[i]!
    const b = midRing[(i + 1) % n]!
    const c = rim[(i + 1) % n]!
    const d = rim[i]!
    const xi = Math.max(0, Math.min(nv - 1, Math.round((a.gx + d.gx) * 0.5 + 0.5)))
    const yi = Math.max(0, Math.min(nv - 1, Math.round((a.gy + d.gy) * 0.5 + 0.5)))
    const W = wet[yi * nv + xi]!
    octx.beginPath()
    octx.moveTo(a.x, a.y)
    octx.lineTo(b.x, b.y)
    octx.lineTo(c.x, c.y)
    octx.lineTo(d.x, d.y)
    octx.closePath()
    const gfill = octx.createLinearGradient(
      (a.x + b.x) * 0.5,
      (a.y + b.y) * 0.5,
      (c.x + d.x) * 0.5,
      (c.y + d.y) * 0.5,
    )
    gfill.addColorStop(0, shade(a.rgb, a.L * 0.9, W * 0.4))
    gfill.addColorStop(1, shade(d.rgb, d.L * 0.72, W))
    octx.fillStyle = gfill
    octx.fill()
  }
  const blur = document.createElement('canvas')
  blur.width = off.width
  blur.height = off.height
  const bctx = blur.getContext('2d')
  if (!bctx) return
  bctx.filter = 'blur(7px)'
  bctx.drawImage(off, 0, 0)
  bctx.filter = 'none'
  ctx.drawImage(blur, minX - pad, minY - pad)
}
