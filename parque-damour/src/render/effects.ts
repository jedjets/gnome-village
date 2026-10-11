// src/render/effects.ts
// The particle drawings the Style Gate board needs (hearts, fountain spray, ripple rings), the chat bubble, and direction C's
// screen-space paper grain (04 section 8, 7.5 item 4, 3.2 row Texture).
// Ported from GV 8609-8626 (drawPart: heart, ring, drop). PORT; a heart may be two-tone (04 7.3 rule 3).
// TODO(S2): P records (GV 2386-2408), spawners, stepParticles, particleDrawables, drawWeatherOverlay (GV 10062-10105), ambientFx.
import { mulberry32 } from '../core/rng.ts';
import { GC, fillPoly, inkLine, shade, type Pen, type Pt, type StyleSpec } from './ambient.ts';

/** A heart of size s (8 z in the game): two arcs r 0.22 s and a point (GV 8622); `hexR` colours the right lobe for a two-tone heart. */
export function drawHeart(pen: Pen, x: number, y: number, s: number, alpha: number, hexL: string, hexR = hexL): void {
  const { ctx, spec, z } = pen;
  const lobe = (cx: number, from: number, to: number): void => {
    ctx.arc(cx, y, s * 0.22, from, to);
  };
  const half = (hex: string, side: -1 | 1): void => {
    ctx.fillStyle = shade(hex, 1, alpha * (spec.id === 'C' ? 0.85 : 1));
    ctx.beginPath();
    const dx = spec.id === 'C' ? 0.5 * z : 0, dy = spec.id === 'C' ? 0.3 * z : 0;
    ctx.save();
    ctx.translate(dx, dy);
    if (side < 0) {
      ctx.moveTo(x, y + s * 0.55);
      ctx.lineTo(x - s * 0.36, y + s * 0.09);
      lobe(x - s * 0.18, Math.PI, Math.PI * 1.5);
      ctx.lineTo(x, y - s * 0.1);
    } else {
      ctx.moveTo(x, y + s * 0.55);
      ctx.lineTo(x, y - s * 0.1);
      lobe(x + s * 0.18, Math.PI * 1.5, Math.PI * 2);
      ctx.lineTo(x + s * 0.36, y + s * 0.09);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  half(hexL, -1);
  half(hexR, 1);
  if (spec.id === 'A' && s > 6) {
    ctx.fillStyle = GC(spec.palette.paper, alpha * 0.45);
    ctx.beginPath();
    ctx.arc(x - s * 0.2, y - s * 0.08, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  if (spec.line === 'ink') {
    const pts: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      pts.push({ x: x - s * 0.18 + Math.cos(a) * s * 0.22, y: y + Math.sin(a) * s * 0.22 });
    }
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      pts.push({ x: x + s * 0.18 + Math.cos(a) * s * 0.22, y: y + Math.sin(a) * s * 0.22 });
    }
    pts.push({ x: x + s * 0.36, y: y + s * 0.09 }, { x: x, y: y + s * 0.55 }, { x: x - s * 0.36, y: y + s * 0.09 });
    inkLine(pen, pts, { seed: Math.round(x + y), inkAlpha: alpha * 0.75, gapless: true, lineW: Math.max(0.6, 0.5 * pen.z), jitterK: 0.3 });
  }
}

/** A fountain spray drop: a paper dot r 0.1 s at alpha 0.7 (04 section 8). */
export function drawSprayDot(pen: Pen, x: number, y: number, s: number, alpha = 0.7): void {
  const { ctx, spec } = pen;
  ctx.fillStyle = GC(spec.palette.paper, alpha);
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.6, s * 0.1), 0, Math.PI * 2);
  ctx.fill();
  if (spec.line === 'ink' && s > 6) {
    ctx.strokeStyle = GC(spec.palette.ink, alpha * 0.5);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.6, s * 0.1), 0.5, 3.6);
    ctx.stroke();
  }
}

/** A ripple ring on water: a pale ellipse, fading as it widens (GV ring 8620). */
export function drawRipple(pen: Pen, x: number, y: number, rx: number, ry: number, alpha: number): void {
  const { ctx, spec, z } = pen;
  ctx.strokeStyle = spec.line === 'ink' ? GC(spec.palette.ink, alpha * 0.5) : GC(spec.palette.paper, alpha);
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.beginPath();
  if (spec.line === 'ink') ctx.ellipse(x, y, rx, ry, 0, 0.3, 2.9);
  else ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** The chat bubble: a paper ellipse with three ink dots above the speaker (04 7.5 item 4); never text. */
export function drawChatBubble(pen: Pen, x: number, y: number, hr: number, face: number): void {
  const { ctx, spec, z } = pen;
  const P = spec.palette;
  const rx = hr * 1.25, ry = hr * 0.8;
  const pts: Pt[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    pts.push({ x: x + Math.cos(a) * rx, y: y + Math.sin(a) * ry });
  }
  pts.splice(13, 0, { x: x - face * rx * 0.15, y: y + ry * 1.55 }); // the tail toward the mouth
  fillPoly(pen, pts, P.paper, { seed: 3, contour: true, lineW: Math.max(0.6, 0.5 * z), inkAlpha: 0.8, gapless: true, jitterK: 0.35 });
  ctx.fillStyle = GC(P.ink, 0.9);
  for (let k = -1; k <= 1; k++) {
    ctx.beginPath();
    ctx.arc(x + k * rx * 0.42, y, Math.max(0.6, hr * 0.14), 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ---------- direction C's paper (04 3.2 row Texture, 3.3 item 1) ---------- */
let grainTile: HTMLCanvasElement | null = null;

/** A 256 x 256 value-noise tile, generated once on its own fixed generator (visual only, never the sim stream). */
function paperTile(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(S, S);
  const r = mulberry32(4242);
  const M = 64;
  const lat = new Float32Array(M * M);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const at = (i: number, j: number): number => lat[((j % M) + M) % M * M + (((i % M) + M) % M)] as number;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = (x / S) * M, v = (y / S) * M;
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
      const su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
      const n0 = at(i, j) + (at(i + 1, j) - at(i, j)) * su, n1 = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
      const n = n0 + (n1 - n0) * sv;
      const speck = r() < 0.06 ? r() * 0.5 : 0; // the cold-press pits of ref2
      const val = Math.round(255 * Math.min(1, Math.max(0, 0.72 + n * 0.28 - speck)));
      const k = (y * S + x) * 4;
      img.data[k] = val;
      img.data[k + 1] = val;
      img.data[k + 2] = val;
      img.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/** Multiply the paper grain over (0, 0, w, h) of a scene canvas in direction C; A and B draw nothing (04 3.2 row Texture). */
export function paperGrain(ctx: CanvasRenderingContext2D, spec: StyleSpec, w: number, h: number, alpha = 0.06): void {
  if (spec.grain !== 'paper') return;
  const tile = paperTile();
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha * 4; // the tile is pale (0.72 to 1.0), so the multiply needs weight to read as 6 % grain
  for (let y = 0; y < h; y += 256) for (let x = 0; x < w; x += 256) ctx.drawImage(tile, x, y);
  ctx.restore();
}
