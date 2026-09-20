import type { Heightfield } from '../world/isleGrid'
import {
  gridToIso,
  hash2,
  lerp3,
  rgba,
} from './renderIsleCore'

/**
 * Soft-iso turf as continuous paint — jittered overlapping discs on the
 * shared vertex field. No flat-quad mesh, no seal stroke → no diamond lattice
 * at Fit. Light + colour continuity from ensureFields; soft CSS blur in renderIsle.
 */
export function drawSoftIsoMesh(
  ctx: CanvasRenderingContext2D,
  hf: Heightfield,
  light: Float32Array,
  col: Float32Array,
  wet: Float32Array,
  vertH: Float32Array,
  nv: number,
  cx: number,
  cy: number,
): void {
  const size = nv - 1
  const WET_SKIP = 0.92
  const step = 0.42
  const baseR = 13.5
  const seed = hf.seed

  type Stamp = { x: number; y: number; r: number; depth: number; fill: string }
  const stamps: Stamp[] = []

  for (let iy = 0; iy * step <= size + step; iy++) {
    for (let ix = 0; ix * step <= size + step; ix++) {
      const jx = (hash2(ix, iy, seed + 3) - 0.5) * step * 0.85
      const jy = (hash2(ix, iy, seed + 9) - 0.5) * step * 0.85
      // Hex-ish row offset breaks iso diamond alignment
      const rowOfs = (iy & 1) * step * 0.5
      const gx = ix * step + jx + rowOfs
      const gy = iy * step + jy
      if (gx < -0.2 || gy < -0.2 || gx > size + 0.2 || gy > size + 0.2) continue

      const h = sampleBilinear(vertH, nv, gx, gy)
      if (h <= 0.01) continue
      const w = sampleBilinear(wet, nv, gx, gy)
      if (w > WET_SKIP) continue

      const L = sampleBilinear(light, nv, gx, gy)
      const rgb = sampleColor(col, nv, gx, gy)
      const shaded: [number, number, number] = [rgb[0] * L, rgb[1] * L, rgb[2] * L]
      const p = gridToIso(gx - cx, gy - cy, h)
      const rj = 0.9 + 0.25 * hash2(ix + 17, iy + 4, seed + 21)
      const r = baseR * rj * (0.9 + h * 0.12)
      stamps.push({
        x: p.x,
        y: p.y,
        r,
        depth: gx + gy,
        fill: rgba(shaded, 1),
      })
    }
  }

  stamps.sort((a, b) => a.depth - b.depth)

  for (const s of stamps) {
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = s.fill
    ctx.fill()
  }
}

function sampleBilinear(buf: Float32Array, nv: number, gx: number, gy: number): number {
  const x = Math.max(0, Math.min(nv - 1, gx))
  const y = Math.max(0, Math.min(nv - 1, gy))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(nv - 1, x0 + 1)
  const y1 = Math.min(nv - 1, y0 + 1)
  const tx = x - x0
  const ty = y - y0
  return (
    buf[y0 * nv + x0]! * (1 - tx) * (1 - ty) +
    buf[y0 * nv + x1]! * tx * (1 - ty) +
    buf[y1 * nv + x0]! * (1 - tx) * ty +
    buf[y1 * nv + x1]! * tx * ty
  )
}

function sampleColor(
  col: Float32Array,
  nv: number,
  gx: number,
  gy: number,
): [number, number, number] {
  const x = Math.max(0, Math.min(nv - 1, gx))
  const y = Math.max(0, Math.min(nv - 1, gy))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(nv - 1, x0 + 1)
  const y1 = Math.min(nv - 1, y0 + 1)
  const tx = x - x0
  const ty = y - y0
  const c = (i: number): [number, number, number] => [
    col[i * 3]!,
    col[i * 3 + 1]!,
    col[i * 3 + 2]!,
  ]
  const c00 = c(y0 * nv + x0)
  const c10 = c(y0 * nv + x1)
  const c01 = c(y1 * nv + x0)
  const c11 = c(y1 * nv + x1)
  return lerp3(lerp3(c00, c10, tx), lerp3(c01, c11, tx), ty)
}
