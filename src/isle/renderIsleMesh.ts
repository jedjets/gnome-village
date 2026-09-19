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
    const fatten = (p: { x: number; y: number }) => {
      const d = Math.max(8, Math.hypot(p.x - mx, p.y - my))
      return {
        x: mx + (p.x - mx) * (1 + 0.55 / d),
        y: my + (p.y - my) * (1 + 0.55 / d),
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

    const dL = Math.max(L00, L10, L11, L01) - Math.min(L00, L10, L11, L01)
    if (dL > 0.045) {
      let lo = { p: q00, L: L00 }
      let hi = { p: q00, L: L00 }
      for (const t of [
        { p: q00, L: L00 },
        { p: q10, L: L10 },
        { p: q11, L: L11 },
        { p: q01, L: L01 },
      ]) {
        if (t.L < lo.L) lo = t
        if (t.L > hi.L) hi = t
      }
      const g = ctx.createLinearGradient(hi.p.x, hi.p.y, lo.p.x, lo.p.y)
      g.addColorStop(0, rgba(shade(rgb, hi.L), 1))
      g.addColorStop(1, rgba(shade(rgb, lo.L), 1))
      ctx.fillStyle = g
    } else {
      ctx.fillStyle = rgba(shade(rgb, Lavg), 1)
    }
    ctx.fill()
  }
}
