import { useCallback, useEffect, useState } from 'react'
import { playBlip, setMuted as setAudioMuted } from './audio/proceduralAudio'
import {
  loadVillageSave,
  saveVillageSave,
  type VillageSave,
} from './storage/localStore'
import { Intro } from './shell/Intro'
import { MainShell } from './shell/MainShell'

function App() {
  const [save, setSave] = useState<VillageSave>(() => loadVillageSave())

  useEffect(() => {
    setAudioMuted(save.muted)
  }, [save.muted])

  const persist = useCallback((next: VillageSave) => {
    setSave(next)
    saveVillageSave(next)
  }, [])

  const enter = () => {
    playBlip()
    persist({ ...save, hasEntered: true })
  }

  const leave = () => {
    persist({ ...save, hasEntered: false })
  }

  const toggleMute = () => {
    const muted = !save.muted
    setAudioMuted(muted)
    persist({ ...save, muted })
  }

  if (!save.hasEntered) {
    return (
      <Intro onEnter={enter} muted={save.muted} onToggleMute={toggleMute} />
    )
  }

  return (
    <MainShell
      muted={save.muted}
      onToggleMute={toggleMute}
      onLeave={leave}
    />
  )
}

export default App
