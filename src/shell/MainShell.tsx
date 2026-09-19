import { useCallback, useEffect, useRef, useState } from 'react'
import { IsleCanvas } from '../isle/IsleCanvas'
import { isleWorldSize } from '../isle/renderIsle'
import type { ToolMode } from '../sim/toolMode'
import type { Heightfield } from '../world/isleGrid'
import { type CameraState, computeFit } from '../world/fit'
import { Hud } from './Hud'
import { Rail } from './Rail'

type MainShellProps = {
  muted: boolean
  onToggleMute: () => void
  onLeave: () => void
  heightfield: Heightfield
  camera: CameraState
  /** Auto-fit once on mount after layout (Begin AND Continue). */
  autoFitOnEnter?: boolean
}

export function MainShell({
  muted,
  onToggleMute,
  onLeave,
  heightfield,
  camera,
  autoFitOnEnter = true,
}: MainShellProps) {
  const [tool, setTool] = useState<ToolMode>('look')
  const [fitNonce, setFitNonce] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const didAutoFit = useRef(false)

  const applyFit = useCallback(() => {
    const el = stageRef.current
    const w = el?.clientWidth ?? 0
    const h = el?.clientHeight ?? 0
    // Require real layout — 0×0 before first paint must not lock ZOOM_MIN
    const viewW = w >= 32 ? w : window.innerWidth
    const viewH = h >= 32 ? h : Math.round(window.innerHeight * 0.7)
    if (viewW < 32 || viewH < 32) return false
    const world = isleWorldSize(heightfield.size)
    const fitted = computeFit(viewW, viewH, world.w, world.h)
    camera.panX = fitted.panX
    camera.panY = fitted.panY
    camera.zoom = fitted.zoom
    camera.rotation = fitted.rotation
    setFitNonce((n) => n + 1)
    return true
  }, [camera, heightfield.size])

  useEffect(() => {
    if (!autoFitOnEnter) return
    didAutoFit.current = false
    let cancelled = false
    let raf1 = 0
    let raf2 = 0

    const tryFit = () => {
      if (cancelled || didAutoFit.current) return
      if (applyFit()) didAutoFit.current = true
    }

    // Double-rAF: first painted frame after layout has real stage size
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(tryFit)
    })

    const el = stageRef.current
    const ro = new ResizeObserver(() => {
      if (!didAutoFit.current) tryFit()
    })
    if (el) ro.observe(el)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      ro.disconnect()
    }
  }, [autoFitOnEnter, applyFit])

  return (
    <div className="main-shell">
      <Hud
        muted={muted}
        onToggleMute={onToggleMute}
        onFit={() => { applyFit() }}
        onLeave={onLeave}
      />
      <div className="isle-stage" ref={stageRef}>
        <IsleCanvas
          heightfield={heightfield}
          camera={camera}
          tool={tool}
          fitNonce={fitNonce}
        />
      </div>
      <Rail tool={tool} onToolChange={setTool} />
    </div>
  )
}
