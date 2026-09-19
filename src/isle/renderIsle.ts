/**
 * Soft isometric render — Canvas 2D only.
 * Slice 1d: Ref1 diorama — continuous ImageData moss + soft loaf + living stream.
 */

import type { Heightfield } from '../world/isleGrid'
import { sampleHeight, streamDist, WATER_LEVEL } from '../world/isleGrid'
import type { CameraState } from '../world/fit'

export const CELL = 16
export const HEIGHT_SCALE = 150
const LOAF_DEPTH = 170
/** Offscreen moss resolution (continuous — no diamond stamps). */
const MOSS_RES = 280

let _mossCache: { sig: number; seed: number; canvas: HTMLCanvasElement } | null = null

function heightsSig(hf: Heightfield): number {
  let s = hf.seed | 0
  const h = hf.heights
  for (let i = 0; i < h.length; i += 11) {
    s = (Math.imul(s, 31) + ((h[i]! * 1000) | 0)) | 0
  }
  return s
}

export function isleWorldSize(gridSize: number): { w: number; h: number } {
  const half = (gridSize - 1) * 0.5
  return {
    w: (half + half) * CELL * 2,
    h: (half + half) * CELL + HEIGHT_SCALE + LOAF_DEPTH,
  }
}

function gridToIso(gx: number, gy: number, h: number): { x: number; y: number } {
  return {
    x: (gx - gy) * CELL,
    y: (gx + gy) * (CELL * 0.5) - h * HEIGHT_SCALE,
  }
}

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const u = Math.max(0, Math.min(1, t))
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
}

function rgba(c: [number, number, number], a = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`
}

function shade(col: [number, number, number], s: number): [number, number, number] {
  const k = Math.max(0.7, Math.min(1.15, s))
  return [Math.min(255, col[0] * k), Math.min(255, col[1] * k), Math.min(255, col[2] * k)]
}

function hashNoise(x: number, y: number, seed: number): number {
  let n =
    Math.imul(Math.floor(x * 8.3), 374761393) ^
    Math.imul(Math.floor(y * 8.3), 668265263) ^
    seed
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function mossNoise(gx: number, gy: number, seed: number): number {
  return (
    hashNoise(gx * 0.65, gy * 0.65, seed) * 0.55 +
    hashNoise(gx * 1.5 + 1.2, gy * 1.5, seed + 17) * 0.3 +
    hashNoise(gx * 3.0, gy * 3.0, seed + 29) * 0.15
  )
}

const COL_DEEP: [number, number, number] = [0x32, 0x5e, 0x3a]
const COL_MOSS: [number, number, number] = [0x4c, 0x80, 0x4e]
const COL_GRASS: [number, number, number] = [0x68, 0x9a, 0x5a]
const COL_LIT: [number, number, number] = [0x86, 0xb0, 0x6c]
const COL_WARM: [number, number, number] = [0x94, 0xac, 0x66]

const EARTH: [number, number, number][] = [
  [0x92, 0x6a, 0x4e],
  [0x7c, 0x56, 0x3e],
  [0x68, 0x46, 0x32],
  [0x88, 0x60, 0x46],
  [0x74, 0x50, 0x3a],
]

const WATER_DEEP: [number, number, number] = [0x24, 0x62, 0x72]
const WATER_MID: [number, number, number] = [0x3e, 0x88, 0x98]
const WATER_SHALLOW: [number, number, number] = [0x66, 0xa6, 0xb2]
const SHORE: [number, number, number] = [0xee, 0xe4, 0xce]
// water surface encoded in buffer

export type RenderIsleOpts = {
  width: number
  height: number
  camera: CameraState
  hf: Heightfield
  nowMs?: number
}

function mossColorAt(
  gx: number,
  gy: number,
  ht: number,
  seed: number,
  shadeAmt: number,
): [number, number, number] {
  const n = mossNoise(gx, gy, seed)
  let col: [number, number, number]
  if (ht < 0.32) col = lerp3(COL_DEEP, COL_MOSS, ht / 0.32)
  else if (ht < 0.62) col = lerp3(COL_MOSS, COL_GRASS, (ht - 0.32) / 0.3)
  else col = lerp3(COL_GRASS, COL_LIT, (ht - 0.62) / 0.38)
  if (n > 0.52) col = lerp3(col, COL_LIT, (n - 0.52) * 1.15)
  else if (n < 0.38) col = lerp3(col, COL_DEEP, (0.38 - n) * 1.25)
  if (n > 0.72) col = lerp3(col, COL_WARM, 0.35)
  // Extra micro-breakup
  const n2 = mossNoise(gx * 2.4 + 3, gy * 2.4, seed + 51)
  if (n2 > 0.65) col = lerp3(col, COL_LIT, 0.2)
  if (n2 < 0.3) col = lerp3(col, COL_DEEP, 0.25)
  return shade(col, shadeAmt)
}

function isWater(ht: number, gx: number, gy: number, size: number, seed: number): boolean {
  if (ht <= 0.001) return false
  if (streamDist(gx, gy, size, seed) < 2.3) return true
  return ht <= WATER_LEVEL
}

/** Continuous soft rocky loaf under the isle. */
function drawIsleLoaf(ctx: CanvasRenderingContext2D, size: number, topY: number): void {
  const rx = size * CELL * 0.54
  const cy = topY + LOAF_DEPTH * 0.55
  const ry = LOAF_DEPTH * 0.58

  const body = ctx.createLinearGradient(-rx, cy, rx, cy)
  body.addColorStop(0, rgba(shade(EARTH[2]!, 0.84), 1))
  body.addColorStop(0.38, rgba(shade(EARTH[0]!, 1.04), 1))
  body.addColorStop(0.72, rgba(shade(EARTH[1]!, 0.96), 1))
  body.addColorStop(1, rgba(shade(EARTH[2]!, 0.88), 1))
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()

  // Soft sedimentary strata — readable bands, still soft loaf
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6
    const y = topY + LOAF_DEPTH * (0.1 + t * 0.78)
    const bandH = LOAF_DEPTH * 0.1
    const col = EARTH[i % EARTH.length]!
    const g = ctx.createLinearGradient(0, y - bandH, 0, y + bandH)
    g.addColorStop(0, rgba(col, 0))
    g.addColorStop(0.3, rgba(shade(col, 1.02), 0.62))
    g.addColorStop(0.55, rgba(shade(col, 0.92), 0.5))
    g.addColorStop(1, rgba(col, 0))
    ctx.fillStyle = g
    const bulge = Math.sin(Math.PI * t)
    ctx.beginPath()
    ctx.ellipse(0, y, rx * (0.94 + bulge * 0.08), bandH, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Paint continuous moss + stream into ImageData (grid-space sampling).
 * Returns a canvas ready to be drawn in soft-iso via transform.
 */
function paintMossBuffer(
  hf: Heightfield,
  seed: number,
  now: number,
): HTMLCanvasElement {
  const size = hf.size
  const canvas = document.createElement('canvas')
  canvas.width = MOSS_RES
  canvas.height = MOSS_RES
  const ictx = canvas.getContext('2d')!
  const img = ictx.createImageData(MOSS_RES, MOSS_RES)
  const data = img.data
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const maxR = Math.min(cx, cy) * 0.92

  for (let py = 0; py < MOSS_RES; py++) {
    for (let px = 0; px < MOSS_RES; px++) {
      // Map buffer pixel → grid coords (top-down mound map, then iso-project later)
      const gx = (px / (MOSS_RES - 1)) * (size - 1)
      const gy = (py / (MOSS_RES - 1)) * (size - 1)
      const dx = (gx - cx) / maxR
      const dy = (gy - cy) / maxR
      const r = Math.sqrt(dx * dx + dy * dy)
      const i = (py * MOSS_RES + px) * 4

      const rimWobble = 0.94 + (mossNoise(gx, gy, seed + 77) - 0.5) * 0.1
      if (r > rimWobble) {
        data[i + 3] = 0
        continue
      }

      const ht = sampleHeight(hf, gx, gy)
      if (ht <= 0.001) {
        data[i + 3] = 0
        continue
      }

      const edge = r > rimWobble * 0.82 ? Math.max(0, 1 - (r - rimWobble * 0.82) / (rimWobble * 0.18)) : 1
      const water = isWater(ht, gx, gy, size, seed)

      let col: [number, number, number]
      if (water) {
        const sd = streamDist(gx, gy, size, seed)
        const depthT = Math.max(0, Math.min(1, (2.3 - sd) / 2.3))
        if (depthT < 0.28) col = lerp3(SHORE, WATER_SHALLOW, depthT / 0.28)
        else if (depthT > 0.55) col = lerp3(WATER_MID, WATER_DEEP, (depthT - 0.55) / 0.45)
        else col = lerp3(WATER_SHALLOW, WATER_MID, (depthT - 0.28) / 0.27)
        // Living shimmer
        const phase = (now * 0.0004 + gx * 0.2 + gy * 0.14) % (Math.PI * 2)
        if (depthT > 0.4) {
          const spark = 0.5 + Math.sin(phase) * 0.5
          col = lerp3(col, [255, 255, 248], spark * 0.12)
        }
      } else {
        const hN = sampleHeight(hf, gx, gy - 0.6)
        const hS = sampleHeight(hf, gx, gy + 0.6)
        const hE = sampleHeight(hf, gx + 0.6, gy)
        const hW = sampleHeight(hf, gx - 0.6, gy)
        const shadeAmt = 0.84 + ht * 0.18 + (hN - hS) * 0.07 + (hW - hE) * 0.05
        col = mossColorAt(gx, gy, ht, seed, shadeAmt)
        const sd = streamDist(gx, gy, size, seed)
        if (sd < 3.4) col = lerp3(col, SHORE, Math.max(0, (3.4 - sd) / 3.4) * 0.42)
      }

      // Soft dome falloff toward rim
      const dome = 1 - r * r * 0.18
      col = shade(col, dome)

      data[i] = Math.round(col[0])
      data[i + 1] = Math.round(col[1])
      data[i + 2] = Math.round(col[2])
      data[i + 3] = Math.round(255 * edge)
    }
  }

  ictx.putImageData(img, 0, 0)
  return canvas
}

export function renderIsle(ctx: CanvasRenderingContext2D, opts: RenderIsleOpts): void {
  const { width: w, height: h, camera, hf } = opts
  if (w <= 0 || h <= 0) return

  const now = opts.nowMs ?? 0
  const seed = hf.seed
  const size = hf.size
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5

  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#E6DCCE')
  sky.addColorStop(0.4, '#EFE8DC')
  sky.addColorStop(0.75, '#E8EDF2')
  sky.addColorStop(1, '#F2EDF5')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  const sunX = w * 0.74
  const sunY = h * 0.1
  const sunR = Math.min(w, h) * 0.1
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 2.3)
  sunGrad.addColorStop(0, 'rgba(255, 242, 200, 0.5)')
  sunGrad.addColorStop(0.5, 'rgba(255, 218, 160, 0.1)')
  sunGrad.addColorStop(1, 'rgba(255, 218, 160, 0)')
  ctx.fillStyle = sunGrad
  ctx.beginPath()
  ctx.arc(sunX, sunY, sunR * 2.3, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.translate(w * 0.5 + camera.panX, h * 0.5 + camera.panY)
  ctx.rotate(camera.rotation)
  ctx.scale(camera.zoom, camera.zoom)

  // Contact shadow
  {
    const loafR = size * CELL * 0.46
    const loafY = size * CELL * 0.4
    const shadow = ctx.createRadialGradient(0, loafY, 0, 0, loafY, loafR)
    shadow.addColorStop(0, 'rgba(48, 34, 26, 0.38)')
    shadow.addColorStop(0.55, 'rgba(48, 34, 26, 0.1)')
    shadow.addColorStop(1, 'rgba(48, 34, 26, 0)')
    ctx.fillStyle = shadow
    ctx.beginPath()
    ctx.ellipse(0, loafY, loafR, loafR * 0.28, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  let avgH = 0
  let nLand = 0
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const ht = sampleHeight(hf, x, y)
      if (ht > 0.05) {
        avgH += ht
        nLand++
      }
    }
  }
  avgH = nLand ? avgH / nLand : 0.45
  const topY = gridToIso(0, 0, avgH * 0.85).y

  // Thick soft rocky loaf FIRST
  drawIsleLoaf(ctx, size, topY + 6)

  // Continuous moss+stream — stacked soft layers = mound volume (Ref1)
  const sig = heightsSig(hf)
  let mossBuf: HTMLCanvasElement
  if (_mossCache && _mossCache.sig === sig && _mossCache.seed === seed) {
    mossBuf = _mossCache.canvas
  } else {
    mossBuf = paintMossBuffer(hf, seed, now)
    _mossCache = { sig, seed, canvas: mossBuf }
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const layers = 6
  for (let li = 0; li < layers; li++) {
    const t = li / (layers - 1)
    // Lower layers larger & lower; upper layers smaller & raised → soft mound
    const hLayer = avgH * (0.55 + t * 0.55)
    const shrink = 1 - (1 - t) * 0.1
    const p00 = gridToIso(-cx * shrink, -cy * shrink, hLayer)
    const p10 = gridToIso((size - 1 - cx) * shrink, -cy * shrink, hLayer)
    const p01 = gridToIso(-cx * shrink, (size - 1 - cy) * shrink, hLayer)
    const dx = p10.x - p00.x
    const dy = p10.y - p00.y
    const ex = p01.x - p00.x
    const ey = p01.y - p00.y
    ctx.save()
    ctx.globalAlpha = 0.22 + t * 0.55
    ctx.transform(dx / MOSS_RES, dy / MOSS_RES, ex / MOSS_RES, ey / MOSS_RES, p00.x, p00.y)
    ctx.drawImage(mossBuf, 0, 0)
    ctx.restore()
  }

  // Soft SE dome light across mound
  {
    const moundRx = size * CELL * 0.5
    const moundRy = size * CELL * 0.26
    const dome = ctx.createRadialGradient(
      moundRx * 0.2,
      topY - avgH * HEIGHT_SCALE * 0.35,
      0,
      0,
      topY - avgH * HEIGHT_SCALE * 0.15,
      moundRx,
    )
    dome.addColorStop(0, 'rgba(255, 248, 215, 0.22)')
    dome.addColorStop(0.4, 'rgba(255, 248, 215, 0.05)')
    dome.addColorStop(0.75, 'rgba(40, 60, 40, 0.06)')
    dome.addColorStop(1, 'rgba(28, 44, 30, 0.2)')
    ctx.fillStyle = dome
    ctx.beginPath()
    ctx.ellipse(0, topY - avgH * HEIGHT_SCALE * 0.2, moundRx, moundRy, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Loaf peek below moss
  ctx.save()
  ctx.beginPath()
  ctx.rect(-size * CELL, topY + 18, size * CELL * 2, LOAF_DEPTH + 50)
  ctx.clip()
  drawIsleLoaf(ctx, size, topY + 12)
  ctx.restore()

  ctx.restore()
}

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
  return sampleHeight(hf, x, y)
}
