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
  COL_SHORE,
  COL_DAMP,
  COL_MUD,
  EARTH_TOP,
  WATER_SHALLOW,
  WATER_MID,
  WATER_DEEP,
  SKY_SOFT,
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
  const loafSil = buildSilhouette(hf, cx, cy, 128)

  // Cool soft blue-grey sky (old-HTML morning family) — NOT warm parchment
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#B8C8DA')
  sky.addColorStop(0.35, '#C8D6E4')
  sky.addColorStop(0.62, '#D5E0EC')
  sky.addColorStop(1, '#E2EAF0')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  // Soft sun disc — pale yellow, low-contrast haze (SE key)
  const sunX = w * 0.74
  const sunY = h * 0.1
  const sunR = Math.min(w, h) * 0.085
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.6)
  sunGrad.addColorStop(0, 'rgba(245, 230, 176, 0.55)')
  sunGrad.addColorStop(0.35, 'rgba(245, 230, 176, 0.22)')
  sunGrad.addColorStop(0.7, 'rgba(200, 214, 228, 0.08)')
  sunGrad.addColorStop(1, 'rgba(200, 214, 228, 0)')
  ctx.fillStyle = sunGrad
  ctx.beginPath()
  ctx.arc(sunX, sunY, sunR * 2.6, 0, Math.PI * 2)
  ctx.fill()

  // Continuous ocean plane (screen) — NOT a pale disc under the loaf
  drawOceanPlane(ctx, w, h)

  ctx.save()
  ctx.translate(w * 0.5 + camera.panX, h * 0.5 + camera.panY)
  ctx.rotate(camera.rotation)
  ctx.scale(camera.zoom, camera.zoom)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Tiny contact shade in water under rim only (not floating-loaf disc)
  {
    ctx.beginPath()
    pathFromPts(ctx, loafSil, LOAF_DEPTH * 0.22)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(40, 62, 82, 0.14)'
    ctx.lineWidth = 7
    ctx.stroke()
    ctx.strokeStyle = 'rgba(40, 62, 82, 0.07)'
    ctx.lineWidth = 14
    ctx.stroke()
  }

  // Shallow water underlap — mid-blue mixes toward sky at rim
  {
    const rimMix = lerp3(WATER_SHALLOW, SKY_SOFT, 0.35)
    ctx.beginPath()
    pathFromPts(ctx, loafSil, LOAF_DEPTH * 0.15)
    ctx.strokeStyle = rgba(rimMix, 0.5)
    ctx.lineWidth = 16
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.beginPath()
    pathFromPts(ctx, loafSil, LOAF_DEPTH * 0.08)
    ctx.strokeStyle = rgba(lerp3(WATER_SHALLOW, WATER_MID, 0.25), 0.32)
    ctx.lineWidth = 9
    ctx.stroke()
  }

  drawLoafFromSilhouette(ctx, loafSil)

  // Living shore underpaint BEFORE clip — muddy soft lip (no bright white seal)
  {
    ctx.beginPath()
    pathFromPts(ctx, loafSil, 0)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    // Warm-damp muddy sage under rim (land↔sea lip)
    ctx.strokeStyle = rgba(lerp3(COL_DAMP, COL_MUD, 0.35), 0.72)
    ctx.lineWidth = 15
    ctx.stroke()
    ctx.strokeStyle = rgba(lerp3(COL_DAMP, COL_SHORE, 0.28), 0.45)
    ctx.lineWidth = 8
    ctx.stroke()
    // Soft pale foam tuck — low alpha so AA never owns a white knife
    ctx.strokeStyle = rgba(lerp3(COL_SHORE, WATER_SHALLOW, 0.35), 0.38)
    ctx.lineWidth = 3.2
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

  // Soft aerial wash — cool SE key lift on crests, valley tuck
  {
    let minY = Infinity
    let maxY = -Infinity
    for (const p of loafSil) {
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    const wash = ctx.createLinearGradient(0, minY, 0, maxY)
    wash.addColorStop(0, 'rgba(232, 240, 246, 0.16)')
    wash.addColorStop(0.4, 'rgba(245, 230, 176, 0.04)')
    wash.addColorStop(1, 'rgba(50, 72, 58, 0.12)')
    ctx.fillStyle = wash
    ctx.beginPath()
    pathFromPts(ctx, loafSil, 0)
    ctx.fill()
  }

  ctx.restore()

  // Living soft perimeter — muddy lip + sky-mix foam (no bright white seal)
  {
    const outer = expandSil(loafSil, 5.5)
    ctx.beginPath()
    pathFromPts(ctx, outer, 0)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    // Water mixes toward sky at rim
    ctx.strokeStyle = rgba(lerp3(WATER_SHALLOW, SKY_SOFT, 0.45), 0.42)
    ctx.lineWidth = 12
    ctx.stroke()

    ctx.beginPath()
    pathFromPts(ctx, loafSil, 0)
    // Sediment tint wash into sea
    ctx.strokeStyle = rgba(lerp3(WATER_SHALLOW, COL_MUD, 0.22), 0.4)
    ctx.lineWidth = 14
    ctx.stroke()
    // Muddy sage wet-bank lip (owns the contact, not a white hairline)
    ctx.strokeStyle = rgba(lerp3(COL_DAMP, COL_MUD, 0.28), 0.68)
    ctx.lineWidth = 8
    ctx.stroke()
    // Soft pale shore tuck — muted (skill: never bright white outline)
    ctx.strokeStyle = rgba(lerp3(COL_SHORE, WATER_SHALLOW, 0.4), 0.42)
    ctx.lineWidth = 4.2
    ctx.stroke()
    // Soft glint dashes along rim (seeded, not uniform stroke)
    paintRimGlints(ctx, loafSil, hf.seed, nowMs)
    // Inner damp tuck under turf
    ctx.strokeStyle = rgba(lerp3(COL_DAMP, COL_MOSS, 0.35), 0.5)
    ctx.lineWidth = 2.2
    ctx.stroke()
  }

  // South contact — thin damp→mud, not thick cliff lip
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
    ctx.strokeStyle = rgba(lerp3(COL_DAMP, EARTH_TOP, 0.35), 0.55)
    ctx.lineWidth = 4.5
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
  // Mild CSS blur — AA soften only; roll + Raise crest must read at Fit (0.7.6.3)
  ctx.filter = 'blur(1.35px)'
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(_turfCanvas!, ox, oy, worldW, worldH)
  ctx.filter = 'none'
  // Off-grid craft grain speckles (kill sterile cookie fill)
  {
    const seed = hf.seed
    ctx.globalCompositeOperation = 'soft-light'
    for (let i = 0; i < 220; i++) {
      const u = ((Math.imul(i + 3, 2654435761) ^ seed) >>> 0) / 4294967296
      const v = ((Math.imul(i + 17, 1597334677) ^ (seed * 3)) >>> 0) / 4294967296
      const gx = ox + u * worldW
      const gy = oy + v * worldH
      const rr = 1.2 + ((Math.imul(i, 974) ^ seed) >>> 0) % 18 / 10
      const tone = u > 0.55 ? 'rgba(232,240,232,' : u < 0.35 ? 'rgba(90,110,80,' : 'rgba(176,168,136,'
      const a = 0.04 + v * 0.07
      ctx.fillStyle = tone + a + ')'
      ctx.beginPath()
      ctx.ellipse(gx, gy, rr, rr * 0.55, u * 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.restore()
}


/** Soft foam/glint dashes along rim — living shore, not perfect cream stroke. */
function paintRimGlints(
  ctx: CanvasRenderingContext2D,
  sil: { x: number; y: number }[],
  seed: number,
  nowMs?: number,
): void {
  const n = sil.length
  if (n < 8) return
  const t = nowMs != null && Number.isFinite(nowMs) ? nowMs * 0.0012 : 0
  ctx.save()
  ctx.lineCap = 'round'
  for (let i = 0; i < n; i += 2) {
    const hv = ((Math.imul(i + 1, 2654435761) ^ seed) >>> 0) / 4294967296
    if (hv < 0.32) continue
    const a = sil[i]!
    const b = sil[(i + 1) % n]!
    const breathe = 0.35 + 0.25 * Math.sin(t + hv * 6.2 + i * 0.08)
    // Soft sky-mix glints — never bright white hairline seal
    ctx.strokeStyle = `rgba(210, 226, 236, ${0.12 + breathe * 0.18})`
    ctx.lineWidth = 1.1 + hv * 1.2
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(a.x + (b.x - a.x) * 0.55, a.y + (b.y - a.y) * 0.55)
    ctx.stroke()
  }
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
  // Mid-blue sea (#6E96B8–#84A8C8) — richer near camera, paler at horizon
  // Avoid sterile teal aquarium (#52909A)
  const horizon = h * 0.34
  const sea = ctx.createLinearGradient(0, horizon - h * 0.05, 0, h)
  sea.addColorStop(0, 'rgba(200, 214, 228, 0)')
  sea.addColorStop(0.06, rgba(lerp3(WATER_SHALLOW, SKY_SOFT, 0.55), 0.55))
  sea.addColorStop(0.2, rgba(lerp3(WATER_SHALLOW, SKY_SOFT, 0.2), 0.88))
  sea.addColorStop(0.45, rgba(WATER_SHALLOW, 0.94))
  sea.addColorStop(0.72, rgba(WATER_MID, 0.97))
  sea.addColorStop(1, rgba(lerp3(WATER_MID, WATER_DEEP, 0.45), 0.99))
  ctx.fillStyle = sea
  ctx.fillRect(0, horizon - h * 0.04, w, h - (horizon - h * 0.04) + 2)

  // Soft horizon haze — water mixes toward sky
  const haze = ctx.createLinearGradient(0, horizon, 0, horizon + h * 0.2)
  haze.addColorStop(0, 'rgba(213, 224, 236, 0.5)')
  haze.addColorStop(1, 'rgba(213, 224, 236, 0)')
  ctx.fillStyle = haze
  ctx.fillRect(0, horizon, w, h * 0.2)
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
