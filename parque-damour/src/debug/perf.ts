// src/debug/perf.ts
// Frame, sim and draw EMA with one-second peaks; the auto quality step-down; the #perf overlay text (03 section 13).
// Ported from GV 12056-12069 (FT, ftNote). Verdict: PORT. Changes: the step-down is qualityLevel() 0 -> 1 -> 2 (level 1 drops lamp halos and
// ribbons, level 2 drops tree sway and petals) instead of GV's DBG.smooth 'grad' -> 'sub' -> false (12064); the overlay shows the park's
// counts; FT.t0 (write-only in GV) is dropped. It steps down only when the draw EMA stays above 22 ms for 180 frames after 4 s, never steps
// up in a session, and is off under WebDriver (GV 12064; GV stepped on the 181st slow frame, 03 13 and 08 2.9 say the 180th).
// Dropped from the range: nothing else.
// Wiring is main.ts's: ftNote from loop.onFrameEnd (draw is the frame listeners' time: the draw and the HUD's 0.35 s refresh), the
// overlay toggled by the clock chip's double tap under body.dev, the counts from setPerfCounts (particles when given).

export type PerfCounts = { people: number; creatures: number; props: number; particles?: number; zoom: number };

export const FT = { on: false, sim: 0, draw: 0, frame: 0, wSim: 0, wDraw: 0, wAt: 0, fps: 0, n: 0, acc: 0, slow: 0, stepped: 0 };

export const EMA_K = 0.08; // GV 12058
export const SLOW_MS = 22; // draw EMA above this counts a slow frame (GV 12064)
export const SLOW_FRAMES = 180; // slow frames in a row before one step down
export const QUALITY_MAX = 2;
export const WARMUP_MS = 4000; // no step-down in the first 4 s of the page (GV 12064)

let level: 0 | 1 | 2 = 0;
let counts: () => PerfCounts = () => ({ people: 0, creatures: 0, props: 0, zoom: 1 });

/** Where the overlay reads its counts from (main.ts hands in a function over the live lists). */
export function setPerfCounts(fn: () => PerfCounts): void {
  counts = fn;
}

/** 0 full quality, 1 no lamp halos or ribbons, 2 also no tree sway or petals. */
export function qualityLevel(): 0 | 1 | 2 {
  return level;
}

function webdriver(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true;
}

/** The overlay text: frame, sim and draw EMA with the worst of the last second, then the counts and the quality level. */
export function perfText(): string {
  const c = counts();
  return (
    'frame ' + FT.frame.toFixed(1) + ' ms  ' + FT.fps + ' fps\n' +
    'sim   ' + FT.sim.toFixed(1) + ' ms  (peak ' + FT.wSim.toFixed(1) + ')\n' +
    'draw  ' + FT.draw.toFixed(1) + ' ms  (peak ' + FT.wDraw.toFixed(1) + ')\n' +
    c.people + ' people · ' + c.creatures + ' creatures · ' + c.props + ' props · ' +
    (c.particles === undefined ? '' : c.particles + ' particles · ') + 'zoom ' + c.zoom.toFixed(2) + ' · quality ' + level
  );
}

/** Switch the overlay on or off (the clock chip's double tap under body.dev). */
export function setPerfOn(on: boolean): void {
  FT.on = on;
  const el = typeof document === 'undefined' ? null : document.getElementById('perf');
  if (el) el.hidden = !on;
}

/** One frame's numbers in ms: sim steps, draw (and the rest), the whole frame, and the rAF timestamp (GV 12057). */
export function ftNote(sim: number, drw: number, total: number, ts: number): void {
  FT.sim += (sim - FT.sim) * EMA_K;
  FT.draw += (drw - FT.draw) * EMA_K;
  FT.frame += (total - FT.frame) * EMA_K;
  if (ts - FT.wAt > 1000) {
    FT.wSim = sim;
    FT.wDraw = drw;
    FT.wAt = ts;
    FT.fps = FT.n;
    FT.n = 0;
  } else {
    FT.wSim = Math.max(FT.wSim, sim);
    FT.wDraw = Math.max(FT.wDraw, drw);
  }
  FT.n++;
  if (level < QUALITY_MAX && FT.draw > SLOW_MS && ts > WARMUP_MS && !webdriver()) {
    FT.slow++;
    if (FT.slow >= SLOW_FRAMES) {
      FT.slow = 0;
      level = (level + 1) as 0 | 1 | 2;
      FT.stepped++;
    }
  } else FT.slow = 0;
  if (!FT.on) return;
  FT.acc++;
  if (FT.acc < 8) return;
  FT.acc = 0;
  const el = typeof document === 'undefined' ? null : document.getElementById('perf');
  if (el) el.textContent = perfText();
}

/** Back to full quality with cleared numbers (tests; a session never calls this). */
export function resetPerf(): void {
  Object.assign(FT, { on: false, sim: 0, draw: 0, frame: 0, wSim: 0, wDraw: 0, wAt: 0, fps: 0, n: 0, acc: 0, slow: 0, stepped: 0 });
  level = 0;
}
