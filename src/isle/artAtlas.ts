/**
 * Slice 1e art atlas — load once, drawImage stamps.
 * Locked names under /art/ (Vite public).
 */

export type IsleArt = {
  mossTile: HTMLImageElement
  mossAtlas: HTMLImageElement
  rockStrata: HTMLImageElement
  streamSparkles: HTMLImageElement
  waterSparkle: HTMLImageElement
  shoreStones: HTMLImageElement
  pine: HTMLImageElement
  cabin: HTMLImageElement
  hatWren: HTMLImageElement
  hatBram: HTMLImageElement
  gnomeRed: HTMLImageElement
  gnomeBlue: HTMLImageElement
  ready: boolean
}

const PATHS = {
  mossTile: '/art/moss-tile.png',
  mossAtlas: '/art/moss-atlas.png',
  rockStrata: '/art/rock-strata.png',
  streamSparkles: '/art/stream-sparkles.png',
  waterSparkle: '/art/water-sparkle.png',
  shoreStones: '/art/shore-stones.png',
  pine: '/art/pine.png',
  cabin: '/art/cabin-moss-roof.png',
  hatWren: '/art/hat-wren.png',
  hatBram: '/art/hat-bram.png',
  gnomeRed: '/art/gnome-red.png',
  gnomeBlue: '/art/gnome-blue.png',
} as const

let _art: IsleArt | null = null
let _loading = false

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`art load failed: ${src}`))
    img.src = src
  })
}

/** Kick off loads; safe to call every frame. */
export function ensureArt(): IsleArt {
  if (_art) return _art
  _art = {
    mossTile: new Image(),
    mossAtlas: new Image(),
    rockStrata: new Image(),
    streamSparkles: new Image(),
    waterSparkle: new Image(),
    shoreStones: new Image(),
    pine: new Image(),
    cabin: new Image(),
    hatWren: new Image(),
    hatBram: new Image(),
    gnomeRed: new Image(),
    gnomeBlue: new Image(),
    ready: false,
  }
  if (!_loading) {
    _loading = true
    void (async () => {
      try {
        const entries = Object.entries(PATHS) as [keyof typeof PATHS, string][]
        const imgs = await Promise.all(entries.map(([, p]) => loadImg(p)))
        const a = _art!
        for (let i = 0; i < entries.length; i++) {
          const key = entries[i]![0]
          ;(a as unknown as Record<string, HTMLImageElement>)[key] = imgs[i]!
        }
        a.ready = true
      } catch (e) {
        console.warn('[isle art]', e)
        // Keep ready false — renderer falls back to flat fills
      }
    })()
  }
  return _art
}
