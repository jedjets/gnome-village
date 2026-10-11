// src/save/store.ts
// Keys parque:profile-v1 and parque:park-v1; serialise, parse, autosave, the in-memory profile, the state hash (03 section 11).
// Nothing ported: GV has no save (review section 11). NEW.
// S1: the in-memory profile with loadProfile/saveProfile and the stylePick and musicPick writers the boards need (04 4.4 item 2).
// TODO(S2): snapshot, restore, stateHash; TODO(S3): loadPark, savePark, clearPark, stepAutosave, points, tiers, unlocks.
import type { ProfileV1 } from './schema.ts';

export const PROFILE_KEY = 'parque:profile-v1';
export const PARK_KEY = 'parque:park-v1';

function freshProfile(): ProfileV1 {
  return { v: 1, settings: { lang: 'en', muted: false, speed: 1 }, stylePick: null, musicPick: null };
}

let profile: ProfileV1 | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Read parque:profile-v1 (a fresh profile when absent or unreadable); fields the file lacks take their defaults. */
export function loadProfile(): ProfileV1 {
  const base = freshProfile();
  const s = storage();
  if (!s) return base;
  try {
    const raw = s.getItem(PROFILE_KEY);
    if (!raw) return base;
    const o = JSON.parse(raw) as Partial<ProfileV1>;
    if (o.settings) base.settings = { ...base.settings, ...o.settings };
    if (typeof o.stylePick === 'string') base.stylePick = o.stylePick;
    if (typeof o.musicPick === 'string') base.musicPick = o.musicPick;
    return base;
  } catch {
    return base;
  }
}

/** The in-memory profile, loaded once on first use. */
export function getProfile(): ProfileV1 {
  if (!profile) profile = loadProfile();
  return profile;
}

/** Write the in-memory profile to parque:profile-v1; silently a no-op without storage. */
export function saveProfile(): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(PROFILE_KEY, JSON.stringify(getProfile()));
  } catch {
    /* quota or private mode: the profile lives in memory until the next try */
  }
}

/** The Style Gate pick: 'A' | 'B' | 'C' (04 4.4 item 2). */
export function setStylePick(pick: string): void {
  getProfile().stylePick = pick;
  saveProfile();
}

/** The Music Gate pick: 'A' | 'B' | 'C' (05 6.4). */
export function setMusicPick(pick: string): void {
  getProfile().musicPick = pick;
  saveProfile();
}

/** True when a park save exists; the intro shows Continue on it. */
export function hasPark(): boolean {
  const s = storage();
  try {
    return s !== null && s.getItem(PARK_KEY) !== null;
  } catch {
    return false;
  }
}
