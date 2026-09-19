type IntroProps = {
  canContinue: boolean
  onBegin: () => void
  onContinue: () => void
  muted: boolean
  onToggleMute: () => void
}

/** Felt-hat silhouette with brim shadow + crown gradient. */
function FeltHat({
  fill,
  fillDark,
  title,
}: {
  fill: string
  fillDark: string
  title: string
}) {
  const gid = `hat-crown-${title}`
  return (
    <svg
      className="intro-hat"
      viewBox="0 0 64 56"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} />
          <stop offset="55%" stopColor={fill} />
          <stop offset="100%" stopColor={fillDark} />
        </linearGradient>
        <filter id={`${gid}-shadow`} x="-20%" y="-10%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#4a4458" floodOpacity="0.22" />
        </filter>
      </defs>
      {/* brim shadow under brim */}
      <ellipse cx="32" cy="44" rx="27" ry="5" fill="rgba(74,68,88,0.18)" />
      {/* brim */}
      <ellipse
        cx="32"
        cy="42"
        rx="28"
        ry="8"
        fill={fillDark}
        filter={`url(#${gid}-shadow)`}
      />
      <ellipse cx="32" cy="40" rx="28" ry="7" fill={fill} />
      {/* crown — felt gradient */}
      <path
        d="M18 40 C18 22 24 8 32 6 C40 8 46 22 46 40 Z"
        fill={`url(#${gid})`}
      />
      {/* soft highlight */}
      <path
        d="M26 18 C28 12 36 12 38 20 C34 16 28 16 26 18 Z"
        fill="#fff"
        opacity="0.32"
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
      <button
        type="button"
        className="intro-mute-chip"
        onClick={onToggleMute}
        aria-pressed={muted}
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>
      <div className="intro-card">
        <div className="intro-hats" aria-hidden="true">
          <div className="intro-hat-wrap">
            <FeltHat fill="#EDA9C4" fillDark="#E08AB0" title="Wren" />
          </div>
          <div className="intro-hat-wrap">
            <FeltHat fill="#A6C7E8" fillDark="#7FAFD8" title="Bram" />
          </div>
        </div>
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
        </div>
      </div>
    </div>
  )
}
