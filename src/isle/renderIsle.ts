import type { Heightfield } from '../world/isleGrid'
import { getHeight } from '../world/isleGrid'
import type { CameraState } from '../world/fit'
import type { RenderIsleOpts } from './renderIsleCore'
import {
  CELL,
  HEIGHT_SCALE,
  LOAF_DEPTH,
  ensureFields,
  lerp3,
  rgba,
  COL_DEEP,
  COL_MOSS,
  EARTH_TOP,
} from './renderIsleCore'
import { buildSilhouette, pathFromPts } from './renderIsleDraw'
import { drawLoafFromSilhouette } from './renderIsleForms'
import { drawSoftIsoMesh } from './renderIsleMesh'
import { drawStreamWater } from './renderIsleWater'

export type { RenderIsleOpts } from './renderIsleCore'
export { CELL, HEIGHT_SCALE, isleWorldSize } from './renderIsleCore'

/**
 * Soft-iso village land + water — prototype language, prettier craft.
 * No moss dome, no radial fans, no crater wet bowl.
 */
export function renderIsle(ctx: CanvasRenderingContext2D, opts: RenderIsleOpts): void {
  const { width: w, height: h, camera, hf, nowMs } = opts
  if (w <= 0 || h <= 0) return
  const size = hf.size
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const { light, wet, col, vertH, nv } = ensureFields(hf)
  const loafSil = buildSilhouette(hf, cx, cy, 96)

  // Calmer parchment sky
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#E8DFD2')
  sky.addColorStop(0.45, '#F0EAE0')
  sky.addColorStop(0.78, '#E6ECF0')
  sky.addColorStop(1, '#EFE8F2')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  const sunX = w * 0.72
  const sunY = h * 0.11
  const sunR = Math.min(w, h) * 0.09
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.2)
  sunGrad.addColorStop(0, 'rgba(255, 244, 210, 0.42)')
  sunGrad.addColorStop(0.55, 'rgba(255, 220, 170, 0.08)')
  sunGrad.addColorStop(1, 'rgba(255, 220, 170, 0)')
  ctx.fillStyle = sunGrad
  ctx.beginPath()
  ctx.arc(sunX, sunY, sunR * 2.2, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.translate(w * 0.5 + camera.panX, h * 0.5 + camera.panY)
  ctx.rotate(camera.rotation)
  ctx.scale(camera.zoom, camera.zoom)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Soft ground shadow
  {
    let minX = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of loafSil) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    const footR = (maxX - minX) * 0.5
    const footY = maxY + LOAF_DEPTH * 0.55
    const shadow = ctx.createRadialGradient(0, footY, footR * 0.1, 0, footY, footR)
    shadow.addColorStop(0, 'rgba(48, 34, 26, 0.28)')
    shadow.addColorStop(0.55, 'rgba(48, 34, 26, 0.08)')
    shadow.addColorStop(1, 'rgba(48, 34, 26, 0)')
    ctx.fillStyle = shadow
    ctx.beginPath()
    ctx.ellipse(0, footY, footR, footR * 0.32, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  drawLoafFromSilhouette(ctx, loafSil)

  // Clip land top to silhouette, paint continuous soft-iso mesh + stream
  ctx.save()
  ctx.beginPath()
  pathFromPts(ctx, loafSil, 0)
  ctx.clip()

  // Turf underfill — any residual AA gap shows moss, never sky white
  ctx.fillStyle = rgba(COL_MOSS, 1)
  ctx.beginPath()
  pathFromPts(ctx, loafSil, 0)
  ctx.fill()

  drawSoftIsoMesh(ctx, hf, light, col, wet, vertH, nv, cx, cy)
  drawStreamWater(ctx, hf, wet, vertH, nv, cx, cy, nowMs)

  // Soft aerial wash
  {
    let minY = Infinity
    let maxY = -Infinity
    for (const p of loafSil) {
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    const wash = ctx.createLinearGradient(0, minY, 0, maxY)
    wash.addColorStop(0, 'rgba(255, 248, 230, 0.14)')
    wash.addColorStop(0.45, 'rgba(255, 248, 230, 0.02)')
    wash.addColorStop(1, 'rgba(30, 50, 36, 0.1)')
    ctx.fillStyle = wash
    ctx.beginPath()
    pathFromPts(ctx, loafSil, 0)
    ctx.fill()
  }

  ctx.restore()

  // Soft turf rim
  ctx.beginPath()
  pathFromPts(ctx, loafSil, 0)
  ctx.strokeStyle = rgba(lerp3(COL_DEEP, COL_MOSS, 0.35), 0.35)
  ctx.lineWidth = 2.2
  ctx.lineJoin = 'round'
  ctx.stroke()

  // South loaf lip tuck
  {
    const mcy = loafSil.reduce((s, p) => s + p.y, 0) / loafSil.length
    ctx.beginPath()
    let started = false
    for (const p of loafSil) {
      if (p.y < mcy - 4) {
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
    ctx.strokeStyle = rgba(lerp3(COL_DEEP, EARTH_TOP, 0.4), 0.55)
    ctx.lineWidth = 7
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
  }

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
    const adjY = ry + ht * HEIGHT_SCALE
    gx = cx + (rx / CELL + (adjY * 2) / CELL) * 0.5
    gy = cy + ((adjY * 2) / CELL - rx / CELL) * 0.5
  }
  if (gx < -1 || gy < -1 || gx > size || gy > size) return null
  return { gx, gy }
}
