import type { Heightfield } from '../world/isleGrid'
import {
  boxBlurInPlace,
  gridToIso,
  lerp3,
  rgba,
  WATER_SHALLOW,
  WATER_MID,
  WATER_DEEP,
  COL_SHORE,
  COL_DAMP,
  COL_MOSS,
} from './renderIsleCore'
import type { Pt } from './renderIsleDraw'
import { chaikinClosed, pathFromPts } from './renderIsleDraw'

const WET_THRESH = 0.48
const WATER_SURF = 0.12
/** Max segment length (world px) before densify — keeps Chaikin from stair-stepping. */
const DENSIFY_STEP = 1.4
const CHAIKIN_PASSES = 8
/** Outward bank expand (world px) — soft underlap over land. */
const BANK_EXPAND = 5.5
/** Water body sits slightly inside bank so soft feather owns the outer AA. */
const WATER_INSET = 0.4
/** Upsample factor for wet field before marching squares. */
const WET_UPSAMPLE = 2
/** Extra box-blur passes on upsampled wet (smoother iso-line; keep ribbon continuous). */
const WET_BLUR_PASSES = 3

/**
 * Continuous shoreline from wetness corner field (blur+upsample → MS → densify → Chaikin).
 * Soft feathered banks over land — no dark teal outline stroke, no saw-tooth comb.
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
  const { field: softWet, n: sn } = upsampleBlurWet(wet, nv, WET_UPSAMPLE, WET_BLUR_PASSES)
  const scale = (nv - 1) / (sn - 1)

  type Seg = { ax: number; ay: number; bx: number; by: number }
  const segs: Seg[] = []

  const sampleH = (gx: number, gy: number) => {
    const x = Math.max(0, Math.min(nv - 1, gx))
    const y = Math.max(0, Math.min(nv - 1, gy))
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const x1 = Math.min(nv - 1, x0 + 1)
    const y1 = Math.min(nv - 1, y0 + 1)
    const tx = x - x0
    const ty = y - y0
    const h00 = vertH[y0 * nv + x0]!
    const h10 = vertH[y0 * nv + x1]!
    const h01 = vertH[y1 * nv + x0]!
    const h11 = vertH[y1 * nv + x1]!
    return (
      h00 * (1 - tx) * (1 - ty) +
      h10 * tx * (1 - ty) +
      h01 * (1 - tx) * ty +
      h11 * tx * ty
    )
  }

  const interp = (
    ix0: number,
    iy0: number,
    w0: number,
    ix1: number,
    iy1: number,
    w1: number,
  ) => {
    const t = (WET_THRESH - w0) / Math.max(1e-6, w1 - w0)
    const u = Math.max(0, Math.min(1, t))
    const gx = (ix0 + (ix1 - ix0) * u) * scale
    const gy = (iy0 + (iy1 - iy0) * u) * scale
    const h = Math.max(WATER_SURF, sampleH(gx, gy))
    return gridToIso(gx - 0.5 - cx, gy - 0.5 - cy, h)
  }

  const cells = sn - 1
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const w00 = softWet[y * sn + x]!
      const w10 = softWet[y * sn + (x + 1)]!
      const w11 = softWet[(y + 1) * sn + (x + 1)]!
      const w01 = softWet[(y + 1) * sn + x]!
      const code =
        (w00 >= WET_THRESH ? 1 : 0) |
        (w10 >= WET_THRESH ? 2 : 0) |
        (w11 >= WET_THRESH ? 4 : 0) |
        (w01 >= WET_THRESH ? 8 : 0)
      if (code === 0 || code === 15) continue

      const top = () => interp(x, y, w00, x + 1, y, w10)
      const right = () => interp(x + 1, y, w10, x + 1, y + 1, w11)
      const bot = () => interp(x, y + 1, w01, x + 1, y + 1, w11)
      const left = () => interp(x, y, w00, x, y + 1, w01)
      const add = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y })
      }

      switch (code) {
        case 1:
        case 14:
          add(left(), top())
          break
        case 2:
        case 13:
          add(top(), right())
          break
        case 3:
        case 12:
          add(left(), right())
          break
        case 4:
        case 11:
          add(right(), bot())
          break
        case 6:
        case 9:
          add(top(), bot())
          break
        case 7:
        case 8:
          add(left(), bot())
          break
        case 5: {
          const wc = (w00 + w10 + w11 + w01) * 0.25 >= WET_THRESH
          if (wc) {
            add(left(), top())
            add(right(), bot())
          } else {
            add(top(), right())
            add(bot(), left())
          }
          break
        }
        case 10: {
          const wc = (w00 + w10 + w11 + w01) * 0.25 >= WET_THRESH
          if (wc) {
            add(top(), right())
            add(bot(), left())
          } else {
            add(left(), top())
            add(right(), bot())
          }
          break
        }
        default:
          break
      }
    }
  }

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Soft distance-falloff shore wash (shore tones only — never dark teal contour)
  paintSoftShoreFalloff(ctx, softWet, sn, scale, vertH, nv, cx, cy, size)

  // Interior depth sheet — well inside ribbon so jagged quads never define the shore
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const w00 = wet[y * nv + x]!
      const w10 = wet[y * nv + (x + 1)]!
      const w11 = wet[(y + 1) * nv + (x + 1)]!
      const w01 = wet[(y + 1) * nv + x]!
      const wMin = Math.min(w00, w10, w11, w01)
      const wAvg = (w00 + w10 + w11 + w01) * 0.25
      if (wMin < WET_THRESH * 1.32 || wAvg < WET_THRESH * 1.4) continue
      const h00 = Math.max(WATER_SURF, vertH[y * nv + x]!)
      const h10 = Math.max(WATER_SURF, vertH[y * nv + (x + 1)]!)
      const h11 = Math.max(WATER_SURF, vertH[(y + 1) * nv + (x + 1)]!)
      const h01 = Math.max(WATER_SURF, vertH[(y + 1) * nv + x]!)
      const p00 = gridToIso(x - cx, y - cy, h00)
      const p10 = gridToIso(x + 1 - cx, y - cy, h10)
      const p11 = gridToIso(x + 1 - cx, y + 1 - cy, h11)
      const p01 = gridToIso(x - cx, y + 1 - cy, h01)
      const mx = (p00.x + p10.x + p11.x + p01.x) * 0.25
      const my = (p00.y + p10.y + p11.y + p01.y) * 0.25
      const fat = 0.78
      const F = (p: { x: number; y: number }) => ({
        x: mx + (p.x - mx) * fat,
        y: my + (p.y - my) * fat,
      })
      const a = F(p00)
      const b = F(p10)
      const c = F(p11)
      const d = F(p01)
      const depth = Math.min(1, wAvg)
      const fill = lerp3(
        WATER_SHALLOW,
        lerp3(WATER_MID, WATER_DEEP, depth * 0.7),
        Math.min(1, depth * 1.1),
      )
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.lineTo(c.x, c.y)
      ctx.lineTo(d.x, d.y)
      ctx.closePath()
      ctx.fillStyle = rgba(fill, 0.85)
      ctx.fill()
    }
  }

  if (segs.length >= 3) {
    const used = new Array(segs.length).fill(false)
    const loops: Pt[][] = []
    const near = (ax: number, ay: number, bx: number, by: number) =>
      (ax - bx) * (ax - bx) + (ay - by) * (ay - by) < 4.5

    for (let s0 = 0; s0 < segs.length; s0++) {
      if (used[s0]) continue
      used[s0] = true
      const loop: Pt[] = [
        { x: segs[s0]!.ax, y: segs[s0]!.ay, h: 0.1, gx: 0, gy: 0 },
        { x: segs[s0]!.bx, y: segs[s0]!.by, h: 0.1, gx: 0, gy: 0 },
      ]
      let guard = 0
      while (guard++ < segs.length + 2) {
        const tip = loop[loop.length - 1]!
        let found = -1
        let rev = false
        for (let i = 0; i < segs.length; i++) {
          if (used[i]) continue
          const s = segs[i]!
          if (near(tip.x, tip.y, s.ax, s.ay)) {
            found = i
            rev = false
            break
          }
          if (near(tip.x, tip.y, s.bx, s.by)) {
            found = i
            rev = true
            break
          }
        }
        if (found < 0) break
        used[found] = true
        const s = segs[found]!
        const nxt = rev
          ? { x: s.ax, y: s.ay, h: 0.1, gx: 0, gy: 0 }
          : { x: s.bx, y: s.by, h: 0.1, gx: 0, gy: 0 }
        loop.push(nxt)
        if (near(nxt.x, nxt.y, loop[0]!.x, loop[0]!.y) && loop.length > 4) break
      }
      if (loop.length >= 6) loops.push(loop)
    }

    const smoothLoops: Pt[][] = []
    for (let loop of loops) {
      loop = densifyClosed(loop, DENSIFY_STEP)
      loop = chaikinClosed(loop, CHAIKIN_PASSES)
      if (loop.length < 4) continue
      smoothLoops.push(loop)
    }

    // Soft feathered bank underlap — shore cushion kills dark-grass AA → teal fringe.
    // Multi-ring low-alpha fills (+ optional blur). NEVER a dark contour stroke.
    for (const loop of smoothLoops) {
      const rings: { amt: number; col: [number, number, number]; a: number; blur: number }[] = [
        { amt: BANK_EXPAND * 1.15, col: lerp3(COL_SHORE, COL_MOSS, 0.12), a: 0.22, blur: 14 },
        { amt: BANK_EXPAND * 0.85, col: lerp3(COL_SHORE, COL_MOSS, 0.18), a: 0.28, blur: 10 },
        { amt: BANK_EXPAND * 0.5, col: lerp3(COL_SHORE, COL_DAMP, 0.15), a: 0.32, blur: 6 },
        // Opaque-enough shore cushion right under the water edge (AA samples this, not dark turf)
        { amt: BANK_EXPAND * 0.22, col: lerp3(COL_SHORE, COL_MOSS, 0.08), a: 0.55, blur: 0 },
        { amt: 0.5, col: lerp3(COL_SHORE, COL_MOSS, 0.05), a: 0.7, blur: 0 },
      ]
      for (const ring of rings) {
        const path = expandClosed(loop, ring.amt)
        ctx.save()
        if (ring.blur > 0) {
          ctx.shadowColor = rgba(ring.col, ring.a * 0.7)
          ctx.shadowBlur = ring.blur
        }
        ctx.beginPath()
        pathFromPts(ctx, path, 0)
        ctx.fillStyle = rgba(ring.col, ring.a)
        ctx.fill()
        ctx.restore()
      }
    }

    // Smooth water body — filled Chaikin path; seal matches water fill (not dark damp)
    for (const loop of smoothLoops) {
      const water = expandClosed(loop, -WATER_INSET)
      const fill = lerp3(WATER_SHALLOW, WATER_MID, 0.5)

      // Soft water-coloured underlap rings (no GPU-blur dependency for stair kill)
      for (const [amt, a] of [
        [2.8, 0.18],
        [1.6, 0.28],
        [0.6, 0.4],
      ] as const) {
        ctx.beginPath()
        pathFromPts(ctx, expandClosed(water, amt), 0)
        ctx.fillStyle = rgba(fill, a)
        ctx.fill()
      }

      ctx.beginPath()
      pathFromPts(ctx, water, 0)
      ctx.fillStyle = rgba(fill, 0.98)
      ctx.fill()
      // Seal AA with water-coloured stroke (same as fill)
      ctx.strokeStyle = rgba(fill, 1)
      ctx.lineWidth = 2.6
      ctx.stroke()
      // No dark inner lip — it read as teal teeth at zoom
    }

    if (nowMs != null && Number.isFinite(nowMs) && smoothLoops.length) {
      let best = smoothLoops[0]!
      for (const L of smoothLoops) if (L.length > best.length) best = L
      let sx = 0
      let sy = 0
      for (const p of best) {
        sx += p.x
        sy += p.y
      }
      const mx = sx / best.length
      const my = sy / best.length
      const shimmer = 0.03 + 0.018 * Math.sin(nowMs * 0.002)
      const g = ctx.createRadialGradient(mx - 8, my - 10, 0, mx, my, 36)
      g.addColorStop(0, `rgba(170, 210, 205, ${shimmer})`)
      g.addColorStop(1, 'rgba(170, 210, 205, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      pathFromPts(ctx, expandClosed(best, -WATER_INSET), 0)
      ctx.fill()
    }
  }

  ctx.restore()
}

/** Upsample wet field (bilinear) then box-blur — smoother iso-line before MS. */
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

/**
 * Soft shore wash near wetness threshold — shore/sand tones only.
 * Distance falloff in wetness space; hides residual MS faceting without a hard contour.
 */
function paintSoftShoreFalloff(
  ctx: CanvasRenderingContext2D,
  softWet: Float32Array,
  sn: number,
  scale: number,
  vertH: Float32Array,
  nv: number,
  cx: number,
  cy: number,
  size: number,
): void {
  const lo = WET_THRESH * 0.5
  const hi = WET_THRESH * 1.02
  const step = 1
  for (let iy = 0; iy < sn; iy += step) {
    for (let ix = 0; ix < sn; ix += step) {
      const w = softWet[iy * sn + ix]!
      if (w < lo || w > hi) continue
      const t = 1 - Math.abs(w - WET_THRESH) / (WET_THRESH - lo)
      const a = Math.max(0, Math.min(1, t)) * 0.1
      if (a < 0.02) continue
      const gx = ix * scale
      const gy = iy * scale
      if (gx < 0 || gy < 0 || gx > size || gy > size) continue
      const x0 = Math.max(0, Math.min(nv - 1, Math.floor(gx)))
      const y0 = Math.max(0, Math.min(nv - 1, Math.floor(gy)))
      const x1 = Math.min(nv - 1, x0 + 1)
      const y1 = Math.min(nv - 1, y0 + 1)
      const tx = gx - x0
      const ty = gy - y0
      const h =
        vertH[y0 * nv + x0]! * (1 - tx) * (1 - ty) +
        vertH[y0 * nv + x1]! * tx * (1 - ty) +
        vertH[y1 * nv + x0]! * (1 - tx) * ty +
        vertH[y1 * nv + x1]! * tx * ty
      if (h < 0.02) continue
      const p = gridToIso(gx - 0.5 - cx, gy - 0.5 - cy, Math.max(WATER_SURF, h))
      const r = 8 + a * 7
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      // Shore / warm sand — never dark damp/teal
      ctx.fillStyle = rgba(lerp3(COL_SHORE, COL_MOSS, 0.15), a)
      ctx.fill()
    }
  }
}

/** Insert points along closed loop so consecutive segments stay short for Chaikin. */
function densifyClosed(pts: Pt[], maxStep: number): Pt[] {
  if (pts.length < 3) return pts
  const out: Pt[] = []
  const m = pts.length
  for (let i = 0; i < m; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % m]!
    out.push(a)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len <= maxStep) continue
    const n = Math.ceil(len / maxStep)
    for (let k = 1; k < n; k++) {
      const t = k / n
      out.push({
        x: a.x + dx * t,
        y: a.y + dy * t,
        h: a.h + (b.h - a.h) * t,
        gx: a.gx + (b.gx - a.gx) * t,
        gy: a.gy + (b.gy - a.gy) * t,
      })
    }
  }
  return out
}

/**
 * Push closed loop along outward normals (screen-space).
 * Positive = expand (bank underlap); negative = inset (water body).
 */
function expandClosed(pts: Pt[], amount: number): Pt[] {
  if (pts.length < 3 || Math.abs(amount) < 1e-6) return pts
  const m = pts.length
  let area = 0
  for (let i = 0; i < m; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % m]!
    area += a.x * b.y - b.x * a.y
  }
  const sign = area >= 0 ? 1 : -1
  const out: Pt[] = []
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
    nx /= nl
    ny /= nl
    out.push({
      x: cur.x + nx * amount,
      y: cur.y + ny * amount,
      h: cur.h,
      gx: cur.gx,
      gy: cur.gy,
    })
  }
  return out
}
