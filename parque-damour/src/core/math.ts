// src/core/math.ts
// Small pure maths: clamps, lerp, smoothstep, value noise, colour triples, tile distance, a string hash.
// Ported from GV 578-582 (clamp, clamp01, lerp, smooth, TAU) and 599-609 (noise2, fbm2, hx, mixc, css). PORT.
// Verdict: PORT. Changes: hx accepts 3-digit hex (GV 607 returned NaN for a short code); css clamps channels to 0-255 and alpha to 0-1
// (GV 609 did not); cheb, fnv1a and the incremental fnvStep are new (03 2.3).
// Not applied: 09 section 4 row 35 also asks css to round instead of truncate. tests/palette.test.ts (S1) fixes the truncating output
// (shade of white at 0.5 is 127), so css still truncates; see the S2 hand-back, open questions.
// Dropped from the range: nothing.
import { mulberry32 } from './rng.ts';

export type XY = { x: number; y: number };
export type RGB = [number, number, number];

export const TAU = Math.PI * 2;

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Tiling value noise on a 128 x 128 lattice seeded by its own generator (GV 599-605). */
export function noise2(seed: number): (x: number, y: number) => number {
  const M = 128;
  const a = new Float32Array(M * M);
  const r = mulberry32(seed);
  for (let i = 0; i < M * M; i++) a[i] = r();
  const at = (i: number, j: number): number => a[(((j % M) + M) % M) * M + (((i % M) + M) % M)] ?? 0;
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), u = smooth(x - i), v = smooth(y - j);
    return lerp(lerp(at(i, j), at(i + 1, j), u), lerp(at(i, j + 1), at(i + 1, j + 1), u), v);
  };
}

/** Fractal sum of a noise2 field (GV 606). */
export function fbm2(n: (x: number, y: number) => number, x: number, y: number, o = 5): number {
  let s = 0, a = 1, f = 1, t = 0;
  for (let i = 0; i < o; i++) {
    s += a * n(x * f, y * f);
    t += a;
    a *= 0.5;
    f *= 2;
  }
  return s / t;
}

/** '#RGB' or '#RRGGBB' to an rgb triple (GV 607, fixed for 3-digit hex). */
export function hx(h: string): RGB {
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
export function mixc(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function ch(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : v | 0;
}
export function css(c: RGB, al?: number): string {
  return al === undefined
    ? `rgb(${ch(c[0])},${ch(c[1])},${ch(c[2])})`
    : `rgba(${ch(c[0])},${ch(c[1])},${ch(c[2])},${al <= 0 ? 0 : al >= 1 ? 1 : al})`;
}

/** Chebyshev tile distance. */
export function cheb(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** The FNV-1a offset basis: start of a hash that is fed in several parts with fnvStep. */
export const FNV_SEED = 0x811c9dc5;

/** Feed a string (its UTF-16 code units) or raw bytes into a running 32-bit FNV-1a hash; returns the new running value. */
export function fnvStep(h: number, input: string | Uint8Array): number {
  if (typeof input === 'string') {
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  } else {
    for (let i = 0; i < input.length; i++) {
      h ^= input[i] ?? 0;
      h = Math.imul(h, 0x01000193);
    }
  }
  return h;
}

/** 32-bit FNV-1a over a string or raw bytes; the state hash and tile grain use it. */
export function fnv1a(input: string | Uint8Array): number {
  return fnvStep(FNV_SEED | 0, input) >>> 0;
}
