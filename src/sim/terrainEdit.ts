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
 * Large soft brush — Raise builds soft hills/mounds, not razor ridges.
 * Strength sized so one continuous crown stroke lifts Fit silhouette ≥6–12 CSS px.
 * Wider falloff + smoothstep kernel; crown lifts as a coherent hill.
 */
export const DEFAULT_BRUSH: BrushParams = {
  radius: 12.5,
  strength: 0.48,
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
      const t = 1 - Math.sqrt(d2) / r
      // Smoothstep^2 — broad plateau, soft skirts (no spike crown)
      const s = t * t * (3 - 2 * t)
      const soft = s * s
      const before = getHeight(hf, x, y)
      // Don't grow ocean zeros into spikes — only sculpt existing land
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
