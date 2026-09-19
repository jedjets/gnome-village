/**
 * Slice 1 persistence — NEW key. Never reuse old prototype / village save blindly.
 * Old key `gnome-village:save` is ignored (mute may be read once as a soft hint).
 */

import { GRID_SIZE } from '../world/isleGrid'
import type { CameraState } from '../world/fit'
import { defaultCamera } from '../world/fit'

const SLICE1_KEY = 'gnome-village:slice1-v1'
const LEGACY_SAVE_KEY = 'gnome-village:save'

export type Slice1Save = {
  version: 1
  seed: number
  /** Packed heights 0–255 */
  heights: number[]
  camera: CameraState
  muted: boolean
  /** True once the player has begun / continued into the isle */
  hasPlayed: boolean
}

export function defaultSlice1Save(seed = 0x6e0f1e): Slice1Save {
  return {
    version: 1,
    seed,
    heights: [],
    camera: defaultCamera(),
    muted: false,
    hasPlayed: false,
  }
}

function readLegacyMute(): boolean | null {
  try {
    const raw = localStorage.getItem(LEGACY_SAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { muted?: unknown }
    if (typeof parsed.muted === 'boolean') return parsed.muted
  } catch {
    // ignore corrupt legacy
  }
  return null
}

export function loadSlice1Save(): Slice1Save | null {
  try {
    const raw = localStorage.getItem(SLICE1_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Slice1Save>
    if (parsed.version !== 1) return null
    if (typeof parsed.seed !== 'number') return null
    if (!Array.isArray(parsed.heights)) return null
    if (!parsed.camera || typeof parsed.camera !== 'object') return null
    const cam = parsed.camera as Partial<CameraState>
    return {
      version: 1,
      seed: parsed.seed,
      heights: parsed.heights.map((n) =>
        typeof n === 'number' ? Math.max(0, Math.min(255, n | 0)) : 0,
      ),
      camera: {
        panX: typeof cam.panX === 'number' ? cam.panX : 0,
        panY: typeof cam.panY === 'number' ? cam.panY : 0,
        zoom: typeof cam.zoom === 'number' ? cam.zoom : 1,
        rotation: typeof cam.rotation === 'number' ? cam.rotation : 0,
      },
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : false,
      hasPlayed: Boolean(parsed.hasPlayed),
    }
  } catch {
    return null
  }
}

/** True if a restoreable Slice 1 save exists (with terrain or hasPlayed). */
export function hasSlice1Continue(): boolean {
  const s = loadSlice1Save()
  return Boolean(s && s.hasPlayed)
}

export function saveSlice1(save: Slice1Save): void {
  try {
    localStorage.setItem(SLICE1_KEY, JSON.stringify(save))
  } catch {
    // quota / private mode
  }
}

export function packHeights(heights: Float32Array): number[] {
  const out = new Array<number>(heights.length)
  for (let i = 0; i < heights.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round(heights[i]! * 255)))
  }
  return out
}

export function unpackHeights(
  packed: number[],
  target: Float32Array,
): void {
  const n = Math.min(packed.length, target.length)
  for (let i = 0; i < n; i++) {
    target[i] = (packed[i]! & 255) / 255
  }
  // If packed shorter (shouldn't), leave rest; if longer, ignore
  if (packed.length === 0) {
    // empty heights means "use seed only"
  }
}

export function expectedHeightCount(): number {
  return GRID_SIZE * GRID_SIZE
}

/**
 * Build initial mute preference: slice1 save wins; else soft-migrate mute from
 * legacy key only (never terrain/camera from old prototype).
 */
export function initialMutePreference(): boolean {
  const s = loadSlice1Save()
  if (s) return s.muted
  const legacy = readLegacyMute()
  return legacy ?? false
}
