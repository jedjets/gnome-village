// tests/draw-stub.ts
// A canvas context that records instead of drawing, for the tests that run the S6 art's drawing code in node (no canvas): every method is a
// no-op that counts, every property can be set, a gradient or a measure is another no-op object; a `Path2D` class stands in for the browser's.
// Shared by tests/rig-moves.test.ts and tests/fx-play.test.ts.
import { STYLES, type Pen } from '../src/render/ambient.ts';

export type Rec = { ctx: CanvasRenderingContext2D; calls: Record<string, number>; fills: string[]; total: () => number };

const dummy = (): unknown => new Proxy(function () {}, { get: () => dummy(), apply: () => dummy(), set: () => true });

/** A recording context: `calls[name]` counts the method calls, `fills` lists every fillStyle that was set (in order). */
export function recorder(): Rec {
  const calls: Record<string, number> = {};
  const fills: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => {
      const name = String(k);
      return (...a: unknown[]): unknown => {
        calls[name] = (calls[name] ?? 0) + 1;
        void a;
        return dummy();
      };
    },
    set: (_t, k, v) => {
      if (k === 'fillStyle') fills.push(typeof v === 'string' ? v : '<gradient>');
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, fills, total: () => Object.values(calls).reduce((s, n) => s + n, 0) };
}

export const penOf = (rec: Rec, z = 2.4, style: 'A' | 'B' | 'C' = 'A'): Pen => ({ ctx: rec.ctx, spec: STYLES[style], z });

class FakePath {
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  closePath(): void {}
  ellipse(): void {}
  arc(): void {}
  rect(): void {}
  addPath(): void {}
}
/** Install the Path2D stand-in when the runtime has none (node). */
export function stubPath2D(): void {
  const g = globalThis as unknown as { Path2D?: unknown };
  if (!g.Path2D) g.Path2D = FakePath;
}
