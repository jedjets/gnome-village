type HudProps = {
  muted: boolean
  onToggleMute: () => void
  onFit: () => void
  onLeave: () => void
}

/** Top HUD — floating glass chips over canvas. */
export function Hud({ muted, onToggleMute, onFit, onLeave }: HudProps) {
  return (
    <header className="hud" role="banner">
      <div className="hud-left">
        <span className="hud-title">Gnome Village</span>
      </div>
      <div className="hud-right">
        <button type="button" className="hud-chip" onClick={onFit}>
          Fit
        </button>
        <button
          type="button"
          className="hud-chip"
          onClick={onToggleMute}
          aria-pressed={muted}
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" className="hud-chip" onClick={onLeave}>
          Intro
        </button>
      </div>
    </header>
  )
}
