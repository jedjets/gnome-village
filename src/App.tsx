import { useCallback, useEffect, useRef, useState } from 'react'
import {
  unlockAudio,
  setMuted as setAudioMuted,
  playBlip,
} from './audio/proceduralAudio'
import { createSeededIsle, type Heightfield } from './world/isleGrid'
import { defaultCamera, type CameraState } from './world/fit'
import {
  loadSlice1Save,
  saveSlice1,
  packHeights,
  unpackHeights,
  hasSlice1Continue,
  initialMutePreference,
  type Slice1Save,
  expectedHeightCount,
} from './storage/slice1Store'
import { Intro } from './shell/Intro'
import { MainShell } from './shell/MainShell'

type Phase = 'intro' | 'play'

type World = { hf: Heightfield; camera: CameraState }

function freshSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
}

function buildWorldFromSave(save: Slice1Save | null, asNew: boolean): World {
  if (save && !asNew) {
    const hf = createSeededIsle(save.seed)
    if (save.heights.length === expectedHeightCount()) {
      unpackHeights(save.heights, hf.heights)
    }
    return { hf, camera: { ...save.camera } }
  }
  return { hf: createSeededIsle(freshSeed()), camera: defaultCamera() }
}

function App() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [muted, setMuted] = useState(() => initialMutePreference())
  const [continueAvailable, setContinueAvailable] = useState(() =>
    hasSlice1Continue(),
  )
  const [playGen, setPlayGen] = useState(0)
  const [autoFitOnEnter, setAutoFitOnEnter] = useState(true)
  const [world, setWorld] = useState<World | null>(null)

  const worldRef = useRef<World | null>(null)
  const mutedRef = useRef(muted)

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    worldRef.current = world
  }, [world])

  useEffect(() => {
    setAudioMuted(muted)
  }, [muted])

  const persistSilent = useCallback(() => {
    const w = worldRef.current
    if (!w) return
    saveSlice1({
      version: 1,
      seed: w.hf.seed,
      heights: packHeights(w.hf.heights),
      camera: { ...w.camera },
      muted: mutedRef.current,
      hasPlayed: true,
    })
    setContinueAvailable(true)
  }, [])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') persistSilent()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', persistSilent)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', persistSilent)
    }
  }, [persistSilent])

  const enterPlay = useCallback(async (mode: 'begin' | 'continue') => {
    await unlockAudio()
    playBlip()

    if (mode === 'begin') {
      const built = buildWorldFromSave(null, true)
      worldRef.current = built
      setWorld(built)
      saveSlice1({
        version: 1,
        seed: built.hf.seed,
        heights: packHeights(built.hf.heights),
        camera: { ...built.camera },
        muted: mutedRef.current,
        hasPlayed: true,
      })
      setContinueAvailable(true)
      setAutoFitOnEnter(true)
    } else {
      const built = buildWorldFromSave(loadSlice1Save(), false)
      worldRef.current = built
      setWorld(built)
      setAutoFitOnEnter(false)
    }
    setPhase('play')
    setPlayGen((g) => g + 1)
  }, [])

  const leave = useCallback(() => {
    persistSilent()
    setPhase('intro')
  }, [persistSilent])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      setAudioMuted(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (phase !== 'play' || !worldRef.current) return
    persistSilent()
  }, [muted, phase, persistSilent])

  const noop = useCallback(() => {}, [])

  if (phase === 'intro' || !world) {
    return (
      <Intro
        canContinue={continueAvailable}
        onBegin={() => void enterPlay('begin')}
        onContinue={() => void enterPlay('continue')}
        muted={muted}
        onToggleMute={toggleMute}
      />
    )
  }

  return (
    <MainShell
      key={playGen}
      muted={muted}
      onToggleMute={toggleMute}
      onLeave={leave}
      heightfield={world.hf}
      camera={world.camera}
      onCameraMutated={noop}
      onTerrainMutated={noop}
      autoFitOnEnter={autoFitOnEnter}
    />
  )
}

export default App
