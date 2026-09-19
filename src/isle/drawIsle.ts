/** Procedural Canvas 2D draw for the single isle — no Phaser / Three.js. */

export type IsleSize = { width: number; height: number }

export function drawIsle(
  ctx: CanvasRenderingContext2D,
  size: IsleSize,
  timeMs: number,
): void {
  const { width: w, height: h } = size
  if (w <= 0 || h <= 0) return

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.65)
  sky.addColorStop(0, '#6eb5ff')
  sky.addColorStop(0.55, '#b8e0ff')
  sky.addColorStop(1, '#e8f6ff')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  // Soft sun
  const sunX = w * 0.78
  const sunY = h * 0.18
  const sunR = Math.min(w, h) * 0.08
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.2)
  sunGrad.addColorStop(0, 'rgba(255, 236, 150, 0.95)')
  sunGrad.addColorStop(0.4, 'rgba(255, 210, 100, 0.35)')
  sunGrad.addColorStop(1, 'rgba(255, 210, 100, 0)')
  ctx.fillStyle = sunGrad
  ctx.beginPath()
  ctx.arc(sunX, sunY, sunR * 2.2, 0, Math.PI * 2)
  ctx.fill()

  // Distant hills
  ctx.fillStyle = '#7bc47f'
  ctx.beginPath()
  ctx.moveTo(0, h * 0.58)
  ctx.quadraticCurveTo(w * 0.25, h * 0.48, w * 0.5, h * 0.56)
  ctx.quadraticCurveTo(w * 0.75, h * 0.64, w, h * 0.52)
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fill()

  // Ground band
  const groundY = h * 0.62
  ctx.fillStyle = '#5aad5e'
  ctx.fillRect(0, groundY, w, h - groundY)
  ctx.fillStyle = '#4a9a4e'
  ctx.fillRect(0, groundY, w, Math.max(4, h * 0.02))

  // Simple cottage placeholders
  drawCottage(ctx, w * 0.22, groundY, Math.min(w, h) * 0.12)
  drawCottage(ctx, w * 0.55, groundY, Math.min(w, h) * 0.1)
  drawCottage(ctx, w * 0.78, groundY, Math.min(w, h) * 0.09)

  // Gnome silhouette (gentle bob)
  const bob = Math.sin(timeMs / 450) * (h * 0.006)
  drawGnome(ctx, w * 0.4, groundY + bob, Math.min(w, h) * 0.11)
}

function drawCottage(
  ctx: CanvasRenderingContext2D,
  baseX: number,
  groundY: number,
  size: number,
): void {
  const bodyW = size * 1.1
  const bodyH = size * 0.75
  const x = baseX - bodyW / 2
  const y = groundY - bodyH

  ctx.fillStyle = '#c4a574'
  ctx.fillRect(x, y, bodyW, bodyH)

  ctx.fillStyle = '#c45c4a'
  ctx.beginPath()
  ctx.moveTo(x - size * 0.12, y)
  ctx.lineTo(baseX, y - size * 0.45)
  ctx.lineTo(x + bodyW + size * 0.12, y)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#5c3d2e'
  const doorW = bodyW * 0.28
  const doorH = bodyH * 0.45
  ctx.fillRect(baseX - doorW / 2, groundY - doorH, doorW, doorH)
}

function drawGnome(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  size: number,
): void {
  // Body
  ctx.fillStyle = '#3d7a4a'
  ctx.beginPath()
  ctx.ellipse(x, groundY - size * 0.35, size * 0.22, size * 0.32, 0, 0, Math.PI * 2)
  ctx.fill()

  // Head
  ctx.fillStyle = '#f0c9a0'
  ctx.beginPath()
  ctx.arc(x, groundY - size * 0.72, size * 0.18, 0, Math.PI * 2)
  ctx.fill()

  // Hat
  ctx.fillStyle = '#d64545'
  ctx.beginPath()
  ctx.moveTo(x - size * 0.22, groundY - size * 0.78)
  ctx.lineTo(x, groundY - size * 1.15)
  ctx.lineTo(x + size * 0.22, groundY - size * 0.78)
  ctx.closePath()
  ctx.fill()

  // Beard
  ctx.fillStyle = '#f5f0e6'
  ctx.beginPath()
  ctx.moveTo(x - size * 0.14, groundY - size * 0.65)
  ctx.quadraticCurveTo(x, groundY - size * 0.35, x + size * 0.14, groundY - size * 0.65)
  ctx.closePath()
  ctx.fill()
}
