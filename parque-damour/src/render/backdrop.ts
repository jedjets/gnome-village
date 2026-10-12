// src/render/backdrop.ts
// What lies round the park (03 7.4; 04 6.4): the sky, painted with the skyline band and the distant city into an offscreen canvas at
// most every 260 ms; and the apron ground (the street and pavement east, south and west, the quay, the river 0.3 EH below it, the far
// bank). The apron drawables the painter sorts with the props (railings, gates, facade blocks, boats) are apron.ts's, which shares the
// apron's edges and the wall helpers below. The board's sky band (04 4.2 tile 12) is kept as it was: its B and C branches are frozen
// for style-board.html (04 3.4).
// Ported from GV 6497-6507 (initBackdrop, rampSky), 6511 (horizonY), 6525-6534 (drawSky: the offscreen cache), 6535-6618 (paintSky,
// drawClouds), 6574-6579 (the far-shore bands, as the skyline), 6953-6965 (wp, faceVis, faceLight, shade, h01: the iso box kit).
// Verdict: ADAPT. Changes: the sun arcs from the left at f 0.25 to the right at f 0.80 across the top of the sky (03 7.4 item 1; GV's
// ellipse put it off the right edge at noon, review 16) and the moon takes its own arc by night; the 70 stars and the clouds are placed
// by h01 and move on sim seconds and W.drift (GV seeded them on the visual stream and twinkled them on the wall clock), and 3 clouds
// show in fair weather and 8 when cloudy (04 10.5); the crescent is bitten by the sky's own colour (04 12: source-over only); the cache
// is keyed on the size, the dpr, the horizon, the zoom and round(cam.ang / 0.02) (09 2.6), and a scripted draw that does not move the
// frame clock repaints when the sky's time or cloud moves; the open sea below the horizon became the city in haze, and the far-shore sine
// bands became two rows of roofs, three domes and the Eiffel Tower laid out by world bearing, so a quarter turn carries them a quarter
// of the strip and the tower keeps its north-west bearing (the strip runs the way the bearing turns on screen: +cam.ang, where 03 7.4
// item 2 writes -cam.ang); walls are faces of world points, culled by faceVis and lit by faceLight.
// Dropped from the range: the storm bank and its veil (6538, 6585-6604), seaPlaneCol and the sea gradient (6517-6523, 6565-6573), the
// horizon line (6580), cobbles, logEnd and the house kit (6967-7035).
// TODO(S9): mist greys the far bank and skyline further (04 10.5).
import { clamp, clamp01, css, hx, mixc, TAU, type RGB, type XY } from '../core/math.ts';
import { DAYLEN, T } from '../core/clock.ts';
import { W } from '../core/weather.ts';
import { now } from '../core/loop.ts';
import { N } from '../world/grid.ts';
import { APRON, BACKDROP, GATES, SKYLINE } from '../world/park.ts';
import { BOX, EH, TH, TW, cam, rotVec, view } from './camera.ts';
import { screenInto } from './project.ts';
import { ctxOf, setWorldTransform } from './ground.ts';
import { drawRiver } from './water.ts';
import {
  AT, AA, FOGA, GC, MOON, SKY_GREY, SUN, WHITE, faceLight, h01, inkLine, lampGlow, lit, mix, shade, skyRamp, style,
  type Pen, type Pt,
} from './ambient.ts';

/* ---------- the board's sky band (04 4.2 tile 12), as built in S1; the game's sky is paintSky below ---------- */

/** Paint the sky for day fraction `f` and `light` into the rectangle (x, y, w, h): ramp, stars, sun or moon, clouds. */
export function paintSkyBand(pen: Pen, f: number, light: number, x: number, y: number, w: number, h: number, cloud = 0.3): void {
  const { ctx, spec } = pen;
  const P = spec.palette;
  let [t, b] = skyRamp(spec, f);
  if (spec.id === 'C') {
    // C: the ramp is mostly paper; the night and golden colours stay as tints on it (04 3.2 row Sky)
    const paper = hx(P.paper);
    const k = 0.45 + 0.25 * light;
    t = mixc(t, paper, k * 0.8);
    b = mixc(b, paper, k);
  }
  const fog = hx(P.fog);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css(mixc(t, fog, FOGA * 0.5)));
  g.addColorStop(1, css(mixc(b, fog, FOGA * 0.55)));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // stars when the light is low (GV 6544-6551), fixed by hash so a screenshot repeats
  const na = clamp01(1 - light * 2.4);
  if (na > 0.02) {
    ctx.fillStyle = css(WHITE);
    for (let i = 0; i < 40; i++) {
      const sx = x + h01(i, 1) * w, sy = y + h01(i, 2) * h * 0.6, s = 0.6 + h01(i, 3) * 1.1;
      ctx.globalAlpha = na * (0.35 + 0.4 * h01(i, 4)) * (1 - cloud * 0.8);
      ctx.fillRect(sx, sy, s, s);
    }
    ctx.globalAlpha = 1;
  }
  // the sun on an arc from the left at f 0.25 to the right at f 0.80; the moon at night (03 7.4 item 1)
  const isSun = light > 0.16;
  const tt = clamp01((f - 0.25) / 0.55);
  const sx = isSun ? x + w * (0.12 + 0.76 * tt) : x + w * 0.78;
  const sy = isSun ? y + h * (0.95 - Math.sin(tt * Math.PI) * 0.75) : y + h * 0.28;
  const rr = (isSun ? 0.11 : 0.08) * h;
  const body = hx(isSun ? SUN : MOON);
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr * 4);
  glow.addColorStop(0, css(mixc(body, AT, AA), isSun ? 0.42 : 0.28));
  glow.addColorStop(1, css(WHITE, 0));
  ctx.globalAlpha = 1 - cloud * 0.55;
  ctx.fillStyle = glow;
  ctx.fillRect(sx - rr * 4, sy - rr * 4, rr * 8, rr * 8);
  ctx.globalAlpha = 1;
  if (spec.id === 'C') {
    // a sun left as paper inside an ink ring, a moon as an ink crescent
    ctx.fillStyle = css(mixc(body, hx(P.paper), 0.5));
    ctx.beginPath();
    ctx.arc(sx, sy, rr, 0, Math.PI * 2);
    ctx.fill();
    const ring: Pt[] = [];
    for (let i = 0; i < 16; i++) ring.push({ x: sx + Math.cos((i / 16) * Math.PI * 2) * rr, y: sy + Math.sin((i / 16) * Math.PI * 2) * rr });
    inkLine(pen, ring, { seed: 5, inkAlpha: 0.8 });
  } else {
    ctx.fillStyle = css(body);
    ctx.beginPath();
    ctx.arc(sx, sy, rr, 0, Math.PI * 2);
    ctx.fill();
    if (!isSun) {
      ctx.fillStyle = css(mixc(t, b, 0.3));
      ctx.beginPath();
      ctx.arc(sx + rr * 0.55, sy - rr * 0.35, rr * 0.86, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  drawClouds(pen, x, y, w, h, b, light, cloud);
}

/** Clouds in the direction's manner: soft in A (GV drawClouds idea), 3 flat discs in B, unpainted paper with an ink underline in C. */
function drawClouds(pen: Pen, x: number, y: number, w: number, h: number, bottom: RGB, light: number, cloud: number): void {
  const { ctx, spec } = pen;
  const P = spec.palette;
  const n = Math.round(2 + cloud * 4);
  for (let i = 0; i < n; i++) {
    const cx = x + w * (0.1 + 0.8 * h01(i + 20, 1)), cy = y + h * (0.18 + 0.4 * h01(i + 20, 2)), s = h * (0.12 + 0.12 * h01(i + 20, 3));
    const tone = mixc(mixc(hx(P.paper), bottom, 0.25), lit([255, 255, 255]), 0.1);
    const col = lit([tone[0] * (0.55 + 0.45 * light) + 60 * (1 - light), tone[1] * (0.55 + 0.45 * light) + 60 * (1 - light), tone[2] * (0.6 + 0.4 * light) + 70 * (1 - light)]);
    const lobes: Array<[number, number, number]> = [[-0.9, 0.1, 0.55], [0, -0.15, 0.75], [0.95, 0.12, 0.5]];
    if (spec.id === 'A') {
      ctx.fillStyle = css(col, 0.55 + 0.3 * h01(i + 20, 4));
      ctx.beginPath();
      for (const [lx, ly, lr] of lobes) {
        ctx.moveTo(cx + lx * s + lr * s, cy + ly * s);
        ctx.ellipse(cx + lx * s, cy + ly * s, lr * s * 1.3, lr * s * 0.7, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    } else if (spec.id === 'B') {
      ctx.fillStyle = css(col, 0.95);
      ctx.beginPath();
      for (const [lx, ly, lr] of lobes) {
        ctx.moveTo(cx + lx * s + lr * s, cy + ly * s);
        ctx.arc(cx + lx * s, cy + ly * s, lr * s, 0, Math.PI * 2);
      }
      ctx.rect(cx - 1.4 * s, cy + 0.05 * s, 2.8 * s, 0.45 * s);
      ctx.fill();
    } else {
      // C: the cloud is the paper itself; one ink line underlines it
      ctx.fillStyle = GC(P.paper, 0.9);
      ctx.beginPath();
      for (const [lx, ly, lr] of lobes) {
        ctx.moveTo(cx + lx * s + lr * s, cy + ly * s);
        ctx.ellipse(cx + lx * s, cy + ly * s, lr * s * 1.3, lr * s * 0.8, 0, 0, Math.PI * 2);
      }
      ctx.fill();
      inkLine(pen, [{ x: cx - 1.5 * s, y: cy + 0.5 * s }, { x: cx - 0.3 * s, y: cy + 0.62 * s }, { x: cx + 1.5 * s, y: cy + 0.5 * s }], { open: true, seed: i + 40, inkAlpha: 0.7 });
    }
  }
}

/* ---------- the game's sky: one offscreen backdrop, repainted at most every 260 ms (GV drawSky 6525-6534) ---------- */
/** The apron's outer edges in world units (-8.5 and 55.5). */
export const LO = -APRON - 0.5, HI = N + APRON - 0.5;
const FAR = BACKDROP.farBankFrom - BACKDROP.facadeDepth + 0.5; // the far bank's back edge (-10.5)
/** The river lies 0.3 EH under the quay (04 6.4 row quay: the wall is 0.3 high). */
export const RIVER_DROP = 0.3;
const SP: XY = { x: 0, y: 0 };
let skyC: HTMLCanvasElement | null = null, skyG: CanvasRenderingContext2D | null = null;
let skyAt = -1e9, skyKey = '', skySim = '';

/** The screen y of the farthest corner of the drawn ground (the park, the apron and the far bank), less half a tile (GV horizonY 6511). */
export function horizonY(): number {
  let y = Infinity;
  for (const [x, yy] of [[LO, FAR], [HI, FAR], [HI, HI], [LO, HI]] as const) y = Math.min(y, screenInto(x, yy, 0, SP).y);
  return y - (TH / 2) * cam.z;
}

/** Phase 2 (03 7.9): blit the backdrop, repainting it first when the view moved or 260 ms have passed; then the tower's beacon. */
export function drawSky(c?: CanvasRenderingContext2D): void {
  const ctx = ctxOf(c), cv = ctx.canvas;
  if (!skyC) {
    skyC = document.createElement('canvas');
    skyG = skyC.getContext('2d');
  }
  if (!skyG) return;
  const hy = horizonY(), t = now();
  const key = cv.width + 'x' + cv.height + '|' + view.dpr + '|' + Math.round(hy / 3) + '|' + Math.round(cam.z * 40) + '|' + Math.round(cam.ang / 0.02);
  const sim = Math.round(T.f * 2000) + ',' + Math.round(W.cloud * 40) + ',' + Math.round(W.drift / 8);
  if (key !== skyKey || t - skyAt > 260 || t < skyAt || (t === skyAt && sim !== skySim)) {
    if (skyC.width !== cv.width || skyC.height !== cv.height) {
      skyC.width = cv.width;
      skyC.height = cv.height;
    }
    skyG.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    paintSky(skyG, hy);
    skyAt = t;
    skyKey = key;
    skySim = sim;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(skyC, 0, 0);
  ctx.restore();
  beacon(ctx, hy);
}

/** The sky ramp greyed by cloud and fogged, stars, the sun or moon, clouds, the skyline, and the city in haze below the horizon. */
function paintSky(g: CanvasRenderingContext2D, hy: number): void {
  const spec = style(), P = spec.palette, cw = view.cw, chh = view.chh, fog = hx(P.fog);
  let [t, b] = skyRamp(spec, T.f);
  const gr = clamp01(W.cloud * 0.35); // a grey sky under cloud (GV 6537-6538, without the storm bank)
  if (gr > 0.01) {
    t = mixc(t, hx(SKY_GREY[0]), gr);
    b = mixc(b, hx(SKY_GREY[1]), gr * 0.8);
  }
  t = mixc(t, fog, FOGA * 0.5);
  b = mixc(b, fog, FOGA * 0.55);
  const sh = clamp(hy, chh * 0.12, chh); // the sky's own height: its bottom colour sits on the horizon
  const gg = g.createLinearGradient(0, 0, 0, sh);
  gg.addColorStop(0, css(t));
  gg.addColorStop(1, css(b));
  g.fillStyle = gg;
  g.fillRect(0, 0, cw, chh);
  const ts = T.abs * DAYLEN;
  const na = clamp01(1 - T.light * 2.4); // stars below light 0.42 (GV 6543-6551)
  if (na > 0.02) {
    g.fillStyle = css(WHITE);
    for (let i = 0; i < 70; i++) {
      g.globalAlpha = na * (0.35 + 0.4 * (0.5 + 0.5 * Math.sin(ts * 1.2 + h01(i, 4, 71) * TAU))) * (1 - W.cloud * 0.8);
      const s = 0.6 + h01(i, 3, 71) * 1.1;
      g.fillRect(h01(i, 1, 71) * cw, h01(i, 2, 71) * sh * 0.92, s, s);
    }
    g.globalAlpha = 1;
  }
  // the sun on the corrected arc, left at f 0.25 to right at f 0.80 (03 7.4 item 1), up from dawn to the middle of dusk; the moon on its
  // own arc from then to dawn (GV showed the sun while light > 0.16, which left it on the horizon until f 0.90)
  const isSun = T.f >= 0.2 && T.f < 0.84;
  const k = isSun ? clamp01((T.f - 0.25) / 0.55) : clamp01(((((T.f - 0.84) % 1) + 1) % 1) / 0.36);
  const sx = cw * (0.12 + 0.76 * k), sy = sh * (0.86 - 0.66 * Math.sin(k * Math.PI)), rr = isSun ? 17 : 12;
  const body = hx(isSun ? SUN : MOON);
  const gl = g.createRadialGradient(sx, sy, 0, sx, sy, rr * 5.5);
  gl.addColorStop(0, css(mixc(body, AT, AA), isSun ? 0.42 : 0.28));
  gl.addColorStop(1, css(WHITE, 0));
  g.globalAlpha = 1 - W.cloud * 0.55;
  g.fillStyle = gl;
  g.fillRect(sx - rr * 5.5, sy - rr * 5.5, rr * 11, rr * 11);
  g.fillStyle = css(body);
  g.beginPath();
  g.arc(sx, sy, rr, 0, TAU);
  g.fill();
  if (!isSun) {
    g.fillStyle = css(mixc(t, b, clamp01(sy / sh))); // the crescent: the sky's own colour bites the disc
    g.beginPath();
    g.arc(sx + rr * 0.55, sy - rr * 0.35, rr * 0.86, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  // fair-weather clouds drifting with W.drift (GV 6605-6617; no pan parallax, which would step at the cache's 4 Hz); 3 fair, 8 cloudy
  const nC = clamp(Math.round(12.5 * W.cloud - 1.25), 0, 10);
  if (nC > 0) {
    g.fillStyle = css(lit(mixc(mixc(b, WHITE, 0.5), fog, FOGA * 0.4)));
    const span = cw * 1.6;
    for (let i = 0; i < nC; i++) {
      let x = (h01(i, 1, 81) * span + W.drift * (0.5 + 0.8 * h01(i, 5, 81)) * 0.5) % span;
      if (x < 0) x += span;
      x -= cw * 0.3;
      const y = (0.05 + 0.45 * h01(i, 2, 81)) * sh, s = 26 + 44 * h01(i, 3, 81);
      g.globalAlpha = (0.35 + 0.5 * h01(i, 4, 81)) * (0.55 + 0.45 * W.cloud);
      g.beginPath();
      g.arc(x, y, s * 0.5, 0, TAU);
      g.arc(x + s * 0.46, y + s * 0.08, s * 0.36, 0, TAU);
      g.arc(x - s * 0.44, y + s * 0.1, s * 0.31, 0, TAU);
      g.arc(x + s * 0.1, y - s * 0.18, s * 0.34, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  if (hy > 0 && hy < chh) skyline(g, hy, b);
  // the city beyond the apron, going into the sky's own haze toward the horizon (where GV laid the open sea, 6565-6573)
  if (hy < chh) {
    const city = lit(hx(mix(P.flagstone, P.zinc, 0.4)));
    const pg = g.createLinearGradient(0, hy, 0, chh);
    pg.addColorStop(0, css(mixc(city, b, 0.6 + FOGA * 0.3)));
    pg.addColorStop(1, css(mixc(city, b, 0.15 + FOGA * 0.3)));
    g.fillStyle = pg;
    g.fillRect(0, Math.max(0, hy), cw, chh - Math.max(0, hy));
  }
}

/* ---------- the skyline band (04 6.4 row skyline; 03 7.4 item 2) ---------- */
/** The strip for a whole turn, in px at zoom 1: a quarter of it is the apron's half width, so a side corner sits at a right angle. */
const STRIP = 4 * BOX * (TW / 2);
/** Domes at fixed world bearings (radians from east, y south): north-north-east, south-east, south-west; and their sizes. */
const DOMES: readonly (readonly [number, number])[] = [[-Math.PI / 2 + 0.35, 1.0], [Math.PI / 4 + 0.2, 0.8], [(3 * Math.PI) / 4 - 0.25, 0.9]];

/** The tower's half-width against its height, base to tip, as fractions of H: the bowed legs, the two platforms, the top, the mast. */
const TOWER: readonly number[] = [
  0.19, 0, 0.15, 0.06, 0.12, 0.13, 0.105, 0.17, 0.13, 0.17, 0.13, 0.19, 0.085, 0.19, 0.07, 0.26, 0.055, 0.33, 0.05, 0.36, 0.07, 0.36,
  0.07, 0.375, 0.045, 0.375, 0.032, 0.5, 0.023, 0.65, 0.018, 0.8, 0.03, 0.8, 0.03, 0.83, 0.012, 0.85, 0.004, 0.97, 0, 1,
];

/** Screen x of a world bearing on the strip: the bearing behind the far corner is mid-screen (the strip may repeat at +-STRIP z). */
function bearingX(th: number): number {
  let psi = th + cam.ang + (3 * Math.PI) / 4;
  psi -= TAU * Math.round(psi / TAU);
  return view.cw / 2 + (psi / TAU) * STRIP * cam.z;
}

function skyline(g: CanvasRenderingContext2D, hy: number, b: RGB): void {
  const P = style().palette, z = cam.z, S = BACKDROP.facadeHeight * EH * z, SW = STRIP * z, fog = hx(P.fog), zinc = lit(hx(P.zinc));
  const back = mixc(mixc(zinc, b, 0.7), fog, FOGA * 0.5), front = mixc(mixc(zinc, b, 0.5), fog, FOGA * 0.5);
  roofRow(g, 72, 0.5, 0.42, S, SW, hy, back, 1);
  g.fillStyle = css(back);
  for (const [th, k] of DOMES)
    for (const off of [-SW, 0, SW]) {
      const x = bearingX(th) + off, w = 0.5 * S * k;
      if (x + w < 0 || x - w > view.cw) continue;
      // a drum, a dome and a lantern on its top
      g.beginPath();
      g.rect(x - w / 2, hy - 0.62 * S * k, w, 0.62 * S * k + 2);
      g.ellipse(x, hy - 0.62 * S * k, w * 0.46, 0.42 * S * k, 0, Math.PI, TAU);
      g.rect(x - w * 0.06, hy - 1.12 * S * k, w * 0.12, 0.1 * S * k);
      g.fill();
    }
  g.fillStyle = css(mixc(back, front, 0.6));
  const H = S * SKYLINE.towerScale; // the Eiffel Tower, 2.2 times the facade height, at the north-west bearing (04 6.4)
  for (const off of [-SW, 0, SW]) {
    const x = bearingX(SKYLINE.towerAngle) + off;
    if (x + 0.2 * H < 0 || x - 0.2 * H > view.cw) continue;
    g.beginPath();
    g.moveTo(x - (TOWER[0] as number) * H, hy + 2);
    for (let i = 0; i < TOWER.length; i += 2) g.lineTo(x - (TOWER[i] as number) * H, hy - (TOWER[i + 1] as number) * H);
    for (let i = TOWER.length - 2; i >= 0; i -= 2) g.lineTo(x + (TOWER[i] as number) * H, hy - (TOWER[i + 1] as number) * H);
    g.lineTo(x + (TOWER[0] as number) * H, hy + 2);
    g.closePath();
    // the great arch between the legs, cut out (even-odd)
    g.moveTo(x - 0.12 * H, hy + 2);
    g.quadraticCurveTo(x, hy - 0.2 * H, x + 0.12 * H, hy + 2);
    g.closePath();
    g.fill('evenodd');
  }
  roofRow(g, 120, 0.28, 0.24, S, SW, hy, front, 2);
  // night: 12 lit windows per 100 px of the near row, fading in with the lamps (04 6.4, 10.1 item 4)
  const glow = lampGlow();
  if (glow > 0.01) {
    const sw = SW / 120, dot = Math.max(1, 1.1 * z);
    g.fillStyle = css(hx(P.lamp), 0.85 * glow);
    for (let k = 0; k < 120; k++)
      for (const off of [-SW, 0, SW]) {
        const x0 = bearingX((k / 120) * TAU - Math.PI) + off;
        if (x0 + sw < 0 || x0 > view.cw) continue;
        const h = S * (0.28 + 0.24 * h01(k, 2, 91)), n = Math.floor((12 * sw) / 100 + h01(k, 9, 93));
        for (let q = 0; q < n; q++) g.fillRect(x0 + sw * (0.1 + 0.8 * h01(k, q, 94)), hy - h * (0.15 + 0.65 * h01(k, q, 95)), dot, dot);
      }
  }
}

/** A row of n roofs by bearing: a block with mansard shoulders, height S (base + vary h01), chimney pots on about half of them. */
function roofRow(g: CanvasRenderingContext2D, n: number, base: number, vary: number, S: number, SW: number, hy: number, col: RGB, seed: number): void {
  const sw = SW / n;
  g.fillStyle = css(col);
  g.beginPath();
  for (let k = 0; k < n; k++)
    for (const off of [-SW, 0, SW]) {
      const x = bearingX((k / n) * TAU - Math.PI) + off;
      if (x + sw < 0 || x > view.cw) continue;
      const h = S * (base + vary * h01(k, seed, 91));
      g.moveTo(x, hy + 2);
      g.lineTo(x, hy - h * 0.86);
      g.lineTo(x + sw * 0.12, hy - h);
      g.lineTo(x + sw * 0.88, hy - h);
      g.lineTo(x + sw + 0.6, hy - h * 0.86);
      g.lineTo(x + sw + 0.6, hy + 2);
      g.closePath();
      if (h01(k, seed, 92) < 0.55) g.rect(x + sw * (0.2 + 0.5 * h01(k, seed, 93)), hy - h - S * 0.07, Math.max(1, sw * 0.08), S * 0.07 + 1);
    }
  g.fill();
}

/** The tower's beacon (04 6.4): a lamp dot that blinks 0.2 s every 4 sim seconds at night, drawn over the cached backdrop. */
function beacon(ctx: CanvasRenderingContext2D, hy: number): void {
  const glow = lampGlow();
  if (glow < 0.01 || hy <= 0 || hy > view.chh || (T.abs * DAYLEN) % 4 > 0.2) return;
  const H = BACKDROP.facadeHeight * EH * cam.z * SKYLINE.towerScale, SW = STRIP * cam.z;
  ctx.fillStyle = css(hx(style().palette.lamp), glow);
  for (const off of [-SW, 0, SW]) {
    const x = bearingX(SKYLINE.towerAngle) + off;
    if (x < 0 || x > view.cw) continue;
    ctx.beginPath();
    ctx.arc(x, hy - H, Math.max(1.5, 3 * cam.z), 0, TAU);
    ctx.fill();
  }
}

/* ---------- the apron ground (03 7.4 item 3; 04 6.4 rows pavement, quay, river, far bank) ---------- */
/** A face visible to the viewer, who looks in along (1, 1, 0.5) in the turned frame (GV faceVis 6958). */
export function vis(nx: number, ny: number, nz = 0): boolean {
  const r = rotVec(nx, ny);
  return r.x + r.y + 0.5 * nz > 0;
}
/** A vertical face from world (ax, ay) to (bx, by) between heights e0 and e1, its outward normal (by - ay, ax - bx) (the left of the run,
 *  y south), filled as `hex` lit by faceLight x k. */
export function wall(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, e0: number, e1: number, hex: string, k = 1, a?: number): void {
  const nx = by - ay, ny = ax - bx, l = Math.hypot(nx, ny) || 1;
  ctx.fillStyle = shade(hex, faceLight(nx / l, ny / l) * k, a);
  ctx.beginPath();
  for (const [x, y, e] of [[ax, ay, e0], [bx, by, e0], [bx, by, e1], [ax, ay, e1]] as const) ctx.lineTo(...xy(screenInto(x, y, e, SP)));
  ctx.closePath();
  ctx.fill();
}
export function xy(p: XY): [number, number] {
  return [p.x, p.y];
}

/**
 * Phase 3 (03 7.9): the river 0.3 EH down, the quay wall seen from the north and the far bank's wall seen from the south, then the
 * flat ground at e = 0: the street east, south and west, the pavement ring with its kerb, the quay with its coping and mooring rings,
 * the steps down to the water at g_north, the far bank in the haze of 0.35 (04 6.4).
 */
export function apronGround(c?: CanvasRenderingContext2D): void {
  const ctx = ctxOf(c), P = style().palette, z = cam.z, qy = BACKDROP.quayY - 0.5, ry = BACKDROP.riverTo - 0.5;
  drawRiver(ctx, LO, ry, HI, qy, -RIVER_DROP);
  if (vis(0, -1)) wall(ctx, LO, qy, HI, qy, -RIVER_DROP, 0, P.stone, 0.9); // walls run so their outward side is on the left
  if (vis(0, 1)) wall(ctx, HI, ry, LO, ry, -RIVER_DROP, 0, mix(P.stone, P.fog, 0.35), 0.9);
  // the steps at g_north: three treads from the quay down to the water (04 6.4 row quay)
  const g = GATES.find((o) => o.side === 'north'), sx0 = (g?.tiles[0].x ?? 23) - 0.5;
  for (let k = 0; k < 3; k++) {
    const y0 = qy - 0.18 * (k + 1), e = -RIVER_DROP * ((k + 1) / 4);
    if (vis(0, -1)) wall(ctx, sx0, y0, sx0 + 2, y0, e - RIVER_DROP / 4, e, P.stone, 0.92);
    ctx.save();
    setWorldTransform(ctx, e);
    ctx.fillStyle = shade(P.flagstone, 1.02 - 0.04 * k);
    ctx.fillRect(sx0, y0, 2, 0.18);
    ctx.restore();
  }
  ctx.save();
  setWorldTransform(ctx);
  ctx.fillStyle = shade(P.flagstone, 0.9); // the street beyond the pavement
  ctx.fillRect(LO, qy + 1, HI - LO, HI - qy - 1);
  ctx.fillStyle = shade(P.flagstone, 1); // the pavement, a tile wide outside the railings
  ctx.fillRect(-1.5, -0.5, 1, N + 1);
  ctx.fillRect(N - 0.5, -0.5, 1, N + 1);
  ctx.fillRect(-1.5, N - 0.5, N + 2, 1);
  ctx.fillStyle = shade(P.flagstone, 0.97); // the quay, then its paler coping along the water
  ctx.fillRect(LO, qy, HI - LO, 1);
  ctx.fillStyle = shade(P.flagstone, 1.07);
  ctx.fillRect(LO, qy, HI - LO, 0.14);
  ctx.fillStyle = shade(mix(P.flagstone, P.fog, 0.35), 0.95); // the far bank
  ctx.fillRect(LO, FAR, HI - LO, ry - FAR);
  ctx.lineCap = 'round';
  if (z >= 0.7) {
    // paving joints a tile apart on the pavement and the quay
    const j = new Path2D();
    for (let k = 0; k <= N + 1; k++) {
      j.moveTo(-1.5, k - 0.5);
      j.lineTo(-0.5, k - 0.5);
      j.moveTo(N - 0.5, k - 0.5);
      j.lineTo(N + 0.5, k - 0.5);
      j.moveTo(k - 1.5, N - 0.5);
      j.lineTo(k - 1.5, N + 0.5);
    }
    for (let x = Math.ceil(LO); x <= HI; x++) {
      j.moveTo(x + 0.5, qy + 0.14);
      j.lineTo(x + 0.5, qy + 1);
    }
    ctx.strokeStyle = shade(P.flagstone, 0.84, 0.45);
    ctx.lineWidth = 0.03;
    ctx.stroke(j);
  }
  ctx.strokeStyle = shade(P.zinc, 0.95); // the kerb along the pavement's outer edge
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(-1.5, -0.5);
  ctx.lineTo(-1.5, N + 0.5);
  ctx.lineTo(N + 0.5, N + 0.5);
  ctx.lineTo(N + 0.5, -0.5);
  ctx.stroke();
  if (z >= 0.6) {
    // mooring rings on the coping every 4 tiles
    ctx.strokeStyle = shade(P.zinc, 0.9);
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    for (let x = Math.ceil(LO) + 1; x < HI; x += 4) {
      ctx.moveTo(x + 0.08, qy + 0.07);
      ctx.ellipse(x, qy + 0.07, 0.08, 0.06, 0, 0, TAU);
    }
    ctx.stroke();
  }
  ctx.restore();
}
