type HudProps = {
  muted: boolean
  onToggleMute: () => void
  onFit: () => void
  onLeave: () => void
}

/** Top HUD — Mute + Fit. */
export function Hud({ muted, onToggleMute, onFit, onLeave }: HudProps) {
  return (
    <header className="hud" role="banner">
      <div className="hud-left">
        <span className="hud-title">Gnome Village</span>
        <span className="hud-chip">Slice 1</span>
      </div>
      <div className="hud-right">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onFit}
        >
          Fit
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onToggleMute}
          aria-pressed={muted}
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLeave}>
          Intro
        </button>
      </div>
    </header>
  )
}
