// src/render/figure-sprites.ts
// The sprite cache of the figures and the creatures (03 15.2; the tree sprite cache's idiom, GV 6782-6790): a drawing made once into
// its own canvas at the zoom and the device pixel ratio, keyed by everything it reads, and blitted 1:1 on the device pixel grid while the
// zoom is the sprite's own (scaled only at Fit, where the zoom is rounded to 1/64). Past a pixel budget the oldest sprites go first.
// render/people.ts builds the keys (the look, the pose, the walk frame, the light) and paints through the Tailored rig or creatures.ts:
// every sprite is the rig's own drawing, so the cache changes no look, only the in-betweens of the walk and the breath are snapped.
// NEW (S4 rig stage, perf of 03 7.9): no GV range beyond the idiom of flora.ts treeSpriteOf.
import type { Pt } from './ambient.ts';

export type Sprite = { c: HTMLCanvasElement; w: number; hh: number; ax: number; ay: number; zq: number; bytes: number; ox: number; oy: number };
/** The sprites' pixel budget: past it the oldest go first (FIFO by insertion, Map order). */
const SPRITE_BYTES = 32 * 1024 * 1024;
const SPRITES = new Map<string, Sprite>();
let bytes = 0;
const AT0: Pt = { x: 0, y: 0 };

/**
 * The sprite under `key`, or a new one: a canvas w x hh CSS px at `dpr` with its anchor (ax, ay), painted by `paint` at zoom zq with the
 * context scaled to CSS px; `paint` may return a point (a dog's collar), kept as the offset (ox, oy) from the anchor.
 */
export function spriteFor(
  key: string, zq: number, dpr: number, w: number, hh: number, ax: number, ay: number,
  paint: (g: CanvasRenderingContext2D, at: Pt) => Pt | null,
): Sprite {
  const hit = SPRITES.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil(hh * dpr));
  const g = c.getContext('2d');
  let ox = 0, oy = 0;
  if (g) {
    g.scale(dpr, dpr);
    AT0.x = ax;
    AT0.y = ay;
    const q = paint(g, AT0);
    if (q) {
      ox = q.x - ax;
      oy = q.y - ay;
    }
  }
  const sp: Sprite = { c, w, hh, ax, ay, zq, bytes: c.width * c.height * 4, ox, oy };
  bytes += sp.bytes;
  for (const [k, old] of SPRITES) {
    if (bytes <= SPRITE_BYTES) break;
    SPRITES.delete(k);
    bytes -= old.bytes;
  }
  SPRITES.set(key, sp);
  return sp;
}

/** Blit a sprite with its anchor at screen point (x, y): 1:1 on the device pixel grid at its own zoom, else scaled to the zoom z. */
export function blit(c: CanvasRenderingContext2D, sp: Sprite, x: number, y: number, z: number, dpr: number): void {
  if (sp.zq === z) {
    c.drawImage(sp.c, Math.round((x - sp.ax) * dpr) / dpr, Math.round((y - sp.ay) * dpr) / dpr, sp.c.width / dpr, sp.c.height / dpr);
    return;
  }
  const k = z / sp.zq;
  c.drawImage(sp.c, x - sp.ax * k, y - sp.ay * k, sp.w * k, sp.hh * k);
}
