import type { Heightfield } from '../world/isleGrid'
import {
  gridToIso,
  lerp3,
  rgba,
  WATER_SHALLOW,
  WATER_MID,
  WATER_DEEP,
  COL_SHORE,
  COL_DAMP,
} from './renderIsleCore'
import type { Pt } from './renderIsleDraw'
import { chaikinClosed, pathFromPts } from './renderIsleDraw'

const WET_THRESH = 0.48
const WATER_SURF = 0.12

/**
 * Continuous shoreline from wetness corner field (marching squares + Chaikin).
 * Living stream banks — not diamond water, cyan knife, or saw-tooth comb.
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
  type Seg = { ax: number; ay: number; bx: number; by: number }
  const segs: Seg[] = []

  const interp = (
    x0: number,
    y0: number,
    w0: number,
    x1: number,
    y1: number,
    w1: number,
  ) => {
    const t = (WET_THRESH - w0) / Math.max(1e-6, w1 - w0)
    const u = Math.max(0, Math.min(1, t))
    const vx = x0 + (x1 - x0) * u
    const vy = y0 + (y1 - y0) * u
    const hA = vertH[y0 * nv + x0]!
    const hB = vertH[y1 * nv + x1]!
    const h = Math.max(WATER_SURF, hA + (hB - hA) * u)
    return gridToIso(vx - 0.5 - cx, vy - 0.5 - cy, h)
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const w00 = wet[y * nv + x]!
      const w10 = wet[y * nv + (x + 1)]!
      const w11 = wet[(y + 1) * nv + (x + 1)]!
      const w01 = wet[(y + 1) * nv + x]!
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

  // Soft sheet under banks (slight overlap kills bed lattice)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const w00 = wet[y * nv + x]!
      const w10 = wet[y * nv + (x + 1)]!
      const w11 = wet[(y + 1) * nv + (x + 1)]!
      const w01 = wet[(y + 1) * nv + x]!
      const wAvg = (w00 + w10 + w11 + w01) * 0.25
      if (wAvg < WET_THRESH * 0.85) continue
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
      const fat = 1.12
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
      ctx.fillStyle = rgba(fill, 0.94)
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

    for (let loop of loops) {
      loop = chaikinClosed(loop, 3)
      if (loop.length < 4) continue
      ctx.beginPath()
      pathFromPts(ctx, loop, 0)
      ctx.strokeStyle = rgba(lerp3(WATER_SHALLOW, COL_SHORE, 0.35), 0.55)
      ctx.lineWidth = 7
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.strokeStyle = rgba(lerp3(WATER_MID, COL_DAMP, 0.25), 0.28)
      ctx.lineWidth = 14
      ctx.stroke()
      ctx.strokeStyle = 'rgba(220, 245, 240, 0.22)'
      ctx.lineWidth = 2.2
      ctx.stroke()
    }

    if (nowMs != null && Number.isFinite(nowMs) && loops.length) {
      let best = loops[0]!
      for (const L of loops) if (L.length > best.length) best = L
      let sx = 0
      let sy = 0
      for (const p of best) {
        sx += p.x
        sy += p.y
      }
      const mx = sx / best.length
      const my = sy / best.length
      const shimmer = 0.04 + 0.025 * Math.sin(nowMs * 0.002)
      const g = ctx.createRadialGradient(mx - 8, my - 10, 0, mx, my, 40)
      g.addColorStop(0, `rgba(210, 240, 235, ${shimmer})`)
      g.addColorStop(1, 'rgba(210, 240, 235, 0)')
      ctx.fillStyle = g
      ctx.beginPath()
      pathFromPts(ctx, chaikinClosed(best, 1), 0)
      ctx.fill()
    }
  }

  ctx.restore()
}
