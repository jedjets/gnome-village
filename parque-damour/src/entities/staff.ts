// src/entities/staff.ts
// Gardener and vendor routines (02 4.3); paving job execution.
// Ported from GV 3393-3395 (paving plan idea) in S4. NEW.
// TODO(S4): fills this file; S0 holds only the header and a placeholder export.
// S3 adds the kiosk hooks the park tools and their undo call (02 8.3 kiosk and remove rows, 03 5.6 items 2 and 3): no-ops until S4.
import type { PropId } from '../core/ids.ts';

export const SLICE = 'S4' as const;

/** A removed vendor as the undo entry keeps it (03 5.6 item 2: `vendorRemoved`); S4 makes it the vendor's Visitor record. */
export type VendorRecord = Readonly<Record<string, unknown>>;

/** A kiosk was placed (the `kiosk` tool): its vendor arrives (02 8.3, "spawns a vendor"). */
export function vendorArrive(_kioskId: PropId): void {
  // TODO(S4): spawnVendor(kioskId), set the kiosk's data.vendorId.
}

/** A kiosk is going (`remove`, or the undo of its placement): its vendor leaves. Returns the vendor's record for the undo entry, or null. */
export function vendorLeave(_kioskId: PropId): VendorRecord | null {
  return null; // TODO(S4): remove the kiosk's vendor and return a copy of its record (03 5.6 item 2).
}

/** The undo put a removed kiosk back: its vendor returns as it was (03 5.6 item 3). */
export function vendorReturn(_kioskId: PropId, _vendor: VendorRecord | null): void {
  // TODO(S4): re-add the vendor's record under its old id, or spawnVendor(kioskId) when none was kept.
}
