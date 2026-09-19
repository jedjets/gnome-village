import {
  type Heightfield,
  getHeight,
  setHeight,
} from '../world/isleGrid'

export type BrushParams = {
  /** Brush radius in grid cells */
  radius: number
  /** Height delta per paint sample */
  strength: number
}

/**
 * Large soft brush — Raise must poke a Fit-readable hill in a few strokes.
 * (1c regression: tiny brush read as "not playable".)
 */
export const DEFAULT_BRUSH: BrushParams = {
  radius: 6.5,
  strength: 0.145,
}

/**
 * Soft circular brush raise/lower at grid coords (gx, gy).
 * Returns true if any cell changed.
 */
export function paintTerrain(
  hf: Heightfield,
  gx: number,
  gy: number,
  direction: 1 | -1,
  brush: BrushParams = DEFAULT_BRUSH,
): boolean {
  const { size } = hf
  const r = brush.radius
  const r2 = r * r
  const ix0 = Math.max(0, Math.floor(gx - r))
  const iy0 = Math.max(0, Math.floor(gy - r))
  const ix1 = Math.min(size - 1, Math.ceil(gx + r))
  const iy1 = Math.min(size - 1, Math.ceil(gy + r))
  let changed = false

  for (let y = iy0; y <= iy1; y++) {
    for (let x = ix0; x <= ix1; x++) {
      const dx = x - gx
      const dy = y - gy
      const d2 = dx * dx + dy * dy
      if (d2 > r2) continue
      const falloff = 1 - Math.sqrt(d2) / r
      // Gentler falloff so the crown lifts as a coherent hill
      const soft = falloff * falloff * (0.35 + 0.65 * falloff)
      const before = getHeight(hf, x, y)
      // Don't grow ocean zeros into spikes — only sculpt existing land
      // (and immediate wet banks that already have a little height)
      if (before <= 0.001 && direction > 0) continue
      const next = before + direction * brush.strength * soft
      if (Math.abs(next - before) < 1e-7) continue
      setHeight(hf, x, y, next)
      changed = true
    }
  }
  return changed
}

/** Packed 0–255 stats — used by verify-sculpt + QA probes. */
export function heightStats(hf: Heightfield): { sum: number; max: number; n: number } {
  const h = hf.heights
  let sum = 0
  let max = 0
  for (let i = 0; i < h.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(h[i]! * 255)))
    sum += v
    if (v > max) max = v
  }
  return { sum, max, n: h.length }
}
