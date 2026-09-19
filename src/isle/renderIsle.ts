/**
 * Soft isometric render — Canvas 2D only.
 * Slice 1e.1: height-true soft-iso mesh (atlas decorates; no ImageData pancake,
 * no stacked painted ellipse loaf). Living stream, moss blend, story props.
 */

import type { Heightfield } from '../world/isleGrid'
import {
  getHeight,
  sampleHeight,
  streamCenterline,
  streamDist,
  WATER_LEVEL,
} from '../world/isleGrid'
import type { CameraState } from '../world/fit'
import { ensureArt } from './artAtlas'

/** Tuned so relief + Raise hill poke read at Fit (~65–75% stage). */
export const CELL = 16
export const HEIGHT_SCALE = 138
/** Portrait squash — narrows iso X so Fit can hit 65–75% height. */
const ISO_X = CELL * 0.7
const ISO_Y = CELL * 0.5
const TOP_INFLATE = 0.65
const MIN_CLIFF_DROP = 5.5
const STREAM_HALF = 2.35

export function isleWorldSize(gridSize: number): { w: number; h: number } {
  const footX = gridSize * ISO_X * 0.8
  const footY = gridSize * ISO_Y * 0.8
  return {
    w: footX,
    h: footY + HEIGHT_SCALE * 0.9 + CELL * 2.5,
  }
}

function gridToIso(gx: number, gy: number, h: number): { x: number; y: number } {
  return {
    x: (gx - gy) * ISO_X,
    y: (gx + gy) * ISO_Y - h * HEIGHT_SCALE,
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
  const s = Math.max(0.7, Math.min(1.14, shade))
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
const COL_WARM: [number, number, number] = [0x94, 0xac, 0x66]
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
  depth: number
}

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
      let L = 0.86 + hC * 0.16 + (hN - hS) * 0.11 + (hW - hE) * 0.08
      const crest = Math.max(0, hC - (hN + hS + hE + hW) * 0.25)
      L += crest * 0.14
      const valley = Math.max(0, (hN + hS + hE + hW) * 0.25 - hC)
      L -= valley * 0.22
      raw[y * nv + x] = L
    }
  }
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
      const w = dx === 0 && dy === 0 ? 2.4 : 1
      const ht = getHeight(hf, x + dx, y + dy)
      if (ht <= 0.001) continue
      const n = hash2(x + dx, y + dy, seed)
      let col: [number, number, number]
      if (ht < 0.28) col = lerp3(COL_DEEP, COL_MOSS, ht / 0.28)
      else if (ht < 0.58) col = lerp3(COL_MOSS, COL_LIT, (ht - 0.28) / 0.3)
      else col = lerp3(COL_LIT, COL_WARM, (ht - 0.58) / 0.42)
      if (n > 0.62) col = lerp3(col, COL_LIT, 0.38)
      if (n < 0.3) col = lerp3(col, COL_DEEP, 0.42)
      if (n > 0.78) col = lerp3(col, COL_WARM, 0.28)
      const sd = streamDist(x + dx, y + dy, hf.size, seed)
      if (sd < STREAM_HALF + 1.6) {
        col = lerp3(col, COL_DAMP, Math.max(0, 1 - sd / (STREAM_HALF + 1.6)) * 0.55)
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
  return Math.max(stream, bowl)
}

/**
 * Rounded beveled cliff face from height-true mesh drops.
 * Rock-strata decorates the face — not a painted ellipse stack.
 */
function drawCliffFace(
  ctx: CanvasRenderingContext2D,
  ptsTop: { x: number; y: number }[],
  drop: number,
  artReady: boolean,
  rock: HTMLImageElement | null,
  shade: number,
): void {
  if (ptsTop.length < 2 || drop < MIN_CLIFF_DROP) return
  // Soft single bevel face (rounded lip) — not multi-shelf stair stripes
  const out = Math.min(2.2, drop * 0.035)
  ctx.beginPath()
  ctx.moveTo(ptsTop[0]!.x, ptsTop[0]!.y)
  for (let i = 1; i < ptsTop.length; i++) ctx.lineTo(ptsTop[i]!.x, ptsTop[i]!.y)
  for (let i = ptsTop.length - 1; i >= 0; i--) {
    ctx.lineTo(ptsTop[i]!.x + out, ptsTop[i]!.y + drop)
  }
  ctx.closePath()
  if (artReady && rock && rock.complete && rock.naturalWidth > 0) {
    ctx.save()
    ctx.clip()
    const minX = Math.min(...ptsTop.map((p) => p.x)) - 4
    const maxX = Math.max(...ptsTop.map((p) => p.x)) + 4
    const minY = Math.min(...ptsTop.map((p) => p.y))
    ctx.globalAlpha = 0.88
    ctx.drawImage(
      rock,
      0,
      rock.naturalHeight * 0.15,
      rock.naturalWidth,
      rock.naturalHeight * 0.5,
      minX,
      minY,
      maxX - minX,
      drop + 4,
    )
    ctx.globalAlpha = 1
    ctx.fillStyle = `rgba(40,28,18,${0.12 + (1 - shade) * 0.2})`
    ctx.fill()
    const hi = ctx.createLinearGradient(0, minY, 0, minY + drop * 0.4)
    hi.addColorStop(0, 'rgba(255,236,200,0.18)')
    hi.addColorStop(1, 'rgba(255,236,200,0)')
    ctx.fillStyle = hi
    ctx.fill()
    ctx.restore()
  } else {
    ctx.fillStyle = shadeRgb(EARTH[1]!, shade * 0.92)
    ctx.fill()
  }
}

/** Soft meandering channel from smoothed centerline — never zigzag cyan knife. */
function drawLivingStream(
  ctx: CanvasRenderingContext2D,
  hf: Heightfield,
  cx: number,
  cy: number,
  now: number,
  art: ReturnType<typeof ensureArt>,
): void {
  const seed = hf.seed
  const poly = streamCenterline(hf.size, seed, 80)
  if (poly.length < 4) return

  const isoPts: { x: number; y: number; nx: number; ny: number; half: number }[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!
    const ht = sampleHeight(hf, p.gx, p.gy)
    if (ht <= 0.001) continue
    const u = i / Math.max(1, poly.length - 1)
    const half = CELL * (0.42 + Math.sin(u * Math.PI) * 0.38)
    const iso = gridToIso(
      p.gx - cx,
      p.gy - cy,
      Math.max(ht * 0.94, WATER_LEVEL * 0.55),
    )
    // Screen-space tangent → normal for soft ribbon
    const prev = poly[Math.max(0, i - 1)]!
    const next = poly[Math.min(poly.length - 1, i + 1)]!
    const i0 = gridToIso(prev.gx - cx, prev.gy - cy, sampleHeight(hf, prev.gx, prev.gy))
    const i1 = gridToIso(next.gx - cx, next.gy - cy, sampleHeight(hf, next.gx, next.gy))
    let tx = i1.x - i0.x
    let ty = i1.y - i0.y
    const len = Math.hypot(tx, ty) || 1
    tx /= len
    ty /= len
    isoPts.push({ x: iso.x, y: iso.y, nx: -ty, ny: tx, half })
  }
  if (isoPts.length < 4) return

  const fillRibbon = (scale: number, color: string) => {
    ctx.beginPath()
    const first = isoPts[0]!
    ctx.moveTo(first.x + first.nx * first.half * scale, first.y + first.ny * first.half * scale)
    for (let i = 1; i < isoPts.length; i++) {
      const p = isoPts[i]!
      ctx.lineTo(p.x + p.nx * p.half * scale, p.y + p.ny * p.half * scale)
    }
    for (let i = isoPts.length - 1; i >= 0; i--) {
      const p = isoPts[i]!
      ctx.lineTo(p.x - p.nx * p.half * scale, p.y - p.ny * p.half * scale)
    }
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
  }

  // Wet shore lip → shallow → mid → dark core (soft channel, not stacked strokes)
  fillRibbon(1.55, rgba(COL_SHORE, 0.42))
  fillRibbon(1.15, rgba(WATER_SHALLOW, 0.7))
  fillRibbon(0.78, rgba(WATER_MID, 0.88))
  fillRibbon(0.38, rgba(WATER_DEEP, 0.92))

  // Shore stones along banks
  if (art.ready && art.shoreStones.complete && art.shoreStones.naturalWidth > 0) {
    const sw = art.shoreStones.naturalWidth / 6
    const sh = art.shoreStones.naturalHeight
    for (let i = 3; i < poly.length - 3; i += 3) {
      const p = poly[i]!
      const ht = sampleHeight(hf, p.gx, p.gy)
      if (ht < 0.05) continue
      const iso = gridToIso(p.gx - cx, p.gy - cy, ht)
      const side = i % 6 < 3 ? 1 : -1
      const ox = side * CELL * 0.55
      const tile = Math.floor(hash2(i, 3, seed) * 6) % 6
      const sc = 0.85 + hash2(i, 7, seed) * 0.4
      ctx.globalAlpha = 0.8
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
      ctx.globalAlpha = 1
    }
  }

  // Soft sparkles
  const sparkSrc =
    art.ready && art.streamSparkles.complete && art.streamSparkles.naturalWidth > 0
      ? art.streamSparkles
      : art.ready && art.waterSparkle.complete && art.waterSparkle.naturalWidth > 0
        ? art.waterSparkle
        : null
  if (sparkSrc) {
    const frame = Math.floor(now / 200) % 3
    const fw = sparkSrc === art.waterSparkle ? sparkSrc.naturalWidth / 3 : 40
    const fh = sparkSrc === art.waterSparkle ? sparkSrc.naturalHeight : 32
    const cols = sparkSrc === art.waterSparkle ? 3 : 8
    for (let i = 2; i < isoPts.length - 2; i += 5) {
      const phase = (now * 0.001 + i * 0.37) % 1
      if (phase > 0.48) continue
      const p = isoPts[i]!
      const col = (frame + i) % cols
      const sx = sparkSrc === art.waterSparkle ? col * fw : (col % 8) * fw + 8
      const sy = sparkSrc === art.waterSparkle ? 0 : 20 + ((i + frame) % 4) * 50
      ctx.globalAlpha = 0.35 + phase * 0.3
      ctx.drawImage(
        sparkSrc,
        sx,
        sy,
        fw,
        fh,
        p.x - fw * 0.22,
        p.y - fh * 0.22,
        fw * 0.45,
        fh * 0.35,
      )
      ctx.globalAlpha = 1
    }
  }
}

function storyProps(hf: Heightfield): Prop[] {
  const seed = hf.seed
  const size = hf.size
  const cx = (size - 1) * 0.5
  const cy = (size - 1) * 0.5
  const candidates: { gx: number; gy: number; kind: PropKind; scale: number }[] = [
    { gx: cx - 7, gy: cy - 5, kind: 'pine', scale: 1.15 },
    { gx: cx + 8, gy: cy - 6, kind: 'pine', scale: 1.0 },
    { gx: cx - 9, gy: cy + 4, kind: 'pine', scale: 0.95 },
    { gx: cx + 5, gy: cy + 7, kind: 'pine', scale: 1.08 },
    { gx: cx + 10, gy: cy + 2, kind: 'pine', scale: 0.88 },
    { gx: cx - 3, gy: cy + 3, kind: 'cabin', scale: 1.15 },
    { gx: cx + 2.5, gy: cy + 5.5, kind: 'gnomeR', scale: 1.2 },
    { gx: cx + 4.2, gy: cy + 6.4, kind: 'gnomeB', scale: 1.15 },
  ]
  const out: Prop[] = []
  for (const c of candidates) {
    const jx = (hash2(Math.floor(c.gx), Math.floor(c.gy), seed + 3) - 0.5) * 0.9
    const jy = (hash2(Math.floor(c.gx), Math.floor(c.gy), seed + 9) - 0.5) * 0.9
    const gx = c.gx + jx
    const gy = c.gy + jy
    const ht = sampleHeight(hf, gx, gy)
    if (ht < 0.2) continue
    if (wetnessAt(hf, gx, gy, seed) > 0.5 && c.kind !== 'gnomeR' && c.kind !== 'gnomeB') {
      continue
    }
    const depth = gx + gy + ht * 2.8 + (c.kind === 'cabin' ? 1.4 : 0.5)
    out.push({ gx, gy, kind: c.kind, scale: c.scale, depth })
  }
  return out
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
  ctx.fillStyle = 'rgba(40,28,20,0.25)'
  ctx.beginPath()
  ctx.ellipse(
    iso.x,
    iso.y + 3,
    CELL * 0.7 * p.scale,
    CELL * 0.28 * p.scale,
    0,
    0,
    Math.PI * 2,
  )
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

  // Ref1-scale recognition — props must read at Fit glance
  if (p.kind === 'pine') {
    const h = CELL * 7.2 * p.scale
    const w = h * 0.58
    if (!art.ready || !drawImg(art.pine, w, h)) {
      ctx.fillStyle = '#3a6a3e'
      ctx.beginPath()
      ctx.moveTo(iso.x, iso.y - h)
      ctx.lineTo(iso.x + w * 0.5, iso.y - h * 0.12)
      ctx.lineTo(iso.x - w * 0.5, iso.y - h * 0.12)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#2a4a2e'
      ctx.fillRect(iso.x - w * 0.06, iso.y - h * 0.15, w * 0.12, h * 0.18)
    }
  } else if (p.kind === 'cabin') {
    const h = CELL * 5.8 * p.scale
    const w = h * 1.2
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
    const h = CELL * 3.4 * p.scale
    const w = h * 0.72
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
      if (hat) {
        const hh = h * 0.6
        const hw = hh * 0.95
        ctx.drawImage(hat, iso.x - hw / 2, iso.y - h * 0.98 - hh * 0.12, hw, hh)
      }
    } else if (hat && drawImg(hat, w * 1.15, h * 0.9, 0.9)) {
      // hat alone
    } else {
      ctx.fillStyle = p.kind === 'gnomeR' ? '#c05050' : '#5080c8'
      ctx.beginPath()
      ctx.moveTo(iso.x, iso.y - h)
      ctx.lineTo(iso.x + w * 0.38, iso.y - h * 0.4)
      ctx.lineTo(iso.x - w * 0.38, iso.y - h * 0.4)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#f0e8e0'
      ctx.beginPath()
      ctx.ellipse(iso.x, iso.y - h * 0.28, w * 0.3, h * 0.22, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/**
 * Decorate a mesh quad with continuous moss-tile UVs (not circular stamps).
 */
function paintMossDecor(
  ctx: CanvasRenderingContext2D,
  mossTile: HTMLImageElement | null,
  mossAtlas: HTMLImageElement | null,
  midX: number,
  midY: number,
  cellSpan: number,
  x: number,
  y: number,
  seed: number,
  L: number,
): void {
  const src =
    mossTile && mossTile.complete && mossTile.naturalWidth > 0
      ? mossTile
      : mossAtlas && mossAtlas.complete && mossAtlas.naturalWidth > 0
        ? mossAtlas
        : null
  if (!src) return

  // Continuous UV from grid — overlapping soft patches, not one stamp/cell
  const tw = src === mossAtlas ? 64 : src.naturalWidth
  const th = src === mossAtlas ? 64 : src.naturalHeight
  const tileIdx = Math.floor(hash2(x >> 1, y >> 1, seed) * 4) % 4
  const sx = src === mossAtlas ? tileIdx * 64 : ((x * 37 + seed) % Math.max(1, tw - 48))
  const sy = src === mossAtlas ? 0 : ((y * 29 + seed * 3) % Math.max(1, th - 48))
  const sw = src === mossAtlas ? 64 : Math.min(64, tw - sx)
  const sh = src === mossAtlas ? 64 : Math.min(64, th - sy)

  // Subtle continuous grain only — moss-tile has circular stamps; keep alpha low
  // and crop inset so stamp silhouettes don't pegboard the mesh.
  const inset = src === mossAtlas ? 0 : 18
  const csx = Math.min(sx + inset, Math.max(0, tw - sw))
  const csy = Math.min(sy + inset, Math.max(0, th - sh))
  const csw = Math.max(8, sw - inset * 2)
  const csh = Math.max(8, sh - inset * 2)
  ctx.save()
  ctx.globalAlpha = 0.1 + L * 0.08
  ctx.globalCompositeOperation = 'soft-light'
  const dw = cellSpan * 2.2
  const dh = cellSpan * 1.35
  ctx.drawImage(src, csx, csy, csw, csh, midX - dw * 0.5, midY - dh * 0.4, dw, dh)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.restore()
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
  const light = ensureVertexLight(hf)
  const nv = size + 1

  // Soft paper sky
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

  // Soft footprint shadow (floating isle — not a painted loaf stack)
  {
    const footR = size * CELL * 0.46
    const footY = size * CELL * 0.2
    const shadow = ctx.createRadialGradient(0, footY, footR * 0.12, 0, footY, footR)
    shadow.addColorStop(0, 'rgba(48, 34, 26, 0.3)')
    shadow.addColorStop(0.55, 'rgba(48, 34, 26, 0.1)')
    shadow.addColorStop(1, 'rgba(48, 34, 26, 0)')
    ctx.fillStyle = shadow
    ctx.beginPath()
    ctx.ellipse(0, footY, footR, footR * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()

    // Single soft rocky undercap (floating isle) — NOT stacked shelf ellipses
    const loafY = footY - CELL * 0.8
    const loaf = ctx.createLinearGradient(-footR, loafY, footR, loafY)
    loaf.addColorStop(0, 'rgba(110, 76, 54, 0.55)')
    loaf.addColorStop(0.45, 'rgba(138, 100, 72, 0.7)')
    loaf.addColorStop(1, 'rgba(90, 62, 44, 0.5)')
    ctx.fillStyle = loaf
    ctx.beginPath()
    ctx.ellipse(0, loafY, footR * 0.92, footR * 0.22, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  const lod = camera.zoom < 0.32 ? 2 : 1
  const inflate = TOP_INFLATE / CELL

  type DrawItem = { kind: 'cell'; x: number; y: number; depth: number }

  const items: DrawItem[] = []
  for (let y = 0; y < size; y += lod) {
    for (let x = 0; x < size; x += lod) {
      let ht = 0
      if (lod === 1) ht = getHeight(hf, x, y)
      else {
        ht = Math.max(
          getHeight(hf, x, y),
          getHeight(hf, Math.min(size - 1, x + 1), y),
          getHeight(hf, x, Math.min(size - 1, y + 1)),
          getHeight(hf, Math.min(size - 1, x + 1), Math.min(size - 1, y + 1)),
        )
      }
      if (ht <= 0.001) continue
      items.push({ kind: 'cell', x, y, depth: x + y + ht * 0.5 })
    }
  }
  const props = storyProps(hf)
  items.sort((a, b) => a.depth - b.depth)

  for (const item of items) {
    if (item.kind !== 'cell') continue
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
      (wetnessAt(hf, x, y, seed) + wetnessAt(hf, x + 0.5, y + 0.5, seed)) * 0.5

    // Height-true cliff faces — capped so rim never becomes needle spikes
    const rawS = Math.max(0, ht - hS) * HEIGHT_SCALE
    const rawE = Math.max(0, ht - hE) * HEIGHT_SCALE
    const MAX_FACE = HEIGHT_SCALE * 0.22
    const dropS = Math.min(rawS, MAX_FACE)
    const dropE = Math.min(rawE, MAX_FACE)

    const blC = gridToIso(gx0, gy1, hBL)
    const brC = gridToIso(gx1, gy1, hBR)
    const trC = gridToIso(gx1, gy0, hTR)

    // Interior / Raise hills only — void rim uses soft undercap (no needle spikes)
    if (hS > 0.001 && dropS > MIN_CLIFF_DROP && wet < 0.75) {
      drawCliffFace(
        ctx,
        [blC, brC],
        dropS,
        art.ready,
        art.ready ? art.rockStrata : null,
        L * 0.9,
      )
    }
    if (hE > 0.001 && dropE > MIN_CLIFF_DROP && wet < 0.75) {
      drawCliffFace(
        ctx,
        [brC, trC],
        dropE,
        art.ready,
        art.ready ? art.rockStrata : null,
        L * 1.02,
      )
    }

    // Leave deep stream channel for the living ribbon
    if (wet > 0.78) continue

    const tl = gridToIso(gx0 - inflate, gy0 - inflate, hTL)
    const tr = gridToIso(gx1 + inflate, gy0 - inflate, hTR)
    const br = gridToIso(gx1 + inflate, gy1 + inflate, hBR)
    const bl = gridToIso(gx0 - inflate, gy1 + inflate, hBL)

    const baseCol = mossMaterial(hf, x, y, seed)
    const col =
      wet > 0.22 ? lerp3(baseCol, COL_DAMP, (wet - 0.22) * 1.15) : baseCol

    // Soft-iso top — height-true quad (mesh first; atlas decorates)
    ctx.beginPath()
    ctx.moveTo(tl.x, tl.y)
    ctx.lineTo(tr.x, tr.y)
    ctx.lineTo(br.x, br.y)
    ctx.lineTo(bl.x, bl.y)
    ctx.closePath()

    // Corner-lit gradient when slopes differ (reads as sculpted volume)
    const Ltl = vertL(light, nv, x, y)
    const Lbr = vertL(light, nv, x + step, y + step)
    if (Math.abs(Ltl - Lbr) > 0.04) {
      const g = ctx.createLinearGradient(tl.x, tl.y, br.x, br.y)
      g.addColorStop(0, shadeRgb(col, Ltl))
      g.addColorStop(1, shadeRgb(col, Lbr))
      ctx.fillStyle = g
    } else {
      ctx.fillStyle = shadeRgb(col, L)
    }
    ctx.fill()

    // Atlas moss decor (multiply blend — continuous UVs, not circular stamps)
    ctx.save()
    ctx.clip()
    const midX = (tl.x + tr.x + br.x + bl.x) * 0.25
    const midY = (tl.y + tr.y + br.y + bl.y) * 0.25
    paintMossDecor(
      ctx,
      art.ready ? art.mossTile : null,
      art.ready ? art.mossAtlas : null,
      midX,
      midY,
      CELL * step,
      x,
      y,
      seed,
      L,
    )
    // Soft AO in valleys / bank lip
    if (L < 0.82 || wet > 0.2) {
      ctx.fillStyle = `rgba(28,44,30,${Math.max(0, 0.82 - L) * 0.35 + wet * 0.08})`
      ctx.fill()
    }
    ctx.restore()
  }

  // Living stream under props (every frame)
  drawLivingStream(ctx, hf, cx, cy, now, art)

  // Story props on top for Ref1 recognition
  props.sort((a, b) => a.depth - b.depth)
  for (const prop of props) {
    drawProp(ctx, prop, hf, cx, cy, art)
  }

  // Soft wrap light on mound volume (not a disc replacement)
  {
    let avgH = 0
    let nLand = 0
    for (let y = 0; y < size; y += 3) {
      for (let x = 0; x < size; x += 3) {
        const ht = getHeight(hf, x, y)
        if (ht > 0.05) {
          avgH += ht
          nLand++
        }
      }
    }
    avgH = nLand ? avgH / nLand : 0.45
    const moundRx = size * CELL * 0.4
    const moundRy = size * CELL * 0.2 + avgH * HEIGHT_SCALE * 0.15
    const domeY = -avgH * HEIGHT_SCALE * 0.15
    const dome = ctx.createRadialGradient(
      moundRx * 0.12,
      domeY - avgH * HEIGHT_SCALE * 0.25,
      0,
      0,
      domeY,
      moundRx,
    )
    dome.addColorStop(0, 'rgba(255, 248, 215, 0.12)')
    dome.addColorStop(0.5, 'rgba(255, 248, 215, 0.03)')
    dome.addColorStop(0.85, 'rgba(40, 60, 40, 0.04)')
    dome.addColorStop(1, 'rgba(28, 44, 30, 0.1)')
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

  // Inverse of: x=(gx-gy)*ISO_X, y=(gx+gy)*ISO_Y - h*HEIGHT_SCALE
  let gx = cx + (rx / ISO_X + ry / ISO_Y) * 0.5
  let gy = cy + (ry / ISO_Y - rx / ISO_X) * 0.5

  for (let i = 0; i < 3; i++) {
    const ht = sampleClamped(hf, gx, gy)
    const adjY = ry + ht * HEIGHT_SCALE
    gx = cx + (rx / ISO_X + adjY / ISO_Y) * 0.5
    gy = cy + (adjY / ISO_Y - rx / ISO_X) * 0.5
  }

  if (gx < -1 || gy < -1 || gx > size || gy > size) return null
  return { gx, gy }
}

function sampleClamped(hf: Heightfield, gx: number, gy: number): number {
  const x = Math.max(0, Math.min(hf.size - 1, Math.round(gx)))
  const y = Math.max(0, Math.min(hf.size - 1, Math.round(gy)))
  return getHeight(hf, x, y)
}
