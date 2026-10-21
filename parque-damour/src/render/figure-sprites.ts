// src/render/figure-sprites.ts
// The sprite cache of the figures and the creatures (03 15.2; the tree sprite cache's idiom, GV 6782-6790): a drawing made once into
// its own canvas at the zoom and the device pixel ratio, keyed by everything it reads, and blitted 1:1 on the device pixel grid while the
// zoom is the sprite's own (scaled only at Fit, where the zoom is rounded to 1/64). Past a pixel budget the oldest sprites go first.
// render/people.ts builds the keys (the look, the pose, the walk frame) and paints through the Tailored rig or creatures.ts: every sprite
// is the rig's own drawing, so the cache changes no look, only the in-betweens of the walk and the breath are snapped.
// The light is not in the key: each sprite remembers the light it was painted in (SpriteLight: the ambient in steps, people.ts LIGHT) and
// is repainted in place, on its own canvas, when the light has moved. A sprite one step off is repainted while this frame's SPRITE_REPAINTS
// last and otherwise blitted as it is until a later frame repaints it; a sprite two steps off, or a new one, is painted at once (a straight
// draw would cost the same and be lost). So the light changing at dusk spreads its repaints over the frames instead of repainting every
// figure in the frame the light steps (the S4 rig review: the draw EMA over 03 7.9's 8.6 ms while the light moved).
// NEW (S4 rig stage, perf of 03 7.9): no GV range beyond the idiom of flora.ts treeSpriteOf.
import type { Pt } from './ambient.ts';

/** The light a sprite is painted in: the ambient's steps (people.ts LIGHT) and the warm target (the morning's or the afternoon's). */
export type SpriteLight = { l: number; a: number; t: number };
export type Sprite = {
  c: HTMLCanvasElement; w: number; hh: number; ax: number; ay: number; zq: number; bytes: number; ox: number; oy: number;
  l: number; a: number; t: number;
};
/** The sprites' pixel budget: past it the oldest go first (FIFO by insertion, Map order). */
const SPRITE_BYTES = 32 * 1024 * 1024;
/** Sprites one light step off repainted per frame at most (perf, 03 7.9: about 0.5 ms each at zoom 1.3). */
export const SPRITE_REPAINTS = 4;
const SPRITES = new Map<string, Sprite>();
let bytes = 0;
let repaints = SPRITE_REPAINTS;
const AT0: Pt = { x: 0, y: 0 };

/** A new frame: SPRITE_REPAINTS (or `n`) repaints are left. */
export function spriteFrame(n = SPRITE_REPAINTS): void {
  repaints = n;
}

/** Is a sprite in this light, or one step off it (each step at most 1, the same warm target)? */
const same = (sp: Sprite, L: SpriteLight): boolean => sp.l === L.l && sp.a === L.a && sp.t === L.t;
const near = (sp: Sprite, L: SpriteLight): boolean => sp.t === L.t && Math.abs(sp.l - L.l) <= 1 && Math.abs(sp.a - L.a) <= 1;

/** Paint a sprite's canvas from the default state, the context scaled to CSS px; `paint` may return a point (a dog's collar). */
function paintInto(sp: Sprite, dpr: number, paint: (g: CanvasRenderingContext2D, at: Pt) => Pt | null): void {
  const g = sp.c.getContext('2d');
  sp.ox = 0;
  sp.oy = 0;
  if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, sp.c.width, sp.c.height);
  g.save();
  g.scale(dpr, dpr);
  AT0.x = sp.ax;
  AT0.y = sp.ay;
  const q = paint(g, AT0);
  g.restore();
  if (q) {
    sp.ox = q.x - sp.ax;
    sp.oy = q.y - sp.ay;
  }
}

/**
 * The sprite under `key` in light L: a canvas w x hh CSS px at `dpr` with its anchor (ax, ay), painted by `paint` at zoom zq. A sprite
 * painted one light step off is repainted in place while this frame's repaints last, else returned as it is; further off, it is
 * repainted in place; a new one is painted.
 */
export function spriteFor(
  key: string, L: SpriteLight, zq: number, dpr: number, w: number, hh: number, ax: number, ay: number,
  paint: (g: CanvasRenderingContext2D, at: Pt) => Pt | null,
): Sprite {
  const hit = SPRITES.get(key);
  if (hit && same(hit, L)) return hit;
  if (hit && near(hit, L)) {
    if (repaints <= 0) return hit;
    repaints--;
  }
  if (hit && hit.w === w && hit.hh === hh && hit.ax === ax && hit.ay === ay) {
    paintInto(hit, dpr, paint);
    hit.l = L.l;
    hit.a = L.a;
    hit.t = L.t;
    return hit;
  }
  if (hit) {
    SPRITES.delete(key);
    bytes -= hit.bytes;
  }
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil(hh * dpr));
  const sp: Sprite = { c, w, hh, ax, ay, zq, bytes: c.width * c.height * 4, ox: 0, oy: 0, l: L.l, a: L.a, t: L.t };
  paintInto(sp, dpr, paint);
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
