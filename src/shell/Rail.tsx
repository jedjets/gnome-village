import { TOOL_ORDER, TOOL_LABELS, type ToolMode } from '../sim/toolMode'

type RailProps = {
  tool: ToolMode
  onToolChange: (tool: ToolMode) => void
}

/** Creator tools — ONE horizontal scrolling row, no wrap. */
export function Rail({ tool, onToolChange }: RailProps) {
  return (
    <nav className="rail" aria-label="Creator tools">
      {TOOL_ORDER.map((mode) => (
        <button
          key={mode}
          type="button"
          className={`rail-item${tool === mode ? ' rail-item-active' : ''}`}
          aria-pressed={tool === mode}
          onClick={() => onToolChange(mode)}
        >
          {TOOL_LABELS[mode]}
        </button>
      ))}
    </nav>
  )
}
