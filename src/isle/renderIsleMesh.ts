import type { Heightfield } from '../world/isleGrid'
import {
  gridToIso,
  lerp3,
  rgba,
  COL_DAMP,
  COL_SHORE,
  COL_MUD,
} from './renderIsleCore'

/**
 * Soft-iso heightfield mesh — shared vertex heights, neighbourhood colour,
 * blurred vertex light + soft valley AO (via light field). Continuous turf:
 * NO diamond lattice, NO jittered-disc paint blob.
 *
 * Lattice kill: absolute outward fatten + land-coloured seal stroke so AA
 * never leaves sky hairlines between quads.
 */
const WET_SKIP = 0.78
/** Absolute outward push in world px — must beat Canvas AA gaps. */
const EX = 5.4
/** Seal stroke width (same fill colour). */
const SEAL = 0 // stroke seals redraw diamond edges — overdraw only
/** Corner luminance span before we use a soft plane gradient. */
const GRAD_MIN = 14 // soft plane on slopes — kill sticker facet chequer

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
  type Face = { x: number; y: number; depth: number }
  const faces: Face[] = []

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = vertH[y * nv + x]!
      const b = vertH[y * nv + (x + 1)]!
      const c = vertH[(y + 1) * nv + (x + 1)]!
      const d = vertH[(y + 1) * nv + x]!
      const hAvg = (a + b + c + d) * 0.25
      if (hAvg <= 0.008) continue
      const wA = wet[y * nv + x]!
      const wB = wet[y * nv + (x + 1)]!
      const wC = wet[(y + 1) * nv + (x + 1)]!
      const wD = wet[(y + 1) * nv + x]!
      // Leave fully flooded cells to the water sheet
      if (wA > WET_SKIP && wB > WET_SKIP && wC > WET_SKIP && wD > WET_SKIP) continue
      faces.push({ x, y, depth: x + y + hAvg * 0.15 })
    }
  }
  faces.sort((p, q) => p.depth - q.depth)

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
    const fatten = (p: { x: number; y: number }) => {
      const dx = p.x - mx
      const dy = p.y - my
      const len = Math.hypot(dx, dy) || 1
      return { x: p.x + (dx / len) * EX, y: p.y + (dy / len) * EX }
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

    const c00 = vertRgb(col, i00)
    const c10 = vertRgb(col, i10)
    const c11 = vertRgb(col, i11)
    const c01 = vertRgb(col, i01)
    let rgb = lerp3(lerp3(c00, c10, 0.5), lerp3(c01, c11, 0.5), 0.5)

    const wAvg = (wet[i00]! + wet[i10]! + wet[i11]! + wet[i01]!) * 0.25
    if (wAvg > 0.06) {
      // Soft damp/sand fade near melt — turf variation, not sterile stripe
      rgb = lerp3(rgb, COL_DAMP, Math.min(0.55, wAvg * 0.7))
      rgb = lerp3(rgb, COL_MUD, Math.min(0.3, wAvg * 0.38))
      rgb = lerp3(rgb, COL_SHORE, Math.min(0.22, wAvg * 0.28))
    }

    const shade = (c: [number, number, number], L: number): [number, number, number] => [
      Math.min(255, c[0] * L),
      Math.min(255, c[1] * L),
      Math.min(255, c[2] * L),
    ]

    const s00 = shade(c00, L00)
    const s10 = shade(c10, L10)
    const s11 = shade(c11, L11)
    const s01 = shade(c01, L01)
    const lum = (c: [number, number, number]) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11
    const lums = [lum(s00), lum(s10), lum(s11), lum(s01)]
    const span = Math.max(...lums) - Math.min(...lums)

    ctx.beginPath()
    ctx.moveTo(q00.x, q00.y)
    ctx.lineTo(q10.x, q10.y)
    ctx.lineTo(q11.x, q11.y)
    ctx.lineTo(q01.x, q01.y)
    ctx.closePath()

    const flat = shade(rgb, Lavg)
    if (span >= GRAD_MIN) {
      // Soft plane across corners — kills facet chequer on slopes
      const fill = fitCornerGrad(q00, q10, q11, q01, s00, s10, s11, s01, ctx)
      ctx.fillStyle = fill ?? rgba(flat, 1)
    } else {
      ctx.fillStyle = rgba(flat, 1)
    }
    ctx.fill()

    // Overdraw-only lattice kill (no stroke — strokes redraw diamond edges)
    if (SEAL > 0.5) {
      ctx.strokeStyle = rgba(flat, 1)
      ctx.lineWidth = SEAL
      ctx.stroke()
    }
  }
}

function vertRgb(col: Float32Array, i: number): [number, number, number] {
  return [col[i * 3]!, col[i * 3 + 1]!, col[i * 3 + 2]!]
}

function fitCornerGrad(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
  ca: [number, number, number],
  cb: [number, number, number],
  cc: [number, number, number],
  cd: [number, number, number],
  ctx: CanvasRenderingContext2D,
): CanvasGradient | null {
  const lum = (col: [number, number, number]) => col[0] * 0.3 + col[1] * 0.59 + col[2] * 0.11
  const la = lum(ca)
  const lb = lum(cb)
  const lc = lum(cc)
  const ld = lum(cd)
  const xm = (a.x + b.x + c.x + d.x) * 0.25
  const ym = (a.y + b.y + c.y + d.y) * 0.25
  const lm = (la + lb + lc + ld) * 0.25
  const X = [a.x - xm, b.x - xm, c.x - xm, d.x - xm]
  const Y = [a.y - ym, b.y - ym, c.y - ym, d.y - ym]
  const Lv = [la - lm, lb - lm, lc - lm, ld - lm]
  let sxx = 0
  let syy = 0
  let sxy = 0
  let sxl = 0
  let syl = 0
  for (let k = 0; k < 4; k++) {
    sxx += X[k]! * X[k]!
    syy += Y[k]! * Y[k]!
    sxy += X[k]! * Y[k]!
    sxl += X[k]! * Lv[k]!
    syl += Y[k]! * Lv[k]!
  }
  const det = sxx * syy - sxy * sxy
  if (Math.abs(det) < 1e-6) return null
  let gx = (syy * sxl - sxy * syl) / det
  let gy = (sxx * syl - sxy * sxl) / det
  const gl = Math.hypot(gx, gy)
  if (gl < 1e-6) return null
  gx /= gl
  gy /= gl
  const t = [
    X[0]! * gx + Y[0]! * gy,
    X[1]! * gx + Y[1]! * gy,
    X[2]! * gx + Y[2]! * gy,
    X[3]! * gx + Y[3]! * gy,
  ]
  const t0 = Math.min(...t)
  const t1 = Math.max(...t)
  if (t1 - t0 < 0.5) return null
  let stt = 0
  for (let k = 0; k < 4; k++) stt += t[k]! * t[k]!
  const cols = [ca, cb, cc, cd]
  const c0: [number, number, number] = [0, 0, 0]
  const c1: [number, number, number] = [0, 0, 0]
  for (let ch = 0; ch < 3; ch++) {
    let cm = 0
    let stc = 0
    for (let k = 0; k < 4; k++) cm += cols[k]![ch]!
    cm *= 0.25
    for (let k = 0; k < 4; k++) stc += t[k]! * (cols[k]![ch]! - cm)
    const sl = stc / stt
    c0[ch] = Math.max(0, Math.min(255, cm + sl * t0))
    c1[ch] = Math.max(0, Math.min(255, cm + sl * t1))
  }
  const gr = ctx.createLinearGradient(xm + gx * t0, ym + gy * t0, xm + gx * t1, ym + gy * t1)
  gr.addColorStop(0, rgba(c0, 1))
  gr.addColorStop(1, rgba(c1, 1))
  return gr
}
