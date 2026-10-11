// src/save/store.ts
// Keys parque:profile-v1 and parque:park-v1; serialise, parse, autosave, the in-memory profile, the state hash (03 section 11).
// Nothing ported: GV has no save (review section 11). NEW.
// TODO(S2): snapshot, restore, stateHash (no localStorage yet); TODO(S3): loadProfile, saveProfile, loadPark, savePark, clearPark, stepAutosave.

export const PROFILE_KEY = 'parque:profile-v1';
export const PARK_KEY = 'parque:park-v1';

/** True when a park save exists; the intro shows Continue on it. */
export function hasPark(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(PARK_KEY) !== null;
  } catch {
    return false;
  }
}
