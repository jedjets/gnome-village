import type { Heightfield } from '../world/isleGrid'
import { getHeight } from '../world/isleGrid'
import type { CameraState } from '../world/fit'
import type { RenderIsleOpts } from './renderIsleCore'
import {
  CELL,
  HEIGHT_SCALE,
  LOAF_DEPTH,
  ensureFields,
  heightsSig,
  lerp3,
  rgba,
  COL_DEEP,
  COL_MOSS,
  EARTH_TOP,
  WATER_SHALLOW,
  WATER_MID,
  WATER_DEEP,
} from './renderIsleCore'
import { buildSilhouette, pathFromPts } from './renderIsleDraw'
import { drawLoafFromSilhouette } from './renderIsleForms'
import { drawSoftIsoMesh } from './renderIsleMesh'
import { drawStreamWater } from './renderIsleWater'

export type { RenderIsleOpts } from './renderIsleCore'
export { CELL, HEIGHT_SCALE, isleWorldSize } from './renderIsleCore'

/**
 * Soft-iso village land + water — shared-vertex mesh + wetness-field shores.
 * Prototype techniques, prettier craft. No moss dome, no disc-stamp blob,
 * no parametric-only water shortcut.
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

  // Continuous ocean plane (screen) — NOT a pale disc under the loaf
  drawOceanPlane(ctx, w, h)

  ctx.save()
  ctx.translate(w * 0.5 + camera.panX, h * 0.5 + camera.panY)
  ctx.rotate(camera.rotation)
  ctx.scale(camera.zoom, camera.zoom)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Tiny dark contact shade only (no large oval that reads as a water disc)
  {
    let maxY = -Infinity
    let minX = Infinity
    let maxX = -Infinity
    for (const p of loafSil) {
      maxY = Math.max(maxY, p.y)
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
    }
    const footR = (maxX - minX) * 0.22
    const footY = maxY + LOAF_DEPTH * 0.72
    const shadow = ctx.createRadialGradient(0, footY, 0, 0, footY, footR)
    shadow.addColorStop(0, 'rgba(20, 32, 40, 0.28)')
    shadow.addColorStop(1, 'rgba(20, 32, 40, 0)')
    ctx.fillStyle = shadow
    ctx.beginPath()
    ctx.ellipse(0, footY, footR, footR * 0.22, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Ocean plane is screen-space continuous sheet (drawOceanPlane above).
  // No world-space radial shelf — that read as pale disc under the loaf.
  drawLoafFromSilhouette(ctx, loafSil)

  // Lip tuck BEFORE clip — earth underpaint on exact sil kills white AA seam
  {
    ctx.beginPath()
    pathFromPts(ctx, loafSil, 0)
    ctx.strokeStyle = rgba(EARTH_TOP, 1)
    ctx.lineWidth = 14
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.strokeStyle = rgba(lerp3(EARTH_TOP, COL_DEEP, 0.35), 1)
    ctx.lineWidth = 7
    ctx.stroke()
    ctx.strokeStyle = rgba(COL_DEEP, 0.85)
    ctx.lineWidth = 3.5
    ctx.stroke()
  }

  // Clip land top to silhouette, paint shared-vertex mesh + wetness water
  ctx.save()
  ctx.beginPath()
  pathFromPts(ctx, loafSil, 0)
  ctx.clip()

  // Turf underfill — residual AA gap shows moss, never sky white
  ctx.fillStyle = rgba(COL_MOSS, 1)
  ctx.beginPath()
  pathFromPts(ctx, loafSil, 0)
  ctx.fill()

  // Shared-vertex mesh with light CSS blur (AA only — not disc stamps)
  paintSoftTurf(ctx, hf, light, col, wet, vertH, nv, cx, cy, loafSil)

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

  // Soft turf rim — deep moss, not light/white
  ctx.beginPath()
  pathFromPts(ctx, loafSil, 0)
  ctx.strokeStyle = rgba(lerp3(COL_DEEP, COL_MOSS, 0.4), 0.4)
  ctx.lineWidth = 4.5
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
    ctx.strokeStyle = rgba(lerp3(COL_DEEP, EARTH_TOP, 0.35), 0.75)
    ctx.lineWidth = 9
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  ctx.restore()
}


let _turfCanvas: HTMLCanvasElement | null = null
let _turfSig = 0
let _turfMeta: { ox: number; oy: number; worldW: number; worldH: number } | null = null

function paintSoftTurf(
  ctx: CanvasRenderingContext2D,
  hf: Heightfield,
  light: Float32Array,
  col: Float32Array,
  wet: Float32Array,
  vertH: Float32Array,
  nv: number,
  cx: number,
  cy: number,
  loafSil: { x: number; y: number }[],
): void {
  const sig = heightsSig(hf)
  if (!_turfCanvas || _turfSig !== sig || !_turfMeta) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of loafSil) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
    const pad = 40
    const worldW = maxX - minX + pad * 2
    const worldH = maxY - minY + pad * 2
    const ox = minX - pad
    const oy = minY - pad
    const scalePx = 2
    const stamp = document.createElement('canvas')
    stamp.width = Math.max(8, Math.ceil(worldW * scalePx))
    stamp.height = Math.max(8, Math.ceil(worldH * scalePx))
    const sctx = stamp.getContext('2d')
    if (!sctx) {
      drawSoftIsoMesh(ctx, hf, light, col, wet, vertH, nv, cx, cy)
      return
    }
    sctx.setTransform(scalePx, 0, 0, scalePx, -ox * scalePx, -oy * scalePx)
    sctx.fillStyle = rgba(COL_MOSS, 1)
    sctx.beginPath()
    pathFromPts(sctx, loafSil as Parameters<typeof pathFromPts>[1], 0)
    sctx.fill()
    drawSoftIsoMesh(sctx, hf, light, col, wet, vertH, nv, cx, cy)
    _turfCanvas = stamp
    _turfSig = sig
    _turfMeta = { ox, oy, worldW, worldH }
  }
  const { ox, oy, worldW, worldH } = _turfMeta!
  ctx.save()
  // Mild blur — kills residual AA facets without turning turf into a moss disc
  ctx.filter = 'blur(2.8px)'
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(_turfCanvas!, ox, oy, worldW, worldH)
  ctx.filter = 'none'
  ctx.restore()
}

/**
 * Viewport ocean plane — continuous two-tone sheet (shallow→deep), not a
 * pale disc under the loaf. Matches old-HTML "sea as one sheet" language.
 */
function drawOceanPlane(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Continuous ocean sheet from horizon to bottom — fills the viewport, not a disc
  const horizon = h * 0.34
  const sea = ctx.createLinearGradient(0, horizon - h * 0.05, 0, h)
  sea.addColorStop(0, 'rgba(186, 214, 222, 0)')
  sea.addColorStop(0.08, rgba(lerp3(WATER_SHALLOW, [210, 226, 232], 0.4), 0.7))
  sea.addColorStop(0.28, rgba(WATER_SHALLOW, 0.9))
  sea.addColorStop(0.55, rgba(WATER_MID, 0.95))
  sea.addColorStop(1, rgba(WATER_DEEP, 0.98))
  ctx.fillStyle = sea
  ctx.fillRect(0, horizon - h * 0.04, w, h - (horizon - h * 0.04) + 2)

  // Soft horizon haze (open water, not puddle edge)
  const haze = ctx.createLinearGradient(0, horizon, 0, horizon + h * 0.18)
  haze.addColorStop(0, 'rgba(236, 244, 246, 0.4)')
  haze.addColorStop(1, 'rgba(236, 244, 246, 0)')
  ctx.fillStyle = haze
  ctx.fillRect(0, horizon, w, h * 0.18)
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
