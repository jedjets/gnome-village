/**
 * Drag pan + pinch zoom + twist rotate for Look mode.
 * Phone-first: damped pan gain + soft edge clamp so short drags
 * keep the isle mostly on-screen (Fit still recovers).
 */

import type { CameraState } from '../world/fit'
import { clampZoom, clampRotation } from '../world/fit'
import type { PointerSample } from './pointerBridge'

type GestureSession =
  | { kind: 'pan'; lastX: number; lastY: number; vx: number; vy: number }
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

/** Screen-delta → pan. <1 so Look feels controlled on phone (and mouse harness). */
export const LOOK_PAN_GAIN = 0.38

/** Soft clamp: keep isle within this fraction of half-viewport from center. */
const PAN_CLAMP_X = 0.42
const PAN_CLAMP_Y = 0.48

const INERTIA_FRICTION = 0.82
const INERTIA_MIN = 0.12
const VELOCITY_SMOOTH = 0.28

function softClampPan(camera: CameraState, viewW: number, viewH: number): void {
  const maxX = Math.max(24, viewW * PAN_CLAMP_X)
  const maxY = Math.max(24, viewH * PAN_CLAMP_Y)
  if (camera.panX > maxX) camera.panX = maxX
  else if (camera.panX < -maxX) camera.panX = -maxX
  if (camera.panY > maxY) camera.panY = maxY
  else if (camera.panY < -maxY) camera.panY = -maxY
}

export class CameraGestureController {
  private session: GestureSession = null
  private coastVx = 0
  private coastVy = 0
  private coasting = false
  private viewW = 390
  private viewH = 844

  setViewport(w: number, h: number): void {
    this.viewW = Math.max(1, w)
    this.viewH = Math.max(1, h)
  }

  reset(): void {
    if (this.session?.kind === 'pan') {
      this.coastVx = this.session.vx
      this.coastVy = this.session.vy
      this.coasting =
        Math.hypot(this.coastVx, this.coastVy) > INERTIA_MIN * 4
    } else {
      this.coastVx = 0
      this.coastVy = 0
      this.coasting = false
    }
    this.session = null
  }

  /** Tick inertia coast — call once per frame from the rAF loop. */
  tickInertia(camera: CameraState): void {
    if (!this.coasting) return
    if (this.session) {
      this.coasting = false
      this.coastVx = 0
      this.coastVy = 0
      return
    }
    camera.panX += this.coastVx
    camera.panY += this.coastVy
    softClampPan(camera, this.viewW, this.viewH)
    this.coastVx *= INERTIA_FRICTION
    this.coastVy *= INERTIA_FRICTION
    if (Math.hypot(this.coastVx, this.coastVy) < INERTIA_MIN) {
      this.coasting = false
      this.coastVx = 0
      this.coastVy = 0
    }
  }

  /** Start / update from current pointer map. Mutates camera. */
  onPointers(
    pointers: Map<number, PointerSample>,
    camera: CameraState,
  ): void {
    const list = [...pointers.values()]
    if (list.length === 0) {
      return
    }

    this.coasting = false
    this.coastVx = 0
    this.coastVy = 0

    if (list.length === 1) {
      const p = list[0]!
      if (!this.session || this.session.kind !== 'pan') {
        this.session = { kind: 'pan', lastX: p.x, lastY: p.y, vx: 0, vy: 0 }
        return
      }
      const dx = (p.x - this.session.lastX) * LOOK_PAN_GAIN
      const dy = (p.y - this.session.lastY) * LOOK_PAN_GAIN
      camera.panX += dx
      camera.panY += dy
      softClampPan(camera, this.viewW, this.viewH)
      this.session.vx =
        this.session.vx * (1 - VELOCITY_SMOOTH) + dx * VELOCITY_SMOOTH
      this.session.vy =
        this.session.vy * (1 - VELOCITY_SMOOTH) + dy * VELOCITY_SMOOTH
      this.session.lastX = p.x
      this.session.lastY = p.y
      return
    }

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
    camera.rotation = clampRotation(camera.rotation + dAng * 0.85)

    camera.panX += (m.x - this.session.lastMidX) * LOOK_PAN_GAIN
    camera.panY += (m.y - this.session.lastMidY) * LOOK_PAN_GAIN
    softClampPan(camera, this.viewW, this.viewH)

    this.session.lastDist = d
    this.session.lastAngle = ang
    this.session.lastMidX = m.x
    this.session.lastMidY = m.y
  }
}
