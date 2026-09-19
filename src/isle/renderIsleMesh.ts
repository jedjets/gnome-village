import type { Heightfield } from '../world/isleGrid'
import {
  gridToIso,
  lerp3,
  rgba,
  COL_DAMP,
  COL_SHORE,
} from './renderIsleCore'

/**
 * Soft-iso heightfield mesh — shared vertex heights, neighbourhood colour,
 * blurred vertex light, slope gradients. Continuous turf (no diamond lattice).
 *
 * Lattice kill: absolute outward fatten (prototype EX≈0.7+) PLUS opaque
 * inset stroke in the same fill colour so AA never leaves sky hairlines.
 */
export function drawSoftIsoMesh(
  ctx: CanvasRenderingContext2D,
  _hf: Heightfield,
  light: Float32Array,
  col: Float32Array,
  wet: Float32Array,
  vertH: Float32Array,
  nv: number,
  cx: number,
  cy: number,
): void {
  const size = nv - 1
  const WET_SKIP = 0.55
  /** Absolute outward push in world px — must beat Canvas AA gaps. */
  const EX = 2.8
  type Face = { x: number; y: number }
  const faces: Face[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = vertH[y * nv + x]!
      const b = vertH[y * nv + (x + 1)]!
      const c = vertH[(y + 1) * nv + (x + 1)]!
      const d = vertH[(y + 1) * nv + x]!
      if ((a + b + c + d) * 0.25 <= 0.008) continue
      const wA = wet[y * nv + x]!
      const wB = wet[y * nv + (x + 1)]!
      const wC = wet[(y + 1) * nv + (x + 1)]!
      const wD = wet[(y + 1) * nv + x]!
      if (wA > WET_SKIP && wB > WET_SKIP && wC > WET_SKIP && wD > WET_SKIP) continue
      faces.push({ x, y })
    }
  }
  faces.sort((p, q) => p.x + p.y - (q.x + q.y))

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  for (const f of faces) {
    const { x, y } = f
    const i00 = y * nv + x
    const i10 = y * nv + (x + 1)
    const i11 = (y + 1) * nv + (x + 1)
    const i01 = (y + 1) * nv + x

    const p00 = gridToIso(x - cx, y - cy, vertH[i00]!)
    const p10 = gridToIso(x + 1 - cx, y - cy, vertH[i10]!)
    const p11 = gridToIso(x + 1 - cx, y + 1 - cy, vertH[i11]!)
    const p01 = gridToIso(x - cx, y + 1 - cy, vertH[i01]!)

    const mx = (p00.x + p10.x + p11.x + p01.x) * 0.25
    const my = (p00.y + p10.y + p11.y + p01.y) * 0.25
    // Prototype-style absolute fatten: push each corner outward from centroid
    const fatten = (p: { x: number; y: number }) => {
      const dx = p.x - mx
      const dy = p.y - my
      const len = Math.hypot(dx, dy) || 1
      return {
        x: p.x + (dx / len) * EX,
        y: p.y + (dy / len) * EX,
      }
    }
    const q00 = fatten(p00)
    const q10 = fatten(p10)
    const q11 = fatten(p11)
    const q01 = fatten(p01)

    const L00 = light[i00]!
    const L10 = light[i10]!
    const L11 = light[i11]!
    const L01 = light[i01]!
    const Lavg = (L00 + L10 + L11 + L01) * 0.25

    const c00: [number, number, number] = [col[i00 * 3]!, col[i00 * 3 + 1]!, col[i00 * 3 + 2]!]
    const c10: [number, number, number] = [col[i10 * 3]!, col[i10 * 3 + 1]!, col[i10 * 3 + 2]!]
    const c11: [number, number, number] = [col[i11 * 3]!, col[i11 * 3 + 1]!, col[i11 * 3 + 2]!]
    const c01: [number, number, number] = [col[i01 * 3]!, col[i01 * 3 + 1]!, col[i01 * 3 + 2]!]
    let rgb = lerp3(lerp3(c00, c10, 0.5), lerp3(c01, c11, 0.5), 0.5)

    const wAvg = (wet[i00]! + wet[i10]! + wet[i11]! + wet[i01]!) * 0.25
    if (wAvg > 0.12) {
      rgb = lerp3(rgb, COL_SHORE, Math.min(0.35, wAvg * 0.4))
      rgb = lerp3(rgb, COL_DAMP, Math.min(0.2, wAvg * 0.25))
    }

    const shade = (c: [number, number, number], L: number): [number, number, number] => [
      c[0] * L,
      c[1] * L,
      c[2] * L,
    ]

    ctx.beginPath()
    ctx.moveTo(q00.x, q00.y)
    ctx.lineTo(q10.x, q10.y)
    ctx.lineTo(q11.x, q11.y)
    ctx.lineTo(q01.x, q01.y)
    ctx.closePath()

    // Flat fill only — per-quad gradients left diamond seams; light is pre-blurred
    const fillStr = rgba(shade(rgb, Lavg), 1)
    ctx.fillStyle = fillStr
    ctx.fill()
    // Seal AA hairlines with land-coloured stroke (same avg shade)
    ctx.strokeStyle = fillStr
    ctx.lineWidth = 3.2
    ctx.stroke()
  }
}
