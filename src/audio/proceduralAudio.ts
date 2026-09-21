/**
 * Procedural Web Audio stub.
 * Unlock on Begin / Continue (user gesture); blip only on Begin. Mute remembered. Silent OK.
 */

let ctx: AudioContext | null = null
let unlocked = false
let muted = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  // Headless/automation: AudioContext ctor can freeze the main thread forever.
  if (typeof navigator !== 'undefined' && navigator.webdriver) return null
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

/**
 * Mark unlocked immediately. Defer AudioContext creation — constructor can
 * freeze the main thread in some headless / autoplay environments.
 */
export async function unlockAudio(): Promise<void> {
  unlocked = true
  if (typeof window === 'undefined') return
  window.setTimeout(() => {
    try {
      const audio = getCtx()
      if (audio && audio.state === 'suspended') void audio.resume()
    } catch {
      // silent OK
    }
  }, 0)
}

export function setMuted(next: boolean): void {
  muted = next
}

/** Soft blip for UI confirmations. No-op if muted or locked. */
export function playBlip(): void {
  if (muted || !unlocked) return
  // Defer so Begin paint is never gated on AudioContext
  window.setTimeout(() => {
    try {
      const audio = getCtx()
      if (!audio) return
      void audio.resume()
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(520, audio.currentTime)
      osc.frequency.exponentialRampToValueAtTime(280, audio.currentTime + 0.12)
      gain.gain.setValueAtTime(0.08, audio.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.15)
      osc.connect(gain)
      gain.connect(audio.destination)
      osc.start()
      osc.stop(audio.currentTime + 0.16)
    } catch {
      // silent OK
    }
  }, 0)
}
