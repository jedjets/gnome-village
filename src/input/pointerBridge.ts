/**
 * Normalize pointer / touch events on a canvas into a small gesture stream.
 */

export type PointerSample = {
  id: number
  x: number
  y: number
}

export type PointerBridgeHandlers = {
  onPointersChanged: (pointers: Map<number, PointerSample>) => void
  onPointerDown: (p: PointerSample, pointers: Map<number, PointerSample>) => void
  onPointerMove: (pointers: Map<number, PointerSample>) => void
  onPointerUp: (id: number, pointers: Map<number, PointerSample>) => void
}

function clientToLocal(
  el: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  return { x: clientX - rect.left, y: clientY - rect.top }
}

export function attachPointerBridge(
  el: HTMLElement,
  handlers: PointerBridgeHandlers,
): () => void {
  const pointers = new Map<number, PointerSample>()

  const emitChanged = () => handlers.onPointersChanged(pointers)

  const onDown = (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId)
    const { x, y } = clientToLocal(el, e.clientX, e.clientY)
    const sample: PointerSample = { id: e.pointerId, x, y }
    pointers.set(e.pointerId, sample)
    handlers.onPointerDown(sample, pointers)
    emitChanged()
  }

  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return
    const { x, y } = clientToLocal(el, e.clientX, e.clientY)
    pointers.set(e.pointerId, { id: e.pointerId, x, y })
    handlers.onPointerMove(pointers)
  }

  const onUp = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return
    pointers.delete(e.pointerId)
    try {
      el.releasePointerCapture(e.pointerId)
    } catch {
      // already released
    }
    handlers.onPointerUp(e.pointerId, pointers)
    emitChanged()
  }

  const opts: AddEventListenerOptions = { passive: false }
  const prevent = (e: Event) => {
    e.preventDefault()
  }

  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  el.addEventListener('lostpointercapture', onUp)
  // Block browser pan/zoom on the canvas
  el.addEventListener('touchstart', prevent, opts)
  el.addEventListener('touchmove', prevent, opts)
  el.addEventListener('gesturestart', prevent, opts)

  return () => {
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    el.removeEventListener('lostpointercapture', onUp)
    el.removeEventListener('touchstart', prevent)
    el.removeEventListener('touchmove', prevent)
    el.removeEventListener('gesturestart', prevent)
    pointers.clear()
  }
}
