import { useEffect, useRef } from 'react'
import { drawIsle } from './drawIsle'

/**
 * Single Canvas 2D isle — owns resize + rAF loop.
 */
export function IsleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let running = true

    const resize = () => {
      const parent = canvas.parentElement
      const cssW = parent?.clientWidth ?? window.innerWidth
      const cssH = parent?.clientHeight ?? window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(cssW * dpr))
      canvas.height = Math.max(1, Math.floor(cssH * dpr))
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const ro = new ResizeObserver(resize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)
    window.addEventListener('resize', resize)

    const tick = (t: number) => {
      if (!running) return
      const cssW = canvas.clientWidth
      const cssH = canvas.clientHeight
      drawIsle(ctx, { width: cssW, height: cssH }, t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="isle-canvas"
      aria-label="Gnome Village isle"
    />
  )
}
