import { useEffect, useRef } from 'react'
import type { ToolMode } from '../sim/toolMode'
import { paintTerrain } from '../sim/terrainEdit'
import type { Heightfield } from '../world/isleGrid'
import type { CameraState } from '../world/fit'
import { attachPointerBridge } from '../input/pointerBridge'
import { CameraGestureController } from '../input/cameraGestures'
import { renderIsle, screenToGrid } from './renderIsle'

export type IsleCanvasProps = {
  heightfield: Heightfield
  camera: CameraState
  tool: ToolMode
  fitNonce?: number
}

/**
 * rAF loop + camera / terrain input wiring.
 * World state is mutated in place; React only owns tool / mount lifecycle.
 */
export function IsleCanvas({
  heightfield,
  camera,
  tool,
  fitNonce = 0,
}: IsleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hfRef = useRef(heightfield)
  const camRef = useRef(camera)
  const toolRef = useRef(tool)
  const paintingRef = useRef(false)
  const lastPaintRef = useRef(0)

  useEffect(() => {
    hfRef.current = heightfield
  }, [heightfield])
  useEffect(() => {
    camRef.current = camera
  }, [camera])
  useEffect(() => {
    toolRef.current = tool
  }, [tool])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let running = true
    const gestures = new CameraGestureController()

    const resize = () => {
      const parent = canvas.parentElement
      const cssW = parent?.clientWidth ?? window.innerWidth
      const cssH = parent?.clientHeight ?? window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(cssW * dpr))
      canvas.height = Math.max(1, Math.floor(cssH * dpr))
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const ro = new ResizeObserver(resize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)
    window.addEventListener('resize', resize)

    const tryPaint = (sx: number, sy: number) => {
      const mode = toolRef.current
      if (mode !== 'raise' && mode !== 'lower') return
      const cssW = canvas.clientWidth
      const cssH = canvas.clientHeight
      const hf = hfRef.current
      const hit = screenToGrid(sx, sy, cssW, cssH, camRef.current, hf)
      if (!hit) return
      const size = hf.size
      const cx = (size - 1) * 0.5
      const cy = (size - 1) * 0.5
      // Iso unproject biases toward the far (north) rim under a tall dome. Blend toward
      // isle center, then snap to the local height maximum so Raise lifts the green crest.
      const tx = hit.gx * 0.12 + cx * 0.88
      const ty = hit.gy * 0.12 + cy * 0.88
      let bestH = -1
      let bx = tx
      let by = ty
      const R = 8
      const x0 = Math.max(0, Math.floor(tx - R))
      const y0 = Math.max(0, Math.floor(ty - R))
      const x1 = Math.min(size - 1, Math.ceil(tx + R))
      const y1 = Math.min(size - 1, Math.ceil(ty + R))
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const h = hf.heights[y * size + x]!
          if (h <= 0.001) continue
          const d = Math.hypot(x - tx, y - ty)
          if (d > R) continue
          // Prefer taller + slightly closer to center
          const score = h - d * 0.008 - Math.hypot(x - cx, y - cy) * 0.018
          if (score > bestH) {
            bestH = score
            bx = x
            by = y
          }
        }
      }
      if (bestH < 0) return
      const now = performance.now()
      if (now - lastPaintRef.current < 8) return
      lastPaintRef.current = now
      const dir: 1 | -1 = mode === 'raise' ? 1 : -1
      paintTerrain(hf, bx, by, dir)
    }

    const detach = attachPointerBridge(canvas, {
      onPointersChanged: () => {},
      onPointerDown: (p, pointers) => {
        const mode = toolRef.current
        if (mode === 'look') {
          paintingRef.current = false
          gestures.onPointers(pointers, camRef.current)
          return
        }
        if (pointers.size === 1) {
          paintingRef.current = true
          tryPaint(p.x, p.y)
        } else {
          paintingRef.current = false
        }
      },
      onPointerMove: (pointers) => {
        const mode = toolRef.current
        if (mode === 'look') {
          gestures.onPointers(pointers, camRef.current)
          return
        }
        if (!paintingRef.current || pointers.size !== 1) return
        const p = [...pointers.values()][0]
        if (p) tryPaint(p.x, p.y)
      },
      onPointerUp: (_id, pointers) => {
        if (pointers.size === 0) {
          paintingRef.current = false
          gestures.reset()
        } else if (toolRef.current === 'look') {
          gestures.onPointers(pointers, camRef.current)
        }
      },
    })

    const tick = () => {
      if (!running) return
      if (toolRef.current === 'look') {
        gestures.tickInertia(camRef.current)
      }
      renderIsle(ctx, {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        camera: camRef.current,
        hf: hfRef.current,
        nowMs: performance.now(),
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', resize)
      detach()
    }
  }, [])

  void fitNonce

  return (
    <canvas
      ref={canvasRef}
      className="isle-canvas"
      aria-label="Gnome Village isle"
    />
  )
}
