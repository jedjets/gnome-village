// src/render/ambient.ts
// The scene palette (the only file with scene colour literals, 04 4.5) and the per-frame ambient light: AM, AA, AT, FOGA, lit, GC.
// Ported from GV 6445-6478 (C, computeAmbient, lit, GC). PORT; the golden-hour windows follow the register (0.72-0.80, peak 0.76).
// TODO(S1): the Style Gate replaces PAL with the picked direction's palette; until then every value is a placeholder (TBD Style Gate).
// TODO(S9): season tints, lamp warmth.
import { clamp01, css, hx, mixc, type RGB } from '../core/math.ts';
import { T } from '../core/clock.ts';
import { W } from '../core/weather.ts';

/** TBD Style Gate: placeholders borrowed from GV's palette C (GV 6445-6448) and the mood of ref1. */
export const PAL = {
  sky: hx('#A9CEE7'),
  skyNight: hx('#2E3350'),
  lawn: hx('#9CCB92'),
  gravel: hx('#D9CBB0'),
  flagstone: hx('#CBC4B6'),
  bed: hx('#D7A6C9'),
  mulch: hx('#B48D6A'),
  pond: hx('#6FB8DC'),
  canal: hx('#6FB8DC'),
  river: hx('#7DB4D4'),
  quay: hx('#C9BFAE'),
  pavement: hx('#DDD6CC'),
  facade: hx('#F0E7D5'),
  facadeShade: hx('#D8CDB8'),
  roof: hx('#9AA3AD'),
};
export type Palette = typeof PAL;

export let AM: RGB = [1, 1, 1];
export let AT: RGB = [255, 204, 162];
export let AA = 0;
export let FOGA = 0;

/** Once per frame: the ambient multiplier from the clock light and cloud, the warm tint at golden hour (03 7.3). */
export function computeAmbient(): void {
  const L = T.light;
  AM = mixc([0.46, 0.5, 0.72], [1, 1, 1], Math.pow(L, 0.7));
  const dim = W.cloud * 0.12;
  AM = [AM[0] * (1 - dim), AM[1] * (1 - dim), AM[2] * (1 - dim * 0.92)];
  const warm = clamp01(1 - Math.abs(T.f - 0.76) / 0.05) + clamp01(1 - Math.abs(T.f - 0.24) / 0.04);
  AA = clamp01(warm) * 0.22 * Math.max(0.25, L);
  AT = T.f < 0.5 ? [255, 204, 162] : [255, 186, 158];
  FOGA = clamp01(W.mist * 0.3 + W.rain * 0.03 + W.snow * 0.14);
}

/** Apply the time of day to an rgb triple (GV 6465-6469). */
export function lit(c: RGB): RGB {
  let r = c[0] * AM[0], g = c[1] * AM[1], b = c[2] * AM[2];
  if (AA > 0) {
    r += (AT[0] - r) * AA;
    g += (AT[1] - g) * AA;
    b += (AT[2] - b) * AA;
  }
  return [r, g, b];
}

const gcache = new Map<string, string>();
/** A lit CSS colour for a hex, memoised on the ambient state; flushed at 900 keys (GV 6470-6478). */
export function GC(h: string, a?: number): string {
  const k = h + '|' + (a === undefined ? '' : a) + '|' + ((AM[0] * 100) | 0) + ((AA * 100) | 0);
  const v = gcache.get(k);
  if (v) return v;
  const s = css(lit(hx(h)), a);
  if (gcache.size > 900) gcache.clear();
  gcache.set(k, s);
  return s;
}

/** The flat sky colour for the current light (the sky ramp of GV 6480-6581 comes in S2). */
export function skyColour(): string {
  const c = mixc(PAL.skyNight, PAL.sky, Math.pow(clamp01(T.light), 0.8));
  if (AA > 0) return css(mixc(c, AT, AA * 0.6));
  return css(c);
}
