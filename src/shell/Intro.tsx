type IntroProps = {
  canContinue: boolean
  onBegin: () => void
  onContinue: () => void
  muted: boolean
  onToggleMute: () => void
}

/** Simple felt-hat silhouette (Wren pink / Bram blue). */
function FeltHat({ fill, title }: { fill: string; title: string }) {
  return (
    <svg
      className="intro-hat"
      viewBox="0 0 64 56"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* brim */}
      <ellipse cx="32" cy="42" rx="28" ry="8" fill={fill} />
      <ellipse cx="32" cy="40" rx="28" ry="7" fill={fill} opacity="0.85" />
      {/* crown */}
      <path
        d="M18 40 C18 22 24 8 32 6 C40 8 46 22 46 40 Z"
        fill={fill}
      />
      {/* soft highlight */}
      <path
        d="M26 18 C28 12 36 12 38 20 C34 16 28 16 26 18 Z"
        fill="#fff"
        opacity="0.35"
      />
      {/* band */}
      <rect x="19" y="32" width="26" height="5" rx="1.5" fill="rgba(74,68,88,0.22)" />
    </svg>
  )
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
        <div className="intro-hats" aria-hidden="false">
          <div className="intro-hat-wrap">
            <FeltHat fill="#EDA9C4" title="Wren" />
            <span className="intro-hat-label">Wren</span>
          </div>
          <div className="intro-hat-wrap">
            <FeltHat fill="#A6C7E8" title="Bram" />
            <span className="intro-hat-label">Bram</span>
          </div>
        </div>
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
