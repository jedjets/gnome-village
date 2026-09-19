type IntroProps = {
  canContinue: boolean
  onBegin: () => void
  onContinue: () => void
  muted: boolean
  onToggleMute: () => void
}

export function Intro({
  canContinue,
  onBegin,
  onContinue,
  muted,
  onToggleMute,
}: IntroProps) {
  return (
    <div className="intro">
      <div className="intro-card">
        <p className="intro-eyebrow">Phone-first · Chrome · Slice 1</p>
        <h1 className="intro-title">Gnome Village</h1>
        <p className="intro-tagline">
          A calm god-sandbox isle. Sculpt soft hills — progress stays on this
          device.
        </p>
        <div className="intro-actions">
          <button type="button" className="btn btn-primary" onClick={onBegin}>
            Begin
          </button>
          {canContinue ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onContinue}
            >
              Continue
            </button>
          ) : null}
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
