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

export const ZOOM_MIN = 0.45
export const ZOOM_MAX = 2.8

export function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))
}

export function defaultCamera(): CameraState {
  return { panX: 0, panY: 0, zoom: 1, rotation: 0 }
}

/**
 * Compute Fit camera for a viewport. Stable: same inputs → same camera.
 * Targets the isle footprint so the full island is visible with padding.
 */
export function computeFit(
  viewW: number,
  viewH: number,
  isleWorldW: number,
  isleWorldH: number,
): CameraState {
  const pad = 0.88 // leave ~12% margin
  const safeW = Math.max(1, viewW)
  const safeH = Math.max(1, viewH)
  const zoom = clampZoom(
    Math.min((safeW * pad) / isleWorldW, (safeH * pad) / isleWorldH),
  )
  // Slight upward bias so the island sits a bit above visual center (HUD/rail)
  const panY = safeH * 0.02
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
