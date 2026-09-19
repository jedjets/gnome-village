/**
 * Soft isometric render — Canvas 2D only.
 * Slice 1e: asset-backed soft-iso mesh (moss atlas, rock strata cliffs,
 * living stream, story props). No ImageData pancake.
 *
 * Lessons folded (ideas only): shared vertex heights, neighbourhood materials,
 * vertex light blur, continuous shore field, prop depth re-bucket, LOD.
 */

import type { Heightfield } from '../world/isleGrid'
import {
  getHeight,
  sampleHeight,
  streamDist,
  WATER_LEVEL,
} from '../world/isleGrid'
import type { CameraState } from '../world/fit'
import { ensureArt } from './artAtlas'

/** Tuned for relief + Fit (~65–75% stage when height-primary). */
export const CELL = 20
export const HEIGHT_SCALE = 58
const LOAF_DEPTH = 72
const TOP_INFLATE = 0.55
const MIN_CLIFF_DROP = 2.2
const STREAM_HALF = 2.15

export function isleWorldSize(gridSize: number): { w: number; h: number } {
  // Visual circular footprint (not full grid diamond) so Fit isn't starved
  const foot = gridSize * CELL * 0.84
  return {
    w: foot,
    h: foot * 0.52 + HEIGHT_SCALE + LOAF_DEPTH,
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

function shadeRgb(col: [number, number, number], shade: number): string {
  const s = Math.max(0.72, Math.min(1.12, shade))
  return rgba([
    Math.min(255, col[0] * s),
    Math.min(255, col[1] * s),
    Math.min(255, col[2] * s),
  ])
}

function hash2(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

const COL_DEEP: [number, number, number] = [0x3a, 0x6e, 0x44]
const COL_MOSS: [number, number, number] = [0x58, 0x92, 0x58]
const COL_LIT: [number, number, number] = [0x86, 0xb4, 0x6c]
const COL_DAMP: [number, number, number] = [0x4a, 0x72, 0x52]
const COL_SHORE: [number, number, number] = [0xd8, 0xcc, 0xaa]
const WATER_DEEP: [number, number, number] = [0x2a, 0x68, 0x78]
const WATER_MID: [number, number, number] = [0x3e, 0x8a, 0x9a]
const WATER_SHALLOW: [number, number, number] = [0x6a, 0xaa, 0xb4]
const EARTH: [number, number, number][] = [
  [0x9a, 0x72, 0x52],
  [0x82, 0x5c, 0x42],
  [0x6e, 0x4c, 0x36],
  [0x8a, 0x64, 0x48],
]

export type RenderIsleOpts = {
  width: number
  height: number
  camera: CameraState
  hf: Heightfield
  nowMs?: number
}

type PropKind = 'pine' | 'cabin' | 'gnomeR' | 'gnomeB'

type Prop = {
  gx: number
  gy: number
  kind: PropKind
  scale: number
  /** Painter depth — re-bucketed so ground behind doesn't clip feet */
  depth: number
}

/** Moss-only stamp cache (no water / sparkles). */
let _mossStamp: {
  sig: number
  seed: number
  canvas: HTMLCanvasElement
} | null = null

let _vertLight: Float32Array | null = null
let _vertLightSig = 0
let _vertLightSize = 0

function heightsSig(hf: Heightfield): number {
  let s = hf.seed | 0
  const h = hf.heights
  for (let i = 0; i < h.length; i += 9) {
    s = (Math.imul(s, 31) + ((h[i]! * 1000) | 0)) | 0
  }
  return s
}

/** Shared-vertex lighting with neighbourhood blur (kills diamond lattice). */
function ensureVertexLight(hf: Heightfield): Float32Array {
  const size = hf.size
  const nv = size + 1
  const sig = heightsSig(hf)
  if (_vertLight && _vertLightSig === sig && _vertLightSize === size) {
    return _vertLight
  }
  const raw = new Float32Array(nv * nv)
  for (let y = 0; y < nv; y++) {
    for (let x = 0; x < nv; x++) {
      const gx = x - 0.5
      const gy = y - 0.5
      const hC = sampleHeight(hf, gx, gy)
      const hN = sampleHeight(hf, gx, gy - 1)
      const hS = sampleHeight(hf, gx, gy + 1)
      const hE = sampleHeight(hf, gx + 1, gy)
      const hW = sampleHeight(hf, gx - 1, gy)
      // Soft SE key + valley AO
      let L = 0.86 + hC * 0.14 + (hN - hS) * 0.1 + (hW - hE) * 0.07
      const crest = Math.max(0, hC - (hN + hS + hE + hW) * 0.25)
      L += crest * 0.12
      const valley = Math.max(0, (hN + hS + hE + hW) * 0.25 - hC)
      L -= valley * 0.18
      raw[y * nv + x] = L
    }
  }
  // Box blur twice
  const tmp = new Float32Array(nv * nv)
  const blur = (src: Float32Array, dst: Float32Array) => {
    for (let y = 0; y < nv; y++) {
      for (let x = 0; x < nv; x++) {
        let s = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            const yy = y + dy
            if (xx < 0 || yy < 0 || xx >= nv || yy >= nv) continue
            s += src[yy * nv + xx]!
            n++
          }
        }
        dst[y * nv + x] = s / n
      }
    }
  }
  blur(raw, tmp)
  blur(tmp, raw)
  _vertLight = raw
  _vertLightSig = sig
  _vertLightSize = size
  return raw
}

function vertL(light: Float32Array, nv: number, x: number, y: number): number {
  const xi = Math.max(0, Math.min(nv - 1, x))
  const yi = Math.max(0, Math.min(nv - 1, y))
  return light[yi * nv + xi]!
}

/** Neighbourhood moss colour (fade materials — no hard tile flips). */
function mossMaterial(
  hf: Heightfield,
  x: number,
  y: number,
  seed: number,
): [number, number, number] {
  let acc: [number, number, number] = [0, 0, 0]
  let wsum = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const w = dx === 0 && dy === 0 ? 2.2 : 1
      const ht = getHeight(hf, x + dx, y + dy)
      if (ht <= 0.001) continue
      const n = hash2(x + dx, y + dy, seed)
      let col: [number, number, number]
      if (ht < 0.28) col = lerp3(COL_DEEP, COL_MOSS, ht / 0.28)
      else if (ht < 0.6) col = lerp3(COL_MOSS, COL_LIT, (ht - 0.28) / 0.32)
      else col = lerp3(COL_LIT, COL_MOSS, (ht - 0.6) / 0.4)
      if (n > 0.62) col = lerp3(col, COL_LIT, 0.35)
      if (n < 0.32) col = lerp3(col, COL_DEEP, 0.4)
      const sd = streamDist(x + dx, y + dy, hf.size, seed)
      if (sd < STREAM_HALF + 1.4) {
        col = lerp3(col, COL_DAMP, Math.max(0, 1 - sd / (STREAM_HALF + 1.4)) * 0.55)
      }
      acc[0] += col[0] * w
      acc[1] += col[1] * w
      acc[2] += col[2] * w
      wsum += w
    }
  }
  if (wsum < 1e-6) return COL_MOSS
  return [acc[0] / wsum, acc[1] / wsum, acc[2] / wsum]
}

function wetnessAt(hf: Heightfield, gx: number, gy: number, seed: number): number {
  const ht = sampleHeight(hf, gx, gy)
  if (ht <= 0.001) return 0
  const sd = streamDist(gx, gy, hf.size, seed)
  const stream = Math.max(0, 1 - sd / STREAM_HALF)
  const bowl = ht <= WATER_LEVEL ? Math.max(0, 1 - ht / WATER_LEVEL) * 0.85 : 0
  // Continuous field (not binary wet tile)
  return Math.max(stream, bowl)
}

/** Build moss stamp atlas strip (moss-only — water never baked in). */
function ensureMossStamp(
  artReady: boolean,
  mossTile: HTMLImageElement | null,
  mossAtlas: HTMLImageElement | null,
  sig: number,
  seed: number,
): HTMLCanvasElement {
  if (_mossStamp && _mossStamp.sig === sig && _mossStamp.seed === seed) {
    return _mossStamp.canvas
  }
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')!
  g.clearRect(0, 0, 256, 64)
  if (artReady && mossTile && mossTile.complete && mossTile.naturalWidth > 0) {
    // 4 variants from moss-tile
    for (let i = 0; i < 4; i++) {
      const sx = (i % 2) * (mossTile.naturalWidth * 0.4)
      const sy = Math.floor(i / 2) * (mossTile.naturalHeight * 0.4)
      g.drawImage(
        mossTile,
        sx,
        sy,
        mossTile.naturalWidth * 0.55,
        mossTile.naturalHeight * 0.55,
        i * 64,
        0,
        64,
        64,
      )
    }
  } else if (artReady && mossAtlas && mossAtlas.complete && mossAtlas.naturalWidth > 0) {
    g.drawImage(mossAtlas, 0, 0)
  } else {
    // Procedural fallback stamps
    for (let i = 0; i < 4; i++) {
      const img = g.createImageData(64, 64)
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          const dx = (x - 32) / 30
          const dy = (y - 32) / 30
          const r2 = dx * dx + dy * dy
          const a = r2 > 1 ? 0 : Math.round(255 * Math.pow(1 - r2, 0.5))
          const n = hash2(x + i * 17, y + i * 9, seed)
          const col = n > 0.55 ? COL_LIT : n < 0.35 ? COL_DEEP : COL_MOSS
          const o = (y * 64 + x) * 4
          img.data[o] = col[0]
          img.data[o + 1] = col[1]
          img.data[o + 2] = col[2]
          img.data[o + 3] = a
        }
      }
      g.putImageData(img, i * 64, 0)
    }
  }
  _mossStamp = { sig, seed, canvas: c }
  return c
}

function storyProps(hf: Heightfield): Prop[] {
  const seed = hf.seed
  const size = hf.size
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const candidates: { gx: number; gy: number; kind: PropKind; scale: number }[] = [
    { gx: cx - 8, gy: cy - 6, kind: 'pine', scale: 1.05 },
    { gx: cx + 9, gy: cy - 7, kind: 'pine', scale: 0.92 },
    { gx: cx - 10, gy: cy + 5, kind: 'pine', scale: 0.88 },
    { gx: cx + 6, gy: cy + 8, kind: 'pine', scale: 1.0 },
    { gx: cx - 2, gy: cy + 4, kind: 'cabin', scale: 1.0 },
    { gx: cx + 3.5, gy: cy + 6.5, kind: 'gnomeR', scale: 0.95 },
    { gx: cx + 5.2, gy: cy + 7.2, kind: 'gnomeB', scale: 0.95 },
  ]
  const out: Prop[] = []
  for (const c of candidates) {
    // Jitter by seed but keep on land / off deep water
    const jx = (hash2(Math.floor(c.gx), Math.floor(c.gy), seed + 3) - 0.5) * 1.2
    const jy = (hash2(Math.floor(c.gx), Math.floor(c.gy), seed + 9) - 0.5) * 1.2
    const gx = c.gx + jx
    const gy = c.gy + jy
    const ht = sampleHeight(hf, gx, gy)
    if (ht < 0.22) continue
    if (wetnessAt(hf, gx, gy, seed) > 0.55 && c.kind !== 'gnomeR' && c.kind !== 'gnomeB') {
      continue
    }
    // Re-bucket toward front of footprint so later ground won't clip feet/eaves
    const depth = gx + gy + ht * 2.5 + (c.kind === 'cabin' ? 1.2 : 0.4)
    out.push({ gx, gy, kind: c.kind, scale: c.scale, depth })
  }
  return out
}

function drawLoafShelves(
  ctx: CanvasRenderingContext2D,
  size: number,
  topY: number,
  artReady: boolean,
  rock: HTMLImageElement | null,
): void {
  const rx = size * CELL * 0.42
  const shelves = 3
  for (let i = 0; i < shelves; i++) {
    const t = (i + 0.5) / shelves
    const y = topY + LOAF_DEPTH * (0.12 + t * 0.72)
    const bandH = LOAF_DEPTH * (0.22 - t * 0.03)
    const bulge = 0.92 + Math.sin(Math.PI * t) * 0.08
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(0, y, rx * bulge, bandH, 0, 0, Math.PI * 2)
    ctx.clip()
    if (artReady && rock && rock.complete && rock.naturalWidth > 0) {
      const sy = (i / shelves) * Math.max(0, rock.naturalHeight - bandH * 2)
      ctx.globalAlpha = 0.92
      ctx.drawImage(
        rock,
        0,
        sy,
        rock.naturalWidth,
        Math.min(rock.naturalHeight - sy, bandH * 3),
        -rx * bulge,
        y - bandH,
        rx * bulge * 2,
        bandH * 2,
      )
      ctx.globalAlpha = 1
    } else {
      const col = EARTH[i % EARTH.length]!
      const g = ctx.createLinearGradient(0, y - bandH, 0, y + bandH)
      g.addColorStop(0, rgba(col, 0.15))
      g.addColorStop(0.35, rgba(col, 0.85))
      g.addColorStop(0.7, rgba(EARTH[(i + 1) % EARTH.length]!, 0.75))
      g.addColorStop(1, rgba(col, 0.2))
      ctx.fillStyle = g
      ctx.fillRect(-rx * bulge, y - bandH, rx * bulge * 2, bandH * 2)
    }
    // Soft bevel edge (no stair albedo stripes)
    const edge = ctx.createLinearGradient(0, y - bandH, 0, y - bandH * 0.2)
    edge.addColorStop(0, 'rgba(255,240,210,0.18)')
    edge.addColorStop(1, 'rgba(255,240,210,0)')
    ctx.fillStyle = edge
    ctx.fillRect(-rx * bulge, y - bandH, rx * bulge * 2, bandH * 0.45)
    ctx.restore()
  }
}

function drawCliffFace(
  ctx: CanvasRenderingContext2D,
  ptsTop: { x: number; y: number }[],
  drop: number,
  artReady: boolean,
  rock: HTMLImageElement | null,
  shade: number,
): void {
  if (ptsTop.length < 2 || drop < MIN_CLIFF_DROP) return
  const shelves = drop > HEIGHT_SCALE * 0.35 ? 3 : drop > HEIGHT_SCALE * 0.18 ? 2 : 1
  for (let s = 0; s < shelves; s++) {
    const t0 = s / shelves
    const t1 = (s + 1) / shelves
    const y0 = drop * t0
    const y1 = drop * t1
    // Slight outward bevel rounding
    const out = Math.sin(Math.PI * (t0 + t1) * 0.5) * 1.2
    ctx.beginPath()
    ctx.moveTo(ptsTop[0]!.x - out, ptsTop[0]!.y + y0)
    for (let i = 1; i < ptsTop.length; i++) {
      ctx.lineTo(ptsTop[i]!.x + out, ptsTop[i]!.y + y0)
    }
    for (let i = ptsTop.length - 1; i >= 0; i--) {
      ctx.lineTo(ptsTop[i]!.x + out, ptsTop[i]!.y + y1)
    }
    ctx.closePath()
    if (artReady && rock && rock.complete && rock.naturalWidth > 0) {
      ctx.save()
      ctx.clip()
      const minX = Math.min(...ptsTop.map((p) => p.x)) - 4
      const maxX = Math.max(...ptsTop.map((p) => p.x)) + 4
      const minY = Math.min(...ptsTop.map((p) => p.y)) + y0
      const srcY = (s / Math.max(1, shelves)) * (rock.naturalHeight * 0.7)
      ctx.globalAlpha = 0.88
      ctx.drawImage(
        rock,
        0,
        srcY,
        rock.naturalWidth,
        rock.naturalHeight * 0.35,
        minX,
        minY,
        maxX - minX,
        y1 - y0 + 2,
      )
      ctx.globalAlpha = 1
      // Wrap lighting multiply
      ctx.fillStyle = `rgba(40,28,18,${0.12 + (1 - shade) * 0.2})`
      ctx.fill()
      ctx.restore()
    } else {
      const col = EARTH[s % EARTH.length]!
      ctx.fillStyle = shadeRgb(col, shade * 0.9)
      ctx.fill()
    }
  }
}

function streamPolyline(
  size: number,
  seed: number,
  steps = 56,
): { gx: number; gy: number }[] {
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const pts: { gx: number; gy: number }[] = []
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    // Along diagonal with wobble matching streamDist centerline
    const along = (u - 0.5) * 1.7
    const nx = along
    const ny = along
    // Invert streamDist wobble approximately
    const wobble =
      (hash2(Math.floor(along * 40), 2, seed + 91) - 0.5) * 0.55 +
      (hash2(Math.floor(along * 80), 5, seed + 203) - 0.5) * 0.22
    const cross = wobble
    const gx = cx + (nx + cross) * cx * 0.9
    const gy = cy + (ny - cross) * cy * 0.9
    const r =
      Math.hypot(gx - cx, gy - cy) / (Math.min(cx, cy) * 0.9)
    if (r > 0.92) continue
    pts.push({ gx, gy })
  }
  return pts
}

function drawLivingStream(
  ctx: CanvasRenderingContext2D,
  hf: Heightfield,
  cx: number,
  cy: number,
  now: number,
  art: ReturnType<typeof ensureArt>,
): void {
  const seed = hf.seed
  const size = hf.size
  const poly = streamPolyline(size, seed)
  if (poly.length < 3) return

  // Soft channel ribbon (continuous — not blue diamonds)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Wet lip / shore foam band under water
  ctx.beginPath()
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!
    const ht = sampleHeight(hf, p.gx, p.gy)
    const iso = gridToIso(p.gx - cx, p.gy - cy, Math.max(ht, WATER_LEVEL * 0.7))
    if (i === 0) ctx.moveTo(iso.x, iso.y)
    else ctx.lineTo(iso.x, iso.y)
  }
  ctx.strokeStyle = rgba(COL_SHORE, 0.55)
  ctx.lineWidth = CELL * 1.55
  ctx.stroke()

  // Mid + deep water as layered strokes
  ctx.beginPath()
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!
    const ht = sampleHeight(hf, p.gx, p.gy)
    const iso = gridToIso(p.gx - cx, p.gy - cy, Math.max(ht * 0.92, WATER_LEVEL * 0.5))
    if (i === 0) ctx.moveTo(iso.x, iso.y)
    else ctx.lineTo(iso.x, iso.y)
  }
  ctx.strokeStyle = rgba(WATER_SHALLOW, 0.75)
  ctx.lineWidth = CELL * 1.15
  ctx.stroke()
  ctx.strokeStyle = rgba(WATER_MID, 0.9)
  ctx.lineWidth = CELL * 0.72
  ctx.stroke()
  ctx.strokeStyle = rgba(WATER_DEEP, 0.95)
  ctx.lineWidth = CELL * 0.38
  ctx.stroke()

  // Shore stones along banks
  if (art.ready && art.shoreStones.complete && art.shoreStones.naturalWidth > 0) {
    const sw = art.shoreStones.naturalWidth / 6
    const sh = art.shoreStones.naturalHeight
    for (let i = 2; i < poly.length - 2; i += 2) {
      const p = poly[i]!
      const ht = sampleHeight(hf, p.gx, p.gy)
      const iso = gridToIso(p.gx - cx, p.gy - cy, ht)
      const side = i % 4 === 0 ? 1 : -1
      const ox = side * CELL * 0.55
      const tile = Math.floor(hash2(i, 3, seed) * 6) % 6
      const sc = 0.7 + hash2(i, 7, seed) * 0.45
      ctx.drawImage(
        art.shoreStones,
        tile * sw,
        0,
        sw,
        sh,
        iso.x + ox - (sw * sc) / 2,
        iso.y - sh * sc * 0.35,
        sw * sc,
        sh * sc,
      )
    }
  }

  // Sparkle frames — redrawn every frame (never in moss cache)
  const sparkSrc =
    art.ready && art.streamSparkles.complete && art.streamSparkles.naturalWidth > 0
      ? art.streamSparkles
      : art.ready && art.waterSparkle.complete && art.waterSparkle.naturalWidth > 0
        ? art.waterSparkle
        : null
  if (sparkSrc) {
    const frame = Math.floor(now / 180) % 3
    const fw = sparkSrc === art.waterSparkle ? sparkSrc.naturalWidth / 3 : 48
    const fh = sparkSrc === art.waterSparkle ? sparkSrc.naturalHeight : 40
    const cols = sparkSrc === art.waterSparkle ? 3 : 8
    for (let i = 1; i < poly.length - 1; i += 3) {
      const phase = (now * 0.001 + i * 0.37) % 1
      if (phase > 0.55) continue
      const p = poly[i]!
      const ht = sampleHeight(hf, p.gx, p.gy)
      const iso = gridToIso(p.gx - cx, p.gy - cy, Math.max(ht * 0.9, WATER_LEVEL * 0.4))
      const col = (frame + i) % cols
      const sx = sparkSrc === art.waterSparkle ? col * fw : (col % 8) * fw + 8
      const sy = sparkSrc === art.waterSparkle ? 0 : 20 + ((i + frame) % 4) * 50
      ctx.globalAlpha = 0.55 + phase * 0.4
      ctx.drawImage(
        sparkSrc,
        sx,
        sy,
        fw,
        fh,
        iso.x - fw * 0.35,
        iso.y - fh * 0.35,
        fw * 0.7,
        fh * 0.55,
      )
      ctx.globalAlpha = 1
    }
  } else {
    // Soft glints without sprites
    for (let i = 1; i < poly.length - 1; i += 4) {
      const phase = (now * 0.002 + i * 0.4) % (Math.PI * 2)
      const spark = 0.5 + Math.sin(phase) * 0.5
      if (spark < 0.65) continue
      const p = poly[i]!
      const ht = sampleHeight(hf, p.gx, p.gy)
      const iso = gridToIso(p.gx - cx, p.gy - cy, ht * 0.9)
      ctx.fillStyle = `rgba(255,255,248,${0.25 + spark * 0.35})`
      ctx.beginPath()
      ctx.ellipse(iso.x, iso.y, 3.5, 1.6, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  p: Prop,
  hf: Heightfield,
  cx: number,
  cy: number,
  art: ReturnType<typeof ensureArt>,
): void {
  const ht = sampleHeight(hf, p.gx, p.gy)
  const iso = gridToIso(p.gx - cx, p.gy - cy, ht)
  // Contact shadow
  ctx.fillStyle = 'rgba(40,28,20,0.22)'
  ctx.beginPath()
  ctx.ellipse(iso.x, iso.y + 2, CELL * 0.55 * p.scale, CELL * 0.22 * p.scale, 0, 0, Math.PI * 2)
  ctx.fill()

  const drawImg = (
    img: HTMLImageElement,
    w: number,
    h: number,
    anchorY = 0.92,
  ) => {
    if (!img.complete || img.naturalWidth <= 0) return false
    ctx.drawImage(img, iso.x - w / 2, iso.y - h * anchorY, w, h)
    return true
  }

  if (p.kind === 'pine') {
    const h = CELL * 3.4 * p.scale
    const w = h * 0.55
    if (!art.ready || !drawImg(art.pine, w, h)) {
      ctx.fillStyle = '#3a6a3e'
      ctx.beginPath()
      ctx.moveTo(iso.x, iso.y - h)
      ctx.lineTo(iso.x + w * 0.5, iso.y - h * 0.15)
      ctx.lineTo(iso.x - w * 0.5, iso.y - h * 0.15)
      ctx.closePath()
      ctx.fill()
    }
  } else if (p.kind === 'cabin') {
    const h = CELL * 2.8 * p.scale
    const w = h * 1.15
    if (!art.ready || !drawImg(art.cabin, w, h, 0.88)) {
      ctx.fillStyle = '#6a4a32'
      ctx.fillRect(iso.x - w * 0.4, iso.y - h * 0.55, w * 0.8, h * 0.5)
      ctx.fillStyle = '#4a8048'
      ctx.beginPath()
      ctx.moveTo(iso.x, iso.y - h)
      ctx.lineTo(iso.x + w * 0.5, iso.y - h * 0.5)
      ctx.lineTo(iso.x - w * 0.5, iso.y - h * 0.5)
      ctx.closePath()
      ctx.fill()
    }
  } else {
    const h = CELL * 1.55 * p.scale
    const w = h * 0.7
    const body =
      p.kind === 'gnomeR'
        ? art.ready && art.gnomeRed.complete
          ? art.gnomeRed
          : null
        : art.ready && art.gnomeBlue.complete
          ? art.gnomeBlue
          : null
    const hat =
      p.kind === 'gnomeR'
        ? art.ready && art.hatWren.complete
          ? art.hatWren
          : null
        : art.ready && art.hatBram.complete
          ? art.hatBram
          : null
    if (body && drawImg(body, w, h, 0.95)) {
      // optional hat overlay for Ref1 recognition
      if (hat) {
        const hh = h * 0.55
        const hw = hh * 0.95
        ctx.drawImage(hat, iso.x - hw / 2, iso.y - h * 0.98 - hh * 0.15, hw, hh)
      }
    } else if (hat && drawImg(hat, w * 1.1, h * 0.85, 0.9)) {
      // hat alone as recognition stand-in
    } else {
      ctx.fillStyle = p.kind === 'gnomeR' ? '#c05050' : '#5080c8'
      ctx.beginPath()
      ctx.moveTo(iso.x, iso.y - h)
      ctx.lineTo(iso.x + w * 0.35, iso.y - h * 0.45)
      ctx.lineTo(iso.x - w * 0.35, iso.y - h * 0.45)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#f0e8e0'
      ctx.beginPath()
      ctx.ellipse(iso.x, iso.y - h * 0.28, w * 0.28, h * 0.22, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

export function renderIsle(ctx: CanvasRenderingContext2D, opts: RenderIsleOpts): void {
  const { width: w, height: h, camera, hf } = opts
  if (w <= 0 || h <= 0) return

  const now = opts.nowMs ?? 0
  const art = ensureArt()
  const size = hf.size
  const seed = hf.seed
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const sig = heightsSig(hf)
  const light = ensureVertexLight(hf)
  const nv = size + 1

  // Sky
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
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Soft footprint falloff (not hard disc)
  {
    const footR = size * CELL * 0.48
    const footY = size * CELL * 0.18
    const shadow = ctx.createRadialGradient(0, footY, footR * 0.15, 0, footY, footR)
    shadow.addColorStop(0, 'rgba(48, 34, 26, 0.28)')
    shadow.addColorStop(0.55, 'rgba(48, 34, 26, 0.1)')
    shadow.addColorStop(1, 'rgba(48, 34, 26, 0)')
    ctx.fillStyle = shadow
    ctx.beginPath()
    ctx.ellipse(0, footY, footR, footR * 0.32, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Avg height for loaf placement
  let avgH = 0
  let nLand = 0
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const ht = getHeight(hf, x, y)
      if (ht > 0.05) {
        avgH += ht
        nLand++
      }
    }
  }
  avgH = nLand ? avgH / nLand : 0.45
  const topY = gridToIso(0, 0, avgH * 0.5).y + size * CELL * 0.22

  // Cliff loaf — 2–4 rounded beveled shelves (before tops)
  drawLoafShelves(
    ctx,
    size,
    topY,
    art.ready,
    art.ready ? art.rockStrata : null,
  )

  const mossStamp = ensureMossStamp(
    art.ready,
    art.ready ? art.mossTile : null,
    art.ready ? art.mossAtlas : null,
    sig,
    seed,
  )

  // LOD: coarse step when zoomed out
  const lod = camera.zoom < 0.35 ? 2 : 1
  const inflate = TOP_INFLATE / CELL

  // Collect land cells + props for depth sort
  type DrawItem =
    | { kind: 'cell'; x: number; y: number; depth: number }
    | { kind: 'prop'; prop: Prop; depth: number }

  const items: DrawItem[] = []
  for (let y = 0; y < size; y += lod) {
    for (let x = 0; x < size; x += lod) {
      let ht = 0
      if (lod === 1) ht = getHeight(hf, x, y)
      else {
        // Max of 2×2
        ht = Math.max(
          getHeight(hf, x, y),
          getHeight(hf, Math.min(size - 1, x + 1), y),
          getHeight(hf, x, Math.min(size - 1, y + 1)),
          getHeight(hf, Math.min(size - 1, x + 1), Math.min(size - 1, y + 1)),
        )
      }
      if (ht <= 0.001) continue
      items.push({ kind: 'cell', x, y, depth: x + y })
    }
  }
  for (const prop of storyProps(hf)) {
    items.push({ kind: 'prop', prop, depth: prop.depth })
  }
  items.sort((a, b) => a.depth - b.depth)

  // Materials + mesh FIRST pass (props interleaved by re-bucketed depth)
  for (const item of items) {
    if (item.kind === 'prop') {
      drawProp(ctx, item.prop, hf, cx, cy, art)
      continue
    }
    const x = item.x
    const y = item.y
    const step = lod
    const gx0 = x - cx - 0.5 * step
    const gx1 = x - cx + 0.5 * step
    const gy0 = y - cy - 0.5 * step
    const gy1 = y - cy + 0.5 * step

    const hTL = sampleHeight(hf, x - 0.5 * step, y - 0.5 * step)
    const hTR = sampleHeight(hf, x + 0.5 * step, y - 0.5 * step)
    const hBR = sampleHeight(hf, x + 0.5 * step, y + 0.5 * step)
    const hBL = sampleHeight(hf, x - 0.5 * step, y + 0.5 * step)
    const ht = getHeight(hf, x, y)
    const hS = getHeight(hf, x, Math.min(size - 1, y + step))
    const hE = getHeight(hf, Math.min(size - 1, x + step), y)

    const L =
      (vertL(light, nv, x, y) +
        vertL(light, nv, x + step, y) +
        vertL(light, nv, x, y + step) +
        vertL(light, nv, x + step, y + step)) *
      0.25

    const wet =
      (wetnessAt(hf, x, y, seed) +
        wetnessAt(hf, x + 0.5, y + 0.5, seed)) *
      0.5

    // Cliff faces on height breaks
    const dropS = Math.max(0, ht - hS) * HEIGHT_SCALE
    const dropE = Math.max(0, ht - hE) * HEIGHT_SCALE
    const blC = gridToIso(gx0, gy1, hBL)
    const brC = gridToIso(gx1, gy1, hBR)
    const trC = gridToIso(gx1, gy0, hTR)

    if (dropS > MIN_CLIFF_DROP && wet < 0.7) {
      drawCliffFace(
        ctx,
        [blC, brC],
        dropS,
        art.ready,
        art.ready ? art.rockStrata : null,
        L * 0.92,
      )
    }
    if (dropE > MIN_CLIFF_DROP && wet < 0.7) {
      drawCliffFace(
        ctx,
        [brC, trC],
        dropE,
        art.ready,
        art.ready ? art.rockStrata : null,
        L * 1.02,
      )
    }

    // Skip top fill for deep stream center — ribbon draws water
    if (wet > 0.72) continue

    const tl = gridToIso(gx0 - inflate, gy0 - inflate, hTL)
    const tr = gridToIso(gx1 + inflate, gy0 - inflate, hTR)
    const br = gridToIso(gx1 + inflate, gy1 + inflate, hBR)
    const bl = gridToIso(gx0 - inflate, gy1 + inflate, hBL)

    const baseCol = mossMaterial(hf, x, y, seed)
    const col =
      wet > 0.25 ? lerp3(baseCol, COL_DAMP, (wet - 0.25) * 1.1) : baseCol

    // Soft top — fill then moss stamp
    ctx.beginPath()
    ctx.moveTo(tl.x, tl.y)
    ctx.lineTo(tr.x, tr.y)
    ctx.lineTo(br.x, br.y)
    ctx.lineTo(bl.x, bl.y)
    ctx.closePath()
    ctx.fillStyle = shadeRgb(col, L)
    ctx.fill()

    // Moss atlas stamp (wrap lighting via alpha)
    ctx.save()
    ctx.clip()
    const tile = Math.floor(hash2(x, y, seed) * 4) % 4
    const midX = (tl.x + tr.x + br.x + bl.x) * 0.25
    const midY = (tl.y + tr.y + br.y + bl.y) * 0.25
    const stampS = CELL * 1.35 * step
    ctx.globalAlpha = 0.42 + L * 0.25
    ctx.drawImage(
      mossStamp,
      tile * 64,
      0,
      64,
      64,
      midX - stampS * 0.5,
      midY - stampS * 0.35,
      stampS,
      stampS * 0.72,
    )
    ctx.globalAlpha = 1
    ctx.restore()
  }

  // Living stream overlay (every frame — not moss-cached)
  drawLivingStream(ctx, hf, cx, cy, now, art)

  // Soft dome light wrap
  {
    const moundRx = size * CELL * 0.42
    const moundRy = size * CELL * 0.22
    const domeY = gridToIso(0, 0, avgH).y
    const dome = ctx.createRadialGradient(
      moundRx * 0.15,
      domeY - avgH * HEIGHT_SCALE * 0.35,
      0,
      0,
      domeY,
      moundRx,
    )
    dome.addColorStop(0, 'rgba(255, 248, 215, 0.16)')
    dome.addColorStop(0.45, 'rgba(255, 248, 215, 0.04)')
    dome.addColorStop(0.8, 'rgba(40, 60, 40, 0.05)')
    dome.addColorStop(1, 'rgba(28, 44, 30, 0.14)')
    ctx.fillStyle = dome
    ctx.beginPath()
    ctx.ellipse(0, domeY, moundRx, moundRy, 0, 0, Math.PI * 2)
    ctx.fill()
  }

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
  return getHeight(hf, x, y)
}
