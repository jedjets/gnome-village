import type { Heightfield } from '../world/isleGrid'
import {
  boxBlurInPlace,
  gridToIso,
  heightsSig,
  lerp3,
  rgba,
  WATER_SHALLOW,
  WATER_MID,
  COL_SHORE,
  COL_MOSS,
  CELL,
} from './renderIsleCore'

const WET_THRESH = 0.48
const WATER_SURF = 0.12
const WET_UPSAMPLE = 4
const WET_BLUR_PASSES = 5
const WET_SOFT_BAND = 0.26

let _maskCanvas: HTMLCanvasElement | null = null
let _maskSig = 0
let _maskMeta: { ox: number; oy: number; worldW: number; worldH: number } | null = null

/**
 * Soft wet-mask stream. Mask stamped in world space; composited with
 * CSS-pixel blur so Fit zoom still kills stair/saw-tooth bank AA.
 * No MS→Chaikin polygon edge owning the shore.
 */
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
  const size = hf.size
  const sig = heightsSig(hf)
  ensureSoftWetMask(sig, wet, vertH, nv, cx, cy, size)

  ctx.save()
  if (_maskCanvas && _maskMeta) {
    const { ox, oy, worldW, worldH } = _maskMeta
    // Blur in CSS pixels (not world) — survives Fit zoom ~0.25
    ctx.filter = 'blur(7px)'
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(_maskCanvas, ox, oy, worldW, worldH)
    ctx.filter = 'none'
  }

  // Soft interior wash only (no hard quads near bank)
  if (nowMs != null && Number.isFinite(nowMs)) {
    const shimmer = 0.025 + 0.014 * Math.sin(nowMs * 0.002)
    const g = ctx.createRadialGradient(-4, 6, 0, 0, 10, 40)
    g.addColorStop(0, `rgba(170, 210, 205, ${shimmer})`)
    g.addColorStop(1, 'rgba(170, 210, 205, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 10, 44, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
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

function ensureSoftWetMask(
  sig: number,
  wet: Float32Array,
  vertH: Float32Array,
  nv: number,
  cx: number,
  cy: number,
  size: number,
): void {
  if (_maskCanvas && _maskSig === sig && _maskMeta) return

  const { field: softWet, n: sn } = upsampleBlurWet(wet, nv, WET_UPSAMPLE, WET_BLUR_PASSES)
  const scale = (nv - 1) / (sn - 1)

  const half = size * CELL * 0.78
  const pad = 48
  const worldW = half * 2 + pad * 2
  const worldH = half * 1.25 + pad * 2
  const ox = -half - pad
  const oy = -half * 0.55 - pad

  const scalePx = 1.6
  const stamp = document.createElement('canvas')
  stamp.width = Math.max(8, Math.ceil(worldW * scalePx))
  stamp.height = Math.max(8, Math.ceil(worldH * scalePx))
  const sctx = stamp.getContext('2d')
  if (!sctx) return
  sctx.clearRect(0, 0, stamp.width, stamp.height)
  sctx.setTransform(scalePx, 0, 0, scalePx, -ox * scalePx, -oy * scalePx)

  const lo = WET_THRESH - WET_SOFT_BAND
  const hi = WET_THRESH + WET_SOFT_BAND * 1.35

  for (let iy = 0; iy < sn; iy++) {
    for (let ix = 0; ix < sn; ix++) {
      const w = softWet[iy * sn + ix]!
      if (w < lo) continue
      const gx = ix * scale
      const gy = iy * scale
      if (gx < -1 || gy < -1 || gx > size + 1 || gy > size + 1) continue
      const h = sampleVertH(vertH, nv, gx, gy)
      if (h < 0.015) continue
      const p = gridToIso(gx - 0.5 - cx, gy - 0.5 - cy, Math.max(WATER_SURF, h))

      const tShore = smooth01((w - lo) / Math.max(1e-6, WET_THRESH - lo))
      const tWater = smooth01((w - WET_THRESH) / Math.max(1e-6, hi - WET_THRESH))
      const towardWater = Math.max(0, Math.min(1, (w - lo) / (hi - lo)))

      // Compact bank discs — ribbon only, not a sand floodplain
      if (w < WET_THRESH + WET_SOFT_BAND * 0.95) {
        const bankA = tShore * (1 - tWater * 0.8) * 0.78
        if (bankA > 0.02) {
          const col = lerp3(
            lerp3(COL_SHORE, COL_MOSS, 0.04),
            lerp3(COL_SHORE, WATER_SHALLOW, 0.55),
            towardWater * 0.8,
          )
          const r = 7.5 + tShore * 9
          sctx.beginPath()
          sctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          sctx.fillStyle = rgba(col, bankA)
          sctx.fill()
        }
      }

      if (w > WET_THRESH - WET_SOFT_BAND * 0.4) {
        const waterA =
          Math.pow(
            Math.max(
              0,
              Math.min(1, (w - (WET_THRESH - WET_SOFT_BAND * 0.4)) / (WET_SOFT_BAND * 1.5)),
            ),
            1.2,
          ) * 0.88
        if (waterA > 0.02) {
          const depth = Math.min(1, Math.max(0, (w - WET_THRESH) / 0.45))
          const col = lerp3(
            lerp3(COL_SHORE, WATER_SHALLOW, 0.65),
            lerp3(WATER_SHALLOW, WATER_MID, 0.4),
            depth,
          )
          const r = 5.5 + depth * 5 + tWater * 4
          sctx.beginPath()
          sctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          sctx.fillStyle = rgba(col, waterA)
          sctx.fill()
        }
      }
    }
  }

  _maskCanvas = stamp
  _maskSig = sig
  _maskMeta = { ox, oy, worldW, worldH }
}

function smooth01(t: number): number {
  const u = Math.max(0, Math.min(1, t))
  return u * u * (3 - 2 * u)
}

function upsampleBlurWet(
  wet: Float32Array,
  nv: number,
  factor: number,
  blurPasses: number,
): { field: Float32Array; n: number } {
  const n = (nv - 1) * factor + 1
  const field = new Float32Array(n * n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const fx = x / factor
      const fy = y / factor
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const x1 = Math.min(nv - 1, x0 + 1)
      const y1 = Math.min(nv - 1, y0 + 1)
      const tx = fx - x0
      const ty = fy - y0
      const v00 = wet[y0 * nv + x0]!
      const v10 = wet[y0 * nv + x1]!
      const v01 = wet[y1 * nv + x0]!
      const v11 = wet[y1 * nv + x1]!
      field[y * n + x] =
        v00 * (1 - tx) * (1 - ty) +
        v10 * tx * (1 - ty) +
        v01 * (1 - tx) * ty +
        v11 * tx * ty
    }
  }
  boxBlurInPlace(field, n, blurPasses)
  return { field, n }
}
