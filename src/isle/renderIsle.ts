/**
 * Soft isometric render of the continuous heightfield — Canvas 2D only.
 */

import type { Heightfield } from '../world/isleGrid'
import { getHeight } from '../world/isleGrid'
import type { CameraState } from '../world/fit'

/** World extent of the isle footprint (grid units → world px before camera). */
export const CELL = 18
export const HEIGHT_SCALE = 42

export function isleWorldSize(gridSize: number): { w: number; h: number } {
  // Diamond footprint of soft-iso projection
  const half = (gridSize - 1) * 0.5
  const w = (half + half) * CELL * 2
  const h = (half + half) * CELL + HEIGHT_SCALE
  return { w, h }
}

function gridToIso(gx: number, gy: number, h: number): { x: number; y: number } {
  const x = (gx - gy) * CELL
  const y = (gx + gy) * (CELL * 0.5) - h * HEIGHT_SCALE
  return { x, y }
}

function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): string {
  const u = Math.max(0, Math.min(1, t))
  const r = Math.round(a[0] + (b[0] - a[0]) * u)
  const g = Math.round(a[1] + (b[1] - a[1]) * u)
  const bl = Math.round(a[2] + (b[2] - a[2]) * u)
  return `rgb(${r},${g},${bl})`
}

const COL_LOW: [number, number, number] = [72, 140, 90]
const COL_MID: [number, number, number] = [110, 180, 100]
const COL_HIGH: [number, number, number] = [210, 200, 140]
const COL_SIDE: [number, number, number] = [55, 110, 70]

export type RenderIsleOpts = {
  width: number
  height: number
  camera: CameraState
  hf: Heightfield
}

/**
 * Screen ← camera ← soft-iso world.
 * Returns inverse mapper for hit-testing (screen → approx grid).
 */
export function renderIsle(
  ctx: CanvasRenderingContext2D,
  opts: RenderIsleOpts,
): void {
  const { width: w, height: h, camera, hf } = opts
  if (w <= 0 || h <= 0) return

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#5aa8f0')
  sky.addColorStop(0.45, '#a8d8ff')
  sky.addColorStop(1, '#d4eefc')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  // Soft sun
  const sunX = w * 0.82
  const sunY = h * 0.14
  const sunR = Math.min(w, h) * 0.07
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.4)
  sunGrad.addColorStop(0, 'rgba(255, 240, 170, 0.95)')
  sunGrad.addColorStop(0.45, 'rgba(255, 210, 120, 0.3)')
  sunGrad.addColorStop(1, 'rgba(255, 210, 120, 0)')
  ctx.fillStyle = sunGrad
  ctx.beginPath()
  ctx.arc(sunX, sunY, sunR * 2.4, 0, Math.PI * 2)
  ctx.fill()

  const size = hf.size
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5

  ctx.save()
  ctx.translate(w * 0.5 + camera.panX, h * 0.5 + camera.panY)
  ctx.rotate(camera.rotation)
  ctx.scale(camera.zoom, camera.zoom)

  // Soft water disc under isle
  const waterR = size * CELL * 0.72
  const water = ctx.createRadialGradient(0, size * CELL * 0.12, waterR * 0.2, 0, size * CELL * 0.12, waterR)
  water.addColorStop(0, 'rgba(90, 180, 220, 0.55)')
  water.addColorStop(0.7, 'rgba(70, 150, 200, 0.35)')
  water.addColorStop(1, 'rgba(70, 150, 200, 0)')
  ctx.fillStyle = water
  ctx.beginPath()
  ctx.ellipse(0, size * CELL * 0.1, waterR, waterR * 0.55, 0, 0, Math.PI * 2)
  ctx.fill()

  // Painter's algorithm: back-to-front along (gx+gy)
  const cells: { x: number; y: number; depth: number }[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ht = getHeight(hf, x, y)
      if (ht <= 0.001) continue
      cells.push({ x, y, depth: x + y })
    }
  }
  cells.sort((a, b) => a.depth - b.depth)

  for (const c of cells) {
    const x = c.x
    const y = c.y
    const ht = getHeight(hf, x, y)
    const hN = getHeight(hf, x, y - 1)
    const hE = getHeight(hf, x + 1, y)
    const hS = getHeight(hf, x, y + 1)
    const hW = getHeight(hf, x - 1, y)

    const tl = gridToIso(x - cx - 0.5, y - cy - 0.5, ht)
    const tr = gridToIso(x - cx + 0.5, y - cy - 0.5, ht)
    const br = gridToIso(x - cx + 0.5, y - cy + 0.5, ht)
    const bl = gridToIso(x - cx - 0.5, y - cy + 0.5, ht)

    // Side faces when neighbor lower
    const shade = 0.55 + ht * 0.35 + (hN - hS) * 0.08 + (hW - hE) * 0.05
    const topCol =
      ht < 0.35
        ? lerpColor(COL_LOW, COL_MID, ht / 0.35)
        : lerpColor(COL_MID, COL_HIGH, (ht - 0.35) / 0.65)

    // Soft south-east cliff
    const baseDrop = Math.min(ht, 0.22)
    if (baseDrop > 0.02 && (hS < ht - 0.02 || hE < ht - 0.02)) {
      const drop = baseDrop * HEIGHT_SCALE
      ctx.fillStyle = lerpColor(COL_SIDE, COL_LOW, shade * 0.5)
      ctx.beginPath()
      ctx.moveTo(bl.x, bl.y)
      ctx.lineTo(br.x, br.y)
      ctx.lineTo(br.x, br.y + drop)
      ctx.lineTo(bl.x, bl.y + drop)
      ctx.closePath()
      ctx.fill()
    }

    ctx.fillStyle = topCol
    ctx.beginPath()
    ctx.moveTo(tl.x, tl.y)
    ctx.lineTo(tr.x, tr.y)
    ctx.lineTo(br.x, br.y)
    ctx.lineTo(bl.x, bl.y)
    ctx.closePath()
    ctx.fill()
  }

  ctx.restore()
}

/**
 * Map screen CSS coords → approximate grid coords under camera.
 * Uses iterative height-aware unproject (soft iso).
 */
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

  // Inverse camera
  let x = screenX - (viewW * 0.5 + camera.panX)
  let y = screenY - (viewH * 0.5 + camera.panY)
  const invZ = 1 / Math.max(1e-6, camera.zoom)
  x *= invZ
  y *= invZ
  const cos = Math.cos(-camera.rotation)
  const sin = Math.sin(-camera.rotation)
  const rx = x * cos - y * sin
  const ry = x * sin + y * cos

  // Assume height 0 first, then refine with sampled height
  let gx = cx + (rx / CELL + (ry * 2) / CELL) * 0.5
  let gy = cy + ((ry * 2) / CELL - rx / CELL) * 0.5

  for (let i = 0; i < 3; i++) {
    const ht = sampleClamped(hf, gx, gy)
    // Re-solve with height offset
    const adjY = ry + ht * HEIGHT_SCALE
    gx = cx + (rx / CELL + (adjY * 2) / CELL) * 0.5
    gy = cy + ((adjY * 2) / CELL - rx / CELL) * 0.5
  }

  if (gx < -1 || gy < -1 || gx > size || gy > size) return null
  return { gx, gy }
}

function sampleClamped(hf: Heightfield, gx: number, gy: number): number {
  const x = Math.max(0, Math.min(hf.size - 1, Math.round(gx)))
  const y = Math.max(0, Math.min(hf.size - 1, Math.round(gy)))
  return getHeight(hf, x, y)
}
