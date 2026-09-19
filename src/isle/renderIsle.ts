/**
 * Soft isometric render of the continuous heightfield — Canvas 2D only.
 * Slice 1c: continuous corner-sampled tops + neighbor-delta cliffs (no lattice moiré).
 */

import type { Heightfield } from '../world/isleGrid'
import { getHeight, sampleHeight } from '../world/isleGrid'
import type { CameraState } from '../world/fit'

/** World extent of the isle footprint (grid units → world px before camera). */
export const CELL = 22
export const HEIGHT_SCALE = 42

/** Overdraw tops by this much (world units) to kill AA double-dark seams. */
const TOP_INFLATE = 0.7
/** Skip cliff faces thinner than this (world px) — kills dark skirts on flat cells. */
const MIN_CLIFF_DROP = 1

export function isleWorldSize(gridSize: number): { w: number; h: number } {
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

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const u = Math.max(0, Math.min(1, t))
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
  ]
}

function rgb(c: [number, number, number]): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`
}

/** Soft SE key — clamp hard to avoid zebra stripes. */
function shadeRgb(col: [number, number, number], shade: number): string {
  const s = Math.max(0.72, Math.min(1.08, shade))
  return rgb([
    Math.min(255, col[0] * s),
    Math.min(255, col[1] * s),
    Math.min(255, col[2] * s),
  ])
}

// Soft handmade mound palette (Slice 1c)
const COL_LOW: [number, number, number] = [0x7f, 0xae, 0x8a] // #7FAE8A
const COL_MID: [number, number, number] = [0xa8, 0xc9, 0x8e] // #A8C98E
const COL_HIGH: [number, number, number] = [0xd4, 0xc9, 0xa0] // #D4C9A0
const COL_CLIFF_LO: [number, number, number] = [0x5a, 0x4a, 0x3a]
const COL_CLIFF_HI: [number, number, number] = [0x7a, 0x6a, 0x55]

export type RenderIsleOpts = {
  width: number
  height: number
  camera: CameraState
  hf: Heightfield
}

/**
 * Screen ← camera ← soft-iso world.
 */
export function renderIsle(
  ctx: CanvasRenderingContext2D,
  opts: RenderIsleOpts,
): void {
  const { width: w, height: h, camera, hf } = opts
  if (w <= 0 || h <= 0) return

  // Soft paper-matching sky
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#C9DDF0')
  sky.addColorStop(0.5, '#E8F2FA')
  sky.addColorStop(1, '#F3EEF6')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  // Softer sun
  const sunX = w * 0.82
  const sunY = h * 0.14
  const sunR = Math.min(w, h) * 0.09
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.8)
  sunGrad.addColorStop(0, 'rgba(255, 248, 220, 0.55)')
  sunGrad.addColorStop(0.4, 'rgba(255, 230, 180, 0.18)')
  sunGrad.addColorStop(1, 'rgba(255, 230, 180, 0)')
  ctx.fillStyle = sunGrad
  ctx.beginPath()
  ctx.arc(sunX, sunY, sunR * 2.8, 0, Math.PI * 2)
  ctx.fill()

  const size = hf.size
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5

  ctx.save()
  ctx.translate(w * 0.5 + camera.panX, h * 0.5 + camera.panY)
  ctx.rotate(camera.rotation)
  ctx.scale(camera.zoom, camera.zoom)

  // Opaque soft lagoon — cream shoreline, teal center opacity ≥ 0.85
  const waterR = size * CELL * 0.78
  const wy = size * CELL * 0.1
  const water = ctx.createRadialGradient(0, wy, waterR * 0.15, 0, wy, waterR)
  water.addColorStop(0, 'rgba(90, 155, 176, 0.92)') // #5A9BB0
  water.addColorStop(0.45, 'rgba(126, 184, 200, 0.88)') // #7EB8C8
  water.addColorStop(0.78, 'rgba(245, 240, 230, 0.9)') // cream shoreline
  water.addColorStop(1, 'rgba(245, 240, 230, 0)')
  ctx.fillStyle = water
  ctx.beginPath()
  ctx.ellipse(0, wy, waterR, waterR * 0.55, 0, 0, Math.PI * 2)
  ctx.fill()

  // Thicker ground loaf under the mound
  {
    const loafR = size * CELL * 0.52
    const loafY = size * CELL * 0.22
    const loaf = ctx.createRadialGradient(0, loafY, 0, 0, loafY, loafR)
    loaf.addColorStop(0, 'rgba(90, 74, 58, 0.35)')
    loaf.addColorStop(0.7, 'rgba(122, 106, 85, 0.18)')
    loaf.addColorStop(1, 'rgba(122, 106, 85, 0)')
    ctx.fillStyle = loaf
    ctx.beginPath()
    ctx.ellipse(0, loafY, loafR, loafR * 0.42, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Painter's algorithm: back-to-front along (gx+gy)
  const cells: { x: number; y: number; depth: number }[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (getHeight(hf, x, y) <= 0.001) continue
      cells.push({ x, y, depth: x + y })
    }
  }
  cells.sort((a, b) => a.depth - b.depth)

  const inflate = TOP_INFLATE / CELL // grid units of overdraw

  for (const c of cells) {
    const x = c.x
    const y = c.y
    const ht = getHeight(hf, x, y)
    const hN = getHeight(hf, x, y - 1)
    const hE = getHeight(hf, x + 1, y)
    const hS = getHeight(hf, x, y + 1)
    const hW = getHeight(hf, x - 1, y)

    const gx0 = x - cx - 0.5
    const gx1 = x - cx + 0.5
    const gy0 = y - cy - 0.5
    const gy1 = y - cy + 0.5

    // Corner-sampled heights — continuous soft-iso quads (kills terraced diamonds)
    const hTL = sampleHeight(hf, x - 0.5, y - 0.5)
    const hTR = sampleHeight(hf, x + 0.5, y - 0.5)
    const hBR = sampleHeight(hf, x + 0.5, y + 0.5)
    const hBL = sampleHeight(hf, x - 0.5, y + 0.5)

    // Soft SE key — clamp hard, no zebra
    const shade = 0.88 + ht * 0.12 + (hN - hS) * 0.04 + (hW - hE) * 0.03

    const baseCol =
      ht < 0.35
        ? lerp3(COL_LOW, COL_MID, ht / 0.35)
        : lerp3(COL_MID, COL_HIGH, (ht - 0.35) / 0.65)

    // Separate S / E cliff faces — full neighbor delta (not min(ht, 0.22))
    const dropS = Math.max(0, ht - hS) * HEIGHT_SCALE
    const dropE = Math.max(0, ht - hE) * HEIGHT_SCALE

    // South face
    if (dropS > MIN_CLIFF_DROP) {
      const t = Math.min(1, dropS / (HEIGHT_SCALE * 0.4))
      const sc = lerp3(COL_CLIFF_LO, COL_CLIFF_HI, t)
      ctx.fillStyle = shadeRgb(sc, Math.max(0.65, Math.min(0.95, 0.72 + shade * 0.12)))
      const blC = gridToIso(gx0, gy1, hBL)
      const brC = gridToIso(gx1, gy1, hBR)
      ctx.beginPath()
      ctx.moveTo(blC.x, blC.y)
      ctx.lineTo(brC.x, brC.y)
      ctx.lineTo(brC.x, brC.y + dropS)
      ctx.lineTo(blC.x, blC.y + dropS)
      ctx.closePath()
      ctx.fill()
    }

    // East face (slightly lighter SE key)
    if (dropE > MIN_CLIFF_DROP) {
      const t = Math.min(1, dropE / (HEIGHT_SCALE * 0.4))
      const sc = lerp3(COL_CLIFF_LO, COL_CLIFF_HI, t)
      // Lift a touch toward sun on east
      const lit: [number, number, number] = [sc[0] + 10, sc[1] + 8, sc[2] + 4]
      ctx.fillStyle = shadeRgb(lit, Math.max(0.7, Math.min(1.0, 0.8 + shade * 0.1)))
      const brC = gridToIso(gx1, gy1, hBR)
      const trC = gridToIso(gx1, gy0, hTR)
      ctx.beginPath()
      ctx.moveTo(brC.x, brC.y)
      ctx.lineTo(trC.x, trC.y)
      ctx.lineTo(trC.x, trC.y + dropE)
      ctx.lineTo(brC.x, brC.y + dropE)
      ctx.closePath()
      ctx.fill()
    }

    // Top face — inflated overdraw, shade-modulated, no stroke
    const tl = gridToIso(gx0 - inflate, gy0 - inflate, hTL)
    const tr = gridToIso(gx1 + inflate, gy0 - inflate, hTR)
    const br = gridToIso(gx1 + inflate, gy1 + inflate, hBR)
    const bl = gridToIso(gx0 - inflate, gy1 + inflate, hBL)

    ctx.fillStyle = shadeRgb(baseCol, shade)
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

  let x = screenX - (viewW * 0.5 + camera.panX)
  let y = screenY - (viewH * 0.5 + camera.panY)
  const invZ = 1 / Math.max(1e-6, camera.zoom)
  x *= invZ
  y *= invZ
  const cos = Math.cos(-camera.rotation)
  const sin = Math.sin(-camera.rotation)
  const rx = x * cos - y * sin
  const ry = x * sin + y * cos

  let gx = cx + (rx / CELL + (ry * 2) / CELL) * 0.5
  let gy = cy + ((ry * 2) / CELL - rx / CELL) * 0.5

  for (let i = 0; i < 3; i++) {
    const ht = sampleClamped(hf, gx, gy)
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
