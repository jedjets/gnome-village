// src/render/romance-fx.ts
// The romance effects as the owner picked them on 2026-10-18 (register section 4 row "Romance art"; 04 7.6, 8): hearts 3 (tiny
// paper-rimmed hearts, two-tone from stage 3, with `lamp` twinkles), heartbreak 1 (a cracked heart splitting into two drifting halves
// over 1.2 s), Happily fireworks 2 (soft heart-shaped bursts with paper glitter, a shell rising 4 EH over 0.8 s first), and the
// Proposal's open ring box with its ring sparkle. Palette A only, through shade() and GC() so the night light tints them (04 4.5).
// NEW, ported from the approved options page scratch/s5-options-fx.ts (the picked variants only; the stage-dependent static layout of
// the page's hearts becomes one particle's drawing, effects.ts moving it). Changes: the heartbreak's rose x 0.85 is mixed toward `ink`
// (the page mixed toward a black literal, which src may not hold: 04 4.5). Split out of effects.ts along 03 2.7 (AGENTS rule 9).
import { GC, mix, shade, type Pen, type Pt } from './ambient.ts';
import { drawHeart } from './effects.ts';
import { EH } from './camera.ts';
const TAU = Math.PI * 2;
/** A small fixed hash for the placements (no draw: the same picture every frame). */
export function h01(a: number, b = 0): number {
  let x = Math.imul((a * 73856093) ^ (b * 19349663), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** A 4-point star (the ring sparkle of 04 8: `lamp` stars r 0.15 s). */
export function star(pen: Pen, x: number, y: number, r: number, hex: string, alpha = 1, rot = 0): void {
  const { ctx } = pen;
  ctx.fillStyle = shade(hex, 1.05, alpha);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4, rr = i % 2 === 0 ? r : r * 0.28;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/* ---------- hearts 3 (04 7.6) ---------- */
/** One tiny heart of variant 3 at (x, y), size s (8 z), alpha a: a paper rim behind, the heart in hl and hr (two-tone), a lamp twinkle. */
export function tinyHeart(pen: Pen, x: number, y: number, s: number, a: number, hl: string, hr: string, ph: number): void {
  const ss = s * 0.62;
  drawHeart(pen, x, y - ss * 0.05, ss * 1.25, a * 0.9, pen.spec.palette.paper); // the paper rim behind
  drawHeart(pen, x, y, ss, a, hl, hr);
  const tw = 0.5 + 0.5 * Math.sin(ph * 3.1);
  star(pen, x + Math.cos(ph) * s * 0.55, y - s * 0.35 + Math.sin(ph * 1.7) * s * 0.2, s * (0.2 + 0.12 * tw), pen.spec.palette.lamp, a * (0.6 + 0.35 * tw), ph);
}

/* ---------- heartbreak 1 (Parted), at a time t in [0, 1.2] s ---------- */
/** Heartbreak 1: one heart that cracks down a zigzag and splits into two halves drifting apart and tipping over 1.2 s, `rose` x 0.85 (04 7.6 item 3). */
export function heartSplit(pen: Pen, x: number, y: number, s: number, t: number): void {
  const { ctx } = pen;
  const P = pen.spec.palette;
  const hex = mix(P.rose, P.ink, 0.15); // rose x 0.85, toward ink (no black literal: 04 4.5)
  const k = Math.min(1, t / 1.2), a = 1 - Math.max(0, (k - 0.55) / 0.45) * 0.85;
  const zig: Pt[] = [{ x: 0, y: -0.15 }, { x: -0.07, y: 0.02 }, { x: 0.06, y: 0.16 }, { x: -0.04, y: 0.3 }, { x: 0, y: 0.6 }];
  for (const side of [-1, 1] as const) {
    ctx.save();
    const dx = side * k * 0.6 * s, dy = k * k * 0.35 * s, rot = side * k * 0.45;
    ctx.translate(x + dx, y + dy);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(side * s, -s);
    for (const q of zig) ctx.lineTo(q.x * s, q.y * s);
    ctx.lineTo(side * s, s);
    ctx.closePath();
    ctx.clip();
    drawHeart(pen, 0, 0, s, a, hex);
    // the crack's edge, a fine ink line
    if (k > 0.05) {
      ctx.strokeStyle = shade(P.ink, 1, 0.55 * a);
      ctx.lineWidth = Math.max(0.6, s * 0.05);
      ctx.beginPath();
      zig.forEach((q, i) => (i ? ctx.lineTo(q.x * s, q.y * s) : ctx.moveTo(q.x * s, q.y * s)));
      ctx.stroke();
    }
    ctx.restore();
  }
}
/* ---------- the proposal's ring box (03 7.6 item 4 has no item for it: the page draws it at the hand) ---------- */
export function ringBox(pen: Pen, hand: Pt, h: number, face: 1 | -1, sparkle: boolean): void {
  const { ctx } = pen;
  const P = pen.spec.palette;
  const w = 0.075 * h, bh = 0.04 * h, x = hand.x + face * 0.03 * h, y = hand.y - 0.012 * h;
  const lw = Math.max(0.6, 0.012 * h);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = shade(P.ink, 1, 0.85);
  ctx.lineWidth = lw;
  // the lid, open and tipped back away from her
  ctx.fillStyle = shade(P.crowdTop[4] as string, 0.9);
  ctx.beginPath();
  ctx.moveTo(x - face * w / 2, y - bh * 0.5);
  ctx.lineTo(x - face * w * 0.62, y - bh * 1.55);
  ctx.lineTo(x + face * w * 0.38, y - bh * 1.65);
  ctx.lineTo(x + face * w / 2, y - bh * 0.5);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.fillStyle = shade(P.paper, 0.95);
  ctx.beginPath();
  ctx.moveTo(x - face * w * 0.42, y - bh * 0.62);
  ctx.lineTo(x - face * w * 0.52, y - bh * 1.38);
  ctx.lineTo(x + face * w * 0.3, y - bh * 1.45);
  ctx.lineTo(x + face * w * 0.4, y - bh * 0.62);
  ctx.closePath();
  ctx.fill();
  // the box
  ctx.fillStyle = shade(P.crowdTop[4] as string, 1.05);
  ctx.beginPath();
  ctx.rect(x - w / 2, y - bh * 0.5, w, bh);
  ctx.stroke();
  ctx.fill();
  // the ring: a lamp-gold band with a paper stone
  ctx.strokeStyle = shade(P.lamp, 1.05);
  ctx.lineWidth = Math.max(0.7, 0.014 * h);
  ctx.beginPath();
  ctx.ellipse(x, y - bh * 0.62, 0.02 * h, 0.016 * h, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  ctx.fillStyle = shade(P.paper, 1.1);
  ctx.beginPath();
  ctx.arc(x, y - bh * 0.62 - 0.02 * h, Math.max(0.6, 0.012 * h), 0, TAU);
  ctx.fill();
  ctx.restore();
  if (sparkle) ringSparkle(pen, P2c(x, y - bh * 0.62 - 0.02 * h), h);
}
const P2c = (x: number, y: number): Pt => ({ x, y });
/** The ring sparkle at 8 s: 8 `lamp` 4-point stars (04 8 row flash, ring sparkle), r 0.15 s at s = 8 z, round the stone. */
export function ringSparkle(pen: Pen, c: Pt, h: number): void {
  const z = h / 22, s = 8 * z;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.3, r = (0.07 + 0.05 * (i % 2)) * h;
    star(pen, c.x + Math.cos(a) * r * 0.75, c.y + Math.sin(a) * r * 0.7, s * 0.15 * (i % 2 ? 1 : 1.4), pen.spec.palette.lamp, 0.95, a);
  }
  star(pen, c.x, c.y, s * 0.22, pen.spec.palette.paper, 1, 0.4);
}

/* ---------- fireworks 2 (04 8): a shell per 0.8 s for 10 s ---------- */
export type Burst = { x: number; y: number; t: number; seed: number }; // t: seconds since the burst (0 to 1.2), or < 0 still rising
const spark = (pen: Pen, x: number, y: number, r: number, hex: string, a: number): void => {
  const { ctx } = pen;
  ctx.fillStyle = GC(hex, a);
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.5, r), 0, TAU);
  ctx.fill();
};
/** A rising shell: a paper dot climbing 4 EH over 0.8 s with a faint trail. */
export function shell(pen: Pen, x: number, y0: number, k: number, z: number): void {
  const { ctx } = pen;
  const top = y0 - 4 * EH * z * k;
  const g = ctx.createLinearGradient(x, top, x, top + 0.9 * EH * z);
  g.addColorStop(0, GC(pen.spec.palette.paper, 0.7));
  g.addColorStop(1, GC(pen.spec.palette.paper, 0));
  ctx.strokeStyle = g;
  ctx.lineWidth = Math.max(0.6, 0.9 * z);
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x + 0.08 * EH * z, top + 0.9 * EH * z);
  ctx.stroke();
  spark(pen, x, top, 1.4 * z, pen.spec.palette.paper, 1);
}
/** Fireworks 2: a heart-shaped burst in rose and lamp, smaller sparks, a slow sinking fade and paper glitter that twinkles in it. */
export function burstHeart(pen: Pen, b: Burst, z: number): void {
  const P = pen.spec.palette;
  const { ctx } = pen;
  const k = Math.min(1, b.t / 1.2), ease = 1 - (1 - k) * (1 - k * 0.8), S = 0.065 * EH * z * ease, sink = k * 0.25 * EH * z;
  const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 1.6 * EH * z);
  g.addColorStop(0, GC(P.rose, 0.16 * (1 - k * 0.7)));
  g.addColorStop(1, GC(P.rose, 0));
  ctx.fillStyle = g;
  ctx.fillRect(b.x - 1.6 * EH * z, b.y - 1.6 * EH * z, 3.2 * EH * z, 3.2 * EH * z);
  const a = 1 - k * 0.75;
  const n = 28;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    const hx = 16 * Math.sin(t) ** 3, hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const x = b.x + hx * S, y = b.y + hy * S + sink;
    const hex = i % 2 ? P.rose : P.lamp;
    ctx.strokeStyle = GC(hex, a * 0.3);
    ctx.lineWidth = Math.max(0.5, 0.6 * z);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(b.x + hx * S * 0.8, b.y + hy * S * 0.8 + sink * 0.7);
    ctx.stroke();
    spark(pen, x, y, 1.45 * z, hex, a);
  }
  for (let i = 0; i < 7; i++) {
    const r = 0.35 + 0.5 * h01(i, b.seed * 3), ang = h01(i, b.seed * 5) * TAU;
    star(pen, b.x + Math.cos(ang) * r * 15 * S, b.y + Math.sin(ang) * r * 12 * S + sink, (1.6 + 1.2 * h01(i, 9)) * z, P.paper, a * 0.9, ang);
  }
}
