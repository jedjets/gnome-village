type IntroProps = {
  onEnter: () => void
  muted: boolean
  onToggleMute: () => void
}

export function Intro({ onEnter, muted, onToggleMute }: IntroProps) {
  return (
    <div className="intro">
      <div className="intro-card">
        <p className="intro-eyebrow">Phone-first · Chrome</p>
        <h1 className="intro-title">Gnome Village</h1>
        <p className="intro-tagline">
          A calm god-sandbox isle. Tend your village — progress stays on this
          device.
        </p>
        <div className="intro-actions">
          <button type="button" className="btn btn-primary" onClick={onEnter}>
            Enter village
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onToggleMute}
            aria-pressed={muted}
          >
            {muted ? 'Unmute' : 'Mute'}
          </button>
        </div>
      </div>
    </div>
  )
}
