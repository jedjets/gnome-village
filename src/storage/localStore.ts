/** Thin localStorage helpers — auth is off; all persistence is local. */

const PREFIX = 'gnome-village:'

export function storageKey(key: string): string {
  return `${PREFIX}${key}`
}

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(storageKey(key))
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value))
  } catch {
    // Quota or private mode — ignore for greenfield
  }
}

export function clearKey(key: string): void {
  try {
    localStorage.removeItem(storageKey(key))
  } catch {
    // ignore
  }
}

export type VillageSave = {
  hasEntered: boolean
  muted: boolean
}

export const DEFAULT_SAVE: VillageSave = {
  hasEntered: false,
  muted: false,
}

export function loadVillageSave(): VillageSave {
  return loadJson<VillageSave>('save', DEFAULT_SAVE)
}

export function saveVillageSave(save: VillageSave): void {
  saveJson('save', save)
}
