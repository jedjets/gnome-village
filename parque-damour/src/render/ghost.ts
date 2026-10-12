// src/render/ghost.ts
// Green and red tile panes for an armed stamp or run, the ability target square, the selection ring, the focus pin (03 2.7, 7.8 items 3, 4).
// To be ported from GV 6037-6049 (drawGhost panes), 10764 (drawFocusMark), 8435 (the selection ring) in S3. PORT.
// S2 holds the typed stub of 03 2.7 so draw.ts can call phase 7 of the pipeline (03 7.9) today; every function draws nothing yet.
// TODO(S3): the panes (ok green, else red, GV 6040), the armed area ability's square at alpha 0.25 in the side's accent, the selection
// ring under the selected figure, the focus pin for 5.2 s after goToEvent; Ghost then comes from play/tools.ts (03 2.6 tools.ts row).
import type { XY } from '../core/math.ts';

/** What tools.ghost() returns (03 2.6 tools.ts row): whether the placement is valid, the tiles it covers, the refusal reason key. */
export type Ghost = { ok: boolean; tiles: XY[]; reason?: string };

/** The armed tool's ghost panes over its tiles (GV drawGhost 6037-6049); null draws nothing. S3 fills it. */
export function drawGhost(g: Ghost | null): void {
  if (!g) return;
  // TODO(S3): one diamond per tile in g.tiles, filled and stroked green when g.ok, red otherwise
}

/** The focus pin at an event's place for 5.2 s after goToEvent (GV drawFocusMark 10764). S3 fills it. */
export function drawFocusMark(): void {
  // TODO(S3)
}

/** The selection ring under the selected figure (GV 8435). S3 fills it (S4 gives it figures to ring). */
export function drawSelection(): void {
  // TODO(S3)
}
