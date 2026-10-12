// src/render/draw.ts
// The pipeline (03 7.9): ambient, sky, apron ground, tiles, water, the depth-sorted drawables, the overlays of the ghost, selection and
// focus pin, and the weather overlay. Owns the canvas context the passes fall back to (03 2.7: `ctx`, or `getCtx()`).
// Ported from GV 12042-12053 (draw), 6334 (initRender), 9578-9600 (the pipeline head: ground, then the sorted things on it), 9634
// (frontKey: a multi-tile prop at the largest depth of its footprint, now order.footprintDepth inside each module's drawables).
// Verdict: PORT. Changes: eight phases instead of GV's one tile walk (03 7.9); the sky paints the whole canvas, the city haze below the
// horizon included (backdrop.drawSky), so there is no separate clear; the drawables of the apron, the props and the particles are
// collected into one reused list and sorted together by order.sortByDepth each frame (figures and creatures join in S4); the transform is
// put back to CSS pixels between phases, so no pass depends on the one before it restoring.
// Dropped from the range: GV's per-tile bucket rules for heights and shores (9604-9977), the shadows switch (12041), the drawn surface.
import { computeAmbient } from './ambient.ts';
import { view } from './camera.ts';
import { apronGround, drawSky } from './backdrop.ts';
import { apronDrawables } from './apron.ts';
import { drawGround } from './ground.ts';
import { drawWater } from './water.ts';
import { propDrawables } from './props.ts';
import { drawWeatherOverlay, particleDrawables } from './effects.ts';
import { drawFocusMark, drawGhost, drawSelection } from './ghost.ts';
import { sortByDepth, type Drawable } from './order.ts';

/** The canvas context every pass draws on when it is not handed one (ground.ctxOf and flora.renderCtx read this export). */
export let ctx: CanvasRenderingContext2D | null = null;

export function initRender(canvas: HTMLCanvasElement): void {
  const c = canvas.getContext('2d');
  if (!c) throw new Error('no 2d context');
  ctx = c;
}

export function getCtx(): CanvasRenderingContext2D {
  if (!ctx) throw new Error('render not initialised');
  return ctx;
}

/** Phase 6's list, reused frame to frame: the modules hand back reused arrays good for one frame, so their items are copied in here. */
const ITEMS: Drawable[] = [];

function css(c: CanvasRenderingContext2D): void {
  c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
}

/** One frame of the scene (03 7.9). Reads the sim, writes nothing to it. */
export function draw(): void {
  const c = getCtx();
  // 1 the light of this frame, CSS pixels, no smoothing (GV 12044)
  computeAmbient();
  css(c);
  c.imageSmoothingEnabled = false;
  // 2 the sky, the skyline and the city haze over the whole canvas (the offscreen backdrop, at most every 260 ms)
  drawSky(c);
  // 3 the apron ground: the river, the quay, the pavement, the street, the far bank
  css(c);
  apronGround(c);
  // 4 the park's tiles, ribbons, petals, puddles, detail and bed flowers
  css(c);
  drawGround(c);
  // 5 the ponds and canals (cached outlines)
  css(c);
  drawWater(c);
  // 6 everything standing on the ground, back to front
  css(c);
  ITEMS.length = 0;
  for (const d of apronDrawables()) ITEMS.push(d);
  for (const d of propDrawables()) ITEMS.push(d);
  for (const d of particleDrawables()) ITEMS.push(d);
  sortByDepth(ITEMS);
  for (const d of ITEMS) d.draw(d, c);
  // 7 the ghost panes, the selection ring, the focus pin (S3 fills them)
  css(c);
  drawGhost(null);
  drawSelection();
  drawFocusMark();
  // 8 the weather overlay and the fog wash (S9)
  drawWeatherOverlay();
}
