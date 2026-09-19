import { IsleCanvas } from '../isle/IsleCanvas'
import { Hud } from './Hud'
import { Rail } from './Rail'

type MainShellProps = {
  muted: boolean
  onToggleMute: () => void
  onLeave: () => void
}

export function MainShell({ muted, onToggleMute, onLeave }: MainShellProps) {
  return (
    <div className="main-shell">
      <Hud muted={muted} onToggleMute={onToggleMute} onLeave={onLeave} />
      <div className="isle-stage">
        <IsleCanvas />
      </div>
      <Rail />
    </div>
  )
}
