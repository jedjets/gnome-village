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
  COL_MOSS,
  COL_SAND,
  COL_SHORE,
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

  // Soft land↔sea contact — no large under-shadow (that read as floating loaf)
  {
    let maxY = -Infinity
    let minX = Infinity
    let maxX = -Infinity
    for (const p of loafSil) {
      maxY = Math.max(maxY, p.y)
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
    }
    const footR = (maxX - minX) * 0.28
    const footY = maxY + LOAF_DEPTH * 0.35
    const shadow = ctx.createRadialGradient(0, footY, 0, 0, footY, footR)
    shadow.addColorStop(0, 'rgba(28, 48, 58, 0.03)')
    shadow.addColorStop(0.55, 'rgba(28, 48, 58, 0.01)')
    shadow.addColorStop(1, 'rgba(28, 48, 58, 0)')
    ctx.fillStyle = shadow
    ctx.beginPath()
    ctx.ellipse(0, footY, footR, footR * 0.18, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Shallow water underlap just outside sil — tighter land↔sea contact
  {
    ctx.beginPath()
    pathFromPts(ctx, loafSil, LOAF_DEPTH * 0.15)
    ctx.strokeStyle = rgba(lerp3(WATER_SHALLOW, [210, 228, 232], 0.35), 0.55)
    ctx.lineWidth = 18
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.beginPath()
    pathFromPts(ctx, loafSil, LOAF_DEPTH * 0.08)
    ctx.strokeStyle = rgba(WATER_SHALLOW, 0.35)
    ctx.lineWidth = 10
    ctx.stroke()
  }

  drawLoafFromSilhouette(ctx, loafSil)

  // Pale perimeter underpaint BEFORE clip — sand + foam (old-HTML shore craft)
  {
    ctx.beginPath()
    pathFromPts(ctx, loafSil, 0)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = rgba(lerp3(COL_SAND, [236, 230, 210], 0.4), 1)
    ctx.lineWidth = 18
    ctx.stroke()
    ctx.strokeStyle = rgba(lerp3(COL_SHORE, [245, 242, 228], 0.45), 1)
    ctx.lineWidth = 11
    ctx.stroke()
    ctx.strokeStyle = rgba(lerp3(COL_SHORE, EARTH_TOP, 0.25), 0.85)
    ctx.lineWidth = 4.5
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

  // Continuous pale perimeter rim (old-HTML shore craft) — sand → foam band
  {
    // Outer expanded wash (tight land↔sea, not floating disc)
    const outer = expandSil(loafSil, 5.5)
    ctx.beginPath()
    pathFromPts(ctx, outer, 0)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = rgba(lerp3(WATER_SHALLOW, [236, 246, 244], 0.5), 0.42)
    ctx.lineWidth = 10
    ctx.stroke()

    ctx.beginPath()
    pathFromPts(ctx, loafSil, 0)
    // Outer shallow wash into sea
    ctx.strokeStyle = rgba(lerp3(WATER_SHALLOW, [230, 240, 238], 0.45), 0.55)
    ctx.lineWidth = 12
    ctx.stroke()
    // Pale sand rim (must read at Fit)
    ctx.strokeStyle = rgba(lerp3(COL_SHORE, [248, 244, 228], 0.55), 0.98)
    ctx.lineWidth = 9
    ctx.stroke()
    // Bright foam lip
    ctx.strokeStyle = 'rgba(250, 253, 252, 0.62)'
    ctx.lineWidth = 4.2
    ctx.stroke()
    // Inner sand tuck under turf
    ctx.strokeStyle = rgba(lerp3(COL_SAND, COL_MOSS, 0.2), 0.75)
    ctx.lineWidth = 2.8
    ctx.stroke()
  }

  // South contact — thin earth→sand, not thick cliff lip
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
    ctx.strokeStyle = rgba(lerp3(COL_SHORE, EARTH_TOP, 0.45), 0.65)
    ctx.lineWidth = 5
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

function expandSil(
  pts: { x: number; y: number }[],
  amount: number,
): { x: number; y: number; h: number; gx: number; gy: number }[] {
  const m = pts.length
  if (m < 3) return pts as { x: number; y: number; h: number; gx: number; gy: number }[]
  let area = 0
  for (let i = 0; i < m; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % m]!
    area += a.x * b.y - b.x * a.y
  }
  const sign = area >= 0 ? 1 : -1
  const out: { x: number; y: number; h: number; gx: number; gy: number }[] = []
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
    out.push({
      x: cur.x + (nx / nl) * amount,
      y: cur.y + (ny / nl) * amount,
      h: 0,
      gx: 0,
      gy: 0,
    })
  }
  return out
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
