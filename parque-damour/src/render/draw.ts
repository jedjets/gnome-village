// src/render/draw.ts
// The pipeline (03 7.9): ambient, sky, apron ground, tiles, water, the depth-sorted drawables, the overlays of the ghost, selection and
// focus pin, and the weather overlay. Owns the canvas context the passes fall back to (03 2.7: `ctx`, or `getCtx()`).
// Ported from GV 12042-12053 (draw), 6334 (initRender), 9578-9600 (the pipeline head: ground, then the sorted things on it), 9634
// (frontKey: a multi-tile prop at the largest depth of its footprint, now order.footprintDepth inside each module's drawables).
// Verdict: PORT. Changes: eight phases instead of GV's one tile walk (03 7.9); the sky paints the whole canvas, the city haze below the
// horizon included (backdrop.drawSky), so there is no separate clear; the drawables of the apron, the props and the particles are
// collected into one reused list and sorted together by order.sortByDepth each frame (the people and creatures of people.ts with them
// from S4 part C); the transform is
// put back to CSS pixels between phases, so no pass depends on the one before it restoring; phase 4 ends with the lamps' ground pools,
// the park's and the street's, at most 24 nearest the camera centre (04 6.2 item 4, 10.2 item 2; 03 7.3 item 5), under every drawable.
// Dropped from the range: GV's per-tile bucket rules for heights and shores (9604-9977), the shadows switch (12041), the drawn surface.
import type { XY } from '../core/math.ts';
import { props } from '../world/grid.ts';
import { streetLamps } from '../world/park.ts';
import { computeAmbient, lampGlow } from './ambient.ts';
import { TH, TW, VANCH, cam, screenToWorld, view } from './camera.ts';
import { screenInto } from './project.ts';
import { apronGround, drawSky } from './backdrop.ts';
import { apronDrawables } from './apron.ts';
import { drawGround, groundQuality } from './ground.ts';
import { drawWater } from './water.ts';
import { drawLampPool, lampOn, propDrawables } from './props.ts';
import { gamePen } from './flora.ts';
import { drawWeatherOverlay, particleDrawables } from './effects.ts';
import { drawFocusMark, drawGhost, drawSelection, type Ghost } from './ghost.ts';
import { peopleDrawables } from './people.ts';
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

/* ---------- phase 4's last pass: the lamps' ground pools (04 6.1, 6.2 item 4, 10.2 item 2; 03 7.3 item 5) ---------- */
type Pool = { sx: number; sy: number; g: number; d: number };
const POOLS: Pool[] = [];
/** 04 10.2 item 2: at most 24 pools a frame, the nearest the camera centre; the other lamps draw their lit globes and halo only. */
const MAX_POOLS = 24;
const PC: XY = { x: 0, y: 0 }, PS: XY = { x: 0, y: 0 };
const byNear = (a: Pool, b: Pool): number => a.d - b.d;
/** The pool at full glow, painted once by props.drawLampPool for this zoom and dpr (its colour reads the palette only, not the light);
 *  each pool blits it at its lamp's foot, snapped to the device pixel, at globalAlpha = the lamp's glow (the pool's alpha is linear in
 *  it), so 24 pools cost 24 blits instead of 24 gradients. */
const PSP = { c: null as HTMLCanvasElement | null, key: '', hw: 0, hh: 0 };
function poolSprite(): typeof PSP | null {
  const z = cam.z, d = view.dpr, key = z + '|' + d;
  if (PSP.key === key) return PSP.c ? PSP : null;
  PSP.key = key;
  if (typeof document === 'undefined') return (PSP.c = null);
  const R = 3 * TW * z, hw = Math.ceil(R) + 1, hh = Math.ceil(R * (TH / TW)) + 1;
  const cv = PSP.c ?? (PSP.c = document.createElement('canvas'));
  cv.width = Math.ceil(2 * hw * d);
  cv.height = Math.ceil(2 * hh * d);
  const x = cv.getContext('2d');
  if (!x) return (PSP.c = null);
  x.setTransform(d, 0, 0, d, 0, 0);
  const pen = gamePen(x);
  PS.x = hw;
  PS.y = hh;
  drawLampPool(pen, PS, { lit: true });
  PSP.hw = hw;
  PSP.hh = hh;
  return PSP;
}

/**
 * The ground pool (props.drawLampPool) under every lit lamp, the park's (props.lampOn: the lamps' hours and fade, or a litUntil) and
 * the street's (park.streetLamps: the hours and fade only, never the c_lamplight boost), after the tiles and under every drawable: of the
 * pools on screen, the 24 nearest the camera centre (the view anchor, by world distance); none at quality level 1 and up (03 13: level 1
 * drops the lamp halos; ground.ts holds the level main.ts hands in).
 */
function drawLampPools(c: CanvasRenderingContext2D): void {
  if (groundQuality() >= 1) return;
  const R = 3 * TW * cam.z, Ry = R * (TH / TW), street = lampGlow();
  screenToWorld(view.cw / 2, view.chh * VANCH, PC);
  let n = 0;
  const add = (x: number, y: number, g: number): void => {
    if (g <= 0) return;
    screenInto(x, y, 0, PS);
    if (PS.x + R < 0 || PS.x - R > view.cw || PS.y + Ry < 0 || PS.y - Ry > view.chh) return;
    const p = POOLS[n] ?? (POOLS[n] = { sx: 0, sy: 0, g: 0, d: 0 });
    p.sx = PS.x;
    p.sy = PS.y;
    p.g = g;
    p.d = Math.hypot(x - PC.x, y - PC.y);
    n++;
  };
  for (const p of props) if (p.kind === 'lamp') add(p.x, p.y, lampOn(p));
  if (street > 0) for (const l of streetLamps()) add(l.x, l.y, street);
  if (n === 0) return;
  if (n > MAX_POOLS) {
    for (let i = n; i < POOLS.length; i++) (POOLS[i] as Pool).d = Infinity; // last frame's spares sort last (the list is reused)
    POOLS.sort(byNear);
  }
  const sp = poolSprite(), k = view.dpr;
  for (let i = 0; i < Math.min(n, MAX_POOLS); i++) {
    const p = POOLS[i] as Pool;
    if (sp?.c) {
      c.globalAlpha = p.g;
      c.drawImage(sp.c, Math.round((p.sx - sp.hw) * k) / k, Math.round((p.sy - sp.hh) * k) / k, sp.c.width / k, sp.c.height / k);
    } else {
      PS.x = p.sx;
      PS.y = p.sy;
      drawLampPool(gamePen(c), PS, { lit: true, glow: p.g });
    }
  }
  c.globalAlpha = 1;
}

/**
 * One frame of the scene (03 7.9). Reads the sim, writes nothing to it. `ghost` and `sel` are phase 7's inputs the shell holds (render
 * cannot import ui, 03 2.1): the armed big stamp's or run's ghost (ui/rail.ts armedGhost(); null draws no panes) and the selected
 * visitor's id for the selection ring (ui/card.ts; 0 draws none).
 */
export function draw(ghost: Ghost | null = null, sel = 0): void {
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
  // 4 the park's tiles, ribbons, petals, puddles, detail and bed flowers; then the lamps' ground pools over them and the apron's ground
  css(c);
  drawGround(c);
  css(c);
  drawLampPools(c);
  // 5 the ponds and canals (cached outlines)
  css(c);
  drawWater(c);
  // 6 everything standing on the ground, back to front
  css(c);
  ITEMS.length = 0;
  for (const d of apronDrawables()) ITEMS.push(d);
  for (const d of propDrawables()) ITEMS.push(d);
  for (const d of peopleDrawables()) ITEMS.push(d);
  for (const d of particleDrawables()) ITEMS.push(d);
  sortByDepth(ITEMS);
  for (const d of ITEMS) d.draw(d, c);
  // 7 the ghost panes (S3), the selection ring (S4), the focus pin (S5)
  css(c);
  drawGhost(c, ghost);
  drawSelection(c, sel);
  drawFocusMark(c);
  // 8 the weather overlay and the fog wash (S9)
  drawWeatherOverlay();
}
