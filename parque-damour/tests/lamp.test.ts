// tests/lamp.test.ts
// Locks 04 6.2 item 3 and 10.2 as the owner answered on 2026-10-13 ("lit lamp globes glow bright"): in the game (direction A, `bright`)
// a lit globe and its highlight are drawn free of the night tint, as the gate lamps' globes and the lit windows are; the head halo and the
// globe glow are palette colours (never tinted); an unlit globe keeps the tint; a lamp coming on brightens out of the tinted colour over
// its fade, never popping (04 10.1 item 4); without `bright` (the Style Gate board) the lamp draws as before.
import { describe, it, expect } from 'vitest';
import { STYLES, computeAmbientAt, mix, shade, type Pen } from '../src/render/ambient.ts';
import { drawLamp, type LampOpts } from '../src/render/props.ts';
import { css, hx } from '../src/core/math.ts';

/** A 2D context that does nothing and records every fillStyle written and every colour stop added, in order. */
function recorder(): { ctx: CanvasRenderingContext2D; fills: string[]; stops: string[] } {
  const fills: string[] = [], stops: string[] = [];
  const grad = { addColorStop: (_o: number, c: string) => void stops.push(c) };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, k) {
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
      if (k in t) return t[k as string];
      return () => undefined;
    },
    set(t, k, v) {
      if (k === 'fillStyle' && typeof v === 'string') fills.push(v);
      t[k as string] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, fills, stops };
}

function draw(o: LampOpts, id: 'A' | 'B' | 'C' = 'A'): { fills: string[]; stops: string[] } {
  const r = recorder();
  const pen: Pen = { ctx: r.ctx, spec: STYLES[id], z: 1.3 };
  drawLamp(pen, { x: 100, y: 200 }, o);
  return { fills: r.fills, stops: r.stops };
}

const P = STYLES.A.palette;
const rgb = (s: string | undefined): number[] => (/rgba?\((\d+),(\d+),(\d+)/.exec(s ?? '') ?? []).slice(1, 4).map(Number);
const scaled = (h: string, L: number): [number, number, number] => {
  const c = hx(h);
  return [c[0] * L, c[1] * L, c[2] * L];
};

/** The first globe's fill: the one just before the first highlight dot (alpha 0.9). */
function globeRGB(o: LampOpts): number[] {
  const f = draw(o).fills;
  return rgb(f[f.findIndex((s) => s.endsWith(',0.9)')) - 1]);
}

describe('04 6.2 item 3, 10.2: lit globes glow bright (owner 2026-10-13)', () => {
  it('at night a lit game lamp fills its three globes and highlights untinted; without bright they are tinted', () => {
    computeAmbientAt(0.02, 0.06); // deep night: AM about [0.54, 0.57, 0.76]
    const globe = css(scaled(P.lamp, 1.02), 1), dot = css(hx(P.paper), 0.9);
    const bright = draw({ lit: true, glow: 1, bright: true });
    expect(bright.fills.filter((f) => f === globe)).toHaveLength(3);
    expect(bright.fills.filter((f) => f === dot)).toHaveLength(3);
    const board = draw({ lit: true, glow: 1 });
    expect(board.fills).not.toContain(globe);
    expect(board.fills.filter((f) => f === shade(P.lamp, 1.02, 1))).toHaveLength(3); // the tinted globe, as at the Style Gate
    expect(shade(P.lamp, 1.02, 1)).not.toBe(globe); // the night tint darkens it
  });

  it('the head halo and the globe glow are the same palette colours with or without bright (never tinted)', () => {
    computeAmbientAt(0.02, 0.06);
    const a = draw({ lit: true, glow: 1, bright: true }).stops, b = draw({ lit: true, glow: 1 }).stops;
    expect(a).toEqual(b);
    expect(a).toContain(css(hx(P.halo), 0.32));
    expect(a).toContain(css(hx(P.lamp), 0.7));
  });

  it('an unlit globe keeps the tint, bright or not; everything but the lit globes is the same', () => {
    computeAmbientAt(0.02, 0.06);
    expect(draw({ lit: false, glow: 0, bright: true })).toEqual(draw({ lit: false, glow: 0 }));
    const a = draw({ lit: true, glow: 1, bright: true }).fills, b = draw({ lit: true, glow: 1 }).fills;
    expect(a.length).toBe(b.length);
    const differ = a.flatMap((f, i) => (f === b[i] ? [] : [i]));
    expect(differ).toHaveLength(6); // three globes and three highlights
  });

  it('a lamp coming on brightens out of the tinted colour over its fade: the untinted share of its globe is its glow', () => {
    computeAmbientAt(0.8, 0.3); // dusk, as the lamps come on (f 0.80)
    for (const g of [0.001, 0.25, 0.5, 0.75, 1]) {
      const tinted = globeRGB({ lit: true, glow: g }), bright = globeRGB({ lit: true, glow: g, bright: true });
      const full = scaled(mix(P.paper, P.lamp, g), 1.02); // the palette colour the fade mixes, as drawLamp takes it
      const [t2, b2, f2] = [tinted[2] ?? NaN, bright[2] ?? NaN, full[2]]; // blue: the channel the night tint changes most
      const share = (b2 - t2) / (f2 - t2);
      expect(share, 'glow ' + g).toBeCloseTo(g, 1);
    }
  });

  it('bright is direction A only: the frozen B and C branches draw as before (04 3.4)', () => {
    computeAmbientAt(0.02, 0.06);
    for (const id of ['B', 'C'] as const) expect(draw({ lit: true, glow: 1, bright: true }, id)).toEqual(draw({ lit: true, glow: 1 }, id));
  });
});
