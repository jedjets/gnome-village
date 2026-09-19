/**
 * Stable Fit framing for the soft-isometric isle on phone (~390×844).
 */

export type CameraState = {
  /** Pan offset in screen space (CSS px), relative to canvas center */
  panX: number
  panY: number
  /** Uniform scale */
  zoom: number
  /** Rotation in radians (twist) */
  rotation: number
}

/**
 * Must stay ≤ Fit raw (~0.18–0.22) so Fit is never clamped UP into a
 * tiny thumbnail / wrong framing (Stylist 1d/1e).
 */
export const ZOOM_MIN = 0.15
export const ZOOM_MAX = 2.8

/** Soft clamp on twist so accidental pinch-rotate stays gentle. */
export const ROTATION_MAX = Math.PI / 3 // ±60°

export function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))
}

export function clampRotation(r: number): number {
  const n = normalizeRotation(r)
  return Math.max(-ROTATION_MAX, Math.min(ROTATION_MAX, n))
}

export function defaultCamera(): CameraState {
  return { panX: 0, panY: 0, zoom: 1, rotation: 0 }
}

/**
 * Compute Fit camera for a viewport. Stable: same inputs → same camera.
 * Height-primary: aim for ~68% of portrait stage height; allow mild
 * horizontal overflow so the isle isn't a thumbnail in a beige void.
 */
export function computeFit(
  viewW: number,
  viewH: number,
  isleWorldW: number,
  isleWorldH: number,
): CameraState {
  const safeW = Math.max(1, viewW)
  const safeH = Math.max(1, viewH)
  const targetFill = 0.72 // ~65–75% portrait height
  const zoomH = (safeH * targetFill) / Math.max(1, isleWorldH)
  // Allow slight side overflow so height target can win on phones
  const zoomW = (safeW * 1.75) / Math.max(1, isleWorldW)
  const zoom = clampZoom(Math.min(zoomH, zoomW))
  // Slight upward bias so the island sits a bit above visual center (HUD/rail)
  const panY = safeH * 0.015
  return {
    panX: 0,
    panY,
    zoom,
    rotation: 0,
  }
}

export function normalizeRotation(r: number): number {
  const tau = Math.PI * 2
  let x = r % tau
  if (x > Math.PI) x -= tau
  if (x < -Math.PI) x += tau
  return x
}
