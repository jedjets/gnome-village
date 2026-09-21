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
 * Must stay ≤ Fit raw so Fit is never clamped UP into a tiny thumbnail.
 */
export const ZOOM_MIN = 0.18
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
 * Width-primary: aim for ~65–75% of phone width (not full-bleed disc).
 */
export function computeFit(
  viewW: number,
  viewH: number,
  isleWorldW: number,
  isleWorldH: number,
): CameraState {
  const safeW = Math.max(1, viewW)
  const safeH = Math.max(1, viewH)
  // Width-primary Fit: land fills ~65–75% of phone width (stylist lock)
  const aspect = safeH / safeW
  const targetWidth = aspect > 1.85 ? 0.72 : aspect > 1.6 ? 0.7 : 0.68
  const zoomW = (safeW * targetWidth) / Math.max(1, isleWorldW)
  const heightFill = aspect > 1.85 ? 0.58 : 0.7
  const zoomH = (safeH * heightFill) / Math.max(1, isleWorldH)
  // Never exceed width target (keeps Fit inside 65–75%)
  const zoom = clampZoom(Math.min(zoomW, Math.max(zoomH, zoomW * 0.94)))
  const panY = safeH * 0.01
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
