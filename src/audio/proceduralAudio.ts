/**
 * Minimal procedural Web Audio stub.
 * No sample packs — oscillators only. Safe no-op when AudioContext unavailable.
 */

let ctx: AudioContext | null = null
let muted = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
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

export function setMuted(next: boolean): void {
  muted = next
}

export function isMuted(): boolean {
  return muted
}

/** Soft blip for UI confirmations (e.g. enter village). */
export function playBlip(): void {
  if (muted) return
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
}
