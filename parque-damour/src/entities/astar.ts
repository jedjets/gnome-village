// src/entities/astar.ts
// 8-connected A* with preallocated typed scratch, octile heuristic, node budget 2600, partial path, no corner cutting (02 5.5).
// Ported from GV 1412-1416, 1427-1465 (stepCost), 1466-1510 (findPath) in S4. PORT.
// TODO(S4): fills this file; S0 holds only the header and a placeholder export.

export const SLICE = 'S4' as const;
