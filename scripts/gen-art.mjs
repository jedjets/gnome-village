/**
 * Generate Slice 1e atlas PNGs (storybook miniature style toward Ref1).
 * Uses pngjs — run: node scripts/gen-art.mjs
 */
import { createRequire } from 'module'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
// Prefer local node_modules, fall back to /tmp/png-gen
let PNG
try {
  PNG = require('pngjs').PNG
} catch {
  PNG = require('/tmp/png-gen/node_modules/pngjs').PNG
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '../public/art')
mkdirSync(OUT, { recursive: true })

function make(w, h) {
  const png = new PNG({ width: w, height: h })
  png.data.fill(0)
  return png
}

function set(png, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return
  const i = (png.width * y + x) << 2
  png.data[i] = r
  png.data[i + 1] = g
  png.data[i + 2] = b
  png.data[i + 3] = a
}

function get(png, x, y) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return [0, 0, 0, 0]
  const i = (png.width * y + x) << 2
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]]
}

function hash(x, y, s = 1) {
  let n = Math.imul(x + s * 17, 374761393) ^ Math.imul(y + s * 31, 668265263)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function save(png, name) {
  const buf = PNG.sync.write(png)
  writeFileSync(join(OUT, name), buf)
  console.log('wrote', name, png.width + 'x' + png.height, buf.length, 'bytes')
}

// --- moss-atlas.png: 4 mottled tiles 64x64 in a row ---
{
  const TW = 64
  const tiles = 4
  const png = make(TW * tiles, TW)
  const palettes = [
    [[50, 94, 58], [76, 128, 78], [104, 154, 90], [134, 176, 108]],
    [[44, 86, 52], [68, 118, 70], [96, 142, 82], [120, 160, 96]],
    [[58, 102, 62], [84, 136, 86], [112, 158, 98], [140, 172, 112]],
    [[40, 78, 48], [62, 110, 64], [88, 134, 78], [110, 148, 90]],
  ]
  for (let t = 0; t < tiles; t++) {
    const pal = palettes[t]
    for (let y = 0; y < TW; y++) {
      for (let x = 0; x < TW; x++) {
        const n =
          hash(x, y, t + 1) * 0.45 +
          hash(x >> 1, y >> 1, t + 7) * 0.35 +
          hash(x >> 2, y >> 2, t + 13) * 0.2
        const idx = Math.min(3, Math.floor(n * 4))
        let [r, g, b] = pal[idx]
        // Soft circular falloff so stamps blend
        const cx = (x - TW / 2) / (TW * 0.48)
        const cy = (y - TW / 2) / (TW * 0.48)
        const r2 = cx * cx + cy * cy
        let a = r2 > 1 ? 0 : Math.round(255 * Math.pow(1 - r2, 0.55))
        // Micro speckles
        if (hash(x * 3, y * 3, t + 99) > 0.82) {
          r = Math.min(255, r + 28)
          g = Math.min(255, g + 32)
          b = Math.min(255, b + 12)
        }
        if (hash(x * 5, y * 2, t + 55) < 0.12) {
          r = Math.max(0, r - 22)
          g = Math.max(0, g - 18)
          b = Math.max(0, b - 10)
        }
        set(png, t * TW + x, y, r, g, b, a)
      }
    }
  }
  save(png, 'moss-atlas.png')
}

// --- rock-strata.png: horizontal sedimentary bands ---
{
  const W = 160
  const H = 96
  const png = make(W, H)
  const bands = [
    [146, 106, 78],
    [124, 86, 62],
    [104, 70, 50],
    [136, 96, 70],
    [116, 80, 56],
    [92, 64, 46],
    [128, 90, 64],
    [108, 74, 52],
  ]
  for (let y = 0; y < H; y++) {
    const bi = Math.floor((y / H) * bands.length)
    const base = bands[Math.min(bands.length - 1, bi)]
    const next = bands[Math.min(bands.length - 1, bi + 1)]
    const ft = ((y / H) * bands.length) % 1
    for (let x = 0; x < W; x++) {
      const wobble = (hash(x, bi, 3) - 0.5) * 14
      const yy = y + wobble * 0.08
      const shade = 0.88 + hash(x >> 2, y >> 1, 9) * 0.22
      let r = Math.round(lerp(base[0], next[0], ft) * shade)
      let g = Math.round(lerp(base[1], next[1], ft) * shade)
      let b = Math.round(lerp(base[2], next[2], ft) * shade)
      // Crack lines
      if (hash(x, y, 21) > 0.97) {
        r = Math.max(0, r - 40)
        g = Math.max(0, g - 30)
        b = Math.max(0, b - 20)
      }
      // Soft left/right edge fade for strip tiling
      const edge = Math.min(1, Math.min(x, W - 1 - x) / 10)
      const a = Math.round(255 * edge)
      set(png, x, y, r, g, b, a)
    }
  }
  save(png, 'rock-strata.png')
}

// --- water-sparkle.png: 3 frames strip ---
{
  const FW = 48
  const FH = 24
  const frames = 3
  const png = make(FW * frames, FH)
  for (let f = 0; f < frames; f++) {
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        // mostly transparent; a few sparkles per frame
        const n = hash(x + f * 17, y + f * 9, f + 1)
        const phase = (x / FW + f / frames) % 1
        let a = 0
        let r = 255,
          g = 255,
          b = 250
        if (n > 0.78) {
          a = Math.round(180 + (n - 0.78) * 300)
          // elongated sparkle
          const dx = Math.abs(x - FW * (0.2 + phase * 0.6))
          const dy = Math.abs(y - FH * 0.45)
          if (dx < 6 && dy < 3) a = Math.min(255, a + 40)
          else if (dx > 10 || dy > 4) a = Math.floor(a * 0.2)
        }
        if (n > 0.92) {
          r = 200
          g = 240
          b = 255
          a = 220
        }
        set(png, f * FW + x, y, r, g, b, a)
      }
    }
  }
  save(png, 'water-sparkle.png')
}

// --- shore-stones.png: row of 6 rounded stones ---
{
  const SW = 28
  const SH = 18
  const count = 6
  const png = make(SW * count, SH)
  const cols = [
    [120, 120, 118],
    [98, 100, 102],
    [140, 138, 132],
    [88, 90, 94],
    [110, 108, 104],
    [130, 126, 120],
  ]
  for (let s = 0; s < count; s++) {
    const [br, bg, bb] = cols[s]
    const ox = s * SW
    const cx = SW * 0.5
    const cy = SH * 0.55
    const rx = 9 + hash(s, 1, 2) * 4
    const ry = 5 + hash(s, 2, 3) * 2.5
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        const dx = (x - cx) / rx
        const dy = (y - cy) / ry
        const d = dx * dx + dy * dy
        if (d > 1) continue
        const shade = 0.75 + (1 - dy) * 0.35 + hash(x, y, s) * 0.08
        const a = Math.round(255 * Math.pow(1 - d, 0.4))
        set(
          png,
          ox + x,
          y,
          Math.min(255, Math.round(br * shade)),
          Math.min(255, Math.round(bg * shade)),
          Math.min(255, Math.round(bb * shade)),
          a,
        )
      }
    }
  }
  save(png, 'shore-stones.png')
}

// --- pine.png ---
{
  const W = 48
  const H = 72
  const png = make(W, H)
  // trunk
  for (let y = 52; y < 70; y++) {
    for (let x = 21; x < 27; x++) {
      const shade = 0.85 + hash(x, y, 1) * 0.2
      set(png, x, y, Math.round(90 * shade), Math.round(60 * shade), Math.round(36 * shade), 255)
    }
  }
  // layered cones
  const layers = [
    { y0: 8, y1: 28, half: 18, col: [34, 78, 42] },
    { y0: 20, y1: 42, half: 20, col: [42, 92, 50] },
    { y0: 34, y1: 56, half: 22, col: [50, 104, 56] },
  ]
  for (const L of layers) {
    for (let y = L.y0; y < L.y1; y++) {
      const t = (y - L.y0) / (L.y1 - L.y0)
      const half = L.half * (0.15 + t * 0.85)
      for (let x = Math.floor(24 - half); x <= Math.ceil(24 + half); x++) {
        const edge = 1 - Math.abs(x - 24) / half
        if (edge < 0) continue
        const n = hash(x, y, 7)
        const shade = 0.7 + edge * 0.4 + n * 0.1
        const a = Math.round(230 + edge * 25)
        set(
          png,
          x,
          y,
          Math.min(255, Math.round(L.col[0] * shade)),
          Math.min(255, Math.round(L.col[1] * shade)),
          Math.min(255, Math.round(L.col[2] * shade)),
          a,
        )
      }
    }
  }
  // tip highlight
  for (let y = 4; y < 14; y++) {
    for (let x = 21; x < 27; x++) {
      if (Math.abs(x - 24) + (14 - y) * 0.4 < 4) {
        set(png, x, y, 70, 120, 72, 240)
      }
    }
  }
  save(png, 'pine.png')
}

// --- cabin-moss.png ---
{
  const W = 72
  const H = 64
  const png = make(W, H)
  // log walls
  for (let y = 30; y < 56; y++) {
    for (let x = 14; x < 58; x++) {
      const row = Math.floor((y - 30) / 4)
      const shade = 0.85 + (row % 2) * 0.08 + hash(x, y, 2) * 0.1
      set(
        png,
        x,
        y,
        Math.round(120 * shade),
        Math.round(82 * shade),
        Math.round(52 * shade),
        255,
      )
      if (x === 14 || x === 57) set(png, x, y, 70, 48, 30, 255)
    }
  }
  // door
  for (let y = 40; y < 56; y++) {
    for (let x = 30; x < 42; x++) {
      set(png, x, y, 70, 48, 32, 255)
    }
  }
  // window
  for (let y = 36; y < 46; y++) {
    for (let x = 46; x < 54; x++) {
      set(png, x, y, 180, 200, 140, 255)
    }
  }
  // moss roof (gabled)
  for (let y = 8; y < 34; y++) {
    const t = (y - 8) / 26
    const half = 6 + t * 30
    for (let x = Math.floor(36 - half); x <= Math.ceil(36 + half); x++) {
      const n = hash(x, y, 11)
      const deep = n > 0.55
      const r = deep ? 48 : 72
      const g = deep ? 100 : 128
      const b = deep ? 52 : 70
      const edge = 1 - Math.abs(x - 36) / half
      if (edge < 0) continue
      set(png, x, y, r, g, b, Math.round(240 + edge * 15))
    }
  }
  // chimney
  for (let y = 4; y < 18; y++) {
    for (let x = 48; x < 56; x++) {
      set(png, x, y, 110, 78, 58, 255)
    }
  }
  save(png, 'cabin-moss.png')
}

function drawGnome(hatR, hatG, hatB, name) {
  const W = 36
  const H = 48
  const png = make(W, H)
  // boots
  for (let y = 42; y < 47; y++) {
    for (let x = 10; x < 26; x++) set(png, x, y, 60, 40, 30, 255)
  }
  // body / coat
  for (let y = 26; y < 44; y++) {
    for (let x = 8; x < 28; x++) {
      const dx = (x - 18) / 10
      const dy = (y - 35) / 10
      if (dx * dx + dy * dy > 1.1) continue
      set(png, x, y, 70, 90, 120, 255)
    }
  }
  // beard
  for (let y = 20; y < 40; y++) {
    for (let x = 10; x < 26; x++) {
      const dx = (x - 18) / 8
      const dy = (y - 28) / 12
      if (dx * dx + dy * dy > 1) continue
      const n = hash(x, y, 4)
      const v = 220 + Math.floor(n * 30)
      set(png, x, y, v, v, v - 5, 255)
    }
  }
  // face
  for (let y = 16; y < 26; y++) {
    for (let x = 12; x < 24; x++) {
      const dx = (x - 18) / 6
      const dy = (y - 21) / 5
      if (dx * dx + dy * dy > 1) continue
      set(png, x, y, 232, 190, 160, 255)
    }
  }
  // nose
  for (let y = 20; y < 25; y++) {
    for (let x = 16; x < 21; x++) {
      const dx = (x - 18.5) / 2.5
      const dy = (y - 22) / 2.5
      if (dx * dx + dy * dy <= 1) set(png, x, y, 220, 150, 120, 255)
    }
  }
  // eyes
  set(png, 15, 19, 40, 30, 30, 255)
  set(png, 20, 19, 40, 30, 30, 255)
  // tall pointed hat
  for (let y = 0; y < 22; y++) {
    const t = y / 22
    const half = 1 + t * 9
    for (let x = Math.floor(18 - half); x <= Math.ceil(18 + half); x++) {
      const shade = 0.85 + hash(x, y, 8) * 0.2
      set(
        png,
        x,
        y,
        Math.min(255, Math.round(hatR * shade)),
        Math.min(255, Math.round(hatG * shade)),
        Math.min(255, Math.round(hatB * shade)),
        255,
      )
    }
  }
  // hat brim
  for (let y = 18; y < 22; y++) {
    for (let x = 8; x < 28; x++) {
      set(png, x, y, hatR, hatG, hatB, 255)
    }
  }
  save(png, name)
}

drawGnome(200, 48, 48, 'gnome-red.png')
drawGnome(48, 96, 200, 'gnome-blue.png')

console.log('done →', OUT)
