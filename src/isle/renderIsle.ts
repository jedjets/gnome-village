import type { Heightfield } from '../world/isleGrid'
import { getHeight } from '../world/isleGrid'
import type { CameraState } from '../world/fit'
import type { RenderIsleOpts } from './renderIsleCore'
import {
  CELL, HEIGHT_SCALE, MOSS_VIS_BOOST, LOAF_DEPTH, gridToIso, ensureFields,
  lerp3, rgba,
  COL_DEEP, COL_MOSS, COL_LIT, EARTH_TOP,
} from './renderIsleCore'
import { buildSilhouette, buildMossOutline, drawSoftWetShore, pathFromPts } from './renderIsleDraw'
import { sealLoafToMoss, drawLoafFromSilhouette } from './renderIsleForms'
import { drawMossMound } from './renderIsleMoss'
export type { RenderIsleOpts } from './renderIsleCore'
export { CELL, HEIGHT_SCALE, isleWorldSize } from './renderIsleCore'
export function renderIsle(ctx: CanvasRenderingContext2D, opts: RenderIsleOpts): void {
  const { width: w, height: h, camera, hf } = opts
  if (w <= 0 || h <= 0) return
  const size = hf.size
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const { light, wet, col, nv } = ensureFields(hf)
  const mossSil = buildMossOutline(hf, cx, cy, 64)
  const loafSil = sealLoafToMoss(buildSilhouette(hf, cx, cy, 96), mossSil)
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#E6DCCE')
  sky.addColorStop(0.4, '#EFE8DC')
  sky.addColorStop(0.75, '#E8EDF2')
  sky.addColorStop(1, '#F2EDF5')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  const sunX = w * 0.74
  const sunY = h * 0.1
  const sunR = Math.min(w, h) * 0.1
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.3)
  sunGrad.addColorStop(0, 'rgba(255, 242, 200, 0.5)')
  sunGrad.addColorStop(0.5, 'rgba(255, 218, 160, 0.1)')
  sunGrad.addColorStop(1, 'rgba(255, 218, 160, 0)')
  ctx.fillStyle = sunGrad
  ctx.beginPath()
  ctx.arc(sunX, sunY, sunR * 2.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  ctx.translate(w * 0.5 + camera.panX, h * 0.5 + camera.panY)
  ctx.rotate(camera.rotation)
  ctx.scale(camera.zoom, camera.zoom)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  {
    let minX = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of loafSil) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    const footR = (maxX - minX) * 0.52
    const footY = maxY + LOAF_DEPTH * 0.62
    const shadow = ctx.createRadialGradient(0, footY, footR * 0.1, 0, footY, footR)
    shadow.addColorStop(0, 'rgba(48, 34, 26, 0.34)')
    shadow.addColorStop(0.55, 'rgba(48, 34, 26, 0.1)')
    shadow.addColorStop(1, 'rgba(48, 34, 26, 0)')
    ctx.fillStyle = shadow
    ctx.beginPath()
    ctx.ellipse(0, footY, footR, footR * 0.34, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  drawLoafFromSilhouette(ctx, loafSil)
  let peakH = 0
  let peakIsoY = 0
  let rimHSum = 0
  let rimN = 0
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const ht = getHeight(hf, x, y)
      if (ht > 0.05) {
        if (ht > peakH) {
          peakH = ht
          peakIsoY = gridToIso(x - cx, y - cy, ht).y
        }
        const dx = (x - cx) / cx
        const dy = (y - cy) / cy
        const r = Math.hypot(dx, dy)
        if (r > 0.72 && r < 0.95) {
          rimHSum += ht
          rimN++
        }
      }
    }
  }
  const rimH = rimN ? rimHSum / rimN : 0.15
  ctx.save()
  ctx.beginPath()
  pathFromPts(ctx, mossSil, 0)
  ctx.clip()
  ctx.beginPath()
  pathFromPts(ctx, mossSil, 0)
  const under = ctx.createRadialGradient(0, peakIsoY * 0.45, 0, 0, 0, size * CELL * 0.46)
  under.addColorStop(0, rgba(COL_LIT, 1))
  under.addColorStop(0.4, rgba(COL_MOSS, 1))
  under.addColorStop(0.82, rgba(COL_DEEP, 1))
  under.addColorStop(1, rgba(COL_DEEP, 1))
  ctx.fillStyle = under
  ctx.fill()
  drawMossMound(ctx, hf, light, col, wet, nv, cx, cy, mossSil)
  {
    let minY = Infinity
    let maxY = -Infinity
    for (const p of mossSil) {
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    const wash = ctx.createRadialGradient(
      0,
      peakIsoY,
      0,
      0,
      (minY + maxY) * 0.55,
      size * CELL * 0.44,
    )
    wash.addColorStop(0, 'rgba(255, 248, 220, 0.26)')
    wash.addColorStop(0.3, 'rgba(255, 248, 220, 0.08)')
    wash.addColorStop(0.65, 'rgba(40, 60, 40, 0.05)')
    wash.addColorStop(1, 'rgba(28, 44, 30, 0.2)')
    ctx.fillStyle = wash
    ctx.beginPath()
    pathFromPts(ctx, mossSil, 0)
    ctx.fill()
  }
  if (peakH > 0.35) {
    const crest = ctx.createRadialGradient(0, peakIsoY, 0, 0, peakIsoY, size * CELL * 0.2)
    const a = Math.min(0.36, (peakH - rimH) * 0.45)
    crest.addColorStop(0, `rgba(255,248,210,${a})`)
    crest.addColorStop(0.55, `rgba(255,248,210,${a * 0.22})`)
    crest.addColorStop(1, 'rgba(255,248,210,0)')
    ctx.fillStyle = crest
    ctx.beginPath()
    pathFromPts(ctx, mossSil, 0)
    ctx.fill()
  }
  drawSoftWetShore(ctx, hf, wet, nv, cx, cy)
  ctx.restore()
  {
    const mcy = loafSil.reduce((s, p) => s + p.y, 0) / loafSil.length
    ctx.beginPath()
    let started = false
    for (const p of loafSil) {
      if (p.y < mcy - 6) {
        started = false
        continue
      }
      if (!started) {
        ctx.moveTo(p.x, p.y)
        started = true
      } else {
        ctx.lineTo(p.x, p.y)
      }
    }
    ctx.strokeStyle = rgba(lerp3(COL_DEEP, EARTH_TOP, 0.35), 0.75)
    ctx.lineWidth = 10
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
  }
  ctx.beginPath()
  pathFromPts(ctx, mossSil, 0)
  ctx.strokeStyle = 'rgba(48, 78, 52, 0.28)'
  ctx.lineWidth = 2.5
  ctx.lineJoin = 'round'
  ctx.stroke()
  ctx.restore()
}
export function screenToGrid(
  screenX: number,
  screenY: number,
  viewW: number,
  viewH: number,
  camera: CameraState,
  hf: Heightfield,
): { gx: number; gy: number } | null {
  const size = hf.size
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  let x = screenX - (viewW * 0.5 + camera.panX)
  let y = screenY - (viewH * 0.5 + camera.panY)
  const invZ = 1 / Math.max(1e-6, camera.zoom)
  x *= invZ
  y *= invZ
  const cos = Math.cos(-camera.rotation)
  const sin = Math.sin(-camera.rotation)
  const rx = x * cos - y * sin
  const ry = x * sin + y * cos
  let gx = cx + (rx / CELL + (ry * 2) / CELL) * 0.5
  let gy = cy + ((ry * 2) / CELL - rx / CELL) * 0.5
  for (let i = 0; i < 5; i++) {
    const xi = Math.max(0, Math.min(hf.size - 1, Math.round(gx)))
    const yi = Math.max(0, Math.min(hf.size - 1, Math.round(gy)))
    const ht = getHeight(hf, xi, yi)
    const dx = (gx - cx) / Math.max(1, cx)
    const dy = (gy - cy) / Math.max(1, cy)
    const facing = Math.max(0, -(dx + dy) / Math.SQRT2)
    const relief = Math.max(0, ht - 0.12)
    const vis = ht * (1 + (MOSS_VIS_BOOST - 1) * Math.min(1, ht))
    const yLift = facing * facing * (36 + relief * 160)
    const adjY = ry + vis * HEIGHT_SCALE + yLift
    gx = cx + (rx / CELL + (adjY * 2) / CELL) * 0.5
    gy = cy + ((adjY * 2) / CELL - rx / CELL) * 0.5
  }
  if (gx < -1 || gy < -1 || gx > size || gy > size) return null
  return { gx, gy }
}
