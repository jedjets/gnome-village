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
  onCameraMutated: () => void
  onTerrainMutated: () => void
  /** Auto-fit once on mount (Begin). Continue restores camera — skip. */
  autoFitOnEnter?: boolean
}

export function MainShell({
  muted,
  onToggleMute,
  onLeave,
  heightfield,
  camera,
  onCameraMutated,
  onTerrainMutated,
  autoFitOnEnter = true,
}: MainShellProps) {
  const [tool, setTool] = useState<ToolMode>('look')
  const [fitNonce, setFitNonce] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const didAutoFit = useRef(false)

  const applyFit = useCallback(() => {
    const el = stageRef.current
    const w = el?.clientWidth ?? window.innerWidth
    const h = el?.clientHeight ?? Math.round(window.innerHeight * 0.7)
    const world = isleWorldSize(heightfield.size)
    const fitted = computeFit(w, h, world.w, world.h)
    camera.panX = fitted.panX
    camera.panY = fitted.panY
    camera.zoom = fitted.zoom
    camera.rotation = fitted.rotation
    onCameraMutated()
    setFitNonce((n) => n + 1)
  }, [camera, heightfield.size, onCameraMutated])

  useEffect(() => {
    if (!autoFitOnEnter || didAutoFit.current) return
    didAutoFit.current = true
    const id = requestAnimationFrame(() => applyFit())
    return () => cancelAnimationFrame(id)
  }, [autoFitOnEnter, applyFit])

  return (
    <div className="main-shell">
      <Hud
        muted={muted}
        onToggleMute={onToggleMute}
        onFit={applyFit}
        onLeave={onLeave}
      />
      <div className="isle-stage" ref={stageRef}>
        <IsleCanvas
          heightfield={heightfield}
          camera={camera}
          tool={tool}
          onCameraChange={onCameraMutated}
          onTerrainChange={onTerrainMutated}
          fitNonce={fitNonce}
        />
      </div>
      <Rail tool={tool} onToolChange={setTool} />
    </div>
  )
}
