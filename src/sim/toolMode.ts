export type ToolMode = 'look' | 'raise' | 'lower'

export const TOOL_LABELS: Record<ToolMode, string> = {
  look: 'Look',
  raise: 'Raise',
  lower: 'Lower',
}

export const TOOL_ORDER: ToolMode[] = ['look', 'raise', 'lower']
