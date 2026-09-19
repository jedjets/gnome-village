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

export const DEFAULT_BRUSH: BrushParams = {
  radius: 2.4,
  strength: 0.045,
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
      const soft = falloff * falloff
      const before = getHeight(hf, x, y)
      // Don't raise water-edge zeros into floating spikes past isle mask —
      // allow gentle sculpt everywhere; clamp keeps range
      const next = before + direction * brush.strength * soft
      if (Math.abs(next - before) < 1e-6) continue
      setHeight(hf, x, y, next)
      changed = true
    }
  }
  return changed
}
