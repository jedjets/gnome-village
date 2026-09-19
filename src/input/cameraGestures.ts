/**
 * Drag pan + pinch zoom + twist rotate for Look mode.
 */

import type { CameraState } from '../world/fit'
import { clampZoom, normalizeRotation } from '../world/fit'
import type { PointerSample } from './pointerBridge'

type GestureSession =
  | { kind: 'pan'; lastX: number; lastY: number }
  | {
      kind: 'pinch'
      lastDist: number
      lastAngle: number
      lastMidX: number
      lastMidY: number
    }
  | null

function dist(a: PointerSample, b: PointerSample): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

function mid(a: PointerSample, b: PointerSample): { x: number; y: number } {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 }
}

function angle(a: PointerSample, b: PointerSample): number {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

export class CameraGestureController {
  private session: GestureSession = null

  reset(): void {
    this.session = null
  }

  /** Start / update from current pointer map. Mutates camera. */
  onPointers(
    pointers: Map<number, PointerSample>,
    camera: CameraState,
  ): void {
    const list = [...pointers.values()]
    if (list.length === 0) {
      this.session = null
      return
    }

    if (list.length === 1) {
      const p = list[0]!
      if (!this.session || this.session.kind !== 'pan') {
        this.session = { kind: 'pan', lastX: p.x, lastY: p.y }
        return
      }
      const dx = p.x - this.session.lastX
      const dy = p.y - this.session.lastY
      camera.panX += dx
      camera.panY += dy
      this.session.lastX = p.x
      this.session.lastY = p.y
      return
    }

    // Two+ fingers: pinch + twist (use first two)
    const a = list[0]!
    const b = list[1]!
    const d = Math.max(1, dist(a, b))
    const ang = angle(a, b)
    const m = mid(a, b)

    if (!this.session || this.session.kind !== 'pinch') {
      this.session = {
        kind: 'pinch',
        lastDist: d,
        lastAngle: ang,
        lastMidX: m.x,
        lastMidY: m.y,
      }
      return
    }

    const scale = d / this.session.lastDist
    camera.zoom = clampZoom(camera.zoom * scale)

    let dAng = ang - this.session.lastAngle
    if (dAng > Math.PI) dAng -= Math.PI * 2
    if (dAng < -Math.PI) dAng += Math.PI * 2
    camera.rotation = normalizeRotation(camera.rotation + dAng)

    camera.panX += m.x - this.session.lastMidX
    camera.panY += m.y - this.session.lastMidY

    this.session.lastDist = d
    this.session.lastAngle = ang
    this.session.lastMidX = m.x
    this.session.lastMidY = m.y
  }
}
