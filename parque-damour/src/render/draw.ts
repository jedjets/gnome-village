// src/render/draw.ts
// The pipeline (03 7.9): ambient, sky, apron ground, tiles, sorted drawables. Owns the canvas context.
// Ported from GV 12042-12053 (draw) and 6334 (initRender). PORT; S0 draws the flat park, the apron bands and the facade blocks only.
// TODO(S2): drawWater, props, figures, creatures, particles, ghost, selection, focus mark, weather overlay (phases 5-8).
import { computeAmbient, skyColour } from './ambient.ts';
import { view } from './camera.ts';
import { apronGround, apronDrawables } from './backdrop.ts';
import { drawGround } from './ground.ts';
import { sortByDepth } from './order.ts';

let ctx: CanvasRenderingContext2D | null = null;

export function initRender(canvas: HTMLCanvasElement): void {
  const c = canvas.getContext('2d');
  if (!c) throw new Error('no 2d context');
  ctx = c;
}

export function getCtx(): CanvasRenderingContext2D {
  if (!ctx) throw new Error('render not initialised');
  return ctx;
}

export function draw(): void {
  const c = getCtx();
  computeAmbient();
  c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  c.imageSmoothingEnabled = false;
  c.fillStyle = skyColour();
  c.fillRect(0, 0, view.cw, view.chh);
  apronGround(c);
  drawGround(c);
  const items = apronDrawables();
  sortByDepth(items);
  for (const d of items) d.draw(d, c);
}
