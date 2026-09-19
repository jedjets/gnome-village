type HudProps = {
  muted: boolean
  onToggleMute: () => void
  onLeave: () => void
}

/** Top HUD placeholder — meters / status for the god-sandbox. */
export function Hud({ muted, onToggleMute, onLeave }: HudProps) {
  return (
    <header className="hud" role="banner">
      <div className="hud-left">
        <span className="hud-title">Gnome Village</span>
        <span className="hud-chip">Isle</span>
      </div>
      <div className="hud-meters" aria-label="Placeholder meters">
        <span className="meter">Joy · —</span>
        <span className="meter">Stores · —</span>
      </div>
      <div className="hud-right">
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
