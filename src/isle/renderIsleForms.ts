import { LOAF_DEPTH, lerp3, rgba, EARTH_TOP, EARTH_MID, EARTH_BOT } from './renderIsleCore'
import type { Pt } from './renderIsleDraw'

/** Soft loaf earth sides from land silhouette — prototype family, no needles. */
export function drawLoafFromSilhouette(ctx: CanvasRenderingContext2D, sil: Pt[]): void {
  if (sil.length < 4) return
  let minX = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of sil) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const midX = (minX + maxX) * 0.5
  const halfW = Math.max(8, (maxX - minX) * 0.5)
  const scaleX = 1 + 2.0 / halfW
  const top = sil.map((p) => ({
    x: midX + (p.x - midX) * scaleX,
    y: p.y,
  }))
  const n = top.length
  const bulgeBot = 1.03
  const g = ctx.createLinearGradient(0, maxY - 8, 0, maxY + LOAF_DEPTH)
  g.addColorStop(0, rgba(EARTH_TOP, 1))
  g.addColorStop(0.2, rgba(EARTH_TOP, 1))
  g.addColorStop(0.5, rgba(EARTH_MID, 1))
  g.addColorStop(0.82, rgba(EARTH_BOT, 1))
  g.addColorStop(1, rgba(lerp3(EARTH_BOT, [40, 28, 20], 0.28), 1))
  ctx.beginPath()
  ctx.moveTo(top[0]!.x, top[0]!.y)
  for (let i = 1; i < n; i++) ctx.lineTo(top[i]!.x, top[i]!.y)
  for (let i = n - 1; i >= 0; i--) {
    const p = top[i]!
    const x = midX + (p.x - midX) * bulgeBot
    ctx.lineTo(x, p.y + LOAF_DEPTH)
  }
  ctx.closePath()
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = rgba(EARTH_MID, 1)
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.fillStyle = g
  for (let i = 0; i < n; i++) {
    const a = top[i]!
    const b = top[(i + 1) % n]!
    const ax = midX + (a.x - midX) * bulgeBot
    const bx = midX + (b.x - midX) * bulgeBot
    ctx.beginPath()
    ctx.moveTo(a.x, a.y - 0.5)
    ctx.lineTo(b.x, b.y - 0.5)
    ctx.lineTo(bx, b.y + LOAF_DEPTH + 0.5)
    ctx.lineTo(ax, a.y + LOAF_DEPTH + 0.5)
    ctx.closePath()
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(top[0]!.x, top[0]!.y)
  for (let i = 1; i < n; i++) ctx.lineTo(top[i]!.x, top[i]!.y)
  ctx.closePath()
  ctx.strokeStyle = 'rgba(42, 30, 22, 0.28)'
  ctx.lineWidth = 3.5
  ctx.lineJoin = 'round'
  ctx.stroke()
}
